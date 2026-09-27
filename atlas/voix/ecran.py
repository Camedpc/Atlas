"""L'écran du graphe pendant un appel : Atlas voix le pilote elle-même, pour les navigations rapides.

Par la WebSocket de l'appel, le navigateur de Camille envoie l'état de son écran (P4, message `ecran`) et exécute
les lots de commandes qu'on lui envoie (P3, message `commandes`), en répondant par un compte rendu
(`compte_rendu`). Les références que dit la voix (« Lemme 7 », « §2 », « Figure 1 ») sont résolues ici, sur le
graphe et la vue de l'espace (atlas/navigation.py) : la voix ne voit jamais le graphe entier.

Rien de visuel n'est enregistré (cadrage, zoom, filtres, surlignage). Un déplacement, lui, est écrit dans la vue
de l'espace (ecriture.organiser_vue, journalisé), puis l'écran relit ses données.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from .. import ecriture, lecture, navigation
from ..navigation import ErreurNavigation, Reperes
from ..vue import EtatVue

log = logging.getLogger(__name__)

DELAI_COMPTE_RENDU_S = 20.0
"""Un cadrage animé dure moins d'une seconde ; au-delà, l'écran ne répond plus (onglet fermé, réseau)."""
AUTEUR = "voix"
VISIBLES_MAX = 12


def erreur(message: str, candidats: list[str] | None = None) -> dict[str, Any]:
    return {"ok": False, "erreur": message, **({"candidats": candidats} if candidats else {})}


class Ecran:
    def __init__(self, envoyer: Callable[[dict[str, Any]], Awaitable[None]], projet_id: str):
        self.envoyer = envoyer
        self.projet_id = projet_id
        self.etat: dict[str, Any] | None = None
        """Dernier état de l'écran (P4) reçu du navigateur ; None tant qu'il ne s'est pas annoncé."""
        self._attentes: dict[str, asyncio.Future[dict[str, Any]]] = {}

    # ── Messages du navigateur ──

    def recevoir_etat(self, etat: Any) -> None:
        if isinstance(etat, dict) and isinstance(etat.get("ecran"), str):
            self.etat = etat

    def recevoir_compte_rendu(self, compte_rendu: Any) -> None:
        if not isinstance(compte_rendu, dict):
            return
        attente = self._attentes.pop(str(compte_rendu.get("lot_id")), None)
        if attente is not None and not attente.done():
            attente.set_result(compte_rendu)
        if isinstance(compte_rendu.get("etat"), dict):
            self.recevoir_etat(compte_rendu["etat"])

    def fermer(self) -> None:
        for attente in self._attentes.values():
            attente.cancel()
        self._attentes.clear()

    # ── Exécution ──

    def _indisponible(self) -> str | None:
        if self.etat is None:
            return "L'écran du graphe ne s'est pas annoncé : Camille n'a peut-être pas la page d'Atlas ouverte."
        projet = self.etat.get("projet")
        if projet and projet != self.projet_id:
            return "L'écran de Camille montre un autre espace que celui de cette conversation."
        return None

    async def executer(self, commandes: list[dict[str, Any]]) -> dict[str, Any]:
        """Envoie un lot (tout ou rien) et attend le compte rendu de l'écran."""
        if raison := self._indisponible():
            return erreur(raison)
        assert self.etat is not None
        lot = navigation.lot(commandes, self.etat["ecran"])
        attente: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._attentes[lot["lot_id"]] = attente
        await self.envoyer({"type": "commandes", "lot": lot})
        try:
            cr = await asyncio.wait_for(attente, DELAI_COMPTE_RENDU_S)
        except TimeoutError:
            return erreur("L'écran n'a pas répondu.")
        finally:
            self._attentes.pop(lot["lot_id"], None)
        if cr.get("ok"):
            return {"ok": True}
        refus = cr.get("erreur") or next((r.get("erreur") for r in cr.get("resultats", []) if not r.get("ok")), None)
        return erreur((refus or {}).get("message") or "L'écran a refusé la commande.")

    async def _vue(self) -> tuple[EtatVue, Reperes]:
        etat = await asyncio.to_thread(lecture.charger_etat_vue, self.projet_id)
        return etat, navigation.reperer(etat)

    # ── Outils de la voix ──

    async def montrer(
        self,
        references: list[str],
        etendue: navigation.Etendue = "seul",
        garder_seulement: bool = False,
        fiche: bool = False,
        statuts: list[str] | None = None,
    ) -> dict[str, Any]:
        if raison := self._indisponible():
            return erreur(raison)
        etat, reperes = await self._vue()
        try:
            sel = navigation.selectionner(etat, reperes, references, etendue, statuts or ())
            commandes = navigation.commandes_montrer(sel, garder_seulement=garder_seulement, fiche=fiche)
        except ErreurNavigation as e:
            return erreur(str(e), e.candidats)
        resultat = await self.executer(commandes)
        return {**resultat, "compris": sel.reperes, "noeuds": len(sel.noeuds)} if resultat["ok"] else resultat

    async def ensemble(self) -> dict[str, Any]:
        return await self.executer(navigation.commandes_ensemble())

    async def effacer(self) -> dict[str, Any]:
        return await self.executer(navigation.commandes_effacer())

    async def zoomer(self, facteur: float) -> dict[str, Any]:
        try:
            return await self.executer(navigation.commandes_zoomer(facteur))
        except ErreurNavigation as e:
            return erreur(str(e))

    async def deplacer(self, deplacements: list[dict[str, Any]]) -> dict[str, Any]:
        """Déplacements enregistrés dans la vue de l'espace (tout ou rien), puis montrés à l'écran."""
        etat, reperes = await self._vue()
        try:
            operations, faits = navigation.operations_deplacement(etat, reperes, deplacements)
        except ErreurNavigation as e:
            return erreur(str(e), e.candidats)
        try:
            await asyncio.to_thread(
                ecriture.organiser_vue, projet_id=self.projet_id, operations=operations, auteur=AUTEUR
            )
        except ecriture.ErreurGraphe as e:
            return erreur(f"Déplacement refusé : {e}")
        ids = [o["noeud"] for o in operations]
        noeuds = [i for i in ids if not i.startswith("fig:")]
        cibles = [{"noeud": i} for i in noeuds] + [{"figure": i[4:]} for i in ids if i.startswith("fig:")]
        commandes = [
            {"op": "recharger_donnees"},
            {"op": "surligner", "cibles": [{"noeud": i} for i in noeuds]},
            {"op": "cadrer", "cibles": cibles},
        ]
        affiche = await self.executer(commandes) if self._indisponible() is None else {"ok": False}
        return {"ok": True, "enregistre": faits, "affiche": affiche["ok"]}

    async def lire(self) -> dict[str, Any]:
        """Ce que Camille voit : zoom, sélection, fiche, filtres, et les nœuds au centre de l'écran."""
        if raison := self._indisponible():
            return erreur(raison)
        assert self.etat is not None
        e = self.etat
        _, reperes = await self._vue()
        nom = lambda ref: reperes.noeuds.get(ref["noeud"], ref["noeud"]) if ref else None  # noqa: E731
        filtres = e.get("filtres") or {}
        distance = (e.get("camera") or {}).get("distance") or 1
        return {
            "ok": True,
            "zoom": navigation.palier(1 / distance),
            "selection": nom(e.get("selection")),
            "fiche": nom(e.get("fiche")),
            "surlignes": len(e.get("surlignes") or []),
            "filtre_actif": bool(filtres.get("noeuds") or filtres.get("statuts") or filtres.get("texte")),
            "au_centre": [nom(v) for v in (e.get("visibles") or [])[:VISIBLES_MAX]],
        }
