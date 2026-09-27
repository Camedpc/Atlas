"""Arbre des agents d'un tour (orchestrateur et sous-agents), tenu à jour depuis les notifications Codex.

Codex n'envoie au flux du tour que les événements du thread principal ; ceux des sous-agents (multi-agents v2)
arrivent sur la même connexion avec leur `threadId`. `agent.tour` les intercepte tous et les passe ici.
Un agent est repéré par son chemin Codex (`/root`, `/root/hydrures`, `/root/hydrures/biblio`…).

Pas d'I/O : `recevoir` renvoie ce qu'il faut enregistrer (items terminés des sous-agents) ou enrichir
(rôle, surnom et modèle d'un nouveau sous-agent, lus par `thread/read`).
"""

import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

RACINE = "/root"

EtatAgent = Literal["actif", "attend", "termine", "echec", "interrompu"]

# Notifications utiles au suivi : le reste (deltas de texte, quotas…) est ignoré dès le fil de lecture.
METHODES_SUIVIES = frozenset(
    {"item/started", "item/completed", "turn/started", "turn/completed", "thread/tokenUsage/updated"}
)

LONGUEUR_MAX_ACTIVITE = 200
LONGUEUR_MAX_RESULTAT = 600
LONGUEUR_MAX_REPONSE = 4000


@dataclass
class Agent:
    chemin: str
    thread_id: str
    parent: str | None
    role: str
    debut: float
    surnom: str | None = None
    modele: str | None = None
    etat: EtatAgent = "actif"
    activite: str = "Démarre"
    outil: str | None = None
    """Outil en cours d'utilisation (None : l'agent réfléchit, attend ou a fini)."""
    tokens: int = 0
    nb_outils: int = 0
    fin: float | None = None
    resultat: str | None = None


@dataclass
class Etape:
    """Étape clé d'un tour, racontée par la voix : un sous-agent direct de l'orchestrateur démarre ou s'arrête.

    Les petits-enfants (littérature, expérimentateur…) et les outils restent muets.
    """

    genre: Literal["lance", "termine", "echec", "interrompu"]
    chemin: str
    role: str
    mission: str
    resultat: str | None = None


@dataclass
class Evenements:
    """Ce que le tour doit faire après une notification."""

    a_enregistrer: list[tuple[str, Any]] = field(default_factory=list)
    """(chemin, item) : items terminés d'un sous-agent, à enregistrer dans sa conversation."""
    nouveaux: list[str] = field(default_factory=list)
    """Threads de sous-agents apparus, dont lire le rôle, le surnom et le modèle."""
    etapes: list[Etape] = field(default_factory=list)
    """Étapes clés à annoncer (voir `Etape`)."""


def _court(texte: str, longueur: int) -> str:
    texte = " ".join(texte.split())
    return texte if len(texte) <= longueur else texte[: longueur - 1] + "…"


def mission_depuis_chemin(chemin: str) -> str:
    """`/root/hydrures_pression` → « hydrures pression » : la mission elle-même est chiffrée par Codex."""
    return chemin.rsplit("/", 1)[-1].replace("_", " ").replace("-", " ")


def _commande(item: dict) -> str:
    actions = item.get("commandActions") or []
    if actions and isinstance(actions[0], dict) and actions[0].get("command"):
        return str(actions[0]["command"])
    return str(item.get("command", ""))


