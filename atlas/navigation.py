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
import uuid
from collections.abc import Collection
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from .vue import PREFIXE_FIGURE, TAILLE_FIGURE, ErreurVue, EtatVue, appliquer, est_figure, est_pseudo

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


def reperer(etat: EtatVue) -> Reperes:
    """Mêmes règles que `construireModele` (graphe-modele.ts)."""
    noeuds = {i: n for i, n in etat.noeuds.items() if not est_pseudo(i)}
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
        r.noeuds[i] = f"{libelle(n.type, n.admis)} {r.numeros[i]}"
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
            if not est_pseudo(i):
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
_ARTICLES = ("le", "la", "l", "du", "de")
_LIBELLES = {" ".join(normaliser(v).split()) for v in LIBELLES_TYPE.values()} | {
    "fait admis",
    "enonce",
    "choix de modelisation",
}


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
    sans_article = mots[1:] if len(mots) > 1 and mots[0] in _ARTICLES else mots
    prefixe = " ".join(sans_article[:-1])
    numero = sans_article[-1] if sans_article and (not prefixe or prefixe in _LIBELLES) else None
    hypothese = prefixe.startswith("hypothes") or prefixe.startswith("choix")
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
            if prefixe or voulu.startswith("("):
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
    parents = {i: [p for p, _ in n.premisses if p in etat.noeuds] for i, n in etat.noeuds.items() if not est_pseudo(i)}
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


# ── Commandes d'écran (P3, protocoles/p3-lot-commandes.schema.json) ──────────

STATUTS = ("etabli", "suspendu", "a_verifier", "invalide", "ouvert")
COTES = ("droite", "gauche", "dessous", "dessus")
PAS_MAX_DEPLACEMENT = 40
FACTEUR_ZOOM_MAX = 100.0


@dataclass
class Selection:
    """Ce que désignent des références, développé : nœuds (lignées, cadres) et figures, dans l'ordre."""

    noeuds: list[str] = field(default_factory=list)
    figures: list[str] = field(default_factory=list)
    reperes: list[str] = field(default_factory=list)
    """Ce qui a été compris, référence par référence (« Lemme 3 (Tension au point de prise) »)."""
    principal: str | None = None
    """Le premier nœud désigné directement : sélectionné, et sa fiche si on la demande."""


def selectionner(
    etat: EtatVue,
    reperes: Reperes,
    references: list[str],
    etendue: Etendue = "seul",
    statuts: Collection[str] = (),
) -> Selection:
    """Nœuds et figures que désignent `references` (un nœud avec sa lignée selon `etendue`, un cadre avec tous
    ses nœuds, une figure), plus les nœuds dont le statut est dans `statuts`."""
    if inconnus := [s for s in statuts if s not in STATUTS]:
        raise ErreurNavigation(f"Statut inconnu : {', '.join(inconnus)} (attendu : {', '.join(STATUTS)}).")
    sel = Selection()
    vus: set[str] = set()

    def ajouter(ids: Collection[str]) -> None:
        for i in ids:
            if i not in vus:
                vus.add(i)
                sel.noeuds.append(i)

    for reference in references:
        cible = resoudre(etat, reperes, reference)
        sel.reperes.append(cible.repere)
        if cible.genre == "noeud":
            sel.principal = sel.principal or cible.id
            ajouter(lignee(etat, cible.id, etendue))
        elif cible.genre == "cadre":
            if not reperes.membres[cible.id]:
                raise ErreurNavigation(f"Le cadre {cible.repere} ne contient aucun nœud.")
            ajouter(reperes.membres[cible.id])
        elif cible.id not in sel.figures:
            sel.figures.append(cible.id)
    if statuts:
        garder = [i for i in reperes.noeuds if etat.noeuds[i].statut in statuts]
        sel.reperes.append(f"{len(garder)} nœud(s) {' ou '.join(statuts)}")
        ajouter(garder)
    return sel


