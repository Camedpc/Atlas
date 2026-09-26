"""Agent moyen 2 (B2) : tâche `navigateur` → LotNavigation → compte rendu → fin de tâche. Modèle, registre
et relais remplacés (aucun réseau, aucun quota)."""

import dataclasses
import json

import httpx
import pytest

from app.affichage.protocole import LotNavigation
from app.agents.contrat import TacheArretee
from app.agents.navigation import moyen2
from app.agents.navigation.moyen2 import AgentMoyen2, EntreePlan, Plan, lot_depuis, messages_plan
from app.config import ModeleLLM

FILTRES = {"conversation": None, "statuts": [], "types": [], "periode": {"debut": None, "fin": None}, "texte": "",
           "mode": "masquer"}
AFFICHAGE = {"ecran": "ecran_a", "strategie": "defaut", "selection": {"noeud": "lemme_a"}, "filtres": FILTRES,
             "conversation_affichee": None, "mode": "2d", "visibles": [{"libelle": "Lemme A"}]}


def tache(**modifs):
    return {"id": 42, "utilisateur_id": "u1", "type_agent": "navigateur",
            "demande_brute": "montre la lignée du lemme de compacité et résume-le",
            "extrait": "montre la lignée du lemme de compacité", "contexte": {"affichage": AFFICHAGE}, **modifs}


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


class Relais:
    """Relais simulé : répond aux lots d'intentions avec les comptes rendus prévus."""

    def __init__(self, *erreurs):
        self.erreurs = list(erreurs)
        self.lots: list[dict] = []

    def __call__(self, requete: httpx.Request) -> httpx.Response:
        lot = json.loads(requete.content)
        self.lots.append(lot)
        cr = {"version": 1, "lot_id": lot["lot_id"], "ok": True, "resultats": [{"index": 0, "ok": True}]}
        if self.erreurs:
            code, message = self.erreurs.pop(0)
            cr = {"version": 1, "lot_id": lot["lot_id"], "ok": False, "resultats": [],
                  "erreur": {"code": code, "message": message}}
        return httpx.Response(200, json=cr)


def planificateur(*plans):
    entrees: list[EntreePlan] = []
    suite = list(plans)

    async def planifier(e: EntreePlan) -> Plan:
        entrees.append(dataclasses.replace(e, echanges=list(e.echanges)))
        return suite.pop(0)

    planifier.entrees = entrees  # type: ignore[attr-defined]
    return planifier


async def mener(t, relais, planifier, registre=None):
    registre = registre or RegistreFactice()
    async with httpx.AsyncClient(base_url="http://relais/api/affichage", transport=httpx.MockTransport(relais)) as http:
        await AgentMoyen2(registre, http, planifier).traiter(t)
    return registre


LIGNEE = [{"intention": "lignee", "quoi": {"texte": "le lemme de compacité", "type": "lemme"}}]


async def test_affiche_puis_termine():
    relais, planifier = Relais(), planificateur(Plan(LIGNEE))
    registre = await mener(tache(), relais, planifier)
    assert registre.appels[0][:3] == ("terminer", 42, "C'est affiché.")
    lot = relais.lots[0]
    assert lot["tache_id"] == 42 and lot["utilisateur_id"] == "u1" and lot["intentions"] == LIGNEE
    LotNavigation.model_validate(lot)
    # Le modèle reçoit l'extrait (pas toute la phrase) et l'écran.
    e = planifier.entrees[0]
    assert e.extrait == "montre la lignée du lemme de compacité" and e.ecran.visibles[0].libelle == "Lemme A"


async def test_rien_a_afficher_fait_echouer_avec_la_raison():
    registre = await mener(tache(), Relais(), planificateur(Plan(None, "C'est une question pour l'explorateur.")))
    assert registre.appels == [("echouer", 42, "C'est une question pour l'explorateur.")]


async def test_ambiguite_question_puis_reprise_avec_la_reponse():
    relais = Relais(("ambigu", "Lequel veux-tu : « Lemme faible » ou « Lemme fort » ?"))
    planifier = planificateur(Plan(LIGNEE), Plan([{"intention": "lignee", "quoi": {"texte": "le lemme fort"}}]))
    registre = await mener(tache(), relais, planifier, RegistreFactice(["le fort"]))
    assert [a[0] for a in registre.appels] == ["questionner", "terminer"]
    assert registre.appels[0][2] == "Lequel veux-tu : « Lemme faible » ou « Lemme fort » ?"
    assert planifier.entrees[1].echanges == [("Lequel veux-tu : « Lemme faible » ou « Lemme fort » ?", "le fort")]
    assert len(relais.lots) == 2 and relais.lots[0]["lot_id"] != relais.lots[1]["lot_id"]


