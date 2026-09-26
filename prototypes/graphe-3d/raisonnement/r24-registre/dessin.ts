// Échelle de temps, mise en page et dessin SVG de la frise (lignes par sous-problème, axe = temps).

import { confianceDe, JOUR, type Jalon, type Ligne, type Registre } from './modele'

const NS = 'http://www.w3.org/2000/svg'
type Attrs = Record<string, string | number | undefined | null | false>
type Enfant = Node | string | null | undefined | false

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...enfants: Enfant[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) e.setAttribute(k, String(v))
  for (const c of enfants) if (c !== null && c !== undefined && c !== false) e.append(c)
  return e
}

export const POLICE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
export const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace'
const F_LIB = `11px ${POLICE}`
const F_LIB_FORT = `600 11px ${POLICE}`
const F_ID = `600 10px ${MONO}`
const F_QUESTION = `italic 11px ${POLICE}`
const F_PETIT = `10px ${POLICE}`

let ctxMesure: CanvasRenderingContext2D | null = null
export function largeurTexte(t: string, font: string): number {
  ctxMesure ??= document.createElement('canvas').getContext('2d')
  if (!ctxMesure) return t.length * 6
  ctxMesure.font = font
  return ctxMesure.measureText(t).width
}

/** Tronque `t` à `max` px (avec « … ») ; null si moins de 3 caractères tiennent. */
export function tronquer(t: string, font: string, max: number): string | null {
  if (max <= 0) return null
  if (largeurTexte(t, font) <= max) return t
  let lo = 0
  let hi = t.length
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1
    if (largeurTexte(`${t.slice(0, m).trimEnd()}…`, font) <= max) lo = m
    else hi = m - 1
  }
  return lo < 3 ? null : `${t.slice(0, lo).trimEnd()}…`
}

// ─── Échelle ─────────────────────────────────────────────────────────────────

export type ModeEchelle = 'activite' | 'calendaire'
export interface Rupture { t0: number; t1: number; x: number }
export interface Echelle {
  mode: ModeEchelle
  x0: number
  x1: number
  /** Écart minimal entre deux jalons d'une même ligne (px). */
  ecart: number
  t2x: (t: number) => number
  x2t: (x: number) => number
  /** Périodes sans aucune activité, repliées (mode « par activité »). */
  ruptures: Rupture[]
}

/** Au-delà de ce délai sans aucun nœud créé, la période est repliée (mode « par activité »). */
export const SEUIL_JOURS = 3
const ECART = 30

/**
 * Mode calendaire : linéaire. Mode par activité : déformation monotone du temps, commune à toutes les
 * lignes, où (1) les périodes sans activité sont réduites à SEUIL_JOURS, (2) deux jalons d'une même
 * ligne sont écartés d'au moins ECART px. Les graduations restent aux vraies dates.
 */
