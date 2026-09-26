// Capture du micro : regroupe les échantillons par blocs de 20 ms et les envoie au fil principal.
class CaptureMicro extends AudioWorkletProcessor {
  constructor() {
    super();
    this.taille = Math.round(sampleRate / 50);
    this.bloc = new Float32Array(this.taille);
    this.position = 0;
  }

  process(entrees) {
    const canal = entrees[0] && entrees[0][0];
    if (!canal) return true;
    for (let i = 0; i < canal.length; i++) {
      this.bloc[this.position++] = canal[i];
      if (this.position === this.taille) {
        this.port.postMessage(this.bloc, [this.bloc.buffer]);
        this.bloc = new Float32Array(this.taille);
        this.position = 0;
      }
    }
    return true;
  }
}

registerProcessor("capture-micro", CaptureMicro);
