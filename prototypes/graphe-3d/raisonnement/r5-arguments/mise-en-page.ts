// R5 · Mise en page de la carte d'arguments.
//
// Les cartes sont des rectangles : la disposition dagre de la vue (nœuds ponctuels) ne leur laisse
// pas la place. On calcule donc notre propre disposition, en « px de mise en page » :
//   - colonne = rang logique (plus long chemin), avec deux règles propres aux cartes d'arguments :
//     une décision se pose AU-DESSUS de la carte qu'elle gouverne (même colonne, lien vertical),
//     et une objection se place dans la colonne de la carte qu'elle attaque, juste à côté ;
//   - couloirs horizontaux par sous-problème (piste abandonnée, SP1, SP2, SP3) : l'organisation
//     se lit d'un coup d'œil ; dans un couloir, les lignes sont choisies par balayages successifs
//     (barycentre des voisins) pour limiter les croisements et redresser les flèches ;
//   - à gauche, le bloc des données (H1…Hn) ; au-dessus, le bandeau des hypothèses de travail.
// Le résultat est converti en `Disposition` (monde : X = colonne, Z = vertical, Y = couche de type)
// et installé dans la vue : sigma reste le moteur de positionnement, de caméra et de navigation.

import { COUCHES, coucheDe, type Disposition, type GrapheLecture } from '../../src/raisonnement'
import type { ModeleArguments } from './arguments'

export interface ParametresMiseEnPage {
  largeurCarte: number
  hauteurCarte: number
  /** Espace libre entre deux colonnes (flèches et garanties). */
  ecartColonnes: number
  /** Espace libre entre deux cartes d'une même colonne. */
  ecartLignes: number
  ecartCouloirs: number
  couloirs: boolean
  decisionsAuDessus: boolean
  ecartCouches: number
}

export interface Couloir {
  id: string
  nom: string
  abandonne: boolean
  /** Bornes verticales (px de mise en page). */
  haut: number
  bas: number
  lignes: number
}

export interface Rect {
  x: number
  y: number
  l: number
  h: number
}

export interface MiseEnPage {
  p: ParametresMiseEnPage
  /** Par carte (unité) : colonne, couloir, centre (px de mise en page). */
  colonne: Int32Array
  couloir: Int32Array
  x: Float32Array
  y: Float32Array
  couloirs: Couloir[]
  nbColonnes: number
  /** Bloc des données (H), bandeau des hypothèses de travail (M), zone des couloirs. */
  blocDonnees: Rect
  bandeau: Rect
  zone: Rect
  /** Conversion px de mise en page → monde. */
  echelle: number
  centre: { x: number; y: number }
  disposition: Disposition
}

const ORDRE_COULOIRS = ['comp', 'stab', 'conv', 'num']
const EN_TETE_COULOIR = 16

