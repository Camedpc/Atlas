"""Persistance du registre. Deux implémentations : mémoire (dev, tests) et Postgres (production).

Toutes les écritures passent par `modifier`, qui est conditionnelle au statut courant :
c'est ce qui rend les transitions sûres quand Atlas, l'interface et les agents écrivent en même temps.
Chaque écriture déclenche une notification (id de tâche) vers les abonnés, quel que soit l'écrivain.
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable, Iterable
from datetime import datetime, timedelta
from typing import Any

from .modele import STATUTS_ACTIFS, STATUTS_ATTENTE_UTILISATEUR, Statut, Tache, maintenant

Notification = Callable[[int], Awaitable[None]]


class Stockage(ABC):
    def __init__(self) -> None:
        self._abonnes: list[Notification] = []

    def abonner(self, rappel: Notification) -> None:
        self._abonnes.append(rappel)

    async def _notifier(self, tache_id: int) -> None:
        for rappel in list(self._abonnes):
            await rappel(tache_id)

    async def demarrer(self) -> None:  # noqa: B027 - optionnel
        pass

    async def arreter(self) -> None:  # noqa: B027 - optionnel
        pass

    @abstractmethod
    async def creer(self, champs: dict[str, Any]) -> Tache: ...

    @abstractmethod
    async def obtenir(self, tache_id: int) -> Tache | None: ...

    @abstractmethod
    async def lister(
        self,
        utilisateur_id: str | None = None,
        statuts: Iterable[Statut] | None = None,
        depuis: datetime | None = None,
        limite: int = 50,
    ) -> list[Tache]:
        """Tâches les plus récentes d'abord (par dernière mise à jour)."""

    @abstractmethod
    async def modifier(
        self, tache_id: int, champs: dict[str, Any], statuts_attendus: Iterable[Statut] | None = None
    ) -> Tache | None:
        """Applique `champs` si le statut courant est attendu. None si la condition échoue."""

    @abstractmethod
    async def prendre_prochaine(self, types_agent: Iterable[str]) -> Tache | None:
        """Passe atomiquement la plus ancienne tâche en attente à « en cours »."""

    @abstractmethod
    async def expirer(self, delai: timedelta) -> list[Tache]:
        """Passe en échec les tâches actives sans mise à jour depuis `delai`
        (sauf celles qui attendent l'utilisateur)."""

    @abstractmethod
    async def prendre_verrou(self, ressource: str, tache_id: int) -> bool: ...

    @abstractmethod
    async def liberer_verrou(self, ressource: str, tache_id: int) -> None: ...


class StockageMemoire(Stockage):
    def __init__(self) -> None:
        super().__init__()
        self._taches: dict[int, Tache] = {}
        self._verrous: dict[str, int] = {}
        self._suivant = 1
        self._verrou = asyncio.Lock()

    async def creer(self, champs: dict[str, Any]) -> Tache:
        async with self._verrou:
            tache = Tache(id=self._suivant, **champs)
            self._suivant += 1
            self._taches[tache.id] = tache
        await self._notifier(tache.id)
        return tache.model_copy(deep=True)

    async def obtenir(self, tache_id: int) -> Tache | None:
        tache = self._taches.get(tache_id)
        return tache.model_copy(deep=True) if tache else None

    async def lister(self, utilisateur_id=None, statuts=None, depuis=None, limite=50) -> list[Tache]:
        statuts = set(statuts) if statuts is not None else None
        res = [
            t
            for t in self._taches.values()
            if (utilisateur_id is None or t.utilisateur_id == utilisateur_id)
            and (statuts is None or t.statut in statuts)
            and (depuis is None or t.maj_le >= depuis)
        ]
        res.sort(key=lambda t: (t.maj_le, t.id), reverse=True)
        return [t.model_copy(deep=True) for t in res[:limite]]

    async def modifier(self, tache_id, champs, statuts_attendus=None) -> Tache | None:
        async with self._verrou:
            tache = self._taches.get(tache_id)
            if tache is None:
                return None
            if statuts_attendus is not None and tache.statut not in set(statuts_attendus):
                return None
            maj = tache.model_copy(update={**champs, "maj_le": maintenant()})
            # model_copy ne valide pas : on revalide pour garder des types propres.
            maj = Tache.model_validate(maj.model_dump())
            self._taches[tache_id] = maj
        await self._notifier(tache_id)
        return maj.model_copy(deep=True)

    async def prendre_prochaine(self, types_agent) -> Tache | None:
        types = set(types_agent)
        async with self._verrou:
            candidates = sorted(
                (t for t in self._taches.values() if t.statut == Statut.EN_ATTENTE and t.type_agent in types),
                key=lambda t: t.id,
            )
            if not candidates:
                return None
            tache = candidates[0].model_copy(update={"statut": Statut.EN_COURS, "maj_le": maintenant()})
            self._taches[tache.id] = tache
        await self._notifier(tache.id)
        return tache.model_copy(deep=True)

    async def expirer(self, delai: timedelta) -> list[Tache]:
        limite = maintenant() - delai
        expirees = []
        async with self._verrou:
            for tache in list(self._taches.values()):
                if (
                    tache.statut in STATUTS_ACTIFS
                    and tache.statut not in STATUTS_ATTENTE_UTILISATEUR
                    and tache.maj_le < limite
                ):
                    maj = tache.model_copy(
                        update={
                            "statut": Statut.ECHOUEE,
                            "erreur": "Aucune nouvelle de l'agent depuis plus de deux minutes.",
                            "maj_le": maintenant(),
                            "termine_le": maintenant(),
                            "annoncee": tache.canal != "vocal",
                        }
                    )
                    self._taches[tache.id] = maj
                    expirees.append(maj)
        for tache in expirees:
            await self._notifier(tache.id)
        return expirees

    async def prendre_verrou(self, ressource: str, tache_id: int) -> bool:
        async with self._verrou:
            detenteur = self._verrous.get(ressource)
            if detenteur is not None and detenteur != tache_id:
                tache = self._taches.get(detenteur)
                # Un verrou dont la tâche est finie est libre.
                if tache is not None and tache.active:
                    return False
            self._verrous[ressource] = tache_id
            return True

    async def liberer_verrou(self, ressource: str, tache_id: int) -> None:
        async with self._verrou:
            if self._verrous.get(ressource) == tache_id:
                del self._verrous[ressource]
