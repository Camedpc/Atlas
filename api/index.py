"""API en lecture seule, déployée comme fonction Python sur Vercel.

vercel.json redirige toutes les URLs /api/* ici ; les routes gardent donc le préfixe /api.
En local : uvicorn api.index:app --reload --port 8000
"""

import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

# Rend le paquet `atlas` (à la racine du dépôt) importable depuis la fonction.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from atlas import lecture  # noqa: E402
from atlas.modeles import DetailNoeud, EntreeJournal, Graphe  # noqa: E402

app = FastAPI(title="Atlas", docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.get("/api/health")
def health() -> JSONResponse:
    try:
        lecture.verifier_connexion()
    except Exception as e:
        return JSONResponse({"ok": False, "supabase": f"erreur : {e}"}, status_code=503)
    return JSONResponse({"ok": True, "supabase": "ok"})


@app.get("/api/graphe")
def graphe() -> Graphe:
    return lecture.charger_graphe()


@app.get("/api/noeuds/{noeud_id}")
def noeud(noeud_id: str) -> DetailNoeud:
    detail = lecture.lire_noeud(noeud_id)
    if detail is None:
        raise HTTPException(404, f"Nœud inexistant : {noeud_id}")
    return detail


@app.get("/api/journal")
def journal(
    noeud_id: str | None = None,
    limite: int = Query(50, ge=1, le=500),
    avant_id: int | None = None,
) -> list[EntreeJournal]:
    return lecture.lire_journal(noeud_id=noeud_id, limite=limite, avant_id=avant_id)
