// Modèle de l'éditeur de matériau : l'état éditable, les broches typées, les liaisons qu'elles portent,
// et la mise en page initiale (flux de gauche à droite vers le nœud de sortie « Conclusion »).
// Aucune dépendance au DOM : vue.js se charge de l'affichage et des gestes.

import { grapheInitial } from '../../commun/raisonnement.js'

// Types de données des broches : assertion (énoncé), démonstration, réel (confiance sur 1).
export const TYPES_DONNEE = {
  ass: { libelle: 'Assertion' },
  dem: { libelle: 'Démonstration' },
  reel: { libelle: 'Réel' },
}

// Broches par genre de nœud : n = assertion, d = démonstration, s = sortie « Conclusion ».
export const BROCHES = {
  n: {
    entrees: [{ nom: 'demontre', lab: 'Démontrée par', type: 'dem' }],
    sorties: [{ nom: 'enonce', lab: 'Énoncé', type: 'ass' }],
  },
  d: {
    entrees: [{ nom: 'premisses', lab: 'Prémisses', type: 'ass' }],
    sorties: [
      { nom: 'demontre', lab: 'Démontre', type: 'dem' },
      { nom: 'confiance', lab: 'Confiance', type: 'reel' },
    ],
  },
  s: {
    entrees: [
      { nom: 'enonce', lab: 'Énoncé', type: 'ass' },
      { nom: 'confiance', lab: 'Confiance globale', type: 'reel' },
      { nom: 'premisses', lab: 'Prémisses établies', type: 'dem' },
      { nom: 'ouverts', lab: 'Points ouverts', type: 'ass' },
    ],
    sorties: [],
  },
}

// Types de nœuds proposés par la palette et les menus.
export const TYPES = {
  assertion: { libelle: 'Assertion', groupe: 'Assertions', genre: 'n', aide: 'Énoncé à démontrer' },
  fait: { libelle: 'Fait admis', groupe: 'Assertions', genre: 'n', aide: 'Mesure, axiome ou résultat connu' },
  demonstration: { libelle: 'Démonstration', groupe: 'Démonstrations', genre: 'd', validite: 'a_verifier', aide: 'En attente du vérificateur' },
  'demonstration-valide': { libelle: 'Démonstration valide', groupe: 'Démonstrations', genre: 'd', validite: 'valide', aide: 'Déjà notée par le vérificateur' },
  'demonstration-invalide': { libelle: 'Démonstration invalide', groupe: 'Démonstrations', genre: 'd', validite: 'invalide', aide: 'Réfutée, gardée pour mémoire' },
  commentaire: { libelle: 'Commentaire', groupe: 'Organisation', genre: 'c', aide: 'Boîte de catégorie (touche C)' },
}

export const COULEURS = [
  { nom: 'Bleu', valeur: '#2563eb' },
  { nom: 'Violet', valeur: '#7c3aed' },
  { nom: 'Ambre', valeur: '#b45309' },
  { nom: 'Sarcelle', valeur: '#0f766e' },
  { nom: 'Graphite', valeur: '#18181b' },
  { nom: 'Gris', valeur: '#71717a' },
  { nom: 'Grenat', valeur: '#be123c' },
  { nom: 'Olive', valeur: '#4d7c0f' },
]

export const LARGEUR = { n: 204, d: 188, s: 272 }

const COL = 262
const RANG = 158
const ECART = 100

// ─── Accès ─────────────────────────────────────────────────────────────────────────────────────────

export function objet(etat, cle) {
  const g = cle[0]
  const id = cle.slice(2)
  if (g === 'n') return etat.noeuds.find((n) => n.id === id)
  if (g === 'd') return etat.demonstrations.find((d) => d.id === id)
  if (g === 'c') return etat.commentaires.find((c) => c.id === id)
  if (g === 's') return etat.sortie
  return null
}

export const cleDeBroche = (pin) => pin.slice(0, pin.lastIndexOf('|'))

