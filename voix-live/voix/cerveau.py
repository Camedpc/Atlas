"""Le cerveau de l'agent vocal : un thread Codex (modèle rapide) par session, plus des tâches de fond.

Le thread vocal a le terminal et le serveur MCP `taches` (voix/mcp_taches.py) ; chaque tâche lancée par
`lancer_tache` est un autre thread Codex, sur un modèle plus fort, dans le même processus Codex, qui tourne sans
bloquer la conversation. Connexion : celle du CODEX_HOME d'Atlas (compte ChatGPT de Camille).
"""

import asyncio
import itertools
import logging
import sys
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from openai_codex import ApprovalMode, AsyncCodex, AsyncThread, AsyncTurnHandle, CodexConfig, Sandbox
from openai_codex.models import (
    AgentMessageDeltaNotification,
    ItemCompletedNotification,
    ItemStartedNotification,
    TurnCompletedNotification,
)
from openai_codex.types import ReasoningEffort

from . import config

log = logging.getLogger(__name__)

PROMPTS = config.RACINE / "voix" / "prompts"


def _consigne(nom: str) -> str:
    return (PROMPTS / f"{nom}.md").read_text(encoding="utf-8")


def _en_dict(item: Any) -> dict[str, Any]:
    element = getattr(item, "root", item)
    if isinstance(element, dict):
        return element
    return element.model_dump(mode="json", by_alias=True, exclude_none=True)


def decrire_outil(element: dict[str, Any]) -> str | None:
    """Une ligne lisible pour un item d'outil ; None pour les messages et le raisonnement."""
    match element.get("type"):
        case "commandExecution":
            actions = element.get("commandActions") or []
            if actions and isinstance(actions[0], dict) and actions[0].get("command"):
                return str(actions[0]["command"])
            return str(element.get("command", "commande"))
        case "mcpToolCall":
            return f"{element.get('server', '?')}.{element.get('tool', '?')}"
        case "webSearch":
            return f"recherche web : {element.get('query', '')}".strip()
        case "fileChange":
            chemins = [c.get("path", "?") for c in element.get("changes", []) if isinstance(c, dict)]
            return "modifie " + ", ".join(chemins) if chemins else "modification de fichiers"
        case "collabAgentToolCall":
            return f"multi-agents : {element.get('tool', '?')}"
        case "agentMessage" | "userMessage" | "reasoning" | None:
            return None
        case autre:
            return str(autre)


@dataclass
class Evenement:
    """Ce que produit un tour du thread vocal, dans l'ordre."""

    type: str  # texte | fin_message | outil_debut | outil_fin | fin_tour
    id: str = ""
    texte: str = ""
    ok: bool = True


class Cerveau:
    def __init__(self, session_id: str, url_serveur: str):
        self.session_id = session_id
        self.url_serveur = url_serveur
        self._codex: AsyncCodex | None = None
        self._thread: AsyncThread | None = None
        self.tour_courant: AsyncTurnHandle | None = None
        self.outils_en_cours: set[str] = set()
        self.modele = config.MODELE
        self.effort = config.EFFORT

    def _config_codex(self) -> CodexConfig:
        config.CODEX_HOME.mkdir(parents=True, exist_ok=True)
        return CodexConfig(env={"CODEX_HOME": str(config.CODEX_HOME)})

    def surcharges(self) -> dict[str, Any]:
        return {
            "project_root_markers": [],
            "features": {"hooks": False},
            "web_search": "live",
            "mcp_servers": {
                "taches": {
                    "command": sys.executable,
                    "args": ["-m", "voix.mcp_taches"],
                    "cwd": str(config.RACINE),
                    "env": {"VOIX_SESSION": self.session_id, "VOIX_URL": self.url_serveur},
                }
            },
        }

    async def demarrer(self) -> None:
        self._codex = AsyncCodex(config=self._config_codex())
        await self._codex.__aenter__()
        compte = await self._codex.account()
        if compte.account is None and compte.requires_openai_auth:
            raise RuntimeError(
                "Codex n'est pas connecté : lancer `python -m atlas.orchestrateur.connexion` depuis la racine d'Atlas."
            )
        self._thread = await self._codex.thread_start(
            approval_mode=ApprovalMode.deny_all,
            sandbox=Sandbox.full_access,
            cwd=str(config.DOSSIER_TRAVAIL),
            model=self.modele,
            developer_instructions=_consigne("agent_vocal"),
            config=self.surcharges(),
        )

    async def fermer(self) -> None:
        if self._codex is not None:
            await self._codex.__aexit__(None, None, None)
            self._codex = None

    @property
    def codex(self) -> AsyncCodex:
        assert self._codex is not None
        return self._codex

    @property
    def occupe(self) -> bool:
        return self.tour_courant is not None

    @property
    def outil_actif(self) -> bool:
        return bool(self.outils_en_cours)

    async def tour(self, texte: str) -> AsyncIterator[Evenement]:
        assert self._thread is not None
        self.outils_en_cours.clear()
        handle = await self._thread.turn(
            texte, effort=ReasoningEffort(self.effort), model=self.modele, service_tier=config.TIER or None
        )
        self.tour_courant = handle
        statut = "erreur"
        try:
            async for notification in handle.stream():
                charge = notification.payload
                if isinstance(charge, AgentMessageDeltaNotification):
                    yield Evenement("texte", charge.item_id, charge.delta)
                elif isinstance(charge, ItemStartedNotification):
                    element = _en_dict(charge.item)
                    description = decrire_outil(element)
                    if description:
                        self.outils_en_cours.add(element.get("id", ""))
                        yield Evenement("outil_debut", element.get("id", ""), description)
                elif isinstance(charge, ItemCompletedNotification):
                    element = _en_dict(charge.item)
                    if element.get("type") == "agentMessage":
                        yield Evenement("fin_message", element.get("id", ""), str(element.get("text") or ""))
                    elif description := decrire_outil(element):
                        self.outils_en_cours.discard(element.get("id", ""))
                        ok = element.get("status") in (None, "completed") and element.get("exitCode") in (None, 0)
                        yield Evenement("outil_fin", element.get("id", ""), description, ok)
                elif isinstance(charge, TurnCompletedNotification):
                    statut = charge.turn.status.value
                    break
        finally:
            self.tour_courant = None
            self.outils_en_cours.clear()
        yield Evenement("fin_tour", texte=statut)

    async def interrompre(self) -> None:
        if self.tour_courant is not None:
            try:
                await self.tour_courant.interrupt()
            except Exception:
                log.debug("interruption ignorée", exc_info=True)

    async def orienter(self, texte: str) -> bool:
        """Injecte un message dans le tour en cours (Camille parle pendant que l'agent travaille)."""
        if self.tour_courant is None:
            return False
        try:
            await self.tour_courant.steer(texte)
            return True
        except Exception:
            log.debug("orientation refusée", exc_info=True)
            return False


