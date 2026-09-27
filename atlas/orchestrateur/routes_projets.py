"""Routes des projets (espaces de travail) et de leurs fichiers dans le bunker (vue Documents)."""

import asyncio
import mimetypes
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import conversations, ecriture, projets
from ..modeles import Projet
from . import bunker, config
from .fichiers import CheminInterdit, arborescence, fichier_du_projet
from .gestionnaire import gestionnaire
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


@routeur.delete("/{projet_id}", status_code=204)
async def supprimer(projet_id: str) -> None:
    """Retire l'espace des listes ; refusé pour l'espace par défaut et tant qu'un agent y travaille."""
    projet = _projet(projet_id)
    sessions = await asyncio.to_thread(conversations.lister_conversations, projet_id)
    if any(gestionnaire.en_cours(c.id) or gestionnaire.actif(c.id) for c in sessions):
        raise HTTPException(409, "Un agent travaille encore dans cet espace : arrête-le avant de supprimer l’espace.")
    try:
        await asyncio.to_thread(projets.supprimer_projet, projet)
    except projets.ProjetNonSupprimable as e:
        raise HTTPException(409, str(e)) from None


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


class OperationsVue(BaseModel):
    operations: list[dict[str, Any]] = Field(min_length=1)
    essai: bool = False
    """Valide sans rien écrire."""


@routeur.post("/{projet_id}/vue")
def organiser_vue(projet_id: str, corps: OperationsVue) -> dict:
    """Réarrange la vue de l'espace (mêmes opérations que l'outil MCP organiser_vue), au nom de l'utilisateur."""
    _projet(projet_id)
    try:
        return ecriture.organiser_vue(
            projet_id=projet_id, operations=corps.operations, auteur=config.UTILISATEUR, essai=corps.essai
        )
    except ecriture.ErreurGraphe as e:
        raise HTTPException(422, str(e)) from None
