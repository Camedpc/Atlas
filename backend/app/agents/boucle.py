"""Boucle de tool-use écrite à la main : on rappelle le modèle tant qu'il demande des outils."""

import json
import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import anthropic

from ..graphe import ErreurGraphe

log = logging.getLogger(__name__)

# Si le modèle refuse (classifieurs de sécurité), l'API relance la requête sur le
# modèle de repli recommandé par Anthropic au lieu de renvoyer le refus.
BETAS = ["server-side-fallback-2026-07-01"]
MAX_TOKENS = 32000


@dataclass(frozen=True)
class Outil:
    nom: str
    description: str
    schema: dict
    fonction: Callable[..., Any]

    def definition(self) -> dict:
        return {"name": self.nom, "description": self.description, "input_schema": self.schema, "strict": True}


class Arret(Exception):
    """Levée quand /stop a été demandé."""


@lru_cache
def client() -> anthropic.Anthropic:
    return anthropic.Anthropic()


def _executer_outil(outils: dict[str, Outil], bloc: Any) -> dict:
    resultat: dict[str, Any] = {"type": "tool_result", "tool_use_id": bloc.id}
    outil = outils.get(bloc.name)
    try:
        if outil is None:
            raise ErreurGraphe(f"Outil inconnu : {bloc.name}")
        sortie = outil.fonction(**bloc.input)
        resultat["content"] = json.dumps(sortie, ensure_ascii=False)
    except ErreurGraphe as e:
        resultat |= {"content": json.dumps({"erreur": str(e)}, ensure_ascii=False), "is_error": True}
    except TypeError as e:  # arguments inattendus
        resultat |= {"content": json.dumps({"erreur": f"Arguments invalides : {e}"}, ensure_ascii=False), "is_error": True}
    except Exception:
        log.exception("Échec de l'outil %s", bloc.name)
        resultat |= {"content": json.dumps({"erreur": "Erreur interne de l'outil."}), "is_error": True}
    return resultat


def texte_final(contenu: list[Any]) -> str:
    return "\n".join(b.text for b in contenu if b.type == "text").strip()


def executer(
    *,
    modele: str,
    effort: str,
    system: str,
    outils: list[Outil],
    message: str,
    stop: threading.Event,
    max_tours: int,
    progres: Callable[[str], None] = lambda _: None,
) -> str:
    """Fait tourner l'agent jusqu'à ce qu'il ne demande plus d'outil. Renvoie son texte final."""
    par_nom = {o.nom: o for o in outils}
    definitions = [o.definition() for o in outils]
    messages: list[dict[str, Any]] = [{"role": "user", "content": message}]

    for tour in range(max_tours):
        if stop.is_set():
            raise Arret
        with client().beta.messages.stream(
            model=modele,
            max_tokens=MAX_TOKENS,
            system=system,
            tools=definitions,
            messages=messages,
            thinking={"type": "adaptive"},
            output_config={"effort": effort},
            # Cache automatique du préfixe (outils + system + historique) d'un tour à l'autre.
            cache_control={"type": "ephemeral"},
            betas=BETAS,
            fallbacks="default",
        ) as flux:
            reponse = flux.get_final_message()

        u = reponse.usage
        log.info(
            "tour %d %s stop=%s in=%s cache_lu=%s out=%s",
            tour, reponse.model, reponse.stop_reason, u.input_tokens, u.cache_read_input_tokens, u.output_tokens,
        )
        # On renvoie le contenu tel quel (blocs de réflexion compris).
        messages.append({"role": "assistant", "content": reponse.content})

        if reponse.stop_reason == "pause_turn":
            continue
        if reponse.stop_reason == "refusal":
            raise RuntimeError(f"Refus du modèle : {reponse.stop_details}")
        if reponse.stop_reason != "tool_use":
            return texte_final(reponse.content)

        resultats = []
        for bloc in reponse.content:
            if bloc.type != "tool_use":
                continue
            if stop.is_set():
                raise Arret
            progres(f"{bloc.name} {bloc.input.get('id') or bloc.input.get('noeud_id') or ''}".strip())
            resultats.append(_executer_outil(par_nom, bloc))
        messages.append({"role": "user", "content": resultats})

    return f"Arrêt : nombre maximal de tours ({max_tours}) atteint."
