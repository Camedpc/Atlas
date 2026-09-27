"""Vue du graphe : placement logique en cases, cadres sans chevauchement, opérations tout ou rien, rendu pour l'IA."""

import pytest

from atlas import vue
from atlas.vue import ErreurVue, EtatVue, NoeudVue, Placement


def _fontaine() -> EtatVue:
    """Mini-fontaine : deux hypothèses, un lemme, une loi, et une définition de contexte."""
    noeuds = [
        NoeudVue("h_stat", "Régime stationnaire", "hypothese", "ouvert"),
        NoeudVue("def_alpha", "Coefficient α", "definition", "etabli"),
        NoeudVue(
            "l_prise",
            "Tension au point de prise",
            "lemme",
            "a_verifier",
            (("h_stat", "principale"), ("def_alpha", "contexte")),
        ),
        NoeudVue("l_sol", "Tension au sol", "lemme", "a_verifier", (("h_stat", "principale"),)),
        NoeudVue(
            "thm_loi",
            "Loi de la fontaine",
            "theoreme",
            "a_verifier",
            (("l_prise", "principale"), ("l_sol", "principale")),
        ),
    ]
    return EtatVue(noeuds={n.id: n for n in noeuds})


def _tout_placer(etat: EtatVue) -> EtatVue:
    etat, _ = vue.appliquer(etat, [{"op": "placer", "noeud": n} for n in vue.ordre_logique(etat, etat.noeuds)])
    return etat


def test_placement_logique_de_gauche_a_droite():
    etat = _tout_placer(_fontaine())
    p = etat.placements
    assert p["l_prise"].colonne > p["h_stat"].colonne
    assert p["thm_loi"].colonne > max(p["l_prise"].colonne, p["l_sol"].colonne)
    # Le contexte ne pousse pas vers la droite : l_prise est juste après sa seule prémisse principale.
    assert p["l_prise"].colonne == p["h_stat"].colonne + 1
    assert not vue.conflits(etat)
    assert not any(pl.fixe for pl in p.values())


def test_cadres_imbriques_sans_chevauchement():
    etat = _fontaine()
    etat, _ = vue.appliquer(
        etat,
        [
            {"op": "creer_groupe", "id": "cadre", "nom": "Cadre", "genre": "sous_probleme", "couleur": "#0f766e"},
            {"op": "creer_groupe", "id": "bords", "nom": "Conditions aux extrémités", "genre": "sous_probleme"},
            {"op": "creer_groupe", "id": "prise_sol", "nom": "Prise et sol", "parent": "bords"},
            {"op": "placer", "noeud": "h_stat", "groupe": "cadre"},
            {"op": "placer", "noeud": "def_alpha", "groupe": "cadre"},
            {"op": "placer", "noeud": "l_prise", "groupe": "prise_sol"},
            {"op": "placer", "noeud": "l_sol", "groupe": "prise_sol"},
            {"op": "placer", "noeud": "thm_loi", "groupe": "bords"},
        ],
    )
    assert not vue.conflits(etat)
    r_cadre, r_bords = vue.rect_groupe(etat, "cadre"), vue.rect_groupe(etat, "bords")
    assert r_cadre and r_bords and not r_cadre.elargi(1).coupe(r_bords)
    # Le sous-cadre est contenu dans son parent.
    r_sous = vue.rect_groupe(etat, "prise_sol")
    assert r_sous and r_bords.union(r_sous) == r_bords


def test_placement_a_la_main_et_conflit_refuse():
    etat = _tout_placer(_fontaine())
    h = etat.placements["h_stat"]
    etat2, _ = vue.appliquer(etat, [{"op": "placer", "noeud": "thm_loi", "colonne": 9, "ligne": 3}])
    assert etat2.placements["thm_loi"] == Placement("thm_loi", 9, 3, None, 1, 1, True)
    with pytest.raises(ErreurVue, match="même case"):
        vue.appliquer(etat, [{"op": "placer", "noeud": "thm_loi", "colonne": h.colonne, "ligne": h.ligne}])
    # Tout ou rien : l'état d'origine n'a pas bougé.
    assert etat.placements["thm_loi"].fixe is False


def test_operations_invalides_expliquees():
    etat = _fontaine()
    with pytest.raises(ErreurVue, match="Opération 1 .*Cadre inexistant"):
        vue.appliquer(etat, [{"op": "placer", "noeud": "h_stat", "groupe": "absent"}])
    with pytest.raises(ErreurVue, match="Nœud inexistant"):
        vue.appliquer(etat, [{"op": "renommer_noeud", "id": "absent", "nom": "x"}])
    with pytest.raises(ErreurVue, match="Couleur invalide"):
        vue.appliquer(etat, [{"op": "creer_groupe", "id": "g", "nom": "G", "couleur": "rouge"}])
    with pytest.raises(ErreurVue, match="inconnue"):
        vue.appliquer(etat, [{"op": "teleporter"}])
    etat, _ = vue.appliquer(
        etat,
        [
            {"op": "creer_groupe", "id": "a", "nom": "A"},
            {"op": "creer_groupe", "id": "b", "nom": "B", "parent": "a"},
        ],
    )
    with pytest.raises(ErreurVue, match="ne peut pas se contenir"):
        vue.appliquer(etat, [{"op": "modifier_groupe", "id": "a", "parent": "b"}])


