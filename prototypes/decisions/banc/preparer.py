"""Données de l'étude des losanges : la fontaine de chaîne de R42 (donnees/r42.*.json), passée au modèle des décisions
d'Atlas (décisions sans démonstration, qui pointent vers les nœuds de leurs alternatives), puis mise en page par
atlas/vue.py pour chaque taille de losange (1 × 1, 2 × 1, 3 × 1, 2 × 2). Sans réseau.

    PYTHONPATH=. ../Atlas/.venv/Scripts/python prototypes/decisions/banc/preparer.py    (depuis la racine du dépôt)
"""

import json
from datetime import datetime
from pathlib import Path

from atlas import decisions, vue
from atlas.graphe import calculer_statuts
from atlas.modeles import Demonstration, LigneNoeud

ICI = Path(__file__).resolve().parent.parent
SORTIE = ICI / "public" / "donnees"

DETAILS = {
    "d_origine": {
        "question": "Pourquoi la chaîne monte-t-elle au-dessus du bécher ?",
        "alternatives": [
            {"libelle": "Réaction du tas sur les maillons ($\\alpha > 0$)", "retenue": True, "noeuds": ["ch_prise"]},
            {"libelle": "Élan de la chaîne seule ($\\alpha = 0$)", "retenue": False,
             "raison": "Le bilan de quantité de mouvement donne alors $h_1 = 0$.", "noeuds": ["conj_elan"]},
            {"libelle": "Rigidité de flexion de la chaîne", "retenue": False,
             "raison": "Aucune force verticale nette pour une chaîne souple : effet de second ordre."},
        ],
        "raison": "Seule une force extérieure au point de prise fournit la quantité de mouvement verticale manquante.",
    },
    "d_alpha": {
        "question": "Comment estimer $\\alpha$ sans utiliser la hauteur de la fontaine ?",
        "alternatives": [
            {"libelle": "Simulation de maillons rigides soulevés d'un tas", "retenue": True, "noeuds": ["calc_tiges"]},
            {"libelle": "Capteur de force sous le bécher", "retenue": False,
             "raison": "Force de prise trop brève et trop faible pour le capteur."},
            {"libelle": "Ajustement sur $h_1/h_2$ seulement", "retenue": False,
             "raison": "Circulaire : on veut tester la loi, pas l'ajuster."},
        ],
        "raison": "La simulation donne α indépendamment de la mesure : vraie confrontation.",
    },
    "d_mesure": {
        "question": "Comment mesurer $h_1$, $h_2$ et $v$ ?",
        "alternatives": [
            {"libelle": "Films à haute vitesse (1 000 i/s)", "retenue": True, "noeuds": ["exp_film"]},
            {"libelle": "Photos et règle graduée", "retenue": False,
             "raison": "Le sommet oscille : incertitude de 20 % sur $h_1$."},
        ],
        "raison": "Le film donne les trois grandeurs sur la même prise.",
    },
}
NOMS = {"d_mesure": "Mesure des hauteurs"}


