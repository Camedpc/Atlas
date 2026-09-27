import numpy as np, soundfile as sf
from scipy import signal
SR = 48000
rng = np.random.default_rng(7)
def save(nom, x):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.9
    sf.write(f'wav/{nom}.wav', x.T if x.ndim == 2 else np.stack([x, x], 1), SR)
def reverb(x, dur=1.6, mix=0.25, seed=1):
    r = np.random.default_rng(seed)
    n = int(dur * SR); t = np.arange(n) / SR
    ir = r.standard_normal((2, n)) * np.exp(-t / (dur / 5))
    ir = signal.sosfilt(signal.butter(2, 6000, 'low', fs=SR, output='sos'), ir)
    out = np.stack([signal.fftconvolve(x if x.ndim == 1 else x[i], ir[i])[: len(x if x.ndim == 1 else x[i]) + n] for i in range(2)])
    dry = np.stack([x, x]) if x.ndim == 1 else x
    dry = np.pad(dry, ((0, 0), (0, out.shape[1] - dry.shape[1])))
    return dry * (1 - mix) + out / np.max(np.abs(out)) * np.max(np.abs(dry)) * mix
def whoosh(dur, f0, f1, nom, pan=True):
    n = int(dur * SR); t = np.arange(n) / SR
    bruit = rng.standard_normal(n)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2.2
    env *= np.clip(t / (dur * 0.55), 0, 1) ** 0.6
    out = np.zeros(n)
    blk = 512
    fc = f0 * (f1 / f0) ** (t / dur)
    zi = None
    # filtre passe-bande glissant, par blocs
    for i in range(0, n, blk):
        c = fc[i]
        sos = signal.butter(2, [max(40, c / 1.8), min(SR / 2 - 100, c * 1.8)], 'band', fs=SR, output='sos')
        if zi is None: zi = signal.sosfilt_zi(sos) * 0
        out[i:i + blk], zi = signal.sosfilt(sos, bruit[i:i + blk], zi=zi)
    out *= env
    if pan:
        p = np.linspace(-0.6, 0.6, n)
        st = np.stack([out * np.sqrt((1 - p) / 2), out * np.sqrt((1 + p) / 2)])
    else:
        st = np.stack([out, out])
    save(nom, reverb(st, 1.2, 0.2))
whoosh(0.55, 500, 3500, 'whoosh_court')
whoosh(1.1, 300, 5000, 'whoosh_long')
whoosh(0.8, 4000, 400, 'whoosh_descente')
# montée (riser) : bruit filtré ascendant + sinus glissant, crescendo
d = 3.2; n = int(d * SR); t = np.arange(n) / SR
fc = 200 * (8000 / 200) ** (t / d) ** 1.5
b = rng.standard_normal(n); out = np.zeros(n); zi = None
for i in range(0, n, 512):
    sos = signal.butter(2, [max(40, fc[i] / 1.5), min(23000, fc[i] * 1.5)], 'band', fs=SR, output='sos')
    if zi is None: zi = signal.sosfilt_zi(sos) * 0
    out[i:i + 512], zi = signal.sosfilt(sos, b[i:i + 512], zi=zi)
ton = np.sin(2 * np.pi * np.cumsum(110 * (4 ** (t / d))) / SR) * 0.35
env = (t / d) ** 2.5
save('montee', reverb((out * 0.8 + ton) * env, 0.8, 0.15))
# impact : sub qui plonge + claquement + queue
d = 3.5; n = int(d * SR); t = np.arange(n) / SR
f = 38 + 90 * np.exp(-t * 18)
sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
clic = rng.standard_normal(n) * np.exp(-t * 60)
clic = signal.sosfilt(signal.butter(2, 2500, 'low', fs=SR, output='sos'), clic)
corps = signal.sosfilt(signal.butter(2, [80, 900], 'band', fs=SR, output='sos'), rng.standard_normal(n)) * np.exp(-t * 7)
save('impact', reverb(sub * 1.0 + clic * 0.6 + corps * 0.5, 2.8, 0.3))
# frappe sourde légère (petit impact pour les coupes)
d = 1.2; n = int(d * SR); t = np.arange(n) / SR
x = np.sin(2 * np.pi * np.cumsum(55 + 60 * np.exp(-t * 25)) / SR) * np.exp(-t * 5) + signal.sosfilt(signal.butter(2, 1800, 'low', fs=SR, output='sos'), rng.standard_normal(n)) * np.exp(-t * 45) * 0.5
save('coup', reverb(x, 1.0, 0.15))
# carillon de validation : deux notes cristallines
def note(fr, d=1.6):
    n = int(d * SR); t = np.arange(n) / SR
    return sum(a * np.sin(2 * np.pi * fr * k * t) * np.exp(-t * (3 + k * 2)) for k, a in [(1, 1), (2, 0.35), (3, 0.12), (4.2, 0.05)]) * (1 - np.exp(-t * 400))
x = np.zeros(int(2.2 * SR)); a = note(1318.5); b = note(1975.5)
x[: len(a)] += a; o = int(0.09 * SR); x[o:o + len(b)] += b * 0.8
save('valide', reverb(x, 1.8, 0.3))
# pop doux (apparition de carte)
d = 0.35; n = int(d * SR); t = np.arange(n) / SR
x = np.sin(2 * np.pi * np.cumsum(900 - 500 * t / d) / SR) * np.exp(-t * 22) * (1 - np.exp(-t * 800))
save('pop', reverb(x, 0.6, 0.2))
print('ok')
