"""Ligne « À l'écran » du prompt d'Atlas (P1)."""

from app.affichage.protocole import EtatResume
from app.voix.prompt import instructions, ligne_ecran

FILTRES = {"conversation": None, "statuts": [], "types": [], "periode": {"debut": None, "fin": None}, "texte": "",
           "mode": "masquer"}


def resume(**modifs) -> EtatResume:
    return EtatResume.model_validate({"ecran": "e", "strategie": "defaut", "selection": None, "filtres": FILTRES,
                                      "conversation_affichee": None, "mode": "2d", "visibles": [], **modifs})


def test_sans_ecran():
    assert ligne_ecran(None) == "À l'écran : aucun graphe affiché."


def test_ecran_decrit_sans_identifiant():
    ligne = ligne_ecran(resume(mode="3d", selection={"noeud": "lemme_secret"}, filtres={**FILTRES, "statuts": ["suspendu"]},
                               visibles=[{"libelle": "Lemme A"}, {"libelle": "Théorème B"}]))
    assert ligne == ("À l'écran : graphe en 3D ; un nœud est sélectionné ; des filtres sont actifs ; "
                     "nœuds visibles : « Lemme A », « Théorème B ».")
    assert "lemme_secret" not in ligne


def test_prompt_contient_l_ecran_et_la_regle_navigateur():
    texte = instructions([], ecran=resume(visibles=[{"libelle": "Lemme A"}]))
    assert "# ÉCRAN\nÀ l'écran : graphe en 2D ; nœuds visibles : « Lemme A »." in texte
    assert "agent navigateur" in texte
