# Serveur longue durée d'Atlas (lecture du graphe + orchestrateur Codex). Voir deploiement/README.md.
FROM python:3.13-slim

# Outils que l'orchestrateur utilise dans ses commandes (git, recherche, téléchargements), et bubblewrap, qui sert
# au sandbox de Codex sous Linux (le bunker : voir atlas/orchestrateur/bunker.py).
RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates ripgrep bubblewrap \
    && rm -rf /var/lib/apt/lists/*

# L'agent a un accès complet… au conteneur seulement, et sans être root.
RUN useradd --create-home --uid 1000 atlas \
    && mkdir -p /donnees && chown atlas:atlas /donnees

WORKDIR /app
COPY requirements.txt requirements-agents.txt ./
RUN pip install --no-cache-dir -r requirements-agents.txt
# Paquets scientifiques courants, visibles depuis le Python partagé des agents (espace/partage/python).
RUN pip install --no-cache-dir numpy scipy sympy pandas matplotlib networkx

COPY atlas ./atlas
COPY api ./api

USER atlas
# Espace de travail de l'agent et connexion Codex (espace/.codex) : sur le volume persistant.
ENV ATLAS_ESPACE_TRAVAIL=/donnees/espace \
    PYTHONUNBUFFERED=1

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "atlas.serveur:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
