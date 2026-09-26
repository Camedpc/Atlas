// Arbre plan : l'arbre des sous-agents dessiné comme un schéma technique. Fiches rectangulaires,
// connecteurs orthogonaux fléchés, cotes de profondeur (N0, N1…) en tête de colonne. Le rôle se lit
// par un pictogramme et un code court ; la seule couleur fonctionnelle est le bleu des agents actifs
// (et le rouge des échecs). Rien ne boucle : seuls les compteurs de durée avancent.

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm'
import { simulationDepuisUrl, ROLES, ETATS, estFini, estVivant, formatTemps, formatTokens, QUESTION } from '../../commun/simulation.js'
import { monterBarre } from '../../commun/barre.js'

const sim = simulationDepuisUrl()
monterBarre(sim, { titre: 'Arbre plan', sousTitre: 'schéma de qui a lancé qui' })

// Géométrie (unités du monde)
const L_CARTE = 264
const H_CARTE = 90
const L_GRAPPE = 200
const H_GRAPPE = 44
const COLONNE = 356
const RANG = 104
const BUS = 30 // abscisse du coude, depuis le bord droit du parent
const PANNEAU = 384
const DELAI_REPLI = 1.6 // secondes réelles entre la dernière fin d'un sous-arbre et son repli

const CODES = {
  orchestrateur: 'ORC', directeur_de_labo: 'DIR', litterature: 'LIT', experimentateur: 'EXP',
  graphiste: 'GRA', verificateur: 'VER', recours: 'REC',
}

// Pictogrammes monochromes, 16 × 16, tracés au trait.
const PICTOS = {
  orchestrateur: '<circle cx="8" cy="8" r="6.25"/><path d="M8 3.25 10 8 8 12.75 6 8Z"/><path d="M8 3.25 10 8H6Z" fill="currentColor"/>',
  directeur_de_labo: '<path d="M3 3h10v11.25H3Z"/><path d="M6 1.75h4v2.5H6Z" fill="#fff"/><path d="M5.5 7.25h5M5.5 9.75h5M5.5 12.25h3"/>',
  litterature: '<path d="M8 4.5 1.75 3v9.5L8 14l6.25-1.5V3Z"/><path d="M8 4.5V14"/>',
  experimentateur: '<path d="M5.5 1.75h5M6.75 1.75v4.5l-4.5 8h11.5l-4.5-8v-4.5"/><path d="M4.1 11h7.8"/>',
  graphiste: '<rect x="1.75" y="10.5" width="3.5" height="3.5"/><rect x="6.25" y="2" width="3.5" height="3.5"/><rect x="10.75" y="8.5" width="3.5" height="3.5"/><path d="M4.2 10.5 7 5.5M9.3 5.5l2.4 3M5.25 11.9l5.5-1.4"/>',
  verificateur: '<circle cx="8" cy="6.5" r="4.75"/><path d="M5.6 10.6 4.75 15 8 13.4l3.25 1.6-.85-4.4"/><path d="M6 6.5 7.4 7.9l2.7-2.7"/>',
  recours: '<path d="M8 2v12M4.5 14h7M2.75 4.25h10.5"/><path d="M2.75 4.25 1.25 9h3ZM13.25 4.25 11.75 9h3Z"/>',
}
const picto = (role) => `<span class="picto"><svg viewBox="0 0 16 16">${PICTOS[role]}</svg></span>`

// Codes du journal
const CODES_JOURNAL = { lance: 'LAN', demarre: 'DÉM', termine: 'FIN', echec: 'ÉCH' }
const CODES_ETAT = { reflechit: 'RÉF', outil: 'OUT', attend: 'ATT', en_file: 'FIL' }

// ─── Squelette ───────────────────────────────────────────────────────────────────────────────────────

