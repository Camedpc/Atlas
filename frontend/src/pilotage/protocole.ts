// Protocoles P1, P3 et P4 de la chaîne voix → commandes → affichage : types et validation.
//
// Les JSON Schema de `protocoles/` (racine du dépôt) font foi. Ces types en sont le miroir ; la validation,
// elle, compile directement les schémas : un message est accepté ici si et seulement si le schéma l'accepte.
// Un message invalide est refusé avec une ErreurProtocole, jamais ignoré.

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020'

export const VERSION = 1

// ─── Commun ──────────────────────────────────────────────────────────────────

/** noeuds.id : slug lisible (`lemme_borne`). */
export type IdNoeud = string
export type StatutNoeud = 'etabli' | 'suspendu' | 'a_verifier' | 'invalide' | 'ouvert'
export type Strategie = 'defaut' | 'roles' | 'roles_aux' | 'transitive' | 'chaines' | 'complet'
export type Mode = '2d' | '3d'
export type Theme = 'clair' | 'sombre'
export type NomVue = 'dessus' | 'dessous' | 'face' | 'arriere' | 'droite' | 'gauche' | 'iso'
export type ModeFiltre = 'masquer' | 'estomper'

export interface ErreurProtocole {
  code: 'invalide' | 'introuvable' | 'ambigu' | 'etat_invalide' | 'delai'
  message: string
  details?: unknown
}

export type RefNoeud = { noeud: IdNoeud }
/** Les nœuds créés par cette conversation (noeuds.conversation_id). */
export type RefConversation = { conversation: string }
export type Cible = RefNoeud | RefConversation

export interface Periode { debut: string | null; fin: string | null }

export interface EtatFiltres {
  conversation: string | null
  /** Liste explicite des nœuds à garder (vide : pas de filtre par liste). */
  noeuds: IdNoeud[]
  statuts: StatutNoeud[]
  types: string[]
  periode: Periode
  texte: string
  mode: ModeFiltre
}

/** Surcharges des paramètres du graphe de lecture du moteur, en snake_case. */
export interface ParametresLecture {
  demonstrations?: 'toutes' | 'principale'
  roles_retenus?: ('principale' | 'auxiliaire' | 'technique' | 'contexte')[]
  masquer_contexte?: boolean
  types_toujours_visibles?: string[]
  types_insecables?: string[]
  longueur_min_chaine?: number
  longueur_max_chaine?: number
  meme_sous_probleme?: boolean
}

// ─── P3 : commandes bas niveau ───────────────────────────────────────────────

export type CommandeBas =
  | { op: 'strategie'; id: Strategie }
  | { op: 'parametres_lecture'; patch: ParametresLecture }
  | { op: 'liens_complets'; oui: boolean }
  | { op: 'mode'; mode: Mode }
  | { op: 'vue'; nom: NomVue }
  | { op: 'orbiter'; d_azimut_deg: number; d_elevation_deg: number }
  | { op: 'zoomer'; facteur: number }
  | { op: 'cadrer'; cibles: Cible[] | 'tout' | 'selection' }
  | { op: 'selectionner'; cible: RefNoeud | null }
  | { op: 'portee'; cible: RefNoeud }
  | { op: 'surligner'; cibles: RefNoeud[] }
  | { op: 'filtres'; patch: Partial<EtatFiltres> }
  | { op: 'effacer_filtres' }
  | { op: 'fiche'; cible: RefNoeud | null }
  | { op: 'panneau'; ouvert: boolean }
  | { op: 'theme'; theme: Theme }
  | { op: 'restaurer'; etat: EtatAffichage }
  | { op: 'recharger_donnees' }

export interface LotCommandes {
  version: 1
  lot_id: string
  ecran: string
  origine: 'navigateur' | 'interface' | 'test'
  tache_id?: number
  /** Défaut true : tout ou rien, validation avant exécution. */
  atomique?: boolean
  emis_le?: string
  commandes: CommandeBas[]
}

