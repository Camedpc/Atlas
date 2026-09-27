"""Lanceur d'un script de figure 3D, exécuté par le Python partagé des agents dans un processus à part
(voir figure3d.py) : `python lanceur_figure3d.py <script> <dossier de sortie>`.

Contrat du script : il construit une figure Plotly `fig` (plotly.graph_objects.Figure, ou son dict), avec ses
`frames` si elle est animée. Facultatif : `fps` (images par seconde, 20 par défaut). Le script n'exporte rien
lui-même ; `fig.show()` et les exports (`write_image`, `write_html`, `to_image`) sont sans effet.

Sortie : `scene.json` ({atlas: {version, fps}, figure}). Autonome : ce fichier ne dépend que de la bibliothèque
standard et de plotly, pas du paquet atlas, que le Python partagé ne voit pas.
"""

import json
import os
import runpy
import sys
import traceback
from pathlib import Path


def echec(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(2)


def main() -> None:
    script, sortie = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
    try:
        import plotly.graph_objects as go
        import plotly.io as pio
    except ImportError:
        echec("plotly n'est pas installé dans le Python partagé : pip install plotly")
    # Pas de navigateur ni de fenêtre ouverts depuis le serveur, ni d'export : le rendu de contrôle que l'agent fait
    # lui-même (fig.write_image) n'a pas lieu ici, Atlas rend la scène ensuite (apercu3d.py).
    rien = lambda *_a, **_k: None  # noqa: E731
    go.Figure.show = go.Figure.write_image = go.Figure.write_html = rien  # type: ignore[method-assign]
    go.Figure.to_image = lambda *_a, **_k: b""  # type: ignore[method-assign]
    pio.show = pio.write_image = pio.write_html = rien

    sys.path.insert(0, str(script.parent))
    sys.argv = [str(script)]
    espace = runpy.run_path(str(script), run_name="__main__")

    fig = espace.get("fig")
    if isinstance(fig, dict):
        fig = go.Figure(fig)
    if not isinstance(fig, go.Figure):
        echec("Le script doit définir une variable `fig` : une figure Plotly (plotly.graph_objects.Figure).")
    scene = {"atlas": {"version": 1, "fps": espace.get("fps", 20)}, "figure": json.loads(fig.to_json())}
    (sortie / "scene.json").write_text(json.dumps(scene, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
        code = 0
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else 0 if e.code is None else 1
    except BaseException:
        traceback.print_exc()
        code = 1
    # Sortie immédiate : un thread laissé par le script (ou une bibliothèque qu'il utilise) ferait attendre Python
    # indéfiniment à la fermeture alors que tout est écrit.
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)