const NS = 'http://www.w3.org/2000/svg'
const scene = document.querySelector('.scene')
const ligneLegende = (cls, attrs) => `<svg class="l" viewBox="0 0 22 8"><path class="c ${cls}" d="M0 4H17" ${attrs}/></svg>`
scene.innerHTML = `
  <div class="question"><span>Question · graine <i class="graine"></i></span></div>
  <div class="monde">
    <svg class="liens">
      <defs>
        <marker id="pointe-gris" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 6 3 0 6Z" fill="#8d8d8d"/></marker>
        <marker id="pointe-encre" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 6 3 0 6Z" fill="#161616"/></marker>
        <marker id="pointe-bleu" viewBox="0 0 7 7" refX="7" refY="3.5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 7 3.5 0 7Z" fill="#0f62fe"/></marker>
      </defs>
      <g class="cotes"></g><g class="fond-liens"></g><g class="liens-actifs"></g>
    </svg>
    <div class="noeuds"></div>
  </div>
  <aside class="inspecteur">
    <div class="i-tete"><span class="i-picto"></span><span class="i-code"></span><span class="i-role"></span><span class="i-id"></span><button class="i-fermer" title="Fermer (Échap)">×</button></div>
    <h2 class="i-titre"></h2>
    <table class="i-table"><tbody>
      <tr><th>État</th><td data-i="etat"></td></tr>
      <tr><th>Modèle</th><td class="mono" data-i="modele"></td></tr>
      <tr><th>Durée</th><td class="mono" data-i="duree"></td></tr>
      <tr><th>En file</th><td class="mono" data-i="file"></td></tr>
      <tr><th>Tokens</th><td class="mono" data-i="tokens"></td></tr>
      <tr><th>Outils</th><td class="mono" data-i="outils"></td></tr>
      <tr><th>Lancé par</th><td data-i="parent"></td></tr>
      <tr><th>Sous-agents</th><td data-i="enfants"></td></tr>
      <tr><th>Activité</th><td data-i="activite"></td></tr>
      <tr><th>Résultat</th><td data-i="resultat"></td></tr>
    </tbody></table>
    <div class="i-jt"><span>Journal</span><span data-i="nbJournal"></span></div>
    <ol class="i-journal"></ol>
  </aside>
  <div class="cartouche">
    <div>${Object.keys(ROLES).map((r) => `<span title="${ROLES[r].libelle}">${picto(r)}<b>${CODES[r]}</b><em>${ROLES[r].libelle}</em></span>`).join('')}</div>
    <div>
      <span>${ligneLegende('actif', 'marker-end="url(#pointe-bleu)"')}actif</span>
      <span>${ligneLegende('', 'marker-end="url(#pointe-gris)"')}fini · attente</span>
      <span>${ligneLegende('en_file', 'marker-end="url(#pointe-gris)"')}en file</span>
      <span class="rouge">▪ échec</span>
    </div>
    <div><span>Échelle <i class="echelle">1:1,00</i></span><span class="aide">double-clic : recadrer</span></div>
  </div>
  <button class="recadrer" title="Recadrer automatiquement (double-clic)">Recadrer</button>
`
scene.querySelector('.question').append(QUESTION)
// Les SVG de légende sont hors du monde : on les style comme les connecteurs.
for (const p of scene.querySelectorAll('.cartouche path.c')) {
  p.style.fill = 'none'
  p.style.stroke = p.classList.contains('actif') ? '#0f62fe' : '#8d8d8d'
  p.style.strokeWidth = p.classList.contains('actif') ? '2' : '1'
  if (p.classList.contains('en_file')) p.style.strokeDasharray = '4 3'
}

const monde = scene.querySelector('.monde')
const gCotes = scene.querySelector('.cotes')
const gFond = scene.querySelector('.fond-liens')
const gActifs = scene.querySelector('.liens-actifs')
const coucheNoeuds = scene.querySelector('.noeuds')
const boutonRecadrer = scene.querySelector('.recadrer')
const echelle = scene.querySelector('.echelle')
const insp = scene.querySelector('.inspecteur')
const I = {
  picto: insp.querySelector('.i-picto'),
  code: insp.querySelector('.i-code'),
  role: insp.querySelector('.i-role'),
  id: insp.querySelector('.i-id'),
  titre: insp.querySelector('.i-titre'),
  journal: insp.querySelector('.i-journal'),
  ...Object.fromEntries([...insp.querySelectorAll('[data-i]')].map((el) => [el.dataset.i, el])),
}