def commandes_montrer(sel: Selection, *, garder_seulement: bool = False, fiche: bool = False) -> list[dict]:
    """Montrer une sélection : la sélectionner (un seul nœud) ou la surligner, l'isoler (les autres nœuds sont
    estompés) si demandé, la cadrer, et ouvrir la fiche du nœud principal si demandé."""
    if not sel.noeuds and not sel.figures:
        raise ErreurNavigation("Rien à montrer.")
    commandes: list[dict] = []
    if garder_seulement:
        commandes.append({"op": "filtres", "patch": {"noeuds": sel.noeuds}})
    seul = len(sel.noeuds) == 1 and sel.principal is not None
    commandes.append({"op": "surligner", "cibles": [] if seul else [{"noeud": i} for i in sel.noeuds]})
    commandes.append({"op": "selectionner", "cible": {"noeud": sel.principal} if seul else None})
    cibles = [{"noeud": i} for i in sel.noeuds] + [{"figure": f} for f in sel.figures]
    commandes.append({"op": "cadrer", "cibles": cibles})
    if fiche and sel.principal is not None:
        commandes.append({"op": "fiche", "cible": {"noeud": sel.principal}})
    return commandes


def commandes_ensemble() -> list[dict]:
    return [{"op": "cadrer", "cibles": "tout"}]


def commandes_effacer() -> list[dict]:
    """Revenir à l'écran neutre : ni filtre, ni surlignage, ni sélection, ni fiche (la caméra ne bouge pas)."""
    return [
        {"op": "effacer_filtres"},
        {"op": "surligner", "cibles": []},
        {"op": "selectionner", "cible": None},
        {"op": "fiche", "cible": None},
    ]


def commandes_zoomer(facteur: float) -> list[dict]:
    if not 0 < facteur <= FACTEUR_ZOOM_MAX:
        raise ErreurNavigation("Facteur de zoom entre 0 et 100 : 1,5 rapproche, 0,6 éloigne.")
    return [{"op": "zoomer", "facteur": facteur}]


# Paliers de zoom affichés par la vue (ZOOMS de graphe.ts) et seuils des niveaux de détail (graphe-dessin.ts).
ZOOMS = (
    (0.04, "−15"), (0.06, "−14"), (0.08, "−13"), (0.1, "−12"), (0.125, "−11"), (0.15, "−10"), (0.175, "−9"),
    (0.2, "−8"), (0.225, "−7"), (0.25, "−6"), (0.375, "−5"), (0.5, "−4"), (0.675, "−3"), (0.75, "−2"), (0.875, "−1"),
    (1.0, "1:1"), (1.25, "+1"), (1.375, "+2"), (1.5, "+3"), (1.675, "+4"), (1.75, "+5"), (1.875, "+6"), (2.0, "+7"),
)  # fmt: skip
SEUIL_POINT = 0.175
SEUIL_CONTENU = 0.6


def palier(z: float) -> str:
    """« −13 (des carrés, sans texte) » : le palier affiché le plus proche et ce qu'on lit à ce zoom."""
    proche = min(ZOOMS, key=lambda p: abs(p[0] - z) / p[0])[1]
    lisible = "des carrés, sans texte" if z < SEUIL_POINT else "les titres" if z < SEUIL_CONTENU else "les énoncés"
    return f"{proche} ({lisible})"


def lot(commandes: list[dict], ecran: str, origine: str = "voix") -> dict:
    """Lot de commandes P3 pour l'écran `ecran`, exécuté tout ou rien par le pilote du front."""
    return {
        "version": 1,
        "lot_id": str(uuid.uuid4()),
        "ecran": ecran,
        "origine": origine,
        "emis_le": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "commandes": commandes,
    }


# ── Déplacements enregistrés (opérations `placer` de la vue) ────────────────


def _element(etat: EtatVue, reperes: Reperes, reference: str) -> tuple[str, str]:
    """(id dans la vue — « fig:<id> » pour une figure —, repère) d'un nœud ou d'une figure."""
    cible = resoudre(etat, reperes, reference)
    if cible.genre == "cadre":
        raise ErreurNavigation(f"{cible.repere} est un cadre : seuls les nœuds et les figures se déplacent ici.")
    return (PREFIXE_FIGURE + cible.id if cible.genre == "figure" else cible.id), cible.repere


