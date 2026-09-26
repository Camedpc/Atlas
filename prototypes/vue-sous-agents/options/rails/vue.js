// Rails : un plan de métro vivant, façon `git log --graph`. Le temps s'écoule vers le bas, le présent
// est en bas. Chaque agent est un rail vertical coloré de son rôle : il bifurque depuis le rail de son
// parent au lancement et s'y rabat à la fin (le résultat remonte). À droite, le fil des événements est
// aligné sur le même axe temporel.

import { simulationDepuisUrl, ROLES, ETATS, estFini, estVivant, formatTemps, formatTokens, QUESTION } from '../../commun/simulation.js'
import { monterBarre } from '../../commun/barre.js'

const sim = simulationDepuisUrl()
monterBarre(sim, { titre: 'Rails', sousTitre: 'plan de métro des sous-agents' })

// ─── Constantes ──────────────────────────────────────────────────────────────────────────────────────

const GOUTTIERE = 66 // largeur de l'axe du temps, à gauche
const ESP = 24 // écart maximal entre deux colonnes de rails
const ESP_MIN = 11 // écart minimal quand la largeur manque
const ESP_ETIQUETTE = 20 // écart en dessous duquel les étiquettes verticales longues sont masquées
const MARGE_FIL = 44 // entre la dernière colonne et le fil
const HAUT = 92 // marge au-dessus de t = 0 (question)
const BAS = 118 // marge sous le présent
const LIGNE = 19 // hauteur d'une ligne du fil
const MARGE_COLONNE = 5 // secondes avant qu'une colonne libérée soit réutilisée
const ECHELLE_MIN = 1.5
const ECHELLE_MAX = 90
const PAS_GRILLE = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

// Priorité d'un événement dans le fil : quand les lignes se bousculent, les moins importantes cèdent.
const DERIVE = [LIGNE * 0.9, LIGNE * 2.5, LIGNE * 6, Infinity]
function priorite(e) {
  if (e.type === 'termine' || e.type === 'echec') return 3
  if (e.type === 'lance') return 2
  if (e.type === 'demarre' || e.etat === 'attend') return 1
  return 0
}

// Opacité d'un rail selon l'état de son agent : ce qui travaille en ce moment passe devant.
const OPA = { reflechit: 1, outil: 1, attend: 0.8, en_file: 0.72, termine: 0.4, echec: 0.62 }
const ORDRE = { termine: 0, echec: 1, en_file: 2, attend: 3, outil: 4, reflechit: 5 }

const C = {
  fond: '#0e0f12', fond3: '#1c1f26', trait: '#2a2e37',
  texte: '#e8e6e1', texte2: '#a3a39e', texte3: '#6d6e6c', eteint: '#5d5e5b',
  accent: '#f0a44b', echec: '#ef5b5b', ok: '#8fd16a',
}
const MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Code', Consolas, monospace"
const SANS = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"

// ─── Utilitaires ─────────────────────────────────────────────────────────────────────────────────────

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const clamp01 = (v) => clamp(v, 0, 1)
const tronquer = (s, n) => (s.length <= n ? s : n <= 1 ? '' : s.slice(0, n - 1) + '…')

const cacheRgb = new Map()
function rgba(hex, a) {
  let rgb = cacheRgb.get(hex)
  if (!rgb) {
    const n = parseInt(hex.slice(1), 16)
    rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
    cacheRgb.set(hex, rgb)
  }
  return `rgba(${rgb},${a})`
}

// ─── DOM ─────────────────────────────────────────────────────────────────────────────────────────────

const scene = document.querySelector('.scene')
const canvas = document.querySelector('canvas.rails')
const ctx = canvas.getContext('2d')
const defil = document.querySelector('.defil')
const plan = document.querySelector('.plan')
const boutonDirect = document.querySelector('.direct')
const infoEchelle = document.querySelector('[data-echelle]')
const insp = document.querySelector('.inspecteur')
const champs = Object.fromEntries([...insp.querySelectorAll('[data-i]')].map((el) => [el.dataset.i, el]))

document.querySelector('.legende .roles').innerHTML = Object.values(ROLES)
  .map((r) => `<span><i class="pastille" style="background:${r.couleur}"></i>${r.court}</span>`)
  .join('')

// ─── État de la vue ──────────────────────────────────────────────────────────────────────────────────

let echelle = 16 // pixels par seconde simulée
let suivre = true // défilement automatique vers le direct
let dernierGeste = 0
let souris = null
let survol = null // id de l'agent survolé (rail ou ligne du fil)
let survolLigne = null
let selection = null
let agentsRef = null
let colonnes = [] // dernier occupant de chaque colonne
let place = new Map() // id → { col, label }
let nPlaces = 0
let compteRole = {}
let mise = null // mise en page du fil
let apparition = new WeakMap() // événement → instant (réel) de son apparition dans le fil
let colsAff = 1
let esp = ESP // écart courant (animé)
let feedX = GOUTTIERE + ESP + MARGE_FIL
let larg = 0
let hautVue = 0
let dpr = 1
let hautPlan = 0
let journalRendu = 0
let derniereMajInsp = 0
let familleCle = ''
let horloge = 0

