// Modèle de l'éditeur de logique : état du graphe, natures de nœuds, disposition automatique initiale.
// L'état est un objet JSON simple (sérialisable pour l'historique et le localStorage) :
// { version, probleme, noeuds: [{ id, nom, enonce, admis, nature, x, y }],
//   demonstrations: [{ id, noeud_id, nom_demonstration, justifie_par, demonstration, validite, confiance, auteur }],
//   categories: [{ id, titre, couleur, x, y, l, h }] }

import { grapheInitial } from '../../commun/raisonnement.js'

export const GRILLE = 16
export const LARGEUR = 264 // largeur d'un nœud (unités du monde), alignée sur le CSS
export const CADRE = { haut: 64, bas: 32, cote: 32 } // marge d'une boîte « Comment » autour de son contenu

// Palette sobre des boîtes « Comment » (les cinq premières viennent du jeu d'exemple)
export const PALETTE = ['#2563eb', '#7c3aed', '#b45309', '#0f766e', '#18181b', '#be123c', '#4d7c0f', '#64748b']

// Nature d'un nœud : couleur d'en-tête et icône, comme les familles de nœuds d'un Blueprint
export const NATURES = {
  fait: { libelle: 'Fait admis', couleur: '#475569', ico: '◆', nouveau: 'Nouveau fait' },
  assertion: { libelle: 'Assertion', couleur: '#2f5f98', ico: '⊢', nouveau: 'Nouvelle assertion' },
  hypothese: { libelle: 'Hypothèse', couleur: '#6b5a9c', ico: '?', nouveau: 'Nouvelle hypothèse' },
  conclusion: { libelle: 'Conclusion', couleur: '#8f2d2d', ico: '∎', nouveau: 'Nouvelle conclusion' },
}

export const natureDe = (n) => (n.admis ? 'fait' : n.nature && n.nature !== 'fait' ? n.nature : 'assertion')

export const aimanter = (v) => Math.round(v / GRILLE) * GRILLE

export function nouvelId(prefixe, existants) {
  let i = 1
  while (existants.has(`${prefixe}${i}`)) i++
  return `${prefixe}${i}`
}

export function etatInitial() {
  const g = grapheInitial()
  const natures = { h1: 'hypothese', q: 'conclusion' }
  return {
    version: 1,
    probleme: g.probleme,
    noeuds: g.noeuds.map((n) => ({ ...n, nature: n.admis ? 'fait' : natures[n.id] || 'assertion', x: 0, y: 0 })),
    demonstrations: g.demonstrations.map((d, i) => ({ id: `d${i + 1}`, ...d })),
    categories: g.categories.map((k) => ({ ...k, x: 0, y: 0, l: 0, h: 0 })),
  }
}

export function etatValide(e) {
  return e && e.version === 1 && Array.isArray(e.noeuds) && Array.isArray(e.demonstrations) && Array.isArray(e.categories)
}

// `a` dépend-il (transitivement) de `b` ? Sert à refuser les liaisons qui fermeraient un cycle.
export function dependDe(etat, a, b) {
  const vus = new Set()
  const pile = [a]
  while (pile.length) {
    const x = pile.pop()
    if (x === b) return true
    if (vus.has(x)) continue
    vus.add(x)
    for (const d of etat.demonstrations) if (d.noeud_id === x) pile.push(...d.justifie_par)
  }
  return false
}

// Disposition initiale : chaque catégorie est un bloc ; les blocs sont rangés en colonnes de gauche (faits)
// à droite (conclusion), chacun juste avant le premier bloc qui l'utilise. Dans un bloc, les nœuds sont en
// sous-colonnes par profondeur de démonstration. `hauteurs` : id → hauteur mesurée du nœud.
const ECART_X = 64
const ECART_Y = 24
const ECART_BLOC_X = 128
const ECART_BLOC_Y = 64

