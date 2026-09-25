import type { Statut, Validite } from './types'

export const STATUTS: Record<Statut, { label: string; carte: string; pastille: string; trait: string }> = {
  etabli: {
    label: 'Établi',
    carte: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
    pastille: 'bg-emerald-500',
    trait: '#10b981',
  },
  a_verifier: {
    label: 'À vérifier',
    carte: 'border-sky-500 bg-sky-50 dark:bg-sky-950/40',
    pastille: 'bg-sky-500',
    trait: '#0ea5e9',
  },
  suspendu: {
    label: 'Suspendu',
    carte: 'border-amber-500 bg-amber-50 dark:bg-amber-950/40',
    pastille: 'bg-amber-500',
    trait: '#f59e0b',
  },
  invalide: {
    label: 'Invalide',
    carte: 'border-red-500 bg-red-50 dark:bg-red-950/40',
    pastille: 'bg-red-500',
    trait: '#ef4444',
  },
  ouvert: {
    label: 'Ouvert',
    carte: 'border-dashed border-slate-400 bg-white dark:bg-slate-900',
    pastille: 'bg-slate-400',
    trait: '#94a3b8',
  },
}

export const VALIDITES: Record<Validite, { label: string; classe: string }> = {
  valide: { label: 'Valide', classe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100' },
  a_verifier: { label: 'À vérifier', classe: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100' },
  invalide: { label: 'Invalide', classe: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' },
}

/** Couleur d'une démonstration, par rang dans son nœud (arêtes du graphe). */
const COULEURS_DEMOS = ['#6366f1', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#84cc16']
export const couleurDemo = (rang: number) => COULEURS_DEMOS[rang % COULEURS_DEMOS.length]
