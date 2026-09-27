"""Écriture du graphe d'un espace de travail (projet) dans Supabase. Chaque écriture ajoute une entrée au journal
(append-only). Un nœud n'existe que dans le graphe de son projet : ids et prémisses sont cherchés dans ce projet.

Les refus métier lèvent `ErreurGraphe`, dont le message est renvoyé tel quel à l'agent pour qu'il se corrige.
"""

import re
from typing import Any

from . import figures, lecture, vue
from .client import supabase
from .modeles import Action, TypeNoeud, Validite

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


def _journaliser(
    action: Action, *, projet_id: str, auteur: str, noeud_id: str | None, apres: Any, **champs: Any
) -> None:
    supabase().table("journal").insert(
        {"action": action, "projet_id": projet_id, "auteur": auteur, "noeud_id": noeud_id, "apres": apres, **champs}
    ).execute()


def _existants(projet_id: str, ids: list[str]) -> set[str]:
    if not ids:
        return set()
    lignes = supabase().table("noeuds").select("id").eq("projet_id", projet_id).in_("id", ids).execute().data
    return {r["id"] for r in lignes}


def creer_noeud(
    *,
    projet_id: str,
    id: str,
    nom: str,
    enonce: str,
    admis: bool,
    auteur: str,
    conversation_id: str | None = None,
    raison: str | None = None,
    type: TypeNoeud | None = None,
    details: dict | None = None,
    groupe: str | None = None,
) -> dict:
    """Crée le nœud puis le place dans la vue : dans `groupe` s'il est donné, sinon près de ses voisins."""
    verifier_id(id)
    if _existants(projet_id, [id]):
        raise ErreurGraphe(f"Le nœud {id} existe déjà : consulte-le avec lire_noeud et réutilise-le.")
    ligne = {
        "projet_id": projet_id,
        "id": id,
        "nom": nom,
        "enonce": enonce,
        "admis": admis,
        "conversation_id": conversation_id,
        "type": type,
        "details": details,
    }
    etat = lecture.charger_etat_vue(projet_id)
    if groupe and groupe not in etat.groupes:
        raise ErreurGraphe(f"Cadre inexistant : {groupe}. Crée-le avec organiser_vue (creer_groupe), ou omets groupe.")
    supabase().table("noeuds").insert(ligne).execute()
    _journaliser("creation_noeud", projet_id=projet_id, auteur=auteur, noeud_id=id, apres=ligne, raison=raison)
    etat.noeuds[id] = vue.NoeudVue(id, nom, type)
    _placer(projet_id, etat, id, groupe or ...)
    return ligne


def ajouter_demonstration(
    *,
    projet_id: str,
    noeud_id: str,
    nom_demonstration: str,
    justifie_par: list[str],
    demonstration: str,
    auteur: str,
    roles: dict[str, str] | None = None,
) -> dict:
    """Toute démonstration écrite par un agent démarre « à vérifier ». `roles` donne le rôle des prémisses non
    principales ; un nœud qui n'a pas été placé à la main se replace ensuite à droite de ses prémisses."""
    premisses = normaliser_premisses(noeud_id, justifie_par)
    try:
        roles = vue.valider_roles(premisses, roles)
    except vue.ErreurVue as e:
        raise ErreurGraphe(str(e)) from None
    trouves = _existants(projet_id, [noeud_id, *premisses])
    if noeud_id not in trouves:
        raise ErreurGraphe(f"Nœud inexistant : {noeud_id}. Crée-le d'abord avec creer_noeud.")
    if manquants := [p for p in premisses if p not in trouves]:
        raise ErreurGraphe(f"Prémisses inexistantes : {', '.join(manquants)}. Crée ces nœuds avant de les citer.")
    deja = (
        supabase()
        .table("demonstrations")
        .select("nom_demonstration")
        .eq("projet_id", projet_id)
        .eq("noeud_id", noeud_id)
        .eq("nom_demonstration", nom_demonstration)
        .execute()
        .data
    )
    if deja:
        raise ErreurGraphe(f"Le nœud {noeud_id} a déjà une démonstration nommée « {nom_demonstration} ».")
    ligne = {
        "projet_id": projet_id,
        "noeud_id": noeud_id,
        "nom_demonstration": nom_demonstration,
        "justifie_par": premisses,
        "roles": roles,
        "demonstration": demonstration,
        "validite": "a_verifier",
        "auteur": "ia",
    }
    supabase().table("demonstrations").insert(ligne).execute()
    _journaliser(
        "ajout_demonstration",
        projet_id=projet_id,
        auteur=auteur,
        noeud_id=noeud_id,
        nom_demonstration=nom_demonstration,
        apres=ligne,
    )
    etat = lecture.charger_etat_vue(projet_id)
    place = etat.placements.get(noeud_id)
    if place is None or not place.fixe:
        _placer(projet_id, etat, noeud_id, ...)
    return ligne


