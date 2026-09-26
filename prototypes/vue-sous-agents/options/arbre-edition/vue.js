// Arbre édition : l'arbre des agents (d3.tree, gauche → droite) composé comme une figure de revue.
// Pas de cartes : chaque agent est un bloc de texte (méta, titre numéroté, activité en italique),
// relié à son parent par un trait d'encre coudé. Un seul accent de couleur : l'agent au travail.

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm'
import { simulationDepuisUrl, ROLES, ETATS, estFini, estVivant, formatTemps, formatTokens, QUESTION } from '../../commun/simulation.js'
import { monterBarre } from '../../commun/barre.js'
import { couleurClair } from '../../commun/clair.js'

const sim = simulationDepuisUrl()
monterBarre(sim, { titre: 'Arbre édition', sousTitre: 'l’arbre des agents, composé comme une figure imprimée' })

// Géométrie (unités du monde). L'ancre verticale d'un nœud est le milieu de sa ligne de titre.
const L_BLOC = 248
const H_BLOC = 56
const ANCRE_BLOC = 26 // méta (15) + moitié du titre (11)
const L_GRAPPE = 210
const H_GRAPPE = 22
const COLONNE = 336 // laisse ≥ 60 px de trait entre la fin d'un bloc et la colonne suivante
const RANG = 86 // bloc de 56 px + ~15 px de blanc au-dessus et en dessous
const PANNEAU = 360
const DUREE_SORTIE = 420
const DELAI_REPLI = 1.6 // secondes réelles entre la dernière fin d'un sous-arbre et son repli
const RAYON = 6 // arrondi des coudes
const K_MIN = 0.7 // zoom minimum du cadrage automatique

// ─── Squelette ───────────────────────────────────────────────────────────────────────────────────────

const scene = document.querySelector('.scene')
scene.innerHTML = `
  <div class="question"><b>Question</b></div>
  <div class="monde"><svg class="liens"></svg><div class="noeuds"></div></div>
  <aside class="inspecteur">
    <button class="i-fermer" title="Fermer (Échap)">Fermer</button>
    <div class="i-tete"></div>
    <h2 class="i-titre"><i class="carre"></i><span></span></h2>
    <div class="i-etat"></div>
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
    <div class="roles">${Object.entries(ROLES).map(([cle, r]) => `<span><i style="background:${couleurClair(cle)}"></i>${r.libelle}</span>`).join('')}</div>
    <div class="etats">
      <span><svg><line x1="0" y1="3" x2="20" y2="3" stroke="${couleurClair('litterature')}" stroke-width="1.5"/></svg>au travail</span>
      <span><svg><line x1="0" y1="3" x2="20" y2="3" stroke="#1c1c1f"/></svg>attend ses sous-agents</span>
      <span><svg><line x1="0" y1="3" x2="20" y2="3" stroke="#bdbdc3" stroke-dasharray="2 3"/></svg>en file</span>
      <span><svg><line x1="0" y1="3" x2="20" y2="3" stroke="#bdbdc3"/></svg>terminé</span>
      <span><svg><line x1="0" y1="3" x2="20" y2="3" stroke="#9b1c1c"/></svg>échec</span>
      <span class="aide">clic : note en marge · molette : zoom · double-clic : recadrer</span>
    </div>
  </div>
  <button class="recadrer" title="Recadrer automatiquement (double-clic)">Recadrer</button>
`
scene.querySelector('.question').append(QUESTION)

