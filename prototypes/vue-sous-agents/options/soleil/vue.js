// Soleil : sunburst vivant des sous-agents.
// Le focus (l'orchestrateur par défaut) occupe le disque central ; chaque anneau est une profondeur,
// chaque arc un agent dont l'ouverture suit son poids (tokens du sous-arbre + un minimum).
// Tout est recalculé à partir de l'état à chaque image, puis interpolé en douceur.

import { simulationDepuisUrl, ROLES, ETATS, estFini, estVivant, formatTemps, formatTokens, QUESTION } from '../../commun/simulation.js'
import { monterBarre } from '../../commun/barre.js'

const sim = simulationDepuisUrl()
monterBarre(sim, { titre: 'Soleil', sousTitre: 'sunburst vivant des sous-agents' })

const SVG = 'http://www.w3.org/2000/svg'
const TAU = Math.PI * 2
const POIDS_MIN = 1200
const LARGEUR_ETIQ = 224
const HAUTEUR_ETIQ = 50
const MARGE_ETIQ = 44
const LARGEUR_INSPECTEUR = 392
const VITESSE_LISSAGE = 6

// ─── Outils ──────────────────────────────────────────────────────────────────────────────────────────

const svgEl = (tag, attrs = {}, parent = null) => {
  const n = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  if (parent) parent.appendChild(n)
  return n
}

const htmlEl = (tag, classe = '', parent = null) => {
  const n = document.createElement(tag)
  if (classe) n.className = classe
  if (parent) parent.appendChild(n)
  return n
}

const texte = (n, t) => { if (n.textContent !== t) n.textContent = t }
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const pt = (a, r) => `${(r * Math.sin(a)).toFixed(2)},${(-r * Math.cos(a)).toFixed(2)}`