export function creerEchelle(r: Registre, mode: ModeEchelle, x0: number, x1: number): Echelle {
  const W = Math.max(60, x1 - x0)
  let T: number[]
  let U: number[]
  let ecart = ECART
  const ruptures: Rupture[] = []
  const dates = [...new Set(r.dates)].sort((a, b) => a - b)
  if (mode === 'calendaire' || dates.length < 2) {
    T = [r.debut, Math.max(r.fin, r.debut + JOUR)]
    U = [0, W]
  } else {
    const evts = new Map<number, Set<string>>()
    for (const j of r.jalons) {
      if (j.genre === 'choix') continue
      let e = evts.get(j.date)
      if (!e) evts.set(j.date, (e = new Set()))
      e.add(j.ligne)
    }
    const construire = (p: number, ec: number): number[] => {
      const res = [0]
      const dernier = new Map<string, number>()
      for (const l of evts.get(dates[0]!) ?? []) dernier.set(l, 0)
      for (let k = 1; k < dates.length; k++) {
        const dt = (dates[k]! - dates[k - 1]!) / JOUR
        let u = res[k - 1]! + p * Math.min(dt, SEUIL_JOURS)
        const ls = evts.get(dates[k]!)
        if (ls) {
          for (const l of ls) {
            const d = dernier.get(l)
            if (d !== undefined) u = Math.max(u, d + ec)
          }
          for (const l of ls) dernier.set(l, u)
        }
        res.push(u)
      }
      return res
    }
    let joursComp = 0
    for (let k = 1; k < dates.length; k++) joursComp += Math.min((dates[k]! - dates[k - 1]!) / JOUR, SEUIL_JOURS)
    joursComp = Math.max(joursComp, 1e-6)
    // Une part α de la largeur est réservée au temps (px par jour fixe), le reste absorbe les écarts
    // entre jalons ; on cherche le plus grand écart (≤ ECART) qui tient. Si l'écart devient illisible
    // (< ECART_MIN), on réduit α.
    const ECART_MIN = 22
    let choisi: number[] | null = null
    for (const alpha of [0.55, 0.4, 0.25, 0.1, 0]) {
      const p = (alpha * W) / joursComp
      if (construire(p, 0).at(-1)! > W) continue
      let lo = 0
      let hi = ECART
      if (construire(p, hi).at(-1)! <= W) lo = hi
      else {
        for (let it = 0; it < 30; it++) {
          const m = (lo + hi) / 2
          if (construire(p, m).at(-1)! > W) hi = m
          else lo = m
        }
      }
      ecart = lo
      choisi = construire(p, lo)
      if (lo >= ECART_MIN) {
        // Reste de largeur éventuel : rendu au temps.
        const reste = W - choisi.at(-1)!
        if (reste > 1) {
          let a = p
          let b = p + reste / joursComp
          for (let it = 0; it < 30; it++) {
            const m = (a + b) / 2
            if (construire(m, lo).at(-1)! > W) b = m
            else a = m
          }
          choisi = construire(a, lo)
        }
        break
      }
    }
    U = choisi ?? construire(0, (ECART * W) / Math.max(1, construire(0, ECART).at(-1)!))
    T = dates
    for (let k = 1; k < dates.length; k++) {
      if ((dates[k]! - dates[k - 1]!) / JOUR > SEUIL_JOURS) ruptures.push({ t0: dates[k - 1]!, t1: dates[k]!, x: x0 + (U[k - 1]! + U[k]!) / 2 })
    }
  }
  const t2x = (t: number): number => {
    if (t <= T[0]!) return x0 + U[0]!
    if (t >= T.at(-1)!) return x0 + U.at(-1)!
    let lo = 0
    let hi = T.length - 1
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (T[m]! <= t) lo = m
      else hi = m
    }
    const f = (t - T[lo]!) / (T[hi]! - T[lo]! || 1)
    return x0 + U[lo]! + f * (U[hi]! - U[lo]!)
  }
  const x2t = (x: number): number => {
    const u = x - x0
    if (u <= U[0]!) return T[0]!
    if (u >= U.at(-1)!) return T.at(-1)!
    let lo = 0
    let hi = U.length - 1
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (U[m]! <= u) lo = m
      else hi = m
    }
    const du = U[hi]! - U[lo]!
    return du <= 0 ? T[lo]! : T[lo]! + ((u - U[lo]!) / du) * (T[hi]! - T[lo]!)
  }
  return { mode, x0, x1, ecart, t2x, x2t, ruptures }
}

// ─── Mise en page ────────────────────────────────────────────────────────────

export interface MiseLigne { ligne: Ligne; haut: number; y: number; bas: number }
export interface Banniere { x: number; rang: number; texte: string | null }
export interface Mise {
  largeur: number
  hauteur: number
  x0: number
  x1: number
  yAxe: number
  lignes: MiseLigne[]
  yLigne: Map<string, number>
  /** Abscisse affichée de chaque jalon, et abscisse de sa vraie date. */
  x: Map<string, number>
  xVrai: Map<string, number>
  bannieres: Map<string, Banniere>
  echelle: Echelle
}

