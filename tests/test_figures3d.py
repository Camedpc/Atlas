"""Figures 3D : vérification et résumé de la scène Plotly, et exécution du script par Atlas (processus à part,
environnement sans secrets, durée bornée). L'essai complet du pendule est sauté si plotly manque."""

import base64
import importlib.util
import json
import shutil
import struct
from pathlib import Path

import pytest

from atlas import figures3d
from atlas.figures import ErreurFigure
from atlas.orchestrateur import bunker, config, figure3d
from atlas.orchestrateur.figure3d import ErreurScript

DONNEES = Path(__file__).parent / "donnees"


def _scene(**figure) -> bytes:
    base = {
        "data": [{"type": "scatter3d", "x": [0, 1], "y": [0, 1], "z": [0, 2]}],
        "layout": {"template": {"layout": {"images": [{"source": "https://ailleurs/x.png"}]}}, "scene": {}},
        "frames": [{"name": "0", "data": [{"x": [0, -1], "y": [0, 0], "z": [0, 3]}], "traces": [0]}],
    }
    return json.dumps({"atlas": {"fps": 10}, "figure": base | figure}).encode()


# ─── Vérification ────────────────────────────────────────────────────────────


def test_scene_valide_nettoyee_de_ce_que_le_front_remplace():
    layout = {
        "updatemenus": [{"type": "buttons"}],
        "sliders": [{}],
        "images": [{"source": "https://ailleurs/x.png"}],
        "paper_bgcolor": "#000",
        "width": 900,
        "scene": {"xaxis": {"title": {"text": "x (m)"}}},
        "template": {"layout": {"images": [{}], "font": {"size": 12}}},
    }
    image = {"name": "0", "data": [{"x": [0, -1]}], "traces": [0], "layout": {"sliders": []}, "baseframe": "x"}
    scene = figures3d.valider_scene(_scene(layout=layout, frames=[image]))
    assert scene["atlas"] == {"version": 1, "fps": 10}
    assert scene["figure"]["layout"] == {
        "scene": {"xaxis": {"title": {"text": "x (m)"}}},
        "template": {"layout": {"font": {"size": 12}}},
    }
    assert scene["figure"]["frames"] == [{"name": "0", "data": [{"x": [0, -1]}], "traces": [0], "layout": {}}]
    # Du JSON que le navigateur sait lire.
    assert json.loads(figures3d.serialiser(scene)) == scene


def test_nan_et_infinis_deviennent_des_trous():
    donnees = b'{"figure": {"data": [{"type": "surface", "z": [[1, NaN], [Infinity, 2]]}]}}'
    scene = figures3d.valider_scene(donnees)
    assert scene["figure"]["data"][0]["z"] == [[1, None], [None, 2]]
    assert scene["atlas"]["fps"] == figures3d.FPS_DEFAUT
    assert scene["figure"]["frames"] == []


@pytest.mark.parametrize(
    ("figure", "message"),
    [
        ({"data": []}, "aucun tracé"),
        ({"data": [{"type": "scatter", "x": [1]}]}, "aucun tracé 3D"),
        ({"data": [{"type": "scatter3d"}, {"type": "bar", "x": [1]}]}, "« bar » refusé"),
        ({"data": [{"x": [1]}]}, "« None » refusé"),
        ({"data": [{"type": "scatter3d", "scene": "scene2"}]}, "une seule scène"),
        ({"layout": {"scene2": {}}}, "une seule scène"),
        ({"frames": [{"data": [{"type": "bar"}]}]}, "Image 0, tracé 0"),
        ({"frames": [{"traces": [3]}]}, "indices de tracés existants"),
        ({"frames": [{}] * (figures3d.IMAGES_MAX + 1)}, "Trop d'images"),
    ],
)
def test_scenes_refusees(figure, message):
    with pytest.raises(ErreurFigure, match=message):
        figures3d.valider_scene(_scene(**figure))


