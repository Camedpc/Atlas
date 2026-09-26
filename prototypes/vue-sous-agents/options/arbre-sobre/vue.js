// Arbre sobre : même arbre rangé (d3.tree) que l'Arbre vivant, gauche → droite, en thème clair.
// Hiérarchie portée par la typographie et l'espacement ; la couleur de rôle ne sert qu'au libellé,
// à la bordure et au lien des agents actifs. Aucune animation décorative : seulement le glissement
// du layout, les transitions d'état et une fine barre de progression sous les agents au travail.

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm'
import { simulationDepuisUrl, ROLES, ETATS, estFini, estVivant, formatTemps, formatTokens, QUESTION } from '../../commun/simulation.js'
import { monterBarre } from '../../commun/barre.js'
import { couleurClair } from '../../commun/clair.js'

const sim = simulationDepuisUrl()
monterBarre(sim, { titre: 'Arbre sobre', sousTitre: 'qui a lancé qui, et qui travaille maintenant' })

// Géométrie (unités du monde)
const L_CARTE = 264
const H_CARTE = 72
const L_GRAPPE = 196
const H_GRAPPE = 34
const COLONNE = 344
const RANG = 88
const PANNEAU = 360
const DUREE_SORTIE = 400
const DELAI_REPLI = 1.6 // secondes réelles entre la dernière fin d'un sous-arbre et son repli
const GRILLE = 24

const lettre = (role) => ROLES[role].libelle[0]

// ─── Squelette ───────────────────────────────────────────────────────────────────────────────────────

const ligne = (cls) => `<svg viewBox="0 0 20 6"><line class="${cls}" x1="0" y1="3" x2="20" y2="3"/></svg>`

const scene = document.querySelector('.scene')
scene.innerHTML = `
  <div class="question"><span>Question</span></div>
  <div class="monde"><svg class="liens"></svg><div class="noeuds"></div></div>
  <aside class="inspecteur">
    <button class="i-fermer" title="Fermer (Échap)">×</button>
    <div class="i-tete"><i class="lettre"></i><span class="i-role"></span><span class="i-modele"></span></div>
    <h2 class="i-titre"></h2>
    <span class="i-etat"></span>
    <dl class="i-grille">
      <div><dt>Durée</dt><dd data-i="duree"></dd></div>
      <div><dt>Tokens</dt><dd data-i="tokens"></dd></div>
      <div><dt>Outils</dt><dd data-i="outils"></dd></div>
      <div><dt>En file</dt><dd data-i="file"></dd></div>
      <div class="large"><dt>Lancé par</dt><dd data-i="parent"></dd></div>
      <div class="large"><dt>Sous-agents</dt><dd data-i="enfants"></dd></div>
    </dl>
    <section><h3>Activité courante</h3><p data-i="activite"></p></section>
    <section><h3>Résultat</h3><p data-i="resultat"></p></section>
    <h3 class="i-jt">Journal</h3>
    <ol class="i-journal"></ol>
  </aside>
  <div class="legende-arbre">
    <div>${Object.keys(ROLES).map((r) => `<span><i class="lettre">${lettre(r)}</i><span class="r" style="color:${couleurClair(r)}">${ROLES[r].libelle}</span></span>`).join('')}</div>
    <div>
      <span>${ligne('l-vivant')}au travail</span>
      <span>${ligne('l-attend')}attend ses sous-agents</span>
      <span>${ligne('l-file')}en file</span>
      <span>${ligne('l-echec')}échec</span>
      <span class="aide">clic : inspecter · molette : zoom · double-clic : recadrer</span>
    </div>
  </div>
  <button class="recadrer" title="Recadrer automatiquement (double-clic)">Recadrer</button>
`
scene.querySelector('.question').append(QUESTION)
// Styles des échantillons de la légende, alignés sur ceux des liens
for (const [cls, style] of Object.entries({
  'l-vivant': 'stroke:#18181b;stroke-width:1.5',
  'l-attend': 'stroke:#a1a1aa',
  'l-file': 'stroke:#b4b4ae;stroke-dasharray:2 4;stroke-linecap:round',
  'l-echec': 'stroke:#fca5a5;stroke-width:1.5',
})) scene.querySelector(`.${cls}`).setAttribute('style', style)

