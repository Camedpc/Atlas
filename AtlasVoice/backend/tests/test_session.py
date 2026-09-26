"""Le mécanisme central : un appel d'outil reste ouvert et relaie la suite de la tâche à Atlas."""

import asyncio
import json

from app.observabilite import journal
from app.registre.modele import ModificationProposee
from app.voix.session import SessionVocale, phrase_de_fin

from .conftest import nouvelle


class FauxAppel:
    """Remplace le ToolCallHandle de Gradbot : collecte les résultats envoyés."""

    def __init__(self) -> None:
        self.envois: list[dict] = []
        self.recu = asyncio.Event()

    async def send(self, texte: str) -> None:
        self.envois.append(json.loads(texte))
        self.recu.set()


class FauxInfo:
    def __init__(self, nom, args) -> None:
        self.tool_name = nom
        self.args_json = json.dumps(args)


def session(registre) -> SessionVocale:
    return SessionVocale(websocket=None, registre=registre, utilisateur_id="u1")


async def attendre(appel: FauxAppel, n: int) -> None:
    async def boucle():
        while len(appel.envois) < n:
            appel.recu.clear()
            await appel.recu.wait()

    await asyncio.wait_for(boucle(), 1)


async def test_lancer_puis_resultat_sur_le_meme_appel(registre):
    s = session(registre)
    s.derniere_demande = "fais-moi un résumé de ce graphe"
    appel = FauxAppel()
    await s._sur_appel(FauxInfo("lancer_tache", {"type_agent": "explorateur", "titre": "résumé",
                                                 "reformulation": "Résumer le graphe."}), appel)
    # Premier résultat immédiat : la tâche est lancée.
    assert appel.envois[0]["evenement"] == "tache_lancee"
    tache_id = appel.envois[0]["tache"]["tache_id"]
    assert tache_id in s.suivis

    # L'agent travaille : l'avancement seul n'est pas annoncé.
    await registre.prendre(["explorateur"])
    await registre.avancer(tache_id, "Lecture des étapes")
    await registre.terminer(tache_id, "Le graphe compte douze étapes.")
    await attendre(appel, 2)
    assert appel.envois[1]["evenement"] == "tache_terminee"
    assert appel.envois[1]["tache"]["resultat_oral"] == "Le graphe compte douze étapes."
    assert (await registre.tache_de("u1", tache_id)).annoncee
    await asyncio.sleep(0.01)
    assert tache_id not in s.suivis  # appel clos à l'état final


async def test_question_puis_reponse_reprend_le_suivi(registre):
    s = session(registre)
    appel = FauxAppel()
    await s._sur_appel(FauxInfo("lancer_tache", {"type_agent": "editeur_graphe", "titre": "ajout",
                                                 "reformulation": "Ajouter une étape."}), appel)
    tache_id = appel.envois[0]["tache"]["tache_id"]
    await registre.prendre(["editeur_graphe"])
    await registre.proposer(tache_id, ModificationProposee(description_orale="J'ajoute « lemme 3 »."))
    await attendre(appel, 2)
    assert appel.envois[1]["tache"]["modification_proposee"] == "J'ajoute « lemme 3 »."

    # « Vas-y » : l'appel `confirmer` prend le relais du suivi.
    confirmation = FauxAppel()
    await s._sur_appel(FauxInfo("confirmer", {"decision": "oui"}), confirmation)
    await asyncio.sleep(0.01)
    await registre.terminer(tache_id, "L'étape est ajoutée.", modification_appliquee=True)
    await attendre(confirmation, 2)
    assert confirmation.envois[1]["tache"]["resultat_oral"] == "L'étape est ajoutée."
    assert len(appel.envois) == 2  # l'ancien appel n'annonce pas deux fois


async def test_tache_finie_avant_abonnement_est_rattrapee(registre):
    s = session(registre)
    tache = await nouvelle(registre)
    await registre.prendre(["explorateur"])
    await registre.terminer(tache.id, "Fini.")
    appel = FauxAppel()
    s._suivre(tache, appel)  # `tache` est l'état « en attente » vu au lancement
    await attendre(appel, 1)
    assert appel.envois[0]["evenement"] == "tache_terminee"


async def test_journal_de_session(registre):
    s = session(registre)
    s._sur_evenement("push_to_llm", {"user_text": "où en est le résumé ?"}, 1.0)
    s._sur_evenement("previous_llm_gen", {"agent_text": "Il avance."}, 2.0)
    lignes = journal.lire_session(s.session_id)
    assert [l["type"] for l in lignes] == ["debut", "utilisateur", "atlas"]
    assert list(s.echanges)[-1] == {"role": "atlas", "texte": "Il avance."}


def test_mesure_de_latence(registre):
    from app.observabilite.metriques import metriques

    s = SessionVocale(websocket=None, registre=registre, utilisateur_id="u1")
    avant = len(metriques.tours)
    for nom, t in [("flushing", 10.0), ("end_of_turn", 10.15), ("first_word", 10.5), ("first_tts_audio", 10.62)]:
        s._mesurer(nom, t)
    etapes = metriques.tours[-1]
    assert len(metriques.tours) == avant + 1
    assert round(etapes["total"], 2) == 0.62 and round(etapes["premier_token"], 2) == 0.35


def test_phrases_de_fin():
    assert phrase_de_fin("Merci Atlas.")
    assert phrase_de_fin("stop")
    assert phrase_de_fin("au revoir")
    assert not phrase_de_fin("stop la tâche sur la dérivée")
    assert not phrase_de_fin("merci, et le résumé ?")


def test_fin_par_la_reponse_d_atlas(registre):
    from app.voix.session import reponse_de_fin

    assert phrase_de_fin("À plus tard.")
    assert reponse_de_fin("À plus tard.")
    assert not reponse_de_fin("À plus tard, je te redis quand le résumé est prêt.")
    s = SessionVocale(websocket=None, registre=registre, utilisateur_id="u1")
    demandes = []
    s._demander_fin = lambda: demandes.append(s._tour_atlas)
    for morceau in ("À", "plus", "tard."):
        s._sur_texte_atlas(morceau, 7)
    assert demandes == [7]


async def test_morceaux_de_transcription_d_une_meme_demande(registre, monkeypatch):
    """Gradbot coupe une phrase hésitante : la demande brute les réunit, jusqu'à un appel d'outil ou un silence."""
    import app.voix.session as module

    s = SessionVocale(None, registre, "u1")  # type: ignore[arg-type]
    horloge = [100.0]
    monkeypatch.setattr(module.time, "monotonic", lambda: horloge[0])
    pousser = lambda texte: s._sur_evenement("push_to_llm", {"user_text": texte}, None)  # noqa: E731
    pousser("je veux que tu te focus sur le... sur le résultat de la limite")
    horloge[0] += 1.5
    pousser("monotone.")
    assert s.derniere_demande == "je veux que tu te focus sur le... sur le résultat de la limite monotone."
    # Après un long silence, c'est une nouvelle demande.
    horloge[0] += module.PAUSE_NOUVELLE_DEMANDE_S + 1
    pousser("passe en 3D")
    assert s.derniere_demande == "passe en 3D"
