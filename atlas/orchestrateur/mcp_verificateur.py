"""Serveur MCP (stdio) du vérificateur, lancé par Codex : python -m atlas.orchestrateur.mcp_verificateur

Séparé du serveur `atlas` pour avoir son propre délai : une vérification peut durer plusieurs minutes. Juge le graphe
de l'espace de travail ATLAS_PROJET_ID, transmis par l'orchestrateur.
"""

import json
import os

from mcp.server.mcpserver import MCPServer

from . import verificateur

serveur = MCPServer("verificateur", instructions="Vérification des démonstrations du graphe d'Atlas.")


@serveur.tool()
async def verifier(noeud_ids: list[str] | None = None) -> str:
    """Fait juger, une par une et en parallèle, les démonstrations « à vérifier » des nœuds `noeud_ids` (toutes
    celles du graphe de l'espace si la liste est vide). Chaque démonstration est jugée seule, avec l'énoncé de son
    nœud et ceux de ses prémisses ; le verdict (validite, confiance) est écrit dans le graphe.

    Renvoie, par démonstration : noeud_id, nom_demonstration, validite, confiance, justification, modele — ou erreur.
    """
    resultats = await verificateur.verifier(os.environ["ATLAS_PROJET_ID"], noeud_ids or [])
    if not resultats:
        return json.dumps({"message": "Aucune démonstration à vérifier."}, ensure_ascii=False)
    return json.dumps(resultats, ensure_ascii=False)


if __name__ == "__main__":
    serveur.run("stdio")
