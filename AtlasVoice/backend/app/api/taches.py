"""API HTTP du registre.

- /api/taches…         : l'utilisateur, via l'interface ou le chat texte (même chemin que la voix).
- /api/agents/…        : les agents, qui prennent les tâches et y écrivent.
- /api/taches/flux     : flux d'événements (SSE) pour l'interface.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .. import auth
from ..registre.modele import TYPES_AGENT, Contexte, ModificationProposee, Tache
from ..registre.service import ErreurRegistre, Registre

routeur = APIRouter(prefix="/api")

CODES_HTTP = {"introuvable": 404, "ambigu": 409, "etat_invalide": 409, "invalide": 422}


def registre(request: Request) -> Registre:
    return request.app.state.registre


def _http(e: ErreurRegistre) -> HTTPException:
    return HTTPException(CODES_HTTP[e.code], e.vers_json())


# ── utilisateur (interface, chat texte) ──────────────────────────


class NouvelleTache(BaseModel):
    type_agent: Literal["explorateur", "editeur_graphe", "conversation"]
    titre: str = Field(min_length=1, max_length=120)
    demande_brute: str = Field(min_length=1)
    reformulation: str | None = None
    contexte: Contexte = Contexte()
    canal: Literal["vocal", "texte"] = "texte"


class Reponse(BaseModel):
    reponse: str = Field(min_length=1)


class Confirmation(BaseModel):
    decision: Literal["oui", "non"]
    correction: str | None = None


class Annulation(BaseModel):
    mode: Literal["arreter", "revenir"]


@routeur.post("/taches", status_code=201)
async def creer(corps: NouvelleTache, u: str = Depends(auth.utilisateur), r: Registre = Depends(registre)) -> Tache:
    return await r.creer_tache(
        utilisateur_id=u, type_agent=corps.type_agent, titre=corps.titre,
        reformulation=corps.reformulation or corps.demande_brute, demande_brute=corps.demande_brute,
        contexte=corps.contexte, canal=corps.canal,
    )


@routeur.get("/taches")
async def lister(u: str = Depends(auth.utilisateur), r: Registre = Depends(registre)) -> list[Tache]:
    return await r.stockage.lister(u, limite=50)


def _flux_sse(request: Request, r: Registre, utilisateur_id: str | None) -> StreamingResponse:
    """État initial, puis un événement par changement ; un commentaire toutes les 15 s garde la connexion."""

    async def evenements() -> AsyncIterator[str]:
        initial = await r.stockage.lister(utilisateur_id)
        yield f"event: etat\ndata: {json.dumps([t.model_dump(mode='json') for t in initial])}\n\n"
        filtre = None if utilisateur_id is None else (lambda t: t.utilisateur_id == utilisateur_id)
        async with r.abonnement(filtre) as abonnement:
            while not await request.is_disconnected():
                try:
                    evt = await abonnement.suivant(delai=15)
                except TimeoutError:
                    yield ": ping\n\n"
                    continue
                yield f"event: tache\ndata: {evt.model_dump_json()}\n\n"

    return StreamingResponse(evenements(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@routeur.get("/taches/flux")
async def flux(request: Request, u: str = Depends(auth.utilisateur),
               r: Registre = Depends(registre)) -> StreamingResponse:
    return _flux_sse(request, r, u)


@routeur.get("/taches/{tache_id}")
async def obtenir(tache_id: int, u: str = Depends(auth.utilisateur), r: Registre = Depends(registre)) -> Tache:
    try:
        return await r.tache_de(u, tache_id)
    except ErreurRegistre as e:
        raise _http(e) from e


@routeur.post("/taches/{tache_id}/reponse")
async def repondre(tache_id: int, corps: Reponse, u: str = Depends(auth.utilisateur),
                   r: Registre = Depends(registre)) -> Tache:
    try:
        return await r.repondre(u, tache_id, corps.reponse)
    except ErreurRegistre as e:
        raise _http(e) from e


@routeur.post("/taches/{tache_id}/confirmation")
async def confirmer(tache_id: int, corps: Confirmation, u: str = Depends(auth.utilisateur),
                    r: Registre = Depends(registre)) -> Tache:
    try:
        return await r.confirmer(u, tache_id, corps.decision, corps.correction)
    except ErreurRegistre as e:
        raise _http(e) from e


@routeur.post("/taches/{tache_id}/annulation")
async def annuler(tache_id: int, corps: Annulation, u: str = Depends(auth.utilisateur),
                  r: Registre = Depends(registre)) -> Tache:
    try:
        if corps.mode == "arreter":
            return await r.arreter(u, tache_id)
        return await r.revenir_en_arriere(u, tache_id, canal="texte")
    except ErreurRegistre as e:
        raise _http(e) from e


# ── agents ────────────────────────────────────────────────────────

agents = APIRouter(prefix="/api/agents", dependencies=[Depends(auth.agent)])


class Prise(BaseModel):
    types_agent: list[str] = Field(min_length=1)


class Avancement(BaseModel):
    avancement: str = Field(min_length=1, max_length=300)
    pourcentage: int | None = Field(default=None, ge=0, le=100)


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=400)


class Resultat(BaseModel):
    resultat_oral: str = Field(min_length=1)
    resultat_detail: Any = None
    modification_appliquee: bool = False


class Echec(BaseModel):
    erreur: str = Field(min_length=1)


class Verrou(BaseModel):
    tache_id: int


@agents.post("/prendre")
async def prendre(corps: Prise, r: Registre = Depends(registre)) -> Tache | None:
    inconnus = set(corps.types_agent) - set(TYPES_AGENT)
    if inconnus:
        raise HTTPException(422, f"Types d'agent inconnus : {sorted(inconnus)}")
    return await r.prendre(corps.types_agent)


@agents.get("/flux")
async def flux_agents(request: Request, r: Registre = Depends(registre)) -> StreamingResponse:
    """Tous les événements : nouvelles tâches, réponses, confirmations, demandes d'arrêt."""
    return _flux_sse(request, r, None)


