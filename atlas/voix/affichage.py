"""Pont vers l'agent navigateur d'AtlasVoice : Atlas voix change ce que Camille voit à l'écran du graphe.

La voix ne pilote pas l'écran elle-même. Elle crée une tâche `navigateur` dans le registre d'AtlasVoice
(`POST /api/taches`, protocole P1) ; l'agent navigateur la prend, lit l'écran dans le relais d'affichage, envoie
ses commandes (P3) et termine la tâche. Ici, on suit la tâche jusqu'à sa fin et on transforme ses changements en
messages [Affichage] que la voix annonce dans les silences (question de l'agent, « c'est affiché », échec).

`demande_brute` est la dernière phrase de Camille telle que transcrite : pour l'agent, elle fait foi sur la
reformulation de la voix. L'utilisateur est celui du jeton `ATLAS_AFFICHAGE_JETON` (« anonyme » sans jeton, quand
AtlasVoice tourne sans SUPABASE_JWT_SECRET) : c'est son écran que l'agent pilote.
"""

import asyncio
import json
import logging
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any, Protocol

from . import config

log = logging.getLogger(__name__)

STATUTS_FINAUX = frozenset({"terminee", "echouee", "annulee"})
INTERVALLE_SUIVI_S = 0.5
DUREE_MAX_SUIVI_S = 360.0
"""Au-delà, on cesse de suivre : l'agent attend une réponse 300 s au plus, le registre expire une tâche après 2 min
sans nouvelle."""
LONGUEUR_TITRE = 120


class ErreurAffichage(Exception):
    pass


def corps_tache(demande: str, demande_brute: str = "", extrait: str = "", titre: str = "") -> dict[str, Any]:
    """Corps de `POST /api/taches` pour une tâche `navigateur`. Fonction pure."""
    demande = demande.strip()
    corps: dict[str, Any] = {
        "type_agent": "navigateur",
        "titre": (titre.strip() or demande or "Affichage")[:LONGUEUR_TITRE],
        "demande_brute": demande_brute.strip() or demande,
        "reformulation": demande,
        "canal": "vocal",
    }
    if extrait.strip():
        corps["extrait"] = extrait.strip()
    return corps


def annonce_affichage(tache: dict[str, Any]) -> str | None:
    """Message [Affichage] pour la voix, selon l'état de la tâche ; None s'il n'y a rien à dire. Fonction pure."""
    titre = tache.get("titre") or "affichage"
    match tache.get("statut"):
        case "terminee":
            resultat = tache.get("resultat_oral") or "C'est affiché."
            return f"[Affichage — « {titre} »] {resultat} Dis-le à Camille en quelques mots."
        case "besoin_precision" if tache.get("question"):
            return (
                f"[Affichage — question, tâche {tache.get('id')}] L'agent navigateur demande : "
                f"« {tache['question']} ». Pose la question à Camille, puis transmets sa réponse avec "
                f"`repondre_affichage` (id {tache.get('id')})."
            )
        case "echouee":
            erreur = tache.get("erreur") or "raison inconnue"
            return f"[Affichage — « {titre} »] L'affichage a échoué : {erreur}. Dis-le en une phrase."
    return None


class Client(Protocol):
    async def creer(self, corps: dict[str, Any]) -> dict[str, Any]: ...
    async def lire(self, tache_id: int) -> dict[str, Any]: ...
    async def repondre(self, tache_id: int, reponse: str) -> dict[str, Any]: ...


