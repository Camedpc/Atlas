"""Figures 3D (fonctions pures) : vérification et résumé d'une scène Plotly animée.

Une scène est le JSON écrit par le lanceur (`orchestrateur/lanceur_figure3d.py`) à partir de la figure `fig` du
script de l'agent :

    {"atlas": {"version": 1, "fps": 20},
     "figure": {"data": [...], "layout": {...}, "frames": [{"name"?, "data": [...], "traces"?: [...]}, ...]}}

Le front la joue en boucle avec ses propres commandes (lecture, vitesse, caméra) : les boutons et curseurs de Plotly
(`updatemenus`, `sliders`) sont retirés, comme les images (`layout.images`, qui iraient chercher des URL) et les
couleurs et tailles de fond. Une seule scène 3D, et à côté, si l'agent le veut, des graphiques 2D (`scatter`, par
exemple l'énergie en fonction du temps avec un point qui avance d'une image à l'autre). Les tableaux numpy arrivent
encodés (`{"dtype": "f8", "bdata": "<base64>"}`, format de plotly.js) : ils sont gardés tels quels, et décodés
seulement pour le résumé.
"""

from __future__ import annotations

import array
import base64
import binascii
import json
import math
import re
import sys
from collections import Counter
from collections.abc import Iterable, Iterator
from typing import Any

from .figures import ErreurFigure, _nombre_court

VERSION = 1
SCENE_OCTETS_MAX = 15 * 1024 * 1024
IMAGES_MAX = 600
FPS_DEFAUT = 20
FPS_MIN, FPS_MAX = 1, 60
TYPES_3D = ("scatter3d", "surface", "mesh3d", "cone", "streamtube", "isosurface", "volume")
# Graphiques 2D à côté de la scène (build gl3d de plotly.js : scatter seulement).
TYPES_2D = ("scatter",)
# Remplacés par le front (commandes, fond, taille) ou dangereux (images chargées depuis une URL).
RETIRES_LAYOUT = ("updatemenus", "sliders", "images", "paper_bgcolor", "plot_bgcolor", "width", "height", "autosize")
AUTRE_SCENE = re.compile(r"^scene\d+$")
# dtype de plotly.js → code du module array.
TYPES_BDATA = {"f8": "d", "f4": "f", "i1": "b", "u1": "B", "i2": "h", "u2": "H", "i4": "i", "u4": "I"}


# ─── Vérification ────────────────────────────────────────────────────────────


def _nettoyer_layout(layout: Any, quoi: str) -> dict[str, Any]:
    if layout is None:
        return {}
    if not isinstance(layout, dict):
        raise ErreurFigure(f"{quoi} : layout doit être un objet.")
    if autres := sorted(k for k in layout if AUTRE_SCENE.match(k)):
        raise ErreurFigure(f"{quoi} : une seule scène 3D par figure (trouvé {', '.join(autres)}).")
    propre = {k: v for k, v in layout.items() if k not in RETIRES_LAYOUT}
    modele = propre.get("template")
    if isinstance(modele, dict) and isinstance(modele.get("layout"), dict):
        propre["template"] = modele | {"layout": {k: v for k, v in modele["layout"].items() if k not in RETIRES_LAYOUT}}
    return propre


def _verifier_trace(t: Any, quoi: str, type_requis: bool) -> None:
    if not isinstance(t, dict):
        raise ErreurFigure(f"{quoi} : un tracé est un objet.")
    genre = t.get("type")
    if genre is None and not type_requis:
        return
    if genre in TYPES_2D:
        return
    if genre not in TYPES_3D:
        admis = ", ".join(TYPES_3D)
        raise ErreurFigure(f"{quoi} : type « {genre} » refusé ; admis : {admis}, et scatter pour les graphiques 2D.")
    if t.get("scene", "scene") != "scene":
        raise ErreurFigure(f"{quoi} : une seule scène 3D par figure (tracé sur « {t['scene']} »).")