// Couleur de rôle très désaturée, pour les agents terminés.
function desaturer(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const l = 0.3 * r + 0.59 * g + 0.11 * b
  const m = (c) => Math.round((c * 0.22 + l * 0.78) * 0.62)
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`
}

// Chemin d'un secteur d'anneau, avec un écart constant en pixels entre voisins.
function cheminArc(a0, a1, r0, r1, ecart = 1) {
  r0 = Math.max(0, r0 + ecart * 0.8)
  r1 -= ecart * 0.8
  if (r1 - r0 < 0.5 || r1 <= 0) return ''
  const b0 = a0 + ecart / r1, b1 = Math.min(a1 - ecart / r1, b0 + TAU - 1e-4)
  if (b1 - b0 < 1e-4) return ''
  let s = `M${pt(b0, r1)}A${r1.toFixed(2)},${r1.toFixed(2)} 0 ${b1 - b0 > Math.PI ? 1 : 0} 1 ${pt(b1, r1)}`
  if (r0 < 1) return `${s}L0,0Z`
  let c0 = a0 + ecart / r0, c1 = Math.min(a1 - ecart / r0, c0 + TAU - 1e-4)
  if (c1 < c0) c0 = c1 = (a0 + a1) / 2
  s += `L${pt(c1, r0)}A${r0.toFixed(2)},${r0.toFixed(2)} 0 ${c1 - c0 > Math.PI ? 1 : 0} 0 ${pt(c0, r0)}Z`
  return s
}

const titreDe = (a) => (a === sim.racine ? QUESTION : a.titre)
const nomCourt = (a, n) => (a.role === 'directeur_de_labo' ? a.donnees.court : a.titre).slice(0, n)
const dureeDe = (a) => (a.debut == null ? sim.temps - a.creeA : (a.fin ?? sim.temps) - a.debut)

function ancetres(a) {
  const chaine = []
  for (let p = a; p; p = p.parentId ? sim.get(p.parentId) : null) chaine.unshift(p)
  return chaine
}

function descendDe(a, f) {
  for (let p = a; p; p = p.parentId ? sim.get(p.parentId) : null) if (p === f) return true
  return false
}

// ─── Scène ───────────────────────────────────────────────────────────────────────────────────────────

const scene = document.querySelector('.scene')
scene.innerHTML = `
  <svg class="ciel">
    <defs>
      <filter id="flou" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5"/></filter>
      <radialGradient id="halo">
        <stop offset="0" stop-color="#f0a44b" stop-opacity=".07"/>
        <stop offset=".55" stop-color="#9d8cf2" stop-opacity=".035"/>
        <stop offset="1" stop-color="#0e0f12" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="disque">
        <stop offset="0" stop-color="#1e2129"/>
        <stop offset="1" stop-color="#121419"/>
      </radialGradient>
      <pattern id="hachures" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="2" height="6" fill="rgba(0,0,0,.38)"/>
      </pattern>
    </defs>
    <g class="monde">
      <circle class="halo" fill="url(#halo)"/>
      <g class="guides"></g>
      <g class="cadran"><path class="graduations"/><circle class="trotteuse" r="2.5"/></g>
      <g class="arcs"></g>
      <g class="centre"><circle class="disque"/><circle class="anneau"/><path class="fileur"/></g>
    </g>
    <g class="traits"></g>
  </svg>
  <div class="etiquettes"></div>
  <div class="info-centre">
    <div class="ic-role"><i></i><span></span></div>
    <div class="ic-titre"></div>
    <div class="ic-activite"></div>
    <div class="ic-chiffres"><span class="ic-chrono"></span><span class="ic-tokens"></span></div>
    <div class="ic-compteurs">
      <span title="Vivants : agents qui travaillent dans ce sous-arbre"><i class="pt vif"></i><b data-k="vivants">0</b></span>
      <span title="En file : agents en attente d'une place"><i class="pt file"></i><b data-k="file">0</b></span>
      <span title="Attendent leurs sous-agents"><i class="pt att"></i><b data-k="attente">0</b></span>
    </div>
    <div class="ic-actions"><button class="ic-details" type="button">détails</button><span class="ic-remonter">↑ remonter</span></div>
  </div>
  <nav class="fil"></nav>
  <div class="legende-soleil"></div>
  <div class="bulle"></div>
`

const $ = (s) => scene.querySelector(s)
const monde = $('.monde')
const halo = $('.halo')
const calqueGuides = $('.guides')
const graduations = $('.graduations')
const trotteuse = $('.trotteuse')
const calqueArcs = $('.arcs')
const centre = $('.centre')
const disque = $('.disque')
const anneau = $('.anneau')
const fileur = $('.fileur')
const calqueTraits = $('.traits')
const defs = scene.querySelector('defs')
const calqueEtiq = $('.etiquettes')
const infoCentre = $('.info-centre')
const fil = $('.fil')
const bulle = $('.bulle')
const ic = {
  role: $('.ic-role span'), titre: $('.ic-titre'), activite: $('.ic-activite'),
  chrono: $('.ic-chrono'), tokens: $('.ic-tokens'), remonter: $('.ic-remonter'),
  compteurs: Object.fromEntries([...scene.querySelectorAll('[data-k]')].map((n) => [n.dataset.k, n])),
}
const guides = [0, 1, 2, 3, 4].map(() => svgEl('circle', {}, calqueGuides))

// Légende discrète
$('.legende-soleil').innerHTML = `
  <div class="ligne">${Object.values(ROLES).map((r) => `<span><i class="pt" style="background:${r.couleur}"></i>${r.libelle}</span>`).join('')}</div>
  <div class="ligne">
    <span><svg><rect width="18" height="10" rx="2" fill="#9d8cf2"/><rect x="6" width="5" height="10" fill="#fff" opacity=".6"/></svg>travaille</span>
    <span><svg><rect width="18" height="10" rx="2" fill="#9d8cf2" fill-opacity=".28" stroke="#9d8cf2" stroke-opacity=".55"/></svg>attend</span>
    <span><svg><rect x=".5" y=".5" width="17" height="9" rx="2" fill="none" stroke="#9d8cf2" stroke-dasharray="3 3"/></svg>en file</span>
    <span><svg><rect width="18" height="10" rx="2" fill="${desaturer('#9d8cf2')}"/></svg>terminé</span>
    <span><svg><rect width="18" height="10" rx="2" fill="#ef5b5b"/></svg>échec</span>
  </div>
  <div class="ligne indice">clic : zoom · clic droit : détails · clic au centre ou Échap : remonter · ouverture ∝ tokens</div>
`

// Inspecteur latéral
const insp = htmlEl('aside', 'inspecteur', document.body)
insp.innerHTML = `
  <button class="fermer" type="button" title="Fermer (Échap)">×</button>
  <div class="i-role"><i></i><span></span><em class="i-modele"></em></div>
  <h2 class="i-titre"></h2>
  <div class="i-etat"></div>
  <dl class="i-chiffres">
    <div><dt>Durée</dt><dd data-i="duree"></dd></div>
    <div><dt>Tokens</dt><dd data-i="tokens"></dd></div>
    <div><dt>Outils</dt><dd data-i="outils"></dd></div>
    <div><dt>Sous-ag.</dt><dd data-i="enfants"></dd></div>
  </dl>
  <div class="i-bloc"><h3>Activité courante</h3><p class="i-activite"></p></div>
  <div class="i-bloc"><h3>Résultat</h3><p class="i-resultat"></p></div>
  <div class="i-bloc i-liens"><h3>Relations</h3><div></div></div>
  <h3 class="i-journal-titre">Journal</h3>
  <ol class="i-journal"></ol>
`
const ii = {
  role: insp.querySelector('.i-role span'), modele: insp.querySelector('.i-modele'), titre: insp.querySelector('.i-titre'),
  etat: insp.querySelector('.i-etat'), activite: insp.querySelector('.i-activite'), resultat: insp.querySelector('.i-resultat'),
  liens: insp.querySelector('.i-liens div'), journal: insp.querySelector('.i-journal'),
  chiffres: Object.fromEntries([...insp.querySelectorAll('[data-i]')].map((n) => [n.dataset.i, n])),
}

// ─── État de la vue ──────────────────────────────────────────────────────────────────────────────────

const vues = new Map() // id → arc affiché
const etiquettes = new Map() // id → étiquette d'activité
let focusId = sim.racine.id
let racineConnue = sim.racine
let inspecte = null // agent affiché dans l'inspecteur
let inspecteJournal = 0
let inspecteLiens = ''
let survolId = null
let filPour = ''
let geo = null
let taille = { w: scene.clientWidth, h: scene.clientHeight }
let dernierTexte = 0
let dernierR = -1

// Redimensionnement à chaud : la géométrie saute directement à sa nouvelle cible (pas d'interpolation),
// et on redessine tout de suite (arcs compris), sans attendre la prochaine image.
function redimensionner() {
  const w = scene.clientWidth, h = scene.clientHeight
  if (w === taille.w && h === taille.h) return
  taille = { w, h }
  if (!geo) return
  geo = null
  rendre(1)
}
new ResizeObserver(redimensionner).observe(scene)
window.addEventListener('resize', redimensionner)

function toutEffacer() {
  for (const v of vues.values()) { v.g.remove(); v.clip.remove() }
  vues.clear()
  for (const e of etiquettes.values()) { e.div.remove(); e.trait.remove() }
  etiquettes.clear()
  focusId = sim.racine.id
  racineConnue = sim.racine
  survolId = null
  calqueArcs.classList.remove('survol')
  bulle.classList.remove('visible')
  filPour = ''
  fermerInspecteur()
}

// ─── Mise en page ────────────────────────────────────────────────────────────────────────────────────

// Poids et angles globaux de tout l'arbre (la racine couvre le tour complet ; les enfants remplissent
// entièrement l'ouverture de leur parent, au prorata de leur poids).
function calculer() {
  const infos = new Map()
  const visiter = (a) => {
    const info = {
      valeur: POIDS_MIN + a.tokens, tokens: a.tokens,
      vivants: estVivant(a) ? 1 : 0, file: a.etat === 'en_file' ? 1 : 0, attente: a.etat === 'attend' ? 1 : 0,
      prof: a.profondeur, x0: 0, x1: 0,
    }
    for (const e of sim.enfants(a)) {
      const ie = visiter(e)
      info.valeur += ie.valeur
      info.tokens += ie.tokens
      info.vivants += ie.vivants
      info.file += ie.file
      info.attente += ie.attente
      info.prof = Math.max(info.prof, ie.prof)
    }
    infos.set(a.id, info)
    return info
  }
  const placer = (a, x0, x1) => {
    const info = infos.get(a.id)
    info.x0 = x0
    info.x1 = x1
    const enfants = sim.enfants(a)
    const somme = enfants.reduce((s, e) => s + infos.get(e.id).valeur, 0)
    let x = x0
    for (const e of enfants) {
      const dx = (x1 - x0) * infos.get(e.id).valeur / somme
      placer(e, x, x + dx)
      x += dx
    }
  }
  visiter(sim.racine)
  placer(sim.racine, 0, TAU)
  return infos
}

// Le rayon extérieur est borné par la hauteur de la scène et par la largeur laissée libre par les deux
// colonnes d'étiquettes ; DEBORD couvre le cadran (graduations) et le halo des arcs vivants.
const DEBORD = 22
const MARGE_SCENE = 12
function geometrieCible(nAnneaux) {
  const W = taille.w - (inspecte ? LARGEUR_INSPECTEUR : 0)
  const H = taille.h
  const parHauteur = H / 2 - MARGE_SCENE - DEBORD
  const parLargeur = (W - 2 * (MARGE_ETIQ + LARGEUR_ETIQ + 18)) / 2
  const R = Math.max(60, Math.min(parHauteur, parLargeur))
  const Rc = Math.min(R * 0.6, Math.max(R * 0.36, 100))
  return { cx: W / 2, cy: H / 2, R, Rc, ep: (R - Rc) / nAnneaux }
}

// ─── Arcs ────────────────────────────────────────────────────────────────────────────────────────────

function creerVue(a, cible) {
  const g = svgEl('g', { class: 'arc' }, calqueArcs)
  g.dataset.id = a.id
  g.style.setProperty('--c', ROLES[a.role].couleur)
  g.style.setProperty('--cp', desaturer(ROLES[a.role].couleur))
  const clip = svgEl('clipPath', { id: `clip-soleil-${a.id}` }, defs)
  const clipChemin = svgEl('path', {}, clip)
  const fond = svgEl('path', { class: 'fond' }, g)
  const reflet = svgEl('path', { class: 'reflet', 'clip-path': `url(#clip-soleil-${a.id})` }, g)
  const onde = svgEl('path', { class: 'onde' }, g)
  const mi = (cible.a0 + cible.a1) / 2
  const v = {
    agent: a, g, clip, clipChemin, fond, reflet, onde,
    cur: { a0: mi, a1: mi, r0: cible.r0, r1: cible.r0, op: 0 },
    cible, etat: null, flash: 0, phase: Math.random(), visible: true, lie: false, choisi: false,
  }
  vues.set(a.id, v)
  return v
}

function detruireVue(id) {
  const v = vues.get(id)
  if (!v) return
  v.g.remove()
  v.clip.remove()
  vues.delete(id)
}

function majArc(v, k, dt) {
  const { cur, cible, agent: a } = v
  cur.a0 += (cible.a0 - cur.a0) * k
  cur.a1 += (cible.a1 - cur.a1) * k
  cur.r0 += (cible.r0 - cur.r0) * k
  cur.r1 += (cible.r1 - cur.r1) * k
  cur.op += (cible.op - cur.op) * k

  const visible = cur.op > 0.01 || cible.op > 0
  if (visible !== v.visible) { v.visible = visible; v.g.style.display = visible ? '' : 'none' }
  if (!visible) return

  if (v.etat !== a.etat) {
    v.g.classList.remove(`etat-${v.etat}`)
    v.g.classList.add(`etat-${a.etat}`)
    v.etat = a.etat
  }
  v.g.setAttribute('opacity', cur.op.toFixed(3))
  v.g.style.pointerEvents = cible.op > 0 ? '' : 'none'

  const d = cheminArc(cur.a0, cur.a1, cur.r0, cur.r1)
  v.fond.setAttribute('d', d)

  if (estVivant(a)) {
    // Reflet : une bande lumineuse floue qui balaie l'arc, découpée par sa forme.
    v.phase = (v.phase + dt * (a.etat === 'outil' ? 0.85 : 0.42)) % 1
    const larg = cur.a1 - cur.a0
    const c = cur.a0 + larg * (-0.3 + v.phase * 1.6)
    const h = Math.max(larg * 0.13, 7 / Math.max(cur.r1, 1))
    v.clipChemin.setAttribute('d', d)
    v.reflet.setAttribute('d', cheminArc(c - h, c + h, cur.r0, cur.r1, 0))
  } else if (a.etat === 'echec') {
    v.clipChemin.setAttribute('d', d)
    v.reflet.setAttribute('d', d)
  }

  if (v.flash > 0.01) {
    v.flash = Math.max(0, v.flash - dt * 1.4)
    const e = (1 - v.flash) * 12
    v.onde.setAttribute('d', cheminArc(cur.a0 - e / Math.max(cur.r1, 1), cur.a1 + e / Math.max(cur.r1, 1), cur.r0 - e, cur.r1 + e, 0))
    v.onde.setAttribute('stroke-opacity', (v.flash * 0.9).toFixed(3))
    v.onde.setAttribute('stroke-width', (1 + v.flash * 2).toFixed(2))
  } else if (v.flash !== 0) {
    v.flash = 0
    v.onde.setAttribute('d', '')
  }
}

// ─── Étiquettes d'activité (bord extérieur) ─────────────────────────────────────────────────────────

function creerEtiquette(a) {
  const div = htmlEl('div', 'etiquette', calqueEtiq)
  div.style.setProperty('--c', ROLES[a.role].couleur)
  div.innerHTML = `<div class="carte"><div class="e-tete"><i></i><b></b><span class="e-titre"></span><time></time></div><div class="e-act"><code></code><span></span></div></div>`
  const carte = div.firstElementChild
  carte.addEventListener('click', () => ouvrirInspecteur(a))
  const trait = svgEl('path', { stroke: ROLES[a.role].couleur, 'stroke-opacity': 0.55 }, calqueTraits)
  const e = {
    agent: a, div, carte, trait, y: null, x: null, cote: null, sortie: 0,
    n: {
      role: div.querySelector('b'), titre: div.querySelector('.e-titre'), temps: div.querySelector('time'),
      outil: div.querySelector('code'), act: div.querySelector('.e-act span'),
    },
  }
  texte(e.n.role, ROLES[a.role].court)
  texte(e.n.titre, a.titre)
  etiquettes.set(a.id, e)
  return e
}

function majEtiquettes(k, majTexte) {
  const { cx, cy, R } = geo
  const bornes = [58, taille.h - 88 - HAUTEUR_ETIQ]
  const cotes = { droite: [], gauche: [] }

  for (const v of vues.values()) {
    const a = v.agent
    if (!estVivant(a) || v.cible.op === 0 || v.cur.op < 0.5) continue
    if ((v.cur.a1 - v.cur.a0) * v.cur.r1 < 3) continue
    const am = (v.cur.a0 + v.cur.a1) / 2
    const s = Math.sin(am), c = -Math.cos(am)
    const e = etiquettes.get(a.id) || creerEtiquette(a)
    e.vu = true
    e.am = am
    e.r1 = v.cur.r1
    e.px = cx + v.cur.r1 * s
    e.py = cy + v.cur.r1 * c
    e.ex = cx + (R + 16) * s
    e.ey = cy + (R + 16) * c
    e.voulu = e.ey - 16
    cotes[s >= 0 ? 'droite' : 'gauche'].push(e)
  }

  // Anti-chevauchement : on trie par hauteur voulue, on pousse vers le bas puis on remonte si ça déborde.
  for (const [cote, liste] of Object.entries(cotes)) {
    liste.sort((p, q) => p.voulu - q.voulu)
    let y = -Infinity
    for (const e of liste) { e.cibleY = Math.max(e.voulu, y + HAUTEUR_ETIQ, bornes[0]); y = e.cibleY }
    y = Infinity
    for (let i = liste.length - 1; i >= 0; i--) {
      const e = liste[i]
      e.cibleY = Math.min(e.cibleY, y - HAUTEUR_ETIQ, bornes[1])
      y = e.cibleY
    }
    for (const e of liste) e.cibleY = Math.max(e.cibleY, bornes[0])
    const x = cote === 'droite' ? cx + R + MARGE_ETIQ : cx - R - MARGE_ETIQ - LARGEUR_ETIQ
    for (const e of liste) {
      if (e.cote !== cote) { e.cote = cote; e.div.classList.toggle('gauche', cote === 'gauche'); e.x = null }
      e.cibleX = x
    }
  }

  for (const [id, e] of etiquettes) {
    if (!e.vu) {
      // Sortie en fondu, puis suppression.
      if (!e.sortie) { e.sortie = performance.now(); e.carte.classList.add('sort') }
      const t = (performance.now() - e.sortie) / 380
      e.trait.setAttribute('stroke-opacity', Math.max(0, 0.55 * (1 - t)).toFixed(3))
      if (t >= 1) { e.div.remove(); e.trait.remove(); etiquettes.delete(id) }
      continue
    }
    e.vu = false
    if (e.sortie) { e.sortie = 0; e.carte.classList.remove('sort'); e.trait.setAttribute('stroke-opacity', 0.55) }
    if (e.y == null) e.y = e.cibleY
    if (e.x == null) e.x = e.cibleX
    e.y += (e.cibleY - e.y) * k
    e.x += (e.cibleX - e.x) * k
    e.div.style.transform = `translate(${e.x.toFixed(1)}px, ${e.y.toFixed(1)}px)`
    const bordX = e.cote === 'droite' ? e.x - 3 : e.x + LARGEUR_ETIQ + 3
    const coudeX = e.cote === 'droite' ? Math.max(e.ex, bordX - 14) : Math.min(e.ex, bordX + 14)
    const ly = e.y + 16
    e.trait.setAttribute('d', `M${e.px.toFixed(1)},${e.py.toFixed(1)}L${e.ex.toFixed(1)},${e.ey.toFixed(1)}L${coudeX.toFixed(1)},${ly.toFixed(1)}L${bordX.toFixed(1)},${ly.toFixed(1)}`)
    if (majTexte) {
      const a = e.agent
      texte(e.n.temps, formatTemps(dureeDe(a)))
      texte(e.n.outil, a.etat === 'outil' && a.outilCourant ? a.outilCourant : '')
      texte(e.n.act, a.activite)
    }
  }
}

// ─── Centre, décor, fil d'Ariane ────────────────────────────────────────────────────────────────────

function majCentre(F, fi, majTexte) {
  const { Rc } = geo
  disque.setAttribute('r', (Rc - 2).toFixed(2))
  anneau.setAttribute('r', (Rc - 7).toFixed(2))
  const ra = Rc - 7
  const rot = (performance.now() / 1000) * (F.etat === 'outil' ? 3.2 : 1.9)
  fileur.setAttribute('d', `M${pt(rot, ra)}A${ra.toFixed(2)},${ra.toFixed(2)} 0 0 1 ${pt(rot + 1.1, ra)}`)
  if (centre.dataset.etat !== F.etat || centre.dataset.id !== F.id) {
    centre.setAttribute('class', `centre etat-${F.etat}`)
    centre.dataset.etat = F.etat
    centre.dataset.id = F.id
    centre.style.setProperty('--c', ROLES[F.role].couleur)
    centre.style.setProperty('--cp', desaturer(ROLES[F.role].couleur))
  }

  // Le bloc de texte tient dans le carré inscrit du disque ; la typo suit le rayon.
  const larg = Rc * 1.5
  infoCentre.style.width = `${larg.toFixed(1)}px`
  infoCentre.style.maxHeight = `${(Rc * 1.6).toFixed(1)}px`
  infoCentre.style.fontSize = `${Math.max(8.5, Math.min(13, Rc / 9.5)).toFixed(2)}px`
  infoCentre.style.transform = `translate(${(geo.cx - larg / 2).toFixed(1)}px, ${geo.cy.toFixed(1)}px) translateY(-50%)`
  infoCentre.classList.toggle('compact', Rc < 118)

  if (!majTexte) return
  infoCentre.style.setProperty('--c', ROLES[F.role].couleur)
  infoCentre.classList.toggle('vif', estVivant(F))
  infoCentre.classList.toggle('remontable', !!F.parentId)
  texte(ic.role, ROLES[F.role].libelle)
  infoCentre.title = ETATS[F.etat].libelle
  texte(ic.titre, titreDe(F))
  texte(ic.activite, F.activite)
  ic.chrono.innerHTML = `${formatTemps(dureeDe(F))}`
  ic.tokens.innerHTML = `${formatTokens(fi.tokens)}<small>tok</small>`
  texte(ic.compteurs.vivants, String(fi.vivants))
  texte(ic.compteurs.file, String(fi.file))
  texte(ic.compteurs.attente, String(fi.attente))
  ic.remonter.style.display = F.parentId ? '' : 'none'
}

function majDecor(nAnneaux) {
  const { R, Rc, ep } = geo
  halo.setAttribute('r', (R * 1.3).toFixed(1))
  guides.forEach((c, i) => {
    const r = Rc + i * ep
    c.setAttribute('r', r.toFixed(2))
    c.setAttribute('opacity', i <= nAnneaux ? 0.8 : 0)
  })
  if (Math.abs(R - dernierR) > 0.4) {
    dernierR = R
    let d = ''
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU
      const l = i % 10 === 0 ? 6 : 2.5
      d += `M${pt(a, R + 6)}L${pt(a, R + 6 + l)}`
    }
    graduations.setAttribute('d', d)
  }
  // La trotteuse fait un tour par minute de temps simulé.
  const at = ((sim.temps % 60) / 60) * TAU
  trotteuse.setAttribute('cx', (Math.sin(at) * (R + 6)).toFixed(2))
  trotteuse.setAttribute('cy', (-Math.cos(at) * (R + 6)).toFixed(2))
}

