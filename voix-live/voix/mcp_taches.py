"""Serveur MCP (stdio) des tâches de fond, lancé par Codex pour le thread vocal : python -m voix.mcp_taches

Il ne fait que relayer vers le serveur vocal (VOIX_URL), qui possède les tâches de la session (VOIX_SESSION).
"""

import json
import os
import urllib.request

from mcp.server.mcpserver import MCPServer

serveur = MCPServer("taches", instructions="Tâches longues confiées à des sous-agents en arrière-plan.")


def _appel(chemin: str, corps: dict | None = None) -> str:
    url = f"{os.environ['VOIX_URL']}/api/sessions/{os.environ['VOIX_SESSION']}/taches{chemin}"
    donnees = json.dumps(corps).encode() if corps is not None else None
    requete = urllib.request.Request(url, data=donnees, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(requete, timeout=15) as reponse:
        return reponse.read().decode()


@serveur.tool()
def lancer_tache(titre: str, consigne: str) -> str:
    """Lance un sous-agent en arrière-plan (modèle plus puissant, terminal complet) et rend la main tout de suite.
    `titre` : quelques mots pour l'interface. `consigne` : la mission complète et autonome (contexte compris :
    le sous-agent ne voit pas la conversation). Le résultat arrivera plus tard dans un message [Système]."""
    return _appel("", {"titre": titre, "consigne": consigne})


@serveur.tool()
def etat_taches() -> str:
    """Toutes les tâches de la session : statut, dernières étapes, résultat si terminée."""
    return _appel("")


@serveur.tool()
def consigne_tache(id: int, message: str) -> str:
    """Transmet une consigne de Camille à une tâche en cours."""
    return _appel(f"/{id}/consigne", {"message": message})


@serveur.tool()
def arreter_tache(id: int) -> str:
    """Arrête une tâche en cours."""
    return _appel(f"/{id}/arreter", {})


if __name__ == "__main__":
    serveur.run("stdio")
