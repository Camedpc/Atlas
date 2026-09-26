/**
 * Détection locale de « Hey Atlas » avec openWakeWord (modèles ONNX exécutés dans le navigateur).
 * Aucun audio ne quitte l'appareil avant le réveil (section 2.1).
 *
 * Chaîne d'openWakeWord : audio 16 kHz par blocs de 80 ms (1280 échantillons)
 *   → melspectrogram.onnx (32 bandes, transformation x/10 + 2)
 *   → embedding_model.onnx (fenêtre de 76 trames mel → vecteur de 96)
 *   → modèle du mot-clé (16 derniers vecteurs → score entre 0 et 1).
 */

import * as ort from "onnxruntime-web/wasm";
// Runtime WebAssembly servi depuis le paquet (Vite en fait des fichiers du build) : rien ne vient d'un CDN.
import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

ort.env.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };
ort.env.wasm.numThreads = 1;

const TAUX = 16000;
const BLOC = 1280;
const CONTEXTE_MEL = 160 * 3;
const TRAMES_EMBEDDING = 76;
const VECTEURS_MODELE = 16;
const REFRACTAIRE_MS = 2000;

export interface OptionsMotCle {
  modele: string;
  seuil: number;
  surDetection: (score: number) => void;
}

/** Filtre passe-bas puis décimation 48 kHz → 16 kHz. */
export class Decimateur {
  private static readonly COEFS = (() => {
    const n = 31;
    const coupure = 7200 / 48000;
    const coefs = new Float32Array(n);
    let somme = 0;
    for (let i = 0; i < n; i++) {
      const m = i - (n - 1) / 2;
      const sinc = m === 0 ? 2 * coupure : Math.sin(2 * Math.PI * coupure * m) / (Math.PI * m);
      const hamming = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
      coefs[i] = sinc * hamming;
      somme += coefs[i];
    }
    return coefs.map((c) => c / somme);
  })();

  private historique = new Float32Array(Decimateur.COEFS.length);
  private phase = 0;

  constructor(private facteur: number) {}

  traiter(entree: Float32Array): Float32Array {
    const coefs = Decimateur.COEFS;
    const n = coefs.length;
    const sortie: number[] = [];
    for (let i = 0; i < entree.length; i++) {
      this.historique.copyWithin(0, 1);
      this.historique[n - 1] = entree[i];
      if (++this.phase === this.facteur) {
        this.phase = 0;
        let acc = 0;
        for (let k = 0; k < n; k++) acc += coefs[k] * this.historique[k];
        sortie.push(acc);
      }
    }
    return Float32Array.from(sortie);
  }
}

export class MotCle {
  private mel!: ort.InferenceSession;
  private embedding!: ort.InferenceSession;
  private modele!: ort.InferenceSession;
  private decimateur: Decimateur | null = null;
  private brut = new Float32Array(0);
  private tramesMel: Float32Array[] = [];
  private vecteurs: Float32Array[] = [];
  private enCours = false;
  private blocsVus = 0;
  private derniereDetection = 0;
  actif = false;

  constructor(private options: OptionsMotCle) {}

  async charger(): Promise<void> {
    const creer = async (fichier: string) => {
      // Un fichier absent est servi comme la page d'accueil (HTML) : on le détecte avant ONNX.
      const reponse = await fetch(`/wakeword/${fichier}`);
      if (!reponse.ok || reponse.headers.get("content-type")?.includes("text/html")) {
        throw new Error(`${fichier} absent de public/wakeword (npm run mot-cle)`);
      }
      return ort.InferenceSession.create(new Uint8Array(await reponse.arrayBuffer()), {
        executionProviders: ["wasm"],
      });
    };
    [this.mel, this.embedding, this.modele] = await Promise.all([
      creer("melspectrogram.onnx"), creer("embedding_model.onnx"), creer(this.options.modele),
    ]);
    this.reinitialiser();
  }

  reinitialiser(): void {
    this.brut = new Float32Array(0);
    this.tramesMel = Array.from({ length: TRAMES_EMBEDDING }, () => new Float32Array(32).fill(1));
    this.vecteurs = Array.from({ length: VECTEURS_MODELE }, () => new Float32Array(96));
    this.blocsVus = 0;
  }

  /** Reçoit les blocs du micro (48 kHz). */
  pousser(bloc: Float32Array, tauxEntree: number): void {
    if (!this.actif) return;
    this.decimateur ??= new Decimateur(Math.round(tauxEntree / TAUX));
    const pcm = this.decimateur.traiter(bloc);
    const fusion = new Float32Array(this.brut.length + pcm.length);
    fusion.set(this.brut);
    fusion.set(pcm, this.brut.length);
    this.brut = fusion;
    if (!this.enCours && this.brut.length >= BLOC + CONTEXTE_MEL) void this.traiter();
  }

  private async traiter(): Promise<void> {
    this.enCours = true;
    try {
      while (this.brut.length >= BLOC + CONTEXTE_MEL) {
        // Les échantillons sont attendus à l'échelle int16.
        const fenetre = this.brut.slice(0, BLOC + CONTEXTE_MEL).map((x) => x * 32767);
        this.brut = this.brut.slice(BLOC);
        const score = await this.bloc(fenetre);
        // Les premiers blocs reposent sur des tampons initiaux artificiels.
        if (++this.blocsVus < VECTEURS_MODELE) continue;
        const maintenant = performance.now();
        if (score >= this.options.seuil && maintenant - this.derniereDetection > REFRACTAIRE_MS) {
          this.derniereDetection = maintenant;
          this.options.surDetection(score);
        }
      }
    } finally {
      this.enCours = false;
    }
  }

  private async bloc(fenetre: Float32Array): Promise<number> {
    const sortieMel = await this.mel.run({
      [this.mel.inputNames[0]]: new ort.Tensor("float32", fenetre, [1, fenetre.length]),
    });
    const mel = sortieMel[this.mel.outputNames[0]];
    const donnees = mel.data as Float32Array;
    const nTrames = donnees.length / 32;
    for (let t = 0; t < nTrames; t++) {
      this.tramesMel.push(donnees.slice(t * 32, (t + 1) * 32).map((x) => x / 10 + 2));
    }
    this.tramesMel = this.tramesMel.slice(-TRAMES_EMBEDDING);

    const entreeEmb = new Float32Array(TRAMES_EMBEDDING * 32);
    this.tramesMel.forEach((trame, i) => entreeEmb.set(trame, i * 32));
    const sortieEmb = await this.embedding.run({
      [this.embedding.inputNames[0]]: new ort.Tensor("float32", entreeEmb, [1, TRAMES_EMBEDDING, 32, 1]),
    });
    this.vecteurs.push(Float32Array.from(sortieEmb[this.embedding.outputNames[0]].data as Float32Array));
    this.vecteurs = this.vecteurs.slice(-VECTEURS_MODELE);

    const entree = new Float32Array(VECTEURS_MODELE * 96);
    this.vecteurs.forEach((v, i) => entree.set(v, i * 96));
    const sortie = await this.modele.run({
      [this.modele.inputNames[0]]: new ort.Tensor("float32", entree, [1, VECTEURS_MODELE, 96]),
    });
    return (sortie[this.modele.outputNames[0]].data as Float32Array)[0];
  }
}
