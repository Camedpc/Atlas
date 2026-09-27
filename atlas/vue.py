"""Vue du graphe d'un espace, façon Blueprint : cadres imbriqués, nœuds placés en cases de grille, étiquettes.

Fonctions pures (aucun accès à Supabase) : l'état est chargé par `lecture.charger_vue`, les opérations sont
appliquées ici en mémoire et validées d'un bloc (tout ou rien), puis `ecriture.organiser_vue` écrit la différence.

Règles de la grille :
- colonne 0 à gauche, ligne 0 en haut ; la lecture va des prémisses (à gauche) vers les conclusions (à droite) ;
- un nœud occupe largeur × hauteur cases, et deux nœuds ne partagent jamais une case ;
- un nœud est dans un seul cadre ; le rectangle d'un cadre englobe les cases de ses nœuds et de ses sous-cadres ;
- deux cadres frères laissent au moins une case d'écart (place pour la barre de titre, pas de chevauchement).
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field, replace
from typing import Any

MOTIF_ID = re.compile(r"^[a-z0-9_]+$")
MOTIF_COULEUR = re.compile(r"^#[0-9a-f]{6}$")
GENRES = ("sous_probleme", "etape", "piste_abandonnee", "libre")
ROLES = ("principale", "auxiliaire", "technique", "contexte")
TAILLE_MAX = 8
# Recherche d'une case libre : au-delà, on renonce plutôt que de boucler.
LIGNES_CHERCHEES = 400


class ErreurVue(Exception):
    """Opération refusée ; le message est renvoyé tel quel à l'agent ou à l'utilisateur."""


@dataclass(frozen=True)
class NoeudVue:
    """Ce que la vue a besoin de savoir d'un nœud du graphe."""

    id: str
    nom: str
    type: str | None = None
    statut: str | None = None
    premisses: tuple[tuple[str, str], ...] = ()
    """(id, rôle) de toutes les démonstrations, sans doublon ; le rôle le plus fort l'emporte."""


@dataclass(frozen=True)
class Groupe:
    id: str
    nom: str
    parent_id: str | None = None
    genre: str = "libre"
    couleur: str | None = None
    replie: bool = False
    ordre: int = 0


@dataclass(frozen=True)
class Placement:
    noeud_id: str
    colonne: int
    ligne: int
    groupe_id: str | None = None
    largeur: int = 1
    hauteur: int = 1
    fixe: bool = False


@dataclass(frozen=True)
class Etiquette:
    id: str
    nom: str
    couleur: str | None = None


@dataclass
class EtatVue:
    noeuds: dict[str, NoeudVue] = field(default_factory=dict)
    groupes: dict[str, Groupe] = field(default_factory=dict)
    placements: dict[str, Placement] = field(default_factory=dict)
    etiquettes: dict[str, Etiquette] = field(default_factory=dict)
    marques: set[tuple[str, str]] = field(default_factory=set)
    """(noeud_id, etiquette_id)."""

    def copie(self) -> EtatVue:
        return EtatVue(
            dict(self.noeuds), dict(self.groupes), dict(self.placements), dict(self.etiquettes), set(self.marques)
        )


@dataclass(frozen=True)
class Rect:
    """Rectangle de cases, bornes incluses."""

    c0: int
    l0: int
    c1: int
    l1: int

    def union(self, autre: Rect) -> Rect:
        return Rect(min(self.c0, autre.c0), min(self.l0, autre.l0), max(self.c1, autre.c1), max(self.l1, autre.l1))

    def elargi(self, marge: int) -> Rect:
        return Rect(self.c0 - marge, self.l0 - marge, self.c1 + marge, self.l1 + marge)

    def coupe(self, autre: Rect) -> bool:
        return not (self.c1 < autre.c0 or autre.c1 < self.c0 or self.l1 < autre.l0 or autre.l1 < self.l0)


def rect_de(p: Placement) -> Rect:
    return Rect(p.colonne, p.ligne, p.colonne + p.largeur - 1, p.ligne + p.hauteur - 1)


# ─── Géométrie des cadres ────────────────────────────────────────────────────


