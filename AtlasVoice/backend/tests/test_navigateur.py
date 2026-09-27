"""Agent navigateur IA : tâche `navigateur` du registre → modèle → commandes validées → écran → fin de tâche.
Outil `filtres.autour`, « revenir », question à l'utilisateur, historique, second essai. Modèle, registre,
relais et API Atlas simulés (aucun réseau, aucun quota)."""

import asyncio
import json
from pathlib import Path

import httpx
import pytest

from app.affichage.protocole import EtatAffichage
from app.agents.contrat import TacheArretee
from app.agents.navigation import navigateur
from app.agents.navigation.navigateur import AgentNavigateur, Demande, Graphe, Refus, construire_lot, deduire_type
from app.config import ModeleLLM

PROTOCOLES = Path(__file__).resolve().parents[3] / "protocoles"
ETAT_EXEMPLE = json.loads((PROTOCOLES / "exemples" / "p4-etat-affichage" / "valides" / "initial.json").read_text("utf-8"))
CONV = "3f2b8c1e-6a4d-4e2f-9b7a-1c2d3e4f5a6b"


def n(id_, nom, parents=(), enfants=(), **modifs):
    return {"id": id_, "nom": nom, "enonce": f"Énoncé de {nom}.", "admis": False, "parents": list(parents),
            "enfants": list(enfants), "demonstrations": [], "conversation_id": None, "statut": "ouvert", **modifs}


# def_compacite → lemme_faible → thm_principal → cor_final ; lemme_forte et choix_jauge → thm_principal ; isole seul.
NOEUDS = [
    n("def_compacite", "Compacité", enfants=["lemme_compacite_faible"]),
    n("lemme_compacite_faible", "Lemme de compacité faible", ["def_compacite"], ["thm_principal"]),
    n("lemme_compacite_forte", "Lemme de compacité forte", enfants=["thm_principal"]),
    n("choix_jauge", "Choix de jauge", enfants=["thm_principal"]),
    n("thm_principal", "Convergence forte du schéma", ["lemme_compacite_faible", "lemme_compacite_forte", "choix_jauge"],
      ["cor_final"], statut="suspendu"),
    n("cor_final", "Corollaire final", ["thm_principal"]),
    n("isole", "Nœud isolé"),
]
GRAPHE = Graphe(NOEUDS)


def etat(**modifs) -> EtatAffichage:
    return EtatAffichage.model_validate({**ETAT_EXEMPLE, "ecran": "ecran_a", "utilisateur_id": "u1", "visibles": [],
                                         "version_donnees": "v1", **modifs})


def construire(commandes, pile=()):
    return construire_lot(commandes, 7, etat(), list(pile), GRAPHE)


# ── sortie du modèle → lot exécutable ────────────────────────────


def test_nettoie_les_champs_et_attache_la_tache_et_l_ecran():
    sortie, restaures = construire([
        {"op": "selectionner", "cible": {"noeud": "thm_principal"}, "facteur": None, "oui": True},
        {"op": "cadrer", "cibles": ["selection"]},
        {"op": "fiche"},
        {"op": "cadrer", "cibles": ["choix_jauge", CONV]},
    ])
    assert restaures == 0 and sortie.ecran == "ecran_a" and sortie.tache_id == 7 and sortie.origine == "navigateur"
    assert [c.model_dump(exclude_unset=True) for c in sortie.commandes] == [
        {"op": "selectionner", "cible": {"noeud": "thm_principal"}}, {"op": "cadrer", "cibles": "selection"},
        {"op": "fiche", "cible": None}, {"op": "cadrer", "cibles": [{"noeud": "choix_jauge"}, {"conversation": CONV}]}]
    assert construire([{"op": "zoomer", "facteur": 2}])[0].lot_id != sortie.lot_id  # un lot_id par envoi


