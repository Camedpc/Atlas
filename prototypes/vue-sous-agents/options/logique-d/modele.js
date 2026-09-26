// Modèle de l'éditeur de logique : état du graphe, historique annuler/rétablir, sauvegarde locale,
// opérations d'édition (liens, suppression, duplication) et disposition automatique initiale.
// Aucune dépendance au DOM : la vue fournit les hauteurs mesurées des nœuds.

import { grapheInitial, calculerStatuts } from '../../commun/raisonnement.js'

const CLE = 'atlas.logique-d.v1'
const MAX_HISTORIQUE = 200

export const L = 248 // largeur d'un nœud (doit rester alignée sur le CSS)
export const GRILLE = 16
export const MARGE_COM = { haut: 56, bas: 32, cote: 32 } // marges d'une boîte « Comment » autour de son contenu

export const GENRES = {
  assertion: { libelle: 'Assertion', icone: '⊢', couleur: '#2b5797' },
  fait: { libelle: 'Fait admis', icone: '⊤', couleur: '#3d6b4f' },
  hypothese: { libelle: 'Hypothèse', icone: '?', couleur: '#9a6412' },
  conclusion: { libelle: 'Conclusion', icone: '∴', couleur: '#27272a' },
}

export const PALETTE = [
  { nom: 'Ardoise', couleur: '#475569' },
  { nom: 'Bleu', couleur: '#2563eb' },
  { nom: 'Violet', couleur: '#7c3aed' },
  { nom: 'Sarcelle', couleur: '#0f766e' },
  { nom: 'Vert', couleur: '#3f7d3a' },
  { nom: 'Ambre', couleur: '#b45309' },
  { nom: 'Brique', couleur: '#b91c1c' },
  { nom: 'Encre', couleur: '#18181b' },
]

export const E = { g: null, annuler: [], retablir: [] }

export const aimanter = (v) => Math.round(v / GRILLE) * GRILLE
export const nouvelId = (prefixe) => `${prefixe}${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`

// ─── Jeu d'exemple ───────────────────────────────────────────────────────────────────────────────────

export function exemple() {
  const g = grapheInitial()
  const demontres = new Set(g.demonstrations.map((d) => d.noeud_id))
  const premisses = new Set(g.demonstrations.flatMap((d) => d.justifie_par))
  const genre = (n) => n.admis ? 'fait'
    : !demontres.has(n.id) ? 'hypothese'
      : !premisses.has(n.id) ? 'conclusion' : 'assertion'
  return {
    version: 1,
    probleme: g.probleme,
    noeuds: g.noeuds.map((n) => ({ ...n, genre: genre(n), x: 0, y: 0 })),
    demonstrations: g.demonstrations.map((d, i) => ({ id: `d${i + 1}`, ...d })),
    commentaires: g.categories.map((c) => ({ id: c.id, titre: c.titre, couleur: c.couleur, membres: c.noeuds, x: 0, y: 0, l: 0, h: 0 })),
    aDisposer: true,
  }
}

function valide(g) {
  return g && g.version === 1 && Array.isArray(g.noeuds) && Array.isArray(g.demonstrations) && Array.isArray(g.commentaires)
}

export function charger() {
  try {
    const brut = localStorage.getItem(CLE)
    const g = brut && JSON.parse(brut)
    if (valide(g)) { E.g = g; return false }
  } catch { /* stockage indisponible ou corrompu : on repart de l'exemple */ }
  E.g = exemple()
  return true
}

let minuterie = null
export function sauverBientot() {
  clearTimeout(minuterie)
  minuterie = setTimeout(() => {
    try { localStorage.setItem(CLE, JSON.stringify(E.g)) } catch { /* navigation privée, quota… */ }
  }, 250)
}

// ─── Historique ──────────────────────────────────────────────────────────────────────────────────────

export const instantane = () => JSON.stringify(E.g)

