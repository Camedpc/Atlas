"""Routes des conversations avec l'orchestrateur.

En-tête `X-Atlas-Cle-OpenAI` (facultatif) : clé OpenAI de l'utilisateur, gardée dans son navigateur. Ses tours et la
liste des modèles passent alors par un processus Codex connecté à cette clé (ses crédits), jamais par le compte du
serveur. La clé n'est écrite ni en base ni dans les journaux.
"""

import asyncio
import json
import re
import secrets
import urllib.error
import urllib.request
from dataclasses import asdict
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from .. import conversations, projets
from ..modeles import Conversation, Execution, Message
from ..voix.appels import appels, fusionner
from ..voix.contexte import VOIX
from . import agent, config, sous_agents, verificateur
from .codex_vivant import oublier_cle, pour_cle
from .gestionnaire import CompteDifferent, Reglages, TourIndisponible, gestionnaire
from .suivi_agents import agents_figes


def verifier_jeton(authorization: str | None = Header(default=None)) -> None:
    if config.JETON_ACCES is None:
        return
    if authorization is None or not secrets.compare_digest(authorization, f"Bearer {config.JETON_ACCES}"):
        raise HTTPException(401, "Jeton d'accès manquant ou invalide.", headers={"WWW-Authenticate": "Bearer"})


# Forme d'une clé OpenAI : « sk-… » (clés de projet « sk-proj-… » comprises), sans espace.
FORME_CLE = re.compile(r"sk-[A-Za-z0-9_-]{20,300}")


def cle_openai(x_atlas_cle_openai: str | None = Header(default=None)) -> str | None:
    """Clé OpenAI fournie par l'utilisateur (en-tête X-Atlas-Cle-OpenAI), ou None : le compte du serveur."""
    cle = (x_atlas_cle_openai or "").strip()
    if not cle:
        return None
    if not FORME_CLE.fullmatch(cle):
        raise HTTPException(400, "Clé OpenAI mal formée : elle commence par « sk- ».")
    return cle


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


class Arret(BaseModel):
    agent: str | None = None
    """Chemin Codex du sous-agent à arrêter ; absent = tout arrêter (l'orchestrateur et ses sous-agents)."""


class EtatConversation(Conversation):
    en_cours: bool
    """L'orchestrateur a un tour en cours."""
    actif: bool
    """L'orchestrateur ou un sous-agent travaille (les sous-agents peuvent continuer après le tour)."""
    brouillons: dict[str, str]
    """Messages en cours d'écriture, par chemin d'agent (/root = l'orchestrateur)."""
    derniere_execution: Execution | None
    appel_en_cours: bool = False
    """Un appel vocal avec Atlas voix est ouvert dans cette conversation."""


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
        actif=gestionnaire.actif(conversation_id),
        brouillons=gestionnaire.brouillons(conversation_id),
        derniere_execution=conversations.derniere_execution(conversation_id),
        appel_en_cours=appels.en_cours(conversation_id),
    )


@routeur.get("/{conversation_id}/messages")
def messages(conversation_id: str, apres_id: int | None = None, agent: str | None = None) -> list[Message]:
    """Pour suivre une exécution en direct, rappeler avec `apres_id` = id du dernier message reçu.

    Messages de l'orchestrateur, ou ceux d'un sous-agent avec `agent` = son chemin Codex.
    """
    return conversations.lister_messages(conversation_id, apres_id=apres_id, agent=agent)


@routeur.get("/{conversation_id}/agents")
def agents(conversation_id: str) -> list[dict]:
    """Arbre des agents : en direct tant que la conversation est chargée dans Codex, sinon tel que l'a laissé la
    dernière exécution (plus personne n'y travaille alors) ; avec Atlas voix (`/voix`) pendant un appel, puis tant
    que l'orchestrateur n'a pas été relancé à l'écrit."""
    arbre = gestionnaire.agents(conversation_id)
    if arbre is None:
        derniere = conversations.derniere_execution(conversation_id)
        arbre = [asdict(a) for a in agents_figes(derniere.agents if derniere else None)]
    voix, a_confie = appels.agents_voix(conversation_id, gestionnaire.derniers_lancements.get(conversation_id))
    return fusionner(arbre, voix, a_confie)


@routeur.post("/{conversation_id}/messages", status_code=202)
async def envoyer(conversation_id: str, corps: NouveauMessage, cle: str | None = Depends(cle_openai)) -> Execution:
    """Message à l'orchestrateur ou à un sous-agent (`agent`) : lance un tour, ou s'injecte dans le tour en cours.

    Les réponses arrivent ensuite dans /messages.
    """
    conversation = _conversation(conversation_id)
    # Atlas voix n'est pas un sous-agent de l'orchestrateur : écrit hors appel, le message va à l'orchestrateur.
    cible = None if corps.agent == VOIX or (corps.agent or "").startswith(f"{VOIX}/") else corps.agent
    try:
        reglages = Reglages(effort=corps.effort, modele=corps.modele)
        return await gestionnaire.envoyer(conversation, corps.contenu, cible, reglages, cle=cle)
    except TourIndisponible:
        raise HTTPException(409, "L'orchestrateur ne démarre pas son tour : réessaie dans un instant.") from None
    except CompteDifferent:
        raise HTTPException(
            409, "Un tour payé par un autre compte OpenAI travaille dans cette conversation : attends sa fin."
        ) from None