# ---------- Tâches de fond ----------


@dataclass
class Tache:
    id: int
    titre: str
    consigne: str
    statut: str = "en_cours"  # en_cours | terminee | erreur | arretee
    resultat: str = ""
    etapes: list[str] = field(default_factory=list)
    debut: float = field(default_factory=time.time)
    fin: float | None = None
    handle: AsyncTurnHandle | None = None

    def resume(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "titre": self.titre,
            "statut": self.statut,
            "consigne": self.consigne,
            "etapes": self.etapes[-8:],
            "resultat": self.resultat[:4000],
            "duree_s": round((self.fin or time.time()) - self.debut),
        }


class Taches:
    """Tâches de fond d'une session : chacune est un thread Codex sur le modèle de travail."""

    def __init__(self, cerveau: Cerveau, sur_changement: Callable[[Tache], Awaitable[None]]):
        self.cerveau = cerveau
        self.sur_changement = sur_changement
        self.liste: dict[int, Tache] = {}
        self._compteur = itertools.count(1)
        self._taches_asyncio: set[asyncio.Task[None]] = set()

    def lancer(self, titre: str, consigne: str) -> Tache:
        tache = Tache(next(self._compteur), titre or consigne[:60], consigne)
        self.liste[tache.id] = tache
        t = asyncio.create_task(self._executer(tache))
        self._taches_asyncio.add(t)
        t.add_done_callback(self._taches_asyncio.discard)
        return tache

    async def _executer(self, tache: Tache) -> None:
        await self.sur_changement(tache)
        try:
            thread = await self.cerveau.codex.thread_start(
                approval_mode=ApprovalMode.deny_all,
                sandbox=Sandbox.full_access,
                cwd=str(config.DOSSIER_TRAVAIL),
                model=config.MODELE_TACHES,
                developer_instructions=_consigne("tache"),
                config={"project_root_markers": [], "features": {"hooks": False}, "web_search": "live"},
            )
            tache.handle = await thread.turn(tache.consigne, effort=ReasoningEffort(config.EFFORT_TACHES))
            dernier_message = ""
            statut = "erreur"
            async for notification in tache.handle.stream():
                charge = notification.payload
                if isinstance(charge, ItemStartedNotification):
                    if description := decrire_outil(_en_dict(charge.item)):
                        tache.etapes.append(description)
                        await self.sur_changement(tache)
                elif isinstance(charge, ItemCompletedNotification):
                    element = _en_dict(charge.item)
                    if element.get("type") == "agentMessage" and element.get("text"):
                        dernier_message = str(element["text"])
                elif isinstance(charge, TurnCompletedNotification):
                    statut = charge.turn.status.value
                    break
            tache.resultat = dernier_message
            tache.statut = {"completed": "terminee", "interrupted": "arretee"}.get(statut, "erreur")
        except Exception as erreur:
            log.exception("tâche %s", tache.id)
            tache.statut = "erreur"
            tache.resultat = str(erreur)
        tache.fin = time.time()
        tache.handle = None
        await self.sur_changement(tache)

    async def arreter(self, id_: int) -> bool:
        tache = self.liste.get(id_)
        if tache is None or tache.handle is None:
            return False
        await tache.handle.interrupt()
        return True

    async def orienter(self, id_: int, message: str) -> bool:
        tache = self.liste.get(id_)
        if tache is None or tache.handle is None:
            return False
        await tache.handle.steer(message)
        tache.etapes.append(f"consigne : {message}")
        await self.sur_changement(tache)
        return True

    def etat(self) -> list[dict[str, Any]]:
        return [t.resume() for t in self.liste.values()]
