"""Serveur local de l'agent vocal : page de test, WebSocket de la conversation, API des tâches (pour le MCP).

    ../.venv/Scripts/python -m uvicorn voix.serveur:app --port 8010      (depuis voix-live/)
"""

import contextlib
import logging

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config
from .session import Session

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s : %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(title="Atlas voix live")
STATIQUE = config.RACINE / "web"
app.mount("/web", StaticFiles(directory=STATIQUE), name="web")

SESSIONS: dict[str, Session] = {}


@app.get("/")
def page() -> FileResponse:
    return FileResponse(STATIQUE / "index.html")


@app.get("/api/sante")
def sante() -> dict:
    return {"gradium": bool(config.GRADIUM_API_KEY), "modele": config.MODELE, "sessions": len(SESSIONS)}


@app.websocket("/ws")
async def conversation(ws: WebSocket) -> None:
    await ws.accept()
    # L'offre Gradium limite les sessions simultanées : une seule conversation à la fois.
    for ancienne in list(SESSIONS.values()):
        with contextlib.suppress(Exception):
            await ancienne.ws.close()
    session = Session(ws, f"http://127.0.0.1:{ws.url.port or config.PORT}")
    SESSIONS[session.id] = session
    log.info("session %s ouverte", session.id)
    try:
        await session.executer()
    except Exception:
        log.exception("session %s", session.id)
    finally:
        SESSIONS.pop(session.id, None)
        log.info("session %s fermée", session.id)


# ---------- Tâches (appelées par voix/mcp_taches.py) ----------


def _session(id_: str) -> Session:
    if id_ not in SESSIONS:
        raise HTTPException(404, "session inconnue")
    return SESSIONS[id_]


class NouvelleTache(BaseModel):
    titre: str = ""
    consigne: str


class Message(BaseModel):
    message: str = ""


@app.get("/api/sessions/{id_}/taches")
def lister_taches(id_: str) -> list[dict]:
    return _session(id_).taches.etat()


@app.post("/api/sessions/{id_}/taches")
async def lancer_tache(id_: str, corps: NouvelleTache) -> dict:
    tache = _session(id_).taches.lancer(corps.titre, corps.consigne)
    return {"id": tache.id, "statut": "lancée", "note": "Le résultat arrivera dans un message [Système]."}


@app.post("/api/sessions/{id_}/taches/{tache}/consigne")
async def consigner(id_: str, tache: int, corps: Message) -> dict:
    return {"transmis": await _session(id_).taches.orienter(tache, corps.message)}


@app.post("/api/sessions/{id_}/taches/{tache}/arreter")
async def arreter(id_: str, tache: int) -> dict:
    return {"arretee": await _session(id_).taches.arreter(tache)}