export function pousser(avant) {
  E.annuler.push(avant)
  if (E.annuler.length > MAX_HISTORIQUE) E.annuler.shift()
  E.retablir = []
}

// Applique une modification et l'inscrit dans l'historique si elle a changé quelque chose.
export function modifier(fn) {
  const avant = instantane()
  const resultat = fn(E.g)
  nettoyer(E.g)
  if (instantane() !== avant) pousser(avant)
  return resultat
}

export function annuler() {
  if (!E.annuler.length) return false
  E.retablir.push(instantane())
  E.g = JSON.parse(E.annuler.pop())
  return true
}

export function retablir() {
  if (!E.retablir.length) return false
  E.annuler.push(instantane())
  E.g = JSON.parse(E.retablir.pop())
  return true
}

// ─── Lecture ─────────────────────────────────────────────────────────────────────────────────────────

export const statuts = (g = E.g) => calculerStatuts(g.noeuds, g.demonstrations)
export const noeud = (id, g = E.g) => g.noeuds.find((n) => n.id === id)
export const demo = (id, g = E.g) => g.demonstrations.find((d) => d.id === id)
export const commentaire = (id, g = E.g) => g.commentaires.find((c) => c.id === id)
export const demosDe = (id, g = E.g) => g.demonstrations.filter((d) => d.noeud_id === id)
export const utilisePar = (id, g = E.g) => g.demonstrations.filter((d) => d.justifie_par.includes(id))

// Vrai si `a` dépend (transitivement) de `b` à travers les prémisses.
export function dependDe(a, b, g = E.g) {
  const vus = new Set()
  const pile = [a]
  while (pile.length) {
    const x = pile.pop()
    if (x === b) return true
    if (vus.has(x)) continue
    vus.add(x)
    for (const d of demosDe(x, g)) pile.push(...d.justifie_par)
  }
  return false
}

// ─── Liens ───────────────────────────────────────────────────────────────────────────────────────────

// Que se passerait-il si l'on reliait la prémisse `p` au nœud `cible` (démonstration `demoId`, ou une
// nouvelle démonstration si `demoId` est nul) ? Renvoie { ok, texte }.
export function evaluerLien(p, cible, demoId, g = E.g) {
  const P = noeud(p, g)
  const C = noeud(cible, g)
  if (!P || !C) return { ok: false, texte: 'Cible inconnue' }
  if (p === cible) return { ok: false, texte: 'Une assertion ne peut pas se justifier elle-même' }
  const d = demoId ? demo(demoId, g) : null
  if (d && d.justifie_par.includes(p)) return { ok: false, texte: `« ${P.nom} » est déjà une prémisse de ${d.nom_demonstration}` }
  if (!d && C.admis) return { ok: false, texte: `« ${C.nom} » est un fait admis : décochez « admis » pour le démontrer` }
  if (dependDe(p, cible, g)) return { ok: false, texte: `Cycle : « ${P.nom} » dépend déjà de « ${C.nom} »` }
  return d
    ? { ok: true, texte: `Ajouter « ${P.nom} » aux prémisses de ${d.nom_demonstration}` }
    : { ok: true, texte: `Nouvelle démonstration de « ${C.nom} » (à vérifier)` }
}

function nomDemo(g, cible) {
  const base = `demonstration_${demosDe(cible, g).length + 1}`
  let nom = base
  for (let i = 2; g.demonstrations.some((d) => d.nom_demonstration === nom); i++) nom = `${base}_${i}`
  return nom
}

// À appeler dans `modifier`. Renvoie l'id de la démonstration touchée.
export function relier(g, p, cible, demoId) {
  const d = demoId ? demo(demoId, g) : null
  if (d) { d.justifie_par.push(p); return d.id }
  const nouvelle = {
    id: nouvelId('d'), noeud_id: cible, nom_demonstration: nomDemo(g, cible), justifie_par: [p],
    demonstration: '', validite: 'a_verifier', confiance: null, auteur: 'camille',
  }
  g.demonstrations.push(nouvelle)
  return nouvelle.id
}

