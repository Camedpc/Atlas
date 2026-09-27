"""Atlas voix : étapes clés du suivi, contexte au décroché, annonces, pont au raccrochage, arbre des agents,
et abonnement au gestionnaire. Sans réseau : ni Gradium, ni Codex, ni Supabase."""

import asyncio
from datetime import datetime
from types import SimpleNamespace

from atlas import conversations
from atlas.modeles import Conversation, Execution, Message
from atlas.orchestrateur import agent, pipeline
from atlas.orchestrateur.gestionnaire import Gestionnaire
from atlas.orchestrateur.suivi_agents import RACINE, SuiviAgents
from atlas.voix.affichage import Affichages, ErreurAffichage, annonce_affichage, corps_tache
from atlas.voix.appels import Appels, DernierAppel, fusionner
from atlas.voix.contexte import VOIX, annonce, contexte_decroche, pont
from atlas.voix.texte import Decoupeur, est_echo, nettoyer

T0 = datetime(2026, 9, 27, 14, 0)


def _message(id_, role, contenu, agent=None) -> Message:
    return Message(
        id=id_,
        conversation_id="c1",
        execution_id=None,
        role=role,
        contenu=contenu,
        donnees=None,
        agent=agent,
        cree_le=T0,
    )


# ── Étapes clés ──


def _suivi():
    horloge = iter(range(100, 1000))
    suivi = SuiviAgents(lambda: next(horloge))
    suivi.demarrer_racine("t-root", "gpt-6-astra")
    return suivi


def _lancer(suivi, parent_id, chemin, thread_id):
    item = {"type": "subAgentActivity", "agentPath": chemin, "agentThreadId": thread_id, "kind": "started", "id": "x"}
    return suivi.recevoir("item/completed", {"threadId": parent_id, "item": item})


def test_etapes_des_enfants_directs_seulement():
    suivi = _suivi()
    [lance] = _lancer(suivi, "t-root", "/root/hydrures", "t-dir").etapes
    assert (lance.genre, lance.chemin, lance.mission) == ("lance", "/root/hydrures", "hydrures")
    assert _lancer(suivi, "t-dir", "/root/hydrures/biblio", "t-lit").etapes == []  # petit-enfant : muet

    suivi.enrichir("t-dir", role="directeur_de_labo", surnom=None, modele=None)
    final = {"type": "agentMessage", "phase": "final_answer", "text": "14 articles, 3 contradictoires", "id": "m"}
    suivi.recevoir("item/completed", {"threadId": "t-dir", "item": final})
    [fin] = suivi.recevoir("turn/completed", {"threadId": "t-dir", "turn": {"status": "completed"}}).etapes
    assert (fin.genre, fin.role, fin.resultat) == ("termine", "directeur_de_labo", "14 articles, 3 contradictoires")
    # Une seconde notification de fin ne se répète pas.
    assert suivi.recevoir("turn/completed", {"threadId": "t-dir", "turn": {"status": "completed"}}).etapes == []
    assert suivi.recevoir("turn/completed", {"threadId": "t-lit", "turn": {"status": "failed"}}).etapes == []


def test_reponse_finale_de_l_orchestrateur_gardee_en_entier():
    suivi = _suivi()
    texte = "Conclusion. " * 100
    final = {"type": "agentMessage", "phase": "final_answer", "text": texte, "id": "m"}
    suivi.recevoir("item/completed", {"threadId": "t-root", "item": final})
    assert suivi.derniere_reponse == texte
    assert len(suivi.agents[RACINE].resultat) < len(texte)


# ── Contexte, annonces, pont ──


