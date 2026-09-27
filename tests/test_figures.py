"""Figures : validation du tracé, lois évaluées sans rien exécuter, images reconnues par leurs octets, place propre
dans la vue près du nœud qu'elles illustrent."""

import math

import pytest

from atlas import figures, vue
from atlas.figures import ErreurFigure
from atlas.vue import ErreurVue, EtatVue, NoeudVue


def _trace(**series) -> dict:
    return {
        "x": {"titre": "$t$", "unite": "s"},
        "y": {"titre": "$v$", "unite": "m/s"},
        "series": [
            {"genre": "mesures", "nom": "Mesures", "points": [[0, 0, 0.1], [1, 4.1, 0.2], [2, 4.9, 0.2]]},
            {
                "genre": "loi",
                "nom": "Prédiction",
                "expression": "V*tanh(g*t/V)",
                "variable": "t",
                "parametres": {"V": {"valeur": 5, "incertitude": 0.5, "noeud": "res_v"}, "g": 9.81},
            },
            *series.values(),
        ],
    }


def test_trace_valide_et_loi_echantillonnee_avec_sa_bande():
    trace = figures.valider_trace(_trace())
    assert trace["x"]["echelle"] == "lin"
    assert trace["series"][1]["parametres"]["g"] == {"valeur": 9.81}
    assert figures.noeuds_cites(trace) == {"res_v"}
    loi = figures.tracer(trace)["series"][1]
    # Étendue des données (0 à 2) faute de bornes.
    assert loi["points"][0] == [0.0, 0.0] and loi["points"][-1][0] == 2
    assert len(loi["points"]) == figures.ECHANTILLONS_LOI
    x, ymin, ymax = loi["bande"][-1]
    assert ymin < 5 * math.tanh(9.81 * x / 5) < ymax


@pytest.mark.parametrize(
    "expression, message",
    [
        ("__import__('os').system('x')", "non permise"),
        ("t.real", "non permise"),
        ("sqrt(t, 2)", "un seul argument"),
        ("V*w", "« w » n'est ni la variable"),
        ("V*(t", "illisible"),
    ],
)
def test_expressions_refusees(expression, message):
    trace = _trace()
    trace["series"][1]["expression"] = expression
    with pytest.raises(ErreurFigure, match=message):
        figures.valider_trace(trace)


def test_erreurs_de_trace_expliquees():
    with pytest.raises(ErreurFigure, match="titre"):
        figures.valider_trace({**_trace(), "x": {"unite": "s"}})
    mauvais = _trace()
    mauvais["series"][0]["points"] = [[0, 1, -0.1]]
    with pytest.raises(ErreurFigure, match="incertitude est positive"):
        figures.valider_trace(mauvais)
    log = _trace()
    log["y"]["echelle"] = "log"
    with pytest.raises(ErreurFigure, match="valeurs ≤ 0"):
        figures.valider_trace(log)
    with pytest.raises(ErreurFigure, match="genre"):
        figures.valider_trace(_trace(x={"genre": "camembert", "nom": "?"}))


def test_loi_hors_domaine_sans_points_invalides():
    trace = figures.valider_trace(
        {
            "x": {"titre": "x", "min": -1, "max": 1},
            "y": {"titre": "y"},
            "series": [{"genre": "loi", "nom": "Racine", "expression": "sqrt(x)"}],
        }
    )
    points = figures.tracer(trace)["series"][0]["points"]
    assert points and all(x >= 0 for x, _ in points)


def test_resume_pour_l_ia():
    texte = figures.resumer_trace(figures.valider_trace(_trace()))
    assert "x : $t$ (s) ; y : $v$ (m/s)" in texte
    assert "mesures « Mesures », 3 points (x, y, σy, σx) : (0, 0, 0.1) (1, 4.1, 0.2)" in texte
    assert "V = 5 ± 0.5 (de res_v), g = 9.81" in texte


def test_images_reconnues_par_leurs_octets():
    png = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + (640).to_bytes(4, "big") + (480).to_bytes(4, "big")
    assert figures.examiner_image(png) == ("image/png", 640, 480)
    gif = b"GIF89a" + (32).to_bytes(2, "little") + (16).to_bytes(2, "little")
    assert figures.examiner_image(gif) == ("image/gif", 32, 16)
    # JPEG : SOI, un APP0 à sauter, puis SOF0 (hauteur 300, largeur 400).
    sof0 = b"\xff\xc0\x00\x11\x08" + (300).to_bytes(2, "big") + (400).to_bytes(2, "big")
    jpeg = b"\xff\xd8" + b"\xff\xe0\x00\x04ab" + sof0
    assert figures.examiner_image(jpeg + b"\x00" * 12) == ("image/jpeg", 400, 300)
    with pytest.raises(ErreurFigure, match="pas de SVG"):
        figures.examiner_image(b"<svg xmlns='http://www.w3.org/2000/svg'/>")


