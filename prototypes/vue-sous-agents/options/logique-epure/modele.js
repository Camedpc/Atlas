// Modèle de l'éditeur « Blueprint épuré » : état du graphe, géométrie partagée avec le CSS, disposition
// initiale, historique (annuler / rétablir) et sauvegarde locale.
//
// État :
//   noeuds          [{ id, nom, enonce, admis, x, y }]
//   demonstrations  [{ id, noeud_id, nom_demonstration, justifie_par, demonstration, validite, confiance,
//                      auteur, reroutes: { [premisse]: [{ x, y }] } }]
//   commentaires    [{ id, titre, couleur, x, y, l, h }]  (boîtes « Comment » ; l'appartenance d'un nœud
//                   à une catégorie est spatiale, comme dans Unreal)

import { grapheInitial } from '../../commun/raisonnement.js'

// Géométrie (unités du monde) : doit rester alignée sur le CSS de index.html
export const L = 248 // largeur d'un nœud
export const TETE = 38 // hauteur de l'en-tête
export const PAD = 6 // bordure + marge haute du corps
export const RANG = 22 // hauteur d'une rangée de broches
export const BROCHE = 11 // distance du centre d'une broche au bord du nœud
export const TITRE_COMMENT = 52
export const GRILLE = 8

export const COULEURS = ['#2563eb', '#7c3aed', '#b45309', '#0f766e', '#18181b', '#be123c', '#4d7c0f', '#64748b']
export const NEUTRE = '#d4d4d8'

const CLE = 'atlas.logique-epure.v1'

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
export const fmtConfiance = (c) => (c === null || c === undefined ? '' : c.toFixed(2).replace('.', ','))
export const aligner = (v) => Math.round(v / GRILLE) * GRILLE

export function tousIds(etat) {
  return new Set([...etat.noeuds, ...etat.demonstrations, ...etat.commentaires].map((o) => o.id))
}

export function nouvelId(prefixe, existants) {
  let id
  do id = prefixe + Math.random().toString(36).slice(2, 7)
  while (existants.has(id))
  existants.add(id)
  return id
}

// Jeu d'exemple, positions à calculer par `disposer` une fois les hauteurs des nœuds mesurées.
export function exemple() {
  const g = grapheInitial()
  return {
    etat: {
      probleme: g.probleme,
      noeuds: g.noeuds.map((n) => ({ ...n, x: 0, y: 0 })),
      demonstrations: g.demonstrations.map((d, i) => ({ id: `d${i + 1}`, ...d, reroutes: {} })),
      commentaires: g.categories.map((k) => ({ id: k.id, titre: k.titre, couleur: k.couleur, x: 0, y: 0, l: 320, h: 200 })),
    },
    categories: g.categories,
  }
}

