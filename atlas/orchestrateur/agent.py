"""Un tour de l'orchestrateur (Codex) : envoie le message et enregistre au fil de l'eau ce que fait l'agent.

Le processus Codex et les threads restent ouverts entre les tours (`codex_vivant`) : les notifications des
sous-agents, pendant et après le tour, sont suivies par le gestionnaire.
"""

import asyncio
import logging
import os
import sys
import time
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

from .. import conversations, projets
from ..modeles import Conversation
from . import bunker, config
from .codex_vivant import CodexVivant, codex_vivant
from .consignes import consigne_complete
from .sous_agents import sous_agents
from .suivi_agents import SuiviAgents
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


def config_codex(codex_home: Path | None = None) -> CodexConfig:
    """Codex isolé de la machine : son propre CODEX_HOME, donc ni ~/.codex, ni sa connexion, ni ses réglages.
    `codex_home` : celui d'une clé OpenAI fournie par l'utilisateur (codex_vivant.pour_cle) ; None : le serveur."""
    home = codex_home or config.CODEX_HOME
    home.mkdir(parents=True, exist_ok=True)
    return CodexConfig(codex_bin=config.CODEX_BIN, env={"CODEX_HOME": str(home)})


def surcharges_thread(
    conversation_id: str, projet: str | None = None, projet_id: str | None = None, codex_home: Path | None = None
) -> dict[str, Any]:
    """Réglages Codex d'Atlas, appliqués à chaque thread. `projet` est le dossier de l'espace dans le bunker,
    `projet_id` l'espace dont les serveurs MCP lisent et écrivent le graphe, `codex_home` la connexion d'une clé
    fournie par l'utilisateur (le vérificateur la reprend, pour que ses jugements soient payés par la même clé)."""
    graphe = {"ATLAS_PROJET_ID": projet_id} if projet_id else {}
    # Avec une clé de l'utilisateur, le vérificateur ne reçoit pas celle du serveur : il la préférerait sinon.
    transmises = [
        n
        for n in os.environ
        if (n.startswith(("ATLAS_", "SUPABASE_")) or (n == "OPENAI_API_KEY" and codex_home is None))
        and n != "ATLAS_CODEX_HOME"
    ]
    session = bunker.dossier_session(conversation_id, projet)
    surcharges: dict[str, Any] = {
        "web_search": "live",
        # Titres de réflexion (« Je vérifie… »), comme dans la CLI : sans ce réglage, Codex n'en envoie aucun.
        "model_reasoning_summary": "detailed",
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
                # Le dossier de la session : les images des figures y sont lues (chemins relatifs à lui).
                "env": {"ATLAS_CONVERSATION_ID": conversation_id, "ATLAS_DOSSIER_SESSION": str(session), **graphe},
                # Plusieurs agents qui démarrent ensemble lancent chacun ce serveur : 10 s par défaut ne suffisent pas.
                "startup_timeout_sec": 60,
            },
            "verificateur": {
                "command": sys.executable,
                "args": ["-m", "atlas.orchestrateur.mcp_verificateur"],
                "cwd": str(config.RACINE),
                # Il lance son propre Codex : il lui faut Supabase, la connexion et les réglages du vérificateur.
                "env_vars": transmises,
                "env": {
                    "ATLAS_CODEX_HOME": str(codex_home or config.CODEX_HOME),
                    "ATLAS_ESPACE_TRAVAIL": str(config.ESPACE_TRAVAIL),
                    **graphe,
                },
                "tool_timeout_sec": config.DELAI_VERIFICATION,
            },
        },
    }
    agents: dict[str, Any] = sous_agents()
    if config.MAX_SOUS_AGENTS:
        agents["max_concurrent_threads_per_session"] = config.MAX_SOUS_AGENTS
    surcharges["agents"] = agents
    # Hérités par les sous-agents : toute l'équipe travaille dans le bunker de la session.
    surcharges["shell_environment_policy"] = bunker.environnement_shell(session)
    if config.BUNKER:
        surcharges |= bunker.permissions_session(session)
    return surcharges


