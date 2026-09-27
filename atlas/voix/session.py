"""Un appel vocal avec Atlas voix, relié au navigateur par WebSocket, dans une conversation d'Atlas.

Navigateur → serveur : trames binaires = micro en PCM 24 kHz 16 bits mono (80 ms) ; messages JSON `texte`,
`interrompre`, `consignes`, `reglages`, `lecture` (avancement de la lecture audio).
Serveur → navigateur : trames binaires = 4 octets de génération + PCM 48 kHz 16 bits mono ; messages JSON
`etat`, `partiel`, `utilisateur`, `agent_delta`, `agent_fin`, `outil`, `couper`, `taches`, `mesure`, `info`,
`erreur`.

Tours de parole : le VAD sémantique de Gradium dit quand Camille a fini (on vide le STT et le texte part à
Codex) et quand Camille parle pendant que la voix parle (on la coupe, et le tour Codex s'il écrit encore).
Pendant un outil, ce que dit Camille est injecté dans le tour (`steer`).

Avec l'orchestrateur : au décroché, la voix reçoit la fin de la conversation ; pendant l'appel, elle reçoit
ses étapes clés et sa réponse finale (gestionnaire.abonner) et les annonce dans les silences ; au raccrochage,
le pont (transcription de l'appel) est déposé pour son prochain tour. Toute la transcription est enregistrée dans
`messages` sous l'agent `/voix`.
"""

import asyncio
import contextlib
import json
import logging
import struct
import time
import uuid
import wave
from datetime import datetime
from pathlib import Path
from typing import Any

import websockets
from fastapi import WebSocket

from .. import conversations
from ..modeles import Conversation, Message
from ..orchestrateur.gestionnaire import Reglages, gestionnaire, titre_depuis
from ..orchestrateur.suivi_agents import Agent
from ..orchestrateur.traduction import traduire
from . import config
from .cerveau import Cerveau, Tache, Taches
from .contexte import VOIX, annonce, contexte_decroche, pont
from .gradium import Transcripteur
from .parleur import Parleur, Prechauffe
from .texte import est_echo

log = logging.getLogger(__name__)

DUREE_MAX_STT = 2700.0
"""Gradium limite une session STT à 3000 s : on la renouvelle avant, entre deux tours."""

PREFIXE_CONFIE = "[Transmis par Atlas voix, pendant un appel avec Camille]"


def consigne(texte: str) -> str:
    return f"[Consignes de Camille, à appliquer désormais pour toute la suite de l'appel : {texte}]"


def echauffement(contexte: str) -> str:
    return (
        f"[Contexte : fin de la conversation au moment où Camille t'appelle]\n{contexte}\n[Fin du contexte]\n\n"
        "[Système] Appel ouvert. Réponds uniquement « prêt », sans rien faire d'autre."
    )


