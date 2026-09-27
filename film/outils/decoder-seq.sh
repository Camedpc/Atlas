#!/bin/bash
# Après un clone : reconstitue les images capturées (capture/seq/<plan>/NNNNN.jpg, capture/ui/frappe/NNN.jpg)
# à partir des vidéos compactes de media/, pour le studio et les images clés.
set -euo pipefail
cd "$(dirname "$0")/.."
for v in media/seqv/*.mp4; do n=$(basename "$v" .mp4); d=capture/seq/$n
  if [ ! -d "$d" ]; then mkdir -p "$d"; ffmpeg -loglevel error -i "$v" -start_number 0 -q:v 2 "$d/%05d.jpg"; echo "$d"; fi; done
if [ ! -d capture/ui/frappe ]; then mkdir -p capture/ui/frappe; ffmpeg -loglevel error -i media/frappe.mp4 -start_number 0 -q:v 2 capture/ui/frappe/%03d.jpg; fi
