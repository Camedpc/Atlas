// Types d'apparence exposés aux réducteurs, palette lue dans les variables CSS, couleurs et libellés.

import type { Categorie, Paire } from './hierarchie'
import type { Noeud, Origine, Statut, Validation } from './donnees'
import type { RoleLignee } from './lignee'

/** Contexte d'une unité passé aux réducteurs de nœud (objet réutilisé : ne pas le conserver). */
export interface InfoUnite {
  unite: number
  estAgregat: boolean
  /** 0 domaine, 1 thème, 2 sous-thème, 3 feuille. */
  niveau: 0 | 1 | 2 | 3
  noeud: Noeud | undefined
  categorie: Categorie | undefined
  domaine: number
  /** Part visible issue de la granularité (0 = rentré dans son parent, 1 = pleinement affiché). */
  alpha: number
  /** Agrégat : 0 fermé → 1 ouvert (enfants sortis). Feuille : 0 dans son sous-thème → 1 à sa place. */
  ouverture: number
  /** Passe les filtres (agrégat : contient au moins une feuille active). */
  actif: boolean
  /** Nombre de feuilles actives (agrégat) ou 1. */
  nbFeuilles: number
  /** Position écran (pixels CSS). */
  x: number
  y: number
  /** Profondeur normalisée : 0 = le plus proche. */
  profondeur: number
  /** Échelle perspective (1 au plan de la cible). */
  echelle: number
  visible: boolean
  survol: 'aucun' | 'survole' | 'voisin' | 'autre'
  lignee: RoleLignee
  /** Importance normalisée (0…1) pour une feuille. */
  importance: number
}

/** Apparence d'un nœud, modifiable par les réducteurs. */
export interface AffichageNoeud {
  /** Couleur CSS opaque (hex, rgb, nom…). */
  couleur: string
  opacite: number
  /** Rayon en pixels. */
  taille: number
  couleurBordure: string
  /** Épaisseur de bordure relative au rayon (0…1). */
  tailleBordure: number
  libelle: string | null
  forceLibelle: boolean
  /** Opacité du libellé (0…1). */
  opaciteLibelle: number
  cache: boolean
  zIndex: number
  surligne: boolean
  /** Programme sigma (défaut : « bordure »). */
  type?: string
  /** Attributs supplémentaires transmis tels quels à sigma (programmes personnalisés). */
  extra?: Record<string, unknown>
}

export interface InfoArete {
  paire: Paire
  source: number
  cible: number
  /** Arête d'origine entre deux feuilles (orientée prémisse → cible). */
  feuille: boolean
  /** Poids affiché (Σ des parts visibles) et nombre d'arêtes sous-jacentes. */
  poids: number
  nombre: number
  /** Opacités finales des deux extrémités. */
  opaciteSource: number
  opaciteCible: number
  survol: 'aucun' | 'incidente' | 'autre'
  /** Vrai si les deux extrémités appartiennent à la lignée active. */
  lignee: boolean
}

export interface AffichageArete {
  couleur: string
  opacite: number
  /** Épaisseur en pixels. */
  taille: number
  cache: boolean
  zIndex: number
  type?: string
  extra?: Record<string, unknown>
}

export interface Palette {
  fond: string
  texte: string
  texteDoux: string
  bordureNoeud: string
  arete: string
  accent: string
  ancetre: string
  descendant: string
  statut: Record<Statut, string>
  validation: Record<Validation, string>
  origine: Record<Origine, string>
  domaines: string[]
  axes: [string, string, string]
  police: string
}

/** Lit la palette dans les variables CSS de l'élément (thème courant). */
export function lirePalette(el: HTMLElement): Palette {
  const s = getComputedStyle(el)
  const v = (nom: string, defaut: string) => s.getPropertyValue(nom).trim() || defaut
  return {
    fond: v('--fond', '#ffffff'),
    texte: v('--texte', '#1d2433'),
    texteDoux: v('--texte-doux', '#687086'),
    bordureNoeud: v('--bordure-noeud', '#ffffff'),
    arete: v('--arete', '#8a94a8'),
    accent: v('--accent', '#3e63dd'),
    ancetre: v('--ancetre', '#d9730d'),
    descendant: v('--descendant', '#7c4dff'),
    statut: { valide: v('--statut-valide', '#2f9e75'), incertain: v('--statut-incertain', '#e0a526'), refute: v('--statut-refute', '#d6455d') },
    validation: {
      aucune: v('--validation-aucune', '#b8bfcc'),
      ia: v('--validation-ia', '#8e7cc3'),
      humain: v('--validation-humain', '#3e7cb1'),
      ia_humain: v('--validation-ia-humain', '#1f4e79'),
    },
    origine: { humain: v('--origine-humain', '#3e7cb1'), ia: v('--origine-ia', '#8e7cc3'), ordinateur: v('--origine-ordinateur', '#5b8a72') },
    domaines: [0, 1, 2, 3, 4, 5].map((i) => v(`--domaine-${i}`, ['#4c6ef5', '#12b886', '#f59f00', '#e64980', '#7950f2', '#15aabf'][i]!)),
    axes: [v('--axe-x', '#e5484d'), v('--axe-y', '#30a46c'), v('--axe-z', '#3e63dd')],
    police: v('--police', 'Inter, system-ui, sans-serif'),
  }
}

