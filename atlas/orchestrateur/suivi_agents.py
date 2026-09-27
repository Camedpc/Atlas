"""Arbre des agents d'un tour (orchestrateur et sous-agents), tenu à jour depuis les notifications Codex.

Codex n'envoie au flux du tour que les événements du thread principal ; ceux des sous-agents (multi-agents v2)
arrivent sur la même connexion avec leur `threadId`. `agent.tour` les intercepte tous et les passe ici.
Un agent est repéré par son chemin Codex (`/root`, `/root/hydrures`, `/root/hydrures/biblio`…).

Pas d'I/O : `recevoir` renvoie ce qu'il faut enregistrer (items terminés des sous-agents) ou enrichir
(rôle, surnom et modèle d'un nouveau sous-agent, lus par `thread/read`).

Le processus Codex restant ouvert entre les tours, les sous-agents continuent de travailler (et de notifier)
après la fin du tour de l'orchestrateur : l'arbre vit tant que le thread est chargé. `brouillons` garde le texte
qu'un agent est en train d'écrire (deltas), pour l'afficher avant la fin du message.

Le vérificateur (outil `verifier` du serveur MCP `verificateur`) n'est pas un sous-agent Codex : ses juges sont des
threads éphémères d'un autre processus, qui raconte son avancement par `verification`. Il apparaît sous l'agent qui
l'a appelé (`<appelant>/verification`), avec un nœud par démonstration jugée et, dessous, le recours s'il rejuge.
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
        "item/reasoning/summaryTextDelta",
        "turn/started",
        "turn/completed",
        "thread/tokenUsage/updated",
    }
)

ETATS_FINIS = ("termine", "echec", "interrompu")

LONGUEUR_MAX_ACTIVITE = 200
LONGUEUR_MAX_RESULTAT = 600
LONGUEUR_MAX_REPONSE = 4000

ROLE_VERIFICATEUR = "verificateur"
ROLE_RECOURS = "recours"
OUTIL_VERIFIER = "verificateur.verifier"


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
    depuis: float | None = None
    """Début de l'étape en cours (réflexion, outil, message) : « depuis 6 min », comme le minuteur de la CLI."""
    tokens_debut: int = 0
    """Jetons du thread au début de l'exécution en cours : `tokens`, `nb_outils` et `debut` valent pour elle seule
    (un sous-agent relancé repart de zéro, comme dans Claude Code)."""
    titre: str | None = None
    """Nom affiché à la place de celui tiré du chemin (démonstration jugée : « Lemme 7 · récurrence »)."""
    verdict: dict[str, Any] | None = None
    """Verdict d'un juge du vérificateur : validite, confiance."""


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
class Verification:
    """Un appel de l'outil `verifier` : son nœud dans l'arbre et ceux de ses démonstrations."""

    chemin: str
    appelant: str
    total: int
    demonstrations: dict[str, str] = field(default_factory=dict)
    """Clé de la démonstration → chemin de son nœud."""
    verdicts: dict[str, str] = field(default_factory=dict)
    """Clé → verdict qui fait foi (« valide », « invalide » ou « erreur »)."""
    close: bool = False


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
        # Chemin -> texte du message que l'agent est en train d'écrire.
        self.brouillons: dict[str, str] = {}
        # Chemin -> ((item, partie), texte) du titre de réflexion en cours de réception.
        self._titres: dict[str, tuple[Any, str]] = {}
        # Appel de `verifier` (id tiré par son serveur MCP) -> sa vérification.
        self._verifications: dict[str, Verification] = {}

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
                agent.depuis = maintenant
                agent.tour = (params.get("turn") or {}).get("id") or agent.tour
            case "turn/completed":
                statut = (params.get("turn") or {}).get("status")
                deja_fini = agent.etat in ("termine", "echec", "interrompu")
                agent.etat = {"completed": "termine", "interrupted": "interrompu"}.get(statut, "echec")
                agent.fin, agent.outil, agent.tour, agent.depuis = maintenant, None, None, None
                agent.activite = {"termine": "Terminé", "interrompu": "Interrompu"}.get(agent.etat, "Échec")
                if not deja_fini:
                    self._etape(evenements, agent, agent.etat)
                self.brouillons.pop(agent.chemin, None)
            case "item/reasoning/summaryTextDelta":
                # Titre de la réflexion en cours, reconstitué au fil des deltas.
                delta = params.get("delta")
                if isinstance(delta, str) and agent.etat not in ETATS_FINIS:
                    cle = (params.get("itemId"), params.get("summaryIndex"))
                    precedent = self._titres.get(agent.chemin)
                    texte = (precedent[1] if precedent and precedent[0] == cle else "") + delta
                    self._titres[agent.chemin] = (cle, texte)
                    titre = texte.strip().strip("*").strip()
                    if titre:
                        agent.activite = _court(titre, LONGUEUR_MAX_ACTIVITE)
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
                if item.get("type") == "mcpToolCall" and _outil(item) == OUTIL_VERIFIER:
                    self._clore_verifications(agent.chemin)
                fini_avant = agent.etat in ETATS_FINIS
                self._fin_item(agent, item)
                if item.get("type") == "agentMessage":
                    self.brouillons.pop(agent.chemin, None)
                if agent.chemin != RACINE and item.get("type") != "userMessage":
                    evenements.a_enregistrer.append((agent.chemin, item))
                elif agent.chemin == RACINE and fini_avant and item.get("type") == "subAgentActivity":
                    # Hors tour, personne d'autre n'enregistre le fil de l'orchestrateur (« X a terminé »).
                    evenements.a_enregistrer.append((RACINE, item))
        return evenements

    # ── vérificateur ──

    def verification(self, evenement: dict[str, Any]) -> list[tuple[str, str]]:
        """Avancement d'un appel de `verifier`, raconté par son serveur MCP (`appel` : id de l'appel) :

        - `debut` (`total`) : le nœud du vérificateur apparaît sous l'agent qui a appelé l'outil ;
        - `juge` (`cle`, `titre`, `etape` = juge ou recours, `modele`) : un juge commence ;
        - `verdict` (`cle`, `etape`, `modele`, `validite`, `confiance`, `justification`, `final`) : il a jugé ;
        - `erreur` (`cle`, `message`) : la démonstration n'a pas pu être jugée ;
        - `fin`.

        Renvoie les messages à enregistrer, (chemin, texte) : chaque verdict dans le fil de son juge, et celui qui
        fait foi aussi dans le fil du vérificateur."""
        appel = str(evenement.get("appel") or "")
        genre = evenement.get("type")
        maintenant = self._horloge()
        if genre == "debut":
            if appel not in self._verifications:
                self._ouvrir_verification(appel, int(evenement.get("total") or 0))
            return []
        v = self._verifications.get(appel)
        if v is None or v.close:
            return []
        messages: list[tuple[str, str]] = []
        cle = str(evenement.get("cle") or "")
        juge = self.agents.get(v.demonstrations.get(cle, ""))
        recours = self.agents.get(f"{juge.chemin}/recours") if juge else None
        match genre:
            case "juge" if evenement.get("etape") == "recours":
                if juge is not None:
                    recours = Agent(
                        f"{juge.chemin}/recours", f"{juge.thread_id}:recours", juge.chemin, ROLE_RECOURS,
                        maintenant, modele=evenement.get("modele"), titre=juge.titre, outil="Recours",
                        activite="Rejuge", depuis=maintenant,
                    )
                    self.agents[recours.chemin] = recours
            case "juge" if juge is None:
                chemin = f"{v.chemin}/{len(v.demonstrations) + 1}"
                v.demonstrations[cle] = chemin
                self.agents[chemin] = Agent(
                    chemin, f"verification:{appel}:{cle}", v.chemin, ROLE_VERIFICATEUR, maintenant,
                    modele=evenement.get("modele"), titre=str(evenement.get("titre") or cle), outil="Juge",
                    activite="Juge", depuis=maintenant,
                )
            case "verdict":
                cible = recours if evenement.get("etape") == "recours" else juge
                if cible is None:
                    return []
                validite = "invalide" if evenement.get("validite") == "invalide" else "valide"
                confiance = float(evenement.get("confiance") or 0)
                justification = str(evenement.get("justification") or "").strip()
                cible.verdict = {"validite": validite, "confiance": confiance}
                cible.etat, cible.fin, cible.outil, cible.depuis = "termine", maintenant, None, None
                cible.activite = f"{validite.capitalize()} · confiance {_virgule(confiance)}"
                cible.resultat = _court(justification, LONGUEUR_MAX_RESULTAT) or cible.activite
                modele = evenement.get("modele") or cible.modele or "?"
                texte = (
                    f"**{cible.titre}** : {validite}, confiance {_virgule(confiance)} "
                    f"({modele}{', recours' if cible is recours else ''})"
                    + (f"\n\n{justification}" if justification else "")
                )
                messages.append((cible.chemin, texte))
                if evenement.get("final", True):
                    v.verdicts[cle] = validite
                    messages.append((v.chemin, texte))
            case "erreur":
                message = str(evenement.get("message") or "erreur inconnue")
                for a in (recours, juge):
                    if a is not None and a.etat not in ETATS_FINIS:
                        a.etat, a.fin, a.outil, a.depuis, a.activite = "echec", maintenant, None, None, "Échec"
                        a.resultat = _court(message, LONGUEUR_MAX_RESULTAT)
                v.verdicts[cle] = "erreur"
                texte = f"**{juge.titre if juge else cle}** : non jugée ({message})"
                messages += [(c, texte) for c in ([juge.chemin] if juge else []) + [v.chemin]]
            case "fin":
                self._clore_verification(v, "termine")
        self._resumer(v)
        return messages

    def _ouvrir_verification(self, appel: str, total: int) -> None:
        # L'agent en train d'appeler `verifier` (le plus récent s'ils sont plusieurs), sinon l'orchestrateur.
        appelants = [a for a in self.agents.values() if a.outil == OUTIL_VERIFIER and a.etat not in ETATS_FINIS]
        appelant = max(appelants, key=lambda a: a.depuis or 0).chemin if appelants else RACINE
        chemin, k = f"{appelant}/verification", 2
        while chemin in self.agents:
            chemin, k = f"{appelant}/verification_{k}", k + 1
        maintenant = self._horloge()
        self.agents[chemin] = Agent(
            chemin, f"verification:{appel}", appelant, ROLE_VERIFICATEUR, maintenant, outil="Vérification",
            depuis=maintenant,
        )
        self._verifications[appel] = v = Verification(chemin, appelant, total)
        self._resumer(v)

    def _resumer(self, v: Verification) -> None:
        """Décompte du nœud du vérificateur : « 7/12 jugées · 5 valides · 2 invalides »."""
        agent = self.agents[v.chemin]
        jugees = list(v.verdicts.values())
        morceaux = [f"{len(jugees)}/{v.total} jugée{'s' if len(jugees) > 1 else ''}"]
        for verdict in ("valide", "invalide", "erreur"):
            if n := jugees.count(verdict):
                morceaux.append(f"{n} {verdict}{'s' if n > 1 else ''}")
        agent.titre = f"{v.total} démonstration{'s' if v.total > 1 else ''}"
        if v.close:
            agent.resultat = " · ".join(morceaux)
        else:
            agent.activite = " · ".join(morceaux)

    def _clore_verification(self, v: Verification, etat: EtatAgent) -> None:
        maintenant = self._horloge()
        v.close = True
        for juge in v.demonstrations.values():
            for chemin in (f"{juge}/recours", juge):
                a = self.agents.get(chemin)
                if a is not None and a.etat not in ETATS_FINIS:
                    a.etat, a.fin, a.outil, a.depuis, a.activite = "interrompu", maintenant, None, None, "Interrompu"
        a = self.agents[v.chemin]
        if a.etat not in ETATS_FINIS:
            a.etat, a.fin, a.outil, a.depuis = etat, maintenant, None, None
            a.activite = {"termine": "Terminé", "interrompu": "Interrompu"}.get(etat, "Échec")
        self._resumer(v)

    def _clore_verifications(self, appelant: str) -> None:
        """L'appel de `verifier` est fini : ce qui n'a pas été raconté ne le sera plus (serveur MCP tombé, délai)."""
        for v in self._verifications.values():
            if v.appelant == appelant and not v.close:
                self._clore_verification(v, "termine" if len(v.verdicts) >= v.total else "echec")

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
                outil = activite = _outil(item)
            case "webSearch":
                outil, activite = "Recherche web", str(item.get("query") or "")
            case "fileChange":
                chemins = [c.get("path", "?") for c in item.get("changes", []) if isinstance(c, dict)]
                outil, activite = "Fichiers", ", ".join(chemins)
            case "collabAgentToolCall":
                if item.get("tool") == "wait":
                    agent.etat, agent.outil, agent.activite = "attend", None, "Attend ses sous-agents"
                    agent.depuis = self._horloge()
                    return
                outil = activite = f"Multi-agents : {item.get('tool', '?')}"
            case "subAgentActivity":
                return
            case _:
                outil = activite = str(type_)
        agent.etat = "actif"
        agent.depuis = self._horloge()
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


def _virgule(confiance: float) -> str:
    return f"{confiance:.2f}".replace(".", ",")


def _outil(item: dict) -> str:
    return f"{item.get('server', '?')}.{item.get('tool', '?')}"


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
