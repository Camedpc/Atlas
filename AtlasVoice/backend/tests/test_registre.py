import asyncio
from datetime import timedelta

import pytest

from app.registre.modele import ModificationProposee, Statut
from app.registre.service import ErreurRegistre

from .conftest import nouvelle


async def test_cycle_complet_explorateur(registre):
    tache = await nouvelle(registre)
    assert tache.statut == Statut.EN_ATTENTE
    assert tache.demande_brute == "fais-moi un résumé de ce graphe"

    prise = await registre.prendre(["explorateur"])
    assert prise.id == tache.id and prise.statut == Statut.EN_COURS
    assert await registre.prendre(["explorateur"]) is None

    await registre.avancer(tache.id, "Lecture des étapes", 40)
    fin = await registre.terminer(tache.id, "Le graphe compte douze étapes.", {"etapes": 12})
    assert fin.statut == Statut.TERMINEE
    assert fin.annoncee is False
    assert fin.termine_le is not None
    assert (await registre.dernier_resultat("u1", None)).id == tache.id


async def test_les_taches_sont_privees(registre):
    tache = await nouvelle(registre, utilisateur="u1")
    with pytest.raises(ErreurRegistre) as e:
        await registre.tache_de("u2", tache.id)
    assert e.value.code == "introuvable"


async def test_question_puis_reponse(registre):
    tache = await nouvelle(registre)
    await registre.prendre(["explorateur"])
    await registre.questionner(tache.id, "Quel graphe : Énergie ou Dérivée ?")
    maj = await registre.repondre("u1", None, "Énergie")
    assert maj.statut == Statut.EN_COURS and maj.reponse == "Énergie"


async def test_reponse_ambigue_si_plusieurs_questions(registre):
    t1 = await nouvelle(registre, titre="a")
    t2 = await nouvelle(registre, titre="b")
    await registre.prendre(["explorateur"])
    await registre.prendre(["explorateur"])
    await registre.questionner(t1.id, "?")
    await registre.questionner(t2.id, "?")
    with pytest.raises(ErreurRegistre) as e:
        await registre.repondre("u1", None, "oui")
    assert e.value.code == "ambigu"
    assert {t.id for t in e.value.candidates} == {t1.id, t2.id}
    assert (await registre.repondre("u1", t2.id, "oui")).id == t2.id


async def test_modification_avec_confirmation_puis_annulation(registre):
    tache = await nouvelle(registre, type_agent="editeur_graphe", titre="ajout d'une étape")
    await registre.prendre(["editeur_graphe"])
    modif = ModificationProposee(description_orale="J'ajoute l'étape « lemme 3 » après « lemme 2 ».",
                                 diff={"ajout": "lemme_3"})

    # Section 4.3 : jamais d'application sans confirmation.
    with pytest.raises(ErreurRegistre):
        await registre.terminer(tache.id, "C'est fait.", modification_appliquee=True)

    await registre.proposer(tache.id, modif)
    confirmee = await registre.confirmer("u1", None, "oui")
    assert confirmee.statut == Statut.EN_COURS and confirmee.decision == "oui"
    fin = await registre.terminer(tache.id, "L'étape est ajoutée.", modification_appliquee=True)
    assert fin.modification_appliquee

    retour = await registre.revenir_en_arriere("u1", None)
    assert retour.nature == "retour_arriere"
    assert retour.tache_cible_id == tache.id
    assert retour.type_agent == "editeur_graphe"
    assert retour.statut == Statut.EN_ATTENTE


async def test_refus_sans_correction_annule(registre):
    tache = await nouvelle(registre, type_agent="editeur_graphe")
    await registre.prendre(["editeur_graphe"])
    await registre.proposer(tache.id, ModificationProposee(description_orale="Je supprime le lien."))
    refus = await registre.confirmer("u1", tache.id, "non")
    assert refus.statut == Statut.ANNULEE and refus.arret_demande


async def test_refus_avec_correction_relance_l_agent(registre):
    tache = await nouvelle(registre, type_agent="editeur_graphe")
    await registre.prendre(["editeur_graphe"])
    await registre.proposer(tache.id, ModificationProposee(description_orale="Je supprime le lien."))
    corr = await registre.confirmer("u1", tache.id, "non", "supprime plutôt l'autre lien")
    assert corr.statut == Statut.EN_COURS and corr.correction == "supprime plutôt l'autre lien"