async def test_erreurs_lisibles_et_arret():
    registre = await mener(tache(), Relais(("introuvable", "Je ne trouve pas « X » dans le graphe.")), planificateur(Plan(LIGNEE)))
    assert registre.appels == [("echouer", 42, "Je ne trouve pas « X » dans le graphe.")]
    registre = await mener(tache(), Relais(("delai", "Pas de compte rendu en 3 s.")), planificateur(Plan(LIGNEE)))
    assert registre.appels == [("echouer", 42, "L'écran n'a pas répondu.")]
    # Hors vocabulaire : aucun lot envoyé.
    relais = Relais()
    registre = await mener(tache(), relais, planificateur(Plan([{"intention": "danser"}])))
    assert registre.appels == [("echouer", 42, "Je n'ai pas compris quoi afficher.")] and not relais.lots
    # L'utilisateur arrête pendant la question : rien d'autre n'est écrit.
    registre = await mener(tache(), Relais(("ambigu", "Lequel ?")), planificateur(Plan(LIGNEE)), RegistreFactice([]))
    assert [a[0] for a in registre.appels] == ["questionner"]


async def test_sans_extrait_ni_ecran():
    planifier = planificateur(Plan([{"intention": "tout_voir"}]))
    await mener(tache(extrait=None, contexte={}), Relais(), planifier)
    assert planifier.entrees[0].extrait == tache()["demande_brute"] and planifier.entrees[0].ecran is None


def test_lot_retire_les_champs_vides_du_modele():
    lot = lot_depuis([{"intention": "montrer", "quoi": {"texte": "le théorème", "genre": None, "type": ""},
                       "niveau": None, "criteres": {}}], tache())
    assert lot.intentions[0].model_dump(exclude_unset=True) == {"intention": "montrer", "quoi": {"texte": "le théorème"}}


def test_messages_du_modele():
    e = EntreePlan("montre ça", "euh montre ça", None, [("Lequel ?", "le premier")], aujourd_hui="2026-09-27")
    m = messages_plan(e)
    assert m[0]["role"] == "system" and "vocabulaire fermé" in m[0]["content"]
    assert "Date du jour : 2026-09-27." in m[1]["content"] and "Aucun écran du graphe n'est ouvert." in m[1]["content"]
    assert "Extrait à traiter : « montre ça »" in m[1]["content"] and "Réponse de l'utilisateur : « le premier »" in m[1]["content"]


async def test_lecture_de_l_appel_d_outil_en_flux(monkeypatch):
    morceaux = [
        {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"name": "navi", "arguments": '{"inten'}}]}}]},
        {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"name": "guer",
                                                                           "arguments": 'tions": [{"intention": "tout_voir"}]}'}}]}}]},
    ]

    async def flux(_modele, corps):
        assert corps["tool_choice"] == "required" and [o["function"]["name"] for o in corps["tools"]] == [
            "naviguer", "rien_a_afficher"]
        for m in morceaux:
            yield f"data: {json.dumps(m)}\n\n"
        yield "data: [DONE]\n\n"

    monkeypatch.setattr(moyen2, "_flux", flux)
    planifier = moyen2.planificateur_modele(ModeleLLM("openai", "petit-modele"))
    plan = await planifier(EntreePlan("tout voir", "tout voir", None))
    assert plan.intentions == [{"intention": "tout_voir"}]


async def test_modele_qui_repond_sans_outil(monkeypatch):
    appels = []

    async def flux(_modele, corps):
        appels.append(len(corps["messages"]))
        yield 'data: {"choices": [{"delta": {"content": "Bien sûr !"}}]}\n\n'

    monkeypatch.setattr(moyen2, "_flux", flux)
    plan = await moyen2.planificateur_modele(ModeleLLM("anthropic", "haiku"))(EntreePlan("x", "x", None))
    assert plan.intentions is None and appels == [2, 3]  # un second essai avec rappel de la consigne
    with pytest.raises(RuntimeError):
        await moyen2.planificateur_modele(None)(EntreePlan("x", "x", None))


async def test_la_reformulation_d_atlas_accompagne_une_transcription_coupee():
    planifier = planificateur(Plan(LIGNEE))
    await mener(tache(demande_brute="monotone.", extrait="monotone.", reformulation="Focus sur le résultat de la limite monotone"),
                Relais(), planifier)
    e = planifier.entrees[0]
    assert e.reformulation == "Focus sur le résultat de la limite monotone"
    assert "Ce qu'Atlas a compris : « Focus sur le résultat de la limite monotone »" in messages_plan(e)[1]["content"]
