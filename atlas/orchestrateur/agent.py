"""Un tour de l'orchestrateur (Codex) : envoie le message et enregistre au fil de l'eau ce que fait l'agent."""

import asyncio
import logging
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from openai_codex import ApprovalMode, AsyncCodex, AsyncThread, AsyncTurnHandle, CodexConfig, Sandbox
from openai_codex.models import (
    ItemCompletedNotification,
    ThreadTokenUsageUpdatedNotification,
    TurnCompletedNotification,
)
from openai_codex.types import ReasoningEffort

from .. import conversations
from ..modeles import Conversation
from . import config
from .consignes import CONSIGNES
from .sous_agents import SOUS_AGENTS
from .traduction import traduire

log = logging.getLogger(__name__)

# Nombre de messages relus quand un thread ne peut pas être repris (ex. après passage sur une autre machine).
MESSAGES_DE_SECOURS = 20


class Arret(Exception):
    """L'arrêt a été demandé avant que le tour ne soit branché."""


@dataclass
class ResultatTour:
    statut: Literal["terminee", "erreur", "arretee"]
    erreur: str | None = None
    usage: dict[str, Any] | None = None
    """Consommation de jetons du thread Codex à la fin du tour."""


class ConnexionManquante(RuntimeError):
    pass


def config_codex() -> CodexConfig:
    """Codex isolé de la machine : son propre CODEX_HOME, donc ni ~/.codex, ni sa connexion, ni ses réglages."""
    config.CODEX_HOME.mkdir(parents=True, exist_ok=True)
    return CodexConfig(codex_bin=config.CODEX_BIN, env={"CODEX_HOME": str(config.CODEX_HOME)})


def surcharges_thread(conversation_id: str) -> dict[str, Any]:
    """Réglages Codex d'Atlas, appliqués à chaque thread."""
    surcharges: dict[str, Any] = {
        "web_search": "live",
        # Ne pas remonter jusqu'au dépôt Atlas (espace/ est dedans) chercher un .codex/ ou un AGENTS.md.
        "project_root_markers": [],
        "features": {"hooks": False},
        "mcp_servers": {
            "atlas": {
                "command": sys.executable,
                "args": ["-m", "atlas.orchestrateur.mcp_atlas"],
                "cwd": str(config.RACINE),
                # Codex ne transmet pas tout l'environnement aux serveurs MCP : on nomme ce qu'il leur faut.
                "env_vars": ["SUPABASE_URL", "SUPABASE_SECRET_KEY"],
                "env": {"ATLAS_CONVERSATION_ID": conversation_id},
            }
        },
    }
    if SOUS_AGENTS:
        surcharges["agents"] = SOUS_AGENTS
    return surcharges


def parametres_thread(dossier: Path, conversation_id: str) -> dict[str, Any]:
    return {
        # Même liberté que Codex en local : aucune restriction de fichiers, et rien à faire approuver.
        "sandbox": Sandbox.full_access,
        "approval_mode": ApprovalMode.deny_all,
        "cwd": str(dossier),
        "model": config.MODELE,
        "developer_instructions": CONSIGNES,
        "config": surcharges_thread(conversation_id),
    }


async def tour(
    conversation: Conversation,
    texte: str,
    execution_id: str,
    sur_tour: Callable[[AsyncTurnHandle], None],
) -> ResultatTour:
    """Fait travailler l'orchestrateur sur `texte` jusqu'à sa réponse finale.

    `sur_tour` reçoit le tour dès qu'il est lancé, pour pouvoir l'interrompre ; il peut lever `Arret`.
    """
    dossier = config.ESPACE_TRAVAIL / conversation.id
    dossier.mkdir(parents=True, exist_ok=True)

    async with AsyncCodex(config=config_codex()) as codex:
        await _connecter(codex)

        thread, texte = await _ouvrir_thread(codex, conversation, execution_id, texte, dossier)
        if thread.id != conversation.session_agent:
            await asyncio.to_thread(conversations.modifier_conversation, conversation.id, session_agent=thread.id)
            conversation.session_agent = thread.id

        handle = await thread.turn(texte, effort=ReasoningEffort(config.EFFORT))
        sur_tour(handle)

        usage = None
        fin = None
        async for evenement in handle.stream():
            charge = evenement.payload
            if isinstance(charge, ItemCompletedNotification):
                for ligne in traduire(charge.item):
                    await asyncio.to_thread(
                        conversations.ajouter_message,
                        conversation.id,
                        ligne.role,
                        ligne.contenu,
                        execution_id=execution_id,
                        donnees=ligne.donnees,
                    )
            elif isinstance(charge, ThreadTokenUsageUpdatedNotification):
                usage = charge.token_usage.model_dump(mode="json", by_alias=True)
            elif isinstance(charge, TurnCompletedNotification):
                fin = charge.turn

    if fin is None:
        return ResultatTour("erreur", "Le tour s'est terminé sans notification de fin.", usage)
    match fin.status.value:
        case "completed":
            return ResultatTour("terminee", usage=usage)
        case "interrupted":
            return ResultatTour("arretee", usage=usage)
        case statut:
            message = fin.error.message if fin.error is not None and fin.error.message else f"Tour {statut}."
            return ResultatTour("erreur", message, usage)


async def _connecter(codex: AsyncCodex) -> None:
    """Clé API si OPENAI_API_KEY est renseignée, sinon la connexion ChatGPT faite avec `connexion.py`.

    Renseigner la clé suffit à basculer : elle remplace une connexion ChatGPT existante au tour suivant.
    """
    reponse = await codex.account()
    type_compte = reponse.account.root.type if reponse.account is not None else None
    if config.OPENAI_API_KEY:
        if type_compte != "apiKey":
            await codex.login_api_key(config.OPENAI_API_KEY)
        return
    if type_compte is None and reponse.requires_openai_auth:
        raise ConnexionManquante(
            "Codex n'est pas connecté : lancer `python -m atlas.orchestrateur.connexion` (compte ChatGPT) "
            "ou renseigner OPENAI_API_KEY dans le .env du serveur."
        )


async def _ouvrir_thread(
    codex: AsyncCodex, conversation: Conversation, execution_id: str, texte: str, dossier: Path
) -> tuple[AsyncThread, str]:
    """Reprend le thread de la conversation, ou en ouvre un nouveau (avec l'historique si la reprise échoue)."""
    parametres = parametres_thread(dossier, conversation.id)
    if conversation.session_agent:
        try:
            return await codex.thread_resume(conversation.session_agent, **parametres), texte
        except Exception:
            log.warning("Thread %s introuvable, reprise par l'historique", conversation.session_agent, exc_info=True)
            texte = await asyncio.to_thread(_avec_historique, conversation.id, execution_id, texte)
    return await codex.thread_start(**parametres), texte


def _avec_historique(conversation_id: str, execution_id: str, texte: str) -> str:
    anciens = [
        m
        for m in conversations.lister_messages(conversation_id)
        if m.execution_id != execution_id and m.role in ("utilisateur", "assistant")
    ][-MESSAGES_DE_SECOURS:]
    if not anciens:
        return texte
    noms = {"utilisateur": "Utilisateur", "assistant": "Orchestrateur"}
    historique = "\n\n".join(f"**{noms[m.role]}** : {m.contenu}" for m in anciens)
    return (
        "La session précédente n'a pas pu être reprise. Voici la fin de la conversation :\n\n"
        f"{historique}\n\n---\n\nNouveau message :\n\n{texte}"
    )
