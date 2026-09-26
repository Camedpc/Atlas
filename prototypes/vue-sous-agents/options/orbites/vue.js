// Constellation : l'orchestrateur est un astre central, ses sous-agents orbitent autour de lui et
// portent eux-mêmes leurs satellites. Tout est redessiné à chaque image à partir de l'état de la
// simulation ; les transitions (comètes, retours, éclats, glissements) sont détectées par comparaison
// avec l'image précédente, ce qui rend la vue robuste aux sauts de +30 s et aux redémarrages.

import { simulationDepuisUrl, ROLES, ETATS, estFini, estVivant, formatTemps, formatTokens, QUESTION } from '../../commun/simulation.js'
import { monterBarre } from '../../commun/barre.js'

const sim = simulationDepuisUrl()
monterBarre(sim, { titre: 'Constellation', sousTitre: 'orbites des sous-agents' })

// ─── Constantes ──────────────────────────────────────────────────────────────────────────────────────

const INCL = 0.56 // aplatissement des orbites (vue inclinée)
const PARKING = 615 // rayon de l'orbite de parking (file d'attente)
const RAYONS_RACINE = [215, 365, 478]
const RAYONS_SAT = [44, 68, 90]
const DUREE_COMETE = 0.95
const DUREE_RETOUR = 1.05
const DUREE_GLISSE = 1.5
const DUREE_EXTINCTION = 2.6
const ECART_FILE = 0.075 // écart angulaire minimal entre deux agents en file

const GRIS = [86, 89, 95]
const ROUGE = [239, 91, 91]
const ROUGE_SOMBRE = [104, 32, 35]
const BLANC = [255, 250, 240]

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const RGB = Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, hexRgb(r.couleur)]))
const melange = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const rgba = (c, al) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, al))})`

const borne = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const lisse = (x) => x * x * (3 - 2 * x)
const entreeSortie = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const sortieDos = (x) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2) }
const diffAngle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
const tronquer = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)
const TAU = Math.PI * 2

function hachage(texte) {
  let h = 2166136261
  for (let i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967296
}

const rayonAnneau = (profParent, k) => (profParent === 0 ? RAYONS_RACINE[Math.min(k, 2)] + Math.max(0, k - 2) * 90 : RAYONS_SAT[Math.min(k, 2)] + Math.max(0, k - 2) * 20) * (profParent >= 2 ? 0.6 : 1)
const vitesseAnneau = (profParent, k) => TAU / (profParent === 0 ? 170 + 75 * k : 36 + 14 * k)

function rayonAstre(a) {
  const [base, k, max] = [[13, 0.2, 30], [5, 0.17, 19], [3.2, 0.12, 12]][Math.min(a.profondeur, 2)]
  return Math.min(max, base + Math.sqrt(a.tokens) * k)
}

// ─── DOM ─────────────────────────────────────────────────────────────────────────────────────────────

const scene = document.querySelector('.scene')
const canvas = scene.querySelector('canvas')
const ctx = canvas.getContext('2d')
const panneau = scene.querySelector('.inspecteur')

scene.querySelector('.question').innerHTML = '<small>Question de recherche</small>'
scene.querySelector('.question').append(QUESTION)

scene.querySelector('.legende-orbites').innerHTML = `
  <div class="ligne">
    <span><i class="glyphe actif"></i>travaille</span>
    <span><i class="glyphe attend"></i>attend ses satellites</span>
    <span><i class="glyphe file"></i>en file (orbite extérieure)</span>
    <span><i class="glyphe fini"></i>terminé</span>
    <span><i class="glyphe echec"></i>échec</span>
  </div>
  <div class="ligne">${Object.values(ROLES).map((r) => `<span><i class="glyphe role" style="background:${r.couleur}"></i>${r.libelle}</span>`).join('')}</div>
  <div class="ligne aide">glisser : déplacer · molette : zoom · clic : inspecter · double-clic : suivre un astre</div>
