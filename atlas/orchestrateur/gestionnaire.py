"""Exécutions en arrière-plan : au plus une par conversation, plusieurs conversations en parallèle.

Un message envoyé pendant une exécution n'en lance pas une autre : il est injecté dans le tour en cours
(`steer`, lu dès l'étape suivante de l'orchestrateur, qui interrompt pour cela une attente `wait_agent`), et
relayé par l'orchestrateur quand il s'adresse à un sous-agent. Si le tour démarre encore, le message attend qu'il
soit prêt ; s'il vient de finir, il lance le tour suivant.

Le processus Codex reste ouvert entre les tours (`codex_vivant`) : les sous-agents continuent après la fin du tour
de l'orchestrateur. Une écoute permanente tient leur arbre à jour et enregistre leurs messages, tour ou pas.

La voix (atlas/voix) s'abonne aux événements d'une conversation (`abonner`) : étapes clés des sous-agents et fin
du tour. Au raccrochage, elle dépose un « pont » (ce que l'orchestrateur n'a pas vu de l'appel), ajouté en tête
du prochain message qu'il reçoit.
"""

import asyncio
import logging
import time
from dataclasses import asdict, dataclass
from typing import Any, Literal

from openai_codex import AsyncTurnHandle

from .. import conversations
from ..modeles import Conversation, Execution, StatutExecution
from . import agent, config, pipeline
from .codex_vivant import codex_vivant
from .consignes import interruption, relais
from .suivi_agents import METHODES_SUIVIES, RACINE, SuiviAgents
from .traduction import traduire

log = logging.getLogger(__name__)

LONGUEUR_MAX_TITRE = 80
# Attente maximale d'un tour qui démarre avant d'y injecter un message.
DELAI_DEMARRAGE_TOUR = 60
INTERVALLE_MENAGE = 300


@dataclass(frozen=True)
class Reglages:
    """Modèle et effort de l'orchestrateur pour un tour (None : ceux par défaut)."""

    effort: str | None = None
    modele: str | None = None


Origine = Literal["texte", "voix"]


class DejaEnCours(Exception):
    pass


class TourIndisponible(Exception):
    """Une exécution est en cours mais son tour Codex ne prend pas de message (il ne démarre pas)."""


def titre_depuis(texte: str) -> str:
    ligne = texte.strip().splitlines()[0].strip() if texte.strip() else conversations.TITRE_PAR_DEFAUT
    return ligne if len(ligne) <= LONGUEUR_MAX_TITRE else ligne[: LONGUEUR_MAX_TITRE - 1].rstrip() + "…"