@routeur.post("/{conversation_id}/arreter", status_code=202)
async def arreter(conversation_id: str, corps: Arret | None = None) -> dict:
    """Arrête tout (l'orchestrateur et ses sous-agents), ou un seul sous-agent (`agent`)."""
    if not await gestionnaire.arreter(conversation_id, corps.agent if corps else None):
        raise HTTPException(409, "Rien ne travaille dans cette conversation.")
    return {"ok": True}


@routeur.post("/{conversation_id}/verification", status_code=202)
async def verification(conversation_id: str, evenement: dict) -> dict:
    """Interne : le serveur MCP du vérificateur raconte son avancement (`SuiviAgents.verification`), pour l'arbre
    des agents et le fil de chaque juge."""
    await gestionnaire.verification(conversation_id, evenement)
    return {"ok": True}


@routeur_modeles.get("/modeles")
async def modeles(cle: str | None = Depends(cle_openai)) -> dict:
    """Modèles proposés pour l'orchestrateur (ceux du compte de la clé, s'il y en a une), avec leurs efforts, et les
    réglages par défaut du serveur."""
    try:
        # Avec une clé : vérifiée auprès d'OpenAI avant d'ouvrir un processus Codex, puis seulement ses modèles.
        accessibles = await asyncio.to_thread(modeles_openai, cle) if cle else None
        disponibles = await agent.modeles_disponibles(pour_cle(cle))
        if accessibles is not None:
            disponibles = [m for m in disponibles if m["id"] in accessibles]
    except CleRefusee as e:
        raise HTTPException(400, str(e)) from None
    except Exception as e:
        message = str(e).replace(cle, "sk-…") if cle else str(e)
        raise HTTPException(503, f"Liste des modèles indisponible : {message}") from None
    defaut = config.MODELE or next((m["id"] for m in disponibles if m["par_defaut"]), None)
    if cle and defaut not in (ids := [m["id"] for m in disponibles]):
        defaut = ids[0] if ids else None  # le modèle par défaut d'Atlas n'est pas accessible avec cette clé
    return {"modele_defaut": defaut, "effort_defaut": config.EFFORT, "modeles": disponibles}


URL_MODELES_OPENAI = "https://api.openai.com/v1/models"


class CleRefusee(Exception):
    pass


def modeles_openai(cle: str) -> set[str]:
    """Modèles que la clé voit sur l'API OpenAI : vérifie la clé sans consommer de crédits (Codex, lui, accepte
    n'importe quelle clé jusqu'au premier tour)."""
    requete = urllib.request.Request(URL_MODELES_OPENAI, headers={"Authorization": f"Bearer {cle}"})
    try:
        with urllib.request.urlopen(requete, timeout=15) as reponse:
            return {m["id"] for m in json.loads(reponse.read())["data"]}
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise CleRefusee("OpenAI refuse cette clé (invalide ou révoquée).") from None
        raise CleRefusee(f"OpenAI a répondu {e.code} à la vérification de la clé.") from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise CleRefusee(f"OpenAI injoignable pour vérifier la clé : {getattr(e, 'reason', e)}") from None


def modeles_d_atlas() -> dict[str, str]:
    """Qui utilise quel modèle : chaque rôle de sous-agent, le vérificateur et son recours, et l'orchestrateur s'il
    est fixé par ATLAS_MODELE_ORCHESTRATEUR (sinon il suit le sélecteur)."""
    utilises = {r.nom: config.modele_agent(r.nom, r.modele) for r in sous_agents.ROLES}
    utilises["verificateur"], utilises["verificateur_recours"] = verificateur.modeles_juges()
    if config.MODELE:
        utilises["orchestrateur"] = config.MODELE
    return utilises


@routeur_modeles.post("/compte")
async def verifier_compte(cle: str | None = Depends(cle_openai)) -> dict:
    """Vérifie la clé de l'en-tête auprès d'OpenAI, puis y connecte un processus Codex. Renvoie les agents d'Atlas
    dont le modèle n'est pas accessible avec cette clé (ils échoueraient)."""
    if cle is None:
        raise HTTPException(400, "Aucune clé OpenAI dans la requête.")
    try:
        accessibles = await asyncio.to_thread(modeles_openai, cle)
    except CleRefusee as e:
        raise HTTPException(400, str(e)) from None
    try:
        disponibles = await agent.modeles_disponibles(pour_cle(cle))
    except Exception as e:
        await oublier_cle(cle)
        raise HTTPException(400, f"Clé refusée par Codex : {str(e).replace(cle, 'sk-…')}") from None
    manquants = {qui: m for qui, m in modeles_d_atlas().items() if m not in accessibles}
    return {
        "ok": True,
        "modeles": [m["id"] for m in disponibles if m["id"] in accessibles],
        "manquants": manquants,
    }


@routeur_modeles.delete("/compte")
async def oublier_compte(cle: str | None = Depends(cle_openai)) -> dict:
    """Ferme le processus de la clé et supprime sa connexion et ses threads du serveur."""
    if cle is None:
        raise HTTPException(400, "Aucune clé OpenAI dans la requête.")
    await oublier_cle(cle)
    return {"ok": True}