class ClientAtlasVoice:
    """API utilisateur du registre d'AtlasVoice (`/api/taches`), en HTTP simple."""

    def __init__(self, url: str, jeton: str = ""):
        self.url = url.rstrip("/")
        self.jeton = jeton

    def _requete(self, methode: str, chemin: str, corps: dict[str, Any] | None) -> dict[str, Any]:
        entetes = {"Content-Type": "application/json"}
        if self.jeton:
            entetes["Authorization"] = f"Bearer {self.jeton}"
        donnees = json.dumps(corps).encode() if corps is not None else None
        requete = urllib.request.Request(f"{self.url}/api{chemin}", data=donnees, headers=entetes, method=methode)
        try:
            with urllib.request.urlopen(requete, timeout=10) as reponse:
                return json.loads(reponse.read().decode())
        except urllib.error.HTTPError as erreur:
            raise ErreurAffichage(f"AtlasVoice a refusé ({erreur.code}) : {erreur.read().decode()[:300]}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as erreur:
            raise ErreurAffichage(f"AtlasVoice injoignable ({self.url}) : {erreur}") from None

    async def creer(self, corps: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(self._requete, "POST", "/taches", corps)

    async def lire(self, tache_id: int) -> dict[str, Any]:
        return await asyncio.to_thread(self._requete, "GET", f"/taches/{tache_id}", None)

    async def repondre(self, tache_id: int, reponse: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._requete, "POST", f"/taches/{tache_id}/reponse", {"reponse": reponse})


def client_par_defaut() -> Client | None:
    return ClientAtlasVoice(config.AFFICHAGE_URL, config.AFFICHAGE_JETON) if config.AFFICHAGE_URL else None


class Affichages:
    """Tâches d'affichage d'un appel : création, suivi jusqu'à la fin, réponses aux questions de l'agent."""

    def __init__(self, annoncer: Callable[[str], None], client: Client | None = None, intervalle: float | None = None):
        self.annoncer = annoncer
        self.client = client
        self.intervalle = INTERVALLE_SUIVI_S if intervalle is None else intervalle
        self.derniere_demande = ""
        """Dernière phrase de Camille (transcription brute), envoyée comme `demande_brute`."""
        self._suivis: dict[int, asyncio.Task[None]] = {}

    async def lancer(self, demande: str, extrait: str = "", titre: str = "") -> dict[str, Any]:
        if self.client is None:
            return {"erreur": "Affichage indisponible : ATLAS_AFFICHAGE_URL n'est pas défini sur ce serveur."}
        try:
            tache = await self.client.creer(corps_tache(demande, self.derniere_demande, extrait, titre))
        except ErreurAffichage as erreur:
            return {"erreur": str(erreur)}
        self._suivre(int(tache["id"]))
        return {"id": tache["id"], "statut": "lancée", "note": "Le résultat arrivera dans un message [Affichage]."}

    async def repondre(self, tache_id: int, reponse: str) -> dict[str, Any]:
        if self.client is None:
            return {"erreur": "Affichage indisponible."}
        try:
            tache = await self.client.repondre(tache_id, reponse)
        except ErreurAffichage as erreur:
            return {"erreur": str(erreur)}
        self._suivre(tache_id)
        return {"transmis": True, "statut": tache.get("statut")}

    def _suivre(self, tache_id: int) -> None:
        # Un seul suivi par tâche : après une réponse, le suivi repart de l'état courant.
        if (precedent := self._suivis.pop(tache_id, None)) is not None:
            precedent.cancel()
        suivi = asyncio.create_task(self._boucle_suivi(tache_id))
        self._suivis[tache_id] = suivi
        suivi.add_done_callback(lambda t, i=tache_id: self._suivis.get(i) is t and self._suivis.pop(i))

    async def _boucle_suivi(self, tache_id: int) -> None:
        assert self.client is not None
        debut = time.monotonic()
        dernier: tuple[Any, Any] | None = None
        echecs = 0
        while time.monotonic() - debut < DUREE_MAX_SUIVI_S:
            try:
                tache = await self.client.lire(tache_id)
                echecs = 0
            except ErreurAffichage:
                echecs += 1
                if echecs >= 5:
                    log.warning("suivi de l'affichage %s abandonné", tache_id, exc_info=True)
                    self.annoncer(
                        f"[Affichage] Plus de nouvelles de l'agent navigateur (tâche {tache_id}). Dis-le en une phrase."
                    )
                    return
                await asyncio.sleep(self.intervalle)
                continue
            etat = (tache.get("statut"), tache.get("question"))
            if etat != dernier:
                dernier = etat
                if texte := annonce_affichage(tache):
                    self.annoncer(texte)
            if tache.get("statut") in STATUTS_FINAUX or tache.get("statut") == "besoin_precision":
                return  # la réponse de Camille relance le suivi
            await asyncio.sleep(self.intervalle)

    def fermer(self) -> None:
        for suivi in self._suivis.values():
            suivi.cancel()
        self._suivis.clear()