function reinitialiser() {
  agentsRef = sim.agents
  colonnes = []
  place = new Map()
  nPlaces = 0
  compteRole = {}
  mise = null
  apparition = new WeakMap()
  survol = null
  survolLigne = null
  suivre = true
  colsAff = 1
  esp = ESP
  fermerInspecteur()
}

// ─── Géométrie ───────────────────────────────────────────────────────────────────────────────────────

const yT = (t) => HAUT + t * echelle
const xCol = (c) => GOUTTIERE + c * esp + esp / 2
// Durée (simulée) d'une bifurcation ou d'une fusion : la courbe garde une hauteur lisible quelle que soit l'échelle.
const dureeCourbe = () => clamp(26 / echelle, 0.6, 4)

// Attribue une colonne à chaque nouvel agent, dans l'ordre de lancement : la colonne libre la plus
// proche de celle du parent (à droite de préférence), sinon une nouvelle.
function placer() {
  const ordre = sim.ordre
  for (; nPlaces < ordre.length; nPlaces++) {
    const a = sim.get(ordre[nPlaces])
    const n = (compteRole[a.role] = (compteRole[a.role] || 0) + 1)
    const label = a.role === 'orchestrateur' ? 'Orch.' : `${ROLES[a.role].court}${n}`
    let col = 0
    const pp = a.parentId ? place.get(a.parentId) : null
    if (pp) {
      col = -1
      let meilleur = Infinity
      for (let c = 1; c < colonnes.length; c++) {
        if (c === pp.col) continue
        const o = colonnes[c]
        if (o && (o.fin == null || a.creeA < o.fin + MARGE_COLONNE)) continue
        const d = Math.abs(c - pp.col) + (c < pp.col ? 0.5 : 0)
        if (d < meilleur) { meilleur = d; col = c }
      }
      if (col < 0) col = colonnes.length
    }
    colonnes[col] = a
    place.set(a.id, { col, label, phase: n * 1.7 + col })
  }
}

// Mise en page incrémentale du fil : chaque ligne à la hauteur de son instant, poussée vers le bas si
// la place est prise ; une ligne peu importante qui dériverait trop est omise (elle revient en zoomant).
function miseEnPage() {
  if (!mise || mise.echelle !== echelle) mise = { echelle, n: 0, lignes: [], bas: -1e9 }
  const evts = sim.evenements
  const lot = evts.length - mise.n
  const maintenant = performance.now()
  for (; mise.n < evts.length; mise.n++) {
    const e = evts[mise.n]
    const ideal = yT(e.t)
    const y = Math.max(ideal, mise.bas + LIGNE)
    if (y - ideal > DERIVE[priorite(e)]) continue
    mise.lignes.push({ e, y, ideal })
    mise.bas = y
    if (!apparition.has(e)) apparition.set(e, lot > 40 ? 0 : maintenant)
  }
}

function hauteurContenu() {
  miseEnPage()
  const H = Math.ceil(Math.max(yT(sim.temps) + BAS, mise.bas + BAS * 0.6, hautVue))
  if (H !== hautPlan) {
    hautPlan = H
    plan.style.height = `${H}px`
  }
  return H
}

function dimensionner() {
  const w = defil.clientWidth
  const h = defil.clientHeight
  const r = window.devicePixelRatio || 1
  if (w === larg && h === hautVue && r === dpr) return
  larg = w
  hautVue = h
  dpr = r
  canvas.width = Math.round(w * r)
  canvas.height = Math.round(h * r)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
}

// ─── Primitives de dessin ────────────────────────────────────────────────────────────────────────────

