"""Fichiers d'un projet du bunker, pour la vue Documents : arborescence et accès sûr à un fichier.

Seul le dossier du projet est exposé (espace/utilisateurs/<utilisateur>/<projet>/) ; les dossiers cachés
(`.tmp`, `.codex`…) et les caches Python n'y figurent pas.
"""

from pathlib import Path
from typing import Any

IGNORES = {"__pycache__", "node_modules", ".ipynb_checkpoints"}
# Au-delà, l'arborescence est tronquée (un agent peut produire des milliers de fichiers).
MAX_ENTREES = 4000


class CheminInterdit(ValueError):
    """Chemin hors du projet, caché, ou inexistant."""


def _visible(p: Path) -> bool:
    return not p.name.startswith(".") and p.name not in IGNORES


def arborescence(racine: Path, max_entrees: int = MAX_ENTREES) -> dict[str, Any]:
    """Arbre du dossier `racine` : dossiers d'abord, puis fichiers, par ordre alphabétique.

    Chaque nœud : `nom`, `chemin` (relatif à la racine, séparé par /), `type` (dossier | fichier) ;
    les fichiers ont `taille` (octets) et `modifie` (horodatage Unix), les dossiers `enfants`.
    `tronque` vaut True si l'arbre a dépassé `max_entrees`.
    """
    compte = 0
    tronque = False

    def parcourir(dossier: Path, relatif: str) -> list[dict[str, Any]]:
        nonlocal compte, tronque
        try:
            entrees = sorted((e for e in dossier.iterdir() if _visible(e)), key=lambda e: (e.is_file(), e.name.lower()))
        except OSError:
            return []
        noeuds = []
        for e in entrees:
            if compte >= max_entrees:
                tronque = True
                break
            compte += 1
            chemin = f"{relatif}/{e.name}" if relatif else e.name
            if e.is_dir():
                noeuds.append({"nom": e.name, "chemin": chemin, "type": "dossier", "enfants": parcourir(e, chemin)})
            else:
                try:
                    stat = e.stat()
                except OSError:
                    continue
                noeud = {"nom": e.name, "chemin": chemin, "type": "fichier"}
                noeuds.append(noeud | {"taille": stat.st_size, "modifie": stat.st_mtime})
        return noeuds

    enfants = parcourir(racine, "") if racine.is_dir() else []
    return {"nom": racine.name, "chemin": "", "type": "dossier", "enfants": enfants, "tronque": tronque}


def fichier_du_projet(racine: Path, relatif: str) -> Path:
    """Le fichier `relatif` du projet, si c'est bien un fichier visible à l'intérieur de `racine`."""
    base = racine.resolve()
    cible = (base / relatif).resolve()
    if not cible.is_relative_to(base) or cible == base:
        raise CheminInterdit(relatif)
    if any(not _visible(Path(partie)) for partie in cible.relative_to(base).parts):
        raise CheminInterdit(relatif)
    if not cible.is_file():
        raise CheminInterdit(relatif)
    return cible
