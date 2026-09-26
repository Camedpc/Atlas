import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(config, "DATABASE_URL", None)
    monkeypatch.setattr(config, "AGENTS_API_KEY", "cle-agents")
    monkeypatch.setattr(config, "SUPABASE_JWT_SECRET", None)
    with TestClient(app) as c:
        yield c


AGENT = {"X-Agents-Cle": "cle-agents"}


def test_chat_texte_et_agent_meme_chemin(client):
    cree = client.post("/api/taches", json={
        "type_agent": "explorateur", "titre": "résumé", "demande_brute": "Résume ce graphe"})
    assert cree.status_code == 201
    tache = cree.json()
    assert tache["canal"] == "texte" and tache["utilisateur_id"] == "anonyme"

    assert client.post("/api/agents/prendre", json={"types_agent": ["explorateur"]}).status_code == 401
    prise = client.post("/api/agents/prendre", json={"types_agent": ["explorateur"]}, headers=AGENT).json()
    assert prise["id"] == tache["id"] and prise["statut"] == "en_cours"

    r = client.post(f"/api/agents/taches/{tache['id']}/resultat", headers=AGENT,
                    json={"resultat_oral": "Douze étapes.", "resultat_detail": {"n": 12}})
    assert r.status_code == 200 and r.json()["statut"] == "terminee"
    assert client.get(f"/api/taches/{tache['id']}").json()["resultat_detail"] == {"n": 12}


def test_confirmation_depuis_l_ecran(client):
    tache = client.post("/api/taches", json={
        "type_agent": "editeur_graphe", "titre": "ajout", "demande_brute": "Ajoute une étape"}).json()
    client.post("/api/agents/prendre", json={"types_agent": ["editeur_graphe"]}, headers=AGENT)
    client.post(f"/api/agents/taches/{tache['id']}/proposition", headers=AGENT,
                json={"description_orale": "J'ajoute une étape.", "diff": {"+": ["lemme_3"]}})
    r = client.post(f"/api/taches/{tache['id']}/confirmation", json={"decision": "oui"})
    assert r.json()["statut"] == "en_cours"
    # Écriture d'agent sur une tâche au mauvais statut : 409.
    r = client.post(f"/api/agents/taches/{tache['id']}/question", headers=AGENT, json={"question": "?"})
    assert r.status_code == 200
    r = client.post(f"/api/agents/taches/{tache['id']}/question", headers=AGENT, json={"question": "?"})
    assert r.status_code == 409


def test_verrous(client):
    t1 = client.post("/api/taches", json={"type_agent": "editeur_graphe", "titre": "a", "demande_brute": "a"}).json()
    t2 = client.post("/api/taches", json={"type_agent": "editeur_graphe", "titre": "b", "demande_brute": "b"}).json()
    assert client.post("/api/agents/verrous/graphe:x", json={"tache_id": t1["id"]}, headers=AGENT).status_code == 200
    assert client.post("/api/agents/verrous/graphe:x", json={"tache_id": t2["id"]}, headers=AGENT).status_code == 409


def test_proxy_llm_ferme_au_navigateur(client):
    assert client.post("/llm/v1/chat/completions", json={}).status_code == 401


def test_sante_et_metriques(client):
    assert client.get("/health").json()["registre"] == "memoire"
    m = client.get("/api/metriques").json()
    assert "latence_ms" in m and "taches_24h" in m


def test_tache_navigateur_avec_l_ecran_du_relais(client):
    import json as _json
    from pathlib import Path

    exemple = _json.loads((Path(__file__).resolve().parents[3] / "protocoles" / "exemples" / "p4-etat-affichage"
                           / "valides" / "initial.json").read_text("utf-8"))
    # Sans écran : pas d'affichage dans le contexte ; un affichage envoyé par le client est ignoré.
    t = client.post("/api/taches", json={"type_agent": "navigateur", "titre": "lignée", "demande_brute": "montre la lignée",
                                         "contexte": {"affichage": None, "graphe_actif": "g"}}).json()
    assert t["type_agent"] == "navigateur" and t["contexte"]["affichage"] is None and t["extrait"] == "montre la lignée"
    client.post("/api/affichage/ecrans", json={"ecran": "ecran_api"})
    etat = {**exemple, "ecran": "ecran_api", "utilisateur_id": "anonyme"}
    assert client.post("/api/affichage/ecrans/ecran_api/etat", json=etat).status_code == 204
    t = client.post("/api/taches", json={"type_agent": "navigateur", "titre": "lignée", "demande_brute": "montre la lignée",
                                         "extrait": "la lignée"}).json()
    assert t["extrait"] == "la lignée"
    assert t["contexte"]["affichage"]["ecran"] == "ecran_api"
    assert [v["libelle"] for v in t["contexte"]["affichage"]["visibles"]] == ["Théorème principal", "Lemme de compacité"]
    prise = client.post("/api/agents/prendre", json={"types_agent": ["navigateur"]}, headers=AGENT).json()
    assert prise["id"] == t["id"] or prise["type_agent"] == "navigateur"
