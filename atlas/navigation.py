"""Repères de la vue du graphe, pour naviguer à la voix : « Lemme 7 », « Hypothèse (ii) », « Figure 2 », « §1.2 ».

Fonctions pures (aucun accès à Supabase), sur l'`EtatVue` chargé par `lecture.charger_etat_vue`.

La numérotation recopie celle du front (`construireModele`, frontend/src/graphe-modele.ts) : les nœuds dans
l'ordre des cases (colonne, ligne, id), les jamais placés rangés sous le reste ; les hypothèses à part, en
romains ; les figures à part ; les cadres « §1.2 » dans l'ordre de lecture à chaque niveau. Si le front change
ces règles, les changer ici aussi (test : `tests/test_navigation.py`).

Repris du navigateur d'AtlasVoice (Reddimolk, `app/agents/navigation/vue_atlas.py` et `navigateur.py`) : la
numérotation, la lignée d'un nœud et les nœuds d'un cadre.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Collection
from dataclasses import dataclass, field
from typing import Literal

from .vue import PREFIXE_FIGURE, TAILLE_FIGURE, EtatVue, est_figure

LIBELLES_TYPE = {
    "hypothese": "Hypothèse",
    "definition": "Définition",
    "axiome": "Axiome",
    "choix_modelisation": "Hypothèse",
    "decision": "Décision",
    "lemme": "Lemme",
    "proposition": "Proposition",
    "theoreme": "Théorème",
    "assertion": "Assertion",
    "experience": "Expérience",
    "calcul": "Calcul",
    "observation": "Observation",
    "resultat": "Résultat",
    "conjecture": "Conjecture",
}
ETENDUES = ("seul", "premisses", "consequences", "lignee")
Etendue = Literal["seul", "premisses", "consequences", "lignee"]
Genre = Literal["noeud", "figure", "cadre"]
CANDIDATS_MAX = 6

_ROMAINS = (
    (1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"), (50, "l"), (40, "xl"),
    (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i"),
)  # fmt: skip


class ErreurNavigation(ValueError):
    """Référence introuvable ou ambiguë ; le message est dit tel quel à l'agent."""

    def __init__(self, message: str, candidats: list[str] | None = None):
        super().__init__(message)
        self.candidats = candidats or []


def romains(n: int) -> str:
    r = ""
    for v, s in _ROMAINS:
        while n >= v:
            r += s
            n -= v
    return r


def est_hypothese(type_: str | None) -> bool:
    return type_ in ("hypothese", "choix_modelisation")


def libelle(type_: str | None, admis: bool = False) -> str:
    if type_ in LIBELLES_TYPE:
        return LIBELLES_TYPE[type_]
    return "Fait admis" if admis else "Énoncé"


@dataclass(frozen=True)
class Cible:
    genre: Genre
    id: str
    """Id du nœud, du cadre, ou de la figure sans « fig: »."""
    repere: str
    """« Lemme 7 (Borne inférieure) », « §1.2 Conditions aux bords », « Figure 2 (Profil) »."""


@dataclass
class Reperes:
    noeuds: dict[str, str] = field(default_factory=dict)
    """id de nœud → « Lemme 7 » ou « Hypothèse (ii) »."""
    numeros: dict[str, str] = field(default_factory=dict)
    """id de nœud → « 7 » ou « (ii) »."""
    figures: dict[str, str] = field(default_factory=dict)
    """id de figure (sans « fig: ») → « Figure 2 »."""
    cadres: dict[str, str] = field(default_factory=dict)
    """id de cadre → « §1.2 »."""
    membres: dict[str, list[str]] = field(default_factory=dict)
    """id de cadre → ses nœuds, sous-cadres compris (hors figures), triés."""