const monde = scene.querySelector('.monde')
const svgLiens = scene.querySelector('.liens')
const coucheNoeuds = scene.querySelector('.noeuds')
const boutonRecadrer = scene.querySelector('.recadrer')
const insp = scene.querySelector('.inspecteur')
const I = {
  lettre: insp.querySelector('.lettre'),
  role: insp.querySelector('.i-role'),
  modele: insp.querySelector('.i-modele'),
  titre: insp.querySelector('.i-titre'),
  etat: insp.querySelector('.i-etat'),
  journal: insp.querySelector('.i-journal'),
  ...Object.fromEntries([...insp.querySelectorAll('[data-i]')].map((el) => [el.dataset.i, el])),
}

// ─── État de la vue ──────────────────────────────────────────────────────────────────────────────────

const rendus = new Map() // clé → nœud affiché (agent ou grappe)
const liens = new Map() // clé de l'enfant → lien affiché
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

const dims = (r) => (r.type === 'grappe' ? [L_GRAPPE, H_GRAPPE] : [L_CARTE, H_CARTE])

// ─── Zoom et déplacement ─────────────────────────────────────────────────────────────────────────────

const selScene = d3.select(scene)
const zoom = d3.zoom()
  .scaleExtent([0.2, 2.5])
  .clickDistance(5)
  .filter((e) => !e.target.closest('.inspecteur, .legende-arbre, .recadrer') && (!e.ctrlKey || e.type === 'wheel') && !e.button)
  .on('zoom', (e) => {
    vue = { x: e.transform.x, y: e.transform.y, k: e.transform.k }
    appliquerVue()
    if (e.sourceEvent) { auto = false; boutonRecadrer.classList.add('visible') }
  })
selScene.call(zoom).on('dblclick.zoom', null)

function appliquerVue() {
  monde.style.transform = `translate(${vue.x}px,${vue.y}px) scale(${vue.k})`
  scene.style.backgroundPosition = `${vue.x}px ${vue.y}px`
  scene.style.backgroundSize = `${GRILLE * vue.k}px ${GRILLE * vue.k}px`
}

function recadrer() {
  auto = true
  boutonRecadrer.classList.remove('visible')
}

boutonRecadrer.addEventListener('click', recadrer)
scene.addEventListener('dblclick', (e) => { if (!e.target.closest('.noeud, .inspecteur, .legende-arbre')) recadrer() })
scene.addEventListener('click', (e) => { if (!e.target.closest('.noeud, .inspecteur, .legende-arbre, .recadrer')) fermer() })
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermer() })

// Garde tout l'arbre visible (hors panneau et légende), tant que l'utilisateur n'a pas pris la main.
function cadrer(dt) {
  if (!auto) return
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const r of rendus.values()) {
    if (r.sortie) continue
    const [l, h] = dims(r)
    x0 = Math.min(x0, r.tx); x1 = Math.max(x1, r.tx + l)
    y0 = Math.min(y0, r.ty - h / 2); y1 = Math.max(y1, r.ty + h / 2)
  }
  if (!Number.isFinite(x0)) return
  const m = { g: 40, d: 56 + (selection ? PANNEAU + 24 : 0), h: 84, b: 96 }
  const lu = Math.max(120, taille.l - m.g - m.d)
  const hu = Math.max(120, taille.h - m.h - m.b)
  const k = Math.max(0.28, Math.min(1, lu / (x1 - x0), hu / (y1 - y0)))
  const cx = m.g + (lu - (x1 - x0) * k) / 2 - x0 * k
  const cy = m.h + (hu - (y1 - y0) * k) / 2 - y0 * k
  const f = premierCadrage ? 1 : 1 - Math.exp(-dt * 3.2)
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

// ─── Libellés ────────────────────────────────────────────────────────────────────────────────────────

function rangFile(a) {
  return sim.file.indexOf(a) + 1
}

