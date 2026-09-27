"""Traduction des items Codex (messages, commandes, appels d'outils…) en lignes de la table `messages`.
Fonctions pures."""

from typing import Any, NamedTuple

from ..modeles import RoleMessage

# Sorties de commandes, pages web, fichiers… peuvent être énormes : on n'en garde qu'un extrait.
LONGUEUR_MAX_TEXTE = 4000

# Items sans intérêt pour l'historique : l'écho du message utilisateur (déjà enregistré). Le raisonnement n'est
# gardé que par ses titres de réflexion, s'il en a (comme les lignes « thinking » de la CLI Codex).
IGNORES = {"userMessage"}


class LigneMessage(NamedTuple):
    role: RoleMessage
    contenu: str
    donnees: dict[str, Any] | None


def traduire(item: Any, bilan: dict[str, Any] | None = None) -> list[LigneMessage]:
    """Lignes à enregistrer pour un item terminé (`item/completed`) : modèle du SDK ou dict brut (sous-agents).
    `bilan` : mesures d'un sous-agent qui vient de finir, jointes à l'événement (`donnees.bilan`)."""
    element = getattr(item, "root", item)
    if not isinstance(element, dict):
        element = element.model_dump(mode="json", by_alias=True, exclude_none=True)
    type_ = element.get("type", "?")
    if type_ == "agentMessage":
        texte = str(element.get("text") or "")
        return [LigneMessage("assistant", texte, None)] if texte.strip() else []
    if type_ in IGNORES:
        return []
    if type_ == "reasoning":
        titres = titres_reflexion(element.get("summary"))
        return [LigneMessage("outil", " · ".join(titres), {"type": "reasoning", "titres": titres})] if titres else []
    donnees = _tronquer(element)
    if bilan:
        donnees["bilan"] = bilan
    return [LigneMessage("outil", _resume(type_, donnees), donnees)]


def titres_reflexion(resume: Any) -> list[str]:
    """Titres d'un résumé de réflexion Codex (« **Je vérifie…** » → « Je vérifie… »)."""
    parties = resume if isinstance(resume, list) else [resume] if isinstance(resume, str) else []
    return [t for p in parties if isinstance(p, str) and (t := p.strip().strip("*").strip())]


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
