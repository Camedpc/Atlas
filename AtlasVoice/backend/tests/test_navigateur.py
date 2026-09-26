"""Agent navigateur IA (B3) : sortie du modèle → LotCommandes validé, « revenir », refus, second essai, processus.
Le modèle, le relais et l'API Atlas sont simulés (aucun réseau, aucun quota)."""

import json
import uuid
from pathlib import Path

import httpx
import pytest

from app.affichage.protocole import EtatAffichage, LotNavigation
from app.agents.navigation import navigateur
from app.agents.navigation.navigateur import AgentNavigateur, Refus, construire_lot, deduire_type, verifier_resolutions
from app.config import ModeleLLM

PROTOCOLES = Path(__file__).resolve().parents[3] / "protocoles"
ETAT_EXEMPLE = json.loads((PROTOCOLES / "exemples" / "p4-etat-affichage" / "valides" / "initial.json").read_text("utf-8"))
CONV = "3f2b8c1e-6a4d-4e2f-9b7a-1c2d3e4f5a6b"


def n(id_, nom, **modifs):
    return {"id": id_, "nom": nom, "enonce": f"Énoncé de {nom}.", "admis": False, "enfants": [], "demonstrations": [],
            "conversation_id": None, "statut": "ouvert", **modifs}


NOEUDS = [n("lemme_compacite_faible", "Lemme de compacité faible"), n("lemme_compacite_forte", "Lemme de compacité forte"),
          n("thm_principal", "Convergence forte du schéma", statut="suspendu"), n("choix_jauge", "Choix de jauge")]
IDS = {x["id"] for x in NOEUDS}


def etat(**modifs) -> EtatAffichage:
    return EtatAffichage.model_validate({**ETAT_EXEMPLE, "ecran": "ecran_a", "utilisateur_id": "u1", "visibles": [],
                                         "version_donnees": "v1", **modifs})


def lot(*intentions) -> LotNavigation:
    return LotNavigation.model_validate({"version": 1, "lot_id": str(uuid.uuid4()), "tache_id": 7, "utilisateur_id": "u1",
                                         "intentions": list(intentions) or [{"intention": "tout_voir"}]})


# ── sortie du modèle → lot exécutable ────────────────────────────


def test_nettoie_les_champs_et_garde_lot_id_ecran():
    l = lot()
    sortie, restaures = construire_lot([
        {"op": "selectionner", "cible": {"noeud": "thm_principal"}, "facteur": None, "oui": True},
        {"op": "cadrer", "cibles": "selection"},
        {"op": "fiche"},  # cible absente : fermer la fiche
    ], l, etat(), [], IDS)
    assert restaures == 0 and sortie.lot_id == l.lot_id and sortie.ecran == "ecran_a" and sortie.tache_id == 7
    assert [c.model_dump(exclude_unset=True) for c in sortie.commandes] == [
        {"op": "selectionner", "cible": {"noeud": "thm_principal"}}, {"op": "cadrer", "cibles": "selection"},
        {"op": "fiche", "cible": None}]


def test_refuse_ids_inventes_et_commandes_invalides():
    with pytest.raises(ValueError, match="id de nœud inconnu"):
        construire_lot([{"op": "cadrer", "cibles": [{"noeud": "lemme_invente"}]}], lot(), etat(), [], IDS)
    with pytest.raises(ValueError, match="op inconnue"):
        construire_lot([{"op": "teleporter"}], lot(), etat(), [], IDS)
    with pytest.raises(ValueError, match="commande 0 \(zoomer\) : champs invalides"):
        construire_lot([{"op": "zoomer", "facteur": 0}], lot(), etat(), [], IDS)


def test_revenir_injecte_l_etat_de_la_pile():
    e0, e1 = etat(strategie="complet"), etat(strategie="roles_aux")
    sortie, restaures = construire_lot([{"op": "restaurer"}, {"op": "restaurer"}], lot(), etat(), [e0, e1], IDS)
    assert restaures == 2 and [c.etat.strategie for c in sortie.commandes] == ["roles_aux", "complet"]
    with pytest.raises(Refus) as r:
        construire_lot([{"op": "restaurer"}], lot(), etat(), [], IDS)
    assert r.value.code == "etat_invalide"