function ligne(x0, y0, x1, y1) {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

function disque(x, y, r, couleur) {
  ctx.fillStyle = couleur
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function anneau(x, y, r, couleur, epaisseur = 1.5, fond = C.fond) {
  ctx.fillStyle = fond
  ctx.strokeStyle = couleur
  ctx.lineWidth = epaisseur
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

// Courbe en S de (x0, y0) à (x1, y1), tracée jusqu'à la fraction u ; renvoie la pointe.
function courbe(x0, y0, x1, y1, u, couleur, epaisseur, tirets = null) {
  if (u <= 0) return null
  const dy = y1 - y0
  const bx = [x0, x0, x1, x1]
  const by = [y0, y0 + dy * 0.62, y1 - dy * 0.62, y1]
  const point = (s) => {
    const m = 1 - s
    const a = m * m * m
    const b = 3 * m * m * s
    const c = 3 * m * s * s
    const d = s * s * s
    return { x: a * bx[0] + b * bx[1] + c * bx[2] + d * bx[3], y: a * by[0] + b * by[1] + c * by[2] + d * by[3] }
  }
  ctx.strokeStyle = couleur
  ctx.lineWidth = epaisseur
  ctx.lineCap = 'round'
  ctx.setLineDash(tirets || [])
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  let p = { x: x0, y: y0 }
  const n = 22
  for (let k = 1; k <= n; k++) {
    p = point((u * k) / n)
    ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.lineCap = 'butt'
  return p
}

// Un tronçon de rail dans un état donné. Traverses et tirets sont ancrés sur l'axe du contenu pour ne
// pas glisser pendant le défilement.
function troncon(etat, x, y0, y1, couleur) {
  ctx.strokeStyle = couleur
  ctx.setLineDash([])
  ctx.lineCap = 'butt'
  if (etat === 'reflechit') {
    ctx.lineWidth = 5
    ligne(x, y0, x, y1)
  } else if (etat === 'outil') {
    ctx.lineWidth = 2.5
    ligne(x, y0, x, y1)
    ctx.lineWidth = 1.4
    ctx.beginPath()
    for (let y = Math.ceil(y0 / 7) * 7; y <= y1; y += 7) {
      ctx.moveTo(x - 4.5, y)
      ctx.lineTo(x + 4.5, y)
    }
    ctx.stroke()
  } else if (etat === 'attend') {
    ctx.lineWidth = 1.25
    ligne(x, y0, x, y1)
  } else {
    ctx.lineWidth = 1.5
    ctx.setLineDash([2, 5])
    ctx.lineDashOffset = y0 % 7
    ligne(x, y0, x, y1)
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
  }
}

function croix(x, y, r, couleur) {
  ctx.strokeStyle = couleur
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - r, y - r)
  ctx.lineTo(x + r, y + r)
  ctx.moveTo(x + r, y - r)
  ctx.lineTo(x - r, y + r)
  ctx.stroke()
  ctx.lineCap = 'butt'
}

function halo(x, y, r, couleur, intensite) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(couleur, intensite))
  g.addColorStop(1, rgba(couleur, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

// ─── Dessin d'un agent ───────────────────────────────────────────────────────────────────────────────

function focus() {
  return survol
}

function opaciteAgent(a) {
  const f = focus()
  if (f === a.id) return 1
  const base = OPA[a.etat]
  return f ? base * 0.28 : base
}

function geometrie(a) {
  const p = place.get(a.id)
  const parent = a.parentId ? sim.get(a.parentId) : null
  const pp = parent ? place.get(parent.id) : null
  const Tc = dureeCourbe()
  const tFin = a.fin ?? sim.temps
  return {
    p, parent, Tc, tFin,
    x: xCol(p.col),
    xp: pp ? xCol(pp.col) : xCol(p.col),
    tRail: pp ? Math.min(a.creeA + Tc, tFin) : a.creeA,
  }
}

function dessinerAgent(a, v, pouls) {
  const g = geometrie(a)
  const { parent, Tc, tFin, x, xp, tRail } = g
  const now = sim.temps
  const coul = ROLES[a.role].couleur
  const yHaut = yT(a.creeA)
  const yBas = yT(a.fin != null ? a.fin + Tc : now) + 20
  if (yBas < v.haut - 30 || yHaut > v.bas + 30) return
  const opa = opaciteAgent(a)
  const echec = a.etat === 'echec'
  ctx.globalAlpha = opa

  // Surbrillance du rail survolé ou inspecté
  if (survol === a.id || selection === a.id) {
    ctx.strokeStyle = rgba(coul, selection === a.id ? 0.16 : 0.11)
    ctx.lineWidth = 16
    ctx.lineCap = 'round'
    ligne(x, Math.max(yT(tRail), v.haut - 20), x, Math.min(yT(tFin), v.bas + 20))
    ctx.lineCap = 'butt'
  }

  // Bifurcation depuis le parent : la courbe pousse au rythme du temps simulé
  if (parent) {
    const u = clamp01((now - a.creeA) / Tc)
    disque(xp, yHaut, 2.6, coul)
    const pointe = courbe(xp, yHaut, x, yT(a.creeA + Tc), u, coul, 2)
    if (pointe && u < 1) { halo(pointe.x, pointe.y, 9, coul, 0.5); disque(pointe.x, pointe.y, 2.4, C.texte) }
  }

  // Tronçons d'état
  const pts = a.journal.filter((e) => e.type === 'lance' || e.type === 'etat')
  for (let i = 0; i < pts.length; i++) {
    const t0 = Math.max(pts[i].t, tRail)
    const t1 = i + 1 < pts.length ? pts[i + 1].t : tFin
    if (t1 <= t0) continue
    const y0 = Math.max(yT(t0), v.haut - 12)
    const y1 = Math.min(yT(t1), v.bas + 12)
    if (y1 <= y0) continue
    troncon(pts[i].etat, x, y0, y1, coul)
  }

  // Traîne lumineuse des agents qui travaillent
  const yN = yT(now)
  if (a.fin == null && estVivant(a) && now > tRail) {
    const yT0 = Math.max(yT(tRail), yN - 80)
    const grad = ctx.createLinearGradient(0, yT0, 0, yN)
    grad.addColorStop(0, rgba(coul, 0))
    grad.addColorStop(1, rgba(coul, 0.38))
    ctx.strokeStyle = grad
    ctx.lineWidth = 12
    ligne(x, yT0, x, yN)
  }

  // Stations : un changement d'état
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].etat === pts[i - 1].etat || pts[i].t < tRail) continue
    const y = yT(pts[i].t)
    if (y < v.haut - 6 || y > v.bas + 6) continue
    anneau(x, y, 3.2, coul, 1.5)
  }

  // Départ de la racine : un terminus
  if (!parent) {
    anneau(x, yHaut, 6.5, coul, 2)
    disque(x, yHaut, 2.4, coul)
  }

  if (a.fin != null) {
    const yf = yT(a.fin)
    if (parent) {
      // Fusion : la courbe rejoint le parent, puis une station ronde s'y pose
      const u = clamp01((now - a.fin) / Tc)
      const coulF = echec ? C.echec : coul
      const pointe = courbe(x, yf, xp, yT(a.fin + Tc), u, rgba(coulF, echec ? 0.8 : 1), 2, echec ? [3, 3] : null)
      if (pointe && u < 1) {
        halo(pointe.x, pointe.y, 10, coulF, 0.6)
        disque(pointe.x, pointe.y, 2.6, C.texte)
      } else if (u >= 1) {
        const age = now - a.fin - Tc
        const f = focus()
        ctx.globalAlpha = f && f !== a.id && f !== a.parentId ? 0.3 : 0.95
        const r = 4.4 * (1 + 0.8 * Math.exp(-age * 1.6))
        if (age < 2) halo(xp, yT(a.fin + Tc), 16, coulF, 0.45 * Math.exp(-age * 1.5))
        anneau(xp, yT(a.fin + Tc), r, coulF, 2)
        disque(xp, yT(a.fin + Tc), 1.7, coulF)
        ctx.globalAlpha = opa
      }
    }
    if (echec) {
      ctx.globalAlpha = Math.max(opa, focus() ? opa : 0.95)
      const age = now - a.fin
      halo(x, yf, 22, C.echec, 0.25 + 0.4 * Math.exp(-age * 0.5))
      croix(x, yf, 4.5, C.echec)
      ctx.globalAlpha = opa
    } else if (!parent) {
      anneau(x, yf, 7, coul, 2)
      anneau(x, yf, 3.5, coul, 1.5, coul)
    } else {
      disque(x, yf, 2.4, coul)
    }
  } else if (now >= tRail) {
    tete(a, x, yN, coul, pouls, g.p)
  }
  ctx.globalAlpha = 1
}

function tete(a, x, y, coul, pouls, p) {
  if (estVivant(a)) {
    const s = Math.sin(pouls * 3.2 + p.phase)
    halo(x, y, 15 + 4 * s, coul, 0.42 + 0.12 * s)
    disque(x, y, 5.2, coul)
    disque(x, y, 2, 'rgba(255,255,255,0.9)')
  } else if (a.etat === 'attend') {
    const s = 0.5 + 0.5 * Math.sin(pouls * 1.4 + p.phase)
    anneau(x, y, 4.2, rgba(coul, 0.55 + 0.35 * s), 1.5)
  } else if (a.etat === 'en_file') {
    ctx.strokeStyle = rgba(coul, 0.8)
    ctx.lineWidth = 1.3
    ctx.setLineDash([2, 2.5])
    ctx.lineDashOffset = -pouls * 4
    ctx.fillStyle = C.fond
    ctx.beginPath()
    ctx.arc(x, y, 4.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
    const rang = sim.file.indexOf(a)
    if (rang >= 0) {
      ctx.font = `9.5px ${MONO}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = C.texte3
      ctx.fillText(`#${rang + 1}`, x, y + 9)
      ctx.textAlign = 'left'
    }
  }
}

// Une étiquette longue n'a la place que si l'écart est suffisant et qu'aucun rail de la colonne voisine
// de droite (ni le fil) n'occupe la même tranche de temps.
function aDeLaPlace(a, g, y0, y1) {
  if (esp < ESP_ETIQUETTE) return false
  const col = g.p.col + 1
  if (col >= colonnes.length) return true
  for (const b of sim.agents.values()) {
    const pb = place.get(b.id)
    if (!pb || pb.col !== col) continue
    const yb0 = yT(b.creeA)
    const yb1 = yT((b.fin ?? sim.temps) + dureeCourbe())
    if (yb0 < y1 && yb1 > y0) return false
  }
  return true
}

// Étiquette verticale le long du rail, collée en haut de l'écran tant que le rail continue au-dessus.
function etiquette(a, v, cw) {
  const g = geometrie(a)
  const debut = yT(g.tRail) + 10
  const fin = a.fin != null ? yT(a.fin) - 8 : yT(sim.temps) - 20
  const y0 = Math.max(debut, v.haut + 10)
  const dispo = Math.min(fin, v.bas) - y0
  if (dispo < 36) return
  const n = Math.floor(dispo / cw)
  const lab = `${g.p.label} `
  const texte = aDeLaPlace(a, g, y0, Math.min(fin, v.bas)) ? tronquer(`${lab}${a.titre}`, n) : tronquer(g.p.label, n)
  ctx.save()
  ctx.globalAlpha = focus() ? opaciteAgent(a) : Math.max(0.35, opaciteAgent(a))
  ctx.translate(g.x + 7, y0)
  ctx.rotate(Math.PI / 2)
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = ROLES[a.role].couleur
  ctx.fillText(texte.slice(0, lab.length), 0, 0)
  ctx.fillStyle = estVivant(a) ? C.texte2 : C.texte3
  ctx.fillText(texte.slice(lab.length), lab.length * cw, 0)
  ctx.restore()
}

// ─── Fil des événements ──────────────────────────────────────────────────────────────────────────────

function texteEvt(e) {
  const a = e.agent
  switch (e.type) {
    case 'lance': return `↳ lancé · ${a.titre}`
    case 'demarre': return `▸ ${e.texte}`
    case 'termine': return `✓ ${a.resultat ?? e.texte}`
    case 'echec': return `✕ ${a.resultat ?? e.texte}`
    default:
      if (e.etat === 'outil') return `› ${e.texte}`
      if (e.etat === 'attend') return `⋯ ${e.texte}`
      return `∴ ${e.texte}`
  }
}

function premiereLigne(lignes, y) {
  let lo = 0
  let hi = lignes.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (lignes[m].y < y) lo = m + 1
    else hi = m
  }
  return lo
}

function dessinerFil(v, cw, maintenant) {
  const lignes = mise.lignes
  const x0 = feedX
  const droite = selection ? 392 : 16
  const maxCar = Math.floor((larg - x0 - droite) / cw)
  if (maxCar < 16) return
  const f = focus()
  ctx.font = `11.5px ${MONO}`
  ctx.textBaseline = 'middle'
  for (let i = premiereLigne(lignes, v.haut - LIGNE); i < lignes.length; i++) {
    const { e, y, ideal } = lignes[i]
    if (y > v.bas + LIGNE) break
    const a = e.agent
    const p = place.get(a.id)
    if (!p) continue
    const coul = ROLES[a.role].couleur
    const ap = apparition.get(e) || 0
    const k = ap ? clamp01((maintenant - ap) / 380) : 1
    const dx = (1 - k) * (1 - k) * 12
    let alpha = k
    if (f && f !== a.id) alpha *= 0.25
    ctx.globalAlpha = alpha

    if (f === a.id) {
      ctx.fillStyle = rgba(coul, 0.09)
      ctx.fillRect(x0 - 8, y - LIGNE / 2 + 1, larg - x0 - droite + 8, LIGNE - 2)
    }

    // Connecteur : l'instant réel (point) relié à la ligne, même si elle a été poussée plus bas
    ctx.strokeStyle = rgba(coul, 0.4)
    ctx.lineWidth = 1
    ligne(x0 - 22, ideal, x0 - 9, y)
    disque(x0 - 22, ideal, 1.6, rgba(coul, 0.7))
    if (survolLigne && survolLigne.e === e) {
      ctx.strokeStyle = rgba(coul, 0.7)
      ctx.setLineDash([2, 3])
      ligne(xCol(p.col), ideal, x0 - 22, ideal)
      ctx.setLineDash([])
      anneau(xCol(p.col), ideal, 5, coul, 2)
    }

    let xx = x0 + dx
    ctx.fillStyle = C.texte3
    ctx.fillText(formatTemps(e.t), xx, y)
    xx += 6 * cw
    disque(xx + 3, y, 3.2, coul)
    xx += 2 * cw
    ctx.fillStyle = coul
    ctx.fillText(p.label, xx, y)
    xx += 8 * cw
    const vivant = estVivant(a)
    ctx.fillStyle = e.type === 'echec' ? C.echec
      : e.type === 'termine' ? (vivant ? C.texte : C.texte2)
        : vivant || f === a.id ? C.texte : C.eteint
    ctx.fillText(tronquer(texteEvt(e), maxCar - 16), xx, y)
  }
  ctx.globalAlpha = 1
}

// ─── Survol ──────────────────────────────────────────────────────────────────────────────────────────

function railSous(mx, yc) {
  let meilleur = null
  let dmin = esp / 2
  for (const a of sim.agents.values()) {
    const p = place.get(a.id)
    if (!p) continue
    const d = Math.abs(mx - xCol(p.col))
    if (d > dmin) continue
    if (yc < yT(a.creeA) - 4 || yc > yT(a.fin ?? sim.temps) + 6) continue
    dmin = d
    meilleur = a
  }
  return meilleur
}

function majSurvol() {
  survol = null
  survolLigne = null
  if (!souris) { defil.style.cursor = ''; return }
  const yc = defil.scrollTop + souris.y
  if (souris.x >= feedX - 26) {
    const lignes = mise.lignes
    const i = premiereLigne(lignes, yc - LIGNE / 2)
    const l = lignes[i]
    if (l && Math.abs(l.y - yc) <= LIGNE / 2 && place.has(l.e.agent.id)) {
      survolLigne = l
      survol = l.e.agent.id
    }
  } else {
    const a = railSous(souris.x, yc)
    if (a) survol = a.id
  }
  defil.style.cursor = survol ? 'pointer' : ''
}

// ─── Rendu ───────────────────────────────────────────────────────────────────────────────────────────

function rendu(s, dt) {
  if (sim.agents !== agentsRef) reinitialiser()
  horloge += dt
  placer()
  dimensionner()
  const maintenant = performance.now()

  // Le fil commence après la dernière colonne utilisée ; si la largeur manque, les colonnes se resserrent
  // (le fil garde au moins 55 % de la largeur). Transition douce, mais jamais de chevauchement.
  const n = Math.max(1, colonnes.length)
  const espCible = clamp((larg * 0.45 - GOUTTIERE - MARGE_FIL) / n, ESP_MIN, ESP)
  const k = Math.min(1, dt * 6)
  esp += (espCible - esp) * k
  colsAff += (n - colsAff) * k
  feedX = Math.max(GOUTTIERE + colsAff * esp + MARGE_FIL, GOUTTIERE + n * esp + 22)

  const H = hauteurContenu()
  if (suivre) {
    const cible = Math.max(0, H - hautVue)
    const st = defil.scrollTop
    const ecart = cible - st
    if (Math.abs(ecart) > 0.5) defil.scrollTop = Math.abs(ecart) < 3 ? cible : st + ecart * Math.min(1, dt * 9)
  }
  boutonDirect.classList.toggle('visible', !suivre)
  majSurvol()

  const haut = defil.scrollTop
  const v = { haut, bas: haut + hautVue }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, larg, hautVue)
  ctx.setTransform(dpr, 0, 0, dpr, 0, -haut * dpr)

  ctx.font = `10px ${MONO}`
  const cwPetit = ctx.measureText('0').width || 6
  ctx.font = `11.5px ${MONO}`
  const cw = ctx.measureText('0').width || 7

  dessinerGrille(v)
  dessinerEntete(v)
  dessinerPresent(v)

  // Rails : les terminés d'abord, ceux qui travaillent au-dessus, le survol tout en haut
  const agents = sim.liste().filter((a) => place.has(a.id))
  agents.sort((p, q) => rang(p) - rang(q))
  for (const a of agents) dessinerAgent(a, v, horloge)
  ctx.font = `10px ${MONO}`
  for (const a of agents) etiquette(a, v, cwPetit)

  dessinerFil(v, cw, maintenant)
  dessinerPastilleDirect(v)

  if (maintenant - derniereMajInsp > 150) {
    derniereMajInsp = maintenant
    majInspecteur()
  }
}

