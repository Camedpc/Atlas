"""Aperçu d'une scène 3D : Atlas la rend lui-même en PNG, telle que le front la montrera (figures3d.vue_du_front),
pour que l'agent la voie avant de conclure. Plotly + Kaleido (Chrome sans fenêtre, BROWSER_PATH sur la VM).

Une scène dont tous les rendus sont vides (fond uni) est refusée : le front n'afficherait rien.
"""

import io
import tempfile
from pathlib import Path
from typing import Any

from .. import figures3d
from ..figures import ErreurFigure

LARGEUR, HAUTEUR = 1000, 640
# Part des pixels qui doivent s'écarter du fond pour qu'un rendu ne soit pas vide : le texte seul (titres,
# annotations) en couvre moins de 1 %, la plus petite scène (deux points et une ligne, parois de Plotly) plus de 10 %.
PART_MIN = 0.02
# Écart au fond, sur 255 : les parois gris très clair de Plotly comptent.
ECART_FOND = 8


class ErreurApercu(ErreurFigure):
    """Rendu impossible (Chrome absent, Kaleido en échec) : la figure n'est pas créée."""


def rendre(scene: dict[str, Any]) -> list[tuple[int, bytes]]:
    """Les PNG des images d'aperçu (figures3d.indices_apercu), avec leur indice (−1 : scène fixe)."""
    try:
        import plotly.io as pio
    except ImportError:
        raise ErreurApercu("Aperçu impossible : plotly n'est pas installé sur le serveur.") from None
    figure = scene["figure"]
    indices = figures3d.indices_apercu(len(figure["frames"]))
    # Un seul appel pour toutes les images : Chrome n'est lancé qu'une fois.
    with tempfile.TemporaryDirectory(prefix="apercu3d-") as dossier:
        chemins = [Path(dossier) / f"{k}.png" for k in range(len(indices))]
        vues = [figures3d.vue_du_front(figure, i) for i in indices]
        try:
            pio.write_images(vues, chemins, format="png", width=LARGEUR, height=HAUTEUR)
        except Exception as e:  # noqa: BLE001 — Kaleido lève des erreurs de toutes sortes (Chrome, délai, rendu)
            raise ErreurApercu(f"Aperçu impossible (rendu de la scène par Kaleido) : {e}") from None
        return [(i, c.read_bytes()) for i, c in zip(indices, chemins, strict=True)]


def vide(png: bytes) -> bool:
    """Vrai si l'image est presque unie : moins de PART_MIN des pixels s'écartent de la couleur du coin."""
    from PIL import Image, ImageChops

    image = Image.open(io.BytesIO(png)).convert("RGB")
    fond = Image.new("RGB", image.size, image.getpixel((0, 0)))
    ecart = ImageChops.difference(image, fond).convert("L").point(lambda v: 255 if v > ECART_FOND else 0)
    histogramme = ecart.histogram()
    return histogramme[255] < PART_MIN * image.width * image.height


def verifier(scene: dict[str, Any]) -> list[tuple[int, bytes]]:
    """Rend la scène ; lève ErreurFigure si tous les rendus sont vides."""
    rendus = rendre(scene)
    if all(vide(png) for _, png in rendus):
        raise ErreurFigure(
            "La scène rendue est vide : rien (ou presque) de visible avec la caméra finale (layout.scene.camera.eye, "
            "ou la vue par défaut à trois-quarts). Vérifie les bornes des axes, la taille des objets et la position de "
            "la caméra."
        )
    return rendus
