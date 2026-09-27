"""Parcours enregistrés : un fichier JSON dans le bunker de la session (`docs_session/parcours/`), annoncé dans la
conversation par un message que le front montre comme une carte « ▶ Parcours ».

Le parcours (atlas/navigation.py, `compiler_parcours`) est préparé par l'agent navigateur, pour la voix ou pour
l'orchestrateur ; il ne change jamais la vue enregistrée. Il se déroule à la voix pendant un appel (outil
`jouer_etape`), ou aux boutons suivant / précédent hors appel. Pas de table : le fichier fait foi, et il apparaît
dans la vue Documents de l'espace.
"""

import json
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any

from . import conversations

SOUS_DOSSIER = Path("docs_session") / "parcours"


class ErreurParcours(Exception):
    pass


def _slug(titre: str) -> str:
    t = unicodedata.normalize("NFD", titre).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:50] or "parcours"


def enregistrer(session: Path, conversation_id: str | None, parcours: dict[str, Any]) -> str:
    """Écrit le parcours dans la session et l'annonce dans la conversation ; renvoie son chemin, relatif au
    dossier de l'espace (celui que lit la vue Documents : sessions/<conversation>/docs_session/parcours/…)."""
    dossier = session / SOUS_DOSSIER
    dossier.mkdir(parents=True, exist_ok=True)
    fichier = dossier / f"{_slug(parcours['titre'])}-{datetime.now():%Y%m%d-%H%M%S}.json"
    fichier.write_text(json.dumps(parcours, ensure_ascii=False, indent=1), encoding="utf-8")
    chemin = fichier.relative_to(session.parent.parent).as_posix()
    if conversation_id:
        n = len(parcours["etapes"])
        conversations.ajouter_message(
            conversation_id,
            "systeme",
            f"Parcours « {parcours['titre']} » ({n} étape{'s' if n > 1 else ''}) : {chemin}",
            donnees={"type": "parcours", "chemin": chemin, "titre": parcours["titre"], "etapes": n},
        )
    return chemin


def lire(dossier_projet: Path, chemin: str) -> dict[str, Any]:
    """Un parcours de l'espace, par son chemin relatif au dossier de l'espace (ou juste son nom de fichier dans
    une session de l'espace)."""
    base = dossier_projet.resolve()
    fichier = (base / chemin).resolve()
    if not fichier.is_relative_to(base):
        raise ErreurParcours(f"Parcours hors de l'espace : {chemin}.")
    if not fichier.is_file():
        trouves = sorted(base.glob(f"sessions/*/{SOUS_DOSSIER.as_posix()}/{Path(chemin).name}"))
        if len(trouves) != 1:
            raise ErreurParcours(f"Parcours introuvable : {chemin}.")
        fichier = trouves[0]
    try:
        parcours = json.loads(fichier.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise ErreurParcours(f"Parcours illisible : {chemin} ({e}).") from None
    if not isinstance(parcours, dict) or not isinstance(parcours.get("etapes"), list):
        raise ErreurParcours(f"Ce fichier n'est pas un parcours : {chemin}.")
    return parcours