function majFil(F) {
  const cle = `${sim.graine}:${F.id}`
  if (cle === filPour) return
  filPour = cle
  fil.innerHTML = ''
  ancetres(F).forEach((a, i, liste) => {
    if (i) htmlEl('span', '', fil).textContent = '›'
    const b = htmlEl('button', i === liste.length - 1 ? 'ici' : '', fil)
    b.type = 'button'
    b.innerHTML = `<i style="background:${ROLES[a.role].couleur}"></i>`
    b.append(a === sim.racine ? ROLES[a.role].libelle : nomCourt(a, 34))
    b.title = titreDe(a)
    b.addEventListener('click', () => { if (sim.get(a.id) === a) focaliser(a) })
  })
}

// ─── Inspecteur ──────────────────────────────────────────────────────────────────────────────────────

function ouvrirInspecteur(a) {
  if (inspecte !== a) {
    inspecte = a
    inspecteJournal = 0
    inspecteLiens = ''
    ii.journal.innerHTML = ''
  }
  insp.classList.add('ouvert')
  majInspecteur()
}

function fermerInspecteur() {
  inspecte = null
  insp.classList.remove('ouvert')
}

function majInspecteur() {
  const a = inspecte
  if (!a) return
  if (sim.get(a.id) !== a) { fermerInspecteur(); return }
  const role = ROLES[a.role]
  insp.style.setProperty('--c', role.couleur)
  texte(ii.role, role.libelle)
  texte(ii.modele, a.modele)
  texte(ii.titre, titreDe(a))
  const vif = estVivant(a)
  ii.etat.className = `i-etat ${vif ? 'vif' : a.etat}`
  texte(ii.etat, a.etat === 'outil' && a.outilCourant ? `Outil · ${a.outilCourant}` : ETATS[a.etat].libelle)
  texte(ii.chiffres.duree, a.debut == null ? `+${formatTemps(dureeDe(a))}` : formatTemps(dureeDe(a)))
  texte(ii.chiffres.tokens, formatTokens(a.tokens))
  texte(ii.chiffres.outils, String(a.nbOutils))
  texte(ii.chiffres.enfants, String(a.enfants.length))
  texte(ii.activite, a.activite)
  texte(ii.resultat, a.resultat ?? (estFini(a) ? '—' : 'En cours…'))
  ii.resultat.classList.toggle('echec', a.etat === 'echec')

  // Relations : parent et sous-agents (reconstruites seulement quand elles changent).
  const cleLiens = `${a.parentId}:${a.enfants.join(',')}:${a.enfants.map((id) => sim.get(id).etat).join(',')}`
  if (cleLiens !== inspecteLiens) {
    inspecteLiens = cleLiens
    ii.liens.innerHTML = ''
    const lien = (b, classe) => {
      const n = htmlEl('button', classe, ii.liens)
      n.type = 'button'
      n.innerHTML = `<i style="background:${b.etat === 'echec' ? 'var(--echec)' : ROLES[b.role].couleur}"></i>`
      n.append(`${ROLES[b.role].court} ${nomCourt(b, 26)}`)
      n.title = `${b.titre} — ${ETATS[b.etat].libelle}`
      n.addEventListener('click', () => ouvrirInspecteur(b))
    }
    if (a.parentId) lien(sim.get(a.parentId), 'parent')
    for (const e of sim.enfants(a)) lien(e, '')
    if (!ii.liens.children.length) htmlEl('span', '', ii.liens).textContent = 'Aucune'
  }

  // Journal horodaté : on n'ajoute que les nouvelles entrées, et on suit le bas si on y était.
  if (a.journal.length > inspecteJournal) {
    const j = ii.journal
    const enBas = j.scrollHeight - j.scrollTop - j.clientHeight < 30
    for (const entree of a.journal.slice(inspecteJournal)) {
      const li = htmlEl('li', `j-${entree.type === 'etat' ? entree.etat : entree.type}`, j)
      htmlEl('time', '', li).textContent = `T+${formatTemps(entree.t)}`
      htmlEl('i', '', li)
      htmlEl('span', '', li).textContent = entree.texte
    }
    inspecteJournal = a.journal.length
    if (enBas) j.scrollTop = j.scrollHeight
  }
}