// ─── État de la vue ──────────────────────────────────────────────────────────────────────────────────

const rendus = new Map() // clé → nœud affiché (agent ou grappe)
const liens = new Map() // clé de l'enfant → connecteur
const cotes = new Map() // profondeur → cote
const deplies = new Set() // agents dont l'utilisateur a déplié la grappe
let selection = null
let auto = true
let premierCadrage = true
let aReinitialiser = false
let vue = { x: 0, y: 0, k: 1 }
let taille = { l: scene.clientWidth, h: scene.clientHeight }
new ResizeObserver(() => { taille = { l: scene.clientWidth, h: scene.clientHeight } }).observe(scene)

const arbre = d3.tree().nodeSize([RANG, COLONNE]).separation((a, b) => (a.parent === b.parent ? 1 : 1.2))

function texte(el, v) {
  if (el.__v !== v) { el.__v = v; el.textContent = v }
}

function classe(el, v) {
  if (el.__c !== v) { el.__c = v; el.setAttribute('class', v) }
}

const dims = (r) => (r.type === 'grappe' ? [L_GRAPPE, H_GRAPPE] : [L_CARTE, H_CARTE])

// ─── Zoom et déplacement ─────────────────────────────────────────────────────────────────────────────

const selScene = d3.select(scene)
const zoom = d3.zoom()
  .scaleExtent([0.2, 2.5])
  .clickDistance(5)
  .filter((e) => !e.target.closest('.inspecteur, .cartouche, .recadrer') && (!e.ctrlKey || e.type === 'wheel') && !e.button)
  .on('zoom', (e) => {
    vue = { x: e.transform.x, y: e.transform.y, k: e.transform.k }
    appliquerVue()
    if (e.sourceEvent) { auto = false; boutonRecadrer.classList.add('visible') }
  })
selScene.call(zoom).on('dblclick.zoom', null)

function appliquerVue() {
  monde.style.transform = `translate(${vue.x}px,${vue.y}px) scale(${vue.k})`
  scene.style.backgroundPosition = `${vue.x}px ${vue.y}px`
  scene.style.backgroundSize = `${24 * vue.k}px ${24 * vue.k}px`
  texte(echelle, `1:${vue.k.toFixed(2).replace('.', ',')}`)
}

function recadrer() {
  auto = true
  boutonRecadrer.classList.remove('visible')
}

boutonRecadrer.addEventListener('click', recadrer)
scene.addEventListener('dblclick', (e) => { if (!e.target.closest('.noeud, .inspecteur, .cartouche')) recadrer() })
scene.addEventListener('click', (e) => { if (!e.target.closest('.noeud, .inspecteur, .cartouche, .recadrer')) fermer() })
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermer() })

// Garde tout le plan visible (hors panneau et cartouche), tant que l'utilisateur n'a pas pris la main.
function cadrer(dt) {
  if (!auto) return
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const r of rendus.values()) {
    const [l, h] = dims(r)
    x0 = Math.min(x0, r.tx); x1 = Math.max(x1, r.tx + l)
    y0 = Math.min(y0, r.ty - h / 2); y1 = Math.max(y1, r.ty + h / 2)
  }
  if (!Number.isFinite(x0)) return
  y0 -= 44 // cotes de profondeur
  const m = { g: 32, d: 40 + (selection ? PANNEAU : 0), h: 84, b: 64 }
  const lu = Math.max(120, taille.l - m.g - m.d)
  const hu = Math.max(120, taille.h - m.h - m.b)
  const k = Math.max(0.28, Math.min(1, lu / (x1 - x0), hu / (y1 - y0)))
  const cx = m.g + (lu - (x1 - x0) * k) / 2 - x0 * k
  const cy = m.h + (hu - (y1 - y0) * k) / 2 - y0 * k
  const f = premierCadrage ? 1 : 1 - Math.exp(-dt * 4)
  premierCadrage = false
  const nk = vue.k + (k - vue.k) * f
  const nx = vue.x + (cx - vue.x) * f
  const ny = vue.y + (cy - vue.y) * f
  if (Math.abs(nx - vue.x) + Math.abs(ny - vue.y) + Math.abs(nk - vue.k) * 500 < 0.05) return
  selScene.call(zoom.transform, d3.zoomIdentity.translate(nx, ny).scale(nk))
}

