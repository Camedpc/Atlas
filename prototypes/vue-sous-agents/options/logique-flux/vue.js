// Flux de résolution : un graphe d'événements à la Blueprint d'Unreal, en thème clair.
// - Exécution : la méthode de résolution (événement, étapes, Branch, Sequence) reliée par des fils épais.
// - Données : les assertions sont des nœuds purs (sans broche d'exécution) ; les démonstrations sont des
//   nœuds fonction compacts (entrées = prémisses, sortie = assertion démontrée).
// - Le statut des assertions est recalculé à chaque modification par `calculerStatuts`.

import { calculerStatuts, STATUTS, VALIDITES } from '../../commun/raisonnement.js'
import { etatExemple, disposer, COULEURS_COMMENT } from './exemple.js'

const CLE_STOCKAGE = 'atlas.logique-flux.v1'
const GRILLE = 16
const K_MIN = 0.15
const K_MAX = 2
const L_ASSERTION = 232
const L_DEMO = 200
const L_ETAPE = 250
const L_CONTROLE = 220

const TYPES = {
  fait: { libelle: 'fait admis', couleur: '#0e7490' },
  hypothese: { libelle: 'hypothèse', couleur: '#a21caf' },
  conclusion: { libelle: 'conclusion', couleur: '#4d7c0f' },
}
const COULEUR_BOOL = '#9f1239'
const FLUX = {
  evenement: { libelle: 'Événement', ico: '◆', couleur: 'var(--t-evenement)', l: L_ETAPE },
  etape: { libelle: 'Étape de méthode', ico: 'ƒ', couleur: 'var(--t-etape)', l: L_ETAPE },
  branch: { libelle: 'Branch', ico: '⑂', couleur: 'var(--t-controle)', l: L_CONTROLE },
  sequence: { libelle: 'Sequence', ico: '≡', couleur: 'var(--t-controle)', l: L_CONTROLE },
}
const SVG_EXEC = '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M1.5 1.5H6.6L10.6 6L6.6 10.5H1.5Z"/></svg>'

// ─── Squelette ───────────────────────────────────────────────────────────────────────────────────────

const scene = document.querySelector('.scene')
scene.innerHTML = `
  <div class="monde">
    <div class="commentaires"></div>
    <svg class="fils"><g class="g-fils"></g><g class="g-temp"></g></svg>
    <div class="noeuds"></div>
  </div>
  <div class="rectangle" hidden></div>
  <div class="legende-bp">
    <div class="ligne">
      <span><span class="pin exec plein">${SVG_EXEC}</span><i class="l-exec"></i>exécution</span>
      ${Object.values(TYPES).map((t) => `<span><span class="pin donnee plein" style="--tc:${t.couleur}"><i></i></span>${t.libelle}</span>`).join('')}
      <span><span class="pin donnee plein" style="--tc:${COULEUR_BOOL}"><i></i></span>condition</span>
    </div>
    <div class="ligne aide">Glisser le fond ou clic droit maintenu : se déplacer · Maj/Ctrl + glisser : rectangle · clic droit : actions · double-clic : renommer · Alt + clic : couper</div>
  </div>`
const monde = scene.querySelector('.monde')
const coucheComment = scene.querySelector('.commentaires')
const coucheNoeuds = scene.querySelector('.noeuds')
const gFils = scene.querySelector('.g-fils')
const gTemp = scene.querySelector('.g-temp')
const rectangle = scene.querySelector('.rectangle')
const panneau = document.querySelector('.details')
const menu = document.querySelector('.menu')
const barre = document.querySelector('.barre')
const compteurs = barre.querySelector('.compteurs')
const pasNav = barre.querySelector('.pas-nav')
const pasLib = barre.querySelector('.pas-lib')

// ─── État ────────────────────────────────────────────────────────────────────────────────────────────

let etat = null
let statuts = {}
let selection = new Set()
let vue = { x: 60, y: 60, k: 0.6 }
let historique = []
let futur = []
let pas = null // { i } quand le mode pas à pas est actif
const tailles = new Map() // id → { l, h } mesurés
const decalages = new Map() // id → { 'cote|k': { x, y } } centres de broches relatifs au nœud
const elements = new Map() // id → élément DOM

function charger() {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE)
    if (!brut) return null
    const e = JSON.parse(brut)
    if (!['assertions', 'demonstrations', 'etapes', 'liens', 'commentaires'].every((k) => Array.isArray(e[k]))) return null
    return e
  } catch { return null }
}

function sauver() {
  try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify(etat)) } catch { /* stockage indisponible */ }
}

function avant() {
  historique.push(JSON.stringify(etat))
  if (historique.length > 200) historique.shift()
  futur = []
}

function annuler() {
  if (!historique.length) return
  futur.push(JSON.stringify(etat))
  etat = JSON.parse(historique.pop())
  apresRestauration()
}

function retablir() {
  if (!futur.length) return
  historique.push(JSON.stringify(etat))
  etat = JSON.parse(futur.pop())
  apresRestauration()
}

