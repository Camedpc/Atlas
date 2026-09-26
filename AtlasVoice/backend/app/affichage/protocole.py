"""Protocoles P1 à P4 de la chaîne voix → commandes → affichage (miroir Pydantic de `protocoles/`).

Les JSON Schema de `protocoles/` font foi ; ces modèles doivent accepter et refuser exactement les
mêmes exemples (`protocoles/exemples/`, vérifié par `tests/test_protocoles.py`). Tout modèle refuse
les champs inconnus et ne convertit rien (mode strict) : un message invalide est refusé, jamais ignoré.
"""

from __future__ import annotations

from typing import Annotated, Any, ClassVar, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

VERSION = 1

IdNoeud = Annotated[str, StringConstraints(pattern=r"^[a-z0-9_]+$")]
Uuid = Annotated[
    str,
    StringConstraints(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"),
]
IdEcran = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
Date = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z)?$")]
DateHeure = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")]
TexteNonVide = Annotated[str, StringConstraints(min_length=1)]

StatutNoeud = Literal["etabli", "suspendu", "a_verifier", "invalide", "ouvert"]
Strategie = Literal["defaut", "roles", "roles_aux", "transitive", "chaines", "complet"]
Mode = Literal["2d", "3d"]
Theme = Literal["clair", "sombre"]
NomVue = Literal["dessus", "dessous", "face", "arriere", "droite", "gauche", "iso"]
ModeFiltre = Literal["masquer", "estomper"]
CodeErreur = Literal["invalide", "introuvable", "ambigu", "etat_invalide", "delai"]



class Strict(BaseModel):
    """Refuse les champs inconnus, ne convertit rien, et refuse `null` pour un champ facultatif
    qui ne l'autorise pas (absent ≠ null, comme dans les schémas)."""

    model_config = ConfigDict(extra="forbid", strict=True)
    # Champs facultatifs (défaut None) qui acceptent aussi un `null` explicite.
    _nullables: ClassVar[frozenset[str]] = frozenset()
    # Listes dont les éléments doivent être uniques (`uniqueItems`).
    _uniques: ClassVar[tuple[str, ...]] = ()

    @model_validator(mode="before")
    @classmethod
    def _refuser_null(cls, donnees: Any) -> Any:
        if isinstance(donnees, dict):
            for cle, valeur in donnees.items():
                champ = cls.model_fields.get(cle)
                if valeur is None and champ is not None and not champ.is_required() and cle not in cls._nullables:
                    raise ValueError(f"{cle} : null interdit (omettre le champ)")
        return donnees

    @model_validator(mode="after")
    def _verifier_uniques(self) -> Self:
        for champ in self._uniques:
            valeurs = getattr(self, champ)
            if valeurs is not None and len(set(map(repr, valeurs))) != len(valeurs):
                raise ValueError(f"{champ} : éléments en double")
        return self


# ─── Commun ──────────────────────────────────────────────────────────────────


class RefNoeud(Strict):
    noeud: IdNoeud


class RefConversation(Strict):
    conversation: Uuid


Cible = RefNoeud | RefConversation


class ErreurProtocole(Strict):
    _nullables = frozenset({"details"})

    code: CodeErreur
    message: TexteNonVide
    details: Any = None


class Periode(Strict):
    debut: Date | None
    fin: Date | None


ListeTextes = list[TexteNonVide]


class EtatFiltres(Strict):
    _uniques = ("statuts", "types")

    conversation: Uuid | None
    statuts: list[StatutNoeud]
    types: ListeTextes
    periode: Periode
    texte: str
    mode: ModeFiltre


class PatchFiltres(Strict):
    """Fusion superficielle dans EtatFiltres : chaque clé présente remplace la valeur courante."""

    _nullables = frozenset({"conversation"})
    _uniques = ("statuts", "types")

    conversation: Uuid | None = None
    statuts: list[StatutNoeud] | None = None
    types: ListeTextes | None = None
    periode: Periode | None = None
    texte: str | None = None
    mode: ModeFiltre | None = None


