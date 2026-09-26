"""Interpole λ(P) et ω_log(P) à partir des points publiés."""

import numpy as np

points = {150: (3.1, 1010), 170: (2.2, 1300), 200: (1.9, 1420)}
p = np.array(sorted(points))
lam = np.interp(np.arange(150, 221, 10), p, [points[k][0] for k in p])
print(lam)
