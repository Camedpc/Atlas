"""Déroulement automatique d'un parcours pendant un appel : les étapes s'enchaînent sans que Camille ait à dire
« suivant ».

Pour chaque étape : on attend un blanc (personne ne parle, la voix n'a pas de tour en cours), l'écran se met en
place, puis la phrase de l'étape est dite telle quelle (sans passer par le modèle : pas de latence, pas de
reformulation), et après une courte pause on passe à la suivante. Si Camille parle, le parcours se met en pause :
la voix apprend où il en est (`note`) et peut le reprendre (outil `derouler_parcours`, `depuis`).
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

log = logging.getLogger(__name__)

PAUSE_ENTRE_ETAPES_S = 1.2
"""Le temps de regarder l'écran après la phrase, avant que la caméra ne reparte."""
INTERVALLE_S = 0.1


class Deroulement:
    def __init__(
        self,
        chemin: str,
        parcours: dict[str, Any],
        depuis: int,
        executer: Callable[[list[dict[str, Any]]], Awaitable[dict[str, Any]]],
        dire: Callable[[str], Awaitable[bool]],
        libre: Callable[[], bool],
        annoncer: Callable[[str], None],
    ):
        self.chemin = chemin
        self.titre = str(parcours.get("titre") or "parcours")
        self.etapes: list[dict[str, Any]] = parcours["etapes"]
        self.etape = depuis
        """Étape en cours (à partir de 1) ; après la dernière, len(etapes) + 1."""
        self.executer = executer
        self.dire = dire
        self.libre = libre
        self.annoncer = annoncer
        self.tache: asyncio.Task[None] | None = None
        self.en_pause = False

    @property
    def total(self) -> int:
        return len(self.etapes)

    @property
    def actif(self) -> bool:
        return self.tache is not None and not self.tache.done()

    def lancer(self) -> None:
        self.tache = asyncio.create_task(self._derouler())

    def suspendre(self) -> str | None:
        """Camille reprend la parole : le parcours s'arrête là. Renvoie la note pour la voix (None s'il était fini)."""
        if not self.actif:
            return None
        tache, self.tache = self.tache, None
        assert tache is not None
        tache.cancel()
        self.en_pause = True
        return self.note()

    def note(self) -> str:
        suite = self.etape + 1 if self.etape < self.total else None
        reprendre = f"`derouler_parcours` (depuis={suite}) pour continuer, " if suite else ""
        return (
            f"[Parcours « {self.titre} » en pause à l'étape {self.etape}/{self.total} ({self.chemin}) : "
            f"{reprendre}depuis={self.etape} pour la redire. Réponds d'abord à Camille.]"
        )

    async def _attendre_blanc(self) -> None:
        while not self.libre():
            await asyncio.sleep(INTERVALLE_S)

    async def _derouler(self) -> None:
        try:
            while self.etape <= self.total:
                e = self.etapes[self.etape - 1]
                await self._attendre_blanc()
                resultat = await self.executer(e.get("commandes") or [])
                if not resultat.get("ok"):
                    self.annoncer(
                        f"[Parcours « {self.titre} »] L'écran n'a pas pu montrer l'étape {self.etape}/{self.total} : "
                        f"{resultat.get('erreur', 'refus')}. Dis-le en une phrase."
                    )
                    return
                if not await self.dire(e["phrase"]):
                    self.en_pause = True
                    return  # coupé : la voix reçoit la note au tour suivant
                if self.etape < self.total:
                    await asyncio.sleep(PAUSE_ENTRE_ETAPES_S)
                self.etape += 1
            self.annoncer(
                f"[Parcours « {self.titre} »] Parcours terminé ({self.total} étapes). Demande en une phrase si Camille "
                "veut revenir sur une étape."
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("déroulement du parcours %s", self.chemin)
            self.annoncer(f"[Parcours « {self.titre} »] Le déroulement s'est arrêté sur une erreur. Dis-le.")