def noter_demonstration(
    *,
    projet_id: str,
    noeud_id: str,
    nom_demonstration: str,
    validite: Validite,
    confiance: float,
    justification: str,
    auteur: str,
) -> dict:
    """Verdict du vérificateur ; la justification va dans le journal."""
    demonstration = (
        supabase()
        .table("demonstrations")
        .select("validite, confiance")
        .eq("projet_id", projet_id)
        .eq("noeud_id", noeud_id)
        .eq("nom_demonstration", nom_demonstration)
        .execute()
        .data
    )
    if not demonstration:
        raise ErreurGraphe(f"Démonstration inexistante : {noeud_id} / {nom_demonstration}.")
    apres = {"validite": validite, "confiance": confiance}
    (
        supabase()
        .table("demonstrations")
        .update(apres)
        .eq("projet_id", projet_id)
        .eq("noeud_id", noeud_id)
        .eq("nom_demonstration", nom_demonstration)
        .execute()
    )
    _journaliser(
        "verdict",
        projet_id=projet_id,
        auteur=auteur,
        noeud_id=noeud_id,
        nom_demonstration=nom_demonstration,
        avant=demonstration[0],
        apres=apres,
        raison=justification,
    )
    return apres


# ── Vue du graphe ────────────────────────────────────────────────────────────


def _placer(
    projet_id: str, etat: vue.EtatVue, noeud_id: str, groupe: str | None | Any, largeur: int = 1, hauteur: int = 1
) -> None:
    """Placement automatique d'un nœud (sans journal : c'est la conséquence d'une écriture déjà journalisée)."""
    ancien = etat.placements.get(noeud_id)
    if ancien is not None:
        largeur, hauteur = ancien.largeur, ancien.hauteur
    try:
        place = vue.placer_auto(etat, noeud_id, groupe, largeur, hauteur)
    except vue.ErreurVue:
        return  # la vue le montrera « non placé » ; une réorganisation le rattrapera
    if etat.placements.get(noeud_id) == place:
        return
    etat.placements[noeud_id] = place
    _ecrire_placements(projet_id, [place])


def _ligne_placement(projet_id: str, p: vue.Placement) -> dict:
    return {
        "projet_id": projet_id,
        "noeud_id": p.noeud_id,
        "groupe_id": p.groupe_id,
        "colonne": p.colonne,
        "ligne": p.ligne,
        "largeur": p.largeur,
        "hauteur": p.hauteur,
        "fixe": p.fixe,
    }


def _ecrire_placements(projet_id: str, placements: list[vue.Placement]) -> None:
    lignes = [_ligne_placement(projet_id, p) for p in placements if not vue.est_figure(p.noeud_id)]
    if lignes:
        supabase().table("placements").upsert(lignes, on_conflict="projet_id,noeud_id").execute()
    # La case d'une figure est rangée dans sa propre ligne de `figures`.
    for p in placements:
        if vue.est_figure(p.noeud_id):
            case = {k: v for k, v in _ligne_placement(projet_id, p).items() if k not in ("projet_id", "noeud_id")}
            (
                supabase()
                .table("figures")
                .update(case)
                .eq("projet_id", projet_id)
                .eq("id", p.noeud_id.removeprefix(vue.PREFIXE_FIGURE))
                .execute()
            )


