"""Arbre des agents reconstruit depuis les notifications Codex (formes relevées sur un vrai tour)."""

from atlas.orchestrateur.suivi_agents import RACINE, SuiviAgents, mission_depuis_chemin

RACINE_ID, DIR_ID, LIT_ID = "t-root", "t-dir", "t-lit"


def _suivi():
    horloge = iter(range(100, 1000))
    suivi = SuiviAgents(lambda: next(horloge))
    suivi.demarrer_racine(RACINE_ID, "gpt-6-astra")
    return suivi


def _lancement(suivi, parent_id, chemin, thread_id):
    item = {"type": "subAgentActivity", "agentPath": chemin, "agentThreadId": thread_id, "kind": "started", "id": "x"}
    return suivi.recevoir("item/completed", {"threadId": parent_id, "item": item})


def test_arbre_a_trois_niveaux_et_etats():
    suivi = _suivi()
    assert _lancement(suivi, RACINE_ID, "/root/hydrures", DIR_ID).nouveaux == [DIR_ID]
    _lancement(suivi, DIR_ID, "/root/hydrures/biblio_lah10", LIT_ID)
    suivi.enrichir(DIR_ID, role="directeur_de_labo", surnom="Curie", modele="gpt-6-astra")

    dir_, lit = suivi.agents["/root/hydrures"], suivi.agents["/root/hydrures/biblio_lah10"]
    assert (dir_.parent, lit.parent) == (RACINE, "/root/hydrures")
    assert (dir_.role, dir_.surnom, lit.role) == ("directeur_de_labo", "Curie", "biblio lah10")

    suivi.recevoir("turn/started", {"threadId": LIT_ID, "turn": {"id": "u1"}})
    suivi.recevoir("item/started", {"threadId": LIT_ID, "item": {"type": "webSearch", "query": "LaH10 Tc"}})
    assert (lit.etat, lit.outil, lit.activite, lit.nb_outils) == ("actif", "Recherche web", "LaH10 Tc", 1)

    attente = {"type": "collabAgentToolCall", "tool": "wait", "id": "w"}
    suivi.recevoir("item/started", {"threadId": DIR_ID, "item": attente})
    assert dir_.etat == "attend"

    total = {"tokenUsage": {"total": {"totalTokens": 1234}}}
    suivi.recevoir("thread/tokenUsage/updated", {"threadId": LIT_ID, **total})
    reponse = {"type": "agentMessage", "phase": "final_answer", "text": "3 références", "id": "m"}
    evenements = suivi.recevoir("item/completed", {"threadId": LIT_ID, "item": reponse})
    assert evenements.a_enregistrer == [("/root/hydrures/biblio_lah10", reponse)]
    suivi.recevoir("turn/completed", {"threadId": LIT_ID, "turn": {"status": "completed"}})
    assert (lit.etat, lit.tokens, lit.resultat, lit.fin is not None) == ("termine", 1234, "3 références", True)

    suivi.recevoir("item/completed", {"threadId": DIR_ID, "item": attente})
    assert dir_.etat == "actif"


def test_items_de_l_orchestrateur_non_enregistres_ici():
    suivi = _suivi()
    message = {"type": "agentMessage", "text": "Bonjour", "id": "m"}
    assert suivi.recevoir("item/completed", {"threadId": RACINE_ID, "item": message}).a_enregistrer == []
    assert suivi.recevoir("item/completed", {"threadId": "inconnu", "item": message}).a_enregistrer == []


def test_reprise_depuis_l_instantane_du_tour_precedent():
    suivi = _suivi()
    _lancement(suivi, RACINE_ID, "/root/hydrures", DIR_ID)
    suivi.recevoir("turn/completed", {"threadId": DIR_ID, "turn": {"status": "completed"}})

    repris = SuiviAgents.depuis(suivi.instantane())
    repris.demarrer_racine(RACINE_ID)
    assert repris.agents[RACINE].etat == "actif"
    assert repris.agents["/root/hydrures"].etat == "termine"
    repris.recevoir("turn/started", {"threadId": DIR_ID, "turn": {"id": "u2"}})
    assert repris.agents["/root/hydrures"].etat == "actif"


def test_mission_depuis_chemin():
    assert mission_depuis_chemin("/root/hydrures_sous-pression") == "hydrures sous pression"


