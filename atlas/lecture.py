"""Lecture du graphe d'un espace de travail (projet) dans Supabase.

Chaque espace a son propre graphe : toute lecture prend le `projet_id` de l'espace. Le statut d'un nœud dépend de
tout le graphe (il se propage par les prémisses) : toute lecture qui renvoie un statut charge donc le graphe entier,
en un seul instantané.
"""

from collections.abc import Callable

from postgrest import SyncSelectRequestBuilder

from . import figures, graphe, vue
from .client import supabase
from .modeles import (
    Demonstration,
    DetailNoeud,
    EntreeJournal,
    EtiquetteVue,
    FigureVue,
    Graphe,
    GroupeVue,
    LigneNoeud,
    PlacementVue,
    Vue,
)

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


def lister_noeuds(projet_id: str) -> list[LigneNoeud]:
    lignes = _toutes_les_lignes(lambda: supabase().table("noeuds").select("*").eq("projet_id", projet_id).order("id"))
    return [LigneNoeud.model_validate(l) for l in lignes]


def lister_demonstrations(projet_id: str, noeud_id: str | None = None) -> list[Demonstration]:
    def requete() -> SyncSelectRequestBuilder:
        q = supabase().table("demonstrations").select("*").eq("projet_id", projet_id)
        if noeud_id is not None:
            q = q.eq("noeud_id", noeud_id)
        return q.order("noeud_id").order("nom_demonstration")

    return [Demonstration.model_validate(l) for l in _toutes_les_lignes(requete)]


def charger_graphe(projet_id: str) -> Graphe:
    return graphe.assembler(lister_noeuds(projet_id), lister_demonstrations(projet_id))


def lire_noeud(projet_id: str, noeud_id: str) -> DetailNoeud | None:
    return graphe.detailler(charger_graphe(projet_id), noeud_id)


def lire_journal(
    projet_id: str, *, noeud_id: str | None = None, limite: int = 50, avant_id: int | None = None
) -> list[EntreeJournal]:
    """Entrées les plus récentes d'abord. Pour la page suivante, passer `avant_id` = id de la dernière reçue."""
    q = supabase().table("journal").select("*").eq("projet_id", projet_id)
    if noeud_id is not None:
        q = q.eq("noeud_id", noeud_id)
    if avant_id is not None:
        q = q.lt("id", avant_id)
    lignes = q.order("id", desc=True).limit(limite).execute().data
    return [EntreeJournal.model_validate(l) for l in lignes]


def verifier_connexion() -> None:
    """Lève une exception si Supabase est injoignable ou si le schéma est absent."""
    supabase().table("noeuds").select("id").limit(1).execute()


# ── Vue du graphe ────────────────────────────────────────────────────────────