export function infoBroche(pin) {
  const i = pin.lastIndexOf('|')
  const cle = pin.slice(0, i)
  const nom = pin.slice(i + 1)
  const genre = cle[0]
  const def = BROCHES[genre]
  if (!def) return null
  const e = def.entrees.find((b) => b.nom === nom)
  if (e) return { pin, cle, nom, genre, id: cle.slice(2), cote: 'entree', type: e.type }
  const s = def.sorties.find((b) => b.nom === nom)
  return s ? { pin, cle, nom, genre, id: cle.slice(2), cote: 'sortie', type: s.type } : null
}

export const compatibles = (a, b) => Boolean(a && b && a.cote !== b.cote && a.type === b.type && a.cle !== b.cle)

// ─── Liaisons ──────────────────────────────────────────────────────────────────────────────────────

// Toutes les liaisons dessinées, déduites de l'état (source de vérité : justifie_par, noeud_id, sortie).
export function liaisons(etat) {
  const L = []
  const existe = new Set(etat.noeuds.map((n) => n.id))
  const demos = new Set(etat.demonstrations.map((d) => d.id))
  for (const d of etat.demonstrations) {
    for (const p of d.justifie_par) {
      if (existe.has(p)) L.push({ de: `n:${p}|enonce`, vers: `d:${d.id}|premisses`, type: 'ass', genre: 'premisse', d: d.id, n: p })
    }
    if (d.noeud_id && existe.has(d.noeud_id)) {
      L.push({ de: `d:${d.id}|demontre`, vers: `n:${d.noeud_id}|demontre`, type: 'dem', genre: 'demontre', d: d.id })
    }
  }
  const s = etat.sortie
  if (s.enonce && existe.has(s.enonce)) L.push({ de: `n:${s.enonce}|enonce`, vers: 's:sortie|enonce', type: 'ass', genre: 's', champ: 'enonce' })
  if (s.confiance && demos.has(s.confiance)) L.push({ de: `d:${s.confiance}|confiance`, vers: 's:sortie|confiance', type: 'reel', genre: 's', champ: 'confiance' })
  if (s.premisses && demos.has(s.premisses)) L.push({ de: `d:${s.premisses}|demontre`, vers: 's:sortie|premisses', type: 'dem', genre: 's', champ: 'premisses' })
  for (const o of s.ouverts) if (existe.has(o)) L.push({ de: `n:${o}|enonce`, vers: 's:sortie|ouverts', type: 'ass', genre: 's-ouvert', n: o })
  return L
}

// Relie deux broches (dans n'importe quel ordre). Ne modifie l'état que si la liaison est nouvelle et permise.
export function lier(etat, pa, pb) {
  let a = infoBroche(pa)
  let b = infoBroche(pb)
  if (!compatibles(a, b)) return false
  if (a.cote === 'entree') [a, b] = [b, a]
  if (b.genre === 'd') {
    const d = objet(etat, b.cle)
    if (!d || d.justifie_par.includes(a.id)) return false
    d.justifie_par.push(a.id)
    return true
  }
  if (b.genre === 'n') {
    const d = objet(etat, a.cle)
    if (!d || d.noeud_id === b.id) return false
    d.noeud_id = b.id
    return true
  }
  if (b.genre === 's') {
    const s = etat.sortie
    if (b.nom === 'ouverts') {
      if (s.ouverts.includes(a.id)) return false
      s.ouverts.push(a.id)
      return true
    }
    if (s[b.nom] === a.id) return false
    s[b.nom] = a.id
    return true
  }
  return false
}

export function delier(etat, l) {
  if (l.genre === 'premisse') {
    const d = objet(etat, 'd:' + l.d)
    if (d) d.justifie_par = d.justifie_par.filter((p) => p !== l.n)
  } else if (l.genre === 'demontre') {
    const d = objet(etat, 'd:' + l.d)
    if (d) d.noeud_id = null
  } else if (l.genre === 's') {
    etat.sortie[l.champ] = null
  } else if (l.genre === 's-ouvert') {
    etat.sortie.ouverts = etat.sortie.ouverts.filter((o) => o !== l.n)
  }
}