def organiser_vue(*, projet_id: str, operations: list[dict[str, Any]], auteur: str, essai: bool = False) -> dict:
    """Applique des opérations sur la vue, tout ou rien ; `essai` valide sans rien écrire.

    Renvoie le résumé des changements. Les renommages de nœuds modifient `noeuds.nom` (l'id ne change jamais).
    """
    if not operations:
        raise ErreurGraphe("Aucune opération.")
    avant = lecture.charger_etat_vue(projet_id)
    try:
        apres, renommages = vue.appliquer(avant, operations)
    except vue.ErreurVue as e:
        raise ErreurGraphe(str(e)) from None
    diff = vue.differences(avant, apres)
    resume = {
        "cadres_modifies": [g.id for g in diff["groupes"]],
        "cadres_supprimes": diff["groupes_supprimes"],
        "noeuds_places": [p.noeud_id for p in diff["placements"]],
        "noeuds_renommes": sorted(renommages),
        "etiquettes": [e.id for e in diff["etiquettes"]],
        "marques_ajoutees": diff["marques_ajoutees"],
        "marques_retirees": diff["marques_retirees"],
    }
    if essai:
        return {"essai": True, **resume}

    base = supabase()
    # Cadres : parents avant enfants, pour que la clé du parent existe.
    profondeur = {}
    for g in diff["groupes"]:
        d, x = 0, g
        while x.parent_id is not None and x.parent_id in apres.groupes:
            d, x = d + 1, apres.groupes[x.parent_id]
        profondeur[g.id] = d
    for g in sorted(diff["groupes"], key=lambda g: profondeur[g.id]):
        base.table("groupes").upsert(
            {
                "projet_id": projet_id,
                "id": g.id,
                "nom": g.nom,
                "parent_id": g.parent_id,
                "genre": g.genre,
                "couleur": g.couleur,
                "replie": g.replie,
                "ordre": g.ordre,
            },
            on_conflict="projet_id,id",
        ).execute()
    for eid in [e.id for e in diff["etiquettes"]]:
        e = apres.etiquettes[eid]
        base.table("etiquettes").upsert(
            {"projet_id": projet_id, "id": e.id, "nom": e.nom, "couleur": e.couleur}, on_conflict="projet_id,id"
        ).execute()
    _ecrire_placements(projet_id, diff["placements"])
    for nid, nom in renommages.items():
        if vue.est_figure(nid):
            fid = nid.removeprefix(vue.PREFIXE_FIGURE)
            base.table("figures").update({"titre": nom}).eq("projet_id", projet_id).eq("id", fid).execute()
        else:
            base.table("noeuds").update({"nom": nom}).eq("projet_id", projet_id).eq("id", nid).execute()
    for nid, eid in diff["marques_ajoutees"]:
        base.table("noeuds_etiquettes").upsert(
            {"projet_id": projet_id, "noeud_id": nid, "etiquette_id": eid},
            on_conflict="projet_id,noeud_id,etiquette_id",
        ).execute()
    for nid, eid in diff["marques_retirees"]:
        (
            base.table("noeuds_etiquettes")
            .delete()
            .eq("projet_id", projet_id)
            .eq("noeud_id", nid)
            .eq("etiquette_id", eid)
            .execute()
        )
    for gid in diff["groupes_supprimes"]:
        base.table("groupes").delete().eq("projet_id", projet_id).eq("id", gid).execute()
    _journaliser("vue", projet_id=projet_id, auteur=auteur, noeud_id=None, apres={"operations": operations, **resume})
    return resume


# ── Figures ──────────────────────────────────────────────────────────────────