def main() -> None:
    graphe = json.loads((ICI / "donnees" / "r42.graphe.json").read_text(encoding="utf8"))
    vue_r42 = json.loads((ICI / "donnees" / "r42.vue.json").read_text(encoding="utf8"))
    noeuds = {n["id"]: n for n in graphe["noeuds"]}

    # Décision de mesure : nouvelle, dans le cadre des mesures, à côté des films.
    modele = noeuds["d_alpha"]
    noeuds["d_mesure"] = {**modele, "id": "d_mesure", "nom": NOMS["d_mesure"], "cree_le": "2026-09-02T04:00:00Z"}
    for did, details in DETAILS.items():
        d = noeuds[did]
        d["details"] = decisions.valider(details)
        d["enonce"] = decisions.enonce(d["details"])
        d["demonstrations"] = []
    # Une décision n'est plus une prémisse : elle pointe.
    for n in noeuds.values():
        for dem in n["demonstrations"]:
            garde = [p for p in dem["justifie_par"] if p not in DETAILS]
            dem["roles"] = {p: r for p, r in dem["roles"].items() if p in garde}
            dem["justifie_par"] = garde
        n["demonstrations"] = [d for d in n["demonstrations"] if d["justifie_par"]]

    # Statuts d'Atlas (les décisions sont établies) ; les validités de R42 sont gardées.
    lignes = [
        LigneNoeud(**{k: v for k, v in n.items() if k not in ("statut", "demonstrations")}) for n in noeuds.values()
    ]
    demos = [Demonstration(**d) for n in noeuds.values() for d in n["demonstrations"]]
    statuts = calculer_statuts(lignes, demos)
    for n in noeuds.values():
        n["statut"] = statuts[n["id"]]
        n["parents"] = list(dict.fromkeys(p for d in n["demonstrations"] for p in d["justifie_par"]))
    for n in noeuds.values():
        n["enfants"] = [m["id"] for m in noeuds.values() if n["id"] in m["parents"]]
    graphe = {
        "noeuds": sorted(noeuds.values(), key=lambda n: (n["cree_le"], n["id"])),
        "aretes": [
            {"source": p, "cible": n["id"], "nom_demonstration": d["nom_demonstration"], "validite": d["validite"]}
            for n in noeuds.values() for d in n["demonstrations"] for p in d["justifie_par"]
        ],
    }
    (SORTIE / "graphe.json").write_text(json.dumps(graphe, ensure_ascii=False), encoding="utf8")

    # Vue : les cadres de R42, tout remis en page par atlas/vue.py, pour chaque taille de losange.
    groupes = {
        g["id"]: vue.Groupe(g["id"], g["nom"], g["parent_id"], g["genre"], g["couleur"], g["replie"], g["ordre"])
        for g in vue_r42["groupes"]
    }
    cadre_de = {p["noeud_id"]: p["groupe_id"] for p in vue_r42["placements"]}
    cadre_de["d_mesure"] = "pred_mesures"
    places = {
        p["noeud_id"]: vue.Placement(p["noeud_id"], 0, 0, p["groupe_id"], p["largeur"], p["hauteur"])
        for p in vue_r42["placements"] if vue.est_figure(p["noeud_id"])
    }
    for taille in ((1, 1), (2, 1), (3, 1), (2, 2)):
        vue.TAILLE_DECISION = taille
        etat = vue.EtatVue(groupes=dict(groupes))
        for n in noeuds.values():
            roles: dict[str, str] = {}
            for d in n["demonstrations"]:
                for p in d["justifie_par"]:
                    r = d["roles"].get(p, "principale")
                    if p not in roles or vue.ROLES.index(r) < vue.ROLES.index(roles[p]):
                        roles[p] = r
            resume = decisions.resume(n["details"]) if n["type"] == "decision" else ""
            etat.noeuds[n["id"]] = vue.NoeudVue(n["id"], n["nom"], n["type"], n["statut"], tuple(roles.items()),
                                                n["admis"], resume)
        for f in vue_r42["figures"]:
            fid = vue.PREFIXE_FIGURE + f["id"]
            etat.noeuds[fid] = vue.NoeudVue(fid, f["titre"], "figure", None, ((f["noeud_id"], "principale"),))
        vue.relier_decisions(etat.noeuds, {d: decisions.commandes(DETAILS[d]) for d in DETAILS})
        # Tout est « nouveau » (sauf la taille des figures) : disposer range tout d'un coup.
        etat.placements = dict(places)
        nouveaux = {nid: cadre_de[nid] for nid in etat.noeuds if nid not in places}
        etat = vue.disposer(etat, None, nouveaux)
        if problemes := vue.conflits(etat):
            raise SystemExit(f"conflits {taille} : {problemes}")
        sortie = {
            "groupes": [{**g, "rectangle": None} for g in vue_r42["groupes"]],
            "placements": [
                {"noeud_id": p.noeud_id, "groupe_id": p.groupe_id, "colonne": p.colonne, "ligne": p.ligne,
                 "largeur": p.largeur, "hauteur": p.hauteur, "fixe": False}
                for p in etat.placements.values()
            ],
            "etiquettes": [],
            "marques": [],
            "figures": vue_r42["figures"],
        }
        fichier = SORTIE / f"vue-{taille[0]}x{taille[1]}.json"
        fichier.write_text(json.dumps(sortie, ensure_ascii=False), encoding="utf8")
        print(f"{taille} :", vue.rendre_texte(etat).count("\n"), "lignes ;",
              {d: (etat.placements[d].colonne, etat.placements[d].ligne) for d in DETAILS})
    print(datetime.now().isoformat(timespec="seconds"), "->", SORTIE)


if __name__ == "__main__":
    main()
