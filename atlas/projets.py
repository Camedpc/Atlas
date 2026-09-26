"""Projets (espaces de travail) dans Supabase. Chacun a un dossier dans le bunker, dérivé de son nom."""

import re
import unicodedata

from .client import supabase
from .modeles import Projet

# Projet des conversations d'avant les espaces (et de celles sans projet) : dossier déjà utilisé par le bunker.
DOSSIER_PAR_DEFAUT = "defaut"
LONGUEUR_MAX_DOSSIER = 40


def nom_de_dossier(nom: str, existants: set[str]) -> str:
    """« Supraconductivité des hydrures » → « supraconductivite-des-hydrures », suffixé s'il est déjà pris."""
    ascii_ = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-")[:LONGUEUR_MAX_DOSSIER].strip("-") or "projet"
    dossier, n = base, 2
    while dossier in existants:
        dossier, n = f"{base}-{n}", n + 1
    return dossier


def lister_projets() -> list[Projet]:
    lignes = supabase().table("projets").select("*").order("modifie_le", desc=True).execute().data
    return [Projet.model_validate(ligne) for ligne in lignes]


def lire_projet(projet_id: str) -> Projet | None:
    lignes = supabase().table("projets").select("*").eq("id", projet_id).execute().data
    return Projet.model_validate(lignes[0]) if lignes else None


def projet_par_defaut() -> Projet | None:
    lignes = supabase().table("projets").select("*").eq("dossier", DOSSIER_PAR_DEFAUT).execute().data
    return Projet.model_validate(lignes[0]) if lignes else None


def creer_projet(nom: str, description: str = "") -> Projet:
    existants = {ligne["dossier"] for ligne in supabase().table("projets").select("dossier").execute().data}
    ligne = {"nom": nom.strip(), "description": description.strip(), "dossier": nom_de_dossier(nom, existants)}
    return Projet.model_validate(supabase().table("projets").insert(ligne).execute().data[0])


def id_ou_defaut(projet_id: str | None) -> str:
    """Projet dont on lit ou écrit le graphe : celui donné, sinon le projet « defaut » (conversations sans projet)."""
    if projet_id:
        return projet_id
    defaut = projet_par_defaut()
    if defaut is None:
        raise RuntimeError(f"Projet « {DOSSIER_PAR_DEFAUT} » absent de Supabase : appliquer les migrations.")
    return defaut.id


def dossier_de(projet_id: str | None) -> str:
    """Dossier du projet d'une conversation (celui par défaut si elle n'en a pas)."""
    projet = lire_projet(projet_id) if projet_id else None
    return projet.dossier if projet else DOSSIER_PAR_DEFAUT
