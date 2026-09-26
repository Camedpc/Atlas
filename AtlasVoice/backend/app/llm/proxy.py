"""Proxy « chat completions » compatible OpenAI entre Gradbot et le modèle d'Atlas.

- Bascule sur le modèle de secours si le premier token dépasse 1,5 s ou en cas d'erreur (section 5.4).
- Mesure le temps jusqu'au premier token (TTFT) de chaque appel pour le tableau de bord.
- Les clés des fournisseurs restent ici, côté serveur.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

from .. import config
from ..config import ModeleLLM
from ..observabilite.metriques import metriques
from .anthropic_adapter import flux_anthropic

log = logging.getLogger(__name__)


class ErreurLLM(Exception):
    pass


def _utile(ligne: str) -> bool:
    """Vrai si la ligne SSE porte un token (texte ou appel d'outil), pas seulement le rôle."""
    if not ligne.startswith("data:"):
        return False
    charge = ligne[5:].strip()
    if charge == "[DONE]":
        return True
    try:
        delta = json.loads(charge)["choices"][0].get("delta") or {}
    except (json.JSONDecodeError, KeyError, IndexError):
        return False
    return bool(delta.get("content") or delta.get("tool_calls"))


async def flux_openai(modele: ModeleLLM, corps: dict[str, Any], max_tokens: int) -> AsyncIterator[str]:
    base = (modele.base_url or "https://api.openai.com/v1").rstrip("/")
    requete = {**corps, "model": modele.modele, "stream": True, **modele.extra}
    requete.setdefault("max_completion_tokens", max_tokens)
    requete.pop("max_tokens", None)
    en_attente: list[str] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
        async with client.stream(
            "POST", f"{base}/chat/completions", json=requete,
            headers={"Authorization": f"Bearer {modele.cle}"},
        ) as reponse:
            if reponse.status_code >= 400:
                detail = (await reponse.aread()).decode(errors="replace")[:300]
                raise ErreurLLM(f"{modele.nom} : HTTP {reponse.status_code} {detail}")
            async for ligne in reponse.aiter_lines():
                if not ligne:
                    continue
                # On retient les lignes sans token (rôle seul) pour ne compter que le vrai premier token.
                en_attente.append(f"{ligne}\n\n")
                if _utile(ligne):
                    for morceau in en_attente:
                        yield morceau
                    en_attente.clear()
    for morceau in en_attente:
        yield morceau


def _flux(modele: ModeleLLM, corps: dict[str, Any]) -> AsyncIterator[str]:
    if modele.fournisseur == "anthropic":
        return flux_anthropic(modele, corps, config.LLM_MAX_TOKENS)
    if modele.fournisseur == "openai":
        return flux_openai(modele, corps, config.LLM_MAX_TOKENS)
    raise ErreurLLM(f"Fournisseur inconnu : {modele.fournisseur}")


async def _premier(flux: AsyncIterator[str], delai: float | None) -> str:
    if delai is None:
        return await anext(flux)
    return await asyncio.wait_for(anext(flux), timeout=delai)


async def completer(corps: dict[str, Any]) -> AsyncIterator[str]:
    """Flux SSE final : modèle principal, puis secours si trop lent ou en erreur."""
    candidats = [m for m in (config.LLM_PRINCIPAL, config.LLM_SECOURS) if m is not None]
    if not candidats:
        raise ErreurLLM("Aucun modèle configuré pour Atlas (ATLAS_LLM_FOURNISSEUR / ATLAS_LLM_MODELE).")

    for rang, modele in enumerate(candidats):
        dernier = rang == len(candidats) - 1
        debut = time.perf_counter()
        flux = _flux(modele, corps)
        try:
            premier = await _premier(flux, None if dernier else config.LLM_DELAI_BASCULE_S)
        except (TimeoutError, Exception) as e:  # noqa: BLE001 - toute panne déclenche la bascule
            await flux.aclose()
            raison = "délai" if isinstance(e, TimeoutError) else f"erreur ({e})"
            metriques.enregistrer_llm(modele.nom, None, echec=raison)
            if dernier:
                log.error("Modèle %s indisponible : %s", modele.nom, raison)
                raise ErreurLLM(f"{modele.nom} : {raison}") from e
            log.warning("Bascule %s -> secours : %s", modele.nom, raison)
            continue

        metriques.enregistrer_llm(modele.nom, time.perf_counter() - debut, secours=rang > 0)
        yield premier
        async for morceau in flux:
            yield morceau
        return
