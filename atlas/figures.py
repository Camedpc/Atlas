"""Figures du graphe (fonctions pures) : validation d'un tracé vectoriel, évaluation des lois, résumé pour l'IA.

Un tracé (`figures.trace`) :

    {
      "x": {"titre": "$t$", "unite": "s", "echelle": "lin" | "log", "min"?: 0, "max"?: 10},
      "y": {...},
      "series": [
        {"genre": "mesures", "nom": "Chronophotographie", "points": [[x, y], [x, y, σy], [x, y, σy, σx]],
         "source"?: "docs_session/mesures.csv"},
        {"genre": "courbe", "nom": "Simulation", "points": [[x, y], ...], "source"?: "scripts/simulation.py"},
        {"genre": "loi", "nom": "Prédiction", "expression": "v_l*tanh(g*x/v_l)", "variable"?: "x",
         "parametres": {"g": {"valeur": 9.81, "incertitude"?: 0.01, "noeud"?: "def_g"}}, "de"?: 0, "a"?: 5}
      ]
    }

Une loi est tracée par le serveur (`tracer`) : le front reçoit ses points et, si un paramètre a une incertitude, la
bande obtenue aux coins du pavé des incertitudes. Les expressions n'acceptent que des nombres, la variable, les
paramètres, + − × / ^ et quelques fonctions : rien n'est exécuté.
"""

from __future__ import annotations

import ast
import itertools
import math
from typing import Any

GENRES_SERIE = ("mesures", "courbe", "loi")
SERIES_MAX = 12
POINTS_MAX = 5000
POINTS_TOTAL_MAX = 20000
ECHANTILLONS_LOI = 200
PARAMETRES_INCERTAINS_MAX = 6

FONCTIONS = {
    "sqrt": math.sqrt,
    "exp": math.exp,
    "ln": math.log,
    "log": math.log,
    "log10": math.log10,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "sinh": math.sinh,
    "cosh": math.cosh,
    "tanh": math.tanh,
    "arcsin": math.asin,
    "arccos": math.acos,
    "arctan": math.atan,
    "asin": math.asin,
    "acos": math.acos,
    "atan": math.atan,
    "abs": abs,
}
CONSTANTES = {"pi": math.pi, "e": math.e}
OPERATEURS = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b,
    ast.Pow: lambda a, b: a**b,
}


class ErreurFigure(Exception):
    """Figure refusée ; le message est renvoyé tel quel à l'agent."""


# ─── Expressions ─────────────────────────────────────────────────────────────


def compiler(expression: str, noms: set[str]) -> ast.expr:
    """Analyse une expression et vérifie qu'elle n'utilise que `noms`, les constantes et les fonctions permises."""
    try:
        arbre = ast.parse(expression.replace("^", "**").replace("·", "*").replace("×", "*"), mode="eval").body
    except SyntaxError:
        raise ErreurFigure(f"Expression illisible « {expression} ».") from None

    def verifier(n: ast.AST) -> None:
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)) and not isinstance(n.value, bool):
            return
        if isinstance(n, ast.Name):
            if n.id not in noms and n.id not in CONSTANTES:
                raise ErreurFigure(f"« {n.id} » n'est ni la variable ni un paramètre de la loi « {expression} ».")
            return
        if isinstance(n, ast.BinOp) and type(n.op) in OPERATEURS:
            verifier(n.left)
            verifier(n.right)
            return
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, (ast.USub, ast.UAdd)):
            verifier(n.operand)
            return
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in FONCTIONS and not n.keywords:
            if len(n.args) != 1:
                raise ErreurFigure(f"{n.func.id} prend un seul argument.")
            verifier(n.args[0])
            return
        raise ErreurFigure(
            f"Expression non permise dans « {expression} » : nombres, variable, paramètres, + - * / ^ et "
            f"{', '.join(sorted(FONCTIONS))}."
        )

    verifier(arbre)
    return arbre


def evaluer(arbre: ast.expr, valeurs: dict[str, float]) -> float | None:
    """Valeur de l'expression, ou None hors du domaine (division par zéro, racine d'un négatif…)."""

    def ev(n: ast.AST) -> float:
        if isinstance(n, ast.Constant):
            return float(n.value)
        if isinstance(n, ast.Name):
            return valeurs[n.id] if n.id in valeurs else CONSTANTES[n.id]
        if isinstance(n, ast.BinOp):
            return OPERATEURS[type(n.op)](ev(n.left), ev(n.right))
        if isinstance(n, ast.UnaryOp):
            v = ev(n.operand)
            return -v if isinstance(n.op, ast.USub) else v
        assert isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
        return FONCTIONS[n.func.id](ev(n.args[0]))

    try:
        v = ev(arbre)
    except (ArithmeticError, ValueError):
        return None
    if isinstance(v, complex) or not math.isfinite(v):
        return None
    return float(v)