`

let W = 0
let H = 0
let dpr = 1
let ciel = null // champ d'étoiles pré-rendu

function redimensionner() {
  const r = scene.getBoundingClientRect()
  W = Math.max(1, r.width)
  H = Math.max(1, r.height)
  dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  ciel = dessinerCiel()
  if (!camera.initialisee) { cadrer(true); camera.initialisee = true }
}

function dessinerCiel() {
  const c = document.createElement('canvas')
  c.width = canvas.width
  c.height = canvas.height
  const g = c.getContext('2d')
  g.scale(dpr, dpr)
  let graine = 91
  const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647 }
  const n = Math.round((W * H) / 2300)
  for (let i = 0; i < n; i++) {
    const x = alea() * W
    const y = alea() * H
    const t = alea()
    const r = t < 0.94 ? 0.35 + alea() * 0.5 : 0.9 + alea() * 0.6
    const teinte = alea()
    const c2 = teinte < 0.15 ? [170, 190, 255] : teinte > 0.9 ? [255, 214, 170] : [230, 228, 222]
    g.fillStyle = rgba(c2, 0.12 + alea() * (t < 0.94 ? 0.35 : 0.55))
    g.beginPath()
    g.arc(x, y, r, 0, TAU)
    g.fill()
  }
  // Voile de vignettage
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.45)')
  g.fillStyle = v
  g.fillRect(0, 0, W, H)
  return c
}

// ─── Caméra ──────────────────────────────────────────────────────────────────────────────────────────

const camera = { x: 0, y: 0, z: 1, cx: 0, cy: 0, cz: 1, initialisee: false }
let suivi = null // id de l'astre suivi par la caméra

function zoomCadre() { return borne(Math.min(W / 1380, H / (2 * PARKING * INCL + 190)), 0.35, 2) }

function cadrer(immediat = false) {
  suivi = null
  camera.cx = 0
  camera.cy = 0
  camera.cz = zoomCadre()
  if (immediat) { camera.x = 0; camera.y = 0; camera.z = camera.cz }
}

const versEcranX = (x) => (x - camera.x) * camera.z + W / 2
const versEcranY = (y) => (y - camera.y) * camera.z + H / 2

function majCamera(dt) {
  if (suivi) {
    const v = vis.get(suivi)
    if (v) { camera.cx = v.x; camera.cy = v.y } else suivi = null
  }
  const k = 1 - Math.exp(-dt * 4.5)
  camera.x += (camera.cx - camera.x) * k
  camera.y += (camera.cy - camera.y) * k
  camera.z += (camera.cz - camera.z) * k
}

// ─── État visuel ─────────────────────────────────────────────────────────────────────────────────────

let vis = new Map() // id → visuel de l'astre
let effets = [] // comètes, retours, éclats
let racineConnue = null
let premiere = true
let horloge = 0 // secondes d'animation (figée en pause)
let selection = null
let survol = null

function reinitialiser() {
  vis = new Map()
  effets = []
  racineConnue = sim.racine
  survol = null
  if (selection) fermerInspecteur()
  if (suivi) cadrer()
}

sim.surEvenement((evt) => { if (evt.type === 'redemarrage') reinitialiser() })

function nouveauVisuel(a, anime) {
  return {
    id: a.id, a,
    etatPrec: a.etat,
    phase: null,
    glisseA: null,
    apparition: anime ? horloge + (a.parentId ? DUREE_COMETE : 0) : -99,
    finA: estFini(a) ? -99 : null,
    tokPrec: a.tokens, taux: 0, pouls: hachage(a.id) * TAU,
    r: rayonAstre(a),
    absorbeA: -99, absorbeCouleur: BLANC,
    x: 0, y: 0, ox: 0, oy: 0, phiFile: null, anc: 1,
    sx: 0, sy: 0, sr: 0, visible: false,
    orbite: null, anneaux: [],
  }
}

function synchroniser(dtAnim) {
  if (sim.racine !== racineConnue) reinitialiser()
  for (const a of sim.agents.values()) {
    let v = vis.get(a.id)
    if (!v) {
      v = nouveauVisuel(a, !premiere)
      vis.set(a.id, v)
      if (!premiere && a.parentId) {
        effets.push({ type: 'comete', de: a.parentId, vers: a.id, t0: horloge, duree: DUREE_COMETE, couleur: RGB[a.role], sens: hachage(a.id) < 0.5 ? -1 : 1 })
      }
    }
    if (v.etatPrec !== a.etat) {
      if (v.etatPrec === 'en_file') v.glisseA = horloge
      if (estFini(a) && v.finA === null) {
        v.finA = horloge
        const echec = a.etat === 'echec'
        if (echec) effets.push({ type: 'eclat', id: a.id, t0: horloge, duree: 0.9, eclats: Array.from({ length: 11 }, (_, i) => [i / 11 * TAU + hachage(a.id + i) * 0.5, 0.6 + hachage(i + a.id) * 0.8]) })
        if (a.parentId) {
          effets.push({
            type: 'retour', de: a.id, vers: a.parentId, t0: horloge + (echec ? 0.35 : 0.1), duree: DUREE_RETOUR,
            couleur: echec ? ROUGE : melange(RGB[a.role], BLANC, 0.35), sens: hachage(a.id + 'r') < 0.5 ? -1 : 1,
          })
        }
      }
      v.etatPrec = a.etat
    }
    // Débit de tokens ramené au temps simulé, lissé
    if (dtAnim > 0) {
      const debit = borne((a.tokens - v.tokPrec) / Math.max(1e-3, dtAnim * sim.vitesse), 0, 300)
      v.taux += (debit - v.taux) * (1 - Math.exp(-dtAnim * 3))
      const norme = borne(v.taux / 150)
      v.pouls += dtAnim * TAU * (0.35 + 1.5 * norme)
      v.r += (rayonAstre(a) - v.r) * (1 - Math.exp(-dtAnim * 4))
    }
    v.tokPrec = a.tokens
  }
  premiere = false
}

// ─── Placement ───────────────────────────────────────────────────────────────────────────────────────

function ancrage(a, v) {
  if (a.etat === 'en_file') return 0
  if (v.glisseA === null) return 1
  return borne((horloge - v.glisseA) / DUREE_GLISSE)
}

function positionner(v) {
  if (v.anc >= 1) { v.x = v.ox; v.y = v.oy; return }
  const phi = v.phiFile ?? Math.atan2(v.oy / INCL, v.ox)
  const px = PARKING * Math.cos(phi)
  const py = PARKING * Math.sin(phi) * INCL
  const e = entreeSortie(v.anc)
  // Trajectoire légèrement courbe : on remonte en spirale vers l'orbite
  const courbe = Math.sin(e * Math.PI) * 40
  const nx = -Math.sin(phi)
  const ny = Math.cos(phi) * INCL
  v.x = px + (v.ox - px) * e + nx * courbe
  v.y = py + (v.oy - py) * e + ny * courbe
}

function placer(dtAnim) {
  const racine = sim.racine
  const vr = vis.get(racine.id)
  vr.x = vr.y = vr.ox = vr.oy = 0
  vr.anc = 1
  vr.orbite = null
  const enFile = []
  const pile = [racine]
  while (pile.length) {
    const p = pile.shift()
    const vp = vis.get(p.id)
    vp.anneaux = []
    if (!p.enfants.length) continue
    const groupes = new Map()
    for (const id of p.enfants) {
      const e = sim.get(id)
      if (!groupes.has(e.role)) groupes.set(e.role, [])
      groupes.get(e.role).push(e)
    }
    let k = 0
    for (const [role, liste] of groupes) {
      const R = rayonAnneau(p.profondeur, k)
      const omega = vitesseAnneau(p.profondeur, k)
      const decalage = hachage(p.id + role) * TAU
      vp.anneaux.push({ R, role, actif: liste.some((e) => !estFini(e)), vivant: liste.some(estVivant) })
      liste.forEach((e, i) => {
        const v = vis.get(e.id)
        const cible = decalage + (i / liste.length) * TAU
        if (v.phase === null) v.phase = cible
        else v.phase += diffAngle(cible, v.phase) * (1 - Math.exp(-dtAnim * 1.2))
        const th = v.phase + omega * horloge
        v.ox = vp.x + R * Math.cos(th)
        v.oy = vp.y + R * Math.sin(th) * INCL
        v.orbite = { parent: vp, R, th }
        v.anc = ancrage(e, v)
        if (e.etat === 'en_file') enFile.push(v)
        else { positionner(v); pile.push(e) }
      })
      k++
    }
  }
  // Orbite de parking : chaque agent en file se range face à sa future place, sans chevauchement
  for (const v of enFile) v.phiFile = Math.atan2(v.oy / INCL, v.ox)
  enFile.sort((p, q) => p.phiFile - q.phiFile)
  for (let i = 1; i < enFile.length; i++) {
    if (enFile[i].phiFile - enFile[i - 1].phiFile < ECART_FILE) enFile[i].phiFile = enFile[i - 1].phiFile + ECART_FILE
  }
  for (const v of enFile) {
    const flotte = Math.sin(horloge * 1.3 + v.pouls) * 3
    v.x = (PARKING + flotte) * Math.cos(v.phiFile)
    v.y = (PARKING + flotte) * Math.sin(v.phiFile) * INCL
  }
}

// ─── Dessin ──────────────────────────────────────────────────────────────────────────────────────────

function dessiner() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  if (ciel) ctx.drawImage(ciel, 0, 0, W, H)
  const z = camera.z

  // Coordonnées écran de tous les astres
  for (const v of vis.values()) {
    v.visible = horloge >= v.apparition
    const s = v.visible ? sortieDos(borne((horloge - v.apparition) / 0.6)) : 0
    v.sx = versEcranX(v.x)
    v.sy = versEcranY(v.y)
    v.sr = v.a.etat === 'en_file' ? Math.max(3, 4 * z) * s : Math.max(2.2, v.r * z) * s
  }

  const racine = vis.get(sim.racine.id)
  const rx = racine.sx
  const ry = racine.sy

  // Nébuleuse douce autour de l'astre central
  const neb = ctx.createRadialGradient(rx, ry, 0, rx, ry, 520 * z)
  neb.addColorStop(0, 'rgba(236,230,214,0.055)')
  neb.addColorStop(0.5, 'rgba(240,164,75,0.018)')
  neb.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = neb
  ctx.fillRect(0, 0, W, H)

  // Orbite de parking
  ctx.save()
  ctx.setLineDash([2, 7])
  ctx.lineWidth = 1
  ctx.strokeStyle = sim.file.length ? 'rgba(232,230,225,0.2)' : 'rgba(232,230,225,0.08)'
  ctx.beginPath()
  ctx.ellipse(rx, ry, PARKING * z, PARKING * INCL * z, 0, 0, TAU)
  ctx.stroke()
  ctx.restore()
  etiquetteAnneau(rx, ry - PARKING * INCL * z - 8, sim.file.length ? `file d’attente · ${sim.file.length}` : 'file d’attente', 0.34)

  // Orbites tracées
  for (const v of vis.values()) {
    if (!v.visible || !v.anneaux.length) continue
    for (const an of v.anneaux) {
      const al = an.vivant ? 0.16 : an.actif ? 0.1 : 0.05
      ctx.strokeStyle = rgba(melange(RGB[an.role], GRIS, 0.35), al)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(v.sx, v.sy, an.R * z, an.R * INCL * z, 0, 0, TAU)
      ctx.stroke()
      if (v.a === sim.racine) etiquetteAnneau(v.sx - an.R * z, v.sy - 8, ROLES[an.role].libelle.toLowerCase(), an.actif ? 0.3 : 0.16)
    }
  }

  // Sillages des astres vivants le long de leur orbite
  for (const v of vis.values()) {
    if (!v.visible || !v.orbite || !estVivant(v.a) || v.anc < 1) continue
    const { parent, R, th } = v.orbite
    const c = RGB[v.a.role]
    const n = 14
    const longueur = Math.min(0.9, 70 / R)
    ctx.lineWidth = Math.max(1, Math.min(2.2, v.sr * 0.45))
    ctx.lineCap = 'round'
    for (let i = 0; i < n; i++) {
      const a0 = th - longueur * (1 - i / n)
      const a1 = th - longueur * (1 - (i + 1) / n)
      ctx.strokeStyle = rgba(c, 0.42 * ((i + 1) / n) ** 2)
      ctx.beginPath()
      ctx.moveTo(parent.sx + R * z * Math.cos(a0), parent.sy + R * INCL * z * Math.sin(a0))
      ctx.lineTo(parent.sx + R * z * Math.cos(a1), parent.sy + R * INCL * z * Math.sin(a1))
      ctx.stroke()
    }
  }

  // Filiation de l'astre sélectionné ou survolé
  for (const id of new Set([selection, survol])) {
    const v = id && vis.get(id)
    if (!v || !v.visible) continue
    ctx.save()
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1
    const p = v.a.parentId && vis.get(v.a.parentId)
    if (p) { ctx.strokeStyle = 'rgba(232,230,225,0.28)'; ligne(v.sx, v.sy, p.sx, p.sy) }
    for (const cid of v.a.enfants) {
      const e = vis.get(cid)
      if (e && e.visible) { ctx.strokeStyle = rgba(RGB[e.a.role], 0.22); ligne(v.sx, v.sy, e.sx, e.sy) }
    }
    ctx.restore()
  }

  // Astres, du plus lointain au plus proche
  const ordre = [...vis.values()].filter((v) => v.visible).sort((p, q) => p.y - q.y)
  for (const v of ordre) dessinerAstre(v)

  // Effets ponctuels
  effets = effets.filter((e) => dessinerEffet(e))

  // Réticule de sélection
  const vs = selection && vis.get(selection)
  if (vs && vs.visible) {
    const r = vs.sr + 7
    ctx.strokeStyle = 'rgba(245,242,235,0.85)'
    ctx.lineWidth = 1.3
    for (let i = 0; i < 4; i++) {
      const a = horloge * 0.6 + (i * TAU) / 4
      ctx.beginPath()
      ctx.arc(vs.sx, vs.sy, r, a, a + 0.75)
      ctx.stroke()
    }
  }

  // Étiquettes
  const etiquetes = ordre.filter((v) => estVivant(v.a) || v.a === sim.racine || v.id === survol || v.id === selection)
  for (const v of etiquetes) dessinerEtiquette(v)
}

function ligne(x1, y1, x2, y2) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function etiquetteAnneau(x, y, texte, alpha) {
  ctx.font = '500 9.5px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = `rgba(232,230,225,${alpha})`
  ctx.fillText(texte.toUpperCase(), x, y)
  ctx.textAlign = 'left'
}

function sphere(x, y, r, c, eclat = 1) {
  const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r)
  g.addColorStop(0, rgba(melange(c, BLANC, 0.55 * eclat), 1))
  g.addColorStop(0.45, rgba(c, 1))
  g.addColorStop(1, rgba(melange(c, [8, 9, 12], 0.55), 1))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
}

function halo(x, y, r, c, alpha) {
  if (alpha <= 0.005 || r <= 0) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(c, alpha))
  g.addColorStop(0.35, rgba(c, alpha * 0.45))
  g.addColorStop(1, rgba(c, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
}

function dessinerAstre(v) {
  const a = v.a
  const { sx: x, sy: y, sr: r } = v
  if (r <= 0.1) return
  const c = RGB[a.role]
  const estRacine = a === sim.racine
  const norme = borne(v.taux / 150)
  const selectionne = v.id === selection || v.id === survol

  if (a.etat === 'en_file') {
    const patience = 0.55 + 0.25 * Math.sin(horloge * 1.8 + v.pouls)
    ctx.fillStyle = 'rgba(14,15,18,0.9)'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
    ctx.lineWidth = 1.3
    ctx.strokeStyle = rgba(c, selectionne ? 1 : patience)
    ctx.stroke()
    return
  }

  // Glissement depuis l'orbite de parking : petite traînée
  if (v.anc < 1 && v.phiFile !== null) {
    const e = entreeSortie(v.anc)
    const px = versEcranX(PARKING * Math.cos(v.phiFile))
    const py = versEcranY(PARKING * Math.sin(v.phiFile) * INCL)
    const g = ctx.createLinearGradient(px, py, x, y)
    g.addColorStop(0, rgba(c, 0))
    g.addColorStop(1, rgba(c, 0.35 * (1 - e)))
    ctx.strokeStyle = g
    ctx.lineWidth = Math.max(1, r * 0.6)
    ligne(px + (x - px) * 0.5, py + (y - py) * 0.5, x, y)
  }

  if (estVivant(a)) {
    if (estRacine) halo(x, y, r * 6.5, c, 0.1 + 0.04 * Math.sin(v.pouls * 0.5))
    const respiration = 1 + 0.16 * Math.sin(v.pouls)
    halo(x, y, r * (2.3 + 1.3 * norme) * respiration, c, 0.34 + 0.2 * norme + 0.08 * Math.sin(v.pouls))
    sphere(x, y, r, c, 1)
    if (a.etat === 'outil') {
      // Anneau d'outil qui tourne
      const ra = r + Math.max(4, r * 0.35)
      const rot = horloge * 3.2
      ctx.lineWidth = 1.4
      ctx.strokeStyle = rgba(melange(c, BLANC, 0.4), 0.9)
      for (let i = 0; i < 3; i++) {
        const a0 = rot + (i * TAU) / 3
        ctx.beginPath()
        ctx.arc(x, y, ra, a0, a0 + 1.2)
        ctx.stroke()
      }
      ctx.fillStyle = rgba(BLANC, 0.95)
      ctx.beginPath()
      ctx.arc(x + ra * Math.cos(rot + 1.2), y + ra * Math.sin(rot + 1.2), 1.6, 0, TAU)
      ctx.fill()
    }
  } else if (a.etat === 'attend') {
    if (estRacine) halo(x, y, r * 3.5, c, 0.05)
    ctx.fillStyle = rgba(melange([22, 24, 30], c, 0.14), 1)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
    ctx.lineWidth = 1.4
    ctx.strokeStyle = rgba(c, 0.85)
    ctx.stroke()
    // Petit noyau qui rappelle que l'astre est encore en vie
    ctx.fillStyle = rgba(c, 0.5)
    ctx.beginPath()
    ctx.arc(x, y, Math.max(1, r * 0.22), 0, TAU)
    ctx.fill()
  } else if (a.etat === 'termine') {
    const e = lisse(borne((horloge - v.finA - 0.3) / DUREE_EXTINCTION))
    halo(x, y, r * 2.6, c, 0.45 * (1 - lisse(borne((horloge - v.finA) / 0.9))))
    sphere(x, y, r, melange(c, GRIS, e * 0.88), 1 - e * 0.85)
    if (e > 0.5) { ctx.fillStyle = `rgba(14,15,18,${0.28 * e})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill() }
  } else if (a.etat === 'echec') {
    const e = lisse(borne((horloge - v.finA) / 0.7))
    halo(x, y, r * 2.4, ROUGE, 0.14)
    sphere(x, y, r, melange(c, ROUGE_SOMBRE, e), 1 - e * 0.8)
    ctx.lineWidth = 1.3
    ctx.strokeStyle = rgba(ROUGE, 0.7)
    ctx.beginPath()
    ctx.arc(x, y, r + 1, 0, TAU)
    ctx.stroke()
  }

  // Absorption d'un résultat rendu par un satellite
  const pa = (horloge - v.absorbeA) / 0.7
  if (pa >= 0 && pa < 1) {
    ctx.lineWidth = 1.5
    ctx.strokeStyle = rgba(v.absorbeCouleur, 0.8 * (1 - pa))
    ctx.beginPath()
    ctx.arc(x, y, r + 3 + 16 * lisse(pa), 0, TAU)
    ctx.stroke()
    halo(x, y, r * 2.2, v.absorbeCouleur, 0.35 * (1 - pa))
  }
}

