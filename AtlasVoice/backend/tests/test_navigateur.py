"""Agent navigateur IA (B3) : texte brut → sortie du modèle → LotCommandes validé ; outil `filtres.autour`,
« revenir », refus, second essai, processus. Modèle, relais et API Atlas simulés (aucun réseau, aucun quota)."""

import json
import uuid
from pathlib import Path

import httpx
import pytest

from app.affichage.protocole import EtatAffichage, LotNavigation
from app.agents.navigation import navigateur
from app.agents.navigation.navigateur import AgentNavigateur, Graphe, Refus, construire_lot, deduire_type
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


def lot(demande="montre le théorème principal", **modifs) -> LotNavigation:
    return LotNavigation.model_validate({"version": 1, "lot_id": str(uuid.uuid4()), "tache_id": 7, "utilisateur_id": "u1",
                                         "demande": demande, **modifs})


def construire(commandes, pile=()):
    return construire_lot(commandes, lot(), etat(), list(pile), GRAPHE)


# ── sortie du modèle → lot exécutable ────────────────────────────


def test_nettoie_les_champs_et_garde_lot_id_ecran():
    l = lot()
    sortie, restaures = construire_lot([
        {"op": "selectionner", "cible": {"noeud": "thm_principal"}, "facteur": None, "oui": True},
        {"op": "cadrer", "cibles": ["selection"]},
        {"op": "fiche"},
        {"op": "cadrer", "cibles": ["choix_jauge", CONV]},
    ], l, etat(), [], GRAPHE)
    assert restaures == 0 and sortie.lot_id == l.lot_id and sortie.ecran == "ecran_a" and sortie.tache_id == 7
    assert [c.model_dump(exclude_unset=True) for c in sortie.commandes] == [
        {"op": "selectionner", "cible": {"noeud": "thm_principal"}}, {"op": "cadrer", "cibles": "selection"},
        {"op": "fiche", "cible": None}, {"op": "cadrer", "cibles": [{"noeud": "choix_jauge"}, {"conversation": CONV}]}]


def test_outil_autour_calcule_la_lignee_sur_le_graphe():
    garder = lambda etendue: construire([{"op": "filtres", "patch": {  # noqa: E731
        "autour": [{"noeud": "thm_principal", "etendue": etendue}], "mode": "masquer"}}])[0].commandes[0].patch.noeuds
    assert garder("premisses") == ["choix_jauge", "def_compacite", "lemme_compacite_faible", "lemme_compacite_forte",
                                   "thm_principal"]
    assert garder("consequences") == ["cor_final", "thm_principal"]
    assert garder("lignee") == ["choix_jauge", "cor_final", "def_compacite", "lemme_compacite_faible",
                                "lemme_compacite_forte", "thm_principal"]
    assert garder("seul") == ["thm_principal"]
    # Plusieurs nœuds et une liste explicite se cumulent ; isole n'est jamais ajouté.
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


def test_type_deduit():
    assert deduire_type(n("def_x", "x")) == "definition"
    assert deduire_type(n("x", "x", admis=True)) == "definition"
    assert deduire_type(n("x", "x", demonstrations=[{}])) == "resultat"


# ── processus (modèle, relais et API Atlas simulés) ──────────────


class Serveurs:
    def __init__(self, avec_ecran=True):
        self.avec_ecran = avec_ecran
        self.lots: list[dict] = []
        self.reponses: list[dict] = []
        self.conversations_lues = 0

    def __call__(self, requete: httpx.Request) -> httpx.Response:
        chemin = requete.url.path
        if chemin == "/api/affichage/utilisateurs/u1/etat":
            return httpx.Response(200, content=etat().model_dump_json(exclude_unset=True)) if self.avec_ecran \
                else httpx.Response(404)
        if chemin == "/api/graphe":
            return httpx.Response(200, json={"noeuds": NOEUDS, "aretes": []})
        if chemin == "/api/conversations":
            self.conversations_lues += 1
            return httpx.Response(200, json=[{"id": CONV, "titre": "Énergie"}])
        if chemin == "/api/affichage/commandes":
            corps = json.loads(requete.content)
            self.lots.append(corps)
            return httpx.Response(200, json={"version": 1, "lot_id": corps["lot_id"], "ok": True, "resultats": []})
        if chemin.endswith("/compte-rendu"):
            self.reponses.append(json.loads(requete.content))
            return httpx.Response(204)
        return httpx.Response(500)


def modele(*reponses):
    """Faux modèle : renvoie les réponses prévues dans l'ordre et garde les messages reçus."""
    suite = list(reponses)
    recus: list[list[dict]] = []

    async def appeler(messages):
        recus.append(messages)
        return suite.pop(0)

    appeler.recus = recus  # type: ignore[attr-defined]
    return appeler


