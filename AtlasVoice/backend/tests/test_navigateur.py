"""Agent navigateur (B3) : résolution, table intention → commandes, pile « revenir », processus (sans réseau)."""

import json
import uuid
from pathlib import Path

import httpx
import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from app.affichage.protocole import EtatAffichage, ErreurProtocole, LotNavigation
from app.agents.navigation.navigateur import AgentNavigateur
from app.agents.navigation.resolution import Donnees, deduire_type, normaliser
from app.agents.navigation.traduction import TAILLE_PILE, Traduction, mettre_a_jour_pile, traduire

PROTOCOLES = Path(__file__).resolve().parents[3] / "protocoles"
SCHEMAS = [json.loads(f.read_text("utf-8")) for f in PROTOCOLES.glob("*.schema.json")]
REGISTRE = Registry().with_resources((s["$id"], Resource.from_contents(s)) for s in SCHEMAS)
SCHEMA_LOT = next(s for s in SCHEMAS if s["$id"].endswith("p3-lot-commandes.schema.json"))
ETAT_EXEMPLE = json.loads((PROTOCOLES / "exemples" / "p4-etat-affichage" / "valides" / "initial.json").read_text("utf-8"))

CONV_ENERGIE = "3f2b8c1e-6a4d-4e2f-9b7a-1c2d3e4f5a6b"
CONV_SUITES = "11111111-2222-4333-8444-555555555555"


def n(id_, nom, enonce="", admis=False, enfants=(), demonstrations=(), conversation=None):
    return {"id": id_, "nom": nom, "enonce": enonce, "admis": admis, "enfants": list(enfants),
            "demonstrations": list(demonstrations), "conversation_id": conversation}


NOEUDS = [
    n("def_compacite", "Compacité", "Tout recouvrement ouvert admet un sous-recouvrement fini.", admis=True),
    n("lemme_compacite_faible", "Lemme de compacité faible", "Suites bornées : sous-suite faiblement convergente.",
      enfants=["thm_principal"], demonstrations=[{}]),
    n("lemme_compacite_forte", "Lemme de compacité forte", "Injection compacte de Rellich.", enfants=["thm_principal"],
      demonstrations=[{}]),
    n("lemme_gronwall", "Lemme de Grönwall", "Inégalité intégrale.", admis=True, enfants=["thm_principal"]),
    n("thm_gronwall_discret", "Théorème de Grönwall discret", "Version discrète."),
    n("thm_principal", "Convergence forte du schéma", "Le schéma converge à l'ordre 1/2.", demonstrations=[{}],
      conversation=CONV_ENERGIE),
    n("choix_jauge", "Choix de jauge", "On fixe la jauge de Coulomb.", enfants=["thm_principal"],
      conversation=CONV_ENERGIE),
]
CONVERSATIONS = [{"id": CONV_ENERGIE, "titre": "Conservation de l'énergie"},
                 {"id": CONV_SUITES, "titre": "Suites monotones et bornées"}]
DONNEES = Donnees(NOEUDS, CONVERSATIONS)


def etat(**modifs) -> EtatAffichage:
    return EtatAffichage.model_validate({**ETAT_EXEMPLE, "ecran": "ecran_a", "utilisateur_id": "u1",
                                         "visibles": [], **modifs})


def lot(*intentions) -> LotNavigation:
    return LotNavigation.model_validate({"version": 1, "lot_id": str(uuid.uuid4()), "tache_id": 7,
                                         "utilisateur_id": "u1", "intentions": list(intentions)})


def commandes(*intentions, e=None, pile=None) -> list[dict]:
    t = traduire(lot(*intentions), DONNEES, e or etat(), pile or [])
    assert isinstance(t, Traduction), t
    brut = json.loads(t.lot.model_dump_json(exclude_unset=True))
    erreurs = list(Draft202012Validator(SCHEMA_LOT, registry=REGISTRE).iter_errors(brut))
    assert not erreurs, [x.message for x in erreurs]
    return brut["commandes"]


def erreur(*intentions, e=None, pile=None) -> ErreurProtocole:
    t = traduire(lot(*intentions), DONNEES, e or etat(), pile or [])
    assert isinstance(t, ErreurProtocole), t
    return t


def montrer(texte, **d):
    return {"intention": "montrer", "quoi": {"texte": texte, **d}}


# ── résolution ───────────────────────────────────────────────────


