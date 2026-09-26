// État éditable des piles de démonstration : graphe, positions, historique (annuler / rétablir) et
// sauvegarde locale. Chaque démonstration reçoit un `id` et un drapeau `active` (module Niagara
// désactivable) : une démonstration inactive n'entre pas dans `calculerStatuts`.

import { grapheInitial, calculerStatuts } from '../../commun/raisonnement.js'

const CLE = 'atlas-logique-pile-v1'
export const GRILLE = 16

// « Type » d'un fait admis, comme le type d'un paramètre utilisateur Niagara (pastille colorée).
export const TYPES_FAIT = {
  mesure: { libelle: 'Mesure', couleur: '#65a30d' },
  theorie: { libelle: 'Théorie', couleur: '#7c3aed' },
  observation: { libelle: 'Observation', couleur: '#0891b2' },
}

export const COULEURS_COMMENT = ['#52525b', '#2563eb', '#7c3aed', '#b45309', '#0f766e', '#be185d', '#15803d', '#18181b']

export const E = { graphe: null, positions: {}, replis: {}, journal: [] }
const historique = []
let futur = []
const abonnes = []

export const surChangement = (fn) => abonnes.push(fn)
const notifier = () => abonnes.forEach((fn) => fn())
export const aligner = (v) => Math.round(v / GRILLE) * GRILLE

function typeParDefaut(id) {
  if (id.startsWith('t')) return 'theorie'
  if (id.startsWith('r')) return 'observation'
  return 'mesure'
}

function grapheExemple() {
  const g = grapheInitial()
  for (const n of g.noeuds) if (n.admis) n.type = typeParDefaut(n.id)
  g.demonstrations.forEach((d, i) => { d.id = `d${i + 1}`; d.active = true })
  return g
}

function estValide(o) {
  return !!(o && o.graphe && Array.isArray(o.graphe.noeuds) && Array.isArray(o.graphe.demonstrations)
    && Array.isArray(o.graphe.categories) && o.positions && typeof o.positions === 'object')
}

// Renvoie vrai si un état sauvegardé a été restauré.
export function charger() {
  let o = null
  try { o = JSON.parse(localStorage.getItem(CLE) || 'null') } catch { o = null }
  if (estValide(o)) {
    E.graphe = o.graphe
    E.positions = o.positions
    E.replis = o.replis || {}
    E.journal = Array.isArray(o.journal) ? o.journal : []
    return true
  }
  E.graphe = grapheExemple()
  E.positions = {}
  E.replis = {}
  E.journal = []
  return false
}

export function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify(E)) } catch { /* stockage indisponible : on continue sans */ }
}

const cliche = () => JSON.stringify({ graphe: E.graphe, positions: E.positions })

export function journaliser(texte) {
  E.journal.push({ t: new Date().toISOString(), texte })
  if (E.journal.length > 400) E.journal.splice(0, E.journal.length - 400)
}

// Pour les gestes longs (glisser, redimensionner) : `commencer` au début, `terminer` au relâchement.
export const commencer = () => cliche()

export function terminer(avant, libelle) {
  if (cliche() === avant) return false
  historique.push(avant)
  if (historique.length > 200) historique.shift()
  futur = []
  journaliser(libelle)
  sauver()
  notifier()
  return true
}

export function modifier(libelle, fn) {
  const avant = commencer()
  fn()
  return terminer(avant, libelle)
}

// Change l'affichage sans entrer dans l'historique (sections repliées).
export function modifierVue(fn) {
  fn()
  sauver()
  notifier()
}

function restaurer(s) {
  const o = JSON.parse(s)
  E.graphe = o.graphe
  E.positions = o.positions
}

export function annuler() {
  if (!historique.length) return false
  futur.push(cliche())
  restaurer(historique.pop())
  journaliser('Annuler')
  sauver()
  notifier()
  return true
}

export function retablir() {
  if (!futur.length) return false
  historique.push(cliche())
  restaurer(futur.pop())
  journaliser('Rétablir')
  sauver()
  notifier()
  return true
}

export const peutAnnuler = () => historique.length > 0
export const peutRetablir = () => futur.length > 0

export function remettreExemple() {
  E.graphe = grapheExemple()
  E.positions = {}
  E.replis = {}
}

// ─── Lecture ─────────────────────────────────────────────────────────────────────────────────────────

export const noeud = (id) => E.graphe.noeuds.find((n) => n.id === id)
export const demo = (id) => E.graphe.demonstrations.find((d) => d.id === id)
export const categorie = (id) => E.graphe.categories.find((c) => c.id === id)
export const demosDe = (id) => E.graphe.demonstrations.filter((d) => d.noeud_id === id)
export const usages = (id) => E.graphe.demonstrations.filter((d) => d.justifie_par.includes(id))
export const nom = (id) => noeud(id)?.nom ?? id

export function statuts() {
  return calculerStatuts(E.graphe.noeuds, E.graphe.demonstrations.filter((d) => d.active !== false))
}

function nouvelId(prefixe, pris) {
  let i = 1
  while (pris.has(`${prefixe}${i}`)) i++
  return `${prefixe}${i}`
}