class SuiviAgents:
    def __init__(self, horloge: Callable[[], float] = time.time) -> None:
        self._horloge = horloge
        self.agents: dict[str, Agent] = {}
        self._par_thread: dict[str, str] = {}
        self.derniere_reponse: str | None = None
        """Réponse finale de l'orchestrateur à ce tour, en entier (le `resultat` de l'agent est tronqué)."""

    @classmethod
    def depuis(cls, instantane: list[dict[str, Any]] | None, horloge: Callable[[], float] = time.time) -> "SuiviAgents":
        """Reprend l'arbre laissé par le tour précédent : on peut encore écrire à ses sous-agents."""
        suivi = cls(horloge)
        for ligne in instantane or []:
            try:
                agent = Agent(**ligne)
            except TypeError:
                continue
            suivi.agents[agent.chemin] = agent
            suivi._par_thread[agent.thread_id] = agent.chemin
        return suivi

    def demarrer_racine(self, thread_id: str, modele: str | None = None) -> None:
        """L'orchestrateur, racine de l'arbre ; un nouveau tour le remet au travail sans oublier ses sous-agents."""
        racine = self.agents.get(RACINE)
        if racine is None or racine.thread_id != thread_id:
            racine = Agent(RACINE, thread_id, None, "orchestrateur", self._horloge(), modele=modele)
            self.agents[RACINE] = racine
        racine.debut, racine.fin, racine.etat, racine.activite = self._horloge(), None, "actif", "Démarre"
        racine.modele = modele or racine.modele
        self._par_thread[thread_id] = RACINE

    def instantane(self) -> list[dict[str, Any]]:
        return [asdict(a) for a in self.agents.values()]

    def enrichir(self, thread_id: str, *, role: str | None, surnom: str | None, modele: str | None) -> None:
        agent = self._agent(thread_id)
        if agent is None:
            return
        agent.role = role or agent.role
        agent.surnom = surnom or agent.surnom
        agent.modele = modele or agent.modele

    def recevoir(self, methode: str, params: dict[str, Any]) -> Evenements:
        evenements = Evenements()
        thread_id = params.get("threadId")
        item = params.get("item") if isinstance(params.get("item"), dict) else None

        if item is not None and item.get("type") == "subAgentActivity":
            self._activite_sous_agent(item, thread_id, evenements)

        agent = self._agent(thread_id)
        if agent is None:
            return evenements
        maintenant = self._horloge()

        match methode:
            case "turn/started":
                agent.etat, agent.fin, agent.outil, agent.activite = "actif", None, None, "Réfléchit"
            case "turn/completed":
                statut = (params.get("turn") or {}).get("status")
                deja_fini = agent.etat in ("termine", "echec", "interrompu")
                agent.etat = {"completed": "termine", "interrupted": "interrompu"}.get(statut, "echec")
                agent.fin, agent.outil = maintenant, None
                agent.activite = {"termine": "Terminé", "interrompu": "Interrompu"}.get(agent.etat, "Échec")
                if not deja_fini:
                    self._etape(evenements, agent, agent.etat)
            case "thread/tokenUsage/updated":
                total = ((params.get("tokenUsage") or {}).get("total") or {}).get("totalTokens")
                if isinstance(total, int):
                    agent.tokens = total
            case "item/started" if item is not None:
                self._debut_item(agent, item)
            case "item/completed" if item is not None:
                self._fin_item(agent, item)
                if agent.chemin != RACINE and item.get("type") not in ("userMessage", "reasoning"):
                    evenements.a_enregistrer.append((agent.chemin, item))
        return evenements

    # ── interne ──

    def _etape(self, evenements: Evenements, agent: Agent, genre: str) -> None:
        if agent.parent != RACINE:
            return
        evenements.etapes.append(
            Etape(genre, agent.chemin, agent.role, mission_depuis_chemin(agent.chemin), agent.resultat)  # type: ignore[arg-type]
        )

    def _agent(self, thread_id: Any) -> Agent | None:
        chemin = self._par_thread.get(thread_id) if isinstance(thread_id, str) else None
        return self.agents.get(chemin) if chemin else None

    def _activite_sous_agent(self, item: dict, thread_parent: Any, evenements: Evenements) -> None:
        chemin, thread_id, genre = item.get("agentPath"), item.get("agentThreadId"), item.get("kind")
        if not isinstance(chemin, str) or not isinstance(thread_id, str):
            return
        agent = self.agents.get(chemin)
        if agent is None:
            parent = chemin.rsplit("/", 1)[0] or None
            if parent not in self.agents:
                parent = self._par_thread.get(thread_parent) if isinstance(thread_parent, str) else None
            agent = Agent(chemin, thread_id, parent, mission_depuis_chemin(chemin), self._horloge())
            self.agents[chemin] = agent
            self._par_thread[thread_id] = chemin
            evenements.nouveaux.append(thread_id)
            self._etape(evenements, agent, "lance")
        if genre == "interrupted" and agent.etat != "termine":
            agent.etat, agent.fin, agent.outil, agent.activite = "interrompu", self._horloge(), None, "Interrompu"
            self._etape(evenements, agent, "interrompu")

    def _debut_item(self, agent: Agent, item: dict) -> None:
        type_ = item.get("type")
        if agent.etat in ("termine", "echec", "interrompu"):
            return
        outil, activite = None, None
        match type_:
            case "reasoning":
                activite = "Réfléchit"
            case "agentMessage":
                activite = "Rédige sa réponse" if item.get("phase") == "final_answer" else "Écrit"
            case "commandExecution":
                outil, activite = "Commande", _commande(item)
            case "mcpToolCall":
                outil = f"{item.get('server', '?')}.{item.get('tool', '?')}"
                activite = outil
            case "webSearch":
                outil, activite = "Recherche web", str(item.get("query") or "")
            case "fileChange":
                chemins = [c.get("path", "?") for c in item.get("changes", []) if isinstance(c, dict)]
                outil, activite = "Fichiers", ", ".join(chemins)
            case "collabAgentToolCall":
                if item.get("tool") == "wait":
                    agent.etat, agent.outil, agent.activite = "attend", None, "Attend ses sous-agents"
                    return
                outil = activite = f"Multi-agents : {item.get('tool', '?')}"
            case "subAgentActivity":
                return
            case _:
                outil = activite = str(type_)
        agent.etat = "actif"
        agent.outil = outil
        agent.activite = _court(activite or "", LONGUEUR_MAX_ACTIVITE)
        if outil is not None:
            agent.nb_outils += 1

    def _fin_item(self, agent: Agent, item: dict) -> None:
        type_ = item.get("type")
        if type_ == "agentMessage" and item.get("phase") == "final_answer" and str(item.get("text", "")).strip():
            agent.resultat = _court(str(item["text"]), LONGUEUR_MAX_RESULTAT)
            if agent.chemin == RACINE:
                self.derniere_reponse = str(item["text"])[:LONGUEUR_MAX_REPONSE]
        if agent.etat in ("termine", "echec", "interrompu"):
            return
        if type_ == "collabAgentToolCall" and item.get("tool") == "wait":
            agent.etat, agent.activite = "actif", "Réfléchit"
        agent.outil = None
