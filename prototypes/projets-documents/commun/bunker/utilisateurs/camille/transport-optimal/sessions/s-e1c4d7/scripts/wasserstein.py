import numpy as np


def w1(h1, h2, largeur=1.0):
    """W1 entre deux histogrammes de même support."""
    return largeur * np.abs(np.cumsum(h1 / h1.sum()) - np.cumsum(h2 / h2.sum())).sum()
