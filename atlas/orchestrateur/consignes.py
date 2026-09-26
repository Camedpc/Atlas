"""Consignes des agents : un fichier Markdown par agent dans `prompts/`.

Relues à chaque tour (et à chaque vérification) : modifier un prompt ne demande pas de redémarrer le serveur.
"""

from pathlib import Path

from . import config

DOSSIER_PROMPTS = Path(__file__).parent / "prompts"


def consigne(agent: str) -> str:
    return (DOSSIER_PROMPTS / f"{agent}.md").read_text(encoding="utf-8")


def consigne_complete(agent: str) -> str:
    """Consigne d'un agent de la session, suivie de la description de son bunker (`environnement.md`)."""
    if not config.BUNKER:
        return consigne(agent)
    return f"{consigne(agent).rstrip()}\n\n{consigne('environnement')}"
