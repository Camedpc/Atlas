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
    "vue",
    "figure",
    "document",
]

TypeNoeud = Literal[
    "hypothese", "definition", "axiome", "choix_modelisation", "decision", "lemme", "proposition",
    "theoreme", "assertion", "experience", "calcul", "observation", "resultat", "conjecture",
]

# Rôle d'une prémisse dans une démonstration (la vue et l'IA s'en servent pour hiérarchiser).
RolePremisse = Literal["principale", "auxiliaire", "technique", "contexte"]


# ── Lignes des tables ────────────────────────────────────────────────────────


class LigneNoeud(BaseModel):
    """Table `noeuds` (clé : projet_id + id)."""

    projet_id: str
    """Espace de travail dont le graphe contient le nœud : chaque espace a son propre graphe."""
    id: str
    nom: str
    enonce: str
    admis: bool
    """Axiome, définition ou résultat connu : établi sans démonstration."""
    type: TypeNoeud | None = None
    """Nature de l'énoncé (hypothèse, lemme, observation…) ; None = non précisé."""
    details: Any = None
    """Décision : {question, alternatives, raison} ; choix de modélisation : {hypothese, portee, alternatives}."""
    parents: list[str] = []
    """Prémisses citées par au moins une démonstration du nœud (maintenu par trigger)."""
    enfants: list[str] = []
    """Nœuds dont une démonstration cite celui-ci (maintenu par trigger)."""
    conversation_id: str | None = None
    """Conversation qui a créé le nœud (le graphe est celui de l'espace, partagé par ses conversations)."""
    cree_le: datetime
    modifie_le: datetime


class Demonstration(BaseModel):
    """Table `demonstrations` (clé : projet_id + noeud_id + nom_demonstration)."""

    projet_id: str
    noeud_id: str
    nom_demonstration: str
    justifie_par: list[str]
    """Ids des nœuds utilisés comme prémisses."""
    roles: dict[str, RolePremisse] = {}
    """Rôle des prémisses non principales (une prémisse absente est principale)."""
    demonstration: str
    validite: Validite
    confiance: float | None = None
    """Probabilité (0 à 1) que le verdict du vérificateur soit juste ; vide tant qu'elle n'est pas jugée."""
    auteur: str
    cree_le: datetime
    modifie_le: datetime


class EntreeJournal(BaseModel):
    """Table `journal` (append-only)."""

    id: int
    cree_le: datetime
    action: Action
    projet_id: str
    noeud_id: str | None
    nom_demonstration: str | None
    avant: Any
    apres: Any
    raison: str | None
    auteur: str


class Projet(BaseModel):
    """Table `projets` : un espace de travail, avec son dossier dans le bunker."""

    id: str
    nom: str
    description: str
    dossier: str
    """Dossier du projet dans le bunker : espace/utilisateurs/<utilisateur>/<dossier>/."""
    cree_le: datetime
    modifie_le: datetime
    supprime_le: datetime | None = None
    """Espace supprimé : retiré des listes, mais son graphe, son journal et son dossier restent."""


class Conversation(BaseModel):
    """Table `conversations`."""

    id: str
    titre: str
    session_agent: str | None
    """Thread Codex de l'orchestrateur, repris au tour suivant."""
    projet_id: str | None = None
    """Projet de la conversation ; None = le projet « defaut »."""
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
    agents: Any = None
    """Arbre des agents (orchestrateur et sous-agents) à la fin de ce tour, voir `orchestrateur/suivi_agents.py`."""
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
    agent: str | None = None
    """Chemin Codex du sous-agent (ex. /root/hydrures) ; None = l'orchestrateur."""
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


# ── Vue du graphe (une par espace) ───────────────────────────────────────────


class GroupeVue(BaseModel):
    """Table `groupes` : un cadre de la vue (imbricable), avec son rectangle de cases calculé."""

    id: str
    nom: str
    parent_id: str | None
    genre: str
    couleur: str | None
    replie: bool
    ordre: int
    rectangle: list[int] | None = None
    """[colonne_min, ligne_min, colonne_max, ligne_max] (bornes incluses) ; None si le cadre est vide."""


class PlacementVue(BaseModel):
    """Table `placements` : la case d'un nœud et son cadre."""

    noeud_id: str
    groupe_id: str | None
    colonne: int
    ligne: int
    largeur: int
    hauteur: int
    fixe: bool


class EtiquetteVue(BaseModel):
    id: str
    nom: str
    couleur: str | None


class FigureVue(BaseModel):
    """Table `figures` : un graphique ou une image qui illustre un nœud. Sa place est dans `placements`, sous
    l'id `fig:<id>`. Les lois du tracé arrivent déjà échantillonnées (`points`, `bande`)."""

    id: str
    noeud_id: str
    titre: str
    legende: str | None
    trace: dict[str, Any] | None
    image: bool
    """Vrai si une image est servie par GET /api/figures/{id}/image?projet_id=."""
    image_largeur: int | None
    image_hauteur: int | None
    scene: bool = False
    """Vrai si la figure est une scène 3D animée (Plotly), servie par GET /api/figures/{id}/scene?projet_id=."""
    source: str | None
    fichier: str | None = None
    """Fichier d'origine de l'image, relatif au dossier du projet."""
    modifie_le: datetime


class DocumentVue(BaseModel):
    """Table `documents` : un fichier ou un dossier du projet mis dans le graphe. Sa place est dans `placements`,
    sous l'id `doc:<id>` ; `apercu` est calculé à l'écriture (atlas/documents.py), le graphe se lit sans disque."""

    id: str
    chemin: str
    genre: Literal["fichier", "dossier"]
    titre: str
    description: str | None
    apercu: dict[str, Any]
    present: bool
    modifie_le: datetime


class LienDocumentVue(BaseModel):
    """Lien nommé entre un document et un nœud, une figure (fig:<id>) ou un autre document (doc:<id>)."""

    de: str
    vers: str
    relation: Literal["source", "implemente", "produit", "ecrit_dans", "entree"]


class Vue(BaseModel):
    groupes: list[GroupeVue]
    placements: list[PlacementVue]
    etiquettes: list[EtiquetteVue]
    marques: list[list[str]]
    """[noeud_id, etiquette_id]."""
    figures: list[FigureVue] = []
    documents: list[DocumentVue] = []
    liens_documents: list[LienDocumentVue] = []
