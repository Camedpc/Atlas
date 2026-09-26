"""Routes de lecture du graphe, partagées par la fonction Vercel et le serveur longue durée.

Chaque espace de travail a son graphe : `projet_id` le choisit (absent = le projet « defaut »).
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from . import lecture, projets
from .modeles import DetailNoeud, EntreeJournal, Graphe

routeur = APIRouter(prefix="/api")


@routeur.get("/health")
def health() -> JSONResponse:
    try:
        lecture.verifier_connexion()
    except Exception as e:
        return JSONResponse({"ok": False, "supabase": f"erreur : {e}"}, status_code=503)
    return JSONResponse({"ok": True, "supabase": "ok"})


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
