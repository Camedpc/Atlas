// R4 · Disposition des seules unités visibles, en colonnes logiques.
//
//   colonne 0          fondations (groupées : hypothèses, choix de modélisation, décisions)
//   colonnes 1 … C     le raisonnement déplié ; les résultats à droite (colonne C)
//
// Côté « pourquoi » (unités reliées à un résultat), la colonne est C − rang, où rang = plus long
// chemin visible vers un résultat. Côté « comment » (unités révélées depuis une fondation), la
// colonne est 1 + celle du parent visible. Tant qu'il reste des fils repliés, on garde quelques
// colonnes vides entre les fondations et le raisonnement : le vide est suggéré, pas caché.
//
// Verticalement, chaque unité se place sur la ligne de son « ancre » (l'unité qui l'a fait apparaître) :
// la prémisse principale reste sur la même horizontale, les autres s'écartent au-dessus puis au-dessous ;
// chaque colonne est ensuite tassée sans chevauchement (régression isotone, déplacement minimal).
// Les unités masquées sont « rangées » derrière leur fil : à gauche de leur descendant visible,
// d'où elles glissent vers la droite quand on les déplie.

import { coucheDe, COUCHES, type Disposition } from '../../src/raisonnement'
import { GROUPES, type ModeleDepliage } from './modele'

export interface ParametresDisposition {
  ecartColonnes: number
  ecartLignes: number
  ecartFondations: number
  colonnesVides: number
  colonnesMin: number
  ecartCouches: number
}

export interface PlacementR4 {
  disposition: Disposition
  colonne: Int32Array
  /** Nombre de colonnes (la dernière porte les résultats). */
  C: number
  /** Côté de l'étiquette par unité : 'gauche' (fondations), 'droite' (conclusions visibles), 'dessus'. */
  cote: ('gauche' | 'droite' | 'dessus')[]
  /** Premier point de chaque groupe de fondations (en-têtes). */
  enTetes: { groupe: string; point: number; nb: number }[]
  /** Unité ancre (layout), −1 sinon. */
  ancre: Int32Array
}

/** z précédents des fondations : ordre stable d'un dépliage à l'autre. */
const zPrecedent = new Map<string, number>()

