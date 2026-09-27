"""Serveur MCP (stdio) d'Atlas voix, lancé par Codex pour le thread vocal : python -m atlas.voix.mcp_voix

Il relaie vers atlas.serveur (ATLAS_URL_INTERNE), qui tient l'appel (ATLAS_APPEL), l'orchestrateur et les tâches.
"""

import json
import os
import urllib.error
import urllib.request

from mcp.server.mcpserver import MCPServer

serveur = MCPServer(
    "voix", instructions="Confier du travail à l'orchestrateur, lancer de petites tâches, changer l'affichage."
)


def _appel(chemin: str, corps: dict | None = None) -> str:
    url = f"{os.environ['ATLAS_URL_INTERNE']}/api/voix/appels/{os.environ['ATLAS_APPEL']}{chemin}"
    entetes = {"Content-Type": "application/json"}
    if jeton := os.environ.get("ATLAS_JETON_ACCES"):
        entetes["Authorization"] = f"Bearer {jeton}"
    donnees = json.dumps(corps).encode() if corps is not None else None
    requete = urllib.request.Request(url, data=donnees, headers=entetes)
    try:
        with urllib.request.urlopen(requete, timeout=30) as reponse:
            return reponse.read().decode()
    except urllib.error.HTTPError as erreur:
        return json.dumps({"erreur": erreur.code, "detail": erreur.read().decode()[:500]})


@serveur.tool()
def confier_orchestrateur(consigne: str) -> str:
    """Confie une recherche ou une analyse à l'orchestrateur d'Atlas (modèle puissant, directeurs de labo,
    graphiste, vérificateur). Lance un nouveau tour s'il est libre, sinon injecte la consigne dans son tour en
    cours. `consigne` : complète et autonome, dans les mots de Camille. Rend la main tout de suite ; ses étapes et
    sa réponse arrivent ensuite dans des messages [Orchestrateur]."""
    return _appel("/orchestrateur", {"consigne": consigne})


@serveur.tool()
def etat_orchestrateur() -> str:
    """Où en est l'orchestrateur : s'il travaille, et l'arbre de ses agents (rôle, état, activité, résultat)."""
    return _appel("/orchestrateur")


@serveur.tool()
def arreter_orchestrateur() -> str:
    """Arrête le tour de l'orchestrateur. Uniquement si Camille demande explicitement d'arrêter la recherche."""
    return _appel("/orchestrateur/arreter", {})


@serveur.tool()
def lancer_tache(titre: str, consigne: str) -> str:
    """Lance un petit sous-agent en arrière-plan pour une tâche pratique (fichiers, commande, vérification) et rend
    la main tout de suite. `titre` : quelques mots. `consigne` : mission complète (il ne voit pas l'appel).
    Le résultat arrivera dans un message [Système]. Pas pour la recherche : c'est l'orchestrateur."""
    return _appel("/taches", {"titre": titre, "consigne": consigne})


@serveur.tool()
def etat_taches() -> str:
    """Les petites tâches de l'appel : statut, dernières étapes, résultat si terminée."""
    return _appel("/taches")


@serveur.tool()
def consigne_tache(id: int, message: str) -> str:
    """Transmet une consigne de Camille à une petite tâche en cours."""
    return _appel(f"/taches/{id}/consigne", {"message": message})


@serveur.tool()
def arreter_tache(id: int) -> str:
    """Arrête une petite tâche en cours."""
    return _appel(f"/taches/{id}/arreter", {})


@serveur.tool()
def afficher(demande: str, extrait: str = "", titre: str = "") -> str:
    """Change ce que Camille voit à l'écran du graphe : montrer, cadrer, zoomer, sélectionner ou filtrer des nœuds,
    les écarter ou les déplacer sur son écran seulement, enchaîner avec des pauses, revenir à l'affichage précédent.
    L'agent navigateur d'AtlasVoice s'en charge ; il ne modifie jamais le graphe. `demande` : ce que Camille veut
    voir, dans ses mots, avec tout l'enchaînement. `extrait` : les mots exacts de sa phrase qui concernent
    l'affichage, s'il n'y en a qu'une partie. `titre` : quelques mots. Rend la main tout de suite ; le résultat ou
    une question de l'agent arrive dans un message [Affichage]."""
    return _appel("/affichage", {"demande": demande, "extrait": extrait, "titre": titre})


@serveur.tool()
def repondre_affichage(id: int, reponse: str) -> str:
    """Transmet la réponse de Camille à la question posée par l'agent navigateur (message [Affichage — question])."""
    return _appel(f"/affichage/{id}/reponse", {"reponse": reponse})


if __name__ == "__main__":
    serveur.run("stdio")