@agents.get("/taches/{tache_id}")
async def lire(tache_id: int, r: Registre = Depends(registre)) -> Tache:
    tache = await r.stockage.obtenir(tache_id)
    if tache is None:
        raise HTTPException(404, "Tâche inconnue")
    return tache


async def _agent(coro) -> Tache:
    try:
        return await coro
    except ErreurRegistre as e:
        raise _http(e) from e


@agents.post("/taches/{tache_id}/avancement")
async def avancer(tache_id: int, corps: Avancement, r: Registre = Depends(registre)) -> Tache:
    return await _agent(r.avancer(tache_id, corps.avancement, corps.pourcentage))


@agents.post("/taches/{tache_id}/question")
async def questionner(tache_id: int, corps: Question, r: Registre = Depends(registre)) -> Tache:
    return await _agent(r.questionner(tache_id, corps.question))


@agents.post("/taches/{tache_id}/proposition")
async def proposer(tache_id: int, corps: ModificationProposee, r: Registre = Depends(registre)) -> Tache:
    return await _agent(r.proposer(tache_id, corps))


@agents.post("/taches/{tache_id}/resultat")
async def terminer(tache_id: int, corps: Resultat, r: Registre = Depends(registre)) -> Tache:
    return await _agent(r.terminer(tache_id, corps.resultat_oral, corps.resultat_detail,
                                   corps.modification_appliquee))


@agents.post("/taches/{tache_id}/echec")
async def echouer(tache_id: int, corps: Echec, r: Registre = Depends(registre)) -> Tache:
    return await _agent(r.echouer(tache_id, corps.erreur))


@agents.post("/verrous/{ressource}")
async def prendre_verrou(ressource: str, corps: Verrou, r: Registre = Depends(registre)) -> dict:
    if not await r.prendre_verrou(ressource, corps.tache_id):
        raise HTTPException(409, "Ressource verrouillée par une autre tâche")
    return {"verrou": ressource, "tache_id": corps.tache_id}


@agents.delete("/verrous/{ressource}")
async def liberer_verrou(ressource: str, tache_id: int, r: Registre = Depends(registre)) -> dict:
    await r.liberer_verrou(ressource, tache_id)
    return {"libere": ressource}
