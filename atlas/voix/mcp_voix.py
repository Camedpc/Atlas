"""Serveur MCP (stdio) d'Atlas voix, lancé par Codex pour le thread vocal : python -m atlas.voix.mcp_voix

Il relaie vers atlas.serveur (ATLAS_URL_INTERNE), qui tient l'appel (ATLAS_APPEL), l'orchestrateur et les tâches.
"""

import json
import os
import urllib.error
import urllib.request
from typing import Any, Literal

from mcp.server.mcpserver import MCPServer

serveur = MCPServer(
    "voix",
    instructions="Confier du travail à l'orchestrateur, lancer de petites tâches, piloter l'écran du graphe.",
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
def preparer_parcours(titre: str, consigne: str) -> str:
    """Confie à l'agent navigateur la préparation d'un parcours du graphe : une suite d'écrans commentés que Camille
    déroulera étape par étape (dérouler une preuve, visite guidée d'un cadre, suivre une lignée). Prend une ou deux
    minutes et rend la main tout de suite ; le résultat (le chemin du parcours) arrive dans un message [Système].
    `consigne` : ce que Camille veut voir et dans quel ordre, dans ses mots, avec les repères qu'il a cités."""
    return _appel("/taches", {"titre": titre, "consigne": consigne, "genre": "navigateur"})


@serveur.tool()
def derouler_parcours(parcours: str, depuis: int = 1) -> str:
    """Déroule un parcours tout seul, à partir de l'étape `depuis` : chaque étape s'affiche, sa phrase est dite
    telle quelle, puis la suivante enchaîne. Ne dis rien de plus après l'appel. Si Camille parle, il se met en
    pause, et un message te dit où il en est. `parcours` : son chemin (…/parcours/<fichier>.json)."""
    return _appel("/ecran/parcours/derouler", {"parcours": parcours, "etape": depuis})


@serveur.tool()
def jouer_etape(parcours: str, etape: int = 1) -> str:
    """Montre une seule étape d'un parcours (à partir de 1), sans enchaîner, et renvoie sa `phrase` à dire avec
    tes mots : pour revenir sur une étape précise."""
    return _appel("/ecran/parcours", {"parcours": parcours, "etape": etape})


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


# ── Écran du graphe (atlas/voix/ecran.py) : rien de visuel n'est enregistré, sauf `deplacer`. ──
# Références : « Lemme 7 », « Hypothèse (ii) », « Figure 2 », « §1.2 », ou un nom de nœud ou de cadre.


@serveur.tool()
def montrer(
    references: list[str],
    etendue: Literal["seul", "premisses", "consequences", "lignee"] = "seul",
    garder_seulement: bool = False,
    fiche: bool = False,
    statuts: list[str] | None = None,
) -> str:
    """Montre des nœuds, cadres ou figures à Camille : l'écran les cadre, sélectionne un nœud seul ou surligne
    plusieurs. `etendue` ajoute à chaque nœud ses prémisses (transitivement), ses conséquences ou les deux
    (`lignee`). `garder_seulement` estompe tout le reste. `fiche` ouvre la fiche du premier nœud. `statuts`
    (etabli, suspendu, a_verifier, invalide, ouvert) ajoute les nœuds de ces statuts. Renvoie ce qui a été compris
    (`compris`), ou une erreur avec des `candidats` si la référence est ambiguë."""
    corps = {"references": references, "etendue": etendue, "garder_seulement": garder_seulement, "fiche": fiche}
    return _appel("/ecran/montrer", corps | {"statuts": statuts or []})


@serveur.tool()
def vue_d_ensemble() -> str:
    """Cadre tout le graphe (ce qui passe les filtres, s'il y en a)."""
    return _appel("/ecran/ensemble", {})


@serveur.tool()
def zoomer(facteur: float) -> str:
    """Zoome autour du centre de l'écran : 1.5 rapproche, 0.6 éloigne."""
    return _appel("/ecran/zoomer", {"facteur": facteur})


@serveur.tool()
def effacer_ecran() -> str:
    """Retire filtres, surlignage, sélection et fiche (la caméra ne bouge pas)."""
    return _appel("/ecran/effacer", {})


@serveur.tool()
def lire_ecran() -> str:
    """Ce que Camille voit : zoom, sélection, fiche ouverte, filtres, et les nœuds au centre de l'écran."""
    return _appel("/ecran")


@serveur.tool()
def deplacer(deplacements: list[dict[str, Any]]) -> str:
    """Déplace des nœuds ou des figures dans la vue : c'est ENREGISTRÉ (Camille le retrouvera), à ne faire que sur
    sa demande explicite. Chaque déplacement : {"quoi": référence, "a_cote_de": référence, "cote": "droite" |
    "gauche" | "dessous" | "dessus"} (première case libre de ce côté ; il rejoint le cadre de son voisin), ou
    {"quoi", "colonne", "ligne"} (case de la grille). Tout ou rien : un refus n'a rien changé."""
    return _appel("/ecran/deplacer", {"deplacements": deplacements})


@serveur.tool()
def terminer_appel(raison: str = "") -> str:
    """Raccroche l'appel. Quand Camille le demande (« raccroche », « ferme la conversation », « on arrête là »,
    « au revoir »), ou quand l'échange est clairement conclu (Camille remercie ou dit au revoir, et rien n'est en
    attente de sa part). Dis d'abord au revoir en une courte phrase, dans ce même tour : l'appel se ferme une fois
    ta phrase jouée, et reste ouvert si Camille reprend la parole. `raison` : quelques mots (« demandé par Camille »,
    « conversation terminée »). Dans le doute, demande plutôt s'il reste autre chose."""
    return _appel("/terminer", {"raison": raison})


if __name__ == "__main__":
    serveur.run("stdio")