function rang(a) {
  if (a.id === survol) return 10
  if (a.id === selection) return 9
  return ORDRE[a.etat]
}

function dessinerGrille(v) {
  const pas = PAS_GRILLE.find((p) => p * echelle >= 56) ?? 600
  const t0 = Math.max(0, Math.floor((v.haut - HAUT) / echelle / pas) * pas)
  const t1 = Math.min(sim.temps, (v.bas - HAUT) / echelle)
  ctx.font = `10px ${MONO}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 1
  for (let t = t0; t <= t1; t += pas) {
    const y = Math.round(yT(t)) + 0.5
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'
    ligne(GOUTTIERE - 6, y, larg, y)
    ctx.fillStyle = C.texte3
    ctx.fillText(formatTemps(t), GOUTTIERE - 12, y)
  }
  ctx.textAlign = 'left'
  // Filet de l'axe
  ctx.strokeStyle = C.trait
  ligne(GOUTTIERE - 0.5, Math.max(HAUT, v.haut), GOUTTIERE - 0.5, Math.min(yT(sim.temps), v.bas))
}

let questionCache = { w: 0, texte: '' }
function dessinerEntete(v) {
  if (v.haut > HAUT) return
  const x = feedX
  const w = larg - x - (selection ? 392 : 16)
  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 10px ${SANS}`
  ctx.fillStyle = C.texte3
  ctx.fillText('QUESTION DE CAMILLE', x, 34)
  ctx.font = `500 14px ${SANS}`
  if (questionCache.w !== Math.round(w)) {
    let q = QUESTION
    while (q.length > 10 && ctx.measureText(q).width > w) q = q.slice(0, -2)
    questionCache = { w: Math.round(w), texte: q === QUESTION ? q : `${q}…` }
  }
  ctx.fillStyle = C.texte
  ctx.fillText(questionCache.texte, x, 56)
}