// ─── Création, suppression, duplication ────────────────────────────────────────────────────────────

function nouvelId(etat, prefixe) {
  const pris = new Set([...etat.noeuds, ...etat.demonstrations, ...etat.commentaires].map((o) => o.id))
  let id
  do id = prefixe + etat.suivant++
  while (pris.has(id))
  return id
}

export function creer(etat, type, x, y) {
  const t = TYPES[type]
  x = Math.round(x)
  y = Math.round(y)
  if (t.genre === 'n') {
    const id = nouvelId(etat, 'a')
    etat.noeuds.push({ id, nom: type === 'fait' ? 'Nouveau fait' : 'Nouvelle assertion', enonce: '', admis: type === 'fait', x, y, apercu: true })
    return 'n:' + id
  }
  if (t.genre === 'd') {
    const id = nouvelId(etat, 'd')
    etat.demonstrations.push({
      id, noeud_id: null, nom_demonstration: 'nouvelle_demonstration', justifie_par: [], demonstration: '',
      validite: t.validite, confiance: t.validite === 'a_verifier' ? null : 0.5, auteur: 'camille', x, y, apercu: true,
    })
    return 'd:' + id
  }
  const id = nouvelId(etat, 'k')
  etat.commentaires.push({ id, titre: 'Nouveau commentaire', couleur: '#71717a', x, y, w: 440, h: 280 })
  return 'c:' + id
}

// Supprime les éléments (le nœud de sortie est indélébile) et nettoie toutes les références.
export function supprimer(etat, cles) {
  const ns = new Set()
  const ds = new Set()
  const cs = new Set()
  for (const c of cles) {
    const id = c.slice(2)
    if (c[0] === 'n') ns.add(id)
    else if (c[0] === 'd') ds.add(id)
    else if (c[0] === 'c') cs.add(id)
  }
  etat.noeuds = etat.noeuds.filter((n) => !ns.has(n.id))
  etat.demonstrations = etat.demonstrations.filter((d) => !ds.has(d.id))
  etat.commentaires = etat.commentaires.filter((c) => !cs.has(c.id))
  for (const d of etat.demonstrations) {
    d.justifie_par = d.justifie_par.filter((p) => !ns.has(p))
    if (ns.has(d.noeud_id)) d.noeud_id = null
  }
  const s = etat.sortie
  if (ns.has(s.enonce)) s.enonce = null
  if (ds.has(s.confiance)) s.confiance = null
  if (ds.has(s.premisses)) s.premisses = null
  s.ouverts = s.ouverts.filter((o) => !ns.has(o))
  return ns.size + ds.size + cs.size
}

// Duplique (Ctrl+D) : les liaisons internes à la sélection sont conservées, les autres sont rompues.
export function dupliquer(etat, cles, decalage = 40) {
  const carte = new Map()
  const nouvelles = []
  const copies = []
  for (const cle of cles) {
    const o = objet(etat, cle)
    if (!o || cle[0] === 's') continue
    const prefixe = { n: 'a', d: 'd', c: 'k' }[cle[0]]
    const id = nouvelId(etat, prefixe)
    const copie = { ...structuredClone(o), id, x: o.x + decalage, y: o.y + decalage }
    carte.set(cle, id)
    copies.push([cle[0], copie])
    nouvelles.push(`${cle[0]}:${id}`)
  }
  for (const [g, c] of copies) {
    if (g === 'd') {
      c.justifie_par = c.justifie_par.filter((p) => carte.has('n:' + p)).map((p) => carte.get('n:' + p))
      c.noeud_id = carte.get('n:' + c.noeud_id) ?? null
    }
    const liste = { n: etat.noeuds, d: etat.demonstrations, c: etat.commentaires }[g]
    liste.push(c)
  }
  return nouvelles
}

