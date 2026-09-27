"""Atlas voix : étapes clés du suivi, contexte au décroché, annonces, pont au raccrochage, arbre des agents,
et abonnement au gestionnaire. Sans réseau : ni Gradium, ni Codex, ni Supabase."""

import asyncio
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

from atlas import conversations
from atlas.modeles import Conversation, Execution, Message
from atlas.orchestrateur import agent, pipeline
from atlas.orchestrateur.gestionnaire import Gestionnaire
from atlas.orchestrateur.suivi_agents import RACINE, SuiviAgents
from atlas.voix.appels import Appels, DernierAppel, fusionner
from atlas.voix.contexte import VOIX, annonce, contexte_decroche, pont
from atlas.voix.ecran import Ecran
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
    monkeypatch.setattr(agent, "enrichir", lambda suivi, thread_id, *_: asyncio.sleep(0))

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


# ── Écran du graphe piloté par la voix (lots P3 par la WebSocket de l'appel) ──


def _vue_ecran():
    from atlas.vue import EtatVue, Groupe, NoeudVue, Placement

    noeuds = {
        "h_a": NoeudVue("h_a", "Régime stationnaire", "hypothese", "ouvert"),
        "l_1": NoeudVue("l_1", "Tension au point de prise", "lemme", "ouvert", (("h_a", "principale"),)),
        "t_1": NoeudVue("t_1", "Loi de la fontaine", "theoreme", "ouvert", (("l_1", "principale"),)),
    }
    placements = {
        "h_a": Placement("h_a", 0, 0, "g1"),
        "l_1": Placement("l_1", 1, 0, "g1"),
        "t_1": Placement("t_1", 3, 0),
    }
    return EtatVue(noeuds=noeuds, groupes={"g1": Groupe("g1", "Départ")}, placements=placements)


class _Navigateur:
    """Navigateur simulé : répond à chaque lot par un compte rendu (refusé si `refus`)."""

    def __init__(self, refus: str | None = None, muet: bool = False):
        self.lots: list[dict] = []
        self.refus = refus
        self.muet = muet
        self.ecran: Ecran | None = None

    async def envoyer(self, message: dict) -> None:
        assert message["type"] == "commandes"
        lot = message["lot"]
        self.lots.append(lot)
        if self.muet:
            return
        erreur = {"code": "etat_invalide", "message": self.refus} if self.refus else None
        resultats = [{"index": 0, "ok": False, "erreur": erreur}] if erreur else []
        cr = {"version": 1, "lot_id": lot["lot_id"], "ok": erreur is None, "resultats": resultats}
        asyncio.get_running_loop().call_soon(self.ecran.recevoir_compte_rendu, cr)


def _ecran(monkeypatch, navigateur: _Navigateur, projet: str = "p1", dossier: Path = Path(".")) -> Ecran:
    from atlas import lecture

    monkeypatch.setattr(lecture, "charger_etat_vue", lambda projet_id: _vue_ecran())
    ecran = Ecran(navigateur.envoyer, "p1", dossier)
    navigateur.ecran = ecran
    ecran.recevoir_etat({"ecran": "ecran_1a2b3c4d", "projet": projet, "camera": {"distance": 2.0}})
    return ecran


def test_ecran_montrer_resout_et_attend_le_compte_rendu(monkeypatch):
    async def scenario():
        nav = _Navigateur()
        ecran = _ecran(monkeypatch, nav)
        r = await ecran.montrer(["Lemme 1"], etendue="premisses")
        assert r == {"ok": True, "compris": ["Lemme 1 (Tension au point de prise)"], "noeuds": 2}
        lot = nav.lots[0]
        assert lot["ecran"] == "ecran_1a2b3c4d" and lot["origine"] == "voix"
        assert {"op": "cadrer", "cibles": [{"noeud": "h_a"}, {"noeud": "l_1"}]} in lot["commandes"]
        assert ecran._attentes == {}

    asyncio.run(scenario())


def test_ecran_refus_ambiguite_et_silence(monkeypatch):
    async def scenario():
        nav = _Navigateur(refus="Non pris en charge")
        ecran = _ecran(monkeypatch, nav)
        assert await ecran.zoomer(1.5) == {"ok": False, "erreur": "Non pris en charge"}
        r = await ecran.montrer(["de"])
        assert r["ok"] is False and len(r["candidats"]) == 3  # deux nœuds et le cadre « Départ »
        assert (await ecran.montrer(["Lemme 9"]))["ok"] is False
        assert len(nav.lots) == 1  # une référence introuvable n'envoie rien à l'écran

        monkeypatch.setattr("atlas.voix.ecran.DELAI_COMPTE_RENDU_S", 0.01)
        muet = _Navigateur(muet=True)
        assert (await _ecran(monkeypatch, muet).ensemble()) == {"ok": False, "erreur": "L'écran n'a pas répondu."}

    asyncio.run(scenario())


