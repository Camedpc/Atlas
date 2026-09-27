"""Bunker : l'arborescence des agents, leur environnement de commandes et le sandbox Codex de l'écriture.

    espace/
      .codex/                               CODEX_HOME (connexion, threads)
      partage/                              commun à toutes les sessions, en écriture
        python/                             environnement Python : `pip install` sert à tout le monde
        pip/                                cache pip
      utilisateurs/<utilisateur>/<projet>/     un dossier par projet (`projets.dossier` dans Supabase)
        doc_projet/  scripts_projet/        livrables du projet, rangés par sujet (écrits par les agents)
        sessions/<conversation>/            dossier de travail de la session
          conv/  docs_session/  scripts/  .tmp/

Toujours actifs : l'arborescence, le Python partagé, le TMPDIR de la session, et la consigne de ne rien consulter
hors de la session et du projet (`prompts/environnement.md`). La lecture n'est pas restreinte techniquement : c'est
un choix, la consigne suffit. `shell_environment_policy` retire les secrets du serveur des commandes sous Windows,
mais Codex l'ignore sur la VM (même `inherit = "none"`) ; sans sandbox, l'agent a de toute façon le même utilisateur
Unix que le serveur (il pourrait lire /proc/1/environ).

Avec ATLAS_BUNKER=1, le sandbox de Codex confine en plus l'écriture à la session, à doc_projet/ et scripts_projet/
du projet et au partage, pour toutes les commandes des agents et leurs descendants (les serveurs MCP, lancés par
Codex, y échappent). Il marche sous Windows,
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


def dossier_utilisateur() -> Path:
    return config.ESPACE_TRAVAIL / "utilisateurs" / config.UTILISATEUR


def dossier_projet(projet: str | None = None) -> Path:
    """Dossier d'un projet (son `dossier` dans Supabase) ; ATLAS_PROJET par défaut."""
    return dossier_utilisateur() / (projet or config.PROJET)


def dossier_session(conversation_id: str, projet: str | None = None) -> Path:
    return dossier_projet(projet) / "sessions" / conversation_id


def dossier_partage() -> Path:
    return config.ESPACE_TRAVAIL / "partage"


def binaires_python() -> Path:
    return dossier_partage() / "python" / ("Scripts" if os.name == "nt" else "bin")


# ── Profils et environnement (fonctions pures) ───────────────────────────────


def permissions_session(session: Path, windows: bool = os.name == "nt") -> dict[str, Any]:
    """Sandbox de l'écriture : lecture partout, écriture dans la session, dans doc_projet/ et scripts_projet/ du
    projet, et dans le partage ; réseau ouvert."""
    projet = session.parent.parent
    plateforme = {"windows": {"sandbox": "unelevated"}} if windows else {}  # sinon « blocked by policy »
    return plateforme | {
        "default_permissions": "bunker",
        "permissions": {
            "bunker": {
                "description": "Session Atlas : écrit dans sa session, les livrables du projet et le partage.",
                "filesystem": {
                    ":root": "read",
                    str(session): "write",
                    str(projet / "doc_projet"): "write",
                    str(projet / "scripts_projet"): "write",
                    str(dossier_partage()): "write",
                },
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


def preparer_projet(projet: str | None = None) -> Path:
    racine = dossier_projet(projet)
    for nom in SOUS_DOSSIERS_PROJET:
        (racine / nom).mkdir(parents=True, exist_ok=True)
    return racine


def preparer_session(conversation_id: str, projet: str | None = None) -> Path:
    """Crée l'arborescence de la session (et du projet, et le Python partagé) si besoin ; renvoie la session."""
    preparer_projet(projet)
    session = dossier_session(conversation_id, projet)
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