def test_json_fps_et_taille_refuses(monkeypatch):
    with pytest.raises(ErreurFigure, match="pas du JSON"):
        figures3d.valider_scene(b"{fig")
    with pytest.raises(ErreurFigure, match="objet {atlas, figure}"):
        figures3d.valider_scene(b"[]")
    with pytest.raises(ErreurFigure, match="fps"):
        figures3d.valider_scene(json.dumps({"atlas": {"fps": 500}, "figure": {"data": []}}).encode())
    monkeypatch.setattr(figures3d, "SCENE_OCTETS_MAX", 10)
    with pytest.raises(ErreurFigure, match="trop lourde"):
        figures3d.valider_scene(_scene())


def test_graphiques_2d_a_cote_de_la_scene_resumes_a_part():
    data = [
        {"type": "scatter3d", "x": [0, 1], "y": [0, 1], "z": [0, 2]},
        {"type": "scatter", "name": "Énergie totale", "x": [0, 1, 2], "y": [5, 5, 5], "xaxis": "x2", "yaxis": "y2"},
        {"type": "scatter", "x": [0], "y": [4], "xaxis": "x2", "yaxis": "y2", "mode": "markers"},
    ]
    layout = {
        "scene": {"domain": {"x": [0, 0.6]}},
        "xaxis2": {"title": {"text": "t (s)"}},
        "yaxis2": {"title": {"text": "E (J)"}},
    }
    # Le point qui avance sur la courbe (tracé 2), et la scène (tracé 0).
    images = [{"data": [{"x": [0.5], "y": [3]}, {"x": [0, 9]}], "traces": [2, 0]}]
    scene = figures3d.valider_scene(_scene(data=data, layout=layout, frames=images))
    assert figures3d.resumer_scene(scene) == (
        "Scène 3D animée : 1 images à 10 im/s, boucle de 0.1 s.\n"
        "Tracés : scatter3d, scatter ×2.\n"
        "Axes : x ∈ [0, 9] ; y ∈ [0, 1] ; z ∈ [0, 2].\n"
        "Graphiques 2D :\n"
        "- « Énergie totale » E (J) ∈ [5, 5] en fonction de t (s) ∈ [0, 2]\n"
        "- E (J) ∈ [3, 4] en fonction de t (s) ∈ [0, 0.5]"
    )


def test_resume_avec_etendues_sur_toutes_les_images_et_tableaux_types():
    z = {"dtype": "f8", "bdata": base64.b64encode(struct.pack("<3d", -5.0, 0.5, 4.0)).decode()}
    layout = {"scene": {"xaxis": {"title": {"text": "x (m)"}}, "zaxis": {"title": "hauteur"}}}
    data = [{"type": "scatter3d", "x": [0, 1], "y": [0, 1], "z": z}, {"type": "surface", "z": [[1, None]]}]
    scene = figures3d.valider_scene(_scene(data=data, layout=layout))
    assert figures3d.resumer_scene(scene) == (
        "Scène 3D animée : 1 images à 10 im/s, boucle de 0.1 s.\n"
        "Tracés : scatter3d, surface.\n"
        "Axes : x (x (m)) ∈ [-1, 1] ; y ∈ [0, 1] ; z (hauteur) ∈ [-5, 4]."
    )
    fixe = figures3d.valider_scene(_scene(frames=[]))
    assert figures3d.resumer_scene(fixe).startswith("Scène 3D fixe")


# ─── Exécution du script ─────────────────────────────────────────────────────


@pytest.fixture
def session(monkeypatch, tmp_path):
    # Pas de Python partagé : le script tourne avec l'interpréteur des tests.
    monkeypatch.setattr(config, "ESPACE_TRAVAIL", tmp_path / "espace")
    dossier = tmp_path / "session"
    (dossier / "scripts").mkdir(parents=True)
    return dossier


def _ecrire(session: Path, texte: str, nom: str = "scripts/fig.py") -> str:
    (session / nom).write_text(texte, encoding="utf-8")
    return nom


def test_environnement_sans_secrets():
    source = {"PATH": "/usr/bin", "SUPABASE_SECRET_KEY": "s", "OPENAI_API_KEY": "o", "LANG": "fr_FR.UTF-8"}
    env = figure3d.environnement(Path("/t"), source)
    assert "SUPABASE_SECRET_KEY" not in env and "OPENAI_API_KEY" not in env
    assert env["LANG"] == "fr_FR.UTF-8"
    assert env["PATH"].startswith(str(bunker.binaires_python()))
    assert env["TMPDIR"] == env["HOME"] == env["MPLCONFIGDIR"] == str(Path("/t"))
    assert env["MPLBACKEND"] == "Agg"


