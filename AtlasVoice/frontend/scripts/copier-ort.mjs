// Copie le runtime WebAssembly d'onnxruntime-web dans public/ort : le mot-clé tourne
// entièrement dans le navigateur, sans télécharger de code depuis un CDN.
import { cpSync, mkdirSync, readdirSync } from "node:fs";

const source = "node_modules/onnxruntime-web/dist";
const cible = "public/ort";
mkdirSync(cible, { recursive: true });
for (const fichier of readdirSync(source)) {
  if (/^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(fichier)) cpSync(`${source}/${fichier}`, `${cible}/${fichier}`);
}