def test_normalisation_et_types():
    assert normaliser("  Lemme de Grönwall — l'inégalité ") == "lemme de gronwall l inegalite"
    assert deduire_type(NOEUDS[0]) == "definition"
    assert deduire_type(n("x", "x", demonstrations=[{}])) == "resultat"
    assert deduire_type(n("x", "x", enfants=["y"])) == "assertion"


def test_nom_exact_accents_et_indice_de_type():
    assert commandes(montrer("la convergence forte du schéma"))[0]["cibles"] == [{"noeud": "thm_principal"}]
    # « lemme » oriente vers le lemme, « théorème » vers le théorème, malgré le même nom propre.
    assert commandes(montrer("le lemme de Gronwall"))[0]["cibles"] == [{"noeud": "lemme_gronwall"}]
    assert commandes(montrer("le théorème de Grönwall"))[0]["cibles"] == [{"noeud": "thm_gronwall_discret"}]
    assert commandes(montrer("la jauge", type="choix_modelisation"))[0]["cibles"] == [{"noeud": "choix_jauge"}]
    # Recherche dans l'énoncé.
    assert commandes(montrer("injection compacte de Rellich"))[0]["cibles"] == [{"noeud": "lemme_compacite_forte"}]


def test_ambiguite_donne_une_question_jamais_un_choix():
    e = erreur(montrer("le lemme de compacité"))
    assert e.code == "ambigu"
    assert e.message == "Lequel veux-tu : « Lemme de compacité faible » ou « Lemme de compacité forte » ?"
    assert e.details == {"candidats": ["lemme_compacite_faible", "lemme_compacite_forte"]}
    assert commandes(montrer("le lemme de compacité forte"))[0]["cibles"] == [{"noeud": "lemme_compacite_forte"}]
    # À l'écran, un seul des deux ne suffit pas à trancher (écart trop faible) : on demande toujours.
    visible = etat(visibles=[{"noeud": "lemme_compacite_faible", "libelle": "x", "x": 1, "y": 1}])
    assert erreur(montrer("le lemme de compacité"), e=visible).code == "ambigu"


def test_introuvable():
    assert erreur(montrer("la conjecture de Riemann")).code == "introuvable"


def test_deictiques():
    sel = etat(selection={"noeud": "choix_jauge"})
    assert commandes({"intention": "detailler", "quoi": {"texte": "celui-là", "deictique": "selection"}}, e=sel) == [
        {"op": "selectionner", "cible": {"noeud": "choix_jauge"}}, {"op": "fiche", "cible": {"noeud": "choix_jauge"}}]
    assert erreur(montrer("celui-là", deictique="selection")).code == "etat_invalide"
    survol = etat(survol={"noeud": "lemme_gronwall"})
    assert commandes(montrer("ça", deictique="survol"), e=survol)[0]["cibles"] == [{"noeud": "lemme_gronwall"}]
    avant = etat(selection={"noeud": "thm_principal"})
    assert commandes(montrer("celui d'avant", deictique="precedent"), pile=[avant])[0]["cibles"] == [
        {"noeud": "thm_principal"}]
    disparu = etat(selection={"noeud": "supprime"})
    assert erreur(montrer("celui-là", deictique="selection"), e=disparu).code == "introuvable"


def test_conversations():
    ouverte = etat(conversation_affichee=CONV_SUITES)
    assert commandes(montrer("cette conversation", genre="conversation"), e=ouverte)[0]["cibles"] == [
        {"conversation": CONV_SUITES}]
    assert commandes(montrer("la conversation sur l'énergie"))[0]["cibles"] == [{"conversation": CONV_ENERGIE}]
    assert erreur(montrer("la conversation sur les fluides")).code == "introuvable"
    assert erreur(montrer("cette conversation", genre="conversation"), e=etat(conversation_affichee=None)).code == \
        "etat_invalide"
    # Une conversation n'a pas de lignée.
    assert erreur({"intention": "lignee", "quoi": {"texte": "la conversation sur l'énergie"}}).code == "invalide"


# ── table intention → commandes ──────────────────────────────────


