"""Registre des appels vocaux : l'appel en cours (un seul à la fois, limite Gradium) et le dernier appel de
chaque conversation, pour l'arbre des agents.

Atlas voix apparaît dans l'arbre (`/voix`) pendant l'appel, puis tant que l'orchestrateur n'a pas été relancé
depuis la saisie texte. S'il a confié du travail à l'orchestrateur, l'orchestrateur est affiché comme son
enfant : c'est lui qui l'a mis en route.
"""

import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from ..orchestrateur.suivi_agents import RACINE
from .contexte import VOIX

if TYPE_CHECKING:
    from .session import Session


@dataclass
class DernierAppel:
    agents: list[dict[str, Any]]
    fin: float
    a_confie: bool


class Appels:
    def __init__(self) -> None:
        self.par_id: dict[str, Session] = {}
        self.par_conversation: dict[str, Session] = {}
        self.derniers: dict[str, DernierAppel] = {}

    def ouvrir(self, session: "Session") -> None:
        self.par_id[session.id] = session
        self.par_conversation[session.conversation.id] = session

    def fermer(self, session: "Session") -> None:
        self.par_id.pop(session.id, None)
        if self.par_conversation.get(session.conversation.id) is session:
            del self.par_conversation[session.conversation.id]
        self.derniers[session.conversation.id] = DernierAppel(session.agents(), time.time(), session.a_confie)

    def en_cours(self, conversation_id: str) -> bool:
        return conversation_id in self.par_conversation

    def agents_voix(
        self, conversation_id: str, dernier_lancement: tuple[str, float] | None
    ) -> tuple[list[dict[str, Any]], bool]:
        """Agents de la voix à montrer dans l'arbre, et si l'orchestrateur est à rattacher à la voix."""
        session = self.par_conversation.get(conversation_id)
        if session is not None:
            return session.agents(), session.a_confie
        dernier = self.derniers.get(conversation_id)
        if dernier is None:
            return [], False
        if dernier_lancement is not None and dernier_lancement[0] == "texte" and dernier_lancement[1] > dernier.fin:
            return [], False  # l'orchestrateur a été relancé à l'écrit : la voix n'est plus à l'origine
        return dernier.agents, dernier.a_confie


def fusionner(arbre: list[dict[str, Any]], voix: list[dict[str, Any]], a_confie: bool) -> list[dict[str, Any]]:
    """Arbre des agents de la conversation, avec Atlas voix et ses tâches. Fonction pure."""
    if not voix:
        return arbre
    orchestrateur = [{**a, "parent": VOIX} if a.get("chemin") == RACINE and a_confie else a for a in arbre]
    return voix + orchestrateur


appels = Appels()