def agent(serveurs, appeler):
    return AgentNavigateur("http://relais", "cle", "http://atlas", transport=httpx.MockTransport(serveurs), appeler=appeler)


ISOLER = ("commander", {
    "resolutions": [{"texte": "le théorème de convergence", "nature": "noeud", "candidats": ["thm_principal"],
                     "choisi": "thm_principal", "raison": "même énoncé"}],
    "commandes": [{"op": "zoomer", "facteur": 0.6},
                  {"op": "filtres", "patch": {"autour": [{"noeud": "thm_principal", "etendue": "premisses"}], "mode": "masquer"}},
                  {"op": "cadrer", "cibles": "tout"}]})


async def test_texte_brut_au_modele_puis_commandes_avec_le_meme_lot_id():
    s, appeler = Serveurs(), modele(ISOLER)
    a = agent(s, appeler)
    l = lot("dézoome et n'affiche que ce qui sert à prouver le théorème de convergence",
            demande_brute="dézoome et n'affiche que ce qui sert à prouver le théorème de convergence, puis résume-le")
    cr = await a.traiter(l)
    assert cr.ok and s.lots[0]["lot_id"] == l.lot_id and s.lots[0]["ecran"] == "ecran_a"
    assert [c["op"] for c in s.lots[0]["commandes"]] == ["zoomer", "filtres", "cadrer"]
    assert s.lots[0]["commandes"][1]["patch"]["noeuds"] == ["choix_jauge", "def_compacite", "lemme_compacite_faible",
                                                            "lemme_compacite_forte", "thm_principal"]
    assert len(a.piles["ecran_a"]) == 1
    # Le modèle reçoit le texte brut, la phrase entière, tout l'écran et les nœuds avec leurs liens.
    entree = json.loads(appeler.recus[0][-1]["content"])
    assert entree["demande"] == l.demande and entree["demande_brute"].endswith("puis résume-le")
    assert entree["ecran"]["camera"]["mode"] == "2d" and entree["pile_profondeur"] == 0
    assert set(entree["ecran"]) >= {"camera", "strategie", "selection", "filtres", "fiche", "visibles", "surlignes", "survol"}
    thm = next(x for x in entree["noeuds"] if x["id"] == "thm_principal")
    assert thm["type"] == "theoreme" and thm["premisses"] == ["lemme_compacite_faible", "lemme_compacite_forte", "choix_jauge"]
    assert thm["consequences"] == ["cor_final"]
    # Les conversations sont toujours fournies : le modèle décide s'il en a besoin.
    assert entree["conversations"] == [{"id": CONV, "titre": "Énergie"}] and s.conversations_lues == 1
    await a.fermer()


async def test_la_question_du_modele_part_telle_quelle():
    s = Serveurs()
    question = "Lequel veux-tu : « Lemme de compacité faible » ou « Lemme de compacité forte » ?"
    a = agent(s, modele(("refuser", {"code": "ambigu", "message": question})))
    cr = await a.traiter(lot("zoome sur le lemme de compacité"))
    assert (cr.erreur.code, cr.erreur.message) == ("ambigu", question) and not s.lots
    assert s.reponses[0]["erreur"]["message"] == question
    await a.fermer()


async def test_plusieurs_noeuds_sans_question_imposee():
    """Le modèle est libre : « tous les lemmes » peut donner une liste de nœuds, le code ne force aucune question."""
    s = Serveurs()
    a = agent(s, modele(("commander", {"commandes": [
        {"op": "filtres", "patch": {"noeuds": ["lemme_compacite_faible", "lemme_compacite_forte"], "mode": "masquer"}},
        {"op": "cadrer", "cibles": "tout"}]})))
    assert (await a.traiter(lot("affiche seulement tous les lemmes"))).ok
    assert s.lots[0]["commandes"][0]["patch"]["noeuds"] == ["lemme_compacite_faible", "lemme_compacite_forte"]
    await a.fermer()


async def test_historique_des_demandes_en_contexte():
    s = Serveurs()
    appeler = modele(ISOLER, ("refuser", {"code": "introuvable", "message": "Je ne trouve pas la conjecture de Riemann."}),
                     ("commander", {"commandes": [{"op": "effacer_filtres"}]}))
    a = agent(s, appeler)
    await a.traiter(lot("garde seulement la preuve du théorème"))
    await a.traiter(lot("montre la conjecture de Riemann"))
    await a.traiter(lot("enlève le filtre de tout à l'heure"))
    # 3e appel : système, puis les deux demandes précédentes et ce qui en a été fait, puis la demande.
    m = appeler.recus[2]
    assert [x["role"] for x in m] == ["system", "user", "assistant", "user", "assistant", "user"]
    assert m[1]["content"] == "garde seulement la preuve du théorème" and '"op": "filtres"' in m[2]["content"]
    assert m[4]["content"] == "Refus (introuvable) : Je ne trouve pas la conjecture de Riemann."
    assert json.loads(m[5]["content"])["demande"] == "enlève le filtre de tout à l'heure"
    await a.fermer()


