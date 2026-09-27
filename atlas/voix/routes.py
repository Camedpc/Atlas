"""Routes de la voix : l'appel (WebSocket) et les outils du serveur MCP `voix` (atlas/voix/mcp_voix.py)."""

import asyncio
import contextlib
import json
import logging
import secrets
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from pydantic import BaseModel, Field

from .. import conversations, projets
from ..orchestrateur import bunker
from ..orchestrateur import config as config_orchestrateur
from ..orchestrateur.gestionnaire import TourIndisponible
from ..orchestrateur.routes import verifier_jeton
from . import config
from .appels import appels
from .session import Session

log = logging.getLogger(__name__)

DELAI_AUTH = 5.0

routeur_appel = APIRouter(tags=["voix"])
routeur_outils = APIRouter(prefix="/api/voix/appels/{appel_id}", tags=["voix"], dependencies=[Depends(verifier_jeton)])


@routeur_appel.websocket("/api/conversations/{conversation_id}/voix")
async def appel(ws: WebSocket, conversation_id: str) -> None:
    """Appel vocal dans une conversation. Un navigateur ne peut pas poser d'en-tête sur un WebSocket, et un jeton
    dans l'URL finirait dans les journaux : le premier message est `{"type": "auth", "jeton": …}`."""
    await ws.accept()
    attendu = config_orchestrateur.JETON_ACCES
    if attendu is not None:
        try:
            auth = json.loads(await asyncio.wait_for(ws.receive_text(), DELAI_AUTH))
        except Exception:
            auth = {}
        jeton = auth.get("jeton") if isinstance(auth, dict) else None
        if not (isinstance(jeton, str) and secrets.compare_digest(jeton, attendu)):
            await ws.close(code=4401, reason="Jeton d'accès manquant ou invalide.")
            return
    if not config.GRADIUM_API_KEY:
        await ws.close(code=4503, reason="GRADIUM_API_KEY manquante dans le .env du serveur.")
        return
    conversation = await asyncio.to_thread(conversations.lire_conversation, conversation_id)
    if conversation is None:
        await ws.close(code=4404, reason="Conversation inexistante.")
        return
    # Offre Gradium : 3 sessions simultanées (STT + TTS + TTS préchauffée) → un seul appel à la fois.
    for ancien in list(appels.par_id.values()):
        with contextlib.suppress(Exception):
            await ancien.ws.close(code=4409, reason="Un autre appel a commencé.")
    projet = await asyncio.to_thread(projets.dossier_de, conversation.projet_id)
    projet_id = await asyncio.to_thread(projets.id_ou_defaut, conversation.projet_id)
    dossier = await asyncio.to_thread(bunker.preparer_session, conversation.id, projet)
    session = Session(ws, conversation, dossier, projet_id)
    appels.ouvrir(session)
    log.info("appel %s ouvert (conversation %s)", session.id, conversation.id)
    try:
        await session.executer()
    finally:
        appels.fermer(session)
        log.info("appel %s fermé", session.id)


def _session(appel_id: str) -> Session:
    session = appels.par_id.get(appel_id)
    if session is None:
        raise HTTPException(404, "Appel terminé ou inconnu.")
    return session


class Consigne(BaseModel):
    consigne: str = Field(min_length=1)


class NouvelleTache(BaseModel):
    titre: str = ""
    consigne: str = Field(min_length=1)
    genre: Literal["tache_vocale", "navigateur"] = "tache_vocale"


class Message(BaseModel):
    message: str = Field(min_length=1)


@routeur_outils.post("/orchestrateur")
async def confier(appel_id: str, corps: Consigne) -> dict:
    try:
        return await _session(appel_id).confier(corps.consigne)
    except TourIndisponible:
        raise HTTPException(
            409, "L'orchestrateur démarre ou termine son tour : réessaie dans quelques secondes."
        ) from None


@routeur_outils.get("/orchestrateur")
def etat_orchestrateur(appel_id: str) -> dict:
    return _session(appel_id).etat_orchestrateur()


@routeur_outils.post("/orchestrateur/arreter")
async def arreter_orchestrateur(appel_id: str) -> dict:
    return await _session(appel_id).arreter_orchestrateur()


@routeur_outils.get("/taches")
def lister_taches(appel_id: str) -> list[dict]:
    return _session(appel_id).taches.etat()


@routeur_outils.post("/taches")
async def lancer_tache(appel_id: str, corps: NouvelleTache) -> dict:
    tache = _session(appel_id).taches.lancer(corps.titre, corps.consigne, corps.genre)
    return {"id": tache.id, "statut": "lancée", "note": "Le résultat arrivera dans un message [Système]."}


@routeur_outils.post("/taches/{tache}/consigne")
async def consigner(appel_id: str, tache: int, corps: Message) -> dict:
    return {"transmis": await _session(appel_id).taches.orienter(tache, corps.message)}


class Montrer(BaseModel):
    references: list[str] = []
    etendue: Literal["seul", "premisses", "consequences", "lignee"] = "seul"
    garder_seulement: bool = False
    fiche: bool = False
    statuts: list[str] = []


class Zoom(BaseModel):
    facteur: float


class Deplacements(BaseModel):
    deplacements: list[dict[str, Any]] = Field(min_length=1)


@routeur_outils.get("/ecran")
async def lire_ecran(appel_id: str) -> dict:
    return await _session(appel_id).ecran.lire()


@routeur_outils.post("/ecran/montrer")
async def montrer(appel_id: str, corps: Montrer) -> dict:
    return await _session(appel_id).ecran.montrer(
        corps.references, corps.etendue, corps.garder_seulement, corps.fiche, corps.statuts
    )


@routeur_outils.post("/ecran/ensemble")
async def vue_d_ensemble(appel_id: str) -> dict:
    return await _session(appel_id).ecran.ensemble()


@routeur_outils.post("/ecran/effacer")
async def effacer_ecran(appel_id: str) -> dict:
    return await _session(appel_id).ecran.effacer()


@routeur_outils.post("/ecran/zoomer")
async def zoomer(appel_id: str, corps: Zoom) -> dict:
    return await _session(appel_id).ecran.zoomer(corps.facteur)


class Etape(BaseModel):
    parcours: str = Field(min_length=1)
    etape: int = 1


@routeur_outils.post("/ecran/parcours")
async def jouer_etape(appel_id: str, corps: Etape) -> dict:
    return await _session(appel_id).ecran.jouer_etape(corps.parcours, corps.etape)


@routeur_outils.post("/ecran/parcours/derouler")
async def derouler_parcours(appel_id: str, corps: Etape) -> dict:
    return await _session(appel_id).derouler(corps.parcours, corps.etape)


@routeur_outils.post("/ecran/deplacer")
async def deplacer(appel_id: str, corps: Deplacements) -> dict:
    return await _session(appel_id).ecran.deplacer(corps.deplacements)


@routeur_outils.post("/taches/{tache}/arreter")
async def arreter_tache(appel_id: str, tache: int) -> dict:
    return {"arretee": await _session(appel_id).taches.arreter(tache)}
