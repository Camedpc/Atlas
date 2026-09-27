import asyncio
from datetime import datetime
from types import SimpleNamespace

from openai_codex.types import ThreadItem

from atlas import conversations
from atlas.modeles import Conversation, Execution
from atlas.orchestrateur import agent, gestionnaire, pipeline
from atlas.orchestrateur.codex_vivant import codex_vivant
from atlas.orchestrateur.gestionnaire import DejaEnCours, Gestionnaire, Reglages, titre_depuis
from atlas.orchestrateur.traduction import LONGUEUR_MAX_TEXTE, traduire

T0 = datetime(2026, 9, 26)


def item(**champs) -> ThreadItem:
    return ThreadItem.model_validate(champs)


def test_traduire_message_commande_et_outil_mcp():
    [message] = traduire(item(type="agentMessage", id="i1", text="Je cherche."))
    assert (message.role, message.contenu, message.donnees) == ("assistant", "Je cherche.", None)

    [commande] = traduire(
        item(
            type="commandExecution",
            id="i2",
            command="ls",
            cwd=".",
            status="completed",
            commandActions=[],
            aggregatedOutput="a" * 10_000,
            exitCode=0,
        )
    )
    assert (commande.role, commande.contenu) == ("outil", "ls")
    assert commande.donnees["type"] == "commandExecution"
    assert len(commande.donnees["aggregatedOutput"]) == LONGUEUR_MAX_TEXTE + 1

    [mcp] = traduire(
        item(type="mcpToolCall", id="i3", server="atlas", tool="lire_graphe", status="completed", arguments={})
    )
    assert mcp.contenu == "atlas.lire_graphe"


def test_traduire_ignore_raisonnement_et_message_vide():
    assert traduire(item(type="reasoning", id="i4", summary=[], content=[])) == []
    assert traduire(item(type="agentMessage", id="i5", text="  ")) == []


def test_surcharges_declarent_le_serveur_mcp_et_coupent_les_hooks(monkeypatch, tmp_path):
    monkeypatch.setattr(agent.config, "CODEX_HOME", tmp_path)
    surcharges = agent.surcharges_thread("c1", "defaut", "p1")
    env = surcharges["mcp_servers"]["atlas"]["env"]
    assert env["ATLAS_CONVERSATION_ID"] == "c1" and env["ATLAS_PROJET_ID"] == "p1"
    assert env["ATLAS_DOSSIER_SESSION"].replace("\\", "/").endswith("/sessions/c1")
    assert surcharges["mcp_servers"]["verificateur"]["env"]["ATLAS_PROJET_ID"] == "p1"
    assert surcharges["mcp_servers"]["atlas"]["args"] == ["-m", "atlas.orchestrateur.mcp_atlas"]
    assert surcharges["mcp_servers"]["verificateur"]["args"] == ["-m", "atlas.orchestrateur.mcp_verificateur"]
    assert surcharges["mcp_servers"]["verificateur"]["env"]["ATLAS_CODEX_HOME"] == str(tmp_path)
    assert surcharges["features"] == {"hooks": False, "image_generation": True}
    assert surcharges["project_root_markers"] == []
    assert set(surcharges["agents"]) >= {"directeur_de_labo", "litterature", "experimentateur", "graphiste", "scribe"}


def test_codex_isole_de_la_machine():
    from pathlib import Path

    env = agent.config_codex().env
    assert env is not None
    assert Path(env["CODEX_HOME"]) != Path.home() / ".codex"


def test_titre_depuis():
    assert titre_depuis("  Convergence des suites\nsuite du message") == "Convergence des suites"
    assert len(titre_depuis("x" * 200)) == 80


def _faux_supabase(monkeypatch):
    """Remplace les écritures Supabase par une trace en mémoire."""
    trace: dict = {"messages": [], "fin": None, "titre": None}
    monkeypatch.setattr(
        conversations,
        "creer_execution",
        lambda cid: Execution(
            id="e1", conversation_id=cid, statut="en_cours", erreur=None, usage=None, debut=T0, fin=None
        ),
    )
    monkeypatch.setattr(conversations, "derniere_execution", lambda cid: trace.get("precedente"))
    monkeypatch.setattr(
        conversations,
        "ajouter_message",
        lambda cid, role, contenu, **kw: trace["messages"].append((role, contenu, kw.get("agent"))),
    )
    monkeypatch.setattr(conversations, "modifier_conversation", lambda cid, **champs: trace.update(champs))
    monkeypatch.setattr(conversations, "terminer_execution", lambda eid, statut, **kw: trace.update(fin=(statut, kw)))
    return trace


