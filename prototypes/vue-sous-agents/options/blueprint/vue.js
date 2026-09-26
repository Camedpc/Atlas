// Blueprint : chaque agent est un nœud à broches, façon éditeur de nœuds d'Unreal Engine, en version claire.
// Gauche → droite : l'événement « Question de Camille » déclenche l'orchestrateur ; chaque lancement de
// sous-agent part d'une broche d'exécution « Lance → … » vers la broche d'entrée de l'enfant, et la broche
// de données « contexte » alimente la broche « mission » des enfants. Tout est recalculé depuis l'état de la
// simulation à chaque image (redémarrages et sauts de temps compris) ; seules les positions glissent.

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm'
import { simulationDepuisUrl, ROLES, ETATS, estFini, estVivant, formatTemps, formatTokens, QUESTION } from '../../commun/simulation.js'
import { monterBarre } from '../../commun/barre.js'
import { couleurClair } from '../../commun/clair.js'

const sim = simulationDepuisUrl()
monterBarre(sim, { titre: 'Blueprint', sousTitre: 'un nœud par agent, un fil d’exécution par lancement' })

// Géométrie (unités du monde) : doit rester alignée sur le CSS de index.html
const L = 300 // largeur d'un nœud agent
const L_EVT = 250 // largeur du nœud événement
const TETE = 42
const MARGE = 6 // marge verticale du corps
const RANG = 22 // hauteur d'une rangée de broches
const PIED = 22
const PIN = 11 // distance du centre d'une broche au bord du nœud
const ECART_X = 110
const COL = L + ECART_X
const X0 = L_EVT + ECART_X
const ECART_Y = 18
const COMMENT = { haut: 42, bas: 14, cote: 18 }
const K_LISIBLE = 0.55 // en dessous, on ne cadre plus tout : on suit les agents au travail
const PANNEAU = 340
const PERIODE = 2.6 // secondes réelles pour qu'une impulsion parcoure un fil
const DELAI_REPLI = 1.6 // secondes réelles entre la fin d'un sous-graphe et sa réduction

const ICONES = { orchestrateur: 'ƒ', directeur_de_labo: '▤', litterature: '¶', experimentateur: '∫', graphiste: '◇', verificateur: '✓', recours: '§' }
const TYPES = { texte: 'texte', entier: 'entier' }
const SVG_EXEC = '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M1.5 1.5H6.6L10.6 6L6.6 10.5H1.5Z"/></svg>'

// ─── Squelette ───────────────────────────────────────────────────────────────────────────────────────

const scene = document.querySelector('.scene')
scene.innerHTML = `
  <div class="monde">
    <div class="commentaires"></div>
    <svg class="fils"><g class="g-donnees"></g><g class="g-exec"></g><g class="g-impulsions"></g></svg>
    <div class="noeuds"></div>
  </div>
  <aside class="details">
    <div class="d-onglet"><span>Détails</span><button class="d-fermer" title="Fermer (Échap)">×</button></div>
    <div class="d-tete"><span class="d-ico"></span><div><div class="d-role"></div><h2 class="d-titre"></h2></div></div>
    <div class="d-defil">
      <details open>
        <summary>Détails</summary>
        <dl class="props">
          <div><dt>Modèle</dt><dd class="mono" data-p="modele"></dd></div>
          <div><dt>État</dt><dd data-p="etat"></dd></div>
          <div><dt>Activité</dt><dd data-p="activite"></dd></div>
          <div data-l="dossier"><dt>Dossier</dt><dd class="mono" data-p="dossier"></dd></div>
          <div><dt>Durée</dt><dd class="mono" data-p="duree"></dd></div>
          <div><dt>Attente en file</dt><dd class="mono" data-p="file"></dd></div>
          <div><dt>Tokens</dt><dd class="mono" data-p="tokens"></dd></div>
          <div><dt>Appels d’outils</dt><dd class="mono" data-p="outils"></dd></div>
          <div><dt>Lancé par</dt><dd data-p="parent"></dd></div>
          <div><dt>Sous-agents</dt><dd data-p="enfants"></dd></div>
          <div><dt>Résultat</dt><dd data-p="resultat"></dd></div>
        </dl>
      </details>
      <details open>
        <summary>Journal <small data-p="nbJournal"></small></summary>
        <ol class="journal"></ol>
      </details>
    </div>
  </aside>
  <div class="legende-bp">
    <span><span class="pin exec">${SVG_EXEC}</span>exécution</span>
    <span><i class="l-exec"></i>lancement</span>
    <span><i class="l-actif"></i>agent au travail</span>
    <span><i class="l-donnee"></i>donnée</span>
    ${Object.entries(TYPES).map(([k, v]) => `<span><span class="pin donnee t-${k}"><i></i></span>${v}</span>`).join('')}
    <span class="aide">clic : détails · molette : zoom · double-clic : recadrer</span>
  </div>
  <button class="recadrer" title="Recadrer automatiquement (double-clic)">Recadrer</button>
`