// ─── Mise en page initiale ─────────────────────────────────────────────────────────────────────────

// Rang = profondeur dans le flux (prémisses → démonstration → assertion) ; chaque catégorie occupe une
// bande horizontale, les bandes dont les colonnes se chevauchent s'empilent, les autres se centrent.
function disposer(noeuds, demos, categories) {
  const catDe = new Map()
  for (const c of categories) for (const id of c.noeuds) catDe.set(id, c.id)
  const vers = new Map(noeuds.map((n) => [n.id, []]))
  for (const d of demos) vers.get(d.noeud_id)?.push(d)
  const utilises = new Set(demos.flatMap((d) => d.justifie_par))
  const rang = new Map()
  const rN = (id, pile) => {
    const k = 'n:' + id
    if (rang.has(k)) return rang.get(k)
    if (pile.has(k)) return 0
    pile.add(k)
    const ds = vers.get(id) ?? []
    const r = ds.length ? 1 + Math.max(...ds.map((d) => rD(d, pile))) : 0
    rang.set(k, r)
    return r
  }
  const rD = (d, pile) => {
    const k = 'd:' + d.id
    if (rang.has(k)) return rang.get(k)
    if (pile.has(k)) return 0
    pile.add(k)
    const r = 1 + Math.max(-1, ...d.justifie_par.map((p) => rN(p, pile)))
    rang.set(k, r)
    return r
  }
  const items = [
    ...noeuds.map((n) => ({ cle: 'n:' + n.id, obj: n, cat: catDe.get(n.id) ?? '_', r: rN(n.id, new Set()), isole: !vers.get(n.id).length && !utilises.has(n.id) })),
    ...demos.map((d) => ({ cle: 'd:' + d.id, obj: d, cat: catDe.get(d.noeud_id) ?? '_', r: rD(d, new Set()), isole: false })),
  ]

  const groupes = new Map()
  for (const it of items) {
    if (!groupes.has(it.cat)) groupes.set(it.cat, [])
    groupes.get(it.cat).push(it)
  }
  const bandes = []
  for (const [cat, its] of groupes) {
    const rs = its.filter((i) => !i.isole).map((i) => i.r)
    const rMax = rs.length ? Math.max(...rs) : 0
    for (const i of its) if (i.isole) i.r = rMax
    const colonnes = new Map()
    for (const i of its) {
      if (!colonnes.has(i.r)) colonnes.set(i.r, [])
      colonnes.get(i.r).push(i)
    }
    const lignes = Math.max(...[...colonnes.values()].map((c) => c.length))
    bandes.push({ cat, its, colonnes, min: Math.min(...its.map((i) => i.r)), max: Math.max(...its.map((i) => i.r)), h: lignes * RANG, y: 0 })
  }
  // Une catégorie de purs faits (tout au rang 0) part dans une colonne d'entrée à gauche : le graphe
  // s'étire en largeur, comme un matériau, au lieu d'empiler les bandes.
  for (const b of bandes) {
    if (b.max !== 0 || bandes.filter((o) => o.min === 0).length < 2) continue
    for (const i of b.its) i.r = -1
    b.colonnes = new Map([[-1, b.colonnes.get(0)]])
    b.min = b.max = -1
  }
  const chevauche = (a, b) => a.min <= b.max && b.min <= a.max
  const placees = []
  for (const b of bandes) {
    b.y = Math.max(0, ...placees.filter((p) => chevauche(p, b)).map((p) => p.y + p.h + ECART))
    placees.push(b)
  }
  const total = Math.max(...bandes.map((b) => b.y + b.h))
  for (const b of bandes) if (!bandes.some((o) => o !== b && chevauche(o, b))) b.y = Math.round((total - b.h) / 2)

  // Dans chaque colonne, on ordonne par barycentre des voisins déjà placés (moins de croisements).
  const pos = new Map()
  const voisins = (i) => (i.cle[0] === 'd' ? i.obj.justifie_par.map((p) => 'n:' + p) : (vers.get(i.obj.id) ?? []).map((d) => 'd:' + d.id))
  const rangs = [...new Set(items.map((i) => i.r))].sort((a, b) => a - b)
  for (const r of rangs) {
    for (const b of bandes) {
      const col = b.colonnes.get(r)
      if (!col) continue
      const cleTri = (i, k) => {
        const ys = voisins(i).filter((v) => pos.has(v)).map((v) => pos.get(v))
        return ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : 1e9 + k
      }
      const tri = col.map((i, k) => [i, cleTri(i, k)]).sort((x, y) => x[1] - y[1]).map(([i]) => i)
      const decal = (b.h - tri.length * RANG) / 2
      tri.forEach((i, k) => {
        i.obj.x = r * COL + (i.cle[0] === 'd' ? 8 : 0)
        i.obj.y = Math.round(b.y + decal + k * RANG)
        pos.set(i.cle, i.obj.y)
      })
    }
  }
  return { bandes, rMax: Math.max(0, ...items.map((i) => i.r)) }
}

