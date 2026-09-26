// Apparence : palette lue dans les variables CSS, forme et couleur par type, petites aides d'affichage.

import type { Origine, RolePremisse, Statut, TypeRaisonnement } from './donnees'
import type { Forme } from './formes'
import { COUCHES } from './disposition'

export interface PaletteR {
  fond: string
  surface: string
  texte: string
  texteDoux: string
  bord: string
  accent: string
  arete: string
  areteComplete: string
  ancetre: string
  descendant: string
  contredit: string
  statut: Record<Statut, string>
  origine: Record<Origine, string>
  role: Record<RolePremisse, string>
  /** Une couleur par couche de type (voir COUCHES). */
  couches: string[]
  /** Couleurs des sous-problèmes (cycliques). */
  sousProblemes: string[]
  police: string
}

/** Lit la palette dans les variables CSS de l'élément (thème courant). */
export function lirePaletteR(el: HTMLElement): PaletteR {
  const s = getComputedStyle(el)
  const v = (nom: string, defaut: string) => s.getPropertyValue(nom).trim() || defaut
  const couchesDefaut = ['#6d4fc2', '#6b778c', '#d9480f', '#1f6fcf', '#0b8a8a', '#5f8f14', '#16233f']
  return {
    fond: v('--fond', '#fbfbfd'),
    surface: v('--surface', '#ffffff'),
    texte: v('--texte', '#1b2130'),
    texteDoux: v('--texte-doux', '#5d6679'),
    bord: v('--bord', '#e2e5ec'),
    accent: v('--accent', '#3b5bdb'),
    arete: v('--arete', '#7d879b'),
    areteComplete: v('--arete-complete', '#b3bac8'),
    ancetre: v('--ancetre', '#e8590c'),
    descendant: v('--descendant', '#7048e8'),
    contredit: v('--contredit', '#d94862'),
    statut: {
      etabli: v('--statut-etabli', '#2e9e5b'), suspendu: v('--statut-suspendu', '#d69a1f'),
      a_verifier: v('--statut-a-verifier', '#4a7fd4'), invalide: v('--statut-invalide', '#d64545'), ouvert: v('--statut-ouvert', '#8a8f98'),
    },
    origine: { humain: v('--origine-humain', '#1c7ed6'), ia: v('--origine-ia', '#9775fa'), ordinateur: v('--origine-ordinateur', '#5c7c6a') },
    role: {
      principale: v('--role-principale', '#3b5bdb'), auxiliaire: v('--role-auxiliaire', '#7d8fb8'),
      technique: v('--role-technique', '#8a94a6'), contexte: v('--role-contexte', '#b3bac8'),
    },
    couches: COUCHES.map((_, i) => v(`--couche-${i}`, couchesDefaut[i]!)),
    sousProblemes: [0, 1, 2, 3, 4, 5].map((i) => v(`--sp-${i}`, ['#5c677d', '#1f6fcf', '#c2255c', '#0b8a8a', '#a07a1e', '#6d4fc2'][i]!)),
    police: v('--police', 'Inter, system-ui, sans-serif'),
  }
}

/** Forme par défaut d'un type (les étapes fusionnées sont des capsules). */
export const FORME_TYPE: Record<TypeRaisonnement, Forme> = {
  hypothese: 'carre',
  axiome: 'carre',
  definition: 'cercle',
  choix_modelisation: 'hexagone',
  decision: 'losange',
  lemme: 'cercle',
  proposition: 'cercle',
  theoreme: 'cercle',
  assertion: 'cercle',
  experience: 'cercle',
  calcul: 'cercle',
  observation: 'cercle',
  resultat: 'cercle',
  conjecture: 'triangle',
}

/** Facteur de taille par type (les résultats et décisions ressortent). */
export const TAILLE_TYPE: Record<TypeRaisonnement, number> = {
  hypothese: 1, axiome: 0.85, definition: 0.85, choix_modelisation: 1.35, decision: 1.4, lemme: 1, proposition: 1.1,
  theoreme: 1.45, assertion: 0.9, experience: 1, calcul: 0.9, observation: 0.95, resultat: 1.6, conjecture: 1.15,
}

/** Petite icône SVG d'une forme (légende, fiche). */
export function iconeForme(forme: Forme, couleur: string, taille = 14, bordure?: string): string {
  const h = taille / 2, r = taille * 0.4
  const trait = bordure ? ` stroke="${bordure}" stroke-width="1.6"` : ''
  let corps: string
  switch (forme) {
    case 'losange': corps = `<polygon points="${h},${h - r * 1.2} ${h + r * 1.2},${h} ${h},${h + r * 1.2} ${h - r * 1.2},${h}"`; break
    case 'hexagone': {
      const p = [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return `${(h + r * 1.1 * Math.cos(a)).toFixed(1)},${(h + r * 1.1 * Math.sin(a)).toFixed(1)}` })
      corps = `<polygon points="${p.join(' ')}"`
      break
    }
    case 'carre': corps = `<rect x="${h - r * 0.9}" y="${h - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" rx="${r * 0.25}"`; break
    case 'triangle': corps = `<polygon points="${h},${h - r * 1.15} ${h + r * 1.1},${h + r * 0.8} ${h - r * 1.1},${h + r * 0.8}"`; break
    case 'capsule': corps = `<rect x="${h - r * 1.25}" y="${h - r * 0.7}" width="${r * 2.5}" height="${r * 1.4}" rx="${r * 0.7}"`; break
    default: corps = `<circle cx="${h}" cy="${h}" r="${r}"`
  }
  return `<svg width="${taille}" height="${taille}" viewBox="0 0 ${taille} ${taille}" aria-hidden="true">${corps} fill="${couleur}"${trait}/></svg>`
}

/** Coupe un libellé trop long. */
export function couper(texte: string, max: number): string {
  return texte.length <= max ? texte : texte.slice(0, max - 1).trimEnd() + '…'
}