def _avec_figure() -> EtatVue:
    etat = EtatVue(
        noeuds={
            "h": NoeudVue("h", "Hypothèse", "hypothese"),
            "obs": NoeudVue("obs", "Observation", "observation", None, (("h", "principale"),)),
            "fig:courbe": NoeudVue("fig:courbe", "Courbe", "figure", None, (("obs", "principale"),)),
        }
    )
    etat, _ = vue.appliquer(etat, [{"op": "placer", "noeud": "h"}, {"op": "placer", "noeud": "obs"}])
    return etat


def test_figure_placee_a_droite_de_son_noeud_en_2_x_2():
    etat = _avec_figure()
    p = vue.placer_figure(etat, "fig:courbe", None, *vue.TAILLE_FIGURE)
    obs = etat.placements["obs"]
    assert (p.colonne, p.ligne, p.largeur, p.hauteur) == (obs.colonne + 1, obs.ligne, 2, 2)
    # Réorganiser place aussi une figure jamais placée, avec sa taille de figure.
    apres, _ = vue.appliquer(etat, [{"op": "reorganiser"}])
    assert (apres.placements["fig:courbe"].largeur, apres.placements["fig:courbe"].hauteur) == vue.TAILLE_FIGURE
    assert "[2,0+2x2] fig:courbe · figure — Courbe (illustre obs)" in vue.rendre_texte(apres)


def test_quatre_formats_de_figure():
    etat = _avec_figure()
    etat, _ = vue.appliquer(etat, [{"op": "placer", "noeud": "fig:courbe"}])
    assert (etat.placements["fig:courbe"].largeur, etat.placements["fig:courbe"].hauteur) == (2, 2)
    for largeur, hauteur in vue.FORMATS_FIGURE:
        op = {"op": "placer", "noeud": "fig:courbe", "largeur": largeur, "hauteur": hauteur}
        apres, _ = vue.appliquer(etat, [op])
        assert (apres.placements["fig:courbe"].largeur, apres.placements["fig:courbe"].hauteur) == (largeur, hauteur)
    for largeur, hauteur in ((3, 2), (2, 3), (1, 3)):
        with pytest.raises(ErreurVue, match="Format de figure"):
            vue.appliquer(etat, [{"op": "placer", "noeud": "fig:courbe", "largeur": largeur, "hauteur": hauteur}])
    # Un nœud, lui, garde toutes ses tailles.
    apres, _ = vue.appliquer(etat, [{"op": "placer", "noeud": "h", "largeur": 3, "hauteur": 1}])
    assert apres.placements["h"].largeur == 3


def test_figure_remonte_au_cadre_parent_quand_le_sien_est_trop_serre():
    etat = _avec_figure()
    etat.noeuds["voisin"] = NoeudVue("voisin", "Voisin")
    etat, _ = vue.appliquer(
        etat,
        [
            {"op": "creer_groupe", "id": "parent", "nom": "Parent"},
            {"op": "creer_groupe", "id": "haut", "nom": "Haut", "parent": "parent"},
            {"op": "creer_groupe", "id": "bas", "nom": "Bas", "parent": "parent"},
            {"op": "placer", "noeud": "obs", "groupe": "haut", "colonne": 0, "ligne": 0},
            {"op": "placer", "noeud": "h", "groupe": "haut", "colonne": 1, "ligne": 0},
            {"op": "placer", "noeud": "voisin", "groupe": "bas", "colonne": 0, "ligne": 2},
        ],
    )
    p = vue.placer_figure(etat, "fig:courbe", "haut", *vue.TAILLE_FIGURE)
    assert p.groupe_id == "parent"
    etat.placements["fig:courbe"] = p
    assert not vue.conflits(etat)


def test_pas_d_etiquette_sur_une_figure():
    etat, _ = vue.appliquer(_avec_figure(), [{"op": "creer_etiquette", "id": "e", "nom": "E"}])
    with pytest.raises(vue.ErreurVue, match="pas sur les figures"):
        vue.appliquer(etat, [{"op": "etiqueter", "noeud": "fig:courbe", "etiquette": "e"}])