const monde = scene.querySelector('.monde')
const coucheComment = scene.querySelector('.commentaires')
const coucheNoeuds = scene.querySelector('.noeuds')
const gDonnees = scene.querySelector('.g-donnees')
const gExec = scene.querySelector('.g-exec')
const gImpulsions = scene.querySelector('.g-impulsions')
const boutonRecadrer = scene.querySelector('.recadrer')
const panneau = scene.querySelector('.details')
const P = Object.fromEntries([...panneau.querySelectorAll('[data-p]')].map((el) => [el.dataset.p, el]))
const P_ICO = panneau.querySelector('.d-ico')
const P_ROLE = panneau.querySelector('.d-role')
const P_TITRE = panneau.querySelector('.d-titre')
const P_JOURNAL = panneau.querySelector('.journal')
const P_LIGNE_DOSSIER = panneau.querySelector('[data-l="dossier"]')

// ─── État de la vue ──────────────────────────────────────────────────────────────────────────────────

const rendus = new Map() // clé → nœud affiché
const fils = new Map() // clé → fil affiché
const impulsions = new Map() // id d'agent → cercle
const commentaires = new Map() // id de directeur → boîte
const deplies = new Set() // sous-graphes dépliés à la main
let selection = null
let auto = true
let premierCadrage = true
let aReinitialiser = false
let vue = { x: 0, y: 0, k: 1 }
let taille = { l: scene.clientWidth, h: scene.clientHeight }
new ResizeObserver(() => { taille = { l: scene.clientWidth, h: scene.clientHeight } }).observe(scene)

function texte(el, v) {
  if (el.__v !== v) { el.__v = v; el.textContent = v; el.title = v }
}

function basculerClasse(r, cls) {
  if (r.cls !== cls) { r.cls = cls; r.el.className = cls }
}

// ─── Zoom et déplacement ─────────────────────────────────────────────────────────────────────────────

const selScene = d3.select(scene)
const zoom = d3.zoom()
  .scaleExtent([0.2, 2])
  .clickDistance(5)
  .filter((e) => !e.target.closest('.details, .legende-bp, .recadrer') && (!e.ctrlKey || e.type === 'wheel') && !e.button)
  .on('zoom', (e) => {
    vue = { x: e.transform.x, y: e.transform.y, k: e.transform.k }
    appliquerVue()
    if (e.sourceEvent) { auto = false; boutonRecadrer.classList.add('visible') }
  })
selScene.call(zoom).on('dblclick.zoom', null)

function appliquerVue() {
  monde.style.transform = `translate(${vue.x}px,${vue.y}px) scale(${vue.k})`
  const g = 128 * vue.k
  const f = 16 * vue.k
  scene.style.backgroundSize = `${g}px ${g}px, ${g}px ${g}px, ${f}px ${f}px, ${f}px ${f}px`
  scene.style.backgroundPosition = `${vue.x}px ${vue.y}px`
}

function recadrer() {
  auto = true
  boutonRecadrer.classList.remove('visible')
}

boutonRecadrer.addEventListener('click', recadrer)
scene.addEventListener('dblclick', (e) => { if (!e.target.closest('.noeud, .details, .legende-bp')) recadrer() })
scene.addEventListener('click', (e) => { if (!e.target.closest('.noeud, .details, .legende-bp, .recadrer')) fermer() })
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermer() })

