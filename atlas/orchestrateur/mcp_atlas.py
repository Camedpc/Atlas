"""Serveur MCP (stdio) des outils Atlas, lancé par Codex : python -m atlas.orchestrateur.mcp_atlas

Lecture et écriture du graphe de l'espace de travail de la conversation, et de sa vue (cadres, cases,
étiquettes) (ATLAS_PROJET_ID, transmis par
l'orchestrateur, comme ATLAS_CONVERSATION_ID qui tague les nœuds créés) ; toute démonstration écrite démarre
« à vérifier ».
"""

import json
import os
from pathlib import Path
from typing import Any, Literal

from mcp.server.mcpserver import Image, MCPServer
from pydantic import BaseModel, Field

from .. import ecriture, figures, lecture, vue
from ..modeles import TypeNoeud

LONGUEUR_MAX_ENONCE = 300
TYPES = (
    "hypothese",
    "definition",
    "axiome",
    "choix_modelisation",
    "decision",
    "lemme",
    "proposition",
    "theoreme",
    "assertion",
    "experience",
    "calcul",
    "observation",
    "resultat",
    "conjecture",
)
AUTEUR = "orchestrateur"

serveur = MCPServer("atlas", instructions="Lecture et écriture du graphe de raisonnements de l'espace de travail.")


def _projet() -> str:
    projet_id = os.environ.get("ATLAS_PROJET_ID")
    if not projet_id:
        raise ecriture.ErreurGraphe("ATLAS_PROJET_ID absent : le serveur MCP atlas ne sait pas quel graphe lire.")
    return projet_id


@serveur.tool()
def lire_graphe() -> str:
    """Vue compacte du graphe de l'espace de travail : pour chaque nœud, id, nom, énoncé (tronqué), statut effectif
    (etabli | suspendu | a_verifier | invalide | ouvert), admis, parents (prémisses) et enfants."""
    graphe = lecture.charger_graphe(_projet())
    return json.dumps(
        [
            {
                "id": n.id,
                "nom": n.nom,
                "type": n.type,
                "enonce": n.enonce[:LONGUEUR_MAX_ENONCE],
                "statut": n.statut,
                "admis": n.admis,
                "parents": n.parents,
                "enfants": n.enfants,
            }
            for n in graphe.noeuds
        ],
        ensure_ascii=False,
    )


@serveur.tool()
def lire_noeud(id: str) -> str:
    """Détail d'un nœud : énoncé complet, statut, démonstrations (texte, prémisses, validité), prémisses et
    nœuds qui l'utilisent."""
    detail = lecture.lire_noeud(_projet(), id)
    if detail is None:
        raise ecriture.ErreurGraphe(f"Nœud inexistant : {id}")
    return detail.model_dump_json()


@serveur.tool()
def creer_noeud(
    id: str,
    nom: str,
    enonce: str,
    admis: bool = False,
    raison_admis: str = "",
    type: str = "",
    groupe: str = "",
    details: dict[str, Any] | None = None,
) -> str:
    """Crée une assertion dans le graphe et la place dans la vue. Échoue si l'id existe déjà (réutilise alors le
    nœud existant).

    - id : slug snake_case avec un préfixe (def_, ax_, lemme_, prop_, thm_, fait_, hyp_…), ex. lemme_suite_bornee
    - nom : titre court lisible
    - enonce : assertion précise et autonome, Markdown + LaTeX ($…$)
    - admis : vrai seulement pour une définition, un axiome, un résultat classique ou un fait sourcé,
      établi sans démonstration dans le graphe ; raison_admis dit alors d'où il vient (source, référence).
    - type : hypothese, definition, axiome, choix_modelisation, decision, lemme, proposition, theoreme,
      assertion, experience, calcul, observation, resultat, conjecture.
    - groupe : id du cadre de la vue où ranger le nœud (voir lire_vue / organiser_vue) ; vide = près de ses voisins.
    - details : pour une décision {question, alternatives: [{libelle, retenue, raison}], raison} ; pour un choix
      de modélisation {hypothese, portee, alternatives: [texte]}.
    """
    if type and type not in TYPES:
        raise ecriture.ErreurGraphe(f"Type inconnu « {type} » : {', '.join(TYPES)}.")
    if admis and not raison_admis.strip():
        raise ecriture.ErreurGraphe("Un nœud admis doit avoir une raison_admis (définition, axiome, source…).")
    ligne = ecriture.creer_noeud(
        projet_id=_projet(),
        id=id,
        nom=nom,
        enonce=enonce,
        admis=admis,
        auteur=AUTEUR,
        conversation_id=os.environ.get("ATLAS_CONVERSATION_ID") or None,
        raison=raison_admis.strip() or None,
        type=type or None,
        details=details or None,
        groupe=groupe or None,
    )
    return json.dumps({"ok": True, "id": ligne["id"]})


