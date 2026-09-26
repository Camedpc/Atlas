"""Agent navigateur (P2 → P3) : processus distinct qui écoute les intentions du relais d'affichage, les
résout sur les vraies données et pousse les commandes vers l'écran.

    python -m app.agents.navigation.navigateur        (depuis AtlasVoice/backend)

Pour chaque LotNavigation : état de l'écran de l'utilisateur (relais), graphe (API Atlas, relu seulement
quand `version_donnees` change), conversations si une désignation en parle, puis `traduire`. Une erreur
(ambiguïté, introuvable…) part directement en compte rendu ; sinon le LotCommandes, avec le même `lot_id`,
part vers l'écran et le compte rendu de l'écran répond aussi à l'agent moyen 2.

Résolution entièrement déterministe. Le départage par un modèle, prévu en dernier recours, n'est pas
branché : deux candidats proches donnent toujours une question.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx

from ... import config
from ...affichage.protocole import (
    CompteRendu, EtatAffichage, IntentionDesignation, IntentionFiltrer, LotNavigation,
)
from .resolution import Donnees, est_conversation
from .traduction import Traduction, mettre_a_jour_pile, traduire

log = logging.getLogger("atlas.navigateur")
ATTENTES_RECONNEXION_S = [1, 2, 5, 10, 30]


def parle_de_conversation(lot: LotNavigation) -> bool:
    for i in lot.intentions:
        if isinstance(i, IntentionDesignation) and est_conversation(i.quoi):
            return True
        if isinstance(i, IntentionFiltrer) and i.criteres.conversation is not None:
            return True
    return False


class AgentNavigateur:
    def __init__(self, url_relais: str, cle: str | None, url_atlas: str, jeton_atlas: str | None = None,
                 transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.relais = httpx.AsyncClient(base_url=url_relais.rstrip("/") + "/api/affichage",
                                        headers={"X-Agents-Cle": cle} if cle else {}, timeout=10, transport=transport)
        self.atlas = httpx.AsyncClient(base_url=url_atlas.rstrip("/") + "/api",
                                       headers={"Authorization": f"Bearer {jeton_atlas}"} if jeton_atlas else {},
                                       timeout=10, transport=transport)
        # Pile des états par écran, pour « revenir ».
        self.piles: dict[str, list[EtatAffichage]] = {}
        self._graphe: tuple[str, list[dict[str, Any]]] | None = None

    async def fermer(self) -> None:
        await self.relais.aclose()
        await self.atlas.aclose()

    # ── données ───────────────────────────────────────────────────

    async def etat_ecran(self, utilisateur_id: str) -> EtatAffichage | None:
        r = await self.relais.get(f"/utilisateurs/{utilisateur_id}/etat")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return EtatAffichage.model_validate_json(r.content)

    async def donnees(self, etat: EtatAffichage | None, conversations: bool) -> Donnees:
        version = etat.version_donnees if etat else ""
        if self._graphe is None or self._graphe[0] != version or not version:
            r = await self.atlas.get("/graphe")
            r.raise_for_status()
            self._graphe = (version, r.json()["noeuds"])
        liste: list[dict[str, Any]] = []
        if conversations:
            r = await self.atlas.get("/conversations")
            r.raise_for_status()
            liste = r.json()
        return Donnees(self._graphe[1], liste)

    # ── traitement d'un lot ───────────────────────────────────────

    async def traiter(self, lot: LotNavigation) -> CompteRendu:
        etat = await self.etat_ecran(lot.utilisateur_id)
        pile = self.piles.setdefault(etat.ecran, []) if etat else []
        try:
            donnees = await self.donnees(etat, parle_de_conversation(lot))
        except httpx.HTTPError as e:
            return await self.repondre(lot.lot_id, "introuvable", f"Graphe indisponible : {e}", etat)
        t = traduire(lot, donnees, etat, pile)
        if not isinstance(t, Traduction):
            return await self.repondre(lot.lot_id, t.code, t.message, etat, t.details)
        r = await self.relais.post("/commandes", content=t.lot.model_dump_json(exclude_unset=True),
                                   headers={"Content-Type": "application/json"})
        cr = CompteRendu.model_validate_json(r.content)
        if cr.ok and etat is not None:
            mettre_a_jour_pile(pile, t, etat)
        return cr

    async def repondre(self, lot_id: str, code: str, message: str, etat: EtatAffichage | None,
                       details: Any = None) -> CompteRendu:
        erreur: dict[str, Any] = {"code": code, "message": message}
        if details is not None:
            erreur["details"] = details
        corps: dict[str, Any] = {"version": 1, "lot_id": lot_id, "ok": False, "resultats": [], "erreur": erreur}
        if etat is not None:
            corps["etat"] = json.loads(etat.model_dump_json(exclude_unset=True))
        cr = CompteRendu.model_validate(corps)
        r = await self.relais.post(f"/intentions/{lot_id}/compte-rendu", content=cr.model_dump_json(exclude_unset=True),
                                   headers={"Content-Type": "application/json"})
        if r.status_code not in (204, 404):  # 404 : l'agent moyen 2 n'attend plus (délai)
            r.raise_for_status()
        return cr

    # ── boucle ────────────────────────────────────────────────────

    async def intentions(self) -> AsyncIterator[LotNavigation]:
        async with self.relais.stream("GET", "/intentions/flux", timeout=None) as r:
            r.raise_for_status()
            evenement = None
            async for ligne in r.aiter_lines():
                if ligne.startswith("event:"):
                    evenement = ligne[6:].strip()
                elif ligne.startswith("data:") and evenement == "intentions":
                    yield LotNavigation.model_validate_json(ligne[5:].strip())

    async def executer(self) -> None:
        """Écoute le relais indéfiniment ; les lots sont traités un par un (la pile reste cohérente)."""
        essais = 0
        while True:
            try:
                log.info("Connexion au relais d'affichage")
                async for lot in self.intentions():
                    essais = 0
                    try:
                        cr = await self.traiter(lot)
                        log.info("Lot %s : %s", lot.lot_id, "ok" if cr.ok else cr.erreur.code if cr.erreur else "refusé")
                    except Exception:
                        log.exception("Lot %s : échec du traitement", lot.lot_id)
            except (httpx.HTTPError, ValueError) as e:
                log.warning("Relais injoignable (%s)", e)
            await asyncio.sleep(ATTENTES_RECONNEXION_S[min(essais, len(ATTENTES_RECONNEXION_S) - 1)])
            essais += 1


async def principal() -> None:
    agent = AgentNavigateur(config.URL_INTERNE, config.AGENTS_API_KEY, config.ATLAS_API_URL, config.ATLAS_JETON_ACCES)
    try:
        await agent.executer()
    finally:
        await agent.fermer()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(principal())
