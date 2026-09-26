"""Logique du registre : transitions de statut, résolution des tâches visées, événements.

Trois familles d'appelants :
- Atlas (les 6 outils) et l'interface, au nom d'un utilisateur ;
- le chat texte, qui crée des tâches sur le même chemin (canal « texte ») ;
- les agents, qui prennent les tâches et y écrivent avancement, questions et résultats.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import re
import unicodedata
from collections.abc import AsyncIterator, Callable
from datetime import timedelta
from typing import Any, Literal

from .modele import (
    AGENTS_ECRIVAINS,
    STATUTS_A_ANNONCER,
    STATUTS_ACTIFS,
    STATUTS_FINAUX,
    Canal,
    Contexte,
    Evenement,
    ModificationProposee,
    Statut,
    Tache,
    maintenant,
)
from .stockage import Stockage

log = logging.getLogger(__name__)

DELAI_EXPIRATION = timedelta(minutes=2)
FENETRE_RECENTES = timedelta(minutes=15)
LONGUEUR_MAX_ORAL = 600



def _normaliser(texte: str) -> str:
    t = unicodedata.normalize("NFD", texte)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", t).split())


def extrait_valide(extrait: str | None, demande_brute: str) -> str:
    """Le segment de la demande qui concerne une tâche (P1). Il doit se trouver dans la demande brute,
    à la casse, aux accents et à la ponctuation près ; sinon (inventé, reformulé, absent) : la demande entière."""
    extrait = (extrait or "").strip()
    n = _normaliser(extrait)
    return extrait if n and n in _normaliser(demande_brute) else demande_brute

class ErreurRegistre(Exception):
    """Erreur destinée à être relue par Atlas : le message est formulé pour lui."""

    def __init__(self, code: Literal["introuvable", "ambigu", "etat_invalide", "invalide"], message: str,
                 candidates: list[Tache] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.candidates = candidates or []

    def vers_json(self) -> dict[str, Any]:
        res: dict[str, Any] = {"erreur": self.code, "message": self.message}
        if self.candidates:
            res["taches_possibles"] = [{"tache_id": t.id, "titre": t.titre} for t in self.candidates]
        return res


class Abonnement:
    """Événements d'un abonné, filtrés. Itérable, ou `suivant(delai)` pour attendre avec délai."""

    def __init__(self, filtre: Callable[[Tache], bool] | None) -> None:
        self.file: asyncio.Queue[Evenement] = asyncio.Queue()
        self._filtre = filtre

    async def suivant(self, delai: float | None = None) -> Evenement:
        """Prochain événement retenu ; lève TimeoutError après `delai` secondes sans événement."""
        async with asyncio.timeout(delai):
            while True:
                evt = await self.file.get()
                if self._filtre is None or self._filtre(evt.tache):
                    return evt

    def __aiter__(self) -> Abonnement:
        return self

    async def __anext__(self) -> Evenement:
        return await self.suivant()