@serveur.tool()
def ajouter_demonstration(
    noeud_id: str,
    nom_demonstration: str,
    justifie_par: list[str],
    demonstration: str,
    roles: dict[str, str] | None = None,
) -> str:
    """Ajoute une liaison de raisonnement : une démonstration du nœud `noeud_id` à partir des prémisses
    `justifie_par` (ids de nœuds existants, à créer avant). Elle démarre « à vérifier » : un vérificateur la
    jugera seule, avec l'énoncé du nœud et ceux des prémisses, sans voir le reste de ton raisonnement.

    - nom_demonstration : nom unique pour ce nœud, ex. « Par récurrence »
    - demonstration : argument complet, Markdown + LaTeX ; tout résultat utilisé doit figurer dans justifie_par
    - roles : rôle des prémisses qui ne sont pas l'étape principale, ex. {"def_alpha": "contexte",
      "lemme_gronwall": "technique", "ch_prise": "auxiliaire"} ; une prémisse absente est principale.
      Les prémisses principales sont les flèches du raisonnement ; le contexte n'est pas dessiné en flèche.
    """
    ecriture.ajouter_demonstration(
        projet_id=_projet(),
        noeud_id=noeud_id,
        nom_demonstration=nom_demonstration,
        justifie_par=justifie_par,
        demonstration=demonstration,
        auteur=AUTEUR,
        roles=roles,
    )
    return json.dumps({"ok": True, "noeud_id": noeud_id, "nom_demonstration": nom_demonstration})


class CadreAPoser(BaseModel):
    id: str = Field(description="minuscules, chiffres et _, ex. sp_trainee")
    nom: str = Field(description="titre du cadre, ex. « SP2 · Chute dans l'air »")
    genre: Literal["sous_probleme", "etape", "piste_abandonnee", "libre"] = "sous_probleme"
    parent: str = Field("", description="id du cadre parent (sous-cadre) ; vide = premier niveau")
    couleur: str = Field("", description="#rrggbb ; vide = teinte automatique")


class NoeudAPoser(BaseModel):
    id: str = Field(description="slug avec préfixe (def_, hyp_, lemme_, prop_, thm_, obs_, res_…)")
    nom: str = Field(description="titre court lisible")
    enonce: str = Field(description="assertion précise et autonome, Markdown + LaTeX ($…$)")
    type: TypeNoeud = "assertion"
    groupe: str = Field("", description="id du cadre (déclaré dans cadres ou existant)")
    admis: bool = False
    raison_admis: str = Field("", description="source, si admis")
    details: dict[str, Any] | None = Field(None, description="décision ou choix de modélisation (voir creer_noeud)")


class DemonstrationAPoser(BaseModel):
    noeud_id: str
    nom_demonstration: str = Field(description="unique pour ce nœud, ex. « Par la loi de Newton »")
    justifie_par: list[str] = Field(description="ids des prémisses (du lot ou déjà dans le graphe)")
    demonstration: str = Field(description="argument complet, Markdown + LaTeX")
    roles: dict[str, Literal["auxiliaire", "technique", "contexte"]] = Field(
        default_factory=dict, description="rôle des prémisses non principales (absentes = principales)"
    )


