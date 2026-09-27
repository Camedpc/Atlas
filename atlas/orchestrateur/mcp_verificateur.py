"""Serveur MCP (stdio) du vérificateur, lancé par Codex : python -m atlas.orchestrateur.mcp_verificateur

Séparé du serveur `atlas` pour avoir son propre délai : une vérification peut durer plusieurs minutes. Juge le graphe
de l'espace de travail ATLAS_PROJET_ID, transmis par l'orchestrateur, et raconte son avancement à atlas.serveur
(ATLAS_URL_INTERNE) pour l'agent graph de la conversation ATLAS_CONVERSATION_ID.
"""

import asyncio
import json
import os
import urllib.request
import uuid
from typing import Any

from mcp.server.mcpserver import MCPServer

from . import verificateur

serveur = MCPServer("verificateur", instructions="Vérification des démonstrations du graphe d'Atlas.")


def _poster(evenement: dict[str, Any]) -> None:
    url = f"{os.environ['ATLAS_URL_INTERNE']}/api/conversations/{os.environ['ATLAS_CONVERSATION_ID']}/verification"
    entetes = {"Content-Type": "application/json"}
    if jeton := os.environ.get("ATLAS_JETON_ACCES"):
        entetes["Authorization"] = f"Bearer {jeton}"
    requete = urllib.request.Request(url, data=json.dumps(evenement).encode(), headers=entetes)
    with urllib.request.urlopen(requete, timeout=5):
        pass


def raconteur() -> verificateur.Raconter | None:
    """Envoie l'avancement de cet appel à atlas.serveur ; None hors d'une conversation (rien à afficher)."""
    if not (os.environ.get("ATLAS_URL_INTERNE") and os.environ.get("ATLAS_CONVERSATION_ID")):
        return None
    appel = uuid.uuid4().hex

    async def raconter(evenement: dict[str, Any]) -> None:
        await asyncio.to_thread(_poster, {"appel": appel, **evenement})

    return raconter


@serveur.tool()
async def verifier(noeud_ids: list[str] | None = None) -> str:
    """Fait juger, une par une et en parallèle, les démonstrations « à vérifier » des nœuds `noeud_ids` (toutes
    celles du graphe de l'espace si la liste est vide). Chaque démonstration est jugée seule, avec l'énoncé de son
    nœud et ceux de ses prémisses ; le verdict (validite, confiance) est écrit dans le graphe.

    Renvoie, par démonstration : noeud_id, nom_demonstration, validite, confiance, justification, modele — ou erreur.
    """
    resultats = await verificateur.verifier(os.environ["ATLAS_PROJET_ID"], noeud_ids or [], raconteur())
    if not resultats:
        return json.dumps({"message": "Aucune démonstration à vérifier."}, ensure_ascii=False)
    return json.dumps(resultats, ensure_ascii=False)


if __name__ == "__main__":
    serveur.run("stdio")