const monde = scene.querySelector('.monde')
const svgLiens = scene.querySelector('.liens')
const coucheNoeuds = scene.querySelector('.noeuds')
const boutonRecadrer = scene.querySelector('.recadrer')
const insp = scene.querySelector('.inspecteur')
const I = {
  tete: insp.querySelector('.i-tete'),
  titre: insp.querySelector('.i-titre span'),
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

const dims = (r) => (r.type === 'grappe' ? [L_GRAPPE, H_GRAPPE, H_GRAPPE / 2] : [L_BLOC, H_BLOC, ANCRE_BLOC])

// Numérotation hiérarchique, comme le plan d'un document : 1, 1.2, 1.2.1 (la racine n'a pas de numéro).
function numero(a) {
  if (!a.parentId) return ''
  const p = sim.get(a.parentId)
  const rang = p.enfants.indexOf(a.id) + 1
  const np = numero(p)
  return np ? `${np}.${rang}` : `${rang}`
}

// ─── Zoom et déplacement ─────────────────────────────────────────────────────────────────────────────

const selScene = d3.select(scene)
const zoom = d3.zoom()
  .scaleExtent([0.2, 2.5])
  .clickDistance(5)
  .filter((e) => !e.target.closest('.inspecteur, .legende-arbre, .recadrer') && (!e.ctrlKey || e.type === 'wheel') && !e.button)
  .on('zoom', (e) => {
    vue = { x: e.transform.x, y: e.transform.y, k: e.transform.k }
    monde.style.transform = `translate(${vue.x}px,${vue.y}px) scale(${vue.k})`
    if (e.sourceEvent) { auto = false; boutonRecadrer.classList.add('visible') }
  })
selScene.call(zoom).on('dblclick.zoom', null)

function recadrer() {
  auto = true
  boutonRecadrer.classList.remove('visible')
}

boutonRecadrer.addEventListener('click', recadrer)
scene.addEventListener('dblclick', (e) => { if (!e.target.closest('.noeud, .inspecteur, .legende-arbre')) recadrer() })
scene.addEventListener('click', (e) => { if (!e.target.closest('.noeud, .inspecteur, .legende-arbre, .recadrer')) fermer() })
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermer() })

// Garde tout l'arbre visible (hors note en marge), tant que l'utilisateur n'a pas pris la main.
function cadrer(dt) {
  if (!auto) return
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const r of rendus.values()) {
    if (r.sortie) continue
    const [l, h, ancre] = dims(r)
    x0 = Math.min(x0, r.tx - 16); x1 = Math.max(x1, r.tx + l)
    y0 = Math.min(y0, r.ty - ancre); y1 = Math.max(y1, r.ty - ancre + h)
  }
  if (!Number.isFinite(x0)) return
  const m = { g: 36, d: 40 + (selection ? PANNEAU + 16 : 0), h: 70, b: 84 }
  const lu = Math.max(120, taille.l - m.g - m.d)
  const hu = Math.max(120, taille.h - m.h - m.b)
  let k = Math.min(1.05, lu / (x1 - x0), hu / (y1 - y0))
  let cx = m.g + (lu - (x1 - x0) * k) / 2 - x0 * k
  let cy = m.h + (hu - (y1 - y0) * k) / 2 - y0 * k
  // Zoom plancher lisible : si tout ne tient pas, on suit les agents au travail (ou la sélection).
  if (k < K_MIN) {
    k = K_MIN
    let ax0 = Infinity, ax1 = -Infinity, ay0 = Infinity, ay1 = -Infinity
    for (const [cle, r] of rendus) {
      if (r.sortie || r.type !== 'agent') continue
      const a = sim.get(cle)
      if (!a || !(selection ? cle === selection : estVivant(a))) continue
      ax0 = Math.min(ax0, r.tx - 16); ax1 = Math.max(ax1, r.tx + L_BLOC)
      ay0 = Math.min(ay0, r.ty - ANCRE_BLOC); ay1 = Math.max(ay1, r.ty - ANCRE_BLOC + H_BLOC)
    }
    if (!Number.isFinite(ax0)) { ax0 = x0; ax1 = x1; ay0 = y0; ay1 = y1 }
    // Centre sur les actifs, sans montrer de vide au-delà des bords de l'arbre.
    const bornes = (c, t0, t1, marge, utile) => {
      const tailleK = (t1 - t0) * k
      if (tailleK <= utile) return marge + (utile - tailleK) / 2 - t0 * k
      return Math.min(marge - t0 * k, Math.max(marge + utile - t1 * k, c))
    }
    cx = bornes(m.g + lu / 2 - ((ax0 + ax1) / 2) * k, x0, x1, m.g, lu)
    cy = bornes(m.h + hu / 2 - ((ay0 + ay1) / 2) * k, y0, y1, m.h, hu)
  }
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

