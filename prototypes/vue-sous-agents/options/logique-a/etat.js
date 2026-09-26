// Modèle de l'éditeur de logique : état sérialisable, natures de nœuds, identifiants, disposition initiale
// et sauvegarde locale. Aucune dépendance au DOM (hors localStorage, toujours sous try/catch).

import { grapheInitial } from '../../commun/raisonnement.js'

const CLE = 'atlas.logique-a.v1'

export const LARGEUR = 264 // largeur d'un nœud, alignée sur le CSS

// Nature d'un nœud = couleur de son en-tête, comme les familles de nœuds d'Unreal.
export const GENRES = {
  assertion: { libelle: 'Assertion', ico: 'ƒ', couleur: '#2f5d8a' },
  fait: { libelle: 'Fait admis', ico: '■', couleur: '#4b5563' },
  hypothese: { libelle: 'Hypothèse', ico: '?', couleur: '#8a6424' },
  conclusion: { libelle: 'Conclusion', ico: '◎', couleur: '#27272a' },
}

// Palette sobre des boîtes de catégorie
export const PALETTE = [
  { couleur: '#2563eb', nom: 'Bleu' },
  { couleur: '#7c3aed', nom: 'Violet' },
  { couleur: '#b45309', nom: 'Ambre' },
  { couleur: '#0f766e', nom: 'Sarcelle' },
  { couleur: '#18181b', nom: 'Graphite' },
  { couleur: '#b91c1c', nom: 'Rouge' },
  { couleur: '#4d7c0f', nom: 'Olive' },
  { couleur: '#64748b', nom: 'Ardoise' },
]

export function genreDe(n) {
  if (n.admis) return 'fait'
  return n.genre in GENRES && n.genre !== 'fait' ? n.genre : 'assertion'
}

// Jeu d'exemple, sans positions : `aDisposer` demande une disposition automatique après mesure des nœuds.
export function exemple() {
  const g = grapheInitial()
  const genres = { h1: 'hypothese', q: 'conclusion' }
  return {
    probleme: g.probleme,
    noeuds: g.noeuds.map((n) => ({ ...n, genre: genres[n.id] ?? 'assertion', x: 0, y: 0 })),
    demonstrations: g.demonstrations.map((d, i) => ({ id: `d${i + 1}`, ...d })),
    commentaires: g.categories.map((c) => ({ id: c.id, titre: c.titre, couleur: c.couleur, x: 0, y: 0, l: 0, h: 0, membres: [...c.noeuds] })),
    aDisposer: true,
  }
}

export function nouvelId(etat, prefixe) {
  const pris = new Set([...etat.noeuds, ...etat.demonstrations, ...etat.commentaires].map((x) => x.id))
  let i = 1
  while (pris.has(`${prefixe}${i}`)) i++
  return `${prefixe}${i}`
}

export function charger() {
  try {
    const brut = localStorage.getItem(CLE)
    if (!brut) return null
    const d = JSON.parse(brut)
    const e = d?.etat
    if (!e || !Array.isArray(e.noeuds) || !Array.isArray(e.demonstrations) || !Array.isArray(e.commentaires)) return null
    return d
  } catch {
    return null
  }
}

export function sauvegarder(donnees) {
  try {
    localStorage.setItem(CLE, JSON.stringify(donnees))
    return true
  } catch {
    return false
  }
}

// ─── Disposition initiale ────────────────────────────────────────────────────────────────────────────
// Deux niveaux, de gauche (faits) à droite (conclusion) : les catégories forment des blocs rangés en
// colonnes selon leurs dépendances ; dans un bloc, les nœuds sont rangés en colonnes selon leurs prémisses
// internes. Une source se place au plus tard (juste avant ce qui l'utilise) pour garder des fils courts.
// `tailles[id].h` vient de la mesure des nœuds rendus.

// Rang = plus long chemin dans `premisses` ; les sources remontent juste avant leur premier utilisateur.
function rangs(ids, premisses) {
  const dependants = new Map(ids.map((id) => [id, new Set()]))
  for (const id of ids) for (const p of premisses.get(id)) dependants.get(p).add(id)
  const rang = {}
  const calcul = (id, pile) => {
    if (id in rang) return rang[id]
    if (pile.has(id)) return 0
    pile.add(id)
    let r = 0
    for (const p of premisses.get(id)) r = Math.max(r, calcul(p, pile) + 1)
    pile.delete(id)
    return (rang[id] = r)
  }
  for (const id of ids) calcul(id, new Set())
  for (const id of ids) {
    if (premisses.get(id).size || !dependants.get(id).size) continue
    rang[id] = Math.max(0, Math.min(...[...dependants.get(id)].map((x) => rang[x])) - 1)
  }
  return { rang, dependants }
}

