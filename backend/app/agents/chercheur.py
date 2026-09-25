"""Chercheur : fait grandir le graphe vers un objectif. Ne peut jamais valider son propre travail."""

import threading
from collections.abc import Callable

from .. import config, graphe
from ..graphe import ErreurGraphe
from .boucle import Outil, executer

AUTEUR = "chercheur"

SYSTEM = """Tu es un mathématicien chercheur. Tu fais avancer une démonstration en construisant un graphe de résultats.

# Le graphe
- Chaque nœud est un énoncé (définition, axiome, lemme, proposition, théorème).
- Un nœud est justifié par une ou plusieurs démonstrations. Chaque démonstration cite, dans `justifie_par`, les ids des nœuds qu'elle utilise comme prémisses. On ne peut citer que des nœuds existants : crée les lemmes avant de les citer.
- Ids : slugs lisibles en snake_case avec un préfixe (`def_`, `ax_`, `lemme_`, `prop_`, `thm_`), par exemple `lemme_suite_bornee`.
- Énoncés et démonstrations en Markdown, mathématiques en LaTeX entre `$…$` ou `$$…$$`.

# Validité
- Tout ce que tu écris démarre « à vérifier ». Un vérificateur indépendant jugera ensuite chaque démonstration isolément : il ne verra que l'énoncé du nœud, ta démonstration et les énoncés des prémisses citées. Il n'a pas accès à ton raisonnement.
- Chaque démonstration doit donc être complète et rigoureuse à elle seule : justifie chaque étape, et cite dans `justifie_par` tout résultat non élémentaire que tu utilises. Un résultat utilisé mais non cité rend la démonstration invalide.
- Préfère découper : plusieurs petits lemmes aux démonstrations courtes se vérifient mieux qu'une longue démonstration.
- Un nœud est établi s'il est admis, ou s'il a une démonstration valide dont toutes les prémisses sont établies. Les cycles ne valident rien.
- `admis: true` est réservé aux définitions, aux axiomes et aux théorèmes classiques de niveau manuel (énoncés précisément, avec une `raison_admis` qui dit d'où ils viennent). Jamais pour l'objectif ni pour un résultat intermédiaire propre au problème.

# Méthode
1. Commence par `lire_graphe` et réutilise ce qui existe.
2. Si l'objectif n'est pas déjà un nœud, crée-le.
3. Construis une chaîne de démonstrations qui relie l'objectif à des nœuds admis.
4. Si une démonstration a été jugée invalide, lis la raison du verdict avec `lire_noeud`, puis ajoute une nouvelle démonstration corrigée sous un autre nom (on ne modifie pas une démonstration existante).
5. Quand chaque nœud nécessaire à l'objectif a une démonstration (ou est admis), arrête-toi et résume en quelques lignes ce que tu as construit et les points les plus fragiles."""


def _creer_noeud(id: str, nom: str, enonce: str, admis: bool, raison_admis: str) -> dict:
    if admis and not raison_admis.strip():
        raise ErreurGraphe("Un nœud admis doit avoir une raison_admis (définition, axiome ou théorème classique).")
    graphe.creer_noeud(
        id=id, nom=nom, enonce=enonce, admis=admis, auteur=AUTEUR, raison=raison_admis.strip() or None
    )
    return {"ok": True, "id": id}


def _ajouter_demonstration(noeud_id: str, nom_demonstration: str, justifie_par: list[str], demonstration: str) -> dict:
    graphe.ajouter_demonstration(
        noeud_id=noeud_id,
        nom_demonstration=nom_demonstration,
        justifie_par=justifie_par,
        demonstration=demonstration,
        auteur=AUTEUR,
    )
    return {"ok": True, "noeud_id": noeud_id, "nom_demonstration": nom_demonstration, "validite": "a_verifier"}


OUTILS = [
    Outil(
        nom="lire_graphe",
        description=(
            "Vue compacte du graphe : pour chaque nœud, id, nom, énoncé, admis, statut effectif "
            "(etabli | suspendu | a_verifier | invalide | ouvert) et la liste de ses démonstrations "
            "(nom, prémisses, validité) sans leur texte."
        ),
        schema={"type": "object", "properties": {}, "required": [], "additionalProperties": False},
        fonction=lambda: {"noeuds": graphe.vue_compacte()},
    ),
    Outil(
        nom="lire_noeud",
        description=(
            "Détail d'un nœud : énoncé, statut, texte complet de chaque démonstration, énoncé et statut de "
            "chaque prémisse, raison du dernier verdict, et nœuds qui l'utilisent."
        ),
        schema={
            "type": "object",
            "properties": {"id": {"type": "string"}},
            "required": ["id"],
            "additionalProperties": False,
        },
        fonction=lambda id: graphe.detail_noeud(id),
    ),
    Outil(
        nom="creer_noeud",
        description="Crée un nouvel énoncé dans le graphe. Échoue si l'id existe déjà.",
        schema={
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Slug snake_case, ex. lemme_suite_bornee"},
                "nom": {"type": "string", "description": "Titre court lisible"},
                "enonce": {"type": "string", "description": "Énoncé précis, Markdown + LaTeX"},
                "admis": {
                    "type": "boolean",
                    "description": "Vrai seulement pour une définition, un axiome ou un théorème classique",
                },
                "raison_admis": {
                    "type": "string",
                    "description": "Si admis : source ou justification (ex. « théorème de Bolzano-Weierstrass »). Sinon chaîne vide.",
                },
            },
            "required": ["id", "nom", "enonce", "admis", "raison_admis"],
            "additionalProperties": False,
        },
        fonction=_creer_noeud,
    ),
    Outil(
        nom="ajouter_demonstration",
        description=(
            "Ajoute une démonstration à un nœud existant. Toutes les prémisses doivent exister. "
            "La démonstration démarre « à vérifier »."
        ),
        schema={
            "type": "object",
            "properties": {
                "noeud_id": {"type": "string"},
                "nom_demonstration": {"type": "string", "description": "Nom unique pour ce nœud, ex. « Par récurrence »"},
                "justifie_par": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Ids de tous les nœuds utilisés comme prémisses",
                },
                "demonstration": {"type": "string", "description": "Démonstration complète, Markdown + LaTeX"},
            },
            "required": ["noeud_id", "nom_demonstration", "justifie_par", "demonstration"],
            "additionalProperties": False,
        },
        fonction=_ajouter_demonstration,
    ),
]


def lancer(objectif: str, stop: threading.Event, progres: Callable[[str], None]) -> str:
    return executer(
        modele=config.MODELE_CHERCHEUR,
        effort=config.EFFORT_CHERCHEUR,
        system=SYSTEM,
        outils=OUTILS,
        message=f"Objectif : {objectif}",
        stop=stop,
        max_tours=config.MAX_TOURS_CHERCHEUR,
        progres=progres,
    )
