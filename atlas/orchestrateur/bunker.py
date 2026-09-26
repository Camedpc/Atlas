"""Bunker : l'arborescence des agents, leur environnement de commandes et le sandbox Codex de l'écriture.

    espace/
      .codex/                               CODEX_HOME (connexion, threads)
      partage/                              commun à toutes les sessions, en écriture
        python/                             environnement Python : `pip install` sert à tout le monde
        pip/                                cache pip
      utilisateurs/<utilisateur>/<projet>/
        doc_projet/  scripts_projet/        ressources du projet (les agents ne font que les lire)
        sessions/<conversation>/            dossier de travail de la session
          conv/  docs_session/  scripts/  .tmp/

Toujours actifs : l'arborescence, le Python partagé, le TMPDIR de la session, et la consigne de ne rien consulter
hors de la session et du projet (`prompts/environnement.md`). La lecture n'est pas restreinte techniquement : c'est
un choix, la consigne suffit. `shell_environment_policy` retire les secrets du serveur des commandes sous Windows,
mais Codex l'ignore sur la VM (même `inherit = "none"`) ; sans sandbox, l'agent a de toute façon le même utilisateur
Unix que le serveur (il pourrait lire /proc/1/environ).

Avec ATLAS_BUNKER=1, le sandbox de Codex confine en plus l'écriture à la session et au partage, pour toutes les
commandes des agents et leurs descendants (les serveurs MCP, lancés par Codex, y échappent). Il marche sous Windows,
mais pas sur la VM : sous Linux, tout sandbox Codex passe par bubblewrap, qui a besoin de user namespaces que Docker
et le durcissement d'Ubuntu (kernel.apparmor_restrict_unprivileged_userns) refusent. La VM tourne donc à 0.
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


def permissions_session(session: Path, windows: bool = os.name == "nt") -> dict[str, Any]:
    """Sandbox de l'écriture : lecture partout, écriture dans la session et le partage ; réseau ouvert."""
    plateforme = {"windows": {"sandbox": "unelevated"}} if windows else {}  # sinon « blocked by policy »
    return plateforme | {
        "default_permissions": "bunker",
        "permissions": {
            "bunker": {
                "description": "Session Atlas : écrit dans sa session et dans le partage.",
                "filesystem": {":root": "read", str(session): "write", str(dossier_partage()): "write"},
                "network": {"enabled": True},
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
