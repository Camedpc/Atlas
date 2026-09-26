// Réglages typés avec valeurs par défaut, panneau Tweakpane repliable, persistance localStorage
// (toujours protégée par try/catch) et export JSON. Les variantes ajoutent leurs propres réglages
// avec `reglages.ajouter([...])`.

import { Pane, type FolderApi } from 'tweakpane'
import * as EssentialsPlugin from '@tweakpane/plugin-essentials'
import { COURBES, TRAJECTOIRES, type NomCourbe, type NomTrajectoire } from './anim'

export type ValeurReglage = number | boolean | string

export interface DefinitionReglage {
  cle: string
  defaut: ValeurReglage
  libelle?: string
  /** Dossier du panneau (créé à la demande). */
  dossier?: string
  min?: number
  max?: number
  pas?: number
  /** Liste déroulante : libellé → valeur. */
  options?: Record<string, ValeurReglage>
  /** Chaîne interprétée comme couleur (sélecteur). */
  couleur?: boolean
}

export interface ReglagesMoteur {
  theme: 'clair' | 'sombre'
  tailleNoeud: number
  tailleImportance: number
  tailleAgregat: number
  bordure: number
  epaisseurArete: number
  opaciteAretes: number
  epaisseurAgregee: number
  opaciteEstompe: number
  libelles: 'auto' | 'agregats' | 'aucun'
  densiteLibelles: number
  seuilLibelle: number
  tailleLibelle: number
  dureeTransition: number
  courbe: NomCourbe
  trajectoire: NomTrajectoire
  mode3D: 'faces' | 'cube'
  nettete: number
  champVision: number
  dureeVues: number
  sensibiliteOrbite: number
  vitesseZoom: number
  inertie: number
  glisserGauche: 'deplacer' | 'orbiter' | 'rien'
  emulerPave: boolean
  brouillard: boolean
  intensiteBrouillard: number
  taillePerspective: boolean
  descendants: boolean
  // Itération 2
  opaciteContexte: number
  courbeVues: NomCourbe
  placementAgregats: 'mediane' | 'moyenne'
  etendues: 'capsule' | 'tranches' | 'aucune'
  etenduesCouloirs: boolean
  libellesStables: boolean
}

const liste = <T extends string>(valeurs: readonly T[], libelles?: Partial<Record<T, string>>) =>
  Object.fromEntries(valeurs.map((v) => [libelles?.[v] ?? v, v])) as Record<string, ValeurReglage>