// ─── Construction de l'arbre affiché ─────────────────────────────────────────────────────────────────

function sousArbre(a, acc = []) {
  for (const e of sim.enfants(a)) { acc.push(e); sousArbre(e, acc) }
  return acc
}

// Un sous-arbre entièrement fini depuis un moment se replie en grappe, sauf s'il contient la sélection.
function construire(a) {
  const n = { cle: a.id, agent: a }
  if (!a.enfants.length) return n
  if (estFini(a)) {
    const desc = sousArbre(a)
    if (desc.every(estFini)) {
      const derniere = Math.max(a.fin, ...desc.map((x) => x.fin))
      const mur = sim.temps - derniere > DELAI_REPLI * sim.vitesse
      const contientSelection = selection && desc.some((x) => x.id === selection)
      if (mur && !contientSelection) {
        if (!deplies.has(a.id)) {
          n.children = [{ cle: `g:${a.id}`, grappe: desc, parent: a }]
          return n
        }
        n.replieManuel = true
      }
    }
  }
  n.children = sim.enfants(a).map(construire)
  return n
}

// ─── Nœuds ───────────────────────────────────────────────────────────────────────────────────────────

function creerAgent(a) {
  const el = document.createElement('div')
  el.className = 'noeud agent'
  el.innerHTML = `
    <div class="carte">
      <div class="n-tete">${picto(a.role)}<span class="code">${CODES[a.role]}</span><span class="role">${ROLES[a.role].libelle}</span><span class="ident">${a.id.toUpperCase()}</span></div>
      <div class="n-corps"><div class="n-titre"></div><div class="n-act"></div></div>
      <dl class="n-champs">
        <div><dt>État</dt><dd class="c-etat"></dd></div>
        <div><dt>Durée</dt><dd class="c-duree"></dd></div>
        <div><dt>Tokens</dt><dd class="c-tok"></dd></div>
        <div><dt>Outils</dt><dd class="c-out"></dd></div>
      </dl>
    </div>
    <button class="replier" title="Replier le sous-arbre terminé">−</button>`
  const titre = el.querySelector('.n-titre')
  titre.textContent = a.titre
  titre.title = a.titre
  const id = a.id
  el.querySelector('.carte').addEventListener('click', () => selectionner(id))
  el.querySelector('.replier').addEventListener('click', (e) => { e.stopPropagation(); deplies.delete(id) })
  const q = (s) => el.querySelector(s)
  return {
    type: 'agent', el, carte: q('.carte'),
    act: q('.n-act'), etat: q('.c-etat'), duree: q('.c-duree'), tok: q('.c-tok'), out: q('.c-out'),
  }
}

function creerGrappe(n) {
  const el = document.createElement('div')
  el.className = 'noeud grappe'
  const agents = n.grappe
  const echecs = agents.filter((x) => x.etat === 'echec').length
  const ordre = Object.keys(ROLES)
  const decompte = ordre
    .map((role) => [role, agents.filter((x) => x.role === role).length])
    .filter(([, nb]) => nb)
    .map(([role, nb]) => `${nb} ${CODES[role]}`)
    .join(' · ')
  el.innerHTML = `
    <div class="carte" title="Déplier">
      <div class="g-l1">${agents.length} terminé${agents.length > 1 ? 's' : ''}${echecs ? ` <span class="echecs">· ${echecs} échec${echecs > 1 ? 's' : ''}</span>` : ''}</div>
      <div class="g-l2">${decompte}</div>
      <span class="g-plus">+</span>
    </div>`
  const id = n.parent.id
  el.querySelector('.carte').addEventListener('click', () => deplies.add(id))
  return { type: 'grappe', el, carte: el.querySelector('.carte') }
}

