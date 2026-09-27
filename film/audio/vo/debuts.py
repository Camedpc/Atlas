# Recalcule ../vo.json : début et fin de parole de chaque ligne (seuil à −35 dB sous la crête), après régénération.
import glob, json, numpy as np, soundfile as sf
out = {}
for f in sorted(glob.glob('[vc]*.wav')):
    y, sr = sf.read(f); h = sr // 100
    r = np.array([np.sqrt(np.mean(y[i:i + h] ** 2)) for i in range(0, len(y) - h, h)])
    db = 20 * np.log10(r + 1e-9); on = np.where(db > db.max() - 35)[0]
    out[f[:-4]] = {'debut': round(on[0] / 100 - 0.03, 2), 'fin': round(on[-1] / 100 + 0.08, 2), 'duree': round(len(y) / sr, 2)}
json.dump(out, open('../vo.json', 'w'), indent=1)
print(out)