class ParametresLecture(Strict):
    """Surcharges des paramètres du graphe de lecture du moteur (en snake_case)."""

    demonstrations: Literal["toutes", "principale"] | None = None
    roles_retenus: list[Literal["principale", "auxiliaire", "technique", "contexte"]] | None = None
    masquer_contexte: bool | None = None
    types_toujours_visibles: ListeTextes | None = None
    types_insecables: ListeTextes | None = None
    longueur_min_chaine: Annotated[int, Field(ge=2, le=50)] | None = None
    longueur_max_chaine: Annotated[int, Field(ge=2, le=50)] | None = None
    meme_sous_probleme: bool | None = None

    _uniques = ("roles_retenus", "types_toujours_visibles", "types_insecables")


# ─── P4 : état d'affichage ───────────────────────────────────────────────────


class Camera(Strict):
    mode: Mode
    vue: NomVue | None
    orientation: Annotated[list[float], Field(min_length=4, max_length=4)]
    cible: Annotated[list[float], Field(min_length=3, max_length=3)]
    distance: Annotated[float, Field(gt=0)]


class Visible(Strict):
    noeud: IdNoeud
    libelle: str
    x: float
    y: float


class EtatAffichage(Strict):
    version: Literal[1]
    ecran: IdEcran
    utilisateur_id: TexteNonVide
    version_donnees: str
    strategie: Strategie
    parametres_lecture: ParametresLecture
    liens_complets: bool
    camera: Camera
    selection: RefNoeud | None
    portee: RefNoeud | None
    surlignes: list[IdNoeud]
    filtres: EtatFiltres
    fiche: RefNoeud | None
    panneau_ouvert: bool
    theme: Theme
    visibles: Annotated[list[Visible], Field(max_length=50)]
    survol: RefNoeud | None
    conversation_affichee: Uuid | None

    _uniques = ("surlignes",)


class VisibleResume(Strict):
    libelle: str


class EtatResume(Strict):
    """Résumé de l'écran pour Atlas (contexte des tâches, ligne « À l'écran » du prompt)."""

    ecran: IdEcran
    strategie: Strategie
    selection: RefNoeud | None
    filtres: EtatFiltres
    conversation_affichee: Uuid | None
    mode: Mode
    visibles: Annotated[list[VisibleResume], Field(max_length=15)]


# ─── P1 : ajouts à la tâche du registre ──────────────────────────────────────


class ContexteP1(Strict):
    _nullables = frozenset({"graphe_actif", "conversation_active"})

    graphe_actif: str | None = None
    conversation_active: str | None = None
    derniers_echanges: list[dict[str, str]] = []
    affichage: EtatResume | None


class TacheP1(BaseModel):
    """Champs de la tâche concernés par P1 ; les autres champs de la tâche sont libres ici.

    Modèle du test de contrat ; la tâche du registre (`registre/modele.py`) porte les mêmes champs.
    """

    model_config = ConfigDict(extra="allow", strict=True)

    type_agent: Literal["explorateur", "editeur_graphe", "conversation", "navigateur"]
    demande_brute: TexteNonVide
    extrait: TexteNonVide
    contexte: ContexteP1


# ─── P2 : intentions de navigation ───────────────────────────────────────────


class Designation(Strict):
    texte: TexteNonVide
    genre: Literal["noeud", "conversation"] | None = None
    type: TexteNonVide | None = None
    deictique: Literal["selection", "survol", "precedent"] | None = None