export function disposer(etat, hauteurs) {
  const { noeuds, demonstrations, categories } = etat
  const ids = new Set(noeuds.map((n) => n.id))
  const h = (id) => hauteurs.get(id) || 120
  const premisses = new Map(noeuds.map((n) => [n.id, new Set()]))
  for (const d of demonstrations) for (const p of d.justifie_par) if (ids.has(p)) premisses.get(d.noeud_id)?.add(p)

  const catDe = new Map()
  for (const k of categories) for (const id of k.noeuds || []) if (ids.has(id) && !catDe.has(id)) catDe.set(id, k.id)
  const blocs = categories.map((k) => ({ k, ids: noeuds.filter((n) => catDe.get(n.id) === k.id).map((n) => n.id) }))
  const libres = noeuds.filter((n) => !catDe.has(n.id)).map((n) => n.id)
  if (libres.length) blocs.push({ k: null, ids: libres })
  const blocDe = new Map()
  blocs.forEach((b, i) => b.ids.forEach((id) => blocDe.set(id, i)))

  // Profondeur d'un nœud dans son bloc (au plus tôt)
  const prof = new Map()
  const profondeur = (id, pile = new Set()) => {
    if (prof.has(id)) return prof.get(id)
    if (pile.has(id)) return 0
    pile.add(id)
    let p = 0
    for (const q of premisses.get(id)) if (blocDe.get(q) === blocDe.get(id)) p = Math.max(p, profondeur(q, pile) + 1)
    pile.delete(id)
    prof.set(id, p)
    return p
  }

  // Graphe des blocs : colonne au plus tôt, puis au plus tard (juste avant le premier successeur)
  const avant = blocs.map(() => new Set())
  const apres = blocs.map(() => new Set())
  for (const [id, ps] of premisses) {
    for (const q of ps) {
      const a = blocDe.get(q)
      const b = blocDe.get(id)
      if (a !== b) { apres[a].add(b); avant[b].add(a) }
    }
  }
  const tot = new Map()
  const auPlusTot = (i, pile = new Set()) => {
    if (tot.has(i)) return tot.get(i)
    if (pile.has(i)) return 0
    pile.add(i)
    let c = 0
    for (const a of avant[i]) c = Math.max(c, auPlusTot(a, pile) + 1)
    pile.delete(i)
    tot.set(i, c)
    return c
  }
  blocs.forEach((_, i) => auPlusTot(i))
  const max = Math.max(0, ...tot.values())
  const col = new Map()
  const colonne = (i, pile = new Set()) => {
    if (col.has(i)) return col.get(i)
    if (pile.has(i)) return tot.get(i)
    pile.add(i)
    let c
    if (!apres[i].size) c = avant[i].size ? max : tot.get(i)
    else c = Math.min(...[...apres[i]].map((j) => colonne(j, pile))) - 1
    c = Math.max(c, tot.get(i))
    pile.delete(i)
    col.set(i, c)
    return c
  }

  // Disposition interne de chaque bloc
  const rel = new Map()
  for (const b of blocs) {
    const cols = []
    for (const id of b.ids) (cols[profondeur(id)] ||= []).push(id)
    const rangs = cols.filter(Boolean)
    const indice = new Map()
    rangs.forEach((c, ci) => {
      if (ci) {
        const bary = (id) => {
          const v = [...premisses.get(id)].filter((q) => indice.has(q)).map((q) => indice.get(q))
          return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 1e3
        }
        c.sort((a, z) => bary(a) - bary(z))
      }
      c.forEach((id, i) => indice.set(id, i))
    })
    const hauteursCol = rangs.map((c) => c.reduce((s, id) => s + h(id), 0) + ECART_Y * (c.length - 1))
    b.l = rangs.length * LARGEUR + (rangs.length - 1) * ECART_X
    b.h = Math.max(...hauteursCol)
    rangs.forEach((c, ci) => {
      let y = (b.h - hauteursCol[ci]) / 2
      for (const id of c) {
        rel.set(id, { x: ci * (LARGEUR + ECART_X), y })
        y += h(id) + ECART_Y
      }
    })
  }

  // Placement des blocs en colonnes, alignés à droite dans leur colonne
  const colonnes = []
  blocs.forEach((b, i) => (colonnes[colonne(i)] ||= []).push(b))
  const pleines = colonnes.filter(Boolean)
  const dims = pleines.map((c) => ({
    l: Math.max(...c.map((b) => b.l + 2 * CADRE.cote)),
    h: c.reduce((s, b) => s + b.h + CADRE.haut + CADRE.bas, 0) + ECART_BLOC_Y * (c.length - 1),
  }))
  const hMax = Math.max(...dims.map((d) => d.h))
  const parId = new Map(noeuds.map((n) => [n.id, n]))
  let x = 0
  pleines.forEach((c, ci) => {
    let y = (hMax - dims[ci].h) / 2
    for (const b of c) {
      const bl = b.l + 2 * CADRE.cote
      const bh = b.h + CADRE.haut + CADRE.bas
      const bx = x + dims[ci].l - bl
      for (const id of b.ids) {
        const n = parId.get(id)
        n.x = aimanter(bx + CADRE.cote + rel.get(id).x)
        n.y = aimanter(y + CADRE.haut + rel.get(id).y)
      }
      if (b.k) {
        b.k.x = Math.floor(bx / GRILLE) * GRILLE
        b.k.y = Math.floor(y / GRILLE) * GRILLE
        b.k.l = Math.ceil((bl + bx - b.k.x) / GRILLE) * GRILLE
        b.k.h = Math.ceil((bh + y - b.k.y) / GRILLE) * GRILLE
      }
      y += bh + ECART_BLOC_Y
    }
    x += dims[ci].l + ECART_BLOC_X
  })
  for (const k of categories) delete k.noeuds
}
