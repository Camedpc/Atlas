"""Connecte l'orchestrateur à un compte ChatGPT (usage Codex de l'abonnement), dans le CODEX_HOME d'Atlas.

    python -m atlas.orchestrateur.connexion            # connexion par code (marche aussi en SSH sur une VM)
    python -m atlas.orchestrateur.connexion --statut   # affiche le compte utilisé

Sans effet tant que OPENAI_API_KEY est renseignée : la clé API est alors prioritaire.
"""

import asyncio
import sys

from openai_codex import AsyncCodex

from . import config
from .agent import config_codex


def _decrire(compte) -> str:
    if compte is None:
        return "aucun compte connecté"
    racine = compte.root
    if racine.type == "chatgpt":
        return f"ChatGPT ({racine.email}, offre {racine.plan_type})"
    return "clé API OpenAI" if racine.type == "apiKey" else racine.type


async def main(statut_seul: bool) -> int:
    async with AsyncCodex(config=config_codex()) as codex:
        compte = (await codex.account()).account
        print(f"CODEX_HOME : {config.CODEX_HOME}")
        print(f"Compte actuel : {_decrire(compte)}")
        if config.OPENAI_API_KEY:
            print("OPENAI_API_KEY est renseignée : c'est elle que l'orchestrateur utilisera.")
        if statut_seul:
            return 0

        connexion = await codex.login_chatgpt_device_code()
        print(f"\n1. Ouvrir {connexion.verification_url}\n2. Saisir le code : {connexion.user_code}\n")
        print("En attente de la validation dans le navigateur…")
        fin = await connexion.wait()
        if not fin.success:
            print(f"Échec de la connexion : {fin.error}")
            return 1
        print(f"Connecté : {_decrire((await codex.account()).account)}")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main("--statut" in sys.argv)))
