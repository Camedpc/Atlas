"""Site public : réglages de l'admin (table `reglages`) et médias de la page d'accueil (bucket public « site »).

- `video` : {"chemin", "type"} de la vidéo de la page d'accueil, et `affiche` : son image d'attente ;
- `demo` : {"modele", "copie"} : l'espace que l'admin a choisi comme démo, et la copie de travail où le jury
  travaille (réinitialisée depuis le modèle par `copier_espace`, voir la migration 20260929000000_site_demo.sql).
"""

import os
import re
import unicodedata
from datetime import UTC, datetime
from typing import Any

from .client import supabase

BUCKET = "site"
VIDEO = "video"
AFFICHE = "affiche"
DEMO = "demo"
TAILLE_MAX = 50 * 1024 * 1024
TYPES = {VIDEO: {"video/mp4", "video/webm"}, AFFICHE: {"image/jpeg", "image/png", "image/webp"}}


class MediaRefuse(ValueError):
    pass


def lire(cle: str) -> dict[str, Any] | None:
    lignes = supabase().table("reglages").select("valeur").eq("cle", cle).execute().data
    return lignes[0]["valeur"] if lignes else None


def ecrire(cle: str, valeur: dict[str, Any]) -> None:
    supabase().table("reglages").upsert({"cle": cle, "valeur": valeur}).execute()


def url_publique(chemin: str) -> str:
    return f"{os.environ['SUPABASE_URL'].rstrip('/')}/storage/v1/object/public/{BUCKET}/{chemin}"


def etat_public() -> dict[str, Any]:
    """Ce que lit la page d'accueil (et la page de démo) : URL de la vidéo et de son affiche, espace de démo."""
    video, affiche, demo = lire(VIDEO), lire(AFFICHE), lire(DEMO)
    return {
        "video": url_publique(video["chemin"]) if video else None,
        "affiche": url_publique(affiche["chemin"]) if affiche else None,
        "demo": (demo or {}).get("copie"),
    }


def nom_de_fichier(nom: str) -> str:
    """« Présentation finale.mp4 » → « presentation-finale.mp4 » : un nom sûr dans une URL."""
    base, _, ext = nom.rpartition(".")
    ascii_ = unicodedata.normalize("NFKD", base or ext).encode("ascii", "ignore").decode()
    propre = re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-")
    return f"{propre or 'media'}.{ext.lower()}" if base else propre or "media"


def televerser(genre: str, nom: str, type_: str, contenu: bytes) -> dict[str, str]:
    """Range la vidéo (ou l'affiche) dans le bucket public et en fait celle de la page d'accueil. Les anciennes
    restent dans le bucket : revenir en arrière ne demande qu'un réglage."""
    if genre not in TYPES:
        raise MediaRefuse(f"Média inconnu : {genre}")
    if type_ not in TYPES[genre]:
        raise MediaRefuse(f"Format refusé ({type_}) : {', '.join(sorted(TYPES[genre]))} seulement.")
    if not contenu:
        raise MediaRefuse("Fichier vide.")
    if len(contenu) > TAILLE_MAX:
        raise MediaRefuse(f"Fichier trop lourd ({len(contenu) // 2**20} Mo) : 50 Mo au plus.")
    horodatage = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    chemin = f"{genre}s/{horodatage}-{nom_de_fichier(nom)}"
    supabase().storage.from_(BUCKET).upload(chemin, contenu, {"content-type": type_, "cache-control": "31536000"})
    valeur = {"chemin": chemin, "type": type_, "nom": nom}
    ecrire(genre, valeur)
    return valeur


def copier_espace(modele: str, copie: str, auteur: str = "admin") -> dict[str, str]:
    """Remplace le contenu de `copie` par celui de `modele`, tout ou rien ; renvoie {ancienne conversation:
    nouvelle}."""
    return supabase().rpc("copier_espace", {"modele": modele, "copie": copie, "auteur": auteur}).execute().data
