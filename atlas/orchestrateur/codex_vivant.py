"""Un seul app-server Codex pour tout le serveur, gardé ouvert entre les tours, comme la CLI Codex.

Lancer un app-server, vérifier le compte et recharger le thread coûtaient ~4 s à chaque message ; surtout, fermer
le processus à la fin du tour de l'orchestrateur tuait les sous-agents encore au travail (ceux qu'on relance par
`followup_task`, ceux que l'orchestrateur n'attend pas, ceux qui continuent après une interruption). Ici :

- un processus unique, démarré au premier besoin et relancé s'il meurt ;
- les threads restent chargés : un tour suivant démarre sans `thread/resume` (sauf si les consignes ou les
  réglages du thread ont changé, et qu'aucun sous-agent ne travaille) ;
- un espion permanent fait suivre toutes les notifications utiles, tous threads confondus, à `abonne`.

Clé OpenAI fournie par l'utilisateur (réglages du front, pour tester Atlas avec ses propres crédits) : ses tours
passent par un second processus, `pour_cle(cle)`, avec son propre CODEX_HOME connecté à cette clé. Le processus
du serveur (`codex_vivant`) et sa connexion ne changent pas. La clé n'est gardée qu'en mémoire et dans ce
CODEX_HOME, supprimé par `oublier_cle`.
"""

import asyncio
import hashlib
import json
import logging
import shutil
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from openai_codex import AsyncCodex, AsyncThread
from openai_codex.generated.v2_all import ThreadUnsubscribeResponse

from . import config

log = logging.getLogger(__name__)


@dataclass
class ThreadChaud:
    thread: AsyncThread
    empreinte: str
    """Empreinte des paramètres du thread (consignes, config) : s'ils changent, il faut le recharger."""
    dernier_usage: float


def empreinte(parametres: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(parametres, sort_keys=True, default=str).encode()).hexdigest()