async def test_explorateur_ne_propose_pas_de_modification(registre):
    tache = await nouvelle(registre)
    await registre.prendre(["explorateur"])
    with pytest.raises(ErreurRegistre):
        await registre.proposer(tache.id, ModificationProposee(description_orale="…"))


async def test_arret_puis_ecriture_de_l_agent_refusee(registre):
    tache = await nouvelle(registre)
    await registre.prendre(["explorateur"])
    arretee = await registre.arreter("u1", None)
    assert arretee.statut == Statut.ANNULEE and arretee.arret_demande
    with pytest.raises(ErreurRegistre) as e:
        await registre.terminer(tache.id, "trop tard")
    assert e.value.code == "etat_invalide"


async def test_expiration_apres_deux_minutes(registre):
    tache = await nouvelle(registre)
    attente = await nouvelle(registre, titre="question")
    await registre.prendre(["explorateur"])
    await registre.prendre(["explorateur"])
    await registre.questionner(attente.id, "?")
    expirees = await registre.stockage.expirer(timedelta(seconds=-1))
    # La tâche qui attend l'utilisateur n'expire pas.
    assert [t.id for t in expirees] == [tache.id]
    assert expirees[0].statut == Statut.ECHOUEE and expirees[0].annoncee is False


async def test_verrou_une_ecriture_a_la_fois(registre):
    t1 = await nouvelle(registre, type_agent="editeur_graphe")
    t2 = await nouvelle(registre, type_agent="editeur_graphe")
    assert await registre.prendre_verrou("graphe:energie", t1.id)
    assert not await registre.prendre_verrou("graphe:energie", t2.id)
    await registre.liberer_verrou("graphe:energie", t1.id)
    assert await registre.prendre_verrou("graphe:energie", t2.id)


async def test_verrou_d_une_tache_finie_est_libre(registre):
    t1 = await nouvelle(registre, type_agent="editeur_graphe")
    t2 = await nouvelle(registre, type_agent="editeur_graphe")
    await registre.prendre_verrou("graphe:x", t1.id)
    await registre.echouer(t1.id, "panne")
    assert await registre.prendre_verrou("graphe:x", t2.id)


async def test_evenements(registre):
    recus = []

    async def ecouter():
        async with registre.abonnement(lambda t: t.utilisateur_id == "u1") as flux:
            async for evt in flux:
                recus.append((evt.type, evt.tache.statut))
                if evt.tache.statut == Statut.TERMINEE:
                    return

    ecoute = asyncio.create_task(ecouter())
    await asyncio.sleep(0)
    tache = await nouvelle(registre)
    await nouvelle(registre, utilisateur="u2")
    await registre.prendre(["explorateur"])
    await registre.avancer(tache.id, "…")
    await registre.terminer(tache.id, "Fini.")
    await asyncio.wait_for(ecoute, 1)
    assert recus == [
        ("creee", Statut.EN_ATTENTE),
        ("statut", Statut.EN_COURS),
        ("maj", Statut.EN_COURS),
        ("statut", Statut.TERMINEE),
    ]


async def test_a_annoncer_et_marquage(registre):
    tache = await nouvelle(registre)
    await registre.prendre(["explorateur"])
    await registre.terminer(tache.id, "Fini.")
    assert [t.id for t in await registre.a_annoncer("u1")] == [tache.id]
    await registre.marquer_annoncee(await registre.tache_de("u1", tache.id))
    assert await registre.a_annoncer("u1") == []


async def test_resultat_oral_trop_long_refuse(registre):
    tache = await nouvelle(registre)
    await registre.prendre(["explorateur"])
    with pytest.raises(ErreurRegistre):
        await registre.terminer(tache.id, "x" * 2000)


async def test_abonnement_reste_utilisable_apres_un_delai(registre):
    """Régression : le flux SSE attend 15 s puis envoie un ping ; l'abonnement ne doit pas se casser."""
    async with registre.abonnement(lambda t: t.utilisateur_id == "u1") as abonnement:
        with pytest.raises(TimeoutError):
            await abonnement.suivant(delai=0.01)
        tache = await nouvelle(registre)
        evt = await abonnement.suivant(delai=1)
        assert evt.tache.id == tache.id and evt.type == "creee"
