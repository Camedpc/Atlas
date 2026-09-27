"""Routes de l'admin du site (page /admin) : espace de démo, sa réinitialisation, vidéo de la page d'accueil.

Protégées par le mot de passe admin (ATLAS_MDP_ADMIN, en-tête `X-Atlas-Admin`), pas par le jeton d'accès : la page
de démo propose aussi « Réinitialiser », à qui connaît ce mot de passe.
"""

import asyncio
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from .. import projets, site
from . import config, demo


def verifier_admin(x_atlas_admin: str | None = Header(default=None)) -> None:
    if config.MDP_ADMIN is None:
        raise HTTPException(503, "Page admin désactivée : renseigner ATLAS_MDP_ADMIN sur le serveur.")
    if x_atlas_admin is None or not secrets.compare_digest(x_atlas_admin.encode(), config.MDP_ADMIN.encode()):
        raise HTTPException(401, "Mot de passe admin incorrect.")


routeur = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(verifier_admin)])


class ChoixDemo(BaseModel):
    modele_id: str


@routeur.get("")
def etat() -> dict:
    """Espaces, réglages de la démo et médias de la page d'accueil."""
    return {
        "projets": [p.model_dump(mode="json") for p in projets.lister_projets()],
        "demo": site.lire(site.DEMO),
        "site": site.etat_public(),
        "video": site.lire(site.VIDEO),
    }


async def _reinitialiser(modele_id: str | None) -> dict:
    try:
        copie = await asyncio.to_thread(demo.reinitialiser, modele_id)
    except demo.DemoIndisponible as e:
        raise HTTPException(409, str(e)) from None
    return {"ok": True, "copie": copie.model_dump(mode="json")}


@routeur.put("/demo")
async def choisir_demo(corps: ChoixDemo) -> dict:
    """L'espace devient le modèle de la démo, et la copie de travail repart de lui."""
    return await _reinitialiser(corps.modele_id)


@routeur.post("/demo/reinitialiser")
async def reinitialiser() -> dict:
    """Remet la démo dans l'état du modèle : tout ce que le jury y a fait disparaît."""
    return await _reinitialiser(None)


@routeur.post("/media/{genre}")
async def televerser(genre: str, requete: Request, nom: str = "video.mp4") -> dict:
    """Corps = le fichier brut (Content-Type = son type) : devient la vidéo (ou l'affiche) de la page d'accueil."""
    contenu = await requete.body()
    type_ = (requete.headers.get("content-type") or "").split(";")[0].strip()
    try:
        return await asyncio.to_thread(site.televerser, genre, nom, type_, contenu)
    except site.MediaRefuse as e:
        raise HTTPException(422, str(e)) from None