def test_script_hors_session_ou_absent(session):
    (session.parent / "dehors.py").write_text("fig = 1", encoding="utf-8")
    with pytest.raises(ErreurScript, match="dans le dossier du projet"):
        figure3d.produire("../dehors.py", session)
    with pytest.raises(ErreurScript, match="introuvable"):
        figure3d.produire("scripts/absent.py", session)


def test_le_script_ne_voit_aucun_secret_et_son_erreur_revient(monkeypatch, session):
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "cle-secrete")
    script = _ecrire(session, "import os, sys\nprint(sorted(os.environ), file=sys.stderr)\nraise ValueError('raté')\n")
    with pytest.raises(ErreurScript) as erreur:
        figure3d.produire(script, session)
    message = str(erreur.value)
    assert "SUPABASE_SECRET_KEY" not in message and "MPLBACKEND" in message
    assert "ValueError: raté" in message
    # Le dossier de sortie temporaire est supprimé.
    assert not list((session / ".tmp").iterdir())


def test_script_trop_long_arrete(session):
    script = _ecrire(session, "while True:\n    pass\n")
    with pytest.raises(ErreurScript, match="arrêté après 1 s"):
        figure3d.produire(script, session, delai=1)


@pytest.mark.skipif(not importlib.util.find_spec("plotly"), reason="plotly absent")
def test_pendule_produit_une_scene(session):
    shutil.copy(DONNEES / "pendule3d.py", session / "scripts" / "pendule3d.py")
    production = figure3d.produire("scripts/pendule3d.py", session)
    figure = production.scene["figure"]
    assert production.scene["atlas"]["fps"] == 20
    assert 30 <= len(figure["frames"]) <= 50  # une période d'environ 2 s
    assert [t["type"] for t in figure["data"]] == ["scatter3d"] * 4 + ["scatter"] * 7  # scène, puis énergies et angle
    assert production.script.startswith('"""Figure 3D d\'exemple')
    assert "Scène 3D animée" in figures3d.resumer_scene(production.scene)


# ─── Écriture et outil MCP (Supabase remplacé) ───────────────────────────────

PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x02\xd0\x00\x00\x01\xe0" + b"\x00" * 16


class FauxSupabase:
    """Enregistre les envois au bucket et les écritures de la table figures ; le journal est gardé à part."""

    def __init__(self):
        self.envois: list[tuple[str, bytes, dict]] = []
        self.retraits: list[str] = []
        self.ecrits: list[tuple[str, dict]] = []
        self.journal: list[dict] = []

    @property
    def storage(self):
        return type("Stockage", (), {"from_": lambda _s, b: self})()

    def upload(self, chemin, donnees, options):
        self.envois.append((chemin, donnees, options))

    def remove(self, chemins):
        self.retraits.extend(chemins)

    def table(self, nom):
        faux = self

        class Requete:
            def insert(self, ligne):
                (faux.journal if nom == "journal" else faux.ecrits).append(("insert", ligne))
                return self

            def update(self, ligne):
                faux.ecrits.append(("update", ligne))
                return self

            def eq(self, *_):
                return self

            def execute(self):
                return None

        return Requete()


@pytest.fixture
def base(monkeypatch):
    from atlas import ecriture, lecture, vue

    faux = FauxSupabase()
    ancienne: dict = {}
    monkeypatch.setattr(ecriture, "supabase", lambda: faux)
    monkeypatch.setattr(ecriture, "_existants", lambda _p, ids: set(ids))
    monkeypatch.setattr(ecriture, "_ecrire_placements", lambda *_: None)
    monkeypatch.setattr(lecture, "lire_figure", lambda _p, _id: ancienne.get("ligne"))
    monkeypatch.setattr(lecture, "charger_etat_vue", lambda _p: vue.EtatVue(noeuds={"obs": vue.NoeudVue("obs", "Obs")}))
    faux.ancienne = ancienne
    return faux


