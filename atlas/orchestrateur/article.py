"""Article du scribe dans le graphe : chaque fois que le scribe rend un article, Atlas le fait placer par le graphiste.

Le déclenchement ne dépend d'aucun prompt : quand un sous-agent `scribe` de l'orchestrateur termine
(`gestionnaire`), Atlas cherche sur le disque les PDF d'article qu'il vient d'écrire (`articles_ecrits`) et confie
à l'orchestrateur (`prompts/article.md`) de lancer un graphiste qui les pose comme documents, reliés aux résultats
qu'ils exposent.
"""

from pathlib import Path

from .consignes import consigne

EXCLUS = {".tmp", ".codex", "__pycache__", "node_modules", "sources", "figures"}
"""Dossiers où un PDF n'est pas un article : sources téléchargées, figures (carte du raisonnement en PDF)…"""
MARGE = 5.0
"""Secondes de tolérance sur la date de début du scribe (horloges du disque et du serveur)."""


def articles_ecrits(projet: Path, depuis: float, connus: set[str]) -> list[str]:
    """PDF compilés depuis `depuis` (horodatage) dans le projet : à côté de leur source `.tex`, hors des dossiers
    `EXCLUS` et des chemins `connus` (déjà dans le graphe). Chemins relatifs au projet, séparés par /."""
    trouves = []
    for pdf in projet.rglob("*.pdf"):
        relatif = pdf.relative_to(projet)
        if EXCLUS.intersection(relatif.parts[:-1]) or relatif.as_posix() in connus:
            continue
        try:
            recent = pdf.stat().st_mtime >= depuis - MARGE
        except OSError:
            continue
        if recent and any(pdf.parent.glob("*.tex")):
            trouves.append(relatif.as_posix())
    return sorted(trouves)


def consigne_article(chemin_scribe: str, pdfs: list[str]) -> str:
    """Consigne injectée dans le tour de l'orchestrateur (ou qui en ouvre un) pour faire placer l'article."""
    liste = "\n".join(f"- `{p}`" for p in pdfs)
    return consigne("article").replace("{chemin}", chemin_scribe).replace("{pdfs}", liste)


def avis_article(pdfs: list[str]) -> str:
    """Ligne « système » montrée dans la conversation à la place de la consigne."""
    return f"Article du scribe : placement dans le graphe confié au graphiste ({', '.join(pdfs)})."
