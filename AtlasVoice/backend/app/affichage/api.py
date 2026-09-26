"""Routes du relais d'affichage (/api/affichage).

- écrans du graphe (front de l'application, JWT de l'utilisateur) : déclaration, flux des lots, états,
  comptes rendus ;
- agents (`X-Agents-Cle`) : commandes (agent navigateur → écran), état de l'écran d'un utilisateur.

Les messages sont validés par les modèles de `protocole.py` (miroir de `protocoles/`) ; un message invalide
est refusé avec une ErreurProtocole `invalide` (422), jamais ignoré.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ValidationError

from .. import auth
from .protocole import CompteRendu, EtatAffichage, IdEcran, LotCommandes
from .relais import ErreurRelais, Relais

routeur = APIRouter(prefix="/api/affichage", tags=["affichage"])

INTERVALLE_VEILLE_S = 15
# Statut HTTP d'un compte rendu en erreur, selon le code du lot entier.
STATUT_COMPTE_RENDU = {"introuvable": 404, "delai": 504}


def relais(request: Request) -> Relais:
    return request.app.state.relais


def _http(e: ErreurRelais) -> HTTPException:
    return HTTPException(e.statut_http, e.erreur.model_dump(exclude_none=True))


async def _lire[M: BaseModel](request: Request, modele: type[M]) -> M:
    """Corps JSON validé strictement ; sinon ErreurProtocole `invalide`."""
    try:
        return modele.model_validate_json(await request.body())
    except ValidationError as e:
        details = [{"loc": list(x["loc"]), "msg": x["msg"]} for x in e.errors()[:5]]
        raise HTTPException(422, {"code": "invalide", "message": f"{modele.__name__} invalide", "details": details}) from e


def _reponse(cr: CompteRendu) -> JSONResponse:
    statut = STATUT_COMPTE_RENDU.get(cr.erreur.code, 200) if cr.erreur else 200
    return JSONResponse(cr.model_dump(mode="json", exclude_unset=True), status_code=statut)


def _sse(evenements: AsyncIterator[BaseModel], nom: str, request: Request) -> StreamingResponse:
    """Un événement par message, un commentaire toutes les 15 s pour garder la connexion."""

    async def flux() -> AsyncIterator[str]:
        yield ": connecte\n\n"
        suivant: asyncio.Task[Any] | None = None
        try:
            while not await request.is_disconnected():
                if suivant is None:
                    suivant = asyncio.ensure_future(anext(evenements))
                fait, _ = await asyncio.wait({suivant}, timeout=INTERVALLE_VEILLE_S)
                if not fait:
                    yield ": veille\n\n"
                    continue
                message = suivant.result()
                suivant = None
                yield f"event: {nom}\ndata: {message.model_dump_json(exclude_unset=True)}\n\n"
        finally:
            if suivant is not None:
                suivant.cancel()
            with contextlib.suppress(Exception):
                await evenements.aclose()  # type: ignore[attr-defined]

    return StreamingResponse(flux(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── écrans (front de l'application) ──────────────────────────────


class Declaration(BaseModel):
    ecran: IdEcran | None = None


@routeur.post("/ecrans", status_code=201)
async def declarer(request: Request, u: str = Depends(auth.utilisateur), r: Relais = Depends(relais)) -> dict:
    corps = await _lire(request, Declaration) if await request.body() else Declaration()
    try:
        e = r.declarer(u, corps.ecran)
    except ErreurRelais as err:
        raise _http(err) from err
    return {"ecran": e.id, "utilisateur_id": u}


@routeur.get("/ecrans/{ecran}/flux")
async def flux_ecran(ecran: str, request: Request, u: str = Depends(auth.utilisateur),
                     r: Relais = Depends(relais)) -> StreamingResponse:
    try:
        r.ecran(ecran, u)
    except ErreurRelais as err:
        raise _http(err) from err
    return _sse(r.flux_ecran(ecran, u), "lot", request)


@routeur.post("/ecrans/{ecran}/etat", status_code=204)
async def etat_ecran(ecran: str, request: Request, u: str = Depends(auth.utilisateur), r: Relais = Depends(relais)) -> None:
    etat = await _lire(request, EtatAffichage)
    try:
        r.enregistrer_etat(ecran, u, etat)
    except ErreurRelais as err:
        raise _http(err) from err


@routeur.post("/ecrans/{ecran}/compte-rendu", status_code=204)
async def compte_rendu_ecran(ecran: str, request: Request, u: str = Depends(auth.utilisateur),
                             r: Relais = Depends(relais)) -> None:
    cr = await _lire(request, CompteRendu)
    try:
        r.recevoir_compte_rendu(ecran, u, cr)
    except ErreurRelais as err:
        raise _http(err) from err


# ── agents ───────────────────────────────────────────────────────


@routeur.post("/commandes", dependencies=[Depends(auth.agent)])
async def commandes(request: Request, r: Relais = Depends(relais)) -> JSONResponse:
    """Agent navigateur (ou tests) : pousse un LotCommandes vers son écran et attend le compte rendu."""
    return _reponse(await r.commander(await _lire(request, LotCommandes)))


@routeur.get("/utilisateurs/{utilisateur_id}/etat", dependencies=[Depends(auth.agent)])
async def etat_utilisateur(utilisateur_id: str, r: Relais = Depends(relais)) -> JSONResponse:
    etat = r.etat_utilisateur(utilisateur_id)
    if etat is None:
        raise HTTPException(404, {"code": "introuvable", "message": "Aucun écran actif pour cet utilisateur"})
    return JSONResponse(json.loads(etat.model_dump_json(exclude_unset=True)))