def creer_figure(
    *,
    projet_id: str,
    id: str,
    noeud_id: str,
    titre: str,
    auteur: str,
    legende: str | None = None,
    trace: dict | None = None,
    image: bytes | None = None,
    source: str | None = None,
    groupe: str | None = None,
    largeur: int | None = None,
    hauteur: int | None = None,
    conversation_id: str | None = None,
    remplacer: bool = False,
) -> dict:
    """Crée (ou remplace) une figure qui illustre `noeud_id`, puis la place dans la vue : dans `groupe` s'il est
    donné, sinon dans le cadre de son nœud, juste à droite de lui. Remplacer garde sa case et son cadre."""
    verifier_id(id)
    if not titre.strip():
        raise ErreurGraphe("Une figure a besoin d'un titre.")
    if trace is None and image is None:
        raise ErreurGraphe("Une figure est un tracé (trace), une image, ou les deux.")
    try:
        trace = figures.valider_trace(trace) if trace is not None else None
        examen = figures.examiner_image(image) if image is not None else None
        if largeur is not None:
            vue._taille(largeur, "Largeur")
        if hauteur is not None:
            vue._taille(hauteur, "Hauteur")
    except (figures.ErreurFigure, vue.ErreurVue) as e:
        raise ErreurGraphe(str(e)) from None
    cites = figures.noeuds_cites(trace) if trace else set()
    trouves = _existants(projet_id, [noeud_id, *cites])
    if noeud_id not in trouves:
        raise ErreurGraphe(f"Nœud inexistant : {noeud_id}. Une figure illustre un nœud existant.")
    if manquants := sorted(cites - trouves):
        raise ErreurGraphe(f"Paramètres rattachés à des nœuds inexistants : {', '.join(manquants)}.")
    ancienne = lecture.lire_figure(projet_id, id)
    if ancienne is not None and not remplacer:
        raise ErreurGraphe(f"La figure {id} existe déjà : passe remplacer=true pour la remplacer.")
    etat = lecture.charger_etat_vue(projet_id)
    if groupe and groupe not in etat.groupes:
        raise ErreurGraphe(f"Cadre inexistant : {groupe}. Crée-le avec organiser_vue (creer_groupe), ou omets groupe.")

    ligne: dict[str, Any] = {
        "projet_id": projet_id,
        "id": id,
        "noeud_id": noeud_id,
        "titre": titre.strip(),
        "legende": (legende or "").strip() or None,
        "trace": trace,
        "source": (source or "").strip() or None,
        "conversation_id": conversation_id,
        "image_chemin": None,
        "image_type": None,
        "image_largeur": None,
        "image_hauteur": None,
    }
    if examen is not None:
        mime, l, h = examen
        chemin = f"{projet_id}/{id}.{figures.EXTENSIONS[mime]}"
        supabase().storage.from_("figures").upload(
            chemin, image, {"content-type": mime, "upsert": "true", "cache-control": "3600"}
        )
        ligne |= {"image_chemin": chemin, "image_type": mime, "image_largeur": l, "image_hauteur": h}
    if ancienne is not None and ancienne["image_chemin"] and ancienne["image_chemin"] != ligne["image_chemin"]:
        supabase().storage.from_("figures").remove([ancienne["image_chemin"]])
    ligne |= {k: v for k, v in {"largeur": largeur, "hauteur": hauteur}.items() if v is not None}
    if ancienne is None:
        supabase().table("figures").insert(ligne).execute()
    else:
        ligne["version"] = ancienne["version"] + 1
        supabase().table("figures").update(ligne).eq("projet_id", projet_id).eq("id", id).execute()
    journal = {k: v for k, v in ligne.items() if k != "trace"} | {"series": len(trace["series"]) if trace else 0}
    _journaliser("figure", projet_id=projet_id, auteur=auteur, noeud_id=noeud_id, apres=journal)

    fid = vue.PREFIXE_FIGURE + id
    etat.noeuds[fid] = vue.NoeudVue(fid, ligne["titre"], "figure", None, ((noeud_id, "principale"),))
    if (largeur, hauteur) != (None, None):
        etat.placements.pop(fid, None)  # nouvelle taille : on lui cherche une place qui la contienne
    if fid not in etat.placements:
        l_defaut, h_defaut = vue.TAILLE_FIGURE
        cadre = groupe or (p.groupe_id if (p := etat.placements.get(noeud_id)) else None)
        try:
            place = vue.placer_figure(etat, fid, cadre, largeur or l_defaut, hauteur or h_defaut)
        except vue.ErreurVue:
            return ligne  # la vue la montrera « non placée » ; une réorganisation la rattrapera
        _ecrire_placements(projet_id, [place])
    return ligne
