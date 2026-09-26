"""Modèles du graphe, calqués sur supabase/migrations.

Un nœud est un énoncé scientifique. Une démonstration justifie un nœud à partir
d'autres nœuds (ses prémisses) : c'est ce qui dessine les arêtes du graphe.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

# Verdict stocké sur une démonstration.
Validite = Literal["a_verifier", "valide", "invalide"]

# Statut d'un nœud : calculé à partir de tout le graphe, jamais stocké.
Statut = Literal["etabli", "suspendu", "a_verifier", "invalide", "ouvert"]

Action = Literal[
    "creation_noeud",
    "modification_noeud",
    "ajout_demonstration",
    "modification_demonstration",
    "verdict",
    "import",
]


# ── Lignes des tables ────────────────────────────────────────────────────────


class LigneNoeud(BaseModel):
    """Table `noeuds`."""

    id: str
    nom: str
    enonce: str
    admis: bool
    """Axiome, définition ou résultat connu : établi sans démonstration."""
    parents: list[str] = []
    """Prémisses citées par au moins une démonstration du nœud (maintenu par trigger)."""
    enfants: list[str] = []
    """Nœuds dont une démonstration cite celui-ci (maintenu par trigger)."""
    conversation_id: str | None = None
    """Conversation qui a créé le nœud ; le graphe reste global."""
    cree_le: datetime
    modifie_le: datetime


class Demonstration(BaseModel):
    """Table `demonstrations` (clé : noeud_id + nom_demonstration)."""

    noeud_id: str
    nom_demonstration: str
    justifie_par: list[str]
    """Ids des nœuds utilisés comme prémisses."""
    demonstration: str
    validite: Validite
    auteur: str
    cree_le: datetime
    modifie_le: datetime


class EntreeJournal(BaseModel):
    """Table `journal` (append-only)."""

    id: int
    cree_le: datetime
    action: Action
    noeud_id: str | None
    nom_demonstration: str | None
    avant: Any
    apres: Any
    raison: str | None
    auteur: str


class Conversation(BaseModel):
    """Table `conversations`."""

    id: str
    titre: str
    session_agent: str | None
    """Thread Codex de l'orchestrateur, repris au tour suivant."""
    cree_le: datetime
    modifie_le: datetime


StatutExecution = Literal["en_cours", "terminee", "erreur", "arretee"]


class Execution(BaseModel):
    """Table `executions` : un tour de l'orchestrateur."""

    id: str
    conversation_id: str
    statut: StatutExecution
    erreur: str | None
    usage: Any
    """Consommation de jetons du thread Codex à la fin de ce tour."""
    debut: datetime
    fin: datetime | None


RoleMessage = Literal["utilisateur", "assistant", "outil", "systeme"]


class Message(BaseModel):
    """Table `messages`."""

    id: int
    conversation_id: str
    execution_id: str | None
    role: RoleMessage
    contenu: str
    donnees: Any
    cree_le: datetime


# ── Vues calculées ───────────────────────────────────────────────────────────


class Noeud(LigneNoeud):
    statut: Statut
    demonstrations: list[Demonstration]


class Arete(BaseModel):
    """Une prémisse (`source`) utilisée par une démonstration du nœud `cible`."""

    source: str
    cible: str
    nom_demonstration: str
    validite: Validite


class Graphe(BaseModel):
    noeuds: list[Noeud]
    aretes: list[Arete]


class DetailNoeud(Noeud):
    premisses: list[str]
    """Tous les nœuds cités par au moins une démonstration de ce nœud."""
    utilise_par: list[str]
    """Nœuds dont une démonstration cite celui-ci."""
