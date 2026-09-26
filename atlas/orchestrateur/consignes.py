"""Consignes des agents : un fichier Markdown par agent dans `prompts/`.

Relues à chaque tour (et à chaque vérification) : modifier un prompt ne demande pas de redémarrer le serveur.
"""

from pathlib import Path

DOSSIER_PROMPTS = Path(__file__).parent / "prompts"


def consigne(agent: str) -> str:
    return (DOSSIER_PROMPTS / f"{agent}.md").read_text(encoding="utf-8")


def consigne_complete(agent: str) -> str:
    """Consigne d'un agent de la session, suivie de la description de son bunker (`environnement.md`)."""
    return f"{consigne(agent).rstrip()}\n\n{consigne('environnement')}"


def relais(chemin: str, message: str) -> str:
    """Message de Camille à un sous-agent, confié à l'orchestrateur : Codex refuse toute entrée directe aux
    sous-agents (multi-agents v2), seul un agent peut leur écrire (`send_message`, `followup_task`)."""
    return consigne("relais").replace("{chemin}", chemin).replace("{message}", message.strip())