insp.querySelector('.fermer').addEventListener('click', fermerInspecteur)

// ─── Interactions ────────────────────────────────────────────────────────────────────────────────────

function focaliser(a) {
  focusId = a.id
  survolId = null
  majSurvol()
  if (inspecte) ouvrirInspecteur(a)
}

function remonter() {
  const F = sim.get(focusId)
  if (F && F.parentId) focaliser(sim.get(F.parentId))
}

const arcSous = (e) => {
  const g = e.target.closest('.arc')
  return g ? sim.get(g.dataset.id) : null
}

calqueArcs.addEventListener('click', (e) => {
  const a = arcSous(e)
  if (!a) return
  if (a.enfants.length) focaliser(a)
  else ouvrirInspecteur(a)
})

calqueArcs.addEventListener('contextmenu', (e) => {
  const a = arcSous(e)
  if (!a) return
  e.preventDefault()
  ouvrirInspecteur(a)
})

calqueArcs.addEventListener('mousemove', (e) => {
  const a = arcSous(e)
  const id = a ? a.id : null
  if (id !== survolId) { survolId = id; majSurvol() }
  if (!a) return
  const r = scene.getBoundingClientRect()
  bulle.style.setProperty('--c', ROLES[a.role].couleur)
  bulle.innerHTML = ''
  htmlEl('b', '', bulle).textContent = `${ROLES[a.role].libelle} · ${ETATS[a.etat].libelle}`
  htmlEl('div', '', bulle).textContent = a.titre
  htmlEl('small', '', bulle).textContent = `${formatTokens(a.tokens)} tok · ${formatTemps(dureeDe(a))}${a.enfants.length ? ` · ${a.enfants.length} sous-agents` : ''}`
  const x = Math.min(e.clientX - r.left + 14, taille.w - 290)
  bulle.style.transform = `translate(${x}px, ${e.clientY - r.top + 14}px)`
  bulle.classList.add('visible')
})

