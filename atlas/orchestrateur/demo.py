"""Espace de démo du site : une copie de travail d'un espace « modèle » choisi par l'admin, où le jury travaille.

Réinitialiser remplace la copie par une copie neuve du modèle : la base d'abord (`site.copier_espace`, tout ou rien),
puis le dossier du bunker (sessions renommées sous les nouveaux ids de conversation). Le modèle n'est jamais écrit.
"""

import shutil
from pathlib import Path

from .. import conversations, projets, site
from ..modeles import Projet
from . import bunker
from .gestionnaire import gestionnaire

NOM_COPIE = "Démo"


class DemoIndisponible(Exception):
    pass


def _copie(reglage: dict, modele: Projet) -> Projet:
    """La copie de travail, créée (espace « Démo ») à la première réinitialisation."""
    copie = projets.lire_projet(reglage["copie"]) if reglage.get("copie") else None
    if copie is None:
        copie = projets.creer_projet(NOM_COPIE, modele.description)
        site.ecrire(site.DEMO, {**reglage, "copie": copie.id})
    if copie.id == modele.id:
        raise DemoIndisponible("La copie de travail ne peut pas être le modèle lui-même.")
    return copie


def recopier_dossier(source: Path, cible: Path, correspondance: dict[str, str]) -> None:
    """Remplace le dossier `cible` par une copie de `source`, sessions renommées selon `correspondance`."""
    racine = bunker.dossier_utilisateur().resolve()
    if cible.resolve().parent != racine or source.resolve() == cible.resolve():
        raise DemoIndisponible(f"Dossier de copie inattendu : {cible}")
    if cible.exists():
        shutil.rmtree(cible)
    if not source.exists():
        bunker.preparer_projet(cible.name)
        return
    shutil.copytree(source, cible, ignore=shutil.ignore_patterns(".tmp"))
    sessions = cible / "sessions"
    if sessions.is_dir():
        for dossier in list(sessions.iterdir()):
            nouveau = correspondance.get(dossier.name)
            if nouveau:
                dossier.rename(sessions / nouveau)
            elif dossier.is_dir():
                shutil.rmtree(dossier)  # session sans conversation dans la base : rien ne la montre
    bunker.preparer_projet(cible.name)


def reinitialiser(modele_id: str | None = None) -> Projet:
    """Recopie le modèle (celui donné devient le modèle de la démo) dans la copie de travail ; renvoie la copie."""
    reglage = dict(site.lire(site.DEMO) or {})
    if modele_id:
        reglage["modele"] = modele_id
    if not reglage.get("modele"):
        raise DemoIndisponible("Aucun espace n'est choisi comme démo : le choisir dans la page admin.")
    modele = projets.lire_projet(reglage["modele"])
    if modele is None:
        raise DemoIndisponible("L'espace modèle de la démo n'existe plus : en choisir un autre.")
    site.ecrire(site.DEMO, reglage)
    copie = _copie(reglage, modele)
    en_travail = [
        c
        for c in conversations.lister_conversations(copie.id)
        if gestionnaire.en_cours(c.id) or gestionnaire.actif(c.id)
    ]
    if en_travail:
        raise DemoIndisponible("Un agent travaille dans la démo : l'arrêter avant de la réinitialiser.")
    correspondance = site.copier_espace(modele.id, copie.id)
    recopier_dossier(bunker.dossier_projet(modele.dossier), bunker.dossier_projet(copie.dossier), correspondance)
    return copie