def test_table_des_intentions():
    q = {"texte": "choix de jauge"}
    c = {"noeud": "choix_jauge"}
    assert commandes({"intention": "montrer", "quoi": q}) == [{"op": "cadrer", "cibles": [c]}, {"op": "surligner", "cibles": [c]}]
    assert commandes({"intention": "lignee", "quoi": q}) == [{"op": "selectionner", "cible": c},
                                                              {"op": "cadrer", "cibles": "selection"}]
    assert commandes({"intention": "portee", "quoi": q}) == [{"op": "portee", "cible": c},
                                                              {"op": "cadrer", "cibles": "selection"}]
    assert commandes({"intention": "liens_complets", "oui": True}) == [{"op": "liens_complets", "oui": True}]
    assert commandes({"intention": "effacer_filtres"}) == [{"op": "effacer_filtres"}]
    assert commandes({"intention": "effacer_selection"}) == [
        {"op": "selectionner", "cible": None}, {"op": "surligner", "cibles": []}, {"op": "fiche", "cible": None}]
    assert commandes({"intention": "tout_voir"}) == [
        {"op": "effacer_filtres"}, {"op": "selectionner", "cible": None}, {"op": "cadrer", "cibles": "tout"}]


def test_niveaux_de_detail():
    strat = lambda niveau, s="defaut": commandes({"intention": "niveau_de_detail", "niveau": niveau}, e=etat(strategie=s))  # noqa: E731
    assert strat("essentiel", "complet") == [{"op": "strategie", "id": "defaut"}]
    assert strat("normal") == [{"op": "strategie", "id": "roles_aux"}]
    assert strat("complet") == [{"op": "strategie", "id": "complet"}]
    assert strat("plus") == [{"op": "strategie", "id": "roles_aux"}]
    assert strat("plus", "roles_aux") == [{"op": "strategie", "id": "complet"}]
    assert strat("plus", "complet") == [{"op": "strategie", "id": "complet"}]
    assert strat("moins", "defaut") == [{"op": "strategie", "id": "defaut"}]
    assert strat("moins", "chaines") == [{"op": "strategie", "id": "defaut"}]
    # Deux crans dans le même lot.
    assert commandes({"intention": "niveau_de_detail", "niveau": "plus"},
                     {"intention": "niveau_de_detail", "niveau": "plus"}) == [
        {"op": "strategie", "id": "roles_aux"}, {"op": "strategie", "id": "complet"}]


def test_points_de_vue():
    pv = lambda mode, vue=None: commandes({"intention": "point_de_vue", "mode": mode, **({"vue": vue} if vue else {})})  # noqa: E731
    assert pv("2d") == [{"op": "mode", "mode": "2d"}]
    assert pv("3d", "cote") == [{"op": "mode", "mode": "3d"}]
    assert pv("3d", "iso") == [{"op": "mode", "mode": "3d"}, {"op": "vue", "nom": "iso"}]
    assert pv("3d", "face") == [{"op": "mode", "mode": "3d"}, {"op": "vue", "nom": "face"}]


def test_filtrer():
    assert commandes({"intention": "filtrer", "action": "masquer", "criteres": {
        "conversation": {"texte": "la conversation sur l'énergie", "genre": "conversation"},
        "statuts": ["suspendu"], "periode": {"debut": "2026-08-01"}, "texte": "jauge"}}) == [
        {"op": "filtres", "patch": {"conversation": CONV_ENERGIE, "statuts": ["suspendu"],
                                    "periode": {"debut": "2026-08-01", "fin": None}, "texte": "jauge", "mode": "masquer"}}]


def test_revenir_et_pile():
    e0, e1 = etat(strategie="complet"), etat(strategie="roles_aux")
    t = traduire(lot({"intention": "revenir"}), DONNEES, etat(), [e0, e1])
    assert isinstance(t, Traduction) and t.depiler == 1 and not t.empiler
    assert t.lot.commandes[0].op == "restaurer" and t.lot.commandes[0].etat.strategie == "roles_aux"
    assert erreur({"intention": "revenir"}).code == "etat_invalide"
    # « revenir » deux fois dans le même lot remonte de deux crans.
    t2 = traduire(lot({"intention": "revenir"}, {"intention": "revenir"}), DONNEES, etat(), [e0, e1])
    assert [c.etat.strategie for c in t2.lot.commandes] == ["roles_aux", "complet"] and t2.depiler == 2

    pile = [e0, e1]
    mettre_a_jour_pile(pile, t, etat())
    assert pile == [e0]
    avant = etat(strategie="chaines")
    mettre_a_jour_pile(pile, traduire(lot({"intention": "tout_voir"}), DONNEES, etat(), pile), avant)
    assert pile == [e0, avant]
    for _ in range(30):
        mettre_a_jour_pile(pile, traduire(lot({"intention": "tout_voir"}), DONNEES, etat(), pile), avant)
    assert len(pile) == TAILLE_PILE