def test_ecran_absent_ou_autre_espace(monkeypatch):
    async def scenario():
        nav = _Navigateur()
        assert "autre espace" in (await _ecran(monkeypatch, nav, projet="p2").effacer())["erreur"]
        sans = Ecran(nav.envoyer, "p1", Path("."))
        assert "pas annoncé" in (await sans.montrer(["Lemme 1"]))["erreur"]
        assert nav.lots == []

    asyncio.run(scenario())


def test_ecran_deplacer_enregistre_puis_montre(monkeypatch):
    from atlas import ecriture

    ecrit: list[dict] = []
    monkeypatch.setattr(ecriture, "organiser_vue", lambda **kw: ecrit.append(kw) or {})

    async def scenario():
        nav = _Navigateur()
        ecran = _ecran(monkeypatch, nav)
        r = await ecran.deplacer([{"quoi": "Théorème 2", "a_cote_de": "Lemme 1", "cote": "dessous"}])
        assert r == {
            "ok": True,
            "enregistre": ["Théorème 2 (Loi de la fontaine) sous Lemme 1 (Tension au point de prise)"],
            "affiche": True,
        }
        assert ecrit == [
            {
                "projet_id": "p1",
                "operations": [{"op": "placer", "noeud": "t_1", "colonne": 1, "ligne": 1, "groupe": "g1"}],
                "auteur": "voix",
            }
        ]
        assert nav.lots[0]["commandes"][0] == {"op": "recharger_donnees"}
        # Refusé : rien n'est écrit.
        assert (await ecran.deplacer([{"quoi": "Théorème 2", "colonne": 0, "ligne": 0}]))["ok"] is False
        assert len(ecrit) == 1

    asyncio.run(scenario())


def test_ecran_lire(monkeypatch):
    async def scenario():
        ecran = _ecran(monkeypatch, _Navigateur())
        ecran.recevoir_etat(
            {
                "ecran": "ecran_1a2b3c4d",
                "projet": "p1",
                "camera": {"distance": 2.0},
                "selection": {"noeud": "l_1"},
                "fiche": None,
                "surlignes": [],
                "filtres": {"noeuds": [], "statuts": [], "texte": ""},
                "visibles": [{"noeud": "l_1"}, {"noeud": "h_a"}],
            }
        )
        assert await ecran.lire() == {
            "ok": True,
            "zoom": "−4 (les titres)",
            "selection": "Lemme 1",
            "fiche": None,
            "surlignes": 0,
            "filtre_actif": False,
            "au_centre": ["Lemme 1", "Hypothèse (i)"],
        }

    asyncio.run(scenario())


def test_parcours_enregistre_annonce_puis_joue_a_la_voix(monkeypatch, tmp_path):
    from atlas import navigation, parcours

    messages: list[tuple] = []
    monkeypatch.setattr(conversations, "ajouter_message", lambda *a, **kw: messages.append((a, kw)))
    etat = _vue_ecran()
    pret = navigation.compiler_parcours(
        etat,
        navigation.reperer(etat),
        "Preuve de la loi",
        [
            {"phrase": "On part du régime stationnaire.", "montrer": ["Hypothèse (i)"]},
            {"phrase": "Puis la loi.", "montrer": ["t_1"]},
        ],
    )
    session = tmp_path / "sessions" / "c1"
    chemin = parcours.enregistrer(session, "c1", pret)
    assert chemin.startswith("sessions/c1/docs_session/parcours/preuve-de-la-loi-") and chemin.endswith(".json")
    ((args, kw),) = messages
    assert args[:2] == ("c1", "systeme") and kw["donnees"]["type"] == "parcours" and kw["donnees"]["etapes"] == 2
    assert parcours.lire(tmp_path, chemin)["titre"] == "Preuve de la loi"
    assert parcours.lire(tmp_path, Path(chemin).name)["titre"] == "Preuve de la loi"  # le nom du fichier suffit

    async def scenario():
        nav = _Navigateur()
        ecran = _ecran(monkeypatch, nav, dossier=tmp_path)
        r = await ecran.jouer_etape(chemin, 2)
        assert r == {
            "ok": True,
            "titre": "Preuve de la loi",
            "etape": 2,
            "total": 2,
            "phrase": "Puis la loi.",
            "suite": "dernière étape",
        }
        assert {"op": "selectionner", "cible": {"noeud": "t_1"}} in nav.lots[0]["commandes"]
        assert (await ecran.jouer_etape(chemin, 3))["ok"] is False
        assert (await ecran.jouer_etape("../../ailleurs.json", 1))["ok"] is False
        assert len(nav.lots) == 1

    asyncio.run(scenario())
