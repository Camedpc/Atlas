"""Fontaine de chaîne (effet Mould) : 30 m de chaîne à billes sortent d'un seau posé à 2,4 m du sol.

Modèle de Biggins et Warner, « Understanding the chain fountain », Proc. R. Soc. A 470 (2014), arXiv:1310.4056 :
- à la prise, le tas pousse la chaîne vers le haut (réaction anormale R = αλv²) ; au sol, tension T_F = βλv² ;
- régime établi : v² = g h₁ / (1 − α − β) et hauteur de la fontaine au-dessus du tas h₂ = α v² / g = α h₁ / (1 − α − β),
  où h₁ est la chute du tas du seau au tas du sol ;
- en vol, la chaîne qui glisse le long d'elle-même garde la forme d'une chaînette renversée (le mouvement ajoute λv² à
  la tension sans changer la forme).
α = 0,12 et β = 0 donnent h₂ ≈ 0,14 h₁, la pente mesurée par les auteurs (chaîne à billes de 4,5 mm, pas de 6,5 mm).

Démarrage (quasi statique : la forme suit la vitesse) : L dv/dt = g h₁ − (1 − α − β) v², L étant la longueur de chaîne
en mouvement ; tant que la fontaine ne dépasse pas le bord, la chaîne glisse sur le bord du seau. Fin : quand la queue
quitte le tas, elle suit le dernier tracé à vitesse constante (simplification). Une bille orange tous les mètres de
chaîne rend le défilement visible (0,2 m par image à 25 im/s, loin du repliement). Sans numpy : plotly seul.
"""

import math
import random

import plotly.graph_objects as go

g = 9.81
alpha, beta = 0.12, 0.0
longueur = 30.0  # m de chaîne
fps = 25

# ─── Décor (m) : seau posé sur une étagère, sol en z = 0 ─────────────────────

r_seau, h_seau, z_fond = 0.10, 0.20, 2.40
z_bord = z_fond + h_seau
r_bille = 0.00225
# Volume apparent de la chaîne : billes de 4,5 mm au pas de 6,5 mm, tas de compacité 0,5.
volume_par_m = (1 / 0.0065) * (4 / 3 * math.pi * r_bille**3) / 0.5
e_seau = longueur * volume_par_m / (math.pi * r_seau**2)  # épaisseur du tas plein dans le seau
pente_tas = math.tan(math.radians(30))


def cone(volume: float) -> tuple[float, float]:
    """Rayon et hauteur du tas au sol (cône à 30°) pour un volume donné."""
    r = (3 * volume / (math.pi * pente_tas)) ** (1 / 3)
    return r, r * pente_tas


d_cat = 0.05  # paramètre de la chaînette : rayon de courbure au sommet
x_sommet = r_seau + 0.01  # le sommet passe juste au-dessus du bord


def trajet(z_tas: float, z_haut: float, z_sol: float) -> list[tuple[float, float]]:
    """Trajet de la chaîne dans le plan (x, z), de la prise dans le seau au tas du sol : chaînette renversée de
    sommet (x_sommet, z_haut), puis chute verticale."""
    demi = d_cat * math.acosh(1 + (z_haut - z_tas) / d_cat)
    x0 = max(-r_seau + 0.02, x_sommet - demi)
    z = lambda x: z_haut - d_cat * (math.cosh((x - x_sommet) / d_cat) - 1)  # noqa: E731
    points = [(x0, z_tas)]
    points += [(x0 + (x_sommet - x0) * k / 24, z(x0 + (x_sommet - x0) * k / 24)) for k in range(25)]
    points += [(x_sommet + demi * k / 24, z(x_sommet + demi * k / 24)) for k in range(1, 25)]
    points.append((x_sommet + demi, z_sol))
    return points


def abscisses(points: list[tuple[float, float]]) -> list[float]:
    s = [0.0]
    for (xa, za), (xb, zb) in zip(points, points[1:], strict=False):
        s.append(s[-1] + math.hypot(xb - xa, zb - za))
    return s


def point_a(points, s_cum, s: float) -> tuple[float, float]:
    for k in range(1, len(points)):
        if s <= s_cum[k] or k == len(points) - 1:
            a, b = points[k - 1], points[k]
            u = 0.0 if s_cum[k] == s_cum[k - 1] else (s - s_cum[k - 1]) / (s_cum[k] - s_cum[k - 1])
            u = min(1.0, max(0.0, u))
            return a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u
    return points[-1]