export const DEFINITIONS_MOTEUR: DefinitionReglage[] = [
  { cle: 'theme', defaut: 'clair', dossier: 'Apparence', libelle: 'thème', options: { clair: 'clair', sombre: 'sombre' } },
  { cle: 'tailleNoeud', defaut: 3.2, dossier: 'Apparence', libelle: 'taille nœud', min: 1, max: 12, pas: 0.1 },
  { cle: 'tailleImportance', defaut: 1, dossier: 'Apparence', libelle: 'bonus importance', min: 0, max: 4, pas: 0.05 },
  { cle: 'tailleAgregat', defaut: 0.55, dossier: 'Apparence', libelle: 'taille agrégat', min: 0, max: 2, pas: 0.01 },
  { cle: 'bordure', defaut: 0.16, dossier: 'Apparence', libelle: 'bordure', min: 0, max: 0.6, pas: 0.01 },
  { cle: 'epaisseurArete', defaut: 0.7, dossier: 'Apparence', libelle: 'épaisseur arêtes', min: 0.1, max: 4, pas: 0.05 },
  { cle: 'opaciteAretes', defaut: 0.28, dossier: 'Apparence', libelle: 'opacité arêtes', min: 0, max: 1, pas: 0.01 },
  { cle: 'epaisseurAgregee', defaut: 0.9, dossier: 'Apparence', libelle: 'arêtes agrégées', min: 0, max: 4, pas: 0.05 },
  { cle: 'opaciteEstompe', defaut: 0.1, dossier: 'Apparence', libelle: 'opacité estompée', min: 0, max: 1, pas: 0.01 },
  { cle: 'libelles', defaut: 'auto', dossier: 'Libellés', libelle: 'stratégie', options: { automatique: 'auto', 'agrégats seulement': 'agregats', aucun: 'aucun' } },
  { cle: 'densiteLibelles', defaut: 0.5, dossier: 'Libellés', libelle: 'densité', min: 0, max: 3, pas: 0.05 },
  { cle: 'seuilLibelle', defaut: 7, dossier: 'Libellés', libelle: 'taille min.', min: 0, max: 30, pas: 0.5 },
  { cle: 'tailleLibelle', defaut: 12, dossier: 'Libellés', libelle: 'taille police', min: 8, max: 22, pas: 1 },
  { cle: 'dureeTransition', defaut: 650, dossier: 'Transitions', libelle: 'durée (ms)', min: 50, max: 3000, pas: 10 },
  { cle: 'courbe', defaut: 'sortie', dossier: 'Transitions', libelle: 'courbe', options: liste(Object.keys(COURBES) as NomCourbe[]) },
  { cle: 'trajectoire', defaut: 'droite', dossier: 'Transitions', libelle: 'trajectoire', options: liste(Object.keys(TRAJECTOIRES) as NomTrajectoire[]) },
  { cle: 'mode3D', defaut: 'faces', dossier: 'Caméra', libelle: 'placement 3D', options: { 'faces sémantiques': 'faces', 'cube strict': 'cube' } },
  { cle: 'nettete', defaut: 4, dossier: 'Caméra', libelle: 'netteté faces', min: 1, max: 16, pas: 0.5 },
  { cle: 'champVision', defaut: 35, dossier: 'Caméra', libelle: 'champ de vision', min: 10, max: 100, pas: 1 },
  { cle: 'dureeVues', defaut: 480, dossier: 'Caméra', libelle: 'durée vues (ms)', min: 0, max: 2000, pas: 10 },
  { cle: 'sensibiliteOrbite', defaut: 0.006, dossier: 'Caméra', libelle: 'sensibilité orbite', min: 0.001, max: 0.02, pas: 0.0005 },
  { cle: 'vitesseZoom', defaut: 1.2, dossier: 'Caméra', libelle: 'vitesse zoom', min: 1.02, max: 2, pas: 0.01 },
  { cle: 'inertie', defaut: 220, dossier: 'Caméra', libelle: 'inertie (ms)', min: 0, max: 1200, pas: 10 },
  { cle: 'glisserGauche', defaut: 'deplacer', dossier: 'Caméra', libelle: 'glisser gauche', options: { déplacer: 'deplacer', orbiter: 'orbiter', rien: 'rien' } },
  { cle: 'emulerPave', defaut: true, dossier: 'Caméra', libelle: 'chiffres = pavé' },
  { cle: 'brouillard', defaut: true, dossier: 'Profondeur', libelle: 'brouillard' },
  { cle: 'intensiteBrouillard', defaut: 0.55, dossier: 'Profondeur', libelle: 'intensité', min: 0, max: 1, pas: 0.01 },
  { cle: 'taillePerspective', defaut: true, dossier: 'Profondeur', libelle: 'taille ∝ perspective' },
  { cle: 'descendants', defaut: true, dossier: 'Lignée', libelle: 'inclure descendants' },
  { cle: 'opaciteContexte', defaut: 0.3, dossier: 'Lignée', libelle: 'opacité du contexte', min: 0, max: 1, pas: 0.01 },
  { cle: 'courbeVues', defaut: 'sortie', dossier: 'Caméra', libelle: 'courbe des vues', options: liste(Object.keys(COURBES) as NomCourbe[]) },
  { cle: 'placementAgregats', defaut: 'mediane', dossier: 'Agrégats', libelle: 'placement', options: { médiane: 'mediane', moyenne: 'moyenne' } },
  { cle: 'etendues', defaut: 'capsule', dossier: 'Agrégats', libelle: 'étendue (vue temps)', options: { capsule: 'capsule', 'tranches de période': 'tranches', aucune: 'aucune' } },
  { cle: 'etenduesCouloirs', defaut: true, dossier: 'Agrégats', libelle: 'répartition par type' },
  { cle: 'libellesStables', defaut: true, dossier: 'Libellés', libelle: 'stables en mouvement' },
]

export class Reglages<T extends object = ReglagesMoteur> {
  /** Valeurs courantes (moteur + variante). Modifier via `definir` pour notifier. */
  readonly valeurs: T & Record<string, ValeurReglage>
  readonly definitions: DefinitionReglage[] = []
  private ecouteurs = new Set<(cle: string, valeur: ValeurReglage) => void>()
  private stockees: Record<string, ValeurReglage> = {}
  private panneau: Pane | null = null
  private dossiers = new Map<string, FolderApi>()
  private minuterie = 0

  constructor(
    readonly cleStockage: string,
    definitions: DefinitionReglage[] = DEFINITIONS_MOTEUR,
    surcharges: Partial<Record<string, ValeurReglage>> = {},
  ) {
    try {
      const brut = localStorage.getItem(cleStockage)
      if (brut) this.stockees = JSON.parse(brut) as Record<string, ValeurReglage>
    } catch {
      this.stockees = {}
    }
    this.valeurs = {} as T & Record<string, ValeurReglage>
    this.ajouter(definitions, surcharges)
    window.addEventListener('pagehide', () => this.enAttente && this.sauver())
  }

  /** Ajoute des réglages (valeur mémorisée > surcharge > défaut). */
  ajouter(definitions: DefinitionReglage[], surcharges: Partial<Record<string, ValeurReglage>> = {}): void {
    const v = this.valeurs as Record<string, ValeurReglage>
    for (const d of definitions) {
      const i = this.definitions.findIndex((x) => x.cle === d.cle)
      if (i >= 0) this.definitions[i] = d
      else this.definitions.push(d)
      this.initiales[d.cle] = surcharges[d.cle] ?? d.defaut
      const memo = this.stockees[d.cle]
      v[d.cle] = memo !== undefined && typeof memo === typeof d.defaut ? memo : surcharges[d.cle] ?? d.defaut
      if (this.panneau) this.lier(d)
    }
  }