def cote_texte(cote: str) -> str:
    return {"droite": "à droite de", "gauche": "à gauche de", "dessous": "sous", "dessus": "au-dessus de"}[cote]


def operations_deplacement(etat: EtatVue, reperes: Reperes, demandes: list[dict]) -> tuple[list[dict], list[str]]:
    """Opérations `placer` (vue.py) pour des déplacements demandés à la voix, validées ensemble sur `etat`.

    Chaque demande : {"quoi", "colonne", "ligne"} (case absolue ; le nœud reste dans son cadre), ou {"quoi",
    "a_cote_de", "cote": droite | gauche | dessous | dessus} (première case libre de ce côté, en s'éloignant ;
    le nœud rejoint le cadre de son voisin). Renvoie aussi, pour chaque demande, ce qui a été fait."""
    if not demandes:
        raise ErreurNavigation("Aucun déplacement demandé.")
    operations: list[dict] = []
    faits: list[str] = []
    for d in demandes:
        if not isinstance(d, dict) or not isinstance(d.get("quoi"), str):
            raise ErreurNavigation("Chaque déplacement désigne ce qu'il faut déplacer (« quoi »).")
        id_, repere = _element(etat, reperes, d["quoi"])
        if d.get("a_cote_de"):
            voisin, repere_voisin = _element(etat, reperes, str(d["a_cote_de"]))
            cote = d.get("cote") or "droite"
            if cote not in COTES:
                raise ErreurNavigation(f"Côté inconnu : {cote} (attendu : {', '.join(COTES)}).")
            op = _a_cote(etat, operations, id_, voisin, cote)
            if op is None:
                raise ErreurNavigation(f"Pas de case libre {cote_texte(cote)} {repere_voisin}.")
            faits.append(f"{repere} {cote_texte(cote)} {repere_voisin}")
        else:
            colonne, ligne = d.get("colonne"), d.get("ligne")
            if not (isinstance(colonne, int) and isinstance(ligne, int) and colonne >= 0 and ligne >= 0):
                raise ErreurNavigation("Donne une case (colonne et ligne, entiers ≥ 0) ou un voisin (a_cote_de).")
            op = {"op": "placer", "noeud": id_, "colonne": colonne, "ligne": ligne}
            faits.append(f"{repere} en colonne {colonne}, ligne {ligne}")
        operations.append(op)
    try:
        appliquer(etat, operations)
    except ErreurVue as e:
        raise ErreurNavigation(f"Déplacement refusé : {e}") from None
    return operations, faits


def _a_cote(etat: EtatVue, avant: list[dict], id_: str, voisin: str, cote: str) -> dict | None:
    """Première case libre à côté du voisin, en s'éloignant de lui ; None s'il n'y en a pas."""
    p = etat.placements.get(voisin)
    if p is None:
        raise ErreurNavigation("Le voisin n'est pas encore placé dans la vue : donne une case.")
    moi = etat.placements.get(id_)
    largeur, hauteur = (moi.largeur, moi.hauteur) if moi else (TAILLE_FIGURE if est_figure(id_) else (1, 1))
    dc, dl, c, lg = {
        "droite": (1, 0, p.colonne + p.largeur, p.ligne),
        "gauche": (-1, 0, p.colonne - largeur, p.ligne),
        "dessous": (0, 1, p.colonne, p.ligne + p.hauteur),
        "dessus": (0, -1, p.colonne, p.ligne - hauteur),
    }[cote]
    for _ in range(PAS_MAX_DEPLACEMENT):
        if c < 0 or lg < 0:
            return None
        op = {"op": "placer", "noeud": id_, "colonne": c, "ligne": lg, "groupe": p.groupe_id or ""}
        try:
            appliquer(etat, [*avant, op])
            return op
        except ErreurVue:
            c, lg = c + dc, lg + dl
    return None
