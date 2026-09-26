/**
 * Encodage Opus (micro → serveur) et lecture Opus (voix d'Atlas), avec les workers de Gradbot.
 */

const BASE = "/gradbot-audio";
const TAUX_OPUS = 24000;

/** Encode des blocs PCM float 48 kHz en pages Ogg/Opus. */
export class EncodeurOpus {
  private worker: Worker;

  constructor(tauxEntree: number, surPage: (page: Uint8Array) => void) {
    this.worker = new Worker(`${BASE}/encoderWorker.min.js`);
    this.worker.onmessage = (e) => {
      if (e.data?.message === "page") surPage(new Uint8Array(e.data.page));
    };
    this.worker.postMessage({
      command: "init",
      encoderSampleRate: TAUX_OPUS,
      bufferLength: Math.round((960 * tauxEntree) / TAUX_OPUS),
      numberOfChannels: 1,
      maxFramesPerPage: 2,
      encoderApplication: 2049, // VOIP
      encoderFrameSize: 20,
      encoderComplexity: 3,
      originalSampleRate: tauxEntree,
      resampleQuality: 3,
      streamPages: true,
    });
  }

  encoder(bloc: Float32Array): void {
    this.worker.postMessage({ command: "encode", buffers: [bloc] });
  }

  fermer(): void {
    this.worker.postMessage({ command: "done" });
    this.worker.terminate();
  }
}

interface Paquet {
  donnees: Uint8Array;
  stopS: number | null;
  tour: number | null;
  interrompu: boolean;
}

/**
 * Lecture de la voix d'Atlas : décodage Opus puis tampon de gigue (worklet de Gradbot, fondu
 * rapide en cas d'interruption). Repris de l'AudioProcessor de Gradbot, sans la partie micro.
 */
export class LecteurOpus {
  private decodeur: Worker | null = null;
  private pret = false;
  private file: Paquet[] = [];
  private entetes: Uint8Array[] = [];
  private entetesCaptures = false;
  private dernierTour: number | null = null;
  private courant: Omit<Paquet, "donnees"> = { stopS: null, tour: null, interrompu: false };
  private sortie: AudioWorkletNode | null = null;
  /** Millisecondes d'audio restant à jouer. */
  tamponMs = 0;

  constructor(private contexte: AudioContext) {}

  async demarrer(): Promise<void> {
    await this.contexte.audioWorklet.addModule(`${BASE}/audio-output-worklet.js`);
    this.sortie = new AudioWorkletNode(this.contexte, "audio-output-processor");
    this.sortie.connect(this.contexte.destination);
    this.sortie.port.onmessage = (e) => {
      if (e.data?.type === "metrics") this.tamponMs = e.data.bufferMs ?? 0;
    };
    this.creerDecodeur();
  }

  get joue(): boolean {
    return this.tamponMs > 30;
  }

  jouer(donnees: Uint8Array, stopS: number | null, tour: number | null, interrompu: boolean): void {
    const paquet = { donnees, stopS, tour, interrompu };
    if (!this.pret) this.file.push(paquet);
    else this.envoyer(paquet);
  }

  vider(): void {
    this.sortie?.port.postMessage({ type: "reset" });
    this.tamponMs = 0;
  }

  fermer(): void {
    this.decodeur?.terminate();
    this.sortie?.disconnect();
    this.decodeur = null;
    this.sortie = null;
  }

  private envoyer(paquet: Paquet): void {
    // Nouveau tour : décodeur neuf pour éviter un clic après une interruption.
    if (paquet.tour !== null && this.dernierTour !== null && paquet.tour !== this.dernierTour) {
      this.dernierTour = paquet.tour;
      this.file.push(paquet);
      this.creerDecodeur();
      return;
    }
    this.courant = { stopS: paquet.stopS, tour: paquet.tour, interrompu: paquet.interrompu };
    this.dernierTour = paquet.tour;
    if (!this.entetesCaptures) this.entetes.push(new Uint8Array(paquet.donnees));
    const copie = new Uint8Array(paquet.donnees);
    this.decodeur?.postMessage({ command: "decode", pages: copie }, [copie.buffer]);
  }

  private creerDecodeur(): void {
    this.decodeur?.terminate();
    const decodeur = new Worker(`${BASE}/decoderWorker.min.js`);
    this.decodeur = decodeur;
    this.pret = false;
    decodeur.postMessage({
      command: "init",
      bufferLength: (960 * this.contexte.sampleRate) / TAUX_OPUS,
      decoderSampleRate: TAUX_OPUS,
      outputBufferSampleRate: this.contexte.sampleRate,
      resampleQuality: 0,
    });
    if (this.entetesCaptures) {
      for (const entete of this.entetes) {
        const copie = new Uint8Array(entete);
        decodeur.postMessage({ command: "decode", pages: copie }, [copie.buffer]);
      }
    }
    decodeur.onmessage = (e) => {
      this.marquerPret();
      const trame = e.data?.[0];
      if (!trame) return;
      if (!this.entetesCaptures) {
        // La première trame audio signifie que les pages précédentes étaient des en-têtes.
        this.entetes.pop();
        this.entetesCaptures = true;
      }
      this.sortie?.port.postMessage({
        type: "audio", frame: trame, stopS: this.courant.stopS, turnIdx: this.courant.tour,
        interrupted: this.courant.interrompu,
      });
    };
    setTimeout(() => this.marquerPret(), 500);
  }

  private marquerPret(): void {
    if (this.pret) return;
    this.pret = true;
    const file = this.file;
    this.file = [];
    for (const paquet of file) this.envoyer(paquet);
  }
}
