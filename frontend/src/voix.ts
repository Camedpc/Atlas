// Appel vocal avec Atlas voix (atlas/voix) : micro → serveur en PCM 24 kHz, voix ← serveur en PCM 48 kHz.
// La barre d'appel montre l'état, ce que Camille est en train de dire et la phrase en cours d'Atlas voix ; la
// transcription complète arrive dans le fil (agent /voix), comme les messages des autres agents.
import { jetonAcces, urlAppel } from './api'

const ETATS: Record<string, string> = {
  demarrage: 'Décroche…',
  ecoute: 'À l’écoute',
  reflexion: 'Réfléchit…',
  travail: 'Travaille…',
  parle: 'Parle',
}

const VOIX_GRADIUM: [string, string][] = [
  ['iEu63s1rhn_kegTr', 'Gaspard'],
  ['6oIkS98REoVZ1dEw', 'Apolline'],
  ['YKeBw3OV1RgpdhLh', 'Jules'],
  ['biuhvu17TxVKOcyy', 'Marius'],
  ['FXxJ9mANRq6BCTX5', 'Noémie'],
]

const CLE_VOIX = 'atlas.voix'
const CLE_CASQUE = 'atlas.voix.casque'

function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}

function garder(cle: string, valeur: string) {
  try {
    localStorage.setItem(cle, valeur)
  } catch {
    // navigation privée : le choix ne tiendra que le temps de la page
  }
}

export interface RappelsAppel {
  /** L'appel est ouvert (true) ou terminé (false). */
  surEtat: (ouvert: boolean) => void
  /** Réglages de l'orchestrateur choisis dans la saisie, pour le travail que la voix lui confie. */
  reglagesOrchestrateur: () => { modele?: string; effort?: string }
}

export class Appel {
  private barre: HTMLElement
  private ws: WebSocket | null = null
  private contexte: AudioContext | null = null
  private flux: MediaStream | null = null
  private lecteur: AudioWorkletNode | null = null
  private muet = false
  private etatServeur = 'demarrage'
  private enLecture = false
  private genCourante = 0
  private phrase = ''
  private readonly rappels: RappelsAppel

  constructor(barre: HTMLElement, rappels: RappelsAppel) {
    this.barre = barre
    this.rappels = rappels
    barre.hidden = true
    barre.innerHTML = `
      <div class="appel-ligne">
        <span class="appel-etat" data-etat="demarrage"><i></i><b>Atlas voix</b><span></span></span>
        <span class="appel-niveau"><span></span></span>
        <span class="appel-mesures"></span>
        <span class="espace"></span>
        <select class="appel-voix" title="Voix d’Atlas">${VOIX_GRADIUM.map(([id, nom]) => `<option value="${id}">${nom}</option>`).join('')}</select>
        <label class="appel-casque" title="Couper Atlas dès que tu parles. Décoche sur haut-parleurs s’il se coupe tout seul.">
          <input type="checkbox" checked> Coupure immédiate</label>
        <button type="button" class="appel-interrompre" title="Faire taire Atlas voix (Échap)">Interrompre</button>
        <button type="button" class="appel-micro" title="Couper le micro">Micro</button>
        <button type="button" class="appel-raccrocher">Raccrocher</button>
      </div>
      <div class="appel-texte"><span class="appel-camille"></span><span class="appel-atlas"></span></div>`
    const voix = barre.querySelector<HTMLSelectElement>('.appel-voix')!
    const casque = barre.querySelector<HTMLInputElement>('.appel-casque input')!
    voix.value = lire(CLE_VOIX) ?? VOIX_GRADIUM[0][0]
    casque.checked = lire(CLE_CASQUE) !== 'false'
    voix.addEventListener('change', () => {
      garder(CLE_VOIX, voix.value)
      this.envoyerReglages()
    })
    casque.addEventListener('change', () => {
      garder(CLE_CASQUE, String(casque.checked))
      this.envoyerReglages()
    })
    barre.querySelector('.appel-interrompre')!.addEventListener('click', () => this.interrompre())
    barre.querySelector('.appel-raccrocher')!.addEventListener('click', () => this.raccrocher())
    barre.querySelector('.appel-micro')!.addEventListener('click', (e) => {
      this.muet = !this.muet
      const b = e.currentTarget as HTMLElement
      b.classList.toggle('coupe', this.muet)
      b.textContent = this.muet ? 'Micro coupé' : 'Micro'
    })
  }

  get ouvert(): boolean {
    return this.ws !== null
  }

