"""Banc de transcription : des phrases synthétisées par Gradium (plusieurs voix), nettes puis marmonnées,
repassées dans le STT Gradium en flux, pour choisir le délai et vérifier la robustesse.

    .venv/Scripts/python -m essais.transcription            (depuis voix-live/)
"""

import asyncio
import re
import sys
import time
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from voix import gradium  # noqa: E402

from essais import audio  # noqa: E402

SORTIE = Path(__file__).resolve().parent / "sorties"

PHRASES = [
    "Salut Atlas, tu peux me lancer un sous-agent qui regarde les derniers commits du dépôt ?",
    "Attends, non, en fait je voulais plutôt que tu me résumes le graphe de Camille.",
    "Euh… combien de fichiers Python il y a dans le dossier voix, à peu près ?",
    "Parle un peu plus lentement et fais des réponses plus courtes, s'il te plaît.",
    "Ok ça marche, et tu me préviens quand Codex a fini la tâche sur Supabase.",
]
VOIX = {"Gaspard": "iEu63s1rhn_kegTr", "Apolline": "6oIkS98REoVZ1dEw", "Jules": "YKeBw3OV1RgpdhLh"}


def normaliser(texte: str) -> list[str]:
    texte = unicodedata.normalize("NFKD", texte.lower())
    texte = "".join(c for c in texte if not unicodedata.combining(c))
    return re.findall(r"[a-z0-9]+", texte.replace("'", " "))


def exactitude(reference: str, transcription: str) -> float:
    """1 - taux d'erreur approximatif, au niveau des mots."""
    return SequenceMatcher(None, normaliser(reference), normaliser(transcription)).ratio()


async def transcrire(pcm24: bytes, delai: int) -> tuple[str, float]:
    """Envoie l'audio à vitesse réelle x4 puis un flush ; renvoie le texte et le délai après la fin de l'audio."""
    stt = gradium.Transcripteur(delai=delai)
    await stt.ouvrir()
    morceaux: list[str] = []
    fin_audio = 0.0
    duree_flush = 0.0

    async def lire() -> None:
        nonlocal duree_flush
        async for message in stt.messages():
            if message["type"] == "text":
                morceaux.append(message["text"])
            elif message["type"] == "flushed":
                duree_flush = time.perf_counter() - fin_audio
                return

    lecteur = asyncio.create_task(lire())
    pcm24 = pcm24 + audio.silence(0.4)
    for i in range(0, len(pcm24), 3840):
        await stt.envoyer(pcm24[i : i + 3840])
        await asyncio.sleep(0.02)
    fin_audio = time.perf_counter()
    await stt.vider()
    await asyncio.wait_for(lecteur, 20)
    await stt.fermer()
    return " ".join(morceaux).strip(), duree_flush


async def main() -> None:
    delais = [int(d) for d in sys.argv[1:]] or [8, 12, 20]
    # 1. Génération des voix de test (mises en cache dans essais/sorties/).
    echantillons: list[tuple[str, str, bytes]] = []
    for nom, voix in VOIX.items():
        for i, phrase in enumerate(PHRASES):
            chemin = SORTIE / f"{nom}_{i}.wav"
            if not chemin.exists():
                pcm48 = await gradium.synthetiser(phrase, voix)
                audio.ecrire_wav(chemin, audio.de48a24(pcm48), 24000)
            pcm24, _ = audio.lire_wav(chemin)
            echantillons.append((f"{nom}_{i}", phrase, pcm24))
    print(f"{len(echantillons)} phrases générées avec {len(VOIX)} voix Gradium")

    variantes = {
        "nette": lambda p: p,
        "marmonnée": lambda p: audio.marmonner(p),
        "marmonnée+rapide": lambda p: audio.marmonner(audio.accelerer(p, 1.2), gain=0.2, bruit=450),
    }
    for nom, variante in variantes.items():
        audio.ecrire_wav(SORTIE / f"exemple_{nom}.wav", variante(echantillons[2][2]), 24000)

    for delai in delais:
        for nom_variante, variante in variantes.items():
            scores, latences, pires = [], [], []
            # Offre gratuite Gradium : 3 sessions simultanées au plus.
            limite = asyncio.Semaphore(3)

            async def borne(pcm: bytes, limite: asyncio.Semaphore = limite, delai: int = delai) -> tuple[str, float]:
                async with limite:
                    return await transcrire(pcm, delai)

            resultats = await asyncio.gather(*(borne(variante(p)) for _, _, p in echantillons))
            for (ident, phrase, _), (texte, latence) in zip(echantillons, resultats, strict=True):
                score = exactitude(phrase, texte)
                scores.append(score)
                latences.append(latence)
                pires.append((score, ident, texte))
            pires.sort()
            print(
                f"délai {delai:>2} | {nom_variante:<17} | exactitude {sum(scores) / len(scores):.1%}"
                f" | flush {sum(latences) / len(latences) * 1000:.0f} ms"
                f" | pire {pires[0][0]:.0%} ({pires[0][1]}) : {pires[0][2]!r}"
            )


if __name__ == "__main__":
    asyncio.run(main())
