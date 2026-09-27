// Deux processeurs audio : le micro (vers PCM 24 kHz, trames de 80 ms) et le lecteur (file PCM, coupure nette).

class Micro extends AudioWorkletProcessor {
  constructor() {
    super()
    this.pas = sampleRate / 24000
    this.position = 0
    this.trame = new Int16Array(1920)
    this.rempli = 0
    this.energie = 0
  }

  process(entrees) {
    const canal = entrees[0] && entrees[0][0]
    if (!canal) return true
    // Rééchantillonnage linéaire vers 24 kHz.
    while (this.position < canal.length - 1) {
      const i = Math.floor(this.position)
      const f = this.position - i
      const x = canal[i] * (1 - f) + canal[i + 1] * f
      this.energie += x * x
      this.trame[this.rempli++] = Math.max(-32768, Math.min(32767, Math.round(x * 32767)))
      if (this.rempli === this.trame.length) {
        this.port.postMessage({ pcm: this.trame.buffer, niveau: Math.sqrt(this.energie / this.trame.length) }, [this.trame.buffer])
        this.trame = new Int16Array(1920)
        this.rempli = 0
        this.energie = 0
      }
      this.position += this.pas
    }
    this.position -= canal.length
    return true
  }
}

class Lecteur extends AudioWorkletProcessor {
  constructor() {
    super()
    this.file = []
    this.decalage = 0
    this.joues = 0
    this.actif = false
    this.dernierRapport = 0
    this.port.onmessage = (e) => {
      const m = e.data
      if (m.type === 'audio') {
        this.file.push(m.echantillons)
        this.actif = true
      } else if (m.type === 'couper') {
        this.file = []
        this.decalage = 0
        this.joues = 0
        this.actif = false
      } else if (m.type === 'zero') {
        this.joues = 0
      }
    }
  }

  process(_entrees, sorties) {
    const sortie = sorties[0][0]
    let i = 0
    while (i < sortie.length && this.file.length) {
      const bloc = this.file[0]
      const n = Math.min(sortie.length - i, bloc.length - this.decalage)
      sortie.set(bloc.subarray(this.decalage, this.decalage + n), i)
      i += n
      this.decalage += n
      this.joues += n
      if (this.decalage >= bloc.length) {
        this.file.shift()
        this.decalage = 0
      }
    }
    sortie.fill(0, i)
    if (this.actif && !this.file.length) {
      this.actif = false
      this.port.postMessage({ type: 'fini', joues: this.joues })
    } else if (this.actif && currentTime - this.dernierRapport > 0.2) {
      this.dernierRapport = currentTime
      this.port.postMessage({ type: 'position', joues: this.joues })
    }
    return true
  }
}

registerProcessor('micro', Micro)
registerProcessor('lecteur', Lecteur)
