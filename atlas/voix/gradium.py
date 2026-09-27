"""Clients WebSocket Gradium : transcription (STT) en continu et synthèse (TTS) en flux.

Protocole brut (pas de SDK) : un message `setup`, le serveur répond `ready`, puis l'audio ou le texte part en
JSON (`audio` en base64). Voir https://docs.gradium.ai/guides/websocket-lifecycle.
"""

import asyncio
import base64
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import websockets

from . import config

log = logging.getLogger(__name__)


def _entetes() -> dict[str, str]:
    if not config.GRADIUM_API_KEY:
        raise RuntimeError("GRADIUM_API_KEY manquante (voix-live/.env)")
    return {"x-api-key": config.GRADIUM_API_KEY}


class Transcripteur:
    """Une session STT ouverte : on pousse du PCM 24 kHz 16 bits mono, on lit les messages du serveur."""

    def __init__(self, langue: str | None = None, delai: int | None = None, mots_cles: list[str] | None = None):
        self.langue = langue or config.STT_LANGUE
        self.delai = delai if delai is not None else config.STT_DELAI
        self.mots_cles = mots_cles if mots_cles is not None else config.MOTS_CLES
        self._ws: Any = None
        self.pret: dict[str, Any] = {}
        self._flush = 0

    async def ouvrir(self) -> None:
        self._ws = await websockets.connect(
            f"{config.GRADIUM_WSS}/api/speech/asr", additional_headers=_entetes(), max_size=None
        )
        reglages: dict[str, Any] = {"language": self.langue, "delay_in_frames": self.delai}
        if config.STT_TEMPERATURE is not None:
            reglages["temp"] = config.STT_TEMPERATURE
        if self.mots_cles:
            reglages["keywords"] = {"words": self.mots_cles, "boost": config.STT_BOOST}
        await self._ws.send(
            json.dumps({"type": "setup", "model_name": "default", "input_format": "pcm", "json_config": reglages})
        )
        self.pret = json.loads(await self._ws.recv())
        if self.pret.get("type") != "ready":
            raise RuntimeError(f"STT Gradium refusé : {self.pret}")

    async def envoyer(self, pcm: bytes) -> None:
        await self._ws.send(json.dumps({"type": "audio", "audio": base64.b64encode(pcm).decode()}))

    async def vider(self) -> int:
        """Demande au serveur de traiter tout l'audio reçu ; il répond `flushed` avec le même identifiant."""
        self._flush += 1
        await self._ws.send(json.dumps({"type": "flush", "flush_id": self._flush}))
        return self._flush

    async def terminer(self) -> None:
        try:
            await self._ws.send(json.dumps({"type": "end_of_stream"}))
        except websockets.ConnectionClosed:
            pass

    async def fermer(self) -> None:
        if self._ws is not None:
            await self._ws.close()

    async def messages(self) -> AsyncIterator[dict[str, Any]]:
        async for brut in self._ws:
            message = json.loads(brut)
            if message.get("type") == "error":
                raise RuntimeError(f"STT Gradium : {message.get('message')}")
            yield message


class Synthese:
    """Une réponse parlée : on envoie le texte au fil de l'eau, on lit l'audio PCM 48 kHz 16 bits mono.

    La connexion est ouverte à l'avance (`ouvrir`) pour ne pas payer la poignée de main au moment de parler.
    Pour couper la parole, on ferme simplement la connexion (recommandation Gradium).
    """

    def __init__(self, voix: str | None = None):
        self.voix = voix or config.VOIX
        self._ws: Any = None
        self.fermee = False

    async def ouvrir(self) -> "Synthese":
        self._ws = await websockets.connect(
            f"{config.GRADIUM_WSS}/api/speech/tts", additional_headers=_entetes(), max_size=None
        )
        setup: dict[str, Any] = {
            "type": "setup",
            "voice_id": self.voix,
            "model_name": config.TTS_MODELE,
            "output_format": "pcm",
        }
        if config.TTS_VITESSE is not None:
            setup["json_config"] = {"padding_bonus": config.TTS_VITESSE}
        await self._ws.send(json.dumps(setup))
        pret = json.loads(await self._ws.recv())
        if pret.get("type") != "ready":
            raise RuntimeError(f"TTS Gradium refusé : {pret}")
        return self

    async def texte(self, morceau: str) -> None:
        if not self.fermee and morceau.strip():
            await self._ws.send(json.dumps({"type": "text", "text": morceau}))

    async def fin(self) -> None:
        if not self.fermee:
            await self._ws.send(json.dumps({"type": "end_of_stream"}))

    async def fermer(self) -> None:
        self.fermee = True
        if self._ws is not None:
            await self._ws.close()

    async def evenements(self) -> AsyncIterator[dict[str, Any]]:
        """`audio` (octets PCM décodés dans `pcm`), `text` (segment prononcé et son `start_s`), puis fin."""
        try:
            async for brut in self._ws:
                message = json.loads(brut)
                match message.get("type"):
                    case "audio":
                        message["pcm"] = base64.b64decode(message.pop("audio"))
                        yield message
                    case "text":
                        yield message
                    case "end_of_stream":
                        return
                    case "error":
                        raise RuntimeError(f"TTS Gradium : {message.get('message')}")
        except websockets.ConnectionClosed:
            return


async def synthetiser(texte: str, voix: str | None = None) -> bytes:
    """Synthèse complète d'un texte (PCM 48 kHz) : pour les essais et la génération de voix de test."""
    synthese = await Synthese(voix).ouvrir()
    morceaux: list[bytes] = []

    async def lire() -> None:
        async for evenement in synthese.evenements():
            if "pcm" in evenement:
                morceaux.append(evenement["pcm"])

    lecteur = asyncio.create_task(lire())
    await synthese.texte(texte)
    await synthese.fin()
    await lecteur
    await synthese.fermer()
    return b"".join(morceaux)
