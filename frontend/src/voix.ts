// Appel vocal avec Atlas voix (atlas/voix) : micro → serveur en PCM 24 kHz, voix ← serveur en PCM 48 kHz.
// Pas d'interface propre, comme sur claude.ai : le panneau de conversation affiche ce que ce module lui passe
// (ta phrase en cours dans la saisie, les messages dans le fil, la voix d'Atlas colorée au fil de sa lecture),
// et la pastille (pastille.ts) montre les deux voix.
import { jetonAcces, urlAppel } from './api'
import { analyseur, type SourcesPastille } from './pastille'

export const VOIX_GRADIUM: [string, string][] = [
  ['iEu63s1rhn_kegTr', 'Gaspard'],
  ['6oIkS98REoVZ1dEw', 'Apolline'],
  ['YKeBw3OV1RgpdhLh', 'Jules'],
  ['biuhvu17TxVKOcyy', 'Marius'],
  ['FXxJ9mANRq6BCTX5', 'Noémie'],
]

const CLE_VOIX = 'atlas.voix'
const CLE_CASQUE = 'atlas.voix.casque'
/** Retard de la sortie WebRTC sur le compteur du lecteur : le texte ne doit pas devancer la voix. */
const RETARD_SORTIE_S = 0.15

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

/** Options de l'appel, gardées dans ce navigateur. */
export const optionsVoix = {
  get voix(): string {
    return lire(CLE_VOIX) ?? VOIX_GRADIUM[0][0]
  },
  set voix(v: string) {
    garder(CLE_VOIX, v)
  },
  /** Coupure immédiate : Atlas se tait dès que Camille parle (sinon, seulement sur des mots qui ne sont pas les siens). */
  get casque(): boolean {
    return lire(CLE_CASQUE) !== 'false'
  },
  set casque(v: boolean) {
    garder(CLE_CASQUE, String(v))
  },
}

export type EtatAppel = 'demarrage' | 'ecoute' | 'reflexion' | 'travail' | 'parle'

/** Un message d'Atlas voix pendant l'appel : `prononce` caractères déjà dits, le reste encore à dire. */
export interface MessageVoix {
  id: string
  texte: string
  prononce: number
  coupe: boolean
}

export interface RappelsAppel {
  /** L'appel est ouvert (true) ou terminé (false, avec la raison s'il a été coupé par le serveur). */
  surEtat: (ouvert: boolean, raison?: string) => void
  surEtatVoix: (etat: EtatAppel) => void
  /** Les deux voix, pour la pastille (null : appel terminé). */
  surSources: (sources: SourcesPastille | null) => void
  /** Ce que Camille est en train de dire (vide : tour terminé). */
  surPartiel: (texte: string) => void
  surUtilisateur: (texte: string, source: string) => void
  surMessage: (message: MessageVoix) => void
  surOutil: (id: string, description: string, fini: boolean, ok: boolean) => void
  surInfo: (texte: string, erreur: boolean) => void
  /** Réglages de l'orchestrateur choisis dans la saisie, pour le travail que la voix lui confie. */
  reglagesOrchestrateur: () => { modele?: string; effort?: string }
}

// Texte → mots avec leur fin (en caractères), pour colorer le texte au rythme des segments prononcés.
const MOT = /[\p{L}\p{N}]+/gu
const normaliser = (m: string) => m.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

interface Suivi extends MessageVoix {
  gen: number
  mots: { mot: string; fin: number }[]
  curseur: number
  segments: { debut: number; fin: number }[]
}

interface BoucleWebRTC {
  emetteur: RTCPeerConnection
  recepteur: RTCPeerConnection
  sortie: HTMLAudioElement
}

export class Appel {
  private ws: WebSocket | null = null
  private contexte: AudioContext | null = null
  private flux: MediaStream | null = null
  private lecteur: AudioWorkletNode | null = null
  private boucle: BoucleWebRTC | null = null
  /** webrtc, sauf si la boucle n'a pas pu s'établir (repli : sortie directe du moteur audio). */
  private modeLecture: 'webrtc' | 'webaudio' = 'webrtc'
  private etatServeur: EtatAppel = 'demarrage'
  private enLecture = false
  private genCourante = 0
  private position = { joues: 0, t: 0 }
  private messages = new Map<string, Suivi>()
  private image = 0
  muet = false
  private readonly rappels: RappelsAppel