def test_contexte_au_decroche():
    messages = [_message(i, "outil", "ls") for i in range(5)]
    messages += [
        _message(10, "utilisateur", "Étudie les hydrures."),
        _message(11, "assistant", "Rapport : " + "x" * 5000),
        _message(12, "utilisateur", "On en parle ?", VOIX),
        _message(13, "assistant", "Oui, vas-y.", VOIX),
    ]
    contexte = contexte_decroche(messages, limite=30)
    assert "ls" not in contexte
    lignes = contexte.splitlines()
    assert lignes[0] == "Camille : Étudie les hydrures."
    assert lignes[1].startswith("Orchestrateur : Rapport") and 2900 < len(lignes[1]) < 3100
    assert lignes[2:] == ["Camille (à l'oral) : On en parle ?", "Atlas voix : Oui, vas-y."]
    assert contexte_decroche([], 30).startswith("La conversation est vide")


def test_annonces_regroupees_et_fin_prioritaire():
    lance = {"type": "etape", "genre": "lance", "role": "hydrures", "mission": "hydrures", "chemin": "/root/hydrures"}
    fini = {
        "type": "etape",
        "genre": "termine",
        "role": "directeur_de_labo",
        "mission": "hydrures",
        "chemin": "/root/hydrures",
        "resultat": "14 articles",
    }
    assert "une phrase courte" in annonce([lance])
    deux = annonce([lance, fini])
    assert "2 étapes" in deux and "le directeur de labo « hydrures » a terminé. Résultat : 14 articles" in deux
    fin = {"type": "fin", "statut": "terminee", "reponse": "LaH10 : Tc ≈ 250 K.", "erreur": None}
    texte = annonce([lance, fini, fin])
    assert texte.startswith("[Orchestrateur — tour terminé]") and "LaH10" in texte and "14 articles" not in texte
    assert "échoué" in annonce([{"type": "fin", "statut": "erreur", "reponse": None, "erreur": "quota"}])
    assert annonce([{"type": "debut"}]) is None


def test_pont_au_raccrochage():
    appel = [
        _message(1, "utilisateur", "Lance l'étude des hydrures.", VOIX),
        _message(2, "outil", "voix.confier_orchestrateur", VOIX),
        _message(3, "assistant", "C'est transmis.", VOIX),
    ]
    texte = pont(appel, T0, datetime(2026, 9, 27, 14, 12))
    assert "Appel vocal de 14:00 à 14:12" in texte
    assert "Camille (à l'oral) : Lance l'étude des hydrures.\nAtlas voix : C'est transmis." in texte
    assert "confier_orchestrateur" not in texte
    assert pont([], T0, T0) is None


# ── Arbre des agents ──


def test_voix_dans_l_arbre_des_agents():
    arbre = [{"chemin": RACINE, "parent": None}, {"chemin": "/root/hydrures", "parent": RACINE}]
    voix = [{"chemin": VOIX, "parent": None}, {"chemin": f"{VOIX}/1_compter", "parent": VOIX}]
    assert fusionner(arbre, [], False) == arbre
    sans_confier = fusionner(arbre, voix, False)
    assert [a["parent"] for a in sans_confier] == [None, VOIX, None, RACINE]
    avec = fusionner(arbre, voix, True)
    assert next(a for a in avec if a["chemin"] == RACINE)["parent"] == VOIX
    assert arbre[0]["parent"] is None  # l'arbre d'origine n'est pas modifié


def test_dernier_appel_visible_jusqu_a_une_relance_ecrite():
    appels = Appels()
    appels.derniers["c1"] = DernierAppel([{"chemin": VOIX}], fin=1000.0, a_confie=True)
    assert appels.agents_voix("c1", None) == ([{"chemin": VOIX}], True)
    assert appels.agents_voix("c1", ("voix", 900.0))[0]
    assert appels.agents_voix("c1", ("texte", 900.0))[0]  # relance écrite avant l'appel
    assert appels.agents_voix("c1", ("texte", 1100.0)) == ([], False)
    assert appels.agents_voix("c2", None) == ([], False)


# ── Gestionnaire : abonnement et pont ──