calqueArcs.addEventListener('mouseleave', () => {
  survolId = null
  majSurvol()
  bulle.classList.remove('visible')
})

// Survol : on éclaire la lignée (ancêtres et descendants) de l'arc pointé.
function majSurvol() {
  const s = survolId ? sim.get(survolId) : null
  calqueArcs.classList.toggle('survol', !!s)
  for (const v of vues.values()) {
    const lie = !!s && (descendDe(v.agent, s) || descendDe(s, v.agent))
    if (lie !== v.lie) { v.lie = lie; v.g.classList.toggle('lie', lie) }
  }
  if (!s) bulle.classList.remove('visible')
}

infoCentre.addEventListener('click', (e) => {
  if (e.target.closest('.ic-details')) { ouvrirInspecteur(sim.get(focusId)); return }
  remonter()
})
disque.addEventListener('click', remonter)
for (const n of [infoCentre, disque]) {
  n.addEventListener('contextmenu', (e) => { e.preventDefault(); ouvrirInspecteur(sim.get(focusId)) })
}

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (inspecte) fermerInspecteur()
  else remonter()
})

// ─── Événements ponctuels ────────────────────────────────────────────────────────────────────────────

sim.surEvenement((evt) => {
  if (evt.type === 'redemarrage') { toutEffacer(); return }
  const v = evt.agent && vues.get(evt.agent.id)
  if (!v || v.agent !== evt.agent) return
  if (evt.type === 'demarre') { v.flash = 1; v.g.style.removeProperty('--onde') }
  else if (evt.type === 'termine') { v.flash = 0.8; v.g.style.setProperty('--onde', '#ffffff') }
  else if (evt.type === 'echec') { v.flash = 1; v.g.style.setProperty('--onde', 'var(--echec)') }
})

