// Télécharge les modèles d'openWakeWord (Apache-2.0) dans public/wakeword.
//   melspectrogram.onnx, embedding_model.onnx : chaîne commune à tous les mots-clés ;
//   hey_jarvis_v0.1.onnx : mot-clé pré-entraîné, pour tester avant d'avoir « Hey Atlas ».
// Le modèle « Hey Atlas » (hey_atlas.onnx) s'entraîne à part : voir docs/mot-cle.md.
import { mkdirSync, writeFileSync } from "node:fs";

const VERSION = "v0.5.1";
const BASE = `https://github.com/dscripka/openWakeWord/releases/download/${VERSION}`;
const FICHIERS = ["melspectrogram.onnx", "embedding_model.onnx", "hey_jarvis_v0.1.onnx"];

mkdirSync("public/wakeword", { recursive: true });
for (const fichier of FICHIERS) {
  const reponse = await fetch(`${BASE}/${fichier}`);
  if (!reponse.ok) throw new Error(`${fichier} : HTTP ${reponse.status}`);
  writeFileSync(`public/wakeword/${fichier}`, Buffer.from(await reponse.arrayBuffer()));
  console.log(`public/wakeword/${fichier}`);
}
