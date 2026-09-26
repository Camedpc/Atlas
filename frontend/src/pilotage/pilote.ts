// Programme déterministe (P3 → écran) : exécute les LotCommandes dans l'ordre d'arrivée et rend un
// CompteRendu. Aucun appel à un modèle ici. Même suite de lots depuis le même état = même écran.
//
// Étapes d'un lot : validation par le schéma, écran, idempotence (lot_id déjà vu → même compte rendu),
// application pure de toutes les commandes (`appliquerLot`, tout ou rien si atomique), puis mise en état
// de l'écran commande par commande (`synchroniser` + effet), enfin export de l'état réel.

import { AdaptateurAffichage, type InterfaceApp } from './adaptateur'
import { appliquerLot } from './etat'
import {
  validerLotCommandes, type CommandeBas, type CompteRendu, type EtatAffichage, type ErreurProtocole, type LotCommandes,
} from './protocole'
import type { VueGrapheAtlas } from '../graphe/vueAtlas'

/** Au plus 4 états par seconde vers les abonnés (relais). */
const INTERVALLE_ETAT_MS = 250
const MEMOIRE_LOTS = 50

const maintenant = () => new Date().toISOString()

export function nouvelId(): string {
  return crypto.randomUUID()
}

export class Pilote {
  readonly adaptateur: AdaptateurAffichage
  private vue: VueGrapheAtlas
  private file: Promise<unknown> = Promise.resolve()
  private deja = new Map<string, CompteRendu>()
  private abonnes = new Set<(e: EtatAffichage) => void>()
  private minuterie = 0
  private dernierEnvoi = 0

  constructor(vue: VueGrapheAtlas, app: InterfaceApp, options: { ecran?: string; utilisateurId?: string } = {}) {
    this.vue = vue
    const ecran = options.ecran ?? `ecran_${nouvelId().slice(0, 8)}`
    this.adaptateur = new AdaptateurAffichage(vue, app, ecran, options.utilisateurId ?? 'local')
    // Actions de l'utilisateur dans le moteur : l'état exporté les reflète, on prévient les abonnés.
    const m = vue.moteur
    for (const evt of ['selection', 'survol', 'mode', 'theme', 'reglage', 'lecture'] as const) m.on(evt, () => this.signaler())
    let versionCamera = -1
    m.on('image', () => {
      if (m.camera.version === versionCamera) return
      versionCamera = m.camera.version
      this.signaler()
    })
  }

  get ecran(): string {
    return this.adaptateur.ecran
  }

  etat(): EtatAffichage {
    return this.adaptateur.exporter()
  }

  /** Construit un lot pour cet écran (console, interface, tests). */
  lot(commandes: CommandeBas[], options: Partial<Omit<LotCommandes, 'commandes' | 'ecran' | 'version'>> = {}): LotCommandes {
    return { version: 1, lot_id: nouvelId(), ecran: this.ecran, origine: 'interface', emis_le: maintenant(), ...options, commandes }
  }

  /** Exécute un lot après ceux déjà reçus ; ne rejette jamais (les erreurs sont dans le compte rendu). */
  executer(lot: unknown): Promise<CompteRendu> {
    const suite = this.file.then(() => this.executerMaintenant(lot))
    this.file = suite.catch(() => undefined)
    return suite
  }

  /** Raccourci pour l'interface : exécute des commandes sur cet écran. */
  commander(...commandes: CommandeBas[]): Promise<CompteRendu> {
    return this.executer(this.lot(commandes))
  }

  /** Abonnement aux états de l'écran (au plus 4 par seconde). Renvoie la fonction de désabonnement. */
  ecouter(f: (e: EtatAffichage) => void): () => void {
    this.abonnes.add(f)
    return () => this.abonnes.delete(f)
  }

  /** Quelque chose a changé à l'écran : un état partira au plus tard dans INTERVALLE_ETAT_MS. */
  signaler(): void {
    if (this.minuterie || !this.abonnes.size) return
    const attente = Math.max(0, INTERVALLE_ETAT_MS - (performance.now() - this.dernierEnvoi))
    this.minuterie = window.setTimeout(() => {
      this.minuterie = 0
      this.dernierEnvoi = performance.now()
      const e = this.etat()
      for (const f of this.abonnes) f(e)
    }, attente)
  }

  private compteRendu(lotId: string, ok: boolean, resultats: CompteRendu['resultats'], erreur?: ErreurProtocole): CompteRendu {
    const cr: CompteRendu = { version: 1, lot_id: lotId, ok, resultats, etat: this.etat(), emis_le: maintenant() }
    if (erreur) cr.erreur = erreur
    return cr
  }

  private async executerMaintenant(brut: unknown): Promise<CompteRendu> {
    const lotId = typeof (brut as LotCommandes)?.lot_id === 'string' ? (brut as LotCommandes).lot_id : '00000000-0000-0000-0000-000000000000'
    const v = validerLotCommandes(brut)
    if (!v.ok) return this.compteRendu(lotId, false, [], v.erreur)
    const lot = v.valeur
    if (lot.ecran !== this.ecran) {
      return this.compteRendu(lot.lot_id, false, [], { code: 'introuvable', message: `Écran inconnu : ${lot.ecran}` })
    }
    const connu = this.deja.get(lot.lot_id)
    if (connu) return connu

    const a = this.adaptateur
    const r = appliquerLot(a.exporter(), lot.commandes, a.index(), lot.atomique ?? true)
    let cr: CompteRendu
    if (!r.ok && (lot.atomique ?? true)) cr = this.compteRendu(lot.lot_id, false, r.resultats)
    else {
      try {
        for (const application of r.applications) {
          if (!application) continue
          await a.synchroniser(application.etat)
          await this.vue.moteur.ajusterDimensions()
          if (application.effet) await a.jouer(application.effet)
        }
        cr = this.compteRendu(lot.lot_id, r.ok, r.resultats)
      } catch (e) {
        // Ne devrait pas arriver : le lot a été validé. L'écran reste utilisable.
        console.error('[pilotage] exécution interrompue', e)
        cr = this.compteRendu(lot.lot_id, false, r.resultats, { code: 'etat_invalide', message: `Exécution interrompue : ${String(e)}` })
      }
    }
    this.deja.set(lot.lot_id, cr)
    if (this.deja.size > MEMOIRE_LOTS) this.deja.delete(this.deja.keys().next().value!)
    this.signaler()
    return cr
  }
}
