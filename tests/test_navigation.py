"""Repères de la vue (« Lemme 7 », « §1.2 », « Figure 2 »), résolution de ce que dit Camille, lignées."""

import json
from pathlib import Path

import pytest

from atlas import navigation
from atlas.navigation import ErreurNavigation
from atlas.vue import PREFIXE_FIGURE, EtatVue, Groupe, NoeudVue, Placement

DONNEES = json.loads((Path(__file__).parent / "donnees" / "reperes.json").read_text(encoding="utf-8"))


def _etat() -> tuple[EtatVue, set[str]]:
    """Le jeu commun avec graphe-modele.test.ts, sous la forme que charge `lecture.charger_etat_vue`."""
    noeuds = {
        n["id"]: NoeudVue(n["id"], n["nom"], n["type"], "ouvert", tuple((p, "principale") for p in n["parents"]))
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
    admis = {n["id"] for n in DONNEES["graphe"]["noeuds"] if n["admis"]}
    return EtatVue(noeuds=noeuds, groupes=groupes, placements=placements), admis


@pytest.fixture
def vue() -> tuple[EtatVue, navigation.Reperes]:
    etat, admis = _etat()
    return etat, navigation.reperer(etat, admis)


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