// Point d'une trajectoire courbe (Bézier quadratique) entre deux points écran
function pointCourbe(x1, y1, x2, y2, sens, t) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const cx = mx - dy * 0.28 * sens
  const cy = my + dx * 0.28 * sens
  const u = 1 - t
  return [u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2]
}

// Renvoie false quand l'effet est terminé
function dessinerEffet(e) {
  const p = (horloge - e.t0) / e.duree
  if (p < 0) return true
  if (p >= 1) {
    if (e.type === 'retour') {
      const cible = vis.get(e.vers)
      if (cible) { cible.absorbeA = horloge; cible.absorbeCouleur = e.couleur }
    }
    return false
  }

  if (e.type === 'eclat') {
    const v = vis.get(e.id)
    if (!v) return false
    const { sx: x, sy: y } = v
    const r = Math.max(v.sr, 3)
    if (p < 0.18) halo(x, y, r * 4, [255, 220, 210], 0.9 * (1 - p / 0.18))
    ctx.strokeStyle = rgba(ROUGE, 0.9 * (1 - p))
    ctx.lineWidth = 2 * (1 - p) + 0.5
    ctx.beginPath()
    ctx.arc(x, y, r + 42 * camera.z * lisse(p), 0, TAU)
    ctx.stroke()
    ctx.lineCap = 'round'
    for (const [angle, force] of e.eclats) {
      const d0 = r + 30 * camera.z * force * lisse(p)
      const d1 = d0 + 9 * camera.z * force * (1 - p)
      ctx.strokeStyle = rgba(melange(ROUGE, BLANC, 0.3 * (1 - p)), 1 - p)
      ctx.lineWidth = 1.4
      ligne(x + d0 * Math.cos(angle), y + d0 * Math.sin(angle), x + d1 * Math.cos(angle), y + d1 * Math.sin(angle))
    }
    return true
  }

  const de = vis.get(e.de)
  const vers = vis.get(e.vers)
  if (!de || !vers) return false
  const t = entreeSortie(p)
  const grande = e.type === 'comete'
  const n = grande ? 18 : 12
  const pasTraine = grande ? 0.022 : 0.018
  ctx.lineCap = 'round'
  let [xp, yp] = pointCourbe(de.sx, de.sy, vers.sx, vers.sy, e.sens, t)
  const [xt, yt] = [xp, yp]
  for (let i = 1; i <= n; i++) {
    const ti = Math.max(0, t - i * pasTraine)
    const [xi, yi] = pointCourbe(de.sx, de.sy, vers.sx, vers.sy, e.sens, ti)
    const f = 1 - i / n
    ctx.strokeStyle = rgba(e.couleur, 0.75 * f)
    ctx.lineWidth = (grande ? 3.2 : 2) * f + 0.3
    ligne(xp, yp, xi, yi)
    xp = xi
    yp = yi
  }
  const eclat = grande ? 1 : 0.8
  halo(xt, yt, grande ? 14 : 9, e.couleur, 0.7 * eclat)
  ctx.fillStyle = rgba(melange(e.couleur, BLANC, 0.6), 1)
  ctx.beginPath()
  ctx.arc(xt, yt, grande ? 2.4 : 1.8, 0, TAU)
  ctx.fill()
  return true
}