def sous_groupes(etat: EtatVue, groupe_id: str | None) -> list[Groupe]:
    return sorted((g for g in etat.groupes.values() if g.parent_id == groupe_id), key=lambda g: (g.ordre, g.id))


def descendants(etat: EtatVue, groupe_id: str) -> set[str]:
    vus: set[str] = set()
    pile = [groupe_id]
    while pile:
        for g in sous_groupes(etat, pile.pop()):
            if g.id not in vus:
                vus.add(g.id)
                pile.append(g.id)
    return vus


def rect_groupe(etat: EtatVue, groupe_id: str) -> Rect | None:
    """Rectangle englobant les nœuds du cadre et de ses sous-cadres ; None si le cadre est vide."""
    membres = {groupe_id} | descendants(etat, groupe_id)
    rect: Rect | None = None
    for p in etat.placements.values():
        if p.groupe_id in membres:
            r = rect_de(p)
            rect = r if rect is None else rect.union(r)
    return rect


def conflits(etat: EtatVue) -> list[str]:
    """Cases partagées entre nœuds, cadres frères trop proches, nœuds hors de leur cadre parent."""
    messages: list[str] = []
    occupees: dict[tuple[int, int], str] = {}
    for p in sorted(etat.placements.values(), key=lambda p: p.noeud_id):
        for c in range(p.colonne, p.colonne + p.largeur):
            for l in range(p.ligne, p.ligne + p.hauteur):
                autre = occupees.get((c, l))
                if autre is not None:
                    messages.append(f"{p.noeud_id} et {autre} occupent la même case [{c},{l}]")
                    break
                occupees[(c, l)] = p.noeud_id
            else:
                continue
            break
    # Cadres frères : pas de chevauchement, une case d'écart. Un nœud hors cadre ne doit pas tomber dans un cadre.
    for parent in [None, *etat.groupes]:
        freres = [(g.id, rect_groupe(etat, g.id)) for g in sous_groupes(etat, parent)]
        freres = [(i, r) for i, r in freres if r is not None]
        for k, (a, ra) in enumerate(freres):
            for b, rb in freres[k + 1 :]:
                if ra.elargi(1).coupe(rb):
                    messages.append(f"les cadres {a} et {b} se chevauchent ou se touchent")
            for p in etat.placements.values():
                if p.groupe_id == parent and ra.coupe(rect_de(p)):
                    messages.append(f"{p.noeud_id} (hors du cadre {a}) tombe dans son rectangle")
    return messages


# ─── Placement automatique ──────────────────────────────────────────────────


def _groupe_prefere(etat: EtatVue, noeud: NoeudVue) -> str | None:
    """Le cadre où se trouvent le plus de prémisses principales ou auxiliaires placées."""
    compte: dict[str | None, int] = {}
    for pid, role in noeud.premisses:
        p = etat.placements.get(pid)
        if p is not None and role in ("principale", "auxiliaire"):
            compte[p.groupe_id] = compte.get(p.groupe_id, 0) + 1
    return max(compte, key=lambda g: compte[g]) if compte else None


def _colonne_logique(etat: EtatVue, noeud: NoeudVue, groupe_id: str | None) -> int:
    """Juste à droite de la prémisse (principale ou auxiliaire) la plus à droite ; sinon le bord gauche du cadre."""
    droites = [
        rect_de(p).c1
        for pid, role in noeud.premisses
        if role in ("principale", "auxiliaire") and (p := etat.placements.get(pid)) is not None
    ]
    if droites:
        return max(droites) + 1
    if groupe_id is not None and (r := rect_groupe(etat, groupe_id)) is not None:
        return r.c0
    return 0