def test_id_seul_normalise_en_reference():
    sortie, _ = construire_lot([{"op": "selectionner", "cible": "thm_principal"},
                                {"op": "cadrer", "cibles": ["choix_jauge", CONV]}], lot(), etat(), [], IDS)
    assert sortie.commandes[0].cible.noeud == "thm_principal"
    assert [c.model_dump() for c in sortie.commandes[1].cibles] == [{"noeud": "choix_jauge"}, {"conversation": CONV}]


def test_cadrer_selection_en_liste_accepte():
    sortie, _ = construire_lot([{"op": "cadrer", "cibles": ["selection"]}], lot(), etat(), [], IDS)
    assert sortie.commandes[0].cibles == "selection"


def test_les_resolutions_decident_du_refus():
    noms = {x["id"]: x["nom"] for x in NOEUDS}
    verifier_resolutions([{"texte": "le théorème", "candidats": ["thm_principal"], "choisi": "thm_principal"}], IDS, noms)
    # Plusieurs candidats sans choix sûr : question, jamais de choix au hasard.
    with pytest.raises(Refus) as r:
        verifier_resolutions([{"texte": "le lemme", "candidats": ["lemme_compacite_faible", "lemme_compacite_forte"],
                               "choisi": None}], IDS, noms)
    assert r.value.code == "ambigu"
    assert r.value.message == "Lequel veux-tu : « Lemme de compacité faible » ou « Lemme de compacité forte » ?"
    # Aucun candidat : introuvable, même si le modèle a écrit des commandes.
    with pytest.raises(Refus) as r:
        verifier_resolutions([{"texte": "la conjecture de Riemann", "candidats": [], "choisi": None}], IDS, noms)
    assert (r.value.code, r.value.message) == ("introuvable", "Je ne trouve pas « la conjecture de Riemann » dans le graphe.")
    with pytest.raises(ValueError, match="id inconnu"):
        verifier_resolutions([{"texte": "x", "candidats": ["invente"], "choisi": "invente"}], IDS, noms)


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

    def __call__(self, requete: httpx.Request) -> httpx.Response:
        chemin = requete.url.path
        if chemin == "/api/affichage/utilisateurs/u1/etat":
            return httpx.Response(200, content=etat().model_dump_json(exclude_unset=True)) if self.avec_ecran \
                else httpx.Response(404)
        if chemin == "/api/graphe":
            return httpx.Response(200, json={"noeuds": NOEUDS, "aretes": []})
        if chemin == "/api/conversations":
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


LIGNEE = ("commander", {"commandes": [{"op": "selectionner", "cible": {"noeud": "thm_principal"}},
                                      {"op": "cadrer", "cibles": "selection"}]})


async def test_le_modele_resout_et_les_commandes_partent_avec_le_meme_lot_id():
    s, appeler = Serveurs(), modele(LIGNEE)
    a = agent(s, appeler)
    l = lot({"intention": "lignee", "quoi": {"texte": "le résultat principal sur la convergence"}})
    cr = await a.traiter(l)
    assert cr.ok and s.lots[0]["lot_id"] == l.lot_id and s.lots[0]["ecran"] == "ecran_a"
    assert len(a.piles["ecran_a"]) == 1
    # Le modèle reçoit les intentions, l'écran et les nœuds (avec type déduit et statut).
    entree = json.loads(appeler.recus[0][1]["content"])
    assert entree["intentions"][0]["quoi"]["texte"] == "le résultat principal sur la convergence"
    assert entree["etat"]["camera"]["mode"] == "2d" and "pile_profondeur" not in entree
    assert {"id": "thm_principal", "nom": "Convergence forte du schéma", "type": "theoreme", "statut": "suspendu",
            "enonce": "Énoncé de Convergence forte du schéma."} in entree["noeuds"]
    assert entree["conversations"] == []
    await a.fermer()