export const GOUTTIERE = 184
const AU_DESSUS = 40
const EN_DESSOUS = 50
const RANG_BANNIERE = 14

export function mettreEnPage(r: Registre, mode: ModeEchelle, largeur: number): Mise {
  const x0 = GOUTTIERE
  const x1 = largeur - 30
  const echelle = creerEchelle(r, mode, x0, x1)
  const x = new Map<string, number>()
  const xVrai = new Map<string, number>()
  for (const l of r.lignes) {
    const js = l.jalons
    const xs = js.map((j) => echelle.t2x(j.date))
    js.forEach((j, k) => xVrai.set(j.cle, xs[k]!))
    const ec = Math.min(echelle.ecart, ECART) - 0.5
    for (let k = 1; k < xs.length; k++) xs[k] = Math.max(xs[k]!, xs[k - 1]! + ec)
    if (xs.length) xs[xs.length - 1] = Math.min(xs.at(-1)!, x1)
    for (let k = xs.length - 2; k >= 0; k--) xs[k] = Math.min(xs[k]!, xs[k + 1]! - ec)
    js.forEach((j, k) => x.set(j.cle, xs[k]!))
  }
  // Bannières des choix de modélisation : rangées empilées au-dessus de la ligne.
  const bannieres = new Map<string, Banniere>()
  const rangsParLigne = new Map<string, number>()
  for (const l of r.lignes) {
    const fins: number[] = []
    for (const c of l.choix) {
      const bx = echelle.t2x(c.date)
      const wId = largeurTexte(c.ident, F_ID)
      const texte = tronquer(c.titre, F_LIB, Math.max(0, largeur - 8 - (bx + 4 + wId + 5)))
      const w = 4 + wId + 5 + (texte ? largeurTexte(texte, F_LIB) : 0) + 10
      let rang = fins.findIndex((f) => f < bx)
      if (rang < 0) {
        rang = fins.length
        fins.push(0)
      }
      fins[rang] = bx + w
      bannieres.set(c.cle, { x: bx, rang, texte })
    }
    rangsParLigne.set(l.sp.id, fins.length)
  }
  const yAxe = 42
  let y = yAxe + 14
  const lignes: MiseLigne[] = []
  const yLigne = new Map<string, number>()
  for (const l of r.lignes) {
    const rangs = rangsParLigne.get(l.sp.id) ?? 0
    const dessus = AU_DESSUS + (rangs ? rangs * RANG_BANNIERE + 8 : 0)
    const haut = y
    const yl = haut + dessus
    const bas = yl + EN_DESSOUS
    lignes.push({ ligne: l, haut, y: yl, bas })
    yLigne.set(l.sp.id, yl)
    y = bas
  }
  return { largeur, hauteur: y + 16, x0, x1, yAxe, lignes, yLigne, x, xVrai, bannieres, echelle }
}

// ─── Dessin ──────────────────────────────────────────────────────────────────

export interface EtatDessin {
  curseur: number | null
  fenetre: [number, number] | null
  /** Nœuds mis en avant (lignée ou portée) ; null = aucun filtre. */
  actifs: Set<number> | null
  focus: string | null
  selection: string | null
  correspondances: boolean
  mineurs: boolean
}

const fmtCourt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtJour = (t: number) => fmtCourt.format(new Date(t))

function classeStatut(r: Registre, j: Jalon): string {
  const membres = j.membres.map((m) => r.j.noeuds[m]!)
  if (membres.some((n) => n.statut === 'refute')) return 'st-refute'
  if (membres.some((n) => n.statut === 'incertain')) return 'st-incertain'
  return 'st-valide'
}

