"""Figure 3D d'exemple : pendule simple non linéaire (RK4), une période jouée en boucle.

Écrit comme un agent l'écrirait : il construit `fig` (et `fps`), Atlas fait le reste. Sans numpy, pour tourner avec
le seul plotly.
"""

import math

import plotly.graph_objects as go

g, L, theta0 = 9.81, 1.0, 1.0
fps = 20
pivot = (0.0, 0.0, 1.2)


def derivee(theta: float, omega: float) -> tuple[float, float]:
    return omega, -g / L * math.sin(theta)


# Intégration fine jusqu'au retour au repos côté départ (ω repasse de + à 0) : une période exacte, donc une boucle
# sans saut.
dt, t, theta, omega = 1e-4, 0.0, theta0, 0.0
etats = [(0.0, theta)]
while True:
    k1 = derivee(theta, omega)
    k2 = derivee(theta + dt / 2 * k1[0], omega + dt / 2 * k1[1])
    k3 = derivee(theta + dt / 2 * k2[0], omega + dt / 2 * k2[1])
    k4 = derivee(theta + dt * k3[0], omega + dt * k3[1])
    omega_avant = omega
    theta += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
    omega += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
    t += dt
    etats.append((t, theta))
    if omega_avant > 0 >= omega:
        break
periode = t
n = round(periode * fps)


def angle(instant: float) -> float:
    return etats[min(len(etats) - 1, round(instant / dt))][1]


def masse(a: float) -> tuple[float, float, float]:
    return pivot[0] + L * math.sin(a), pivot[1], pivot[2] - L * math.cos(a)


def traces(a: float) -> list[go.Scatter3d]:
    x, y, z = masse(a)
    return [
        go.Scatter3d(
            x=[pivot[0], x], y=[pivot[1], y], z=[pivot[2], z], mode="lines", line={"width": 6, "color": "#444"}
        ),
        go.Scatter3d(x=[x], y=[y], z=[z], mode="markers", marker={"size": 10, "color": "#3d3d99"}),
    ]


arc = [masse(-theta0 + 2 * theta0 * k / 60) for k in range(61)]
support = go.Scatter3d(x=[-0.4, 0.4], y=[0, 0], z=[pivot[2]] * 2, mode="lines", line={"width": 10, "color": "#000"})
trajectoire = go.Scatter3d(
    x=[p[0] for p in arc],
    y=[p[1] for p in arc],
    z=[p[2] for p in arc],
    mode="lines",
    line={"width": 2, "color": "#b0b0b0", "dash": "dash"},
)

fig = go.Figure(
    data=[*traces(theta0), support, trajectoire],
    frames=[go.Frame(name=f"{k / fps:.3f}", data=traces(angle(k / fps)), traces=[0, 1]) for k in range(n)],
)
fig.update_layout(
    showlegend=False,
    scene={
        "xaxis": {"title": {"text": "x (m)"}, "range": [-1, 1]},
        "yaxis": {"title": {"text": "y (m)"}, "range": [-1, 1]},
        "zaxis": {"title": {"text": "z (m)"}, "range": [0, 1.4]},
        "aspectmode": "manual",
        "aspectratio": {"x": 1, "y": 1, "z": 0.7},
    },
)
