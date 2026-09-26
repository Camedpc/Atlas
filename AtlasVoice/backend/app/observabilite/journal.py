"""Journal rejouable de chaque session (section 6.4) : transcription, appels d'outils, tâches, résultats.

Un fichier JSONL par session, rangé par jour. L'audio brut n'est jamais stocké.
Les transcriptions sont purgées après ATLAS_RETENTION_JOURS jours (0 = pas de texte conservé).
"""

from __future__ import annotations

import json
import logging
import shutil
import threading
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from .. import config

log = logging.getLogger(__name__)

# Champs contenant des paroles de l'utilisateur ou d'Atlas.
CHAMPS_TEXTE = {"texte", "demande_brute", "arguments", "resultat"}


def _dossier_sessions() -> Path:
    return config.DOSSIER_DONNEES / "sessions"


class JournalSession:
    def __init__(self, session_id: str, utilisateur_id: str) -> None:
        self.session_id = session_id
        self._verrou = threading.Lock()
        jour = datetime.now(UTC).date().isoformat()
        self.chemin = _dossier_sessions() / jour / f"{session_id}.jsonl"
        self.chemin.parent.mkdir(parents=True, exist_ok=True)
        self.ecrire("debut", utilisateur_id=utilisateur_id)

    def ecrire(self, type_: str, **donnees: Any) -> None:
        if config.RETENTION_TRANSCRIPTIONS_JOURS <= 0:
            donnees = {k: v for k, v in donnees.items() if k not in CHAMPS_TEXTE}
        ligne = {"t": datetime.now(UTC).isoformat(), "type": type_, **donnees}
        try:
            with self._verrou, self.chemin.open("a", encoding="utf-8") as f:
                f.write(json.dumps(ligne, ensure_ascii=False, default=str) + "\n")
        except OSError:
            log.exception("Écriture du journal impossible")


def lister_sessions(limite: int = 50) -> list[dict[str, Any]]:
    fichiers = sorted(_dossier_sessions().glob("*/*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    return [{"session_id": f.stem, "jour": f.parent.name, "taille": f.stat().st_size} for f in fichiers[:limite]]


def lire_session(session_id: str) -> list[dict[str, Any]] | None:
    if not session_id.replace("-", "").isalnum():
        return None
    for fichier in _dossier_sessions().glob(f"*/{session_id}.jsonl"):
        with fichier.open(encoding="utf-8") as f:
            return [json.loads(ligne) for ligne in f if ligne.strip()]
    return None


def purger(aujourdhui: date | None = None) -> int:
    """Supprime les dossiers de jours plus vieux que la rétention. Renvoie le nombre de jours purgés."""
    racine = _dossier_sessions()
    if not racine.exists():
        return 0
    # Sans transcription (rétention 0), les journaux ne contiennent que des métadonnées : 30 jours aussi.
    retention = config.RETENTION_TRANSCRIPTIONS_JOURS if config.RETENTION_TRANSCRIPTIONS_JOURS > 0 else 30
    limite = (aujourdhui or datetime.now(UTC).date()) - timedelta(days=retention)
    purges = 0
    for dossier in racine.iterdir():
        try:
            jour = date.fromisoformat(dossier.name)
        except ValueError:
            continue
        if jour < limite:
            shutil.rmtree(dossier, ignore_errors=True)
            purges += 1
    return purges
