"""Consignes des agents : un fichier Markdown par agent dans `prompts/`.

Relues à chaque tour (et à chaque vérification) : modifier un prompt ne demande pas de redémarrer le serveur.
"""

from pathlib import Path

DOSSIER_PROMPTS = Path(__file__).parent / "prompts"


def consigne(agent: str) -> str:
    return (DOSSIER_PROMPTS / f"{agent}.md").read_text(encoding="utf-8")
