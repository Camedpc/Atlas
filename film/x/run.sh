#!/bin/bash
# Rendu d'une plage du film Atlas sur une machine de l'X. Tout l'outillage vit dans /tmp (quota de fichiers du home).
set -euo pipefail
A=${1%-*}; B=${1#*-}
SRC=$PWD
W=/tmp/atlas-film-$USER
mkdir -p "$W"
exec 9>"$W/.verrou"
flock 9
if [ ! -x "$W/node/bin/node" ]; then
  echo "SSHX_PROGRESS 0.01 installation de node"
  curl -fsSL https://nodejs.org/dist/v22.20.0/node-v22.20.0-linux-x64.tar.xz | tar -xJ -C "$W"
  mv "$W/node-v22.20.0-linux-x64" "$W/node"
fi
export PATH="$W/node/bin:$PATH" npm_config_cache="$W/npmcache" REMOTION_DISABLE_TELEMETRY=1
if [ ! -f "$W/app/.deps-ok" ]; then
  echo "SSHX_PROGRESS 0.02 installation de Remotion"
  mkdir -p "$W/app"; cp "$SRC/package.json" "$W/app/"
  (cd "$W/app" && npm install --no-audit --no-fund --loglevel=error >/dev/null)
  (cd "$W/app" && node -e "import('@remotion/renderer').then(m => m.ensureBrowser())")
  touch "$W/app/.deps-ok"
fi
VERSION=$(cat "$SRC/media-a.tar" "$SRC/media-b.tar" | md5sum | cut -c1-12)
if [ "$(cat "$W/media/.ok" 2>/dev/null)" != "$VERSION" ]; then
  echo "SSHX_PROGRESS 0.04 médias"
  P="$W/media"; rm -rf "$P"; mkdir -p "$P"; tar -xf "$SRC/media-a.tar" -C "$P"; tar -xf "$SRC/media-b.tar" -C "$P"
  for v in "$P"/seqv/*.mp4; do n=$(basename "$v" .mp4); mkdir -p "$P/capture/seq/$n"
    ffmpeg -nostdin -loglevel error -i "$v" -start_number 0 -q:v 2 "$P/capture/seq/$n/%05d.jpg"; done
  mkdir -p "$P/capture/ui/frappe"; ffmpeg -nostdin -loglevel error -i "$P/frappe.mp4" -start_number 0 -q:v 2 "$P/capture/ui/frappe/%03d.jpg"
  echo "$VERSION" > "$P/.ok"
fi
# le code (petit) est toujours ré-extrait ; les médias décodés sont liés dans public/
rm -rf "$W/app/build"; mkdir -p "$W/app/build"; tar -xzf "$SRC/build.tar.gz" -C "$W/app/build"
rm -rf "$W/app/build/public"; ln -s "$W/media" "$W/app/build/public"
cp "$SRC/render.mjs" "$W/app/render.mjs"
flock -u 9
mkdir -p "$SRC/segments"
tmp="$W/seg_${A}.tmp.${SSHX_ATTEMPT:-1}.$$.mp4"
cd "$W/app"
BUILD="$W/app/build" CONC="${OMP_NUM_THREADS:-6}" node render.mjs "$A" "$B" "$tmp"
mv -f "$tmp" "$SRC/segments/seg_$(printf %05d "$A").mp4"