def test_outil_autour_calcule_la_lignee_sur_le_graphe():
    garder = lambda etendue: construire([{"op": "filtres", "patch": {  # noqa: E731
        "autour": [{"noeud": "thm_principal", "etendue": etendue}], "mode": "masquer"}}])[0].commandes[0].patch.noeuds
    assert garder("premisses") == ["choix_jauge", "def_compacite", "lemme_compacite_faible", "lemme_compacite_forte",
                                   "thm_principal"]
    assert garder("consequences") == ["cor_final", "thm_principal"]
    assert garder("lignee") == ["choix_jauge", "cor_final", "def_compacite", "lemme_compacite_faible",
                                "lemme_compacite_forte", "thm_principal"]
    assert garder("seul") == ["thm_principal"]
    sortie, _ = construire([{"op": "filtres", "patch": {"noeuds": ["isole"], "autour": [
        {"noeud": "cor_final", "etendue": "seul"}, {"noeud": "choix_jauge"}]}}])
    assert sortie.commandes[0].patch.noeuds == ["choix_jauge", "cor_final", "isole", "thm_principal"]


def test_refuse_ids_inventes_et_commandes_invalides():
    with pytest.raises(ValueError, match="id de nœud inconnu"):
        construire([{"op": "cadrer", "cibles": [{"noeud": "lemme_invente"}]}])
    with pytest.raises(ValueError, match="id de nœud inconnu"):
        construire([{"op": "filtres", "patch": {"noeuds": ["lemme_invente"]}}])
    with pytest.raises(ValueError, match="autour : nœud inconnu"):
        construire([{"op": "filtres", "patch": {"autour": [{"noeud": "invente", "etendue": "lignee"}]}}])
    with pytest.raises(ValueError, match="op inconnue"):
        construire([{"op": "teleporter"}])
    with pytest.raises(ValueError, match=r"commande 0 \(zoomer\) : champs invalides"):
        construire([{"op": "zoomer", "facteur": 0}])


def test_revenir_injecte_l_etat_de_la_pile():
    e0, e1 = etat(strategie="complet"), etat(strategie="roles_aux")
    sortie, restaures = construire([{"op": "restaurer"}, {"op": "restaurer"}], [e0, e1])
    assert restaures == 2 and [c.etat.strategie for c in sortie.commandes] == ["roles_aux", "complet"]
    with pytest.raises(Refus) as r:
        construire([{"op": "restaurer"}])
    assert r.value.code == "etat_invalide"


def test_type_deduit_et_demande_depuis_la_tache():
    assert deduire_type(n("def_x", "x")) == "definition"
    assert deduire_type(n("x", "x", admis=True)) == "definition"
    assert deduire_type(n("x", "x", demonstrations=[{}])) == "resultat"
    d = Demande.depuis_tache({"id": 3, "utilisateur_id": "u1", "demande_brute": "passe en 3D et résume", "extrait": "passe en 3D"})
    assert (d.tache_id, d.texte, d.extrait, d.echanges) == (3, "passe en 3D et résume", "passe en 3D", [])
    assert Demande.depuis_tache({"id": 3, "utilisateur_id": "u1", "demande_brute": "x", "extrait": "x"}).extrait is None


# ── processus : registre, modèle, relais et API Atlas simulés ────


class RegistreFactice:
    def __init__(self, reponses=()):
        self.appels: list[tuple] = []
        self.reponses = list(reponses)

    async def terminer(self, tid, oral, detail=None, modification_appliquee=False):
        self.appels.append(("terminer", tid, oral, detail))

    async def echouer(self, tid, erreur):
        self.appels.append(("echouer", tid, erreur))

    async def questionner(self, tid, question):
        self.appels.append(("questionner", tid, question))

    async def attendre_utilisateur(self, tid, delai_s=600):
        if not self.reponses:
            raise TacheArretee("arrêtée")
        return {"id": tid, "statut": "en_cours", "reponse": self.reponses.pop(0)}


