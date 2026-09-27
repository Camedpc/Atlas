"""Routes de lecture du graphe, partagées par la fonction Vercel et le serveur longue durée.

Chaque espace de travail a son graphe : `projet_id` le choisit (absent = le projet « defaut »).
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse, Response

from . import lecture, projets, site, vue
from .modeles import DetailNoeud, EntreeJournal, Graphe, Vue

routeur = APIRouter(prefix="/api")


@routeur.get("/health")
def health() -> JSONResponse:
    try:
        lecture.verifier_connexion()
    except Exception as e:
        return JSONResponse({"ok": False, "supabase": f"erreur : {e}"}, status_code=503)
    return JSONResponse({"ok": True, "supabase": "ok"})


@routeur.get("/site")
def reglages_du_site() -> dict:
    """Page d'accueil et page de démo : URL de la vidéo et de son affiche, id de l'espace de démo (null si aucun)."""
    return site.etat_public()


@routeur.get("/graphe")
def graphe(projet_id: str | None = None) -> Graphe:
    return lecture.charger_graphe(projets.id_ou_defaut(projet_id))


@routeur.get("/noeuds/{noeud_id}")
def noeud(noeud_id: str, projet_id: str | None = None) -> DetailNoeud:
    detail = lecture.lire_noeud(projets.id_ou_defaut(projet_id), noeud_id)
    if detail is None:
        raise HTTPException(404, f"Nœud inexistant : {noeud_id}")
    return detail


@routeur.get("/journal")
def journal(
    projet_id: str | None = None,
    noeud_id: str | None = None,
    limite: int = Query(50, ge=1, le=500),
    avant_id: int | None = None,
) -> list[EntreeJournal]:
    return lecture.lire_journal(projets.id_ou_defaut(projet_id), noeud_id=noeud_id, limite=limite, avant_id=avant_id)


@routeur.get("/vue", response_model=None)
def vue_du_graphe(
    projet_id: str | None = None, format: str = Query("json", pattern="^(json|texte)$")
) -> Vue | PlainTextResponse:
    """Vue de l'espace : cadres (avec leur rectangle de cases), placements, étiquettes. `format=texte` donne la
    même vue telle que l'IA la lit (outil MCP lire_vue)."""
    projet = projets.id_ou_defaut(projet_id)
    etat = lecture.charger_etat_vue(projet)
    if format == "texte":
        return PlainTextResponse(vue.rendre_texte(etat))
    return lecture.vue_pour_le_front(
        etat, lecture.lister_figures(projet), lecture.lister_documents(projet), lecture.lister_liens_documents(projet)
    )


@routeur.get("/figures/{figure_id}/image")
def image_de_figure(figure_id: str, projet_id: str | None = None) -> Response:
    """L'image d'une figure (bucket privé « figures ») ; ?v= dans l'URL sert seulement à contourner le cache."""
    figure = lecture.lire_figure(projets.id_ou_defaut(projet_id), figure_id)
    if figure is None or figure["image_chemin"] is None:
        raise HTTPException(404, f"Figure sans image : {figure_id}")
    return Response(
        lecture.lire_image_figure(figure["image_chemin"]),
        media_type=figure["image_type"],
        headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )


@routeur.get("/figures/{figure_id}/scene")
def scene_de_figure(figure_id: str, projet_id: str | None = None) -> Response:
    """La scène 3D d'une figure (JSON Plotly vérifié, voir atlas/figures3d.py) ; ?v= contourne le cache."""
    figure = lecture.lire_figure(projets.id_ou_defaut(projet_id), figure_id)
    if figure is None or not figure.get("scene_chemin"):
        raise HTTPException(404, f"Figure sans scène 3D : {figure_id}")
    return Response(
        lecture.lire_scene_figure(figure["scene_chemin"]),
        media_type="application/json",
        headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )
