// Flux de résolution d'exemple, construit par-dessus le jeu de données commun.
// - Le fil d'EXÉCUTION suit la méthode : événement « Problème posé » → Décomposer → Sequence de trois
//   sous-questions → Branch « Si CSH est reproductible » → voie métastable → Conclure.
// - Les assertions et les démonstrations restent celles de raisonnement.js ; les étapes les consomment
//   par des fils de données (entrées d'étape).
// - `disposer` range tout à partir des tailles mesurées dans le DOM (aucune hauteur codée en dur).

import { grapheInitial } from '../../commun/raisonnement.js'

export const COULEURS_COMMENT = ['#64748b', '#2563eb', '#7c3aed', '#b45309', '#0f766e', '#be123c', '#4d7c0f', '#18181b']

export function etatExemple() {
  const g = grapheInitial()
  const assertions = g.noeuds.map((n) => ({ ...n, x: 0, y: 0 }))
  const demonstrations = g.demonstrations.map((d, i) => ({ id: `d${i + 1}`, ...d, x: 0, y: 0 }))
  const etape = (id, genre, titre, extra = {}) => ({
    id, genre, titre, note: '', entrees: [], condition: null, valeur: false, sorties: 3, x: 0, y: 0, ...extra,
  })
  const etapes = [
    etape('e0', 'evenement', 'Problème posé', { note: g.probleme }),
    etape('e1', 'etape', 'Décomposer', { note: 'Q1 : que disent les mesures ? · Q2 : que permet la théorie ? · Q3 : que valent les contre-exemples ?' }),
    etape('e2', 'sequence', 'Trois sous-questions', { sorties: 3 }),
    etape('e3', 'etape', 'Rassembler les faits', { entrees: ['f1', 'f2', 'f3', 'p1'] }),
    etape('e4', 'etape', 'Modéliser', { entrees: ['c3'] }),
    etape('e5', 'etape', 'Écarter les contre-exemples', { entrees: ['r2', 'r6'] }),
    etape('e6', 'branch', 'Si CSH est reproductible'),
    etape('e7', 'etape', 'Réviser la synthèse', { note: 'Reprendre la conclusion avec CSH comme preuve.' }),
    etape('e8', 'etape', 'Explorer la voie métastable', { entrees: ['m3', 'p2'] }),
    etape('e9', 'etape', 'Conclure', { entrees: ['q', 'h1'] }),
  ]
  const liens = [
    { de: 'e0', k: 'x', vers: 'e1' },
    { de: 'e1', k: 'x', vers: 'e2' },
    { de: 'e2', k: 't0', vers: 'e3' },
    { de: 'e2', k: 't1', vers: 'e4' },
    { de: 'e2', k: 't2', vers: 'e5' },
    { de: 'e5', k: 'x', vers: 'e6' },
    { de: 'e6', k: 'vrai', vers: 'e7' },
    { de: 'e6', k: 'faux', vers: 'e8' },
    { de: 'e8', k: 'x', vers: 'e9' },
  ]
  // `membres` ne sert qu'à la mise en page initiale : ensuite, l'appartenance à une boîte est géométrique.
  const commentaires = g.categories.map((c) => ({ id: c.id, titre: c.titre, couleur: c.couleur, x: 0, y: 0, l: 200, h: 100, membres: c.noeuds }))
  return { probleme: g.probleme, assertions, demonstrations, etapes, liens, commentaires }
}

const ECART_COL = 48
const ECART_V = 20
const MARGE = { haut: 46, cote: 24, bas: 24 }
const ECART_FLUX = 110