CONVERSATION = Conversation(
    id="c1", titre=conversations.TITRE_PAR_DEFAUT, session_agent=None, cree_le=T0, modifie_le=T0
)


async def _attendre(g: Gestionnaire) -> None:
    while g._taches:
        await asyncio.sleep(0)


def test_execution_reussie_lance_le_pipeline(monkeypatch):
    trace = _faux_supabase(monkeypatch)
    etapes: list = []

    async def faux_tour(conversation, texte, execution_id, sur_tour, **_):
        sur_tour(SimpleNamespace())
        return agent.ResultatTour("terminee", usage={"total": {"totalTokens": 10}})

    async def etape(cid, eid):
        etapes.append((cid, eid))

    monkeypatch.setattr(agent, "tour", faux_tour)
    monkeypatch.setattr(pipeline, "ETAPES_APRES_RECHERCHE", [etape])

    async def scenario():
        g = Gestionnaire()
        await g.lancer(CONVERSATION.model_copy(), "Pourquoi le ciel est bleu ?")
        assert g.en_cours("c1")
        try:
            await g.lancer(CONVERSATION.model_copy(), "encore")
            raise AssertionError("une deuxième exécution a été acceptée")
        except DejaEnCours:
            pass
        await _attendre(g)
        assert not g.en_cours("c1")

    asyncio.run(scenario())
    assert trace["titre"] == "Pourquoi le ciel est bleu ?"
    assert trace["messages"] == [("utilisateur", "Pourquoi le ciel est bleu ?", None)]
    assert etapes == [("c1", "e1")]
    assert trace["fin"] == ("terminee", {"erreur": None, "usage": {"total": {"totalTokens": 10}}, "agents": []})


def test_execution_en_erreur_est_signalee(monkeypatch):
    trace = _faux_supabase(monkeypatch)

    async def faux_tour(*_, **__):
        return agent.ResultatTour("erreur", "Quota dépassé.")

    monkeypatch.setattr(agent, "tour", faux_tour)

    async def scenario():
        g = Gestionnaire()
        await g.lancer(CONVERSATION.model_copy(), "question")
        await _attendre(g)

    asyncio.run(scenario())
    assert trace["fin"][0] == "erreur"
    assert trace["messages"][-1] == ("systeme", "Quota dépassé.", None)


def test_arret_demande_avant_le_lancement_du_tour(monkeypatch):
    trace = _faux_supabase(monkeypatch)

    async def faux_tour(conversation, texte, execution_id, sur_tour, **_):
        await asyncio.sleep(0)
        sur_tour(SimpleNamespace())  # lève Arret : l'arrêt a été demandé entre-temps
        raise AssertionError("inatteignable")

    monkeypatch.setattr(agent, "tour", faux_tour)

    async def scenario():
        g = Gestionnaire()
        await g.lancer(CONVERSATION.model_copy(), "question")
        assert await g.arreter("c1")
        await _attendre(g)
        assert not await g.arreter("c1")

    asyncio.run(scenario())
    assert trace["fin"][0] == "arretee"


def test_instance_partagee():
    assert isinstance(gestionnaire.gestionnaire, Gestionnaire)


class _FauxCodex:
    """Imite AsyncCodex.account() / login_api_key() pour tester le choix de connexion."""

    def __init__(self, type_compte):
        from openai_codex.types import GetAccountResponse

        compte = {"type": type_compte} if type_compte == "apiKey" else None
        if type_compte == "chatgpt":
            compte = {"type": "chatgpt", "email": "c@exemple.fr", "planType": "plus"}
        self.reponse = GetAccountResponse.model_validate({"account": compte, "requiresOpenaiAuth": True})
        self.cles: list[str] = []

    async def account(self):
        return self.reponse

    async def login_api_key(self, cle):
        self.cles.append(cle)


def _connecter(monkeypatch, type_compte, cle):
    monkeypatch.setattr(agent.config, "OPENAI_API_KEY", cle)
    codex = _FauxCodex(type_compte)
    asyncio.run(agent._connecter(codex))
    return codex.cles


def test_compte_chatgpt_utilise_sans_cle(monkeypatch):
    assert _connecter(monkeypatch, "chatgpt", None) == []


def test_la_cle_api_remplace_le_compte_chatgpt(monkeypatch):
    assert _connecter(monkeypatch, "chatgpt", "sk-test") == ["sk-test"]
    assert _connecter(monkeypatch, "apiKey", "sk-test") == []


