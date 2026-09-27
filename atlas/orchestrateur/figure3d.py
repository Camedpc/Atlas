"""Figures 3D : Atlas exécute lui-même le script Python d'une scène (pas l'agent), dans un processus à part.

- interpréteur : le Python partagé des agents (bunker.py), qui voit les paquets qu'ils ont installés ; à défaut
  (tests, partage pas encore créé), celui du serveur ;
- répertoire de travail : le dossier de la session, pour que le script lise les données de l'agent ;
- environnement vidé : le minimum du système, sans aucun secret du serveur (clé Supabase, clé OpenAI…) ;
- durée bornée (ATLAS_DELAI_FIGURE3D) : au-delà, le processus et ses descendants sont tués ;
- sortie dans un dossier temporaire de la session, supprimé ensuite.

Le lanceur (lanceur_figure3d.py) écrit `scene.json`, vérifié ensuite par atlas/figures3d.py.
"""

import os
import shutil
import signal
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .. import figures, figures3d
from . import bunker, config

LANCEUR = Path(__file__).with_name("lanceur_figure3d.py")
SCRIPT_OCTETS_MAX = 200 * 1024
# Variables du système transmises au script (chemins et réglages régionaux, jamais de secret). Le reste est retiré.
SYSTEME = frozenset(
    {
        "PATH",
        "LANG",
        "LC_ALL",
        "TZ",
        # Windows : sans elles, Python et ses bibliothèques ne démarrent pas toujours correctement.
        "SYSTEMROOT",
        "WINDIR",
        "COMSPEC",
        "PATHEXT",
        "PROGRAMFILES",
        "PROGRAMFILES(X86)",
        "PROGRAMW6432",
        "PROGRAMDATA",
        "LOCALAPPDATA",
        "APPDATA",
        "USERPROFILE",
        "NUMBER_OF_PROCESSORS",
        "PROCESSOR_ARCHITECTURE",
    }
)


class ErreurScript(figures.ErreurFigure):
    """Script refusé ou en échec ; le message (fin de la sortie d'erreur comprise) est renvoyé à l'agent."""


@dataclass
class Production:
    scene: dict[str, Any]
    """Scène vérifiée (figures3d.valider_scene)."""
    script: str
    """Le texte du script exécuté."""


def interpreteur() -> str:
    partage = bunker.binaires_python() / ("python.exe" if os.name == "nt" else "python")
    return str(partage) if partage.exists() else sys.executable


def environnement(tmp: Path, source: dict[str, str] | None = None) -> dict[str, str]:
    """Variables du script : celles de `SYSTEME` seulement, le Python partagé en tête du PATH, les dossiers
    temporaires et caches dans `tmp`, et matplotlib sans fenêtre."""
    source = dict(os.environ) if source is None else source
    env = {k: v for k, v in source.items() if k.upper() in SYSTEME}
    env["PATH"] = os.pathsep.join([str(bunker.binaires_python()), source.get("PATH", "")])
    for nom in ("HOME", "TMPDIR", "TMP", "TEMP", "XDG_CACHE_HOME", "MPLCONFIGDIR"):
        env[nom] = str(tmp)
    return env | {"MPLBACKEND": "Agg", "PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1"}


def fin_sortie(texte: str, lignes: int = 40, caracteres: int = 4000) -> str:
    """Les dernières lignes d'une sortie (la trace d'une exception est à la fin)."""
    fin = "\n".join(texte.strip().splitlines()[-lignes:])
    return fin[-caracteres:]


def _tuer(proc: subprocess.Popen) -> None:
    """Tue le processus et ses descendants."""
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, check=False)
        else:
            os.killpg(proc.pid, signal.SIGKILL)
    except OSError:
        proc.kill()


def _lire_script(script: str, racine: Path) -> tuple[Path, str]:
    racine = racine.resolve()
    chemin = (racine / script).resolve()
    if not chemin.is_relative_to(racine):
        raise ErreurScript(f"Le script doit être dans le dossier du projet : {script}.")
    if chemin.suffix != ".py" or not chemin.is_file():
        raise ErreurScript(f"Script introuvable : {script} (fichier .py, chemin relatif au projet ou à la session).")
    if chemin.stat().st_size > SCRIPT_OCTETS_MAX:
        raise ErreurScript(f"Script trop long : {SCRIPT_OCTETS_MAX // 1024} Ko au plus (lis les données d'un fichier).")
    try:
        return chemin, chemin.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise ErreurScript("Le script doit être en UTF-8.") from None


def produire(script: str, session: Path, delai: int | None = None, projet: Path | None = None) -> Production:
    """Exécute `script` (chemin relatif à `projet`, par défaut à `session`) dans le dossier de la session, et renvoie
    la scène vérifiée et le script."""
    chemin, texte = _lire_script(script, projet or session)
    delai = delai or config.DELAI_FIGURE3D
    sortie = session / ".tmp" / f"figure3d-{uuid.uuid4().hex}"
    sortie.mkdir(parents=True)
    # Sorties du script dans des fichiers, pas dans des tubes : un processus qu'il aurait lancé les garderait
    # ouverts, et l'attente de leur fin durerait jusqu'au délai alors que le script a fini.
    journal_std, journal_err = sortie / "stdout.txt", sortie / "stderr.txt"
    try:
        with journal_std.open("wb") as std, journal_err.open("wb") as err:
            proc = subprocess.Popen(
                [interpreteur(), str(LANCEUR), str(chemin), str(sortie)],
                cwd=session,
                env=environnement(sortie),
                stdin=subprocess.DEVNULL,
                stdout=std,
                stderr=err,
                start_new_session=os.name != "nt",
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
            )
            try:
                proc.wait(timeout=delai)
            except subprocess.TimeoutExpired:
                _tuer(proc)
                raise ErreurScript(
                    f"Script arrêté après {delai} s : allège le calcul (moins d'images, maillage plus grossier)."
                ) from None
        if proc.returncode:
            lire = lambda f: f.read_bytes().decode("utf-8", "replace")  # noqa: E731
            detail = fin_sortie(lire(journal_err) or lire(journal_std))
            raise ErreurScript(f"Le script a échoué (code {proc.returncode}) :\n{detail}")
        try:
            donnees = (sortie / "scene.json").read_bytes()
        except FileNotFoundError:
            raise ErreurScript("Le script s'est terminé sans produire la scène (sys.exit avant la fin ?).") from None
        return Production(scene=figures3d.valider_scene(donnees), script=texte)
    finally:
        shutil.rmtree(sortie, ignore_errors=True)