// Un sous-arbre entièrement fini depuis un moment se replie en une ligne, sauf s'il contient la sélection.
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

// Largeur réelle du titre (numéro compris) : le trait vers les enfants part de la fin du texte.
function mesurer(r) {
  if (r.type !== 'agent') return
  const l = r.num.offsetWidth + 7 + r.t.offsetWidth // .t est déjà bornée par le flex (ellipse)
  r.largeur = Math.min(L_BLOC, l > 7 ? l : L_BLOC)
}

function creerAgent(a) {
  const el = document.createElement('div')
  el.className = 'noeud agent'
  el.style.setProperty('--c', couleurClair(a.role))
  el.innerHTML = `
    <div class="bloc">
      <div class="meta"><span class="role"></span><span class="sep">·</span><span class="modele"></span><span class="sep">·</span><span class="duree"></span><span class="sep">·</span><span class="tok"></span><button class="replier" title="Replier le sous-arbre terminé">replier</button></div>
      <div class="titre"><i class="carre"></i><span class="num"></span><span class="t"></span></div>
      <div class="activite"></div>
    </div>`
  const q = (s) => el.querySelector(s)
  q('.role').textContent = ROLES[a.role].libelle
  q('.modele').textContent = a.modele
  q('.num').textContent = numero(a)
  if (!a.parentId) q('.num').remove()
  q('.t').textContent = a.titre
  q('.titre').title = a.titre
  const id = a.id
  q('.bloc').addEventListener('click', () => selectionner(id))
  q('.replier').addEventListener('click', (e) => { e.stopPropagation(); deplies.delete(id) })
  return {
    type: 'agent', el, bloc: q('.bloc'), titreEl: q('.titre'), num: q('.num') || { offsetWidth: -7 }, t: q('.t'),
    duree: q('.duree'), tok: q('.tok'), act: q('.activite'),
  }
}

function creerGrappe(n) {
  const el = document.createElement('div')
  el.className = 'noeud grappe'
  const agents = n.grappe
  const echecs = agents.filter((x) => x.etat === 'echec').length
  el.innerHTML = `
    <div class="bloc" title="Déplier"><span class="plus">+</span><span class="txt">${agents.length} sous-agent${agents.length > 1 ? 's' : ''} terminé${agents.length > 1 ? 's' : ''}</span>${echecs ? `<span class="echecs">· ${echecs} échec${echecs > 1 ? 's' : ''}</span>` : ''}</div>`
  const id = n.parent.id
  el.querySelector('.bloc').addEventListener('click', () => deplies.add(id))
  return { type: 'grappe', el, bloc: el.querySelector('.bloc') }
}

function positionDepart(d) {
  if (!d.parent) return [d.y, d.x]
  const g = rendus.get(`g:${d.parent.data.cle}`) // on déplie : les enfants sortent de la ligne repliée
  if (g) return [g.x, g.y]
  const p = rendus.get(d.parent.data.cle)
  if (p) return [p.x + 40, p.y]
  return [d.y, d.x]
}

function cibleSortie(cle, r, cibles) {
  if (r.type === 'grappe') return [r.x, r.y]
  const a = sim.get(cle)
  let p = a && a.parentId ? sim.get(a.parentId) : null
  while (p) {
    const g = cibles.get(`g:${p.id}`)
    if (g) return [g.x, g.y] // on replie : l'agent rentre dans la ligne repliée
    const c = cibles.get(p.id)
    if (c) return [c.x + 40, c.y]
    p = p.parentId ? sim.get(p.parentId) : null
  }
  return [r.x, r.y]
}

