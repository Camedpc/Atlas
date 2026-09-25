"""Validité effective — même algorithme que frontend/src/lib/validite.ts.

Cas de test partagés : shared/fixtures/validite/*.json.
"""

from .modele import Demonstration, Noeud, Statut


def calculer_etablis(noeuds: list[Noeud]) -> set[str]:
    """Point fixe : on part des nœuds admis, puis on ajoute tout nœud possédant une
    démonstration valide dont toutes les prémisses sont déjà établies, jusqu'à
    stabilité. Deux démonstrations circulaires ne peuvent donc jamais se valider."""
    etablis = {n.id for n in noeuds if n.admis}
    change = True
    while change:
        change = False
        for n in noeuds:
            if n.id in etablis:
                continue
            if any(
                d.validite == "valide" and all(p in etablis for p in d.justifie_par)
                for d in n.demonstrations
            ):
                etablis.add(n.id)
                change = True
    return etablis


def statut_noeud(n: Noeud, etablis: set[str]) -> Statut:
    if n.id in etablis:
        return "etabli"
    demos = n.demonstrations
    # Validée mais au moins une prémisse ne l'est pas.
    if any(d.validite == "valide" for d in demos):
        return "suspendu"
    if any(d.validite == "a_verifier" for d in demos):
        return "a_verifier"
    if demos:
        return "invalide"
    return "ouvert"


def calculer_statuts(noeuds: list[Noeud]) -> dict[str, Statut]:
    etablis = calculer_etablis(noeuds)
    return {n.id: statut_noeud(n, etablis) for n in noeuds}


def premisses_manquantes(d: Demonstration, etablis: set[str]) -> list[str]:
    return [p for p in d.justifie_par if p not in etablis]