class Serveurs:
    """Relais (écran) et API Atlas simulés."""

    def __init__(self, avec_ecran=True, ecran_ok=True, conversations=None, noeuds=None, vue=None, **ecran):
        self.avec_ecran, self.ecran_ok = avec_ecran, ecran_ok
        self.ecran = ecran
        self.conversations = conversations if conversations is not None else [{"id": CONV, "titre": "Énergie"}]
        self.noeuds = noeuds if noeuds is not None else NOEUDS
        self.vue = vue  # vue 2D de l'application Atlas (GET /vue) ; None : pas de vue (500)
        self.lots: list[dict] = []
        self.lectures_graphe: list[dict] = []

    def __call__(self, requete: httpx.Request) -> httpx.Response:
        chemin = requete.url.path
        if chemin == "/api/affichage/utilisateurs/u1/etat":
            return httpx.Response(200, content=etat(**self.ecran).model_dump_json(exclude_unset=True)) \
                if self.avec_ecran else httpx.Response(404)
        if chemin == "/api/graphe":
            self.lectures_graphe.append(dict(requete.url.params))
            return httpx.Response(200, json={"noeuds": self.noeuds, "aretes": []})
        if chemin == "/api/vue" and self.vue is not None:
            return httpx.Response(200, json=self.vue)
        if chemin == "/api/conversations":
            return httpx.Response(200, json=self.conversations)
        if chemin == "/api/affichage/commandes":
            corps = json.loads(requete.content)
            self.lots.append(corps)
            if not self.ecran_ok:
                return httpx.Response(504, json={"version": 1, "lot_id": corps["lot_id"], "ok": False, "resultats": [],
                                                 "erreur": {"code": "delai", "message": "Pas de compte rendu en 3 s."}})
            return httpx.Response(200, json={"version": 1, "lot_id": corps["lot_id"], "ok": True, "resultats": []})
        return httpx.Response(500)


def modele(*reponses):
    """Faux modèle : renvoie les réponses prévues dans l'ordre et garde les messages reçus."""
    suite = list(reponses)
    recus: list[list[dict]] = []
    outils: list = []

    async def appeler(messages, outils_=None):
        recus.append(messages)
        outils.append(outils_)
        return suite.pop(0)

    appeler.recus = recus  # type: ignore[attr-defined]
    appeler.outils = outils  # type: ignore[attr-defined]
    return appeler


def agent(serveurs, appeler, registre=None):
    return AgentNavigateur(registre or RegistreFactice(), "http://relais", "cle", "http://atlas",
                           transport=httpx.MockTransport(serveurs), appeler=appeler)


def tache(texte, tid=7, extrait=None):
    return {"id": tid, "utilisateur_id": "u1", "type_agent": "navigateur", "demande_brute": texte, "extrait": extrait or texte}


ISOLER = ("commander", {
    "commandes": [{"op": "zoomer", "facteur": 0.6},
                  {"op": "filtres", "patch": {"autour": [{"noeud": "thm_principal", "etendue": "premisses"}], "mode": "masquer"}},
                  {"op": "cadrer", "cibles": "tout"}],
    "explication": "Le théorème et sa preuve."})


async def test_tache_menee_jusqu_a_c_est_affiche():
    s, appeler, registre = Serveurs(), modele(ISOLER), RegistreFactice()
    a = agent(s, appeler, registre)
    texte = "dézoome et n'affiche que ce qui sert à prouver le théorème de convergence, puis résume-le"
    await a.mener(tache(texte, extrait="dézoome et n'affiche que ce qui sert à prouver le théorème de convergence"))
    assert registre.appels[0][:3] == ("terminer", 7, "C'est affiché.")
    assert [c["op"] for c in registre.appels[0][3]["commandes"]] == ["zoomer", "filtres", "cadrer"]
    assert s.lots[0]["tache_id"] == 7 and s.lots[0]["ecran"] == "ecran_a"
    assert s.lots[0]["commandes"][1]["patch"]["noeuds"] == ["choix_jauge", "def_compacite", "lemme_compacite_faible",
                                                            "lemme_compacite_forte", "thm_principal"]
    assert len(a.piles["ecran_a"]) == 1
    # Le modèle reçoit tout le texte brut, l'extrait d'Atlas, tout l'écran, le graphe et les conversations.
    entree = json.loads(appeler.recus[0][-1]["content"])
    assert entree["demande"] == texte and entree["extrait_atlas"].startswith("dézoome")
    assert set(entree["ecran"]) >= {"camera", "strategie", "selection", "filtres", "fiche", "visibles", "surlignes", "survol"}
    thm = next(x for x in entree["noeuds"] if x["id"] == "thm_principal")
    assert thm["type"] == "theoreme" and thm["premisses"] == ["lemme_compacite_faible", "lemme_compacite_forte", "choix_jauge"]
    assert entree["conversations"] == [{"id": CONV, "titre": "Énergie"}] and entree["pile_profondeur"] == 0
    await a.fermer()