// Ligne d'activité : italique pour ce qui se passe, petite ligne sans empattement pour un résultat.
function ligneActivite(a) {
  if (a.etat === 'en_file') {
    const rang = sim.file.indexOf(a) + 1
    return { cle: `f${rang}`, texte: rang ? `en file d’attente, rang ${rang}` : 'en file d’attente' }
  }
  if (a.etat === 'termine') return { cle: 't', fin: `✓ ${a.resultat ?? 'terminé'}` }
  if (a.etat === 'echec') return { cle: 'e', fin: `✗ ${a.resultat ?? 'échec'}` }
  if (a.etat === 'attend') {
    const enfants = sim.enfants(a)
    return { cle: `a${a.activite}${enfants.filter(estFini).length}`, texte: `${a.activite.toLowerCase()} — ${enfants.filter(estFini).length}/${enfants.length} finis` }
  }
  if (a.etat === 'outil') return { cle: `o${a.activite}`, outil: a.outilCourant, texte: a.activite }
  return { cle: `r${a.activite}`, texte: a.activite }
}

function majAgent(r, a, n) {
  const etat = a.etat
  const cls = `bloc etat-${etat}${estVivant(a) ? ' vivant' : ''}${selection === a.id ? ' choisi' : ''}`
  if (r.cls !== cls) { r.cls = cls; r.bloc.className = cls }

  const ligne = ligneActivite(a)
  if (r.cleAct !== ligne.cle) {
    const premier = r.cleAct === undefined
    const memeEtat = r.etatAct === etat
    r.cleAct = ligne.cle
    r.etatAct = etat
    r.act.replaceChildren()
    if (ligne.outil) {
      const o = document.createElement('span')
      o.className = 'outil'
      o.textContent = ligne.outil
      r.act.append(o)
    }
    if (ligne.fin) {
      const f = document.createElement('span')
      f.className = 'fin'
      f.textContent = ligne.fin
      r.act.append(f)
    } else r.act.append(ligne.texte)
    r.act.title = ligne.fin || ligne.texte
    // Transition fonctionnelle : la nouvelle activité apparaît en fondu (pas pour un simple compteur).
    if (!premier && !(memeEtat && etat === 'attend') && !(memeEtat && etat === 'en_file')) {
      r.act.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' })
    }
  }

  const enFile = etat === 'en_file'
  const duree = enFile ? sim.temps - a.creeA : (a.fin ?? sim.temps) - (a.debut ?? a.creeA)
  texte(r.duree, enFile ? `file ${formatTemps(duree)}` : formatTemps(duree))
  texte(r.tok, `${formatTokens(a.tokens)} tok`)

  const replier = !!n.replieManuel
  if (r.replier !== replier) { r.replier = replier; r.el.classList.toggle('avec-replier', replier) }
}

sim.surEvenement((evt) => {
  if (evt.type === 'redemarrage') aReinitialiser = true
})

// ─── Liens : coudes à angles arrondis ────────────────────────────────────────────────────────────────

const NS = 'http://www.w3.org/2000/svg'

// Deux couches : les troncs (partagés entre frères, toujours neutres) sous les branches (état de l'enfant).
const coucheTroncs = document.createElementNS(NS, 'g')
const coucheBranches = document.createElementNS(NS, 'g')
svgLiens.append(coucheTroncs, coucheBranches)

function creerLien() {
  const g = document.createElementNS(NS, 'g')
  const tronc = document.createElementNS(NS, 'path')
  const branche = document.createElementNS(NS, 'path')
  tronc.setAttribute('class', 'tronc')
  g.append(branche)
  coucheTroncs.append(tronc)
  coucheBranches.append(g)
  return { g, tronc, branche }
}