function dessinerPresent(v) {
  const y = yT(sim.temps)
  if (y < v.haut - 100 || y > v.bas + 10) return
  const g = ctx.createLinearGradient(0, y - 110, 0, y)
  g.addColorStop(0, 'rgba(240,164,75,0)')
  g.addColorStop(1, 'rgba(240,164,75,0.05)')
  ctx.fillStyle = g
  ctx.fillRect(GOUTTIERE, y - 110, larg - GOUTTIERE, 110)
  const gl = ctx.createLinearGradient(GOUTTIERE, 0, larg, 0)
  gl.addColorStop(0, 'rgba(240,164,75,0.55)')
  gl.addColorStop(1, 'rgba(240,164,75,0.04)')
  ctx.strokeStyle = gl
  ctx.lineWidth = 1
  ligne(GOUTTIERE, Math.round(y) + 0.5, larg, Math.round(y) + 0.5)
}

function dessinerPastilleDirect(v) {
  const y = yT(sim.temps)
  if (y < v.haut - 20 || y > v.bas + 20) return
  const s = 0.5 + 0.5 * Math.sin(horloge * 3)
  ctx.fillStyle = C.fond3
  ctx.strokeStyle = rgba(C.accent, 0.6)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(6, y - 9, GOUTTIERE - 12, 18, 9)
  ctx.fill()
  ctx.stroke()
  disque(15, y, 2.6, sim.fini ? C.ok : rgba(C.accent, sim.enPause ? 0.5 : 0.5 + 0.5 * s))
  ctx.font = `500 10px ${MONO}`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = C.texte
  ctx.fillText(formatTemps(sim.temps), 22, y + 0.5)
}