def valider_scene(donnees: bytes) -> dict[str, Any]:
    """Scène normalisée, prête à ranger ; lève `ErreurFigure` avec un message que l'agent peut corriger.
    NaN et infinis deviennent null (un trou pour Plotly, et du JSON que le navigateur sait lire)."""
    if len(donnees) > SCENE_OCTETS_MAX:
        raise ErreurFigure(
            f"Scène trop lourde ({len(donnees) // 1024 // 1024} Mo) : {SCENE_OCTETS_MAX // 1024 // 1024} Mo au plus. "
            "Réduis le nombre d'images ou la finesse des maillages."
        )
    try:
        brut = json.loads(donnees, parse_constant=lambda _: None)
    except ValueError:
        raise ErreurFigure("La scène n'est pas du JSON lisible.") from None
    if not isinstance(brut, dict) or not isinstance(brut.get("figure"), dict):
        raise ErreurFigure("La scène est un objet {atlas, figure}.")
    atlas = brut.get("atlas") or {}
    fps = atlas.get("fps", FPS_DEFAUT) if isinstance(atlas, dict) else FPS_DEFAUT
    if isinstance(fps, bool) or not isinstance(fps, int | float) or not FPS_MIN <= fps <= FPS_MAX:
        raise ErreurFigure(f"fps doit être un nombre entre {FPS_MIN} et {FPS_MAX} (reçu « {fps} »).")

    figure = brut["figure"]
    data = figure.get("data")
    if not isinstance(data, list) or not data:
        raise ErreurFigure("La figure n'a aucun tracé (data vide) : ajoute au moins un tracé 3D.")
    for k, t in enumerate(data):
        _verifier_trace(t, f"Tracé {k}", type_requis=True)
    if not any(t["type"] in TYPES_3D for t in data):
        raise ErreurFigure("La figure n'a aucun tracé 3D : les graphiques 2D accompagnent une scène 3D.")
    images = figure.get("frames") or []
    if not isinstance(images, list):
        raise ErreurFigure("frames doit être une liste d'images.")
    if len(images) > IMAGES_MAX:
        raise ErreurFigure(f"Trop d'images ({len(images)}) : {IMAGES_MAX} au plus, baisse fps ou la durée.")
    propres = []
    for i, image in enumerate(images):
        if not isinstance(image, dict):
            raise ErreurFigure(f"Image {i} : une image (frame) est un objet.")
        for k, t in enumerate(image.get("data") or []):
            _verifier_trace(t, f"Image {i}, tracé {k}", type_requis=False)
        traces = image.get("traces")
        if traces is not None and (
            not isinstance(traces, list)
            or not all(isinstance(n, int) and not isinstance(n, bool) and 0 <= n < len(data) for n in traces)
        ):
            raise ErreurFigure(f"Image {i} : traces liste des indices de tracés existants (0 à {len(data) - 1}).")
        propre = {k: v for k, v in image.items() if k in ("name", "data", "traces")}
        if "layout" in image:
            propre["layout"] = _nettoyer_layout(image["layout"], f"Image {i}")
        propres.append(propre)

    return {
        "atlas": {"version": VERSION, "fps": fps},
        "figure": {"data": data, "layout": _nettoyer_layout(figure.get("layout"), "Figure"), "frames": propres},
    }


