"""Clé OpenAI fournie par l'utilisateur : un processus Codex à elle, le compte du serveur intact (sans réseau)."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from atlas.orchestrateur import agent, codex_vivant, pipeline
from atlas.orchestrateur.codex_vivant import dossier_cle, oublier_cle, pour_cle, tous
from atlas.orchestrateur.gestionnaire import CompteDifferent, Gestionnaire
from atlas.orchestrateur.routes import cle_openai

from .test_orchestrateur import CONVERSATION, _attendre, _faux_supabase, _FauxCodex

CLE = "sk-proj-" + "a" * 40
AUTRE = "sk-proj-" + "b" * 40


@pytest.fixture(autouse=True)
def codex_home(monkeypatch, tmp_path):
    monkeypatch.setattr(agent.config, "CODEX_HOME", tmp_path / ".codex")
    monkeypatch.setattr(codex_vivant, "_par_cle", {})
    monkeypatch.setattr(pipeline, "ETAPES_APRES_RECHERCHE", [])
    return tmp_path / ".codex"


def test_un_processus_par_cle_hors_du_codex_home_du_serveur(codex_home):
    assert pour_cle(None) is codex_vivant.codex_vivant
    vivant = pour_cle(CLE)
    assert pour_cle(CLE) is vivant and pour_cle(AUTRE) is not vivant
    assert vivant.codex_home == dossier_cle(CLE) and vivant.codex_home.parent.parent == codex_home.parent
    assert CLE not in str(vivant.codex_home)  # le dossier porte une empreinte, pas la clé
    assert len(tous()) == 3


def test_oublier_la_cle_supprime_son_codex_home():
    vivant = pour_cle(CLE)
    vivant.codex_home.mkdir(parents=True)
    (vivant.codex_home / "auth.json").write_text("{}")
    asyncio.run(oublier_cle(CLE))
    assert not vivant.codex_home.exists()
    assert pour_cle(CLE) is not vivant


def test_la_cle_de_l_utilisateur_passe_avant_celle_du_serveur(monkeypatch):
    monkeypatch.setattr(agent.config, "OPENAI_API_KEY", "sk-serveur")
    codex = _FauxCodex("chatgpt")
    asyncio.run(agent._connecter(codex, CLE))
    assert codex.cles == [CLE]


def test_le_verificateur_reprend_la_connexion_de_la_cle(monkeypatch, codex_home):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-serveur")
    monkeypatch.setenv("ATLAS_CODEX_HOME", str(codex_home))
    serveur = agent.surcharges_thread("c1", "defaut", "p1")["mcp_servers"]["verificateur"]
    assert "OPENAI_API_KEY" in serveur["env_vars"] and "ATLAS_CODEX_HOME" not in serveur["env_vars"]
    assert serveur["env"]["ATLAS_CODEX_HOME"] == str(codex_home)

    home = dossier_cle(CLE)
    avec_cle = agent.surcharges_thread("c1", "defaut", "p1", home)["mcp_servers"]["verificateur"]
    assert "OPENAI_API_KEY" not in avec_cle["env_vars"] and "ATLAS_CODEX_HOME" not in avec_cle["env_vars"]
    assert avec_cle["env"]["ATLAS_CODEX_HOME"] == str(home)


def test_le_tour_passe_par_le_processus_de_la_cle(monkeypatch):
    vus: list = []

    async def faux_tour(conversation, texte, execution_id, sur_tour, vivant, **_):
        vus.append(vivant)
        sur_tour(SimpleNamespace())
        if vivant is codex_vivant.codex_vivant:
            return agent.ResultatTour("terminee")
        return agent.ResultatTour("erreur", f"Clé refusée : {CLE}")

    monkeypatch.setattr(agent, "tour", faux_tour)
    trace = _faux_supabase(monkeypatch)

    async def scenario():
        g = Gestionnaire()
        await g.envoyer(CONVERSATION.model_copy(), "question", cle=CLE)
        await _attendre(g)
        await g.envoyer(CONVERSATION.model_copy(), "question")
        await _attendre(g)

    asyncio.run(scenario())
    assert vus == [pour_cle(CLE), codex_vivant.codex_vivant]
    # La clé ne s'écrit jamais dans la conversation.
    assert all(CLE not in contenu for _, contenu, _ in trace["messages"])
    assert ("systeme", "Clé refusée : sk-…", None) in trace["messages"]


def test_un_message_d_un_autre_compte_ne_s_injecte_pas(monkeypatch):
    _faux_supabase(monkeypatch)
    liberer = asyncio.Event()

    async def faux_tour(conversation, texte, execution_id, sur_tour, **_):
        sur_tour(SimpleNamespace(steer=lambda _: asyncio.sleep(0)))
        await liberer.wait()
        return agent.ResultatTour("terminee")

    monkeypatch.setattr(agent, "tour", faux_tour)

    async def scenario():
        g = Gestionnaire()
        await g.envoyer(CONVERSATION.model_copy(), "question")
        while g._tours.get("c1") is None:
            await asyncio.sleep(0)
        with pytest.raises(CompteDifferent):
            await g.envoyer(CONVERSATION.model_copy(), "suite", cle=CLE)
        await g.envoyer(CONVERSATION.model_copy(), "suite")  # même compte : injecté dans le tour
        liberer.set()
        await _attendre(g)

    asyncio.run(scenario())


def test_forme_de_la_cle():
    assert cle_openai(None) is None and cle_openai("  ") is None
    assert cle_openai(f" {CLE} ") == CLE
    for mauvaise in ("abc", "sk-court", CLE + " x"):
        with pytest.raises(HTTPException):
            cle_openai(mauvaise)


def _routes_sans_reseau(monkeypatch, accessibles):
    from atlas.orchestrateur import routes

    def faux_openai(cle):
        if accessibles is None:
            raise routes.CleRefusee("OpenAI refuse cette clé (invalide ou révoquée).")
        return accessibles

    async def faux_modeles(vivant):
        return [
            {"id": "gpt-6-astra", "par_defaut": True},
            {"id": "gpt-6-luna", "par_defaut": False},
            {"id": "gpt-6-sol", "par_defaut": False},
        ]

    monkeypatch.setattr(routes, "modeles_openai", faux_openai)
    monkeypatch.setattr(agent, "modeles_disponibles", faux_modeles)
    monkeypatch.setattr(agent.config, "MODELE", None)
    return routes


def test_une_cle_refusee_par_openai_n_ouvre_aucun_processus(monkeypatch):
    routes = _routes_sans_reseau(monkeypatch, None)
    with pytest.raises(HTTPException) as refus:
        asyncio.run(routes.verifier_compte(CLE))
    assert refus.value.status_code == 400 and "refuse" in refus.value.detail
    assert codex_vivant._par_cle == {}


def test_la_verification_signale_les_agents_sans_modele(monkeypatch):
    routes = _routes_sans_reseau(monkeypatch, {"gpt-6-astra", "gpt-6-sol"})
    reponse = asyncio.run(routes.verifier_compte(CLE))
    assert reponse["modeles"] == ["gpt-6-astra", "gpt-6-sol"]
    assert reponse["manquants"] == {"litterature": "gpt-6-luna", "verificateur": "gpt-6-luna"}


def test_avec_une_cle_seuls_ses_modeles_sont_proposes(monkeypatch):
    routes = _routes_sans_reseau(monkeypatch, {"gpt-6-luna"})
    avec = asyncio.run(routes.modeles(CLE))
    assert [m["id"] for m in avec["modeles"]] == ["gpt-6-luna"] and avec["modele_defaut"] == "gpt-6-luna"
    sans = asyncio.run(routes.modeles(None))
    assert len(sans["modeles"]) == 3 and sans["modele_defaut"] == "gpt-6-astra"
