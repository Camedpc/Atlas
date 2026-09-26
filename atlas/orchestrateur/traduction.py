"""Traduction des items Codex (messages, commandes, appels d'outils…) en lignes de la table `messages`.
Fonctions pures."""

from typing import Any, NamedTuple

from ..modeles import RoleMessage

# Sorties de commandes, pages web, fichiers… peuvent être énormes : on n'en garde qu'un extrait.
LONGUEUR_MAX_TEXTE = 4000

# Items sans intérêt pour l'historique : l'écho du message utilisateur (déjà enregistré) et le raisonnement.
IGNORES = {"userMessage", "reasoning"}


class LigneMessage(NamedTuple):
    role: RoleMessage
    contenu: str
    donnees: dict[str, Any] | None


def traduire(item: Any) -> list[LigneMessage]:
    """Lignes à enregistrer pour un item terminé (`item/completed`)."""
    element = getattr(item, "root", item)
    type_ = element.type
    if type_ == "agentMessage":
        return [LigneMessage("assistant", element.text, None)] if element.text.strip() else []
    if type_ in IGNORES:
        return []
    donnees = _tronquer(element.model_dump(mode="json", by_alias=True, exclude_none=True))
    return [LigneMessage("outil", _resume(type_, donnees), donnees)]


def _resume(type_: str, donnees: dict[str, Any]) -> str:
    """Une ligne lisible pour l'interface ; le détail reste dans `donnees`."""
    match type_:
        case "commandExecution":
            return str(donnees.get("command", type_))
        case "mcpToolCall":
            return f"{donnees.get('server', '?')}.{donnees.get('tool', '?')}"
        case "webSearch":
            return f"Recherche web : {donnees.get('query', '')}".strip()
        case "subAgentActivity":
            return f"Sous-agent {donnees.get('agentPath', '?')} : {donnees.get('kind', '?')}"
        case "collabAgentToolCall":
            return f"Multi-agents : {donnees.get('tool', '?')}"
        case "fileChange":
            chemins = [c.get("path", "?") for c in donnees.get("changes", []) if isinstance(c, dict)]
            return "Fichiers : " + ", ".join(chemins) if chemins else type_
        case _:
            return type_


def _tronquer(valeur: Any) -> Any:
    if isinstance(valeur, str):
        return valeur if len(valeur) <= LONGUEUR_MAX_TEXTE else valeur[:LONGUEUR_MAX_TEXTE] + "…"
    if isinstance(valeur, dict):
        return {k: _tronquer(v) for k, v in valeur.items()}
    if isinstance(valeur, list):
        return [_tronquer(v) for v in valeur]
    return valeur