// Horizontal depuis le parent, vertical sur un « bus » proche des enfants, horizontal vers l'enfant.
// Le tronc (jusqu'au bas du bus) est commun aux frères ; la branche (dernier coude) porte l'état de l'enfant.
function coude(x0, y0, x1, y1) {
  const bus = x1 - 22
  const dy = y1 - y0
  const f = (v) => v.toFixed(1)
  if (Math.abs(dy) < 0.5) return { tronc: `M${f(x0)},${f(y0)}H${f(bus)}`, branche: `M${f(bus)},${f(y1)}H${f(x1)}` }
  const r = Math.min(RAYON, Math.abs(dy) / 2, Math.max(0, bus - x0))
  const s = Math.sign(dy)
  return {
    tronc: `M${f(x0)},${f(y0)}H${f(bus - r)}Q${f(bus)},${f(y0)} ${f(bus)},${f(y0 + s * r)}V${f(y1 - s * r)}`,
    branche: `M${f(bus)},${f(y1 - s * r)}Q${f(bus)},${f(y1)} ${f(bus + r)},${f(y1)}H${f(x1)}`,
  }
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
    const couleur = a ? couleurClair(a.role) : '#8e8e96'
    if (l.couleur !== couleur) { l.couleur = couleur; l.g.style.setProperty('--c', couleur) }
  }

  for (const [cle, l] of liens) {
    if (!presents.has(cle) && !l.sortie) { l.sortie = true; l.tSortie = maintenant; l.g.classList.add('sort') }
    const e = rendus.get(cle)
    const p = rendus.get(l.parentCle)
    if (!e || !p || (l.sortie && maintenant - l.tSortie > DUREE_SORTIE)) { l.g.remove(); l.tronc.remove(); liens.delete(cle); continue }
    const x0 = p.x + (p.largeur ?? L_BLOC) + 8
    const x1 = e.x - (e.type === 'grappe' ? 6 : 18)
    const { tronc, branche } = coude(x0, p.y, x1, e.y)
    if (l.d !== branche + tronc) { l.d = branche + tronc; l.tronc.setAttribute('d', tronc); l.branche.setAttribute('d', branche) }
    const surChemin = l.cls.includes('chemin')
    if (l.surChemin !== surChemin || l.sortieT !== l.sortie) {
      l.surChemin = surChemin
      l.sortieT = l.sortie
      l.tronc.setAttribute('class', `tronc${surChemin ? ' chemin' : ''}${l.sortie ? ' sort' : ''}`)
    }
  }
}

// ─── Inspecteur : note en marge ──────────────────────────────────────────────────────────────────────

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

function libelleEtat(a) {
  if (a.etat === 'outil') return `Appelle l’outil ${a.outilCourant}`
  if (a.etat === 'en_file') return ligneActivite(a).texte.replace(/^./, (c) => c.toUpperCase())
  return ETATS[a.etat].libelle
}

function majInspecteur(force = false) {
  if (!selection) return
  const a = sim.get(selection)
  if (!a) { fermer(); return }
  const maintenant = performance.now()
  if (!force && maintenant - derniereMajInsp < 100) return
  derniereMajInsp = maintenant

  const num = numero(a)
  insp.style.setProperty('--c', couleurClair(a.role))
  insp.classList.toggle('vivant', estVivant(a))
  texte(I.tete, `${num ? `§ ${num} · ` : ''}${ROLES[a.role].libelle} · ${a.modele}`)
  texte(I.titre, a.titre)
  texte(I.etat, libelleEtat(a))
  I.etat.className = `i-etat e-${a.etat}`
  texte(I.duree, a.debut === null ? '—' : formatTemps((a.fin ?? sim.temps) - a.debut))
  texte(I.tokens, formatTokens(a.tokens))
  texte(I.outils, String(a.nbOutils))
  texte(I.file, formatTemps((a.debut ?? sim.temps) - a.creeA))

  const parent = a.parentId ? sim.get(a.parentId) : null
  const np = parent ? numero(parent) : ''
  texte(I.parent, parent ? `${np ? `${np} ` : ''}${parent.titre}` : 'Camille')
  I.parent.title = parent ? parent.titre : ''
  I.parent.dataset.id = parent ? parent.id : ''
  I.parent.classList.toggle('lienable', !!parent)

  const enfants = sim.enfants(a)
  texte(I.enfants, enfants.length ? `${enfants.filter(estFini).length}/${enfants.length} finis, ${enfants.filter(estVivant).length} actifs` : 'aucun')
  texte(I.activite, a.etat === 'en_file' ? ligneActivite(a).texte : a.activite)
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
      li.innerHTML = '<time></time><span></span>'
      li.querySelector('time').textContent = formatTemps(e.t)
      li.querySelector('span').textContent = e.texte
      j.append(li)
      if (!premierRendu) li.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' })
    }
    if (enBas || premierRendu) j.scrollTop = j.scrollHeight
  }
}