// Libellé d'état court, à droite de la carte. Renvoie [texte, nom d'outil éventuel].
function libelleEtat(a) {
  switch (a.etat) {
    case 'reflechit': return ['Réfléchit']
    case 'outil': return ['Outil · ', a.outilCourant]
    case 'attend': {
      const enfants = sim.enfants(a)
      return [`Attend ${enfants.filter(estFini).length}/${enfants.length}`]
    }
    case 'en_file': {
      const rang = rangFile(a)
      return [rang ? `En file #${rang}` : 'En file']
    }
    case 'termine': return ['✓ Terminé']
    case 'echec': return ['✕ Échec']
  }
  return [ETATS[a.etat]?.libelle ?? a.etat]
}

function activite(a) {
  if (a.etat === 'en_file') return 'En attente d’une place'
  if (estFini(a)) return a.resultat ?? ETATS[a.etat].libelle
  return a.activite
}

// ─── Nœuds ───────────────────────────────────────────────────────────────────────────────────────────

function creerAgent(a) {
  const el = document.createElement('div')
  el.className = 'noeud agent'
  el.style.setProperty('--c', couleurClair(a.role))
  el.innerHTML = `
    <div class="carte">
      <div class="l1"><i class="lettre">${lettre(a.role)}</i><span class="role">${ROLES[a.role].libelle}</span><span class="etat"></span></div>
      <div class="titre"></div>
      <div class="activite"><span class="txt"></span><span class="chrono"></span></div>
    </div>
    <button class="replier" title="Replier le sous-arbre terminé">−</button>`
  const titre = el.querySelector('.titre')
  titre.textContent = a.titre
  titre.title = a.titre
  const id = a.id
  el.querySelector('.carte').addEventListener('click', () => selectionner(id))
  el.querySelector('.replier').addEventListener('click', (e) => { e.stopPropagation(); deplies.delete(id) })
  return {
    type: 'agent', el, carte: el.querySelector('.carte'),
    etat: el.querySelector('.etat'), chrono: el.querySelector('.chrono'), txt: el.querySelector('.txt'),
  }
}

function creerGrappe(n) {
  const el = document.createElement('div')
  el.className = 'noeud grappe'
  const agents = n.grappe
  const echecs = agents.filter((x) => x.etat === 'echec').length
  el.innerHTML = `
    <div class="carte" title="Déplier">
      <span class="coche">✓</span>
      <span class="txt">${agents.length} sous-agent${agents.length > 1 ? 's' : ''}</span>
      ${echecs ? `<span class="echecs">${echecs} échec${echecs > 1 ? 's' : ''}</span>` : ''}
      <span class="chevron">›</span>
    </div>`
  const id = n.parent.id
  el.querySelector('.carte').addEventListener('click', () => deplies.add(id))
  return { type: 'grappe', el, carte: el.querySelector('.carte') }
}

function positionDepart(d) {
  if (!d.parent) return [d.y, d.x]
  const g = rendus.get(`g:${d.parent.data.cle}`) // on déplie : les enfants sortent de la grappe
  if (g) return [g.x, g.y]
  const p = rendus.get(d.parent.data.cle)
  if (p) return [p.x + 60, p.y]
  return [d.y, d.x]
}

function cibleSortie(cle, r, cibles) {
  if (r.type === 'grappe') return [r.x, r.y]
  const a = sim.get(cle)
  let p = a && a.parentId ? sim.get(a.parentId) : null
  while (p) {
    const g = cibles.get(`g:${p.id}`)
    if (g) return [g.x, g.y] // on replie : l'agent rentre dans la grappe
    const c = cibles.get(p.id)
    if (c) return [c.x + 60, c.y]
    p = p.parentId ? sim.get(p.parentId) : null
  }
  return [r.x, r.y]
}

