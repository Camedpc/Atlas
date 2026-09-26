"""Registre sur Postgres (Supabase) : table `taches` + LISTEN/NOTIFY sur le canal `taches`.

Les notifications viennent du trigger `taches_notifier` : une écriture faite directement
en base par un agent ou par le chat texte réveille Atlas comme une écriture faite ici.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import timedelta
from typing import Any

import asyncpg

from .modele import STATUTS_ACTIFS, STATUTS_ATTENTE_UTILISATEUR, Statut, Tache
from .stockage import Stockage

log = logging.getLogger(__name__)

COLONNES_JSON = {"contexte", "modification_proposee", "resultat_detail"}


def _vers_sql(champs: dict[str, Any]) -> dict[str, Any]:
    res = {}
    for cle, valeur in champs.items():
        if hasattr(valeur, "model_dump"):
            valeur = valeur.model_dump(mode="json")
        if isinstance(valeur, Statut):
            valeur = valeur.value
        res[cle] = valeur
    return res


def _depuis_ligne(ligne: asyncpg.Record) -> Tache:
    return Tache.model_validate(dict(ligne))


class StockagePostgres(Stockage):
    def __init__(self, dsn: str) -> None:
        super().__init__()
        self._dsn = dsn
        self._pool: asyncpg.Pool | None = None
        self._ecoute: asyncpg.Connection | None = None
        self._taches_fond: set[asyncio.Task] = set()

    @staticmethod
    async def _init_connexion(conn: asyncpg.Connection) -> None:
        await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")

    async def demarrer(self) -> None:
        # statement_cache_size=0 : compatible avec le pooler de Supabase (mode transaction).
        self._pool = await asyncpg.create_pool(
            self._dsn, min_size=1, max_size=10, init=self._init_connexion, statement_cache_size=0
        )
        await self._ecouter()

    async def _ecouter(self) -> None:
        # LISTEN demande une connexion dédiée et persistante (pas le pooler transactionnel).
        self._ecoute = await asyncpg.connect(self._dsn, statement_cache_size=0)
        await self._ecoute.add_listener("taches", self._sur_notification)
        self._ecoute.add_termination_listener(lambda _conn: self._relancer_ecoute())
        log.info("Registre : écoute du canal `taches` active")

    def _relancer_ecoute(self) -> None:
        async def relance() -> None:
            while True:
                try:
                    await self._ecouter()
                    return
                except Exception:
                    log.exception("Reconnexion LISTEN impossible, nouvel essai dans 2 s")
                    await asyncio.sleep(2)

        tache = asyncio.get_running_loop().create_task(relance())
        self._taches_fond.add(tache)
        tache.add_done_callback(self._taches_fond.discard)

    def _sur_notification(self, _conn, _pid, _canal, charge: str) -> None:
        tache = asyncio.get_running_loop().create_task(self._notifier(int(charge)))
        self._taches_fond.add(tache)
        tache.add_done_callback(self._taches_fond.discard)

    async def arreter(self) -> None:
        if self._ecoute is not None:
            await self._ecoute.close()
        if self._pool is not None:
            await self._pool.close()

    @property
    def pool(self) -> asyncpg.Pool:
        assert self._pool is not None, "stockage non démarré"
        return self._pool

    async def creer(self, champs: dict[str, Any]) -> Tache:
        valeurs = _vers_sql(champs)
        cles = list(valeurs)
        requete = (
            f"insert into taches ({', '.join(cles)}) "
            f"values ({', '.join(f'${i + 1}' for i in range(len(cles)))}) returning *"
        )
        ligne = await self.pool.fetchrow(requete, *valeurs.values())
        return _depuis_ligne(ligne)

    async def obtenir(self, tache_id: int) -> Tache | None:
        ligne = await self.pool.fetchrow("select * from taches where id = $1", tache_id)
        return _depuis_ligne(ligne) if ligne else None

    async def lister(self, utilisateur_id=None, statuts=None, depuis=None, limite=50) -> list[Tache]:
        conditions, params = [], []
        if utilisateur_id is not None:
            params.append(utilisateur_id)
            conditions.append(f"utilisateur_id = ${len(params)}")
        if statuts is not None:
            params.append([s.value for s in statuts])
            conditions.append(f"statut = any(${len(params)})")
        if depuis is not None:
            params.append(depuis)
            conditions.append(f"maj_le >= ${len(params)}")
        params.append(limite)
        where = f"where {' and '.join(conditions)}" if conditions else ""
        lignes = await self.pool.fetch(
            f"select * from taches {where} order by maj_le desc, id desc limit ${len(params)}", *params
        )
        return [_depuis_ligne(ligne) for ligne in lignes]

    async def modifier(self, tache_id, champs, statuts_attendus=None) -> Tache | None:
        valeurs = _vers_sql(champs)
        affectations = [f"{cle} = ${i + 2}" for i, cle in enumerate(valeurs)]
        affectations.append("maj_le = now()")
        params: list[Any] = [tache_id, *valeurs.values()]
        condition = ""
        if statuts_attendus is not None:
            params.append([s.value for s in statuts_attendus])
            condition = f" and statut = any(${len(params)})"
        ligne = await self.pool.fetchrow(
            f"update taches set {', '.join(affectations)} where id = $1{condition} returning *", *params
        )
        return _depuis_ligne(ligne) if ligne else None

    async def prendre_prochaine(self, types_agent) -> Tache | None:
        ligne = await self.pool.fetchrow(
            """
            update taches set statut = 'en_cours', maj_le = now()
            where id = (
              select id from taches
              where statut = 'en_attente' and type_agent = any($1)
              order by id
              for update skip locked
              limit 1
            )
            returning *
            """,
            list(types_agent),
        )
        return _depuis_ligne(ligne) if ligne else None

    async def expirer(self, delai: timedelta) -> list[Tache]:
        surveilles = [s.value for s in STATUTS_ACTIFS - STATUTS_ATTENTE_UTILISATEUR]
        lignes = await self.pool.fetch(
            """
            update taches set
              statut = 'echouee',
              erreur = 'Aucune nouvelle de l''agent depuis plus de deux minutes.',
              annoncee = (canal <> 'vocal'),
              termine_le = now(),
              maj_le = now()
            where statut = any($1) and maj_le < now() - $2::interval
            returning *
            """,
            surveilles,
            delai,
        )
        return [_depuis_ligne(ligne) for ligne in lignes]

    async def prendre_verrou(self, ressource: str, tache_id: int) -> bool:
        async with self.pool.acquire() as conn, conn.transaction():
            # Un verrou tenu par une tâche finie est libéré d'office.
            await conn.execute(
                """
                delete from verrous v using taches t
                where v.ressource = $1 and t.id = v.tache_id
                  and t.statut in ('terminee', 'echouee', 'annulee')
                """,
                ressource,
            )
            ligne = await conn.fetchrow(
                """
                insert into verrous (ressource, tache_id) values ($1, $2)
                on conflict (ressource) do update set tache_id = excluded.tache_id
                  where verrous.tache_id = excluded.tache_id
                returning tache_id
                """,
                ressource,
                tache_id,
            )
            return ligne is not None

    async def liberer_verrou(self, ressource: str, tache_id: int) -> None:
        await self.pool.execute("delete from verrous where ressource = $1 and tache_id = $2", ressource, tache_id)
