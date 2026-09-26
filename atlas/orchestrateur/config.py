"""Configuration de l'orchestrateur : tout vient des variables d'environnement (voir .env.example).

Rien de propre à une machine ici : passer du poste local à une VM ne demande que de changer le .env.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

RACINE = Path(__file__).resolve().parents[2]
load_dotenv(RACINE / ".env")


def _optionnel(nom: str) -> str | None:
    return os.environ.get(nom) or None


# Vide = modèle par défaut de Codex.
MODELE = _optionnel("ATLAS_MODELE_ORCHESTRATEUR")
EFFORT = os.environ.get("ATLAS_EFFORT_ORCHESTRATEUR", "high")

# Chaque conversation travaille dans son propre sous-dossier.
ESPACE_TRAVAIL = Path(os.environ.get("ATLAS_ESPACE_TRAVAIL") or RACINE / "espace").resolve()

# Clé OpenAI : seule connexion de l'orchestrateur (enregistrée dans CODEX_HOME au premier tour).
OPENAI_API_KEY = _optionnel("OPENAI_API_KEY")

# Bunker (voir bunker.py) : utilisateur et projet des conversations — un seul de chaque pour l'instant.
UTILISATEUR = os.environ.get("ATLAS_UTILISATEUR") or "camille"
PROJET = os.environ.get("ATLAS_PROJET") or "defaut"
# 1 (défaut) = agents confinés dans leur session ; 0 = accès complet à la machine, sans sandbox.
BUNKER = os.environ.get("ATLAS_BUNKER", "1") != "0"

# Dossier Codex propre à Atlas (connexion, threads, mémoire) : jamais le ~/.codex de la machine.
CODEX_HOME = Path(os.environ.get("ATLAS_CODEX_HOME") or ESPACE_TRAVAIL / ".codex").resolve()

# Exécutable Codex ; vide = celui installé avec le SDK (openai-codex-cli-bin).
CODEX_BIN = _optionnel("ATLAS_CODEX_BIN")

# Plafond de sous-agents ouverts en même temps par conversation (vide = défaut de Codex).
MAX_SOUS_AGENTS = int(v) if (v := _optionnel("ATLAS_MAX_SOUS_AGENTS")) else None


def modele_agent(agent: str, defaut: str) -> str:
    """Modèle d'un sous-agent ou du vérificateur : ATLAS_MODELE_<AGENT>, sinon `defaut`."""
    return _optionnel(f"ATLAS_MODELE_{agent.upper()}") or defaut


def effort_agent(agent: str, defaut: str) -> str:
    return _optionnel(f"ATLAS_EFFORT_{agent.upper()}") or defaut


# Vérificateur : démonstrations jugées en même temps, seuil de confiance sous lequel le modèle de recours rejuge,
# et durée maximale d'un appel à l'outil `verifier` (en secondes, au-delà Codex l'abandonne).
MAX_VERIFICATIONS = int(os.environ.get("ATLAS_MAX_VERIFICATIONS") or 6)
SEUIL_CONFIANCE = float(os.environ.get("ATLAS_SEUIL_CONFIANCE") or 0.8)
DELAI_VERIFICATION = int(os.environ.get("ATLAS_DELAI_VERIFICATION") or 1800)

# Jeton exigé sur les routes des conversations (en-tête Authorization: Bearer …). Vide = pas de contrôle (dev local).
# Obligatoire dès que le serveur est joignable depuis Internet : l'orchestrateur exécute des commandes.
JETON_ACCES = _optionnel("ATLAS_JETON_ACCES")

# Origines autorisées à appeler le serveur depuis un navigateur (ex. le front Vercel), séparées par des virgules.
CORS_ORIGINES = [o.strip() for o in os.environ.get("ATLAS_CORS_ORIGINES", "").split(",") if o.strip()]