export function retirerPremisse(g, demoId, p) {
  const d = demo(demoId, g)
  if (d) d.justifie_par = d.justifie_par.filter((x) => x !== p)
}

export function couperSortie(g, id) {
  for (const d of g.demonstrations) d.justifie_par = d.justifie_par.filter((x) => x !== id)
}

export function couperTout(g, id) {
  couperSortie(g, id)
  g.demonstrations = g.demonstrations.filter((d) => d.noeud_id !== id)
}

// Une démonstration sans prémisse n'a pas de sens (elle établirait sa conclusion à vide) : on la retire.
export function nettoyer(g) {
  const ids = new Set(g.noeuds.map((n) => n.id))
  for (const d of g.demonstrations) d.justifie_par = [...new Set(d.justifie_par.filter((p) => ids.has(p)))]
  g.demonstrations = g.demonstrations.filter((d) => ids.has(d.noeud_id) && d.justifie_par.length)
}

export function supprimer(g, { noeuds = [], commentaires = [], demos = [] }) {
  const n = new Set(noeuds)
  g.noeuds = g.noeuds.filter((x) => !n.has(x.id))
  const c = new Set(commentaires)
  g.commentaires = g.commentaires.filter((x) => !c.has(x.id))
  const d = new Set(demos)
  g.demonstrations = g.demonstrations.filter((x) => !d.has(x.id))
}

// Duplique des nœuds avec leurs démonstrations ; les prémisses dupliquées ensemble sont remappées.
export function dupliquer(g, ids) {
  const table = new Map(ids.map((id) => [id, nouvelId('n')]))
  for (const id of ids) {
    const n = noeud(id, g)
    if (n) g.noeuds.push({ ...structuredClone(n), id: table.get(id), nom: `${n.nom} (copie)`, x: n.x + 32, y: n.y + 32 })
  }
  for (const d of g.demonstrations.filter((x) => table.has(x.noeud_id))) {
    g.demonstrations.push({
      ...structuredClone(d), id: nouvelId('d'), noeud_id: table.get(d.noeud_id),
      justifie_par: d.justifie_par.map((p) => table.get(p) ?? p),
    })
  }
  return [...table.values()]
}

// ─── Disposition automatique ─────────────────────────────────────────────────────────────────────────

const ECART_X = 72 // entre deux colonnes d'une même catégorie
const ECART_Y = 24
const ECART_BLOC_X = 128
const ECART_BLOC_Y = 64

