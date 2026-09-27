import asyncio
import os

from atlas import conversations, lecture, projets
from atlas.orchestrateur import agent, article, bunker, pipeline
from atlas.orchestrateur.gestionnaire import Gestionnaire
from atlas.orchestrateur.suivi_agents import Agent, Etape, Evenements, SuiviAgents
from tests.test_orchestrateur import CONVERSATION, _attendre, _faux_supabase


def _ecrire(racine, chemin, age=0.0):
    fichier = racine / chemin
    fichier.parent.mkdir(parents=True, exist_ok=True)
    fichier.write_bytes(b"%PDF-1.5" if chemin.endswith(".pdf") else b"\\documentclass{article}")
    if age:
        instant = fichier.stat().st_mtime - age
        os.utime(fichier, (instant, instant))
    return fichier


def test_articles_ecrits_garde_les_pdf_recents_a_cote_de_leur_source(tmp_path):
    papier = "doc_projet/orbites/papiers/01-kepler"
    _ecrire(tmp_path, f"{papier}/main.tex")
    _ecrire(tmp_path, f"{papier}/kepler.pdf")
    _ecrire(tmp_path, f"{papier}/figures/carte.pdf")  # carte du raisonnement
    _ecrire(tmp_path, "doc_projet/sources/article.pdf")
    _ecrire(tmp_path, "doc_projet/orbites/notes.pdf")  # sans source .tex
    _ecrire(tmp_path, "doc_projet/orbites/papiers/00-ancien/main.tex")
    _ecrire(tmp_path, "doc_projet/orbites/papiers/00-ancien/ancien.pdf", age=3600)
    _ecrire(tmp_path, "sessions/s1/docs_session/article/main.tex")
    _ecrire(tmp_path, "sessions/s1/docs_session/article/article.pdf")
    depuis = (tmp_path / papier / "kepler.pdf").stat().st_mtime - 60

    assert article.articles_ecrits(tmp_path, depuis, set()) == [
        f"{papier}/kepler.pdf",
        "sessions/s1/docs_session/article/article.pdf",
    ]
    assert article.articles_ecrits(tmp_path, depuis, {f"{papier}/kepler.pdf"}) == [
        "sessions/s1/docs_session/article/article.pdf"
    ]


def test_consigne_article_demande_un_graphiste():
    texte = article.consigne_article("/root/scribe", ["doc_projet/o/papiers/01-k/k.pdf"])
    assert "/root/scribe" in texte and "`doc_projet/o/papiers/01-k/k.pdf`" in texte and "graphiste" in texte


def _brancher_fin_de_scribe(monkeypatch, tmp_path, g: Gestionnaire) -> None:
    """Le projet de la conversation vit dans tmp_path ; un scribe qui y a écrit un article vient de terminer."""
    _ecrire(tmp_path, "doc_projet/o/papiers/01-k/main.tex")
    _ecrire(tmp_path, "doc_projet/o/papiers/01-k/k.pdf")
    monkeypatch.setattr(conversations, "lire_conversation", lambda cid: CONVERSATION.model_copy())
    monkeypatch.setattr(projets, "id_ou_defaut", lambda pid: "p1")
    monkeypatch.setattr(projets, "dossier_de", lambda pid: "projet")
    monkeypatch.setattr(lecture, "lister_documents", lambda pid, colonnes="*": [{"chemin": "doc_projet/o/a.py"}])
    monkeypatch.setattr(bunker, "dossier_projet", lambda dossier: tmp_path)
    fin = Evenements(etapes=[Etape("termine", "/root/scribe", "scribe", "scribe", "Article prêt")])
    suivi = g._suivis.get("c1") or SuiviAgents()
    suivi.agents["/root/scribe"] = Agent("/root/scribe", "t-scribe", "/root", "scribe", debut=0.0, etat="termine")
    suivi.possede = lambda thread: True
    suivi.recevoir = lambda methode, params: fin
    g._suivis["c1"] = suivi


def test_fin_du_scribe_pendant_le_tour_injecte_la_consigne(monkeypatch, tmp_path):
    trace = _faux_supabase(monkeypatch)
    injectes: list[str] = []
    fin_du_tour = asyncio.Event()

    class FauxTour:
        async def steer(self, texte):
            injectes.append(texte)

    async def faux_tour(conversation, texte, execution_id, sur_tour, **_):
        sur_tour(FauxTour())
        await fin_du_tour.wait()
        return agent.ResultatTour("terminee")

    monkeypatch.setattr(agent, "tour", faux_tour)
    monkeypatch.setattr(pipeline, "ETAPES_APRES_RECHERCHE", [])

    async def scenario():
        g = Gestionnaire()
        await g.envoyer(CONVERSATION.model_copy(), "écris l'article")
        await asyncio.sleep(0)
        _brancher_fin_de_scribe(monkeypatch, tmp_path, g)
        await g._recevoir("turn/completed", {"threadId": "t-scribe"})
        while len(trace["messages"]) < 2:
            await asyncio.sleep(0)
        fin_du_tour.set()
        await _attendre(g)

    asyncio.run(scenario())
    assert len(injectes) == 1 and "doc_projet/o/papiers/01-k/k.pdf" in injectes[0]
    assert trace["messages"][1][0] == "systeme" and "k.pdf" in trace["messages"][1][1]


def test_fin_du_scribe_hors_tour_ouvre_un_tour(monkeypatch, tmp_path):
    trace = _faux_supabase(monkeypatch)
    consignes: list[str] = []

    async def faux_tour(conversation, texte, execution_id, sur_tour, **_):
        consignes.append(texte)
        return agent.ResultatTour("terminee")

    monkeypatch.setattr(agent, "tour", faux_tour)
    monkeypatch.setattr(pipeline, "ETAPES_APRES_RECHERCHE", [])

    async def scenario():
        g = Gestionnaire()
        _brancher_fin_de_scribe(monkeypatch, tmp_path, g)
        await g._recevoir("turn/completed", {"threadId": "t-scribe"})
        await _attendre(g)
        await _attendre(g)
        return g

    g = asyncio.run(scenario())
    assert len(consignes) == 1 and "[Atlas — article du scribe]" in consignes[0]
    assert [role for role, *_ in trace["messages"]] == ["systeme"]
    assert "c1" not in g.derniers_lancements  # la voix garde l'origine du dernier tour