// Garde tout le graphe visible (hors panneau), tant que l'utilisateur n'a pas pris la main.
function cadrer(dt) {
  if (!auto) return
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const r of rendus.values()) {
    x0 = Math.min(x0, r.tx); x1 = Math.max(x1, r.tx + r.l)
    y0 = Math.min(y0, r.ty); y1 = Math.max(y1, r.ty + r.h)
  }
  for (const c of commentaires.values()) {
    if (!c.boite) continue
    y0 = Math.min(y0, c.boite.y); y1 = Math.max(y1, c.boite.y + c.boite.h)
    x1 = Math.max(x1, c.boite.x + c.boite.l)
  }
  if (!Number.isFinite(x0)) return
  const m = { g: 32, d: 32 + (selection ? PANNEAU : 0), h: 28, b: 64 }
  const lu = Math.max(120, taille.l - m.g - m.d)
  const hu = Math.max(120, taille.h - m.h - m.b)
  let k = Math.min(1, lu / (x1 - x0), hu / (y1 - y0))
  let cy = m.h + Math.max(0, (hu - (y1 - y0) * k) / 2) - y0 * k
  if (k < K_LISIBLE) {
    // Graphe trop haut pour rester lisible : on garde la largeur et on centre sur les agents au travail.
    k = Math.max(0.3, Math.min(K_LISIBLE, lu / (x1 - x0)))
    let a0 = Infinity, a1 = -Infinity
    for (const [cle, r] of rendus) {
      const a = sim.get(cle)
      if (!a || !estVivant(a)) continue
      a0 = Math.min(a0, r.ty); a1 = Math.max(a1, r.ty + r.h)
    }
    if (!Number.isFinite(a0)) { a0 = y0; a1 = y1 }
    const centre = (a0 + a1) / 2
    cy = m.h + hu / 2 - centre * k
    cy = Math.min(m.h - y0 * k, Math.max(m.h + hu - y1 * k, cy))
  }
  const cx = m.g + Math.max(0, (lu - (x1 - x0) * k) / 2) - x0 * k
  const f = premierCadrage ? 1 : 1 - Math.exp(-dt * 3)
  premierCadrage = false
  const nk = vue.k + (k - vue.k) * f
  const nx = vue.x + (cx - vue.x) * f
  const ny = vue.y + (cy - vue.y) * f
  if (Math.abs(nx - vue.x) + Math.abs(ny - vue.y) + Math.abs(nk - vue.k) * 500 < 0.05) return
  selScene.call(zoom.transform, d3.zoomIdentity.translate(nx, ny).scale(nk))
}

// ─── Graphe affiché ──────────────────────────────────────────────────────────────────────────────────

function sousArbre(a, acc = []) {
  for (const e of sim.enfants(a)) { acc.push(e); sousArbre(e, acc) }
  return acc
}

// Un sous-graphe entièrement fini depuis un moment se réduit en une rangée « Sous-graphe réduit »,
// comme un « Collapse Nodes » d'Unreal, sauf s'il contient la sélection.
function construire(a) {
  const n = { cle: a.id, agent: a, enfants: [], reduit: false, replieManuel: false, nb: 0 }
  if (a.enfants.length && a !== sim.racine && estFini(a)) {
    const desc = sousArbre(a)
    if (desc.every(estFini)) {
      const derniere = Math.max(a.fin, ...desc.map((x) => x.fin))
      const mur = sim.temps - derniere > DELAI_REPLI * sim.vitesse
      const contientSelection = selection && desc.some((x) => x.id === selection)
      if (mur && !contientSelection) {
        if (!deplies.has(a.id)) { n.reduit = true; n.nb = desc.length; return n }
        n.replieManuel = true
      }
    }
  }
  n.enfants = sim.enfants(a).map(construire)
  return n
}