def _faux_supabase(monkeypatch):
    messages: list = []
    monkeypatch.setattr(
        conversations,
        "creer_execution",
        lambda cid: Execution(
            id="e1", conversation_id=cid, statut="en_cours", erreur=None, usage=None, debut=T0, fin=None
        ),
    )
    monkeypatch.setattr(conversations, "derniere_execution", lambda cid: None)
    monkeypatch.setattr(
        conversations,
        "ajouter_message",
        lambda cid, role, contenu, **kw: messages.append(contenu) if role == "utilisateur" else None,
    )
    monkeypatch.setattr(conversations, "modifier_conversation", lambda cid, **champs: None)
    monkeypatch.setattr(conversations, "terminer_execution", lambda eid, statut, **kw: None)
    monkeypatch.setattr(pipeline, "ETAPES_APRES_RECHERCHE", [])
    return messages


CONVERSATION = Conversation(id="c1", titre="Hydrures", session_agent=None, cree_le=T0, modifie_le=T0)


def test_gestionnaire_publie_les_etapes_et_la_fin_et_consomme_le_pont(monkeypatch):
    messages = _faux_supabase(monkeypatch)
    recus: list[str] = []

    g = Gestionnaire()

    async def faux_tour(conversation, texte, execution_id, sur_tour, suivi=None, **_):
        recus.append(texte)
        sur_tour(SimpleNamespace())
        # Un sous-agent démarre : la notification passe par l'écoute permanente du gestionnaire.
        suivi.demarrer_racine("t-root", "gpt-6-astra")
        lancement = {
            "type": "subAgentActivity",
            "agentPath": "/root/hydrures",
            "agentThreadId": "t-dir",
            "kind": "started",
            "id": "x",
        }
        await g._recevoir("item/completed", {"threadId": "t-root", "item": lancement})
        suivi.derniere_reponse = "Tc ≈ 250 K."
        return agent.ResultatTour("terminee")

    monkeypatch.setattr(agent, "tour", faux_tour)
    monkeypatch.setattr(agent, "enrichir", lambda suivi, thread_id: asyncio.sleep(0))

    async def scenario():
        file = g.abonner("c1")
        g.deposer_pont("c1", "[Appel vocal …]")
        await g.envoyer(CONVERSATION.model_copy(), "Et la pression ?", origine="texte")
        while g._taches:
            await asyncio.sleep(0)
        evenements = [file.get_nowait() for _ in range(file.qsize())]
        # Le pont n'est servi qu'une fois.
        await g.envoyer(CONVERSATION.model_copy(), "Merci")
        while g._taches:
            await asyncio.sleep(0)
        return evenements

    evenements = asyncio.run(scenario())
    assert [e["type"] for e in evenements] == ["debut", "etape", "fin"]
    assert evenements[1]["genre"] == "lance" and evenements[2]["reponse"] == "Tc ≈ 250 K."
    assert recus == ["[Appel vocal …]\n\nEt la pression ?", "Merci"]
    assert messages == ["Et la pression ?", "Merci"]  # le pont n'apparaît pas dans le fil
    assert g.derniers_lancements["c1"][0] == "texte"


# ── Texte pour la synthèse ──


def test_decoupe_et_nettoyage_pour_la_synthese():
    d = Decoupeur()
    morceaux = []
    texte = "Oui, je regarde ça. Il y a trois commits récents sur main, le dernier date d'hier. Tu veux le détail ?"
    for i in range(0, len(texte), 3):
        morceaux += d.ajouter(texte[i : i + 3])
    morceaux += [d.vider()]
    assert " ".join(morceaux) == texte and morceaux[0] == "Oui, je regarde ça."
    assert nettoyer("**Trois** commits :\n- `d4a50c2` voir https://x.y") == "Trois commits : d4a50c2 voir le lien"
    assert est_echo("trois commits récents", texte) and not est_echo("attends arrête", texte)


# ── Affichage : tâches de l'agent navigateur d'AtlasVoice ──


