"""Site public : page admin, démo réinitialisable, vidéo de l'accueil (sans réseau)."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from atlas import conversations, projets, site
from atlas.modeles import Projet
from atlas.orchestrateur import config, demo

T0 = datetime(2026, 9, 29)
MODELE = Projet(id="m", nom="Orbites", description="Trajectoires", dossier="orbites", cree_le=T0, modifie_le=T0)
COPIE = Projet(id="c", nom="Démo", description="", dossier="demo", cree_le=T0, modifie_le=T0)


@pytest.fixture
def reglages(monkeypatch):
    table: dict = {}
    monkeypatch.setattr(site, "lire", table.get)
    monkeypatch.setattr(site, "ecrire", table.__setitem__)
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    return table


@pytest.fixture
def client(monkeypatch, tmp_path, reglages):
    from atlas.serveur import app

    monkeypatch.setattr(config, "MDP_ADMIN", "sesame")
    monkeypatch.setattr(config, "ESPACE_TRAVAIL", tmp_path)
    monkeypatch.setattr(projets, "lire_projet", {"m": MODELE, "c": COPIE}.get)
    monkeypatch.setattr(projets, "lister_projets", lambda: [MODELE])
    monkeypatch.setattr(conversations, "lister_conversations", lambda pid: [])
    return TestClient(app)


ADMIN = {"X-Atlas-Admin": "sesame"}


def test_admin_protege(client):
    assert client.get("/api/admin").status_code == 401
    assert client.get("/api/admin", headers={"X-Atlas-Admin": "non"}).status_code == 401
    assert client.get("/api/admin", headers=ADMIN).json()["projets"][0]["id"] == "m"


def test_admin_desactive_sans_mot_de_passe(client, monkeypatch):
    monkeypatch.setattr(config, "MDP_ADMIN", None)
    assert client.get("/api/admin", headers=ADMIN).status_code == 503


def test_choisir_et_reinitialiser_la_demo(client, reglages, monkeypatch, tmp_path):
    racine = tmp_path / "utilisateurs" / config.UTILISATEUR
    (racine / "orbites" / "sessions" / "ancienne" / "docs_session").mkdir(parents=True)
    (racine / "orbites" / "sessions" / "ancienne" / "docs_session" / "article.pdf").write_bytes(b"%PDF")
    (racine / "orbites" / "sessions" / "orpheline").mkdir()
    (racine / "orbites" / "doc_projet").mkdir()
    (racine / "demo" / "sessions" / "du-jury").mkdir(parents=True)
    appels = []

    def copier(modele, copie, auteur="admin"):
        appels.append((modele, copie))
        return {"ancienne": "nouvelle"}

    monkeypatch.setattr(site, "copier_espace", copier)
    monkeypatch.setattr(projets, "creer_projet", lambda nom, description="": COPIE)

    assert client.post("/api/admin/demo/reinitialiser", headers=ADMIN).status_code == 409  # aucun modèle choisi
    r = client.put("/api/admin/demo", json={"modele_id": "m"}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["copie"]["id"] == "c"
    assert reglages[site.DEMO] == {"modele": "m", "copie": "c"}
    assert appels == [("m", "c")]
    sessions = racine / "demo" / "sessions"
    assert sorted(p.name for p in sessions.iterdir()) == ["nouvelle"]  # renommée ; le travail du jury a disparu
    assert (sessions / "nouvelle" / "docs_session" / "article.pdf").read_bytes() == b"%PDF"
    assert (racine / "orbites" / "sessions" / "ancienne").exists()  # le modèle n'est pas touché

    assert client.post("/api/admin/demo/reinitialiser", headers=ADMIN).status_code == 200
    assert appels[-1] == ("m", "c")
    assert client.get("/api/site").json()["demo"] == "c"


def test_pas_de_reinitialisation_pendant_un_tour(client, reglages, monkeypatch):
    reglages[site.DEMO] = {"modele": "m", "copie": "c"}
    monkeypatch.setattr(conversations, "lister_conversations", lambda pid: [type("C", (), {"id": "x"})()])
    monkeypatch.setattr(demo.gestionnaire, "en_cours", lambda cid: True)
    assert client.post("/api/admin/demo/reinitialiser", headers=ADMIN).status_code == 409


def test_copie_hors_du_bunker_refusee(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "ESPACE_TRAVAIL", tmp_path)
    with pytest.raises(demo.DemoIndisponible):
        demo.recopier_dossier(tmp_path / "a", tmp_path / "ailleurs" / "b", {})


def test_televerser_la_video(client, reglages, monkeypatch):
    envoyes = []

    class Bucket:
        def upload(self, chemin, contenu, options):
            envoyes.append((chemin, contenu, options["content-type"]))

    class Stockage:
        def from_(self, nom):
            assert nom == "site"
            return Bucket()

    monkeypatch.setattr(site, "supabase", lambda: type("S", (), {"storage": Stockage()})())
    r = client.post(
        "/api/admin/media/video",
        params={"nom": "Présentation finale.mp4"},
        content=b"mp4",
        headers={**ADMIN, "Content-Type": "video/mp4"},
    )
    assert r.status_code == 200
    [(chemin, contenu, type_)] = envoyes
    assert chemin.startswith("videos/") and chemin.endswith("-presentation-finale.mp4") and type_ == "video/mp4"
    assert client.get("/api/site").json()["video"] == f"https://x.supabase.co/storage/v1/object/public/site/{chemin}"
    refus = client.post("/api/admin/media/video", content=b"x", headers={**ADMIN, "Content-Type": "text/html"})
    assert refus.status_code == 422
