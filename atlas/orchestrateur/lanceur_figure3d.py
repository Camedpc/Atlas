"""Lanceur d'un script de figure 3D, exécuté par le Python partagé des agents dans un processus à part
(voir figure3d.py) : `python lanceur_figure3d.py <script> <dossier de sortie>`.

Contrat du script : il construit une figure Plotly `fig` (plotly.graph_objects.Figure, ou son dict), avec ses
`frames` si elle est animée. Facultatif : `fps` (images par seconde, 20 par défaut) et `vignette_camera` (la caméra
de la vignette, au format de layout.scene.camera). Le script n'exporte rien lui-même ; `fig.show()` est sans effet.

Sortie : `scene.json` ({atlas: {version, fps}, figure}) et `vignette.png` (la première image, en vue plongeante).
Autonome : ce fichier ne dépend que de la bibliothèque standard et de plotly (+ kaleido pour la vignette), pas du
paquet atlas, que le Python partagé ne voit pas.
"""

import json
import runpy
import sys
from pathlib import Path

# Environ 30° au-dessus de l'horizontale, de face et un peu de côté.
CAMERA_VIGNETTE = {"eye": {"x": 1.25, "y": -1.25, "z": 1.0}}
TAILLE_VIGNETTE = (720, 480)


def echec(message: str) -> None:
    print(message, file=sys.stderr)
    sys.exit(2)


def main() -> None:
    script, sortie = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
    try:
        import plotly.graph_objects as go
        import plotly.io as pio
    except ImportError:
        echec("plotly n'est pas installé dans le Python partagé : pip install plotly kaleido")
    # Pas de navigateur ni de fenêtre ouverts depuis le serveur.
    go.Figure.show = lambda *_a, **_k: None  # type: ignore[method-assign]
    pio.show = lambda *_a, **_k: None

    sys.path.insert(0, str(script.parent))
    sys.argv = [str(script)]
    espace = runpy.run_path(str(script), run_name="__main__")

    fig = espace.get("fig")
    if isinstance(fig, dict):
        fig = go.Figure(fig)
    if not isinstance(fig, go.Figure):
        echec("Le script doit définir une variable `fig` : une figure Plotly (plotly.graph_objects.Figure).")
    fps = espace.get("fps", 20)
    camera = espace.get("vignette_camera") or CAMERA_VIGNETTE

    scene = {"atlas": {"version": 1, "fps": fps}, "figure": json.loads(fig.to_json())}
    (sortie / "scene.json").write_text(json.dumps(scene, ensure_ascii=False), encoding="utf-8")

    vignette = go.Figure(data=fig.data, layout=fig.layout)
    vignette.update_layout(updatemenus=[], sliders=[], scene_camera=camera, margin={"l": 0, "r": 0, "t": 30, "b": 0})
    largeur, hauteur = TAILLE_VIGNETTE
    try:
        vignette.write_image(sortie / "vignette.png", width=largeur, height=hauteur)
    except Exception as e:  # kaleido absent, Chrome introuvable…
        echec(f"Vignette impossible (kaleido et Chrome sont nécessaires) : {type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