def test_sans_compte_ni_cle_erreur_explicite(monkeypatch):
    try:
        _connecter(monkeypatch, None, None)
        raise AssertionError("aucune erreur levée")
    except agent.ConnexionManquante as e:
        assert "atlas.orchestrateur.connexion" in str(e)


def test_verifications_d_ecriture():
    from atlas import ecriture

    ecriture.verifier_id("lemme_borne_2")
    for mauvais in ["Lemme", "lemme-borne", "lemme borne", ""]:
        try:
            ecriture.verifier_id(mauvais)
            raise AssertionError(f"id accepté : {mauvais!r}")
        except ecriture.ErreurGraphe:
            pass
    assert ecriture.normaliser_premisses("thm", ["a", "b", "a"]) == ["a", "b"]
    try:
        ecriture.normaliser_premisses("thm", ["a", "thm"])
        raise AssertionError("un nœud a été accepté comme sa propre prémisse")
    except ecriture.ErreurGraphe:
        pass


def test_jeton_d_acces(monkeypatch):
    from fastapi.testclient import TestClient

    from atlas.orchestrateur import config
    from atlas.serveur import app

    monkeypatch.setattr(conversations, "lister_conversations", lambda: [])
    client = TestClient(app)

    monkeypatch.setattr(config, "JETON_ACCES", None)
    assert client.get("/api/conversations").status_code == 200  # dev local : pas de contrôle

    monkeypatch.setattr(config, "JETON_ACCES", "secret")
    assert client.get("/api/conversations").status_code == 401
    assert client.get("/api/conversations", headers={"Authorization": "Bearer faux"}).status_code == 401
    assert client.get("/api/conversations", headers={"Authorization": "Bearer secret"}).status_code == 200


def test_message_pendant_un_tour_est_injecte_et_relaye_au_sous_agent(monkeypatch):
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
        await g.envoyer(CONVERSATION.model_copy(), "question")
        await asyncio.sleep(0)
        await g.envoyer(CONVERSATION.model_copy(), "précise la source", "/root/hydrures")
        await g.envoyer(CONVERSATION.model_copy(), "et toi ?", "/root")
        fin_du_tour.set()
        await _attendre(g)

    asyncio.run(scenario())
    relais, direct = injectes
    assert "/root/hydrures" in relais and "précise la source" in relais and "send_message" in relais
    assert direct == "et toi ?"
    assert trace["messages"] == [
        ("utilisateur", "question", None),
        ("utilisateur", "précise la source", "/root/hydrures"),
        ("utilisateur", "et toi ?", None),
    ]


def test_message_a_un_sous_agent_hors_tour_lance_un_tour_de_relais(monkeypatch):
    trace = _faux_supabase(monkeypatch)
    consignes: list[str] = []

    async def faux_tour(conversation, texte, execution_id, sur_tour, **_):
        consignes.append(texte)
        return agent.ResultatTour("terminee")

    monkeypatch.setattr(agent, "tour", faux_tour)
    monkeypatch.setattr(pipeline, "ETAPES_APRES_RECHERCHE", [])

    async def scenario():
        g = Gestionnaire()
        await g.envoyer(CONVERSATION.model_copy(), "refais le calcul", "/root/hydrures/calcul")
        await _attendre(g)

    asyncio.run(scenario())
    assert "followup_task" in consignes[0] and "refais le calcul" in consignes[0]
    assert trace["messages"] == [("utilisateur", "refais le calcul", "/root/hydrures/calcul")]


def test_reglages_du_tour_transmis_a_l_orchestrateur(monkeypatch):
    _faux_supabase(monkeypatch)
    recus: dict = {}

    async def faux_tour(conversation, texte, execution_id, sur_tour, **kw):
        recus.update(effort=kw.get("effort"), modele=kw.get("modele"))
        return agent.ResultatTour("terminee")

    monkeypatch.setattr(agent, "tour", faux_tour)
    monkeypatch.setattr(pipeline, "ETAPES_APRES_RECHERCHE", [])

    async def scenario():
        g = Gestionnaire()
        await g.envoyer(CONVERSATION.model_copy(), "question", None, Reglages(effort="xhigh", modele="gpt-6-sol"))
        await _attendre(g)

    asyncio.run(scenario())
    assert recus == {"effort": "xhigh", "modele": "gpt-6-sol"}


