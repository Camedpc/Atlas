"""Routes des conversations avec l'orchestrateur."""

import secrets
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from .. import conversations, projets
from ..modeles import Conversation, Execution, Message
from . import agent, config
from .gestionnaire import Reglages, TourIndisponible, gestionnaire


def verifier_jeton(authorization: str | None = Header(default=None)) -> None:
    if config.JETON_ACCES is None:
        return
    if authorization is None or not secrets.compare_digest(authorization, f"Bearer {config.JETON_ACCES}"):
        raise HTTPException(401, "Jeton d'accès manquant ou invalide.", headers={"WWW-Authenticate": "Bearer"})


routeur = APIRouter(prefix="/api/conversations", tags=["conversations"], dependencies=[Depends(verifier_jeton)])
routeur_modeles = APIRouter(prefix="/api/orchestrateur", tags=["conversations"], dependencies=[Depends(verifier_jeton)])

Effort = Literal["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]


class NouvelleConversation(BaseModel):
    titre: str | None = None
    projet_id: str | None = None
    """Projet de la conversation ; absent = le projet par défaut."""


class NouveauMessage(BaseModel):
    contenu: str = Field(min_length=1)
    agent: str | None = None
    """Chemin Codex du sous-agent destinataire (ex. /root/hydrures) ; absent = l'orchestrateur."""
    effort: Effort | None = None
    """Effort de raisonnement de l'orchestrateur pour ce tour ; absent = ATLAS_EFFORT_ORCHESTRATEUR."""
    modele: str | None = None
    """Modèle de l'orchestrateur pour ce tour ; absent = celui du thread (ATLAS_MODELE_ORCHESTRATEUR ou défaut)."""


class EtatConversation(Conversation):
    en_cours: bool
    derniere_execution: Execution | None


def _conversation(conversation_id: str) -> Conversation:
    conversation = conversations.lire_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(404, f"Conversation inexistante : {conversation_id}")
    return conversation


@routeur.get("")
def lister(projet_id: str | None = None) -> list[Conversation]:
    """Toutes les conversations, ou celles d'un projet (le projet par défaut garde aussi celles sans projet)."""
    if projet_id is None:
        return conversations.lister_conversations()
    projet = projets.lire_projet(projet_id)
    if projet is None:
        raise HTTPException(404, f"Projet inexistant : {projet_id}")
    return conversations.lister_conversations(projet_id, avec_sans_projet=projet.dossier == projets.DOSSIER_PAR_DEFAUT)


@routeur.post("", status_code=201)
def creer(corps: NouvelleConversation) -> Conversation:
    projet_id = corps.projet_id
    if projet_id is None:
        defaut = projets.projet_par_defaut()
        projet_id = defaut.id if defaut else None
    elif projets.lire_projet(projet_id) is None:
        raise HTTPException(404, f"Projet inexistant : {projet_id}")
    return conversations.creer_conversation(corps.titre, projet_id)


@routeur.get("/{conversation_id}")
def lire(conversation_id: str) -> EtatConversation:
    conversation = _conversation(conversation_id)
    return EtatConversation(
        **conversation.model_dump(),
        en_cours=gestionnaire.en_cours(conversation_id),
        derniere_execution=conversations.derniere_execution(conversation_id),
    )


@routeur.get("/{conversation_id}/messages")
def messages(conversation_id: str, apres_id: int | None = None, agent: str | None = None) -> list[Message]:
    """Pour suivre une exécution en direct, rappeler avec `apres_id` = id du dernier message reçu.

    Messages de l'orchestrateur, ou ceux d'un sous-agent avec `agent` = son chemin Codex.
    """
    return conversations.lister_messages(conversation_id, apres_id=apres_id, agent=agent)


@routeur.get("/{conversation_id}/agents")
def agents(conversation_id: str) -> list[dict]:
    """Arbre des agents : en direct pendant une exécution, sinon tel que l'a laissé la dernière."""
    en_direct = gestionnaire.agents(conversation_id)
    if en_direct is not None:
        return en_direct
    derniere = conversations.derniere_execution(conversation_id)
    return (derniere.agents if derniere else None) or []


@routeur.post("/{conversation_id}/messages", status_code=202)
async def envoyer(conversation_id: str, corps: NouveauMessage) -> Execution:
    """Message à l'orchestrateur ou à un sous-agent (`agent`) : lance un tour, ou s'injecte dans le tour en cours.

    Les réponses arrivent ensuite dans /messages.
    """
    conversation = _conversation(conversation_id)
    try:
        reglages = Reglages(effort=corps.effort, modele=corps.modele)
        return await gestionnaire.envoyer(conversation, corps.contenu, corps.agent, reglages)
    except TourIndisponible:
        raise HTTPException(409, "L'orchestrateur démarre ou termine son tour : réessaie dans un instant.") from None


@routeur.post("/{conversation_id}/arreter", status_code=202)
async def arreter(conversation_id: str) -> dict:
    if not await gestionnaire.arreter(conversation_id):
        raise HTTPException(409, "Aucune exécution en cours dans cette conversation.")
    return {"ok": True}


@routeur_modeles.get("/modeles")
async def modeles() -> dict:
    """Modèles proposés pour l'orchestrateur, avec leurs efforts, et les réglages par défaut du serveur."""
    try:
        disponibles = await agent.modeles_disponibles()
    except Exception as e:
        raise HTTPException(503, f"Liste des modèles indisponible : {e}") from None
    defaut = config.MODELE or next((m["id"] for m in disponibles if m["par_defaut"]), None)
    return {"modele_defaut": defaut, "effort_defaut": config.EFFORT, "modeles": disponibles}
