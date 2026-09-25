"""Accès au graphe dans Supabase. Chaque écriture ajoute une entrée au journal."""

import re
from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from . import config
from .modele import ID_PATTERN, Demonstration, Noeud, Validite
from .validite import calculer_statuts


class ErreurGraphe(Exception):
    """Refus métier, renvoyé tel quel à l'agent (ou en 400 par l'API)."""


@lru_cache
def db() -> Client:
    return create_client(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY)


def journaliser(
    action: str,
    *,
    auteur: str,
    noeud_id: str | None = None,
    nom_demonstration: str | None = None,
    avant: Any = None,
    apres: Any = None,
    raison: str | None = None,
) -> None:
    db().table("journal").insert(
        {
            "action": action,
            "noeud_id": noeud_id,
            "nom_demonstration": nom_demonstration,
            "avant": avant,
            "apres": apres,
            "raison": raison,
            "auteur": auteur,
        }
    ).execute()


# ─────────────────────────────────────────────────────────────
# Lecture
# ─────────────────────────────────────────────────────────────

_CHAMPS_DEMO = ("nom_demonstration", "justifie_par", "demonstration", "validite", "auteur")


def charger() -> list[Noeud]:
    noeuds = db().table("noeuds").select("*").order("cree_le").execute().data
    demos = db().table("demonstrations").select("*").order("cree_le").execute().data
    par_noeud: dict[str, list[Demonstration]] = {}
    for d in demos:
        par_noeud.setdefault(d["noeud_id"], []).append(Demonstration(**{k: d[k] for k in _CHAMPS_DEMO}))
    return [
        Noeud(id=n["id"], nom=n["nom"], enonce=n["enonce"], admis=n["admis"], demonstrations=par_noeud.get(n["id"], []))
        for n in noeuds
    ]


def vue_compacte() -> list[dict]:
    """Graphe sans le texte des démonstrations, avec la validité effective."""
    noeuds = charger()
    statuts = calculer_statuts(noeuds)
    return [
        {
            "id": n.id,
            "nom": n.nom,
            "enonce": n.enonce,
            "admis": n.admis,
            "statut": statuts[n.id],
            "demonstrations": [
                {"nom_demonstration": d.nom_demonstration, "justifie_par": d.justifie_par, "validite": d.validite}
                for d in n.demonstrations
            ],
        }
        for n in noeuds
    ]


def derniers_verdicts(noeud_id: str) -> dict[str, str]:
    """Raison du dernier verdict de chaque démonstration du nœud."""
    lignes = (
        db()
        .table("journal")
        .select("nom_demonstration, raison")
        .eq("noeud_id", noeud_id)
        .eq("action", "verdict")
        .order("id", desc=True)
        .execute()
        .data
    )
    raisons: dict[str, str] = {}
    for l in lignes:
        raisons.setdefault(l["nom_demonstration"], l["raison"])
    return raisons


def detail_noeud(noeud_id: str) -> dict:
    noeuds = charger()
    par_id = {n.id: n for n in noeuds}
    n = par_id.get(noeud_id)
    if n is None:
        raise ErreurGraphe(f"Nœud inexistant : {noeud_id}")
    statuts = calculer_statuts(noeuds)
    verdicts = derniers_verdicts(noeud_id)
    return {
        "id": n.id,
        "nom": n.nom,
        "enonce": n.enonce,
        "admis": n.admis,
        "statut": statuts[n.id],
        "demonstrations": [
            {
                **d.model_dump(),
                "premisses": [
                    {"id": p, "nom": par_id[p].nom, "enonce": par_id[p].enonce, "statut": statuts[p]}
                    for p in d.justifie_par
                    if p in par_id
                ],
                "raison_dernier_verdict": verdicts.get(d.nom_demonstration),
            }
            for d in n.demonstrations
        ],
        "utilise_par": sorted(
            {m.id for m in noeuds for d in m.demonstrations if noeud_id in d.justifie_par}
        ),
    }


# ─────────────────────────────────────────────────────────────
# Écriture
# ─────────────────────────────────────────────────────────────


def _existe(noeud_id: str) -> bool:
    return bool(db().table("noeuds").select("id").eq("id", noeud_id).execute().data)


