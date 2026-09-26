"""Une conversation vocale en direct, reliée à un navigateur par WebSocket.

Navigateur → serveur : trames binaires = micro en PCM 24 kHz 16 bits mono (80 ms) ; messages JSON `texte`,
`interrompre`, `consignes`, `reglages`, `lecture` (avancement de la lecture audio).
Serveur → navigateur : trames binaires = 4 octets de génération + PCM 48 kHz 16 bits mono ; messages JSON
`etat`, `partiel`, `utilisateur`, `agent_delta`, `agent_fin`, `outil`, `couper`, `taches`, `mesure`, `info`,
`erreur`.

Tours de parole : le VAD sémantique de Gradium (une mesure toutes les 80 ms) dit quand Camille a fini (alors on
vide le STT et le texte part à Codex) et quand Camille parle pendant que l'agent parle (on coupe la voix, et le
tour Codex s'il est encore en train d'écrire). Si l'agent est en train d'exécuter un outil, ce que dit Camille
est injecté dans son tour (`steer`) au lieu de l'interrompre.
"""

import asyncio
import contextlib
import json
import logging
import struct
import time
import uuid
from typing import Any

import websockets
from fastapi import WebSocket

from . import config
from .cerveau import Cerveau, Tache, Taches
from .gradium import Transcripteur
from .parleur import Parleur, Prechauffe
from .texte import est_echo

log = logging.getLogger(__name__)

DUREE_MAX_STT = 2700.0
"""Gradium limite une session STT à 3000 s : on la renouvelle avant, entre deux tours."""

ECHAUFFEMENT = "[Système] Session vocale ouverte. Réponds uniquement « prêt », sans rien faire d'autre."


def consigne(texte: str) -> str:
    return f"[Consignes de Camille, à appliquer désormais pour toute la conversation : {texte}]"