function dessinerEtiquette(v) {
  const a = v.a
  const role = ROLES[a.role]
  const vivant = estVivant(a)
  const titre = a === sim.racine ? 'Orchestrateur' : tronquer(a.titre, 34)
  const entete = a === sim.racine ? '' : role.court.toUpperCase()
  let ligne2
  if (vivant) ligne2 = a.outilCourant ? `⚙ ${a.outilCourant} · ${a.activite}` : a.activite
  else if (a.etat === 'en_file') ligne2 = `En file · position ${sim.file.indexOf(a) + 1}`
  else ligne2 = ETATS[a.etat].libelle + (a.resultat ? ` · ${a.resultat}` : '')
  ligne2 = tronquer(ligne2, 48)

  ctx.font = '600 9.5px Inter, sans-serif'
  const we = entete ? ctx.measureText(entete).width + 6 : 0
  ctx.font = '500 12px Inter, sans-serif'
  const wt = ctx.measureText(titre).width
  ctx.font = '10.5px "JetBrains Mono", monospace'
  const w2 = ctx.measureText(ligne2).width
  const w = Math.max(we + wt, w2) + 16
  const h = 36
  const decale = v.sr + (a.etat === 'outil' ? 12 : 9)
  const aGauche = v.sx + decale + w > W - 8
  const x = aGauche ? v.sx - decale - w : v.sx + decale
  const y = v.sy - h / 2
  const importance = vivant || v.id === survol || v.id === selection ? 1 : 0.7

  ctx.fillStyle = `rgba(14,15,18,${0.72 * importance})`
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 7)
  ctx.fill()
  ctx.strokeStyle = rgba(RGB[a.role], vivant ? 0.3 : 0.12)
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  if (entete) {
    ctx.font = '600 9.5px Inter, sans-serif'
    ctx.fillStyle = rgba(RGB[a.role], importance)
    ctx.fillText(entete, x + 8, y + 15)
  }
  ctx.font = '500 12px Inter, sans-serif'
  ctx.fillStyle = `rgba(232,230,225,${importance})`
  ctx.fillText(titre, x + 8 + we, y + 15)
  ctx.font = '10.5px "JetBrains Mono", monospace'
  ctx.fillStyle = a.etat === 'echec' ? rgba(ROUGE, 0.9) : `rgba(163,163,158,${0.9 * importance})`
  ctx.fillText(ligne2, x + 8, y + 29)
}