export interface CompteRendu {
  version: 1
  lot_id: string
  ok: boolean
  resultats: { index: number; ok: boolean; erreur?: ErreurProtocole }[]
  /** Erreur du lot entier (lot invalide, écran introuvable, délai). */
  erreur?: ErreurProtocole
  /** Après exécution, ou inchangé si refus atomique. */
  etat?: EtatAffichage
  emis_le?: string
}

// ─── P4 : état d'affichage ───────────────────────────────────────────────────

export interface Camera {
  mode: Mode
  vue: NomVue | null
  /** Quaternion [x, y, z, w]. */
  orientation: [number, number, number, number]
  cible: [number, number, number]
  distance: number
}

export interface EtatAffichage {
  version: 1
  ecran: string
  utilisateur_id: string
  version_donnees: string
  strategie: Strategie
  parametres_lecture: ParametresLecture
  liens_complets: boolean
  camera: Camera
  selection: RefNoeud | null
  portee: RefNoeud | null
  surlignes: IdNoeud[]
  filtres: EtatFiltres
  fiche: RefNoeud | null
  panneau_ouvert: boolean
  theme: Theme
  /** Au plus 50, en pixels écran. */
  visibles: { noeud: IdNoeud; libelle: string; x: number; y: number }[]
  survol: RefNoeud | null
  conversation_affichee: string | null
}

export type EtatResume = Pick<EtatAffichage, 'ecran' | 'strategie' | 'selection' | 'filtres' | 'conversation_affichee'> & {
  mode: Mode
  /** Au plus 15. */
  visibles: { libelle: string }[]
}

// ─── Validation ──────────────────────────────────────────────────────────────

const SCHEMAS = import.meta.glob('../../../protocoles/*.schema.json', { eager: true, import: 'default' })
const BASE_ID = 'https://atlas.local/protocoles/'

const ajv = new Ajv2020({ schemas: Object.values(SCHEMAS) as object[], allErrors: true, allowUnionTypes: true })

function compiler<T>(ref: string): ValidateFunction<T> {
  const f = ajv.getSchema<T>(BASE_ID + ref)
  if (!f) throw new Error(`Schéma introuvable : ${ref}`)
  return f
}

/** Validateurs par nom de schéma (fichier `protocoles/<nom>.schema.json`). */
export const VALIDATEURS = {
  'p1-tache': compiler<unknown>('p1-tache.schema.json'),
  'p3-lot-commandes': compiler<LotCommandes>('p3-lot-commandes.schema.json'),
  'p3-compte-rendu': compiler<CompteRendu>('p3-compte-rendu.schema.json'),
  'p4-etat-affichage': compiler<EtatAffichage>('p4-etat-affichage.schema.json'),
  'p4-etat-resume': compiler<EtatResume>('p4-etat-affichage.schema.json#/$defs/EtatResume'),
}

export type Validation<T> = { ok: true; valeur: T } | { ok: false; erreur: ErreurProtocole }

function decrire(erreurs: ErrorObject[] | null | undefined): string {
  if (!erreurs?.length) return 'message invalide'
  // Les branches refusées d'un oneOf produisent beaucoup de bruit : on garde les trois premières erreurs.
  return erreurs.slice(0, 3).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim()).join(' ; ')
}

function valider<T>(f: ValidateFunction<T>, message: unknown): Validation<T> {
  if (f(message)) return { ok: true, valeur: message }
  return { ok: false, erreur: { code: 'invalide', message: decrire(f.errors), details: f.errors } }
}

export const validerLotCommandes = (m: unknown) => valider(VALIDATEURS['p3-lot-commandes'], m)
export const validerCompteRendu = (m: unknown) => valider(VALIDATEURS['p3-compte-rendu'], m)
export const validerEtatAffichage = (m: unknown) => valider(VALIDATEURS['p4-etat-affichage'], m)
