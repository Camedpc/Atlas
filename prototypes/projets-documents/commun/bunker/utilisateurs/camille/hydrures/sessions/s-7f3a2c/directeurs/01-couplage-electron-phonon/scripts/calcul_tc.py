"""Balayage Tc(P) de LaH10 par la formule d'Allen–Dynes."""

import math

import numpy as np

PRESSIONS = np.array([150, 160, 170, 180, 190, 200, 210, 220])
LAMBDA = np.array([3.1, 2.6, 2.2, 2.1, 2.0, 1.9, 1.85, 1.8])
OMEGA_LOG = np.array([1010, 1180, 1300, 1340, 1380, 1420, 1450, 1480])


def allen_dynes(lam, omega_log, mu=0.10):
    lam2 = 2.46 * (1 + 3.8 * mu)
    f1 = (1 + (lam / lam2) ** 1.5) ** (1 / 3)
    f2 = 1 + (lam**2 * (1 - 1 / 1.82)) / (lam**2 + lam2**2)
    return f1 * f2 * omega_log / 1.2 * math.exp(-1.04 * (1 + lam) / (lam - mu * (1 + 0.62 * lam)))


if __name__ == "__main__":
    for p, lam, w in zip(PRESSIONS, LAMBDA, OMEGA_LOG):
        print(f"{p:4d} GPa  Tc = {allen_dynes(lam, w):6.1f} K")
