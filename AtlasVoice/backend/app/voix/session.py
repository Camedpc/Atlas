"""Une session vocale : navigateur ↔ WebSocket ↔ Gradbot (Gradium STT/TTS + modèle d'Atlas).

Délégation asynchrone : chaque outil qui met une tâche en mouvement garde son appel ouvert
(« outil différé » de Gradbot). Le premier résultat part tout de suite (« je lance… ») ; les suivants
(question, proposition, résultat) sont envoyés sur le même appel quand le registre notifie un changement.
Gradbot ne les fait lire qu'une fois l'utilisateur silencieux : Atlas ne coupe pas la parole.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
import uuid
from collections import deque
from typing import Any

import fastapi
import gradbot

from .. import config
from ..observabilite.journal import JournalSession
from ..observabilite.metriques import metriques
from ..registre.modele import STATUTS_A_ANNONCER, STATUTS_FINAUX, Contexte, Statut, Tache
from ..registre.service import Registre
from . import prompt
from .outils import DEFINITIONS, Outils, rapport, schema_json

log = logging.getLogger(__name__)

FIN_SESSION = re.compile(
    r"^\W*(merci,?\s+atlas|stop|au revoir(\s+atlas)?|c'est tout,?\s+merci(\s+atlas)?|bonne nuit\s+atlas)\W*$",
    re.IGNORECASE,
)
NB_ECHANGES_CONTEXTE = 6
DELAI_MAJ_PROMPT_S = 0.3


def phrase_de_fin(texte: str) -> bool:
    return bool(FIN_SESSION.match(texte.strip()))


def _outils_gradbot() -> list[gradbot.ToolDef]:
    return [gradbot.ToolDef(d["name"], d["description"], schema_json(d)) for d in DEFINITIONS]


class SessionVocale:
    def __init__(self, websocket: fastapi.WebSocket, registre: Registre, utilisateur_id: str) -> None:
        self.ws = websocket
        self.registre = registre
        self.utilisateur_id = utilisateur_id
        self.session_id = uuid.uuid4().hex[:16]
        self.journal = JournalSession(self.session_id, utilisateur_id)
        self.contexte = Contexte()
        self.echanges: deque[dict[str, str]] = deque(maxlen=NB_ECHANGES_CONTEXTE)
        self.derniere_demande = ""
        self.outils = Outils(registre, utilisateur_id, self._contexte_courant)
        self.entree: gradbot.SessionInputHandle | None = None
        self.suivis: dict[int, asyncio.Task] = {}
        self.taches_fond: set[asyncio.Task] = set()
        self.arret = asyncio.Event()
        self._maj_prompt: asyncio.Task | None = None
        self._tour: dict[str, float] = {}
        self._envoi = asyncio.Lock()

    # ── contexte transmis aux agents ──────────────────────────────

    def _contexte_courant(self) -> Contexte:
        return self.contexte.model_copy(update={"derniers_echanges": list(self.echanges)})

    def _mettre_a_jour_contexte(self, donnees: dict[str, Any]) -> None:
        self.contexte = Contexte(
            graphe_actif=donnees.get("graphe_actif"),
            conversation_active=donnees.get("conversation_active"),
        )

    # ── configuration Gradbot ─────────────────────────────────────

    def _config(self, instructions: str, parle_en_premier: bool) -> gradbot.SessionConfig:
        return gradbot.SessionConfig(
            voice_id=config.ATLAS_VOICE_ID,
            instructions=instructions,
            language=gradbot.Lang.Fr,
            assistant_speaks_first=parle_en_premier,
            # Pas de relance sur silence : Atlas ne comble pas les blancs, le client gère la veille.
            silence_timeout_s=0.0,
            flush_duration_s=config.ATLAS_FLUSH_S,
            tools=_outils_gradbot(),
        )

    async def _demarrer_gradbot(self) -> gradbot.SessionOutputHandle:
        taches = await self.registre.taches_visibles(self.utilisateur_id)
        a_annoncer = await self.registre.a_annoncer(self.utilisateur_id)
        cfg = self._config(prompt.instructions(taches, a_annoncer), parle_en_premier=bool(a_annoncer))
        for tache in a_annoncer:
            await self.registre.marquer_annoncee(tache)
        entree, sortie = await gradbot.run(
            gradium_api_key=config.GRADIUM_API_KEY,
            gradium_base_url=config.GRADIUM_BASE_URL,
            llm_base_url=f"{config.URL_INTERNE}/llm/v1",
            llm_model_name="atlas",
            llm_api_key=config.LLM_JETON_INTERNE,
            max_completion_tokens=config.LLM_MAX_TOKENS,
            session_config=cfg,
            input_format=gradbot.AudioFormat.OggOpus,
            output_format=gradbot.AudioFormat.OggOpus,
        )
        self.entree = entree
        return sortie

    def _planifier_maj_prompt(self) -> None:
        """La liste des tâches du prompt suit le registre (regroupe les rafales de changements)."""
        if self._maj_prompt and not self._maj_prompt.done():
            return

        async def maj() -> None:
            await asyncio.sleep(DELAI_MAJ_PROMPT_S)
            taches = await self.registre.taches_visibles(self.utilisateur_id)
            if self.entree is not None:
                await self.entree.send_config(self._config(prompt.instructions(taches), parle_en_premier=False))

        self._maj_prompt = self._lancer(maj())

    def _lancer(self, coro) -> asyncio.Task:
        tache = asyncio.create_task(coro)
        self.taches_fond.add(tache)
        tache.add_done_callback(self.taches_fond.discard)
        return tache

    # ── boucle principale ─────────────────────────────────────────

    async def executer(self, debut: dict[str, Any]) -> None:
        """`debut` : le message `start` du client (contexte affiché, jeton déjà vérifié)."""
        metriques.nouvelle_session()
        try:
            self._mettre_a_jour_contexte(debut.get("contexte") or {})
            sortie = await self._demarrer_gradbot()
        except Exception as e:
            log.exception("Démarrage de session impossible")
            with contextlib.suppress(Exception):
                await self._envoyer_json({"type": "error", "message": f"Démarrage impossible : {e}"})
                await self.ws.close(code=1011)
            return

        await self._envoyer_json({"type": "session_prete", "session_id": self.session_id})
        log.info("Session %s ouverte pour %s", self.session_id, self.utilisateur_id)
        try:
            async with self.registre.abonnement(lambda t: t.utilisateur_id == self.utilisateur_id) as flux:
                boucles = [
                    asyncio.create_task(self._boucle_entree()),
                    asyncio.create_task(self._boucle_sortie(sortie)),
                    asyncio.create_task(self._boucle_registre(flux)),
                ]
                await self.arret.wait()
                for boucle in boucles:
                    boucle.cancel()
                await asyncio.gather(*boucles, return_exceptions=True)
        finally:
            await self._fermer()

    async def _fermer(self) -> None:
        # Les tâches continuent dans le registre ; seuls les appels ouverts sont abandonnés.
        for tache in [*self.suivis.values(), *self.taches_fond]:
            tache.cancel()
        with contextlib.suppress(Exception):
            if self.entree is not None:
                await self.entree.close()
        self.entree = None
        self.journal.ecrire("fin")
        with contextlib.suppress(Exception):
            await self.ws.close()
        log.info("Session %s fermée", self.session_id)

    async def _envoyer_json(self, donnees: dict[str, Any]) -> None:
        async with self._envoi:
            await self.ws.send_json(donnees)

    async def _boucle_entree(self) -> None:
        try:
            while True:
                brut = await self.ws.receive()
                if brut.get("type") == "websocket.disconnect":
                    break
                if brut.get("bytes") is not None:
                    await self.entree.send_audio(brut["bytes"])
                    continue
                if brut.get("text") is None:
                    continue
                msg = json.loads(brut["text"])
                match msg.get("type"):
                    case "stop":
                        break
                    case "contexte":
                        self._mettre_a_jour_contexte(msg)
                    case "veille":
                        self.journal.ecrire("veille", active=bool(msg.get("active")))
        except (fastapi.WebSocketDisconnect, RuntimeError):
            pass
        except Exception:
            log.exception("Boucle d'entrée en échec")
        finally:
            self.arret.set()

    async def _boucle_sortie(self, sortie: gradbot.SessionOutputHandle) -> None:
        try:
            while True:
                msg = await sortie.receive()
                if msg is None:
                    break
                if msg.msg_type == "tool_call":
                    self._lancer(self._sur_appel(msg.tool_call, msg.tool_call_handle))
                    continue
                if msg.msg_type == "event" and msg.event is not None:
                    self._sur_evenement(msg.event.event_type, msg.event.data, msg.time_s)
                schema = gradbot.schemas.from_msg(msg)
                if schema is None:
                    continue
                if msg.msg_type == "audio":
                    async with self._envoi:
                        await self.ws.send_json(schema.model_dump())
                        await self.ws.send_bytes(msg.data)
                else:
                    await self._envoyer_json(schema.model_dump())
        except Exception as e:
            log.exception("Boucle de sortie en échec")
            with contextlib.suppress(Exception):
                await self._envoyer_json({"type": "error", "message": str(e)})
        finally:
            self.arret.set()

    async def _boucle_registre(self, flux) -> None:
        async for evt in flux:
            if evt.type in ("creee", "statut"):
                self._planifier_maj_prompt()

    # ── événements Gradbot : transcription, latences, fin de session ──

    def _sur_evenement(self, nom: str, donnees: Any, temps: float | None) -> None:
        if nom == "push_to_llm" and isinstance(donnees, dict):
            texte = (donnees.get("user_text") or "").strip()
            if texte and texte not in ("[start]", "..."):
                self.derniere_demande = texte
                self.echanges.append({"role": "utilisateur", "texte": texte})
                self.journal.ecrire("utilisateur", texte=texte)
                if phrase_de_fin(texte):
                    self._lancer(self._envoyer_json({"type": "fin_demandee"}))
        elif nom == "previous_llm_gen" and isinstance(donnees, dict):
            texte = (donnees.get("agent_text") or "").strip()
            if texte:
                self.echanges.append({"role": "atlas", "texte": texte})
                self.journal.ecrire("atlas", texte=texte)
        elif nom == "interrupted":
            metriques.enregistrer_interruption()
            self.journal.ecrire("interruption")
        if temps is not None:
            self._mesurer(nom, temps)

    def _mesurer(self, nom: str, temps: float) -> None:
        """Budget de latence (section 6.1), mesuré sur l'horloge de Gradbot."""
        if nom == "flushing":
            self._tour = {"flushing": temps}
        elif nom in ("end_of_turn", "first_word") and "flushing" in self._tour:
            self._tour.setdefault(nom, temps)
        elif nom == "first_tts_audio" and "end_of_turn" in self._tour:
            t = self._tour
            etapes = {"fin_de_tour": t["end_of_turn"] - t["flushing"], "total": temps - t["flushing"]}
            if "first_word" in t:
                etapes["premier_token"] = t["first_word"] - t["end_of_turn"]
                etapes["premier_audio"] = temps - t["first_word"]
            metriques.enregistrer_tour(etapes)
            self.journal.ecrire("latence", **{k: round(v * 1000) for k, v in etapes.items()})
            self._tour = {}

    # ── outils ────────────────────────────────────────────────────

    async def _sur_appel(self, info: gradbot.ToolCallInfo, handle: gradbot.ToolCallHandlePy) -> None:
        try:
            args = gradbot.schemas.sanitize(json.loads(info.args_json)) if info.args_json else {}
        except (json.JSONDecodeError, TypeError):
            args = {}
        if not isinstance(args, dict):
            args = {}
        execution = await self.outils.executer(info.tool_name, args, self.derniere_demande)
        metriques.enregistrer_outil(info.tool_name, execution.ok)
        self.journal.ecrire("outil", nom=info.tool_name, arguments=args, resultat=execution.resultat,
                            demande_brute=self.derniere_demande)
        await handle.send(json.dumps(execution.resultat, ensure_ascii=False, default=str))
        if execution.a_suivre is not None:
            self._suivre(execution.a_suivre, handle)

    def _suivre(self, tache: Tache, handle: gradbot.ToolCallHandlePy) -> None:
        # Un seul appel ouvert par tâche : le plus récent reprend le suivi.
        precedent = self.suivis.pop(tache.id, None)
        if precedent is not None:
            precedent.cancel()
        suivi = asyncio.create_task(self._boucle_suivi(tache, handle))
        self.suivis[tache.id] = suivi
        suivi.add_done_callback(lambda t, i=tache.id: self.suivis.get(i) is t and self.suivis.pop(i))

    async def _boucle_suivi(self, tache: Tache, handle: gradbot.ToolCallHandlePy) -> None:
        """Relaie sur l'appel ouvert chaque changement de statut à annoncer, jusqu'à l'état final."""
        dernier = tache.statut
        async with self.registre.abonnement(lambda t: t.id == tache.id) as flux:
            # Rattrape un changement survenu avant l'abonnement.
            actuelle = await self.registre.stockage.obtenir(tache.id)
            if actuelle is not None and actuelle.statut != dernier:
                dernier = await self._relayer(actuelle, handle)
                if dernier in STATUTS_FINAUX:
                    return
            async for evt in flux:
                if evt.tache.statut == dernier:
                    continue
                dernier = await self._relayer(evt.tache, handle)
                if dernier in STATUTS_FINAUX:
                    return
        # En sortant, `handle` n'est plus référencé : Gradbot considère l'appel comme clos.

    async def _relayer(self, tache: Tache, handle: gradbot.ToolCallHandlePy) -> Statut:
        # Une annulation vient de l'utilisateur lui-même : rien à annoncer, on cesse de suivre.
        if tache.statut in STATUTS_A_ANNONCER:
            await handle.send(json.dumps(rapport(tache, f"tache_{tache.statut.value}"), ensure_ascii=False,
                                         default=str))
            self.journal.ecrire("annonce", tache_id=tache.id, statut=tache.statut.value,
                                resultat=tache.resultat_oral or tache.question or tache.erreur)
            await self.registre.marquer_annoncee(tache)
        return tache.statut
