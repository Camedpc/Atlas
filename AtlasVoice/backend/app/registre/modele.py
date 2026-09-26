"""Modèle d'une tâche du registre (cahier des charges, section 3.3).

Le registre est le seul point de contact entre Atlas (couche vocale) et les agents.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


class Statut(StrEnum):
    EN_ATTENTE = "en_attente"
    EN_COURS = "en_cours"
    BESOIN_PRECISION = "besoin_precision"
    ATTEND_CONFIRMATION = "attend_confirmation"
    TERMINEE = "terminee"
    ECHOUEE = "echouee"
    ANNULEE = "annulee"


STATUTS_ACTIFS = frozenset(
    {Statut.EN_ATTENTE, Statut.EN_COURS, Statut.BESOIN_PRECISION, Statut.ATTEND_CONFIRMATION}
)
STATUTS_FINAUX = frozenset({Statut.TERMINEE, Statut.ECHOUEE, Statut.ANNULEE})
# Statuts où c'est l'utilisateur qui doit agir : pas de délai d'expiration.
STATUTS_ATTENTE_UTILISATEUR = frozenset({Statut.BESOIN_PRECISION, Statut.ATTEND_CONFIRMATION})
# Statuts qu'Atlas doit annoncer dès que l'utilisateur se tait.
STATUTS_A_ANNONCER = frozenset(
    {Statut.BESOIN_PRECISION, Statut.ATTEND_CONFIRMATION, Statut.TERMINEE, Statut.ECHOUEE}
)

# Liste fermée : ajouter une capacité = ajouter un agent côté serveur et une entrée ici.
TypeAgent = Literal["explorateur", "editeur_graphe", "conversation"]
TYPES_AGENT: tuple[str, ...] = ("explorateur", "editeur_graphe", "conversation")
# Agents qui écrivent en base : leurs modifications passent par une confirmation.
AGENTS_ECRIVAINS = frozenset({"editeur_graphe", "conversation"})

Canal = Literal["vocal", "texte"]
Nature = Literal["travail", "retour_arriere"]


def maintenant() -> datetime:
    return datetime.now(UTC)


class Contexte(BaseModel):
    """Ce que l'utilisateur a sous les yeux et les derniers échanges."""

    graphe_actif: str | None = None
    conversation_active: str | None = None
    derniers_echanges: list[dict[str, str]] = []


class ModificationProposee(BaseModel):
    description_orale: str = Field(min_length=1)
    diff: Any = None


class Tache(BaseModel):
    id: int
    utilisateur_id: str
    titre: str
    type_agent: TypeAgent
    nature: Nature = "travail"
    # Pour un retour en arrière : la tâche dont on annule la modification.
    tache_cible_id: int | None = None
    demande_brute: str
    reformulation: str
    contexte: Contexte = Contexte()
    statut: Statut = Statut.EN_ATTENTE
    avancement: str | None = None
    pourcentage: int | None = None
    question: str | None = None
    reponse: str | None = None
    modification_proposee: ModificationProposee | None = None
    # oui / non, et la correction éventuelle, après une modification proposée.
    decision: Literal["oui", "non"] | None = None
    correction: str | None = None
    resultat_oral: str | None = None
    resultat_detail: Any = None
    # Vrai une fois la modification appliquée par l'agent (tâche annulable).
    modification_appliquee: bool = False
    erreur: str | None = None
    canal: Canal = "vocal"
    # Vrai une fois l'état final (ou la question) transmis à Atlas.
    annoncee: bool = True
    arret_demande: bool = False
    cree_le: datetime = Field(default_factory=maintenant)
    maj_le: datetime = Field(default_factory=maintenant)
    termine_le: datetime | None = None

    @property
    def active(self) -> bool:
        return self.statut in STATUTS_ACTIFS

    def vue_orale(self) -> dict[str, Any]:
        """Ce qu'Atlas voit d'une tâche : pas de détail, pas de diff."""
        vue: dict[str, Any] = {
            "tache_id": self.id,
            "titre": self.titre,
            "agent": self.type_agent,
            "statut": self.statut.value,
        }
        if self.avancement:
            vue["avancement"] = self.avancement
        if self.pourcentage is not None:
            vue["pourcentage"] = self.pourcentage
        if self.statut == Statut.BESOIN_PRECISION and self.question:
            vue["question"] = self.question
        if self.statut == Statut.ATTEND_CONFIRMATION and self.modification_proposee:
            vue["modification_proposee"] = self.modification_proposee.description_orale
        if self.statut == Statut.TERMINEE and self.resultat_oral:
            vue["resultat_oral"] = self.resultat_oral
        if self.statut == Statut.ECHOUEE and self.erreur:
            vue["erreur"] = self.erreur
        return vue


class Evenement(BaseModel):
    """Chaque changement du registre émet un événement (vers Atlas et vers l'interface)."""

    tache: Tache
    type: str  # creee, statut, avancement, …
    ancien_statut: Statut | None = None
    horodatage: datetime = Field(default_factory=maintenant)
