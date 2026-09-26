"""Bunker : l'arborescence des agents et le profil de permissions Codex qui les y confine.

    espace/
      .codex/                               CODEX_HOME (connexion, threads) : interdit aux agents
      partage/                              commun à toutes les sessions, en écriture
        python/                             environnement Python : `pip install` sert à tout le monde
        pip/                                cache pip
      utilisateurs/<utilisateur>/<projet>/  lisible par les sessions du projet
        doc_projet/  scripts_projet/        ressources du projet (lecture seule pour les agents)
        sessions/<conversation>/            dossier de travail : seul endroit où les agents écrivent
          conv/  docs_session/  scripts/  .tmp/

Le reste de la machine est illisible, sauf les chemins système dont les outils ont besoin (`:minimal`). Le sandbox
s'applique à toutes les commandes des agents et à leurs descendants ; les serveurs MCP, lancés par Codex, y échappent.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from . import config

SOUS_DOSSIERS_SESSION = ("conv", "docs_session", "scripts", ".tmp")
SOUS_DOSSIERS_PROJET = ("doc_projet", "scripts_projet", "sessions")


def dossier_projet() -> Path:
    return config.ESPACE_TRAVAIL / "utilisateurs" / config.UTILISATEUR / config.PROJET


def dossier_session(conversation_id: str) -> Path:
    return dossier_projet() / "sessions" / conversation_id


def dossier_partage() -> Path:
    return config.ESPACE_TRAVAIL / "partage"


def binaires_python() -> Path:
    return dossier_partage() / "python" / ("Scripts" if os.name == "nt" else "bin")


# ── Profils et environnement (fonctions pures) ───────────────────────────────


def _plateforme(windows: bool) -> dict[str, Any]:
    # Sans sandbox Windows configuré, Codex rejette toute commande (« blocked by policy »).
    return {"windows": {"sandbox": "unelevated"}} if windows else {}


def permissions_session(session: Path, windows: bool = os.name == "nt") -> dict[str, Any]:
    """Écriture dans la session et le partage, lecture du projet et du système, rien d'autre ; réseau ouvert.

    Sous Windows (dev local), le sandbox de Codex ne sait pas interdire la lecture d'une partie du disque : il refuse
    alors de tourner. On n'y confine que l'écriture ; le vrai bunker est celui de la VM (Linux).
    """
    if windows:
        fichiers = {":root": "read", str(session): "write", str(dossier_partage()): "write"}
    else:
        fichiers = {
            ":minimal": "read",
            str(dossier_projet()): "read",
            str(session): "write",
            str(dossier_partage()): "write",
            str(config.CODEX_HOME): "deny",
        }
    return _plateforme(windows) | {
        "default_permissions": "bunker",
        "permissions": {
            "bunker": {
                "description": "Session Atlas : écrit dans sa session, lit son projet.",
                "filesystem": fichiers,
                "network": {"enabled": True},
            }
        },
    }


def permissions_lecture_seule(dossier: Path, windows: bool = os.name == "nt") -> dict[str, Any]:
    """Pour le vérificateur : lit son dossier et le système, n'écrit rien, pas de réseau (sous Windows : lit tout)."""
    if windows:
        fichiers = {":root": "read"}
    else:
        fichiers = {":minimal": "read", str(dossier): "read", str(config.CODEX_HOME): "deny"}
    return _plateforme(windows) | {
        "default_permissions": "verification",
        "permissions": {
            "verification": {
                "description": "Vérification : aucun accès utile.",
                "filesystem": fichiers,
                "network": {"enabled": False},
            }
        },
    }


def environnement_shell(session: Path) -> dict[str, Any]:
    """Variables des commandes des agents : le minimum du système (sans les secrets du serveur), le Python partagé
    en tête du PATH, et des dossiers temporaires et caches dans la session ou le partage."""
    tmp = str(session / ".tmp")
    return {
        "inherit": "core",
        "set": {
            "PATH": os.pathsep.join([str(binaires_python()), os.environ.get("PATH", "")]),
            "VIRTUAL_ENV": str(dossier_partage() / "python"),
            "PIP_CACHE_DIR": str(dossier_partage() / "pip"),
            "TMPDIR": tmp,
            "TMP": tmp,
            "TEMP": tmp,
            "XDG_CACHE_HOME": tmp,
            "MPLCONFIGDIR": tmp,
        },
    }


# ── Préparation des dossiers ─────────────────────────────────────────────────


def preparer_session(conversation_id: str) -> Path:
    """Crée l'arborescence de la session (et du projet, et le Python partagé) si besoin ; renvoie la session."""
    projet = dossier_projet()
    for nom in SOUS_DOSSIERS_PROJET:
        (projet / nom).mkdir(parents=True, exist_ok=True)
    session = dossier_session(conversation_id)
    ancien = config.ESPACE_TRAVAIL / conversation_id  # disposition d'avant le bunker
    if ancien.is_dir() and not session.exists():
        shutil.move(str(ancien), str(session))
    for nom in SOUS_DOSSIERS_SESSION:
        (session / nom).mkdir(parents=True, exist_ok=True)
    python = dossier_partage() / "python"
    if not python.exists():
        # Voit aussi les paquets installés avec le serveur (dont les paquets scientifiques de l'image Docker).
        subprocess.run([sys.executable, "-m", "venv", "--system-site-packages", str(python)], check=True)
    (dossier_partage() / "pip").mkdir(exist_ok=True)
    return session