// ─── Inspecteur ──────────────────────────────────────────────────────────────────────────────────────

function ouvrir(id) {
  if (selection !== id) {
    selection = id
    journalRendu = 0
    familleCle = ''
    champs.journal.textContent = ''
  }
  insp.classList.add('ouvert')
  insp.setAttribute('aria-hidden', 'false')
  majInspecteur()
}

function fermerInspecteur() {
  selection = null
  insp.classList.remove('ouvert')
  insp.setAttribute('aria-hidden', 'true')
}

function couleurEtat(a) {
  if (estVivant(a)) return ROLES[a.role].couleur
  return { attend: C.texte2, en_file: C.texte3, termine: C.ok, echec: C.echec }[a.etat]
}

function duree(a) {
  const now = sim.temps
  if (a.debut == null) return `en file depuis ${formatTemps(now - a.creeA)}`
  let t = `${formatTemps((a.fin ?? now) - a.debut)} de travail`
  const file = a.debut - a.creeA
  if (file >= 1) t += ` · ${formatTemps(file)} en file`
  if (estFini(a)) t += ` · fini à T+${formatTemps(a.fin)}`
  return t
}

function puce(a) {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'puce'
  b.dataset.id = a.id
  b.innerHTML = `<i style="background:${ROLES[a.role].couleur}"></i>`
  b.append(place.get(a.id)?.label ?? a.id)
  return b
}