  lire<V extends ValeurReglage>(cle: string): V {
    return (this.valeurs as Record<string, ValeurReglage>)[cle] as V
  }

  definir(cle: string, valeur: ValeurReglage): void {
    ;(this.valeurs as Record<string, ValeurReglage>)[cle] = valeur
    this.panneau?.refresh()
    this.notifier(cle, valeur)
  }

  on(f: (cle: string, valeur: ValeurReglage) => void): () => void {
    this.ecouteurs.add(f)
    return () => this.ecouteurs.delete(f)
  }

  private notifier(cle: string, valeur: ValeurReglage): void {
    for (const f of this.ecouteurs) f(cle, valeur)
    clearTimeout(this.minuterie)
    this.enAttente = true
    this.minuterie = window.setTimeout(() => this.sauver(), 250)
  }

  /**
   * Écrit immédiatement les réglages (sinon différé de 250 ms, et forcé à la fermeture de la page).
   * Seules les valeurs qui diffèrent de la valeur initiale (surcharge ou défaut) sont mémorisées :
   * un changement de défaut dans le moteur s'applique donc aux réglages jamais touchés.
   */
  sauver(): void {
    clearTimeout(this.minuterie)
    this.enAttente = false
    const v = this.valeurs as Record<string, ValeurReglage>
    const memo: Record<string, ValeurReglage> = { ...this.stockees }
    for (const d of this.definitions) {
      if (v[d.cle] === this.initiales[d.cle]) delete memo[d.cle]
      else memo[d.cle] = v[d.cle]!
    }
    this.stockees = memo
    try {
      localStorage.setItem(this.cleStockage, JSON.stringify(memo))
    } catch {
      // Stockage indisponible (navigation privée, quota) : on ignore.
    }
  }
  private enAttente = false
  private initiales: Record<string, ValeurReglage> = {}

  exporterJSON(): string {
    return JSON.stringify(this.valeurs, null, 2)
  }

  reinitialiser(): void {
    for (const d of this.definitions) (this.valeurs as Record<string, ValeurReglage>)[d.cle] = this.initiales[d.cle] ?? d.defaut
    this.stockees = {}
    try {
      localStorage.removeItem(this.cleStockage)
    } catch {
      // ignoré
    }
    this.panneau?.refresh()
    for (const d of this.definitions) for (const f of this.ecouteurs) f(d.cle, (this.valeurs as Record<string, ValeurReglage>)[d.cle]!)
  }

  /** Crée le panneau Tweakpane (replié par défaut). */
  monterPanneau(conteneur: HTMLElement, titre = 'Réglages'): Pane {
    const pane = new Pane({ container: conteneur, title: titre, expanded: false })
    pane.registerPlugin(EssentialsPlugin)
    this.panneau = pane
    for (const d of this.definitions) this.lier(d)
    const outils = pane.addFolder({ title: 'Configuration', expanded: false })
    const copier = outils.addButton({ title: 'Copier la config JSON' })
    copier.on('click', () => {
      const texte = this.exporterJSON()
      const retour = (ok: boolean) => {
        copier.title = ok ? 'Copié ✓' : 'Copie impossible (voir console)'
        if (!ok) console.info('[atlas] configuration :\n' + texte)
        window.setTimeout(() => (copier.title = 'Copier la config JSON'), 1600)
      }
      try {
        navigator.clipboard.writeText(texte).then(() => retour(true), () => retour(false))
      } catch {
        retour(false)
      }
    })
    outils.addButton({ title: 'Réinitialiser' }).on('click', () => this.reinitialiser())
    return pane
  }

  get pane(): Pane | null {
    return this.panneau
  }

  private dossier(nom: string | undefined): FolderApi | Pane {
    const pane = this.panneau!
    if (!nom) return pane
    let f = this.dossiers.get(nom)
    if (!f) {
      f = pane.addFolder({ title: nom, expanded: false })
      this.dossiers.set(nom, f)
    }
    return f
  }

  private lier(d: DefinitionReglage): void {
    const parent = this.dossier(d.dossier)
    const params: Record<string, unknown> = { label: d.libelle ?? d.cle }
    if (d.min !== undefined) params.min = d.min
    if (d.max !== undefined) params.max = d.max
    if (d.pas !== undefined) params.step = d.pas
    if (d.options) params.options = d.options
    if (d.couleur) params.view = 'color'
    const b = parent.addBinding(this.valeurs as Record<string, ValeurReglage>, d.cle, params)
    b.on('change', (ev) => this.notifier(d.cle, ev.value as ValeurReglage))
  }
}
