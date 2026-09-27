"""Projets : nom de dossier, arborescence du bunker et accès aux fichiers (sans réseau)."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from atlas import conversations, projets
from atlas.modeles import Projet
from atlas.orchestrateur import config
from atlas.orchestrateur.fichiers import CheminInterdit, arborescence, fichier_du_projet

T0 = datetime(2026, 9, 27)
PROJET = Projet(id="p1", nom="Hydrures", description="", dossier="hydrures", cree_le=T0, modifie_le=T0)


def test_nom_de_dossier():
    assert projets.nom_de_dossier("Supraconductivité des hydrures", set()) == "supraconductivite-des-hydrures"
    assert projets.nom_de_dossier("Chute libre", {"chute-libre", "chute-libre-2"}) == "chute-libre-3"
    assert projets.nom_de_dossier("!!!", set()) == "projet"


def _bunker(racine):
    (racine / "sessions" / "c1" / "directeurs").mkdir(parents=True)
    (racine / "sessions" / "c1" / "directeurs" / "rapport.md").write_text("# Rapport", encoding="utf-8")
    (racine / "sessions" / "c1" / ".tmp").mkdir()
    (racine / "sessions" / "c1" / ".tmp" / "secret.txt").write_text("x")
    (racine / "doc_projet").mkdir()
    (racine / "doc_projet" / "figure.png").write_bytes(b"\x89PNG")
    return racine


def test_arborescence_sans_dossiers_caches(tmp_path):
    arbre = arborescence(_bunker(tmp_path))
    assert [n["nom"] for n in arbre["enfants"]] == ["doc_projet", "sessions"]
    [c1] = arbre["enfants"][1]["enfants"]
    assert [n["nom"] for n in c1["enfants"]] == ["directeurs"]  # .tmp masqué
    rapport = c1["enfants"][0]["enfants"][0]
    assert rapport["chemin"] == "sessions/c1/directeurs/rapport.md" and rapport["taille"] == 9
    assert arborescence(tmp_path, max_entrees=2)["tronque"]


@pytest.mark.parametrize("chemin", ["../x", "sessions/c1/.tmp/secret.txt", "sessions", "absent.md", ""])
def test_fichier_hors_projet_refuse(tmp_path, chemin):
    with pytest.raises(CheminInterdit):
        fichier_du_projet(_bunker(tmp_path), chemin)


def _client(monkeypatch, tmp_path):
    from atlas.serveur import app

    monkeypatch.setattr(config, "ESPACE_TRAVAIL", tmp_path)
    monkeypatch.setattr(config, "JETON_ACCES", None)
    monkeypatch.setattr(projets, "lire_projet", lambda pid: PROJET if pid == "p1" else None)
    return TestClient(app)


def test_routes_fichiers(monkeypatch, tmp_path):
    _bunker(tmp_path / "utilisateurs" / "camille" / "hydrures")
    client = _client(monkeypatch, tmp_path)
    assert client.get("/api/projets/p1/fichiers").json()["enfants"][0]["nom"] == "doc_projet"
    r = client.get("/api/projets/p1/fichier", params={"chemin": "sessions/c1/directeurs/rapport.md"})
    assert r.status_code == 200 and r.text == "# Rapport" and r.headers["content-type"].startswith("text/markdown")
    assert client.get("/api/projets/p1/fichier", params={"chemin": "../../x"}).status_code == 404
    assert client.get("/api/projets/p2/fichiers").status_code == 404


def test_conversations_d_un_projet(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    appels = []
    monkeypatch.setattr(conversations, "lister_conversations", lambda *a, **kw: appels.append((a, kw)) or [])
    assert client.get("/api/conversations", params={"projet_id": "p1"}).json() == []
    assert appels == [(("p1",), {"avec_sans_projet": False})]
    assert client.get("/api/conversations", params={"projet_id": "p2"}).status_code == 404


def test_supprimer_un_projet(monkeypatch, tmp_path):
    from atlas.orchestrateur.gestionnaire import gestionnaire

    client = _client(monkeypatch, tmp_path)
    supprimes = []
    monkeypatch.setattr(projets, "supprimer_projet", supprimes.append)
    monkeypatch.setattr(conversations, "lister_conversations", lambda *a, **kw: [])
    assert client.delete("/api/projets/p1").status_code == 204
    assert supprimes == [PROJET]
    assert client.delete("/api/projets/p2").status_code == 404

    session = type("C", (), {"id": "c1"})()
    monkeypatch.setattr(conversations, "lister_conversations", lambda *a, **kw: [session])
    monkeypatch.setattr(gestionnaire, "en_cours", lambda cid: cid == "c1")
    assert client.delete("/api/projets/p1").status_code == 409
    assert supprimes == [PROJET]


def test_le_projet_par_defaut_ne_se_supprime_pas():
    defaut = PROJET.model_copy(update={"dossier": projets.DOSSIER_PAR_DEFAUT})
    with pytest.raises(projets.ProjetNonSupprimable):
        projets.supprimer_projet(defaut)
