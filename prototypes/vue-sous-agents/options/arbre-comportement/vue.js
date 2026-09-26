// Arbre de comportement : l'arbre des agents dessiné comme un Behavior Tree d'Unreal Engine en mode
// débogage. Racine en haut, enfants dessous dans l'ordre de lancement, liens orthogonaux de broche à
// broche ; le chemin d'exécution actif (racine → agents au travail) est surligné. Un panneau
// « Blackboard » liste les variables vivantes de la recherche ; « Détails » inspecte un nœud.
// Tout est recalculé depuis l'état de la simulation à chaque image (redémarrage et sauts compris).

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm'
import { simulationDepuisUrl, ROLES, ETATS, estFini, estVivant, formatTemps, formatTokens, QUESTION } from '../../commun/simulation.js'
import { monterBarre } from '../../commun/barre.js'
import { couleurClair } from '../../commun/clair.js'

const sim = simulationDepuisUrl()
monterBarre(sim, { titre: 'Arbre de comportement', sousTitre: 'chemin d’exécution, broche à broche' })

// Géométrie (unités du monde)
const L = 212
const H = 84
const ECART = 22
const RANG = H + 62
const BB = 280
const PANNEAU = 360
const DUREE_SORTIE = 320
const DELAI_REPLI = 1.6 // secondes réelles après la dernière fin d'un sous-arbre avant son repli

// ─── Types de nœud (façon UE) ────────────────────────────────────────────────────────────────────────

const ICONES = {
  sequence: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h11M10 5l3 3-3 3"/></svg>',
  parallele: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5h11M10.5 2.5l2.5 2-2.5 2M2 11.5h11M10.5 9.5l2.5 2-2.5 2"/></svg>',
  tache: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M6.5 5.5v5l4-2.5z" fill="currentColor"/></svg>',
  service: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="2.6"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4 5 11M11 5l1.4-1.4"/></svg>',
  blackboard: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M1.5 6h13M6 6v7.5"/></svg>',
  details: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4h10M3 8h10M3 12h6"/></svg>',
}

const TYPES = {
  orchestrateur: { genre: 'Composite', libelle: 'Séquence', icone: 'sequence', couleur: 'var(--t-composite)' },
  directeur_de_labo: { genre: 'Composite', libelle: 'Parallèle', icone: 'parallele', couleur: 'var(--t-composite)' },
  litterature: { genre: 'Tâche', libelle: 'Tâche', icone: 'tache', couleur: 'var(--t-tache)' },
  experimentateur: { genre: 'Tâche', libelle: 'Tâche', icone: 'tache', couleur: 'var(--t-tache)' },
  graphiste: { genre: 'Tâche', libelle: 'Tâche', icone: 'tache', couleur: 'var(--t-tache)' },
  recours: { genre: 'Tâche', libelle: 'Tâche', icone: 'tache', couleur: 'var(--t-tache)' },
  verificateur: { genre: 'Service', libelle: 'Service', icone: 'service', couleur: 'var(--t-service)' },
}

// ─── Squelette ───────────────────────────────────────────────────────────────────────────────────────

const scene = document.querySelector('.scene')
scene.innerHTML = `
  <div class="monde"><svg class="liens"><g class="l-normal"></g><g class="l-chemin"></g></svg><div class="noeuds"></div></div>
  <aside class="panneau-ue blackboard">
    <div class="onglet">${ICONES.blackboard}Blackboard<small>BB_Recherche</small></div>
    <dl class="bb-cles"></dl>
  </aside>
  <aside class="panneau-ue details">
    <div class="onglet">${ICONES.details}Détails<button class="d-fermer" title="Fermer (Échap)">×</button></div>
    <div class="d-tete">
      <div class="d-type"></div>
      <div class="d-titre"></div>
      <span class="badge d-badge"></span>
    </div>
    <div class="d-section">Nœud</div>
    <dl class="d-props">
      <div><dt>Rôle</dt><dd data-d="role"></dd></div>
      <div><dt>Modèle</dt><dd data-d="modele"></dd></div>
      <div><dt>Index</dt><dd data-d="index"></dd></div>
      <div><dt>Parent</dt><dd data-d="parent"></dd></div>
      <div><dt>Enfants</dt><dd data-d="enfants"></dd></div>
    </dl>
    <div class="d-section">Exécution</div>
    <dl class="d-props">
      <div><dt>Activité</dt><dd class="texte" data-d="activite"></dd></div>
      <div><dt>Durée</dt><dd data-d="duree"></dd></div>
      <div><dt>En file</dt><dd data-d="file"></dd></div>
      <div><dt>Tokens</dt><dd data-d="tokens"></dd></div>
      <div><dt>Appels d’outil</dt><dd data-d="outils"></dd></div>
      <div><dt>Résultat</dt><dd class="texte" data-d="resultat"></dd></div>
    </dl>
    <div class="d-section">Journal</div>
    <ol class="d-journal"></ol>
  </aside>
  <div class="legende-bt">
    <span><i class="t" style="--t:var(--t-composite)"></i>Composite</span>
    <span><i class="t" style="--t:var(--t-tache)"></i>Tâche</span>
    <span><i class="t" style="--t:var(--t-service)"></i>Service</span>
    <span><i class="a"></i>Actif</span>
    <span><i class="c"></i>Chemin d’exécution</span>
    <span class="aide">clic : détails · molette : zoom · double-clic : recadrer</span>
  </div>
  <button class="recadrer" title="Recadrer automatiquement (double-clic)">Recadrer</button>
`