function apresRestauration() {
  selection = new Set([...selection].filter((id) => trouver(id)))
  rendre()
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function trouver(id) {
  let o = etat.assertions.find((a) => a.id === id)
  if (o) return { genre: 'assertion', o }
  o = etat.demonstrations.find((d) => d.id === id)
  if (o) return { genre: 'demo', o }
  o = etat.etapes.find((e) => e.id === id)
  if (o) return { genre: 'flux', o }
  o = etat.commentaires.find((c) => c.id === id)
  if (o) return { genre: 'commentaire', o }
  return null
}

function nouvelId(prefixe) {
  let i = 1
  while (trouver(`${prefixe}${i}`)) i++
  return `${prefixe}${i}`
}

const tousLesNoeuds = () => [...etat.assertions, ...etat.demonstrations, ...etat.etapes]

function typeAssertion(a) {
  if (a.admis) return 'fait'
  return etat.demonstrations.some((d) => d.noeud_id === a.id) ? 'conclusion' : 'hypothese'
}

const couleurAssertion = (id) => {
  const a = etat.assertions.find((x) => x.id === id)
  return a ? TYPES[typeAssertion(a)].couleur : '#a1a1aa'
}
const estDonneeFlux = (k) => k === 'c' || /^i(\d+|\+)$/.test(k)
const nomAssertion = (id) => etat.assertions.find((x) => x.id === id)?.nom ?? '?'

// ─── Fils (liaisons dérivées de l'état) ──────────────────────────────────────────────────────────────

function listerFils() {
  const fils = []
  const existe = (id) => trouver(id)
  for (const l of etat.liens) {
    if (!existe(l.de) || !existe(l.vers)) continue
    fils.push({ cle: `x|${l.de}|${l.k}`, exec: true, de: [l.de, 's', l.k], vers: [l.vers, 'e', 'in'], couper: () => { etat.liens = etat.liens.filter((m) => m !== l) } })
  }
  for (const d of etat.demonstrations) {
    d.justifie_par.forEach((p, i) => {
      if (!existe(p)) return
      fils.push({ cle: `p|${d.id}|${i}`, couleur: couleurAssertion(p), de: [p, 's', 'v'], vers: [d.id, 'e', `p${i}`], couper: () => { d.justifie_par.splice(i, 1) } })
    })
    if (d.noeud_id && existe(d.noeud_id)) {
      fils.push({ cle: `c|${d.id}`, couleur: TYPES.conclusion.couleur, de: [d.id, 's', 'v'], vers: [d.noeud_id, 'e', 'd'], couper: () => { d.noeud_id = null } })
    }
  }
  for (const e of etat.etapes) {
    e.entrees.forEach((a, i) => {
      if (!existe(a)) return
      fils.push({ cle: `i|${e.id}|${i}`, couleur: couleurAssertion(a), de: [a, 's', 'v'], vers: [e.id, 'e', `i${i}`], couper: () => { e.entrees.splice(i, 1) } })
    })
    if (e.condition && existe(e.condition)) {
      fils.push({ cle: `b|${e.id}`, couleur: COULEUR_BOOL, de: [e.condition, 's', 'v'], vers: [e.id, 'e', 'c'], couper: () => { e.condition = null } })
    }
  }
  return fils
}

// Prépare une liaison entre deux broches ; renvoie la mutation à appliquer, ou null si incompatible.
function planLien(p1, p2) {
  if (!p1 || !p2 || p1.cote === p2.cote || p1.id === p2.id) return null
  const [src, dst] = p1.cote === 's' ? [p1, p2] : [p2, p1]
  const S = trouver(src.id)
  const D = trouver(dst.id)
  if (!S || !D) return null
  if (S.genre === 'flux') {
    if (D.genre !== 'flux' || dst.k !== 'in') return null
    return () => {
      etat.liens = etat.liens.filter((l) => !(l.de === S.o.id && l.k === src.k))
      etat.liens.push({ de: S.o.id, k: src.k, vers: D.o.id })
    }
  }
  if (S.genre === 'assertion') {
    const a = S.o.id
    if (D.genre === 'demo' && dst.k.startsWith('p')) {
      const ps = D.o.justifie_par
      if (dst.k === 'p+') return ps.includes(a) ? null : () => { ps.push(a) }
      const i = Number(dst.k.slice(1))
      if (ps.includes(a) && ps[i] !== a) return null
      return () => { ps[i] = a }
    }
    if (D.genre === 'flux' && estDonneeFlux(dst.k) && dst.k !== 'c') {
      const es = D.o.entrees
      if (dst.k === 'i+') return es.includes(a) ? null : () => { es.push(a) }
      const i = Number(dst.k.slice(1))
      if (es.includes(a) && es[i] !== a) return null
      return () => { es[i] = a }
    }
    if (D.genre === 'flux' && dst.k === 'c') return () => { D.o.condition = a }
    if (D.genre === 'assertion' && dst.k === 'd') {
      // Assertion → assertion : on intercale une démonstration à vérifier, comme un nœud de conversion.
      return () => {
        const x = (S.o.x + (tailles.get(a)?.l ?? L_ASSERTION) + D.o.x) / 2 - L_DEMO / 2
        etat.demonstrations.push(nouvelleDemo(x, (S.o.y + D.o.y) / 2, { justifie_par: [a], noeud_id: D.o.id }))
      }
    }
    return null
  }
  if (S.genre === 'demo') {
    if (D.genre !== 'assertion' || dst.k !== 'd') return null
    return () => { S.o.noeud_id = D.o.id }
  }
  return null
}

function relier(p1, p2) {
  const plan = planLien(p1, p2)
  if (!plan) return false
  avant()
  plan()
  rendre()
  return true
}

// ─── Création ────────────────────────────────────────────────────────────────────────────────────────

const surGrille = (v) => Math.round(v / GRILLE) * GRILLE

function nouvelleDemo(x, y, extra = {}) {
  return {
    id: nouvelId('d'), noeud_id: null, nom_demonstration: 'nouvelle_demonstration', justifie_par: [],
    demonstration: '', validite: 'a_verifier', confiance: null, auteur: 'camille', x: surGrille(x), y: surGrille(y), ...extra,
  }
}

function creer(genre, x, y) {
  x = surGrille(x)
  y = surGrille(y)
  if (genre === 'fait' || genre === 'hypothese') {
    const o = { id: nouvelId('a'), nom: genre === 'fait' ? 'Nouveau fait' : 'Nouvelle hypothèse', enonce: '', admis: genre === 'fait', x, y }
    etat.assertions.push(o)
    return o
  }
  if (genre === 'demo') {
    const o = nouvelleDemo(x, y)
    etat.demonstrations.push(o)
    return o
  }
  const titres = { evenement: 'Problème posé', etape: 'Nouvelle étape', branch: 'Si …', sequence: 'Sous-questions' }
  const o = { id: nouvelId('e'), genre, titre: titres[genre], note: '', entrees: [], condition: null, valeur: false, sorties: 2, x, y }
  etat.etapes.push(o)
  return o
}

function brochesDe(id) {
  const t = trouver(id)
  if (!t) return []
  if (t.genre === 'assertion') return [{ id, cote: 'e', k: 'd' }, { id, cote: 's', k: 'v' }]
  if (t.genre === 'demo') return [{ id, cote: 'e', k: 'p+' }, { id, cote: 's', k: 'v' }]
  const e = t.o
  const s = e.genre === 'sequence' ? 't0' : e.genre === 'branch' ? 'vrai' : 'x'
  return [{ id, cote: 'e', k: 'in' }, { id, cote: 's', k: s }, { id, cote: 'e', k: 'i+' }, { id, cote: 'e', k: 'c' }]
}

// Crée un nœud au point (x, y) du monde et, s'il vient d'un fil tiré dans le vide, le relie.
function creerDepuis(genre, x, y, depart) {
  avant()
  const decale = depart && depart.cote === 'e' ? -((genre in FLUX ? L_ETAPE : L_ASSERTION) + 30) : 20
  const o = creer(genre, x + decale, y - 30)
  if (depart) {
    for (const b of brochesDe(o.id)) {
      const plan = planLien(depart, b)
      if (plan) { plan(); break }
    }
  }
  selection = new Set([o.id])
  rendre()
  return o
}

// ─── Rendu ───────────────────────────────────────────────────────────────────────────────────────────

function pin(id, cote, k, { exec = false, couleur, plein = false } = {}) {
  const attrs = `data-pin="${id}|${cote}|${k}"`
  if (exec) return `<span class="pin exec${plein ? ' plein' : ''}" ${attrs}>${SVG_EXEC}</span>`
  return `<span class="pin donnee${plein ? ' plein' : ''}" ${attrs} style="--tc:${couleur}"><i></i></span>`
}

function rang(g = '', d = '', cls = '') {
  return `<div class="rang${cls}"><div class="g">${g}</div><div class="d">${d}</div></div>`
}

function htmlAssertion(a, relies) {
  const t = typeAssertion(a)
  const s = STATUTS[statuts[a.id]]
  const aDemos = etat.demonstrations.some((d) => d.noeud_id === a.id)
  const gauche = a.admis && !aDemos
    ? '<span class="champ">admis ✓</span>'
    : `${pin(a.id, 'e', 'd', { couleur: TYPES.conclusion.couleur, plein: relies.has(`${a.id}|e|d`) })}<span class="lab">démontré par</span>`
  const droite = `<span class="lab">${TYPES[t].libelle}</span>${pin(a.id, 's', 'v', { couleur: TYPES[t].couleur, plein: relies.has(`${a.id}|s|v`) })}`
  return `
    <div class="nd pur" data-id="${a.id}" style="width:${L_ASSERTION}px" title="${esc(a.enonce)}">
      <div class="tete"><span class="ico">ƒ</span><span class="nom" data-renommer>${esc(a.nom)}</span></div>
      ${a.enonce ? `<div class="enonce">${esc(a.enonce)}</div>` : ''}
      <div class="corps">${rang(gauche, droite)}</div>
      <div class="pied"><span class="pastille" style="background:${s.couleur}"></span>${s.libelle}</div>
    </div>`
}

function htmlDemo(d, relies) {
  const v = VALIDITES[d.validite] ?? VALIDITES.a_verifier
  const lignes = d.justifie_par.map((p, i) => pin(d.id, 'e', `p${i}`, { couleur: couleurAssertion(p), plein: true }) + `<span class="lab">${esc(nomAssertion(p))}</span>`)
  lignes.push(`${pin(d.id, 'e', 'p+', { couleur: '#a1a1aa' })}<span class="lab vide">+ prémisse</span>`)
  const sortie = `<span class="lab">démontre</span>${pin(d.id, 's', 'v', { couleur: TYPES.conclusion.couleur, plein: relies.has(`${d.id}|s|v`) })}`
  const conf = d.confiance == null ? '—' : d.confiance.toFixed(2).replace('.', ',')
  return `
    <div class="nd demo" data-id="${d.id}" style="width:${L_DEMO}px" title="${esc(d.demonstration)}">
      <div class="tete"><span class="ico">ƒ</span><span class="nom" data-renommer>${esc(d.nom_demonstration)}</span></div>
      <div class="corps">${lignes.map((g, i) => rang(g, i === 0 ? sortie : '')).join('')}</div>
      <div class="pied"><span class="pastille" style="background:${v.couleur}"></span>${v.libelle}<span class="conf" title="Confiance">${conf}</span></div>
    </div>`
}

function htmlFlux(e, relies) {
  const f = FLUX[e.genre]
  const pl = (cote, k) => relies.has(`${e.id}|${cote}|${k}`)
  const gauche = []
  const droite = []
  if (e.genre !== 'evenement') gauche.push(pin(e.id, 'e', 'in', { exec: true, plein: pl('e', 'in') }))
  if (e.genre === 'branch') {
    const cond = e.condition
      ? `<span class="lab">${esc(nomAssertion(e.condition))}</span>`
      : `<input type="checkbox" data-action="valeur" ${e.valeur ? 'checked' : ''} title="Valeur si non reliée">`
    gauche.push(`${pin(e.id, 'e', 'c', { couleur: COULEUR_BOOL, plein: !!e.condition })}<span class="lab">Condition</span>${cond}`)
    droite.push(`<span class="lab">Vrai</span>${pin(e.id, 's', 'vrai', { exec: true, plein: pl('s', 'vrai') })}`)
    droite.push(`<span class="lab">Faux</span>${pin(e.id, 's', 'faux', { exec: true, plein: pl('s', 'faux') })}`)
  } else if (e.genre === 'sequence') {
    for (let i = 0; i < e.sorties; i++) droite.push(`<span class="lab">Puis ${i}</span>${pin(e.id, 's', `t${i}`, { exec: true, plein: pl('s', `t${i}`) })}`)
    droite.push('<span class="lab vide">Ajouter une broche</span><span class="pin" style="cursor:pointer">+</span>')
  } else {
    droite.push(pin(e.id, 's', 'x', { exec: true, plein: pl('s', 'x') }))
  }
  if (e.genre === 'etape') {
    e.entrees.forEach((a, i) => gauche.push(`${pin(e.id, 'e', `i${i}`, { couleur: couleurAssertion(a), plein: true })}<span class="lab">${esc(nomAssertion(a))}</span>`))
    gauche.push(`${pin(e.id, 'e', 'i+', { couleur: '#a1a1aa' })}<span class="lab vide">+ entrée</span>`)
  }
  const n = Math.max(gauche.length, droite.length)
  const lignes = []
  for (let i = 0; i < n; i++) {
    const ajout = e.genre === 'sequence' && i === droite.length - 1
    const cls = `${i === 0 ? ' exec' : ''}${ajout ? ' ajout' : ''}`
    lignes.push(ajout
      ? `<div class="rang${cls}" data-action="ajouter-sortie"><div class="g">${gauche[i] ?? ''}</div><div class="d">${droite[i] ?? ''}</div></div>`
      : rang(gauche[i], droite[i], cls))
  }
  return `
    <div class="nd flux ${e.genre}" data-id="${e.id}" style="width:${f.l}px;--tc:${f.couleur}">
      <div class="tete"><span class="ico">${f.ico}</span><div class="tt"><b class="nom" data-renommer>${esc(e.titre)}</b><small>${f.libelle}</small></div></div>
      <div class="corps">${lignes.join('')}</div>
      ${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}
    </div>`
}

function rendre() {
  statuts = calculerStatuts(etat.assertions, etat.demonstrations)
  const fils = listerFils()
  const relies = new Set(fils.flatMap((f) => [f.de.join('|'), f.vers.join('|')]))
  coucheNoeuds.innerHTML = [
    ...etat.assertions.map((a) => htmlAssertion(a, relies)),
    ...etat.demonstrations.map((d) => htmlDemo(d, relies)),
    ...etat.etapes.map((e) => htmlFlux(e, relies)),
  ].join('')
  coucheComment.innerHTML = etat.commentaires.map((c) => `
    <div class="cm" data-id="${c.id}" style="--c:${c.couleur}">
      <div class="c-titre" data-renommer>${esc(c.titre)}</div>
      <div class="c-poignee"></div>
    </div>`).join('')
  elements.clear()
  for (const el of scene.querySelectorAll('[data-id]')) elements.set(el.dataset.id, el)
  mesurer()
  placer()
  majSelection()
  majBarre()
  sauver()
}

function mesurer() {
  tailles.clear()
  decalages.clear()
  for (const el of coucheNoeuds.children) {
    const id = el.dataset.id
    tailles.set(id, { l: el.offsetWidth, h: el.offsetHeight })
    const d = {}
    for (const p of el.querySelectorAll('[data-pin]')) {
      const [, cote, k] = p.dataset.pin.split('|')
      d[`${cote}|${k}`] = { x: el.clientLeft + p.offsetLeft + p.offsetWidth / 2, y: el.clientTop + p.offsetTop + p.offsetHeight / 2 }
    }
    decalages.set(id, d)
  }
}

function posBroche(id, cote, k) {
  const t = trouver(id)
  const d = decalages.get(id)?.[`${cote}|${k}`]
  if (!t || !d) return null
  return { x: t.o.x + d.x, y: t.o.y + d.y }
}

function courbe(a, b) {
  const dx = Math.max(50, Math.abs(b.x - a.x) * 0.5, b.x < a.x ? Math.min(220, Math.abs(b.y - a.y) * 0.5) : 0)
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)}C${(a.x + dx).toFixed(1)},${a.y.toFixed(1)} ${(b.x - dx).toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`
}

// Positions des nœuds et des boîtes, tracé des fils ; appelé à chaque déplacement (sans reconstruire).
function placer() {
  for (const o of tousLesNoeuds()) {
    const el = elements.get(o.id)
    if (el) el.style.transform = `translate(${o.x}px,${o.y}px)`
  }
  for (const c of etat.commentaires) {
    const el = elements.get(c.id)
    if (!el) continue
    el.style.transform = `translate(${c.x}px,${c.y}px)`
    el.style.width = `${c.l}px`
    el.style.height = `${c.h}px`
  }
  const parcours = pas ? ordreExecution() : null
  const parcourus = new Set()
  let courant = null
  if (parcours) {
    pas.i = Math.min(pas.i, parcours.ordre.length - 1)
    for (let i = 1; i <= pas.i; i++) parcourus.add(parcours.via.get(parcours.ordre[i]))
    courant = etat.etapes.find((e) => e.id === parcours.ordre[pas.i])
  }
  const entreesActives = new Set(courant ? [...courant.entrees, courant.condition].filter(Boolean) : [])
  let html = ''
  for (const f of listerFils()) {
    const a = posBroche(...f.de)
    const b = posBroche(...f.vers)
    if (!a || !b) continue
    const d = courbe(a, b)
    const etatPas = f.exec ? (parcourus.has(f.cle) ? ' parcouru' : '') : (courant && f.vers[0] === courant.id && entreesActives.has(f.de[0]) ? ' actif' : '')
    const style = f.exec ? '' : ` style="stroke:${f.couleur}"`
    html += `<path class="fil-hit" data-fil="${f.cle}" d="${d}"/><path class="fil ${f.exec ? 'exec' : 'donnee'}${etatPas}" d="${d}"${style}/>`
  }
  gFils.innerHTML = html
  scene.classList.toggle('pas', !!parcours)
  for (const e of etat.etapes) {
    const el = elements.get(e.id)
    if (!el) continue
    el.classList.toggle('courant', !!courant && courant.id === e.id)
    el.classList.toggle('atteint', !!parcours && parcours.ordre.indexOf(e.id) !== -1 && parcours.ordre.indexOf(e.id) <= pas.i)
  }
  for (const a of etat.assertions) elements.get(a.id)?.classList.toggle('entree-active', entreesActives.has(a.id))
  if (parcours) {
    const n = parcours.ordre.length
    pasLib.textContent = courant ? `${pas.i + 1}/${n} · ${courant.titre}` : 'Aucun événement'
    pasLib.title = pasLib.textContent
  }
  appliquerVue()
}

function appliquerVue() {
  monde.style.transform = `translate(${vue.x}px,${vue.y}px) scale(${vue.k})`
  const g = 128 * vue.k
  const f = GRILLE * vue.k
  scene.style.backgroundSize = `${g}px ${g}px, ${g}px ${g}px, ${f}px ${f}px, ${f}px ${f}px`
  scene.style.backgroundPosition = `${vue.x}px ${vue.y}px`
}

function majSelection() {
  for (const [id, el] of elements) el.classList.toggle('choisi', selection.has(id))
  rendreDetails()
}

function majBarre() {
  const n = {}
  for (const s of Object.values(statuts)) n[s] = (n[s] || 0) + 1
  compteurs.innerHTML = Object.entries(STATUTS).filter(([k]) => n[k])
    .map(([k, s]) => `<span title="${s.libelle}"><i class="pastille" style="background:${s.couleur}"></i><b>${n[k]}</b></span>`).join('')
  barre.querySelector('[data-a="annuler"]').disabled = !historique.length
  barre.querySelector('[data-a="retablir"]').disabled = !futur.length
  barre.querySelector('[data-a="pas"]').classList.toggle('actif', !!pas)
  pasNav.hidden = !pas
}

// ─── Pas à pas : parcours du fil d'exécution depuis l'événement ─────────────────────────────────────

function ordreExecution() {
  const ordre = []
  const via = new Map()
  const vus = new Set()
  const visiter = (id, cle) => {
    if (vus.has(id)) return
    const e = etat.etapes.find((x) => x.id === id)
    if (!e) return
    vus.add(id)
    ordre.push(id)
    if (cle) via.set(id, cle)
    let sorties = ['x']
    if (e.genre === 'sequence') sorties = Array.from({ length: e.sorties }, (_, i) => `t${i}`)
    if (e.genre === 'branch') {
      const vrai = e.condition ? statuts[e.condition] === 'etabli' : e.valeur
      sorties = [vrai ? 'vrai' : 'faux']
    }
    for (const k of sorties) {
      const l = etat.liens.find((m) => m.de === id && m.k === k)
      if (l) visiter(l.vers, `x|${id}|${k}`)
    }
  }
  const ev = etat.etapes.find((e) => e.genre === 'evenement')
  if (ev) visiter(ev.id, null)
  return { ordre, via }
}

function basculerPas() {
  pas = pas ? null : { i: 0 }
  placer()
  majBarre()
}

function avancer(delta) {
  if (!pas) return
  const n = ordreExecution().ordre.length
  pas.i = Math.max(0, Math.min(n - 1, pas.i + delta))
  const id = ordreExecution().ordre[pas.i]
  placer()
  if (id) centrerSur(id)
}

// ─── Vue : zoom, cadrage ─────────────────────────────────────────────────────────────────────────────

const versMonde = (cx, cy) => {
  const r = scene.getBoundingClientRect()
  return { x: (cx - r.left - vue.x) / vue.k, y: (cy - r.top - vue.y) / vue.k }
}

function boite(id) {
  const t = trouver(id)
  if (!t) return null
  if (t.genre === 'commentaire') return { x: t.o.x, y: t.o.y, l: t.o.l, h: t.o.h }
  const s = tailles.get(id) ?? { l: 200, h: 80 }
  return { x: t.o.x, y: t.o.y, l: s.l, h: s.h }
}

function englobant(ids) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const id of ids) {
    const b = boite(id)
    if (!b) continue
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.l); y1 = Math.max(y1, b.y + b.h)
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, l: x1 - x0, h: y1 - y0 } : null
}

function cadrer() {
  const ids = selection.size ? [...selection] : [...tousLesNoeuds(), ...etat.commentaires].map((o) => o.id)
  const b = englobant(ids)
  if (!b) return
  const L = scene.clientWidth
  const H = scene.clientHeight
  const k = Math.max(K_MIN, Math.min(1.1, (L - 80) / b.l, (H - 140) / b.h))
  vue = { k, x: (L - b.l * k) / 2 - b.x * k, y: (H - 60 - b.h * k) / 2 - b.y * k }
  appliquerVue()
}

function centrerSur(id) {
  const b = boite(id)
  if (!b) return
  const L = scene.clientWidth
  const H = scene.clientHeight
  vue.k = Math.max(vue.k, 0.55)
  vue.x = L / 2 - (b.x + b.l / 2) * vue.k
  vue.y = H / 2 - (b.y + b.h / 2) * vue.k
  appliquerVue()
}

scene.addEventListener('wheel', (e) => {
  if (e.target.closest('.legende-bp')) return
  e.preventDefault()
  const r = scene.getBoundingClientRect()
  const px = e.clientX - r.left
  const py = e.clientY - r.top
  const k = Math.max(K_MIN, Math.min(K_MAX, vue.k * Math.exp(-e.deltaY * 0.0015)))
  vue = { k, x: px - (px - vue.x) * (k / vue.k), y: py - (py - vue.y) * (k / vue.k) }
  appliquerVue()
}, { passive: false })

// ─── Gestes à la souris ──────────────────────────────────────────────────────────────────────────────

let geste = null

const lirePin = (el) => {
  const [id, cote, k] = el.dataset.pin.split('|')
  return { id, cote, k }
}

function contenus(c) {
  // Nœuds et boîtes dont le centre est dans la boîte : ils suivent la boîte quand on la déplace.
  const dans = (b) => b.x + b.l / 2 >= c.x && b.x + b.l / 2 <= c.x + c.l && b.y + b.h / 2 >= c.y && b.y + b.h / 2 <= c.y + c.h
  const ids = []
  for (const o of tousLesNoeuds()) if (dans(boite(o.id))) ids.push(o.id)
  for (const k of etat.commentaires) if (k !== c && k.l * k.h < c.l * c.h && dans(k)) ids.push(k.id)
  return ids
}

scene.addEventListener('contextmenu', (e) => e.preventDefault())

scene.addEventListener('pointerdown', (e) => {
  fermerMenu()
  if (e.target.closest('.legende-bp, input, [data-action]')) return
  const pinEl = e.target.closest('[data-pin]')
  if (e.button === 1 || e.button === 2) {
    e.preventDefault()
    geste = { type: 'pan', bouton: e.button, cx: e.clientX, cy: e.clientY, vx: vue.x, vy: vue.y, bouge: false, cible: e.target }
    return
  }
  if (e.button !== 0) return
  if (pinEl) {
    const p = lirePin(pinEl)
    if (e.altKey) { couperBroche(p); return }
    commencerFil(p, e)
    return
  }
  const filEl = e.target.closest('[data-fil]')
  if (filEl) {
    if (e.altKey) couperFil(filEl.dataset.fil)
    return
  }
  const poignee = e.target.closest('.c-poignee')
  if (poignee) {
    const c = trouver(poignee.parentElement.dataset.id).o
    geste = { type: 'redim', c, cx: e.clientX, cy: e.clientY, l: c.l, h: c.h, bouge: false }
    return
  }
  const cible = e.target.closest('.nd, .c-titre')
  if (cible) {
    const id = (cible.closest('[data-id]')).dataset.id
    if (e.ctrlKey || e.metaKey) {
      if (selection.has(id)) selection.delete(id)
      else selection.add(id)
      majSelection()
      if (!selection.has(id)) return
    } else if (e.shiftKey) {
      selection.add(id)
      majSelection()
    } else if (!selection.has(id)) {
      selection = new Set([id])
      majSelection()
    }
    const mobiles = new Set(selection)
    for (const s of selection) {
      const t = trouver(s)
      if (t?.genre === 'commentaire') contenus(t.o).forEach((x) => mobiles.add(x))
    }
    const depart = new Map([...mobiles].map((m) => [m, { x: trouver(m).o.x, y: trouver(m).o.y }]))
    geste = { type: 'deplacer', id, depart, cx: e.clientX, cy: e.clientY, bouge: false, seul: !e.shiftKey && !e.ctrlKey }
    return
  }
  if (e.shiftKey || e.ctrlKey) {
    const m = versMonde(e.clientX, e.clientY)
    geste = { type: 'rect', x0: m.x, y0: m.y, cx: e.clientX, cy: e.clientY, base: new Set(e.shiftKey ? selection : []), bouge: false }
    return
  }
  geste = { type: 'pan', bouton: 0, cx: e.clientX, cy: e.clientY, vx: vue.x, vy: vue.y, bouge: false, cible: e.target }
})

window.addEventListener('pointermove', (e) => {
  if (!geste) return
  const dx = e.clientX - geste.cx
  const dy = e.clientY - geste.cy
  if (!geste.bouge && Math.hypot(dx, dy) < 4) return
  geste.bouge = true
  if (geste.type === 'pan') {
    scene.classList.add('pan')
    vue.x = geste.vx + dx
    vue.y = geste.vy + dy
    appliquerVue()
  } else if (geste.type === 'deplacer') {
    if (!geste.historise) { avant(); geste.historise = true }
    const mx = surGrille(dx / vue.k)
    const my = surGrille(dy / vue.k)
    for (const [id, p] of geste.depart) {
      const o = trouver(id).o
      o.x = p.x + mx
      o.y = p.y + my
    }
    placer()
  } else if (geste.type === 'redim') {
    if (!geste.historise) { avant(); geste.historise = true }
    geste.c.l = Math.max(160, surGrille(geste.l + dx / vue.k))
    geste.c.h = Math.max(80, surGrille(geste.h + dy / vue.k))
    placer()
  } else if (geste.type === 'rect') {
    const r = scene.getBoundingClientRect()
    const x = Math.min(e.clientX, geste.cx) - r.left
    const y = Math.min(e.clientY, geste.cy) - r.top
    Object.assign(rectangle.style, { left: `${x}px`, top: `${y}px`, width: `${Math.abs(dx)}px`, height: `${Math.abs(dy)}px` })
    rectangle.hidden = false
    const m = versMonde(e.clientX, e.clientY)
    const z = { x: Math.min(m.x, geste.x0), y: Math.min(m.y, geste.y0), x1: Math.max(m.x, geste.x0), y1: Math.max(m.y, geste.y0) }
    selection = new Set(geste.base)
    for (const o of tousLesNoeuds()) {
      const b = boite(o.id)
      if (b.x < z.x1 && b.x + b.l > z.x && b.y < z.y1 && b.y + b.h > z.y) selection.add(o.id)
    }
    for (const el of elements.values()) el.classList.toggle('choisi', selection.has(el.dataset.id))
  } else if (geste.type === 'fil') {
    const m = versMonde(e.clientX, e.clientY)
    const a = geste.origine
    const [p, q] = geste.depart.cote === 's' ? [a, m] : [m, a]
    gTemp.innerHTML = `<path class="fil temp ${geste.exec ? 'exec' : 'donnee'}" d="${courbe(p, q)}"${geste.exec ? '' : ` style="stroke:${geste.couleur}"`}/>`
  }
})

window.addEventListener('pointerup', (e) => {
  const g = geste
  geste = null
  if (!g) return
  scene.classList.remove('pan')
  if (g.type === 'pan') {
    if (!g.bouge && g.bouton === 2) ouvrirMenuContextuel(e, g.cible)
    else if (!g.bouge && g.bouton === 0 && selection.size) { selection.clear(); majSelection() }
  } else if (g.type === 'deplacer') {
    if (g.bouge) { rendreDetails(); majBarre(); sauver() } else if (g.seul && selection.size > 1) { selection = new Set([g.id]); majSelection() }
  } else if (g.type === 'redim') {
    if (g.bouge) { majBarre(); sauver() }
  } else if (g.type === 'rect') {
    rectangle.hidden = true
    majSelection()
  } else if (g.type === 'fil') {
    scene.classList.remove('tire')
    gTemp.innerHTML = ''
    for (const el of scene.querySelectorAll('.pin.ok, .pin.ko')) el.classList.remove('ok', 'ko')
    const cible = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pin]')
    if (cible) {
      relier(g.depart, lirePin(cible))
    } else if (g.bouge && scene.contains(document.elementFromPoint(e.clientX, e.clientY))) {
      ouvrirMenuCreation(e, g.depart)
    }
  }
})

function commencerFil(p, e) {
  const a = posBroche(p.id, p.cote, p.k)
  if (!a) return
  const t = trouver(p.id)
  const exec = t.genre === 'flux' && !estDonneeFlux(p.k)
  let couleur = '#a1a1aa'
  if (t.genre === 'assertion') couleur = p.cote === 's' ? couleurAssertion(p.id) : TYPES.conclusion.couleur
  if (t.genre === 'demo') couleur = p.cote === 's' ? TYPES.conclusion.couleur : '#71717a'
  if (p.k === 'c') couleur = COULEUR_BOOL
  geste = { type: 'fil', depart: p, origine: a, exec, couleur, cx: e.clientX, cy: e.clientY, bouge: false }
  scene.classList.add('tire')
  for (const el of scene.querySelectorAll('[data-pin]')) {
    const ok = !!planLien(p, lirePin(el))
    el.classList.add(ok ? 'ok' : 'ko')
  }
}

function couperFil(cle) {
  const f = listerFils().find((x) => x.cle === cle)
  if (!f) return
  avant()
  f.couper()
  rendre()
}

function couperBroche(p) {
  const cle = `${p.id}|${p.cote}|${p.k}`
  const touches = listerFils().filter((f) => f.de.join('|') === cle || f.vers.join('|') === cle)
  if (!touches.length) return
  avant()
  // Couper de la fin vers le début : les index des prémisses et des entrées restent valides.
  touches.reverse().forEach((f) => f.couper())
  rendre()
}

// ─── Renommage en place ──────────────────────────────────────────────────────────────────────────────

scene.addEventListener('dblclick', (e) => {
  const cible = e.target.closest('[data-renommer]')
  if (cible) renommer(cible.closest('[data-id]').dataset.id)
})

function champNom(t) {
  if (t.genre === 'assertion') return 'nom'
  if (t.genre === 'demo') return 'nom_demonstration'
  return 'titre'
}

function renommer(id) {
  const t = trouver(id)
  const el = elements.get(id)?.querySelector('[data-renommer]')
  if (!t || !el) return
  const champ = champNom(t)
  const input = document.createElement('input')
  input.value = t.o[champ]
  el.textContent = ''
  el.append(input)
  input.focus()
  input.select()
  let fini = false
  const terminer = (garder) => {
    if (fini) return
    fini = true
    const v = input.value.trim()
    if (garder && v && v !== t.o[champ]) {
      avant()
      t.o[champ] = v
    }
    rendre()
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') terminer(true)
    if (e.key === 'Escape') terminer(false)
  })
  input.addEventListener('blur', () => terminer(true))
  input.addEventListener('pointerdown', (e) => e.stopPropagation())
}

// ─── Actions portées par les nœuds (case Condition, broche ajoutée) ─────────────────────────────────

scene.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]')
  if (!a || a.dataset.action !== 'ajouter-sortie') return
  const e2 = trouver(a.closest('[data-id]').dataset.id).o
  avant()
  e2.sorties += 1
  rendre()
})

scene.addEventListener('change', (e) => {
  if (e.target.dataset.action !== 'valeur') return
  const o = trouver(e.target.closest('[data-id]').dataset.id).o
  avant()
  o.valeur = e.target.checked
  rendre()
})

// ─── Édition : supprimer, dupliquer, commentaire ─────────────────────────────────────────────────────

function supprimer(ids = [...selection]) {
  if (!ids.length) return
  avant()
  const s = new Set(ids)
  etat.assertions = etat.assertions.filter((a) => !s.has(a.id))
  etat.demonstrations = etat.demonstrations.filter((d) => !s.has(d.id))
  etat.etapes = etat.etapes.filter((e) => !s.has(e.id))
  etat.commentaires = etat.commentaires.filter((c) => !s.has(c.id))
  for (const d of etat.demonstrations) {
    d.justifie_par = d.justifie_par.filter((p) => !s.has(p))
    if (s.has(d.noeud_id)) d.noeud_id = null
  }
  for (const e of etat.etapes) {
    e.entrees = e.entrees.filter((a) => !s.has(a))
    if (s.has(e.condition)) e.condition = null
  }
  etat.liens = etat.liens.filter((l) => !s.has(l.de) && !s.has(l.vers))
  selection.clear()
  rendre()
}

function dupliquer() {
  if (!selection.size) return
  avant()
  const carte = new Map()
  const copies = []
  const D = 32
  for (const id of selection) {
    const t = trouver(id)
    const prefixe = { assertion: 'a', demo: 'd', flux: 'e', commentaire: 'k' }[t.genre]
    const c = { ...structuredClone(t.o), id: nouvelId(prefixe), x: t.o.x + D, y: t.o.y + D }
    const liste = { assertion: etat.assertions, demo: etat.demonstrations, flux: etat.etapes, commentaire: etat.commentaires }[t.genre]
    liste.push(c)
    carte.set(id, c.id)
    copies.push({ genre: t.genre, c })
  }
  // Seules les liaisons internes à la sélection sont conservées, comme dans l'éditeur d'Unreal.
  for (const { genre, c } of copies) {
    if (genre === 'demo') {
      c.justifie_par = c.justifie_par.map((p) => carte.get(p)).filter(Boolean)
      c.noeud_id = carte.get(c.noeud_id) ?? null
    }
    if (genre === 'flux') {
      c.entrees = c.entrees.map((a) => carte.get(a)).filter(Boolean)
      c.condition = carte.get(c.condition) ?? null
    }
  }
  for (const l of [...etat.liens]) {
    if (carte.has(l.de) && carte.has(l.vers)) etat.liens.push({ de: carte.get(l.de), k: l.k, vers: carte.get(l.vers) })
  }
  selection = new Set(carte.values())
  rendre()
}

function creerCommentaire() {
  avant()
  const noeuds = [...selection].filter((id) => trouver(id)?.genre !== 'commentaire')
  const b = englobant(noeuds)
  let c
  if (b) {
    c = { id: nouvelId('k'), titre: 'Nouvelle catégorie', couleur: COULEURS_COMMENT[0], x: b.x - 24, y: b.y - 46, l: b.l + 48, h: b.h + 70 }
  } else {
    const m = versMonde(scene.getBoundingClientRect().left + scene.clientWidth / 2, scene.getBoundingClientRect().top + scene.clientHeight / 2)
    c = { id: nouvelId('k'), titre: 'Nouvelle catégorie', couleur: COULEURS_COMMENT[0], x: surGrille(m.x - 200), y: surGrille(m.y - 120), l: 400, h: 240 }
  }
  etat.commentaires.push(c)
  selection = new Set([c.id])
  rendre()
  renommer(c.id)
}

function reinitialiser() {
  avant()
  pas = null
  selection.clear()
  etat = etatExemple()
  rendre()
  disposer(etat, (id) => tailles.get(id))
  rendre()
  cadrer()
}

// ─── Menus ───────────────────────────────────────────────────────────────────────────────────────────

let menuEtat = null

function ouvrirMenu(cx, cy, titre, items, sousTitre = '') {
  menuEtat = { items, actif: 0, filtre: '' }
  menu.innerHTML = `
    <div class="m-titre"><span>${esc(titre)}</span><small>${esc(sousTitre)}</small></div>
    <input type="search" placeholder="Rechercher…" spellcheck="false">
    <ul></ul>`
  menu.hidden = false
  const L = 290
  const H = Math.min(420, 90 + items.length * 26)
  menu.style.left = `${Math.min(cx, window.innerWidth - L - 8)}px`
  menu.style.top = `${Math.min(cy, window.innerHeight - H - 8)}px`
  const input = menu.querySelector('input')
  input.addEventListener('input', () => { menuEtat.filtre = input.value; menuEtat.actif = 0; listerMenu() })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const vis = itemsVisibles()
    if (e.key === 'ArrowDown') { menuEtat.actif = Math.min(vis.length - 1, menuEtat.actif + 1); listerMenu(); e.preventDefault() }
    if (e.key === 'ArrowUp') { menuEtat.actif = Math.max(0, menuEtat.actif - 1); listerMenu(); e.preventDefault() }
    if (e.key === 'Enter' && vis[menuEtat.actif]) executer(vis[menuEtat.actif])
    if (e.key === 'Escape') fermerMenu()
  })
  listerMenu()
  input.focus()
}

function itemsVisibles() {
  const f = sansAccents(menuEtat.filtre.trim())
  return menuEtat.items.filter((it) => !f || sansAccents(`${it.lib} ${it.cat}`).includes(f))
}

function listerMenu() {
  const vis = itemsVisibles()
  let cat = null
  let html = ''
  vis.forEach((it, i) => {
    if (it.cat !== cat) { cat = it.cat; html += `<li class="m-cat">${esc(cat)}</li>` }
    html += `<li class="m-item${i === menuEtat.actif ? ' actif' : ''}" data-i="${i}"><span>${esc(it.lib)}</span><small>${esc(it.touche ?? '')}</small></li>`
  })
  const ul = menu.querySelector('ul')
  ul.innerHTML = html || '<li class="m-vide">Aucune action</li>'
  ul.querySelector('.actif')?.scrollIntoView({ block: 'nearest' })
}

function executer(it) {
  fermerMenu()
  it.faire()
}

menu.addEventListener('pointerdown', (e) => e.stopPropagation())
menu.addEventListener('click', (e) => {
  const li = e.target.closest('.m-item')
  if (li) executer(itemsVisibles()[Number(li.dataset.i)])
})
menu.addEventListener('mousemove', (e) => {
  const li = e.target.closest('.m-item')
  if (!li || Number(li.dataset.i) === menuEtat.actif) return
  menuEtat.actif = Number(li.dataset.i)
  for (const x of menu.querySelectorAll('.m-item')) x.classList.toggle('actif', x === li)
})
window.addEventListener('pointerdown', () => fermerMenu())

function fermerMenu() {
  if (menu.hidden) return
  menu.hidden = true
  menuEtat = null
}

function itemsCreation(x, y, depart) {
  const c = (lib, cat, genre) => ({ lib, cat, faire: () => creerDepuis(genre, x, y, depart) })
  return {
    flux: [c('Étape de méthode', 'Flux d’exécution', 'etape'), c('Branch', 'Flux d’exécution', 'branch'), c('Sequence', 'Flux d’exécution', 'sequence'), c('Événement « Problème posé »', 'Flux d’exécution', 'evenement')],
    assertion: [c('Assertion · fait admis', 'Raisonnement', 'fait'), c('Assertion · hypothèse', 'Raisonnement', 'hypothese')],
    demo: [c('Démonstration', 'Raisonnement', 'demo')],
  }
}

function ouvrirMenuContextuel(e, cible) {
  const m = versMonde(e.clientX, e.clientY)
  const nd = cible?.closest?.('[data-id]')
  if (nd && trouver(nd.dataset.id)) {
    const id = nd.dataset.id
    if (!selection.has(id)) { selection = new Set([id]); majSelection() }
    const t = trouver(id)
    const items = [
      { lib: 'Renommer', cat: 'Nœud', touche: 'F2', faire: () => renommer(id) },
      { lib: 'Dupliquer', cat: 'Nœud', touche: 'Ctrl+D', faire: dupliquer },
      { lib: 'Supprimer', cat: 'Nœud', touche: 'Suppr', faire: () => supprimer() },
      { lib: 'Couper toutes les liaisons', cat: 'Nœud', faire: () => couperLiaisons(id) },
    ]
    if (t.genre === 'assertion') items.push({ lib: t.o.admis ? 'Ne plus admettre' : 'Admettre (fait établi)', cat: 'Nœud', faire: () => modifier(t.o, 'admis', !t.o.admis) })
    if (t.genre !== 'commentaire') items.push({ lib: 'Commentaire autour de la sélection', cat: 'Organisation', touche: 'C', faire: creerCommentaire })
    ouvrirMenu(e.clientX, e.clientY, 'Actions du nœud', items, t.genre === 'commentaire' ? t.o.titre : '')
    return
  }
  const cr = itemsCreation(m.x, m.y, null)
  ouvrirMenu(e.clientX, e.clientY, 'Toutes les actions', [
    ...cr.flux, ...cr.assertion, ...cr.demo,
    { lib: 'Commentaire', cat: 'Organisation', touche: 'C', faire: creerCommentaire },
    { lib: 'Cadrer', cat: 'Organisation', touche: 'F', faire: cadrer },
    { lib: 'Tout sélectionner', cat: 'Organisation', touche: 'Ctrl+A', faire: toutSelectionner },
    { lib: pas ? 'Quitter le pas à pas' : 'Pas à pas', cat: 'Organisation', faire: basculerPas },
    { lib: 'Réinitialiser l’exemple', cat: 'Organisation', faire: reinitialiser },
  ], 'contexte : graphe')
}

function ouvrirMenuCreation(e, depart) {
  const m = versMonde(e.clientX, e.clientY)
  const cr = itemsCreation(m.x, m.y, depart)
  const t = trouver(depart.id)
  let items = []
  let sous = ''
  if (t.genre === 'flux' && !estDonneeFlux(depart.k)) { items = cr.flux.filter((it) => depart.cote === 'e' || !it.lib.startsWith('Événement')); sous = 'depuis une broche d’exécution' }
  else if (t.genre === 'flux') { items = cr.assertion; sous = 'entrée d’étape' }
  else if (t.genre === 'assertion' && depart.cote === 's') { items = [...cr.demo, cr.flux[0]]; sous = `depuis « ${t.o.nom} »` }
  else if (t.genre === 'assertion') { items = cr.demo; sous = `démontrer « ${t.o.nom} »` }
  else if (depart.cote === 'e') { items = cr.assertion; sous = 'nouvelle prémisse' }
  else { items = [cr.assertion[1]]; sous = 'nouvelle conclusion' }
  ouvrirMenu(e.clientX, e.clientY, 'Créer et relier', items, sous)
}

function couperLiaisons(id) {
  const touches = listerFils().filter((f) => f.de[0] === id || f.vers[0] === id)
  if (!touches.length) return
  avant()
  touches.reverse().forEach((f) => f.couper())
  rendre()
}

function toutSelectionner() {
  selection = new Set(tousLesNoeuds().map((o) => o.id))
  majSelection()
}

function modifier(o, champ, valeur) {
  if (o[champ] === valeur) return
  avant()
  o[champ] = valeur
  rendre()
}

// ─── Panneau Détails ─────────────────────────────────────────────────────────────────────────────────

function ligne(dt, dd, ctl = false) {
  return `<div><dt>${dt}</dt><dd${ctl ? ' class="ctl"' : ''}>${dd}</dd></div>`
}
const liensVers = (ids) => ids.length ? ids.map((id) => `<span class="lien" data-aller="${id}">${esc(trouver(id)?.o.nom ?? trouver(id)?.o.nom_demonstration ?? trouver(id)?.o.titre ?? id)}</span>`).join('') : '<span style="color:var(--texte-3)">—</span>'

function rendreDetails() {
  const ids = [...selection]
  let tete = ''
  let corps = ''
  if (ids.length === 1 && trouver(ids[0])) {
    const { genre, o } = trouver(ids[0])
    if (genre === 'assertion') {
      const t = typeAssertion(o)
      const s = STATUTS[statuts[o.id]]
      const demos = etat.demonstrations.filter((d) => d.noeud_id === o.id).map((d) => d.id)
      const utilise = [...etat.demonstrations.filter((d) => d.justifie_par.includes(o.id)).map((d) => d.id), ...etat.etapes.filter((e) => e.entrees.includes(o.id) || e.condition === o.id).map((e) => e.id)]
      tete = enTete('ƒ', '#3f7a2e', 'Assertion · nœud pur', o.nom)
      corps = section('Assertion', [
        ligne('Nom', `<input type="text" data-champ="nom" value="${esc(o.nom)}">`, true),
        ligne('Énoncé', `<textarea data-champ="enonce">${esc(o.enonce)}</textarea>`, true),
        ligne('Admis', `<label><input type="checkbox" data-champ="admis" ${o.admis ? 'checked' : ''}> fait établi sans démonstration</label>`),
        ligne('Type', `<span class="pastille" style="background:${TYPES[t].couleur}"></span>${TYPES[t].libelle}`),
        ligne('Statut', `<span class="pastille" style="background:${s.couleur}"></span>${s.libelle} <span style="color:var(--texte-3)">(recalculé)</span>`),
      ]) + section('Liaisons', [ligne('Démontré par', liensVers(demos)), ligne('Utilisé par', liensVers(utilise))])
    } else if (genre === 'demo') {
      tete = enTete('ƒ', '#475569', 'Démonstration · nœud fonction', o.nom_demonstration)
      corps = section('Démonstration', [
        ligne('Nom', `<input type="text" data-champ="nom_demonstration" value="${esc(o.nom_demonstration)}">`, true),
        ligne('Raisonnement', `<textarea data-champ="demonstration">${esc(o.demonstration)}</textarea>`, true),
        ligne('Validité', `<select data-champ="validite">${Object.entries(VALIDITES).map(([k, v]) => `<option value="${k}"${o.validite === k ? ' selected' : ''}>${v.libelle}</option>`).join('')}</select>`, true),
        ligne('Confiance', `<input type="number" min="0" max="1" step="0.01" data-champ="confiance" value="${o.confiance ?? ''}" placeholder="non notée">`, true),
        ligne('Auteur', `<input type="text" data-champ="auteur" value="${esc(o.auteur)}">`, true),
      ]) + section('Liaisons', [ligne('Prémisses', liensVers(o.justifie_par.filter((p) => trouver(p)))), ligne('Démontre', liensVers(o.noeud_id && trouver(o.noeud_id) ? [o.noeud_id] : []))])
    } else if (genre === 'flux') {
      const f = FLUX[o.genre]
      const couleurs = { evenement: '#a4442e', etape: '#2f5d8c', branch: '#52525b', sequence: '#52525b' }
      tete = enTete(f.ico, couleurs[o.genre], f.libelle, o.titre)
      const lignes = [
        ligne('Titre', `<input type="text" data-champ="titre" value="${esc(o.titre)}">`, true),
        ligne(o.genre === 'evenement' ? 'Problème' : 'Note', `<textarea data-champ="note">${esc(o.note)}</textarea>`, true),
      ]
      if (o.genre === 'sequence') lignes.push(ligne('Sorties', `<input type="number" min="1" max="12" step="1" data-champ="sorties" value="${o.sorties}">`, true))
      if (o.genre === 'branch') lignes.push(ligne('Condition', o.condition ? `${liensVers([o.condition])}<span style="color:var(--texte-3)">vraie si l’assertion est établie</span>` : `<label><input type="checkbox" data-champ="valeur" ${o.valeur ? 'checked' : ''}> vraie (non reliée)</label>`))
      if (o.genre === 'etape') lignes.push(ligne('Entrées', liensVers(o.entrees.filter((a) => trouver(a)))))
      corps = section('Étape', lignes)
    } else {
      tete = enTete('▭', o.couleur, 'Commentaire · catégorie', o.titre)
      corps = section('Commentaire', [
        ligne('Titre', `<input type="text" data-champ="titre" value="${esc(o.titre)}">`, true),
        ligne('Couleur', `<div class="nuancier">${COULEURS_COMMENT.map((c) => `<button data-couleur="${c}" class="${c === o.couleur ? 'actif' : ''}" style="background:${c}" title="${c}"></button>`).join('')}</div>`),
        ligne('Contient', `${contenus(o).filter((x) => trouver(x)?.genre !== 'commentaire').length} nœuds`),
      ])
    }
    corps += '<div class="d-boutons"><button data-d="dupliquer">Dupliquer</button><button data-d="supprimer">Supprimer</button></div>'
  } else if (ids.length > 1) {
    tete = enTete(String(ids.length), '#52525b', 'Sélection multiple', `${ids.length} éléments`)
    corps = '<div class="d-boutons"><button data-d="commentaire">Commentaire autour</button><button data-d="dupliquer">Dupliquer</button><button data-d="supprimer">Supprimer</button></div>'
  } else {
    const ev = etat.etapes.find((e) => e.genre === 'evenement')
    tete = enTete('◆', '#a4442e', 'Graphe', 'Flux de résolution')
    corps = (ev ? section('Problème posé', [ligne('Énoncé', `<textarea data-champ="note" data-cible="${ev.id}">${esc(ev.note)}</textarea>`, true)]) : '') +
      section('Contenu', [
        ligne('Étapes', String(etat.etapes.length)),
        ligne('Assertions', String(etat.assertions.length)),
        ligne('Démonstrations', String(etat.demonstrations.length)),
        ligne('Catégories', String(etat.commentaires.length)),
      ]) +
      `<div class="d-section"><h3>Raccourcis</h3><ul class="raccourcis">
        ${[['Se déplacer', 'glisser le fond · clic droit'], ['Zoom', 'molette'], ['Cadrer', 'F'], ['Rectangle', 'Maj/Ctrl + glisser'], ['Relier', 'tirer une broche'], ['Couper', 'Alt + clic'], ['Actions', 'clic droit'], ['Renommer', 'double-clic · F2'], ['Commentaire', 'C'], ['Dupliquer', 'Ctrl+D'], ['Supprimer', 'Suppr'], ['Annuler · rétablir', 'Ctrl+Z · Ctrl+Y']]
          .map(([a, k]) => `<li><span>${a}</span><kbd>${k}</kbd></li>`).join('')}
      </ul></div>`
  }
  panneau.innerHTML = `<div class="d-onglet">Détails</div><div class="d-defil">${tete}${corps}</div>`
}

function enTete(ico, couleur, role, titre) {
  return `<div class="d-tete"><span class="d-ico" style="--tc:${couleur}">${esc(ico)}</span><div><div class="d-role">${esc(role)}</div><h2 class="d-titre">${esc(titre)}</h2></div></div>`
}

function section(titre, lignes) {
  return `<div class="d-section"><h3>${esc(titre)}</h3><dl class="props">${lignes.join('')}</dl></div>`
}

panneau.addEventListener('change', (e) => {
  const champ = e.target.dataset.champ
  if (!champ) return
  const id = e.target.dataset.cible ?? [...selection][0]
  const t = trouver(id)
  if (!t) return
  let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
  if (champ === 'confiance') v = v === '' ? null : Math.max(0, Math.min(1, Number(v)))
  if (champ === 'sorties') v = Math.max(1, Math.min(12, Math.round(Number(v)) || 1))
  if (typeof v === 'string' && ['nom', 'nom_demonstration', 'titre'].includes(champ) && !v.trim()) { rendreDetails(); return }
  if (champ === 'sorties') {
    avant()
    t.o.sorties = v
    etat.liens = etat.liens.filter((l) => l.de !== id || !l.k.startsWith('t') || Number(l.k.slice(1)) < v)
    rendre()
    return
  }
  modifier(t.o, champ, v)
})

panneau.addEventListener('click', (e) => {
  const aller = e.target.closest('[data-aller]')
  if (aller) { selection = new Set([aller.dataset.aller]); majSelection(); centrerSur(aller.dataset.aller); return }
  const coul = e.target.closest('[data-couleur]')
  if (coul) { modifier(trouver([...selection][0]).o, 'couleur', coul.dataset.couleur); return }
  const d = e.target.closest('[data-d]')?.dataset.d
  if (d === 'dupliquer') dupliquer()
  if (d === 'supprimer') supprimer()
  if (d === 'commentaire') creerCommentaire()
})

// ─── Clavier et barre d'outils ───────────────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
  const ctrl = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); annuler() }
  else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); retablir() }
  else if (ctrl && k === 'd') { e.preventDefault(); dupliquer() }
  else if (ctrl && k === 'a') { e.preventDefault(); toutSelectionner() }
  else if (ctrl) return
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); supprimer() }
  else if (k === 'c') creerCommentaire()
  else if (k === 'f') cadrer()
  else if (e.key === 'F2' && selection.size === 1) renommer([...selection][0])
  else if (pas && e.key === 'ArrowRight') avancer(1)
  else if (pas && e.key === 'ArrowLeft') avancer(-1)
  else if (e.key === 'Escape') { if (pas) basculerPas(); else { selection.clear(); majSelection() } }
})

barre.addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a
  if (a === 'annuler') annuler()
  if (a === 'retablir') retablir()
  if (a === 'commentaire') creerCommentaire()
  if (a === 'cadrer') cadrer()
  if (a === 'pas') basculerPas()
  if (a === 'precedent') avancer(-1)
  if (a === 'suivant') avancer(1)
  if (a === 'reinitialiser') reinitialiser()
})

// ─── Démarrage ───────────────────────────────────────────────────────────────────────────────────────

etat = charger()
if (etat) {
  rendre()
} else {
  etat = etatExemple()
  rendre()
  disposer(etat, (id) => tailles.get(id))
  rendre()
}
cadrer()
// Graphe entier illisible à cette échelle : on part du haut du flux, à une échelle où le texte se lit.
if (vue.k < 0.55) {
  const b = englobant([...tousLesNoeuds(), ...etat.commentaires].map((o) => o.id))
  const ev = etat.etapes.find((e) => e.genre === 'evenement')
  vue.k = 0.62
  vue.x = 40 - (ev ? Math.max(b.x, ev.x - 420) : b.x) * vue.k
  vue.y = 40 - b.y * vue.k
  appliquerVue()
}