def test_supprimer_un_cadre_remonte_ses_noeuds_et_sous_cadres():
    etat, _ = vue.appliquer(
        _fontaine(),
        [
            {"op": "creer_groupe", "id": "a", "nom": "A"},
            {"op": "creer_groupe", "id": "b", "nom": "B", "parent": "a"},
            {"op": "creer_groupe", "id": "c", "nom": "C", "parent": "b"},
            {"op": "placer", "noeud": "h_stat", "groupe": "b"},
        ],
    )
    apres, _ = vue.appliquer(etat, [{"op": "supprimer_groupe", "id": "b"}])
    assert "b" not in apres.groupes
    assert apres.placements["h_stat"].groupe_id == "a"
    assert apres.groupes["c"].parent_id == "a"
    diff = vue.differences(etat, apres)
    assert diff["groupes_supprimes"] == ["b"] and {g.id for g in diff["groupes"]} == {"c"}


def test_renommer_etiqueter_deplacer_un_cadre():
    etat, _ = vue.appliquer(
        _fontaine(),
        [
            {"op": "creer_groupe", "id": "a", "nom": "A"},
            {"op": "placer", "noeud": "h_stat", "groupe": "a"},
            {"op": "placer", "noeud": "l_prise", "groupe": "a"},
        ],
    )
    avant = {n: (p.colonne, p.ligne) for n, p in etat.placements.items()}
    apres, renommages = vue.appliquer(
        etat,
        [
            {"op": "renommer_noeud", "id": "h_stat", "nom": "Stationnarité"},
            {"op": "creer_etiquette", "id": "a_revoir", "nom": "À revoir", "couleur": "#b45309"},
            {"op": "etiqueter", "noeud": "l_prise", "etiquette": "a_revoir"},
            {"op": "deplacer_groupe", "id": "a", "colonnes": 2, "lignes": 1},
        ],
    )
    assert renommages == {"h_stat": "Stationnarité"}
    assert ("l_prise", "a_revoir") in apres.marques
    for n in ("h_stat", "l_prise"):
        assert (apres.placements[n].colonne, apres.placements[n].ligne) == (avant[n][0] + 2, avant[n][1] + 1)
        assert apres.placements[n].fixe


def test_reorganiser_ne_touche_pas_aux_noeuds_fixes():
    etat = _tout_placer(_fontaine())
    etat, _ = vue.appliquer(etat, [{"op": "placer", "noeud": "l_sol", "colonne": 12, "ligne": 7}])
    apres, _ = vue.appliquer(etat, [{"op": "reorganiser"}])
    assert apres.placements["l_sol"] == etat.placements["l_sol"]
    assert not vue.conflits(apres)


def test_rendu_texte_pour_l_ia():
    etat, _ = vue.appliquer(
        _fontaine(),
        [
            {"op": "creer_groupe", "id": "bords", "nom": "Conditions aux extrémités", "genre": "sous_probleme"},
            {"op": "placer", "noeud": "h_stat"},
            {"op": "placer", "noeud": "def_alpha"},
            {"op": "placer", "noeud": "l_prise", "groupe": "bords"},
        ],
    )
    texte = vue.rendre_texte(etat)
    assert "▸ bords « Conditions aux extrémités » (sous_probleme)" in texte
    assert "l_prise · lemme · ? — Tension au point de prise ⟵ h_stat ~def_alpha" in texte
    assert "Non placés : l_sol, thm_loi" in texte


def test_roles_des_premisses():
    assert vue.valider_roles(["a", "b"], {"b": "contexte", "a": "principale"}) == {"b": "contexte"}
    with pytest.raises(ErreurVue, match="pas dans justifie_par"):
        vue.valider_roles(["a"], {"c": "contexte"})
    with pytest.raises(ErreurVue, match="Rôle invalide"):
        vue.valider_roles(["a"], {"a": "decorative"})


def test_reorganiser_place_aussi_les_noeuds_jamais_places():
    apres, _ = vue.appliquer(_fontaine(), [{"op": "reorganiser"}])
    assert set(apres.placements) == set(apres.noeuds)
    assert apres.placements["thm_loi"].colonne > apres.placements["l_prise"].colonne
    assert not vue.conflits(apres)


def test_placer_a_une_case_sans_fixer():
    """« Libérer » un nœud (ou annuler un déplacement) : il garde sa case mais redevient déplaçable."""
    etat = _tout_placer(_fontaine())
    etat2, _ = vue.appliquer(etat, [{"op": "placer", "noeud": "thm_loi", "colonne": 9, "ligne": 3, "fixe": False}])
    assert etat2.placements["thm_loi"] == Placement("thm_loi", 9, 3, None, 1, 1, False)
    with pytest.raises(ErreurVue, match="fixe invalide"):
        vue.appliquer(etat, [{"op": "placer", "noeud": "thm_loi", "colonne": 9, "ligne": 3, "fixe": "oui"}])