def test_message_pendant_le_demarrage_du_tour_attend_qu_il_soit_pret(monkeypatch):
    trace = _faux_supabase(monkeypatch)
    injectes: list[str] = []
    fin_du_tour = asyncio.Event()

    class FauxTour:
        async def steer(self, texte):
            injectes.append(texte)

    async def faux_tour(conversation, texte, execution_id, sur_tour, **_):
        await asyncio.sleep(0.3)  # thread à ouvrir : le tour n'est pas encore branché
        sur_tour(FauxTour())
        await fin_du_tour.wait()
        return agent.ResultatTour("terminee")

    monkeypatch.setattr(agent, "tour", faux_tour)
    monkeypatch.setattr(pipeline, "ETAPES_APRES_RECHERCHE", [])

    async def scenario():
        g = Gestionnaire()
        await g.envoyer(CONVERSATION.model_copy(), "question")
        await g.envoyer(CONVERSATION.model_copy(), "précision")
        fin_du_tour.set()
        await _attendre(g)

    asyncio.run(scenario())
    assert injectes == ["précision"]
    assert [m[1] for m in trace["messages"]] == ["question", "précision"]


def test_message_juste_apres_la_fin_du_tour_lance_le_suivant(monkeypatch):
    _faux_supabase(monkeypatch)
    consignes: list[str] = []

    class TourFini:
        async def steer(self, texte):
            raise RuntimeError("no active turn")

    async def faux_tour(conversation, texte, execution_id, sur_tour, **_):
        consignes.append(texte)
        sur_tour(TourFini())
        await asyncio.sleep(0.1)
        return agent.ResultatTour("terminee")

    monkeypatch.setattr(agent, "tour", faux_tour)
    monkeypatch.setattr(pipeline, "ETAPES_APRES_RECHERCHE", [])

    async def scenario():
        g = Gestionnaire()
        await g.envoyer(CONVERSATION.model_copy(), "question")
        await asyncio.sleep(0.01)
        await g.envoyer(CONVERSATION.model_copy(), "suite")
        await _attendre(g)

    asyncio.run(scenario())
    assert consignes == ["question", "suite"]


def test_tout_arreter_interrompt_aussi_les_sous_agents(monkeypatch):
    _faux_supabase(monkeypatch)
    interrompus: list = []
    fin_du_tour = asyncio.Event()

    class FauxTour:
        async def interrupt(self):
            interrompus.append("orchestrateur")
            fin_du_tour.set()

        async def steer(self, texte):
            interrompus.append(("steer", texte))

    async def faux_tour(conversation, texte, execution_id, sur_tour, suivi=None, **_):
        suivi.demarrer_racine("t-root")
        item = {"type": "subAgentActivity", "agentPath": "/root/calcul", "agentThreadId": "t-calc", "kind": "started"}
        suivi.recevoir("item/completed", {"threadId": "t-root", "item": item})
        suivi.recevoir("turn/started", {"threadId": "t-calc", "turn": {"id": "u-calc"}})
        sur_tour(FauxTour())
        await fin_du_tour.wait()
        return agent.ResultatTour("arretee")

    async def fausse_interruption(thread_id, tour_id):
        interrompus.append((thread_id, tour_id))

    monkeypatch.setattr(agent, "tour", faux_tour)
    monkeypatch.setattr(codex_vivant, "interrompre", fausse_interruption)

    async def scenario():
        g = Gestionnaire()
        await g.envoyer(CONVERSATION.model_copy(), "question")
        while not g._tours.get("c1"):
            await asyncio.sleep(0)
        assert g.actif("c1")
        assert await g.arreter("c1", "/root/calcul")
        assert interrompus[0] == ("t-calc", "u-calc")
        assert interrompus[1][0] == "steer" and "/root/calcul" in interrompus[1][1]
        assert await g.arreter("c1")
        await _attendre(g)
        assert not g.en_cours("c1")

    asyncio.run(scenario())
    assert interrompus[2:] == ["orchestrateur", ("t-calc", "u-calc")]


def test_traduire_garde_les_titres_de_reflexion():
    (ligne,) = traduire({"type": "reasoning", "summary": ["**Je vérifie n = 40**", "**Je conclus**"], "id": "r"})
    assert ligne.role == "outil"
    assert ligne.contenu == "Je vérifie n = 40 · Je conclus"
    assert ligne.donnees == {"type": "reasoning", "titres": ["Je vérifie n = 40", "Je conclus"]}
    assert traduire({"type": "reasoning", "summary": [], "id": "r"}) == []