export function disposerR4(m: ModeleDepliage, P: ParametresDisposition, masques: number[]): PlacementR4 {
  const g = m.g
  const nU = m.nU
  const n = nU + masques.length
  const vis = m.visible
  const x = new Float32Array(n), z = new Float32Array(n), yCouche = new Float32Array(n)
  const couche = new Int8Array(n), rang = new Int32Array(n).fill(-1)
  const colonne = new Int32Array(nU).fill(-1)
  const ancre = new Int32Array(nU).fill(-1)
  const cote: PlacementR4['cote'] = new Array(nU).fill('dessus')

  // ── Côté droit (relié à un résultat) et rang depuis la droite.
  const resultats = new Set(m.resultats)
  const droite = new Uint8Array(nU)
  const r = new Int32Array(nU)
  const topoInv = [...m.topo].reverse()
  for (const u of topoInv) {
    if (!vis[u] || m.estFondation(u)) continue
    let meilleur = -1
    for (const c of m.suites(u)) if (vis[c] && droite[c]) meilleur = Math.max(meilleur, r[c]!)
    if (meilleur >= 0) { droite[u] = 1; r[u] = meilleur + 1 }
    else if (resultats.has(u)) { droite[u] = 1; r[u] = 0 }
  }
  let rmax = 0
  for (let u = 0; u < nU; u++) if (droite[u]) rmax = Math.max(rmax, r[u]!)

  // ── Côté « comment » : colonnes depuis la gauche.
  const colG = new Int32Array(nU)
  let cmax = 0
  for (const u of m.topo) {
    if (!vis[u] || m.estFondation(u) || droite[u]) continue
    let c = 0
    for (const p of m.premisses(u)) if (vis[p] && (m.estFondation(p) || !droite[p])) c = Math.max(c, (m.estFondation(p) ? 0 : colG[p]!) + 1)
    if (!c) {
      const a = m.revelePar[u]!
      c = a >= 0 && vis[a] ? (m.estFondation(a) ? 0 : colG[a]!) + 1 : 1
    }
    colG[u] = c
    cmax = Math.max(cmax, c)
  }

  // Des fils restent-ils entre les fondations et le raisonnement ?
  let fils = false
  for (let u = 0; u < nU; u++) if (vis[u] && !m.estFondation(u) && m.filPourquoi(u)) { fils = true; break }
  const vides = fils ? P.colonnesVides : 0
  const C = Math.max(P.colonnesMin, rmax + 1 + vides, cmax + 1)
  for (let u = 0; u < nU; u++) {
    if (!vis[u]) continue
    colonne[u] = m.estFondation(u) ? 0 : droite[u] ? C - r[u]! : colG[u]!
  }

  // ── Ancres (pour l'alignement horizontal).
  for (let u = 0; u < nU; u++) {
    if (!vis[u] || m.estFondation(u)) continue
    const a = m.revelePar[u]!
    if (droite[u]) {
      // Ancre = l'unité (à droite) qui l'a fait apparaître, sinon sa première suite visible.
      if (a >= 0 && vis[a] && droite[a] && colonne[a]! > colonne[u]!) ancre[u] = a
      else {
        const s = m.suites(u).filter((c) => vis[c] && droite[c]).sort((p, q) => r[p]! - r[q]!)
        ancre[u] = s[0] ?? -1
      }
    } else {
      if (a >= 0 && vis[a] && colonne[a]! < colonne[u]!) ancre[u] = a
      else ancre[u] = m.premisses(u).find((p) => vis[p] && colonne[p]! < colonne[u]!) ?? -1
    }
  }

  // Décalages entre frères (même ancre) : principale sur la ligne, puis au-dessus, au-dessous…
  const decalage = new Float32Array(nU)
  const freres = new Map<number, number[]>()
  for (let u = 0; u < nU; u++) if (vis[u] && !m.estFondation(u)) {
    const a = ancre[u]!
    if (!freres.has(a)) freres.set(a, [])
    freres.get(a)!.push(u)
  }
  for (const [a, liste] of freres) {
    liste.sort((p, q) => m.poids[q]! - m.poids[p]! || p - q)
    if (a < 0) {
      // Racines : empilées de haut en bas.
      liste.forEach((u, k) => (decalage[u] = -k * 2.2))
    } else liste.forEach((u, k) => (decalage[u] = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2)))
  }

  // ── Placement vertical : côté droit de droite à gauche, puis côté comment de gauche à droite.
  const zu = new Float32Array(nU)
  const place = new Uint8Array(nU)
  const parColonne = new Map<number, number[]>()
  for (let u = 0; u < nU; u++) if (vis[u] && !m.estFondation(u)) {
    const c = colonne[u]!
    if (!parColonne.has(c)) parColonne.set(c, [])
    parColonne.get(c)!.push(u)
  }
  const gap = P.ecartLignes
  // Hauteur relative d'une rangée : une décision porte une ligne de plus (« ✓ retenu »).
  const hauteur = (u: number) => (m.noeud(u).decision ? 1.3 : 1)
  const souhait = (u: number) => {
    const a = ancre[u]!
    return (a >= 0 && place[a] ? zu[a]! : 0) + decalage[u]! * gap
  }
  for (let c = C; c >= 1; c--) {
    const liste = (parColonne.get(c) ?? []).filter((u) => droite[u])
    tasser(liste.map(souhait), liste.map(hauteur), gap).forEach((v, k) => { zu[liste[k]!] = v; place[liste[k]!] = 1 })
  }
  for (let c = 1; c <= C; c++) {
    const liste = (parColonne.get(c) ?? []).filter((u) => !droite[u])
    if (!liste.length) continue
    const occupes = (parColonne.get(c) ?? []).filter((u) => droite[u]).map((u) => zu[u]!)
    const zs = tasser(liste.map(souhait), liste.map(hauteur), gap)
    liste.forEach((u, k) => {
      let v = zs[k]!
      // Évite les unités du côté droit déjà placées dans la même colonne.
      for (let essai = 0; essai < 40 && occupes.some((o) => Math.abs(o - v) < gap * 0.95); essai++) v -= gap
      zu[u] = v
      occupes.push(v)
      place[u] = 1
    })
  }
  // Centrage vertical du raisonnement.
  let zmin = Infinity, zmax = -Infinity
  for (let u = 0; u < nU; u++) if (place[u]) { zmin = Math.min(zmin, zu[u]!); zmax = Math.max(zmax, zu[u]!) }
  const zc = Number.isFinite(zmin) ? (zmin + zmax) / 2 : 0
  for (let u = 0; u < nU; u++) if (place[u]) zu[u] = zu[u]! - zc

  // ── Fondations : groupes empilés ; dans un groupe, ordre = barycentre des suites visibles.
  const enTetes: PlacementR4['enTetes'] = []
  const ordreF: number[] = []
  for (const G of GROUPES) {
    const liste = m.fondations.filter((u) => m.groupe[u] === G.id)
    const cle = (u: number) => {
      const s = m.suites(u).filter((c) => vis[c] && place[c])
      if (s.length) return s.reduce((a, c) => a + zu[c]!, 0) / s.length
      return zPrecedent.get(m.noeud(u).id) ?? -liste.indexOf(u) * 0.01
    }
    const cles = new Map(liste.map((u) => [u, cle(u)]))
    liste.sort((a, b) => cles.get(b)! - cles.get(a)! || a - b)
    if (liste.length) enTetes.push({ groupe: G.nom, point: liste[0]!, nb: liste.length })
    ordreF.push(...liste.map((u) => u), -1)
  }
  ordreF.pop()
  // Pas vertical : une ligne par fondation, une et demie pour une décision (ligne « ✓ retenu »).
  const pasF = P.ecartFondations
  const pasDe = (u: number) => (u < 0 ? pasF * 1.3 : m.noeud(u).decision ? pasF * 1.5 : pasF)
  let hauteurF = 0
  for (let k = 0; k < ordreF.length; k++) hauteurF += k ? (pasDe(ordreF[k - 1]!) + pasDe(ordreF[k]!)) / 2 : 0
  let zf = hauteurF / 2
  for (let k = 0; k < ordreF.length; k++) {
    const u = ordreF[k]!
    if (k) zf -= (pasDe(ordreF[k - 1]!) + pasDe(u)) / 2
    if (u < 0) continue
    zu[u] = zf
    place[u] = 1
  }
  for (const u of m.fondations) zPrecedent.set(m.noeud(u).id, zu[u]!)

  // ── Coordonnées monde.
  const dx = P.ecartColonnes
  const x0 = -(C * dx) / 2
  const xu = new Float32Array(nU)
  for (let u = 0; u < nU; u++) if (vis[u]) xu[u] = x0 + colonne[u]! * dx
  // Côté des étiquettes.
  for (let u = 0; u < nU; u++) {
    if (!vis[u]) continue
    if (m.estFondation(u)) cote[u] = 'gauche'
    else if (!m.suites(u).some((c) => vis[c])) cote[u] = 'droite'
    else cote[u] = 'dessus'
  }
  // Unités masquées : rangées derrière le fil de leur plus proche descendant visible.
  for (let u = 0; u < nU; u++) {
    if (vis[u]) continue
    const d = plusProche(m, u, 'aval')
    if (d >= 0) { xu[u] = xu[d]! - dx * 1.4; zu[u] = zu[d]!; continue }
    const a = plusProche(m, u, 'amont')
    if (a >= 0) { xu[u] = xu[a]!; zu[u] = zu[a]!; continue }
    xu[u] = x0 - dx
    zu[u] = 0
  }
  for (let u = 0; u < nU; u++) {
    x[u] = xu[u]!
    z[u] = zu[u]!
    rang[u] = vis[u] ? colonne[u]! : -1
  }
  for (let k = 0; k < masques.length; k++) {
    x[nU + k] = x0 - dx * 2
    z[nU + k] = 0
  }
  // Couches de type (profondeur en 3D).
  const milieu = (COUCHES.length - 1) / 2
  const noeuds = g.justification.noeuds
  for (let p = 0; p < n; p++) {
    const nd = p < nU ? noeuds[g.unites[p]!.conclusion]! : noeuds[masques[p - nU]!]!
    couche[p] = coucheDe(nd.type)
    yCouche[p] = (couche[p]! - milieu) * P.ecartCouches
  }
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity
  for (let u = 0; u < nU; u++) if (vis[u]) {
    bx0 = Math.min(bx0, x[u]!); bx1 = Math.max(bx1, x[u]!)
    bz0 = Math.min(bz0, z[u]!); bz1 = Math.max(bz1, z[u]!)
  }
  if (!Number.isFinite(bx0)) bx0 = bx1 = bz0 = bz1 = 0
  const disposition: Disposition = {
    moteur: 'dagre', nU, masques, x, z, yCouche, couche, rang,
    xRangs: Array.from({ length: C + 1 }, (_, c) => x0 + c * dx),
    xContexte: NaN,
    bornes: { xmin: bx0, xmax: bx1, zmin: bz0, zmax: bz1 },
  }
  return { disposition, colonne, C, cote, enTetes, ancre }
}