def _creer(**champs):
    from atlas import ecriture

    return ecriture.creer_figure(projet_id="p", id="pendule", noeud_id="obs", titre="Pendule", auteur="a", **champs)


def test_ecriture_d_une_scene_et_de_son_script(base):
    scene = figures3d.valider_scene(_scene())
    _creer(scene=scene, script="fig = …", source="scripts/p.py")
    assert [(c, o["content-type"]) for c, _, o in base.envois] == [("p/pendule.json", "application/json")]
    assert json.loads(base.envois[0][1]) == scene
    [(genre, ligne)] = base.ecrits
    assert genre == "insert" and ligne["scene_chemin"] == "p/pendule.json" and ligne["scene_script"] == "fig = …"
    # Le script reste en base, pas dans le journal.
    [(_, entree)] = base.journal
    assert "scene_script" not in entree["apres"] and entree["apres"]["scene_chemin"] == "p/pendule.json"


def test_une_figure_2d_n_ecrit_pas_les_colonnes_des_scenes(base):
    _creer(image=PNG)
    [(_, ligne)] = base.ecrits
    assert "scene_chemin" not in ligne and "scene_script" not in ligne


def test_remplacer_une_scene_par_une_figure_2d_retire_ses_fichiers(base):
    base.ancienne["ligne"] = {"image_chemin": "p/pendule.png", "scene_chemin": "p/pendule.json", "version": 3}
    trace = {
        "x": {"titre": "t"},
        "y": {"titre": "E"},
        "series": [{"genre": "courbe", "nom": "E", "points": [[0, 1], [1, 2]]}],
    }
    _creer(trace=trace, remplacer=True)
    assert base.retraits == ["p/pendule.png", "p/pendule.json"]
    [(genre, ligne)] = base.ecrits
    assert genre == "update" and ligne["scene_chemin"] is None and ligne["scene_script"] is None


def test_une_scene_sans_script_est_refusee(base):
    from atlas.ecriture import ErreurGraphe

    with pytest.raises(ErreurGraphe, match="script"):
        _creer(scene=figures3d.valider_scene(_scene()))


def test_outil_mcp_execute_le_script_puis_ecrit_la_figure(monkeypatch, tmp_path):
    from atlas import ecriture
    from atlas.orchestrateur import mcp_atlas

    monkeypatch.setenv("ATLAS_PROJET_ID", "p")
    session = tmp_path / "projet" / "sessions" / "s1"
    monkeypatch.setenv("ATLAS_DOSSIER_SESSION", str(session))
    scene = figures3d.valider_scene(_scene())
    appels = {}
    monkeypatch.setattr(
        figure3d,
        "produire",
        lambda script, session, projet: (
            appels.setdefault("produire", (script, session, projet))
            and figure3d.Production(scene=scene, script="fig = …")
        ),
    )
    monkeypatch.setattr(ecriture, "creer_figure", lambda **k: appels.setdefault("creer", k))
    # Chemin relatif à la session, retenu relatif au projet (comme les images, pour deplacer_document).
    reponse = json.loads(mcp_atlas.creer_figure_3d("pendule", "obs", "Pendule", "scripts/p.py", groupe="exp"))
    racine = (tmp_path / "projet").resolve()
    assert appels["produire"] == ("sessions/s1/scripts/p.py", session.resolve(), racine)
    k = appels["creer"]
    assert (k["scene"], k["script"], k["source"], k["groupe"]) == (scene, "fig = …", "sessions/s1/scripts/p.py", "exp")
    appels.clear()
    mcp_atlas.creer_figure_3d("pendule", "obs", "Pendule", "scripts_projet/pendule/scene3d.py")
    assert appels["produire"][0] == "scripts_projet/pendule/scene3d.py"
    assert "image" not in k
    assert reponse["vue"] == "fig:pendule" and reponse["scene"].startswith("Scène 3D animée")

    def echoue(*_, **__):
        raise ErreurScript("Le script a échoué (code 1) :\nValueError: raté")

    monkeypatch.setattr(figure3d, "produire", echoue)
    with pytest.raises(ecriture.ErreurGraphe, match="ValueError: raté"):
        mcp_atlas.creer_figure_3d("pendule", "obs", "Pendule", "scripts/p.py")
