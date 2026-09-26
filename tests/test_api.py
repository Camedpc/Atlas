from fastapi.testclient import TestClient

from api.index import app
from atlas import lecture, projets
from atlas.graphe import assembler

from .test_graphe import demo, noeud

client = TestClient(app)


def test_graphe_et_noeud(monkeypatch):
    g = assembler([noeud("ax", admis=True), noeud("thm", rang=1)], [demo("thm", ["ax"], "valide")])
    lus: list[str] = []
    monkeypatch.setattr(lecture, "charger_graphe", lambda projet_id: lus.append(projet_id) or g)

    r = client.get("/api/graphe?projet_id=p1")
    assert r.status_code == 200
    assert len(r.json()["noeuds"]) == 2
    assert r.json()["aretes"][0] == {"source": "ax", "cible": "thm", "nom_demonstration": "d", "validite": "valide"}

    r = client.get("/api/noeuds/ax?projet_id=p1")
    assert r.status_code == 200
    assert r.json()["utilise_par"] == ["thm"]

    assert client.get("/api/noeuds/absent?projet_id=p1").status_code == 404
    assert lus == ["p1", "p1", "p1"]


def test_graphe_sans_projet_lit_celui_du_projet_par_defaut(monkeypatch):
    monkeypatch.setattr(projets, "id_ou_defaut", lambda projet_id: projet_id or "defaut")
    lus: list[str] = []
    monkeypatch.setattr(lecture, "charger_graphe", lambda projet_id: lus.append(projet_id) or assembler([], []))

    assert client.get("/api/graphe").status_code == 200
    assert lus == ["defaut"]


def test_health_signale_supabase_injoignable(monkeypatch):
    def echec():
        raise RuntimeError("injoignable")

    monkeypatch.setattr(lecture, "verifier_connexion", echec)
    r = client.get("/api/health")
    assert r.status_code == 503
    assert r.json()["ok"] is False
