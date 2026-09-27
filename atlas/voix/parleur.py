"""La voix de l'agent : texte du modèle → Gradium TTS → audio vers le navigateur.

Un flux TTS par message de l'agent (le message d'annonce avant un outil, puis la réponse), joués dans l'ordre.
Une connexion TTS est toujours tenue prête d'avance : la poignée de main ne compte pas dans la latence.
L'offre gratuite de Gradium permet 3 sessions simultanées : STT + TTS en cours + TTS préchauffée.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

from . import config
from .gradium import Synthese
from .texte import Decoupeur

log = logging.getLogger(__name__)

OCTETS_PAR_SECONDE = 48000 * 2
AGE_MAX_PRECHAUFFE = 50.0
"""Au-delà, une connexion préchauffée inutilisée est renouvelée (Gradium ferme les connexions trop inactives)."""


class Prechauffe:
    """Tient une connexion TTS ouverte et configurée, prête à parler."""

    def __init__(self) -> None:
        self.voix = config.VOIX
        self._tache: asyncio.Task[Synthese] | None = None
        self._ouverte_a = 0.0

    def lancer(self) -> None:
        if self._tache is None:
            self._ouverte_a = time.monotonic()
            self._tache = asyncio.create_task(Synthese(self.voix).ouvrir())

    async def prendre(self) -> Synthese:
        tache, self._tache = self._tache, None
        synthese = None
        if tache is not None:
            try:
                synthese = await tache
            except Exception:
                log.warning("connexion TTS préchauffée perdue", exc_info=True)
            if synthese is not None and time.monotonic() - self._ouverte_a > AGE_MAX_PRECHAUFFE:
                await synthese.fermer()
                synthese = None
        if synthese is None:
            synthese = await Synthese(self.voix).ouvrir()
        return synthese

    async def renouveler(self) -> None:
        """Ferme la connexion prête (changement de voix, ou trop vieille) et en rouvre une."""
        tache, self._tache = self._tache, None
        if tache is not None:
            try:
                await (await tache).fermer()
            except Exception:
                pass
        self.lancer()

    async def entretenir(self) -> None:
        while True:
            await asyncio.sleep(5)
            if self._tache is not None and time.monotonic() - self._ouverte_a > AGE_MAX_PRECHAUFFE:
                await self.renouveler()

    async def fermer(self) -> None:
        tache, self._tache = self._tache, None
        if tache is not None:
            tache.cancel()
            try:
                await (await tache).fermer()
            except BaseException:
                pass


class Parleur:
    """La parole d'un tour de l'agent (une « génération » audio : couper la parole en change)."""

    def __init__(
        self,
        gen: int,
        prechauffe: Prechauffe,
        envoyer_audio: Callable[[int, bytes], Awaitable[None]],
        sur_premier_audio: Callable[[], Awaitable[None]],
        sur_segment: Callable[[str, float, str], Awaitable[None]] | None = None,
    ):
        self.gen = gen
        self.prechauffe = prechauffe
        self.envoyer_audio = envoyer_audio
        self.sur_premier_audio = sur_premier_audio
        self.sur_segment = sur_segment
        """Reçoit (message, instant dans l'audio du tour, texte) pour chaque segment prononcé : le navigateur
        colore le texte au rythme de la voix."""
        self._messages: asyncio.Queue[tuple[str, asyncio.Queue[str | None]] | None] = asyncio.Queue()
        self._files: dict[str, asyncio.Queue[str | None]] = {}
        self._decoupeurs: dict[str, Decoupeur] = {}
        self._finis: set[str] = set()
        self._actives: set[Synthese] = set()
        self.duree = 0.0
        """Secondes d'audio envoyées pour ce tour."""
        self.segments: list[tuple[float, str]] = []
        """(instant dans l'audio du tour, texte prononcé), d'après les horodatages de Gradium."""
        self.envoye_premier = False
        self.arrete = False
        self._consommateur = asyncio.create_task(self._consommer())

    def _file(self, id_: str) -> asyncio.Queue[str | None]:
        if id_ not in self._files:
            self._files[id_] = asyncio.Queue()
            self._decoupeurs[id_] = Decoupeur()
            self._messages.put_nowait((id_, self._files[id_]))
        return self._files[id_]

    def texte(self, id_: str, delta: str) -> None:
        file = self._file(id_)
        for morceau in self._decoupeurs[id_].ajouter(delta):
            file.put_nowait(morceau)

    def fin_message(self, id_: str) -> None:
        if id_ in self._finis:
            return
        self._finis.add(id_)
        file = self._file(id_)
        if reste := self._decoupeurs[id_].vider():
            file.put_nowait(reste)
        file.put_nowait(None)

    async def terminer(self) -> None:
        """Attend que tout l'audio du tour soit parti vers le navigateur."""
        for id_ in self._files.keys() - self._finis:
            self.fin_message(id_)
        self._messages.put_nowait(None)
        try:
            await self._consommateur
        except asyncio.CancelledError:
            pass

    async def arreter(self) -> None:
        self.arrete = True
        self._consommateur.cancel()
        for synthese in list(self._actives):
            await synthese.fermer()

    def entendu(self, joue_s: float) -> tuple[str, bool]:
        """Ce que Camille a entendu après `joue_s` secondes de lecture, et si c'était tout."""
        entendus = [t for debut, t in self.segments if debut < joue_s]
        return " ".join(entendus), len(entendus) == len(self.segments)

    async def _consommer(self) -> None:
        while (message := await self._messages.get()) is not None:
            id_, file = message
            premier = await file.get()
            if premier is None:
                continue
            synthese = await self.prechauffe.prendre()
            self._actives.add(synthese)
            self.prechauffe.lancer()
            lecteur = asyncio.create_task(self._lire(synthese, id_))
            try:
                morceau: str | None = premier
                while morceau is not None:
                    await synthese.texte(morceau)
                    morceau = await file.get()
                await synthese.fin()
                await lecteur
            finally:
                lecteur.cancel()
                self._actives.discard(synthese)
                await synthese.fermer()

    async def _lire(self, synthese: Synthese, id_: str) -> None:
        decalage = self.duree
        async for evenement in synthese.evenements():
            if self.arrete:
                return
            if "pcm" in evenement:
                if not self.envoye_premier:
                    self.envoye_premier = True
                    await self.sur_premier_audio()
                await self.envoyer_audio(self.gen, evenement["pcm"])
                self.duree += len(evenement["pcm"]) / OCTETS_PAR_SECONDE
            elif evenement.get("type") == "text":
                debut = decalage + float(evenement.get("start_s", 0))
                self.segments.append((debut, evenement.get("text", "")))
                if self.sur_segment is not None:
                    await self.sur_segment(id_, debut, evenement.get("text", ""))