export function etatInitial() {
  const g = grapheInitial()
  const noeuds = g.noeuds.map((n) => ({ ...n, x: 0, y: 0, apercu: true }))
  const demonstrations = g.demonstrations.map((d, i) => ({ id: 'd' + (i + 1), ...d, justifie_par: [...d.justifie_par], x: 0, y: 0, apercu: true }))
  const { bandes, rMax } = disposer(noeuds, demonstrations, g.categories)
  const commentaires = g.categories.map((c) => {
    const b = bandes.find((x) => x.cat === c.id)
    if (!b) return { id: c.id, titre: c.titre, couleur: c.couleur, x: 0, y: 0, w: 440, h: 280, membres: [] }
    return {
      id: c.id, titre: c.titre, couleur: c.couleur,
      x: b.min * COL - 24, y: b.y - 52, w: (b.max - b.min) * COL + LARGEUR.n + 48, h: b.h + 60,
      membres: b.its.map((i) => i.cle),
    }
  })
  const q = noeuds.find((n) => n.id === 'q')
  const synthese = demonstrations.find((d) => d.noeud_id === 'q')
  const sortie = {
    x: (rMax + 1) * COL + 70, y: (q?.y ?? 0) - 20, apercu: true,
    enonce: q ? 'q' : null,
    confiance: synthese?.id ?? null,
    premisses: synthese?.id ?? null,
    ouverts: noeuds.some((n) => n.id === 'h1') ? ['h1'] : [],
  }
  return { version: 1, probleme: g.probleme, noeuds, demonstrations, commentaires, sortie, suivant: 1, aAjuster: true }
}

// ─── Persistance ───────────────────────────────────────────────────────────────────────────────────

const CLE = 'atlas.logique-materiau.v1'
const CLE_CAM = 'atlas.logique-materiau.camera'

export function charger() {
  try {
    const t = localStorage.getItem(CLE)
    if (t) {
      const e = JSON.parse(t)
      if (e?.version === 1 && Array.isArray(e.noeuds) && e.sortie) return e
    }
  } catch {
    // stockage indisponible ou corrompu : on repart de l'exemple
  }
  return etatInitial()
}

export function sauver(etat) {
  try {
    localStorage.setItem(CLE, JSON.stringify(etat))
    return true
  } catch {
    return false
  }
}

export function chargerCam() {
  try {
    const c = JSON.parse(localStorage.getItem(CLE_CAM) ?? 'null')
    if (c && [c.x, c.y, c.z].every(Number.isFinite)) return c
  } catch {
    // rien
  }
  return null
}

export function sauverCam(cam) {
  try {
    localStorage.setItem(CLE_CAM, JSON.stringify(cam))
  } catch {
    // rien
  }
}
