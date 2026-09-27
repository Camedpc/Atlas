"""Le cerveau d'Atlas voix : un thread Codex éphémère par appel (modèle rapide), et ses petites tâches de fond.

Même connexion Codex que l'orchestrateur (son CODEX_HOME), même bunker de session. Le thread a le terminal, le
serveur MCP `atlas` (lecture du graphe) et le serveur MCP `voix` (atlas/voix/mcp_voix.py), qui rappelle
atlas.serveur pour confier du travail à l'orchestrateur ou lancer une petite tâche.
"""

import asyncio
import itertools
import logging
import re
import sys
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from openai_codex import ApprovalMode, AsyncCodex, AsyncThread, AsyncTurnHandle, Sandbox
from openai_codex.models import (
    AgentMessageDeltaNotification,
    ItemCompletedNotification,
    ItemStartedNotification,
    ThreadTokenUsageUpdatedNotification,
    TurnCompletedNotification,
)
from openai_codex.types import ReasoningEffort

from ..orchestrateur import agent as orchestrateur
from ..orchestrateur import bunker
from ..orchestrateur import config as config_orchestrateur
from ..orchestrateur.consignes import consigne_complete
from . import config
from .contexte import VOIX

log = logging.getLogger(__name__)


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
    element: dict[str, Any] | None = None


def serveur_atlas(conversation_id: str, session: Path, projet_id: str | None) -> dict[str, Any]:
    """Le serveur MCP `atlas` (lecture du graphe) pour le thread de l'appel."""
    graphe = {"ATLAS_PROJET_ID": projet_id} if projet_id else {}
    return {
        "command": sys.executable,
        "args": ["-m", "atlas.orchestrateur.mcp_atlas"],
        "cwd": str(config_orchestrateur.RACINE),
        "env_vars": ["SUPABASE_URL", "SUPABASE_SECRET_KEY"],
        "env": {"ATLAS_CONVERSATION_ID": conversation_id, "ATLAS_DOSSIER_SESSION": str(session), **graphe},
        # Sous un profil de permissions (ATLAS_BUNKER=1), Codex demanderait une approbation que personne ne peut
        # donner (approval never) : les outils de ces serveurs sont approuvés d'office.
        "default_tools_approval_mode": "approve",
    }


def surcharges(conversation_id: str, appel_id: str, session: Path, projet_id: str | None) -> dict[str, Any]:
    reglages: dict[str, Any] = {
        "web_search": "live",
        "project_root_markers": [],
        "features": {"hooks": False},
        "mcp_servers": {
            "atlas": serveur_atlas(conversation_id, session, projet_id),
            "voix": {
                "command": sys.executable,
                "args": ["-m", "atlas.voix.mcp_voix"],
                "cwd": str(config_orchestrateur.RACINE),
                "env_vars": ["ATLAS_JETON_ACCES"],
                "env": {"ATLAS_APPEL": appel_id, "ATLAS_URL_INTERNE": config.URL_INTERNE},
                "default_tools_approval_mode": "approve",
            },
        },
        "shell_environment_policy": bunker.environnement_shell(session),
    }
    if config_orchestrateur.BUNKER:
        reglages |= bunker.permissions_session(session)
    return reglages


def parametres(session: Path, modele: str, instructions: str, surcharges_: dict[str, Any]) -> dict[str, Any]:
    p: dict[str, Any] = {
        "approval_mode": ApprovalMode.deny_all,
        "cwd": str(session),
        "model": modele,
        "developer_instructions": instructions,
        "config": surcharges_,
        "ephemeral": True,
    }
    if not config_orchestrateur.BUNKER:
        p["sandbox"] = Sandbox.full_access
    return p