const monde = scene.querySelector('.monde')
const gNormal = scene.querySelector('.l-normal')
const gChemin = scene.querySelector('.l-chemin')
const coucheNoeuds = scene.querySelector('.noeuds')
const boutonRecadrer = scene.querySelector('.recadrer')
const bbCles = scene.querySelector('.bb-cles')
const det = scene.querySelector('.details')
const D = {
  type: det.querySelector('.d-type'),
  titre: det.querySelector('.d-titre'),
  badge: det.querySelector('.d-badge'),
  journal: det.querySelector('.d-journal'),
  ...Object.fromEntries([...det.querySelectorAll('[data-d]')].map((el) => [el.dataset.d, el])),
}

// ─── État de la vue ──────────────────────────────────────────────────────────────────────────────────

const rendus = new Map() // id d'agent → nœud affiché
const liens = new Map() // id de l'enfant → lien affiché
const deplies = new Set() // sous-arbres finis que l'utilisateur a rouverts
let selection = null
let auto = true
let premierCadrage = true
let aReinitialiser = false
let derniereImage = 0
let vue = { x: 0, y: 0, k: 1 }
let taille = { l: scene.clientWidth, h: scene.clientHeight }
new ResizeObserver(() => { taille = { l: scene.clientWidth, h: scene.clientHeight } }).observe(scene)

const arbre = d3.tree().nodeSize([L + ECART, RANG]).separation((a, b) => (a.parent === b.parent ? 1 : 1.18))

function texte(el, v) {
  if (el.__v !== v) { el.__v = v; el.textContent = v }
}

function html(el, v) {
  if (el.__h !== v) { el.__h = v; el.innerHTML = v }
}

const echapper = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// ─── Zoom et déplacement ─────────────────────────────────────────────────────────────────────────────

const selScene = d3.select(scene)
const zoom = d3.zoom()
  .scaleExtent([0.2, 2])
  .clickDistance(5)
  .filter((e) => !e.target.closest('.panneau-ue, .legende-bt, .recadrer') && (!e.ctrlKey || e.type === 'wheel') && !e.button)
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
}

function recadrer() {
  auto = true
  boutonRecadrer.classList.remove('visible')
}

boutonRecadrer.addEventListener('click', recadrer)
scene.addEventListener('dblclick', (e) => { if (!e.target.closest('.noeud, .panneau-ue, .legende-bt')) recadrer() })
scene.addEventListener('click', (e) => { if (!e.target.closest('.noeud, .panneau-ue, .legende-bt, .recadrer')) fermer() })
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermer() })

// Garde tout l'arbre visible entre le Blackboard et le panneau Détails, tant qu'on n'a pas pris la main.
// Si l'arbre entier devient illisible (zoom < K_MIN), on garde K_MIN et on suit le chemin actif.
const K_MIN = 0.55

// La caméra ne bouge pas sous la souris : on peut viser un nœud pendant que l'arbre évolue.
let survol = false
coucheNoeuds.addEventListener('pointerover', () => { survol = true })
coucheNoeuds.addEventListener('pointerout', () => { survol = false })

