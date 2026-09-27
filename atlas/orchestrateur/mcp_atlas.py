"""Serveur MCP (stdio) des outils Atlas, lancé par Codex : python -m atlas.orchestrateur.mcp_atlas

Lecture et écriture du graphe de l'espace de travail de la conversation, et de sa vue (cadres, cases,
étiquettes) (ATLAS_PROJET_ID, transmis par
l'orchestrateur, comme ATLAS_CONVERSATION_ID qui tague les nœuds créés) ; toute démonstration écrite démarre
« à vérifier ».
"""

import json
import os
from typing import Any

from mcp.server.mcpserver import MCPServer

from .. import ecriture, lecture, vue

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
    - {"op": "placer", "noeud": …, "groupe"? ("" = hors cadre), "colonne"?, "ligne"?, "largeur"?, "hauteur"?} :
      avec colonne et ligne, le nœud est fixé à cette case ; sans, il est placé à droite de ses prémisses
    - {"op": "deplacer_groupe", "id": …, "colonnes": dc, "lignes": dl} : décale tout le cadre
    - {"op": "reorganiser", "groupe"?} : replace les nœuds non fixés (d'un cadre ou de toute la vue)
    - {"op": "renommer_noeud", "id": …, "nom": …} : change le nom affiché (l'id ne change jamais)
    - {"op": "creer_etiquette", "id": …, "nom": …, "couleur"?}, {"op": "etiqueter" | "retirer_etiquette",
      "noeud": …, "etiquette": …}

    Règles : une case par nœud, un seul cadre par nœud, une case d'écart entre deux cadres voisins."""
    resultat = ecriture.organiser_vue(projet_id=_projet(), operations=operations, auteur=AUTEUR, essai=essai)
    return json.dumps({"ok": True, **resultat}, ensure_ascii=False)


if __name__ == "__main__":
    serveur.run("stdio")
