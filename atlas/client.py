"""Client Supabase côté serveur. La clé secrète ne doit jamais atteindre le navigateur."""

import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import Client, create_client

# En local, les variables viennent du .env à la racine ; sur Vercel, elles sont
# injectées et ont priorité (load_dotenv n'écrase rien).
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class ConfigurationManquante(RuntimeError):
    pass


HOTES_LOCAUX = {"127.0.0.1", "localhost", "::1"}


def verifier_base_locale(url: str) -> None:
    """Garde-fou de test : avec ATLAS_BASE_LOCALE=1, refuse toute base qui n'est pas le Supabase local."""
    if os.environ.get("ATLAS_BASE_LOCALE") and urlparse(url).hostname not in HOTES_LOCAUX:
        raise ConfigurationManquante(
            f"ATLAS_BASE_LOCALE est activé mais SUPABASE_URL pointe vers {url} : "
            "seule une base locale (npx supabase start) est autorisée."
        )


@lru_cache(maxsize=1)
def supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    cle = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not cle:
        raise ConfigurationManquante("SUPABASE_URL et SUPABASE_SECRET_KEY doivent être définies.")
    verifier_base_locale(url)
    return create_client(url, cle)
