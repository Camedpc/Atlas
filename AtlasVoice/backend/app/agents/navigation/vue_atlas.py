"""Ce que l'utilisateur voit dans la vue « Graphe de raisonnement » de l'application Atlas (éditeur 2D à cases et
cadres), recalculé à partir du graphe (`GET /graphe`) et de la vue (`GET /vue`) de l'espace affiché.

Recopie fidèle des règles du front (frontend/src/graphe-modele.ts, graphe.ts, graphe-dessin.ts de l'application) :
numérotation des nœuds (« Proposition 21 », hypothèses en romains « Hypothèse (ii) »), des figures (« Figure 2 »)
et des cadres (« §2.1 »), et paliers de zoom (« −13 »). Si le front change ces règles, les changer ici aussi.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

PREFIXE_FIGURE = "fig:"

LIBELLES_TYPE = {
    "hypothese": "Hypothèse", "definition": "Définition", "axiome": "Axiome", "choix_modelisation": "Hypothèse",
    "decision": "Décision", "lemme": "Lemme", "proposition": "Proposition", "theoreme": "Théorème",
    "assertion": "Assertion", "experience": "Expérience", "calcul": "Calcul", "observation": "Observation",
    "resultat": "Résultat", "conjecture": "Conjecture",
}

# Paliers de zoom affichés par la vue (graphe.ts) et seuils des niveaux de détail (graphe-dessin.ts).
ZOOMS = [
    (0.04, "−15"), (0.06, "−14"), (0.08, "−13"), (0.1, "−12"), (0.125, "−11"), (0.15, "−10"), (0.175, "−9"),
    (0.2, "−8"), (0.225, "−7"), (0.25, "−6"), (0.375, "−5"), (0.5, "−4"), (0.675, "−3"), (0.75, "−2"), (0.875, "−1"),
    (1.0, "1:1"), (1.25, "+1"), (1.375, "+2"), (1.5, "+3"), (1.675, "+4"), (1.75, "+5"), (1.875, "+6"), (2.0, "+7"),
]
SEUIL_POINT = 0.175
SEUIL_CONTENU = 0.6


def _romains(n: int) -> str:
    r = ""
    for v, s in ((1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"), (50, "l"), (40, "xl"),
                 (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")):
        while n >= v:
            r += s
            n -= v
    return r


def est_hypothese(n: dict[str, Any]) -> bool:
    return n.get("type") in ("hypothese", "choix_modelisation")


def libelle(n: dict[str, Any]) -> str:
    t = n.get("type")
    if t in LIBELLES_TYPE:
        return LIBELLES_TYPE[t]
    return "Fait admis" if n.get("admis") else "Énoncé"


def zoom(z: float) -> dict[str, str]:
    """Palier affiché (« Zoom −13 ») et niveau de détail : points, titres, ou contenu complet des nœuds."""
    palier = min(ZOOMS, key=lambda p: abs(p[0] - z) / p[0])[1]
    niveau = "points" if z < SEUIL_POINT else "titres" if z < SEUIL_CONTENU else "contenu"
    return {"palier": palier, "niveau": niveau}


@dataclass
class VueAtlas:
    refs: dict[str, str] = field(default_factory=dict)
    """id de nœud → « Proposition 21 » ; « fig:<id> » → « Figure 2 »."""
    cadre_de: dict[str, str] = field(default_factory=dict)
    """id de nœud ou « fig:<id> » → id de son cadre direct."""
    cadres: dict[str, dict[str, Any]] = field(default_factory=dict)
    """id → {numero, nom, genre, parent, replie, noeuds (tout le sous-arbre, hors figures)}."""
    figures: dict[str, dict[str, Any]] = field(default_factory=dict)
    """id sans « fig: » → {ref, titre, illustre, cadre}."""
    cases: dict[str, tuple[int, int, int, int]] = field(default_factory=dict)
    """id de nœud ou « fig:<id> » → (colonne, ligne, largeur, hauteur) dans la vue enregistrée (non placés compris)."""

    def cases_effectives(self, deplacements: list[Any] | None) -> dict[str, tuple[int, int, int, int]]:
        """Cases à l'écran : la vue enregistrée, avec les positions provisoires de l'écran (P4 `deplacements`)."""
        cases = dict(self.cases)
        for d in deplacements or []:
            cle = d.noeud if d.noeud is not None else PREFIXE_FIGURE + d.figure
            if cle in cases:
                cases[cle] = (d.colonne, d.ligne, *cases[cle][2:])
        return cases

    def pour_le_modele(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Cadres et figures tels que le modèle les reçoit (dans l'ordre de lecture)."""
        cadres = [{"id": i, "numero": c["numero"], "nom": c["nom"], "genre": c["genre"],
                   **({"dans": self.cadres[c["parent"]]["numero"]} if c["parent"] else {}),
                   **({"reduit": True} if c["replie"] else {}), "noeuds": c["noeuds"]}
                  for i, c in sorted(self.cadres.items(), key=lambda x: _cle_numero(x[1]["numero"]))]
        figures = [{"id": i, "ref": f["ref"], "titre": f["titre"], "illustre": f["illustre"],
                    **({"cadre": self.cadres[f["cadre"]]["numero"]} if f["cadre"] in self.cadres else {})}
                   for i, f in sorted(self.figures.items(), key=lambda x: int(x[1]["ref"].split()[-1]))]
        return cadres, figures


