"""Nœuds « décision » (losanges) : détails validés, toujours établis, placés avant les nœuds qui en découlent."""

from datetime import datetime

import pytest

from atlas import decisions, ecriture, vue
from atlas.ecriture import ErreurGraphe
from atlas.graphe import calculer_statuts
from atlas.modeles import Demonstration, LigneNoeud
from atlas.orchestrateur import verificateur

T = datetime(2026, 9, 27)

ORIGINE = {
    "question": "Pourquoi la chaîne monte-t-elle au-dessus du bécher ?",
    "alternatives": [
        {"libelle": "Réaction du tas (α > 0)", "retenue": True, "noeuds": ["hyp_prise"]},
        {"libelle": "Élan seul (α = 0)", "retenue": False, "raison": "Donne h₁ = 0.", "noeuds": ["conj_elan"]},
        {"libelle": "Rigidité de flexion", "retenue": False, "raison": "Effet de second ordre."},
    ],
    "raison": "Seule une force au point de prise fournit la quantité de mouvement manquante.",
}


def test_details_valides_et_refus_clairs():
    d = decisions.valider(ORIGINE)
    assert decisions.commandes(d) == [("hyp_prise", True), ("conj_elan", False)]
    assert decisions.retenues(d) == ["Réaction du tas (α > 0)"]
    assert decisions.enonce(d).startswith("On retient : Réaction du tas")
    assert "× Élan seul (α = 0)" in decisions.resume(d)
    with pytest.raises(decisions.ErreurDecision, match="question"):
        decisions.valider({**ORIGINE, "question": " "})
    with pytest.raises(decisions.ErreurDecision, match="au moins deux"):
        decisions.valider({**ORIGINE, "alternatives": ORIGINE["alternatives"][:1]})
    with pytest.raises(decisions.ErreurDecision, match="Aucune alternative retenue"):
        aucune = [{**a, "retenue": False, "raison": "x"} for a in ORIGINE["alternatives"]]
        decisions.valider({**ORIGINE, "alternatives": aucune})
    with pytest.raises(decisions.ErreurDecision, match="dis pourquoi"):
        decisions.valider({**ORIGINE, "alternatives": [ORIGINE["alternatives"][0], {"libelle": "B", "retenue": False}]})


def _ligne(id: str, type: str | None = None, admis: bool = False) -> LigneNoeud:
    return LigneNoeud(projet_id="p", id=id, nom=id, enonce=id, admis=admis, type=type, cree_le=T, modifie_le=T)


def _demo(noeud: str, *premisses: str, validite: str = "valide") -> Demonstration:
    return Demonstration(
        projet_id="p", noeud_id=noeud, nom_demonstration="d", justifie_par=list(premisses), demonstration="…",
        validite=validite, auteur="ia", cree_le=T, modifie_le=T,
    )


def test_une_decision_est_etablie_et_ne_suspend_rien():
    noeuds = [_ligne("d_origine", "decision"), _ligne("ax", admis=True), _ligne("lemme")]
    # Même citée en prémisse, une décision ne rend pas « suspendu » ce qui s'appuie sur elle.
    statuts = calculer_statuts(noeuds, [_demo("lemme", "ax", "d_origine")])
    assert statuts == {"d_origine": "etabli", "ax": "etabli", "lemme": "etabli"}


def _plan(noeuds, demonstrations=(), etat=None):
    return ecriture.planifier_graphe(
        etat or vue.EtatVue(), set(), projet_id="p", cadres=[], noeuds=list(noeuds), demonstrations=list(demonstrations)
    )


def _n(id, type="lemme", **champs):
    return {"id": id, "nom": id, "enonce": f"Énoncé de {id}", "type": type, "groupe": "", **champs}


def test_poser_une_decision_la_place_avant_ses_noeuds():
    plan = _plan([
        {**_n("d_origine", "decision"), "enonce": "", "details": ORIGINE},
        _n("hyp_prise", "hypothese"),
        _n("conj_elan", "conjecture"),
    ])
    decision = next(l for l in plan["noeuds"] if l["id"] == "d_origine")
    assert decision["enonce"].startswith("On retient")  # énoncé déduit des détails
    etat = plan["etat"]
    d, h, c = (etat.placements[i] for i in ("d_origine", "hyp_prise", "conj_elan"))
    assert (d.largeur, d.hauteur) == vue.TAILLE_DECISION
    assert d.colonne + d.largeur <= h.colonne and d.colonne + d.largeur <= c.colonne
    assert not plan["avertissements"] and not vue.conflits(etat)
    assert ("d_origine", vue.ROLE_DECISION) in etat.noeuds["hyp_prise"].premisses
    texte = vue.rendre_texte(etat)
    assert "◇ « Pourquoi la chaîne" in texte and "◇d_origine" in texte


def test_une_decision_ne_se_demontre_pas_et_cite_des_noeuds_existants():
    with pytest.raises(ErreurGraphe, match=r"noeuds\[0\].*inexistants hyp_prise"):
        _plan([{**_n("d_origine", "decision"), "details": ORIGINE}, _n("conj_elan", "conjecture")])
    with pytest.raises(ErreurGraphe, match="ne se démontre pas"):
        _plan(
            [{**_n("d_origine", "decision"), "details": ORIGINE}, _n("hyp_prise", "hypothese"), _n("conj_elan"),
             _n("obs", "observation", admis=True, raison_admis="mesure")],
            [{"noeud_id": "d_origine", "nom_demonstration": "D", "justifie_par": ["obs"], "demonstration": "…"}],
        )
    with pytest.raises(ErreurGraphe, match=r"noeuds\[0\].*question"):
        _plan([{**_n("d_origine", "decision"), "details": {"alternatives": []}}])


def test_le_verificateur_lit_une_decision_citee_en_premisse():
    d = {**_ligne("d_origine", "decision").model_dump(), "details": ORIGINE}
    noeuds = {"d_origine": LigneNoeud(**d), "lemme": _ligne("lemme")}
    texte = verificateur.demande(_demo("lemme", "d_origine", validite="a_verifier"), noeuds)
    assert "décision : d_origine" in texte and "écartée : Élan seul (α = 0) — Donne h₁ = 0." in texte
