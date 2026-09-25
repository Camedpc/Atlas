"""Lecture du graphe dans Supabase.

Le statut d'un nœud dépend de tout le graphe (il se propage par les prémisses) :
toute lecture qui renvoie un statut charge donc le graphe entier, en un seul instantané.
"""

from collections.abc import Callable

from postgrest import SyncSelectRequestBuilder

from . import graphe
from .client import supabase
from .modeles import Demonstration, DetailNoeud, EntreeJournal, Graphe, LigneNoeud

# Nombre maximal de lignes que Supabase renvoie par requête (réglage par défaut de l'API).
TAILLE_PAGE = 1000


def _toutes_les_lignes(requete: Callable[[], SyncSelectRequestBuilder]) -> list[dict]:
    """Enchaîne les pages. `requete` doit trier sur une clé unique pour que la pagination soit stable."""
    lignes: list[dict] = []
    while True:
        page = requete().range(len(lignes), len(lignes) + TAILLE_PAGE - 1).execute().data
        lignes.extend(page)
        if len(page) < TAILLE_PAGE:
            return lignes


def lister_noeuds() -> list[LigneNoeud]:
    lignes = _toutes_les_lignes(lambda: supabase().table("noeuds").select("*").order("id"))
    return [LigneNoeud.model_validate(l) for l in lignes]


def lister_demonstrations(noeud_id: str | None = None) -> list[Demonstration]:
    def requete() -> SyncSelectRequestBuilder:
        q = supabase().table("demonstrations").select("*")
        if noeud_id is not None:
            q = q.eq("noeud_id", noeud_id)
        return q.order("noeud_id").order("nom_demonstration")

    return [Demonstration.model_validate(l) for l in _toutes_les_lignes(requete)]


def charger_graphe() -> Graphe:
    return graphe.assembler(lister_noeuds(), lister_demonstrations())


def lire_noeud(noeud_id: str) -> DetailNoeud | None:
    return graphe.detailler(charger_graphe(), noeud_id)


def lire_journal(
    *, noeud_id: str | None = None, limite: int = 50, avant_id: int | None = None
) -> list[EntreeJournal]:
    """Entrées les plus récentes d'abord. Pour la page suivante, passer `avant_id` = id de la dernière reçue."""
    q = supabase().table("journal").select("*")
    if noeud_id is not None:
        q = q.eq("noeud_id", noeud_id)
    if avant_id is not None:
        q = q.lt("id", avant_id)
    lignes = q.order("id", desc=True).limit(limite).execute().data
    return [EntreeJournal.model_validate(l) for l in lignes]


def verifier_connexion() -> None:
    """Lève une exception si Supabase est injoignable ou si le schéma est absent."""
    supabase().table("noeuds").select("id").limit(1).execute()