// Rangées de broches d'un nœud : à gauche les entrées, à droite les sorties.
function lignes(n) {
  const a = n.agent
  const compact = estFini(a) && selection !== a.id
  const g = [{ k: 'exec', genre: 'exec', lab: '' }, { k: 'mission', genre: 'texte', lab: 'mission' }]
  if (!compact) g.push({ k: 'modele', genre: 'texte', lab: 'modèle', champ: true })
  const d = [{ k: 'fin', genre: 'exec', lab: 'Terminé' }]
  if (n.reduit) {
    d.push({ k: 'deplier', genre: 'action', lab: `Sous-graphe réduit · ${n.nb} agents`, bouton: 'deplier', pic: '+' })
  } else {
    const compte = {}
    for (const e of sim.enfants(a)) {
      compte[e.role] = (compte[e.role] || 0) + 1
      d.push({ k: `l:${e.id}`, genre: 'exec', lab: `Lance → ${ROLES[e.role].court} ${compte[e.role]}` })
    }
    if (n.replieManuel) d.push({ k: 'replier', genre: 'action', lab: 'Réduire le sous-graphe', bouton: 'replier', pic: '−' })
  }
  if (a.enfants.length) d.push({ k: 'contexte', genre: 'texte', lab: 'contexte' })
  if (!compact && a.etat !== 'en_file') d.push({ k: 'tokens', genre: 'entier', lab: 'tokens' }, { k: 'outils', genre: 'entier', lab: 'outils' })
  if (a.etat !== 'en_file') d.push({ k: 'resultat', genre: 'texte', lab: 'résultat' })
  const rangs = Math.max(g.length, d.length)
  return { g, d, pied: !compact, rangs, h: 2 + TETE + 2 * MARGE + rangs * RANG + (compact ? 0 : PIED) }
}

// Rangée de disposition : un sous-graphe occupe une bande verticale ; les directeurs réservent la place
// de leur boîte « Comment ».
function mesurer(n) {
  n.spec = lignes(n)
  const dir = n.agent.role === 'directeur_de_labo'
  n.ph = dir ? COMMENT.haut : 0
  n.pb = dir ? COMMENT.bas : 0
  n.span = n.enfants.length ? n.enfants.reduce((s, e) => s + mesurer(e), 0) + ECART_Y * (n.enfants.length - 1) : 0
  n.bande = Math.max(n.spec.h, n.span) + n.ph + n.pb
  return n.bande
}

function poser(n, profondeur, haut, acc) {
  const interieur = haut + n.ph
  const contenu = Math.max(n.spec.h, n.span)
  n.tx = X0 + profondeur * COL
  n.ty = interieur + (contenu - n.spec.h) / 2
  n.desc = []
  acc.push(n)
  let y = interieur + (contenu - n.span) / 2
  for (const e of n.enfants) {
    poser(e, profondeur + 1, y, acc)
    n.desc.push(e.cle, ...e.desc)
    y += e.bande + ECART_Y
  }
}

// ─── Nœuds ───────────────────────────────────────────────────────────────────────────────────────────

function broche(genre, plein = false) {
  if (genre === 'exec') return `<span class="pin exec${plein ? ' plein' : ''}">${SVG_EXEC}</span>`
  if (genre === 'action') return ''
  return `<span class="pin donnee t-${genre}${plein ? ' plein' : ''}"><i></i></span>`
}

function creerNoeud(a) {
  const el = document.createElement('div')
  el.dataset.id = a.id
  el.style.setProperty('--c', couleurClair(a.role))
  el.style.width = `${L}px`
  el.innerHTML = `
    <div class="tete">
      <span class="ico">${ICONES[a.role]}</span>
      <div class="tt"><b>${ROLES[a.role].libelle}</b><span></span></div>
      <span class="chrono"></span>
    </div>
    <div class="corps"><div class="col g"></div><div class="col d"></div></div>
    <div class="pied"><span class="etiq"></span><span class="txt"></span></div>
    <span class="badge">Erreur</span>`
  const mission = el.querySelector('.tt span')
  mission.textContent = a.titre
  mission.title = a.titre
  return {
    type: 'agent', el, l: L,
    chrono: el.querySelector('.chrono'),
    colG: el.querySelector('.col.g'), colD: el.querySelector('.col.d'),
    pied: el.querySelector('.pied'), etiq: el.querySelector('.etiq'), txt: el.querySelector('.pied .txt'),
  }
}

