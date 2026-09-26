"""Routes des projets (espaces de travail) et de leurs fichiers dans le bunker (vue Documents)."""

import asyncio
import mimetypes

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import projets
from ..modeles import Projet
from . import bunker, config
from .fichiers import CheminInterdit, arborescence, fichier_du_projet
from .routes import verifier_jeton

routeur = APIRouter(prefix="/api/projets", tags=["projets"], dependencies=[Depends(verifier_jeton)])

# Le navigateur doit afficher ces fichiers, pas les télécharger ; le reste part en texte brut ou en binaire.
mimetypes.add_type("text/markdown", ".md")
mimetypes.add_type("text/csv", ".csv")


class NouveauProjet(BaseModel):
    nom: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)


class ListeProjets(BaseModel):
    utilisateur: str
    projets: list[Projet]


def _projet(projet_id: str) -> Projet:
    projet = projets.lire_projet(projet_id)
    if projet is None:
        raise HTTPException(404, f"Projet inexistant : {projet_id}")
    return projet


@routeur.get("")
def lister() -> ListeProjets:
    return ListeProjets(utilisateur=config.UTILISATEUR, projets=projets.lister_projets())


@routeur.post("", status_code=201)
async def creer(corps: NouveauProjet) -> Projet:
    projet = await asyncio.to_thread(projets.creer_projet, corps.nom, corps.description)
    await asyncio.to_thread(bunker.preparer_projet, projet.dossier)
    return projet


@routeur.get("/{projet_id}/fichiers")
def fichiers(projet_id: str) -> dict:
    """Arborescence du dossier du projet dans le bunker (sessions, documents et scripts du projet)."""
    return arborescence(bunker.dossier_projet(_projet(projet_id).dossier))


@routeur.get("/{projet_id}/fichier")
def fichier(projet_id: str, chemin: str) -> FileResponse:
    """Contenu d'un fichier du projet (`chemin` relatif au dossier du projet), pour l'aperçu."""
    racine = bunker.dossier_projet(_projet(projet_id).dossier)
    try:
        cible = fichier_du_projet(racine, chemin)
    except CheminInterdit:
        raise HTTPException(404, f"Fichier introuvable : {chemin}") from None
    type_ = mimetypes.guess_type(cible.name)[0] or "application/octet-stream"
    if type_.startswith("text/"):
        type_ += "; charset=utf-8"
    return FileResponse(cible, media_type=type_, content_disposition_type="inline")