def _ligne_souhaitee(etat: EtatVue, noeud: NoeudVue, groupe_id: str | None) -> int:
    lignes = sorted(p.ligne for pid, _ in noeud.premisses if (p := etat.placements.get(pid)) is not None)
    r = rect_groupe(etat, groupe_id) if groupe_id is not None else None
    if lignes:
        # Près de ses prémisses, mais dans les lignes de son cadre : un nœud ne part pas chez le voisin.
        mediane = lignes[len(lignes) // 2]
        return min(max(mediane, r.l0), r.l1) if r is not None else mediane
    if r is not None:
        return r.l0
    # Premier nœud d'un cadre vide : sous tout ce qui existe, une case d'écart pour la barre de titre ;
    # hors cadre sans prémisse : juste en dessous.
    bas = max((rect_de(p).l1 for p in etat.placements.values()), default=-1)
    return bas + (2 if groupe_id is not None else 1)


def placer_auto(
    etat: EtatVue, noeud_id: str, groupe_id: str | None = ..., largeur: int = 1, hauteur: int = 1
) -> Placement:
    """Place un nœud de façon logique : colonne après ses prémisses, ligne proche d'elles, dans son cadre,
    sans case partagée ni cadre qui en chevauche un autre. Ne modifie pas `etat`."""
    noeud = etat.noeuds[noeud_id]
    ancien = etat.placements.get(noeud_id)
    if groupe_id is ...:
        groupe_id = ancien.groupe_id if ancien is not None else _groupe_prefere(etat, noeud)
    sans_lui = etat.copie()
    sans_lui.placements.pop(noeud_id, None)
    colonne = _colonne_logique(sans_lui, noeud, groupe_id)
    ligne0 = _ligne_souhaitee(sans_lui, noeud, groupe_id)
    libre = _verificateur(sans_lui, groupe_id)
    # Lignes essayées : la ligne souhaitée, puis de part et d'autre en s'éloignant ; puis colonnes suivantes.
    for decalage_colonne in range(0, 12):
        for k in range(LIGNES_CHERCHEES):
            ligne = ligne0 + (k + 1) // 2 * (1 if k % 2 else -1) if k else ligne0
            if ligne < 0:
                continue
            candidat = Placement(noeud_id, colonne + decalage_colonne, ligne, groupe_id, largeur, hauteur, False)
            if libre(rect_de(candidat)):
                return candidat
    raise ErreurVue(f"Aucune case libre trouvée pour {noeud_id} : réorganise la vue ou place-le à la main.")


def _verificateur(etat: EtatVue, groupe_id: str | None):
    """Test rapide d'un rectangle candidat pour un nœud du cadre `groupe_id` (sans refaire `conflits` en entier) :
    cases libres, pas dans un sous-cadre de son cadre, et chaque cadre ancêtre, agrandi du candidat, reste à une
    case de ses frères et ne recouvre aucun nœud de son parent."""
    occupees = {
        (c, l)
        for p in etat.placements.values()
        for c in range(p.colonne, p.colonne + p.largeur)
        for l in range(p.ligne, p.ligne + p.hauteur)
    }
    rects = {gid: rect_groupe(etat, gid) for gid in etat.groupes}
    directs: dict[str | None, list[Rect]] = {}
    for p in etat.placements.values():
        directs.setdefault(p.groupe_id, []).append(rect_de(p))

    def libre(r: Rect) -> bool:
        if any((c, l) in occupees for c in range(r.c0, r.c1 + 1) for l in range(r.l0, r.l1 + 1)):
            return False
        # Pas dans le rectangle d'un sous-cadre de son propre cadre.
        for s in sous_groupes(etat, groupe_id):
            if (rs := rects[s.id]) is not None and rs.coupe(r):
                return False
        niveau, etendu = groupe_id, r
        while niveau is not None:
            g = etat.groupes[niveau]
            etendu = etendu if rects[niveau] is None else rects[niveau].union(etendu)
            for frere in sous_groupes(etat, g.parent_id):
                if frere.id != niveau and (rf := rects[frere.id]) is not None and rf.elargi(1).coupe(etendu):
                    return False
            if any(etendu.coupe(x) for x in directs.get(g.parent_id, [])):
                return False
            niveau = g.parent_id
        return True

    return libre


def reorganiser(etat: EtatVue, groupe_id: str | None = None) -> EtatVue:
    """Replace, dans l'ordre logique (prémisses d'abord), les nœuds non fixés (d'un cadre, ou de toute la vue ;
    dans ce cas les nœuds encore non placés le sont aussi)."""
    cibles = {
        nid
        for nid, p in etat.placements.items()
        if not p.fixe and (groupe_id is None or p.groupe_id in {groupe_id} | descendants(etat, groupe_id))
    }
    # Sur toute la vue, les nœuds jamais placés (graphe écrit avant la vue) sont placés aussi, hors cadre.
    non_places = set(etat.noeuds) - set(etat.placements) if groupe_id is None else set()
    nouvel = etat.copie()
    for nid in cibles:
        nouvel.placements.pop(nid)

    # Cadre par cadre, dans l'ordre de lecture actuel (le plus haut d'abord, parents avant sous-cadres), puis les
    # nœuds de chaque cadre dans l'ordre logique : un cadre se reconstruit d'un bloc au lieu de s'éparpiller.
    def cle_position(nid: str) -> tuple[int, int]:
        p = etat.placements[nid]
        return (p.ligne, p.colonne)

    def haut(g: Groupe) -> tuple[int, int, str]:
        r = rect_groupe(etat, g.id)
        return (r.l0 if r else 1 << 30, g.ordre, g.id)

    def parcours(parent: str | None) -> list[str | None]:
        ordre: list[str | None] = []
        for g in sorted(sous_groupes(etat, parent), key=haut):
            ordre.append(g.id)
            ordre.extend(parcours(g.id))
        return ordre

    for g in [None, *parcours(None)]:
        ids = [nid for nid in cibles if etat.placements[nid].groupe_id == g]
        for nid in ordre_logique(etat, ids, cle_position):
            ancien = etat.placements[nid]
            nouvel.placements[nid] = placer_auto(nouvel, nid, ancien.groupe_id, ancien.largeur, ancien.hauteur)
    for nid in ordre_logique(etat, non_places):
        nouvel.placements[nid] = placer_auto(nouvel, nid, None)
    return nouvel


def ordre_logique(etat: EtatVue, ids: Iterable[str], cle=None) -> list[str]:
    """Tri topologique (prémisses avant conclusions) ; à égalité, dans l'ordre de `cle` (par défaut l'id).
    Un cycle est rompu par le premier nœud restant."""
    cle = cle or (lambda n: n)
    restants = set(ids)
    ordre: list[str] = []
    while restants:
        prets = sorted((n for n in restants if not any(p in restants for p, _ in etat.noeuds[n].premisses)), key=cle)
        suivant = prets or [min(restants, key=cle)]
        ordre.extend(suivant)
        restants -= set(suivant)
    return ordre


# ─── Opérations ─────────────────────────────────────────────────────────────


def _id(valeur: Any, quoi: str) -> str:
    if not isinstance(valeur, str) or not MOTIF_ID.match(valeur):
        raise ErreurVue(f"{quoi} invalide « {valeur} » : minuscules, chiffres et _ uniquement.")
    return valeur


def _couleur(valeur: Any) -> str | None:
    if valeur in (None, ""):
        return None
    if not isinstance(valeur, str) or not MOTIF_COULEUR.match(valeur.lower()):
        raise ErreurVue(f"Couleur invalide « {valeur} » : format #rrggbb.")
    return valeur.lower()


def _taille(valeur: Any, quoi: str) -> int:
    if not isinstance(valeur, int) or not 1 <= valeur <= TAILLE_MAX:
        raise ErreurVue(f"{quoi} invalide « {valeur} » : entier de 1 à {TAILLE_MAX}.")
    return valeur


def _case(valeur: Any, quoi: str) -> int:
    if not isinstance(valeur, int) or valeur < 0:
        raise ErreurVue(f"{quoi} invalide « {valeur} » : entier positif ou nul.")
    return valeur


def _groupe_existant(etat: EtatVue, valeur: Any) -> str | None:
    """ "" ou None = hors cadre."""
    if valeur in (None, ""):
        return None
    if valeur not in etat.groupes:
        raise ErreurVue(f"Cadre inexistant : {valeur}. Crée-le avec creer_groupe.")
    return valeur


def _noeud_existant(etat: EtatVue, valeur: Any) -> str:
    if valeur not in etat.noeuds:
        raise ErreurVue(f"Nœud inexistant : {valeur}.")
    return valeur


def appliquer(etat: EtatVue, operations: list[dict[str, Any]]) -> tuple[EtatVue, dict[str, str]]:
    """Applique les opérations dans l'ordre ; renvoie le nouvel état et les renommages de nœuds {id: nom}.

    Tout ou rien : la première opération invalide lève `ErreurVue` (avec son numéro), et l'état final doit être
    sans conflit.
    """
    nouvel = etat.copie()
    renommages: dict[str, str] = {}
    for i, op in enumerate(operations, 1):
        try:
            _appliquer_une(nouvel, op, renommages)
        except ErreurVue as e:
            raise ErreurVue(f"Opération {i} ({op.get('op', '?')}) : {e}") from None
    if problemes := conflits(nouvel):
        raise ErreurVue("La vue obtenue a des conflits : " + " ; ".join(problemes[:6]))
    return nouvel, renommages


def _appliquer_une(etat: EtatVue, op: dict[str, Any], renommages: dict[str, str]) -> None:
    genre = op.get("op")
    if genre == "creer_groupe":
        gid = _id(op.get("id"), "Id de cadre")
        if gid in etat.groupes:
            raise ErreurVue(f"Le cadre {gid} existe déjà.")
        nom = str(op.get("nom") or "").strip()
        if not nom:
            raise ErreurVue("Un cadre a besoin d'un nom.")
        parent = _groupe_existant(etat, op.get("parent"))
        g = op.get("genre", "libre")
        if g not in GENRES:
            raise ErreurVue(f"Genre invalide « {g} » : {', '.join(GENRES)}.")
        etat.groupes[gid] = Groupe(gid, nom, parent, g, _couleur(op.get("couleur")), False, int(op.get("ordre", 0)))
    elif genre == "modifier_groupe":
        gid = _groupe_existant(etat, op.get("id"))
        if gid is None:
            raise ErreurVue("Indique l'id du cadre à modifier.")
        g = etat.groupes[gid]
        champs: dict[str, Any] = {}
        if "nom" in op:
            if not str(op["nom"]).strip():
                raise ErreurVue("Un cadre a besoin d'un nom.")
            champs["nom"] = str(op["nom"]).strip()
        if "parent" in op:
            parent = _groupe_existant(etat, op["parent"])
            if parent is not None and (parent == gid or parent in descendants(etat, gid)):
                raise ErreurVue(f"{parent} est dans {gid} : un cadre ne peut pas se contenir.")
            champs["parent_id"] = parent
        if "genre" in op:
            if op["genre"] not in GENRES:
                raise ErreurVue(f"Genre invalide « {op['genre']} » : {', '.join(GENRES)}.")
            champs["genre"] = op["genre"]
        if "couleur" in op:
            champs["couleur"] = _couleur(op["couleur"])
        if "replie" in op:
            champs["replie"] = bool(op["replie"])
        if "ordre" in op:
            champs["ordre"] = int(op["ordre"])
        etat.groupes[gid] = replace(g, **champs)
    elif genre == "supprimer_groupe":
        gid = _groupe_existant(etat, op.get("id"))
        if gid is None:
            raise ErreurVue("Indique l'id du cadre à supprimer.")
        parent = etat.groupes[gid].parent_id
        for nid, p in list(etat.placements.items()):
            if p.groupe_id == gid:
                etat.placements[nid] = replace(p, groupe_id=parent)
        for g in sous_groupes(etat, gid):
            etat.groupes[g.id] = replace(g, parent_id=parent)
        del etat.groupes[gid]
    elif genre == "renommer_noeud":
        nid = _noeud_existant(etat, op.get("id"))
        nom = str(op.get("nom") or "").strip()
        if not nom:
            raise ErreurVue("Un nœud a besoin d'un nom.")
        etat.noeuds[nid] = replace(etat.noeuds[nid], nom=nom)
        renommages[nid] = nom
    elif genre == "placer":
        nid = _noeud_existant(etat, op.get("noeud"))
        ancien = etat.placements.get(nid)
        groupe = _groupe_existant(etat, op["groupe"]) if "groupe" in op else (ancien.groupe_id if ancien else ...)
        largeur = _taille(op.get("largeur", ancien.largeur if ancien else 1), "Largeur")
        hauteur = _taille(op.get("hauteur", ancien.hauteur if ancien else 1), "Hauteur")
        if "colonne" in op or "ligne" in op:
            if "colonne" not in op or "ligne" not in op:
                raise ErreurVue("Donne colonne et ligne ensemble (ou aucune des deux pour un placement automatique).")
            # Fixé par défaut ; `fixe: false` garde la case mais laisse `reorganiser` le déplacer (« libérer »,
            # ou annulation d'un déplacement depuis le front).
            fixe = op.get("fixe", True)
            if not isinstance(fixe, bool):
                raise ErreurVue(f"fixe invalide « {fixe} » : vrai ou faux.")
            etat.placements[nid] = Placement(
                nid,
                _case(op["colonne"], "Colonne"),
                _case(op["ligne"], "Ligne"),
                None if groupe is ... else groupe,
                largeur,
                hauteur,
                fixe,
            )
        else:
            etat.placements[nid] = placer_auto(etat, nid, groupe, largeur, hauteur)
    elif genre == "deplacer_groupe":
        gid = _groupe_existant(etat, op.get("id"))
        if gid is None:
            raise ErreurVue("Indique l'id du cadre à déplacer.")
        dc, dl = op.get("colonnes", 0), op.get("lignes", 0)
        if not isinstance(dc, int) or not isinstance(dl, int):
            raise ErreurVue("colonnes et lignes sont des décalages entiers.")
        membres = {gid} | descendants(etat, gid)
        for nid, p in list(etat.placements.items()):
            if p.groupe_id in membres:
                if p.colonne + dc < 0 or p.ligne + dl < 0:
                    raise ErreurVue(f"Le déplacement ferait sortir {nid} de la grille.")
                etat.placements[nid] = replace(p, colonne=p.colonne + dc, ligne=p.ligne + dl, fixe=True)
    elif genre == "reorganiser":
        cible = _groupe_existant(etat, op.get("groupe"))
        nouvel = reorganiser(etat, cible)
        etat.placements = nouvel.placements
    elif genre == "creer_etiquette":
        eid = _id(op.get("id"), "Id d'étiquette")
        nom = str(op.get("nom") or "").strip()
        if not nom:
            raise ErreurVue("Une étiquette a besoin d'un nom.")
        etat.etiquettes[eid] = Etiquette(eid, nom, _couleur(op.get("couleur")))
    elif genre in ("etiqueter", "retirer_etiquette"):
        nid = _noeud_existant(etat, op.get("noeud"))
        eid = op.get("etiquette")
        if eid not in etat.etiquettes:
            raise ErreurVue(f"Étiquette inexistante : {eid}. Crée-la avec creer_etiquette.")
        (etat.marques.add if genre == "etiqueter" else etat.marques.discard)((nid, eid))
    else:
        raise ErreurVue(
            f"Opération inconnue « {genre} » : creer_groupe, modifier_groupe, supprimer_groupe, renommer_noeud, "
            "placer, deplacer_groupe, reorganiser, creer_etiquette, etiqueter, retirer_etiquette."
        )


def differences(avant: EtatVue, apres: EtatVue) -> dict[str, Any]:
    """Ce qu'il faut écrire en base pour passer de `avant` à `apres`."""
    return {
        "groupes": [g for gid, g in apres.groupes.items() if avant.groupes.get(gid) != g],
        "groupes_supprimes": [gid for gid in avant.groupes if gid not in apres.groupes],
        "placements": [p for nid, p in apres.placements.items() if avant.placements.get(nid) != p],
        "etiquettes": [e for eid, e in apres.etiquettes.items() if avant.etiquettes.get(eid) != e],
        "marques_ajoutees": sorted(apres.marques - avant.marques),
        "marques_retirees": sorted(avant.marques - apres.marques),
    }


# ─── Rendu texte (pour l'IA) ────────────────────────────────────────────────

SYMBOLES_STATUT = {"etabli": "✓", "a_verifier": "?", "invalide": "✗", "suspendu": "⊘", "ouvert": "○"}
PREFIXES_ROLE = {"principale": "", "auxiliaire": "+", "technique": "#", "contexte": "~"}

LEGENDE = (
    "Grille : colonne vers la droite (des prémisses vers les conclusions), ligne vers le bas. "
    "[c,l] = case du nœud (+LxH s'il est plus grand) ; statut ✓ établi, ? à vérifier, ✗ invalide, ⊘ suspendu, "
    "○ ouvert ; ⟵ prémisses (a principale, +a auxiliaire, #a technique, ~a contexte) ; #étiquette ; "
    "« fixe » = placé à la main. Un cadre = ▸ id « nom » (genre) et son rectangle de cases."
)


def _ligne_noeud(etat: EtatVue, p: Placement, retrait: str) -> str:
    n = etat.noeuds[p.noeud_id]
    taille = f"+{p.largeur}x{p.hauteur}" if (p.largeur, p.hauteur) != (1, 1) else ""
    morceaux = [f"{retrait}[{p.colonne},{p.ligne}{taille}] {n.id}"]
    if n.type:
        morceaux.append(n.type)
    if n.statut:
        morceaux.append(SYMBOLES_STATUT.get(n.statut, n.statut))
    texte = " · ".join(morceaux) + f" — {n.nom}"
    if n.premisses:
        texte += " ⟵ " + " ".join(PREFIXES_ROLE.get(r, "") + i for i, r in n.premisses)
    marques = sorted(e for nid, e in etat.marques if nid == n.id)
    if marques:
        texte += " " + " ".join(f"#{e}" for e in marques)
    if p.fixe:
        texte += " (fixe)"
    return texte


def rendre_texte(etat: EtatVue, titre: str = "Vue de l'espace") -> str:
    lignes = [f"# {titre}", LEGENDE, ""]
    if etat.etiquettes:
        lignes.append("Étiquettes : " + ", ".join(f"#{e.id} « {e.nom} »" for e in etat.etiquettes.values()))
        lignes.append("")

    def membres(groupe_id: str | None) -> list[Placement]:
        return sorted(
            (p for p in etat.placements.values() if p.groupe_id == groupe_id), key=lambda p: (p.colonne, p.ligne)
        )

    def cadre(g: Groupe, profondeur: int) -> None:
        retrait = "  " * profondeur
        r = rect_groupe(etat, g.id)
        etendue = f"c{r.c0}–c{r.c1} × l{r.l0}–l{r.l1}" if r else "vide"
        details = ", ".join(x for x in (g.genre, g.couleur, "réduit" if g.replie else "") if x)
        lignes.append(f"{retrait}▸ {g.id} « {g.nom} » ({details}) {etendue}")
        for p in membres(g.id):
            lignes.append(_ligne_noeud(etat, p, retrait + "  "))
        for s in sous_groupes(etat, g.id):
            cadre(s, profondeur + 1)

    for g in sous_groupes(etat, None):
        cadre(g, 0)
    hors = membres(None)
    if hors:
        lignes.append("Hors cadre :")
        lignes.extend(_ligne_noeud(etat, p, "  ") for p in hors)
    non_places = sorted(set(etat.noeuds) - set(etat.placements))
    if non_places:
        lignes.append("Non placés : " + ", ".join(non_places))
    return "\n".join(lignes)


def valider_roles(justifie_par: list[str], roles: dict[str, str] | None) -> dict[str, str]:
    """Rôles des prémisses non principales ; toute clé doit être une prémisse citée."""
    roles = dict(roles or {})
    for pid, role in roles.items():
        if pid not in justifie_par:
            raise ErreurVue(f"Rôle donné à {pid}, qui n'est pas dans justifie_par.")
        if role not in ROLES:
            raise ErreurVue(f"Rôle invalide « {role} » pour {pid} : {', '.join(ROLES)}.")
    return {pid: role for pid, role in roles.items() if role != "principale"}