async def test_question_puis_reponse_redonnee_au_modele():
    question = "Lequel veux-tu : « Lemme de compacité faible » ou « Lemme de compacité forte » ?"
    appeler = modele(("refuser", {"code": "ambigu", "message": question}),
                     ("commander", {"commandes": [{"op": "cadrer", "cibles": [{"noeud": "lemme_compacite_forte"}]}]}))
    s, registre = Serveurs(), RegistreFactice(["le fort"])
    a = agent(s, appeler, registre)
    await a.mener(tache("zoome sur le lemme de compacité"))
    assert [x[0] for x in registre.appels] == ["questionner", "terminer"] and registre.appels[0][2] == question
    assert json.loads(appeler.recus[1][-1]["content"])["echanges"] == [{"question": question, "reponse": "le fort"}]
    # La question et la réponse restent dans l'historique de l'écran.
    assert "(question : " in a.historiques["ecran_a"][-1].demande
    await a.fermer()


async def test_refus_ecran_absent_ecran_muet_et_arret():
    registre = RegistreFactice()
    a = agent(Serveurs(), modele(("refuser", {"code": "introuvable", "message": "Je ne trouve pas la conjecture de Riemann."})), registre)
    await a.mener(tache("montre la conjecture de Riemann"))
    assert registre.appels == [("echouer", 7, "Je ne trouve pas la conjecture de Riemann.")]
    registre = RegistreFactice()
    a2 = agent(Serveurs(avec_ecran=False), modele(), registre)
    await a2.mener(tache("passe en 3D"))
    assert registre.appels == [("echouer", 7, "Aucun écran du graphe n'est ouvert.")]
    registre = RegistreFactice()
    a3 = agent(Serveurs(ecran_ok=False), modele(("commander", {"commandes": [{"op": "mode", "mode": "3d"}]})), registre)
    await a3.mener(tache("passe en 3D"))
    assert registre.appels == [("echouer", 7, "L'écran n'a pas répondu.")] and a3.piles["ecran_a"] == []
    # Arrêt par l'utilisateur pendant une question : plus rien n'est écrit.
    registre = RegistreFactice([])
    a4 = agent(Serveurs(), modele(("refuser", {"code": "ambigu", "message": "Lequel ?"})), registre)
    await a4.mener(tache("zoome sur le lemme"))
    assert [x[0] for x in registre.appels] == ["questionner"]
    for x in (a, a2, a3, a4):
        await x.fermer()


async def test_plusieurs_noeuds_second_essai_et_modele_absent():
    s = Serveurs()
    appeler = modele(("commander", {"commandes": [{"op": "cadrer", "cibles": [{"noeud": "invente"}]}]}),
                     ("commander", {"commandes": [
                         {"op": "filtres", "patch": {"noeuds": ["lemme_compacite_faible", "lemme_compacite_forte"], "mode": "masquer"}},
                         {"op": "cadrer", "cibles": "tout"}]}))
    registre = RegistreFactice()
    a = agent(s, appeler, registre)
    await a.mener(tache("affiche seulement tous les lemmes"))
    assert registre.appels[0][0] == "terminer" and "id de nœud inconnu" in appeler.recus[1][-1]["content"]
    assert s.lots[0]["commandes"][0]["patch"]["noeuds"] == ["lemme_compacite_faible", "lemme_compacite_forte"]
    registre = RegistreFactice()
    a2 = AgentNavigateur(registre, "http://relais", "cle", "http://atlas", transport=httpx.MockTransport(Serveurs()),
                         appeler=navigateur.appel_modele(None))
    await a2.mener(tache("passe en 3D"))
    assert registre.appels[0][0] == "echouer" and "Navigateur indisponible" in registre.appels[0][2]
    await a.fermer()
    await a2.fermer()


async def test_historique_et_revenir():
    s = Serveurs()
    appeler = modele(ISOLER, ("commander", {"commandes": [{"op": "restaurer"}]}),
                     ("commander", {"commandes": [{"op": "restaurer"}]}))
    registre = RegistreFactice()
    a = agent(s, appeler, registre)
    await a.mener(tache("garde seulement la preuve du théorème", 1))
    await a.mener(tache("annule le dernier filtre", 2))
    assert s.lots[1]["commandes"][0]["op"] == "restaurer" and s.lots[1]["commandes"][0]["etat"]["ecran"] == "ecran_a"
    assert a.piles["ecran_a"] == []
    await a.mener(tache("annule encore", 3))
    assert registre.appels[-1] == ("echouer", 3, "Il n'y a rien à annuler.") and len(s.lots) == 2
    # 3e appel : système, puis les deux demandes précédentes et ce qui en a été fait, puis la demande.
    m = appeler.recus[2]
    assert [x["role"] for x in m] == ["system", "user", "assistant", "user", "assistant", "user"]
    assert m[1]["content"] == "garde seulement la preuve du théorème" and m[2]["content"].startswith("Le théorème et sa preuve.")
    await a.fermer()


