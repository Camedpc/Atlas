/**
 * Micro partagé entre le mot-clé (local) et la session vocale (envoyée au serveur).
 *
 * Un seul getUserMedia, un seul AudioContext à 48 kHz. Les blocs de 20 ms sont distribués
 * aux abonnés ; les 1,5 dernières secondes restent en mémoire pour que la phrase dite juste
 * après « Hey Atlas » ne soit pas perdue pendant l'ouverture de la session.
 */

export type AbonneMicro = (bloc: Float32Array) => void;

const DUREE_TAMPON_S = 1.5;
const BLOCS_PAR_SECONDE = 50; // blocs de 20 ms

export class Micro {
  contexte: AudioContext | null = null;
  private flux: MediaStream | null = null;
  private noeud: AudioWorkletNode | null = null;
  private abonnes = new Set<AbonneMicro>();
  private tampon: Float32Array[] = [];

  get actif(): boolean {
    return this.contexte !== null;
  }

  async demarrer(): Promise<void> {
    if (this.contexte) return;
    this.flux = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.contexte = new AudioContext({ sampleRate: 48000 });
    await this.contexte.resume();
    await this.contexte.audioWorklet.addModule("/worklets/capture.js");
    this.noeud = new AudioWorkletNode(this.contexte, "capture-micro");
    this.noeud.port.onmessage = (e: MessageEvent<Float32Array>) => this.distribuer(e.data);
    this.contexte.createMediaStreamSource(this.flux).connect(this.noeud);
    // Relié (en silence) à la sortie pour que le navigateur fasse tourner le worklet.
    const muet = this.contexte.createGain();
    muet.gain.value = 0;
    this.noeud.connect(muet).connect(this.contexte.destination);
  }

  private distribuer(bloc: Float32Array): void {
    this.tampon.push(bloc);
    if (this.tampon.length > DUREE_TAMPON_S * BLOCS_PAR_SECONDE) this.tampon.shift();
    for (const abonne of this.abonnes) abonne(bloc);
  }

  abonner(abonne: AbonneMicro): () => void {
    this.abonnes.add(abonne);
    return () => this.abonnes.delete(abonne);
  }

  /** Les dernières secondes captées (les plus anciennes d'abord). */
  recent(dureeS: number): Float32Array[] {
    return this.tampon.slice(-Math.ceil(dureeS * BLOCS_PAR_SECONDE));
  }

  arreter(): void {
    this.noeud?.disconnect();
    this.flux?.getTracks().forEach((piste) => piste.stop());
    void this.contexte?.close();
    this.contexte = null;
    this.flux = null;
    this.noeud = null;
    this.tampon = [];
  }
}
