"""Routes des conversations avec l'orchestrateur."""

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from .. import conversations
from ..modeles import Conversation, Execution, Message
from . import config
from .gestionnaire import DejaEnCours, gestionnaire


def verifier_jeton(authorization: str | None = Header(default=None)) -> None:
    if config.JETON_ACCES is None:
        return
    if authorization is None or not secrets.compare_digest(authorization, f"Bearer {config.JETON_ACCES}"):
        raise HTTPException(401, "Jeton d'accès manquant ou invalide.", headers={"WWW-Authenticate": "Bearer"})


routeur = APIRouter(prefix="/api/conversations", tags=["conversations"], dependencies=[Depends(verifier_jeton)])


class NouvelleConversation(BaseModel):
    titre: str | None = None


class NouveauMessage(BaseModel):
    contenu: str = Field(min_length=1)


class EtatConversation(Conversation):
    en_cours: bool
    derniere_execution: Execution | None


def _conversation(conversation_id: str) -> Conversation:
    conversation = conversations.lire_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(404, f"Conversation inexistante : {conversation_id}")
    return conversation


@routeur.get("")
def lister() -> list[Conversation]:
    return conversations.lister_conversations()


@routeur.post("", status_code=201)
def creer(corps: NouvelleConversation) -> Conversation:
    return conversations.creer_conversation(corps.titre)


@routeur.get("/{conversation_id}")
def lire(conversation_id: str) -> EtatConversation:
    conversation = _conversation(conversation_id)
    return EtatConversation(
        **conversation.model_dump(),
        en_cours=gestionnaire.en_cours(conversation_id),
        derniere_execution=conversations.derniere_execution(conversation_id),
    )


@routeur.get("/{conversation_id}/messages")
def messages(conversation_id: str, apres_id: int | None = None) -> list[Message]:
    """Pour suivre une exécution en direct, rappeler avec `apres_id` = id du dernier message reçu."""
    return conversations.lister_messages(conversation_id, apres_id=apres_id)


@routeur.post("/{conversation_id}/messages", status_code=202)
async def envoyer(conversation_id: str, corps: NouveauMessage) -> Execution:
    """Lance un tour de l'orchestrateur ; ses messages arrivent ensuite dans /messages."""
    conversation = _conversation(conversation_id)
    try:
        return await gestionnaire.lancer(conversation, corps.contenu)
    except DejaEnCours:
        raise HTTPException(409, "Une exécution est déjà en cours dans cette conversation.") from None


@routeur.post("/{conversation_id}/arreter", status_code=202)
async def arreter(conversation_id: str) -> dict:
    if not await gestionnaire.arreter(conversation_id):
        raise HTTPException(409, "Aucune exécution en cours dans cette conversation.")
    return {"ok": True}