def _cle_numero(numero: str) -> list[int]:
    return [int(x) for x in numero.lstrip("§").split(".") if x.isdigit()]


def construire(noeuds: list[dict[str, Any]], vue: dict[str, Any]) -> VueAtlas:
    """Mêmes règles que `construireModele` (graphe-modele.ts), réduites à ce que voit l'utilisateur."""
    par_id = {n["id"]: n for n in noeuds}
    figures = {PREFIXE_FIGURE + f["id"]: f for f in vue.get("figures") or []}
    placements = {p["noeud_id"]: p for p in vue.get("placements") or []
                  if p["noeud_id"] in par_id or p["noeud_id"] in figures}

    # Nœuds jamais placés : sous tout le reste, sur autant de colonnes que la vue (6 au moins).
    max_c = max((p["colonne"] + p["largeur"] - 1 for p in placements.values()), default=-1)
    max_l = max((p["ligne"] + p["hauteur"] - 1 for p in placements.values()), default=-1)
    non_places = sorted(i for i in par_id if i not in placements)
    colonnes = max(6, max_c + 1)
    provisoire = {i: (k % colonnes, max_l + 2 + k // colonnes) for k, i in enumerate(non_places)}
    # Figures jamais placées : encore dessous, une case chacune.
    ligne_figures = max_l + 2 + -(-len(non_places) // colonnes) + (1 if non_places else 0)
    for k, i in enumerate(sorted(i for i in figures if i not in placements)):
        provisoire[i] = (k % colonnes, ligne_figures + k // colonnes)

    def case(i: str) -> tuple[int, int]:
        p = placements.get(i)
        return (p["colonne"], p["ligne"]) if p else provisoire[i]

    v = VueAtlas()
    for i in [*par_id, *figures]:
        p = placements.get(i)
        v.cases[i] = (p["colonne"], p["ligne"], p["largeur"], p["hauteur"]) if p else (*provisoire[i], 1, 1)
    # Numérotation : ordre des cases (colonne, ligne, id) ; les hypothèses à part, en romains.
    k = h = 0
    for i in sorted(par_id, key=lambda i: (*case(i), i)):
        n = par_id[i]
        if est_hypothese(n):
            h += 1
            v.refs[i] = f"{libelle(n)} ({_romains(h)})"
        else:
            k += 1
            v.refs[i] = f"{libelle(n)} {k}"
    for k, i in enumerate(sorted(figures, key=lambda i: (*case(i), i))):
        v.refs[i] = f"Figure {k + 1}"

    # Cadres : parent, sous-arbre de nœuds, cases englobées (pour l'ordre de lecture), numéros « §1.2 ».
    groupes = {g["id"]: g for g in vue.get("groupes") or []}

    def parent(g: dict[str, Any]) -> str | None:
        return g["parent_id"] if g.get("parent_id") in groupes else None

    for i, p in placements.items():
        if p.get("groupe_id") in groupes:
            v.cadre_de[i] = p["groupe_id"]
    membres: dict[str, list[str]] = {g: [] for g in groupes}
    coins: dict[str, tuple[int, int]] = {}
    for i, g in v.cadre_de.items():
        c, lg = case(i)
        profondeur = 0
        while g is not None and profondeur < 50:
            if not i.startswith(PREFIXE_FIGURE):
                membres[g].append(i)
            # Coin haut gauche des cases du cadre (colonne et ligne minimales, séparément, comme le front).
            c0, l0 = coins.get(g, (c, lg))
            coins[g] = (min(c0, c), min(l0, lg))
            g, profondeur = parent(groupes[g]), profondeur + 1

    def enfants(p: str | None) -> list[str]:
        return sorted((g for g in groupes if parent(groupes[g]) == p),
                      key=lambda g: (*coins.get(g, (10**9, 10**9)), groupes[g].get("ordre") or 0, g))

    def parcourir(p: str | None, prefixe: str | None) -> None:
        for rang, g in enumerate(enfants(p), 1):
            numero = f"{prefixe}.{rang}" if prefixe else f"§{rang}"
            d = groupes[g]
            v.cadres[g] = {"numero": numero, "nom": d.get("nom") or "", "genre": d.get("genre") or "libre",
                           "parent": parent(d), "replie": bool(d.get("replie")), "noeuds": sorted(membres[g])}
            parcourir(g, numero)

    parcourir(None, None)

    for i, f in figures.items():
        v.figures[f["id"]] = {"ref": v.refs[i], "titre": f.get("titre") or "", "illustre": f.get("noeud_id"),
                              "cadre": v.cadre_de.get(i)}
    return v