function libelleEtat(a) {
  if (a.etat === 'en_file') {
    const rang = sim.file.indexOf(a) + 1
    return rang ? `En file #${rang}` : 'En file'
  }
  if (a.etat === 'attend') {
    const enfants = sim.enfants(a)
    return `Attend ${enfants.filter(estFini).length}/${enfants.length}`
  }
  return ETATS[a.etat].libelle
}

function activite(a) {
  if (a.etat === 'en_file') return 'En attente d’une place'
  if (estFini(a)) return a.resultat ?? ETATS[a.etat].libelle
  if (a.etat === 'outil') return `${a.outilCourant} — ${a.activite}`
  return a.activite
}

const duree = (a) => (a.debut === null ? '—' : formatTemps((a.fin ?? sim.temps) - a.debut))

function majAgent(r, a, n) {
  const cls = `carte etat-${a.etat}${estVivant(a) ? ' actif' : ''}${selection === a.id ? ' choisi' : ''}`
  if (r.cls !== cls) { r.cls = cls; r.carte.className = cls }
  texte(r.etat, libelleEtat(a))
  const txt = activite(a)
  if (r.act.__v !== txt) { texte(r.act, txt); r.act.title = txt }
  texte(r.duree, duree(a))
  texte(r.tok, formatTokens(a.tokens))
  texte(r.out, String(a.nbOutils))
  const replier = !!n.replieManuel
  if (r.replier !== replier) { r.replier = replier; r.el.classList.toggle('avec-replier', replier) }
}

sim.surEvenement((evt) => { if (evt.type === 'redemarrage') aReinitialiser = true })

// ─── Connecteurs ─────────────────────────────────────────────────────────────────────────────────────

function majLiens(noeuds) {
  const chemin = new Set()
  for (let a = selection && sim.get(selection); a; a = a.parentId ? sim.get(a.parentId) : null) chemin.add(a.id)

  const presents = new Set()
  for (const d of noeuds) {
    if (!d.parent) continue
    const cle = d.data.cle
    presents.add(cle)
    let l = liens.get(cle)
    if (!l) {
      l = { p: document.createElementNS(NS, 'path') }
      liens.set(cle, l)
    }
    l.parentCle = d.parent.data.cle
    const a = d.data.agent
    const actif = !!a && estVivant(a)
    const genre = !a ? 'grappe' : actif ? 'actif' : a.etat
    classe(l.p, `c ${genre}${a && chemin.has(a.id) ? ' chemin' : ''}`)
    // Les connecteurs actifs passent au-dessus, pour que le tronc commun reste bleu.
    const couche = actif ? gActifs : gFond
    if (l.p.parentNode !== couche) couche.append(l.p)
  }

  for (const [cle, l] of liens) {
    const e = rendus.get(cle)
    const p = rendus.get(l.parentCle)
    if (!presents.has(cle) || !e || !p) { l.p.remove(); liens.delete(cle); continue }
    const x0 = Math.round(p.x + dims(p)[0]) + 0.5
    const y0 = Math.round(p.y) + 0.5
    const x1 = Math.round(e.x) - 1
    const y1 = Math.round(e.y) + 0.5
    const bx = x0 + BUS
    const d = Math.abs(y1 - y0) < 1 ? `M${x0},${y0}H${x1}` : `M${x0},${y0}H${bx}V${y1}H${x1}`
    if (l.d !== d) { l.d = d; l.p.setAttribute('d', d) }
  }
}

