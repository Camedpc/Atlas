"""Écriture du graphe dans Supabase. Chaque écriture ajoute une entrée au journal (append-only).

Les refus métier lèvent `ErreurGraphe`, dont le message est renvoyé tel quel à l'agent pour qu'il se corrige.
"""

import re
from typing import Any

from .client import supabase
from .modeles import Action

MOTIF_ID = re.compile(r"^[a-z0-9_]+$")


class ErreurGraphe(Exception):
    pass


# ── Vérifications pures ──────────────────────────────────────────────────────


def verifier_id(noeud_id: str) -> None:
    if not MOTIF_ID.match(noeud_id):
        raise ErreurGraphe(f"Id invalide « {noeud_id} » : uniquement minuscules, chiffres et _ (ex. lemme_borne).")


def normaliser_premisses(noeud_id: str, justifie_par: list[str]) -> list[str]:
    premisses = list(dict.fromkeys(justifie_par))  # dédoublonne en gardant l'ordre
    if noeud_id in premisses:
        raise ErreurGraphe("Un nœud ne peut pas figurer parmi ses propres prémisses.")
    return premisses


# ── Écritures ────────────────────────────────────────────────────────────────


def _journaliser(action: Action, *, auteur: str, noeud_id: str, apres: Any, **champs: Any) -> None:
    supabase().table("journal").insert(
        {"action": action, "auteur": auteur, "noeud_id": noeud_id, "apres": apres, **champs}
    ).execute()


def _existants(ids: list[str]) -> set[str]:
    if not ids:
        return set()
    return {r["id"] for r in supabase().table("noeuds").select("id").in_("id", ids).execute().data}


def creer_noeud(
    *,
    id: str,
    nom: str,
    enonce: str,
    admis: bool,
    auteur: str,
    conversation_id: str | None = None,
    raison: str | None = None,
) -> dict:
    verifier_id(id)
    if _existants([id]):
        raise ErreurGraphe(f"Le nœud {id} existe déjà : consulte-le avec lire_noeud et réutilise-le.")
    ligne = {"id": id, "nom": nom, "enonce": enonce, "admis": admis, "conversation_id": conversation_id}
    supabase().table("noeuds").insert(ligne).execute()
    _journaliser("creation_noeud", auteur=auteur, noeud_id=id, apres=ligne, raison=raison)
    return ligne


def ajouter_demonstration(
    *, noeud_id: str, nom_demonstration: str, justifie_par: list[str], demonstration: str, auteur: str
) -> dict:
    """Toute démonstration écrite par un agent démarre « à vérifier »."""
    premisses = normaliser_premisses(noeud_id, justifie_par)
    trouves = _existants([noeud_id, *premisses])
    if noeud_id not in trouves:
        raise ErreurGraphe(f"Nœud inexistant : {noeud_id}. Crée-le d'abord avec creer_noeud.")
    if manquants := [p for p in premisses if p not in trouves]:
        raise ErreurGraphe(f"Prémisses inexistantes : {', '.join(manquants)}. Crée ces nœuds avant de les citer.")
    deja = (
        supabase()
        .table("demonstrations")
        .select("nom_demonstration")
        .eq("noeud_id", noeud_id)
        .eq("nom_demonstration", nom_demonstration)
        .execute()
        .data
    )
    if deja:
        raise ErreurGraphe(f"Le nœud {noeud_id} a déjà une démonstration nommée « {nom_demonstration} ».")
    ligne = {
        "noeud_id": noeud_id,
        "nom_demonstration": nom_demonstration,
        "justifie_par": premisses,
        "demonstration": demonstration,
        "validite": "a_verifier",
        "auteur": "ia",
    }
    supabase().table("demonstrations").insert(ligne).execute()
    _journaliser(
        "ajout_demonstration", auteur=auteur, noeud_id=noeud_id, nom_demonstration=nom_demonstration, apres=ligne
    )
    return ligne
