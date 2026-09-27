# Mixage de la bande-son, calqué sur src/BandeSon.tsx (voix, musique avec ducking, bruitages).
import json, numpy as np, soundfile as sf
from scipy import signal
SR = 48000; D = 119.8; N = int(D * SR)
vo = json.load(open('audio/vo.json'))
VOIX = [('v01', 1.4), ('v02', 4.6), ('v03', 13.45), ('v04', 17.0), ('v05', 26.9), ('v06', 40.6), ('v07', 46.4), ('v08', 53.3),
        ('v09', 61.3), ('v10', 80.2), ('v11', 86.8), ('c1', 88.9), ('c2', 92.0), ('v12', 108.6)]
B = [(0.4, 'whoosh_long', 0.18)]
B += [(t, 'pop', 0.1, 0.85 + i * 0.05) for i, t in enumerate([0.7, 1.5, 2.4, 3.3, 4.2, 5.1, 6.3])]
B += [(10.85, 'whoosh_long', 0.45), (12.5, 'tick_001', 0.18), (12.75, 'tick_001', 0.18, 1.1), (13.0, 'tick_001', 0.18, 1.2),
      (13.3, 'coup', 0.32), (14.35, 'pluck_001', 0.18), (16.12, 'whoosh_court', 0.45), (16.31, 'coup', 0.6),
      (17.3, 'mouseclick1', 0.55), (22.31, 'mouseclick1', 0.7), (22.34, 'select_002', 0.25), (22.36, 'whoosh_court', 0.45),
      (26.8, 'whoosh_long', 0.3), (27.6, 'select_001', 0.22), (29.5, 'select_001', 0.22, 1.08), (31.7, 'select_001', 0.22, 1.16),
      (33.9, 'select_001', 0.18, 0.92), (35.4, 'whoosh_court', 0.45), (38.3, 'tick_002', 0.25), (39.5, 'whoosh_descente', 0.55),
      (46.9, 'pop', 0.28), (48.67, 'select_006', 0.3), (49.0, 'pop', 0.28, 1.1), (53.15, 'whoosh_court', 0.25),
      (61.05, 'whoosh_long', 0.45), (63.5, 'scroll_002', 0.2), (66.2, 'pop', 0.3), (67.7, 'valide', 0.4), (67.1, 'montee', 0.75),
      (70.31, 'impact', 1.0), (71.51, 'coup', 0.55), (72.71, 'coup', 0.65)]
for i, t in enumerate([74.11, 75.91, 77.71]): B += [(t, 'coup', 0.42), (t + 0.38, 'valide', 0.42, 1 + i * 0.06)]
B += [(79.4, 'whoosh_court', 0.5), (85.8, 'whoosh_long', 0.4), (87.62, 'mouseclick1', 0.6), (87.8, 'maximize_003', 0.3),
      (96.0, 'whoosh_descente', 0.45), (98.5, 'pop', 0.22), (103.1, 'whoosh_long', 0.35), (107.2, 'pluck_001', 0.2), (111.71, 'impact', 0.7)]
rng = np.random.default_rng(3)
for i in range(1, 68):
    B.append((17.55 + i * 0.053 - 0.01, f'click{rng.integers(1, 6)}', 0.13 + rng.random() * 0.05, 0.9 + rng.random() * 0.3))

def lire(p):
    x, sr = sf.read(p, always_2d=True)
    if sr != SR: x = signal.resample_poly(x, SR, sr, axis=0)
    if x.shape[1] == 1: x = np.repeat(x, 2, 1)
    return x
def poser(bus, x, t, v=1.0, r=1.0):
    if r != 1.0: x = signal.resample(x, int(len(x) / r), axis=0)
    a = int(t * SR); b = min(N, a + len(x))
    if a < N: bus[a:b] += x[: b - a] * v

musique = np.zeros((N, 2)); voix = np.zeros((N, 2)); bruits = np.zeros((N, 2))
m = lire('audio/music/musique.wav'); musique[: min(N, len(m))] = m[:N]
for nom, t in VOIX:
    x = lire(f'audio/vo/{nom}.wav'); d = max(0, vo[nom]['debut']); x = x[int(d * SR):]
    f = np.ones(len(x)); f[:240] = np.linspace(0, 1, 240); x = x * f[:, None]
    poser(voix, x, t, {'c1': 1.5, 'c2': 1.05}.get(nom, 1.05))
for e in B:
    t, nom, v = e[:3]; r = e[3] if len(e) > 3 else 1.0
    poser(bruits, lire(f'audio/sfx/wav/{nom}.wav'), t, v, r)
# ducking de la musique sous la voix
tt = np.arange(N) / SR; g = np.ones(N)
for nom, t in VOIX:
    a, b = t, t + vo[nom]['fin'] - max(0, vo[nom]['debut'])
    g = np.minimum(g, np.interp(tt, [a - 0.35, a, b, b + 0.5], [1, 0.19, 0.19, 1], left=1, right=1))
g *= np.interp(tt, [0, 1.2, 118.2, D], [0, 1, 1, 0])
musique *= (0.9 * g)[:, None]
# voix : passe-haut 80 Hz et légère présence
sos = signal.butter(2, 80, 'high', fs=SR, output='sos'); voix = signal.sosfilt(sos, voix, axis=0)
mix = musique + voix * 1.25 + bruits * 0.9
sf.write('audio/mix_brut.wav', mix.astype(np.float32), SR, subtype='FLOAT')
print('crête', np.abs(mix).max())
def db(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)
for nom, t in VOIX:
    a, b = int(t * SR), int((t + 1.5) * SR)
    print(nom, 'voix %.1f dB' % db(voix[a:b] * 1.25), 'musique %.1f dB' % db(musique[a:b]))
