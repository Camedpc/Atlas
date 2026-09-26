"""Ajuste Lotka–Volterra aux séries lynx–lièvres par moindres carrés."""

import numpy as np
import pandas as pd
from scipy.integrate import odeint
from scipy.optimize import least_squares

donnees = pd.read_csv("../../../../projet/donnees/lynx-lievres-hudson.csv")


def modele(etat, t, a, b, d, g):
    x, y = etat
    return [a * x - b * x * y, d * x * y - g * y]


def residus(p):
    sol = odeint(modele, donnees.iloc[0, 1:].values, donnees.annee - 1900, args=tuple(p))
    return (sol - donnees.iloc[:, 1:].values).ravel()


print(least_squares(residus, [0.5, 0.03, 0.03, 0.8]).x)
