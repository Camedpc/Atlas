"""Serveur MCP (stdio) des outils Atlas, lancé par Codex : python -m atlas.orchestrateur.mcp_atlas

Lecture et écriture du graphe de l'espace de travail de la conversation (ATLAS_PROJET_ID, transmis par
l'orchestrateur, comme ATLAS_CONVERSATION_ID qui tague les nœuds créés) ; toute démonstration écrite démarre
« à vérifier ».
"""

import json
import os

from mcp.server.mcpserver import MCPServer

from .. import ecriture, lecture

LONGUEUR_MAX_ENONCE = 300
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
def creer_noeud(id: str, nom: str, enonce: str, admis: bool = False, raison_admis: str = "") -> str:
    """Crée une assertion dans le graphe. Échoue si l'id existe déjà (réutilise alors le nœud existant).

    - id : slug snake_case avec un préfixe (def_, ax_, lemme_, prop_, thm_, fait_, hyp_…), ex. lemme_suite_bornee
    - nom : titre court lisible
    - enonce : assertion précise et autonome, Markdown + LaTeX ($…$)
    - admis : vrai seulement pour une définition, un axiome, un résultat classique ou un fait sourcé,
      établi sans démonstration dans le graphe ; raison_admis dit alors d'où il vient (source, référence).
    """
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
    )
    return json.dumps({"ok": True, "id": ligne["id"]})


@serveur.tool()
def ajouter_demonstration(noeud_id: str, nom_demonstration: str, justifie_par: list[str], demonstration: str) -> str:
    """Ajoute une liaison de raisonnement : une démonstration du nœud `noeud_id` à partir des prémisses
    `justifie_par` (ids de nœuds existants, à créer avant). Elle démarre « à vérifier » : un vérificateur la
    jugera seule, avec l'énoncé du nœud et ceux des prémisses, sans voir le reste de ton raisonnement.

    - nom_demonstration : nom unique pour ce nœud, ex. « Par récurrence »
    - demonstration : argument complet, Markdown + LaTeX ; tout résultat utilisé doit figurer dans justifie_par
    """
    ecriture.ajouter_demonstration(
        projet_id=_projet(),
        noeud_id=noeud_id,
        nom_demonstration=nom_demonstration,
        justifie_par=justifie_par,
        demonstration=demonstration,
        auteur=AUTEUR,
    )
    return json.dumps({"ok": True, "noeud_id": noeud_id, "nom_demonstration": nom_demonstration})


if __name__ == "__main__":
    serveur.run("stdio")
