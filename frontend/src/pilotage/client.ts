// Client du relais d'affichage (back d'AtlasVoice, `VITE_AFFICHAGE_URL`) : déclare cet écran, reçoit les
// lots de commandes (flux SSE lu par fetch, pour garder le jeton hors de l'URL), les exécute par le pilote,
// renvoie les comptes rendus et les états de l'écran. Sans relais configuré ou joignable, l'application
// fonctionne normalement, sans pilotage ; le client réessaie en silence.

import type { Pilote } from './pilote'
import type { CompteRendu, EtatAffichage } from './protocole'

const BASE = (import.meta.env.VITE_AFFICHAGE_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const ATTENTES_MS = [1000, 2000, 5000, 10000, 30000]

/** Le relais ne connaît plus l'écran (redémarrage) : il faut le redéclarer. */
class EcranPerdu extends Error {}

export class ClientRelais {
  private pilote: Pilote
  private jeton: () => string | null
  private connecte = false
  private flux: AbortController | null = null
  private essais = 0

  /** `jeton` : JWT Supabase de l'utilisateur si le relais exige une connexion (SUPABASE_JWT_SECRET). */
  constructor(pilote: Pilote, jeton: () => string | null = () => null) {
    this.pilote = pilote
    this.jeton = jeton
  }

  static configure(): boolean {
    return BASE !== ''
  }

  demarrer(): void {
    if (!ClientRelais.configure()) return
    this.pilote.ecouter((e) => void this.envoyerEtat(e))
    void this.boucle()
  }

  private entetes(json = false): Record<string, string> {
    const h: Record<string, string> = {}
    if (json) h['Content-Type'] = 'application/json'
    const j = this.jeton()
    if (j) h.Authorization = `Bearer ${j}`
    return h
  }

  private chemin(suite = ''): string {
    return `${BASE}/api/affichage/ecrans/${encodeURIComponent(this.pilote.ecran)}${suite}`
  }

  private async poster(url: string, corps: unknown): Promise<void> {
    const r = await fetch(url, { method: 'POST', headers: this.entetes(true), body: JSON.stringify(corps) })
    if (r.status === 404) throw new EcranPerdu()
    if (!r.ok) throw new Error(`${url} : ${r.status} ${await r.text()}`)
  }

  private async boucle(): Promise<void> {
    for (;;) {
      try {
        await this.declarer()
        this.essais = 0
        await this.ecouter()
      } catch (e) {
        if (this.connecte) console.info('[relais] déconnecté', e instanceof Error ? e.message : e)
      }
      this.connecte = false
      const attente = ATTENTES_MS[Math.min(this.essais++, ATTENTES_MS.length - 1)]!
      await new Promise((r) => setTimeout(r, attente))
    }
  }

  private async declarer(): Promise<void> {
    const r = await fetch(`${BASE}/api/affichage/ecrans`, {
      method: 'POST', headers: this.entetes(true), body: JSON.stringify({ ecran: this.pilote.ecran }),
    })
    if (!r.ok) throw new Error(`déclaration : ${r.status}`)
    const { utilisateur_id } = (await r.json()) as { ecran: string; utilisateur_id: string }
    this.pilote.adaptateur.utilisateurId = utilisateur_id
    this.connecte = true
    console.info(`[relais] écran ${this.pilote.ecran} déclaré pour ${utilisateur_id}`)
    await this.envoyerEtat(this.pilote.etat())
  }

  /** Lit le flux SSE jusqu'à sa fin ; chaque lot est exécuté dans l'ordre (file du pilote). */
  private async ecouter(): Promise<void> {
    this.flux = new AbortController()
    const r = await fetch(this.chemin('/flux'), { headers: this.entetes(), signal: this.flux.signal })
    if (!r.ok || !r.body) throw new Error(`flux : ${r.status}`)
    const lecteur = r.body.pipeThrough(new TextDecoderStream()).getReader()
    let tampon = ''
    for (;;) {
      const { value, done } = await lecteur.read()
      if (done) return
      tampon += value.replace(/\r\n/g, '\n')
      let fin: number
      while ((fin = tampon.indexOf('\n\n')) >= 0) {
        const bloc = tampon.slice(0, fin)
        tampon = tampon.slice(fin + 2)
        const evenement = /^event: (.*)$/m.exec(bloc)?.[1]
        const donnees = bloc.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n')
        if (evenement === 'lot' && donnees) this.executer(donnees)
      }
    }
  }

  private executer(donnees: string): void {
    let lot: unknown
    try {
      lot = JSON.parse(donnees)
    } catch {
      lot = donnees // le pilote répondra « invalide »
    }
    void this.pilote.executer(lot).then((cr) => this.envoyerCompteRendu(cr))
  }

  private async envoyerCompteRendu(cr: CompteRendu): Promise<void> {
    try {
      await this.poster(this.chemin('/compte-rendu'), cr)
    } catch (e) {
      this.surErreur(e)
    }
  }

  private async envoyerEtat(e: EtatAffichage): Promise<void> {
    if (!this.connecte) return
    try {
      await this.poster(this.chemin('/etat'), e)
    } catch (err) {
      this.surErreur(err)
    }
  }

  private surErreur(e: unknown): void {
    // Écran inconnu du relais : on coupe le flux, la boucle redéclare l'écran.
    if (e instanceof EcranPerdu) this.flux?.abort()
    else console.warn('[relais]', e instanceof Error ? e.message : e)
  }
}
