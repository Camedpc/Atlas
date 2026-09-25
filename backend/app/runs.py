"""Un seul agent tourne à la fois, dans un thread de fond, arrêtable via /stop."""

import logging
import threading
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

from .agents.boucle import Arret

log = logging.getLogger(__name__)


@dataclass
class Run:
    type: str
    depuis: str
    detail: str = ""


class Gestionnaire:
    def __init__(self) -> None:
        self._verrou = threading.Lock()
        self._run: Run | None = None
        self._stop = threading.Event()
        self.dernier_resultat: str | None = None

    def etat(self) -> dict | None:
        run = self._run
        return asdict(run) if run else None

    def lancer(self, type: str, cible: Callable[[threading.Event, Callable[[str], None]], str]) -> bool:
        """Démarre `cible(stop, progres)` en arrière-plan. Renvoie False si un run est déjà en cours."""
        with self._verrou:
            if self._run is not None:
                return False
            self._stop = threading.Event()
            run = self._run = Run(type=type, depuis=datetime.now(UTC).isoformat())

        def progres(detail: str) -> None:
            run.detail = detail

        def corps() -> None:
            try:
                self.dernier_resultat = cible(self._stop, progres)
                log.info("%s terminé : %s", type, self.dernier_resultat)
            except Arret:
                self.dernier_resultat = "Arrêté."
                log.info("%s arrêté", type)
            except Exception as e:
                self.dernier_resultat = f"Erreur : {e}"
                log.exception("%s a échoué", type)
            finally:
                with self._verrou:
                    self._run = None

        threading.Thread(target=corps, name=type, daemon=True).start()
        return True

    def arreter(self) -> bool:
        if self._run is None:
            return False
        self._stop.set()
        return True


gestionnaire = Gestionnaire()