// ─── Interaction ─────────────────────────────────────────────────────────────────────────────────────

function astreSous(mx, my) {
  let meilleur = null
  let dMin = Infinity
  for (const v of vis.values()) {
    if (!v.visible) continue
    const d = Math.hypot(v.sx - mx, v.sy - my)
    if (d < Math.max(v.sr, 5) + 6 && d < dMin) { dMin = d; meilleur = v }
  }
  return meilleur
}

let appui = null

canvas.addEventListener('pointerdown', (e) => {
  appui = { x: e.clientX, y: e.clientY, glisse: false }
  canvas.setPointerCapture(e.pointerId)
})

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect()
  if (appui) {
    const dx = e.clientX - appui.x
    const dy = e.clientY - appui.y
    if (!appui.glisse && Math.hypot(dx, dy) > 4) { appui.glisse = true; suivi = null; canvas.classList.add('glisse') }
    if (appui.glisse) {
      camera.x -= (e.clientX - (appui.dernierX ?? appui.x)) / camera.z
      camera.y -= (e.clientY - (appui.dernierY ?? appui.y)) / camera.z
      camera.cx = camera.x
      camera.cy = camera.y
      appui.dernierX = e.clientX
      appui.dernierY = e.clientY
      return
    }
  }
  const v = astreSous(e.clientX - r.left, e.clientY - r.top)
  survol = v ? v.id : null
  canvas.classList.toggle('survol', !!v)
})

