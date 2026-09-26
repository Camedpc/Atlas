"""Client du registre pour les agents : la mise en œuvre du contrat de la section 4.3.

Ce module ne contient aucun agent. Il donne aux agents (explorateur, éditeur de graphe,
conversation — à écrire côté chat principal) les appels du registre et fait respecter le contrat :

- lire la demande brute, la reformulation et le contexte ; en cas de désaccord, la demande brute fait foi ;
- publier l'avancement à chaque étape (au moins toutes les 10 s pour une tâche longue) ;
- poser une question plutôt que deviner ;
- rendre `resultat_oral` (2 à 3 phrases prêtes à lire) et `resultat_detail` (pour l'écran) ;
- ne jamais modifier sans confirmation ; versionner ; verrouiller le graphe pendant l'écriture.

Exemple d'usage dans un agent :

    async with ClientRegistre(url, cle) as registre:
        tache = await registre.prendre(["explorateur"])
        if tache:
            async with registre.battement(tache["id"], "Lecture du graphe"):
                ...  # travail long : l'avancement est republié toutes les 10 s
            await registre.terminer(tache["id"], "Le graphe compte douze étapes…", detail)
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

INTERVALLE_BATTEMENT_S = 10


class TacheArretee(Exception):
    """L'utilisateur a arrêté la tâche (statut annulée) : l'agent doit s'interrompre sans écrire."""


class RessourceVerrouillee(Exception):
    """Une autre tâche modifie déjà cette ressource : attendre son tour."""


class ClientRegistre:
    def __init__(self, url: str, cle: str | None = None, timeout: float = 10.0) -> None:
        entetes = {"X-Agents-Cle": cle} if cle else {}
        self._http = httpx.AsyncClient(base_url=url.rstrip("/") + "/api/agents", headers=entetes, timeout=timeout)

    async def __aenter__(self) -> ClientRegistre:
        return self

    async def __aexit__(self, *_exc) -> None:
        await self._http.aclose()

    async def _post(self, chemin: str, corps: dict[str, Any]) -> dict[str, Any] | None:
        reponse = await self._http.post(chemin, json=corps)
        if reponse.status_code == 409 and "statut annulee" in reponse.text:
            raise TacheArretee(reponse.text)
        reponse.raise_for_status()
        return reponse.json()

    # ── cycle d'une tâche ──────────────────────────────────────────

    async def prendre(self, types_agent: list[str]) -> dict[str, Any] | None:
        """Prend la plus ancienne tâche en attente pour ces types d'agent (ou None)."""
        return await self._post("/prendre", {"types_agent": types_agent})

    async def lire(self, tache_id: int) -> dict[str, Any]:
        reponse = await self._http.get(f"/taches/{tache_id}")
        reponse.raise_for_status()
        return reponse.json()

    async def avancer(self, tache_id: int, avancement: str, pourcentage: int | None = None) -> None:
        await self._post(f"/taches/{tache_id}/avancement", {"avancement": avancement, "pourcentage": pourcentage})

    async def questionner(self, tache_id: int, question: str) -> None:
        """Passe la tâche en « besoin de précision ». La réponse arrive dans `reponse` (statut en_cours)."""
        await self._post(f"/taches/{tache_id}/question", {"question": question})

    async def proposer(self, tache_id: int, description_orale: str, diff: Any) -> None:
        """Passe en « attend confirmation ». Rien n'est appliqué avant `decision == "oui"`."""
        await self._post(f"/taches/{tache_id}/proposition", {"description_orale": description_orale, "diff": diff})

    async def terminer(self, tache_id: int, resultat_oral: str, resultat_detail: Any = None,
                       modification_appliquee: bool = False) -> None:
        await self._post(f"/taches/{tache_id}/resultat", {
            "resultat_oral": resultat_oral, "resultat_detail": resultat_detail,
            "modification_appliquee": modification_appliquee})

    async def echouer(self, tache_id: int, erreur: str) -> None:
        await self._post(f"/taches/{tache_id}/echec", {"erreur": erreur})

    # ── attentes ───────────────────────────────────────────────────

    async def attendre_utilisateur(self, tache_id: int, delai_s: float = 600) -> dict[str, Any]:
        """Attend la réponse à une question ou la décision sur une proposition.

        Renvoie la tâche à jour (statut en_cours, avec `reponse` ou `decision`/`correction`).
        Lève TacheArretee si l'utilisateur a refusé ou arrêté.
        """
        async def attente() -> dict[str, Any]:
            async for evt in self.evenements():
                tache = evt["tache"]
                if tache["id"] != tache_id:
                    continue
                if tache["statut"] == "annulee":
                    raise TacheArretee("Arrêtée par l'utilisateur")
                if tache["statut"] == "en_cours":
                    return tache
            raise ConnectionError("Flux interrompu")

        tache = await self.lire(tache_id)
        if tache["statut"] == "annulee":
            raise TacheArretee("Arrêtée par l'utilisateur")
        if tache["statut"] == "en_cours":
            return tache
        return await asyncio.wait_for(attente(), timeout=delai_s)

    async def evenements(self) -> AsyncIterator[dict[str, Any]]:
        """Flux SSE du registre (toutes les tâches) : {"type": ..., "tache": {...}}."""
        async with self._http.stream("GET", "/flux", timeout=None) as reponse:
            reponse.raise_for_status()
            nom = None
            async for ligne in reponse.aiter_lines():
                if ligne.startswith("event:"):
                    nom = ligne[6:].strip()
                elif ligne.startswith("data:") and nom == "tache":
                    yield json.loads(ligne[5:])

    @contextlib.asynccontextmanager
    async def battement(self, tache_id: int, avancement: str) -> AsyncIterator[None]:
        """Republie l'avancement toutes les 10 s pendant une étape longue, et s'arrête si la tâche l'est."""
        await self.avancer(tache_id, avancement)
        tache_courante = asyncio.current_task()

        async def battre() -> None:
            while True:
                await asyncio.sleep(INTERVALLE_BATTEMENT_S)
                try:
                    await self.avancer(tache_id, avancement)
                except (TacheArretee, httpx.HTTPStatusError):
                    if tache_courante is not None:
                        tache_courante.cancel()
                    return

        fond = asyncio.create_task(battre())
        try:
            yield
        finally:
            fond.cancel()

    # ── verrous ────────────────────────────────────────────────────

    @contextlib.asynccontextmanager
    async def verrou(self, ressource: str, tache_id: int, attente_max_s: float = 120) -> AsyncIterator[None]:
        """Verrouille une ressource (ex. `graphe:<id>`) ; une autre tâche d'écriture attend son tour."""
        fin = asyncio.get_running_loop().time() + attente_max_s
        while True:
            reponse = await self._http.post(f"/verrous/{ressource}", json={"tache_id": tache_id})
            if reponse.status_code != 409:
                reponse.raise_for_status()
                break
            if asyncio.get_running_loop().time() > fin:
                raise RessourceVerrouillee(ressource)
            await self.avancer(tache_id, "En attente : une autre modification est en cours sur ce graphe")
            await asyncio.sleep(2)
        try:
            yield
        finally:
            await self._http.delete(f"/verrous/{ressource}", params={"tache_id": tache_id})