def charger_etat_vue(projet_id: str) -> vue.EtatVue:
    """Graphe (noms, types, statuts, prémisses avec leur rôle) et vue de l'espace, en un instantané."""
    g = charger_graphe(projet_id)
    noeuds: dict[str, vue.NoeudVue] = {}
    for n in g.noeuds:
        roles: dict[str, str] = {}
        for d in n.demonstrations:
            for p in d.justifie_par:
                role = d.roles.get(p, "principale")
                # Le rôle le plus fort l'emporte d'une démonstration à l'autre.
                if p not in roles or vue.ROLES.index(role) < vue.ROLES.index(roles[p]):
                    roles[p] = role
        noeuds[n.id] = vue.NoeudVue(n.id, n.nom, n.type, n.statut, tuple(roles.items()))

    def lignes(table: str) -> list[dict]:
        return supabase().table(table).select("*").eq("projet_id", projet_id).execute().data

    places = {
        r["noeud_id"]: vue.Placement(
            r["noeud_id"], r["colonne"], r["ligne"], r["groupe_id"], r["largeur"], r["hauteur"], r["fixe"]
        )
        for r in lignes("placements")
    }
    # Les figures entrent dans la vue comme des pseudo-nœuds fig:<id>, avec leur nœud pour seule prémisse.
    for f in lister_figures(projet_id, colonnes=COLONNES_VUE_FIGURE):
        fid = vue.PREFIXE_FIGURE + f["id"]
        noeuds[fid] = vue.NoeudVue(fid, f["titre"], "figure", None, ((f["noeud_id"], "principale"),))
        if f["colonne"] is not None:
            # Une case, quelle que soit la taille enregistrée : les figures plus grandes laissaient d'immenses blocs.
            largeur, hauteur = vue.TAILLE_FIGURE
            places[fid] = vue.Placement(fid, f["colonne"], f["ligne"], f["groupe_id"], largeur, hauteur, f["fixe"])

    return vue.EtatVue(
        noeuds=noeuds,
        groupes={
            r["id"]: vue.Groupe(r["id"], r["nom"], r["parent_id"], r["genre"], r["couleur"], r["replie"], r["ordre"])
            for r in lignes("groupes")
        },
        placements=places,
        etiquettes={r["id"]: vue.Etiquette(r["id"], r["nom"], r["couleur"]) for r in lignes("etiquettes")},
        marques={(r["noeud_id"], r["etiquette_id"]) for r in lignes("noeuds_etiquettes")},
    )


COLONNES_VUE_FIGURE = "id, noeud_id, titre, groupe_id, colonne, ligne, largeur, hauteur, fixe"


def lister_figures(projet_id: str, *, noeud_id: str | None = None, colonnes: str = "*") -> list[dict]:
    q = supabase().table("figures").select(colonnes).eq("projet_id", projet_id)
    if noeud_id is not None:
        q = q.eq("noeud_id", noeud_id)
    return q.order("id").execute().data


def lire_figure(projet_id: str, figure_id: str) -> dict | None:
    lignes = supabase().table("figures").select("*").eq("projet_id", projet_id).eq("id", figure_id).execute().data
    return lignes[0] if lignes else None


def lire_image_figure(chemin: str) -> bytes:
    return supabase().storage.from_("figures").download(chemin)


def figure_pour_le_front(f: dict) -> FigureVue:
    trace = f["trace"]
    if trace is not None:
        try:
            trace = figures.tracer(trace)
        except figures.ErreurFigure:
            pass  # validé à l'écriture ; une loi devenue illisible est montrée sans ses points
    return FigureVue(
        id=f["id"],
        noeud_id=f["noeud_id"],
        titre=f["titre"],
        legende=f["legende"],
        trace=trace,
        image=f["image_chemin"] is not None,
        image_largeur=f["image_largeur"],
        image_hauteur=f["image_hauteur"],
        source=f["source"],
        modifie_le=f["modifie_le"],
    )


def vue_pour_le_front(etat: vue.EtatVue, figures_de_l_espace: list[dict] | None = None) -> Vue:
    groupes = []
    for g in etat.groupes.values():
        r = vue.rect_groupe(etat, g.id)
        groupes.append(
            GroupeVue(
                id=g.id,
                nom=g.nom,
                parent_id=g.parent_id,
                genre=g.genre,
                couleur=g.couleur,
                replie=g.replie,
                ordre=g.ordre,
                rectangle=[r.c0, r.l0, r.c1, r.l1] if r else None,
            )
        )
    return Vue(
        groupes=groupes,
        placements=[
            PlacementVue(
                noeud_id=p.noeud_id,
                groupe_id=p.groupe_id,
                colonne=p.colonne,
                ligne=p.ligne,
                largeur=p.largeur,
                hauteur=p.hauteur,
                fixe=p.fixe,
            )
            for p in etat.placements.values()
        ],
        etiquettes=[EtiquetteVue(id=e.id, nom=e.nom, couleur=e.couleur) for e in etat.etiquettes.values()],
        marques=[list(m) for m in sorted(etat.marques)],
        figures=[figure_pour_le_front(f) for f in figures_de_l_espace or []],
    )
