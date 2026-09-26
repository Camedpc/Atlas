"""Serveur longue durée : lecture du graphe + conversations avec l'orchestrateur.

En local comme sur une VM : uvicorn atlas.serveur:app --port 8000
En dev, ajouter `--reload --reload-dir atlas --reload-dir api` : sans --reload-dir, les fichiers que l'agent
écrit dans espace/ redémarreraient le serveur en pleine exécution.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import conversations, routes_lecture
from .orchestrateur import config, routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s : %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def cycle_de_vie(_: FastAPI):
    try:
        await asyncio.to_thread(conversations.solder_executions_orphelines)
    except Exception:
        log.exception("Impossible de solder les exécutions orphelines (Supabase injoignable ?)")
    yield


app = FastAPI(title="Atlas", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=cycle_de_vie)
if config.CORS_ORIGINES:
    app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINES, allow_methods=["*"], allow_headers=["*"])
app.include_router(routes_lecture.routeur)
app.include_router(routes.routeur)