// ─── Couleurs ────────────────────────────────────────────────────────────────

const cacheRgb = new Map<string, [number, number, number]>()
let ctxConversion: CanvasRenderingContext2D | null = null

/** Composantes RVB d'une couleur CSS quelconque (mise en cache). */
export function rgb(couleur: string): [number, number, number] {
  let r = cacheRgb.get(couleur)
  if (r) return r
  let hex = couleur.trim()
  if (!/^#[0-9a-f]{3,8}$/i.test(hex)) {
    ctxConversion ??= document.createElement('canvas').getContext('2d')
    if (ctxConversion) {
      ctxConversion.fillStyle = '#000000'
      ctxConversion.fillStyle = hex
      hex = String(ctxConversion.fillStyle)
    }
  }
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(hex)
  if (m) r = [Number(m[1]), Number(m[2]), Number(m[3])]
  else {
    let h = hex.replace('#', '')
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
    r = [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]
  }
  cacheRgb.set(couleur, r)
  return r
}

/**
 * Couleur rgba avec alpha quantifié (1/60). Important : sigma met en cache chaque chaîne de
 * couleur rencontrée, sans limite ; quantifier évite une fuite mémoire quand l'opacité varie
 * continûment.
 */
export function rgba(couleur: string, alpha: number): string {
  const [r, g, b] = rgb(couleur)
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 60) / 60
  return `rgba(${r},${g},${b},${a})`
}

/**
 * Couleur pour sigma (WebGL) : alpha prémultiplié. Sigma mélange avec
 * blendFunc(ONE, ONE_MINUS_SRC_ALPHA) sans prémultiplier : une couleur rgba « normale »
 * translucide apparaît délavée (presque blanche sur fond clair). Toujours passer par ici
 * pour les couleurs de nœuds / arêtes translucides.
 */
export function rgbaGL(couleur: string, alpha: number): string {
  let serie = cacheGL.get(couleur)
  if (!serie) {
    const [r, g, b] = rgb(couleur)
    serie = Array.from({ length: 61 }, (_, i) => {
      const a = i / 60
      return `rgba(${Math.round(r * a)},${Math.round(g * a)},${Math.round(b * a)},${a})`
    })
    cacheGL.set(couleur, serie)
  }
  return serie[Math.round(Math.max(0, Math.min(1, alpha)) * 60)]!
}
const cacheGL = new Map<string, string[]>()

/** Mélange deux couleurs (t = 0 → a, 1 → b), résultat hexadécimal. */
export function melangerCouleurs(a: string, b: string, t: number): string {
  const ca = rgb(a), cb = rgb(b)
  const h = (i: number) => Math.round(ca[i]! + (cb[i]! - ca[i]!) * t).toString(16).padStart(2, '0')
  return `#${h(0)}${h(1)}${h(2)}`
}

// ─── Libellés (dessinés par sigma sur son calque « labels ») ────────────────

interface DonneesLibelle {
  x: number
  y: number
  size: number
  label: string | null
  color: string
  estAgregat?: boolean
  opaciteLibelle?: number
}

export function creerDessinLibelle(palette: () => Palette, tailleBase: () => number) {
  return (ctx: CanvasRenderingContext2D, data: DonneesLibelle): void => {
    if (!data.label) return
    const p = palette()
    const agr = data.estAgregat === true
    const taille = tailleBase() + (agr ? 1 : 0)
    ctx.save()
    ctx.globalAlpha = data.opaciteLibelle ?? 1
    ctx.font = `${agr ? 600 : 450} ${taille}px ${p.police}`
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3.5
    ctx.strokeStyle = p.fond
    ctx.fillStyle = agr ? p.texte : p.texteDoux
    if (agr) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const y = data.y + data.size + 3
      ctx.strokeText(data.label, data.x, y)
      ctx.fillText(data.label, data.x, y)
    } else {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const x = data.x + data.size + 4
      ctx.strokeText(data.label, x, data.y)
      ctx.fillText(data.label, x, data.y)
    }
    ctx.restore()
  }
}

/** Libellé de survol : pastille lisible au-dessus du nœud. */
export function creerDessinSurvol(palette: () => Palette, tailleBase: () => number) {
  return (ctx: CanvasRenderingContext2D, data: DonneesLibelle): void => {
    if (!data.label) return
    const p = palette()
    const taille = tailleBase() + 1
    ctx.save()
    ctx.font = `600 ${taille}px ${p.police}`
    const l = ctx.measureText(data.label).width
    const x = data.x + data.size + 6, y = data.y
    ctx.fillStyle = p.fond
    ctx.strokeStyle = rgba(p.texte, 0.12)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x - 5, y - taille / 2 - 5, l + 10, taille + 10, 6)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = p.texte
    ctx.textBaseline = 'middle'
    ctx.fillText(data.label, x, y + 0.5)
    ctx.restore()
  }
}