async def test_questions_en_parallele_passages_a_l_ecran_en_ordre():
    """Une tâche qui attend une réponse ne bloque pas les autres."""
    reponse = asyncio.Event()

    class RegistreLent(RegistreFactice):
        async def attendre_utilisateur(self, tid, delai_s=600):
            await reponse.wait()
            return {"id": tid, "statut": "en_cours", "reponse": "le fort"}

    appeler = modele(("refuser", {"code": "ambigu", "message": "Lequel ?"}),
                     ("commander", {"commandes": [{"op": "mode", "mode": "3d"}]}),
                     ("commander", {"commandes": [{"op": "cadrer", "cibles": [{"noeud": "lemme_compacite_forte"}]}]}))
    s, registre = Serveurs(), RegistreLent()
    a = agent(s, appeler, registre)
    premiere = asyncio.create_task(a.mener(tache("zoome sur le lemme", 1)))
    await asyncio.sleep(0.05)
    await a.mener(tache("passe en 3D", 2))  # passe pendant que la première attend
    reponse.set()
    await premiere
    assert [x[:2] for x in registre.appels] == [("questionner", 1), ("terminer", 2), ("terminer", 1)]
    await a.fermer()


async def test_lecture_de_l_appel_d_outil_en_flux(monkeypatch):
    async def flux(_modele, corps):
        assert corps["tool_choice"] == "required" and "temperature" not in corps
        assert [o["function"]["name"] for o in corps["tools"]] == ["commander", "refuser"]
        yield 'data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"name": "comm", "arguments": "{\\"comm"}}]}}]}\n\n'
        yield 'data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"name": "ander", "arguments": "andes\\": []}"}}]}}]}\n\n'

    monkeypatch.setattr(navigateur, "_flux", flux)
    assert await navigateur.appel_modele(ModeleLLM("openai", "m"))([]) == ("commander", {"commandes": []})


async def test_graphe_et_conversations_de_l_espace_affiche():
    """Un graphe par espace (application Atlas) : l'écran dit lequel il affiche (P4 `projet`)."""
    projet, autre = "67900866-5415-4cf4-9262-4cd1cd16e06c", "eec321a2-2704-489f-8cc8-1909847cd259"
    conversations = [{"id": CONV, "titre": "Énergie", "projet_id": projet},
                     {"id": "11111111-2222-4333-8444-555555555555", "titre": "Ailleurs", "projet_id": autre}]
    s, appeler = Serveurs(conversations=conversations, projet=projet), modele(ISOLER)
    a = agent(s, appeler)
    await a.mener(tache("montre la preuve du théorème"))
    assert s.lectures_graphe == [{"projet_id": projet}]
    entree = json.loads(appeler.recus[0][-1]["content"])
    assert [c["id"] for c in entree["conversations"]] == [CONV] and "projet" not in entree["ecran"]
    await a.fermer()

    s = Serveurs()  # écran sans `projet` (graphe unique) : lecture sans paramètre
    a = agent(s, modele(ISOLER))
    await a.mener(tache("montre la preuve du théorème"))
    assert s.lectures_graphe == [{}]
    await a.fermer()


# ── vue 2D de l'application Atlas : numérotation, cadres, figures ──

PROJET = "67900866-5415-4cf4-9262-4cd1cd16e06c"
TYPES = {"def_compacite": "definition", "lemme_compacite_faible": "lemme", "lemme_compacite_forte": "lemme",
         "choix_jauge": "choix_modelisation", "thm_principal": "theoreme", "cor_final": "proposition"}
NOEUDS_TYPES = [{**x, "type": TYPES.get(x["id"])} for x in NOEUDS]


def place(noeud, colonne, ligne, groupe=None):
    return {"noeud_id": noeud, "groupe_id": groupe, "colonne": colonne, "ligne": ligne, "largeur": 1, "hauteur": 1,
            "fixe": False}