/** Glyphe centré en (0, 0). */
function glyphe(r: Registre, j: Jalon): SVGGElement {
  const n = r.j.noeuds[j.noeud]!
  const abandon = n.piste === 'abandonnee'
  const cls = `gl ${classeStatut(r, j)}${abandon ? ' gl-abandon' : ''}${n.type === 'conjecture' ? ' gl-ouvert' : ''}`
  const g = s('g', { class: cls })
  switch (j.genre) {
    case 'decision':
      g.append(s('path', { d: 'M0 -6.5 L6.5 0 L0 6.5 L-6.5 0 Z', class: 'f-creux' }))
      break
    case 'resultat':
      g.append(s('circle', { r: 5.5, class: 'f-plein' }))
      break
    case 'enonce':
      g.append(s('circle', { r: 5, class: 'f-creux' }))
      break
    case 'observation':
      g.append(s('ellipse', { rx: 6.5, ry: 4.2, class: 'f-creux' }))
      break
    case 'demarche':
      g.append(s('rect', { x: -4.5, y: -4.5, width: 9, height: 9, class: 'f-creux' }))
      break
    case 'campagne':
      g.append(s('rect', { x: -2.5, y: -6.5, width: 9, height: 9, class: 'f-creux f-arriere' }))
      g.append(s('rect', { x: -4.5, y: -4.5, width: 9, height: 9, class: 'f-creux' }))
      break
    case 'choix':
      break
  }
  if (n.statut === 'refute') g.append(s('line', { x1: -6, y1: 6, x2: 6, y2: -6, class: 'barre-refute' }))
  return g
}

/** Mini-intervalle de confiance sur une échelle 0–1 commune (24 px). */
function intervalle(r: Registre, j: Jalon, y: number): SVGGElement {
  const c = confianceDe(r.j.noeuds[j.noeud]!)
  const L = 24
  const x = (v: number) => -L / 2 + v * L
  return s('g', { class: 'ic', transform: `translate(0 ${y})` },
    s('line', { x1: -L / 2, x2: L / 2, y1: 0, y2: 0, class: 'ic-echelle' }),
    s('line', { x1: x(c.bas), x2: Math.max(x(c.haut), x(c.bas) + 1), y1: 0, y2: 0, class: 'ic-plage' }),
    s('line', { x1: x(c.estimation), x2: x(c.estimation), y1: -2.5, y2: 2.5, class: 'ic-point' }),
  )
}

