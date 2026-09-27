"""Assemblage du graphe à partir des lignes Supabase. Fonctions pures, sans I/O."""

from collections import defaultdict
from collections.abc import Iterable

from .modeles import Arete, Demonstration, DetailNoeud, Graphe, LigneNoeud, Noeud, Statut


def calculer_statuts(
    noeuds: Iterable[LigneNoeud], demonstrations: Iterable[Demonstration]
) -> dict[str, Statut]:
    """Statut effectif de chaque nœud.

    Un nœud est établi s'il est admis, s'il est une décision (posée avec ses raisons, jamais démontrée :
    voir `decisions.py`), ou s'il a une démonstration valide dont toutes les prémisses sont établies. On part des
    admis et on propage jusqu'au point fixe : un cycle de démonstrations ne peut donc jamais s'auto-valider.
    """
    noeuds = list(noeuds)
    par_noeud = _par_noeud(demonstrations)

    etablis = {n.id for n in noeuds if n.admis or n.type == "decision"}
    change = True
    while change:
        change = False
        for n in noeuds:
            if n.id not in etablis and any(
                d.validite == "valide" and all(p in etablis for p in d.justifie_par)
                for d in par_noeud[n.id]
            ):
                etablis.add(n.id)
                change = True

    return {n.id: _statut(n.id in etablis, par_noeud[n.id]) for n in noeuds}


def _statut(etabli: bool, demos: list[Demonstration]) -> Statut:
    if etabli:
        return "etabli"
    validites = {d.validite for d in demos}
    if "valide" in validites:
        return "suspendu"  # démonstration valide, mais une prémisse n'est pas établie
    if "a_verifier" in validites:
        return "a_verifier"
    if demos:
        return "invalide"
    return "ouvert"


def assembler(noeuds: Iterable[LigneNoeud], demonstrations: Iterable[Demonstration]) -> Graphe:
    noeuds = sorted(noeuds, key=lambda n: (n.cree_le, n.id))
    demonstrations = sorted(demonstrations, key=lambda d: (d.cree_le, d.noeud_id, d.nom_demonstration))
    statuts = calculer_statuts(noeuds, demonstrations)
    par_noeud = _par_noeud(demonstrations)

    return Graphe(
        noeuds=[
            Noeud(**n.model_dump(), statut=statuts[n.id], demonstrations=par_noeud[n.id]) for n in noeuds
        ],
        aretes=[
            Arete(source=p, cible=d.noeud_id, nom_demonstration=d.nom_demonstration, validite=d.validite)
            for d in demonstrations
            for p in d.justifie_par
        ],
    )


def detailler(graphe: Graphe, noeud_id: str) -> DetailNoeud | None:
    noeud = next((n for n in graphe.noeuds if n.id == noeud_id), None)
    if noeud is None:
        return None
    return DetailNoeud(
        **noeud.model_dump(),
        premisses=list(dict.fromkeys(p for d in noeud.demonstrations for p in d.justifie_par)),
        utilise_par=list(dict.fromkeys(a.cible for a in graphe.aretes if a.source == noeud_id)),
    )


def _par_noeud(demonstrations: Iterable[Demonstration]) -> defaultdict[str, list[Demonstration]]:
    par_noeud: defaultdict[str, list[Demonstration]] = defaultdict(list)
    for d in demonstrations:
        par_noeud[d.noeud_id].append(d)
    return par_noeud