def parametres_thread(
    dossier: Path,
    conversation_id: str,
    projet: str | None = None,
    projet_id: str | None = None,
    codex_home: Path | None = None,
) -> dict[str, Any]:
    parametres: dict[str, Any] = {
        # Rien à faire approuver : une commande refusée par le sandbox n'est jamais relancée hors du sandbox.
        "approval_mode": ApprovalMode.deny_all,
        "cwd": str(dossier),
        "model": config.MODELE,
        "developer_instructions": consigne_complete("orchestrateur"),
        "config": surcharges_thread(conversation_id, projet, projet_id, codex_home),
    }
    if not config.BUNKER:
        # Le profil de permissions du bunker ne se combine pas avec un mode de sandbox : l'un ou l'autre.
        parametres["sandbox"] = Sandbox.full_access
    return parametres


async def tour(
    conversation: Conversation,
    texte: str,
    execution_id: str,
    sur_tour: Callable[[AsyncTurnHandle], None],
    suivi: SuiviAgents | None = None,
    effort: str | None = None,
    modele: str | None = None,
    occupe: bool = False,
    vivant: CodexVivant = codex_vivant,
) -> ResultatTour:
    """Fait travailler l'orchestrateur sur `texte` jusqu'à sa réponse finale.

    `sur_tour` reçoit le tour dès qu'il est lancé, pour pouvoir l'interrompre ou l'orienter ; il peut lever
    `Arret`. `suivi` (l'arbre des agents, tenu à jour par le gestionnaire) voit l'orchestrateur repartir.
    `effort` et `modele` valent pour ce tour de l'orchestrateur (par défaut ATLAS_EFFORT_ORCHESTRATEUR et le
    modèle du thread) ; les sous-agents gardent ceux de leur rôle. `occupe` : des sous-agents travaillent encore
    dans ce thread, qu'il ne faut pas recharger même si les consignes ont changé. `vivant` : le processus Codex
    qui paie le tour (celui du serveur, ou celui d'une clé fournie par l'utilisateur).
    """
    suivi = suivi if suivi is not None else SuiviAgents()
    projet = await asyncio.to_thread(projets.dossier_de, conversation.projet_id)
    projet_id = await asyncio.to_thread(projets.id_ou_defaut, conversation.projet_id)
    dossier = await asyncio.to_thread(bunker.preparer_session, conversation.id, projet)

    thread, texte = await _ouvrir_thread(
        conversation, execution_id, texte, dossier, projet, projet_id, occupe, vivant
    )
    if thread.id != conversation.session_agent:
        await asyncio.to_thread(conversations.modifier_conversation, conversation.id, session_agent=thread.id)
        conversation.session_agent = thread.id
    suivi.demarrer_racine(thread.id, modele or config.MODELE)
    return await _derouler(thread, texte, conversation.id, execution_id, sur_tour, effort, modele, suivi)