export function dessinerFrise(r: Registre, m: Mise, e: EtatDessin): SVGSVGElement {
  const { echelle: ech, x0, x1, yAxe } = m
  const svg = s('svg', { width: m.largeur, height: m.hauteur, viewBox: `0 0 ${m.largeur} ${m.hauteur}`, class: 'frise', role: 'img', 'aria-label': 'Frise de la démarche' })
  const actif = (membres: number[]) => !e.actifs || membres.some((i) => e.actifs!.has(i))
  const yDe = (cle: string) => m.yLigne.get(r.parCle.get(cle)?.ligne ?? '') ?? 0

  // 1. Bandes des lignes et gouttière.
  const fond = s('g', { class: 'couche-fond' })
  m.lignes.forEach((ml, k) => {
    if (k > 0) fond.append(s('line', { x1: 0, x2: m.largeur, y1: ml.haut, y2: ml.haut, class: 'separateur' }))
    const l = ml.ligne
    const nbJalons = l.jalons.length + l.choix.length
    const t = s('text', { x: 16, y: ml.y - 4, class: `gout-nom${l.sp.abandonne ? ' gout-abandon' : ''}` }, l.sp.nom)
    fond.append(t)
    const resume = tronquer(l.sp.resume, F_PETIT, GOUTTIERE - 30) ?? ''
    fond.append(s('text', { x: 16, y: ml.y + 10, class: 'gout-resume' }, s('title', {}, l.sp.resume), resume))
    fond.append(s('text', { x: 16, y: ml.y + 23, class: 'gout-compte' }, `${nbJalons} jalons · ${l.mineurs.length} mineurs`))
  })
  svg.append(fond)

  // 2. Fenêtre temporelle.
  if (e.fenetre) {
    const [a, b] = e.fenetre
    const xa = ech.t2x(a)
    const xb = ech.t2x(b)
    svg.append(s('rect', { x: xa, y: yAxe, width: Math.max(1, xb - xa), height: m.hauteur - yAxe - 8, class: 'fenetre' }))
  }

  // 3. Axe du temps : jours, semaines (lundis), ruptures.
  const axe = s('g', { class: 'axe' })
  axe.append(s('line', { x1: x0, x2: x1, y1: yAxe, y2: yAxe, class: 'axe-base' }))
  const jour0 = Math.floor(r.debut / JOUR) * JOUR
  let dernierJour = -Infinity
  let dernierLib = -Infinity
  for (let t = jour0; t <= r.fin + JOUR; t += JOUR) {
    if (t < r.debut - JOUR) continue
    const x = ech.t2x(t)
    const lundi = new Date(t).getUTCDay() === 1
    if (lundi) {
      axe.append(s('line', { x1: x, x2: x, y1: yAxe - 7, y2: yAxe, class: 'axe-semaine' }))
      if (x - dernierLib >= 46) {
        axe.append(s('text', { x, y: yAxe - 11, class: 'axe-lib' }, fmtJour(t)))
        dernierLib = x
      }
      dernierJour = x
    } else if (x - dernierJour >= 5) {
      axe.append(s('line', { x1: x, x2: x, y1: yAxe - 3, y2: yAxe, class: 'axe-jour' }))
      dernierJour = x
    }
  }
  axe.append(s('text', { x: 16, y: yAxe - 11, class: 'axe-titre' }, ech.mode === 'activite' ? 'Temps (par activité)' : 'Temps (calendaire)'))
  for (const ru of ech.ruptures) {
    const jours = Math.round((ru.t1 - ru.t0) / JOUR)
    axe.append(s('path', { d: `M${ru.x - 4} ${yAxe + 4} l3 -8 M${ru.x} ${yAxe + 4} l3 -8`, class: 'rupture' }))
    axe.append(s('text', { x: ru.x, y: yAxe + 14, class: 'rupture-lib' }, s('title', {}, `${jours} jours sans nœud créé (${fmtJour(ru.t0)} → ${fmtJour(ru.t1)}), période repliée`), `${jours} j`))
  }
  svg.append(axe)

  // 4. Contraintes choix → décision (filets verticaux vers la ligne des choix).
  const contraintes = s('g', { class: 'couche-contraintes' })
  for (const [cleD, choix] of r.contraintes) {
    const d = r.parCle.get(cleD)
    if (!d) continue
    const lignesChoix = new Set(choix.map((c) => r.parCle.get(c)?.ligne).filter(Boolean) as string[])
    for (const lc of lignesChoix) {
      if (lc === d.ligne) continue
      const xd = m.x.get(cleD)!
      const yd = yDe(cleD)
      const yc = m.yLigne.get(lc)!
      const ids = choix.filter((c) => r.parCle.get(c)?.ligne === lc).map((c) => r.parCle.get(c)!)
      const tous = [d, ...ids].flatMap((x) => x.membres)
      const g = s('g', { class: `contrainte${actif(tous) ? '' : ' attenue'}`, 'data-cle': cleD })
      g.append(s('line', { x1: xd, x2: xd, y1: yc + 4, y2: yd - 8, class: 'contrainte-filet' }))
      g.append(s('text', { x: xd + 3, y: yc + 13, class: 'contrainte-lib' }, ids.map((c) => c.ident).join(' ')))
      contraintes.append(g)
    }
  }
  svg.append(contraintes)

  // 5. Correspondances entre lignes (prémisse d'une ligne → jalon d'une autre).
  if (e.correspondances) {
    const cor = s('g', { class: 'couche-correspondances' })
    for (const [a, b] of r.correspondances) {
      const ja = r.parCle.get(a)!
      const jb = r.parCle.get(b)!
      const xa = m.x.get(a)!
      const xb = m.x.get(b)!
      const ya = yDe(a)
      const yb = yDe(b)
      const dx = xb - xa
      const dy = yb - ya
      const d = Math.abs(dx) < 36
        ? `M${xa} ${ya} C${xa} ${ya + dy / 2} ${xb} ${ya + dy / 2} ${xb} ${yb}`
        : `M${xa} ${ya} C${xa + dx / 2} ${ya} ${xb - dx / 2} ${yb} ${xb} ${yb}`
      const retour = jb.date < ja.date
      const on = actif([...ja.membres, ...jb.membres]) && (!e.actifs || (ja.membres.some((i) => e.actifs!.has(i)) && jb.membres.some((i) => e.actifs!.has(i))))
      cor.append(s('path', { d, class: `corresp${retour ? ' corresp-retour' : ''}${e.actifs ? (on ? ' en-avant' : ' attenue') : ''}` },
        s('title', {}, `${ja.ident} → ${jb.ident}${retour ? ' · prémisse ajoutée après coup (démonstration révisée)' : ''}`)))
    }
    svg.append(cor)
  }

  // 6. Lignes, barres de campagne, tirets de densité.
  const lignesG = s('g', { class: 'couche-lignes' })
  for (const ml of m.lignes) {
    const l = ml.ligne
    const xa = ech.t2x(l.debut)
    const xb = ech.t2x(l.fin)
    lignesG.append(s('line', { x1: xa, x2: xb, y1: ml.y, y2: ml.y, class: `rail${l.sp.abandonne ? ' rail-abandon' : ''}` }))
    for (const ru of ech.ruptures) {
      if (ru.t0 >= l.debut && ru.t1 <= l.fin) {
        lignesG.append(s('rect', { x: ru.x - 5, y: ml.y - 3, width: 9, height: 6, class: 'rupture-trou' }))
        lignesG.append(s('path', { d: `M${ru.x - 5} ${ml.y + 4} l3 -8 M${ru.x} ${ml.y + 4} l3 -8`, class: 'rupture' }))
      }
    }
    if (l.abandon) {
      const xt = ech.t2x(l.abandon.date)
      const dec = r.jalonDe[l.abandon.decision]
      lignesG.append(s('line', { x1: xt, x2: xt, y1: ml.y - 6, y2: ml.y + 6, class: 'butee' }))
      lignesG.append(s('text', { x: xt + 5, y: ml.y + 3.5, class: 'butee-lib' }, `close par ${dec?.ident ?? r.ident[l.abandon.decision]}`))
    }
    for (const j of l.jalons) {
      if (j.genre !== 'campagne') continue
      const xa2 = ech.t2x(j.debut)
      const xb2 = ech.t2x(j.date)
      lignesG.append(s('rect', { x: xa2, y: ml.y - 2.5, width: Math.max(2, xb2 - xa2), height: 5, class: `campagne-duree${actif(j.membres) ? '' : ' attenue'}` }))
    }
    if (e.mineurs) {
      for (const i of l.mineurs) {
        const x = ech.t2x(r.dates[i]!)
        const on = e.actifs?.has(i)
        lignesG.append(s('line', { x1: x, x2: x, y1: ml.y + 4, y2: ml.y + (on ? 11 : 9), class: `tiret${on ? ' en-avant' : e.actifs ? ' attenue' : ''}` }))
        lignesG.append(s('rect', { x: x - 2, y: ml.y + 2, width: 4, height: 10, class: 'cible-tiret', 'data-noeud': i }))
      }
    }
    // Vraie date des jalons décalés (mode calendaire surtout).
    for (const j of l.jalons) {
      const xv = m.xVrai.get(j.cle)!
      const xd = m.x.get(j.cle)!
      if (Math.abs(xv - xd) < 3) continue
      lignesG.append(s('path', { d: `M${xv} ${ml.y + 3} v6 M${xv} ${ml.y + 6} H${xd}`, class: `vraie-date${actif(j.membres) ? '' : ' attenue'}` }))
    }
  }
  svg.append(lignesG)

  // 7. Arcs sémantiques : contredit (⊣), résout (⊢), abandonne.
  const arcsG = s('g', { class: 'couche-arcs' })
  for (const a of r.arcs) {
    const ja = r.jalonDe[a.de]
    const jb = r.jalonDe[a.vers]
    if (!ja || !jb || ja === jb) continue
    const xa = m.x.get(ja.cle)!
    const xb = m.x.get(jb.cle)!
    const ya = yDe(ja.cle) - 8
    const yb = yDe(jb.cle) - 8
    const cx = (xa + xb) / 2
    const cy = Math.min(ya, yb) - 26 - Math.abs(xa - xb) * 0.06
    const on = actif([a.de, a.vers])
    const g = s('g', { class: `arc arc-${a.genre}${on ? '' : ' attenue'}` })
    g.append(s('path', { d: `M${xa} ${ya} Q${cx} ${cy} ${xb} ${yb}`, class: 'arc-trait' }, s('title', {}, `${ja.ident} ${a.genre} ${jb.ident}${a.note ? ` — ${a.note}` : ''}`)))
    // Barre perpendiculaire : à l'arrivée pour « contredit » / « abandonne », au départ pour « résout ».
    const auDepart = a.genre === 'resout'
    const [px, py, qx, qy] = auDepart ? [xa, ya, cx, cy] : [xb, yb, cx, cy]
    const tx = px - qx
    const ty = py - qy
    const nrm = Math.hypot(tx, ty) || 1
    const ox = (-ty / nrm) * 5
    const oy = (tx / nrm) * 5
    g.append(s('line', { x1: px - ox, y1: py - oy, x2: px + ox, y2: py + oy, class: 'arc-barre' }))
    const mx = 0.25 * xa + 0.5 * cx + 0.25 * xb
    const my = 0.25 * ya + 0.5 * cy + 0.25 * yb
    g.append(s('text', { x: mx, y: my - 4, class: 'arc-lib' }, a.genre === 'contredit' ? 'contredit' : a.genre === 'resout' ? 'résout' : a.genre === 'abandonne' ? 'abandonne' : 'remplace'))
    arcsG.append(g)
  }
  svg.append(arcsG)

  // 8. Jalons : glyphe, libellés, intervalle, options écartées.
  const jalonsG = s('g', { class: 'couche-jalons' })
  for (const ml of m.lignes) {
    const l = ml.ligne
    const js = l.jalons
    const decisions = js.filter((j) => j.genre === 'decision')
    js.forEach((j, k) => {
      const x = m.x.get(j.cle)!
      const suivant = js[k + 1]
      const n = r.j.noeuds[j.noeud]!
      const cls = ['jalon', `genre-${j.genre}`]
      if (!actif(j.membres) && e.focus !== j.cle) cls.push('attenue')
      if (e.focus === j.cle) cls.push('focus')
      if (e.selection === j.cle) cls.push('selection')
      const g = s('g', { class: cls.join(' '), transform: `translate(${x} ${ml.y})`, 'data-cle': j.cle })
      g.append(s('rect', { x: -9, y: -9, width: 18, height: 18, class: 'cible' }))
      if (e.selection === j.cle) g.append(s('rect', { x: -10, y: -10, width: 20, height: 20, class: 'cadre-selection' }))
      g.append(glyphe(r, j))
      // Libellé : identifiant + titre, tronqué à la place disponible jusqu'au jalon suivant.
      const dispo = (suivant ? m.x.get(suivant.cle)! - x : x1 + 26 - x) - 7
      const wId = largeurTexte(j.ident, F_ID)
      const fort = j.genre === 'resultat'
      const titre = dispo > wId + 30 ? tronquer(j.titre, fort ? F_LIB_FORT : F_LIB, dispo - wId - 4) : null
      g.append(s('text', { x: -5, y: -11, class: `lib${fort ? ' lib-fort' : ''}` }, s('tspan', { class: 'lib-id' }, j.ident), titre ? ` ${titre}` : ''))
      if (j.genre === 'decision' && n.decision) {
        const kd = decisions.indexOf(j)
        const dSuiv = decisions[kd + 1]
        const dispoD = (dSuiv ? m.x.get(dSuiv.cle)! - x : x1 + 26 - x) - 10
        const q = tronquer(n.decision.question, F_QUESTION, dispoD)
        if (q && dispoD >= 50) g.append(s('text', { x: -5, y: -25, class: 'question' }, q))
        // Options écartées : embranchements obliques terminés par ✕.
        const rejetees = n.decision.alternatives.filter((a) => !a.retenue)
        const dispoB = (dSuiv ? m.x.get(dSuiv.cle)! - x : x1 + 26 - x) - 36
        rejetees.forEach((a, i) => {
          const yb = 23 + i * 13
          g.append(s('path', { d: `M3 4 L14 ${yb} H20`, class: 'branche' }))
          g.append(s('text', { x: 21, y: yb + 3.5, class: 'branche-croix' }, '✕'))
          const t = dispoB > 24 ? tronquer(a.libelle, F_PETIT, dispoB) : null
          g.append(s('text', { x: 30, y: yb + 3.5, class: 'branche-lib', 'data-option': a.libelle }, s('title', {}, `Écartée : ${a.libelle}${a.raison ? ` — ${a.raison}` : ''}`), t ?? String.fromCharCode(97 + n.decision!.alternatives.indexOf(a))))
        })
      } else if (j.genre !== 'campagne') {
        g.append(intervalle(r, j, 13))
      }
      jalonsG.append(g)
    })
    // Bannières des choix de modélisation.
    for (const c of l.choix) {
      const b = m.bannieres.get(c.cle)!
      const yt = ml.y - AU_DESSUS - 4 - b.rang * RANG_BANNIERE
      const cls = ['banniere']
      if (!actif(c.membres) && e.focus !== c.cle) cls.push('attenue')
      if (e.focus === c.cle || e.selection === c.cle) cls.push('focus')
      const g = s('g', { class: cls.join(' '), 'data-cle': c.cle })
      g.append(s('line', { x1: b.x, x2: b.x, y1: yt + 3, y2: ml.y - 3, class: 'banniere-hampe' }))
      g.append(s('text', { x: b.x + 4, y: yt, class: 'banniere-lib' }, s('tspan', { class: 'lib-id' }, c.ident), b.texte ? ` ${b.texte}` : ''))
      const w = largeurTexte(c.ident, F_ID) + (b.texte ? largeurTexte(` ${b.texte}`, F_LIB) : 0) + 8
      g.append(s('rect', { x: b.x - 3, y: yt - 11, width: w, height: 14, class: 'cible' }))
      jalonsG.append(g)
    }
  }
  svg.append(jalonsG)

  // 9. Rejouer : ce qui est postérieur au curseur est voilé.
  if (e.curseur !== null) {
    const xc = ech.t2x(e.curseur)
    svg.append(s('rect', { x: xc, y: yAxe + 1, width: Math.max(0, m.largeur - xc), height: m.hauteur - yAxe, class: 'voile' }))
    svg.append(s('line', { x1: xc, x2: xc, y1: yAxe - 16, y2: m.hauteur - 6, class: 'curseur' }))
    svg.append(s('text', { x: xc + 4, y: yAxe - 22, class: 'curseur-lib' }, `état au ${fmtJour(e.curseur)}`))
  }

  // 10. Zone de l'axe : clic = rejouer à cette date, glisser = fenêtre temporelle.
  svg.append(s('rect', { x: x0 - 6, y: 0, width: x1 - x0 + 12, height: yAxe + 6, class: 'zone-axe', 'data-zone': 'axe' }, s('title', {}, 'Cliquer : état à cette date · glisser : fenêtre temporelle')))
  return svg
}
