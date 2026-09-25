from fastapi.testclient import TestClient

from api.index import app
from atlas import lecture
from atlas.graphe import assembler

from .test_graphe import demo, noeud

client = TestClient(app)


def test_graphe_et_noeud(monkeypatch):
    g = assembler([noeud("ax", admis=True), noeud("thm", rang=1)], [demo("thm", ["ax"], "valide")])
    monkeypatch.setattr(lecture, "charger_graphe", lambda: g)

    r = client.get("/api/graphe")
    assert r.status_code == 200
    assert len(r.json()["noeuds"]) == 2
    assert r.json()["aretes"][0] == {"source": "ax", "cible": "thm", "nom_demonstration": "d", "validite": "valide"}

    r = client.get("/api/noeuds/ax")
    assert r.status_code == 200
    assert r.json()["utilise_par"] == ["thm"]

    assert client.get("/api/noeuds/absent").status_code == 404


def test_health_signale_supabase_injoignable(monkeypatch):
    def echec():
        raise RuntimeError("injoignable")

    monkeypatch.setattr(lecture, "verifier_connexion", echec)
    r = client.get("/api/health")
    assert r.status_code == 503
    assert r.json()["ok"] is False