  constructor(rappels: RappelsAppel) {
    this.rappels = rappels
  }

  get ouvert(): boolean {
    return this.ws !== null
  }

  async demarrer(conversationId: string) {
    if (this.ws) return
    this.messages.clear()
    this.afficherEtat('demarrage')
    try {
      await this.ouvrirAudio()
    } catch (e) {
      this.rappels.surInfo(`Micro indisponible : ${e instanceof Error ? e.message : String(e)}`, true)
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
      cancelAnimationFrame(this.image)
      this.rappels.surSources(null)
      this.rappels.surPartiel('')
      this.rappels.surEtat(false, e.code === 1000 || e.code === 1005 ? undefined : e.reason || 'Appel coupé.')
    }
    const suivre = () => {
      this.avancerTexte()
      this.image = requestAnimationFrame(suivre)
    }
    this.image = requestAnimationFrame(suivre)
  }

  raccrocher() {
    this.ws?.close(1000)
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
      voix: optionsVoix.voix,
      casque: optionsVoix.casque,
      lecture: this.modeLecture,
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
      if (!this.muet && this.ws?.readyState === WebSocket.OPEN) this.ws.send(e.data.pcm)
    }
    source.connect(micro)
    this.lecteur = new AudioWorkletNode(this.contexte, 'lecteur', { outputChannelCount: [1] })
    this.lecteur.port.onmessage = (e) => {
      this.position = { joues: e.data.joues, t: performance.now() }
      const fini = e.data.type === 'fini'
      if (fini) {
        this.enLecture = false
        this.afficherEtat()
      }
      this.envoyer({ type: 'lecture', gen: this.genCourante, joue_s: e.data.joues / 48000, fini })
    }
    // Les deux voix de la pastille : le micro après annulation d'écho, et ce que joue le lecteur.
    const toi = analyseur(this.contexte)
    const atlas = analyseur(this.contexte)
    source.connect(toi)
    this.lecteur.connect(atlas)
    await this.brancherSortie()
    await this.contexte.resume()
    this.rappels.surSources({ toi, atlas })
  }

  /** Relie le lecteur aux haut-parleurs par une boucle WebRTC locale. En sortie directe du moteur audio de la
   * page, l'annulation d'écho de Chrome décrochait après quelques interruptions (Atlas s'entendait et bouclait) ;
   * par WebRTC, comme une visio, elle tient. Repli sur la sortie directe si la boucle ne s'établit pas. */
  private async brancherSortie() {
    const contexte = this.contexte
    const lecteur = this.lecteur
    if (!contexte || !lecteur) return
    try {
      await this.brancherWebRTC(contexte, lecteur)
      this.modeLecture = 'webrtc'
    } catch (e) {
      console.warn('Lecture WebRTC impossible, sortie directe', e)
      this.fermerBoucle()
      lecteur.connect(contexte.destination)
      this.modeLecture = 'webaudio'
    }
  }

  private async brancherWebRTC(contexte: AudioContext, lecteur: AudioWorkletNode) {
    const destination = contexte.createMediaStreamDestination()
    lecteur.connect(destination)
    const emetteur = new RTCPeerConnection()
    const recepteur = new RTCPeerConnection()
    emetteur.onicecandidate = (e) => e.candidate && void recepteur.addIceCandidate(e.candidate)
    recepteur.onicecandidate = (e) => e.candidate && void emetteur.addIceCandidate(e.candidate)
    const sortie = new Audio()
    sortie.autoplay = true
    recepteur.ontrack = (e) => {
      sortie.srcObject = e.streams[0]
      void sortie.play()
    }
    for (const piste of destination.stream.getAudioTracks()) emetteur.addTrack(piste, destination.stream)
    this.boucle = { emetteur, recepteur, sortie }
    const offre = await emetteur.createOffer()
    await emetteur.setLocalDescription(offre)
    await recepteur.setRemoteDescription(offre)
    const reponse = await recepteur.createAnswer()
    await recepteur.setLocalDescription(reponse)
    await emetteur.setRemoteDescription(reponse)
  }

  private fermerBoucle() {
    if (!this.boucle) return
    this.boucle.emetteur.close()
    this.boucle.recepteur.close()
    this.boucle.sortie.srcObject = null
    this.boucle = null
  }

  private fermerAudio() {
    this.fermerBoucle()
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
      this.position = { joues: 0, t: performance.now() }
      this.lecteur.port.postMessage({ type: 'zero' })
    }
    const pcm = new Int16Array(tampon, 4)
    const echantillons = new Float32Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) echantillons[i] = pcm[i] / 32768
    this.lecteur.port.postMessage({ type: 'audio', echantillons }, [echantillons.buffer])
    if (!this.enLecture) {
      this.enLecture = true
      this.position.t = performance.now()
      this.afficherEtat()
    }
  }

  private couperLecture(gen: number) {
    for (const m of this.messages.values()) {
      if (m.gen === this.genCourante && m.prononce < m.texte.length && !m.coupe) {
        m.coupe = true
        this.rappels.surMessage(m)
      }
    }
    this.genCourante = Math.max(this.genCourante, gen)
    this.lecteur?.port.postMessage({ type: 'couper' })
    this.enLecture = false
    this.afficherEtat()
  }

  // ─── Texte d'Atlas au rythme de sa voix ───

  private suivi(id: string): Suivi {
    let m = this.messages.get(id)
    if (!m) {
      m = { id, gen: this.genCourante, texte: '', prononce: 0, coupe: false, mots: [], curseur: 0, segments: [] }
      this.messages.set(id, m)
    }
    return m
  }

  private decouper(m: Suivi) {
    m.mots = [...m.texte.matchAll(MOT)].map((x) => ({ mot: normaliser(x[0]), fin: (x.index ?? 0) + x[0].length }))
  }

  /** Un segment prononcé (mots Gradium) : on avance dans les mots du message pour savoir jusqu'où il va. */
  private segment(id: string, gen: number, debut: number, texte: string) {
    const m = this.suivi(id)
    m.gen = gen
    let fin = m.segments.at(-1)?.fin ?? 0
    for (const x of texte.matchAll(MOT)) {
      const mot = normaliser(x[0])
      for (let j = m.curseur; j < Math.min(m.mots.length, m.curseur + 6); j++) {
        if (m.mots[j].mot === mot) {
          m.curseur = j + 1
          fin = m.mots[j].fin
          break
        }
      }
    }
    m.segments.push({ debut, fin })
  }

  private avancerTexte() {
    const joue = this.position.joues / 48000 + (this.enLecture ? (performance.now() - this.position.t) / 1000 : 0)
    for (const m of this.messages.values()) {
      if (m.gen !== this.genCourante || m.coupe || m.prononce >= m.texte.length) continue
      let prononce = m.prononce
      for (const s of m.segments) if (s.debut <= joue - RETARD_SORTIE_S) prononce = Math.max(prononce, s.fin)
      // Fin de lecture : ce qui reste (ponctuation, mots non retrouvés) est dit.
      if (!this.enLecture && m.segments.length && m.curseur >= m.mots.length) prononce = m.texte.length
      if (prononce !== m.prononce) {
        m.prononce = prononce
        this.rappels.surMessage(m)
      }
    }
  }

  // ─── Messages du serveur ───

  private recevoir(m: any) {
    switch (m.type) {
      case 'etat':
        this.afficherEtat(m.etat)
        break
      case 'partiel':
        this.rappels.surPartiel(m.texte)
        break
      case 'utilisateur':
        this.rappels.surPartiel('')
        this.rappels.surUtilisateur(m.texte, m.source)
        break
      case 'agent_delta': {
        const s = this.suivi(m.id)
        s.texte += m.texte
        this.decouper(s)
        this.rappels.surMessage(s)
        break
      }
      case 'agent_fin': {
        const s = this.suivi(m.id)
        s.texte = m.texte
        this.decouper(s)
        this.rappels.surMessage(s)
        break
      }
      case 'segment':
        this.segment(m.id, m.gen, m.debut_s, m.texte)
        break
      case 'outil':
        this.rappels.surOutil(m.id, m.description, m.fini, m.ok !== false)
        break
      case 'couper':
        this.couperLecture(m.gen)
        break
      case 'erreur':
        this.rappels.surInfo(m.message, true)
        break
      case 'info':
        this.rappels.surInfo(m.message, false)
        break
    }
  }

  private afficherEtat(etat?: EtatAppel) {
    if (etat) this.etatServeur = etat
    const affiche = this.enLecture && this.etatServeur !== 'demarrage' ? 'parle' : this.etatServeur
    this.rappels.surEtatVoix(affiche)
  }
}