// Faits à gauche, conclusion à droite. Chaque catégorie forme un bloc disposé en colonnes selon la
// profondeur locale ; les blocs sont placés en colonnes globales le plus à droite possible (au plus près
// de ce qu'ils alimentent), puis leur boîte « Comment » est ajustée autour d'eux.
export function disposer(g, hauteur) {
  const existe = new Set(g.noeuds.map((n) => n.id))
  const premisses = new Map(g.noeuds.map((n) => [n.id, new Set()]))
  for (const d of g.demonstrations) for (const p of d.justifie_par) premisses.get(d.noeud_id)?.add(p)

  const blocs = []
  const blocDe = new Map()
  for (const c of g.commentaires) {
    const ids = (c.membres || []).filter((id) => existe.has(id) && !blocDe.has(id))
    if (!ids.length) continue
    const b = { com: c, ids }
    for (const id of ids) blocDe.set(id, b)
    blocs.push(b)
  }
  const orphelins = g.noeuds.map((n) => n.id).filter((id) => !blocDe.has(id))
  if (orphelins.length) {
    const b = { com: null, ids: orphelins }
    for (const id of orphelins) blocDe.set(id, b)
    blocs.push(b)
  }

  // Rang des blocs : au plus tôt, puis décalés vers la droite (au plus tard) sans dépasser leurs clients.
  const alimente = new Map(blocs.map((b) => [b, new Set()]))
  for (const b of blocs) {
    for (const id of b.ids) {
      for (const p of premisses.get(id)) {
        const a = blocDe.get(p)
        if (a && a !== b) alimente.get(a).add(b)
      }
    }
  }
  for (const b of blocs) b.rang = 0
  for (let i = 0; i < blocs.length; i++) {
    for (const a of blocs) for (const b of alimente.get(a)) b.rang = Math.max(b.rang, Math.min(blocs.length, a.rang + 1))
  }
  for (let i = 0; i < blocs.length; i++) {
    for (const a of blocs) {
      const clients = [...alimente.get(a)]
      if (clients.length) a.rang = Math.max(a.rang, Math.min(...clients.map((b) => b.rang)) - 1)
    }
  }

  // Disposition interne de chaque bloc.
  for (const b of blocs) {
    const prof = new Map(b.ids.map((id) => [id, 0]))
    for (let i = 0; i < b.ids.length; i++) {
      for (const id of b.ids) {
        for (const p of premisses.get(id)) if (prof.has(p)) prof.set(id, Math.min(b.ids.length, Math.max(prof.get(id), prof.get(p) + 1)))
      }
    }
    const cols = []
    for (const id of b.ids) (cols[prof.get(id)] ||= []).push(id)
    const colonnes = cols.filter(Boolean)
    const centre = new Map()
    b.pos = new Map()
    const hauteurs = colonnes.map((col, i) => {
      if (i > 0) {
        const bary = (id) => {
          const ys = [...premisses.get(id)].filter((p) => centre.has(p)).map((p) => centre.get(p))
          return ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : 1e9
        }
        col.sort((a, c) => bary(a) - bary(c))
      }
      let y = 0
      for (const id of col) {
        b.pos.set(id, { x: i * (L + ECART_X), y })
        centre.set(id, y + hauteur(id) / 2)
        y += hauteur(id) + ECART_Y
      }
      return y - ECART_Y
    })
    b.h = Math.max(...hauteurs)
    colonnes.forEach((col, i) => {
      const dy = (b.h - hauteurs[i]) / 2
      for (const id of col) b.pos.get(id).y += dy
    })
    b.l = colonnes.length * L + (colonnes.length - 1) * ECART_X
    b.m = b.com ? MARGE_COM : { haut: 0, bas: 0, cote: 0 }
    b.lo = b.l + 2 * b.m.cote
    b.ho = b.h + b.m.haut + b.m.bas
  }

  // Colonnes globales, blocs alignés à droite de leur colonne et centrés verticalement.
  const parRang = []
  for (const b of blocs) (parRang[b.rang] ||= []).push(b)
  const colonnes = parRang.filter(Boolean)
  const hCol = colonnes.map((col) => col.reduce((s, b) => s + b.ho, 0) + ECART_BLOC_Y * (col.length - 1))
  const H = Math.max(...hCol)
  let x = 0
  colonnes.forEach((col, i) => {
    const largeur = Math.max(...col.map((b) => b.lo))
    let y = aimanter((H - hCol[i]) / 2)
    for (const b of col) {
      const bx = aimanter(x + largeur - b.lo)
      for (const id of b.ids) {
        const n = noeud(id, g)
        const p = b.pos.get(id)
        n.x = bx + b.m.cote + p.x
        n.y = Math.round(y + b.m.haut + p.y)
      }
      if (b.com) Object.assign(b.com, { x: bx, y, l: b.lo, h: Math.round(b.ho) })
      y = aimanter(y + b.ho + ECART_BLOC_Y)
    }
    x = aimanter(x + largeur + ECART_BLOC_X)
  })

  for (const c of g.commentaires) {
    if (!c.l) Object.assign(c, { x: 0, y: -240, l: 400, h: 200 })
    delete c.membres
  }
  delete g.aDisposer
}
