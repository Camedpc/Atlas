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


# ── P1 : navigation et découpage de la demande ───────────────────

DEUX_DEMANDES = "Montre-moi la lignée du lemme de compacité, et résume la conversation sur l'énergie."


async def lancer(registre, extrait, type_agent="navigateur"):
    args = {"type_agent": type_agent, "titre": "lignée du lemme", "reformulation": "Afficher la lignée."}
    if extrait is not None:
        args["extrait"] = extrait
    exe = await outils(registre).executer("lancer_tache", args, demande_brute=DEUX_DEMANDES)
    assert exe.ok, exe.resultat
    return await registre.tache_de("u1", exe.a_suivre.id)


async def test_type_navigateur_et_extrait_valide(registre):
    t = await lancer(registre, "montre-moi la lignée du lemme de compacite")
    assert t.type_agent == "navigateur"
    # Casse, accents et ponctuation près : l'extrait de l'utilisateur est gardé tel quel.
    assert t.extrait == "montre-moi la lignée du lemme de compacite"
    assert t.demande_brute == DEUX_DEMANDES
    t2 = await lancer(registre, "résume la conversation sur l'énergie", type_agent="explorateur")
    assert t2.extrait == "résume la conversation sur l'énergie"


async def test_extrait_invente_ou_absent_remplace_par_la_demande(registre):
    assert (await lancer(registre, "affiche le théorème principal")).extrait == DEUX_DEMANDES
    assert (await lancer(registre, None)).extrait == DEUX_DEMANDES
    assert (await lancer(registre, "   ")).extrait == DEUX_DEMANDES


def test_definition_de_lancer_tache():
    lancer_tache = next(d for d in DEFINITIONS if d["name"] == "lancer_tache")
    proprietes = lancer_tache["parameters"]["properties"]
    assert "navigateur" in proprietes["type_agent"]["enum"]
    assert "extrait" in lancer_tache["parameters"]["required"]
