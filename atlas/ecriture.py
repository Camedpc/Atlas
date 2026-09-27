"""Écriture du graphe d'un espace de travail (projet) dans Supabase. Chaque écriture ajoute une entrée au journal
(append-only). Un nœud n'existe que dans le graphe de son projet : ids et prémisses sont cherchés dans ce projet.

Les refus métier lèvent `ErreurGraphe`, dont le message est renvoyé tel quel à l'agent pour qu'il se corrige.
"""

import re
from dataclasses import replace
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


def _ecrire_groupes(projet_id: str, etat: vue.EtatVue, groupes: list[vue.Groupe]) -> None:
    """Cadres en une requête, parents avant enfants (la clé du parent existe à la fin de l'instruction)."""

    def profondeur(g: vue.Groupe) -> int:
        d = 0
        while g.parent_id is not None and g.parent_id in etat.groupes:
            d, g = d + 1, etat.groupes[g.parent_id]
        return d

    lignes = [
        {
            "projet_id": projet_id,
            "id": g.id,
            "nom": g.nom,
            "parent_id": g.parent_id,
            "genre": g.genre,
            "couleur": g.couleur,
            "replie": g.replie,
            "ordre": g.ordre,
        }
        for g in sorted(groupes, key=profondeur)
    ]
    if lignes:
        supabase().table("groupes").upsert(lignes, on_conflict="projet_id,id").execute()


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
    _ecrire_groupes(projet_id, apres, diff["groupes"])
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
        if (largeur, hauteur) != (None, None):
            vue.verifier_format(largeur or vue.TAILLE_FIGURE[0], hauteur or vue.TAILLE_FIGURE[1])
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

# ── Graphe entier d'un coup ──────────────────────────────────────────────────

# Types qui n'ont pas à être démontrés : un nœud d'un autre type, ni admis ni démontré, est signalé.
TYPES_SANS_DEMONSTRATION = ("hypothese", "choix_modelisation", "conjecture", "decision")


