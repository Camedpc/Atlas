"""Réglages de l'agent vocal, lus dans voix-live/.env puis dans l'environnement (voir .env.example)."""

import os
from pathlib import Path

from dotenv import load_dotenv

RACINE = Path(__file__).resolve().parent.parent
load_dotenv(RACINE / ".env")


def _texte(nom: str, defaut: str) -> str:
    return os.environ.get(nom) or defaut


def _flottant(nom: str, defaut: float | None) -> float | None:
    valeur = os.environ.get(nom)
    return float(valeur) if valeur else defaut


GRADIUM_API_KEY = os.environ.get("GRADIUM_API_KEY", "")
# Serveurs européens : plus proches, donc moins de latence depuis la France.
GRADIUM_WSS = _texte("VOIX_GRADIUM_WSS", "wss://eu.api.gradium.ai")

# Transcription
STT_LANGUE = _texte("VOIX_STT_LANGUE", "fr")
# Contexte (en trames de 80 ms) avant d'émettre du texte : plus haut = plus fiable sur une voix marmonnée.
STT_DELAI = int(_texte("VOIX_STT_DELAI", "10"))
STT_TEMPERATURE = _flottant("VOIX_STT_TEMPERATURE", None)
STT_BOOST = float(_texte("VOIX_STT_BOOST", "3"))
MOTS_CLES = [m for m in _texte("VOIX_MOTS_CLES", "Atlas,Codex,Camille,Gradium,Supabase,graphe").split(",") if m]

# Tours de parole (VAD sémantique de Gradium, une mesure toutes les 80 ms)
FIN_TOUR_HORIZON = int(_texte("VOIX_FIN_TOUR_HORIZON", "2"))
"""Horizon du VAD regardé pour la fin de tour : 0 = 0,5 s, 1 = 1 s, 2 = 2 s, 3 = 3 s."""
FIN_TOUR_SEUIL = float(_texte("VOIX_FIN_TOUR_SEUIL", "0.6"))
"""Probabilité de silence (sur l'horizon choisi) au-delà de laquelle Camille a probablement fini sa phrase."""
FIN_TOUR_PAS = int(_texte("VOIX_FIN_TOUR_PAS", "3"))
"""Nombre de mesures consécutives au-dessus du seuil avant de clore le tour (3 × 80 ms)."""
COUPURE_SEUIL = float(_texte("VOIX_COUPURE_SEUIL", "0.35"))
"""Probabilité de silence (horizon 0,5 s) sous laquelle on considère que Camille parle."""
COUPURE_PAS = int(_texte("VOIX_COUPURE_PAS", "4"))
"""Mesures consécutives de parole pour couper l'agent quand il parle (4 × 80 ms ≈ 320 ms)."""

# Synthèse
VOIX = _texte("VOIX_VOIX", "iEu63s1rhn_kegTr")  # Gaspard : voix française chaleureuse, posée
TTS_MODELE = _texte("VOIX_TTS_MODELE", "default")
TTS_VITESSE = _flottant("VOIX_TTS_VITESSE", -0.5)
"""padding_bonus Gradium : négatif = plus rapide."""

# Cerveau (Codex, compte ChatGPT de Camille)
CODEX_HOME = Path(_texte("VOIX_CODEX_HOME", str(RACINE.parent / "espace" / ".codex")))
MODELE = _texte("VOIX_MODELE", "gpt-5.6-luna")
EFFORT = _texte("VOIX_EFFORT", "low")
TIER = _texte("VOIX_TIER", "fast")
"""Niveau de service Codex : « fast » répond plus vite (≈ 0,85 s au premier mot) mais consomme plus de quota."""
MODELE_TACHES = _texte("VOIX_MODELE_TACHES", "gpt-6-sol")
EFFORT_TACHES = _texte("VOIX_EFFORT_TACHES", "medium")
DOSSIER_TRAVAIL = Path(_texte("VOIX_DOSSIER_TRAVAIL", str(RACINE.parent)))
"""Dossier courant des commandes de l'agent (par défaut le dépôt Atlas)."""

PORT = int(_texte("VOIX_PORT", "8010"))