function majAgent(r, a, n) {
  const etat = a.etat
  if (r.etatCls !== etat) {
    r.etatCls = etat
    r.carte.className = `carte etat-${etat}${estVivant(a) ? ' vivant' : ''}`
    r.choisi = false
  }
  const choisi = selection === a.id
  if (r.choisi !== choisi) { r.choisi = choisi; r.carte.classList.toggle('choisi', choisi) }

  const [lib, nomOutil] = libelleEtat(a)
  const cleEtat = `${lib}|${nomOutil ?? ''}`
  if (r.cleEtat !== cleEtat) {
    r.cleEtat = cleEtat
    r.etat.textContent = lib
    if (nomOutil) {
      const code = document.createElement('code')
      code.textContent = nomOutil
      r.etat.append(code)
    }
    r.etat.title = lib + (nomOutil ?? '')
  }

  const txt = activite(a)
  if (r.txt.__v !== txt) {
    const premier = r.txt.__v === undefined
    texte(r.txt, txt)
    r.txt.title = txt
    if (!premier) r.txt.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' })
  }

  const enFile = etat === 'en_file'
  const duree = enFile ? sim.temps - a.creeA : (a.fin ?? sim.temps) - (a.debut ?? a.creeA)
  texte(r.chrono, formatTemps(duree))

  const replier = !!n.replieManuel
  if (r.replier !== replier) { r.replier = replier; r.el.classList.toggle('avec-replier', replier) }
}

sim.surEvenement((evt) => {
  if (evt.type === 'redemarrage') aReinitialiser = true
})

// ─── Liens ───────────────────────────────────────────────────────────────────────────────────────────

const NS = 'http://www.w3.org/2000/svg'

function creerLien() {
  const g = document.createElementNS(NS, 'g')
  const trait = document.createElementNS(NS, 'path')
  g.append(trait)
  svgLiens.append(g)
  g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: 'ease-out' })
  return { g, trait }
}