class Session:
    def __init__(self, ws: WebSocket, conversation: Conversation, dossier: Path, projet_id: str | None):
        self.id = uuid.uuid4().hex[:12]
        self.ws = ws
        self.conversation = conversation
        self.cerveau = Cerveau(conversation.id, self.id, dossier, projet_id)
        self.taches = Taches(self.cerveau, self._tache_changee)
        self.prechauffe = Prechauffe()
        self.stt: Transcripteur | None = None
        self.casque = True
        self.reglages_orchestrateur = Reglages()
        self._envoi = asyncio.Lock()
        self._fond: list[asyncio.Task[Any]] = []
        self.debut = datetime.now()
        self.a_confie = False
        self.messages_appel: list[Message] = []
        self.agent = Agent(VOIX, "", None, "atlas_voice", time.time(), modele=config.MODELE, activite="Décroche")

        # Tour de Camille
        self.tampon: list[str] = []
        self.pas_fin = 0
        self.pas_parole = 0
        self.flush_attendu: int | None = None
        self.debut_fin_tour = 0.0

        # Tour de la voix
        self.tour: asyncio.Task[None] | None = None
        self.parleur: Parleur | None = None
        self.gen = 0
        self.lecture = {"gen": 0, "joue_s": 0.0, "fini": True, "t": 0.0}
        self.note_interruption = ""
        self.consignes = ""
        self.dit_recemment = ""
        self.annonces: list[str] = []
        self.evenements_orchestrateur: list[dict[str, Any]] = []
        self.pret = False
        self.dossier = dossier
        self._micro = bytearray() if config.ENREGISTRER else None
        self._tours: list[dict[str, Any]] = []

    # ── Arbre des agents ──

    def agents(self) -> list[dict[str, Any]]:
        """Atlas voix et ses petites tâches, au format de l'arbre des agents (suivi_agents.Agent)."""
        self.agent.tokens = self.cerveau.tokens
        self.agent.thread_id = self.cerveau.thread_id
        lignes = [self.agent.__dict__.copy()]
        for t in self.taches.liste.values():
            etat = {"en_cours": "actif", "terminee": "termine", "arretee": "interrompu"}.get(t.statut, "echec")
            lignes.append(
                Agent(
                    t.chemin,
                    t.thread_id,
                    VOIX,
                    "tache_vocale",
                    t.debut,
                    modele=config.MODELE_TACHES,
                    etat=etat,  # type: ignore[arg-type]
                    activite=t.etapes[-1] if t.etapes else "Démarre",
                    tokens=t.tokens,
                    nb_outils=len(t.etapes),
                    fin=t.fin,
                    resultat=t.resultat[:600] or None,
                ).__dict__.copy()
            )
        return lignes

    def _activite(self, activite: str, outil: str | None = None) -> None:
        self.agent.activite, self.agent.outil = activite, outil
        if outil:
            self.agent.nb_outils += 1

    # ── Enregistrement de la transcription ──

    async def enregistrer(self, role: str, contenu: str, donnees: Any = None, agent: str = VOIX) -> None:
        try:
            message = await asyncio.to_thread(
                conversations.ajouter_message, self.conversation.id, role, contenu, donnees=donnees, agent=agent
            )
            if agent == VOIX:
                self.messages_appel.append(message)
        except Exception:
            log.warning("message de l'appel non enregistré", exc_info=True)

    # ── Envois au navigateur ──

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
        self._activite({"ecoute": "À l'écoute", "reflexion": "Réfléchit", "demarrage": "Décroche"}.get(etat, etat))
        await self.envoyer({"type": "etat", "etat": etat})

    async def mesurer(self, nom: str, debut: float) -> None:
        await self.envoyer({"type": "mesure", "nom": nom, "ms": round((time.perf_counter() - debut) * 1000)})

    # ── Cycle de vie ──

    async def executer(self) -> None:
        await self.etat("demarrage")
        self.prechauffe.lancer()
        file = gestionnaire.abonner(self.conversation.id)
        try:
            await self.cerveau.demarrer()
            self._fond = [
                asyncio.create_task(self._boucle_stt()),
                asyncio.create_task(self._boucle_annonces()),
                asyncio.create_task(self._ecouter_orchestrateur(file)),
                asyncio.create_task(self.prechauffe.entretenir()),
                asyncio.create_task(self._echauffer()),
            ]
            while True:
                message = await self.ws.receive()
                if message.get("type") == "websocket.disconnect":
                    break
                if message.get("bytes") is not None:
                    await self._audio_micro(message["bytes"])
                elif message.get("text") is not None:
                    await self._commande(json.loads(message["text"]))
        except Exception as erreur:
            log.exception("appel %s", self.id)
            await self.envoyer({"type": "erreur", "message": str(erreur)})
        finally:
            gestionnaire.desabonner(self.conversation.id, file)
            await self.fermer()

    async def _echauffer(self) -> None:
        """Tour muet qui charge le contexte : le premier tour de Codex est le plus lent, il passe au décroché."""
        debut = time.perf_counter()
        try:
            precedents = await asyncio.to_thread(self._messages_recents)
            texte = echauffement(contexte_decroche(precedents, config.CONTEXTE_MESSAGES))
            async for _ in self.cerveau.tour(texte):
                pass
        except Exception:
            log.warning("échauffement de la voix", exc_info=True)
        self.pret = True
        await self.mesurer("echauffement", debut)
        await self.etat("ecoute")

    def _messages_recents(self) -> list[Message]:
        n = config.CONTEXTE_MESSAGES
        cid = self.conversation.id
        return conversations.lister_messages(cid, limite=n, derniers=True) + conversations.lister_messages(
            cid, limite=n, agent=VOIX, derniers=True
        )

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
        self.agent.etat, self.agent.fin, self.agent.outil = "termine", time.time(), None
        duree = round((self.agent.fin - self.agent.debut) / 60)
        self.agent.activite = "Appel terminé"
        self.agent.resultat = f"Appel de {duree} min, {len(self.messages_appel)} messages."
        if self._micro is not None:
            await asyncio.to_thread(self._ecrire_diagnostic)
        texte = pont(self.messages_appel, self.debut, datetime.now())
        if texte:
            gestionnaire.deposer_pont(self.conversation.id, texte)

    def _ecrire_diagnostic(self) -> None:
        """Micro reçu (PCM 24 kHz) et tours transcrits, pour comprendre une mauvaise transcription."""
        dossier = self.dossier / ".tmp"
        dossier.mkdir(parents=True, exist_ok=True)
        with wave.open(str(dossier / f"appel-{self.id}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(24000)
            w.writeframes(bytes(self._micro or b""))
        (dossier / f"appel-{self.id}.json").write_text(
            json.dumps(
                {"reglages": {"delai": config.STT_DELAI, "mots_cles": config.MOTS_CLES}, "tours": self._tours},
                ensure_ascii=False,
                indent=1,
            ),
            encoding="utf-8",
        )
        log.info("diagnostic de l'appel %s écrit dans %s", self.id, dossier)

    # ── Entrées du navigateur ──

    async def _audio_micro(self, pcm: bytes) -> None:
        if self._micro is not None:
            self._micro += pcm
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
            case "auth":
                pass  # déjà vérifié à l'ouverture (ou pas de jeton sur ce serveur)

    async def _reglages(self, message: dict[str, Any]) -> None:
        if "casque" in message:
            self.casque = bool(message["casque"])
        if message.get("voix") and message["voix"] != self.prechauffe.voix:
            self.prechauffe.voix = message["voix"]
            await self.prechauffe.renouveler()
        if "modele_orchestrateur" in message or "effort_orchestrateur" in message:
            self.reglages_orchestrateur = Reglages(
                effort=message.get("effort_orchestrateur") or None, modele=message.get("modele_orchestrateur") or None
            )

    async def _consignes(self, texte: str) -> None:
        self.consignes = texte.strip()
        if self.cerveau.occupe and await self.cerveau.orienter(consigne(self.consignes)):
            self.consignes = ""
        await self.envoyer({"type": "info", "message": "Consignes prises en compte."})

    # ── Transcription et tours de parole ──

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
                # Sans casque, la voix de l'agent revient dans le micro : on ne coupe que sur d'autres mots.
                if not self.casque and self.agent_parle() and not est_echo(partiel, self.dit_recemment):
                    await self.couper()
            case "step":
                vad = message.get("vad") or []
                if not vad:
                    return
                parle = vad[0]["inactivity_prob"] < config.COUPURE_SEUIL
                self.pas_parole = self.pas_parole + 1 if parle else 0
                if self.pas_parole <= 1:
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
                    if self._micro is not None:
                        self._tours.append({"fin_s": round(len(self._micro) / 48000, 2), "texte": texte})
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
        asyncio.create_task(self.enregistrer("utilisateur", texte, {"source": source}))
        if self.tour is not None and not self.tour.done():
            if self.cerveau.outil_actif and await self.cerveau.orienter(f"(Camille ajoute : « {texte} »)"):
                await self.envoyer({"type": "info", "message": "Transmis à Atlas voix pendant qu'il travaille."})
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

    # ── Réponse de la voix ──

    async def _repondre(self, message: str) -> None:
        while not self.pret:
            await asyncio.sleep(0.05)
        # Chaque réponse a sa génération audio : le navigateur remet son compteur de lecture à zéro.
        self.gen += 1
        gen = self.gen
        debut = time.perf_counter()

        async def premier_audio() -> None:
            self._activite("Parle")
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
                        if ev.texte.strip():
                            asyncio.create_task(self.enregistrer("assistant", ev.texte))
                    case "outil_debut":
                        self._activite(ev.texte, "Outil")
                        await self.envoyer({"type": "outil", "id": ev.id, "description": ev.texte, "fini": False})
                        await self.etat("travail")
                    case "outil_fin":
                        outil = {"id": ev.id, "description": ev.texte, "fini": True, "ok": ev.ok}
                        await self.envoyer({"type": "outil", **outil})
                        for ligne in traduire(ev.element or {}):
                            asyncio.create_task(self.enregistrer(ligne.role, ligne.contenu, ligne.donnees))
                        await self.etat("travail" if self.cerveau.outil_actif else "reflexion")
                    case "fin_tour":
                        await self.envoyer({"type": "fin_tour", "statut": ev.texte})
            if gen == self.gen:
                await parleur.terminer()
        except Exception as erreur:
            log.exception("tour de la voix")
            await self.envoyer({"type": "erreur", "message": str(erreur)})
        finally:
            if gen == self.gen:
                await self.etat("ecoute")

    # ── Orchestrateur (appelé par le serveur MCP `voix`) ──

    async def confier(self, consigne_: str) -> dict[str, Any]:
        """Confie du travail à l'orchestrateur : nouveau tour s'il est libre, sinon injecté dans son tour."""
        en_cours = gestionnaire.en_cours(self.conversation.id)
        if self.conversation.titre == conversations.TITRE_PAR_DEFAUT:
            # Sinon le titre serait tiré du message transmis, préfixe compris.
            self.conversation.titre = titre_depuis(consigne_)
            await asyncio.to_thread(
                conversations.modifier_conversation, self.conversation.id, titre=self.conversation.titre
            )
        texte = f"{PREFIXE_CONFIE} {consigne_.strip()}"
        await gestionnaire.envoyer(self.conversation, texte, reglages=self.reglages_orchestrateur, origine="voix")
        self.a_confie = True
        return {"transmis": True, "mode": "injecté dans son tour en cours" if en_cours else "nouveau tour lancé"}

    def etat_orchestrateur(self) -> dict[str, Any]:
        arbre = gestionnaire.agents(self.conversation.id)
        if arbre is None:
            return {"au_travail": False, "note": "L'orchestrateur ne travaille pas en ce moment."}
        return {
            "au_travail": True,
            "agents": [
                {
                    "chemin": a["chemin"],
                    "role": a["role"],
                    "etat": a["etat"],
                    "activite": a["activite"],
                    "resultat": (a.get("resultat") or "")[:300],
                    "duree_s": round((a.get("fin") or time.time()) - a["debut"]),
                }
                for a in arbre
            ],
        }

    async def arreter_orchestrateur(self) -> dict[str, Any]:
        return {"arrete": await gestionnaire.arreter(self.conversation.id)}

    async def _ecouter_orchestrateur(self, file: asyncio.Queue[dict[str, Any]]) -> None:
        while True:
            evenement = await file.get()
            if evenement.get("type") in ("etape", "fin"):
                self.evenements_orchestrateur.append(evenement)

    # ── Petites tâches ──

    async def _tache_changee(self, tache: Tache) -> None:
        await self.envoyer({"type": "taches", "taches": self.taches.etat()})
        if tache.statut != "en_cours":
            etat = {"terminee": "terminée", "arretee": "arrêtée", "erreur": "en échec"}[tache.statut]
            if tache.resultat:
                await self.enregistrer("assistant", tache.resultat, agent=tache.chemin)
            self.annonces.append(
                f"[Système] Tâche #{tache.id} « {tache.titre} » {etat}. Réponse du sous-agent :\n"
                f"{tache.resultat[:3000]}\n\nAnnonce-le à Camille en une ou deux phrases."
            )

    async def _boucle_annonces(self) -> None:
        """Annonce ce qui arrive (orchestrateur, tâches) dès que la conversation laisse un blanc."""
        while True:
            await asyncio.sleep(0.4)
            libre = (self.tour is None or self.tour.done()) and not self.agent_parle()
            if not (libre and not self.tampon and self.pas_parole == 0 and self.pret):
                continue
            # Les événements s'accumulent jusqu'au blanc : la fin du tour rend alors les étapes inutiles.
            textes, self.annonces = self.annonces, []
            if self.evenements_orchestrateur:
                texte = annonce(self.evenements_orchestrateur)
                self.evenements_orchestrateur = []
                if texte:
                    textes.append(texte)
            if textes:
                self.tour = asyncio.create_task(self._repondre("\n\n".join(textes)))