class Gestionnaire:
    def __init__(self) -> None:
        # Conversation en cours -> tour Codex (None tant qu'il n'est pas lancé).
        self._tours: dict[str, AsyncTurnHandle | None] = {}
        self._arrets: set[str] = set()
        self._taches: set[asyncio.Task] = set()
        self._execution_par_conv: dict[str, asyncio.Task] = {}
        self._executions: dict[str, Execution] = {}
        # Arbre des agents de chaque conversation chargée dans Codex : il survit au tour, tant que des
        # sous-agents peuvent y travailler (l'arbre de chaque tour est aussi gardé dans son exécution).
        self._suivis: dict[str, SuiviAgents] = {}
        # Dernière exécution de chaque conversation suivie : les messages hors tour s'y rattachent.
        self._derniere: dict[str, str] = {}
        self._file: asyncio.Queue | None = None
        self._ecoute: asyncio.Task | None = None
        self._menage_tache: asyncio.Task | None = None
        self._abonnes: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}
        self._ponts: dict[str, str] = {}
        self.derniers_lancements: dict[str, tuple[Origine, float]] = {}
        """Origine et instant du dernier tour lancé dans chaque conversation (texte tapé ou voix)."""

    # ── Abonnements (voix) ──

    def abonner(self, conversation_id: str) -> asyncio.Queue[dict[str, Any]]:
        file: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._abonnes.setdefault(conversation_id, set()).add(file)
        return file

    def desabonner(self, conversation_id: str, file: asyncio.Queue[dict[str, Any]]) -> None:
        self._abonnes.get(conversation_id, set()).discard(file)

    def _publier(self, conversation_id: str, evenement: dict[str, Any]) -> None:
        for file in self._abonnes.get(conversation_id, ()):
            file.put_nowait(evenement)

    def deposer_pont(self, conversation_id: str, texte: str) -> None:
        """Ce que l'orchestrateur doit savoir de l'appel vocal, ajouté en tête de son prochain message."""
        self._ponts[conversation_id] = texte

    def _avec_pont(self, conversation_id: str, texte: str) -> str:
        pont = self._ponts.pop(conversation_id, None)
        return f"{pont}\n\n{texte}" if pont else texte

    def en_cours(self, conversation_id: str) -> bool:
        """L'orchestrateur a un tour en cours."""
        return conversation_id in self._tours

    def actif(self, conversation_id: str) -> bool:
        """L'orchestrateur ou l'un de ses sous-agents travaille."""
        suivi = self._suivis.get(conversation_id)
        return self.en_cours(conversation_id) or bool(suivi and suivi.au_travail(sous_agents_seuls=True))

    def agents(self, conversation_id: str) -> list[dict] | None:
        """Arbre des agents en direct, None si la conversation n'est pas suivie."""
        suivi = self._suivis.get(conversation_id)
        return suivi.instantane() if suivi is not None else None

    def brouillons(self, conversation_id: str) -> dict[str, str]:
        """Messages en cours d'écriture, par chemin d'agent."""
        suivi = self._suivis.get(conversation_id)
        return {c: t for c, t in suivi.brouillons.items() if t.strip()} if suivi is not None else {}

    async def envoyer(
        self,
        conversation: Conversation,
        texte: str,
        agent_cible: str | None = None,
        reglages: Reglages | None = None,
        origine: Origine = "texte",
    ) -> Execution:
        """Message de Camille à l'orchestrateur (`agent_cible` None) ou à l'un de ses sous-agents.

        Pendant une exécution, il est injecté dans le tour en cours (dont le modèle et l'effort ne changent plus) ;
        sinon il lance un nouveau tour avec `reglages`.
        """
        cible = None if agent_cible in (None, "", RACINE) else agent_cible
        cid = conversation.id
        limite = time.monotonic() + DELAI_DEMARRAGE_TOUR
        while True:
            if cid not in self._tours:
                return await self.lancer(conversation, texte, agent_cible=cible, reglages=reglages, origine=origine)
            tour, execution = self._tours[cid], self._executions.get(cid)
            if tour is None or execution is None:
                # Le tour démarre : attendre qu'il prenne des messages plutôt que refuser.
                if time.monotonic() > limite:
                    raise TourIndisponible(cid)
                await asyncio.sleep(0.2)
                continue
            try:
                await tour.steer(relais(cible, texte) if cible else self._avec_pont(cid, texte))
            except Exception:
                # Le tour vient de finir : le message ouvrira le suivant.
                log.info("Tour de %s déjà fini : le message lancera le suivant", cid, exc_info=True)
                await self._attendre_fin(cid)
                continue
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
        origine: Origine = "texte",
    ) -> Execution:
        cid = conversation.id
        if cid in self._tours:
            raise DejaEnCours(cid)
        self._tours[cid] = None  # réservé avant tout await
        self.derniers_lancements[cid] = (origine, time.time())
        self._ecouter()
        try:
            suivi = self._suivis.get(cid)
            precedente = None if suivi else await asyncio.to_thread(conversations.derniere_execution, cid)
            execution = await asyncio.to_thread(conversations.creer_execution, cid)
            self._executions[cid] = execution
            self._suivis[cid] = suivi or SuiviAgents.depuis(precedente.agents if precedente else None)
            self._derniere[cid] = execution.id
            await asyncio.to_thread(
                conversations.ajouter_message, cid, "utilisateur", texte, execution_id=execution.id, agent=agent_cible
            )
            titre = titre_depuis(texte) if conversation.titre == conversations.TITRE_PAR_DEFAUT else conversation.titre
            # Réécrire le titre remonte aussi la conversation en tête de liste (modifie_le).
            await asyncio.to_thread(conversations.modifier_conversation, cid, titre=titre)
        except Exception:
            del self._tours[cid]
            self._executions.pop(cid, None)
            raise

        consigne = relais(agent_cible, texte) if agent_cible else self._avec_pont(cid, texte)
        tache = asyncio.create_task(self._executer(conversation, consigne, execution.id, reglages or Reglages()))
        self._taches.add(tache)
        self._execution_par_conv[cid] = tache
        tache.add_done_callback(self._taches.discard)
        return execution

    async def arreter(self, conversation_id: str, agent_cible: str | None = None) -> bool:
        """Arrête tout (l'orchestrateur et ses sous-agents), ou seulement le sous-agent `agent_cible`.
        Faux s'il n'y avait rien à arrêter."""
        suivi = self._suivis.get(conversation_id)
        if agent_cible not in (None, "", RACINE):
            cible = suivi.agents.get(agent_cible) if suivi else None
            if cible is None or cible.tour is None:
                return False
            await self._interrompre(cible.thread_id, cible.tour)
            # Son parent l'attendrait jusqu'au bout du délai de `wait_agent` : prévenir l'orchestrateur.
            tour = self._tours.get(conversation_id)
            if tour is not None:
                try:
                    await tour.steer(interruption(agent_cible))
                except Exception:
                    log.info("Orchestrateur non prévenu de l'arrêt de %s", agent_cible, exc_info=True)
            return True
        arrete = False
        if conversation_id in self._tours:
            self._arrets.add(conversation_id)
            tour = self._tours[conversation_id]
            if tour is not None:
                await tour.interrupt()
            arrete = True
        # Interrompre l'orchestrateur ne les arrête pas : Codex les laisse travailler.
        for a in suivi.au_travail(sous_agents_seuls=True) if suivi else []:
            if a.tour is not None:
                await self._interrompre(a.thread_id, a.tour)
                arrete = True
        return arrete

    async def _interrompre(self, thread_id: str, tour_id: str) -> None:
        try:
            await codex_vivant.interrompre(thread_id, tour_id)
        except Exception:
            log.warning("Interruption du tour %s refusée", tour_id, exc_info=True)

    async def _attendre_fin(self, cid: str) -> None:
        tache = self._execution_par_conv.get(cid)
        if tache is not None and not tache.done():
            await asyncio.wait({tache})
        else:
            await asyncio.sleep(0.1)

    def _brancher(self, conversation_id: str, tour: AsyncTurnHandle) -> None:
        if conversation_id in self._arrets:
            raise agent.Arret
        self._tours[conversation_id] = tour

    async def _executer(self, conversation: Conversation, texte: str, execution_id: str, reglages: Reglages) -> None:
        cid = conversation.id
        statut: StatutExecution = "erreur"
        erreur: str | None = None
        usage = None
        suivi = self._suivis[cid]
        suivi.derniere_reponse = None  # l'arbre survit au tour : sa réponse finale, non
        self._publier(cid, {"type": "debut"})
        try:
            resultat = await agent.tour(
                conversation,
                texte,
                execution_id,
                lambda t: self._brancher(cid, t),
                suivi=suivi,
                effort=reglages.effort,
                modele=reglages.modele,
                occupe=bool(suivi.au_travail(sous_agents_seuls=True)),
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
            agents = _clore(suivi, statut)
            self._publier(cid, {"type": "fin", "statut": statut, "reponse": suivi.derniere_reponse, "erreur": erreur})

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

    # ── écoute permanente des notifications Codex ──

    def _ecouter(self) -> None:
        """Branche une fois pour toutes l'écoute des notifications de tous les threads."""
        if self._ecoute is not None and not self._ecoute.done():
            return
        boucle = asyncio.get_running_loop()
        file: asyncio.Queue = asyncio.Queue()
        self._file = file
        codex_vivant.methodes = METHODES_SUIVIES
        codex_vivant.abonne = lambda methode, charge: boucle.call_soon_threadsafe(file.put_nowait, (methode, charge))
        # Tâches permanentes, hors de `_taches` (qui ne compte que le travail en cours).
        self._ecoute = asyncio.create_task(self._suivre(file))
        self._menage_tache = asyncio.create_task(self._menage())

    async def _suivre(self, file: asyncio.Queue) -> None:
        while True:
            methode, charge = await file.get()
            try:
                await self._recevoir(methode, agent.en_dict(charge))
            except Exception:
                log.exception("Suivi des agents : notification %s ignorée", methode)

    async def _recevoir(self, methode: str, params: dict[str, Any]) -> None:
        thread_id = params.get("threadId")
        cid = next((c for c, s in self._suivis.items() if s.possede(thread_id)), None)
        if cid is None:
            return
        suivi = self._suivis[cid]
        evenements = suivi.recevoir(methode, params)
        for etape in evenements.etapes:
            self._publier(cid, {"type": "etape", **asdict(etape)})
        for nouveau in evenements.nouveaux:
            tache = asyncio.create_task(agent.enrichir(suivi, nouveau))
            self._taches.add(tache)
            tache.add_done_callback(self._taches.discard)
        execution_id = self._derniere.get(cid)
        for chemin, item in evenements.a_enregistrer:
            for ligne in traduire(item, suivi.bilan(item)):
                await asyncio.to_thread(
                    conversations.ajouter_message,
                    cid,
                    ligne.role,
                    ligne.contenu,
                    execution_id=execution_id,
                    donnees=ligne.donnees,
                    agent=None if chemin == RACINE else chemin,
                )
        # Hors tour, l'exécution est close : son arbre suit les sous-agents qui travaillent encore.
        if methode == "turn/completed" and cid not in self._tours and execution_id:
            await asyncio.to_thread(conversations.enregistrer_agents, execution_id, suivi.instantane())

    async def _menage(self) -> None:
        """Décharge de Codex les conversations inutilisées où plus aucun agent ne travaille."""
        while True:
            await asyncio.sleep(INTERVALLE_MENAGE)
            try:
                for cid in await codex_vivant.liberer_inactifs(config.DUREE_THREAD_CHAUD, self.actif):
                    self._suivis.pop(cid, None)
            except Exception:
                log.warning("Ménage des threads Codex", exc_info=True)


def _clore(suivi: SuiviAgents, statut: StatutExecution) -> list[dict]:
    """Arbre à la fin du tour de l'orchestrateur. S'il a fini normalement, ses sous-agents encore au travail
    continuent (le processus Codex reste ouvert) ; s'il a été arrêté ou a échoué, plus personne ne travaille."""
    fin = {"terminee": "termine", "arretee": "interrompu"}.get(statut, "echec")
    for a in suivi.agents.values():
        if a.etat in ("actif", "attend") and (a.chemin == RACINE or statut != "terminee"):
            a.etat, a.outil, a.tour = fin, None, None
            a.activite = {"termine": "Terminé", "interrompu": "Interrompu"}.get(fin, "Échec")
            a.fin = a.fin or time.time()
    return suivi.instantane()


gestionnaire = Gestionnaire()