function htmlRang(ligne, cote) {
  const cls = `rang${ligne.genre === 'exec' ? ' exec' : ''}${ligne.bouton ? ' bouton' : ''}`
  const b = ligne.bouton ? ` data-b="${ligne.bouton}"` : ''
  const titre = ligne.genre in TYPES ? ` title="${ligne.lab} : ${TYPES[ligne.genre]}"` : ''
  const relie = ligne.k === 'exec' || ligne.k === 'mission' || ligne.k.startsWith('l:') || ligne.k === 'contexte'
  const pin = ligne.genre === 'action' ? `<span class="pin action">${ligne.pic}</span>` : broche(ligne.genre, relie)
  const lab = `<span class="lab"${titre}>${ligne.lab}</span>`
  if (cote === 'g') return `<div class="${cls}" data-k="${ligne.k}"${b}>${pin}${lab}${ligne.champ ? '<span class="champ"></span>' : ''}</div>`
  return `<div class="${cls}" data-k="${ligne.k}"${b}>${pin}<span class="val"></span>${lab}</div>`
}

function rangee(r, n) {
  const s = n.spec
  const sig = `${s.g.map((x) => x.k).join(',')}|${s.d.map((x) => x.k + x.lab).join(',')}|${s.pied}`
  if (r.sig === sig) return
  r.sig = sig
  r.colG.innerHTML = s.g.map((x) => htmlRang(x, 'g')).join('')
  r.colD.innerHTML = s.d.map((x) => htmlRang(x, 'd')).join('')
  r.pied.style.display = s.pied ? '' : 'none'
  r.v = {
    modele: r.colG.querySelector('[data-k="modele"] .champ'),
    tokens: r.colD.querySelector('[data-k="tokens"] .val'),
    outils: r.colD.querySelector('[data-k="outils"] .val'),
    resultat: r.colD.querySelector('[data-k="resultat"] .val'),
    fin: r.colD.querySelector('[data-k="fin"] .pin'),
  }
  if (r.v.resultat) r.v.resultat.classList.add('v-resultat')
  r.finPlein = undefined
}

function etiquettePied(a) {
  if (a.etat === 'en_file') {
    const rang = sim.file.indexOf(a) + 1
    return ['Désactivé', rang ? `En file · rang ${rang}` : 'En file']
  }
  if (a.etat === 'reflechit') return ['Réfléchit', a.activite]
  if (a.etat === 'outil') return [a.outilCourant, a.activite]
  if (a.etat === 'attend') {
    const enfants = sim.enfants(a)
    return [`Attend ${enfants.filter(estFini).length}/${enfants.length}`, a.activite]
  }
  return [ETATS[a.etat].libelle, a.resultat ?? '']
}

function majNoeud(r, n) {
  const a = n.agent
  rangee(r, n)
  basculerClasse(r, `noeud e-${a.etat}${estVivant(a) ? ' vivant' : ''}${selection === a.id ? ' choisi' : ''}`)
  const enFile = a.etat === 'en_file'
  texte(r.chrono, enFile ? '' : formatTemps((a.fin ?? sim.temps) - (a.debut ?? a.creeA)))
  if (r.v.modele) texte(r.v.modele, a.modele)
  if (r.v.tokens) texte(r.v.tokens, formatTokens(a.tokens))
  if (r.v.outils) texte(r.v.outils, String(a.nbOutils))
  if (r.v.resultat) texte(r.v.resultat, a.resultat ?? '—')
  const finPlein = a.etat === 'termine'
  if (r.finPlein !== finPlein) { r.finPlein = finPlein; r.v.fin.classList.toggle('plein', finPlein) }
  if (n.spec.pied) {
    const [etiq, txt] = etiquettePied(a)
    texte(r.etiq, etiq)
    texte(r.txt, txt)
  }
  r.spec = n.spec
}