def test_sans_ecran_et_determinisme():
    t = traduire(lot(montrer("choix de jauge")), DONNEES, None, [])
    assert isinstance(t, ErreurProtocole) and t.code == "introuvable"
    l = lot(montrer("choix de jauge"), {"intention": "niveau_de_detail", "niveau": "plus"})
    a, b = traduire(l, DONNEES, etat(), []), traduire(l, DONNEES, etat(), [])
    assert a.lot.model_dump(exclude={"emis_le"}) == b.lot.model_dump(exclude={"emis_le"})
    assert a.lot.lot_id == l.lot_id and a.lot.ecran == "ecran_a" and a.lot.tache_id == 7


# ── processus (relais et API Atlas simulés) ──────────────────────


class Serveurs:
    def __init__(self, avec_ecran=True, ok=True):
        self.avec_ecran, self.ok = avec_ecran, ok
        self.lots: list[dict] = []
        self.reponses: list[dict] = []
        self.lectures_graphe = 0

    def __call__(self, requete: httpx.Request) -> httpx.Response:
        chemin = requete.url.path
        if chemin == "/api/affichage/utilisateurs/u1/etat":
            if not self.avec_ecran:
                return httpx.Response(404)
            return httpx.Response(200, content=etat(version_donnees="v1").model_dump_json(exclude_unset=True))
        if chemin == "/api/graphe":
            self.lectures_graphe += 1
            return httpx.Response(200, json={"noeuds": NOEUDS, "aretes": []})
        if chemin == "/api/conversations":
            return httpx.Response(200, json=CONVERSATIONS)
        if chemin == "/api/affichage/commandes":
            corps = json.loads(requete.content)
            self.lots.append(corps)
            cr = {"version": 1, "lot_id": corps["lot_id"], "ok": self.ok, "resultats": [],
                  "etat": json.loads(etat(strategie="complet").model_dump_json(exclude_unset=True))}
            return httpx.Response(200, json=cr)
        if chemin.startswith("/api/affichage/intentions/") and chemin.endswith("/compte-rendu"):
            self.reponses.append(json.loads(requete.content))
            return httpx.Response(204)
        return httpx.Response(500, text=f"inattendu : {chemin}")


@pytest.fixture
def serveurs():
    return Serveurs()


async def test_processus_pousse_les_commandes_avec_le_meme_lot_id(serveurs):
    agent = AgentNavigateur("http://relais", "cle", "http://atlas", transport=httpx.MockTransport(serveurs))
    l = lot({"intention": "lignee", "quoi": {"texte": "choix de jauge"}})
    cr = await agent.traiter(l)
    assert cr.ok and serveurs.lots[0]["lot_id"] == l.lot_id and serveurs.lots[0]["ecran"] == "ecran_a"
    assert serveurs.lots[0]["origine"] == "navigateur" and serveurs.lots[0]["tache_id"] == 7
    assert len(agent.piles["ecran_a"]) == 1  # état d'avant le lot, pour « revenir »
    # Même version des données : le graphe n'est pas relu.
    await agent.traiter(lot(montrer("choix de jauge")))
    assert serveurs.lectures_graphe == 1
    await agent.fermer()


async def test_processus_repond_directement_en_cas_d_ambiguite(serveurs):
    agent = AgentNavigateur("http://relais", "cle", "http://atlas", transport=httpx.MockTransport(serveurs))
    l = lot(montrer("le lemme de compacité"))
    cr = await agent.traiter(l)
    assert not cr.ok and cr.erreur.code == "ambigu"
    assert not serveurs.lots
    assert serveurs.reponses[0]["lot_id"] == l.lot_id and serveurs.reponses[0]["erreur"]["code"] == "ambigu"
    assert serveurs.reponses[0]["etat"]["ecran"] == "ecran_a"
    await agent.fermer()


async def test_processus_sans_ecran_et_echec_de_l_ecran():
    s = Serveurs(avec_ecran=False)
    agent = AgentNavigateur("http://relais", "cle", "http://atlas", transport=httpx.MockTransport(s))
    cr = await agent.traiter(lot(montrer("choix de jauge")))
    assert cr.erreur.code == "introuvable" and "etat" not in s.reponses[0]
    await agent.fermer()
    s = Serveurs(ok=False)
    agent = AgentNavigateur("http://relais", "cle", "http://atlas", transport=httpx.MockTransport(s))
    await agent.traiter(lot(montrer("choix de jauge")))
    assert agent.piles["ecran_a"] == []  # lot refusé par l'écran : rien à annuler
    await agent.fermer()
