"""Arbre des agents d'un tour (orchestrateur et sous-agents), tenu à jour depuis les notifications Codex.

Codex n'envoie au flux du tour que les événements du thread principal ; ceux des sous-agents (multi-agents v2)
arrivent sur la même connexion avec leur `threadId`. `agent.tour` les intercepte tous et les passe ici.
Un agent est repéré par son chemin Codex (`/root`, `/root/hydrures`, `/root/hydrures/biblio`…).

Pas d'I/O : `recevoir` renvoie ce qu'il faut enregistrer (items terminés des sous-agents) ou enrichir
(rôle, surnom et modèle d'un nouveau sous-agent, lus par `thread/read`).

Le processus Codex restant ouvert entre les tours, les sous-agents continuent de travailler (et de notifier)
après la fin du tour de l'orchestrateur : l'arbre vit tant que le thread est chargé. `brouillons` garde le texte
qu'un agent est en train d'écrire (deltas), pour l'afficher avant la fin du message.
"""

import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

RACINE = "/root"

EtatAgent = Literal["actif", "attend", "termine", "echec", "interrompu"]

# Notifications utiles au suivi : le reste (deltas de texte, quotas…) est ignoré dès le fil de lecture.
METHODES_SUIVIES = frozenset(
    {
        "item/started",
        "item/completed",
        "item/agentMessage/delta",
        "turn/started",
        "turn/completed",
        "thread/tokenUsage/updated",
    }
)

ETATS_FINIS = ("termine", "echec", "interrompu")

LONGUEUR_MAX_ACTIVITE = 200
LONGUEUR_MAX_RESULTAT = 600


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
    tour: str | None = None
    """Tour Codex en cours de l'agent (pour l'interrompre), None s'il ne travaille pas."""
    tokens_debut: int = 0
    """Jetons du thread au début de l'exécution en cours : `tokens`, `nb_outils` et `debut` valent pour elle seule
    (un sous-agent relancé repart de zéro, comme dans Claude Code)."""


@dataclass
class Evenements:
    """Ce que le tour doit faire après une notification."""

    a_enregistrer: list[tuple[str, Any]] = field(default_factory=list)
    """(chemin, item) : items terminés d'un sous-agent, à enregistrer dans sa conversation."""
    nouveaux: list[str] = field(default_factory=list)
    """Threads de sous-agents apparus, dont lire le rôle, le surnom et le modèle."""


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
        # Chemin -> texte du message que l'agent est en train d'écrire.
        self.brouillons: dict[str, str] = {}

    @classmethod
    def depuis(cls, instantane: list[dict[str, Any]] | None, horloge: Callable[[], float] = time.time) -> "SuiviAgents":
        """Reprend l'arbre laissé par un tour d'un processus Codex précédent : on peut encore écrire à ses
        sous-agents, mais aucun ne travaille plus (le processus qui les faisait tourner est fermé)."""
        suivi = cls(horloge)
        for agent in agents_figes(instantane):
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

    def au_travail(self, *, sous_agents_seuls: bool = False) -> list[Agent]:
        """Agents qui travaillent (ou attendent les leurs), l'orchestrateur compris sauf `sous_agents_seuls`."""
        return [
            a
            for a in self.agents.values()
            if a.etat in ("actif", "attend") and not (sous_agents_seuls and a.chemin == RACINE)
        ]

    def bilan(self, item: Any) -> dict[str, Any] | None:
        """Mesures de l'exécution d'un sous-agent, à joindre à l'événement « a terminé » du fil (figées là, alors
        que l'arbre, lui, suit l'agent s'il est relancé)."""
        element = item if isinstance(item, dict) else getattr(item, "root", item)
        if not isinstance(element, dict):
            element = element.model_dump(mode="json", by_alias=True, exclude_none=True)
        if element.get("type") != "subAgentActivity" or element.get("kind") not in ("completed", "interrupted"):
            return None
        agent = self.agents.get(element.get("agentPath"))
        if agent is None:
            return None
        duree = (agent.fin or self._horloge()) - agent.debut
        return {"nb_outils": agent.nb_outils, "tokens": agent.tokens, "duree": round(duree, 1)}

    def possede(self, thread_id: Any) -> bool:
        return isinstance(thread_id, str) and thread_id in self._par_thread

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
                if agent.fin is not None and agent.chemin != RACINE:
                    # Relancé après avoir fini : nouvelle exécution, nouveaux compteurs.
                    agent.debut, agent.nb_outils = maintenant, 0
                    agent.tokens_debut += agent.tokens
                    agent.tokens = 0
                agent.etat, agent.fin, agent.outil, agent.activite = "actif", None, None, "Réfléchit"
                agent.tour = (params.get("turn") or {}).get("id") or agent.tour
            case "turn/completed":
                statut = (params.get("turn") or {}).get("status")
                agent.etat = {"completed": "termine", "interrupted": "interrompu"}.get(statut, "echec")
                agent.fin, agent.outil, agent.tour = maintenant, None, None
                agent.activite = {"termine": "Terminé", "interrompu": "Interrompu"}.get(agent.etat, "Échec")
                self.brouillons.pop(agent.chemin, None)
            case "item/agentMessage/delta":
                delta = params.get("delta")
                if isinstance(delta, str):
                    self.brouillons[agent.chemin] = self.brouillons.get(agent.chemin, "") + delta
            case "thread/tokenUsage/updated":
                total = ((params.get("tokenUsage") or {}).get("total") or {}).get("totalTokens")
                if isinstance(total, int):
                    agent.tokens = max(0, total - agent.tokens_debut)
            case "item/started" if item is not None:
                self._debut_item(agent, item)
            case "item/completed" if item is not None:
                fini_avant = agent.etat in ETATS_FINIS
                self._fin_item(agent, item)
                if item.get("type") == "agentMessage":
                    self.brouillons.pop(agent.chemin, None)
                if agent.chemin != RACINE and item.get("type") not in ("userMessage", "reasoning"):
                    evenements.a_enregistrer.append((agent.chemin, item))
                elif agent.chemin == RACINE and fini_avant and item.get("type") == "subAgentActivity":
                    # Hors tour, personne d'autre n'enregistre le fil de l'orchestrateur (« X a terminé »).
                    evenements.a_enregistrer.append((RACINE, item))
        return evenements

    # ── interne ──

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
        if genre == "interrupted" and agent.etat != "termine":
            agent.etat, agent.fin, agent.outil, agent.activite = "interrompu", self._horloge(), None, "Interrompu"

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
        if agent.etat in ("termine", "echec", "interrompu"):
            return
        if type_ == "collabAgentToolCall" and item.get("tool") == "wait":
            agent.etat, agent.activite = "actif", "Réfléchit"
        agent.outil = None


def agents_figes(instantane: list[dict[str, Any]] | None) -> list[Agent]:
    """Agents d'un arbre enregistré, ceux restés au travail passant à « interrompu » : leur processus est fermé."""
    agents = []
    for ligne in instantane or []:
        try:
            agent = Agent(**ligne)
        except TypeError:
            continue
        if agent.etat in ("actif", "attend"):
            agent.etat, agent.outil, agent.tour, agent.activite = "interrompu", None, None, "Interrompu"
        agents.append(agent)
    return agents
