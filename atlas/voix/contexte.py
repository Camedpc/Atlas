"""Ce que la voix et l'orchestrateur se transmettent, en texte. Fonctions pures.

- au décroché, la voix reçoit la fin de la conversation (`contexte_decroche`) ;
- pendant l'appel, les événements de l'orchestrateur deviennent des annonces (`annonce`) ;
- au raccrochage, l'orchestrateur reçoit ce qu'il n'a pas vu de l'appel (`pont`).
"""

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from ..modeles import Message

VOIX = "/voix"
"""Chemin de l'agent vocal dans l'arbre des agents et dans la table `messages`."""

LONGUEUR_MESSAGE = 600
LONGUEUR_DERNIERE_REPONSE = 3000
LONGUEUR_PONT = 6000
LONGUEUR_REPONSE_ANNONCEE = 3000

_NOMS = {"utilisateur": "Camille", "assistant": "Orchestrateur"}
_NOMS_VOIX = {"utilisateur": "Camille (à l'oral)", "assistant": "Atlas voix"}
_ROLES = {"directeur_de_labo": "le directeur de labo", "graphiste": "le graphiste", "scribe": "le scribe"}


def _court(texte: str, longueur: int) -> str:
    texte = " ".join(texte.split())
    return texte if len(texte) <= longueur else texte[: longueur - 1] + "…"


def contexte_decroche(messages: Sequence[Message], limite: int = 30) -> str:
    """Fin de la conversation (orchestrateur et appels précédents), pour le tour d'échauffement de la voix.

    Les sorties d'outils sont écartées ; chaque message est tronqué, sauf la dernière réponse de l'orchestrateur,
    la plus utile pour savoir où en est la recherche.
    """
    utiles = [m for m in sorted(messages, key=lambda m: m.id) if m.role in ("utilisateur", "assistant")][-limite:]
    if not utiles:
        return "La conversation est vide : rien n'a encore été demandé à l'orchestrateur."
    derniere = next((m.id for m in reversed(utiles) if m.role == "assistant" and m.agent is None), None)
    lignes = []
    for m in utiles:
        noms = _NOMS_VOIX if m.agent == VOIX else _NOMS
        longueur = LONGUEUR_DERNIERE_REPONSE if m.id == derniere else LONGUEUR_MESSAGE
        lignes.append(f"{noms[m.role]} : {_court(m.contenu, longueur)}")
    return "\n".join(lignes)


def _dire_etape(etape: dict[str, Any]) -> str:
    qui = _ROLES.get(str(etape.get("role")), "un sous-agent")
    mission = etape.get("mission") or "?"
    match etape.get("genre"):
        case "lance":
            return f"l'orchestrateur lance « {mission} »"
        case "termine":
            resultat = f" Résultat : {_court(str(etape['resultat']), 400)}" if etape.get("resultat") else ""
            return f"{qui} « {mission} » a terminé.{resultat}"
        case "echec":
            return f"{qui} « {mission} » a échoué"
        case _:
            return f"{qui} « {mission} » a été interrompu"


def annonce(evenements: Sequence[dict[str, Any]]) -> str | None:
    """Message [Orchestrateur] pour la voix, à partir des événements accumulés depuis la dernière annonce.

    La fin du tour passe devant et rend les étapes précédentes inutiles ; plusieurs étapes sont regroupées.
    """
    fins = [e for e in evenements if e.get("type") == "fin"]
    if fins:
        fin = fins[-1]
        if fin.get("statut") == "terminee" and fin.get("reponse"):
            return (
                "[Orchestrateur — tour terminé] Sa réponse finale :\n"
                f"{_court(str(fin['reponse']), LONGUEUR_REPONSE_ANNONCEE)}\n\n"
                "Résume-la à Camille en deux ou trois phrases, et propose la suite si c'est utile."
            )
        if fin.get("statut") == "arretee":
            return "[Orchestrateur] Son tour a été arrêté. Dis-le en une phrase."
        return f"[Orchestrateur] Son tour a échoué : {fin.get('erreur') or 'erreur inconnue'}. Dis-le en une phrase."
    etapes = [_dire_etape(e) for e in evenements if e.get("type") == "etape"]
    if not etapes:
        return None
    if len(etapes) == 1:
        return f"[Orchestrateur — étape] {etapes[0]}. Dis-le à Camille en une phrase courte."
    liste = " ; ".join(etapes)
    return f"[Orchestrateur — {len(etapes)} étapes] {liste}. Annonce-les en une phrase chacune au plus, en regroupant."


def pont(messages_appel: Sequence[Message], debut: datetime, fin: datetime) -> str | None:
    """Ce que l'orchestrateur doit savoir de l'appel vocal, ajouté en tête du prochain message qu'il reçoit."""
    lignes = [
        f"{_NOMS_VOIX[m.role]} : {' '.join(m.contenu.split())}"
        for m in sorted(messages_appel, key=lambda m: m.id)
        if m.role in ("utilisateur", "assistant")
    ]
    if not lignes:
        return None
    transcription = "\n".join(lignes)
    if len(transcription) > LONGUEUR_PONT:
        transcription = "…" + transcription[-LONGUEUR_PONT:]
    return (
        f"[Appel vocal de {debut:%H:%M} à {fin:%H:%M}. Camille parlait à Atlas voix, pas à toi ; les demandes qui "
        "t'ont été confiées pendant l'appel sont déjà dans ton historique. Transcription de l'appel :\n"
        f"{transcription}\n[Fin de l'appel. Camille reprend par écrit : réponds normalement, Markdown compris.]"
    )