  async demarrer(conversationId: string) {
    if (this.ws) return
    this.barre.hidden = false
    this.afficherEtat('demarrage')
    try {
      await this.ouvrirAudio()
    } catch (e) {
      this.texte('.appel-camille', `Micro indisponible : ${e instanceof Error ? e.message : String(e)}`)
      return
    }
    const ws = new WebSocket(urlAppel(conversationId))
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', jeton: jetonAcces() }))
      this.envoyerReglages()
      this.rappels.surEtat(true)
    }
    ws.onmessage = (e) => (typeof e.data === 'string' ? this.recevoir(JSON.parse(e.data)) : this.jouer(e.data))
    ws.onclose = (e) => {
      if (this.ws !== ws) return
      this.ws = null
      this.couperLecture(this.genCourante)
      this.fermerAudio()
      this.barre.hidden = e.code === 1000 || e.code === 1005
      if (!this.barre.hidden) {
        this.afficherEtat('arret')
        this.texte('.appel-camille', e.reason || 'Appel coupé.')
        this.texte('.appel-atlas', '')
      }
      this.rappels.surEtat(false)
    }
  }

  raccrocher() {
    this.ws?.close(1000)
    this.barre.hidden = true
  }

  interrompre() {
    this.envoyer({ type: 'interrompre' })
  }

  /** Message tapé pendant l'appel, adressé à Atlas voix. */
  ecrire(texte: string) {
    this.envoyer({ type: 'texte', texte })
  }

  envoyerReglages() {
    const r = this.rappels.reglagesOrchestrateur()
    this.envoyer({
      type: 'reglages',
      voix: this.barre.querySelector<HTMLSelectElement>('.appel-voix')!.value,
      casque: this.barre.querySelector<HTMLInputElement>('.appel-casque input')!.checked,
      modele_orchestrateur: r.modele ?? null,
      effort_orchestrateur: r.effort ?? null,
    })
  }

  private envoyer(message: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message))
  }

  // ─── Audio ───

  private async ouvrirAudio() {
    this.contexte = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
    await this.contexte.audioWorklet.addModule('/voix-worklets.js')
    // Annulation d'écho, réduction de bruit et gain automatique du navigateur (ceux des visios).
    this.flux = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    const source = this.contexte.createMediaStreamSource(this.flux)
    const micro = new AudioWorkletNode(this.contexte, 'micro')
    micro.port.onmessage = (e) => {
      const niveau = this.barre.querySelector<HTMLElement>('.appel-niveau span')!
      niveau.style.width = `${Math.min(100, e.data.niveau * 400)}%`
      if (!this.muet && this.ws?.readyState === WebSocket.OPEN) this.ws.send(e.data.pcm)
    }
    source.connect(micro)
    this.lecteur = new AudioWorkletNode(this.contexte, 'lecteur', { outputChannelCount: [1] })
    this.lecteur.connect(this.contexte.destination)
    this.lecteur.port.onmessage = (e) => {
      const joue_s = e.data.joues / 48000
      const fini = e.data.type === 'fini'
      if (fini) {
        this.enLecture = false
        this.afficherEtat()
      }
      this.envoyer({ type: 'lecture', gen: this.genCourante, joue_s, fini })
    }
    await this.contexte.resume()
  }

  private fermerAudio() {
    for (const piste of this.flux?.getTracks() ?? []) piste.stop()
    void this.contexte?.close()
    this.contexte = null
    this.flux = null
    this.lecteur = null
  }

  private jouer(tampon: ArrayBuffer) {
    const gen = new DataView(tampon).getUint32(0, true)
    if (gen < this.genCourante || !this.lecteur) return // audio d'une réponse coupée
    if (gen > this.genCourante) {
      this.genCourante = gen
      this.lecteur.port.postMessage({ type: 'zero' })
    }
    const pcm = new Int16Array(tampon, 4)
    const echantillons = new Float32Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) echantillons[i] = pcm[i] / 32768
    this.lecteur.port.postMessage({ type: 'audio', echantillons }, [echantillons.buffer])
    if (!this.enLecture) {
      this.enLecture = true
      this.afficherEtat()
    }
  }

  private couperLecture(gen: number) {
    this.genCourante = Math.max(this.genCourante, gen)
    this.lecteur?.port.postMessage({ type: 'couper' })
    this.enLecture = false
    this.afficherEtat()
  }

  // ─── Messages du serveur ───

  private recevoir(m: any) {
    switch (m.type) {
      case 'etat':
        this.afficherEtat(m.etat)
        break
      case 'partiel':
        this.texte('.appel-camille', m.texte)
        break
      case 'utilisateur':
        this.texte('.appel-camille', '')
        this.phrase = ''
        break
      case 'agent_delta':
        this.phrase += m.texte
        this.texte('.appel-atlas', this.phrase.slice(-220))
        break
      case 'agent_fin':
        this.phrase = ''
        break
      case 'outil':
        if (!m.fini) this.texte('.appel-atlas', `▸ ${m.description}`)
        break
      case 'couper':
        this.couperLecture(m.gen)
        break
      case 'mesure':
        if (m.nom === 'premier_son') this.texte('.appel-mesures', `réponse en ${(m.ms / 1000).toFixed(1)} s`)
        break
      case 'erreur':
      case 'info':
        this.texte('.appel-atlas', m.message)
        break
    }
  }

  private afficherEtat(etat?: string) {
    if (etat) this.etatServeur = etat
    const affiche = this.enLecture && this.etatServeur !== 'demarrage' ? 'parle' : this.etatServeur
    const el = this.barre.querySelector<HTMLElement>('.appel-etat')!
    el.dataset.etat = affiche
    el.querySelector('span')!.textContent = ETATS[affiche] ?? (affiche === 'arret' ? 'Terminé' : affiche)
  }

  private texte(selecteur: string, valeur: string) {
    const el = this.barre.querySelector<HTMLElement>(selecteur)!
    el.textContent = valeur
    el.title = valeur
  }
}
