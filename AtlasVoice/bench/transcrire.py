"""Fait passer les énoncés par Gradium STT pour benchmarker sur de vraies transcriptions (section 5.4).

Pour chaque énoncé, l'audio est pris dans bench/audio/<id>.wav s'il existe (enregistrement réel,
recommandé), sinon synthétisé avec une voix française de Gradium (variée d'un énoncé à l'autre).
La transcription obtenue, avec ses erreurs, est écrite dans enonces_transcrits.jsonl, que
lancer_bench.py utilise en priorité.

    python bench/transcrire.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent / "backend"))

from app import config  # noqa: E402  (charge le .env)
from gradium import GradiumClient  # noqa: E402

# Voix françaises du catalogue (gradbot.flagship_voices()).
VOIX = ["YhIHaAfQ0cQPDV9R", "biuhvu17TxVKOcyy", "FXxJ9mANRq6BCTX5", "YKeBw3OV1RgpdhLh",
        "ZeSg853xFACESHHI", "25AzBFyp6svYnJsj", "xynYWquoAsrvM7UY", "Tek4tJXiX6_yvXq7"]


async def principal() -> None:
    cle = config.GRADIUM_API_KEY or os.environ.get("GRADIUM_API_KEY")
    if not cle:
        sys.exit("GRADIUM_API_KEY manquant")
    client = GradiumClient(base_url=config.GRADIUM_BASE_URL, api_key=cle)
    dossier_audio = ICI / "audio"
    dossier_audio.mkdir(exist_ok=True)
    with (ICI / "enonces.jsonl").open(encoding="utf-8") as f:
        enonces = [json.loads(ligne) for ligne in f if ligne.strip()]

    sortie = []
    for i, enonce in enumerate(enonces):
        fichier = dossier_audio / f"{enonce['id']}.wav"
        if fichier.exists():
            audio = fichier.read_bytes()
            source = "enregistrement" if not (dossier_audio / f"{enonce['id']}.tts").exists() else "synthèse"
        else:
            tts = await client.tts({"model_name": "default", "voice_id": VOIX[i % len(VOIX)],
                                    "output_format": "wav"}, enonce["texte"])
            audio = tts.raw_data
            fichier.write_bytes(audio)
            (dossier_audio / f"{enonce['id']}.tts").touch()
            source = "synthèse"
        stt = await client.stt({"model_name": "default", "input_format": "wav",
                                "json_config": {"language": "fr"}}, audio)
        sortie.append({**enonce, "transcription": stt.text.strip(), "source_audio": source})
        print(f"{enonce['id']} [{source}] {enonce['texte']!r} -> {stt.text.strip()!r}")

    with (ICI / "enonces_transcrits.jsonl").open("w", encoding="utf-8") as f:
        for enonce in sortie:
            f.write(json.dumps(enonce, ensure_ascii=False) + "\n")
    differents = sum(e["transcription"].lower().strip(" .?!") != e["texte"].lower().strip(" .?!") for e in sortie)
    print(f"{len(sortie)} énoncés transcrits, {differents} différents du texte d'origine.")


if __name__ == "__main__":
    asyncio.run(principal())
