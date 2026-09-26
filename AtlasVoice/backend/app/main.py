"""Back d'Atlas vocal : couche vocale (WebSocket + Gradbot), registre des tâches, proxy LLM."""

from __future__ import annotations

import asyncio
import contextlib
import hmac
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import auth, config
from .affichage import api as affichage
from .affichage.relais import Relais
from .api import observabilite, taches
from .llm.proxy import ErreurLLM, completer
from .observabilite import journal
from .registre.service import Registre
from .registre.stockage import StockageMemoire

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("atlas")


def _stockage():
    if config.DATABASE_URL:
        from .registre.postgres import StockagePostgres

        return StockagePostgres(config.DATABASE_URL)
    log.warning("DATABASE_URL absent : registre en mémoire (perdu au redémarrage)")
    return StockageMemoire()


async def _purge_quotidienne() -> None:
    while True:
        with contextlib.suppress(Exception):
            n = journal.purger()
            if n:
                log.info("Journal : %d jour(s) purgé(s)", n)
        await asyncio.sleep(24 * 3600)


@contextlib.asynccontextmanager
async def cycle_de_vie(app: FastAPI) -> AsyncIterator[None]:
    registre = Registre(_stockage())
    await registre.demarrer()
    app.state.registre = registre
    app.state.relais = Relais()
    purge = asyncio.create_task(_purge_quotidienne())
    if not config.GRADIUM_API_KEY:
        log.warning("GRADIUM_API_KEY absent : les sessions vocales échoueront")
    if not config.AGENTS_API_KEY:
        log.warning("AGENTS_API_KEY absent : l'API des agents est ouverte")
    try:
        yield
    finally:
        purge.cancel()
        await registre.fermer()


app = FastAPI(title="Atlas vocal", lifespan=cycle_de_vie)
# En local, toute page servie depuis localhost ou 127.0.0.1 (quel que soit le port) est acceptée.
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS,
                   allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(taches.routeur)
app.include_router(taches.agents)
app.include_router(observabilite.routeur)
app.include_router(affichage.routeur)


@app.get("/health")
async def sante() -> dict:
    return {
        "ok": True,
        "registre": "postgres" if config.DATABASE_URL else "memoire",
        "voix": bool(config.GRADIUM_API_KEY),
        "llm": config.LLM_PRINCIPAL.nom if config.LLM_PRINCIPAL else None,
        "llm_secours": config.LLM_SECOURS.nom if config.LLM_SECOURS else None,
    }


@app.websocket("/ws/atlas")
async def session_vocale(websocket: WebSocket) -> None:
    from .voix.session import SessionVocale  # gradbot (extension native) chargé à la demande

    await websocket.accept()
    # Le jeton arrive dans le premier message, jamais dans l'URL.
    try:
        debut = await websocket.receive_json()
    except Exception:
        return
    if debut.get("type") != "start":
        await websocket.close(code=4000, reason="Message start attendu")
        return
    try:
        utilisateur = auth.utilisateur_depuis_jeton(debut.get("jeton"))
    except auth.ErreurAuth as e:
        await websocket.close(code=4401, reason=str(e)[:120])
        return
    await SessionVocale(websocket, app.state.registre, utilisateur, app.state.relais).executer(debut)


@app.post("/llm/v1/chat/completions")
async def llm(request: Request) -> StreamingResponse:
    """Appelé par Gradbot uniquement (jeton interne), jamais par le navigateur."""
    jeton = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(jeton, config.LLM_JETON_INTERNE):
        raise HTTPException(401, "Jeton interne invalide")
    corps = await request.json()
    flux = completer(corps)
    try:
        premier = await anext(flux)
    except ErreurLLM as e:
        raise HTTPException(502, str(e)) from e

    async def suite() -> AsyncIterator[str]:
        yield premier
        async for morceau in flux:
            yield morceau

    return StreamingResponse(suite(), media_type="text/event-stream")