function cadrer(dt, chemin, sauter) {
  if (!auto || (survol && !sauter)) return
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  let a0 = Infinity, a1 = -Infinity
  for (const [id, r] of rendus) {
    if (r.sortie) continue
    x0 = Math.min(x0, r.tx - L / 2); x1 = Math.max(x1, r.tx + L / 2)
    y0 = Math.min(y0, r.ty); y1 = Math.max(y1, r.ty + H + 22)
    if (chemin.has(id)) { a0 = Math.min(a0, r.tx - L / 2); a1 = Math.max(a1, r.tx + L / 2) }
  }
  if (!Number.isFinite(x0)) return
  const m = { g: BB + 40, d: 28 + (selection ? PANNEAU + 24 : 0), h: 28, b: 60 }
  const lu = Math.max(120, taille.l - m.g - m.d)
  const hu = Math.max(120, taille.h - m.h - m.b)
  const suivre = Number.isFinite(a0) || !!selection
  const k = Math.max(suivre ? K_MIN : 0.3, Math.min(1, lu / (x1 - x0), hu / (y1 - y0)))
  let cx = m.g + (lu - (x1 - x0) * k) / 2 - x0 * k
  if ((x1 - x0) * k > lu) {
    // Trop large : centre le chemin actif (ou la sélection), sans sortir des bords de l'arbre.
    const s = selection && rendus.get(selection)
    if (s && !s.sortie) { a0 = s.tx - L / 2; a1 = s.tx + L / 2 }
    const centre = Number.isFinite(a0) ? (a0 + a1) / 2 : (x0 + x1) / 2
    cx = m.g + lu / 2 - centre * k
    cx = Math.min(m.g - x0 * k, Math.max(m.g + lu - x1 * k, cx))
  }
  const cy = m.h + Math.max(0, (hu - (y1 - y0) * k) / 2) * 0.35 - y0 * k
  const f = premierCadrage || sauter ? 1 : 1 - Math.exp(-dt * 3.2)
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

// Un sous-arbre entièrement fini depuis un moment se replie sous son parent (bouton « +N »).
function construire(a) {
  const n = { id: a.id, agent: a, repliable: false, replie: 0 }
  if (!a.enfants.length) return n
  if (estFini(a) && a.parentId) {
    const desc = sousArbre(a)
    if (desc.every(estFini)) {
      n.repliable = true
      const derniere = Math.max(a.fin, ...desc.map((x) => x.fin))
      const mur = sim.temps - derniere > DELAI_REPLI * sim.vitesse
      const contientSelection = selection && desc.some((x) => x.id === selection)
      if (mur && !contientSelection && !deplies.has(a.id)) {
        n.replie = desc.length
        return n
      }
    }
  }
  n.children = sim.enfants(a).map(construire)
  return n
}

// ─── Nœuds ───────────────────────────────────────────────────────────────────────────────────────────

function creerNoeud(a) {
  const type = TYPES[a.role]
  const el = document.createElement('div')
  el.className = 'noeud'
  el.style.setProperty('--c', couleurClair(a.role))
  el.style.setProperty('--t', type.couleur)
  el.innerHTML = `
    <i class="broche haut"></i>
    <div class="boite">
      <div class="bandeau"></div>
      <div class="entete">${ICONES[type.icone]}<span>${type.libelle}</span><span class="index"></span></div>
      <div class="corps"><div class="role">${ROLES[a.role].libelle}</div><div class="titre-n"></div></div>
      <div class="pied"><span class="badge"></span><span class="detail"></span><span class="chrono"></span></div>
    </div>
    <i class="broche bas"></i>
    <button class="replier"></button>`
  const titre = el.querySelector('.titre-n')
  titre.textContent = a.titre
  titre.title = a.titre
  const id = a.id
  el.querySelector('.boite').addEventListener('click', () => selectionner(id))
  el.querySelector('.replier').addEventListener('click', (e) => {
    e.stopPropagation()
    if (deplies.has(id)) deplies.delete(id)
    else deplies.add(id)
  })
  return {
    el,
    index: el.querySelector('.index'),
    badge: el.querySelector('.badge'),
    detail: el.querySelector('.detail'),
    chrono: el.querySelector('.chrono'),
    replier: el.querySelector('.replier'),
  }
}

// Badge et détail du pied de nœud, selon l'état.
function etatPied(a) {
  if (estVivant(a)) return ['En cours', 'b-cours', `· ${a.etat === 'outil' ? a.outilCourant : 'réflexion'}`]
  if (a.etat === 'attend') {
    const enfants = sim.enfants(a)
    return ['Attend', 'b-attend', `${enfants.filter(estFini).length}/${enfants.length} enfants`]
  }
  if (a.etat === 'en_file') {
    const rang = sim.file.indexOf(a) + 1
    return ['En attente', 'b-file', rang ? `rang ${rang}` : '']
  }
  if (a.etat === 'termine') return ['Réussi', 'b-ok', a.resultat ?? '']
  return ['Échoué', 'b-echec', a.resultat ?? '']
}

function majNoeud(r, a, n, contexte) {
  const surChemin = contexte.chemin.has(a.id)
  const cls = `noeud e-${a.etat}${estVivant(a) ? ' vivant' : ''}${surChemin ? ' sur-chemin' : ''}`
    + `${n.children?.length ? ' parent' : ''}${a.parentId ? '' : ' racine'}`
    + `${n.repliable ? ' repliable' : ''}${selection === a.id ? ' choisi' : ''}${r.sortie ? ' sort' : ''}`
  if (r.cls !== cls) { r.cls = cls; r.el.className = cls }

  texte(r.index, String(contexte.index.get(a.id)))
  const [libelle, genre, detail] = etatPied(a)
  texte(r.badge, libelle)
  if (r.genre !== genre) { r.genre = genre; r.badge.className = `badge ${genre}` }
  texte(r.detail, detail)
  r.detail.title = estVivant(a) ? a.activite : detail
  const enFile = a.etat === 'en_file'
  texte(r.chrono, formatTemps(enFile ? sim.temps - a.creeA : (a.fin ?? sim.temps) - (a.debut ?? a.creeA)))
  texte(r.replier, n.replie ? `+${n.replie}` : '−')
  r.replier.title = n.replie ? `Déplier ${n.replie} sous-agents terminés` : 'Replier le sous-arbre terminé'
}

// ─── Liens orthogonaux ───────────────────────────────────────────────────────────────────────────────

const NS = 'http://www.w3.org/2000/svg'

function majLiens(noeuds, chemin, maintenant) {
  const presents = new Set()
  for (const d of noeuds) {
    if (!d.parent) continue
    const a = d.data.agent
    presents.add(a.id)
    let l = liens.get(a.id)
    if (!l) {
      l = { p: document.createElementNS(NS, 'path') }
      liens.set(a.id, l)
    }
    l.sortie = false
    l.parentId = d.parent.data.id
    const actif = chemin.has(a.id)
    const groupe = actif ? gChemin : gNormal
    if (l.p.parentNode !== groupe) groupe.append(l.p)
    const cls = a.etat === 'en_file' ? 'file' : a.etat === 'echec' ? 'echec' : ''
    if (l.cls !== cls) { l.cls = cls; l.p.setAttribute('class', cls) }
  }

  for (const [id, l] of liens) {
    if (!presents.has(id) && !l.sortie) { l.sortie = true; l.tSortie = maintenant; l.p.setAttribute('class', 'sort') }
    const e = rendus.get(id)
    const p = rendus.get(l.parentId)
    if (!e || !p || (l.sortie && maintenant - l.tSortie > DUREE_SORTIE)) { l.p.remove(); liens.delete(id); continue }
    const x0 = p.x, y0 = p.y + H + 4, x1 = e.x, y1 = e.y - 4
    const ym = y0 + (y1 - y0) / 2
    const dPath = `M${x0.toFixed(1)},${y0.toFixed(1)}V${ym.toFixed(1)}H${x1.toFixed(1)}V${y1.toFixed(1)}`
    if (l.d !== dPath) { l.d = dPath; l.p.setAttribute('d', dPath) }
  }
}

// ─── Blackboard ──────────────────────────────────────────────────────────────────────────────────────

const CLES = [
  ['Question', 'String'],
  ['Temps', 'Float'],
  ['AgentsActifs', 'Array<Agent>'],
  ['Places', 'Int'],
  ['FileAttente', 'Array<Agent>'],
  ['AgentsLances', 'Int'],
  ['TokensTotaux', 'Int'],
  ['NoeudSelectionne', 'Object'],
]
bbCles.innerHTML = CLES.map(([cle, type]) => `<div class="bb-ligne"><dt>${cle}</dt><span class="type">${type}</span><dd data-bb="${cle}"></dd></div>`).join('')
const BBV = Object.fromEntries([...bbCles.querySelectorAll('[data-bb]')].map((el) => [el.dataset.bb, el]))
BBV.Question.textContent = QUESTION
for (const cle of ['Temps', 'AgentsLances', 'TokensTotaux']) BBV[cle].classList.add('nombre')

function listeAgents(agents, suffixe, max = 6) {
  if (!agents.length) return '<span class="bb-vide">vide</span>'
  const index = new Map(sim.ordre.map((id, i) => [id, i + 1]))
  const lignes = agents.slice(0, max).map((a) => `<li><b>#${index.get(a.id)}</b><span class="r" style="color:${couleurClair(a.role)}">${ROLES[a.role].court}</span><span>${echapper(suffixe(a))}</span></li>`)
  if (agents.length > max) lignes.push(`<li><b></b><span class="bb-vide">+${agents.length - max} autres</span></li>`)
  return `<ul>${lignes.join('')}</ul>`
}

let derniereMajBB = 0

function majBlackboard(maintenant, force = false) {
  if (!force && maintenant - derniereMajBB < 150) return
  derniereMajBB = maintenant
  const s = sim.stats()
  const actifs = sim.liste().filter(estVivant)
  texte(BBV.Temps, `T+${formatTemps(sim.temps)}${sim.fini ? ' · fini' : ''}`)
  html(BBV.AgentsActifs, listeAgents(actifs, (a) => (a.etat === 'outil' ? a.outilCourant : 'réflexion')))
  html(BBV.Places, `<span class="nombre" style="font:500 12.5px var(--mono);color:var(--texte)">${s.actifs} / ${sim.places} occupées</span>`
    + `<span class="jauge">${Array.from({ length: sim.places }, (_, i) => `<i class="${i < s.actifs ? 'pris' : ''}"></i>`).join('')}</span>`)
  html(BBV.FileAttente, listeAgents(sim.file, (a) => a.titre, 4))
  texte(BBV.AgentsLances, `${s.total}  (${s.termines} réussis, ${s.echecs} échoués)`)
  texte(BBV.TokensTotaux, formatTokens(s.tokens))
  const a = selection && sim.get(selection)
  texte(BBV.NoeudSelectionne, a ? `#${sim.ordre.indexOf(a.id) + 1} ${ROLES[a.role].libelle} · ${a.titre}` : 'Aucun')
}

// ─── Détails ─────────────────────────────────────────────────────────────────────────────────────────

let journalRendu = 0
let derniereMajDet = 0

function selectionner(id) {
  selection = id
  journalRendu = 0
  D.journal.innerHTML = ''
  det.classList.add('ouvert')
  scene.classList.add('avec-details')
  majDetails(true)
}

function fermer() {
  if (!selection) return
  selection = null
  det.classList.remove('ouvert')
  scene.classList.remove('avec-details')
}

det.querySelector('.d-fermer').addEventListener('click', fermer)
D.parent.addEventListener('click', () => { if (D.parent.dataset.id) selectionner(D.parent.dataset.id) })

function majDetails(force = false) {
  if (!selection) return
  const a = sim.get(selection)
  if (!a) { fermer(); return }
  const maintenant = performance.now()
  if (!force && maintenant - derniereMajDet < 100) return
  derniereMajDet = maintenant

  const type = TYPES[a.role]
  det.style.setProperty('--t', type.couleur)
  html(D.type, `${ICONES[type.icone]}<span>${type.genre}${type.genre === 'Composite' ? ` · ${type.libelle}` : ''}</span>`)
  texte(D.titre, a.titre)
  const [libelle, genre, detail] = etatPied(a)
  texte(D.badge, `${libelle}${estVivant(a) ? ` ${detail}` : ''}`)
  D.badge.className = `badge d-badge ${genre}`

  texte(D.role, ROLES[a.role].libelle)
  D.role.style.color = couleurClair(a.role)
  texte(D.modele, a.modele)
  texte(D.index, `#${sim.ordre.indexOf(a.id) + 1} · profondeur ${a.profondeur}`)
  const parent = a.parentId ? sim.get(a.parentId) : null
  texte(D.parent, parent ? `#${sim.ordre.indexOf(parent.id) + 1} ${ROLES[parent.role].libelle}` : 'Camille')
  D.parent.dataset.id = parent ? parent.id : ''
  D.parent.classList.toggle('lienable', !!parent)
  const enfants = sim.enfants(a)
  texte(D.enfants, enfants.length ? `${enfants.length} · ${enfants.filter(estFini).length} finis, ${enfants.filter(estVivant).length} actifs` : 'aucun')

  texte(D.activite, a.etat === 'en_file' ? 'En file d’attente' : a.activite)
  texte(D.duree, a.debut === null ? '—' : formatTemps((a.fin ?? sim.temps) - a.debut))
  texte(D.file, formatTemps((a.debut ?? sim.temps) - a.creeA))
  texte(D.tokens, formatTokens(a.tokens))
  texte(D.outils, String(a.nbOutils))
  texte(D.resultat, a.resultat ?? '—')
  D.resultat.classList.toggle('echec', a.etat === 'echec')

  if (journalRendu < a.journal.length) {
    const j = D.journal
    const enBas = j.scrollHeight - j.scrollTop - j.clientHeight < 40
    const premier = journalRendu === 0
    for (; journalRendu < a.journal.length; journalRendu++) {
      const e = a.journal[journalRendu]
      const li = document.createElement('li')
      li.dataset.t = e.type
      li.dataset.e = e.etat
      li.innerHTML = '<time></time><b></b><span></span>'
      li.querySelector('time').textContent = formatTemps(e.t)
      li.querySelector('b').textContent = e.type === 'etat' ? (e.etat === 'outil' ? 'outil' : ETATS[e.etat].libelle.split(' ')[0].toLowerCase()) : e.type
      li.querySelector('span').textContent = e.texte
      j.append(li)
    }
    if (enBas || premier) j.scrollTop = j.scrollHeight
  }
}

// ─── Redémarrage ─────────────────────────────────────────────────────────────────────────────────────

sim.surEvenement((evt) => { if (evt.type === 'redemarrage') aReinitialiser = true })

function reinitialiser() {
  aReinitialiser = false
  for (const r of rendus.values()) r.el.remove()
  for (const l of liens.values()) l.p.remove()
  rendus.clear()
  liens.clear()
  deplies.clear()
  fermer()
  recadrer()
  premierCadrage = true
}

// ─── Boucle de rendu ─────────────────────────────────────────────────────────────────────────────────

sim.surTic((_, dt) => {
  if (aReinitialiser) reinitialiser()
  const maintenant = performance.now()

  const racine = d3.hierarchy(construire(sim.racine))
  arbre(racine)
  const noeuds = racine.descendants()
  const cibles = new Map(noeuds.map((d) => [d.data.id, d]))

  // Chemin d'exécution actif : chaque agent au travail et tous ses ancêtres.
  const chemin = new Set()
  for (const a of sim.agents.values()) {
    if (!estVivant(a)) continue
    for (let x = a; x && !chemin.has(x.id); x = x.parentId ? sim.get(x.parentId) : null) chemin.add(x.id)
  }
  const contexte = { chemin, index: new Map(sim.ordre.map((id, i) => [id, i + 1])) }

  for (const d of noeuds) {
    const a = d.data.agent
    let r = rendus.get(a.id)
    if (!r) {
      r = creerNoeud(a)
      const p = d.parent && rendus.get(d.parent.data.id)
      Object.assign(r, p ? { x: p.x, y: p.y + 40 } : { x: d.x, y: d.y })
      coucheNoeuds.append(r.el)
      rendus.set(a.id, r)
    }
    r.sortie = false
    r.tx = d.x
    r.ty = d.y
    majNoeud(r, a, d.data, contexte)
  }

  // Sorties : les nœuds d'un sous-arbre replié remontent vers l'ancêtre visible et s'effacent.
  for (const [id, r] of rendus) {
    if (cibles.has(id) || r.sortie) continue
    r.sortie = true
    r.tSortie = maintenant
    for (let p = sim.get(id); p; p = p.parentId ? sim.get(p.parentId) : null) {
      const c = rendus.get(p.parentId)
      if (c && cibles.has(p.parentId)) { r.tx = c.tx; r.ty = c.ty; break }
    }
    r.el.classList.add('sort')
    r.cls = null
  }

  // Après un onglet masqué ou un gros saut d'image, on se recale d'un coup plutôt que de glisser.
  const sauter = maintenant - derniereImage > 250
  derniereImage = maintenant
  const f = sauter ? 1 : 1 - Math.exp(-dt * 7)
  for (const [id, r] of rendus) {
    if (r.sortie && maintenant - r.tSortie > DUREE_SORTIE) { r.el.remove(); rendus.delete(id); continue }
    r.x += (r.tx - r.x) * f
    r.y += (r.ty - r.y) * f
    const t = `translate(${(r.x - L / 2).toFixed(1)}px,${r.y.toFixed(1)}px)`
    if (r.t !== t) { r.t = t; r.el.style.transform = t }
  }

  majLiens(noeuds, chemin, maintenant)
  cadrer(dt, chemin, sauter)
  majBlackboard(maintenant)
  majDetails()
})

appliquerVue()
sim.demarrer()
