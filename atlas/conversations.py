"""Conversations, messages et exécutions dans Supabase (écrits par le serveur, lus par le front)."""

from datetime import UTC, datetime
from typing import Any

from .client import supabase
from .modeles import Conversation, Execution, Message, RoleMessage, StatutExecution

TITRE_PAR_DEFAUT = "Nouvelle recherche"


def creer_conversation(titre: str | None = None, projet_id: str | None = None) -> Conversation:
    ligne = {"titre": titre or TITRE_PAR_DEFAUT, **({"projet_id": projet_id} if projet_id else {})}
    return Conversation.model_validate(supabase().table("conversations").insert(ligne).execute().data[0])


def lister_conversations(projet_id: str | None = None, *, avec_sans_projet: bool = False) -> list[Conversation]:
    """Les plus récentes d'abord ; celles d'un projet si `projet_id` (et celles sans projet si `avec_sans_projet`)."""
    q = supabase().table("conversations").select("*")
    if projet_id:
        q = q.or_(f"projet_id.eq.{projet_id},projet_id.is.null") if avec_sans_projet else q.eq("projet_id", projet_id)
    lignes = q.order("modifie_le", desc=True).execute().data
    return [Conversation.model_validate(l) for l in lignes]


def lire_conversation(conversation_id: str) -> Conversation | None:
    lignes = supabase().table("conversations").select("*").eq("id", conversation_id).execute().data
    return Conversation.model_validate(lignes[0]) if lignes else None


def modifier_conversation(conversation_id: str, **champs: Any) -> None:
    supabase().table("conversations").update(champs).eq("id", conversation_id).execute()


def ajouter_message(
    conversation_id: str,
    role: RoleMessage,
    contenu: str,
    *,
    execution_id: str | None = None,
    donnees: Any = None,
    agent: str | None = None,
) -> Message:
    ligne = (
        supabase()
        .table("messages")
        .insert(
            {
                "conversation_id": conversation_id,
                "execution_id": execution_id,
                "role": role,
                "contenu": contenu,
                "donnees": donnees,
                **({"agent": agent} if agent else {}),
            }
        )
        .execute()
        .data[0]
    )
    return Message.model_validate(ligne)


def lister_messages(
    conversation_id: str,
    *,
    apres_id: int | None = None,
    limite: int = 500,
    agent: str | None = None,
    derniers: bool = False,
) -> list[Message]:
    """Plus anciens d'abord. Pour suivre une exécution, repasser `apres_id` = id du dernier reçu.

    Messages de l'orchestrateur par défaut, ou ceux d'un sous-agent (`agent` = son chemin Codex).
    `derniers` : les `limite` plus récents plutôt que les plus anciens.
    """
    q = supabase().table("messages").select("*").eq("conversation_id", conversation_id)
    q = q.eq("agent", agent) if agent else q.is_("agent", "null")
    if apres_id is not None:
        q = q.gt("id", apres_id)
    lignes = q.order("id", desc=derniers).limit(limite).execute().data
    messages = [Message.model_validate(l) for l in lignes]
    return messages[::-1] if derniers else messages


def creer_execution(conversation_id: str) -> Execution:
    ligne = supabase().table("executions").insert({"conversation_id": conversation_id}).execute().data[0]
    return Execution.model_validate(ligne)


def terminer_execution(
    execution_id: str,
    statut: StatutExecution,
    *,
    erreur: str | None = None,
    usage: Any = None,
    agents: Any = None,
) -> None:
    champs = {"statut": statut, "erreur": erreur, "usage": usage, "fin": datetime.now(UTC).isoformat()}
    if agents is not None:
        champs["agents"] = agents
    supabase().table("executions").update(champs).eq("id", execution_id).execute()


def enregistrer_agents(execution_id: str, agents: Any) -> None:
    """Arbre des agents d'une exécution finie, mis à jour par les sous-agents qui travaillent encore après elle."""
    supabase().table("executions").update({"agents": agents}).eq("id", execution_id).execute()


def derniere_execution(conversation_id: str) -> Execution | None:
    lignes = (
        supabase()
        .table("executions")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("debut", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return Execution.model_validate(lignes[0]) if lignes else None


def solder_executions_orphelines() -> None:
    """Au démarrage : une exécution restée « en cours » a été tuée avec l'ancien process."""
    supabase().table("executions").update(
        {"statut": "erreur", "erreur": "Serveur redémarré pendant l'exécution.", "fin": datetime.now(UTC).isoformat()}
    ).eq("statut", "en_cours").execute()
