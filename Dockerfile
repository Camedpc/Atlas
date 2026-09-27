# Serveur longue durée d'Atlas (lecture du graphe + orchestrateur Codex). Voir deploiement/README.md.
FROM python:3.13-slim

# Outils que les agents utilisent dans leurs commandes (git, recherche, téléchargements, schémas Graphviz), et
# LaTeX pour les articles du scribe (latexmk, pdflatex, paquets usuels en français, siunitx).
RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates ripgrep graphviz \
       latexmk texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended texlive-science \
       texlive-lang-french lmodern \
    && rm -rf /var/lib/apt/lists/*

# L'agent a un accès complet… au conteneur seulement, et sans être root.
RUN useradd --create-home --uid 1000 atlas \
    && mkdir -p /donnees && chown atlas:atlas /donnees

WORKDIR /app
COPY requirements.txt requirements-agents.txt ./
RUN pip install --no-cache-dir -r requirements-agents.txt
# Paquets scientifiques courants, visibles depuis le Python partagé des agents (espace/partage/python).
# pillow : animations GIF de matplotlib (PillowWriter) ; graphviz : schémas (binaire dot installé plus haut) ;
# plotly : scripts des figures 3D, qu'Atlas exécute avec ce Python (atlas/orchestrateur/figure3d.py).
RUN pip install --no-cache-dir numpy scipy sympy pandas matplotlib networkx pillow graphviz plotly

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