# ─── Validation ──────────────────────────────────────────────────────────────


def _nombre(v: Any, quoi: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise ErreurFigure(f"{quoi} doit être un nombre fini (reçu « {v} »).")
    return float(v)


def _axe(axe: Any, nom: str) -> dict[str, Any]:
    if not isinstance(axe, dict):
        raise ErreurFigure(f"Axe {nom} manquant : {{titre, unite?, echelle?: lin|log, min?, max?}}.")
    titre = str(axe.get("titre") or "").strip()
    if not titre:
        raise ErreurFigure(f"L'axe {nom} a besoin d'un titre (grandeur, en LaTeX si besoin).")
    echelle = axe.get("echelle", "lin")
    if echelle not in ("lin", "log"):
        raise ErreurFigure(f"Échelle de l'axe {nom} : lin ou log.")
    propre: dict[str, Any] = {"titre": titre, "echelle": echelle}
    if axe.get("unite"):
        propre["unite"] = str(axe["unite"])
    for borne in ("min", "max"):
        if axe.get(borne) is not None:
            propre[borne] = _nombre(axe[borne], f"{nom}.{borne}")
            if echelle == "log" and propre[borne] <= 0:
                raise ErreurFigure(f"Axe {nom} en échelle log : {borne} doit être positif.")
    if "min" in propre and "max" in propre and propre["min"] >= propre["max"]:
        raise ErreurFigure(f"Axe {nom} : min doit être inférieur à max.")
    return propre


def _points(points: Any, quoi: str, largeur_max: int, minimum: int) -> list[list[float]]:
    if not isinstance(points, list) or not minimum <= len(points) <= POINTS_MAX:
        raise ErreurFigure(f"{quoi} : entre {minimum} et {POINTS_MAX} points [x, y, …].")
    propres = []
    for k, p in enumerate(points):
        if not isinstance(p, list) or not 2 <= len(p) <= largeur_max:
            forme = "[x, y]" if largeur_max == 2 else "[x, y], [x, y, σy] ou [x, y, σy, σx]"
            raise ErreurFigure(f"{quoi}, point {k} : {forme}.")
        propres.append([_nombre(v, f"{quoi}, point {k}") for v in p])
        if any(v < 0 for v in propres[-1][2:]):
            raise ErreurFigure(f"{quoi}, point {k} : une incertitude est positive.")
    return propres


def valider_trace(trace: Any) -> dict[str, Any]:
    """Tracé normalisé ; lève `ErreurFigure` avec un message que l'agent peut corriger."""
    if not isinstance(trace, dict):
        raise ErreurFigure("Le tracé est un objet {x, y, series}.")
    propre: dict[str, Any] = {"x": _axe(trace.get("x"), "x"), "y": _axe(trace.get("y"), "y"), "series": []}
    series = trace.get("series")
    if not isinstance(series, list) or not 1 <= len(series) <= SERIES_MAX:
        raise ErreurFigure(f"Le tracé a de 1 à {SERIES_MAX} séries.")
    total = 0
    for k, s in enumerate(series):
        if not isinstance(s, dict) or s.get("genre") not in GENRES_SERIE:
            raise ErreurFigure(f"Série {k} : genre mesures, courbe ou loi.")
        nom = str(s.get("nom") or "").strip()
        if not nom:
            raise ErreurFigure(f"Série {k} : donne-lui un nom (il sert de légende).")
        serie: dict[str, Any] = {"genre": s["genre"], "nom": nom}
        if s.get("source"):
            serie["source"] = str(s["source"])
        if s["genre"] == "loi":
            serie |= _loi(s, f"Série {k} ({nom})")
        else:
            serie["points"] = _points(
                s.get("points"),
                f"Série {k} ({nom})",
                4 if s["genre"] == "mesures" else 2,
                1 if s["genre"] == "mesures" else 2,
            )
            total += len(serie["points"])
        propre["series"].append(serie)
    if total > POINTS_TOTAL_MAX:
        raise ErreurFigure(f"Trop de points ({total}) : {POINTS_TOTAL_MAX} au plus, sous-échantillonne.")
    for nom_axe in ("x", "y"):
        if propre[nom_axe]["echelle"] == "log":
            indice = 0 if nom_axe == "x" else 1
            for s in propre["series"]:
                if any(p[indice] <= 0 for p in s.get("points", [])):
                    raise ErreurFigure(f"Axe {nom_axe} en échelle log : la série « {s['nom']} » a des valeurs ≤ 0.")
    return propre


def _loi(s: dict[str, Any], quoi: str) -> dict[str, Any]:
    variable = s.get("variable", "x")
    if not isinstance(variable, str) or not variable.isidentifier():
        raise ErreurFigure(f"{quoi} : variable invalide « {variable} ».")
    parametres = s.get("parametres") or {}
    if not isinstance(parametres, dict):
        raise ErreurFigure(f"{quoi} : parametres est un objet {{nom: {{valeur, incertitude?, noeud?}}}}.")
    propres: dict[str, dict[str, Any]] = {}
    for nom, p in parametres.items():
        if not nom.isidentifier() or nom == variable:
            raise ErreurFigure(f"{quoi} : nom de paramètre invalide « {nom} ».")
        if isinstance(p, (int, float)) and not isinstance(p, bool):
            p = {"valeur": p}
        if not isinstance(p, dict) or "valeur" not in p:
            raise ErreurFigure(f"{quoi} : le paramètre {nom} a besoin d'une valeur.")
        propre: dict[str, Any] = {"valeur": _nombre(p["valeur"], f"{quoi}, {nom}")}
        if p.get("incertitude") is not None:
            propre["incertitude"] = abs(_nombre(p["incertitude"], f"{quoi}, incertitude de {nom}"))
        if p.get("noeud"):
            propre["noeud"] = str(p["noeud"])
        propres[nom] = propre
    expression = str(s.get("expression") or "").strip()
    if not expression:
        raise ErreurFigure(f"{quoi} : une loi a besoin d'une expression (ex. « a*x^2 + b »).")
    compiler(expression, {variable, *propres})
    loi: dict[str, Any] = {"expression": expression, "variable": variable, "parametres": propres}
    for borne in ("de", "a"):
        if s.get(borne) is not None:
            loi[borne] = _nombre(s[borne], f"{quoi}, {borne}")
    if "de" in loi and "a" in loi and loi["de"] >= loi["a"]:
        raise ErreurFigure(f"{quoi} : « de » doit être inférieur à « a ».")
    return loi


def noeuds_cites(trace: dict[str, Any]) -> set[str]:
    """Nœuds d'où viennent les paramètres des lois (ils doivent exister dans le graphe)."""
    return {
        p["noeud"]
        for s in trace["series"]
        if s["genre"] == "loi"
        for p in s["parametres"].values()
        if "noeud" in p
    }


# ─── Tracé des lois ──────────────────────────────────────────────────────────


def _etendue_x(trace: dict[str, Any], loi: dict[str, Any]) -> tuple[float, float] | None:
    xs = [p[0] for s in trace["series"] for p in s.get("points", [])]
    de = loi.get("de", trace["x"].get("min", min(xs) if xs else None))
    a = loi.get("a", trace["x"].get("max", max(xs) if xs else None))
    if de is None or a is None or de >= a:
        return None
    return de, a


def tracer(trace: dict[str, Any]) -> dict[str, Any]:
    """Le tracé, où chaque loi reçoit `points` [[x, y]] et, si un paramètre est incertain, `bande` [[x, ymin, ymax]]
    (valeurs extrêmes aux coins du pavé des incertitudes). Une loi sans étendue connue reste sans points."""
    sortie = {**trace, "series": []}
    log_x = trace["x"]["echelle"] == "log"
    for s in trace["series"]:
        if s["genre"] != "loi":
            sortie["series"].append(s)
            continue
        s = dict(s)
        etendue = _etendue_x(trace, s)
        if etendue is None or (log_x and etendue[0] <= 0):
            sortie["series"].append(s)
            continue
        arbre = compiler(s["expression"], {s["variable"], *s["parametres"]})
        de, a = etendue
        n = ECHANTILLONS_LOI - 1
        xs = (
            [de * (a / de) ** (k / n) for k in range(n + 1)] if log_x else [de + (a - de) * k / n for k in range(n + 1)]
        )
        centre = {nom: p["valeur"] for nom, p in s["parametres"].items()}
        incertains = [nom for nom, p in s["parametres"].items() if p.get("incertitude")][:PARAMETRES_INCERTAINS_MAX]
        ecarts = [s["parametres"][n]["incertitude"] for n in incertains]
        coins = [
            centre | {n: centre[n] + signe * e for n, signe, e in zip(incertains, signes, ecarts, strict=True)}
            for signes in itertools.product((-1, 1), repeat=len(incertains))
        ]
        points, bande = [], []
        for x in xs:
            y = evaluer(arbre, {**centre, s["variable"]: x})
            if y is not None:
                points.append([x, y])
            if incertains:
                ys = [v for c in coins if (v := evaluer(arbre, {**c, s["variable"]: x})) is not None]
                if ys:
                    bande.append([x, min(ys), max(ys)])
        s["points"] = points
        if bande:
            s["bande"] = bande
        sortie["series"].append(s)
    return sortie


# ─── Résumé pour l'IA ────────────────────────────────────────────────────────


def _nombre_court(v: float) -> str:
    return f"{v:.4g}"


def _titre_axe(axe: dict[str, Any]) -> str:
    unite = f" ({axe['unite']})" if axe.get("unite") else ""
    return f"{axe['titre']}{unite}" + (", échelle log" if axe["echelle"] == "log" else "")


def resumer_trace(trace: dict[str, Any], points_max: int = 40) -> str:
    """Le tracé en texte : axes, et pour chaque série ses points (jusqu'à `points_max`) ou son expression."""
    lignes = [f"x : {_titre_axe(trace['x'])} ; y : {_titre_axe(trace['y'])}"]
    for s in trace["series"]:
        source = f" [source : {s['source']}]" if s.get("source") else ""
        if s["genre"] == "loi":
            params = ", ".join(
                f"{nom} = {_nombre_court(p['valeur'])}"
                + (f" ± {_nombre_court(p['incertitude'])}" if p.get("incertitude") else "")
                + (f" (de {p['noeud']})" if p.get("noeud") else "")
                for nom, p in s["parametres"].items()
            )
            etendue = f", {s['variable']} de {_nombre_court(s['de'])}" if "de" in s else ""
            etendue += f" à {_nombre_court(s['a'])}" if "a" in s else ""
            lignes.append(f"- loi « {s['nom']} » : y = {s['expression']}{etendue}" + (f" ; {params}" if params else ""))
            continue
        pts = s["points"]
        montres = pts if len(pts) <= points_max else pts[:: math.ceil(len(pts) / points_max)]
        texte = " ".join("(" + ", ".join(_nombre_court(v) for v in p) + ")" for p in montres)
        entete = "(x, y, σy, σx)" if s["genre"] == "mesures" else "(x, y)"
        reduit = f", {len(montres)} montrés sur {len(pts)}" if len(montres) < len(pts) else ""
        lignes.append(f"- {s['genre']} « {s['nom']} »{source}, {len(pts)} points {entete}{reduit} : {texte}")
    return "\n".join(lignes)


# ─── Images ──────────────────────────────────────────────────────────────────

TAILLE_IMAGE_MAX = 10 * 1024 * 1024
EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}