function majInspecteur() {
  if (!selection) return
  const a = sim.get(selection)
  if (!a) { fermerInspecteur(); return }
  const r = ROLES[a.role]
  insp.style.setProperty('--c', r.couleur)
  champs.role.textContent = r.libelle
  champs.id.textContent = `${place.get(a.id)?.label ?? ''} · ${a.id}`
  champs.titre.textContent = a.titre
  champs.activite.textContent = a.outilCourant && !estFini(a) ? `${a.outilCourant} · ${a.activite}` : a.activite
  champs.modele.textContent = a.modele
  champs.etat.innerHTML = `<i class="pastille" style="background:${couleurEtat(a)}"></i>${ETATS[a.etat].libelle}`
  champs.duree.textContent = duree(a)
  champs.tokens.textContent = formatTokens(a.tokens)
  champs.outils.textContent = String(a.nbOutils)
  champs.resultat.textContent = a.resultat ?? (estFini(a) ? '—' : 'en cours…')
  champs.resultat.className = estFini(a) ? a.etat : ''

  // Parent et sous-agents
  const cle = `${a.parentId}|${a.enfants.length}`
  if (cle !== familleCle) {
    familleCle = cle
    champs.famille.textContent = ''
    const parent = a.parentId ? sim.get(a.parentId) : null
    if (parent) {
      champs.famille.append(puce(parent), document.createTextNode(a.enfants.length ? ' → ' : ''))
    }
    for (const e of sim.enfants(a)) champs.famille.append(puce(e))
    if (!parent && !a.enfants.length) champs.famille.textContent = '—'
  }

  // Bande : l'histoire des états de l'agent, en miniature
  const pts = a.journal.filter((e) => e.type === 'lance' || e.type === 'etat')
  const fin = a.fin ?? sim.temps
  const total = Math.max(0.001, fin - a.creeA)
  champs.bande.innerHTML = pts.map((e, i) => {
    const t1 = i + 1 < pts.length ? pts[i + 1].t : fin
    const w = ((t1 - e.t) / total) * 100
    return w > 0 ? `<span class="b-${e.etat}" style="width:${w.toFixed(2)}%"></span>` : ''
  }).join('')

  // Journal horodaté
  const ol = champs.journal
  const auBas = ol.scrollHeight - ol.clientHeight - ol.scrollTop < 28
  for (; journalRendu < a.journal.length; journalRendu++) {
    const e = a.journal[journalRendu]
    const li = document.createElement('li')
    li.className = `j-${e.type} e-${e.etat}`
    const t = document.createElement('time')
    t.textContent = formatTemps(e.t)
    const span = document.createElement('span')
    span.textContent = e.texte
    li.append(t, span)
    ol.append(li)
  }
  if (auBas) ol.scrollTop = ol.scrollHeight
}