def planifier_graphe(
    etat: vue.EtatVue,
    demonstrations_existantes: set[tuple[str, str]],
    *,
    projet_id: str,
    cadres: list[dict[str, Any]],
    noeuds: list[dict[str, Any]],
    demonstrations: list[dict[str, Any]],
    conversation_id: str | None = None,
) -> dict[str, Any]:
    """Valide en mémoire un lot de cadres, nœuds et démonstrations, et calcule la vue qui en résulte (fonction
    pure). `etat` : la vue actuelle (tous les nœuds de l'espace) ; `demonstrations_existantes` : couples
    (noeud_id, nom_demonstration) déjà en base pour les nœuds visés.

    Les cadres créés et leurs nœuds sont mis en page d'un coup (`vue.disposer`), à la suite du reste ; un nœud
    rangé dans un cadre existant s'y place à droite de ses prémisses. Lève `ErreurGraphe` au premier problème, en
    le situant (« noeuds[3] », « demonstrations[7] »)."""
    apres = etat.copie()
    operations = []
    for i, c in enumerate(cadres):
        op = {"ordre": i, **c, "op": "creer_groupe"}
        try:
            vue.appliquer_une(apres, op)
        except vue.ErreurVue as e:
            raise ErreurGraphe(f"cadres[{i}] ({c.get('id', '?')}) : {e}") from None
        operations.append(op)

    lignes_noeuds: list[dict[str, Any]] = []
    raisons: dict[str, str | None] = {}
    nouveaux: dict[str, str | None] = {}
    for i, n in enumerate(noeuds):
        ou = f"noeuds[{i}] ({n.get('id', '?')})"
        nid = str(n.get("id") or "")
        try:
            verifier_id(nid)
        except ErreurGraphe as e:
            raise ErreurGraphe(f"{ou} : {e}") from None
        if nid in apres.noeuds:
            quoi = "figure deux fois dans le lot" if nid in nouveaux else "existe déjà : réutilise-le (lire_noeud)"
            raise ErreurGraphe(f"{ou} : le nœud {nid} {quoi}.")
        nom, enonce = str(n.get("nom") or "").strip(), str(n.get("enonce") or "").strip()
        if not nom or not enonce:
            raise ErreurGraphe(f"{ou} : nom et enonce sont obligatoires.")
        admis = bool(n.get("admis", False))
        raison = str(n.get("raison_admis") or "").strip() or None
        if admis and raison is None:
            raise ErreurGraphe(f"{ou} : un nœud admis doit avoir une raison_admis (définition, axiome, source…).")
        groupe = n.get("groupe") or None
        if groupe is not None and groupe not in apres.groupes:
            raise ErreurGraphe(f"{ou} : cadre inexistant « {groupe} » ; déclare-le dans cadres.")
        type_noeud = n.get("type") or None
        lignes_noeuds.append(
            {
                "projet_id": projet_id,
                "id": nid,
                "nom": nom,
                "enonce": enonce,
                "admis": admis,
                "conversation_id": conversation_id,
                "type": type_noeud,
                "details": n.get("details") or None,
            }
        )
        raisons[nid] = raison
        nouveaux[nid] = groupe
        apres.noeuds[nid] = vue.NoeudVue(nid, nom, type_noeud)

    lignes_demonstrations: list[dict[str, Any]] = []
    deja = set(demonstrations_existantes)
    for i, d in enumerate(demonstrations):
        noeud_id = str(d.get("noeud_id") or "")
        nom = str(d.get("nom_demonstration") or "").strip()
        ou = f"demonstrations[{i}] ({noeud_id} / {nom or '?'})"
        try:
            premisses = normaliser_premisses(noeud_id, list(d.get("justifie_par") or []))
            roles = vue.valider_roles(premisses, d.get("roles"))
        except (ErreurGraphe, vue.ErreurVue) as e:
            raise ErreurGraphe(f"{ou} : {e}") from None
        if noeud_id not in apres.noeuds:
            raise ErreurGraphe(f"{ou} : nœud inexistant ; ajoute-le à noeuds.")
        if manquants := [p for p in premisses if p not in apres.noeuds]:
            raise ErreurGraphe(f"{ou} : prémisses inexistantes {', '.join(manquants)} ; ajoute-les à noeuds.")
        if not premisses:
            raise ErreurGraphe(f"{ou} : justifie_par est vide ; un nœud sans prémisse est une hypothèse ou est admis.")
        if not nom or not str(d.get("demonstration") or "").strip():
            raise ErreurGraphe(f"{ou} : nom_demonstration et demonstration sont obligatoires.")
        if (noeud_id, nom) in deja:
            raise ErreurGraphe(f"{ou} : le nœud a déjà une démonstration de ce nom.")
        deja.add((noeud_id, nom))
        lignes_demonstrations.append(
            {
                "projet_id": projet_id,
                "noeud_id": noeud_id,
                "nom_demonstration": nom,
                "justifie_par": premisses,
                "roles": roles,
                "demonstration": str(d["demonstration"]).strip(),
                "validite": "a_verifier",
                "auteur": "ia",
            }
        )
        # Prémisses vues par la mise en page : le rôle le plus fort l'emporte, comme à la lecture.
        noeud = apres.noeuds[noeud_id]
        forts = dict(noeud.premisses)
        for p in premisses:
            role = roles.get(p, "principale")
            if p not in forts or vue.ROLES.index(role) < vue.ROLES.index(forts[p]):
                forts[p] = role
        apres.noeuds[noeud_id] = replace(noeud, premisses=tuple(forts.items()))

    # Mise en page : les cadres de premier niveau créés ici (avec leurs nœuds) et les nouveaux nœuds hors cadre
    # d'un bloc ; les nouveaux nœuds des cadres existants un par un, dans l'ordre logique.
    crees = {op["id"] for op in operations}

    def racine(gid: str) -> str:
        while (parent := apres.groupes[gid].parent_id) is not None:
            gid = parent
        return gid

    racines = sorted((g for g in crees if apres.groupes[g].parent_id is None), key=lambda g: apres.groupes[g].ordre)
    racines += [nid for nid, g in nouveaux.items() if g is None]
    dans_le_bloc = {nid: g for nid, g in nouveaux.items() if g is None or racine(g) in crees}
    try:
        if racines:
            apres = vue.disposer(apres, racines, dans_le_bloc)
        for nid in vue.ordre_logique(apres, [n for n in nouveaux if n not in dans_le_bloc]):
            apres.placements[nid] = vue.placer_auto(apres, nid, nouveaux[nid])
    except vue.ErreurVue as e:
        raise ErreurGraphe(f"Mise en page impossible : {e}") from None
    if problemes := vue.conflits(apres):
        raise ErreurGraphe("La vue obtenue a des conflits : " + " ; ".join(problemes[:6]))

    demontres = {d["noeud_id"] for d in lignes_demonstrations}
    utilises = {p for d in lignes_demonstrations for p in d["justifie_par"]}
    avertissements = [
        f"{l['id']} ({l['type'] or 'sans type'}) n'est ni admis ni démontré"
        for l in lignes_noeuds
        if not l["admis"] and l["id"] not in demontres and l["type"] not in TYPES_SANS_DEMONSTRATION
    ]
    avertissements += [
        f"{l['id']} n'est relié à rien" for l in lignes_noeuds if l["id"] not in demontres | utilises
    ]
    return {
        "etat": apres,
        "operations": operations,
        "noeuds": lignes_noeuds,
        "raisons": raisons,
        "demonstrations": lignes_demonstrations,
        "avertissements": avertissements,
    }