canvas.addEventListener('pointerup', (e) => {
  const r = canvas.getBoundingClientRect()
  if (appui && !appui.glisse) {
    const v = astreSous(e.clientX - r.left, e.clientY - r.top)
    if (v) ouvrirInspecteur(v.id)
    else fermerInspecteur()
  }
  appui = null
  canvas.classList.remove('glisse')
})

canvas.addEventListener('pointerleave', () => { if (!appui) survol = null })

canvas.addEventListener('dblclick', (e) => {
  const r = canvas.getBoundingClientRect()
  const v = astreSous(e.clientX - r.left, e.clientY - r.top)
  if (v) {
    suivi = v.id
    camera.cz = Math.max(camera.cz, v.a.profondeur >= 1 ? 1.9 : 1.3)
  } else cadrer()
})

canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  const r = canvas.getBoundingClientRect()
  const mx = e.clientX - r.left
  const my = e.clientY - r.top
  const facteur = Math.exp(-e.deltaY * 0.0014)
  const nz = borne(camera.z * facteur, 0.3, 5)
  if (!suivi) {
    // Le point sous le curseur reste fixe
    const wx = (mx - W / 2) / camera.z + camera.x
    const wy = (my - H / 2) / camera.z + camera.y
    camera.x = wx - (mx - W / 2) / nz
    camera.y = wy - (my - H / 2) / nz
    camera.cx = camera.x
    camera.cy = camera.y
  }
  camera.z = nz
  camera.cz = nz
}, { passive: false })

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fermerInspecteur()
})