class Registre:
    def __init__(self, stockage: Stockage) -> None:
        self.stockage = stockage
        self._abonnes: set[asyncio.Queue[Evenement]] = set()
        self._derniers_statuts: dict[int, Statut] = {}
        self._surveillance: asyncio.Task | None = None
        stockage.abonner(self._sur_changement)

    # ── cycle de vie ──────────────────────────────────────────────

    async def demarrer(self) -> None:
        await self.stockage.demarrer()
        self._surveillance = asyncio.create_task(self._surveiller())

    async def fermer(self) -> None:
        if self._surveillance:
            self._surveillance.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._surveillance
        await self.stockage.arreter()

    async def _surveiller(self) -> None:
        """Une tâche sans mise à jour depuis 2 min passe en échec (section 6.4)."""
        while True:
            await asyncio.sleep(15)
            try:
                for tache in await self.stockage.expirer(DELAI_EXPIRATION):
                    log.warning("Tâche %s expirée (%s)", tache.id, tache.titre)
            except Exception:
                log.exception("Surveillance du registre en échec")

    # ── événements ────────────────────────────────────────────────

    async def _sur_changement(self, tache_id: int) -> None:
        tache = await self.stockage.obtenir(tache_id)
        if tache is None:
            return
        ancien = self._derniers_statuts.get(tache_id)
        self._derniers_statuts[tache_id] = tache.statut
        if ancien is None:
            type_evt = "creee"
        elif ancien != tache.statut:
            type_evt = "statut"
        else:
            type_evt = "maj"
        evt = Evenement(tache=tache, type=type_evt, ancien_statut=ancien)
        for file in list(self._abonnes):
            file.put_nowait(evt)

    @contextlib.asynccontextmanager
    async def abonnement(self, filtre: Callable[[Tache], bool] | None = None) -> AsyncIterator[Abonnement]:
        """`async with registre.abonnement(f) as flux: async for evt in flux: ...`"""
        abonnement = Abonnement(filtre)
        self._abonnes.add(abonnement.file)
        try:
            yield abonnement
        finally:
            self._abonnes.discard(abonnement.file)

    # ── création (Atlas, chat texte) ──────────────────────────────

    async def creer_tache(
        self,
        *,
        utilisateur_id: str,
        type_agent: str,
        titre: str,
        reformulation: str,
        demande_brute: str,
        extrait: str | None = None,
        contexte: Contexte | None = None,
        canal: Canal = "vocal",
        nature: Literal["travail", "retour_arriere"] = "travail",
        tache_cible_id: int | None = None,
    ) -> Tache:
        titre = titre.strip()[:120] or reformulation.strip()[:60]
        # La phrase exacte fait foi : à défaut de transcription, on garde la reformulation.
        brute = demande_brute.strip() or reformulation.strip()
        return await self.stockage.creer(
            {
                "utilisateur_id": utilisateur_id,
                "type_agent": type_agent,
                "titre": titre,
                "reformulation": reformulation.strip(),
                "demande_brute": brute,
                "extrait": extrait_valide(extrait, brute),
                "contexte": contexte or Contexte(),
                "canal": canal,
                "nature": nature,
                "tache_cible_id": tache_cible_id,
            }
        )

    # ── lecture ───────────────────────────────────────────────────

    async def tache_de(self, utilisateur_id: str, tache_id: int) -> Tache:
        tache = await self.stockage.obtenir(tache_id)
        if tache is None or tache.utilisateur_id != utilisateur_id:
            raise ErreurRegistre("introuvable", "Je ne trouve pas cette tâche.")
        return tache

    async def taches_visibles(self, utilisateur_id: str) -> list[Tache]:
        """Tâches actives + tâches finies récemment, les plus récentes d'abord."""
        actives = await self.stockage.lister(utilisateur_id, STATUTS_ACTIFS)
        recentes = await self.stockage.lister(
            utilisateur_id, STATUTS_FINAUX, depuis=maintenant() - FENETRE_RECENTES, limite=5
        )
        return actives + recentes

    async def a_annoncer(self, utilisateur_id: str) -> list[Tache]:
        taches = await self.stockage.lister(utilisateur_id, STATUTS_A_ANNONCER, limite=20)
        return [t for t in taches if not t.annoncee and t.canal == "vocal"]

    async def marquer_annoncee(self, tache: Tache) -> None:
        # Condition sur le statut : un changement survenu entre-temps reste à annoncer.
        await self.stockage.modifier(tache.id, {"annoncee": True}, statuts_attendus=[tache.statut])

    async def dernier_resultat(self, utilisateur_id: str, tache_id: int | None) -> Tache:
        if tache_id is not None:
            return await self.tache_de(utilisateur_id, tache_id)
        finies = await self.stockage.lister(utilisateur_id, [Statut.TERMINEE, Statut.ECHOUEE], limite=1)
        if not finies:
            raise ErreurRegistre("introuvable", "Aucune tâche terminée pour l'instant.")
        return finies[0]

    # ── actions de l'utilisateur (via Atlas ou l'interface) ───────

    async def _unique(self, utilisateur_id: str, statuts: set[Statut], tache_id: int | None,
                      aucune: str, plusieurs: str) -> Tache:
        if tache_id is not None:
            tache = await self.tache_de(utilisateur_id, tache_id)
            if tache.statut not in statuts:
                raise ErreurRegistre(
                    "etat_invalide", f"La tâche « {tache.titre} » est {libelle(tache.statut)}.")
            return tache
        candidates = await self.stockage.lister(utilisateur_id, statuts)
        if not candidates:
            raise ErreurRegistre("introuvable", aucune)
        if len(candidates) > 1:
            raise ErreurRegistre("ambigu", plusieurs, candidates)
        return candidates[0]

    async def repondre(self, utilisateur_id: str, tache_id: int | None, reponse: str) -> Tache:
        tache = await self._unique(
            utilisateur_id, {Statut.BESOIN_PRECISION}, tache_id,
            "Aucun agent n'attend de réponse.", "Plusieurs agents attendent une réponse : laquelle ?")
        maj = await self.stockage.modifier(
            tache.id,
            {"reponse": reponse.strip(), "statut": Statut.EN_COURS, "annoncee": True},
            statuts_attendus=[Statut.BESOIN_PRECISION],
        )
        return self._ou_conflit(maj)

    async def confirmer(self, utilisateur_id: str, tache_id: int | None, decision: Literal["oui", "non"],
                        correction: str | None = None) -> Tache:
        tache = await self._unique(
            utilisateur_id, {Statut.ATTEND_CONFIRMATION}, tache_id,
            "Aucune modification n'attend de confirmation.",
            "Plusieurs modifications attendent une confirmation : laquelle ?")
        correction = (correction or "").strip() or None
        champs: dict[str, Any] = {"decision": decision, "correction": correction, "annoncee": True}
        if decision == "oui" or correction:
            # L'agent applique (oui) ou prépare une nouvelle proposition (non + correction).
            champs["statut"] = Statut.EN_COURS
        else:
            champs |= {"statut": Statut.ANNULEE, "termine_le": maintenant(), "arret_demande": True}
        maj = await self.stockage.modifier(tache.id, champs, statuts_attendus=[Statut.ATTEND_CONFIRMATION])
        return self._ou_conflit(maj)

    async def arreter(self, utilisateur_id: str, tache_id: int | None) -> Tache:
        tache = await self._unique(
            utilisateur_id, set(STATUTS_ACTIFS), tache_id,
            "Aucune tâche en cours à arrêter.", "Plusieurs tâches tournent : laquelle arrêter ?")
        maj = await self.stockage.modifier(
            tache.id,
            {"statut": Statut.ANNULEE, "arret_demande": True, "termine_le": maintenant(), "annoncee": True},
            statuts_attendus=STATUTS_ACTIFS,
        )
        return self._ou_conflit(maj)

    async def revenir_en_arriere(self, utilisateur_id: str, tache_id: int | None,
                                 canal: Canal = "vocal") -> Tache:
        """« Annule ça » : une nouvelle tâche demande à l'agent de restaurer la version précédente."""
        if tache_id is not None:
            cible = await self.tache_de(utilisateur_id, tache_id)
        else:
            finies = await self.stockage.lister(utilisateur_id, [Statut.TERMINEE], limite=20)
            cible = next((t for t in finies if t.modification_appliquee and t.nature == "travail"), None)
            if cible is None:
                raise ErreurRegistre("introuvable", "Aucune modification récente à annuler.")
        if not cible.modification_appliquee:
            raise ErreurRegistre("etat_invalide", f"La tâche « {cible.titre} » n'a rien modifié.")
        return await self.creer_tache(
            utilisateur_id=utilisateur_id,
            type_agent=cible.type_agent,
            titre=f"annulation de « {cible.titre} »",
            reformulation=f"Revenir à la version d'avant la modification « {cible.titre} ».",
            demande_brute=f"Annule la modification « {cible.titre} ».",
            contexte=cible.contexte,
            canal=canal,
            nature="retour_arriere",
            tache_cible_id=cible.id,
        )

    # ── actions des agents ────────────────────────────────────────

    async def prendre(self, types_agent: list[str]) -> Tache | None:
        return await self.stockage.prendre_prochaine(types_agent)

    async def _agent(self, tache_id: int, champs: dict[str, Any], statuts: set[Statut]) -> Tache:
        maj = await self.stockage.modifier(tache_id, champs, statuts_attendus=statuts)
        if maj is None:
            tache = await self.stockage.obtenir(tache_id)
            if tache is None:
                raise ErreurRegistre("introuvable", f"Tâche {tache_id} inconnue.")
            raise ErreurRegistre("etat_invalide", f"Tâche {tache_id} : statut {tache.statut.value}.")
        return maj

    async def avancer(self, tache_id: int, avancement: str, pourcentage: int | None = None) -> Tache:
        return await self._agent(
            tache_id, {"avancement": avancement.strip(), "pourcentage": pourcentage}, {Statut.EN_COURS})

    async def questionner(self, tache_id: int, question: str) -> Tache:
        return await self._agent(
            tache_id,
            {"question": question.strip(), "reponse": None, "statut": Statut.BESOIN_PRECISION,
             "annoncee": False},
            {Statut.EN_COURS},
        )

    async def proposer(self, tache_id: int, modification: ModificationProposee) -> Tache:
        tache = await self.stockage.obtenir(tache_id)
        if tache is not None and tache.type_agent not in AGENTS_ECRIVAINS:
            raise ErreurRegistre("invalide", f"L'agent {tache.type_agent} n'écrit pas en base.")
        _verifier_oral(modification.description_orale)
        return await self._agent(
            tache_id,
            {"modification_proposee": modification, "decision": None, "correction": None,
             "statut": Statut.ATTEND_CONFIRMATION, "annoncee": False},
            {Statut.EN_COURS},
        )

    async def terminer(self, tache_id: int, resultat_oral: str, resultat_detail: Any = None,
                       modification_appliquee: bool = False) -> Tache:
        _verifier_oral(resultat_oral)
        tache = await self.stockage.obtenir(tache_id)
        if modification_appliquee and tache is not None and tache.decision != "oui" \
                and tache.nature != "retour_arriere":
            # Section 4.3 : jamais de modification sans confirmation.
            raise ErreurRegistre("invalide", "Modification appliquée sans confirmation de l'utilisateur.")
        return await self._agent(
            tache_id,
            {"statut": Statut.TERMINEE, "resultat_oral": resultat_oral.strip(),
             "resultat_detail": resultat_detail, "modification_appliquee": modification_appliquee,
             "termine_le": maintenant(), "annoncee": False, "pourcentage": 100},
            {Statut.EN_COURS},
        )

    async def echouer(self, tache_id: int, erreur: str) -> Tache:
        return await self._agent(
            tache_id,
            {"statut": Statut.ECHOUEE, "erreur": erreur.strip()[:500], "termine_le": maintenant(),
             "annoncee": False},
            {Statut.EN_ATTENTE, Statut.EN_COURS},
        )

    async def prendre_verrou(self, ressource: str, tache_id: int) -> bool:
        return await self.stockage.prendre_verrou(ressource, tache_id)

    async def liberer_verrou(self, ressource: str, tache_id: int) -> None:
        await self.stockage.liberer_verrou(ressource, tache_id)

    @staticmethod
    def _ou_conflit(maj: Tache | None) -> Tache:
        if maj is None:
            raise ErreurRegistre("etat_invalide", "La tâche a changé d'état entre-temps.")
        return maj


def _verifier_oral(texte: str) -> None:
    if not texte or not texte.strip():
        raise ErreurRegistre("invalide", "La version orale est vide.")
    if len(texte) > LONGUEUR_MAX_ORAL:
        raise ErreurRegistre("invalide", f"Version orale trop longue ({len(texte)} > {LONGUEUR_MAX_ORAL}).")


LIBELLES = {
    Statut.EN_ATTENTE: "en attente d'un agent",
    Statut.EN_COURS: "en cours",
    Statut.BESOIN_PRECISION: "en attente d'une précision",
    Statut.ATTEND_CONFIRMATION: "en attente de confirmation",
    Statut.TERMINEE: "terminée",
    Statut.ECHOUEE: "échouée",
    Statut.ANNULEE: "annulée",
}


def libelle(statut: Statut) -> str:
    return LIBELLES[statut]