// Nœud « Événement » : le point de départ du graphe, comme un Event Begin d'Unreal.
function creerEvenement() {
  const el = document.createElement('div')
  el.className = 'noeud evenement'
  el.style.width = `${L_EVT}px`
  el.innerHTML = `
    <div class="tete"><span class="ico">▶</span><div class="tt"><b>Événement</b><span>Question de Camille</span></div></div>
    <div class="corps" style="grid-template-columns: 0 1fr">
      <div class="col g"></div>
      <div class="col d">${htmlRang({ k: 'exec', genre: 'exec', lab: '' }, 'd')}${htmlRang({ k: 'question', genre: 'texte', lab: 'question' }, 'd')}</div>
    </div>
    <div class="question"></div>`
  el.querySelector('.question').textContent = QUESTION
  el.querySelectorAll('.pin').forEach((p) => p.classList.add('plein'))
  return { type: 'evenement', el, l: L_EVT, cls: el.className, spec: { d: [{ k: 'exec' }, { k: 'question' }], g: [] } }
}

// ─── Fils ────────────────────────────────────────────────────────────────────────────────────────────

const NS = 'http://www.w3.org/2000/svg'

const brocheY = (r, i) => r.y + 1 + TETE + MARGE + i * RANG + RANG / 2
const indice = (r, cote, k) => r.spec[cote].findIndex((x) => x.k === k)

function courbe(x0, y0, x1, y1) {
  const dx = Math.max(60, Math.abs(x1 - x0) * 0.5)
  return [x0, y0, x0 + dx, y0, x1 - dx, y1, x1, y1]
}

function pointBezier(c, u) {
  const v = 1 - u
  const a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u
  return [a * c[0] + b * c[2] + d * c[4] + e * c[6], a * c[1] + b * c[3] + d * c[5] + e * c[7]]
}

function fil(cle, parent) {
  let f = fils.get(cle)
  if (!f) {
    const path = document.createElementNS(NS, 'path')
    parent.append(path)
    f = { path }
    fils.set(cle, f)
  }
  f.vu = true
  return f
}

function tracer(f, cls, c) {
  if (f.cls !== cls) { f.cls = cls; f.path.setAttribute('class', cls) }
  const d = `M${c[0].toFixed(1)},${c[1].toFixed(1)}C${c[2].toFixed(1)},${c[3].toFixed(1)} ${c[4].toFixed(1)},${c[5].toFixed(1)} ${c[6].toFixed(1)},${c[7].toFixed(1)}`
  if (f.d !== d) { f.d = d; f.path.setAttribute('d', d) }
  f.c = c
}

function majFils(noeuds, maintenant) {
  for (const f of fils.values()) f.vu = false
  const chemin = new Set()
  for (let a = selection && sim.get(selection); a; a = a.parentId ? sim.get(a.parentId) : null) chemin.add(a.id)

  const vivants = new Set()
  for (const n of noeuds) {
    const a = n.agent
    const r = rendus.get(n.cle)
    const p = rendus.get(a.parentId ?? 'evt')
    if (!r || !p) continue
    const iExec = a.parentId ? indice(p, 'd', `l:${a.id}`) : 0
    const iDonnee = a.parentId ? indice(p, 'd', 'contexte') : 1
    const xs = p.x + p.l - PIN, xe = r.x + PIN
    const etat = estVivant(a) ? 'vivant' : a.etat
    if (iExec >= 0) {
      const cls = `fil-exec f-${etat}${etat !== 'vivant' && chemin.has(a.id) ? ' f-chemin' : ''}`
      const f = fil(`x:${a.id}`, gExec)
      tracer(f, cls, courbe(xs, brocheY(p, iExec), xe, brocheY(r, 0)))
      if (etat === 'vivant') vivants.add(a.id)
    }
    if (iDonnee >= 0) tracer(fil(`d:${a.id}`, gDonnees), `fil-donnee f-${etat}`, courbe(xs, brocheY(p, iDonnee), xe, brocheY(r, 1)))
  }
  for (const [cle, f] of fils) if (!f.vu) { f.path.remove(); fils.delete(cle) }

  // Une seule impulsion par fil actif, qui parcourt lentement le fil d'exécution entrant.
  const t = maintenant / 1000 / PERIODE
  for (const id of vivants) {
    let c = impulsions.get(id)
    if (!c) {
      c = document.createElementNS(NS, 'circle')
      c.setAttribute('r', '4')
      c.setAttribute('class', 'impulsion')
      gImpulsions.append(c)
      impulsions.set(id, c)
    }
    const phase = (Number(id.slice(1)) * 0.37) % 1
    const [x, y] = pointBezier(fils.get(`x:${id}`).c, (t + phase) % 1)
    c.setAttribute('cx', x.toFixed(1))
    c.setAttribute('cy', y.toFixed(1))
  }
  for (const [id, c] of impulsions) if (!vivants.has(id)) { c.remove(); impulsions.delete(id) }
}

