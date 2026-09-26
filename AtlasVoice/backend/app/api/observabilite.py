"""Tableau de bord (section 6.4) et relecture des sessions."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .. import auth
from ..observabilite import journal
from ..observabilite.metriques import _quantiles, metriques
from ..registre.modele import Statut, maintenant
from ..registre.service import Registre

routeur = APIRouter(prefix="/api")


class Reveil(BaseModel):
    # Réveil sans parole de l'utilisateur dans les secondes qui suivent : probable faux réveil.
    faux: bool


@routeur.post("/metriques/reveil", status_code=204)
async def signaler_reveil(corps: Reveil, _u: str = Depends(auth.utilisateur)) -> None:
    metriques.enregistrer_reveil(corps.faux)


@routeur.get("/metriques")
async def tableau_de_bord(request: Request, _u: str = Depends(auth.utilisateur)) -> dict:
    registre: Registre = request.app.state.registre
    finies = await registre.stockage.lister(
        statuts=[Statut.TERMINEE, Statut.ECHOUEE], depuis=maintenant() - timedelta(days=1), limite=1000)
    durees: dict[str, dict] = {}
    for agent in sorted({t.type_agent for t in finies}):
        taches = [t for t in finies if t.type_agent == agent]
        durees[agent] = {
            "duree_ms": _quantiles([(t.termine_le - t.cree_le).total_seconds() for t in taches if t.termine_le]),
            "echecs": sum(1 for t in taches if t.statut == Statut.ECHOUEE),
        }
    return metriques.resume() | {"taches_24h": durees}


@routeur.get("/sessions")
async def sessions(_u: str = Depends(auth.utilisateur)) -> list[dict]:
    return journal.lister_sessions()


@routeur.get("/sessions/{session_id}")
async def relire(session_id: str, _u: str = Depends(auth.utilisateur)) -> list[dict]:
    lignes = journal.lire_session(session_id)
    if lignes is None:
        raise HTTPException(404, "Session inconnue")
    return lignes
