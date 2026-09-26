"""Configuration par variables d'environnement (.env à la racine du dépôt en local)."""

from __future__ import annotations

import json
import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

RACINE = Path(__file__).resolve().parents[2]
load_dotenv(RACINE / ".env")


def _env(nom: str, defaut: str | None = None) -> str | None:
    valeur = os.environ.get(nom)
    return valeur if valeur not in (None, "") else defaut


def _json(nom: str) -> dict:
    brut = _env(nom)
    return json.loads(brut) if brut else {}


@dataclass(frozen=True)
class ModeleLLM:
    """Un modèle joignable : `anthropic` (SDK officiel) ou `openai` (toute API compatible OpenAI)."""

    fournisseur: str
    modele: str
    base_url: str | None = None
    cle: str | None = None
    # Champs ajoutés tels quels à la requête (ex. couper le raisonnement : {"reasoning_effort": "none"}).
    extra: dict = field(default_factory=dict)

    @property
    def nom(self) -> str:
        return f"{self.fournisseur}:{self.modele}"


def _modele(prefixe: str, fournisseur: str | None, modele: str | None) -> ModeleLLM | None:
    fournisseur = _env(f"{prefixe}_FOURNISSEUR", fournisseur)
    modele = _env(f"{prefixe}_MODELE", modele)
    if not fournisseur or not modele:
        return None
    cle_defaut = _env("ANTHROPIC_API_KEY") if fournisseur == "anthropic" else _env("OPENAI_API_KEY")
    return ModeleLLM(
        fournisseur=fournisseur,
        modele=modele,
        base_url=_env(f"{prefixe}_BASE_URL"),
        cle=_env(f"{prefixe}_CLE", cle_defaut),
        extra=_json(f"{prefixe}_EXTRA"),
    )


# ── Registre ───────────────────────────────────────────────────
# Sans DATABASE_URL, le registre vit en mémoire (développement, démonstration).
DATABASE_URL = _env("DATABASE_URL")

# ── Couche vocale ──────────────────────────────────────────────
GRADIUM_API_KEY = _env("GRADIUM_API_KEY")
# Endpoint UE de Gradium (section 3.1).
GRADIUM_BASE_URL = _env("GRADIUM_BASE_URL", "https://eu.api.gradium.ai/api/")
# Voix française du catalogue (Damien par défaut ; voir gradbot.flagship_voices()).
ATLAS_VOICE_ID = _env("ATLAS_VOICE_ID", "25AzBFyp6svYnJsj")
# Réglages de la voix (json_config du TTS Gradium) :
# vitesse de parole, de -4 (plus rapide) à 4 (plus lent), 0 par défaut ;
ATLAS_TTS_PADDING_BONUS = float(_env("ATLAS_TTS_PADDING_BONUS", "0"))
# température, de 0 (plus stable, plus régulière) à 1,4 (plus variée), 0,7 par défaut chez Gradium.
ATLAS_TTS_TEMP = float(t) if (t := _env("ATLAS_TTS_TEMP")) else None
# Silence traîné avant de considérer le tour fini (le VAD sémantique de Gradium décide en amont).
ATLAS_FLUSH_S = float(_env("ATLAS_FLUSH_S", "1.5"))

# ── Modèle d'Atlas : rapide, non-raisonnant, avec secours (section 5) ──
LLM_PRINCIPAL = _modele("ATLAS_LLM", "anthropic", "claude-haiku-4-5")
LLM_SECOURS = _modele("ATLAS_LLM_SECOURS", None, None)
# Agent navigateur (comprend la demande et choisit les commandes) : un modèle puissant, gpt-5.5 par défaut
# avec une clé OpenAI ; sans clé OpenAI ni réglage, le modèle d'Atlas.
LLM_NAVIGATEUR = (_modele("ATLAS_NAVIGATEUR_LLM", "openai", "gpt-5.5")
                  if _env("ATLAS_NAVIGATEUR_LLM_FOURNISSEUR") or _env("OPENAI_API_KEY") else LLM_PRINCIPAL)
# Bascule sur le secours si le premier token dépasse ce délai.
LLM_DELAI_BASCULE_S = float(_env("ATLAS_LLM_DELAI_BASCULE_S", "1.5"))
LLM_MAX_TOKENS = int(_env("ATLAS_LLM_MAX_TOKENS", "400"))
# Secret interne entre Gradbot et le proxy LLM (jamais exposé au navigateur).
LLM_JETON_INTERNE = _env("ATLAS_LLM_JETON_INTERNE") or secrets.token_urlsafe(32)
# URL à laquelle Gradbot joint le proxy (le back lui-même).
URL_INTERNE = _env("ATLAS_URL_INTERNE", "http://127.0.0.1:8001")

# ── Sécurité ───────────────────────────────────────────────────
# Si défini, les sessions et l'API exigent un JWT Supabase valide (HS256).
SUPABASE_JWT_SECRET = _env("SUPABASE_JWT_SECRET")
# Clé partagée des agents pour l'API /api/agents.
AGENTS_API_KEY = _env("AGENTS_API_KEY")
# Relais d'affichage : délai maximal d'un compte rendu (écran ou agent navigateur).
AFFICHAGE_DELAI_S = float(_env("ATLAS_AFFICHAGE_DELAI_S", "3"))
# Agent navigateur : API de lecture d'Atlas (graphe, conversations) et son jeton d'accès éventuel.
ATLAS_API_URL = _env("ATLAS_API_URL", "http://127.0.0.1:8000")
ATLAS_JETON_ACCES = _env("ATLAS_JETON_ACCES")
CORS_ORIGINS = [o.strip() for o in (_env("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174") or "").split(",") if o.strip()]

# ── Observabilité ──────────────────────────────────────────────
DOSSIER_DONNEES = Path(_env("ATLAS_DOSSIER_DONNEES", str(RACINE / "donnees")))
# Transcriptions conservées pour l'évaluation (0 = désactivé).
RETENTION_TRANSCRIPTIONS_JOURS = int(_env("ATLAS_RETENTION_JOURS", "30"))