def poser_graphe(
    *,
    projet_id: str,
    cadres: list[dict[str, Any]],
    noeuds: list[dict[str, Any]],
    demonstrations: list[dict[str, Any]],
    auteur: str,
    conversation_id: str | None = None,
    essai: bool = False,
) -> dict[str, Any]:
    """Écrit d'un coup des cadres, des nœuds et des démonstrations, et leur mise en page : tout est validé avant la
    première écriture (`planifier_graphe`), puis écrit en une requête par table. `essai` valide sans rien écrire."""
    if not (cadres or noeuds or demonstrations):
        raise ErreurGraphe("Rien à poser : cadres, noeuds et demonstrations sont vides.")
    avant = lecture.charger_etat_vue(projet_id)
    cibles = sorted({str(d.get("noeud_id")) for d in demonstrations} & set(avant.noeuds))
    existantes: set[tuple[str, str]] = set()
    if cibles:
        lignes = (
            supabase()
            .table("demonstrations")
            .select("noeud_id, nom_demonstration")
            .eq("projet_id", projet_id)
            .in_("noeud_id", cibles)
            .execute()
            .data
        )
        existantes = {(r["noeud_id"], r["nom_demonstration"]) for r in lignes}
    plan = planifier_graphe(
        avant,
        existantes,
        projet_id=projet_id,
        cadres=cadres,
        noeuds=noeuds,
        demonstrations=demonstrations,
        conversation_id=conversation_id,
    )
    apres: vue.EtatVue = plan["etat"]
    diff = vue.differences(avant, apres)
    resume = {
        "noeuds_crees": len(plan["noeuds"]),
        "demonstrations_ajoutees": len(plan["demonstrations"]),
        "cadres": {
            g.id: [r.c0, r.l0, r.c1, r.l1] if (r := vue.rect_groupe(apres, g.id)) else None for g in diff["groupes"]
        },
        "avertissements": plan["avertissements"],
    }
    if essai:
        return {"essai": True, **resume}

    base = supabase()
    _ecrire_groupes(projet_id, apres, diff["groupes"])
    if plan["noeuds"]:
        base.table("noeuds").insert(plan["noeuds"]).execute()
    if plan["demonstrations"]:
        base.table("demonstrations").insert(plan["demonstrations"]).execute()
    _ecrire_placements(projet_id, diff["placements"])
    commun = {"projet_id": projet_id, "auteur": auteur}
    journal = [
        {**commun, "action": "creation_noeud", "noeud_id": l["id"], "apres": l, "raison": plan["raisons"][l["id"]]}
        for l in plan["noeuds"]
    ]
    journal += [
        {
            **commun,
            "action": "ajout_demonstration",
            "noeud_id": l["noeud_id"],
            "nom_demonstration": l["nom_demonstration"],
            "apres": l,
        }
        for l in plan["demonstrations"]
    ]
    if plan["operations"]:
        journal.append({**commun, "action": "vue", "noeud_id": None, "apres": {"operations": plan["operations"]}})
    # Une requête : toutes les lignes d'un insert groupé doivent avoir les mêmes clés.
    cles = {"raison": None, "nom_demonstration": None}
    base.table("journal").insert([cles | ligne for ligne in journal]).execute()
    return resume
