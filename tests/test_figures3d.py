"""Figures 3D : vérification et résumé de la scène Plotly, et exécution du script par Atlas (processus à part,
environnement sans secrets, durée bornée). L'essai complet (plotly + kaleido + Chrome) est sauté s'ils manquent."""

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
        ({"data": [{"type": "scatter", "x": [1]}]}, "« scatter » refusé"),
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
    with pytest.raises(ErreurScript, match="dans le dossier de la session"):
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


@pytest.mark.skipif(
    not (importlib.util.find_spec("plotly") and importlib.util.find_spec("kaleido")), reason="plotly et kaleido absents"
)
def test_pendule_produit_une_scene_et_sa_vignette(session):
    shutil.copy(DONNEES / "pendule3d.py", session / "scripts" / "pendule3d.py")
    try:
        production = figure3d.produire("scripts/pendule3d.py", session)
    except ErreurScript as e:
        if "Vignette impossible" in str(e):
            pytest.skip("Chrome introuvable pour kaleido")
        raise
    figure = production.scene["figure"]
    assert production.scene["atlas"]["fps"] == 20
    assert 30 <= len(figure["frames"]) <= 50  # une période d'environ 2 s
    assert [t["type"] for t in figure["data"]] == ["scatter3d"] * 4
    assert production.vignette.startswith(b"\x89PNG")
    assert production.script.startswith('"""Figure 3D d\'exemple')
    assert "Scène 3D animée" in figures3d.resumer_scene(production.scene)