function majLiens(noeuds, maintenant) {
  const chemin = new Set()
  for (let a = selection && sim.get(selection); a; a = a.parentId ? sim.get(a.parentId) : null) chemin.add(a.id)

  const presents = new Set()
  for (const d of noeuds) {
    if (!d.parent) continue
    const cle = d.data.cle
    presents.add(cle)
    let l = liens.get(cle)
    if (!l) { l = creerLien(); liens.set(cle, l) }
    else if (l.sortie) { l.sortie = false; l.g.classList.remove('sort') }
    l.parentCle = d.parent.data.cle
    const a = d.data.agent
    const genre = a ? (estVivant(a) ? 'vivant' : a.etat) : 'grappe'
    const cls = `lien ${genre}${a && chemin.has(a.id) ? ' chemin' : ''}`
    if (l.cls !== cls) { l.cls = cls; l.g.setAttribute('class', cls) }
    const couleur = a ? couleurClair(a.role) : '#8b8b93'
    if (l.couleur !== couleur) { l.couleur = couleur; l.g.style.setProperty('--c', couleur) }
  }

  for (const [cle, l] of liens) {
    if (!presents.has(cle) && !l.sortie) { l.sortie = true; l.tSortie = maintenant; l.g.classList.add('sort') }
    const e = rendus.get(cle)
    const p = rendus.get(l.parentCle)
    if (!e || !p || (l.sortie && maintenant - l.tSortie > DUREE_SORTIE)) { l.g.remove(); liens.delete(cle); continue }
    const x0 = p.x + dims(p)[0], y0 = p.y, x1 = e.x, y1 = e.y
    const mx = (x0 + x1) / 2
    const d = `M${x0.toFixed(1)},${y0.toFixed(1)}C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
    if (l.d !== d) { l.d = d; l.trait.setAttribute('d', d) }
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

  const role = ROLES[a.role]
  insp.style.setProperty('--c', couleurClair(a.role))
  texte(I.lettre, lettre(a.role))
  texte(I.role, role.libelle)
  texte(I.modele, a.modele)
  texte(I.titre, a.titre)
  texte(I.etat, a.etat === 'outil' ? `Outil · ${a.outilCourant}` : libelleEtat(a)[0])
  I.etat.className = `i-etat e-${a.etat}`
  texte(I.duree, a.debut === null ? '—' : formatTemps((a.fin ?? sim.temps) - a.debut))
  texte(I.tokens, formatTokens(a.tokens))
  texte(I.outils, String(a.nbOutils))
  texte(I.file, formatTemps((a.debut ?? sim.temps) - a.creeA))

  const parent = a.parentId ? sim.get(a.parentId) : null
  texte(I.parent, parent ? `${ROLES[parent.role].libelle} · ${parent.titre}` : 'Camille')
  I.parent.title = parent ? parent.titre : ''
  I.parent.dataset.id = parent ? parent.id : ''
  I.parent.classList.toggle('lienable', !!parent)

  const enfants = sim.enfants(a)
  texte(I.enfants, enfants.length ? `${enfants.filter(estFini).length}/${enfants.length} finis · ${enfants.filter(estVivant).length} actifs` : 'Aucun')
  texte(I.activite, a.etat === 'en_file' ? `En file d’attente · rang ${rangFile(a) || '—'}` : a.activite)
  texte(I.resultat, a.resultat ?? '—')
  I.resultat.classList.toggle('echec', a.etat === 'echec')

  if (journalRendu < a.journal.length) {
    const j = I.journal
    const enBas = j.scrollHeight - j.scrollTop - j.clientHeight < 40
    const premierRendu = journalRendu === 0
    for (; journalRendu < a.journal.length; journalRendu++) {
      const e = a.journal[journalRendu]
      const li = document.createElement('li')
      li.dataset.t = e.type
      li.dataset.e = e.etat
      li.innerHTML = '<time></time><i></i><span></span>'
      li.querySelector('time').textContent = formatTemps(e.t)
      li.querySelector('span').textContent = e.texte
      j.append(li)
      if (!premierRendu) li.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' })
    }
    if (enBas || premierRendu) j.scrollTop = j.scrollHeight
  }
}

// ─── Redémarrage ─────────────────────────────────────────────────────────────────────────────────────

function reinitialiser() {
  aReinitialiser = false
  for (const r of rendus.values()) r.el.remove()
  for (const l of liens.values()) l.g.remove()
  rendus.clear()
  liens.clear()
  deplies.clear()
  fermer()
  recadrer()
  premierCadrage = true
  monde.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' })
}

// ─── Boucle de rendu ─────────────────────────────────────────────────────────────────────────────────

sim.surTic((_, dt) => {
  if (aReinitialiser) reinitialiser()
  const maintenant = performance.now()

  const racine = d3.hierarchy(construire(sim.racine))
  arbre(racine)
  const noeuds = racine.descendants()
  const cibles = new Map(noeuds.map((d) => [d.data.cle, { x: d.y, y: d.x }]))

  // Entrées et mises à jour
  for (const d of noeuds) {
    const cle = d.data.cle
    let r = rendus.get(cle)
    if (!r) {
      r = d.data.agent ? creerAgent(d.data.agent) : creerGrappe(d.data)
      const [x, y] = positionDepart(d)
      Object.assign(r, { x, y, sortie: false })
      coucheNoeuds.append(r.el)
      r.carte.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' })
      rendus.set(cle, r)
    } else if (r.sortie) {
      r.sortie = false
      r.el.classList.remove('sort')
    }
    r.tx = d.y
    r.ty = d.x
    if (d.data.agent) majAgent(r, d.data.agent, d.data)
  }

  // Sorties : l'agent glisse vers la grappe ou l'ancêtre qui l'absorbe, puis disparaît
  for (const [cle, r] of rendus) {
    if (r.sortie || cibles.has(cle)) continue
    r.sortie = true
    r.tSortie = maintenant
    ;[r.tx, r.ty] = cibleSortie(cle, r, cibles)
    r.el.classList.add('sort')
  }

  // Glissement vers les cibles
  const f = 1 - Math.exp(-dt * 6.5)
  for (const [cle, r] of rendus) {
    if (r.sortie && maintenant - r.tSortie > DUREE_SORTIE) { r.el.remove(); rendus.delete(cle); continue }
    r.x += (r.tx - r.x) * f
    r.y += (r.ty - r.y) * f
    const t = `translate(${r.x.toFixed(1)}px,${(r.y - dims(r)[1] / 2).toFixed(1)}px)`
    if (r.t !== t) { r.t = t; r.el.style.transform = t }
  }

  majLiens(noeuds, maintenant)
  cadrer(dt)
  majInspecteur()
})

appliquerVue()
sim.demarrer()
