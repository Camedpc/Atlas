"""Figure 3D d'exemple : pendule simple non linéaire (RK4), une période jouée en boucle, avec à côté ses énergies
(cinétique, potentielle, totale) et son angle en fonction du temps, un point avançant au rythme de l'animation.

Écrit comme un agent l'écrirait : il construit `fig` (et `fps`), Atlas fait le reste. Sans numpy, pour tourner avec
le seul plotly. Énergies par unité de masse (J/kg).
"""

import math

import plotly.graph_objects as go
from plotly.subplots import make_subplots

g, L, theta0 = 9.81, 1.0, 1.0
fps = 20
pivot = (0.0, 0.0, 1.2)


def derivee(theta: float, omega: float) -> tuple[float, float]:
    return omega, -g / L * math.sin(theta)


# Intégration fine jusqu'au retour au repos côté départ (ω repasse de + à 0) : une période exacte, donc une boucle
# sans saut.
dt, t, theta, omega = 1e-4, 0.0, theta0, 0.0
etats = [(0.0, theta, omega)]
while True:
    k1 = derivee(theta, omega)
    k2 = derivee(theta + dt / 2 * k1[0], omega + dt / 2 * k1[1])
    k3 = derivee(theta + dt / 2 * k2[0], omega + dt / 2 * k2[1])
    k4 = derivee(theta + dt * k3[0], omega + dt * k3[1])
    omega_avant = omega
    theta += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
    omega += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
    t += dt
    etats.append((t, theta, omega))
    if omega_avant > 0 >= omega:
        break
periode = t
n = round(periode * fps)


def etat(instant: float) -> tuple[float, float, float]:
    return etats[min(len(etats) - 1, round(instant / dt))]


def energies(a: float, w: float) -> tuple[float, float]:
    """Énergies cinétique et potentielle par unité de masse (J/kg), zéro de Ep au point bas."""
    return 0.5 * (L * w) ** 2, g * L * (1 - math.cos(a))


def masse(a: float) -> tuple[float, float, float]:
    return pivot[0] + L * math.sin(a), pivot[1], pivot[2] - L * math.cos(a)


# Tracés : 0 tige, 1 masse, 2 support, 3 trajectoire (scène 3D) ; 4 Ec, 5 Ep, 6 Em, 7 point Ec, 8 point Ep (énergies) ;
# 9 angle, 10 point de l'angle. Les images ne redonnent que ce qui bouge.
QUI_BOUGE = [0, 1, 7, 8, 10]


def mobiles(instant: float) -> list:
    _, a, w = etat(instant)
    x, y, z = masse(a)
    ec, ep = energies(a, w)
    return [
        go.Scatter3d(
            x=[pivot[0], x], y=[pivot[1], y], z=[pivot[2], z], mode="lines", line={"width": 6, "color": "#444"}
        ),
        go.Scatter3d(x=[x], y=[y], z=[z], mode="markers", marker={"size": 10, "color": "#3d3d99"}),
        go.Scatter(x=[instant], y=[ec], mode="markers", marker={"size": 9, "color": "#d9822b"}),
        go.Scatter(x=[instant], y=[ep], mode="markers", marker={"size": 9, "color": "#3d3d99"}),
        go.Scatter(x=[instant], y=[a], mode="markers", marker={"size": 9, "color": "#444"}),
    ]


fig = make_subplots(
    rows=2,
    cols=2,
    specs=[[{"type": "scene", "rowspan": 2}, {"type": "xy"}], [None, {"type": "xy"}]],
    column_widths=[0.62, 0.38],
    vertical_spacing=0.14,
)
tige, bille, point_ec, point_ep, point_angle = mobiles(0.0)
arc = [masse(-theta0 + 2 * theta0 * k / 60) for k in range(61)]
fig.add_trace(tige, row=1, col=1)
fig.add_trace(bille, row=1, col=1)
fig.add_trace(
    go.Scatter3d(x=[-0.4, 0.4], y=[0, 0], z=[pivot[2]] * 2, mode="lines", line={"width": 10, "color": "#000"}),
    row=1,
    col=1,
)
fig.add_trace(
    go.Scatter3d(
        x=[p[0] for p in arc],
        y=[p[1] for p in arc],
        z=[p[2] for p in arc],
        mode="lines",
        line={"width": 2, "color": "#b0b0b0", "dash": "dash"},
    ),
    row=1,
    col=1,
)
# Courbes entières sur une période, échantillonnées à 200 points.
temps = [periode * k / 200 for k in range(201)]
ec_courbe, ep_courbe = zip(*(energies(etat(s)[1], etat(s)[2]) for s in temps), strict=True)
em_courbe = [a + b for a, b in zip(ec_courbe, ep_courbe, strict=True)]
for nom, ys, couleur, tirets in (
    ("Ec", ec_courbe, "#d9822b", None),
    ("Ep", ep_courbe, "#3d3d99", None),
    ("Em", em_courbe, "#444444", "dash"),
):
    fig.add_trace(
        go.Scatter(x=temps, y=list(ys), mode="lines", name=nom, line={"color": couleur, "width": 2, "dash": tirets}),
        row=1,
        col=2,
    )
fig.add_trace(point_ec, row=1, col=2)
fig.add_trace(point_ep, row=1, col=2)
fig.add_trace(
    go.Scatter(x=temps, y=[etat(s)[1] for s in temps], mode="lines", name="θ", line={"color": "#444", "width": 2}),
    row=2,
    col=2,
)
fig.add_trace(point_angle, row=2, col=2)

fig.frames = [go.Frame(name=f"{k / fps:.3f}", data=mobiles(k / fps), traces=QUI_BOUGE) for k in range(n)]

em_max = max(em_courbe)
fig.update_layout(
    showlegend=False,
    scene={
        "xaxis": {"title": {"text": "x (m)"}, "range": [-1, 1]},
        "yaxis": {"title": {"text": "y (m)"}, "range": [-1, 1]},
        "zaxis": {"title": {"text": "z (m)"}, "range": [0, 1.4]},
        "aspectmode": "manual",
        "aspectratio": {"x": 1, "y": 1, "z": 0.7},
    },
    xaxis={"title": {"text": "t (s)"}, "range": [0, periode]},
    yaxis={"title": {"text": "énergie (J/kg) : Ec, Ep, Em"}, "range": [0, em_max * 1.1]},
    xaxis2={"title": {"text": "t (s)"}, "range": [0, periode]},
    yaxis2={"title": {"text": "θ (rad)"}, "range": [-theta0 * 1.1, theta0 * 1.1]},
)