def examiner_image(donnees: bytes) -> tuple[str, int, int]:
    """(type MIME, largeur, hauteur) lus dans les octets eux-mêmes, pas dans l'extension : PNG, JPEG, GIF, WebP."""
    if len(donnees) > TAILLE_IMAGE_MAX:
        raise ErreurFigure(f"Image trop lourde ({len(donnees) // 1024} Ko) : 10 Mo au plus.")
    d = donnees
    if d[:8] == b"\x89PNG\r\n\x1a\n" and d[12:16] == b"IHDR":
        return "image/png", int.from_bytes(d[16:20], "big"), int.from_bytes(d[20:24], "big")
    if d[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif", int.from_bytes(d[6:8], "little"), int.from_bytes(d[8:10], "little")
    if d[:4] == b"RIFF" and d[8:12] == b"WEBP":
        morceau = d[12:16]
        if morceau == b"VP8X":
            return "image/webp", int.from_bytes(d[24:27], "little") + 1, int.from_bytes(d[27:30], "little") + 1
        if morceau == b"VP8 ":
            largeur, hauteur = int.from_bytes(d[26:28], "little"), int.from_bytes(d[28:30], "little")
            return "image/webp", largeur & 0x3FFF, hauteur & 0x3FFF
        if morceau == b"VP8L":
            bits = int.from_bytes(d[21:25], "little")
            return "image/webp", (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if d[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(d):
            if d[i] != 0xFF:
                i += 1
                continue
            marqueur = d[i + 1]
            if marqueur in (0xD8, 0x01) or 0xD0 <= marqueur <= 0xD7 or marqueur == 0xFF:
                i += 1 if marqueur == 0xFF else 2
                continue
            longueur = int.from_bytes(d[i + 2 : i + 4], "big")
            # SOF0…SOF15, sauf DHT (C4), JPG (C8) et DAC (CC).
            if 0xC0 <= marqueur <= 0xCF and marqueur not in (0xC4, 0xC8, 0xCC):
                return "image/jpeg", int.from_bytes(d[i + 7 : i + 9], "big"), int.from_bytes(d[i + 5 : i + 7], "big")
            i += 2 + longueur
    raise ErreurFigure("Fichier non reconnu comme image : PNG, JPEG, GIF ou WebP (pas de SVG).")
