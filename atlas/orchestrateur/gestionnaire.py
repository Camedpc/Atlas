"""Exécutions en arrière-plan : au plus une par conversation, plusieurs conversations en parallèle."""

import asyncio
import logging

from openai_codex import AsyncTurnHandle

from .. import conversations
from ..modeles import Conversation, Execution, StatutExecution
from . import agent, pipeline

log = logging.getLogger(__name__)

LONGUEUR_MAX_TITRE = 80


class DejaEnCours(Exception):
    pass


def titre_depuis(texte: str) -> str:
    ligne = texte.strip().splitlines()[0].strip() if texte.strip() else conversations.TITRE_PAR_DEFAUT
    return ligne if len(ligne) <= LONGUEUR_MAX_TITRE else ligne[: LONGUEUR_MAX_TITRE - 1].rstrip() + "…"


class Gestionnaire:
    def __init__(self) -> None:
        # Conversation en cours -> tour Codex (None tant qu'il n'est pas lancé).
        self._tours: dict[str, AsyncTurnHandle | None] = {}
        self._arrets: set[str] = set()
        self._taches: set[asyncio.Task] = set()

    def en_cours(self, conversation_id: str) -> bool:
        return conversation_id in self._tours

    async def lancer(self, conversation: Conversation, texte: str) -> Execution:
        cid = conversation.id
        if cid in self._tours:
            raise DejaEnCours(cid)
        self._tours[cid] = None  # réservé avant tout await
        try:
            execution = await asyncio.to_thread(conversations.creer_execution, cid)
            await asyncio.to_thread(conversations.ajouter_message, cid, "utilisateur", texte, execution_id=execution.id)
            titre = titre_depuis(texte) if conversation.titre == conversations.TITRE_PAR_DEFAUT else conversation.titre
            # Réécrire le titre remonte aussi la conversation en tête de liste (modifie_le).
            await asyncio.to_thread(conversations.modifier_conversation, cid, titre=titre)
        except Exception:
            del self._tours[cid]
            raise

        tache = asyncio.create_task(self._executer(conversation, texte, execution.id))
        self._taches.add(tache)
        tache.add_done_callback(self._taches.discard)
        return execution

    async def arreter(self, conversation_id: str) -> bool:
        if conversation_id not in self._tours:
            return False
        self._arrets.add(conversation_id)
        tour = self._tours[conversation_id]
        if tour is not None:
            await tour.interrupt()
        return True

    def _brancher(self, conversation_id: str, tour: AsyncTurnHandle) -> None:
        if conversation_id in self._arrets:
            raise agent.Arret
        self._tours[conversation_id] = tour

    async def _executer(self, conversation: Conversation, texte: str, execution_id: str) -> None:
        cid = conversation.id
        statut: StatutExecution = "erreur"
        erreur: str | None = None
        usage = None
        try:
            resultat = await agent.tour(conversation, texte, execution_id, lambda t: self._brancher(cid, t))
            usage = resultat.usage
            if cid in self._arrets:
                statut = "arretee"
            elif resultat.statut == "terminee":
                await pipeline.apres_recherche(cid, execution_id)
                statut = "terminee"
            else:
                statut, erreur = resultat.statut, resultat.erreur
        except agent.Arret:
            statut = "arretee"
        except Exception as e:
            log.exception("Exécution %s en échec", execution_id)
            erreur = str(e) or type(e).__name__
        finally:
            self._tours.pop(cid, None)
            self._arrets.discard(cid)

        try:
            if erreur:
                await asyncio.to_thread(
                    conversations.ajouter_message, cid, "systeme", erreur, execution_id=execution_id
                )
            await asyncio.to_thread(conversations.terminer_execution, execution_id, statut, erreur=erreur, usage=usage)
        except Exception:
            log.exception("Impossible d'enregistrer la fin de l'exécution %s", execution_id)


gestionnaire = Gestionnaire()
