# Mot-clé « Hey Atlas »

La détection tourne entièrement dans le navigateur (onnxruntime-web). Elle utilise la chaîne
d'[openWakeWord](https://github.com/dscripka/openWakeWord) (Apache-2.0) :

1. `melspectrogram.onnx` et `embedding_model.onnx` : communs à tous les mots-clés ;
2. un petit modèle propre au mot-clé : `hey_atlas.onnx`.

`npm run mot-cle` télécharge les deux premiers, ainsi que `hey_jarvis_v0.1.onnx` (pré-entraîné) pour
tester la chaîne avant d'avoir « Hey Atlas ».

## Entraîner « Hey Atlas »

openWakeWord entraîne un mot-clé à partir de voix synthétiques, sans enregistrement. Il suffit de
suivre le notebook `notebooks/automatic_model_training.ipynb` du dépôt openWakeWord (Colab ou
machine avec GPU) avec :

- `target_phrase` : `["hey atlas", "hé atlas"]` : les deux prononciations, anglaise et française ;
- `custom_negative_phrases` : phrases proches qui ne doivent pas réveiller, par exemple `["atlas"]`,
  `["hey alice"]`, `["et là"]`, `["à tout à l'heure"]`, `["hélas"]` ;
- générateur de voix : ajouter des voix françaises (Piper `fr_FR`) aux voix anglaises par défaut ;
- `n_samples` : 20 000 au moins ; `steps` : 50 000 environ.

Copier le fichier `.onnx` obtenu dans `frontend/public/wakeword/hey_atlas.onnx`.

## Réglage et vérification (critère : ≥ 95 % à 1 m, ≤ 1 faux réveil par heure)

- Seuil : `VITE_MOT_CLE_SEUIL` (0,5 par défaut). Le monter réduit les faux réveils, le baisser
  augmente la détection.
- Détection : prononcer « Hey Atlas » 40 fois à 1 m, avec plusieurs voix et dans plusieurs pièces,
  et compter les réveils.
- Faux réveils : laisser tourner une heure avec du bruit ambiant (conversation, radio). Le tableau
  de bord compte comme faux réveil tout réveil sans parole dans les 6 secondes qui suivent.