// ─── Boîtes « Comment » autour des directeurs de labo ────────────────────────────────────────────────

function majCommentaires(noeuds) {
  const vus = new Set()
  for (const n of noeuds) {
    const a = n.agent
    if (a.role !== 'directeur_de_labo') continue
    vus.add(a.id)
    let c = commentaires.get(a.id)
    if (!c) {
      const el = document.createElement('div')
      el.className = 'commentaire'
      el.style.setProperty('--c', couleurClair(a.role))
      el.innerHTML = '<div class="c-titre"><span></span><small></small></div>'
      el.querySelector('span').textContent = a.donnees.dossier
      el.querySelector('small').textContent = a.donnees.court
      coucheComment.append(el)
      c = { el }
      commentaires.set(a.id, c)
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const cle of [n.cle, ...n.desc]) {
      const r = rendus.get(cle)
      if (!r) continue
      x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.l)
      y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + r.h)
    }
    c.boite = { x: x0 - COMMENT.cote, y: y0 - COMMENT.haut + 4, l: x1 - x0 + 2 * COMMENT.cote, h: y1 - y0 + COMMENT.haut - 4 + COMMENT.bas - 4 }
    const b = c.boite
    const style = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px)|${b.l.toFixed(1)}|${b.h.toFixed(1)}`
    if (c.style !== style) {
      c.style = style
      c.el.style.transform = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px)`
      c.el.style.width = `${b.l.toFixed(1)}px`
      c.el.style.height = `${b.h.toFixed(1)}px`
    }
  }
  for (const [id, c] of commentaires) if (!vus.has(id)) { c.el.remove(); commentaires.delete(id) }
}

// ─── Panneau Détails ─────────────────────────────────────────────────────────────────────────────────

let journalRendu = 0
let derniereMaj = 0

function selectionner(id) {
  selection = id
  journalRendu = 0
  P_JOURNAL.innerHTML = ''
  panneau.classList.add('ouvert')
  scene.classList.add('panneau')
  majPanneau(true)
}

function fermer() {
  if (!selection) return
  selection = null
  panneau.classList.remove('ouvert')
  scene.classList.remove('panneau')
}

panneau.querySelector('.d-fermer').addEventListener('click', fermer)
P.parent.addEventListener('click', () => { if (P.parent.dataset.id) selectionner(P.parent.dataset.id) })

coucheNoeuds.addEventListener('click', (e) => {
  const el = e.target.closest('.noeud')
  if (!el || !el.dataset.id) return
  const b = e.target.closest('[data-b]')
  if (b) {
    if (b.dataset.b === 'deplier') deplies.add(el.dataset.id)
    else deplies.delete(el.dataset.id)
    return
  }
  selectionner(el.dataset.id)
})