# Centre du tas au sol : sous la chute du régime établi.
_, h_tas_final = cone(longueur * volume_par_m)
h1_regime = z_fond + r_bille - h_tas_final / 2
v_regime = math.sqrt(g * h1_regime / (1 - alpha - beta))
x_tas = trajet(z_fond, z_fond + alpha * v_regime**2 / g, 0)[-1][0]

# ─── Simulation ──────────────────────────────────────────────────────────────


def etat_geometrique(v: float, au_sol: float, dans_seau: float):
    z_tas = z_fond + r_bille + e_seau * max(0.0, dans_seau) / longueur
    _, h = cone(max(au_sol, 0.0) * volume_par_m)
    z_sol = h + r_bille
    z_haut = max(z_bord + r_bille, z_tas + alpha * v**2 / g)
    return z_tas, z_sol, trajet(z_tas, z_haut, z_sol)


t, v, au_sol = 0.0, 0.0, 0.0
pas = 1 / (fps * 20)
etats = []  # (t, v, points, s_cum, sortie, s_queue)
figes = None  # trajet figé une fois la queue partie
while True:
    if figes is None:
        # Le tas du seau dépend de la longueur en vol, qui dépend du tas : deux passes suffisent.
        dans_seau = longueur - au_sol
        for _ in range(2):
            z_tas, z_sol, points = etat_geometrique(v, au_sol, dans_seau)
            s_cum = abscisses(points)
            dans_seau = longueur - au_sol - s_cum[-1]
        sortie = au_sol + s_cum[-1]
        if sortie >= longueur:
            figes = (points, s_cum)
    else:
        points, s_cum = figes
        sortie = au_sol + s_cum[-1]
    s_queue = max(0.0, sortie - longueur)
    if len(etats) < round(t * fps) + 1:
        etats.append((t, v, points, s_cum, sortie, s_queue))
    if s_queue >= s_cum[-1]:
        break
    if figes is None:
        h1 = z_tas - z_sol
        v += pas * (g * h1 - (1 - alpha - beta) * v**2) / s_cum[-1]
    au_sol += v * pas
    t += pas
# Une seconde à l'arrêt avant de recommencer.
fin = etats[-1]
etats += [(fin[0] + (k + 1) / fps, 0.0, fin[2], fin[3], longueur + fin[3][-1], fin[3][-1]) for k in range(fps)]

# ─── Figure ──────────────────────────────────────────────────────────────────

hasard = random.Random(4)
billes_seau = [
    (r * math.cos(a), r * math.sin(a), hasard.random())
    for r, a in ((r_seau * 0.95 * math.sqrt(hasard.random()), 2 * math.pi * hasard.random()) for _ in range(160))
]
r_final, h_final = cone(longueur * volume_par_m)
billes_sol = []
while len(billes_sol) < 160:
    x, y, z = (hasard.uniform(-1, 1) * r_final, hasard.uniform(-1, 1) * r_final, hasard.random() * h_final)
    if math.hypot(x, y) <= (h_final - z) / pente_tas:
        billes_sol.append((x_tas + x, y, z))
billes_sol.sort(key=lambda b: b[2])  # le tas se remplit par le bas


def fr(x: float, d: int = 1) -> str:
    return f"{x:.{d}f}".replace(".", ",")


def traces(etat) -> list:
    t, v, points, s_cum, sortie, s_queue = etat
    chaine = [p for p, s in zip(points, s_cum, strict=True) if s >= s_queue]
    if s_queue > 0 and s_queue < s_cum[-1]:
        chaine.insert(0, point_a(points, s_cum, s_queue))
    marques = []
    for m in range(0, int(longueur) + 1):
        s = sortie - m
        if s_queue <= s <= s_cum[-1]:
            marques.append(point_a(points, s_cum, s))
    dans_seau = max(0.0, longueur - sortie)
    au_sol = min(longueur, max(0.0, sortie - s_cum[-1]))
    n_seau = round(len(billes_seau) * dans_seau / longueur)
    n_sol = round(len(billes_sol) * au_sol / longueur)
    z_tas = z_fond + r_bille + e_seau * dans_seau / longueur
    seau = billes_seau[:n_seau]
    sol = billes_sol[:n_sol]
    return [
        go.Scatter3d(
            x=[p[0] for p in chaine],
            y=[0.0] * len(chaine),
            z=[p[1] for p in chaine],
            mode="lines",
            line={"width": 9, "color": "#4f555c"},
            name="chaîne",
        ),
        go.Scatter3d(
            x=[p[0] for p in marques],
            y=[0.0] * len(marques),
            z=[p[1] for p in marques],
            mode="markers",
            marker={"size": 6, "color": "#e07b1f"},
            name="un mètre de chaîne",
        ),
        go.Scatter3d(
            x=[b[0] for b in seau],
            y=[b[1] for b in seau],
            z=[z_fond + (z_tas - z_fond) * b[2] for b in seau],
            mode="markers",
            marker={"size": 2, "color": "#6d737a"},
            name="tas dans le seau",
        ),
        go.Scatter3d(
            x=[b[0] for b in sol],
            y=[b[1] for b in sol],
            z=[b[2] for b in sol],
            mode="markers",
            marker={"size": 2, "color": "#6d737a"},
            name="tas au sol",
        ),
        go.Scatter3d(
            x=[-0.42],
            y=[0.0],
            z=[2.95],
            mode="text",
            textposition="middle right",
            text=[f"t = {fr(t)} s · v = {fr(v)} m/s · {fr(min(sortie, longueur))} m sortis"],
            textfont={"size": 13, "color": "#333333"},
        ),
    ]