export function calculerMiseEnPage(g: GrapheLecture, m: ModeleArguments, p: ParametresMiseEnPage): MiseEnPage {
  const n = g.unites.length
  const noeuds = g.justification.noeuds
  const cartes = m.cartes
  const estDecision = (u: number) => p.decisionsAuDessus && cartes[u]!.genre === 'decision'

  // ─── 1. Colonnes (plus long chemin, arêtes issues d'une décision de longueur 0) ─────────────
  type Contrainte = { s: number; c: number; l: number }
  const contraintes: Contrainte[] = g.aretes.map((a) => ({ s: a.source, c: a.cible, l: estDecision(a.source) ? 0 : 1 }))
  // Objection → même colonne que la carte attaquée (si cela ne crée pas de cycle).
  const atteint = (de: number, vers: number) => {
    const vus = new Uint8Array(n)
    const pile = [de]
    while (pile.length) {
      const u = pile.pop()!
      if (u === vers) return true
      for (const e of g.sortantes[u]!) {
        const v = g.aretes[e]!.cible
        if (!vus[v]) { vus[v] = 1; pile.push(v) }
      }
    }
    return false
  }
  for (const l of m.liens) if (l.genre === 'contredit' && !atteint(l.source, l.cible)) contraintes.push({ s: l.cible, c: l.source, l: 0 })
  const colonne = new Int32Array(n)
  // Relaxation (graphe acyclique, n petit) : Bellman-Ford sur le plus long chemin.
  for (let tour = 0; tour < n + 1; tour++) {
    let change = false
    for (const k of contraintes) if (colonne[k.c]! < colonne[k.s]! + k.l) { colonne[k.c] = colonne[k.s]! + k.l; change = true }
    if (!change) break
  }
  // Sources (hors décisions) ramenées juste avant leur premier successeur : flèches plus courtes.
  const entrantes = (u: number) => contraintes.filter((k) => k.c === u)
  for (let tour = 0; tour < 3; tour++) {
    for (let u = 0; u < n; u++) {
      if (entrantes(u).length || cartes[u]!.genre === 'decision') continue
      const succ = contraintes.filter((k) => k.s === u)
      if (!succ.length) continue
      colonne[u] = Math.max(colonne[u]!, Math.min(...succ.map((k) => colonne[k.c]! - k.l)))
    }
  }
  const nbColonnes = n ? Math.max(...colonne) + 1 : 1

  // ─── 2. Couloirs par sous-problème ───────────────────────────────────────────
  const sp = g.justification.jeu.sousProblemes
  const idCouloir = (u: number): string => {
    const c = cartes[u]!
    // Objection : dans le couloir de la carte attaquée.
    const attaque = m.liens.find((l) => l.genre === 'contredit' && l.source === u)
    if (attaque) return cartes[attaque.cible]!.sousProbleme
    if (c.sousProbleme !== 'cadre') return c.sousProbleme
    const succ = g.sortantes[u]!.map((e) => cartes[g.aretes[e]!.cible]!.sousProbleme).find((s) => s !== 'cadre')
    return succ ?? 'stab'
  }
  const ids = [...new Set(Array.from({ length: n }, (_, u) => (p.couloirs ? idCouloir(u) : 'tout')))]
  ids.sort((a, b) => (ORDRE_COULOIRS.indexOf(a) + 1 || 99) - (ORDRE_COULOIRS.indexOf(b) + 1 || 99))
  const couloir = new Int32Array(n)
  for (let u = 0; u < n; u++) couloir[u] = ids.indexOf(p.couloirs ? idCouloir(u) : 'tout')
  const nbC = ids.length
  // Cartes par (couloir, colonne).
  const cases: number[][][] = ids.map(() => Array.from({ length: nbColonnes }, () => []))
  for (let u = 0; u < n; u++) cases[couloir[u]!]![colonne[u]!]!.push(u)
  const lignes = cases.map((cs) => Math.max(1, ...cs.map((c) => c.length)))

  // ─── 3. Géométrie ───────────────────────────────────────────────────────────
  const PX = p.largeurCarte + p.ecartColonnes, PY = p.hauteurCarte + p.ecartLignes
  const enTete = p.couloirs ? EN_TETE_COULOIR : 0
  const couloirs: Couloir[] = []
  let yc = 0
  ids.forEach((id, k) => {
    const s = sp.find((x) => x.id === id)
    const h = enTete + lignes[k]! * PY - p.ecartLignes
    couloirs.push({ id, nom: s?.nom ?? (id === 'tout' ? '' : id), abandonne: !!s?.abandonne, haut: yc, bas: yc + h, lignes: lignes[k]! })
    yc += h + p.ecartCouloirs
  })
  const yLigne = (k: number, r: number) => couloirs[k]!.haut + enTete + r * PY + p.hauteurCarte / 2
  const rangee = new Int32Array(n)
  const y = new Float32Array(n)
  const x = new Float32Array(n)
  for (let u = 0; u < n; u++) x[u] = colonne[u]! * PX

  // Rangées initiales : ordre des indices, centrées dans le couloir.
  for (let k = 0; k < nbC; k++) for (let c = 0; c < nbColonnes; c++) {
    const liste = cases[k]![c]!
    const d = Math.floor((lignes[k]! - liste.length) / 2)
    liste.forEach((u, i) => { rangee[u] = d + i; y[u] = yLigne(k, d + i) })
  }
  const voisins = (u: number, sens: 'avant' | 'apres' | 'tous') => {
    const r: number[] = []
    if (sens !== 'apres') for (const e of g.entrantes[u]!) r.push(g.aretes[e]!.source)
    if (sens !== 'avant') for (const e of g.sortantes[u]!) r.push(g.aretes[e]!.cible)
    return r
  }
  // Balayages : chaque carte vise la moyenne verticale de ses voisins.
  for (let tour = 0; tour < 8; tour++) {
    const sens = tour % 2 === 0 ? 'avant' : 'apres'
    const ordreCol = [...Array(nbColonnes).keys()]
    if (sens === 'apres') ordreCol.reverse()
    for (const c of ordreCol) for (let k = 0; k < nbC; k++) {
      const liste = cases[k]![c]!
      if (!liste.length) continue
      const vise = new Map<number, number>()
      for (const u of liste) {
        let vs = voisins(u, tour >= 6 ? 'tous' : sens).filter((v) => colonne[v] !== c)
        if (!vs.length) vs = voisins(u, 'tous').filter((v) => colonne[v] !== c)
        vise.set(u, vs.length ? vs.reduce((s, v) => s + y[v]!, 0) / vs.length : y[u]!)
      }
      // Liens verticaux (décision → carte gouvernée, même colonne) : la décision vise juste au-dessus
      // de sa cible ; vers un autre couloir, elle se range au bord du couloir le plus proche.
      const dansCase = new Set(liste)
      const verticaux = g.aretes.filter((e) => dansCase.has(e.source) && colonne[e.cible] === c)
      for (let passe = 0; passe < 3; passe++) for (const e of verticaux) {
        if (dansCase.has(e.cible)) vise.set(e.source, vise.get(e.cible)! - PY * 0.99)
        else vise.set(e.source, couloir[e.cible]! > k ? 1e6 : -1e6)
      }
      // Objection juste sous la carte attaquée.
      const objections = m.liens.filter((l) => l.genre === 'contredit' && dansCase.has(l.source) && dansCase.has(l.cible))
      for (const l of objections) vise.set(l.source, vise.get(l.cible)! + PY * 0.99)
      liste.sort((a, b) => vise.get(a)! - vise.get(b)! || a - b)
      for (const e of verticaux) {
        if (!dansCase.has(e.cible)) continue
        const i = liste.indexOf(e.source)
        liste.splice(i, 1)
        liste.splice(liste.indexOf(e.cible), 0, e.source)
      }
      for (const l of objections) {
        liste.splice(liste.indexOf(l.source), 1)
        liste.splice(liste.indexOf(l.cible) + 1, 0, l.source)
      }
      for (const u of liste) vise.set(u, Math.max(-1e5, Math.min(1e5, vise.get(u)!)))
      // Rangées : au plus près de la cible, ordre conservé, sans sortir du couloir.
      const base = couloirs[k]!.haut + enTete + p.hauteurCarte / 2
      let prec = -1
      liste.forEach((u, i) => {
        const voulu = Math.round((vise.get(u)! - base) / PY)
        const r = Math.max(prec + 1, Math.min(voulu, lignes[k]! - (liste.length - i)))
        rangee[u] = r
        y[u] = yLigne(k, r)
        prec = r
      })
    }
  }

  // ─── 4. Bloc des données, bandeau des hypothèses de travail, bornes ──────────
  const xmin = -p.largeurCarte / 2, xmax = (nbColonnes - 1) * PX + p.largeurCarte / 2
  const hautCouloirs = couloirs[0]?.haut ?? 0, basCouloirs = couloirs[couloirs.length - 1]?.bas ?? 0
  const hDonnees = 44 + m.donnees.length * 24
  const blocDonnees: Rect = { x: -PX + (PX - p.largeurCarte) / 2 - 20, y: hautCouloirs + Math.max(hDonnees / 2, (basCouloirs - hautCouloirs) * 0.28), l: p.largeurCarte, h: hDonnees }
  const bandeau: Rect = { x: (blocDonnees.x - blocDonnees.l / 2 + xmax) / 2, y: hautCouloirs - 58, l: xmax - (blocDonnees.x - blocDonnees.l / 2), h: 60 }
  const zone: Rect = { x: (xmin - 34 + xmax + 14) / 2, y: (hautCouloirs + basCouloirs) / 2, l: xmax - xmin + 48, h: basCouloirs - hautCouloirs }

  // ─── 5. Conversion en Disposition (monde) ────────────────────────────────────
  const echelle = 0.01
  const gauche = blocDonnees.x - blocDonnees.l / 2, droite = xmax
  const haut = bandeau.y - bandeau.h / 2, bas = basCouloirs
  const centre = { x: (gauche + droite) / 2, y: (haut + bas) / 2 }
  const masques = g.masques
  const nP = n + masques.length
  const dx = new Float32Array(nP), dz = new Float32Array(nP), yCouche = new Float32Array(nP)
  const couche = new Int8Array(nP), rang = new Int32Array(nP).fill(-1)
  for (let u = 0; u < n; u++) {
    dx[u] = (x[u]! - centre.x) * echelle
    dz[u] = -(y[u]! - centre.y) * echelle
    rang[u] = colonne[u]!
  }
  // Contexte pur (visible avec les liens complets) : colonnes à gauche du bloc des données.
  const pas = 22, parColonne = Math.max(1, Math.floor((bas - haut) / pas))
  const xContexte = gauche - 160
  masques.forEach((_, k) => {
    const col = Math.floor(k / parColonne), ligne = k % parColonne
    dx[n + k] = (xContexte - col * 150 - centre.x) * echelle
    dz[n + k] = -(haut + ligne * pas - centre.y) * echelle
  })
  const milieu = (COUCHES.length - 1) / 2
  for (let q = 0; q < nP; q++) {
    const i = q < n ? g.unites[q]!.conclusion : masques[q - n]!
    couche[q] = coucheDe(noeuds[i]!.type)
    yCouche[q] = (couche[q]! - milieu) * p.ecartCouches
  }
  const disposition: Disposition = {
    moteur: 'dagre', nU: n, masques, x: dx, z: dz, yCouche, couche, rang,
    xRangs: Array.from({ length: nbColonnes }, (_, c) => (c * PX - centre.x) * echelle),
    xContexte: masques.length ? (xContexte - centre.x) * echelle : NaN,
    bornes: { xmin: (gauche - centre.x) * echelle, xmax: (droite - centre.x) * echelle, zmin: -(bas - centre.y) * echelle, zmax: -(haut - centre.y) * echelle },
  }
  return { p, colonne, couloir, x, y, couloirs, nbColonnes, blocDonnees, bandeau, zone, echelle, centre, disposition }
}

/** Point de mise en page → monde (plan 2D ; Y = profondeur de couche fournie). */
export function versMonde(mp: MiseEnPage, x: number, y: number, profondeur = 0): [number, number, number] {
  return [(x - mp.centre.x) * mp.echelle, profondeur, -(y - mp.centre.y) * mp.echelle]
}