class Session:
    def __init__(self, ws: WebSocket, url_serveur: str):
        self.id = uuid.uuid4().hex[:10]
        self.ws = ws
        self.cerveau = Cerveau(self.id, url_serveur)
        self.taches = Taches(self.cerveau, self._tache_changee)
        self.prechauffe = Prechauffe()
        self.stt: Transcripteur | None = None
        self.casque = True
        self._envoi = asyncio.Lock()
        self._fond: list[asyncio.Task[Any]] = []

        # Tour de Camille
        self.tampon: list[str] = []
        self.pas_fin = 0
        self.pas_parole = 0
        self.flush_attendu: int | None = None
        self.debut_fin_tour = 0.0

        # Tour de l'agent
        self.tour: asyncio.Task[None] | None = None
        self.parleur: Parleur | None = None
        self.gen = 0
        self.lecture = {"gen": 0, "joue_s": 0.0, "fini": True, "t": 0.0}
        self.note_interruption = ""
        self.consignes = ""
        self.dit_recemment = ""
        self.annonces: list[str] = []
        self.pret = False

    # ---------- Envois ----------

    async def envoyer(self, message: dict[str, Any]) -> None:
        async with self._envoi:
            with contextlib.suppress(Exception):
                await self.ws.send_text(json.dumps(message, ensure_ascii=False))

    async def envoyer_audio(self, gen: int, pcm: bytes) -> None:
        if gen != self.gen:
            return
        async with self._envoi:
            with contextlib.suppress(Exception):
                await self.ws.send_bytes(struct.pack("<I", gen) + pcm)

    async def etat(self, etat: str) -> None:
        await self.envoyer({"type": "etat", "etat": etat})

    async def mesurer(self, nom: str, debut: float) -> None:
        """Latence affichée dans l'interface (et lue par les essais)."""
        await self.envoyer({"type": "mesure", "nom": nom, "ms": round((time.perf_counter() - debut) * 1000)})

    # ---------- Cycle de vie ----------

    async def executer(self) -> None:
        await self.etat("demarrage")
        self.prechauffe.lancer()
        try:
            await self.cerveau.demarrer()
        except Exception as erreur:
            await self.envoyer({"type": "erreur", "message": str(erreur)})
            raise
        self._fond = [
            asyncio.create_task(self._boucle_stt()),
            asyncio.create_task(self._boucle_annonces()),
            asyncio.create_task(self.prechauffe.entretenir()),
            asyncio.create_task(self._echauffer()),
        ]
        try:
            while True:
                message = await self.ws.receive()
                if message.get("type") == "websocket.disconnect":
                    break
                if message.get("bytes") is not None:
                    await self._audio_micro(message["bytes"])
                elif message.get("text") is not None:
                    await self._commande(json.loads(message["text"]))
        finally:
            await self.fermer()

    async def _echauffer(self) -> None:
        """Premier tour muet : le premier vrai tour de Codex est deux à trois fois plus lent que les suivants."""
        debut = time.perf_counter()
        with contextlib.suppress(Exception):
            async for _ in self.cerveau.tour(ECHAUFFEMENT):
                pass
        self.pret = True
        await self.mesurer("echauffement", debut)
        await self.etat("ecoute")

    async def fermer(self) -> None:
        for tache in self._fond:
            tache.cancel()
        if self.parleur is not None:
            await self.parleur.arreter()
        if self.tour is not None:
            self.tour.cancel()
        for id_ in list(self.taches.liste):
            with contextlib.suppress(Exception):
                await self.taches.arreter(id_)
        with contextlib.suppress(Exception):
            await self.prechauffe.fermer()
        if self.stt is not None:
            with contextlib.suppress(Exception):
                await self.stt.fermer()
        with contextlib.suppress(Exception):
            await self.cerveau.fermer()

    # ---------- Entrées du navigateur ----------

    async def _audio_micro(self, pcm: bytes) -> None:
        if self.stt is not None:
            with contextlib.suppress(Exception):
                await self.stt.envoyer(pcm)

    async def _commande(self, message: dict[str, Any]) -> None:
        match message.get("type"):
            case "texte":
                await self.tour_utilisateur(str(message.get("texte", "")), "clavier")
            case "interrompre":
                await self.couper()
            case "consignes":
                await self._consignes(str(message.get("texte", "")))
            case "lecture":
                self.lecture = {
                    "gen": int(message.get("gen", 0)),
                    "joue_s": float(message.get("joue_s", 0)),
                    "fini": bool(message.get("fini")),
                    "t": time.monotonic(),
                }
            case "reglages":
                await self._reglages(message)

    async def _reglages(self, message: dict[str, Any]) -> None:
        if "casque" in message:
            self.casque = bool(message["casque"])
        if message.get("voix") and message["voix"] != self.prechauffe.voix:
            self.prechauffe.voix = message["voix"]
            await self.prechauffe.renouveler()
        if message.get("modele"):
            self.cerveau.modele = message["modele"]
        if message.get("effort"):
            self.cerveau.effort = message["effort"]

    async def _consignes(self, texte: str) -> None:
        self.consignes = texte.strip()
        if self.cerveau.occupe and await self.cerveau.orienter(consigne(self.consignes)):
            self.consignes = ""
        await self.envoyer({"type": "info", "message": "Consignes prises en compte."})

    # ---------- Transcription et tours de parole ----------

    async def _boucle_stt(self) -> None:
        while True:
            stt = Transcripteur()
            try:
                await stt.ouvrir()
                self.stt = stt
                ouverture = time.monotonic()
                async for message in stt.messages():
                    await self._sur_stt(message)
                    if time.monotonic() - ouverture > DUREE_MAX_STT and not self.tampon:
                        break
            except (websockets.ConnectionClosed, RuntimeError, OSError) as erreur:
                log.warning("STT interrompu : %s", erreur)
                await self.envoyer({"type": "info", "message": f"Transcription relancée ({erreur})."})
                await asyncio.sleep(0.5)
            finally:
                self.stt = None
                self.flush_attendu = None
                with contextlib.suppress(Exception):
                    await stt.fermer()

    def agent_parle(self) -> bool:
        if self.parleur is not None and self.parleur.gen == self.gen and not self.parleur.arrete:
            if self.tour is not None and not self.tour.done() and self.parleur.envoye_premier:
                return True
        return self.lecture["gen"] == self.gen and not self.lecture["fini"]

    def joue_estime(self) -> float:
        if self.lecture["gen"] != self.gen:
            return 0.0
        joue = float(self.lecture["joue_s"])
        if not self.lecture["fini"]:
            joue += time.monotonic() - float(self.lecture["t"])
        return joue

    async def _sur_stt(self, message: dict[str, Any]) -> None:
        match message.get("type"):
            case "text":
                self.tampon.append(message["text"])
                self.pas_fin = 0
                partiel = " ".join(self.tampon)
                await self.envoyer({"type": "partiel", "texte": partiel})
                # Sans casque, la voix de l'agent revient dans le micro : on ne coupe que sur des mots qui
                # ne sont pas les siens.
                if not self.casque and self.agent_parle() and not est_echo(partiel, self.dit_recemment):
                    await self.couper()
            case "step":
                vad = message.get("vad") or []
                if not vad:
                    return
                parle = vad[0]["inactivity_prob"] < config.COUPURE_SEUIL
                self.pas_parole = self.pas_parole + 1 if parle else 0
                if self.pas_parole == 1 or self.pas_parole == 0:
                    await self.envoyer({"type": "vad", "parle": parle})
                if self.casque and self.pas_parole >= config.COUPURE_PAS and self.agent_parle():
                    await self.couper()
                if self.tampon and self.flush_attendu is None and self.stt is not None:
                    silence = vad[min(config.FIN_TOUR_HORIZON, len(vad) - 1)]["inactivity_prob"] > config.FIN_TOUR_SEUIL
                    self.pas_fin = self.pas_fin + 1 if silence else 0
                    if self.pas_fin >= config.FIN_TOUR_PAS:
                        self.debut_fin_tour = time.perf_counter()
                        self.flush_attendu = await self.stt.vider()
            case "flushed":
                if message.get("flush_id") == self.flush_attendu:
                    texte = " ".join(self.tampon)
                    self.tampon, self.flush_attendu, self.pas_fin = [], None, 0
                    await self.mesurer("flush", self.debut_fin_tour)
                    await self.tour_utilisateur(texte, "voix")

    async def tour_utilisateur(self, texte: str, source: str) -> None:
        texte = texte.strip()
        if not texte:
            return
        if source == "voix" and not self.casque and self.agent_parle() and est_echo(texte, self.dit_recemment):
            await self.envoyer({"type": "info", "message": f"Écho ignoré : « {texte} »"})
            return
        await self.envoyer({"type": "utilisateur", "texte": texte, "source": source})
        if self.tour is not None and not self.tour.done():
            if self.cerveau.outil_actif and await self.cerveau.orienter(f"(Camille ajoute : « {texte} »)"):
                await self.envoyer({"type": "info", "message": "Transmis à l'agent pendant qu'il travaille."})
                return
            await self.couper()
            with contextlib.suppress(asyncio.TimeoutError, asyncio.CancelledError):
                await asyncio.wait_for(asyncio.shield(self.tour), 6)
        elif self.agent_parle():
            await self.couper()
        self.tour = asyncio.create_task(self._repondre(self._preparer(texte)))

    def _preparer(self, texte: str) -> str:
        entetes = []
        if self.consignes:
            entetes.append(consigne(self.consignes))
            self.consignes = ""
        if self.note_interruption:
            entetes.append(self.note_interruption)
            self.note_interruption = ""
        return "\n".join([*entetes, texte])

    async def couper(self) -> None:
        """Camille reprend la parole : la voix s'arrête net, et le tour Codex s'il est encore en train d'écrire."""
        parleur = self.parleur
        if parleur is not None and parleur.gen == self.gen:
            entendu, complet = parleur.entendu(self.joue_estime())
            if not complet:
                self.note_interruption = f"(Tu as été interrompu. Camille a entendu : « {entendu or '…'} »)"
            await parleur.arreter()
        self.gen += 1
        await self.envoyer({"type": "couper", "gen": self.gen})
        if self.tour is not None and not self.tour.done() and not self.cerveau.outil_actif:
            await self.cerveau.interrompre()

    # ---------- Réponse de l'agent ----------

    async def _repondre(self, message: str) -> None:
        while not self.pret:
            await asyncio.sleep(0.05)
        # Chaque réponse a sa génération audio : le navigateur remet son compteur de lecture à zéro, et ce que
        # Camille a entendu se calcule sur cette seule réponse.
        self.gen += 1
        gen = self.gen
        debut = time.perf_counter()

        async def premier_audio() -> None:
            await self.mesurer("premier_son", debut)

        parleur = Parleur(gen, self.prechauffe, self.envoyer_audio, premier_audio)
        self.parleur = parleur
        await self.etat("reflexion")
        premier_texte = True
        try:
            async for ev in self.cerveau.tour(message):
                if gen != self.gen:
                    continue  # coupé : on laisse le tour se terminer sans rien dire
                match ev.type:
                    case "texte":
                        if premier_texte:
                            premier_texte = False
                            await self.mesurer("premier_mot", debut)
                        parleur.texte(ev.id, ev.texte)
                        await self.envoyer({"type": "agent_delta", "id": ev.id, "texte": ev.texte})
                    case "fin_message":
                        parleur.fin_message(ev.id)
                        self.dit_recemment = (self.dit_recemment + " " + ev.texte)[-800:]
                        await self.envoyer({"type": "agent_fin", "id": ev.id, "texte": ev.texte})
                    case "outil_debut" | "outil_fin":
                        outil = {"id": ev.id, "description": ev.texte, "fini": ev.type == "outil_fin", "ok": ev.ok}
                        await self.envoyer({"type": "outil", **outil})
                        await self.etat("travail" if self.cerveau.outil_actif else "reflexion")
                    case "fin_tour":
                        await self.envoyer({"type": "fin_tour", "statut": ev.texte})
            if gen == self.gen:
                await parleur.terminer()
        except Exception as erreur:
            log.exception("tour de l'agent")
            await self.envoyer({"type": "erreur", "message": str(erreur)})
        finally:
            if gen == self.gen:
                await self.etat("ecoute")

    # ---------- Tâches de fond ----------

    async def _tache_changee(self, tache: Tache) -> None:
        await self.envoyer({"type": "taches", "taches": self.taches.etat()})
        if tache.statut != "en_cours":
            etat = {"terminee": "terminée", "arretee": "arrêtée", "erreur": "en échec"}[tache.statut]
            self.annonces.append(
                f"[Système] Tâche #{tache.id} « {tache.titre} » {etat}. Réponse du sous-agent :\n"
                f"{tache.resultat[:3000]}\n\nAnnonce-le à Camille en une ou deux phrases."
            )

    async def _boucle_annonces(self) -> None:
        """Annonce les tâches finies dès que la conversation laisse un blanc."""
        while True:
            await asyncio.sleep(0.4)
            libre = (self.tour is None or self.tour.done()) and not self.agent_parle()
            if self.annonces and libre and not self.tampon and self.pas_parole == 0 and self.pret:
                message, self.annonces = "\n\n".join(self.annonces), []
                self.tour = asyncio.create_task(self._repondre(message))