def cylindre(n: int = 36) -> go.Mesh3d:
    xs, ys, zs = [], [], []
    for z in (z_fond, z_bord):
        for k in range(n):
            xs.append(r_seau * math.cos(2 * math.pi * k / n))
            ys.append(r_seau * math.sin(2 * math.pi * k / n))
            zs.append(z)
    xs.append(0.0), ys.append(0.0), zs.append(z_fond)
    i, j, k = [], [], []
    for a in range(n):
        b = (a + 1) % n
        i += [a, b, 2 * n]
        j += [b, n + b, a]
        k += [n + a, n + a, b]
    return go.Mesh3d(x=xs, y=ys, z=zs, i=i, j=j, k=k, color="#5b7fa6", opacity=0.3, name="seau")


def pave(x0, x1, y0, y1, z0, z1, couleur) -> go.Mesh3d:
    xs = [x0, x1, x1, x0, x0, x1, x1, x0]
    ys = [y0, y0, y1, y1, y0, y0, y1, y1]
    zs = [z0, z0, z0, z0, z1, z1, z1, z1]
    i = [0, 0, 4, 4, 0, 0, 1, 1, 2, 2, 3, 3]
    j = [1, 2, 5, 6, 1, 5, 2, 6, 3, 7, 0, 4]
    k = [2, 3, 6, 7, 5, 4, 6, 5, 7, 6, 4, 7]
    return go.Mesh3d(x=xs, y=ys, z=zs, i=i, j=j, k=k, color=couleur, flatshading=True)


bord = go.Scatter3d(
    x=[r_seau * math.cos(2 * math.pi * k / 48) for k in range(49)],
    y=[r_seau * math.sin(2 * math.pi * k / 48) for k in range(49)],
    z=[z_bord] * 49,
    mode="lines",
    line={"width": 3, "color": "#3d5a7a"},
    name="bord du seau",
)
coins = [(-0.12, -0.12), (0.12, -0.12), (0.12, 0.12), (-0.12, 0.12)]
pieds = go.Scatter3d(
    x=[v for cx, _ in coins for v in (cx, cx, None)],
    y=[v for _, cy in coins for v in (cy, cy, None)],
    z=[v for _ in coins for v in (0.0, z_fond - 0.03, None)],
    mode="lines",
    line={"width": 5, "color": "#9c7a54"},
    name="pieds",
)
sol = go.Surface(
    x=[[-0.45, 0.75], [-0.45, 0.75]],
    y=[[-0.35, -0.35], [0.35, 0.35]],
    z=[[0.0, 0.0], [0.0, 0.0]],
    colorscale=[[0, "#ececec"], [1, "#ececec"]],
    showscale=False,
    hoverinfo="skip",
)

fig = go.Figure(
    data=[
        *traces(etats[0]),
        cylindre(),
        bord,
        pave(-0.14, 0.14, -0.14, 0.14, z_fond - 0.03, z_fond, "#b08d62"),
        pieds,
        sol,
    ],
    frames=[go.Frame(name=f"{e[0]:.2f}", data=traces(e), traces=[0, 1, 2, 3, 4]) for e in etats],
)
fig.update_layout(
    showlegend=False,
    scene={
        "xaxis": {"title": {"text": "x (m)"}, "range": [-0.45, 0.75]},
        "yaxis": {"title": {"text": "y (m)"}, "range": [-0.35, 0.35]},
        "zaxis": {"title": {"text": "z (m)"}, "range": [0, 3.0]},
        "aspectmode": "manual",
        "aspectratio": {"x": 0.4, "y": 0.2333, "z": 1.0},
    },
)