class CodexVivant:
    def __init__(
        self, codex_home: Path | None = None, cle_api: str | None = None, ecoute: "CodexVivant | None" = None
    ) -> None:
        self.codex_home = codex_home
        """CODEX_HOME de ce processus ; None : celui du serveur (config.CODEX_HOME)."""
        self._cle_api = cle_api
        # Processus dont on reprend l'abonné (le gestionnaire ne s'abonne qu'au processus du serveur).
        self._ecoute = ecoute
        self._codex: AsyncCodex | None = None
        self._verrou = asyncio.Lock()
        self._threads: dict[str, ThreadChaud] = {}
        # Reçoit (méthode, charge) depuis le fil de lecture du SDK : doit être rapide et ne jamais lever.
        self.abonne: Callable[[str, Any], None] | None = None
        self.methodes: frozenset[str] = frozenset()

    async def client(self) -> AsyncCodex:
        """Le processus Codex, démarré et connecté au besoin."""
        async with self._verrou:
            if self._codex is not None and _vivant(self._codex):
                return self._codex
            if self._codex is not None:
                log.warning("Processus Codex arrêté : relance")
                await self._fermer()
            from . import agent  # import tardif : agent dépend de ce module

            codex = AsyncCodex(config=agent.config_codex(self.codex_home))
            try:
                await codex.__aenter__()
                await agent._connecter(codex, self._cle_api)
            except BaseException:
                await codex.close()
                raise
            self._espionner(codex)
            self._codex = codex
            return codex

    async def thread(self, cle: str, thread_id: str | None, parametres: dict[str, Any], occupe: bool) -> AsyncThread:
        """Thread de la conversation `cle` : celui déjà chargé si ses paramètres n'ont pas changé (ou si `occupe`,
        des sous-agents y travaillant encore), sinon repris (`thread_id`) ou créé. Lève si la reprise échoue."""
        codex = await self.client()
        signature = empreinte(parametres)
        chaud = self._threads.get(cle)
        if chaud is not None and (chaud.thread.id == thread_id or thread_id is None):
            if chaud.empreinte == signature or occupe:
                chaud.dernier_usage = time.monotonic()
                return chaud.thread
            # Nouvelles consignes : décharger pour que la reprise les applique.
            await self._decharger(codex, chaud.thread.id)
        if thread_id:
            thread = await codex.thread_resume(thread_id, **parametres)
        else:
            thread = await codex.thread_start(**parametres)
        self._threads[cle] = ThreadChaud(thread, signature, time.monotonic())
        return thread

    def oublier(self, cle: str) -> None:
        self._threads.pop(cle, None)

    async def interrompre(self, thread_id: str, tour_id: str) -> None:
        codex = await self.client()
        await codex._client.turn_interrupt(thread_id, tour_id)

    async def lire_thread(self, thread_id: str) -> Any:
        codex = await self.client()
        return (await codex._client.thread_read(thread_id, False)).thread

    async def liberer_inactifs(self, duree: float, occupes: Callable[[str], bool]) -> list[str]:
        """Décharge les threads inutilisés depuis `duree` secondes où plus rien ne travaille ; renvoie leurs clés."""
        if self._codex is None:
            return []
        limite = time.monotonic() - duree
        liberes = [c for c, t in self._threads.items() if t.dernier_usage < limite and not occupes(c)]
        for cle in liberes:
            chaud = self._threads.pop(cle)
            await self._decharger(self._codex, chaud.thread.id)
        return liberes

    async def fermer(self) -> None:
        async with self._verrou:
            await self._fermer()

    async def _fermer(self) -> None:
        codex, self._codex = self._codex, None
        self._threads.clear()
        if codex is not None:
            try:
                await codex.close()
            except Exception:
                log.warning("Fermeture de Codex", exc_info=True)

    async def _decharger(self, codex: AsyncCodex, thread_id: str) -> None:
        try:
            parametres = {"threadId": thread_id}
            await codex._client.request("thread/unsubscribe", parametres, response_model=ThreadUnsubscribeResponse)
        except Exception:
            log.warning("Thread %s non déchargé", thread_id, exc_info=True)

    def _espionner(self, codex: AsyncCodex) -> None:
        """Passe par le routeur interne du SDK (aucune API publique ne donne les événements des sous-agents) :
        si le SDK change, les tours continuent, sans arbre des agents ni sous-agents hors tour."""
        try:
            routeur = codex._client._sync._router
            origine = routeur.route_notification
        except AttributeError:
            log.warning("Routeur du SDK Codex introuvable : pas de suivi des sous-agents")
            return

        source = self._ecoute or self

        def espion(notification: Any) -> None:
            try:
                if source.abonne is not None and notification.method in source.methodes:
                    source.abonne(notification.method, notification.payload)
            except Exception:
                log.exception("Notification %s non suivie", getattr(notification, "method", "?"))
            origine(notification)

        routeur.route_notification = espion


def _vivant(codex: AsyncCodex) -> bool:
    sync = getattr(codex._client, "_sync", None)
    proc = getattr(sync, "_proc", None)
    lecteur = getattr(sync, "_reader_thread", None)
    return proc is not None and proc.poll() is None and (lecteur is None or lecteur.is_alive())


codex_vivant = CodexVivant()

# Processus des clés OpenAI fournies par les utilisateurs, par empreinte de clé.
_par_cle: dict[str, CodexVivant] = {}


def empreinte_cle(cle: str) -> str:
    return hashlib.sha256(cle.encode()).hexdigest()[:16]


def dossier_cle(cle: str) -> Path:
    """CODEX_HOME d'une clé : à côté de celui du serveur, jamais dedans."""
    return config.CODEX_HOME.parent / ".codex-cles" / empreinte_cle(cle)


def pour_cle(cle: str | None) -> CodexVivant:
    """Processus Codex qui fait payer `cle` ; sans clé, celui du serveur."""
    if not cle:
        return codex_vivant
    empreinte = empreinte_cle(cle)
    if empreinte not in _par_cle:
        _par_cle[empreinte] = CodexVivant(dossier_cle(cle), cle, ecoute=codex_vivant)
    return _par_cle[empreinte]


def tous() -> list[CodexVivant]:
    return [codex_vivant, *_par_cle.values()]


async def oublier_cle(cle: str) -> None:
    """Ferme le processus de la clé et supprime son CODEX_HOME (connexion, threads)."""
    vivant = _par_cle.pop(empreinte_cle(cle), None)
    if vivant is not None:
        await vivant.fermer()
    shutil.rmtree(dossier_cle(cle), ignore_errors=True)