// ─── Redémarrage ─────────────────────────────────────────────────────────────────────────────────────

function reinitialiser() {
  aReinitialiser = false
  for (const r of rendus.values()) r.el.remove()
  for (const l of liens.values()) { l.g.remove(); l.tronc.remove() }
  rendus.clear()
  liens.clear()
  deplies.clear()
  fermer()
  recadrer()
  premierCadrage = true
  monde.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease-out' })
}

// Les polices web changent la largeur des titres : on remesure quand elles sont prêtes.
document.fonts?.ready.then(() => { for (const r of rendus.values()) mesurer(r) })

// ─── Boucle de rendu ─────────────────────────────────────────────────────────────────────────────────

sim.surTic((_, dt) => {
  if (aReinitialiser) reinitialiser()
  const maintenant = performance.now()

  const racine = d3.hierarchy(construire(sim.racine))
  arbre(racine)
  const noeuds = racine.descendants()
  const cibles = new Map(noeuds.map((d) => [d.data.cle, { x: d.y, y: d.x }]))

  // Entrées et mises à jour
  const nouveaux = []
  for (const d of noeuds) {
    const cle = d.data.cle
    let r = rendus.get(cle)
    if (!r) {
      r = d.data.agent ? creerAgent(d.data.agent) : creerGrappe(d.data)
      const [x, y] = positionDepart(d)
      Object.assign(r, { x, y, sortie: false })
      coucheNoeuds.append(r.el)
      r.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' })
      rendus.set(cle, r)
      nouveaux.push(r)
    } else if (r.sortie) {
      r.sortie = false
      r.el.classList.remove('sort')
    }
    r.tx = d.y
    r.ty = d.x
    if (d.data.agent) majAgent(r, d.data.agent, d.data)
  }
  for (const r of nouveaux) mesurer(r)

  // Sorties : l'agent glisse vers la ligne repliée ou l'ancêtre qui l'absorbe, puis disparaît
  for (const [cle, r] of rendus) {
    if (r.sortie || cibles.has(cle)) continue
    r.sortie = true
    r.tSortie = maintenant
    ;[r.tx, r.ty] = cibleSortie(cle, r, cibles)
    r.el.classList.add('sort')
  }

  // Glissement vers les cibles (transition de layout)
  const f = 1 - Math.exp(-dt * 6.5)
  for (const [cle, r] of rendus) {
    if (r.sortie && maintenant - r.tSortie > DUREE_SORTIE) { r.el.remove(); rendus.delete(cle); continue }
    r.x += (r.tx - r.x) * f
    r.y += (r.ty - r.y) * f
    const t = `translate(${r.x.toFixed(1)}px,${(r.y - dims(r)[2]).toFixed(1)}px)`
    if (r.t !== t) { r.t = t; r.el.style.transform = t }
  }

  majLiens(noeuds, maintenant)
  cadrer(dt)
  majInspecteur()
})

sim.demarrer()