// Disposition de départ : dans chaque catégorie, une colonne par profondeur de démonstration (les
// assertions ouvertes à droite) ; les quatre premières boîtes en grille 2 × 2, les autres à droite.
export function disposer(etat, categories, hauteur) {
  const parId = new Map(etat.noeuds.map((n) => [n.id, n]))
  const premisses = new Map(etat.noeuds.map((n) => [n.id, []]))
  for (const d of etat.demonstrations) premisses.get(d.noeud_id)?.push(...d.justifie_par)
  const prof = new Map()
  const profondeur = (id, pile = new Set()) => {
    if (prof.has(id)) return prof.get(id)
    if (pile.has(id)) return 0
    pile.add(id)
    const ps = (premisses.get(id) ?? []).filter((p) => parId.has(p))
    const p = ps.length ? 1 + Math.max(...ps.map((x) => profondeur(x, pile))) : 0
    pile.delete(id)
    prof.set(id, p)
    return p
  }
  const COL = L + 104
  const LIGNE = 28
  const M = { cote: 36, haut: TITRE_COMMENT + 16, bas: 36 }
  const ENTRE = 128

  const blocs = categories.map((k) => {
    const ids = k.noeuds.filter((id) => parId.has(id))
    const ouvert = (id) => !parId.get(id).admis && !(premisses.get(id) ?? []).length
    const fermes = ids.filter((id) => !ouvert(id))
    const p0 = fermes.length ? Math.min(...fermes.map((id) => profondeur(id))) : 0
    const colonnes = []
    for (const id of fermes) (colonnes[profondeur(id) - p0] ||= []).push(id)
    const cols = colonnes.filter(Boolean)
    const ouverts = ids.filter(ouvert)
    if (ouverts.length) cols.length ? cols[cols.length - 1].push(...ouverts) : cols.push(ouverts)
    const hCol = cols.map((c) => c.reduce((s, id) => s + hauteur(id), 0) + LIGNE * (c.length - 1))
    const hMax = Math.max(...hCol)
    const pos = new Map()
    cols.forEach((c, i) => {
      let y = (hMax - hCol[i]) / 2
      for (const id of c) { pos.set(id, { x: i * COL, y }); y += hauteur(id) + LIGNE }
    })
    return { k, pos, l: cols.length * COL - (COL - L) + 2 * M.cote, h: hMax + M.haut + M.bas }
  })

  const grille = blocs.slice(0, 4)
  const larg0 = Math.max(...grille.filter((_, i) => i % 2 === 0).map((b) => b.l))
  const haut0 = Math.max(...grille.slice(0, 2).map((b) => b.h))
  const origines = grille.map((b, i) => ({
    x: i % 2 === 0 ? larg0 - b.l : larg0 + ENTRE,
    y: i < 2 ? haut0 - b.h : haut0 + ENTRE * 0.6,
  }))
  const droite = Math.max(...grille.map((b, i) => origines[i].x + b.l)) + ENTRE
  const total = Math.max(...grille.map((b, i) => origines[i].y + b.h))
  let yReste = (total - blocs.slice(4).reduce((s, b) => s + b.h + ENTRE * 0.6, -ENTRE * 0.6)) / 2
  for (const b of blocs.slice(4)) { origines.push({ x: droite, y: yReste }); yReste += b.h + ENTRE * 0.6 }

  blocs.forEach((b, i) => {
    const o = origines[i]
    const c = etat.commentaires.find((x) => x.id === b.k.id)
    if (c) Object.assign(c, { x: aligner(o.x), y: aligner(o.y), l: aligner(b.l), h: aligner(b.h) })
    for (const [id, p] of b.pos) {
      const n = parId.get(id)
      n.x = aligner(o.x + M.cote + p.x)
      n.y = aligner(o.y + M.haut + p.y)
    }
  })
}

// Historique par instantanés : chaque validation empile l'état précédent s'il a changé.
export function creerHistorique(etat) {
  let courant = JSON.stringify(etat)
  const avant = []
  const apres = []
  return {
    valider(e) {
      const s = JSON.stringify(e)
      if (s === courant) return false
      avant.push(courant)
      if (avant.length > 200) avant.shift()
      apres.length = 0
      courant = s
      return true
    },
    annuler() {
      if (!avant.length) return null
      apres.push(courant)
      courant = avant.pop()
      return JSON.parse(courant)
    },
    retablir() {
      if (!apres.length) return null
      avant.push(courant)
      courant = apres.pop()
      return JSON.parse(courant)
    },
    get peutAnnuler() { return avant.length > 0 },
    get peutRetablir() { return apres.length > 0 },
  }
}

export function charger() {
  try {
    const brut = localStorage.getItem(CLE)
    if (!brut) return null
    const s = JSON.parse(brut)
    const e = s?.etat
    if (!e || !Array.isArray(e.noeuds) || !Array.isArray(e.demonstrations) || !Array.isArray(e.commentaires)) return null
    return s
  } catch {
    return null
  }
}

export function sauver(etat, vue) {
  try { localStorage.setItem(CLE, JSON.stringify({ etat, vue })) } catch { /* stockage indisponible : on continue sans */ }
}