def test_corps_de_la_tache_navigateur():
    corps = corps_tache(
        "montrer la lignée du lemme 3",
        "euh montre-moi la lignée du lemme 3 et lance la vérif",
        "montre-moi la lignée du lemme 3",
        "lignée du lemme 3",
    )
    assert corps == {
        "type_agent": "navigateur",
        "titre": "lignée du lemme 3",
        "demande_brute": "euh montre-moi la lignée du lemme 3 et lance la vérif",
        "reformulation": "montrer la lignée du lemme 3",
        "canal": "vocal",
        "extrait": "montre-moi la lignée du lemme 3",
    }
    # Sans phrase transcrite (message tapé par l'outil seul) : la demande sert de demande brute, pas d'extrait vide.
    assert corps_tache("zoome", titre="  ") == {
        "type_agent": "navigateur",
        "titre": "zoome",
        "demande_brute": "zoome",
        "reformulation": "zoome",
        "canal": "vocal",
    }


def test_annonces_de_l_affichage():
    assert "C'est affiché." in annonce_affichage(
        {"statut": "terminee", "titre": "t", "resultat_oral": "C'est affiché."}
    )
    question = annonce_affichage({"id": 7, "statut": "besoin_precision", "question": "Quel lemme ?"})
    assert "Quel lemme ?" in question and "repondre_affichage" in question and "id 7" in question
    assert "pas d'écran" in annonce_affichage({"statut": "echouee", "titre": "t", "erreur": "pas d'écran"})
    for statut in ("en_attente", "en_cours", "annulee"):
        assert annonce_affichage({"statut": statut}) is None


class _FauxAtlasVoice:
    """Registre d'AtlasVoice simulé : la tâche suit les états donnés, un par lecture."""

    def __init__(self, etats):
        self.etats = list(etats)
        self.crees: list[dict] = []
        self.reponses: list[tuple[int, str]] = []

    async def creer(self, corps):
        self.crees.append(corps)
        return {"id": 1, "statut": "en_attente", **corps}

    async def lire(self, tache_id):
        return self.etats.pop(0) if len(self.etats) > 1 else self.etats[0]

    async def repondre(self, tache_id, reponse):
        self.reponses.append((tache_id, reponse))
        return {"id": tache_id, "statut": "en_cours"}


def test_affichage_suivi_question_puis_resultat():
    async def scenario():
        base = {"id": 1, "titre": "lignée"}
        faux = _FauxAtlasVoice(
            [
                {**base, "statut": "en_attente"},
                {**base, "statut": "en_cours"},
                {**base, "statut": "besoin_precision", "question": "Lequel des deux lemmes ?"},
            ]
        )
        annonces: list[str] = []
        affichages = Affichages(annonces.append, faux, intervalle=0)
        affichages.derniere_demande = "montre la lignée du lemme"
        assert (await affichages.lancer("montrer la lignée du lemme"))["id"] == 1
        assert faux.crees[0]["demande_brute"] == "montre la lignée du lemme"
        await asyncio.gather(*affichages._suivis.values())
        assert len(annonces) == 1 and "Lequel des deux lemmes ?" in annonces[0]  # le suivi s'arrête sur la question

        faux.etats = [{**base, "statut": "en_cours"}, {**base, "statut": "terminee", "resultat_oral": "C'est affiché."}]
        assert (await affichages.repondre(1, "le premier"))["transmis"]
        await asyncio.gather(*affichages._suivis.values())
        assert faux.reponses == [(1, "le premier")]
        assert len(annonces) == 2 and "C'est affiché." in annonces[1]
        assert affichages._suivis == {}

    asyncio.run(scenario())


def test_affichage_sans_atlasvoice():
    async def scenario():
        affichages = Affichages(lambda _: None, None)
        assert "ATLAS_AFFICHAGE_URL" in (await affichages.lancer("zoome"))["erreur"]

        class Injoignable(_FauxAtlasVoice):
            async def creer(self, corps):
                raise ErreurAffichage("AtlasVoice injoignable")

        affichages = Affichages(lambda _: None, Injoignable([]))
        assert (await affichages.lancer("zoome")) == {"erreur": "AtlasVoice injoignable"}

    asyncio.run(scenario())