function majPanneau(force = false) {
  if (!selection) return
  const a = sim.get(selection)
  if (!a) { fermer(); return }
  const maintenant = performance.now()
  if (!force && maintenant - derniereMaj < 120) return
  derniereMaj = maintenant

  panneau.style.setProperty('--c', a.etat === 'echec' ? 'var(--echec)' : couleurClair(a.role))
  texte(P_ICO, ICONES[a.role])
  texte(P_ROLE, `${ROLES[a.role].libelle} · ${a.id}`)
  texte(P_TITRE, a.titre)
  texte(P.modele, a.modele)
  texte(P.etat, a.etat === 'outil' ? `Outil · ${a.outilCourant}` : ETATS[a.etat].libelle)
  texte(P.activite, a.etat === 'en_file' ? etiquettePied(a)[1] : a.activite)
  P_LIGNE_DOSSIER.style.display = a.donnees.dossier ? '' : 'none'
  texte(P.dossier, a.donnees.dossier || '')
  texte(P.duree, a.debut === null ? '—' : formatTemps((a.fin ?? sim.temps) - a.debut))
  texte(P.file, formatTemps((a.debut ?? sim.temps) - a.creeA))
  texte(P.tokens, formatTokens(a.tokens))
  texte(P.outils, String(a.nbOutils))
  const parent = a.parentId ? sim.get(a.parentId) : null
  texte(P.parent, parent ? `${ROLES[parent.role].libelle} · ${parent.titre}` : 'Camille (événement)')
  P.parent.dataset.id = parent ? parent.id : ''
  P.parent.classList.toggle('lien', !!parent)
  const enfants = sim.enfants(a)
  texte(P.enfants, enfants.length ? `${enfants.length} lancés · ${enfants.filter(estFini).length} finis · ${enfants.filter(estVivant).length} actifs` : 'aucun')
  texte(P.resultat, a.resultat ?? '—')
  P.resultat.classList.toggle('echec', a.etat === 'echec')
  texte(P.nbJournal, `${a.journal.length} entrées`)

  if (journalRendu < a.journal.length) {
    const defil = panneau.querySelector('.d-defil')
    const enBas = defil.scrollHeight - defil.scrollTop - defil.clientHeight < 40
    for (; journalRendu < a.journal.length; journalRendu++) {
      const e = a.journal[journalRendu]
      const li = document.createElement('li')
      li.dataset.t = e.type
      li.innerHTML = '<time></time><span></span>'
      li.querySelector('time').textContent = formatTemps(e.t)
      li.querySelector('span').textContent = e.texte
      P_JOURNAL.append(li)
    }
    if (enBas && !force) defil.scrollTop = defil.scrollHeight
  }
}

// ─── Redémarrage ─────────────────────────────────────────────────────────────────────────────────────

sim.surEvenement((evt) => { if (evt.type === 'redemarrage') aReinitialiser = true })

function reinitialiser() {
  aReinitialiser = false
  for (const r of rendus.values()) r.el.remove()
  for (const f of fils.values()) f.path.remove()
  for (const c of impulsions.values()) c.remove()
  for (const c of commentaires.values()) c.el.remove()
  rendus.clear()
  fils.clear()
  impulsions.clear()
  commentaires.clear()
  deplies.clear()
  fermer()
  recadrer()
  premierCadrage = true
}

// ─── Boucle de rendu ─────────────────────────────────────────────────────────────────────────────────

sim.surTic((_, dt) => {
  if (aReinitialiser) reinitialiser()
  const maintenant = performance.now()

  const racine = construire(sim.racine)
  mesurer(racine)
  const noeuds = []
  poser(racine, 0, 0, noeuds)
  const presents = new Set(noeuds.map((n) => n.cle))

  let evt = rendus.get('evt')
  if (!evt) {
    evt = creerEvenement()
    coucheNoeuds.append(evt.el)
    evt.h = evt.el.offsetHeight
    evt.x = evt.tx = 0
    evt.y = evt.ty = racine.ty
    rendus.set('evt', evt)
  }
  evt.tx = 0
  evt.ty = racine.ty
  presents.add('evt')

  for (const n of noeuds) {
    let r = rendus.get(n.cle)
    if (!r) {
      r = creerNoeud(n.agent)
      r.x = n.tx
      r.y = n.ty
      coucheNoeuds.append(r.el)
      r.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' })
      rendus.set(n.cle, r)
    }
    r.tx = n.tx
    r.ty = n.ty
    r.h = n.spec.h
    majNoeud(r, n)
  }
  for (const [cle, r] of rendus) if (!presents.has(cle)) { r.el.remove(); rendus.delete(cle) }

  // Glissement vers les positions cibles
  const f = 1 - Math.exp(-dt * 7)
  for (const r of rendus.values()) {
    r.x += (r.tx - r.x) * f
    r.y += (r.ty - r.y) * f
    const t = `translate(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px)`
    if (r.t !== t) { r.t = t; r.el.style.transform = t }
  }

  majCommentaires(noeuds)
  majFils(noeuds, maintenant)
  cadrer(dt)
  majPanneau()
})

appliquerVue()
sim.demarrer()
