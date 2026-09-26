"""Un tour de l'orchestrateur (Codex) : envoie le message et enregistre au fil de l'eau ce que fait l'agent."""

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
from .consignes import consigne_complete
from .sous_agents import sous_agents
from .suivi_agents import METHODES_SUIVIES, SuiviAgents
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


def surcharges_thread(conversation_id: str, projet: str | None = None, projet_id: str | None = None) -> dict[str, Any]:
    """Réglages Codex d'Atlas, appliqués à chaque thread. `projet` est le dossier de l'espace dans le bunker,
    `projet_id` l'espace dont les serveurs MCP lisent et écrivent le graphe."""
    graphe = {"ATLAS_PROJET_ID": projet_id} if projet_id else {}
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
                "env": {"ATLAS_CONVERSATION_ID": conversation_id, **graphe},
            },
            "verificateur": {
                "command": sys.executable,
                "args": ["-m", "atlas.orchestrateur.mcp_verificateur"],
                "cwd": str(config.RACINE),
                # Il lance son propre Codex : il lui faut Supabase, la connexion et les réglages du vérificateur.
                "env_vars": [n for n in os.environ if n.startswith(("ATLAS_", "SUPABASE_")) or n == "OPENAI_API_KEY"],
                "env": {
                    "ATLAS_CODEX_HOME": str(config.CODEX_HOME),
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
    session = bunker.dossier_session(conversation_id, projet)
    surcharges["shell_environment_policy"] = bunker.environnement_shell(session)
    if config.BUNKER:
        surcharges |= bunker.permissions_session(session)
    return surcharges


def parametres_thread(
    dossier: Path, conversation_id: str, projet: str | None = None, projet_id: str | None = None
) -> dict[str, Any]:
    parametres: dict[str, Any] = {
        # Rien à faire approuver : une commande refusée par le sandbox n'est jamais relancée hors du sandbox.
        "approval_mode": ApprovalMode.deny_all,
        "cwd": str(dossier),
        "model": config.MODELE,
        "developer_instructions": consigne_complete("orchestrateur"),
        "config": surcharges_thread(conversation_id, projet, projet_id),
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
) -> ResultatTour:
    """Fait travailler l'orchestrateur sur `texte` jusqu'à sa réponse finale.

    `sur_tour` reçoit le tour dès qu'il est lancé, pour pouvoir l'interrompre ou l'orienter ; il peut lever
    `Arret`. `suivi` est tenu à jour avec l'arbre des agents, et les items des sous-agents sont enregistrés
    dans la conversation, rattachés à leur agent. `effort` et `modele` valent pour ce tour de l'orchestrateur
    (par défaut ATLAS_EFFORT_ORCHESTRATEUR et le modèle du thread) ; les sous-agents gardent ceux de leur rôle.
    """
    suivi = suivi if suivi is not None else SuiviAgents()
    projet = await asyncio.to_thread(projets.dossier_de, conversation.projet_id)
    projet_id = await asyncio.to_thread(projets.id_ou_defaut, conversation.projet_id)
    dossier = await asyncio.to_thread(bunker.preparer_session, conversation.id, projet)

    async with AsyncCodex(config=config_codex()) as codex:
        await _connecter(codex)

        thread, texte = await _ouvrir_thread(codex, conversation, execution_id, texte, dossier, projet, projet_id)
        if thread.id != conversation.session_agent:
            await asyncio.to_thread(conversations.modifier_conversation, conversation.id, session_agent=thread.id)
            conversation.session_agent = thread.id

        suivi.demarrer_racine(thread.id, modele or config.MODELE)
        file: asyncio.Queue = asyncio.Queue()
        boucle = asyncio.get_running_loop()
        retirer_espion = _espionner(codex, lambda *n: boucle.call_soon_threadsafe(file.put_nowait, n))
        suiveur = asyncio.create_task(_suivre(codex, conversation.id, execution_id, suivi, file))
        try:
            return await _derouler(thread, texte, conversation.id, execution_id, sur_tour, effort, modele)
        finally:
            retirer_espion()
            file.put_nowait(None)
            try:
                await asyncio.wait_for(suiveur, timeout=10)
            except Exception:
                log.warning("Suivi des agents interrompu", exc_info=True)
                suiveur.cancel()


async def _derouler(
    thread: AsyncThread,
    texte: str,
    conversation_id: str,
    execution_id: str,
    sur_tour: Callable[[AsyncTurnHandle], None],
    effort: str | None,
    modele: str | None,
) -> ResultatTour:
    handle = await thread.turn(texte, effort=ReasoningEffort(effort or config.EFFORT), model=modele or None)
    sur_tour(handle)

    usage = None
    fin = None
    async for evenement in handle.stream():
        charge = evenement.payload
        if isinstance(charge, ItemCompletedNotification):
            for ligne in traduire(charge.item):
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


def _espionner(codex: AsyncCodex, rappel: Callable[[str, Any], None]) -> Callable[[], None]:
    """Fait suivre à `rappel` les notifications utiles de tous les threads, sous-agents compris.

    Appelé depuis le fil de lecture du SDK. Passe par son routeur interne (aucune API publique ne donne les
    événements des sous-agents) : si le SDK change, le tour continue, sans arbre des agents.
    Renvoie de quoi retirer l'espion.
    """
    try:
        routeur = codex._client._sync._router
        origine = routeur.route_notification
    except AttributeError:
        log.warning("Routeur du SDK Codex introuvable : pas de suivi des sous-agents")
        return lambda: None

    def espion(notification: Any) -> None:
        try:
            if notification.method in METHODES_SUIVIES:
                rappel(notification.method, notification.payload)
        except Exception:
            log.exception("Notification %s non suivie", getattr(notification, "method", "?"))
        origine(notification)

    routeur.route_notification = espion
    return lambda: setattr(routeur, "route_notification", origine)


def _en_dict(charge: Any) -> dict[str, Any]:
    if isinstance(charge, dict):
        return charge
    if isinstance(params := getattr(charge, "params", None), dict):
        return params
    return charge.model_dump(mode="json", by_alias=True, exclude_none=True)


async def _suivre(
    codex: AsyncCodex, conversation_id: str, execution_id: str, suivi: SuiviAgents, file: asyncio.Queue
) -> None:
    """Tient `suivi` à jour et enregistre les items des sous-agents, jusqu'à recevoir None."""
    enrichissements: set[asyncio.Task] = set()
    while (notification := await file.get()) is not None:
        methode, charge = notification
        try:
            evenements = suivi.recevoir(methode, _en_dict(charge))
            for thread_id in evenements.nouveaux:
                tache = asyncio.create_task(_enrichir(codex, suivi, thread_id))
                enrichissements.add(tache)
                tache.add_done_callback(enrichissements.discard)
            for chemin, item in evenements.a_enregistrer:
                for ligne in traduire(item):
                    await asyncio.to_thread(
                        conversations.ajouter_message,
                        conversation_id,
                        ligne.role,
                        ligne.contenu,
                        execution_id=execution_id,
                        donnees=ligne.donnees,
                        agent=chemin,
                    )
        except Exception:
            log.exception("Suivi des agents : notification %s ignorée", methode)
    for tache in enrichissements:
        tache.cancel()


async def _enrichir(codex: AsyncCodex, suivi: SuiviAgents, thread_id: str) -> None:
    """Rôle, surnom et modèle d'un sous-agent, lus dans son thread (réessaie le temps qu'il soit écrit)."""
    for essai in range(3):
        try:
            thread = (await codex._client.thread_read(thread_id, False)).thread
        except Exception:
            await asyncio.sleep(1 + essai)
            continue
        suivi.enrichir(thread_id, role=thread.agent_role, surnom=thread.agent_nickname, modele=thread.model)
        return


# Modèles proposés par Codex, relus au plus toutes les DUREE_CACHE_MODELES secondes (lancer Codex coûte ~1 s).
DUREE_CACHE_MODELES = 600
_cache_modeles: tuple[float, list[dict[str, Any]]] | None = None


async def modeles_disponibles() -> list[dict[str, Any]]:
    """Modèles visibles du compte Codex, avec les niveaux d'effort que chacun accepte."""
    global _cache_modeles
    if _cache_modeles is not None and time.monotonic() - _cache_modeles[0] < DUREE_CACHE_MODELES:
        return _cache_modeles[1]
    async with AsyncCodex(config=config_codex()) as codex:
        await _connecter(codex)
        reponse = await codex.models()
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
    _cache_modeles = (time.monotonic(), modeles)
    return modeles


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
    codex: AsyncCodex,
    conversation: Conversation,
    execution_id: str,
    texte: str,
    dossier: Path,
    projet: str,
    projet_id: str,
) -> tuple[AsyncThread, str]:
    """Reprend le thread de la conversation, ou en ouvre un nouveau (avec l'historique si la reprise échoue)."""
    parametres = parametres_thread(dossier, conversation.id, projet, projet_id)
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