async def _derouler(
    thread: AsyncThread,
    texte: str,
    conversation_id: str,
    execution_id: str,
    sur_tour: Callable[[AsyncTurnHandle], None],
    effort: str | None,
    modele: str | None,
    suivi: SuiviAgents,
) -> ResultatTour:
    handle = await thread.turn(texte, effort=ReasoningEffort(effort or config.EFFORT), model=modele or None)
    sur_tour(handle)

    usage = None
    fin = None
    async for evenement in handle.stream():
        charge = evenement.payload
        if isinstance(charge, ItemCompletedNotification):
            for ligne in traduire(charge.item, suivi.bilan(charge.item)):
                await asyncio.to_thread(
                    conversations.ajouter_message,
                    conversation_id,
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


def en_dict(charge: Any) -> dict[str, Any]:
    if isinstance(charge, dict):
        return charge
    if isinstance(params := getattr(charge, "params", None), dict):
        return params
    return charge.model_dump(mode="json", by_alias=True, exclude_none=True)


async def enrichir(suivi: SuiviAgents, thread_id: str, vivant: CodexVivant = codex_vivant) -> None:
    """Rôle, surnom et modèle d'un sous-agent, lus dans son thread (réessaie le temps qu'il soit écrit)."""
    for essai in range(3):
        try:
            thread = await vivant.lire_thread(thread_id)
        except Exception:
            await asyncio.sleep(1 + essai)
            continue
        suivi.enrichir(thread_id, role=thread.agent_role, surnom=thread.agent_nickname, modele=thread.model)
        return


# Modèles proposés par Codex, relus au plus toutes les DUREE_CACHE_MODELES secondes (par compte).
DUREE_CACHE_MODELES = 600
_cache_modeles: dict[str, tuple[float, list[dict[str, Any]]]] = {}


async def modeles_disponibles(vivant: CodexVivant = codex_vivant) -> list[dict[str, Any]]:
    """Modèles visibles du compte Codex, avec les niveaux d'effort que chacun accepte."""
    compte = str(vivant.codex_home)
    cache = _cache_modeles.get(compte)
    if cache is not None and time.monotonic() - cache[0] < DUREE_CACHE_MODELES:
        return cache[1]
    reponse = await (await vivant.client()).models()
    modeles = [
        {
            "id": m.model,
            "nom": m.display_name,
            "description": m.description,
            "par_defaut": m.is_default,
            "effort_defaut": m.default_reasoning_effort.value,
            "efforts": [e.reasoning_effort.value for e in m.supported_reasoning_efforts],
        }
        for m in reponse.data
        if not m.hidden
    ]
    _cache_modeles[compte] = (time.monotonic(), modeles)
    return modeles


async def _connecter(codex: AsyncCodex, cle_api: str | None = None) -> None:
    """`cle_api` (clé fournie par l'utilisateur, dans le CODEX_HOME qui lui est propre), sinon la clé API du serveur
    si OPENAI_API_KEY est renseignée, sinon la connexion ChatGPT faite avec `connexion.py`.

    Renseigner la clé suffit à basculer : elle remplace une connexion ChatGPT existante au tour suivant.
    """
    reponse = await codex.account()
    type_compte = reponse.account.root.type if reponse.account is not None else None
    if cle := cle_api or config.OPENAI_API_KEY:
        if type_compte != "apiKey":
            await codex.login_api_key(cle)
        return
    if type_compte is None and reponse.requires_openai_auth:
        raise ConnexionManquante(
            "Codex n'est pas connecté : lancer `python -m atlas.orchestrateur.connexion` (compte ChatGPT) "
            "ou renseigner OPENAI_API_KEY dans le .env du serveur."
        )


async def _ouvrir_thread(
    conversation: Conversation,
    execution_id: str,
    texte: str,
    dossier: Path,
    projet: str,
    projet_id: str,
    occupe: bool,
    vivant: CodexVivant = codex_vivant,
) -> tuple[AsyncThread, str]:
    """Thread de la conversation : déjà chargé, repris, ou nouveau (avec l'historique si la reprise échoue, par
    exemple quand la conversation change de compte : les threads d'un CODEX_HOME n'existent pas dans un autre)."""
    parametres = parametres_thread(dossier, conversation.id, projet, projet_id, vivant.codex_home)
    try:
        return await vivant.thread(conversation.id, conversation.session_agent, parametres, occupe), texte
    except ConnexionManquante:
        raise
    except Exception:
        if not conversation.session_agent:
            raise
        log.warning("Thread %s introuvable, reprise par l'historique", conversation.session_agent, exc_info=True)
        vivant.oublier(conversation.id)
        texte = await asyncio.to_thread(_avec_historique, conversation.id, execution_id, texte)
    return await vivant.thread(conversation.id, None, parametres, occupe), texte


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
