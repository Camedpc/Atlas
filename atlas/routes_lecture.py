"""Routes de lecture du graphe, partagées par la fonction Vercel et le serveur longue durée."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from . import lecture
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
def graphe() -> Graphe:
    return lecture.charger_graphe()


@routeur.get("/noeuds/{noeud_id}")
def noeud(noeud_id: str) -> DetailNoeud:
    detail = lecture.lire_noeud(noeud_id)
    if detail is None:
        raise HTTPException(404, f"Nœud inexistant : {noeud_id}")
    return detail


@routeur.get("/journal")
def journal(
    noeud_id: str | None = None,
    limite: int = Query(50, ge=1, le=500),
    avant_id: int | None = None,
) -> list[EntreeJournal]:
    return lecture.lire_journal(noeud_id=noeud_id, limite=limite, avant_id=avant_id)