// ─── Inspecteur ──────────────────────────────────────────────────────────────────────────────────────

let inspecte = null // { agent, nbJournal, derniere }

function ouvrirInspecteur(id) {
  const a = sim.get(id)
  if (!a) return
  selection = id
  panneau.innerHTML = `
    <button class="fermer" title="Fermer (Échap)">×</button>
    <div class="insp-tete"><span class="rond"></span><span class="role"></span><span class="modele"></span></div>
    <h2 class="insp-titre"></h2>
    <div class="insp-etat"></div>
    <p class="insp-activite"></p>
    <dl class="insp-grille">
      <div><dt>Durée</dt><dd data-i="duree"></dd></div>
      <div><dt>Tokens</dt><dd data-i="tokens"></dd></div>
      <div><dt>Outils</dt><dd data-i="outils"></dd></div>
    </dl>
    <div class="insp-bloc" data-i="bloc-resultat"><b>Résultat</b><div class="insp-resultat"></div></div>
    <div class="insp-bloc" data-i="bloc-liens"><b>Filiation</b><div class="insp-liens"></div></div>
    <div class="insp-journal-titre">Journal</div>
    <ol class="insp-journal"></ol>
  `
  const role = ROLES[a.role]
  panneau.querySelector('.rond').style.background = role.couleur
  panneau.querySelector('.rond').style.boxShadow = `0 0 10px ${role.couleur}`
  panneau.querySelector('.role').textContent = role.libelle
  panneau.querySelector('.role').style.color = role.couleur
  panneau.querySelector('.modele').textContent = a.modele
  panneau.querySelector('.insp-titre').textContent = a.titre
  panneau.querySelector('.fermer').addEventListener('click', fermerInspecteur)
  panneau.querySelector('.insp-liens').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]')
    if (b) ouvrirInspecteur(b.dataset.id)
  })
  panneau.classList.add('ouvert')
  panneau.setAttribute('aria-hidden', 'false')
  inspecte = { agent: a, nbJournal: 0, nbEnfants: -1, etat: null, derniere: 0 }
  majInspecteur(true)
}

