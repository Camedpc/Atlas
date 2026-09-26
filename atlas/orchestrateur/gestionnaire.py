"""Exécutions en arrière-plan : au plus une par conversation, plusieurs conversations en parallèle.

Un message envoyé pendant une exécution n'en lance pas une autre : il est injecté dans le tour en cours
(`steer`), et relayé par l'orchestrateur quand il s'adresse à un sous-agent.
"""

import asyncio
import logging
import time
from dataclasses import dataclass

from openai_codex import AsyncTurnHandle

from .. import conversations
from ..modeles import Conversation, Execution, StatutExecution
from . import agent, pipeline
from .consignes import relais
from .suivi_agents import RACINE, SuiviAgents

log = logging.getLogger(__name__)

LONGUEUR_MAX_TITRE = 80


@dataclass(frozen=True)
class Reglages:
    """Modèle et effort de l'orchestrateur pour un tour (None : ceux par défaut)."""

    effort: str | None = None
    modele: str | None = None


class DejaEnCours(Exception):
    pass


class TourIndisponible(Exception):
    """Une exécution est en cours mais son tour Codex ne prend pas de message (il démarre ou se termine)."""


def titre_depuis(texte: str) -> str:
    ligne = texte.strip().splitlines()[0].strip() if texte.strip() else conversations.TITRE_PAR_DEFAUT
    return ligne if len(ligne) <= LONGUEUR_MAX_TITRE else ligne[: LONGUEUR_MAX_TITRE - 1].rstrip() + "…"


class Gestionnaire:
    def __init__(self) -> None:
        # Conversation en cours -> tour Codex (None tant qu'il n'est pas lancé).
        self._tours: dict[str, AsyncTurnHandle | None] = {}
        self._arrets: set[str] = set()
        self._taches: set[asyncio.Task] = set()
        self._executions: dict[str, Execution] = {}
        # Arbre des agents de chaque conversation en cours (l'arbre final est gardé dans l'exécution).
        self._suivis: dict[str, SuiviAgents] = {}

    def en_cours(self, conversation_id: str) -> bool:
        return conversation_id in self._tours

    def agents(self, conversation_id: str) -> list[dict] | None:
        """Arbre des agents de l'exécution en cours, None s'il n'y en a pas."""
        suivi = self._suivis.get(conversation_id)
        return suivi.instantane() if suivi is not None else None

    async def envoyer(
        self,
        conversation: Conversation,
        texte: str,
        agent_cible: str | None = None,
        reglages: Reglages | None = None,
    ) -> Execution:
        """Message de Camille à l'orchestrateur (`agent_cible` None) ou à l'un de ses sous-agents.

        Pendant une exécution, il est injecté dans le tour en cours (dont le modèle et l'effort ne changent plus) ;
        sinon il lance un nouveau tour avec `reglages`.
        """
        cible = None if agent_cible in (None, "", RACINE) else agent_cible
        cid = conversation.id
        if cid not in self._tours:
            return await self.lancer(conversation, texte, agent_cible=cible, reglages=reglages)
        tour = self._tours[cid]
        execution = self._executions.get(cid)
        if tour is None or execution is None:
            raise TourIndisponible(cid)
        try:
            await tour.steer(relais(cible, texte) if cible else texte)
        except Exception as e:
            log.warning("Message non injecté dans le tour de %s", cid, exc_info=True)
            raise TourIndisponible(cid) from e
        await asyncio.to_thread(
            conversations.ajouter_message, cid, "utilisateur", texte, execution_id=execution.id, agent=cible
        )
        return execution

    async def lancer(
        self,
        conversation: Conversation,
        texte: str,
        agent_cible: str | None = None,
        reglages: Reglages | None = None,
    ) -> Execution:
        cid = conversation.id
        if cid in self._tours:
            raise DejaEnCours(cid)
        self._tours[cid] = None  # réservé avant tout await
        try:
            precedente = await asyncio.to_thread(conversations.derniere_execution, cid)
            execution = await asyncio.to_thread(conversations.creer_execution, cid)
            self._executions[cid] = execution
            self._suivis[cid] = SuiviAgents.depuis(precedente.agents if precedente else None)
            await asyncio.to_thread(
                conversations.ajouter_message, cid, "utilisateur", texte, execution_id=execution.id, agent=agent_cible
            )
            titre = titre_depuis(texte) if conversation.titre == conversations.TITRE_PAR_DEFAUT else conversation.titre
            # Réécrire le titre remonte aussi la conversation en tête de liste (modifie_le).
            await asyncio.to_thread(conversations.modifier_conversation, cid, titre=titre)
        except Exception:
            del self._tours[cid]
            self._executions.pop(cid, None)
            self._suivis.pop(cid, None)
            raise

        consigne = relais(agent_cible, texte) if agent_cible else texte
        tache = asyncio.create_task(self._executer(conversation, consigne, execution.id, reglages or Reglages()))
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

    async def _executer(self, conversation: Conversation, texte: str, execution_id: str, reglages: Reglages) -> None:
        cid = conversation.id
        statut: StatutExecution = "erreur"
        erreur: str | None = None
        usage = None
        try:
            resultat = await agent.tour(
                conversation,
                texte,
                execution_id,
                lambda t: self._brancher(cid, t),
                suivi=self._suivis[cid],
                effort=reglages.effort,
                modele=reglages.modele,
            )
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
            self._executions.pop(cid, None)
            suivi = self._suivis.pop(cid, None)
            agents = _clore(suivi, statut) if suivi is not None else None

        try:
            if erreur:
                await asyncio.to_thread(
                    conversations.ajouter_message, cid, "systeme", erreur, execution_id=execution_id
                )
            await asyncio.to_thread(
                conversations.terminer_execution, execution_id, statut, erreur=erreur, usage=usage, agents=agents
            )
        except Exception:
            log.exception("Impossible d'enregistrer la fin de l'exécution %s", execution_id)


def _clore(suivi: SuiviAgents, statut: StatutExecution) -> list[dict]:
    """Arbre final : un agent resté au travail quand le tour s'arrête ne l'est plus."""
    fin = {"terminee": "termine", "arretee": "interrompu"}.get(statut, "echec")
    for a in suivi.agents.values():
        if a.etat in ("actif", "attend"):
            a.etat, a.outil = fin, None
            a.activite = {"termine": "Terminé", "interrompu": "Interrompu"}.get(fin, "Échec")
            a.fin = a.fin or time.time()
    return suivi.instantane()


gestionnaire = Gestionnaire()