insp.querySelector('.fermer').addEventListener('click', fermerInspecteur)
champs.famille.addEventListener('click', (e) => {
  const b = e.target.closest('.puce')
  if (b) ouvrir(b.dataset.id)
})

// ─── Interactions ────────────────────────────────────────────────────────────────────────────────────

defil.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const rect = defil.getBoundingClientRect()
    const my = e.clientY - rect.top
    const tAncre = (defil.scrollTop + my - HAUT) / echelle
    echelle = clamp(echelle * Math.exp(-e.deltaY * 0.0018), ECHELLE_MIN, ECHELLE_MAX)
    infoEchelle.textContent = `${echelle < 10 ? echelle.toFixed(1) : Math.round(echelle)} px/s`
    hauteurContenu()
    if (!suivre) {
      dernierGeste = performance.now()
      defil.scrollTop = HAUT + tAncre * echelle - my
    }
    return
  }
  if (e.deltaY < 0) {
    suivre = false
    dernierGeste = performance.now()
  }
}, { passive: false })

defil.addEventListener('scroll', () => {
  const reste = defil.scrollHeight - defil.clientHeight - defil.scrollTop
  if (!suivre && reste < 3 && performance.now() - dernierGeste > 350) suivre = true
})

// Glisser la barre de défilement vers le haut quitte aussi le direct
defil.addEventListener('pointerdown', (e) => {
  if (e.offsetX > defil.clientWidth) { suivre = false; dernierGeste = performance.now() }
})

defil.addEventListener('mousemove', (e) => {
  const r = defil.getBoundingClientRect()
  souris = { x: e.clientX - r.left, y: e.clientY - r.top }
})
defil.addEventListener('mouseleave', () => { souris = null })
defil.addEventListener('click', () => {
  if (survol) ouvrir(survol)
  else fermerInspecteur()
})

boutonDirect.addEventListener('click', () => { suivre = true })

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fermerInspecteur()
  if (['PageUp', 'ArrowUp', 'Home'].includes(e.key)) { suivre = false; dernierGeste = performance.now() }
  if (e.key === 'End') suivre = true
})

sim.surEvenement((e) => {
  if (e.type === 'redemarrage') reinitialiser()
  if (e.type === 'echec') {
    scene.classList.remove('flash')
    void scene.offsetWidth
    scene.classList.add('flash')
  }
})

sim.surTic(rendu)
sim.demarrer()