// ─── Opérations (à appeler dans `modifier`) ──────────────────────────────────────────────────────────

export function ajouterNoeud({ admis, nom: n, enonce = '', type = 'mesure', x = 0, y = 0 }) {
  const id = nouvelId(admis ? 'fait' : 'a', new Set(E.graphe.noeuds.map((k) => k.id)))
  const noeudNeuf = { id, nom: n, enonce, admis }
  if (admis) noeudNeuf.type = type
  E.graphe.noeuds.push(noeudNeuf)
  E.positions[id] = { x: aligner(x), y: aligner(y) }
  return id
}

export function ajouterDemo(noeudId, justifie_par = []) {
  const id = nouvelId('d', new Set(E.graphe.demonstrations.map((d) => d.id)))
  E.graphe.demonstrations.push({
    id, noeud_id: noeudId, nom_demonstration: 'nouvelle_demonstration', justifie_par,
    demonstration: '', validite: 'a_verifier', confiance: null, auteur: 'camille', active: true,
  })
  return id
}

export function supprimerDemo(id) {
  E.graphe.demonstrations = E.graphe.demonstrations.filter((d) => d.id !== id)
}

export function lier(premisse, demoId) {
  const d = demo(demoId)
  if (!d || d.noeud_id === premisse || d.justifie_par.includes(premisse)) return false
  d.justifie_par.push(premisse)
  return true
}

export function delier(premisse, demoId) {
  const d = demo(demoId)
  if (d) d.justifie_par = d.justifie_par.filter((p) => p !== premisse)
}

export function remplacerPremisse(demoId, ancienne, nouvelle) {
  const d = demo(demoId)
  if (!d || d.noeud_id === nouvelle) return
  if (d.justifie_par.includes(nouvelle)) { delier(ancienne, demoId); return }
  d.justifie_par = d.justifie_par.map((p) => (p === ancienne ? nouvelle : p))
}

export function supprimerNoeuds(ids) {
  const s = new Set(ids)
  E.graphe.noeuds = E.graphe.noeuds.filter((n) => !s.has(n.id))
  E.graphe.demonstrations = E.graphe.demonstrations.filter((d) => !s.has(d.noeud_id))
  for (const d of E.graphe.demonstrations) d.justifie_par = d.justifie_par.filter((p) => !s.has(p))
  for (const id of s) { delete E.positions[id]; delete E.replis[id] }
}

// Réordonne les modules d'une pile : ils reprennent les places qu'ils occupaient dans la liste globale.
export function reordonnerDemos(noeudId, ordre) {
  const parId = new Map(E.graphe.demonstrations.map((d) => [d.id, d]))
  const places = []
  E.graphe.demonstrations.forEach((d, i) => { if (d.noeud_id === noeudId) places.push(i) })
  places.forEach((i, k) => { E.graphe.demonstrations[i] = parId.get(ordre[k]) })
}

// Faits admis ↔ assertions. Un fait admis n'a pas de démonstration : on retire les siennes.
export function convertir(id, admis) {
  const n = noeud(id)
  if (!n || n.admis === admis) return
  n.admis = admis
  if (admis) {
    n.type = n.type || 'mesure'
    E.graphe.demonstrations = E.graphe.demonstrations.filter((d) => d.noeud_id !== id)
  }
}

// Comme dans Unreal : les liens internes à la copie sont recopiés, les prémisses externes conservées.
export function dupliquerNoeuds(ids) {
  const pris = new Set(E.graphe.noeuds.map((n) => n.id))
  const table = new Map()
  for (const id of ids) {
    const n = noeud(id)
    if (!n) continue
    const neuf = nouvelId(n.admis ? 'fait' : 'a', pris)
    pris.add(neuf)
    table.set(id, neuf)
    E.graphe.noeuds.push({ ...structuredClone(n), id: neuf, nom: `${n.nom} (copie)` })
    const p = E.positions[id] || { x: 0, y: 0 }
    E.positions[neuf] = { x: p.x + 2 * GRILLE, y: p.y + 2 * GRILLE }
  }
  const prisDemos = new Set(E.graphe.demonstrations.map((d) => d.id))
  for (const d of [...E.graphe.demonstrations]) {
    if (!table.has(d.noeud_id)) continue
    const idDemo = nouvelId('d', prisDemos)
    prisDemos.add(idDemo)
    E.graphe.demonstrations.push({
      ...structuredClone(d), id: idDemo, noeud_id: table.get(d.noeud_id),
      justifie_par: d.justifie_par.map((p) => table.get(p) ?? p),
    })
  }
  return [...table.values()]
}

export function ajouterCommentaire({ x, y, l, h, titre = 'Commentaire', couleur = COULEURS_COMMENT[0] }) {
  const id = nouvelId('k', new Set(E.graphe.categories.map((c) => c.id)))
  E.graphe.categories.push({ id, titre, couleur, x: aligner(x), y: aligner(y), l: aligner(l), h: aligner(h) })
  return id
}

export function supprimerCommentaires(ids) {
  const s = new Set(ids)
  E.graphe.categories = E.graphe.categories.filter((c) => !s.has(c.id))
}