async def test_ambiguite_du_modele_devient_une_question():
    s = Serveurs()
    a = agent(s, modele(("refuser", {"code": "ambigu", "message": "lemme_compacite_faible ou lemme_compacite_forte ?",
                                     "candidats": ["lemme_compacite_faible", "lemme_compacite_forte"]})))
    cr = await a.traiter(lot({"intention": "montrer", "quoi": {"texte": "le lemme de compacité"}}))
    assert cr.erreur.code == "ambigu" and not s.lots
    # La question est reconstruite avec les noms, même si le modèle a cité les id.
    assert cr.erreur.message == "Lequel veux-tu : « Lemme de compacité faible » ou « Lemme de compacité forte » ?"
    assert s.reponses[0]["erreur"]["details"] == {"candidats": ["lemme_compacite_faible", "lemme_compacite_forte"]}
    await a.fermer()


async def test_second_essai_avec_l_erreur_puis_abandon():
    s = Serveurs()
    appeler = modele(("commander", {"commandes": [{"op": "cadrer", "cibles": [{"noeud": "invente"}]}]}), LIGNEE)
    a = agent(s, appeler)
    assert (await a.traiter(lot())).ok
    assert "id de nœud inconnu" in appeler.recus[1][-1]["content"]
    # Deux sorties inutilisables : refus lisible, rien n'est envoyé à l'écran.
    s2 = Serveurs()
    a2 = agent(s2, modele(("", {}), ("commander", {"commandes": []})))
    cr = await a2.traiter(lot())
    assert cr.erreur.code == "invalide" and not s2.lots
    await a.fermer()
    await a2.fermer()


async def test_revenir_depile_et_rien_a_annuler():
    s = Serveurs()
    a = agent(s, modele(LIGNEE, ("commander", {"commandes": [{"op": "restaurer"}]}), ("commander", {"commandes": [{"op": "restaurer"}]})))
    await a.traiter(lot())
    assert len(a.piles["ecran_a"]) == 1
    assert (await a.traiter(lot({"intention": "revenir"}))).ok
    assert s.lots[1]["commandes"][0]["op"] == "restaurer" and s.lots[1]["commandes"][0]["etat"]["ecran"] == "ecran_a"
    assert a.piles["ecran_a"] == []
    cr = await a.traiter(lot({"intention": "revenir"}))
    assert cr.erreur.code == "etat_invalide" and len(s.lots) == 2
    await a.fermer()


async def test_conversations_chargees_si_le_lot_en_parle():
    s, appeler = Serveurs(), modele(("commander", {"commandes": [{"op": "cadrer", "cibles": [{"conversation": CONV}]}]}))
    a = agent(s, appeler)
    assert (await a.traiter(lot({"intention": "montrer", "quoi": {"texte": "la conversation sur l'énergie"}}))).ok
    assert json.loads(appeler.recus[0][1]["content"])["conversations"] == [{"id": CONV, "titre": "Énergie"}]
    await a.fermer()


async def test_sans_ecran_ou_sans_modele():
    s = Serveurs(avec_ecran=False)
    a = agent(s, modele())
    assert (await a.traiter(lot())).erreur.code == "introuvable"
    a2 = AgentNavigateur("http://relais", "cle", "http://atlas", transport=httpx.MockTransport(Serveurs()),
                         appeler=navigateur.appel_modele(None))
    cr = await a2.traiter(lot())
    assert cr.erreur.code == "introuvable" and "Navigateur indisponible" in cr.erreur.message
    await a.fermer()
    await a2.fermer()


async def test_lecture_de_l_appel_d_outil_en_flux(monkeypatch):
    async def flux(_modele, corps):
        assert corps["tool_choice"] == "required"
        assert [o["function"]["name"] for o in corps["tools"]] == ["commander", "refuser"]
        yield 'data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"name": "comm", "arguments": "{\\"comm"}}]}}]}\n\n'
        yield 'data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"name": "ander", "arguments": "andes\\": []}"}}]}}]}\n\n'

    monkeypatch.setattr(navigateur, "_flux", flux)
    assert await navigateur.appel_modele(ModeleLLM("openai", "m"))([]) == ("commander", {"commandes": []})