@serveur.tool()
def poser_graphe(
    cadres: list[CadreAPoser],
    noeuds: list[NoeudAPoser],
    demonstrations: list[DemonstrationAPoser],
    essai: bool = False,
) -> str:
    """Pose d'un coup tout un morceau de graphe : cadres, nœuds et démonstrations, dans n'importe quel ordre à
    l'intérieur de chaque liste (une prémisse peut être un nœud du même lot). Tout est validé avant d'écrire :
    au moindre problème rien n'est écrit et l'erreur dit quel élément corriger (« noeuds[3] … »).

    Mise en page automatique : les cadres de premier niveau que tu crées se suivent de gauche à droite dans l'ordre
    du raisonnement (un cadre dont les nœuds s'appuient sur un autre va à sa droite ; à hauteur égale, dans l'ordre
    de la liste) ; dans chaque cadre, les nœuds vont à droite de leurs prémisses principales et auxiliaires.
    Les démonstrations démarrent « à vérifier ». essai = vrai : valide et renvoie les avertissements (nœuds ni admis
    ni démontrés, nœuds reliés à rien) sans rien écrire."""
    try:
        resultat = ecriture.poser_graphe(
            projet_id=_projet(),
            cadres=[c.model_dump() for c in cadres],
            noeuds=[n.model_dump() for n in noeuds],
            demonstrations=[d.model_dump() for d in demonstrations],
            auteur=AUTEUR,
            conversation_id=os.environ.get("ATLAS_CONVERSATION_ID") or None,
            essai=essai,
        )
    except ecriture.ErreurGraphe as e:
        return json.dumps({"ok": False, "erreur": str(e), "rien_n_a_ete_ecrit": True}, ensure_ascii=False)
    return json.dumps({"ok": True, **resultat}, ensure_ascii=False)


@serveur.tool()
def lire_vue() -> str:
    """La vue du graphe telle que l'utilisateur la voit : cadres (imbriqués), et pour chaque nœud sa case
    [colonne,ligne], son type, son statut, ses prémisses avec leur rôle et ses étiquettes. Les colonnes vont des
    prémisses (à gauche) vers les conclusions (à droite)."""
    return vue.rendre_texte(lecture.charger_etat_vue(_projet()))


@serveur.tool()
def organiser_vue(operations: list[dict[str, Any]], essai: bool = False) -> str:
    """Réarrange la vue, tout ou rien (essai = vrai : valide sans rien écrire). Opérations, dans l'ordre :

    - {"op": "creer_groupe", "id": "sp_bords", "nom": "Conditions aux extrémités", "parent": "", "genre":
      "sous_probleme" | "etape" | "piste_abandonnee" | "libre", "couleur": "#rrggbb"}
    - {"op": "modifier_groupe", "id": …, "nom"?, "parent"? ("" = racine), "genre"?, "couleur"?, "replie"?, "ordre"?}
    - {"op": "supprimer_groupe", "id": …} : ses nœuds et sous-cadres remontent dans le cadre parent
    - {"op": "placer", "noeud": …, "groupe"? ("" = hors cadre), "colonne"?, "ligne"?, "largeur"?, "hauteur"?, "fixe"?} :
      avec colonne et ligne, le nœud est fixé à cette case (sauf "fixe": false) ; sans, il est placé à droite de
      ses prémisses
    - {"op": "deplacer_groupe", "id": …, "colonnes": dc, "lignes": dl} : décale tout le cadre
    - {"op": "reorganiser", "groupe"?} : replace les nœuds non fixés (d'un cadre ou de toute la vue)
    - {"op": "renommer_noeud", "id": …, "nom": …} : change le nom affiché (l'id ne change jamais)
    - {"op": "creer_etiquette", "id": …, "nom": …, "couleur"?}, {"op": "etiqueter" | "retirer_etiquette",
      "noeud": …, "etiquette": …}

    Règles : une case par nœud, un seul cadre par nœud, une case d'écart entre deux cadres voisins. Une figure se
    place comme un nœud, sous l'id fig:<id> (renommer_noeud change son titre)."""
    resultat = ecriture.organiser_vue(projet_id=_projet(), operations=operations, auteur=AUTEUR, essai=essai)
    return json.dumps({"ok": True, **resultat}, ensure_ascii=False)


def _lire_fichier_image(chemin: str) -> bytes:
    """Un fichier de la session (chemin relatif à son dossier) ou de son espace : rien au-delà."""
    session = Path(os.environ.get("ATLAS_DOSSIER_SESSION") or ".").resolve()
    fichier = (session / chemin).resolve()
    permis = session.parent.parent  # le dossier de l'espace : sessions/<id>/ → <projet>/
    if not fichier.is_relative_to(permis):
        raise ecriture.ErreurGraphe(f"Image hors de l'espace de travail : {chemin}.")
    if not fichier.is_file():
        raise ecriture.ErreurGraphe(f"Image introuvable : {fichier} (chemin relatif au dossier de la session).")
    return fichier.read_bytes()


