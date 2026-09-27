"""Repères de la vue (« Lemme 7 », « §1.2 », « Figure 2 »), résolution de ce que dit Camille, lignées."""

import json
from pathlib import Path

import pytest

from atlas import navigation
from atlas.navigation import ErreurNavigation
from atlas.vue import PREFIXE_FIGURE, EtatVue, Groupe, NoeudVue, Placement

DONNEES = json.loads((Path(__file__).parent / "donnees" / "reperes.json").read_text(encoding="utf-8"))


def _etat() -> EtatVue:
    """Le jeu commun avec graphe-modele.test.ts, sous la forme que charge `lecture.charger_etat_vue`."""
    noeuds = {
        n["id"]: NoeudVue(
            n["id"], n["nom"], n["type"], "ouvert", tuple((p, "principale") for p in n["parents"]), n["admis"]
        )
        for n in DONNEES["graphe"]["noeuds"]
    }
    for f in DONNEES["vue"]["figures"]:
        fid = PREFIXE_FIGURE + f["id"]
        noeuds[fid] = NoeudVue(fid, f["titre"], "figure", None, ((f["noeud_id"], "principale"),))
    groupes = {
        g["id"]: Groupe(g["id"], g["nom"], g["parent_id"], g["genre"], g["couleur"], g["replie"], g["ordre"])
        for g in DONNEES["vue"]["groupes"]
    }
    placements = {
        p["noeud_id"]: Placement(
            p["noeud_id"], p["colonne"], p["ligne"], p["groupe_id"], p["largeur"], p["hauteur"], p["fixe"]
        )
        for p in DONNEES["vue"]["placements"]
    }
    return EtatVue(noeuds=noeuds, groupes=groupes, placements=placements)


@pytest.fixture
def vue() -> tuple[EtatVue, navigation.Reperes]:
    etat = _etat()
    return etat, navigation.reperer(etat)


def test_meme_numerotation_que_le_front(vue):
    _, r = vue
    attendu = DONNEES["attendu"]
    assert r.noeuds == attendu["noeuds"]
    assert r.figures == attendu["figures"]
    assert r.cadres == attendu["cadres"]


def test_membres_des_cadres_sous_cadres_compris(vue):
    _, r = vue
    assert r.membres["g1"] == ["d_x", "h_a", "h_b", "l_1"]
    assert r.membres["g2"] == ["h_b", "l_1"]
    assert r.membres["g4"] == []


@pytest.mark.parametrize(
    ("reference", "genre", "id_"),
    [
        ("l_1", "noeud", "l_1"),
        ("Lemme 3", "noeud", "l_1"),
        ("lemme deux", None, None),  # les nombres en lettres restent à la voix
        ("Proposition 3", "noeud", "l_1"),  # le numéro fait foi, même si le libellé est mal entendu
        ("3", "noeud", "l_1"),
        ("le lemme 3", "noeud", "l_1"),
        ("Fait admis 2", "noeud", "adm"),
        ("Hypothèse (ii)", "noeud", "h_b"),
        ("hypothese 2", "noeud", "h_b"),
        ("(i)", "noeud", "h_a"),
        ("Figure 2", "figure", "f_plot"),
        ("fig:f_img", "figure", "f_img"),
        ("§1.1", "cadre", "g2"),
        ("cadre 2", "cadre", "g3"),
        ("g1", "cadre", "g1"),
        ("Loi de la fontaine", "noeud", "t_1"),
        ("fontaine", "noeud", "t_1"),
        ("Conséquences", "cadre", "g3"),
        ("profil", "figure", "f_plot"),
    ],
)
def test_resoudre(vue, reference, genre, id_):
    etat, r = vue
    if genre is None:
        with pytest.raises(ErreurNavigation):
            navigation.resoudre(etat, r, reference)
        return
    cible = navigation.resoudre(etat, r, reference)
    assert (cible.genre, cible.id) == (genre, id_)


def test_resoudre_donne_le_vrai_repere(vue):
    etat, r = vue
    assert navigation.resoudre(etat, r, "Proposition 3").repere == "Lemme 3 (Tension au point de prise)"
    assert navigation.resoudre(etat, r, "§1.1").repere == "§1.1 Étape intermédiaire"
    assert navigation.resoudre(etat, r, "Figure 1").repere == "Figure 1 (Photographie)"


def test_resoudre_ambigu_ou_introuvable(vue):
    etat, r = vue
    with pytest.raises(ErreurNavigation) as e:
        navigation.resoudre(etat, r, "tension")
    assert sorted(e.value.candidats) == ["Conjecture 4 (Tension au sol)", "Lemme 3 (Tension au point de prise)"]
    for reference in ("Lemme 9", "Hypothèse (v)", "Figure 3", "§4", "gravitation quantique", " "):
        with pytest.raises(ErreurNavigation):
            navigation.resoudre(etat, r, reference)


def test_lignee(vue):
    etat, _ = vue
    assert navigation.lignee(etat, "t_1", "premisses") == ["d_x", "h_a", "h_b", "l_1", "t_1"]
    assert navigation.lignee(etat, "l_1", "consequences") == ["l_1", "p_2", "t_1"]
    assert navigation.lignee(etat, "l_1", "lignee") == ["d_x", "h_a", "l_1", "p_2", "t_1"]
    assert navigation.lignee(etat, "c_z", "lignee") == ["c_z"]
    assert navigation.lignee(etat, "l_1", "seul") == ["l_1"]
    with pytest.raises(ErreurNavigation):
        navigation.lignee(etat, "l_1", "cousins")  # type: ignore[arg-type]


# ── Commandes d'écran : conformes au protocole P3 ──