VUE = {
    "groupes": [{"id": "g_compacite", "nom": "Compacité", "parent_id": None, "genre": "sous_probleme", "replie": False,
                 "ordre": 0},
                {"id": "g_theoreme", "nom": "Le théorème", "parent_id": None, "genre": "etape", "replie": True, "ordre": 1}],
    "placements": [place("def_compacite", 0, 0, "g_compacite"), place("lemme_compacite_faible", 1, 0, "g_compacite"),
                   place("lemme_compacite_forte", 1, 1), place("choix_jauge", 0, 1),
                   place("thm_principal", 2, 0, "g_theoreme"), place("cor_final", 3, 0, "g_theoreme"),
                   place("fig:courbe", 2, 1, "g_theoreme")],
    "etiquettes": [], "marques": [],
    "figures": [{"id": "courbe", "noeud_id": "thm_principal", "titre": "Courbe de convergence"}],
}


def test_vue_numerotation_cadres_et_figures_comme_le_front():
    from app.agents.navigation.vue_atlas import construire, zoom

    v = construire(NOEUDS_TYPES, VUE)
    # Ordre des cases (colonne, ligne, id) ; hypothèses à part ; `isole`, non placé, sous le reste (0, 3).
    assert {i: v.refs[i] for i in TYPES | {"isole": None}} == {
        "def_compacite": "Définition 1", "choix_jauge": "Hypothèse (i)", "lemme_compacite_faible": "Lemme 3",
        "lemme_compacite_forte": "Lemme 4", "thm_principal": "Théorème 5", "cor_final": "Proposition 6",
        "isole": "Énoncé 2"}
    cadres, figures = v.pour_le_modele()
    assert cadres == [
        {"id": "g_compacite", "numero": "§1", "nom": "Compacité", "genre": "sous_probleme",
         "noeuds": ["def_compacite", "lemme_compacite_faible"]},
        {"id": "g_theoreme", "numero": "§2", "nom": "Le théorème", "genre": "etape", "reduit": True,
         "noeuds": ["cor_final", "thm_principal"]}]
    assert figures == [{"id": "courbe", "ref": "Figure 1", "titre": "Courbe de convergence", "illustre": "thm_principal",
                        "cadre": "§2"}]
    assert zoom(0.08) == {"palier": "−13", "niveau": "points"} and zoom(0.5)["niveau"] == "titres"
    assert zoom(1.0) == {"palier": "1:1", "niveau": "contenu"}


def test_vue_2d_prompt_entree_et_cibles_developpees():
    appeler = modele(("commander", {"commandes": [
        {"op": "filtres", "patch": {"cadres": ["§1"], "mode": "estomper"}},
        {"op": "cadrer", "cibles": [{"cadre": "g_theoreme"}, {"figure": "fig:courbe"}, "fig:courbe"]},
        {"op": "surligner", "cibles": [{"cadre": "§1"}]}]}))
    s = Serveurs(noeuds=NOEUDS_TYPES, vue=VUE, projet=PROJET)
    a = agent(s, appeler)
    asyncio.run(a.mener(tache("montre le paragraphe 1 et la figure du théorème")))
    messages, outils = appeler.recus[0], appeler.outils[0]
    assert messages[0]["content"].startswith("Tu es l'agent navigateur d'Atlas. L'utilisateur regarde la vue")
    assert "orbiter" not in json.dumps(outils)
    entree = json.loads(messages[-1]["content"])
    thm = next(x for x in entree["noeuds"] if x["id"] == "thm_principal")
    assert (thm["ref"], thm["type"], thm["cadre"]) == ("Théorème 5", "theoreme", "§2")
    assert [c["numero"] for c in entree["cadres"]] == ["§1", "§2"] and entree["figures"][0]["ref"] == "Figure 1"
    assert set(entree["ecran"]) >= {"zoom", "visibles", "selection", "filtres"} and "camera" not in entree["ecran"]
    commandes = s.lots[0]["commandes"]
    assert commandes[0]["patch"]["noeuds"] == ["def_compacite", "lemme_compacite_faible"]
    assert commandes[1]["cibles"] == [{"noeud": "cor_final"}, {"noeud": "thm_principal"}, {"figure": "courbe"}]
    assert commandes[2]["cibles"] == [{"noeud": "def_compacite"}, {"noeud": "lemme_compacite_faible"}]
    asyncio.run(a.fermer())