def reperer(etat: EtatVue, admis: Collection[str] = ()) -> Reperes:
    """Mêmes règles que `construireModele` (graphe-modele.ts). `admis` : ids des nœuds admis sans type."""
    noeuds = {i: n for i, n in etat.noeuds.items() if not est_figure(i)}
    figures = sorted(i for i in etat.noeuds if est_figure(i))
    places = {i: p for i, p in etat.placements.items() if i in etat.noeuds}

    # Jamais placés : sous tout le reste, sur autant de colonnes que la vue (6 au moins) ; figures encore dessous.
    max_c = max((p.colonne + p.largeur - 1 for p in places.values()), default=-1)
    max_l = max((p.ligne + p.hauteur - 1 for p in places.values()), default=-1)
    colonnes = max(6, max_c + 1)
    non_places = sorted(i for i in noeuds if i not in places)
    provisoire = {i: (k % colonnes, max_l + 2 + k // colonnes) for k, i in enumerate(non_places)}
    ligne_figures = max_l + 2 + -(-len(non_places) // colonnes) + (1 if non_places else 0)
    largeur_f, hauteur_f = TAILLE_FIGURE
    par_rangee = max(1, colonnes // largeur_f)
    for k, i in enumerate(i for i in figures if i not in places):
        provisoire[i] = ((k % par_rangee) * largeur_f, ligne_figures + (k // par_rangee) * hauteur_f)

    def case(i: str) -> tuple[int, int]:
        p = places.get(i)
        return (p.colonne, p.ligne) if p else provisoire[i]

    r = Reperes()
    k = h = 0
    for i in sorted(noeuds, key=lambda i: (*case(i), i)):
        n = noeuds[i]
        if est_hypothese(n.type):
            h += 1
            r.numeros[i] = f"({romains(h)})"
        else:
            k += 1
            r.numeros[i] = str(k)
        r.noeuds[i] = f"{libelle(n.type, i in admis)} {r.numeros[i]}"
    for k, i in enumerate(sorted(figures, key=lambda i: (*case(i), i)), 1):
        r.figures[i.removeprefix(PREFIXE_FIGURE)] = f"Figure {k}"

    # Cadres : sous-arbre de nœuds et coin haut gauche (colonne et ligne minimales, séparément, comme le front).
    groupes = etat.groupes

    def parent(g: str) -> str | None:
        p = groupes[g].parent_id
        return p if p in groupes else None

    membres: dict[str, list[str]] = {g: [] for g in groupes}
    coins: dict[str, tuple[int, int]] = {}
    for i, p in places.items():
        g, profondeur = (p.groupe_id if p.groupe_id in groupes else None), 0
        c, lg = case(i)
        while g is not None and profondeur < 50:
            if not est_figure(i):
                membres[g].append(i)
            c0, l0 = coins.get(g, (c, lg))
            coins[g] = (min(c0, c), min(l0, lg))
            g, profondeur = parent(g), profondeur + 1

    def enfants(p: str | None) -> list[str]:
        return sorted(
            (g for g in groupes if parent(g) == p),
            key=lambda g: (*coins.get(g, (10**9, 10**9)), groupes[g].ordre, g),
        )

    def parcourir(p: str | None, prefixe: str | None) -> None:
        for rang, g in enumerate(enfants(p), 1):
            r.cadres[g] = f"{prefixe}.{rang}" if prefixe else f"§{rang}"
            r.membres[g] = sorted(membres[g])
            parcourir(g, r.cadres[g])

    parcourir(None, None)
    return r


def decrire(etat: EtatVue, reperes: Reperes, genre: Genre, id_: str) -> str:
    """« Lemme 7 (Borne inférieure) », « §1.2 Conditions aux bords », « Figure 2 (Profil) »."""
    if genre == "cadre":
        nom = etat.groupes[id_].nom
        return f"{reperes.cadres[id_]} {nom}".strip()
    if genre == "figure":
        nom = etat.noeuds[PREFIXE_FIGURE + id_].nom
        return f"{reperes.figures[id_]} ({nom})" if nom else reperes.figures[id_]
    nom = etat.noeuds[id_].nom
    return f"{reperes.noeuds[id_]} ({nom})" if nom else reperes.noeuds[id_]


def normaliser(texte: str) -> str:
    """Minuscules sans accents, ponctuation réduite à des espaces (sauf . ( ) _ :) ; « § » devient « cadre »."""
    t = unicodedata.normalize("NFD", texte.replace("§", " cadre ")).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9.()_:]+", " ", t).split())


_NOMBRE_ROMAIN = re.compile(r"^\(?([ivxlcdm]+)\)?$")
_ENTIER = re.compile(r"^\d+$")
_MOTS_CADRE = ("cadre", "section", "paragraphe", "partie")


def resoudre(etat: EtatVue, reperes: Reperes, reference: str) -> Cible:
    """Ce que désigne `reference` : un id, « Lemme 7 » (le numéro fait foi, même si le libellé est mal entendu),
    « Hypothèse (ii) » ou « hypothèse 2 », « Figure 2 », « §1.2 » ou « cadre 1.2 », ou un nom (exact, sinon
    contenu dans un seul nom). Lève ErreurNavigation si rien ne correspond, ou plusieurs choses."""
    brut = reference.strip()
    if not brut:
        raise ErreurNavigation("Référence vide.")
    if brut in reperes.noeuds:
        return Cible("noeud", brut, decrire(etat, reperes, "noeud", brut))
    if brut in reperes.cadres:
        return Cible("cadre", brut, decrire(etat, reperes, "cadre", brut))
    if brut.removeprefix(PREFIXE_FIGURE) in reperes.figures:
        fid = brut.removeprefix(PREFIXE_FIGURE)
        return Cible("figure", fid, decrire(etat, reperes, "figure", fid))

    t = normaliser(brut)
    mots = t.split()
    tete, reste = (mots[0], mots[1:]) if mots else ("", [])

    if tete in _MOTS_CADRE and reste:
        numero = "§" + reste[0].strip(".")
        for g, n in reperes.cadres.items():
            if n == numero:
                return Cible("cadre", g, decrire(etat, reperes, "cadre", g))
        raise ErreurNavigation(f"Aucun cadre {numero}.", sorted(reperes.cadres.values())[:CANDIDATS_MAX])

    if tete in ("figure", "fig", "graphique") and len(reste) == 1 and _ENTIER.match(reste[0]):
        voulu = f"Figure {int(reste[0])}"
        for f, n in reperes.figures.items():
            if n == voulu:
                return Cible("figure", f, decrire(etat, reperes, "figure", f))
        raise ErreurNavigation(f"Aucune {voulu} : il y a {len(reperes.figures)} figure(s).")

    # « Lemme 7 », « 7 », « Hypothèse (ii) », « hypothèse 2 », « (ii) ».
    numero = reste[-1] if len(reste) == 1 else tete if not reste else None
    hypothese = tete.startswith("hypothes") or tete.startswith("choix")
    if numero is not None:
        voulu: str | None = None
        if _ENTIER.match(numero):
            voulu = f"({romains(int(numero))})" if hypothese else str(int(numero))
        elif (m := _NOMBRE_ROMAIN.match(numero)) and (hypothese or numero.startswith("(")):
            voulu = f"({m.group(1)})"
        if voulu is not None:
            for i, n in reperes.numeros.items():
                if n == voulu:
                    return Cible("noeud", i, decrire(etat, reperes, "noeud", i))
            if reste or voulu.startswith("("):
                quoi = "hypothèse" if voulu.startswith("(") else "énoncé"
                raise ErreurNavigation(f"Aucun(e) {quoi} numéroté(e) {voulu}.")

    # Par le nom : exact, sinon contenu dans un seul nom (nœuds, cadres, figures).
    noms: list[tuple[Genre, str, str]] = [
        *(("noeud", i, etat.noeuds[i].nom) for i in reperes.noeuds),
        *(("cadre", g, etat.groupes[g].nom) for g in reperes.cadres),
        *(("figure", f, etat.noeuds[PREFIXE_FIGURE + f].nom) for f in reperes.figures),
    ]
    exacts = [(g, i) for g, i, nom in noms if nom and normaliser(nom) == t]
    trouves = exacts or [(g, i) for g, i, nom in noms if nom and t in normaliser(nom)]
    if len(trouves) == 1:
        g, i = trouves[0]
        return Cible(g, i, decrire(etat, reperes, g, i))
    if not trouves:
        raise ErreurNavigation(f"Rien ne correspond à « {brut} ».")
    candidats = [decrire(etat, reperes, g, i) for g, i in trouves]
    raise ErreurNavigation(f"« {brut} » est ambigu ({len(candidats)} correspondances).", candidats[:CANDIDATS_MAX])


def lignee(etat: EtatVue, noeud: str, etendue: Etendue = "lignee") -> list[str]:
    """Le nœud et ses prémisses (transitivement), ses conséquences, ou les deux ; jamais les figures."""
    if etendue not in ETENDUES:
        raise ErreurNavigation(f"Étendue inconnue : {etendue} (attendu : {', '.join(ETENDUES)}).")
    parents = {i: [p for p, _ in n.premisses if p in etat.noeuds] for i, n in etat.noeuds.items() if not est_figure(i)}
    enfants: dict[str, list[str]] = {i: [] for i in parents}
    for i, ps in parents.items():
        for p in ps:
            enfants.setdefault(p, []).append(i)

    def parcours(voisins: dict[str, list[str]]) -> set[str]:
        vus, pile = {noeud}, [noeud]
        while pile:
            for v in voisins.get(pile.pop(), []):
                if v not in vus:
                    vus.add(v)
                    pile.append(v)
        return vus

    garder = {noeud}
    if etendue in ("premisses", "lignee"):
        garder |= parcours(parents)
    if etendue in ("consequences", "lignee"):
        garder |= parcours(enfants)
    return sorted(garder)