export function disposer(etat, tailles) {
  const COL = LARGEUR + 96
  const ECART_Y = 26
  const ECART_BLOC = { x: 110, y: 56 }
  const PAD = { haut: 56, cote: 26, bas: 26 }
  const ids = etat.noeuds.map((n) => n.id)
  const noeud = new Map(etat.noeuds.map((n) => [n.id, n]))
  const premisses = new Map(ids.map((id) => [id, new Set()]))
  for (const d of etat.demonstrations) {
    for (const p of d.justifie_par) if (noeud.has(p) && noeud.has(d.noeud_id) && p !== d.noeud_id) premisses.get(d.noeud_id).add(p)
  }

  // Blocs = catégories (un nœud hors catégorie forme un bloc sans boîte)
  const blocDe = new Map()
  for (const c of etat.commentaires) for (const id of c.membres ?? []) if (noeud.has(id) && !blocDe.has(id)) blocDe.set(id, c.id)
  for (const id of ids) if (!blocDe.has(id)) blocDe.set(id, `_${id}`)
  const cles = [...new Set(ids.map((id) => blocDe.get(id)))]
  const premBlocs = new Map(cles.map((k) => [k, new Set()]))
  for (const id of ids) for (const p of premisses.get(id)) if (blocDe.get(p) !== blocDe.get(id)) premBlocs.get(blocDe.get(id)).add(blocDe.get(p))
  const { rang: rangBloc } = rangs(cles, premBlocs)

  // Colonnes internes à chaque bloc
  const blocs = cles.map((cle) => {
    const membres = ids.filter((id) => blocDe.get(id) === cle)
    const internes = new Map(membres.map((id) => [id, new Set([...premisses.get(id)].filter((p) => blocDe.get(p) === cle))]))
    const { rang, dependants } = rangs(membres, internes)
    const max = Math.max(...membres.map((id) => rang[id]))
    // Une hypothèse isolée rejoint la dernière colonne de sa catégorie
    for (const id of membres) if (!internes.get(id).size && !dependants.get(id).size && !noeud.get(id).admis) rang[id] = max
    const cols = []
    for (const id of membres) (cols[rang[id]] ??= []).push(id)
    return { cle, membres, rang, cols: cols.filter(Boolean), boite: !cle.startsWith('_') }
  })

  const colonnes = []
  for (const b of blocs) (colonnes[rangBloc[b.cle]] ??= []).push(b)
  const pos = {}
  const centre = {}
  let x = 0
  for (const colonne of colonnes.filter(Boolean)) {
    const places = []
    for (const b of colonne) {
      // Ordre vertical dans chaque colonne : barycentre des prémisses déjà posées
      const rel = {}
      const haut = {}
      const hCol = (liste) => liste.reduce((s, id) => s + tailles[id].h, 0) + ECART_Y * (liste.length - 1)
      const hBloc = Math.max(...b.cols.map(hCol))
      for (const liste of b.cols) {
        const bary = new Map(liste.map((id) => {
          const ys = [...premisses.get(id)].map((p) => (p in rel ? rel[p] : centre[p])).filter((y) => y !== undefined)
          return [id, ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : Infinity]
        }))
        liste.sort((a, c) => (bary.get(a) === bary.get(c) ? 0 : bary.get(a) - bary.get(c)))
        let y = (hBloc - hCol(liste)) / 2
        for (const id of liste) {
          haut[id] = y
          rel[id] = y + tailles[id].h / 2
          y += tailles[id].h + ECART_Y
        }
      }
      const ph = b.boite ? PAD.haut : 0
      const externes = b.membres.flatMap((id) => [...premisses.get(id)]).filter((p) => p in centre)
      const voulu = externes.length ? externes.reduce((s, p) => s + centre[p], 0) / externes.length - hBloc / 2 - ph : 0
      places.push({ b, haut, hBloc, ph, h: hBloc + ph + (b.boite ? PAD.bas : 0), voulu })
    }
    places.sort((a, c) => a.voulu - c.voulu)
    let bas = -Infinity
    let largeur = 0
    for (const p of places) {
      const Y = Math.max(p.voulu, bas + ECART_BLOC.y)
      bas = Y + p.h
      largeur = Math.max(largeur, p.b.cols.length)
      for (const id of p.b.membres) {
        pos[id] = { x: x + p.b.rang[id] * COL, y: Math.round(Y + p.ph + p.haut[id]) }
        centre[id] = pos[id].y + tailles[id].h / 2
      }
    }
    x += largeur * COL - (COL - LARGEUR) + 2 * PAD.cote + ECART_BLOC.x
  }

  const boites = {}
  for (const c of etat.commentaires) {
    const membres = ids.filter((id) => blocDe.get(id) === c.id)
    if (!membres.length) continue
    const x0 = Math.min(...membres.map((id) => pos[id].x))
    const x1 = Math.max(...membres.map((id) => pos[id].x + LARGEUR))
    const y0 = Math.min(...membres.map((id) => pos[id].y))
    const y1 = Math.max(...membres.map((id) => pos[id].y + tailles[id].h))
    boites[c.id] = { x: x0 - PAD.cote, y: y0 - PAD.haut, l: x1 - x0 + 2 * PAD.cote, h: y1 - y0 + PAD.haut + PAD.bas }
  }
  return { pos, boites }
}