PROTOCOLES = Path(__file__).parent.parent / "protocoles"


def _valider_lot(commandes: list[dict]) -> None:
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource

    schemas = [json.loads(f.read_text(encoding="utf-8")) for f in PROTOCOLES.glob("*.schema.json")]
    registre = Registry().with_resources((s["$id"], Resource.from_contents(s)) for s in schemas)
    schema = next(s for s in schemas if s["$id"].endswith("p3-lot-commandes.schema.json"))
    Draft202012Validator(schema, registry=registre).validate(navigation.lot(commandes, "ecran_1a2b3c4d"))


def test_montrer_un_noeud_le_selectionne_et_le_cadre(vue):
    etat, r = vue
    sel = navigation.selectionner(etat, r, ["Lemme 3"])
    commandes = navigation.commandes_montrer(sel, fiche=True)
    assert commandes == [
        {"op": "surligner", "cibles": []},
        {"op": "selectionner", "cible": {"noeud": "l_1"}},
        {"op": "cadrer", "cibles": [{"noeud": "l_1"}]},
        {"op": "fiche", "cible": {"noeud": "l_1"}},
    ]
    _valider_lot(commandes)


def test_montrer_une_lignee_isolee(vue):
    etat, r = vue
    sel = navigation.selectionner(etat, r, ["Hypothèse (i)", "Figure 2"], etendue="consequences")
    assert sel.noeuds == ["h_a", "l_1", "p_2", "t_1"]
    assert sel.figures == ["f_plot"]
    assert sel.reperes == ["Hypothèse (i) (Régime stationnaire)", "Figure 2 (Profil du jet)"]
    commandes = navigation.commandes_montrer(sel, garder_seulement=True)
    assert commandes[0] == {"op": "filtres", "patch": {"noeuds": ["h_a", "l_1", "p_2", "t_1"]}}
    assert commandes[1]["cibles"] == [{"noeud": i} for i in sel.noeuds]
    assert commandes[2] == {"op": "selectionner", "cible": None}
    assert {"figure": "f_plot"} in commandes[3]["cibles"]
    _valider_lot(commandes)


def test_montrer_un_cadre_et_des_statuts(vue):
    etat, r = vue
    assert navigation.selectionner(etat, r, ["§1.1"]).noeuds == ["h_b", "l_1"]
    assert navigation.selectionner(etat, r, [], statuts=["ouvert"]).noeuds == list(r.noeuds)
    with pytest.raises(ErreurNavigation):
        navigation.selectionner(etat, r, ["§3"])  # cadre vide
    with pytest.raises(ErreurNavigation):
        navigation.selectionner(etat, r, [], statuts=["faux"])
    with pytest.raises(ErreurNavigation):
        navigation.commandes_montrer(navigation.Selection())


def test_commandes_simples_conformes(vue):
    for commandes in (
        navigation.commandes_ensemble(),
        navigation.commandes_effacer(),
        navigation.commandes_zoomer(1.5),
        [{"op": "recharger_donnees"}],
    ):
        _valider_lot(commandes)
    with pytest.raises(ErreurNavigation):
        navigation.commandes_zoomer(0)


def test_deplacer_a_une_case(vue):
    etat, r = vue
    operations, faits = navigation.operations_deplacement(etat, r, [{"quoi": "Conjecture 4", "colonne": 2, "ligne": 5}])
    assert operations == [{"op": "placer", "noeud": "c_z", "colonne": 2, "ligne": 5}]
    assert faits == ["Conjecture 4 (Tension au sol) en colonne 2, ligne 5"]


def test_deplacer_a_cote_prend_la_premiere_case_libre(vue):
    etat, r = vue
    # À droite de l'Hypothèse (i) (0,0, cadre g1) : (1,0) est pris par le Lemme 3, donc (2,0), dans g1.
    operations, faits = navigation.operations_deplacement(
        etat, r, [{"quoi": "Conjecture 4", "a_cote_de": "Hypothèse (i)", "cote": "droite"}]
    )
    assert operations == [{"op": "placer", "noeud": "c_z", "colonne": 2, "ligne": 0, "groupe": "g1"}]
    assert faits == ["Conjecture 4 (Tension au sol) à droite de Hypothèse (i) (Régime stationnaire)"]
    # Deux à la suite sous le Théorème 5 (3,0, hors cadre) : le second prend la case d'après.
    operations, _ = navigation.operations_deplacement(
        etat,
        r,
        [
            {"quoi": "Conjecture 4", "a_cote_de": "Théorème 5", "cote": "dessous"},
            {"quoi": "Fait admis 2", "a_cote_de": "Théorème 5", "cote": "dessous"},
        ],
    )
    assert [(o["colonne"], o["ligne"], o["groupe"]) for o in operations] == [(3, 1, ""), (3, 2, "")]


def test_deplacements_refuses(vue):
    etat, r = vue
    for demandes in (
        [],
        [{"quoi": "§1", "colonne": 0, "ligne": 9}],  # un cadre
        [{"quoi": "Lemme 3"}],  # ni case ni voisin
        [{"quoi": "Lemme 3", "a_cote_de": "Conjecture 4"}],  # voisin jamais placé
        [{"quoi": "Lemme 3", "a_cote_de": "Hypothèse (i)", "cote": "gauche"}],  # bord de la grille
        [{"quoi": "Lemme 3", "a_cote_de": "Théorème 5", "cote": "en biais"}],
        [{"quoi": "Conjecture 4", "colonne": 0, "ligne": 0}],  # case prise
    ):
        with pytest.raises(ErreurNavigation):
            navigation.operations_deplacement(etat, r, demandes)
