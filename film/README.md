# Film de présentation d'Atlas

Vidéo de 1 min 59,8 s en 1920×1080 à 60 i/s, montée avec [Remotion](https://www.remotion.dev) (React) à partir de
captures du vrai produit. Dernière version : `out/Atlas-presentation.mp4`.

Pour travailler, copier ce dossier hors de OneDrive (`node_modules` et des milliers d'images) : la copie de travail
de Camille est `C:\Users\Camille\Videos\atlas-film`.

## Après un clone

La vidéo finale (99 Mo, trop lourde pour le dépôt) est dans `out/` de la copie de travail. Les images capturées ne sont pas
versionnées telles quelles : elles sont dans `media/` sous forme de vidéos 4K compactes.

```bash
npm install
bash outils/decoder-seq.sh     # reconstitue capture/seq/ et capture/ui/frappe/ (~640 Mo d'images)
```

## Itérer en 4 commandes

```bash
npm run serveur          # sert les médias sur http://localhost:9123 (à laisser tourner)
npm run studio           # aperçu interactif du montage (timeline, lecture, images)
npm run stills -- 12.8 50.5 93.5   # images clés (secondes) → stills/t12.80.jpg…, en demi-résolution
npm run rendu-x          # rendu sur les machines de l'X → out/video_muette.mp4
npm run final            # mixage + assemblage → out/Atlas-presentation.mp4
```

Après une retouche qui ne touche que quelques secondes, ne refaire que les plages concernées (grille de 240
images, 4 s) : `bash outils/rendu-x.sh 5040-5279 5280-5519`. Les autres segments restent à l'X.

**Ne pas lancer de rendu complet sur le PC** : il a manqué de mémoire au premier essai. En local, se limiter au
studio et aux images clés, ou rendre une courte plage :
`npx remotion render src/index.ts Atlas out/essai.mp4 --props=props-local.json --frames=4200-4400 --concurrency=2`.

## Où est quoi

| Fichier | Rôle |
|---|---|
| `src/AtlasFilm.tsx` | Assemble les scènes (par temps absolu) et la bande-son |
| `src/lib.tsx` | Outils communs : temps en secondes (`kf`, `monte`), `Film` (séquences capturées), `Ecran` (capture en carte 3D avec caméra intérieure), `Curseur`, `Mots` (texte révélé), `Rappel` (étiquette + trait), `Marque` (logo), couleurs et polices |
| `src/scenes/Ouverture.tsx` | 0 – 16,3 s : cartes d'énoncés réelles en 3D, assemblage en graphe, logo |
| `src/scenes/Recherche.tsx` | 16,3 – 40 s : question tapée, envoi, agent graph (projecteur + étiquettes), fil de la conversation |
| `src/scenes/Graphe.tsx` | 39,7 – 70,3 s : graphe (plans g1 à g3, rappels Assertion / Démonstration), fiche et verdict |
| `src/scenes/Montage.tsx` | 70,3 s – fin : « Jugé. Noté. Établi. », verdicts, figure, appel vocal, échelle, logo final |
| `src/BandeSon.tsx` | Calage des voix off et des bruitages (pour le studio) |
| `audio/mix.py` | **Le mixage réellement utilisé** (même calage que `BandeSon.tsx`, à garder aligné) |
| `src/plan-*.json` | Copies des plans de caméra du graphe (les rappels de `Graphe.tsx` suivent `plan-pend.json`) |

Les temps forts sont calés sur la musique (100 BPM, un temps = 0,6 s, temps en 0,11 + 0,6 k) : entrée du groove à
16,31 s, creux à 39,7 s, drop à 70,31 s, frappe finale à 111,71 s.

## Captures (il faut Atlas lancé : API :8000 et front :5173)

- `capture/sequence.mjs capture/plan-XXX.json` filme le vrai graphe image par image en 4K : caméra interpolée
  (van Wijk), clés `{t, cx, cy, z, ease, etat: {selection}}` en coordonnées du monde. Sortie : `capture/seq/<nom>/`.
  Les plans existants : `plan-pend.json` (g1, g2, g3, g5, g7a-c), `plan-drop.json` (g4), `plan-bancg.json` (g6).
  Si le nombre d'images d'un plan change, mettre à jour le `n` du `<Film>` correspondant.
- `capture/ui.mjs` : accueil, frappe de la question lettre à lettre, session, fil de la conversation, fiche.
  `capture/agents2.mjs` : agent graph déplié. `capture/cartes.mjs` : cartes d'énoncés de l'ouverture.
- `capture/dump.mjs <projet> <tag>` : positions des blocs et cadres d'un espace (`capture/*-modele.json`),
  pour placer la caméra.

## Son

- Musique : « Masking the Masters » (Mixkit, licence gratuite sans attribution), recoupée sur les temps :
  `audio/music/musique.wav` (0 → 102,11 s puis 200,51 s → fin). Autres pistes candidates dans `audio/music/`.
- Voix off : Gradium, voix Gaspard (celle d'Atlas voix) et Apolline pour la réplique de Camille.
  Textes dans `audio/vo/final.json`, génération : `audio/vo/regen.py final.json` avec le Python du dépôt Atlas
  (clé `GRADIUM_API_KEY` du `.env` d'Atlas). Le « ... » en tête évite que Gradium mange le premier mot.
  Après régénération : `cd audio/vo && python debuts.py` (met à jour `audio/vo.json`).
- Bruitages : Kenney (CC0) convertis dans `audio/sfx/wav/`, plus des sons synthétisés par `audio/sfx/synth.py`
  (souffles, montée, impact, carillon de validation).
- Mixage : la musique baisse à 0,19 sous la voix, compression douce, normalisation à −14 LUFS, crête −1 dB.

## Rendu à l'X (skill sshX)

`outils/rendu-x.sh` encode les séquences en vidéos 4K compactes, empaquette le bundle Remotion et les médias,
envoie tout, lance une tâche par plage de 240 images puis concatène à l'X et rapatrie `out/video_muette.mp4`.
Sur chaque machine, `x/run.sh` installe Node, Remotion et Chrome dans `/tmp` et y redécode les médias (le home
de Camille est à ~298 000 fichiers sur 300 000 autorisés : rien de volumineux en nombre de fichiers dans le home).
Travail et segments côté X : `~/sshx/work/atlas-film/`. Rendu complet : ~2 min sur 30 machines.
