from app.registre.modele import Contexte, ModificationProposee, Statut
from app.voix.outils import DEFINITIONS, NOMS, Outils

from .conftest import nouvelle


def outils(registre, utilisateur="u1"):
    return Outils(registre, utilisateur, lambda: Contexte(graphe_actif="energie",
                                                          derniers_echanges=[{"role": "utilisateur", "texte": "…"}]))


def test_six_outils():
    assert NOMS == ["lancer_tache", "etat_taches", "lire_resultat", "repondre_agent", "confirmer", "annuler"]
    for d in DEFINITIONS:
        assert d["parameters"]["type"] == "object"


async def test_lancer_tache_attache_phrase_brute_et_contexte(registre):
    exe = await outils(registre).executer(
        "lancer_tache",
        {"type_agent": "explorateur", "titre": "résumé du graphe Énergie", "reformulation": "Résumer le graphe."},
        demande_brute="Hey Atlas, fais-moi un résumé de ce graphe",
    )
    assert exe.ok and exe.a_suivre is not None
    tache = await registre.tache_de("u1", exe.a_suivre.id)
    assert tache.demande_brute == "Hey Atlas, fais-moi un résumé de ce graphe"
    assert tache.contexte.graphe_actif == "energie"
    assert tache.contexte.derniers_echanges
    assert exe.resultat["tache"]["statut"] == "en_attente"
    assert "consigne" in exe.resultat


async def test_lancer_tache_type_inconnu(registre):
    exe = await outils(registre).executer(
        "lancer_tache", {"type_agent": "magicien", "titre": "x", "reformulation": "y"}, "z")
    assert not exe.ok and exe.resultat["erreur"] == "invalide"


async def test_etat_taches_sans_tache(registre):
    exe = await outils(registre).executer("etat_taches", {}, "")
    assert exe.resultat["taches"] == []


async def test_etat_taches_ne_montre_que_les_siennes(registre):
    await nouvelle(registre, utilisateur="u1", titre="mienne")
    await nouvelle(registre, utilisateur="u2", titre="autre")
    exe = await outils(registre).executer("etat_taches", {}, "")
    assert [t["titre"] for t in exe.resultat["taches"]] == ["mienne"]


async def test_lire_resultat(registre):
    tache = await nouvelle(registre)
    await registre.prendre(["explorateur"])
    await registre.terminer(tache.id, "Le graphe compte douze étapes.")
    exe = await outils(registre).executer("lire_resultat", {}, "redis-moi")
    assert exe.resultat["tache"]["resultat_oral"] == "Le graphe compte douze étapes."
    assert "avertissement" in exe.resultat


async def test_repondre_agent_suit_la_tache(registre):
    tache = await nouvelle(registre)
    await registre.prendre(["explorateur"])
    await registre.questionner(tache.id, "Lequel ?")
    exe = await outils(registre).executer("repondre_agent", {"reponse": "Énergie"}, "Énergie")
    assert exe.ok and exe.a_suivre.id == tache.id


async def test_confirmer_oui_suit_la_tache(registre):
    tache = await nouvelle(registre, type_agent="editeur_graphe")
    await registre.prendre(["editeur_graphe"])
    await registre.proposer(tache.id, ModificationProposee(description_orale="J'ajoute une étape."))
    exe = await outils(registre).executer("confirmer", {"tache_id": str(tache.id), "decision": "oui"}, "vas-y")
    assert exe.ok and exe.a_suivre.id == tache.id


async def test_annuler_revenir(registre):
    tache = await nouvelle(registre, type_agent="editeur_graphe")
    await registre.prendre(["editeur_graphe"])
    await registre.proposer(tache.id, ModificationProposee(description_orale="J'ajoute une étape."))
    await registre.confirmer("u1", tache.id, "oui")
    await registre.terminer(tache.id, "C'est fait.", modification_appliquee=True)
    exe = await outils(registre).executer("annuler", {"mode": "revenir"}, "annule ça")
    assert exe.ok and exe.a_suivre.nature == "retour_arriere"


async def test_annuler_arreter_ambigu(registre):
    await nouvelle(registre, titre="a")
    await nouvelle(registre, titre="b")
    exe = await outils(registre).executer("annuler", {"mode": "arreter"}, "arrête")
    assert not exe.ok and exe.resultat["erreur"] == "ambigu"
    assert len(exe.resultat["taches_possibles"]) == 2


async def test_tache_id_invalide(registre):
    exe = await outils(registre).executer("etat_taches", {"tache_id": "celle-là"}, "")
    assert not exe.ok


async def test_confirmer_non_sans_correction(registre):
    tache = await nouvelle(registre, type_agent="editeur_graphe")
    await registre.prendre(["editeur_graphe"])
    await registre.proposer(tache.id, ModificationProposee(description_orale="…"))
    exe = await outils(registre).executer("confirmer", {"decision": "non"}, "non")
    assert exe.a_suivre is None
    assert (await registre.tache_de("u1", tache.id)).statut == Statut.ANNULEE