class PeriodeCriteres(Strict):
    debut: Date | None = None
    fin: Date | None = None

    @model_validator(mode="after")
    def _non_vide(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("période vide")
        return self


class CriteresFiltre(Strict):
    conversation: Designation | None = None
    statuts: Annotated[list[StatutNoeud], Field(min_length=1)] | None = None
    types: Annotated[ListeTextes, Field(min_length=1)] | None = None
    periode: PeriodeCriteres | None = None
    texte: TexteNonVide | None = None

    _uniques = ("statuts", "types")

    @model_validator(mode="after")
    def _non_vide(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("aucun critère")
        return self


class IntentionDesignation(Strict):
    intention: Literal["montrer", "lignee", "portee", "detailler"]
    quoi: Designation


class IntentionNiveau(Strict):
    intention: Literal["niveau_de_detail"]
    niveau: Literal["essentiel", "normal", "complet", "plus", "moins"]


class IntentionLiensComplets(Strict):
    intention: Literal["liens_complets"]
    oui: bool


class IntentionPointDeVue(Strict):
    intention: Literal["point_de_vue"]
    mode: Mode
    vue: Literal["face", "cote", "dessus", "iso"] | None = None


class IntentionFiltrer(Strict):
    intention: Literal["filtrer"]
    criteres: CriteresFiltre
    action: ModeFiltre


class IntentionSimple(Strict):
    intention: Literal["effacer_filtres", "effacer_selection", "tout_voir", "revenir"]


IntentionNavigation = Annotated[
    IntentionDesignation | IntentionNiveau | IntentionLiensComplets | IntentionPointDeVue | IntentionFiltrer
    | IntentionSimple,
    Field(discriminator="intention"),
]


class LotNavigation(Strict):
    version: Literal[1]
    lot_id: Uuid
    tache_id: Annotated[int, Field(ge=1)]
    utilisateur_id: TexteNonVide
    emis_le: DateHeure | None = None
    intentions: Annotated[list[IntentionNavigation], Field(min_length=1, max_length=20)]


# ─── P3 : commandes bas niveau ───────────────────────────────────────────────


class CmdStrategie(Strict):
    op: Literal["strategie"]
    id: Strategie


class CmdParametresLecture(Strict):
    op: Literal["parametres_lecture"]
    patch: ParametresLecture


class CmdLiensComplets(Strict):
    op: Literal["liens_complets"]
    oui: bool


class CmdMode(Strict):
    op: Literal["mode"]
    mode: Mode


class CmdVue(Strict):
    op: Literal["vue"]
    nom: NomVue


class CmdOrbiter(Strict):
    op: Literal["orbiter"]
    d_azimut_deg: Annotated[float, Field(ge=-360, le=360)]
    d_elevation_deg: Annotated[float, Field(ge=-180, le=180)]


class CmdZoomer(Strict):
    op: Literal["zoomer"]
    facteur: Annotated[float, Field(gt=0, le=100)]


class CmdCadrer(Strict):
    op: Literal["cadrer"]
    cibles: Annotated[list[Cible], Field(min_length=1)] | Literal["tout", "selection"]


class CmdSelectionner(Strict):
    op: Literal["selectionner"]
    cible: RefNoeud | None


class CmdPortee(Strict):
    op: Literal["portee"]
    cible: RefNoeud


class CmdSurligner(Strict):
    op: Literal["surligner"]
    cibles: list[RefNoeud]


class CmdFiltres(Strict):
    op: Literal["filtres"]
    patch: PatchFiltres


class CmdSansArgument(Strict):
    op: Literal["effacer_filtres", "recharger_donnees"]


class CmdFiche(Strict):
    op: Literal["fiche"]
    cible: RefNoeud | None


class CmdPanneau(Strict):
    op: Literal["panneau"]
    ouvert: bool


class CmdTheme(Strict):
    op: Literal["theme"]
    theme: Theme


class CmdRestaurer(Strict):
    op: Literal["restaurer"]
    etat: EtatAffichage


CommandeBas = Annotated[
    CmdStrategie | CmdParametresLecture | CmdLiensComplets | CmdMode | CmdVue | CmdOrbiter | CmdZoomer
    | CmdCadrer | CmdSelectionner | CmdPortee | CmdSurligner | CmdFiltres | CmdSansArgument | CmdFiche
    | CmdPanneau | CmdTheme | CmdRestaurer,
    Field(discriminator="op"),
]


class LotCommandes(Strict):
    version: Literal[1]
    lot_id: Uuid
    ecran: IdEcran
    origine: Literal["navigateur", "interface", "test"]
    tache_id: Annotated[int, Field(ge=1)] | None = None
    atomique: bool = True
    emis_le: DateHeure | None = None
    commandes: Annotated[list[CommandeBas], Field(max_length=50)]


class ResultatCommande(Strict):
    index: Annotated[int, Field(ge=0)]
    ok: bool
    erreur: ErreurProtocole | None = None


class CompteRendu(Strict):
    version: Literal[1]
    lot_id: Uuid
    ok: bool
    resultats: list[ResultatCommande]
    erreur: ErreurProtocole | None = None
    etat: EtatAffichage | None = None
    emis_le: DateHeure | None = None


# Nom du schéma (fichier `protocoles/<nom>.schema.json`) → modèle.
MODELES: dict[str, type[BaseModel]] = {
    "p1-tache": TacheP1,
    "p2-lot-navigation": LotNavigation,
    "p3-lot-commandes": LotCommandes,
    "p3-compte-rendu": CompteRendu,
    "p4-etat-affichage": EtatAffichage,
}