// Cotes de profondeur : N0, N1… au-dessus de chaque colonne, avec une ligne de cote à talons.
function majCotes(noeuds) {
  const parProf = new Map()
  let haut = Infinity
  for (const d of noeuds) {
    const r = rendus.get(d.data.cle)
    if (!r) continue
    haut = Math.min(haut, r.y - dims(r)[1] / 2)
    const c = parProf.get(d.depth) || { x: r.x, agents: 0, replis: 0 }
    if (d.data.agent) c.agents++
    else c.replis += d.data.grappe.length
    parProf.set(d.depth, c)
  }
  for (const [prof, c] of cotes) if (!parProf.has(prof)) { c.g.remove(); cotes.delete(prof) }
  if (!Number.isFinite(haut)) return
  const y = Math.round(haut - 22) + 0.5
  for (const [prof, info] of parProf) {
    let c = cotes.get(prof)
    if (!c) {
      const g = document.createElementNS(NS, 'g')
      g.setAttribute('class', 'cote')
      g.innerHTML = '<line class="base"/><line class="t1"/><line class="t2"/><text class="n"/><text class="nb" text-anchor="end"/>'
      gCotes.append(g)
      c = { g, base: g.querySelector('.base'), t1: g.querySelector('.t1'), t2: g.querySelector('.t2'), n: g.querySelector('.n'), nb: g.querySelector('.nb') }
      cotes.set(prof, c)
    }
    const x0 = Math.round(prof * COLONNE) + 0.5
    const x1 = x0 + L_CARTE - 1
    const cle = `${x0}:${y}`
    if (c.cle !== cle) {
      c.cle = cle
      c.base.setAttribute('x1', x0); c.base.setAttribute('x2', x1); c.base.setAttribute('y1', y); c.base.setAttribute('y2', y)
      c.t1.setAttribute('x1', x0); c.t1.setAttribute('x2', x0); c.t1.setAttribute('y1', y - 4); c.t1.setAttribute('y2', y + 4)
      c.t2.setAttribute('x1', x1); c.t2.setAttribute('x2', x1); c.t2.setAttribute('y1', y - 4); c.t2.setAttribute('y2', y + 4)
      c.n.setAttribute('x', x0); c.n.setAttribute('y', y - 8)
      c.nb.setAttribute('x', x1); c.nb.setAttribute('y', y - 8)
    }
    texte(c.n, `N${prof}`)
    const morceaux = []
    if (info.agents) morceaux.push(`${info.agents} agent${info.agents > 1 ? 's' : ''}`)
    if (info.replis) morceaux.push(`${info.replis} replié${info.replis > 1 ? 's' : ''}`)
    texte(c.nb, morceaux.join(' + '))
  }
}

// ─── Inspecteur ──────────────────────────────────────────────────────────────────────────────────────

let journalRendu = 0
let derniereMajInsp = 0

function selectionner(id) {
  selection = id
  journalRendu = 0
  I.journal.innerHTML = ''
  insp.classList.add('ouvert')
  scene.classList.add('panneau')
  majInspecteur(true)
}

function fermer() {
  if (!selection) return
  selection = null
  insp.classList.remove('ouvert')
  scene.classList.remove('panneau')
}

insp.querySelector('.i-fermer').addEventListener('click', fermer)
I.parent.addEventListener('click', () => { if (I.parent.dataset.id) selectionner(I.parent.dataset.id) })