// Range une catégorie en colonnes : prémisses internes à gauche, puis démonstration, puis conclusion.
function rangerCategorie(etat, c, taille) {
  const membres = new Set(c.membres)
  const demosDe = (id) => etat.demonstrations.filter((d) => d.noeud_id === id)
  const col = new Map()
  const colonne = (id) => {
    if (col.has(id)) return col.get(id)
    col.set(id, 0)
    const ds = demosDe(id)
    let v = 0
    if (ds.length) {
      v = 2
      for (const d of ds) for (const p of d.justifie_par) if (membres.has(p)) v = Math.max(v, colonne(p) + 2)
    }
    col.set(id, v)
    return v
  }
  c.membres.forEach(colonne)
  const nbCol = Math.max(...col.values()) + 1
  const larg = Array(nbCol).fill(0)
  const piles = Array.from({ length: nbCol }, () => [])
  for (const id of c.membres) {
    const k = col.get(id)
    const ds = demosDe(id)
    larg[k] = Math.max(larg[k], taille(id).l)
    for (const d of ds) larg[k - 1] = Math.max(larg[k - 1], taille(d.id).l)
    const hDemos = ds.reduce((s, d) => s + taille(d.id).h, 0) + ECART_V * Math.max(0, ds.length - 1)
    piles[k].push({ id, ds, h: Math.max(taille(id).h, hDemos) })
  }
  const xs = []
  let x = 0
  for (let i = 0; i < nbCol; i++) {
    xs[i] = x
    if (larg[i]) x += larg[i] + ECART_COL
  }
  const hPile = (p) => p.reduce((s, it) => s + it.h, 0) + ECART_V * Math.max(0, p.length - 1)
  const H = Math.max(...piles.map(hPile))
  const rel = new Map()
  piles.forEach((p, k) => {
    let y = (H - hPile(p)) / 2
    for (const it of p) {
      rel.set(it.id, { x: xs[k], y })
      let yd = y
      for (const d of it.ds) {
        rel.set(d.id, { x: xs[k - 1], y: yd })
        yd += taille(d.id).h + ECART_V
      }
      y += it.h + ECART_V
    }
  })
  return { c, rel, l: x - ECART_COL + 2 * MARGE.cote, h: H + MARGE.haut + MARGE.bas }
}

export function disposer(etat, taille) {
  const objets = new Map([...etat.assertions, ...etat.demonstrations, ...etat.etapes].map((o) => [o.id, o]))
  const poser = (id, x, y) => { const o = objets.get(id); o.x = Math.round(x); o.y = Math.round(y) }
  const blocs = Object.fromEntries(etat.commentaires.filter((c) => c.membres).map((c) => [c.id, rangerCategorie(etat, c, taille)]))
  const t = (id) => taille(id)
  const placerBloc = (kid, x, y) => {
    const b = blocs[kid]
    for (const [id, p] of b.rel) poser(id, x + MARGE.cote + p.x, y + MARGE.haut + p.y)
    Object.assign(b.c, { x: Math.round(x), y: Math.round(y), l: Math.round(b.l), h: Math.round(b.h) })
    delete b.c.membres
  }

  // Colonne des étapes alimentées par la Sequence, à droite des trois premières boîtes.
  const SC = Math.max(blocs.k1.l, blocs.k2.l, blocs.k3.l) + ECART_FLUX
  const hPrelude = Math.max(t('e0').h, t('e1').h, t('e2').h)
  const xSeq = SC - 90 - t('e2').l
  poser('e2', xSeq, 0)
  poser('e1', xSeq - 80 - t('e1').l, 0)
  poser('e0', xSeq - 160 - t('e1').l - t('e0').l, 0)

  let y = hPrelude + 90
  const pas = (kid, eid) => Math.max(blocs[kid].h, t(eid).h) + 70
  for (const [kid, eid] of [['k1', 'e3'], ['k2', 'e4'], ['k3', 'e5']]) {
    placerBloc(kid, 0, y)
    poser(eid, SC, y + MARGE.haut)
    if (kid !== 'k3') y += pas(kid, eid)
  }
  const xBranch = SC + t('e5').l + 80
  poser('e6', xBranch, y + MARGE.haut)
  const xReviser = xBranch + t('e6').l + 90
  poser('e7', xReviser, y + MARGE.haut - 40)
  y += Math.max(pas('k3', 'e5'), t('e6').h + MARGE.haut + 70)

  poser('e8', xReviser, y + MARGE.haut)
  placerBloc('k4', xReviser - ECART_FLUX - blocs.k4.l, y)
  y += pas('k4', 'e8')

  const xConclure = xReviser + t('e8').l + ECART_FLUX
  poser('e9', xConclure, y + MARGE.haut)
  placerBloc('k5', xConclure - ECART_FLUX - blocs.k5.l, y)
}