@serveur.tool()
def creer_figure(
    id: str,
    noeud_id: str,
    titre: str,
    legende: str = "",
    trace: dict[str, Any] | None = None,
    image: str = "",
    source: str = "",
    groupe: str = "",
    largeur: int = 0,
    hauteur: int = 0,
    remplacer: bool = False,
) -> str:
    """Ajoute au graphe une figure qui illustre le nœud noeud_id (en général une observation, un calcul ou un
    résultat) : un tracé vectoriel, une image, ou les deux (l'image produite par ton script et les données qu'elle
    trace). Elle prend sa propre place dans la vue, par défaut juste à droite de son nœud (fig:<id> dans lire_vue).

    - id : minuscules, chiffres et _ ; titre : court ; legende : ce que montre la figure, Markdown + LaTeX.
    - image : chemin d'un PNG, JPEG, GIF ou WebP (relatif au dossier de la session, ex. docs_session/v_t.png).
    - trace : {"x": {"titre": "$t$", "unite": "s", "echelle": "lin" | "log", "min"?, "max"?}, "y": {…},
      "series": [
        {"genre": "mesures", "nom": …, "points": [[x, y], [x, y, σy], [x, y, σy, σx]], "source"?: fichier},
        {"genre": "courbe", "nom": …, "points": [[x, y], …], "source"?: script},  (simulation, calcul)
        {"genre": "loi", "nom": …, "expression": "v_l*tanh(g*t/v_l)", "variable": "t",
         "parametres": {"g": {"valeur": 9.81, "incertitude"?: 0.01, "noeud"?: id du nœud qui la fournit}},
         "de"?: 0, "a"?: 5}]}
      Une loi est tracée avec sa bande d'incertitude ; expressions : + - * / ^, sqrt, exp, ln, log10, sin, cos,
      tan, tanh, arctan, abs, pi. Ne mets jamais de points inventés dans une série « mesures ».
    - source : d'où viennent les données ou l'image (script, fichier, article).
    - groupe : cadre de la vue (par défaut celui du nœud) ; largeur, hauteur : en cases (défaut 3 × 2).
    - remplacer : vrai pour remplacer une figure existante (elle garde sa place)."""
    donnees = _lire_fichier_image(image) if image else None
    ligne = ecriture.creer_figure(
        projet_id=_projet(),
        id=id,
        noeud_id=noeud_id,
        titre=titre,
        auteur=AUTEUR,
        legende=legende,
        trace=trace,
        image=donnees,
        source=source,
        groupe=groupe or None,
        largeur=largeur or None,
        hauteur=hauteur or None,
        conversation_id=os.environ.get("ATLAS_CONVERSATION_ID") or None,
        remplacer=remplacer,
    )
    return json.dumps({"ok": True, "figure": id, "vue": vue.PREFIXE_FIGURE + id, "image": ligne["image_chemin"]})


@serveur.tool()
def lire_figure(id: str) -> list[str | Image]:
    """Une figure du graphe : son nœud, sa légende, sa source, les données de son tracé (axes, points, lois et
    paramètres), et son image si elle en a une (tu la vois)."""
    figure = lecture.lire_figure(_projet(), id.removeprefix(vue.PREFIXE_FIGURE))
    if figure is None:
        raise ecriture.ErreurGraphe(f"Figure inexistante : {id}. lire_vue liste les figures (fig:<id>).")
    lignes = [f"Figure {figure['id']} « {figure['titre']} », illustre le nœud {figure['noeud_id']}."]
    if figure["legende"]:
        lignes.append(f"Légende : {figure['legende']}")
    if figure["source"]:
        lignes.append(f"Source : {figure['source']}")
    if figure["trace"]:
        lignes.append("Tracé :\n" + figures.resumer_trace(figure["trace"]))
    contenu: list[str | Image] = ["\n".join(lignes)]
    if figure["image_chemin"]:
        format_image = figure["image_type"].removeprefix("image/")
        contenu.append(Image(data=lecture.lire_image_figure(figure["image_chemin"]), format=format_image))
    return contenu


if __name__ == "__main__":
    serveur.run("stdio")
