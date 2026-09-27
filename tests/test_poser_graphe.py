"""Graphe posé d'un coup : validation du lot entier avant toute écriture, mise en page d'ensemble."""

import pytest

from atlas import ecriture, vue
from atlas.ecriture import ErreurGraphe


def _plan(etat=None, cadres=(), noeuds=(), demonstrations=()):
    return ecriture.planifier_graphe(
        etat or vue.EtatVue(),
        set(),
        projet_id="p",
        cadres=list(cadres),
        noeuds=list(noeuds),
        demonstrations=list(demonstrations),
    )


def _n(id, groupe="", type="lemme", **champs):
    return {"id": id, "nom": id, "enonce": f"Énoncé de {id}", "type": type, "groupe": groupe, **champs}


def _d(noeud, *premisses, **champs):
    return {"noeud_id": noeud, "nom_demonstration": "Directe", "justifie_par": list(premisses), "demonstration": "…"}


CADRES = [
    {"id": "hyp", "nom": "Hypothèses", "genre": "etape"},
    {"id": "sp1", "nom": "Sous-problème 1"},
    {"id": "sp2", "nom": "Sous-problème 2"},
]


def test_un_lot_dans_n_importe_quel_ordre():
    plan = _plan(
        cadres=CADRES,
        # La conclusion avant ses prémisses, et les démonstrations avant les nœuds qu'elles citent : peu importe.
        noeuds=[_n("thm", "sp2", "theoreme"), _n("lemme_a", "sp1"), _n("hyp_h", "hyp", "hypothese")],
        demonstrations=[_d("thm", "lemme_a"), _d("lemme_a", "hyp_h")],
    )
    etat = plan["etat"]
    assert [l["id"] for l in plan["noeuds"]] == ["thm", "lemme_a", "hyp_h"]
    assert all(l["validite"] == "a_verifier" for l in plan["demonstrations"])
    assert not vue.conflits(etat) and not plan["avertissements"]
    c = {n: etat.placements[n].colonne for n in ("hyp_h", "lemme_a", "thm")}
    assert c["hyp_h"] < c["lemme_a"] < c["thm"]


def test_rien_n_est_accepte_si_un_element_est_faux():
    with pytest.raises(ErreurGraphe, match=r"demonstrations\[0\].*inexistantes lemme_x"):
        _plan(cadres=CADRES, noeuds=[_n("thm", "sp2")], demonstrations=[_d("thm", "lemme_x")])
    with pytest.raises(ErreurGraphe, match=r"noeuds\[1\].*deux fois"):
        _plan(noeuds=[_n("a"), _n("a")])
    with pytest.raises(ErreurGraphe, match=r"noeuds\[0\].*cadre inexistant"):
        _plan(noeuds=[_n("a", "nulle_part")])
    with pytest.raises(ErreurGraphe, match="raison_admis"):
        _plan(noeuds=[_n("a", admis=True)])
    existant = vue.EtatVue(noeuds={"a": vue.NoeudVue("a", "A")})
    with pytest.raises(ErreurGraphe, match="existe déjà"):
        _plan(existant, noeuds=[_n("a")])


def test_avertissements_pour_ne_rien_oublier():
    plan = _plan(noeuds=[_n("hyp_h", type="hypothese"), _n("lemme_seul"), _n("prop"), _n("res", type="resultat")],
                 demonstrations=[_d("res", "prop")])
    assert plan["avertissements"] == [
        "lemme_seul (lemme) n'est ni admis ni démontré",
        "prop (lemme) n'est ni admis ni démontré",
        "hyp_h n'est relié à rien",
        "lemme_seul n'est relié à rien",
    ]


def test_un_lot_s_ajoute_sous_la_vue_existante():
    premier = _plan(cadres=CADRES[:2], noeuds=[_n("hyp_h", "hyp", "hypothese"), _n("l1", "sp1")],
                    demonstrations=[_d("l1", "hyp_h")])["etat"]
    second = _plan(premier, cadres=[{"id": "sp3", "nom": "Suite"}], noeuds=[_n("l2", "sp3"), _n("l3", "sp1")],
                   demonstrations=[_d("l2", "l1"), _d("l3", "l1")])["etat"]
    assert not vue.conflits(second)
    # Rien de ce qui existait n'a bougé ; le nouveau cadre va dessous, le nœud d'un cadre existant y reste.
    assert all(second.placements[n] == p for n, p in premier.placements.items())
    assert vue.rect_groupe(second, "sp3").l0 > vue.rect_groupe(premier, "sp1").l1
    assert second.placements["l3"].groupe_id == "sp1"