def test_brouillon_et_tour_en_cours():
    suivi = _suivi()
    _lancement(suivi, RACINE_ID, "/root/hydrures", DIR_ID)
    suivi.recevoir("turn/started", {"threadId": DIR_ID, "turn": {"id": "u1"}})
    assert suivi.agents["/root/hydrures"].tour == "u1"
    for morceau in ("Trois ", "sources"):
        suivi.recevoir("item/agentMessage/delta", {"threadId": DIR_ID, "itemId": "m", "delta": morceau})
    assert suivi.brouillons == {"/root/hydrures": "Trois sources"}
    message = {"type": "agentMessage", "text": "Trois sources", "id": "m"}
    suivi.recevoir("item/completed", {"threadId": DIR_ID, "item": message})
    assert suivi.brouillons == {}
    suivi.recevoir("turn/completed", {"threadId": DIR_ID, "turn": {"status": "completed"}})
    assert suivi.agents["/root/hydrures"].tour is None


def test_fin_d_un_sous_agent_hors_tour_enregistree_dans_le_fil_de_l_orchestrateur():
    suivi = _suivi()
    _lancement(suivi, RACINE_ID, "/root/hydrures", DIR_ID)
    fin = {"type": "subAgentActivity", "agentPath": "/root/hydrures", "agentThreadId": DIR_ID, "kind": "completed"}
    # Pendant le tour, c'est le flux du tour qui l'enregistre.
    assert suivi.recevoir("item/completed", {"threadId": RACINE_ID, "item": fin}).a_enregistrer == []
    suivi.recevoir("turn/completed", {"threadId": RACINE_ID, "turn": {"status": "completed"}})
    assert suivi.recevoir("item/completed", {"threadId": RACINE_ID, "item": fin}).a_enregistrer == [(RACINE, fin)]
    assert [a.chemin for a in suivi.au_travail(sous_agents_seuls=True)] == ["/root/hydrures"]


def test_un_arbre_relu_d_un_ancien_processus_ne_travaille_plus():
    suivi = _suivi()
    _lancement(suivi, RACINE_ID, "/root/hydrures", DIR_ID)
    repris = SuiviAgents.depuis(suivi.instantane())
    assert repris.agents["/root/hydrures"].etat == "interrompu"
    assert repris.au_travail() == []


def test_un_sous_agent_relance_repart_de_zero_et_son_bilan_est_fige():
    suivi = _suivi()
    _lancement(suivi, RACINE_ID, "/root/hydrures", DIR_ID)
    dir_ = suivi.agents["/root/hydrures"]
    suivi.recevoir("turn/started", {"threadId": DIR_ID, "turn": {"id": "u1"}})
    suivi.recevoir("item/started", {"threadId": DIR_ID, "item": {"type": "webSearch", "query": "LaH10"}})
    suivi.recevoir("thread/tokenUsage/updated", {"threadId": DIR_ID, "tokenUsage": {"total": {"totalTokens": 1000}}})
    suivi.recevoir("turn/completed", {"threadId": DIR_ID, "turn": {"status": "completed"}})
    fin = {"type": "subAgentActivity", "agentPath": "/root/hydrures", "agentThreadId": DIR_ID, "kind": "completed"}
    premier = suivi.bilan(fin)
    assert (premier["nb_outils"], premier["tokens"]) == (1, 1000)

    suivi.recevoir("turn/started", {"threadId": DIR_ID, "turn": {"id": "u2"}})
    suivi.recevoir("thread/tokenUsage/updated", {"threadId": DIR_ID, "tokenUsage": {"total": {"totalTokens": 1300}}})
    assert (dir_.nb_outils, dir_.tokens, dir_.fin) == (0, 300, None)
    assert suivi.bilan({"type": "subAgentActivity", "agentPath": "/root/hydrures", "kind": "started"}) is None


def test_titre_de_reflexion_en_direct_et_etape_datee():
    suivi = _suivi()
    _lancement(suivi, RACINE_ID, "/root/hydrures", DIR_ID)
    dir_ = suivi.agents["/root/hydrures"]
    suivi.recevoir("turn/started", {"threadId": DIR_ID, "turn": {"id": "u1"}})
    debut = dir_.depuis
    for morceau in ("**Je rédige ", "le rapport**"):
        suivi.recevoir(
            "item/reasoning/summaryTextDelta",
            {"threadId": DIR_ID, "itemId": "r", "summaryIndex": 0, "delta": morceau},
        )
    assert dir_.activite == "Je rédige le rapport"
    suivi.recevoir("item/reasoning/summaryTextDelta", {"threadId": DIR_ID, "itemId": "r", "summaryIndex": 1,
                                                        "delta": "**Je vérifie les unités**"})
    assert dir_.activite == "Je vérifie les unités"
    suivi.recevoir("item/started", {"threadId": DIR_ID, "item": {"type": "fileChange", "changes": []}})
    assert dir_.depuis > debut
    reflexion = {"type": "reasoning", "summary": ["**Je rédige le rapport**"], "id": "r"}
    assert suivi.recevoir("item/completed", {"threadId": DIR_ID, "item": reflexion}).a_enregistrer == [
        ("/root/hydrures", reflexion)
    ]
