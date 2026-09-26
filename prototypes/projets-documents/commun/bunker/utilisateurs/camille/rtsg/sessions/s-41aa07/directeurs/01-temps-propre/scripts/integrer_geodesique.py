"""Intègre la géodésique radiale de Schwarzschild (G = c = 1)."""

import numpy as np
from scipy.integrate import solve_ivp

M, R0 = 1.0, 10.0


def derivees(tau, y):
    r, t = y
    drdtau = -np.sqrt(2 * M / r - 2 * M / R0)
    dtdtau = np.sqrt(1 - 2 * M / R0) / (1 - 2 * M / r)
    return [drdtau, dtdtau]


sol = solve_ivp(derivees, (0, 33.6), [R0 - 1e-9, 0], rtol=1e-10, atol=1e-12)
print(sol.y[:, -1])
