"""Agent moyen 2 (B2) : extraction mot pour mot du texte destiné à l'affichage, envoi au navigateur, fin de
tâche, question d'ambiguïté. Modèle, registre et relais remplacés (aucun réseau, aucun quota)."""

import json

import httpx
import pytest

from app.affichage.protocole import LotNavigation
from app.agents.contrat import TacheArretee
from app.agents.navigation import moyen2
from app.agents.navigation.moyen2 import AgentMoyen2, journal, messages_extraction, mot_pour_mot, texte_pour_affichage
from app.config import ModeleLLM

PHRASE = "Oui, je veux que tu te focus sur le... sur le résultat de la limite monotone. Et résume-le."


def tache(**modifs):
    return {"id": 42, "utilisateur_id": "u1", "type_agent": "navigateur", "canal": "vocal", "demande_brute": PHRASE,
            "extrait": "focus sur le résultat de la limite monotone", "reformulation": "Afficher le théorème de la limite monotone",
            "contexte": {"derniers_echanges": [{"role": "utilisateur", "texte": "passe en 3D"},
                                               {"role": "atlas", "texte": "C'est lancé."}]}, **modifs}


def extracteur(*textes):
    appels: list[list[dict]] = []
    suite = list(textes)

    async def extraire(messages):
        appels.append(messages)
        valeur = suite.pop(0)
        if isinstance(valeur, Exception):
            raise valeur
        return valeur

    extraire.appels = appels  # type: ignore[attr-defined]
    return extraire


# ── extraction ───────────────────────────────────────────────────


def test_journal_et_verification_mot_pour_mot():
    assert journal(tache()) == ["passe en 3D", PHRASE]
    assert mot_pour_mot("je veux que tu te focus sur le résultat de la limite monotone", journal(tache())) is False
    assert mot_pour_mot("sur le résultat de la limite monotone", journal(tache())) is True
    # Plusieurs morceaux réunis (séparés par la ponctuation), accents et casse près.
    assert mot_pour_mot("te focus sur le... sur le RESULTAT de la limite monotone", journal(tache())) is True
    assert mot_pour_mot("affiche le théorème de la limite monotone", journal(tache())) is False
    m = messages_extraction(tache())
    assert "« passe en 3D »" in m[1]["content"] and "ne pas recopier" in m[1]["content"]


async def test_vocal_extrait_par_le_modele_si_mot_pour_mot():
    extraire = extracteur("te focus sur le... sur le résultat de la limite monotone.")
    assert await texte_pour_affichage(tache(), extraire) == "te focus sur le... sur le résultat de la limite monotone."


async def test_vocal_reformule_ou_panne_repli_sur_l_extrait_d_atlas():
    assert await texte_pour_affichage(tache(), extracteur("Montre le théorème de la limite monotone")) == \
        "focus sur le résultat de la limite monotone"
    assert await texte_pour_affichage(tache(), extracteur(RuntimeError("modèle injoignable"))) == \
        "focus sur le résultat de la limite monotone"
    assert await texte_pour_affichage(tache(extrait=None), extracteur("")) == PHRASE


async def test_texte_ecrit_transmis_tel_quel_sans_modele():
    extraire = extracteur()
    assert await texte_pour_affichage(tache(canal="texte"), extraire) == PHRASE
    assert extraire.appels == []


# ── traitement d'une tâche ───────────────────────────────────────


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
    """Relais simulé : répond aux lots avec les comptes rendus prévus."""

    def __init__(self, *erreurs):
        self.erreurs = list(erreurs)
        self.lots: list[dict] = []

    def __call__(self, requete: httpx.Request) -> httpx.Response:
        lot = json.loads(requete.content)
        self.lots.append(lot)
        cr = {"version": 1, "lot_id": lot["lot_id"], "ok": True, "resultats": [{"index": 0, "ok": True}]}
        if self.erreurs:
            code, message = self.erreurs.pop(0)
            cr = {"version": 1, "lot_id": lot["lot_id"], "ok": False, "resultats": [], "erreur": {"code": code, "message": message}}
        return httpx.Response(200, json=cr)


async def mener(t, relais, extraire=None, registre=None):
    registre = registre or RegistreFactice()
    async with httpx.AsyncClient(base_url="http://relais/api/affichage", transport=httpx.MockTransport(relais)) as http:
        await AgentMoyen2(registre, http, extraire or extracteur("sur le résultat de la limite monotone")).traiter(t)
    return registre


async def test_texte_brut_au_navigateur_puis_fin_de_tache():
    relais = Relais()
    registre = await mener(tache(), relais)
    assert registre.appels[0][:3] == ("terminer", 42, "C'est affiché.")
    lot = relais.lots[0]
    LotNavigation.model_validate(lot)
    assert lot["demande"] == "sur le résultat de la limite monotone" and lot["demande_brute"] == PHRASE
    assert lot["tache_id"] == 42 and lot["utilisateur_id"] == "u1" and "echanges" not in lot


async def test_question_du_navigateur_puis_reponse_transmise():
    relais = Relais(("ambigu", "Lequel veux-tu : « A » ou « B » ?"))
    registre = await mener(tache(), relais, registre=RegistreFactice(["le deuxième"]))
    assert [a[0] for a in registre.appels] == ["questionner", "terminer"]
    assert relais.lots[1]["demande"] == relais.lots[0]["demande"]
    assert relais.lots[1]["echanges"] == [{"question": "Lequel veux-tu : « A » ou « B » ?", "reponse": "le deuxième"}]
    assert relais.lots[0]["lot_id"] != relais.lots[1]["lot_id"]


async def test_erreurs_du_navigateur_transmises_et_arret():
    registre = await mener(tache(), Relais(("introuvable", "Je ne trouve pas « X » dans le graphe.")))
    assert registre.appels == [("echouer", 42, "Je ne trouve pas « X » dans le graphe.")]
    registre = await mener(tache(), Relais(("delai", "Pas de compte rendu en 15 s.")))
    assert registre.appels == [("echouer", 42, "L'écran n'a pas répondu.")]
    registre = await mener(tache(), Relais(("ambigu", "Lequel ?")), registre=RegistreFactice([]))
    assert [a[0] for a in registre.appels] == ["questionner"]


async def test_lecture_de_l_extraction_en_flux(monkeypatch):
    async def flux(_modele, corps):
        assert corps["tool_choice"] == "required" and corps["tools"][0]["function"]["name"] == "transmettre"
        yield 'data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": "{\\"texte\\": \\"passe"}}]}}]}\n\n'
        yield 'data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": " en 3D\\"}"}}]}}]}\n\n'

    monkeypatch.setattr(moyen2, "_flux", flux)
    assert await moyen2.extracteur_modele(ModeleLLM("openai", "m"))([]) == "passe en 3D"
    with pytest.raises(RuntimeError):
        await moyen2.extracteur_modele(None)([])
