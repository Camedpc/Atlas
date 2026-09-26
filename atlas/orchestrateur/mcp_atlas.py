"""Serveur MCP (stdio) des outils Atlas, lancé par Codex : python -m atlas.orchestrateur.mcp_atlas

Lecture seule : écrire le graphe est le travail du textGrapher, pas de l'orchestrateur.
"""

import json

from mcp.server.mcpserver import MCPServer

from .. import lecture

LONGUEUR_MAX_ENONCE = 300

serveur = MCPServer("atlas", instructions="Lecture du graphe global de raisonnements d'Atlas.")


@serveur.tool()
def lire_graphe() -> str:
    """Vue compacte du graphe global d'Atlas : pour chaque nœud, id, nom, énoncé (tronqué), statut effectif
    (etabli | suspendu | a_verifier | invalide | ouvert), admis, parents (prémisses) et enfants."""
    graphe = lecture.charger_graphe()
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
    detail = lecture.lire_noeud(id)
    if detail is None:
        raise ValueError(f"Nœud inexistant : {id}")
    return detail.model_dump_json()


if __name__ == "__main__":
    serveur.run("stdio")