class Cerveau:
    def __init__(self, conversation_id: str, appel_id: str, session: Path, projet_id: str | None):
        self.conversation_id = conversation_id
        self.appel_id = appel_id
        self.session = session
        self.projet_id = projet_id
        self._codex: AsyncCodex | None = None
        self._thread: AsyncThread | None = None
        self.tour_courant: AsyncTurnHandle | None = None
        self.outils_en_cours: set[str] = set()
        self.modele = config.MODELE
        self.effort = config.EFFORT
        self.tokens = 0

    async def demarrer(self) -> None:
        self._codex = AsyncCodex(config=orchestrateur.config_codex())
        await self._codex.__aenter__()
        await orchestrateur._connecter(self._codex)
        self._thread = await self._codex.thread_start(
            **parametres(
                self.session,
                self.modele,
                consigne_complete("voix"),
                surcharges(self.conversation_id, self.appel_id, self.session, self.projet_id),
            )
        )

    @property
    def thread_id(self) -> str:
        return self._thread.id if self._thread is not None else ""

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
                    if description := decrire_outil(element):
                        self.outils_en_cours.add(element.get("id", ""))
                        yield Evenement("outil_debut", element.get("id", ""), description)
                elif isinstance(charge, ItemCompletedNotification):
                    element = _en_dict(charge.item)
                    if element.get("type") == "agentMessage":
                        yield Evenement("fin_message", element.get("id", ""), str(element.get("text") or ""))
                    elif description := decrire_outil(element):
                        self.outils_en_cours.discard(element.get("id", ""))
                        ok = element.get("status") in (None, "completed") and element.get("exitCode") in (None, 0)
                        yield Evenement("outil_fin", element.get("id", ""), description, ok, element)
                elif isinstance(charge, ThreadTokenUsageUpdatedNotification):
                    self.tokens = charge.token_usage.total.total_tokens
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


# ── Petites tâches de fond ──


def _slug(texte: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", texte.lower()).strip("_")[:40] or "tache"


@dataclass
class Tache:
    id: int
    titre: str
    consigne: str
    chemin: str
    statut: str = "en_cours"  # en_cours | terminee | erreur | arretee
    resultat: str = ""
    etapes: list[str] = field(default_factory=list)
    debut: float = field(default_factory=time.time)
    fin: float | None = None
    thread_id: str = ""
    tokens: int = 0
    handle: AsyncTurnHandle | None = None

    def resume(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "titre": self.titre,
            "statut": self.statut,
            "etapes": self.etapes[-8:],
            "resultat": self.resultat[:3000],
            "duree_s": round((self.fin or time.time()) - self.debut),
        }


class Taches:
    """Petites tâches lancées par la voix : chacune est un thread Codex sur le modèle des tâches vocales."""

    def __init__(self, cerveau: Cerveau, sur_changement: Callable[[Tache], Awaitable[None]]):
        self.cerveau = cerveau
        self.sur_changement = sur_changement
        self.liste: dict[int, Tache] = {}
        self._compteur = itertools.count(1)
        self._en_vol: set[asyncio.Task[None]] = set()

    def lancer(self, titre: str, consigne: str) -> Tache:
        id_ = next(self._compteur)
        tache = Tache(id_, titre or consigne[:60], consigne, f"{VOIX}/{id_}_{_slug(titre or consigne)}")
        self.liste[id_] = tache
        t = asyncio.create_task(self._executer(tache))
        self._en_vol.add(t)
        t.add_done_callback(self._en_vol.discard)
        return tache

    async def _executer(self, tache: Tache) -> None:
        await self.sur_changement(tache)
        c = self.cerveau
        reglages: dict[str, Any] = {
            "project_root_markers": [],
            "features": {"hooks": False},
            "web_search": "live",
            "shell_environment_policy": bunker.environnement_shell(c.session),
        }
        if config_orchestrateur.BUNKER:
            reglages |= bunker.permissions_session(c.session)
        try:
            thread = await c.codex.thread_start(
                **parametres(c.session, config.MODELE_TACHES, consigne_complete("tache_vocale"), reglages)
            )
            tache.thread_id = thread.id
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
                elif isinstance(charge, ThreadTokenUsageUpdatedNotification):
                    tache.tokens = charge.token_usage.total.total_tokens
                elif isinstance(charge, TurnCompletedNotification):
                    statut = charge.turn.status.value
                    break
            tache.resultat = dernier_message
            tache.statut = {"completed": "terminee", "interrupted": "arretee"}.get(statut, "erreur")
        except Exception as erreur:
            log.exception("tâche vocale %s", tache.id)
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
