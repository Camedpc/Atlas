#!/bin/bash
# Rendu distribué sur les machines de l'X (skill sshX), puis rapatriement de out/video_muette.mp4.
#   bash outils/rendu-x.sh              tout le film (30 plages de 240 images)
#   bash outils/rendu-x.sh 5040-5279 …  seulement ces plages (les autres segments déjà rendus sont gardés)
# Tout s'installe dans /tmp sur chaque machine : le home de l'X est presque plein en nombre de fichiers.
set -euo pipefail
cd "$(dirname "$0")/.."
SSHX=/c/Users/Camille/.claude/skills/sshX/scripts
L="$SSHX/sshx.sh"
HOTE=vosges   # n'importe quelle machine : le home est partagé
P=pack; rm -rf $P; mkdir -p $P/up $P/stage/a/capture/ui $P/stage/a/capture/cartes $P/stage/a/fonts $P/stage/a/audio/vo $P/stage/a/seqv $P/stage/b/seqv $P/concat

# 1. séquences du graphe en vidéos 4K compactes (ré-encodées seulement si les images ont changé)
mkdir -p media/seqv
for d in capture/seq/*/; do n=$(basename "$d"); v=media/seqv/$n.mp4
  if [ ! -f "$v" ] || [ -n "$(find "$d" -newer "$v" -print -quit)" ]; then
    ffmpeg -loglevel error -y -framerate 60 -start_number 0 -i "$d/%05d.jpg" -c:v libx264 -preset medium -crf 12 -pix_fmt yuv444p -threads 4 "$v"; fi; done
if [ -d capture/ui/frappe ] && [ -n "$(find capture/ui/frappe -newer media/frappe.mp4 -print -quit)" ]; then
  ffmpeg -loglevel error -y -framerate 60 -start_number 0 -i capture/ui/frappe/%03d.jpg -c:v libx264 -crf 12 -pix_fmt yuv444p media/frappe.mp4; fi
cp media/frappe.mp4 $P/stage/a/frappe.mp4

# 2. code (bundle Remotion sans médias) et médias, en deux archives (--push limité à 50 Mo)
mkdir -p vide; npx remotion bundle src/index.ts --public-dir=vide --out-dir=$P/build >/dev/null; rmdir vide
tar -czf $P/up/build.tar.gz -C $P/build .
cp capture/ui/accueil.png capture/ui/session-*.png capture/ui/fil-complet.png $P/stage/a/capture/ui/
cp capture/cartes/*.png $P/stage/a/capture/cartes/; cp fonts/cmun{rm,bx,ti,bi}.woff $P/stage/a/fonts/; cp audio/vo/c1.wav audio/vo/c2.wav $P/stage/a/audio/vo/
for v in media/seqv/*.mp4; do case $(basename $v) in g5-*|g6-*) cp $v $P/stage/b/seqv/;; *) cp $v $P/stage/a/seqv/;; esac; done
tar -cf $P/up/media-a.tar -C $P/stage/a . ; tar -cf $P/media-b.tar -C $P/stage/b .
cp x/run.sh x/render.mjs x/package.json $P/up/; cp x/concat.sh $P/concat/
if [ $# -gt 0 ]; then printf '%s\n' "$@" > $P/up/plages.txt
else python -c "N=7188;k=240;print('\n'.join(f'{a}-{min(N-1,a+k-1)}' for a in range(0,N,k)))" > $P/up/plages.txt; fi
python -c "N=7188;k=240;open('$P/concat/liste.txt','w',newline='\n').write(''.join(f\"file 'segments/seg_{a:05d}.mp4'\n\" for a in range(0,N,k)))"
# Les plages partielles doivent tomber sur la grille de 240 images pour remplacer les bons segments.

# 3. envoi, rendu, concaténation, rapatriement
bash "$SSHX/xcp.sh" push $HOTE $P/media-b.tar sshx/work/atlas-film/
# (run.sh redécode les médias sur une machine dès que leur empreinte change)
NOM=atlas-film-$(date +%m%d-%H%M)
bash "$L" submit --name "$NOM" --desc "Rendu distribué (Remotion, muet) de la vidéo de présentation d'Atlas, projet de Camille." \
  --push ./$P/up --cwd '~/sshx/work/atlas-film' --cmd 'bash run.sh {}' --args-file $P/up/plages.txt --tpt 8 --est-seconds 180 | tail -1
bash "$L" wait "$NOM" --timeout 1800 | head -1
bash "$L" submit --name "$NOM-concat" --desc "Concaténation des segments de la vidéo de présentation d'Atlas." \
  --push ./$P/concat --cwd '~/sshx/work/atlas-film' --cmd 'bash concat.sh' --args 1 --wait --timeout 300 | head -1
mkdir -p out; bash "$SSHX/xcp.sh" pull $HOTE sshx/work/atlas-film/video_muette.mp4 out/
echo "→ out/video_muette.mp4 ; puis : bash outils/final.sh"
