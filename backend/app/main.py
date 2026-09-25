import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config, graphe
from .agents import chercheur, verificateur
from .graphe import ErreurGraphe
from .modele import Noeud
from .runs import gestionnaire

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Atlas")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DemandeResoudre(BaseModel):
    objectif: str = Field(min_length=1)


class DemandeVerifier(BaseModel):
    ids: list[str] | None = None


def _occupe() -> HTTPException:
    return HTTPException(409, f"Un agent tourne déjà : {gestionnaire.etat()}")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "run": gestionnaire.etat(), "dernier_resultat": gestionnaire.dernier_resultat}


@app.post("/resoudre", status_code=202)
def resoudre(demande: DemandeResoudre) -> dict:
    objectif = demande.objectif.strip()
    if not gestionnaire.lancer("chercheur", lambda stop, progres: chercheur.lancer(objectif, stop, progres)):
        raise _occupe()
    return {"lance": "chercheur"}


@app.post("/verifier", status_code=202)
def verifier(demande: DemandeVerifier | None = None) -> dict:
    ids = demande.ids if demande else None
    if not gestionnaire.lancer("verificateur", lambda stop, progres: verificateur.lancer(ids, stop, progres)):
        raise _occupe()
    return {"lance": "verificateur"}


@app.post("/stop")
def stop() -> dict:
    return {"arret_demande": gestionnaire.arreter()}


@app.get("/export")
def exporter() -> list[dict]:
    return graphe.exporter()


@app.post("/import")
def importer(noeuds: list[Noeud]) -> dict:
    try:
        return graphe.importer(noeuds)
    except ErreurGraphe as e:
        raise HTTPException(400, str(e)) from e