def serialiser(scene: dict[str, Any]) -> bytes:
    return json.dumps(scene, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()


# ─── Ce que montre le front ──────────────────────────────────────────────────
# Recopie des réglages de frontend/src/graphe-3d.ts, pour que l'aperçu rendu par le serveur (apercu3d.py) soit ce
# que Camille verra à la fin de la descente de la caméra : à garder alignés.

# Œil par défaut (vue plongeante à 30°, à trois-quarts, à distance 3) quand la scène n'en donne pas.
_HORIZONTAL = 3 * math.cos(math.pi / 6) / math.sqrt(2)
OEIL_DEFAUT = {"x": _HORIZONTAL, "y": -_HORIZONTAL, "z": 1.5}
# Marges minimales du front : le titre en haut, la barre de commandes en bas.
MARGES_FRONT = {"l": 12, "r": 12, "t": 44, "b": 64}


def oeil_final(layout: dict[str, Any]) -> dict[str, float]:
    """L'œil de la caméra où la descente du front s'arrête : celui de l'agent (layout.scene.camera.eye) s'il est
    valide, sinon OEIL_DEFAUT."""
    reglages = layout.get("scene")
    camera = reglages.get("camera") if isinstance(reglages, dict) else None
    oeil = camera.get("eye") if isinstance(camera, dict) else None
    if isinstance(oeil, dict):
        v = [oeil.get(k) for k in "xyz"]
        if all(isinstance(x, int | float) and not isinstance(x, bool) and math.isfinite(x) for x in v):
            if math.hypot(*v) > 1e-6:
                return {k: float(x) for k, x in zip("xyz", v, strict=True)}
    return dict(OEIL_DEFAUT)


def marges(layout: dict[str, Any]) -> dict[str, float]:
    """Marges du front : celles de l'agent, jamais sous MARGES_FRONT."""
    agent = layout.get("margin") if isinstance(layout.get("margin"), dict) else {}
    return {
        k: max(m, v) if isinstance(v := agent.get(k), int | float) and not isinstance(v, bool) else m
        for k, m in MARGES_FRONT.items()
    }


def _fusionner(base: Any, ajout: Any) -> Any:
    """Fusion à la manière de Plotly.animate : les objets se complètent, le reste (valeurs, listes, tableaux typés
    {dtype, bdata}) est remplacé."""
    if isinstance(base, dict) and isinstance(ajout, dict) and "bdata" not in ajout and "bdata" not in base:
        return {**base, **{k: _fusionner(base.get(k), v) for k, v in ajout.items()}}
    return ajout


def image_de_la_figure(figure: dict[str, Any], i: int) -> dict[str, Any]:
    """La figure à l'image `i` de son animation (base si i < 0 ou sans images) : {data, layout}, sans frames."""
    data = [dict(t) for t in figure["data"]]
    layout = dict(figure["layout"])
    images = figure.get("frames") or []
    if 0 <= i < len(images):
        image = images[i]
        indices = image.get("traces")
        for k, t in enumerate(image.get("data") or []):
            n = indices[k] if indices is not None and k < len(indices) else k
            if 0 <= n < len(data):
                data[n] = _fusionner(data[n], t)
        if image.get("layout"):
            layout = _fusionner(layout, image["layout"])
    return {"data": data, "layout": layout}


def vue_du_front(figure: dict[str, Any], i: int) -> dict[str, Any]:
    """L'image `i` telle que le front la montre : sans titre (il est dans l'en-tête), fond blanc, parois de l'agent,
    caméra finale (oeil_final), marges du front."""
    vue = image_de_la_figure(figure, i)
    layout = {k: v for k, v in vue["layout"].items() if k != "title"}
    scene = dict(layout.get("scene") or {})
    scene["bgcolor"] = "rgba(0,0,0,0)"
    scene["camera"] = {"eye": oeil_final(figure["layout"]), "up": {"x": 0, "y": 0, "z": 1}}
    layout |= {"scene": scene, "paper_bgcolor": "white", "plot_bgcolor": "white", "margin": marges(figure["layout"])}
    return {"data": vue["data"], "layout": layout}


def indices_apercu(n: int) -> list[int]:
    """Images montrées à l'agent : début, tiers et deux tiers de la boucle (la base si la scène est fixe)."""
    return sorted({0, n // 3, 2 * n // 3}) if n > 0 else [-1]


# ─── Résumé pour l'IA ────────────────────────────────────────────────────────


def _decoder(v: dict[str, Any]) -> Iterable[float]:
    """Tableau typé de plotly.js ({dtype, bdata}) ; vide s'il est illisible."""
    code = TYPES_BDATA.get(v.get("dtype"))  # type: ignore[arg-type]
    if code is None or not isinstance(v.get("bdata"), str):
        return ()
    try:
        octets = base64.b64decode(v["bdata"], validate=True)
    except (binascii.Error, ValueError):
        return ()
    valeurs = array.array(code)
    if len(octets) % valeurs.itemsize:
        return ()
    valeurs.frombytes(octets)
    if sys.byteorder == "big":
        valeurs.byteswap()
    return valeurs


def _valeurs(v: Any) -> Iterator[float]:
    """Nombres finis d'une donnée de tracé : nombre, liste (imbriquée) ou tableau typé."""
    if isinstance(v, bool):
        return
    if isinstance(v, int | float):
        if math.isfinite(v):
            yield float(v)
    elif isinstance(v, list):
        for x in v:
            yield from _valeurs(x)
    elif isinstance(v, dict):
        yield from (x for x in _decoder(v) if math.isfinite(x))


def _titre(axe: Any) -> str | None:
    titre = axe.get("title") if isinstance(axe, dict) else None
    if isinstance(titre, dict):
        titre = titre.get("text")
    return titre if isinstance(titre, str) and titre.strip() else None


def _traces_par_indice(figure: dict[str, Any]) -> list[list[dict[str, Any]]]:
    """Pour chaque tracé de `data`, ses versions : lui-même, puis celles des images (rattachées par `traces`)."""
    versions: list[list[dict[str, Any]]] = [[t] for t in figure["data"]]
    for image in figure["frames"]:
        for k, t in enumerate(image.get("data") or []):
            indices = image.get("traces")
            n = indices[k] if indices is not None and k < len(indices) else k
            if isinstance(t, dict) and 0 <= n < len(versions):
                versions[n].append(t)
    return versions


def _etendue(versions: list[dict[str, Any]], nom: str) -> str:
    vals = [v for t in versions for v in _valeurs(t.get(nom))]
    return f" ∈ [{_nombre_court(min(vals))}, {_nombre_court(max(vals))}]" if vals else ""


def resumer_scene(scene: dict[str, Any]) -> str:
    """La scène en texte : animation, tracés, titres et étendues des axes (sur toutes les images), puis les
    graphiques 2D (nom, axes, étendues)."""
    figure = scene["figure"]
    fps = scene["atlas"]["fps"]
    n = len(figure["frames"])
    if n:
        lignes = [f"Scène 3D animée : {n} images à {_nombre_court(fps)} im/s, boucle de {_nombre_court(n / fps)} s."]
    else:
        lignes = ["Scène 3D fixe (sans animation)."]
    types = Counter(t["type"] for t in figure["data"])
    lignes.append("Tracés : " + ", ".join(f"{g} ×{c}" if c > 1 else g for g, c in types.items()) + ".")
    reglages = figure["layout"].get("scene") or {}
    versions = _traces_par_indice(figure)
    en_3d = [v for t, vs in zip(figure["data"], versions, strict=True) if t["type"] in TYPES_3D for v in vs]
    axes = []
    for nom in "xyz":
        titre = _titre(reglages.get(f"{nom}axis"))
        axes.append((f"{nom} ({titre})" if titre else nom) + _etendue(en_3d, nom))
    lignes.append("Axes : " + " ; ".join(axes) + ".")
    graphiques = []
    for t, vs in zip(figure["data"], versions, strict=True):
        if t["type"] not in TYPES_2D:
            continue
        noms = []
        for lettre in "xy":
            ref = t.get(f"{lettre}axis") or lettre
            titre = _titre(figure["layout"].get(f"{lettre}axis{ref[1:]}"))
            noms.append((titre or lettre) + _etendue(vs, lettre))
        nom = f"« {t['name']} » " if isinstance(t.get("name"), str) and t["name"] else ""
        graphiques.append(f"- {nom}{noms[1]} en fonction de {noms[0]}")
    if graphiques:
        lignes.append("Graphiques 2D :\n" + "\n".join(graphiques))
    return "\n".join(lignes)