function majInspecteur(force = false) {
  if (!selection) return
  const a = sim.get(selection)
  if (!a) { fermer(); return }
  const maintenant = performance.now()
  if (!force && maintenant - derniereMajInsp < 100) return
  derniereMajInsp = maintenant

  if (I.picto.__role !== a.role) { I.picto.__role = a.role; I.picto.innerHTML = picto(a.role) }
  texte(I.code, CODES[a.role])
  texte(I.role, ROLES[a.role].libelle)
  texte(I.id, a.id.toUpperCase())
  texte(I.titre, a.titre)
  texte(I.etat, a.etat === 'outil' ? `Outil · ${a.outilCourant}` : libelleEtat(a))
  I.etat.className = estVivant(a) ? 'e-actif' : a.etat === 'echec' ? 'e-echec' : ''
  texte(I.modele, a.modele)
  texte(I.duree, duree(a))
  texte(I.file, formatTemps((a.debut ?? sim.temps) - a.creeA))
  texte(I.tokens, formatTokens(a.tokens))
  texte(I.outils, String(a.nbOutils))

  const parent = a.parentId ? sim.get(a.parentId) : null
  texte(I.parent, parent ? `${CODES[parent.role]} ${parent.id.toUpperCase()} · ${parent.titre}` : 'Camille')
  I.parent.title = parent ? parent.titre : ''
  I.parent.dataset.id = parent ? parent.id : ''
  I.parent.classList.toggle('lienable', !!parent)

  const enfants = sim.enfants(a)
  texte(I.enfants, enfants.length ? `${enfants.filter(estFini).length}/${enfants.length} finis · ${enfants.filter(estVivant).length} actifs` : 'aucun')
  texte(I.activite, activite(a))
  texte(I.resultat, a.resultat ?? '—')
  I.resultat.classList.toggle('echec', a.etat === 'echec')
  texte(I.nbJournal, `${a.journal.length} entrées`)

  if (journalRendu < a.journal.length) {
    const j = I.journal
    const enBas = j.scrollHeight - j.scrollTop - j.clientHeight < 40
    const premierRendu = journalRendu === 0
    for (; journalRendu < a.journal.length; journalRendu++) {
      const e = a.journal[journalRendu]
      const li = document.createElement('li')
      li.dataset.t = e.type
      li.innerHTML = '<time></time><b></b><span></span>'
      li.querySelector('time').textContent = formatTemps(e.t)
      li.querySelector('b').textContent = CODES_JOURNAL[e.type] || CODES_ETAT[e.etat] || '···'
      li.querySelector('span').textContent = e.texte
      j.append(li)
    }
    if (enBas || premierRendu) j.scrollTop = j.scrollHeight
  }
}

// ─── Redémarrage ─────────────────────────────────────────────────────────────────────────────────────

function reinitialiser() {
  aReinitialiser = false
  for (const r of rendus.values()) r.el.remove()
  for (const l of liens.values()) l.p.remove()
  for (const c of cotes.values()) c.g.remove()
  rendus.clear()
  liens.clear()
  cotes.clear()
  deplies.clear()
  fermer()
  recadrer()
  premierCadrage = true
}

// ─── Boucle de rendu ─────────────────────────────────────────────────────────────────────────────────

const graine = scene.querySelector('.graine')

sim.surTic((_, dt) => {
  if (aReinitialiser) reinitialiser()
  texte(graine, String(sim.graine))

  const racine = d3.hierarchy(construire(sim.racine))
  arbre(racine)
  const noeuds = racine.descendants()
  const presents = new Set()

  // Entrées (posées directement à leur place) et mises à jour
  for (const d of noeuds) {
    const cle = d.data.cle
    presents.add(cle)
    let r = rendus.get(cle)
    if (!r) {
      r = d.data.agent ? creerAgent(d.data.agent) : creerGrappe(d.data)
      Object.assign(r, { x: d.y, y: d.x })
      coucheNoeuds.append(r.el)
      rendus.set(cle, r)
    }
    r.tx = d.y
    r.ty = d.x
    if (d.data.agent) majAgent(r, d.data.agent, d.data)
  }

  // Sorties : retirées sans effet
  for (const [cle, r] of rendus) if (!presents.has(cle)) { r.el.remove(); rendus.delete(cle) }

  // Les nœuds déjà posés glissent vers leur nouvelle place quand l'arbre se réorganise.
  const f = 1 - Math.exp(-dt * 10)
  for (const r of rendus.values()) {
    r.x += (r.tx - r.x) * f
    r.y += (r.ty - r.y) * f
    if (Math.abs(r.tx - r.x) < 0.3) r.x = r.tx
    if (Math.abs(r.ty - r.y) < 0.3) r.y = r.ty
    const t = `translate(${Math.round(r.x)}px,${Math.round(r.y - dims(r)[1] / 2)}px)`
    if (r.t !== t) { r.t = t; r.el.style.transform = t }
  }

  majLiens(noeuds)
  majCotes(noeuds)
  cadrer(dt)
  majInspecteur()
})

appliquerVue()
sim.demarrer()