/** Plus proche unité visible dans une direction (BFS), −1 sinon. */
function plusProche(m: ModeleDepliage, u: number, sens: 'amont' | 'aval'): number {
  const vus = new Set([u])
  const file = [u]
  while (file.length) {
    const x = file.shift()!
    for (const y of sens === 'aval' ? m.suites(x) : m.premisses(x)) {
      if (vus.has(y)) continue
      if (m.visible[y]) return y
      vus.add(y)
      file.push(y)
    }
  }
  return -1
}

/**
 * Tasse une colonne : positions (z, vers le haut) aussi proches que possible des souhaits, avec un
 * écart minimal entre voisins (gap × moyenne de leurs hauteurs), en conservant l'ordre des souhaits.
 * Régression isotone (pool adjacent violators) sur z_k + G_k, G_k = écart cumulé.
 */
function tasser(souhaits: number[], hauteurs: number[], gap: number): number[] {
  const n = souhaits.length
  if (!n) return []
  // Ordre de haut en bas (z décroissant), égalités départagées par l'ordre d'arrivée.
  const ordre = [...Array(n).keys()].sort((a, b) => souhaits[b]! - souhaits[a]! || a - b)
  const G: number[] = []
  ordre.forEach((i, k) => G.push(k ? G[k - 1]! + (gap * (hauteurs[ordre[k - 1]!]! + hauteurs[i]!)) / 2 : 0))
  // w_k = z_k + G_k doit être non croissant ⇔ −w non décroissant.
  const cible = ordre.map((i, k) => -(souhaits[i]! + G[k]!))
  const blocs: { somme: number; nb: number }[] = []
  for (const v of cible) {
    blocs.push({ somme: v, nb: 1 })
    while (blocs.length > 1) {
      const a = blocs[blocs.length - 2]!, b = blocs[blocs.length - 1]!
      if (a.somme / a.nb <= b.somme / b.nb) break
      a.somme += b.somme
      a.nb += b.nb
      blocs.pop()
    }
  }
  const res = new Array<number>(n)
  let k = 0
  for (const b of blocs) for (let j = 0; j < b.nb; j++, k++) res[ordre[k]!] = -(b.somme / b.nb) - G[k]!
  return res
}
