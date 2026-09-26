from datetime import datetime, timedelta

from atlas.graphe import assembler, calculer_statuts, detailler
from atlas.modeles import Demonstration, LigneNoeud

T0 = datetime(2026, 9, 25)


def noeud(id: str, admis: bool = False, rang: int = 0) -> LigneNoeud:
    t = T0 + timedelta(seconds=rang)
    return LigneNoeud(projet_id="p1", id=id, nom=id, enonce="", admis=admis, cree_le=t, modifie_le=t)


def demo(noeud_id: str, premisses: list[str], validite: str, nom: str = "d") -> Demonstration:
    return Demonstration(
        projet_id="p1",
        noeud_id=noeud_id,
        nom_demonstration=nom,
        justifie_par=premisses,
        demonstration="",
        validite=validite,
        auteur="ia",
        cree_le=T0,
        modifie_le=T0,
    )


def test_statuts_du_seed():
    noeuds = [
        noeud("def_croissante", admis=True),
        noeud("def_convergence", admis=True),
        noeud("axiome_sup", admis=True),
        noeud("lemme"),
        noeud("thm"),
        noeud("conjecture"),
    ]
    demos = [
        demo("lemme", ["axiome_sup"], "a_verifier", "directe"),
        demo("lemme", ["axiome_sup"], "invalide", "absurde"),
        demo("thm", ["def_croissante", "def_convergence", "lemme"], "valide"),
    ]
    assert calculer_statuts(noeuds, demos) == {
        "def_croissante": "etabli",
        "def_convergence": "etabli",
        "axiome_sup": "etabli",
        "lemme": "a_verifier",
        "thm": "suspendu",
        "conjecture": "ouvert",
    }


def test_propagation_en_chaine():
    noeuds = [noeud("a", admis=True), noeud("b"), noeud("c")]
    demos = [demo("c", ["b"], "valide"), demo("b", ["a"], "valide")]
    assert calculer_statuts(noeuds, demos) == {"a": "etabli", "b": "etabli", "c": "etabli"}


def test_un_cycle_ne_s_auto_valide_pas():
    noeuds = [noeud("a"), noeud("b")]
    demos = [demo("a", ["b"], "valide"), demo("b", ["a"], "valide")]
    assert calculer_statuts(noeuds, demos) == {"a": "suspendu", "b": "suspendu"}


def test_seulement_invalide():
    assert calculer_statuts([noeud("a")], [demo("a", [], "invalide")]) == {"a": "invalide"}


def test_assembler_trie_et_relie():
    noeuds = [noeud("thm", rang=2), noeud("ax", admis=True, rang=0), noeud("lemme", rang=1)]
    demos = [demo("thm", ["ax", "lemme"], "valide"), demo("lemme", ["ax"], "valide")]
    g = assembler(noeuds, demos)

    assert [n.id for n in g.noeuds] == ["ax", "lemme", "thm"]
    assert {(a.source, a.cible) for a in g.aretes} == {("ax", "thm"), ("lemme", "thm"), ("ax", "lemme")}
    assert all(n.statut == "etabli" for n in g.noeuds)

    detail = detailler(g, "ax")
    assert detail is not None
    assert detail.premisses == []
    assert sorted(detail.utilise_par) == ["lemme", "thm"]
    assert detailler(g, "absent") is None