def test_vue_2d_refuse_cadre_et_figure_inconnus():
    from app.agents.navigation.navigateur import Graphe as G
    from app.agents.navigation.vue_atlas import construire

    g = G(NOEUDS_TYPES, construire(NOEUDS_TYPES, VUE))
    e = etat(projet=PROJET)
    with pytest.raises(ValueError, match="cadre inconnu"):
        construire_lot([{"op": "cadrer", "cibles": [{"cadre": "§9"}]}], 1, e, [], g)
    with pytest.raises(ValueError, match="figure inconnue"):
        construire_lot([{"op": "cadrer", "cibles": [{"figure": "absente"}]}], 1, e, [], g)
    with pytest.raises(ValueError, match="ne peut qu'être cadrée"):
        construire_lot([{"op": "surligner", "cibles": [{"figure": "courbe"}]}], 1, e, [], g)


def test_prompt_ancien_force_ou_sans_espace(monkeypatch):
    """La sauvegarde : l'ancien prompt et ses outils, sans vue (écran sans espace, ou ATLAS_NAVIGATEUR_PROMPT=ancien)."""
    monkeypatch.setattr(navigateur, "PROMPT", "ancien")
    appeler = modele(ISOLER)
    s = Serveurs(noeuds=NOEUDS_TYPES, vue=VUE, projet=PROJET)
    asyncio.run(agent(s, appeler).mener(tache("montre la preuve du théorème")))
    assert appeler.recus[0][0]["content"] == navigateur.SYSTEME and appeler.outils == [None]
    entree = json.loads(appeler.recus[0][-1]["content"])
    assert "cadres" not in entree and "ref" not in entree["noeuds"][0] and "camera" in entree["ecran"]
    # Le type vient de la base, même avec l'ancien prompt (la déduction par préfixe ne sert que sans type).
    assert next(x for x in entree["noeuds"] if x["id"] == "cor_final")["type"] == "proposition"


def test_deplacer_attendre_et_retablir_sur_la_grille():
    from app.agents.navigation.navigateur import Graphe as G
    from app.agents.navigation.vue_atlas import construire

    v = construire(NOEUDS_TYPES, VUE)
    g = G(NOEUDS_TYPES, v)
    e = etat(projet=PROJET)
    # Cases : def (0,0), lemme faible (1,0), thm (2,0), cor (3,0), figure (2,1), choix (0,1), lemme fort (1,1).
    lot, _ = construire_lot([
        {"op": "cadrer", "cibles": [{"noeud": "thm_principal"}]},
        {"op": "attendre", "secondes": 3},
        {"op": "deplacer", "deplacements": [{"noeud": "cor_final", "colonne": 5, "ligne": 0},
                                            {"noeud": "fig:courbe", "colonne": 3, "ligne": 0}]},
        {"op": "retablir_disposition"}], 1, e, [], g)
    cmds = [c.model_dump(exclude_unset=True) for c in lot.commandes]
    assert cmds[1] == {"op": "attendre", "secondes": 3.0}
    assert cmds[2]["deplacements"] == [{"noeud": "cor_final", "colonne": 5, "ligne": 0},
                                       {"figure": "courbe", "colonne": 3, "ligne": 0}]
    # La figure prend la case libérée par cor_final dans la même commande ; une case prise est refusée.
    with pytest.raises(ValueError, match="déjà occupée par 'thm_principal'"):
        construire_lot([{"op": "deplacer", "deplacements": [{"noeud": "cor_final", "colonne": 2, "ligne": 0}]}], 1, e, [], g)
    # Les positions provisoires de l'écran comptent : cor_final déjà en (5, 0) libère (3, 0).
    deplace = etat(projet=PROJET, deplacements=[{"noeud": "cor_final", "colonne": 5, "ligne": 0}])
    construire_lot([{"op": "deplacer", "deplacements": [{"noeud": "isole", "colonne": 3, "ligne": 0}]}], 1, deplace, [], g)
    with pytest.raises(ValueError, match="secondes entre 0 et 10"):
        construire_lot([{"op": "attendre", "secondes": 30}], 1, e, [], g)
    with pytest.raises(ValueError, match="pas de grille"):
        construire_lot([{"op": "deplacer", "deplacements": [{"noeud": "isole", "colonne": 9, "ligne": 9}]}], 1, e, [], GRAPHE)
