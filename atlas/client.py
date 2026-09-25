"""Client Supabase côté serveur. La clé secrète ne doit jamais atteindre le navigateur."""

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

# En local, les variables viennent du .env à la racine ; sur Vercel, elles sont
# injectées et ont priorité (load_dotenv n'écrase rien).
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class ConfigurationManquante(RuntimeError):
    pass


@lru_cache(maxsize=1)
def supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    cle = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not cle:
        raise ConfigurationManquante("SUPABASE_URL et SUPABASE_SECRET_KEY doivent être définies.")
    return create_client(url, cle)
