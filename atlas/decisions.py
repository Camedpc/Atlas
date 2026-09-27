"""Nœuds « décision » (losanges de la vue) : un choix de modélisation ou de méthode, fait par le modèle.

Une décision n'est pas une assertion à démontrer : elle est posée, avec ses raisons. Elle est donc toujours établie
(`graphe.calculer_statuts`), n'a jamais de démonstration, et ne rend rien « suspendu ». Ses détails
(`noeuds.details`, sans migration) :

    {"question": "Pourquoi la chaîne monte-t-elle au-dessus du bécher ?",
     "alternatives": [
        {"libelle": "Réaction du tas (α > 0)", "retenue": true, "groupes": ["sp_reaction"]},
        {"libelle": "Élan seul (α = 0)", "retenue": false, "raison": "Donne h₁ = 0.", "noeuds": ["conj_elan"]}],
     "raison": "Seule une force au point de prise fournit la quantité de mouvement manquante."}

Le losange pointe vers ce qui découle de chaque alternative : des nœuds (`noeuds`) ou des cadres entiers de la vue
(`groupes` : une option = une branche = un cadre). Flèche pleine vers une alternative retenue (plusieurs peuvent
l'être : pistes suivies en parallèle), tiretée et marquée × vers une alternative écartée. Ces liens ne sont pas des
prémisses : ni les triggers, ni les statuts, ni le vérificateur ne les voient. Fonctions pures.
"""

from typing import Any


class ErreurDecision(ValueError):
    """Détails refusés ; le message est renvoyé tel quel à l'agent."""


FORMAT = (
    '{"question": …, "alternatives": [{"libelle": …, "retenue": true, "noeuds"?: [ids], "groupes"?: [ids de '
    'cadres]}, {"libelle": …, "retenue": false, "raison": …, "noeuds"?: [ids], "groupes"?: [ids]}], "raison": …}'
)


def _ids(valeur: Any, quoi: str) -> list[str]:
    valeur = valeur or []
    if not isinstance(valeur, list) or not all(isinstance(n, str) and n for n in valeur):
        raise ErreurDecision(f"{quoi} : liste d'ids.")
    return list(dict.fromkeys(valeur))


def valider(details: Any) -> dict[str, Any]:
    """Détails normalisés d'une décision : une question, au moins deux alternatives dont au moins une retenue, la
    raison de chaque alternative écartée ; `noeuds` et `groupes` (facultatifs) = ce qui découle de l'alternative."""
    if not isinstance(details, dict):
        raise ErreurDecision(f"Une décision a besoin de details : {FORMAT}.")
    question = str(details.get("question") or "").strip()
    if not question:
        raise ErreurDecision("details.question est vide : la décision répond à quelle question ?")
    brutes = details.get("alternatives")
    if not isinstance(brutes, list) or len(brutes) < 2:
        raise ErreurDecision("details.alternatives : au moins deux alternatives (la retenue et les autres).")
    alternatives = []
    for i, a in enumerate(brutes):
        if not isinstance(a, dict) or not str(a.get("libelle") or "").strip():
            raise ErreurDecision(f"details.alternatives[{i}] : il faut un libelle.")
        retenue = a.get("retenue") is True
        raison = str(a.get("raison") or "").strip()
        if not retenue and not raison:
            raise ErreurDecision(f"details.alternatives[{i}] ({a['libelle']}) est écartée : dis pourquoi (raison).")
        alternative: dict[str, Any] = {"libelle": str(a["libelle"]).strip(), "retenue": retenue}
        if raison:
            alternative["raison"] = raison
        for champ in ("noeuds", "groupes"):
            if ids := _ids(a.get(champ), f"details.alternatives[{i}].{champ}"):
                alternative[champ] = ids
        alternatives.append(alternative)
    if not any(a["retenue"] for a in alternatives):
        raise ErreurDecision("Aucune alternative retenue : une question encore ouverte est une conjecture.")
    resultat: dict[str, Any] = {"question": question, "alternatives": alternatives}
    if raison := str(details.get("raison") or "").strip():
        resultat["raison"] = raison
    return resultat


def _cibles(details: Any, champ: str) -> list[tuple[str, bool]]:
    liens: dict[str, bool] = {}
    alternatives = details.get("alternatives") if isinstance(details, dict) else None
    for a in alternatives if isinstance(alternatives, list) else []:
        if not isinstance(a, dict):
            continue
        for n in a.get(champ) or []:
            if isinstance(n, str):
                liens[n] = liens.get(n, False) or a.get("retenue") is True
    return list(liens.items())


def commandes(details: Any) -> list[tuple[str, bool]]:
    """(id du nœud, alternative retenue ?) pour chaque nœud visé, sans doublon (retenue l'emporte). Tolérant : des
    détails mal formés ne visent rien."""
    return _cibles(details, "noeuds")


def cadres(details: Any) -> list[tuple[str, bool]]:
    """(id du cadre, alternative retenue ?) pour chaque cadre visé, comme `commandes`."""
    return _cibles(details, "groupes")


def retenues(details: Any) -> list[str]:
    alternatives = details.get("alternatives") if isinstance(details, dict) else None
    return [str(a.get("libelle")) for a in alternatives or [] if isinstance(a, dict) and a.get("retenue") is True]


def ecartees(details: Any) -> list[dict[str, Any]]:
    alternatives = details.get("alternatives") if isinstance(details, dict) else None
    return [a for a in alternatives or [] if isinstance(a, dict) and a.get("retenue") is not True]


def enonce(details: dict[str, Any]) -> str:
    """Énoncé par défaut d'une décision : l'option retenue, puis les écartées."""
    texte = "On retient : " + " ; ".join(retenues(details)) + "."
    if autres := ecartees(details):
        texte += " Écarté : " + " ; ".join(str(a.get("libelle")) for a in autres) + "."
    return texte


def resume(details: Any) -> str:
    """Une ligne pour lire_vue : « Question ? » ✓ retenue [→ nœuds ▸cadres] ; × écartée [→ …]."""
    if not isinstance(details, dict):
        return ""
    options = []
    for a in details.get("alternatives") or []:
        if not isinstance(a, dict):
            continue
        vers = [*(a.get("noeuds") or []), *(f"▸{g}" for g in a.get("groupes") or [])]
        marque = "✓" if a.get("retenue") is True else "×"
        options.append(f"{marque} {a.get('libelle')}" + (f" → {' '.join(vers)}" if vers else ""))
    return f"« {details.get('question', '')} » " + " ; ".join(options)


def texte(details: Any) -> str:
    """Texte complet (fiche, vérificateur) : question, retenue, écartées et leurs raisons, raison du choix."""
    if not isinstance(details, dict):
        return ""
    lignes = [f"Question : {details.get('question', '')}"]
    for a in details.get("alternatives") or []:
        if not isinstance(a, dict):
            continue
        marque = "retenue" if a.get("retenue") is True else "écartée"
        raison = f" — {a['raison']}" if a.get("raison") else ""
        lignes.append(f"- {marque} : {a.get('libelle', '')}{raison}")
    if details.get("raison"):
        lignes.append(f"Raison du choix : {details['raison']}")
    return "\n".join(lignes)