function fermerInspecteur() {
  selection = null
  inspecte = null
  panneau.classList.remove('ouvert')
  panneau.setAttribute('aria-hidden', 'true')
}

function lien(a) {
  const b = document.createElement('button')
  b.dataset.id = a.id
  b.className = a.etat === 'echec' ? 'echec' : a.etat === 'termine' ? 'fini' : ''
  const i = document.createElement('i')
  i.style.background = ROLES[a.role].couleur
  b.append(i, tronquer(a.titre, 30))
  b.title = `${ROLES[a.role].libelle} · ${ETATS[a.etat].libelle}`
  return b
}

function majInspecteur(forcer = false) {
  if (!inspecte) return
  const a = inspecte.agent
  if (sim.get(a.id) !== a) { fermerInspecteur(); return }
  const maintenant = performance.now()
  if (!forcer && maintenant - inspecte.derniere < 150) return
  inspecte.derniere = maintenant
  const q = (s) => panneau.querySelector(s)

  if (inspecte.etat !== a.etat) {
    inspecte.etat = a.etat
    const classe = estVivant(a) ? 'vivant' : a.etat
    q('.insp-etat').innerHTML = `<span class="pilule ${classe}"><i></i>${ETATS[a.etat].libelle}</span>`
  }
  q('.insp-activite').textContent = a.outilCourant ? `⚙ ${a.outilCourant} — ${a.activite}` : a.activite
  const duree = a.debut === null ? sim.temps - a.creeA : (a.fin ?? sim.temps) - a.debut
  q('[data-i="duree"]').textContent = a.debut === null ? `file ${formatTemps(duree)}` : formatTemps(duree)
  q('[data-i="tokens"]').textContent = formatTokens(a.tokens)
  q('[data-i="outils"]').textContent = a.nbOutils
  q('[data-i="bloc-resultat"]').style.display = a.resultat ? '' : 'none'
  q('.insp-resultat').textContent = a.resultat ?? ''
  q('.insp-resultat').style.color = a.etat === 'echec' ? 'var(--echec)' : ''

  // Filiation : parent et sous-agents (reconstruite quand elle change)
  const signature = a.enfants.map((id) => sim.get(id).etat).join(',') + (a.parentId ? sim.get(a.parentId).etat : '')
  if (signature !== inspecte.signature) {
    inspecte.signature = signature
    const liens = q('.insp-liens')
    liens.replaceChildren()
    if (a.parentId) liens.append(lien(sim.get(a.parentId)))
    for (const id of a.enfants) liens.append(lien(sim.get(id)))
    q('[data-i="bloc-liens"]').style.display = liens.children.length ? '' : 'none'
  }

  // Journal : ajout incrémental, défilement automatique si on est déjà en bas
  const journal = q('.insp-journal')
  if (a.journal.length > inspecte.nbJournal) {
    const enBas = journal.scrollHeight - journal.scrollTop - journal.clientHeight < 30
    const fragment = document.createDocumentFragment()
    for (const entree of a.journal.slice(inspecte.nbJournal)) {
      const li = document.createElement('li')
      li.className = entree.type === 'echec' ? 'echec' : entree.type === 'termine' ? 'termine' : entree.etat
      const t = document.createElement('time')
      t.textContent = formatTemps(entree.t)
      const point = document.createElement('span')
      point.className = 'point'
      const texte = document.createElement('span')
      texte.textContent = entree.texte
      li.append(t, point, texte)
      fragment.append(li)
    }
    journal.append(fragment)
    inspecte.nbJournal = a.journal.length
    if (enBas || forcer) journal.scrollTop = journal.scrollHeight
  }
}

// ─── Boucle ──────────────────────────────────────────────────────────────────────────────────────────

new ResizeObserver(redimensionner).observe(scene)
redimensionner()

sim.surTic((s, dt) => {
  const dtAnim = sim.enPause ? 0 : dt
  horloge += dtAnim
  synchroniser(dtAnim)
  placer(dtAnim)
  majCamera(dt)
  dessiner()
  majInspecteur()
})

sim.demarrer()
