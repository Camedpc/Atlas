"""Réglages de la voix d'Atlas : variables d'environnement du .env d'Atlas (voir .env.example, section Voix)."""

import os

from ..orchestrateur import config as config_orchestrateur


def _texte(nom: str, defaut: str) -> str:
    return os.environ.get(nom) or defaut


def _flottant(nom: str, defaut: float | None) -> float | None:
    valeur = os.environ.get(nom)
    return float(valeur) if valeur else defaut


# Le .env est chargé par la config de l'orchestrateur.
RACINE = config_orchestrateur.RACINE

GRADIUM_API_KEY = os.environ.get("GRADIUM_API_KEY", "")
GRADIUM_WSS = _texte("ATLAS_VOIX_GRADIUM_WSS", "wss://eu.api.gradium.ai")

# Transcription (Gradium STT)
STT_LANGUE = _texte("ATLAS_VOIX_LANGUE", "fr")
STT_DELAI = int(_texte("ATLAS_VOIX_STT_DELAI", "10"))
"""Contexte en trames de 80 ms : 10 ≈ 0,35 à 0,7 s entre la fin de la phrase et le texte ; 16 ≈ 1,1 s."""
STT_DUREE = float(_texte("ATLAS_VOIX_STT_DUREE", "240"))
"""Âge (s) à partir duquel la session STT est renouvelée au premier silence : Gradium coupe à 300 s (offre gratuite)."""
STT_DUREE_FORCEE = float(_texte("ATLAS_VOIX_STT_DUREE_FORCEE", "285"))
"""Au-delà, le tour en cours est clos et la session renouvelée, même si Camille parle."""
STT_TEMPERATURE = _flottant("ATLAS_VOIX_STT_TEMPERATURE", None)
STT_BOOST = float(_texte("ATLAS_VOIX_STT_BOOST", "3"))
MOTS_CLES = [
    m
    for m in _texte("ATLAS_VOIX_MOTS_CLES", "Atlas,Codex,Camille,Gradium,Supabase,graphe,orchestrateur").split(",")
    if m
]

# Tours de parole (VAD sémantique, une mesure toutes les 80 ms)
FIN_TOUR_HORIZON = int(_texte("ATLAS_VOIX_FIN_TOUR_HORIZON", "2"))
"""Horizon regardé pour la fin de tour : 0 = 0,5 s, 1 = 1 s, 2 = 2 s, 3 = 3 s."""
FIN_TOUR_SEUIL = float(_texte("ATLAS_VOIX_FIN_TOUR_SEUIL", "0.6"))
FIN_TOUR_PAS = int(_texte("ATLAS_VOIX_FIN_TOUR_PAS", "3"))
COUPURE_SEUIL = float(_texte("ATLAS_VOIX_COUPURE_SEUIL", "0.35"))
"""Probabilité de silence (horizon 0,5 s) sous laquelle on considère que Camille parle."""
COUPURE_PAS = int(_texte("ATLAS_VOIX_COUPURE_PAS", "4"))

# Synthèse (Gradium TTS)
VOIX = _texte("ATLAS_VOIX_VOIX", "iEu63s1rhn_kegTr")  # Gaspard
TTS_MODELE = _texte("ATLAS_VOIX_TTS_MODELE", "default")
TTS_VITESSE = _flottant("ATLAS_VOIX_TTS_VITESSE", -0.5)

# Agent vocal (Codex, même connexion que l'orchestrateur)
MODELE = config_orchestrateur.modele_agent("voix", "gpt-6-sol")
EFFORT = config_orchestrateur.effort_agent("voix", "low")
TIER = _texte("ATLAS_VOIX_TIER", "fast")
"""Niveau de service Codex : « fast » ≈ 0,9 s au premier mot avec gpt-6-sol, mais consomme plus de quota."""
MODELE_TACHES = config_orchestrateur.modele_agent("tache_vocale", "gpt-6-luna")
EFFORT_TACHES = config_orchestrateur.effort_agent("tache_vocale", "medium")
# Agent navigateur lancé par la voix : même modèle et même effort que le rôle `navigateur` de l'orchestrateur.
MODELE_NAVIGATEUR = config_orchestrateur.modele_agent("navigateur", "gpt-6-astra")
EFFORT_NAVIGATEUR = config_orchestrateur.effort_agent("navigateur", "medium")

ENREGISTRER = os.environ.get("ATLAS_VOIX_ENREGISTRER") == "1"
"""Diagnostic : écrit le micro reçu et les tours transcrits dans le .tmp de la session (appel-<id>.wav/.json)."""

PRECHAUFFAGE_S = float(_texte("ATLAS_VOIX_PRECHAUFFAGE_S", "600"))
"""Atlas voix préparé à l'avance à l'ouverture d'une conversation, gardé prêt ce nombre de secondes (0 = jamais)."""

# Contexte donné à la voix au décroché : derniers messages de la conversation.
CONTEXTE_MESSAGES = int(_texte("ATLAS_VOIX_CONTEXTE_MESSAGES", "30"))

# Adresse à laquelle le serveur MCP de la voix rappelle atlas.serveur (même machine, même conteneur).
URL_INTERNE = _texte("ATLAS_URL_INTERNE", "http://127.0.0.1:8000")
