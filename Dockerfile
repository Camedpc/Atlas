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

# Aperçu des figures 3D (atlas/orchestrateur/apercu3d.py) : Kaleido rend la scène avec Chrome sans fenêtre, que l'on
# télécharge dans /opt/chrome (lisible par l'utilisateur atlas), avec les bibliothèques dont il a besoin.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libnss3 libnspr4 libdbus-1-3 libatk1.0-0t64 libatk-bridge2.0-0t64 \
       libcups2t64 libxkbcommon0 libatspi2.0-0t64 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
       libasound2t64 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir kaleido \
    && kaleido_get_chrome --path /opt/chrome \
    && chmod -R a+rX /opt/chrome \
    && test -x /opt/chrome/chrome-linux64/chrome
ENV BROWSER_PATH=/opt/chrome/chrome-linux64/chrome

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
