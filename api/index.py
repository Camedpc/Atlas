"""API en lecture seule, déployée comme fonction Python sur Vercel.

vercel.json redirige toutes les URLs /api/* ici ; les routes gardent donc le préfixe /api.
L'orchestrateur (exécutions longues) n'est pas servi ici mais par `atlas.serveur`, qui reprend ces routes.
"""

import sys
from pathlib import Path

from fastapi import FastAPI

# Rend le paquet `atlas` (à la racine du dépôt) importable depuis la fonction.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from atlas.routes_lecture import routeur  # noqa: E402

app = FastAPI(title="Atlas", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(routeur)