def creer_noeud(*, id: str, nom: str, enonce: str, admis: bool, auteur: str, raison: str | None = None) -> dict:
    if not re.match(ID_PATTERN, id):
        raise ErreurGraphe(f"Id invalide « {id} » : uniquement minuscules, chiffres et _ (ex. lemme_borne).")
    if _existe(id):
        raise ErreurGraphe(f"Le nœud {id} existe déjà. Utilise lire_noeud pour le consulter.")
    ligne = {"id": id, "nom": nom, "enonce": enonce, "admis": admis}
    db().table("noeuds").insert(ligne).execute()
    journaliser("creation_noeud", auteur=auteur, noeud_id=id, apres=ligne, raison=raison)
    return ligne


def ajouter_demonstration(
    *, noeud_id: str, nom_demonstration: str, justifie_par: list[str], demonstration: str, auteur: str
) -> dict:
    """Toute démonstration ajoutée par un agent démarre en a_verifier."""
    if not _existe(noeud_id):
        raise ErreurGraphe(f"Nœud inexistant : {noeud_id}. Crée-le d'abord avec creer_noeud.")
    justifie_par = list(dict.fromkeys(justifie_par))  # dédoublonne en gardant l'ordre
    if noeud_id in justifie_par:
        raise ErreurGraphe("Un nœud ne peut pas figurer parmi ses propres prémisses.")
    if justifie_par:
        trouves = {r["id"] for r in db().table("noeuds").select("id").in_("id", justifie_par).execute().data}
        manquants = [p for p in justifie_par if p not in trouves]
        if manquants:
            raise ErreurGraphe(
                f"Prémisses inexistantes : {', '.join(manquants)}. Crée ces nœuds avant de les citer."
            )
    deja = (
        db()
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
        "justifie_par": justifie_par,
        "demonstration": demonstration,
        "validite": "a_verifier",
        "auteur": "ia",
    }
    db().table("demonstrations").insert(ligne).execute()
    journaliser(
        "ajout_demonstration", auteur=auteur, noeud_id=noeud_id, nom_demonstration=nom_demonstration, apres=ligne
    )
    return ligne


def rendre_verdict(*, noeud_id: str, nom_demonstration: str, validite: Validite, raison: str, auteur: str) -> dict:
    avant = (
        db()
        .table("demonstrations")
        .select("validite")
        .eq("noeud_id", noeud_id)
        .eq("nom_demonstration", nom_demonstration)
        .execute()
        .data
    )
    if not avant:
        raise ErreurGraphe(f"Démonstration inexistante : {noeud_id} / « {nom_demonstration} ».")
    db().table("demonstrations").update({"validite": validite}).eq("noeud_id", noeud_id).eq(
        "nom_demonstration", nom_demonstration
    ).execute()
    journaliser(
        "verdict",
        auteur=auteur,
        noeud_id=noeud_id,
        nom_demonstration=nom_demonstration,
        avant=avant[0],
        apres={"validite": validite},
        raison=raison,
    )
    return {"noeud_id": noeud_id, "nom_demonstration": nom_demonstration, "validite": validite}


# ─────────────────────────────────────────────────────────────
# Export / import
# ─────────────────────────────────────────────────────────────


def exporter() -> list[dict]:
    return [n.model_dump() for n in charger()]


def importer(noeuds: list[Noeud], auteur: str = "import") -> dict:
    """Upsert : les nœuds d'abord (pour que les prémisses existent), puis les démonstrations."""
    ids_importes = {n.id for n in noeuds}
    ids_connus = ids_importes | {r["id"] for r in db().table("noeuds").select("id").execute().data}
    for n in noeuds:
        for d in n.demonstrations:
            manquants = [p for p in d.justifie_par if p not in ids_connus]
            if manquants:
                raise ErreurGraphe(f"{n.id} / « {d.nom_demonstration} » : prémisses inexistantes {manquants}")

    if noeuds:
        db().table("noeuds").upsert(
            [{"id": n.id, "nom": n.nom, "enonce": n.enonce, "admis": n.admis} for n in noeuds]
        ).execute()
    demos = [{"noeud_id": n.id, **d.model_dump()} for n in noeuds for d in n.demonstrations]
    if demos:
        db().table("demonstrations").upsert(demos).execute()
    for n in noeuds:
        journaliser("import", auteur=auteur, noeud_id=n.id, apres=n.model_dump())
    return {"noeuds": len(noeuds), "demonstrations": len(demos)}