async def test_la_reponse_a_la_question_arrive_au_modele():
    s, appeler = Serveurs(), modele(("commander", {"resolutions": [], "commandes": [
        {"op": "cadrer", "cibles": [{"noeud": "lemme_compacite_forte"}]}]}))
    a = agent(s, appeler)
    await a.traiter(lot("zoome sur le lemme de compacité", echanges=[{"question": "Lequel ?", "reponse": "le fort"}]))
    assert json.loads(appeler.recus[0][-1]["content"])["echanges"] == [{"question": "Lequel ?", "reponse": "le fort"}]
    await a.fermer()


async def test_vue_sans_designation_et_second_essai():
    s = Serveurs()
    a = agent(s, modele(("commander", {"resolutions": [], "commandes": [{"op": "mode", "mode": "3d"}, {"op": "vue", "nom": "dessus"}]})))
    assert (await a.traiter(lot("passe en 3D vue du dessus"))).ok
    s2 = Serveurs()
    appeler = modele(("commander", {"resolutions": [], "commandes": [{"op": "cadrer", "cibles": [{"noeud": "invente"}]}]}),
                     ("commander", {"resolutions": [], "commandes": [{"op": "cadrer", "cibles": "tout"}]}))
    a2 = agent(s2, appeler)
    assert (await a2.traiter(lot())).ok
    assert "id de nœud inconnu" in appeler.recus[1][-1]["content"]
    s3 = Serveurs()
    a3 = agent(s3, modele(("", {}), ("commander", {"resolutions": [], "commandes": []})))
    cr = await a3.traiter(lot())
    assert cr.erreur.code == "invalide" and not s3.lots
    for x in (a, a2, a3):
        await x.fermer()


async def test_revenir_depile_et_rien_a_annuler():
    s = Serveurs()
    restaurer = ("commander", {"resolutions": [], "commandes": [{"op": "restaurer"}]})
    a = agent(s, modele(ISOLER, restaurer, restaurer))
    await a.traiter(lot())
    assert (await a.traiter(lot("annule"))).ok
    assert s.lots[1]["commandes"][0]["op"] == "restaurer" and s.lots[1]["commandes"][0]["etat"]["ecran"] == "ecran_a"
    assert a.piles["ecran_a"] == []
    cr = await a.traiter(lot("annule"))
    assert cr.erreur.code == "etat_invalide" and len(s.lots) == 2
    await a.fermer()


async def test_cadrer_une_conversation():
    s, appeler = Serveurs(), modele(("commander", {"resolutions": [], "commandes": [{"op": "cadrer", "cibles": [{"conversation": CONV}]}]}))
    a = agent(s, appeler)
    assert (await a.traiter(lot("montre ce qu'on a fait dans la conversation sur l'énergie"))).ok
    assert s.lots[0]["commandes"][0]["cibles"] == [{"conversation": CONV}]
    await a.fermer()


async def test_sans_ecran_ou_sans_modele():
    a = agent(Serveurs(avec_ecran=False), modele())
    assert (await a.traiter(lot())).erreur.code == "introuvable"
    a2 = AgentNavigateur("http://relais", "cle", "http://atlas", transport=httpx.MockTransport(Serveurs()),
                         appeler=navigateur.appel_modele(None))
    cr = await a2.traiter(lot())
    assert cr.erreur.code == "introuvable" and "Navigateur indisponible" in cr.erreur.message
    await a.fermer()
    await a2.fermer()


async def test_lecture_de_l_appel_d_outil_en_flux(monkeypatch):
    async def flux(_modele, corps):
        assert corps["tool_choice"] == "required" and "temperature" not in corps
        assert [o["function"]["name"] for o in corps["tools"]] == ["commander", "refuser"]
        yield 'data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"name": "comm", "arguments": "{\\"comm"}}]}}]}\n\n'
        yield 'data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"name": "ander", "arguments": "andes\\": []}"}}]}}]}\n\n'

    monkeypatch.setattr(navigateur, "_flux", flux)
    assert await navigateur.appel_modele(ModeleLLM("openai", "m"))([]) == ("commander", {"commandes": []})
