#!/bin/bash
# Mixe la bande-son (audio/mix.py) puis l'assemble avec out/video_muette.mp4 → out/Atlas-presentation.mp4
set -euo pipefail
cd "$(dirname "$0")/.."
python audio/mix.py
ffmpeg -loglevel error -y -i audio/mix_brut.wav -af "acompressor=threshold=-18dB:ratio=2:attack=15:release=250:makeup=1,loudnorm=I=-14:TP=-1.0:LRA=11" -ar 48000 audio/mix.wav
ffmpeg -loglevel error -y -i out/video_muette.mp4 -i audio/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -movflags +faststart out/Atlas-presentation.mp4
echo "→ out/Atlas-presentation.mp4"