// ─── Rendu à chaque image ────────────────────────────────────────────────────────────────────────────

sim.surTic((_, dtReel) => rendre(dtReel))

function rendre(dtReel) {
  const dt = Math.max(0.001, dtReel)
  if (sim.racine !== racineConnue) toutEffacer()
  if (!sim.get(focusId)) focusId = sim.racine.id

  const infos = calculer()
  const F = sim.get(focusId)
  const fi = infos.get(F.id)
  const nAnneaux = Math.max(1, fi.prof - F.profondeur)
  const k = 1 - Math.exp(-dt * VITESSE_LISSAGE)

  const gc = geometrieCible(nAnneaux)
  if (!geo) geo = { ...gc }
  for (const cle of ['cx', 'cy', 'R', 'Rc', 'ep']) geo[cle] += (gc[cle] - geo[cle]) * k
  monde.setAttribute('transform', `translate(${geo.cx.toFixed(1)},${geo.cy.toFixed(1)})`)

  const maintenant = performance.now()
  const majTexte = maintenant - dernierTexte > 120
  if (majTexte) dernierTexte = maintenant

  // Cibles : le sous-arbre du focus est ramené sur le tour complet, le reste se replie et s'efface.
  const { Rc, ep } = geo
  const etendue = fi.x1 - fi.x0
  for (const a of sim.agents.values()) {
    const i = infos.get(a.id)
    const d = a.profondeur - F.profondeur
    let cible
    if (a === F) cible = { a0: 0, a1: TAU, r0: 0, r1: Rc, op: 0 }
    else if (d <= 0) cible = { a0: 0, a1: TAU, r0: 0, r1: 0, op: 0 }
    else {
      const a0 = clamp01((i.x0 - fi.x0) / etendue) * TAU
      const a1 = clamp01((i.x1 - fi.x0) / etendue) * TAU
      cible = { a0, a1, r0: Rc + (d - 1) * ep, r1: Rc + d * ep, op: descendDe(a, F) ? 1 : 0 }
    }
    let v = vues.get(a.id)
    if (v && v.agent !== a) { detruireVue(a.id); v = null }
    if (!v) {
      if (cible.op === 0) continue
      v = creerVue(a, cible)
    }
    v.cible = cible
    const choisi = inspecte === a
    if (choisi !== v.choisi) { v.choisi = choisi; v.g.classList.toggle('choisi', choisi) }
    majArc(v, k, dt)
  }
  for (const [id, v] of vues) if (sim.get(id) !== v.agent) detruireVue(id)

  majEtiquettes(k, majTexte)
  majCentre(F, fi, majTexte)
  majDecor(nAnneaux)
  majFil(F)
  if (majTexte) majInspecteur()
}

sim.demarrer()
