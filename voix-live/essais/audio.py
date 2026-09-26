"""Outils audio sans dépendance : rééchantillonnage, dégradations « marmonnées », WAV."""

import array
import math
import random
import wave
from pathlib import Path


def echantillons(pcm: bytes) -> array.array:
    a = array.array("h")
    a.frombytes(pcm)
    return a


def octets(a: array.array) -> bytes:
    return a.tobytes()


def _borner(x: float) -> int:
    return max(-32768, min(32767, int(x)))


def de48a24(pcm: bytes) -> bytes:
    """48 kHz → 24 kHz (moyenne de deux échantillons : filtre passe-bas grossier, suffisant ici)."""
    a = echantillons(pcm)
    return octets(array.array("h", (_borner((a[i] + a[i + 1]) / 2) for i in range(0, len(a) - 1, 2))))


def silence(secondes: float, taux: int = 24000) -> bytes:
    return bytes(2 * int(secondes * taux))


def marmonner(pcm: bytes, gain: float = 0.25, bruit: float = 350.0, etouffe: float = 0.85, graine: int = 1) -> bytes:
    """Voix basse, étouffée (passe-bas), avec un bruit de fond : une imitation de marmonnement."""
    hasard = random.Random(graine)
    a = echantillons(pcm)
    sortie = array.array("h")
    precedent = 0.0
    for x in a:
        precedent = etouffe * precedent + (1 - etouffe) * x
        sortie.append(_borner(precedent * gain * 2.2 + hasard.gauss(0, bruit)))
    return octets(sortie)


def accelerer(pcm: bytes, facteur: float = 1.2) -> bytes:
    """Parole plus rapide (et un peu plus aiguë) par rééchantillonnage linéaire."""
    a = echantillons(pcm)
    n = int(len(a) / facteur)
    sortie = array.array("h")
    for i in range(n):
        p = i * facteur
        j = int(p)
        f = p - j
        b = a[j + 1] if j + 1 < len(a) else a[j]
        sortie.append(_borner(a[j] * (1 - f) + b * f))
    return octets(sortie)


def niveau(pcm: bytes) -> float:
    a = echantillons(pcm)
    return math.sqrt(sum(x * x for x in a) / max(1, len(a)))


def ecrire_wav(chemin: Path, pcm: bytes, taux: int) -> None:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(chemin), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(taux)
        w.writeframes(pcm)


def lire_wav(chemin: Path) -> tuple[bytes, int]:
    with wave.open(str(chemin), "rb") as w:
        return w.readframes(w.getnframes()), w.getframerate()


def normaliser_niveau(pcm: bytes, cible: float = 3000.0, gain_max: float = 8.0) -> bytes:
    """Gain automatique : ramène le niveau RMS vers `cible` (ce que fait l'AGC du navigateur, en plus simple)."""
    gain = min(gain_max, cible / max(1.0, niveau(pcm)))
    return octets(array.array("h", (_borner(x * gain) for x in echantillons(pcm))))
