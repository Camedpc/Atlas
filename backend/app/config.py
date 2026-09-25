import os
from pathlib import Path

from dotenv import load_dotenv

# En local, le .env est à la racine du repo ; sur Render, les variables sont injectées.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SECRET_KEY = os.environ["SUPABASE_SECRET_KEY"]

MODELE_CHERCHEUR = os.environ.get("MODELE_CHERCHEUR", "claude-opus-5")
MODELE_VERIFICATEUR = os.environ.get("MODELE_VERIFICATEUR", "claude-opus-5")
EFFORT_CHERCHEUR = os.environ.get("EFFORT_CHERCHEUR", "high")
EFFORT_VERIFICATEUR = os.environ.get("EFFORT_VERIFICATEUR", "high")

# Garde-fous de coût
MAX_TOURS_CHERCHEUR = int(os.environ.get("MAX_TOURS_CHERCHEUR", "80"))
VERIFICATIONS_PARALLELES = int(os.environ.get("VERIFICATIONS_PARALLELES", "4"))

CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
