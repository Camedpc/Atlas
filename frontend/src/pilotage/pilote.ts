// Programme déterministe (P3 → écran) : exécute les LotCommandes dans l'ordre d'arrivée et rend un
// CompteRendu. Aucun appel à un modèle ici. Même suite de lots depuis le même état = même écran.
//
// Étapes d'un lot : validation par le schéma, écran, idempotence (lot_id déjà vu → même compte rendu),
// commandes que cet écran ne sait pas exécuter (refus), application pure de toutes les commandes
// (`appliquerLot`, tout ou rien si atomique), puis mise en état de l'écran commande par commande
// (`synchroniser` + effet), enfin export de l'état réel.
//
// Le pilote ne connaît pas la vue : il parle à un `Ecran` (adaptateur de la vue du graphe).

import { appliquerLot, type Effet, type IndexDonnees } from './etat'
import {
  validerLotCommandes, type CommandeBas, type CompteRendu, type EtatAffichage, type ErreurProtocole, type LotCommandes,
} from './protocole'

/** Au plus 4 états par seconde vers les abonnés (l'appel vocal). */
const INTERVALLE_ETAT_MS = 250
const MEMOIRE_LOTS = 50

const maintenant = () => new Date().toISOString()

export function nouvelId(): string {
  return crypto.randomUUID()
}

/** Ce que le pilote attend de l'adaptateur d'une vue du graphe. */
export interface Ecran {
  readonly ecran: string
  utilisateurId: string
  /** Nœuds connus de l'écran (ids, et nœuds par conversation). */
  index(): IndexDonnees
  /** État réel de l'écran (P4). */
  exporter(): EtatAffichage
  /** Refus d'une commande que cette vue ne sait pas exécuter (vue 2D…), avant toute action ; null sinon. */
  refuser(c: CommandeBas): ErreurProtocole | null
  /** Amène l'écran dans l'état visé (seules les différences sont appliquées). */
  synchroniser(e: EtatAffichage): Promise<void>
  jouer(effet: Effet): Promise<void>
  /** `f` est appelée quand l'écran change de lui-même (geste de l'utilisateur, données relues). */
  surChangement(f: () => void): void
}

export class Pilote {
  readonly adaptateur: Ecran
  private file: Promise<unknown> = Promise.resolve()
  private deja = new Map<string, CompteRendu>()
  private abonnes = new Set<(e: EtatAffichage) => void>()
  private minuterie = 0
  private dernierEnvoi = 0

  constructor(adaptateur: Ecran) {
    this.adaptateur = adaptateur
    adaptateur.surChangement(() => this.signaler())
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
    const atomique = lot.atomique ?? true
    // Commandes que la vue ne sait pas exécuter : refusées avant toute action.
    const refus = lot.commandes.map((c) => a.refuser(c))
    const premierRefus = refus.findIndex((e) => e !== null)
    let cr: CompteRendu
    if (premierRefus >= 0 && atomique) {
      cr = this.compteRendu(lot.lot_id, false, [{ index: premierRefus, ok: false, erreur: refus[premierRefus]! }])
    } else {
      const gardees = lot.commandes.flatMap((c, i) => (refus[i] ? [] : [{ c, i }]))
      const r = appliquerLot(a.exporter(), gardees.map((g) => g.c), a.index(), atomique)
      const resultats: CompteRendu['resultats'] = [
        ...r.resultats.map((x) => ({ ...x, index: gardees[x.index]!.i })),
        ...refus.flatMap((erreur, index) => (erreur ? [{ index, ok: false, erreur }] : [])),
      ].sort((x, y) => x.index - y.index)
      const ok = r.ok && premierRefus < 0
      if (!r.ok && atomique) cr = this.compteRendu(lot.lot_id, false, resultats)
      else {
        try {
          for (const application of r.applications) {
            if (!application) continue
            await a.synchroniser(application.etat)
            if (application.effet) await a.jouer(application.effet)
          }
          cr = this.compteRendu(lot.lot_id, ok, resultats)
        } catch (e) {
          // Ne devrait pas arriver : le lot a été validé. L'écran reste utilisable.
          console.error('[pilotage] exécution interrompue', e)
          cr = this.compteRendu(lot.lot_id, false, resultats, { code: 'etat_invalide', message: `Exécution interrompue : ${String(e)}` })
        }
      }
    }
    this.deja.set(lot.lot_id, cr)
    if (this.deja.size > MEMOIRE_LOTS) this.deja.delete(this.deja.keys().next().value!)
    this.signaler()
    return cr
  }
}
