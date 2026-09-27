"""Atlas voix préparé à l'avance : au clic sur le micro, l'appel reprend un cerveau déjà prêt.

Préparer un appel coûte 6 à 7 s (processus Codex, thread d'Atlas voix, fin de la conversation, tour
d'échauffement). Le navigateur le demande dès qu'une conversation s'ouvre ou qu'un appel se termine ; l'appel suivant
dans cette conversation le prend et n'attend plus que le son d'ouverture. Un seul cerveau préparé à la fois (un
processus Codex en mémoire), fermé s'il n'a pas servi au bout de `ATLAS_VOIX_PRECHAUFFAGE_S`.

Les messages écrits entre la préparation et l'appel sont ajoutés au premier tour (`complement`).
"""

import asyncio
import contextlib
import logging
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import httpx

from .. import conversations, projets
from ..modeles import Conversation, Message
from ..orchestrateur import bunker
from . import config
from .cerveau import Cerveau
from .contexte import VOIX, contexte_decroche

log = logging.getLogger(__name__)

ECHAUFFEMENT = "[Système] Appel ouvert. Réponds uniquement « prêt », sans rien faire d'autre."


def echauffement(contexte: str) -> str:
    return (
        f"[Contexte : fin de la conversation au moment où Camille t'appelle]\n{contexte}\n[Fin du contexte]\n\n"
        f"{ECHAUFFEMENT}"
    )


def messages_recents(conversation_id: str, apres_id: int | None = None) -> list[Message]:
    """Fin de la conversation : messages de l'orchestrateur et des appels précédents (après `apres_id`)."""
    n = config.CONTEXTE_MESSAGES
    if apres_id is None:
        return conversations.lister_messages(conversation_id, limite=n, derniers=True) + conversations.lister_messages(
            conversation_id, limite=n, agent=VOIX, derniers=True
        )
    return conversations.lister_messages(conversation_id, apres_id=apres_id) + conversations.lister_messages(
        conversation_id, apres_id=apres_id, agent=VOIX
    )


async def lire(fonction: Callable[..., Any], *args: Any) -> Any:
    """Lecture Supabase dans un thread, relancée sur erreur réseau passagère : la préparation part à l'ouverture de
    la conversation, en même temps que les lectures du front, et le client partagé échoue parfois (WinError 10035)."""
    for essai in range(3):
        try:
            return await asyncio.to_thread(fonction, *args)
        except httpx.TransportError:
            if essai == 2:
                raise
            await asyncio.sleep(0.3 * (essai + 1))


@dataclass
class CerveauPret:
    """Un cerveau d'Atlas voix démarré (ou en train de l'être) pour une conversation."""

    conversation_id: str
    appel_id: str
    cerveau: Cerveau | None = None
    dernier_id: int = 0
    """Dernier message vu à la préparation : les suivants sont ajoutés au premier tour de l'appel."""
    pret: asyncio.Event = field(default_factory=asyncio.Event)
    echec: bool = False
    cree: float = field(default_factory=time.monotonic)
    tache: asyncio.Task[None] | None = None

    async def attendre(self, delai: float = 30.0) -> bool:
        """Prêt à servir ? (False : échec de la préparation, l'appel repart à froid)."""
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(self.pret.wait(), delai)
        return self.pret.is_set() and not self.echec and self.cerveau is not None

    async def complement(self) -> str:
        """Messages écrits depuis la préparation, à ajouter en tête du premier tour de l'appel."""
        nouveaux = await lire(messages_recents, self.conversation_id, self.dernier_id)
        if not nouveaux:
            return ""
        return (
            "[Nouveaux messages de la conversation depuis ta préparation]\n"
            f"{contexte_decroche(nouveaux, config.CONTEXTE_MESSAGES)}\n[Fin des nouveaux messages]"
        )

    async def fermer(self) -> None:
        if self.tache is not None and not self.tache.done():
            self.tache.cancel()
        if self.cerveau is not None:
            with contextlib.suppress(Exception):
                await self.cerveau.fermer()


class Prechauffages:
    def __init__(self, fabrique: Callable[..., Cerveau] = Cerveau) -> None:
        self.fabrique = fabrique
        self.courant: CerveauPret | None = None
        self._menage: asyncio.Task[None] | None = None

    def _expire(self, p: CerveauPret) -> bool:
        return config.PRECHAUFFAGE_S <= 0 or time.monotonic() - p.cree > config.PRECHAUFFAGE_S

    async def demander(self, conversation: Conversation) -> str:
        """Prépare Atlas voix pour cette conversation (sans effet s'il l'est déjà ou si c'est désactivé)."""
        if config.PRECHAUFFAGE_S <= 0:
            return "desactive"
        courant = self.courant
        if courant is not None and courant.conversation_id == conversation.id and not courant.echec:
            if not self._expire(courant):
                return "deja"
        # Un seul cerveau préparé : l'ancien (autre conversation, expiré ou en échec) est fermé.
        self.courant = None
        if courant is not None:
            await courant.fermer()
        pret = CerveauPret(conversation.id, uuid.uuid4().hex[:12])
        pret.tache = asyncio.create_task(self._preparer(conversation, pret))
        self.courant = pret
        if self._menage is None or self._menage.done():
            self._menage = asyncio.create_task(self._menager())
        return "lance"

    async def _preparer(self, conversation: Conversation, pret: CerveauPret) -> None:
        debut = time.perf_counter()
        try:
            projet = await lire(projets.dossier_de, conversation.projet_id)
            projet_id = await lire(projets.id_ou_defaut, conversation.projet_id)
            dossier = await asyncio.to_thread(bunker.preparer_session, conversation.id, projet)
            cerveau = self.fabrique(conversation.id, pret.appel_id, dossier, projet_id)
            pret.cerveau = cerveau
            await cerveau.demarrer()
            precedents = await lire(messages_recents, conversation.id)
            pret.dernier_id = max((m.id for m in precedents), default=0)
            async for _ in cerveau.tour(echauffement(contexte_decroche(precedents, config.CONTEXTE_MESSAGES))):
                pass
            log.info("Atlas voix préparé pour %s en %.1f s", conversation.id, time.perf_counter() - debut)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.warning("préparation d'Atlas voix pour %s", conversation.id, exc_info=True)
            pret.echec = True
        finally:
            pret.pret.set()

    def prendre(self, conversation_id: str) -> CerveauPret | None:
        """Le cerveau préparé pour cette conversation, retiré de la réserve (None : l'appel démarre à froid)."""
        courant = self.courant
        if courant is None or courant.conversation_id != conversation_id or courant.echec or self._expire(courant):
            return None
        self.courant = None
        return courant

    async def _menager(self) -> None:
        """Ferme le cerveau préparé qui n'a pas servi à temps (un processus Codex en mémoire)."""
        while self.courant is not None:
            await asyncio.sleep(15)
            courant = self.courant
            if courant is not None and self._expire(courant):
                self.courant = None
                log.info("Atlas voix préparé pour %s : expiré, fermé", courant.conversation_id)
                await courant.fermer()


prechauffages = Prechauffages()
