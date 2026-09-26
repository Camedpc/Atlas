// Éditeur de graphe de logique, façon éditeur Blueprint d'Unreal Engine, en thème clair.
// Un nœud = une assertion. Sa broche de sortie (dans l'en-tête) porte l'assertion ; à gauche, chaque
// démonstration est un groupe de broches d'entrée, une par prémisse (`justifie_par`). Relier une sortie
// à une entrée ajoute une prémisse ; les boîtes « Comment » sont les catégories. Les statuts sont
// recalculés par `calculerStatuts` à chaque modification, jamais stockés.

import { calculerStatuts, STATUTS, VALIDITES } from '../../commun/raisonnement.js'
import { LARGEUR, GENRES, PALETTE, genreDe, exemple, nouvelId, disposer, charger, sauvegarder } from './etat.js'

const GRILLE = 16
const Z_MIN = 0.2
const Z_MAX = 2
const SEUIL = 4 // pixels avant qu'un clic devienne un glisser
const MIN_COM = { l: 180, h: 90 }

const $ = (s, r = document) => r.querySelector(s)
const ECHAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ECHAP[c])
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const borne = (v, a, b) => Math.min(b, Math.max(a, v))
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`
const fmtConf = (c) => (c === null || c === undefined || c === '' ? '' : Number(c).toFixed(2).replace('.', ','))

const graphe = $('.graphe')
const monde = $('.monde')
const coucheCom = $('.commentaires')
const coucheNoeuds = $('.noeuds')
const gFils = $('.g-fils')
const filTemp = $('.fil-temp')
const lasso = $('.lasso')
const panneau = $('.d-contenu')
const compteSel = $('.d-compte')
const menu = $('.menu')
const bulle = $('.bulle')
const aide = $('.aide')
const toast = $('.toast')
const zoomInfo = $('.zoom-info')

// ─── État ────────────────────────────────────────────────────────────────────────────────────────────

const sauve = charger()
let etat = sauve?.etat ?? exemple()
let vue = sauve?.vue ?? { x: 40, y: 40, k: 1 }
let aimanter = sauve?.aimanter ?? true
let pile = []
let ip = -1
const sel = { noeuds: new Set(), coms: new Set(), demo: null }
let statuts = {}
let demosDe = new Map()
let utilisateurs = new Map()
const elNoeud = new Map()
const geo = new Map() // id → { h, pins: { cle: [dx, dy] } }, mesuré après chaque rendu
let filsCourants = []
let geste = null
let espace = false
let edition = null
let menuEtat = null

const noeudPar = (id) => etat.noeuds.find((n) => n.id === id)
const demoPar = (id) => etat.demonstrations.find((d) => d.id === id)
const comPar = (id) => etat.commentaires.find((c) => c.id === id)
const aimant = (v) => (aimanter ? Math.round(v / GRILLE) * GRILLE : v)
const hauteur = (id) => geo.get(id)?.h ?? 120

function indexer() {
  statuts = calculerStatuts(etat.noeuds, etat.demonstrations)
  demosDe = new Map(etat.noeuds.map((n) => [n.id, []]))
  utilisateurs = new Map(etat.noeuds.map((n) => [n.id, new Set()]))
  for (const d of etat.demonstrations) {
    demosDe.get(d.noeud_id)?.push(d)
    for (const p of d.justifie_par) utilisateurs.get(p)?.add(d.noeud_id)
  }
}

// ─── Historique et sauvegarde ────────────────────────────────────────────────────────────────────────

let minuterie = null
function sauverBientot() {
  clearTimeout(minuterie)
  minuterie = setTimeout(() => sauvegarder({ version: 1, etat, vue, aimanter }), 250)
}

function valider() {
  const s = JSON.stringify(etat)
  if (pile[ip] === s) return
  pile = pile.slice(0, ip + 1)
  pile.push(s)
  if (pile.length > 200) pile.shift()
  ip = pile.length - 1
  majBarre()
  sauverBientot()
}

function restaurer(i) {
  if (i < 0 || i >= pile.length) return
  ip = i
  etat = JSON.parse(pile[ip])
  for (const id of [...sel.noeuds]) if (!noeudPar(id)) sel.noeuds.delete(id)
  for (const id of [...sel.coms]) if (!comPar(id)) sel.coms.delete(id)
  if (sel.demo && !demoPar(sel.demo)) sel.demo = null
  rendre(true)
  sauverBientot()
}

// ─── Vue : déplacement et zoom ───────────────────────────────────────────────────────────────────────

function appliquerVue() {
  monde.style.transform = `translate(${vue.x}px,${vue.y}px) scale(${vue.k})`
  // Comme dans Unreal, les titres des commentaires restent lisibles quand on dézoome.
  monde.style.setProperty('--tk', Math.min(1.8, Math.max(1, 0.55 / vue.k)).toFixed(3))
  const g = 128 * vue.k
  const f = 16 * vue.k
  graphe.style.backgroundSize = `${g}px ${g}px, ${g}px ${g}px, ${f}px ${f}px, ${f}px ${f}px`
  graphe.style.backgroundPosition = `${vue.x}px ${vue.y}px`
  zoomInfo.textContent = `Zoom ${Math.round(vue.k * 100)} %`
  sauverBientot()
}

function versMonde(cx, cy) {
  const r = graphe.getBoundingClientRect()
  return [(cx - r.left - vue.x) / vue.k, (cy - r.top - vue.y) / vue.k]
}

function zoomerEn(cx, cy, k) {
  k = borne(k, Z_MIN, Z_MAX)
  const r = graphe.getBoundingClientRect()
  const px = cx - r.left
  const py = cy - r.top
  vue = { x: px - (px - vue.x) * (k / vue.k), y: py - (py - vue.y) * (k / vue.k), k }
  appliquerVue()
}

graphe.addEventListener('wheel', (e) => {
  if (e.target.closest('.legende-bp')) return
  e.preventDefault()
  const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
  zoomerEn(e.clientX, e.clientY, vue.k * Math.exp(-d * 0.0015))
}, { passive: false })

let animation = 0
function allerA(cible, anime = true) {
  cancelAnimationFrame(animation)
  if (!anime || document.visibilityState === 'hidden') {
    vue = cible
    appliquerVue()
    return
  }
  const depart = { ...vue }
  const t0 = performance.now()
  const pas = (t) => {
    const u = Math.min(1, (t - t0) / 240)
    const e = 1 - (1 - u) ** 3
    vue = { x: depart.x + (cible.x - depart.x) * e, y: depart.y + (cible.y - depart.y) * e, k: depart.k + (cible.k - depart.k) * e }
    appliquerVue()
    if (u < 1) animation = requestAnimationFrame(pas)
  }
  animation = requestAnimationFrame(pas)
}

function bornes(noeuds, coms) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of noeuds) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y)
    x1 = Math.max(x1, n.x + LARGEUR); y1 = Math.max(y1, n.y + hauteur(n.id))
  }
  for (const c of coms) {
    x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y)
    x1 = Math.max(x1, c.x + c.l); y1 = Math.max(y1, c.y + c.h)
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null
}

const boiteSelection = () => bornes([...sel.noeuds].map(noeudPar).filter(Boolean), [...sel.coms].map(comPar).filter(Boolean))

function cadrer(tout = false, anime = true) {
  let b = tout ? null : boiteSelection()
  if (!b && sel.demo) {
    const d = demoPar(sel.demo)
    b = bornes([d.noeud_id, ...d.justifie_par].map(noeudPar).filter(Boolean), [])
  }
  b = b ?? bornes(etat.noeuds, etat.commentaires)
  if (!b) return
  const L = graphe.clientWidth
  const H = graphe.clientHeight
  const m = 48
  const k = borne(Math.min((L - 2 * m) / (b.x1 - b.x0), (H - 2 * m - 30) / (b.y1 - b.y0)), Z_MIN, 1)
  allerA({ k, x: L / 2 - ((b.x0 + b.x1) / 2) * k, y: (H - 30) / 2 - ((b.y0 + b.y1) / 2) * k }, anime)
}

// ─── Rendu des nœuds ─────────────────────────────────────────────────────────────────────────────────

const couleurStatut = (id) => STATUTS[statuts[id]]?.couleur ?? '#a1a1aa'

function htmlNoeud(n) {
  const demos = demosDe.get(n.id)
  const g = GENRES[genreDe(n)]
  const st = STATUTS[statuts[n.id]]
  const utilise = utilisateurs.get(n.id).size > 0
  const rangs = []
  for (const d of demos) {
    const v = VALIDITES[d.validite] ?? VALIDITES.a_verifier
    const conf = fmtConf(d.confiance)
    const choisie = sel.demo === d.id ? ' choisie' : ''
    rangs.push(`<div class="rang demo${choisie}" data-pin="a:${d.id}" data-demo="${d.id}" title="${esc(d.demonstration || d.nom_demonstration)}">`
      + `<span class="pin losange" style="--tc:${v.couleur}"><i></i></span><span class="lab">${esc(d.nom_demonstration)}</span>`
      + `<span class="val" style="color:${v.couleur}">${v.libelle}${conf ? ` · ${conf}` : ''}</span></div>`)
    d.justifie_par.forEach((p, i) => {
      const pn = noeudPar(p)
      rangs.push(`<div class="rang prem" data-pin="p:${d.id}:${i}" title="${esc(pn?.enonce ?? '')}">`
        + `<span class="pin rond plein" style="--tc:${couleurStatut(p)}"><i></i></span><span class="lab">${esc(pn?.nom ?? p)}</span></div>`)
    })
  }
  rangs.push(`<div class="rang ajout" data-pin="n:${n.id}"><span class="pin rond"><i></i></span><span class="lab">${demos.length ? 'autre démonstration' : 'démontrer…'}</span></div>`)
  const detail = n.admis ? 'admis' : demos.length ? pluriel(demos.length, 'démonstration') : 'sans démonstration'
  return `<div class="noeud st-${statuts[n.id]}${sel.noeuds.has(n.id) ? ' choisi' : ''}" data-id="${n.id}" style="width:${LARGEUR}px;transform:translate(${n.x}px,${n.y}px)">`
    + `<div class="tete" style="--c:${g.couleur}"><span class="ico">${g.ico}</span>`
    + `<div class="tt"><b class="n-nom" title="${esc(n.nom)}">${esc(n.nom) || '(sans nom)'}</b><span>${g.libelle}</span></div>`
    + `<span data-pin="s:${n.id}" class="pin rond${utilise ? ' plein' : ''}" style="--tc:${st.couleur}" title="Sortie : glisser vers une démonstration"><i></i></span></div>`
    + `<div class="corps">${rangs.join('')}</div>`
    + `<p class="enonce${n.enonce ? '' : ' vide'}">${esc(n.enonce) || 'Énoncé à rédiger…'}</p>`
    + `<div class="pied"><span class="st" style="--tc:${st.couleur}"><i></i>${st.libelle}</span><span class="txt">${detail}</span></div></div>`
}

function mesurer() {
  geo.clear()
  elNoeud.clear()
  for (const el of coucheNoeuds.children) {
    elNoeud.set(el.dataset.id, el)
    const rn = el.getBoundingClientRect()
    const pins = {}
    for (const p of el.querySelectorAll('.pin')) {
      const cle = p.closest('[data-pin]')?.dataset.pin
      if (!cle) continue
      const r = p.getBoundingClientRect()
      pins[cle] = [(r.left + r.width / 2 - rn.left) / vue.k, (r.top + r.height / 2 - rn.top) / vue.k]
    }
    geo.set(el.dataset.id, { h: el.offsetHeight, pins })
  }
}

const POIGNEES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => `<i class="poignee p-${d}" data-dir="${d}"></i>`).join('')

function rendreCommentaires() {
  // Les grandes boîtes derrière les petites, pour pouvoir imbriquer
  const tri = [...etat.commentaires].sort((a, b) => b.l * b.h - a.l * a.h)
  coucheCom.innerHTML = tri.map((c) => `<div class="commentaire${sel.coms.has(c.id) ? ' choisi' : ''}" data-id="${c.id}" style="--c:${c.couleur}">`
    + `<div class="c-titre" title="Double-clic pour renommer"><span class="c-nom">${esc(c.titre) || 'Commentaire'}</span></div>${POIGNEES}</div>`).join('')
  for (const c of etat.commentaires) placerCom(c)
}

function placerCom(c) {
  const el = coucheCom.querySelector(`[data-id="${c.id}"]`)
  if (!el) return
  el.style.transform = `translate(${c.x}px,${c.y}px)`
  el.style.width = `${c.l}px`
  el.style.height = `${c.h}px`
}

function placerNoeud(n) {
  const el = elNoeud.get(n.id)
  if (el) el.style.transform = `translate(${n.x}px,${n.y}px)`
}

function rendre(panneauAussi = true) {
  indexer()
  coucheNoeuds.innerHTML = etat.noeuds.map(htmlNoeud).join('')
  mesurer()
  rendreCommentaires()
  tracerFils()
  if (panneauAussi) rendrePanneau(panneauAussi === 'force')
  majBarre()
}

// ─── Fils ────────────────────────────────────────────────────────────────────────────────────────────

function courbe(x0, y0, x1, y1) {
  const dx = Math.max(48, Math.abs(x1 - x0) * 0.5)
  return [x0, y0, x0 + dx, y0, x1 - dx, y1, x1, y1]
}

const cheminD = (c) => `M${c[0].toFixed(1)},${c[1].toFixed(1)}C${c[2].toFixed(1)},${c[3].toFixed(1)} ${c[4].toFixed(1)},${c[5].toFixed(1)} ${c[6].toFixed(1)},${c[7].toFixed(1)}`

function pointBezier(c, u) {
  const v = 1 - u
  const a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u
  return [a * c[0] + b * c[2] + d * c[4] + e * c[6], a * c[1] + b * c[3] + d * c[5] + e * c[7]]
}

function noeudDePin(cle) {
  const [t, a] = cle.split(':')
  return t === 's' || t === 'n' ? a : demoPar(a)?.noeud_id
}

function pinMonde(cle) {
  const id = noeudDePin(cle)
  const n = id && noeudPar(id)
  const o = n && geo.get(id)?.pins[cle]
  return o ? [n.x + o[0], n.y + o[1]] : null
}

function tracerFils() {
  filsCourants = []
  let html = ''
  for (const d of etat.demonstrations) {
    d.justifie_par.forEach((p, i) => {
      const a = pinMonde(`s:${p}`)
      const b = pinMonde(`p:${d.id}:${i}`)
      if (!a || !b) return
      const c = courbe(a[0], a[1], b[0], b[1])
      const actif = sel.demo === d.id || sel.noeuds.has(p) || sel.noeuds.has(d.noeud_id)
      filsCourants.push({ demo: d.id, i, c })
      html += `<path class="fil v-${d.validite}${actif ? ' actif' : ''}" style="--l:${(1.4 + (d.confiance ?? 0.4) * 1.4).toFixed(2)}" d="${cheminD(c)}"/>`
    })
  }
  gFils.innerHTML = html
}

function distSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 ? borne(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

function filSous(wx, wy) {
  let meilleur = null
  let dmin = 6 / vue.k
  for (const f of filsCourants) {
    let [px, py] = pointBezier(f.c, 0)
    for (let s = 1; s <= 32; s++) {
      const [qx, qy] = pointBezier(f.c, s / 32)
      const d = distSegment(wx, wy, px, py, qx, qy)
      if (d < dmin) { dmin = d; meilleur = f }
      px = qx; py = qy
    }
  }
  return meilleur
}

// ─── Sélection ───────────────────────────────────────────────────────────────────────────────────────

function viderSel() {
  sel.noeuds.clear()
  sel.coms.clear()
  sel.demo = null
}

function majSelection() {
  for (const [id, el] of elNoeud) el.classList.toggle('choisi', sel.noeuds.has(id))
  for (const el of coucheNoeuds.querySelectorAll('.rang.demo')) el.classList.toggle('choisie', el.dataset.demo === sel.demo)
  for (const el of coucheCom.children) el.classList.toggle('choisi', sel.coms.has(el.dataset.id))
  tracerFils()
  rendrePanneau()
}

function choisirDemo(id) {
  viderSel()
  sel.demo = id
  majSelection()
}

function choisirNoeud(id, centrer = false) {
  viderSel()
  sel.noeuds.add(id)
  majSelection()
  if (centrer) cadrerSur(noeudPar(id))
}

// Recentre sur un nœud sans changer le zoom (navigation depuis le panneau)
function cadrerSur(n) {
  if (!n) return
  const L = graphe.clientWidth
  const H = graphe.clientHeight
  allerA({ k: vue.k, x: L / 2 - (n.x + LARGEUR / 2) * vue.k, y: H / 2 - (n.y + hauteur(n.id) / 2) * vue.k })
}

const centreDans = (n, c) => {
  const cx = n.x + LARGEUR / 2
  const cy = n.y + hauteur(n.id) / 2
  return cx > c.x && cx < c.x + c.l && cy > c.y && cy < c.y + c.h
}
const boiteDans = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.l <= b.x + b.l && a.y + a.h <= b.y + b.h
const contenuDe = (c) => etat.noeuds.filter((n) => centreDans(n, c))

// ─── Liaisons ────────────────────────────────────────────────────────────────────────────────────────

const aVerifier = (d) => { d.validite = 'a_verifier'; d.confiance = null }

function nouvelleDemo(noeudId, premisses) {
  const nb = etat.demonstrations.filter((d) => d.noeud_id === noeudId).length
  return {
    id: nouvelId(etat, 'd'), noeud_id: noeudId, nom_demonstration: nb ? `demonstration_${nb + 1}` : 'demonstration',
    justifie_par: premisses, demonstration: '', validite: 'a_verifier', confiance: null, auteur: 'camille',
  }
}

// `source` dépend-il déjà (transitivement) de `cible` ? Alors le lien fermerait un cycle.
function dependDe(source, cible) {
  const vus = new Set()
  const pile2 = [source]
  while (pile2.length) {
    const id = pile2.pop()
    if (id === cible) return true
    if (vus.has(id)) continue
    vus.add(id)
    for (const d of demosDe.get(id) ?? []) pile2.push(...d.justifie_par)
  }
  return false
}

function verifier(source, entree) {
  const [t, a, i] = entree.split(':')
  const cibleId = t === 'n' ? a : demoPar(a)?.noeud_id
  const s = noeudPar(source)
  const c = noeudPar(cibleId)
  if (!s || !c) return { ok: false, texte: 'Cible inconnue' }
  if (source === cibleId) return { ok: false, texte: 'Une assertion ne peut pas se justifier elle-même' }
  const cycle = dependDe(source, cibleId) ? 'Attention : ce lien ferme un cycle (un cycle ne s’auto-valide pas).' : ''
  if (t === 'n') return { ok: true, texte: `Nouvelle démonstration de « ${c.nom} »`, note: cycle }
  const d = demoPar(a)
  if (t === 'p' && d.justifie_par[Number(i)] === source) return { ok: false, texte: 'Déjà relié ici' }
  if (d.justifie_par.includes(source)) return { ok: false, texte: `Déjà prémisse de ${d.nom_demonstration}` }
  const note = [d.validite !== 'a_verifier' ? `${d.nom_demonstration} repassera « à vérifier ».` : '', cycle].filter(Boolean).join(' ')
  if (t === 'p') return { ok: true, texte: `Remplacer « ${noeudPar(d.justifie_par[Number(i)])?.nom ?? '?'} » dans ${d.nom_demonstration}`, note }
  return { ok: true, texte: `Ajouter comme prémisse de ${d.nom_demonstration}`, note }
}

function brancher(source, entree) {
  const [t, a, i] = entree.split(':')
  if (t === 'n') {
    const d = nouvelleDemo(a, [source])
    etat.demonstrations.push(d)
    return d
  }
  const d = demoPar(a)
  if (!d) return null
  if (t === 'a') d.justifie_par.push(source)
  if (t === 'p') d.justifie_par[Number(i)] = source
  aVerifier(d)
  return d
}

function couper(cle) {
  const [t, a, i] = cle.split(':')
  let n = 0
  if (t === 's') {
    for (const d of etat.demonstrations) {
      if (!d.justifie_par.includes(a)) continue
      d.justifie_par = d.justifie_par.filter((p) => p !== a)
      aVerifier(d)
      n++
    }
  } else if (t === 'p') {
    const d = demoPar(a)
    d.justifie_par.splice(Number(i), 1)
    aVerifier(d)
    n++
  } else if (t === 'a') {
    const d = demoPar(a)
    n = d.justifie_par.length
    if (n) { d.justifie_par = []; aVerifier(d) }
  }
  if (!n) return
  rendre()
  valider()
  notifier(t === 'p' ? 'Lien coupé' : 'Liens coupés')
}

function couperTout(id) {
  for (const d of etat.demonstrations) {
    if (d.noeud_id === id && d.justifie_par.length) { d.justifie_par = []; aVerifier(d) }
    if (d.justifie_par.includes(id)) { d.justifie_par = d.justifie_par.filter((p) => p !== id); aVerifier(d) }
  }
  rendre()
  valider()
  notifier('Tous les liens du nœud sont coupés')
}

// ─── Création, suppression, duplication ──────────────────────────────────────────────────────────────

const NOMS = { assertion: 'Nouvelle assertion', fait: 'Nouveau fait', hypothese: 'Nouvelle hypothèse', conclusion: 'Conclusion' }

function creerNoeud(genre, wx, wy, lien = null) {
  const id = nouvelId(etat, 'a')
  let x = wx
  let y = wy
  if (lien?.depuis) { x = wx - 11; y = wy - 78 } // la broche de prémisse tombe sous le curseur
  if (lien?.vers) { x = wx - LARGEUR + 16; y = wy - 20 } // la broche de sortie tombe sous le curseur
  const n = { id, nom: NOMS[genre], enonce: '', admis: genre === 'fait', genre: genre === 'fait' ? 'assertion' : genre, x: aimant(x), y: aimant(y) }
  etat.noeuds.push(n)
  if (lien?.depuis) etat.demonstrations.push(nouvelleDemo(id, [lien.depuis]))
  if (lien?.vers) brancher(id, lien.vers)
  viderSel()
  sel.noeuds.add(id)
  rendre()
  valider()
  renommerNoeud(id)
}

function creerCommentaire(wx, wy) {
  const b = boiteSelection()
  let boite
  if (b) {
    boite = { x: b.x0 - 28, y: b.y0 - 56, l: b.x1 - b.x0 + 56, h: b.y1 - b.y0 + 84 }
  } else {
    if (wx === undefined) [wx, wy] = versMonde(graphe.getBoundingClientRect().left + graphe.clientWidth / 2 - 208 * vue.k, graphe.getBoundingClientRect().top + graphe.clientHeight / 2 - 128 * vue.k)
    boite = { x: wx, y: wy, l: 416, h: 256 }
  }
  const c = { id: nouvelId(etat, 'k'), titre: 'Nouvelle catégorie', couleur: '#64748b', x: aimant(boite.x), y: aimant(boite.y), l: aimant(boite.l), h: aimant(boite.h) }
  etat.commentaires.push(c)
  viderSel()
  sel.coms.add(c.id)
  rendre()
  valider()
  renommerCommentaire(c.id)
}

function supprimer() {
  if (sel.demo) {
    etat.demonstrations = etat.demonstrations.filter((d) => d.id !== sel.demo)
    sel.demo = null
    rendre()
    valider()
    return
  }
  if (!sel.noeuds.size && !sel.coms.size) return
  const ids = sel.noeuds
  etat.noeuds = etat.noeuds.filter((n) => !ids.has(n.id))
  etat.demonstrations = etat.demonstrations.filter((d) => !ids.has(d.noeud_id))
  for (const d of etat.demonstrations) {
    if (!d.justifie_par.some((p) => ids.has(p))) continue
    d.justifie_par = d.justifie_par.filter((p) => !ids.has(p))
    aVerifier(d)
  }
  etat.commentaires = etat.commentaires.filter((c) => !sel.coms.has(c.id))
  const nb = ids.size + sel.coms.size
  viderSel()
  rendre()
  valider()
  notifier(`${pluriel(nb, 'élément')} supprimé${nb > 1 ? 's' : ''} · Ctrl+Z pour annuler`)
}

function dupliquer() {
  if (!sel.noeuds.size && !sel.coms.size) return
  const carte = new Map()
  for (const id of sel.noeuds) {
    const n = noeudPar(id)
    const copie = { ...structuredClone(n), id: nouvelId(etat, 'a'), x: n.x + 32, y: n.y + 32 }
    carte.set(id, copie.id)
    etat.noeuds.push(copie)
  }
  for (const d of [...etat.demonstrations]) {
    if (!carte.has(d.noeud_id)) continue
    etat.demonstrations.push({ ...structuredClone(d), id: nouvelId(etat, 'd'), noeud_id: carte.get(d.noeud_id), justifie_par: d.justifie_par.map((p) => carte.get(p) ?? p) })
  }
  const coms = []
  for (const id of sel.coms) {
    const c = comPar(id)
    const copie = { ...c, id: nouvelId(etat, 'k'), x: c.x + 32, y: c.y + 32 }
    etat.commentaires.push(copie)
    coms.push(copie.id)
  }
  viderSel()
  for (const id of carte.values()) sel.noeuds.add(id)
  for (const id of coms) sel.coms.add(id)
  rendre()
  valider()
}

function toutSelectionner() {
  viderSel()
  for (const n of etat.noeuds) sel.noeuds.add(n.id)
  majSelection()
}

// ─── Renommage en place ──────────────────────────────────────────────────────────────────────────────

function editerEnPlace(el, valeur, appliquer) {
  if (!el) return
  const input = document.createElement('input')
  input.className = 'renommage'
  input.value = valeur
  input.spellcheck = false
  el.replaceChildren(input)
  edition = input
  input.focus()
  input.select()
  let fini = false
  const finir = (garder) => {
    if (fini) return
    fini = true
    edition = null
    const v = input.value.trim()
    const change = garder && v && appliquer(v)
    rendre()
    if (change) valider()
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') finir(true)
    if (e.key === 'Escape') finir(false)
  })
  input.addEventListener('blur', () => finir(true))
}

function renommerNoeud(id) {
  const n = noeudPar(id)
  editerEnPlace(elNoeud.get(id)?.querySelector('.n-nom'), n.nom, (v) => {
    if (v === n.nom) return false
    n.nom = v
    return true
  })
}

function renommerCommentaire(id) {
  const c = comPar(id)
  editerEnPlace(coucheCom.querySelector(`[data-id="${id}"] .c-nom`), c.titre, (v) => {
    if (v === c.titre) return false
    c.titre = v
    return true
  })
}

// ─── Gestes à la souris ──────────────────────────────────────────────────────────────────────────────

window.addEventListener('contextmenu', (e) => { if (e.target.closest('.graphe, .menu')) e.preventDefault() })

graphe.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.legende-bp, .renommage')) return
  if (edition) edition.blur()
  fermerMenu()
  const x0 = e.clientX
  const y0 = e.clientY

  if (e.button === 1 || e.button === 2 || (e.button === 0 && espace)) {
    e.preventDefault()
    geste = { type: 'pan', x0, y0, vx: vue.x, vy: vue.y, bouton: e.button, bouge: false, cible: e.target }
    return
  }
  if (e.button !== 0) return

  const pin = e.target.closest('.pin')?.closest('[data-pin]') ?? e.target.closest('.rang[data-pin]:not(.demo)')
  if (pin) {
    e.preventDefault()
    const cle = pin.dataset.pin
    if (e.altKey) { couper(cle); return }
    geste = { type: 'fil', cle, x0, y0, bouge: false, sortie: cle.startsWith('s:'), cible: null, verdict: null }
    return
  }

  const nel = e.target.closest('.noeud')
  if (nel) {
    const rangDemo = e.target.closest('.rang.demo')
    if (rangDemo) { choisirDemo(rangDemo.dataset.demo); return }
    cliquerElement(e, 'noeuds', nel.dataset.id)
    return
  }

  const poignee = e.target.closest('.poignee')
  if (poignee) {
    e.preventDefault()
    const c = comPar(poignee.closest('.commentaire').dataset.id)
    geste = { type: 'redim', c, dir: poignee.dataset.dir, x0, y0, ini: { x: c.x, y: c.y, l: c.l, h: c.h }, bouge: false }
    if (!sel.coms.has(c.id)) { viderSel(); sel.coms.add(c.id); majSelection() }
    return
  }

  const titre = e.target.closest('.c-titre')
  if (titre) {
    cliquerElement(e, 'coms', titre.closest('.commentaire').dataset.id)
    return
  }

  const [wx, wy] = versMonde(x0, y0)
  const f = filSous(wx, wy)
  if (f) { choisirDemo(f.demo); return }

  const mod = e.ctrlKey || e.metaKey
  geste = { type: 'lasso', x0, y0, bouge: false, ajout: e.shiftKey, bascule: mod, avant: { noeuds: new Set(sel.noeuds), coms: new Set(sel.coms) } }
})

// Clic sur un nœud ou un titre de commentaire : sélection façon Unreal, puis déplacement possible.
function cliquerElement(e, genre, id) {
  const ens = sel[genre]
  let reduire = false
  sel.demo = null
  if (e.ctrlKey || e.metaKey) {
    if (ens.has(id)) ens.delete(id)
    else ens.add(id)
  } else if (e.shiftKey) {
    ens.add(id)
  } else if (!ens.has(id)) {
    viderSel()
    ens.add(id)
  } else {
    reduire = true
  }
  majSelection()
  if (!ens.has(id)) return
  const ids = new Set(sel.noeuds)
  const coms = new Set(sel.coms)
  for (const cid of sel.coms) {
    const c = comPar(cid)
    for (const n of contenuDe(c)) ids.add(n.id)
    for (const c2 of etat.commentaires) if (c2 !== c && boiteDans(c2, c)) coms.add(c2.id)
  }
  const noeuds = [...ids].map((i) => noeudPar(i)).map((n) => ({ o: n, x: n.x, y: n.y }))
  const boites = [...coms].map((i) => comPar(i)).map((c) => ({ o: c, x: c.x, y: c.y }))
  const ancre = (genre === 'noeuds' ? noeuds : boites).find((a) => a.o.id === id)
  geste = { type: 'deplacer', x0: e.clientX, y0: e.clientY, bouge: false, reduire, genre, id, ancre, noeuds, boites }
}

window.addEventListener('pointermove', (e) => {
  if (!geste) return
  const dx = e.clientX - geste.x0
  const dy = e.clientY - geste.y0
  if (!geste.bouge && Math.hypot(dx, dy) > SEUIL) {
    geste.bouge = true
    if (geste.type === 'pan') graphe.classList.add('panoramique')
    if (geste.type === 'fil') graphe.classList.add('liaison')
  }
  if (!geste.bouge) return

  if (geste.type === 'pan') {
    vue = { ...vue, x: geste.vx + dx, y: geste.vy + dy }
    appliquerVue()
  } else if (geste.type === 'deplacer') {
    const a = geste.ancre
    const ddx = aimant(a.x + dx / vue.k) - a.x
    const ddy = aimant(a.y + dy / vue.k) - a.y
    for (const it of geste.noeuds) { it.o.x = it.x + ddx; it.o.y = it.y + ddy; placerNoeud(it.o) }
    for (const it of geste.boites) { it.o.x = it.x + ddx; it.o.y = it.y + ddy; placerCom(it.o) }
    tracerFils()
  } else if (geste.type === 'redim') {
    redimensionner(geste, dx / vue.k, dy / vue.k)
  } else if (geste.type === 'lasso') {
    etirerLasso(e)
  } else if (geste.type === 'fil') {
    tirerFil(e)
  }
})

function redimensionner(g, wdx, wdy) {
  const i = g.ini
  const c = g.c
  let { x, y, l, h } = i
  if (g.dir.includes('e')) l = Math.max(MIN_COM.l, aimant(i.l + wdx))
  if (g.dir.includes('s')) h = Math.max(MIN_COM.h, aimant(i.h + wdy))
  if (g.dir.includes('w')) { l = Math.max(MIN_COM.l, aimant(i.l - wdx)); x = i.x + i.l - l }
  if (g.dir.includes('n')) { h = Math.max(MIN_COM.h, aimant(i.h - wdy)); y = i.y + i.h - h }
  Object.assign(c, { x, y, l, h })
  placerCom(c)
}

function etirerLasso(e) {
  const g = geste
  const r = graphe.getBoundingClientRect()
  const gx = Math.min(g.x0, e.clientX) - r.left
  const gy = Math.min(g.y0, e.clientY) - r.top
  const l = Math.abs(e.clientX - g.x0)
  const h = Math.abs(e.clientY - g.y0)
  Object.assign(lasso.style, { left: `${gx}px`, top: `${gy}px`, width: `${l}px`, height: `${h}px` })
  lasso.hidden = false
  const [x0, y0] = versMonde(Math.min(g.x0, e.clientX), Math.min(g.y0, e.clientY))
  const [x1, y1] = versMonde(Math.max(g.x0, e.clientX), Math.max(g.y0, e.clientY))
  const dedans = new Set(etat.noeuds.filter((n) => n.x < x1 && n.x + LARGEUR > x0 && n.y < y1 && n.y + hauteur(n.id) > y0).map((n) => n.id))
  const comsDedans = new Set(etat.commentaires.filter((c) => c.x >= x0 && c.y >= y0 && c.x + c.l <= x1 && c.y + c.h <= y1).map((c) => c.id))
  const combiner = (avant, nouveaux) => {
    if (g.ajout) return new Set([...avant, ...nouveaux])
    if (g.bascule) return new Set([...[...avant].filter((x) => !nouveaux.has(x)), ...[...nouveaux].filter((x) => !avant.has(x))])
    return nouveaux
  }
  sel.demo = null
  sel.noeuds = combiner(g.avant.noeuds, dedans)
  sel.coms = combiner(g.avant.coms, comsDedans)
  majSelection()
}

function cibleSous(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY)
  if (!el || !el.closest('.graphe')) return null
  const rang = el.closest('[data-pin]')
  const nel = el.closest('.noeud')
  if (geste.sortie) {
    if (rang && !rang.dataset.pin.startsWith('s:')) return rang.dataset.pin
    if (!nel) return null
    const demos = demosDe.get(nel.dataset.id)
    return demos.length === 1 ? `a:${demos[0].id}` : `n:${nel.dataset.id}`
  }
  if (rang?.dataset.pin.startsWith('s:')) return rang.dataset.pin
  return nel ? `s:${nel.dataset.id}` : null
}

function marquerCible(cle) {
  for (const el of coucheNoeuds.querySelectorAll('.cible')) el.classList.remove('cible')
  if (!cle) return
  const el = coucheNoeuds.querySelector(`[data-pin="${cle}"]`)
  if (el) el.classList.add('cible')
}

function tirerFil(e) {
  const g = geste
  const a = pinMonde(g.cle)
  const [wx, wy] = versMonde(e.clientX, e.clientY)
  if (a) filTemp.setAttribute('d', cheminD(g.sortie ? courbe(a[0], a[1], wx, wy) : courbe(wx, wy, a[0], a[1])))
  const cible = cibleSous(e)
  // Une sortie se relie à une entrée et inversement ; le reste est ignoré
  g.cible = cible && cible.startsWith('s:') !== g.sortie ? cible : null
  marquerCible(g.cible)
  if (g.cible) {
    const [source, entree] = g.sortie ? [g.cle.slice(2), g.cible] : [g.cible.slice(2), g.cle]
    g.verdict = verifier(source, entree)
    g.source = source
    g.entree = entree
    bulle.innerHTML = `<b class="${g.verdict.ok ? 'ok' : 'non'}">${g.verdict.ok ? '✓' : '✕'}</b>${esc(g.verdict.texte)}${g.verdict.note ? `<small>${esc(g.verdict.note)}</small>` : ''}`
  } else {
    g.verdict = null
    bulle.innerHTML = g.cle.startsWith('p:') ? 'Relâcher sur une sortie pour remplacer la prémisse' : 'Relâcher dans le vide pour créer un nœud relié'
  }
  bulle.hidden = false
  bulle.style.left = `${Math.min(e.clientX + 16, innerWidth - bulle.offsetWidth - 8)}px`
  bulle.style.top = `${e.clientY + 18}px`
}

function finGeste(e, annule = false) {
  const g = geste
  geste = null
  graphe.classList.remove('panoramique', 'liaison')
  lasso.hidden = true
  if (!g) return
  if (g.type === 'pan') {
    if (!annule && g.bouton === 2 && !g.bouge) menuContextuel(e, g.cible)
    return
  }
  if (g.type === 'deplacer') {
    if (g.bouge) { rendre(); valider() } else if (g.reduire && !annule) {
      viderSel()
      sel[g.genre].add(g.id)
      majSelection()
    }
    return
  }
  if (g.type === 'redim') {
    if (g.bouge) { rendre(); valider() }
    return
  }
  if (g.type === 'lasso') {
    if (!g.bouge && !g.ajout && !g.bascule && !annule) { viderSel(); majSelection() }
    return
  }
  if (g.type === 'fil') {
    filTemp.setAttribute('d', '')
    bulle.hidden = true
    marquerCible(null)
    if (annule) return
    if (!g.bouge) {
      // Simple clic sur une broche : sélectionne ce qu'elle représente
      const [t, a] = g.cle.split(':')
      if (t === 'p' || t === 'a') choisirDemo(a)
      else choisirNoeud(a)
      return
    }
    if (g.cible) {
      if (!g.verdict?.ok) return
      const d = brancher(g.source, g.entree)
      viderSel()
      if (d) sel.demo = d.id
      rendre()
      valider()
      return
    }
    if (g.cle.startsWith('p:')) return
    menuCreation(e.clientX, e.clientY, g.sortie ? { depuis: g.cle.slice(2) } : { vers: g.cle })
  }
}

window.addEventListener('pointerup', (e) => finGeste(e))
window.addEventListener('pointercancel', (e) => finGeste(e, true))

graphe.addEventListener('dblclick', (e) => {
  const tete = e.target.closest('.tete')
  if (tete && !e.target.closest('.pin')) { renommerNoeud(tete.closest('.noeud').dataset.id); return }
  const titre = e.target.closest('.c-titre')
  if (titre) renommerCommentaire(titre.closest('.commentaire').dataset.id)
})

// ─── Menus contextuels ───────────────────────────────────────────────────────────────────────────────

function ouvrirMenu(cx, cy, { titre, entrees, recherche = false }) {
  menuEtat = { entrees, i: 0, filtre: '', vis: [] }
  menu.innerHTML = `<div class="m-titre">${esc(titre)}</div>${recherche ? '<input class="m-recherche" placeholder="Rechercher" spellcheck="false">' : ''}<div class="m-liste"></div>`
  menu.hidden = false
  remplirMenu()
  const w = menu.offsetWidth
  const h = menu.offsetHeight
  menu.style.left = `${Math.max(8, Math.min(cx, innerWidth - w - 8))}px`
  menu.style.top = `${Math.max(8, Math.min(cy, innerHeight - h - 8))}px`
  const champ = $('.m-recherche', menu)
  if (champ) {
    champ.focus()
    champ.addEventListener('input', () => { menuEtat.filtre = champ.value; menuEtat.i = 0; remplirMenu() })
  }
}

function remplirMenu() {
  const f = norm(menuEtat.filtre.trim())
  const vis = menuEtat.entrees.filter((x) => !f || norm(`${x.libelle} ${x.groupe ?? ''} ${x.mots ?? ''}`).includes(f))
  menuEtat.vis = vis
  menuEtat.i = borne(menuEtat.i, 0, Math.max(0, vis.length - 1))
  let groupe = null
  let html = ''
  vis.forEach((x, k) => {
    if (x.groupe && x.groupe !== groupe) { groupe = x.groupe; html += `<div class="m-groupe">▾ ${esc(groupe)}</div>` }
    html += `<div class="m-item${k === menuEtat.i ? ' actif' : ''}${x.danger ? ' danger' : ''}" data-i="${k}"><span class="m-ico" style="--c:${x.couleur ?? ''}">${x.ico ?? ''}</span><span>${esc(x.libelle)}</span>${x.touche ? `<kbd>${x.touche}</kbd>` : ''}</div>`
  })
  $('.m-liste', menu).innerHTML = html || '<div class="m-vide">Aucune action ne correspond</div>'
}

function executerMenu(k) {
  const x = menuEtat?.vis[k]
  fermerMenu()
  x?.action()
}

function fermerMenu() {
  menu.hidden = true
  menuEtat = null
}

menu.addEventListener('pointermove', (e) => {
  const it = e.target.closest('.m-item')
  if (!it || !menuEtat || Number(it.dataset.i) === menuEtat.i) return
  menuEtat.i = Number(it.dataset.i)
  for (const el of menu.querySelectorAll('.m-item')) el.classList.toggle('actif', el === it)
})
menu.addEventListener('click', (e) => {
  const it = e.target.closest('.m-item')
  if (it) executerMenu(Number(it.dataset.i))
})
document.addEventListener('pointerdown', (e) => { if (menuEtat && !menu.contains(e.target)) fermerMenu() }, true)

function menuCreation(cx, cy, lien = null) {
  const [wx, wy] = versMonde(cx, cy)
  const creer = (genre) => () => creerNoeud(genre, wx, wy, lien)
  const entrees = [
    { groupe: 'Assertion', libelle: 'Assertion', ico: GENRES.assertion.ico, couleur: GENRES.assertion.couleur, mots: 'énoncé affirmation', action: creer('assertion') },
    { groupe: 'Assertion', libelle: 'Fait admis', ico: GENRES.fait.ico, couleur: GENRES.fait.couleur, mots: 'axiome mesure donnée résultat connu', action: creer('fait') },
    { groupe: 'Assertion', libelle: 'Hypothèse', ico: GENRES.hypothese.ico, couleur: GENRES.hypothese.couleur, mots: 'conjecture piste', action: creer('hypothese') },
    { groupe: 'Assertion', libelle: 'Conclusion', ico: GENRES.conclusion.ico, couleur: GENRES.conclusion.couleur, mots: 'réponse synthèse', action: creer('conclusion') },
  ]
  if (!lien) {
    entrees.push(
      { groupe: 'Organisation', libelle: 'Commentaire (catégorie)', ico: '▭', touche: 'C', mots: 'boîte groupe comment', action: () => creerCommentaire(wx, wy) },
      { groupe: 'Vue', libelle: 'Tout cadrer', ico: '⤢', touche: 'Origine', action: () => cadrer(true) },
      { groupe: 'Vue', libelle: 'Tout sélectionner', ico: '⬚', touche: 'Ctrl+A', action: toutSelectionner },
    )
  }
  let titre = 'Toutes les actions pour ce graphe'
  if (lien?.depuis) titre = `Nouveau nœud démontré à partir de « ${noeudPar(lien.depuis)?.nom} »`
  if (lien?.vers) titre = 'Nouveau nœud servant de prémisse'
  ouvrirMenu(cx, cy, { titre, entrees, recherche: true })
}

function menuContextuel(e, cible) {
  const nel = cible?.closest?.('.noeud')
  if (nel) {
    const id = nel.dataset.id
    if (!sel.noeuds.has(id)) choisirNoeud(id)
    const n = noeudPar(id)
    ouvrirMenu(e.clientX, e.clientY, {
      titre: n.nom,
      entrees: [
        { groupe: 'Nœud', libelle: 'Renommer', ico: '✎', touche: 'F2', action: () => renommerNoeud(id) },
        { groupe: 'Nœud', libelle: n.admis ? 'Ne plus admettre' : 'Marquer comme fait admis', ico: GENRES.fait.ico, action: () => { n.admis = !n.admis; rendre(); valider() } },
        { groupe: 'Nœud', libelle: 'Nouvelle démonstration', ico: '◆', action: () => { const d = nouvelleDemo(id, []); etat.demonstrations.push(d); viderSel(); sel.demo = d.id; rendre(); valider() } },
        { groupe: 'Nœud', libelle: 'Dupliquer', ico: '⧉', touche: 'Ctrl+D', action: dupliquer },
        { groupe: 'Nœud', libelle: 'Catégorie autour de la sélection', ico: '▭', touche: 'C', action: () => creerCommentaire() },
        { groupe: 'Liens', libelle: 'Couper tous les liens', ico: '✂', action: () => couperTout(id) },
        { groupe: 'Liens', libelle: 'Supprimer', ico: '×', touche: 'Suppr', danger: true, action: supprimer },
      ],
    })
    return
  }
  const ctitre = cible?.closest?.('.commentaire')
  if (ctitre && cible.closest('.c-titre')) {
    const id = ctitre.dataset.id
    if (!sel.coms.has(id)) { viderSel(); sel.coms.add(id); majSelection() }
    ouvrirMenu(e.clientX, e.clientY, {
      titre: comPar(id).titre,
      entrees: [
        { libelle: 'Renommer', ico: '✎', action: () => renommerCommentaire(id) },
        { libelle: 'Cadrer', ico: '⤢', touche: 'F', action: () => cadrer() },
        { libelle: 'Supprimer la boîte', ico: '×', touche: 'Suppr', danger: true, action: supprimer },
      ],
    })
    return
  }
  const [wx, wy] = versMonde(e.clientX, e.clientY)
  const f = filSous(wx, wy)
  if (f) {
    choisirDemo(f.demo)
    ouvrirMenu(e.clientX, e.clientY, {
      titre: `Lien de ${demoPar(f.demo).nom_demonstration}`,
      entrees: [
        { libelle: 'Couper ce lien', ico: '✂', action: () => couper(`p:${f.demo}:${f.i}`) },
        { libelle: 'Cadrer la démonstration', ico: '⤢', touche: 'F', action: () => cadrer() },
      ],
    })
    return
  }
  menuCreation(e.clientX, e.clientY)
}

// ─── Clavier ─────────────────────────────────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (menuEtat) {
    const n = menuEtat.vis.length
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      menuEtat.i = n ? (menuEtat.i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n : 0
      remplirMenu()
      menu.querySelector('.m-item.actif')?.scrollIntoView({ block: 'nearest' })
      return
    }
    if (e.key === 'Enter') { e.preventDefault(); executerMenu(menuEtat.i); return }
    if (e.key === 'Escape') { fermerMenu(); return }
  }
  if (e.key === 'Escape' && !aide.hidden) { aide.hidden = true; return }
  const champ = e.target.closest?.('input, textarea, select, [contenteditable]')
  if (champ) {
    if (e.key === 'Escape') champ.blur()
    return
  }
  const mod = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  if (mod) {
    if (k === 'z' && !e.shiftKey) restaurer(ip - 1)
    else if (k === 'y' || (k === 'z' && e.shiftKey)) restaurer(ip + 1)
    else if (k === 'd') dupliquer()
    else if (k === 'a') toutSelectionner()
    else return
    e.preventDefault()
    return
  }
  if (e.altKey) return
  if (e.key === ' ') { espace = true; graphe.classList.add('espace'); e.preventDefault(); return }
  if (e.key === 'Delete' || e.key === 'Backspace') supprimer()
  else if (e.key === 'Escape') { viderSel(); majSelection() }
  else if (e.key === 'Home') cadrer(true)
  else if (k === 'f') cadrer()
  else if (k === 'c') creerCommentaire()
  else if (k === 'g') basculerAimant()
  else if (e.key === 'F2') {
    if (sel.noeuds.size === 1 && !sel.coms.size) renommerNoeud([...sel.noeuds][0])
    else if (sel.coms.size === 1 && !sel.noeuds.size) renommerCommentaire([...sel.coms][0])
  } else if (e.key === '?') aide.hidden = !aide.hidden
  else return
  e.preventDefault()
})

window.addEventListener('keyup', (e) => { if (e.key === ' ') { espace = false; graphe.classList.remove('espace') } })
window.addEventListener('blur', () => { espace = false; graphe.classList.remove('espace') })

// ─── Barre, légende, aide, notifications ─────────────────────────────────────────────────────────────

function basculerAimant() {
  aimanter = !aimanter
  majBarre()
  sauverBientot()
  notifier(aimanter ? 'Aimantation à la grille activée' : 'Aimantation à la grille désactivée')
}

function majBarre() {
  const p = $('.barre .probleme')
  p.textContent = etat.probleme
  p.title = etat.probleme
  $('[data-action="annuler"]').disabled = ip <= 0
  $('[data-action="retablir"]').disabled = ip >= pile.length - 1
  $('[data-action="aimanter"]').classList.toggle('actif', aimanter)
}

function reinitialiser() {
  etat = exemple()
  viderSel()
  disposerTout()
  valider()
  cadrer(true)
  notifier('Exemple réinitialisé · Ctrl+Z pour revenir en arrière')
}

document.querySelector('.barre').addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]')?.dataset.action
  if (a === 'annuler') restaurer(ip - 1)
  if (a === 'retablir') restaurer(ip + 1)
  if (a === 'cadrer') cadrer()
  if (a === 'commentaire') creerCommentaire()
  if (a === 'aimanter') basculerAimant()
  if (a === 'reinitialiser') reinitialiser()
  if (a === 'aide') aide.hidden = !aide.hidden
})
aide.addEventListener('click', (e) => { if (e.target === aide || e.target.closest('.fermer')) aide.hidden = true })

$('.legende-bp').innerHTML = Object.values(STATUTS).map((s) => `<span><i class="carre" style="--tc:${s.couleur}"></i>${s.libelle}</span>`).join('')
  + '<i class="sep"></i>'
  + Object.entries(VALIDITES).map(([k, v]) => `<span><i class="trait" style="border-color:${k === 'valide' ? '#8b8b93' : v.couleur};${k === 'a_verifier' ? 'border-top-style:dashed;' : ''}"></i>${v.libelle}</span>`).join('')
  + '<i class="sep"></i><span style="color:var(--texte-3)">Clic droit : créer · C : catégorie · F : cadrer · ? : aide</span>'

let minuterieToast = null
function notifier(texte) {
  toast.textContent = texte
  toast.classList.add('visible')
  clearTimeout(minuterieToast)
  minuterieToast = setTimeout(() => toast.classList.remove('visible'), 2600)
}

// ─── Panneau Détails ─────────────────────────────────────────────────────────────────────────────────

function cleSelection() {
  if (sel.demo) return `d:${sel.demo}`
  const n = sel.noeuds.size
  const c = sel.coms.size
  if (!n && !c) return 'vide'
  if (n === 1 && !c) return `n:${[...sel.noeuds][0]}`
  if (c === 1 && !n) return `k:${[...sel.coms][0]}`
  return 'multi'
}

const section = (titre, contenu, compte = '') => `<details open><summary>${titre}${compte !== '' ? `<small>${compte}</small>` : ''}</summary><div class="bloc">${contenu}</div></details>`
const champ = (lib, html) => `<div class="champ"><label>${lib}</label><div>${html}</div></div>`
const entete = (couleur, ico, role, titre) => `<div class="d-tete"><span class="d-ico" style="--c:${couleur}">${ico}</span><div><div class="d-role">${esc(role)}</div><h2 class="d-titre">${esc(titre) || '(sans nom)'}</h2></div></div>`
const lienNoeud = (id, suffixe = '') => {
  const n = noeudPar(id)
  return `<button class="d-lien" data-noeud="${id}"><i class="carre" style="--tc:${couleurStatut(id)}"></i><span>${esc(n?.nom ?? id)}</span>${suffixe}</button>`
}
const lienDemo = (d) => {
  const v = VALIDITES[d.validite]
  const conf = fmtConf(d.confiance)
  return `<button class="d-lien" data-demo="${d.id}"><i class="losange" style="--tc:${v.couleur}"></i><span class="mono">${esc(d.nom_demonstration)}</span><small style="color:${v.couleur}">${v.libelle}${conf ? ` · ${conf}` : ''}</small></button>`
}

function expliquer(n) {
  const st = statuts[n.id]
  const demos = demosDe.get(n.id)
  if (st === 'etabli') {
    if (n.admis) return 'Fait admis : établi sans démonstration.'
    const d = demos.find((x) => x.validite === 'valide' && x.justifie_par.every((p) => statuts[p] === 'etabli'))
    return d ? `Démontré par ${d.nom_demonstration} : démonstration valide dont toutes les prémisses sont établies.` : 'Établi.'
  }
  if (st === 'suspendu') {
    const d = demos.find((x) => x.validite === 'valide')
    const manque = d.justifie_par.filter((p) => statuts[p] !== 'etabli').map((p) => `« ${noeudPar(p)?.nom ?? p} »`)
    if (!manque.length) return `${d.nom_demonstration} est valide mais s’appuie sur un cycle.`
    return `${d.nom_demonstration} est valide, mais ${manque.length > 1 ? 'ces prémisses ne sont pas établies' : 'cette prémisse n’est pas établie'} : ${manque.join(', ')}.`
  }
  if (st === 'a_verifier') return 'Aucune démonstration valide ; au moins une attend le vérificateur.'
  if (st === 'invalide') return 'Toutes ses démonstrations ont été jugées invalides.'
  return 'Aucune démonstration : question ouverte.'
}

let clePanneau = null
function rendrePanneau(force = false) {
  const cle = cleSelection()
  const actif = document.activeElement
  if (!force && cle === clePanneau && panneau.contains(actif) && actif.matches('input:not([type=checkbox]):not([type=range]), textarea')) return
  const defil = $('.d-defil', panneau)
  const haut = cle === clePanneau && defil ? defil.scrollTop : 0
  clePanneau = cle
  const [t, id] = cle.split(':')
  let html = ''
  if (t === 'n') html = panneauNoeud(noeudPar(id))
  else if (t === 'd') html = panneauDemo(demoPar(id))
  else if (t === 'k') html = panneauCommentaire(comPar(id))
  else if (t === 'multi') html = panneauMulti()
  else html = panneauGraphe()
  panneau.innerHTML = html
  const nd = $('.d-defil', panneau)
  if (nd) nd.scrollTop = haut
  const nb = sel.noeuds.size + sel.coms.size + (sel.demo ? 1 : 0)
  compteSel.textContent = nb ? pluriel(nb, 'élément') : ''
}

function panneauGraphe() {
  const compte = {}
  for (const n of etat.noeuds) compte[statuts[n.id]] = (compte[statuts[n.id]] ?? 0) + 1
  return entete('#3f3f46', '⌗', 'Graphe · aucune sélection', 'Résolution de problème')
    + '<div class="d-defil">'
    + section('Problème', `<div class="champ" style="grid-template-columns:1fr"><textarea data-f="probleme" rows="3">${esc(etat.probleme)}</textarea></div>`)
    + section('Statuts', Object.entries(STATUTS).map(([k, s]) => `<button class="d-lien" data-statut="${k}"><i class="carre" style="--tc:${s.couleur}"></i><span>${s.libelle}</span><small>${compte[k] ?? 0}</small></button>`).join('')
      + '<p class="note">Clic : sélectionner ces nœuds. Recalculés à chaque modification.</p>', pluriel(etat.noeuds.length, 'nœud'))
    + section('Catégories', etat.commentaires.map((c) => `<button class="d-lien" data-com="${c.id}"><i class="carre" style="--tc:${c.couleur}"></i><span>${esc(c.titre)}</span><small>${contenuDe(c).length}</small></button>`).join('') || '<div class="vide-liste">Aucune catégorie : touche C.</div>', etat.commentaires.length)
    + section('Pour commencer', `<ul class="aides">
        <li>Clic droit sur le fond : créer un nœud.</li>
        <li>Glisser la broche d’en-tête d’un nœud vers une démonstration : ajouter une prémisse.</li>
        <li>Double-clic sur un nom : renommer.</li>
        <li>Sélectionner puis <b>C</b> : entourer d’une catégorie.</li>
      </ul>`)
    + '</div>'
}

function panneauNoeud(n) {
  const g = genreDe(n)
  const G = GENRES[g]
  const S = STATUTS[statuts[n.id]]
  const demos = demosDe.get(n.id)
  const util = [...utilisateurs.get(n.id)]
  const option = (v) => `<option value="${v}"${(n.genre ?? 'assertion') === v ? ' selected' : ''}>${GENRES[v].libelle}</option>`
  return entete(G.couleur, G.ico, `${G.libelle} · ${n.id}`, n.nom)
    + '<div class="d-defil">'
    + section('Assertion',
      champ('Nom', `<input data-f="nom" value="${esc(n.nom)}" spellcheck="false">`)
      + champ('Énoncé', `<textarea data-f="enonce" rows="4" placeholder="Énoncé de l’assertion">${esc(n.enonce)}</textarea>`)
      + champ('Nature', `<select data-f="genre"${n.admis ? ' disabled' : ''}>${option('assertion')}${option('hypothese')}${option('conclusion')}</select>`)
      + `<label class="case"><input type="checkbox" data-f="admis"${n.admis ? ' checked' : ''}> Fait admis <small>établi sans démonstration</small></label>`)
    + section('Statut', `<div class="statut" style="--tc:${S.couleur}"><i class="carre"></i>${S.libelle}</div><p class="explic">${esc(expliquer(n))}</p><p class="note">Calculé à partir de tout le graphe, jamais stocké.</p>`)
    + section('Démonstrations', (demos.map(lienDemo).join('') || '<div class="vide-liste">Aucune.</div>') + '<button class="d-bouton" data-a="nouvelle-demo">+ Nouvelle démonstration</button>', demos.length)
    + section('Sert de prémisse à', util.map((u) => lienNoeud(u)).join('') || '<div class="vide-liste">Aucun nœud.</div>', util.length)
    + '<div class="d-actions"><button class="d-bouton" data-a="cadrer">Cadrer<kbd>F</kbd></button><button class="d-bouton" data-a="dupliquer">Dupliquer<kbd>Ctrl+D</kbd></button><button class="d-bouton danger" data-a="supprimer">Supprimer<kbd>Suppr</kbd></button></div>'
    + '</div>'
}

function panneauDemo(d) {
  const v = VALIDITES[d.validite]
  const conf = fmtConf(d.confiance)
  const segs = Object.entries(VALIDITES).map(([k, x]) => `<button data-validite="${k}" class="${k === d.validite ? 'actif' : ''}" style="--tc:${x.couleur}">${x.libelle}</button>`).join('')
  const prems = d.justifie_par.map((p, i) => `<div class="ligne-prem">${lienNoeud(p)}<button class="retirer" data-retirer="${i}" title="Retirer cette prémisse">×</button></div>`).join('')
  return entete(v.couleur, '◆', `Démonstration · ${d.id}`, d.nom_demonstration)
    + '<div class="d-defil">'
    + section('Démonstration',
      champ('Nom', `<input class="mono" data-f="nom_demonstration" value="${esc(d.nom_demonstration)}" spellcheck="false">`)
      + champ('Démontre', lienNoeud(d.noeud_id))
      + champ('Validité', `<div class="segments">${segs}</div>`)
      + champ('Confiance', `<div class="conf"><input type="range" min="0" max="1" step="0.01" data-f="confiance" value="${d.confiance ?? 0.5}"${d.confiance == null ? ' class="vide"' : ''}><output>${conf || '—'}</output><button data-a="sans-confiance" title="Pas encore notée">aucune</button></div>`)
      + champ('Raisonnement', `<textarea data-f="demonstration" rows="4" placeholder="Comment les prémisses entraînent la conclusion">${esc(d.demonstration)}</textarea>`)
      + champ('Auteur', `<input data-f="auteur" value="${esc(d.auteur)}" spellcheck="false">`))
    + section('Prémisses', (prems || '<div class="vide-liste">Aucune prémisse.</div>')
      + '<p class="note">Glisser la broche de sortie d’un nœud sur cette démonstration pour ajouter une prémisse. Modifier les prémisses la repasse « à vérifier ».</p>', d.justifie_par.length)
    + '<div class="d-actions"><button class="d-bouton" data-a="cadrer">Cadrer<kbd>F</kbd></button><button class="d-bouton danger" data-a="supprimer">Supprimer la démonstration</button></div>'
    + '</div>'
}

function panneauCommentaire(c) {
  const contenu = contenuDe(c)
  const nuancier = PALETTE.map((p) => `<button data-couleur="${p.couleur}" title="${p.nom}" class="${p.couleur === c.couleur ? 'actif' : ''}" style="--c:${p.couleur}"></button>`).join('')
  return entete(c.couleur, '▭', `Commentaire · ${c.id}`, c.titre)
    + '<div class="d-defil">'
    + section('Catégorie',
      champ('Titre', `<input data-f="titre" value="${esc(c.titre)}" spellcheck="false">`)
      + champ('Couleur', `<div class="nuancier">${nuancier}</div>`)
      + champ('Taille', `<span class="mono" style="line-height:26px">${Math.round(c.l)} × ${Math.round(c.h)}</span>`))
    + section('Contenu', contenu.map((n) => lienNoeud(n.id)).join('') || '<div class="vide-liste">Boîte vide.</div>', contenu.length)
    + '<p class="note" style="margin-top:10px">Glisser le titre déplace la boîte et son contenu ; bords et coins la redimensionnent.</p>'
    + '<div class="d-actions"><button class="d-bouton" data-a="cadrer">Cadrer<kbd>F</kbd></button><button class="d-bouton danger" data-a="supprimer">Supprimer la boîte</button></div>'
    + '</div>'
}

function panneauMulti() {
  const ns = [...sel.noeuds]
  const cs = [...sel.coms].map(comPar)
  const titre = [ns.length ? pluriel(ns.length, 'nœud') : '', cs.length ? pluriel(cs.length, 'commentaire') : ''].filter(Boolean).join(', ')
  return entete('#52525b', '⧉', 'Sélection multiple', titre)
    + '<div class="d-defil">'
    + (ns.length ? section('Nœuds', ns.map((id) => lienNoeud(id)).join(''), ns.length) : '')
    + (cs.length ? section('Commentaires', cs.map((c) => `<button class="d-lien" data-com="${c.id}"><i class="carre" style="--tc:${c.couleur}"></i><span>${esc(c.titre)}</span></button>`).join(''), cs.length) : '')
    + '<div class="d-actions"><button class="d-bouton" data-a="commentaire">Catégorie autour<kbd>C</kbd></button><button class="d-bouton" data-a="cadrer">Cadrer<kbd>F</kbd></button><button class="d-bouton" data-a="dupliquer">Dupliquer</button><button class="d-bouton danger" data-a="supprimer">Supprimer</button></div>'
    + '</div>'
}

function objetPanneau() {
  const [t, id] = cleSelection().split(':')
  if (t === 'n') return noeudPar(id)
  if (t === 'd') return demoPar(id)
  if (t === 'k') return comPar(id)
  if (t === 'vide') return etat
  return null
}

panneau.addEventListener('input', (e) => {
  const f = e.target.dataset.f
  const o = objetPanneau()
  if (!f || !o) return
  if (e.target.type === 'checkbox') o[f] = e.target.checked
  else if (f === 'confiance') {
    o.confiance = Number(e.target.value)
    e.target.classList.remove('vide')
    e.target.nextElementSibling.textContent = fmtConf(o.confiance)
  } else o[f] = e.target.value
  if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') {
    rendre('force')
    valider()
    return
  }
  rendre(false)
  const titre = $('.d-titre', panneau)
  if (titre && ['nom', 'nom_demonstration', 'titre'].includes(f)) titre.textContent = e.target.value || '(sans nom)'
})

panneau.addEventListener('change', (e) => {
  if (!e.target.dataset.f || e.target.type === 'checkbox' || e.target.tagName === 'SELECT') return
  if (e.target.type === 'range') rendrePanneau(true)
  valider()
})

panneau.addEventListener('click', (e) => {
  const b = e.target.closest('button')
  if (!b) return
  const o = objetPanneau()
  const ds = b.dataset
  if (ds.demo) { choisirDemo(ds.demo); return }
  if (ds.noeud) { choisirNoeud(ds.noeud, true); return }
  if (ds.com) { viderSel(); sel.coms.add(ds.com); majSelection(); cadrer(); return }
  if (ds.statut) {
    viderSel()
    for (const n of etat.noeuds) if (statuts[n.id] === ds.statut) sel.noeuds.add(n.id)
    majSelection()
    return
  }
  if (ds.validite && o) { o.validite = ds.validite; rendre('force'); valider(); return }
  if (ds.couleur && o) { o.couleur = ds.couleur; rendre('force'); valider(); return }
  if (ds.retirer && o) { o.justifie_par.splice(Number(ds.retirer), 1); aVerifier(o); rendre('force'); valider(); return }
  const a = ds.a
  if (a === 'sans-confiance' && o) { o.confiance = null; rendre('force'); valider() }
  if (a === 'nouvelle-demo' && o) { const d = nouvelleDemo(o.id, []); etat.demonstrations.push(d); viderSel(); sel.demo = d.id; rendre(); valider() }
  if (a === 'supprimer') supprimer()
  if (a === 'dupliquer') dupliquer()
  if (a === 'commentaire') creerCommentaire()
  if (a === 'cadrer') cadrer()
})

// ─── Démarrage ───────────────────────────────────────────────────────────────────────────────────────

// Mesure les nœuds rendus, puis pose tout le graphe de gauche (faits) à droite (conclusion).
function disposerTout() {
  rendre()
  const tailles = Object.fromEntries([...geo].map(([id, g]) => [id, { h: g.h }]))
  const { pos, boites } = disposer(etat, tailles)
  for (const n of etat.noeuds) Object.assign(n, pos[n.id] ?? {})
  for (const c of etat.commentaires) {
    Object.assign(c, boites[c.id] ?? {})
    if (!c.l) Object.assign(c, { l: 416, h: 256 })
    delete c.membres
  }
  delete etat.aDisposer
  rendre()
}

// Les hauteurs des nœuds dépendent de la police : on attend qu'elle soit chargée (au plus 1,5 s).
await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))])
appliquerVue()
if (etat.aDisposer) disposerTout()
else rendre()
valider()
if (!sauve?.vue) cadrer(true, false)
document.fonts.addEventListener?.('loadingdone', () => { mesurer(); tracerFils() })
