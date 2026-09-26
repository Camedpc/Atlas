// Couloirs temporels : flame chart vivant des sous-agents.
// Axe horizontal = temps simulé. Chaque agent est une barre posée sous son parent, sur la première rangée
// libre (icicle temporel, rangées réutilisées quand elles se libèrent). Les segments d'état sont
// reconstruits depuis `agent.journal` ; tout est redessiné depuis l'état à chaque image.

import { simulationDepuisUrl, ROLES, ETATS, estFini, estVivant, formatTemps, formatTokens, QUESTION } from '../../commun/simulation.js'
import { monterBarre } from '../../commun/barre.js'

const sim = simulationDepuisUrl()
monterBarre(sim, { titre: 'Couloirs temporels', sousTitre: 'flame chart vivant des sous-agents' })

// ─── Constantes ──────────────────────────────────────────────────────────────────────────────────────

const AXE = 30 // hauteur de la règle temporelle
const MINI = 96 // hauteur de la mini-carte
const MARGE = 18
const LARGEUR_PANNEAU = 380
const ECART_RANGEE = 1.2 // secondes libres exigées avant de réutiliser une rangée
const FOND = '#0e0f12'
const ENCRE = '#121317'
const CLAIR = '#e8e6e1'
const ACCENT = '#f0a44b'
const ROUGE = '#ef5b5b'
const VERT = '#8fd16a'
const POLICE_TITRE = '500 11px Inter, system-ui, sans-serif'
const POLICE_TITRE_PETITE = '500 10px Inter, system-ui, sans-serif'
const POLICE_RESULTAT = '10px Inter, system-ui, sans-serif'
const POLICE_OUTIL = '500 9px "JetBrains Mono", Consolas, monospace'
const POLICE_AXE = '10px "JetBrains Mono", Consolas, monospace'

const borne = (x, min, max) => Math.min(max, Math.max(min, x))
const borne01 = (x) => borne(x, 0, 1)
const adoucir = (k) => 1 - (1 - k) ** 3
const rougeA = (al) => `rgba(239,91,91,${al})`

// ─── Couleurs dérivées des rôles ─────────────────────────────────────────────────────────────────────

function hexVersRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbVersHsl(rgb) {
  const [r, g, b] = rgb.map((c) => c / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

const hslVersCss = ([h, s, l]) => `hsl(${(h * 360).toFixed(1)}, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%)`

const TEINTES = Object.fromEntries(Object.entries(ROLES).map(([cle, r]) => {
  const rgb = hexVersRgb(r.couleur)
  const [h, s, l] = rgbVersHsl(rgb)
  return [cle, {
    couleur: r.couleur,
    // Outil : même teinte, plus saturée et plus lumineuse
    vif: hslVersCss([h, Math.min(1, s * 1.3 + 0.15), Math.min(0.84, l + 0.1)]),
    rgba: (al) => `rgba(${rgb.join(',')},${al})`,
  }]
}))

// ─── Scène et DOM ────────────────────────────────────────────────────────────────────────────────────

const scene = document.querySelector('.scene')
const canvas = scene.querySelector('.toile')
canvas.setAttribute('aria-label', `Couloirs temporels de la recherche : ${QUESTION}`)
const ctx = canvas.getContext('2d')
const infobulle = scene.querySelector('.infobulle')
const commandes = scene.querySelector('.commandes')
const boutonDirect = commandes.querySelector('[data-c="direct"]')
const legende = scene.querySelector('.legende-couloirs')
const panneau = scene.querySelector('.panneau')
const P = {
  role: panneau.querySelector('.p-role'),
  modele: panneau.querySelector('.p-modele'),
  titre: panneau.querySelector('.p-titre'),
  badge: panneau.querySelector('.p-badge'),
  activite: panneau.querySelector('.p-activite'),
  frise: panneau.querySelector('.p-frise'),
  duree: panneau.querySelector('[data-p="duree"]'),
  file: panneau.querySelector('[data-p="file"]'),
  tokens: panneau.querySelector('[data-p="tokens"]'),
  outils: panneau.querySelector('[data-p="outils"]'),
  resultat: panneau.querySelector('.p-resultat'),
  liens: panneau.querySelector('.p-liens'),
  compte: panneau.querySelector('.p-journal-titre small'),
  journal: panneau.querySelector('.p-journal'),
}

legende.innerHTML = `
  <div class="lg-roles">${Object.values(ROLES).map((r) => `<span><i style="background:${r.couleur}"></i>${r.libelle}</span>`).join('')}</div>
  <div class="lg-etats">
    <span><b class="m-plein"></b>réfléchit</span>
    <span><b class="m-vif"></b>outil</span>
    <span><b class="m-trait"></b>attend</span>
    <span><b class="m-hachure"></b>en file</span>
    <span><b class="m-losange"></b>lancement</span>
    <span><b class="m-croix">✕</b>échec</span>
  </div>
  <div class="lg-aide">molette : zoom temporel · glisser : déplacer · clic : inspecter</div>`

const hachures = creerHachures()

function creerHachures() {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 8
  const g = c.getContext('2d')
  g.strokeStyle = 'rgba(163,163,158,0.5)'
  g.lineWidth = 1.4
  g.beginPath()
  for (const d of [-8, 0, 8]) {
    g.moveTo(d, 8)
    g.lineTo(d + 8, 0)
  }
  g.stroke()
  return ctx.createPattern(c, 'repeat')
}

// ─── État de la vue ──────────────────────────────────────────────────────────────────────────────────

const vue = { t0: 0, fenetre: 150, cibleT0: 0, cibleFenetre: 150, suivi: true, defiY: 0, panneau: 0 }
const geo = { W: 0, H: 0, Wd: 0, gauche: MARGE, droite: 0, largeur: 1, haut: AXE + 10, R: 30, B: 20, tMaxMini: 30 }
let dpr = 1
let v = nouvelleMemoire()
let selection = null
let survol = null
let souris = null
let glisse = null
let fantome = null
let curseur = ''

// Mémoire liée à un run : réinitialisée à chaque redémarrage (les agents sont clés par objet).
function nouvelleMemoire() {
  return {
    racine: sim.racine,
    vus: 0, // agents de sim.ordre déjà placés
    lignes: new Map(), // agent → rangée
    occupants: [], // rangée → agents, par ordre de création
    decalage: new Map(), // agent → rang parmi les frères lancés au même instant (losanges)
    apparition: new Map(), // agent → instant réel d'apparition
    segs: new Map(), // agent → { n, liste }
    outils: new Map(), // agent → Map(index de journal → nom d'outil)
    flash: new Map(), // agent → instant réel du dernier changement d'état
    effets: [],
    courbe: null,
    courbeA: -1e9,
  }
}

function reinitialiser() {
  v = nouvelleMemoire()
  fermerPanneau()
  survol = null
  vue.suivi = true
  vue.defiY = 0
}

// ─── Placement en icicle temporel ────────────────────────────────────────────────────────────────────

function rangeeLibre(ligne, t) {
  const occ = v.occupants[ligne]
  if (!occ) return true
  return occ.every((o) => o.fin !== null && o.fin + ECART_RANGEE <= t)
}

function placer(ms) {
  let k = 0
  while (v.vus < sim.ordre.length) {
    const a = sim.get(sim.ordre[v.vus++])
    const parent = a.parentId ? sim.get(a.parentId) : null
    let ligne = parent ? v.lignes.get(parent) + 1 : 0
    while (!rangeeLibre(ligne, a.creeA)) ligne++
    if (!v.occupants[ligne]) v.occupants[ligne] = []
    v.occupants[ligne].push(a)
    v.lignes.set(a, ligne)
    let rang = 0
    if (parent) {
      for (const id of parent.enfants) {
        const f = sim.get(id)
        if (f !== a && v.decalage.has(f) && Math.abs(f.creeA - a.creeA) < 0.05) rang++
      }
    }
    v.decalage.set(a, rang)
    v.apparition.set(a, ms + k * 45)
    k++
  }
}

// ─── Segments d'état reconstruits depuis le journal ──────────────────────────────────────────────────

function devinerOutil(texte) {
  if (/^Recherche/.test(texte)) return 'recherche_web'
  if (/^Exécute|^Trace/.test(texte)) return 'executer'
  if (/graphe/.test(texte)) return 'lire_graphe'
  if (/^Crée «/.test(texte)) return 'creer_noeud'
  if (/^Relie/.test(texte)) return 'ajouter_demonstration'
  if (/vérificateur/.test(texte)) return 'verifier'
  if (/verdict/.test(texte)) return 'noter_demonstration'
  if (/^Lit /.test(texte)) return 'lire'
  return 'ecrire'
}

function nomOutil(a, i, e) {
  return v.outils.get(a)?.get(i) ?? devinerOutil(e.texte)
}

// Un segment dont la fin vaut null court jusqu'à la fin de l'agent (ou jusqu'à maintenant).
function segmentsDe(a) {
  const cache = v.segs.get(a)
  if (cache && cache.n === a.journal.length) return cache.liste
  const liste = []
  if (a.debut === null || a.debut > a.creeA + 1e-6) {
    liste.push({ etat: 'en_file', de: a.creeA, a: a.debut, texte: 'En attente d’une place', outil: null })
  }
  let courant = null
  a.journal.forEach((e, i) => {
    if (e.type !== 'etat') return
    if (courant) {
      courant.a = e.t
      liste.push(courant)
    }
    courant = { etat: e.etat, de: e.t, a: null, texte: e.texte, outil: e.etat === 'outil' ? nomOutil(a, i, e) : null }
  })
  if (courant) liste.push(courant)
  v.segs.set(a, { n: a.journal.length, liste })
  return liste
}

const finSeg = (a, s) => s.a ?? a.fin ?? sim.temps
const finAgent = (a) => a.fin ?? sim.temps

// ─── Coordonnées ─────────────────────────────────────────────────────────────────────────────────────

const xDeT = (t) => geo.gauche + (t - vue.t0) / vue.fenetre * geo.largeur
const tDeX = (x) => vue.t0 + (x - geo.gauche) / geo.largeur * vue.fenetre
const yLigne = (l) => geo.haut + l * geo.R + geo.R / 2
const fenetreMax = () => Math.max(120, sim.temps * 1.4 + 20)

function bornerVue() {
  vue.fenetre = borne(vue.fenetre, 5, fenetreMax())
  const min = -vue.fenetre * 0.08
  vue.t0 = borne(vue.t0, min, Math.max(min, sim.temps - vue.fenetre * 0.15))
  vue.cibleT0 = vue.t0
  vue.cibleFenetre = vue.fenetre
}

function redimensionner() {
  const r = scene.getBoundingClientRect()
  dpr = window.devicePixelRatio || 1
  geo.W = r.width
  geo.H = r.height
  canvas.width = Math.max(1, Math.round(r.width * dpr))
  canvas.height = Math.max(1, Math.round(r.height * dpr))
}
new ResizeObserver(redimensionner).observe(scene)
redimensionner()

function majGeometrie(dt) {
  const k = 1 - Math.exp(-dt * 9)
  const cible = selection ? LARGEUR_PANNEAU : 0
  vue.panneau += (cible - vue.panneau) * k
  if (Math.abs(cible - vue.panneau) < 0.5) vue.panneau = cible
  geo.Wd = geo.W - vue.panneau
  geo.gauche = MARGE
  geo.droite = geo.Wd - MARGE
  geo.largeur = Math.max(50, geo.droite - geo.gauche)
  const n = Math.max(1, v.occupants.length)
  const dispo = geo.H - MINI - AXE - 20
  const cibleR = borne(dispo / Math.max(n, 4), 16, 30)
  geo.R += (cibleR - geo.R) * k
  geo.B = Math.max(9, geo.R * 0.66)
  const defiMax = Math.max(0, n * geo.R - dispo)
  vue.defiY = borne(vue.defiY, 0, defiMax)
  geo.haut = AXE + 10 - vue.defiY
}

function majCamera(dt) {
  if (vue.suivi) vue.cibleT0 = Math.max(0, sim.temps - vue.cibleFenetre * 0.9)
  const k = 1 - Math.exp(-dt * 7)
  vue.t0 += (vue.cibleT0 - vue.t0) * k
  vue.fenetre += (vue.cibleFenetre - vue.fenetre) * k
}

// ─── Texte ───────────────────────────────────────────────────────────────────────────────────────────

const cacheTexte = new Map()
document.fonts?.ready.then(() => cacheTexte.clear())

// Tronque avec une ellipse pour tenir dans `largeurMax` (police déjà posée sur ctx).
function tronquer(texte, largeurMax, police) {
  const plafond = Math.floor(largeurMax / 6) * 6
  const cle = `${police}|${plafond}|${texte}`
  const connu = cacheTexte.get(cle)
  if (connu) return connu
  if (cacheTexte.size > 3000) cacheTexte.clear()
  let res
  const plein = ctx.measureText(texte).width
  if (plein <= plafond) res = { texte, largeur: plein }
  else {
    let bas = 0
    let haut = texte.length
    while (bas < haut) {
      const m = Math.ceil((bas + haut) / 2)
      if (ctx.measureText(`${texte.slice(0, m).trimEnd()}…`).width <= plafond) bas = m
      else haut = m - 1
    }
    const t = bas > 2 ? `${texte.slice(0, bas).trimEnd()}…` : ''
    res = { texte: t, largeur: t ? ctx.measureText(t).width : 0 }
  }
  cacheTexte.set(cle, res)
  return res
}

const echapper = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const raccourcir = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

function formatDuree(s) {
  const t = Math.max(0, s)
  if (t < 60) return `${Math.round(t)} s`
  return `${Math.floor(t / 60)} min ${String(Math.round(t % 60)).padStart(2, '0')}`
}

// ─── Dessin principal ────────────────────────────────────────────────────────────────────────────────

function ligneeDe(a) {
  const s = new Set([a])
  let p = a
  while (p.parentId) {
    p = sim.get(p.parentId)
    s.add(p)
  }
  const pile = [a]
  while (pile.length) {
    for (const id of pile.pop().enfants) {
      const e = sim.get(id)
      s.add(e)
      pile.push(e)
    }
  }
  return s
}

function alphaBase(a) {
  if (estVivant(a)) return 1
  if (a.etat === 'attend') return 0.9
  if (a.etat === 'en_file') return 0.85
  if (a.etat === 'echec') return 0.8
  return 0.5
}

function pasGraduation(pxParSeconde) {
  for (const p of [1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) if (p * pxParSeconde >= 72) return p
  return 1200
}

function dessiner(ms) {
  const { W, H, Wd } = geo
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = 1
  ctx.fillStyle = FOND
  ctx.fillRect(0, 0, W, H)

  const bas = H - MINI
  const xNow = xDeT(sim.temps)
  const lignee = selection ? ligneeDe(selection) : null
  const focus = selection ?? survol?.agent ?? null
  const agents = sim.liste().filter((a) => v.lignes.has(a))

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, AXE, Wd, bas - AXE)
  ctx.clip()

  // Rangées alternées
  for (let l = 0; l < v.occupants.length; l++) {
    if (l % 2) continue
    const y = geo.haut + l * geo.R
    if (y > bas || y + geo.R < AXE) continue
    ctx.fillStyle = 'rgba(255,255,255,0.014)'
    ctx.fillRect(0, y, Wd, geo.R)
  }

  // Grille temporelle
  const pas = pasGraduation(geo.largeur / vue.fenetre)
  ctx.fillStyle = 'rgba(255,255,255,0.035)'
  for (let t = Math.max(0, Math.ceil(vue.t0 / pas) * pas); t <= vue.t0 + vue.fenetre; t += pas) {
    ctx.fillRect(Math.round(xDeT(t)), AXE, 1, bas - AXE)
  }

  // Avant le début et après maintenant : zones assombries
  const x0Run = xDeT(0)
  if (x0Run > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, AXE, x0Run, bas - AXE)
  }
  if (xNow < Wd) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.fillRect(Math.max(0, xNow), AXE, Wd - Math.max(0, xNow), bas - AXE)
  }

  // Liens parent → enfant, sous les barres
  ctx.lineWidth = 1
  for (const a of agents) {
    if (!a.parentId) continue
    const parent = sim.get(a.parentId)
    const app = borne01((ms - v.apparition.get(a)) / 450)
    if (app <= 0) continue
    const xd = xDeT(a.creeA) + v.decalage.get(a) * 7
    const xc = xDeT(a.creeA)
    if (Math.max(xd, xc) < -20 || Math.min(xd, xc) > Wd + 20) continue
    const y1 = yLigne(v.lignes.get(parent)) + geo.B / 2
    const y2 = yLigne(v.lignes.get(a)) - geo.B / 2
    if (y2 < AXE || y1 > bas) continue
    const liee = focus && (focus === a || focus === parent)
    let al = liee ? 0.8 : 0.22
    if (lignee && !lignee.has(a)) al = 0.06
    ctx.strokeStyle = TEINTES[a.role].rgba(al * app)
    ctx.lineWidth = liee ? 1.5 : 1
    const yFin = y1 + (y2 - y1) * adoucir(app)
    ctx.beginPath()
    ctx.moveTo(xd, y1)
    ctx.bezierCurveTo(xd, y1 + (yFin - y1) * 0.55, xc, yFin - (yFin - y1) * 0.45, xc, yFin)
    ctx.stroke()
  }

  // Barres
  for (const a of agents) dessinerBarre(a, ms, lignee, xNow)

  // Marques : losanges de lancement, croix d'échec
  for (const a of agents) dessinerMarques(a, ms, lignee)

  // Têtes lumineuses sur la ligne « maintenant »
  if (xNow > -20 && xNow < Wd + 20) dessinerTetes(agents, ms, xNow, lignee)

  dessinerEffets(ms)
  ctx.restore()

  dessinerAxe(pas)
  dessinerMaintenant(xNow, bas)
  dessinerMiniCarte(ms)
  dessinerFantome(ms)
}

function dessinerBarre(a, ms, lignee, xNow) {
  const l = v.lignes.get(a)
  const yc = yLigne(l)
  if (yc < AXE - geo.R || yc > geo.H - MINI + geo.R) return
  const fin = finAgent(a)
  const x0 = xDeT(a.creeA)
  const x1 = Math.max(x0 + 2, xDeT(fin))
  if (x1 < -4 || x0 > geo.Wd + 4) return
  const app = adoucir(borne01((ms - v.apparition.get(a)) / 450))
  if (app <= 0) return
  const B = geo.B * (0.3 + 0.7 * app)
  const y = yc - B / 2
  const t = TEINTES[a.role]
  let alpha = alphaBase(a) * app
  if (lignee && !lignee.has(a)) alpha *= 0.22
  const segs = segmentsDe(a)
  const vivant = estVivant(a)
  const courant = !estFini(a) ? segs[segs.length - 1] : null
  const rayon = Math.min(4, B / 3)
  const L = Math.min(x1, geo.Wd + 10)
  const D = Math.max(x0, -10)

  ctx.globalAlpha = alpha

  // Halo des agents qui travaillent en ce moment
  if (vivant && courant) {
    const hx = Math.max(xDeT(courant.de), D)
    ctx.save()
    ctx.shadowColor = t.couleur
    ctx.shadowBlur = 18
    ctx.fillStyle = t.rgba(0.55)
    ctx.beginPath()
    ctx.roundRect(hx, y, Math.max(2, L - hx), B, rayon)
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x0, y, x1 - x0, B, rayon)
  ctx.clip()

  const pleins = []
  const outils = []
  for (const s of segs) {
    const sx0 = xDeT(s.de)
    const sx1 = xDeT(finSeg(a, s))
    if (sx1 < -4 || sx0 > geo.Wd + 4) continue
    const w = Math.max(sx1 - sx0, 0.75)
    if (s.etat === 'en_file') {
      ctx.fillStyle = 'rgba(109,110,108,0.16)'
      ctx.fillRect(sx0, y, w, B)
      hachures.setTransform(new DOMMatrix().translate(s === courant ? (ms / 70) % 8 : 0, 0))
      ctx.fillStyle = hachures
      ctx.fillRect(sx0, y, w, B)
    } else if (s.etat === 'reflechit' || s.etat === 'outil') {
      ctx.fillStyle = s.etat === 'outil' ? t.vif : t.couleur
      ctx.fillRect(sx0, y, w, B)
      if (s.etat === 'outil') {
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillRect(sx0, y, w, 1.2)
        outils.push([sx0, w, s.outil])
      }
      // Couture entre deux étapes
      if (w > 3) {
        ctx.fillStyle = 'rgba(14,15,18,0.4)'
        ctx.fillRect(sx0, y, 1, B)
      }
      pleins.push([sx0, w])
    } else if (s.etat === 'attend') {
      ctx.fillStyle = t.rgba(0.08)
      ctx.fillRect(sx0, y, w, B)
      ctx.strokeStyle = t.rgba(0.75)
      ctx.lineWidth = 1.5
      if (s === courant) {
        ctx.setLineDash([5, 4])
        ctx.lineDashOffset = -ms / 45
      }
      ctx.beginPath()
      ctx.moveTo(sx0, y + B - 1.25)
      ctx.lineTo(sx0 + w, y + B - 1.25)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // Reflet qui glisse sur le segment en cours d'un agent vivant
  if (vivant && courant) {
    const sx0 = Math.max(xDeT(courant.de), D)
    const w = xNow - sx0
    if (w > 6) {
      const p = sx0 + ((ms / 1000) * 110) % (w + 80) - 40
      const g = ctx.createLinearGradient(p - 40, 0, p + 40, 0)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.5, 'rgba(255,255,255,0.3)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(sx0, y, w, B)
    }
  }

  // Titre collant au bord gauche, encre claire hors des zones pleines, sombre dessus
  let titre = null
  if (B >= 10 && x1 - x0 > 26) {
    const police = B >= 14 ? POLICE_TITRE : POLICE_TITRE_PETITE
    ctx.font = police
    const tx = Math.max(x0, geo.gauche) + 6
    const dispo = Math.min(x1, geo.droite) - tx - 6
    if (dispo > 20) {
      const tr = tronquer(a.titre, dispo, police)
      if (tr.texte) {
        titre = [tx, tx + tr.largeur]
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'left'
        const ty = yc + 0.5
        ctx.save()
        ctx.beginPath()
        ctx.rect(x0, y, x1 - x0, B)
        for (const [px, pw] of pleins) ctx.rect(px, y, pw, B)
        ctx.clip('evenodd')
        ctx.fillStyle = CLAIR
        ctx.fillText(tr.texte, tx, ty)
        ctx.restore()
        if (pleins.length) {
          ctx.save()
          ctx.beginPath()
          for (const [px, pw] of pleins) ctx.rect(px, y, pw, B)
          ctx.clip()
          ctx.fillStyle = ENCRE
          ctx.fillText(tr.texte, tx, ty)
          ctx.restore()
        }
      }
    }
  }

  // Libellés d'outil dans les segments assez larges
  if (B >= 13) {
    ctx.font = POLICE_OUTIL
    ctx.textBaseline = 'middle'
    for (const [sx0, w, nom] of outils) {
      const lw = ctx.measureText(nom).width
      if (w < lw + 10) continue
      const lx = sx0 + 5
      if (titre && lx < titre[1] + 6 && lx + lw > titre[0] - 6) continue
      ctx.fillStyle = 'rgba(18,19,23,0.72)'
      ctx.fillText(nom, lx, yc + 0.5)
    }
  }
  ctx.restore()

  // Contours : échec, survol, sélection
  if (a.etat === 'echec') {
    ctx.strokeStyle = rougeA(0.85)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x0 - 0.5, y - 0.5, x1 - x0 + 1, B + 1, rayon)
    ctx.stroke()
  }
  if (a === selection || a === survol?.agent) {
    ctx.globalAlpha = 1
    ctx.strokeStyle = a === selection ? '#ffffff' : 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(x0 - 2, y - 2, x1 - x0 + 4, B + 4, rayon + 2)
    ctx.stroke()
  }

  // Résultat en filigrane après une barre terminée, s'il reste de la place dans la rangée
  if (a.fin !== null && a.resultat && B >= 10) {
    const occ = v.occupants[l]
    const suivant = occ[occ.indexOf(a) + 1]
    const limite = Math.min(suivant ? xDeT(suivant.creeA) : geo.droite, geo.droite)
    const dispo = limite - x1 - 16
    if (dispo > 40) {
      ctx.font = POLICE_RESULTAT
      ctx.textBaseline = 'middle'
      const tr = tronquer(`→ ${a.resultat}`, dispo, POLICE_RESULTAT)
      if (tr.texte) {
        ctx.globalAlpha = (lignee && !lignee.has(a) ? 0.25 : 1) * app
        ctx.fillStyle = a.etat === 'echec' ? rougeA(0.85) : '#6d6e6c'
        ctx.fillText(tr.texte, x1 + 8, yc + 0.5)
      }
    }
  }
  ctx.globalAlpha = 1
}

function dessinerLosange(x, y, r, couleur) {
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r, y)
  ctx.closePath()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = FOND
  ctx.stroke()
  ctx.fillStyle = couleur
  ctx.fill()
}

function dessinerMarques(a, ms, lignee) {
  const app = adoucir(borne01((ms - v.apparition.get(a)) / 450))
  if (app <= 0) return
  const hors = lignee && !lignee.has(a)
  if (a.parentId) {
    const parent = sim.get(a.parentId)
    const x = xDeT(a.creeA) + v.decalage.get(a) * 7
    const y = yLigne(v.lignes.get(parent)) + geo.B / 2
    if (x > -8 && x < geo.Wd + 8 && y > AXE && y < geo.H - MINI) {
      ctx.globalAlpha = (hors ? 0.25 : 1) * app
      dessinerLosange(x, y, 3.2 + 1.3 * app, TEINTES[a.role].couleur)
    }
  }
  if (a.etat === 'echec') {
    const x = xDeT(a.fin)
    const y = yLigne(v.lignes.get(a))
    if (x > -8 && x < geo.Wd + 8 && y > AXE && y < geo.H - MINI) {
      const s = 4.5
      ctx.globalAlpha = hors ? 0.35 : 1
      ctx.lineCap = 'round'
      for (const [largeur, couleur] of [[4.5, FOND], [2, ROUGE]]) {
        ctx.lineWidth = largeur
        ctx.strokeStyle = couleur
        ctx.beginPath()
        ctx.moveTo(x - s, y - s)
        ctx.lineTo(x + s, y + s)
        ctx.moveTo(x + s, y - s)
        ctx.lineTo(x - s, y + s)
        ctx.stroke()
      }
      ctx.lineCap = 'butt'
    }
  }
  ctx.globalAlpha = 1
}

function dessinerTetes(agents, ms, xNow, lignee) {
  for (const a of agents) {
    if (estFini(a)) continue
    const l = v.lignes.get(a)
    const y = yLigne(l)
    if (y < AXE || y > geo.H - MINI) continue
    const app = borne01((ms - v.apparition.get(a)) / 450)
    const t = TEINTES[a.role]
    ctx.globalAlpha = (lignee && !lignee.has(a) ? 0.3 : 1) * app
    if (estVivant(a)) {
      const flash = 1 - borne01((ms - (v.flash.get(a) ?? -1e9)) / 650)
      const pouls = 0.5 + 0.5 * Math.sin(ms / 240 + l * 1.7)
      const r = 8 + pouls * 3 + adoucir(flash) * 12
      const g = ctx.createRadialGradient(xNow, y, 0, xNow, y, r)
      g.addColorStop(0, t.rgba(0.95))
      g.addColorStop(0.35, t.rgba(0.35))
      g.addColorStop(1, t.rgba(0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(xNow, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fffaf0'
      ctx.beginPath()
      ctx.arc(xNow, y, 2.3, 0, Math.PI * 2)
      ctx.fill()
    } else if (a.etat === 'attend') {
      ctx.strokeStyle = t.rgba(0.8)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(xNow, y + geo.B / 2 - 1.25, 3.2, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.fillStyle = 'rgba(163,163,158,0.7)'
      ctx.beginPath()
      ctx.arc(xNow, y, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

function dessinerEffets(ms) {
  v.effets = v.effets.filter((e) => ms - e.debut < 1200)
  for (const e of v.effets) {
    const a = e.agent
    if (!v.lignes.has(a)) continue
    const duree = e.type === 'echec' ? 1200 : 800
    const k = (ms - e.debut) / duree
    if (k < 0 || k > 1) continue
    let x
    let y
    let couleur
    if (e.type === 'lance') {
      if (!a.parentId) continue
      x = xDeT(a.creeA) + v.decalage.get(a) * 7
      y = yLigne(v.lignes.get(sim.get(a.parentId))) + geo.B / 2
      couleur = TEINTES[a.role].rgba
    } else {
      x = xDeT(a.fin ?? sim.temps)
      y = yLigne(v.lignes.get(a))
      couleur = e.type === 'echec' ? rougeA : TEINTES[a.role].rgba
    }
    const r = 4 + adoucir(k) * (e.type === 'echec' ? 30 : 16)
    ctx.strokeStyle = couleur((1 - k) * 0.85)
    ctx.lineWidth = e.type === 'echec' ? 2 : 1.5
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function dessinerAxe(pas) {
  ctx.fillStyle = 'rgba(21,23,28,0.96)'
  ctx.fillRect(0, 0, geo.Wd, AXE)
  ctx.fillStyle = '#2a2e37'
  ctx.fillRect(0, AXE - 1, geo.Wd, 1)
  ctx.font = POLICE_AXE
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  for (let t = Math.max(0, Math.ceil(vue.t0 / pas) * pas); t <= vue.t0 + vue.fenetre; t += pas) {
    const x = Math.round(xDeT(t))
    if (x < geo.gauche - 1 || x > geo.Wd) continue
    ctx.fillStyle = '#3a3f4b'
    ctx.fillRect(x, AXE - 7, 1, 6)
    ctx.fillStyle = '#6d6e6c'
    ctx.fillText(formatTemps(t), x + 4, AXE / 2)
  }
}

function dessinerMaintenant(xNow, bas) {
  if (xNow < -10 || xNow > geo.Wd + 10) return
  // Sillage
  const g = ctx.createLinearGradient(xNow - 70, 0, xNow, 0)
  g.addColorStop(0, 'rgba(240,164,75,0)')
  g.addColorStop(1, sim.fini ? 'rgba(143,209,106,0.08)' : 'rgba(240,164,75,0.1)')
  ctx.fillStyle = g
  ctx.fillRect(xNow - 70, AXE, 70, bas - AXE)
  // Ligne
  ctx.save()
  ctx.shadowColor = sim.fini ? VERT : ACCENT
  ctx.shadowBlur = 14
  ctx.fillStyle = sim.fini ? '#d9f5c8' : '#ffe2b8'
  ctx.fillRect(xNow - 0.75, AXE - 4, 1.5, bas - AXE + 4)
  ctx.restore()
  // Pastille horaire
  const texte = sim.fini ? `fin · T+${formatTemps(sim.temps)}` : `T+${formatTemps(sim.temps)}`
  ctx.font = '500 10.5px "JetBrains Mono", Consolas, monospace'
  const w = ctx.measureText(texte).width + 14
  const x = borne(xNow - w / 2, 2, geo.Wd - w - 2)
  ctx.fillStyle = sim.fini ? VERT : ACCENT
  ctx.beginPath()
  ctx.roundRect(x, 6, w, AXE - 12, 6)
  ctx.fill()
  ctx.fillStyle = ENCRE
  ctx.textBaseline = 'middle'
  ctx.fillText(texte, x + 7, AXE / 2 + 0.5)
}

// ─── Mini-carte et courbe de concurrence ─────────────────────────────────────────────────────────────

function calculerCourbe() {
  const T = Math.max(sim.temps, 1)
  const n = borne(Math.floor(geo.largeur / 5), 24, 240)
  const pas = T / n
  const vivants = new Float32Array(n)
  const file = new Float32Array(n)
  for (const a of sim.agents.values()) {
    for (const s of segmentsDe(a)) {
      const cible = s.etat === 'reflechit' || s.etat === 'outil' ? vivants : s.etat === 'en_file' ? file : null
      if (!cible) continue
      const de = s.de
      const fin = finSeg(a, s)
      const i0 = Math.max(0, Math.floor(de / pas))
      const i1 = Math.min(n - 1, Math.floor(fin / pas))
      for (let i = i0; i <= i1; i++) {
        const recouvre = Math.min(fin, (i + 1) * pas) - Math.max(de, i * pas)
        if (recouvre > 0) cible[i] += recouvre / pas
      }
    }
  }
  let max = sim.places + 1
  for (let i = 0; i < n; i++) max = Math.max(max, vivants[i] + file[i])
  return { n, pas, vivants, file, max }
}

function dessinerMiniCarte(ms) {
  const { Wd, H, gauche, largeur } = geo
  const y0 = H - MINI
  ctx.fillStyle = '#111217'
  ctx.fillRect(0, y0, Wd, MINI)
  ctx.fillStyle = '#2a2e37'
  ctx.fillRect(0, y0, Wd, 1)

  if (!glisse || glisse.mode !== 'mini') geo.tMaxMini = Math.max(30, sim.temps * 1.04, vue.t0 + vue.fenetre)
  const tMax = geo.tMaxMini
  const xm = (t) => gauche + t / tMax * largeur

  // Toutes les barres, compressées
  const n = Math.max(1, v.occupants.length)
  const zone = 36
  const pasL = Math.min(4, zone / n)
  const yz = y0 + 9
  for (const [a, l] of v.lignes) {
    const x0 = xm(a.creeA)
    ctx.globalAlpha = estVivant(a) ? 1 : estFini(a) ? 0.45 : 0.7
    ctx.fillStyle = a.etat === 'echec' ? ROUGE : a.etat === 'en_file' ? '#6d6e6c' : ROLES[a.role].couleur
    ctx.fillRect(x0, yz + l * pasL, Math.max(1, xm(finAgent(a)) - x0), Math.max(1, pasL - 1))
  }
  ctx.globalAlpha = 1

  // Courbe de concurrence : agents vivants, avec la file empilée au-dessus
  if (!v.courbe || ms - v.courbeA > 150) {
    v.courbe = calculerCourbe()
    v.courbeA = ms
  }
  const c = v.courbe
  const yb = H - 8
  const hc = 34
  const yv = (val) => yb - val / c.max * hc
  const xi = (i) => xm((i + 0.5) * c.pas)

  if (sim.temps > 0.5) {
    // File (au-dessus des vivants)
    ctx.beginPath()
    ctx.moveTo(xm(0), yb)
    for (let i = 0; i < c.n; i++) ctx.lineTo(xi(i), yv(c.vivants[i] + c.file[i]))
    ctx.lineTo(xm(sim.temps), yv(c.vivants[c.n - 1] + c.file[c.n - 1]))
    for (let i = c.n - 1; i >= 0; i--) ctx.lineTo(xi(i), yv(c.vivants[i]))
    ctx.lineTo(xm(0), yb)
    ctx.closePath()
    hachures.setTransform(new DOMMatrix())
    ctx.fillStyle = hachures
    ctx.fill()

    // Vivants
    const g = ctx.createLinearGradient(0, yb - hc, 0, yb)
    g.addColorStop(0, 'rgba(143,209,106,0.55)')
    g.addColorStop(1, 'rgba(143,209,106,0.05)')
    ctx.beginPath()
    ctx.moveTo(xm(0), yb)
    for (let i = 0; i < c.n; i++) ctx.lineTo(xi(i), yv(c.vivants[i]))
    ctx.lineTo(xm(sim.temps), yv(c.vivants[c.n - 1]))
    ctx.lineTo(xm(sim.temps), yb)
    ctx.closePath()
    ctx.fillStyle = g
    ctx.fill()
    ctx.beginPath()
    for (let i = 0; i < c.n; i++) {
      if (i === 0) ctx.moveTo(xm(0), yv(c.vivants[0]))
      ctx.lineTo(xi(i), yv(c.vivants[i]))
    }
    ctx.strokeStyle = VERT
    ctx.lineWidth = 1.2
    ctx.stroke()
  }

  // Plafond de places
  const yp = yv(sim.places)
  ctx.strokeStyle = 'rgba(232,230,225,0.28)'
  ctx.setLineDash([3, 4])
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(gauche, yp)
  ctx.lineTo(gauche + largeur, yp)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.font = '9.5px "JetBrains Mono", Consolas, monospace'
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'right'
  ctx.fillStyle = '#6d6e6c'
  ctx.fillText(`${sim.places} places`, gauche + largeur, yp - 2)
  ctx.textAlign = 'left'
  ctx.fillText('concurrence', gauche + 2, yb - hc - 1)

  // Fenêtre visible
  const wx0 = borne(xm(vue.t0), gauche, gauche + largeur)
  const wx1 = borne(xm(vue.t0 + vue.fenetre), gauche, gauche + largeur)
  ctx.fillStyle = 'rgba(14,15,18,0.55)'
  ctx.fillRect(0, y0 + 1, wx0, MINI - 1)
  ctx.fillRect(wx1, y0 + 1, Wd - wx1, MINI - 1)
  ctx.strokeStyle = vue.suivi ? 'rgba(240,164,75,0.7)' : 'rgba(232,230,225,0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(wx0 + 0.5, y0 + 4.5, Math.max(4, wx1 - wx0 - 1), MINI - 9, 5)
  ctx.stroke()

  // Maintenant
  const xn = xm(sim.temps)
  ctx.fillStyle = sim.fini ? VERT : ACCENT
  ctx.fillRect(xn - 0.5, y0 + 4, 1, MINI - 8)
}

// ─── Transition de redémarrage : l'ancien run glisse et s'efface ─────────────────────────────────────

function capturerFantome() {
  if (!canvas.width || !canvas.height) return
  const c = document.createElement('canvas')
  c.width = canvas.width
  c.height = canvas.height
  c.getContext('2d').drawImage(canvas, 0, 0)
  fantome = { image: c, debut: performance.now() }
}

function dessinerFantome(ms) {
  if (!fantome) return
  const k = (ms - fantome.debut) / 800
  if (k >= 1) {
    fantome = null
    return
  }
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = (1 - k) ** 2
  ctx.drawImage(fantome.image, -adoucir(k) * 80 * dpr, 0)
  ctx.restore()
}

// ─── Survol et infobulle ─────────────────────────────────────────────────────────────────────────────

function toucher(x, y) {
  if (y < AXE || y > geo.H - MINI || x > geo.Wd) return null
  const l = Math.floor((y - geo.haut) / geo.R)
  const occ = v.occupants[l]
  if (!occ) return null
  if (Math.abs(y - yLigne(l)) > geo.B / 2 + 3) return null
  const t = tDeX(x)
  const tol = 3 / geo.largeur * vue.fenetre
  for (const a of occ) {
    if (t < a.creeA - tol || t > finAgent(a) + tol) continue
    const segs = segmentsDe(a)
    const seg = segs.find((s) => t >= s.de && t <= finSeg(a, s)) ?? segs[segs.length - 1] ?? null
    return { agent: a, seg }
  }
  return null
}

let infobulleA = 0
let infobulleCle = null

function majInfobulle(ms) {
  if (!survol || glisse || !souris) {
    infobulle.hidden = true
    infobulleCle = null
    return
  }
  const { agent: a, seg } = survol
  const cle = `${a.id}|${seg ? seg.de : ''}`
  if (cle === infobulleCle && ms - infobulleA < 100) {
    placerInfobulle()
    return
  }
  infobulleCle = cle
  infobulleA = ms
  const r = ROLES[a.role]
  const segs = segmentsDe(a)
  const enCours = seg && !estFini(a) && seg === segs[segs.length - 1]
  const duree = a.debut === null ? `en file depuis ${formatDuree(sim.temps - a.creeA)}` : formatDuree(finAgent(a) - a.debut)
  let html = `
    <div class="ib-tete"><i style="background:${r.couleur}"></i>${r.libelle}<span>${a.modele}</span></div>
    <div class="ib-titre">${echapper(a.titre)}</div>
    <div class="ib-etat ${a.etat}">${ETATS[a.etat].libelle}${a.outilCourant ? ` · ${a.outilCourant}` : ''} · ${duree} · ${formatTokens(a.tokens)} tok</div>
    <div class="ib-activite">${echapper(a.activite)}</div>`
  if (seg && !enCours) {
    html += `<div class="ib-seg"><time>T+${formatTemps(seg.de)} → T+${formatTemps(finSeg(a, seg))}</time> · ${ETATS[seg.etat].libelle}${seg.outil ? ` · ${seg.outil}` : ''}<br>${echapper(seg.texte)}</div>`
  }
  infobulle.innerHTML = html
  infobulle.hidden = false
  placerInfobulle()
}

function placerInfobulle() {
  const w = infobulle.offsetWidth
  const h = infobulle.offsetHeight
  let x = souris.x + 16
  if (x + w > geo.Wd - 8) x = souris.x - w - 16
  let y = souris.y + 18
  if (y + h > geo.H - 8) y = souris.y - h - 12
  infobulle.style.left = `${Math.max(8, x)}px`
  infobulle.style.top = `${Math.max(8, y)}px`
}

// ─── Panneau inspecteur ──────────────────────────────────────────────────────────────────────────────

let journalRendu = 0
let signatureLiens = ''
let panneauA = 0

function selectionner(a) {
  selection = a
  journalRendu = 0
  signatureLiens = ''
  P.journal.replaceChildren()
  const r = ROLES[a.role]
  panneau.style.setProperty('--role', r.couleur)
  P.role.innerHTML = `<i style="background:${r.couleur}"></i>${r.libelle}`
  P.modele.textContent = a.modele
  P.titre.textContent = a.titre
  panneau.classList.add('ouvert')
  panneau.setAttribute('aria-hidden', 'false')
  majPanneau()
}

function fermerPanneau() {
  selection = null
  panneau.classList.remove('ouvert')
  panneau.setAttribute('aria-hidden', 'true')
}

function puce(a) {
  return `<button class="puce ${a.etat}" data-id="${a.id}" title="${echapper(a.titre)}"><i style="background:${ROLES[a.role].couleur}"></i>${echapper(raccourcir(a.titre, 38))}</button>`
}

function glyphe(e) {
  if (e.type === 'lance') return '◆'
  if (e.type === 'demarre') return '▶'
  if (e.type === 'termine') return '✓'
  if (e.type === 'echec') return '✕'
  return { reflechit: '◍', outil: '⚙', attend: '⋯' }[e.etat] || '·'
}

function couleurEntree(a, e) {
  if (e.type === 'echec') return ROUGE
  if (e.type === 'termine') return VERT
  if (e.type === 'lance' || e.type === 'demarre') return '#6d6e6c'
  if (e.etat === 'outil') return TEINTES[a.role].vif
  if (e.etat === 'attend') return '#a3a39e'
  return ROLES[a.role].couleur
}

function majPanneau() {
  const a = selection
  if (!a) return
  const t = sim.temps
  P.badge.className = `p-badge ${a.etat}`
  P.badge.innerHTML = `<i></i>${ETATS[a.etat].libelle}${a.etat === 'outil' && a.outilCourant ? ` · <code>${a.outilCourant}</code>` : ''}`
  P.activite.textContent = a.activite
  P.duree.textContent = a.debut === null ? '—' : formatDuree(finAgent(a) - a.debut)
  P.file.textContent = formatDuree((a.debut ?? t) - a.creeA)
  P.tokens.textContent = formatTokens(a.tokens)
  P.outils.textContent = String(a.nbOutils)
  if (a.resultat !== null && a.resultat !== undefined) {
    P.resultat.hidden = false
    P.resultat.classList.toggle('echec', a.etat === 'echec')
    P.resultat.querySelector('span').textContent = a.etat === 'echec' ? 'Échec' : 'Résultat'
    P.resultat.querySelector('p').textContent = a.resultat
  } else P.resultat.hidden = true

  // Parent et sous-agents
  const parent = a.parentId ? sim.get(a.parentId) : null
  const enfants = sim.enfants(a)
  const sig = `${a.id}|${parent ? parent.etat : ''}|${enfants.map((e) => e.id + e.etat).join(',')}`
  if (sig !== signatureLiens) {
    signatureLiens = sig
    let html = ''
    if (parent) html += `<div class="p-groupe"><span>Lancé par</span><div class="p-puces">${puce(parent)}</div></div>`
    if (enfants.length) html += `<div class="p-groupe"><span>Sous-agents · ${enfants.length}</span><div class="p-puces">${enfants.map(puce).join('')}</div></div>`
    P.liens.innerHTML = html
  }

  // Journal : on n'ajoute que les nouvelles entrées, et on suit le bas si l'utilisateur y est déjà
  const j = P.journal
  const enBas = j.scrollHeight - j.scrollTop - j.clientHeight < 40
  const fragment = document.createDocumentFragment()
  for (; journalRendu < a.journal.length; journalRendu++) {
    const e = a.journal[journalRendu]
    const li = document.createElement('li')
    li.className = e.type
    li.style.setProperty('--c', couleurEntree(a, e))
    const outil = e.type === 'etat' && e.etat === 'outil' ? `<code>${nomOutil(a, journalRendu, e)}</code>` : ''
    li.innerHTML = `<time>${formatTemps(e.t)}</time><span class="g">${glyphe(e)}</span><span class="t">${outil}${echapper(e.texte)}</span>`
    fragment.append(li)
  }
  if (fragment.childNodes.length) {
    j.append(fragment)
    if (enBas) j.scrollTop = j.scrollHeight
  }
  P.compte.textContent = `${a.journal.length} entrées`
  dessinerFrise(a)
}

// Frise miniature de la vie de l'agent, dans le panneau
function dessinerFrise(a) {
  const c = P.frise
  const w = c.clientWidth
  const h = 14
  if (!w) return
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
  }
  const g = c.getContext('2d')
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const d = a.creeA
  const f = Math.max(finAgent(a), d + 0.01)
  const X = (t) => (t - d) / (f - d) * w
  const teinte = TEINTES[a.role]
  g.save()
  g.beginPath()
  g.roundRect(0, 0, w, h, 4)
  g.clip()
  g.fillStyle = 'rgba(255,255,255,0.04)'
  g.fillRect(0, 0, w, h)
  for (const s of segmentsDe(a)) {
    const x0 = X(s.de)
    const lw = Math.max(0.75, X(finSeg(a, s)) - x0)
    if (s.etat === 'en_file') {
      hachures.setTransform(new DOMMatrix())
      g.fillStyle = hachures
      g.fillRect(x0, 0, lw, h)
    } else if (s.etat === 'reflechit' || s.etat === 'outil') {
      g.fillStyle = s.etat === 'outil' ? teinte.vif : teinte.couleur
      g.fillRect(x0, 0, lw, h)
      g.fillStyle = 'rgba(14,15,18,0.4)'
      g.fillRect(x0, 0, 1, h)
    } else if (s.etat === 'attend') {
      g.fillStyle = teinte.rgba(0.75)
      g.fillRect(x0, h - 2, lw, 1.5)
    }
  }
  g.restore()
  for (const e of sim.enfants(a)) {
    const x = X(e.creeA)
    g.fillStyle = ROLES[e.role].couleur
    g.beginPath()
    g.moveTo(x, h - 5)
    g.lineTo(x + 3, h - 2)
    g.lineTo(x, h + 1)
    g.lineTo(x - 3, h - 2)
    g.closePath()
    g.fill()
  }
  if (a.etat === 'echec') {
    g.fillStyle = ROUGE
    g.fillRect(w - 2, 0, 2, h)
  }
}

P.liens.addEventListener('click', (e) => {
  const b = e.target.closest('.puce')
  const a = b && sim.get(b.dataset.id)
  if (a) selectionner(a)
})
panneau.querySelector('.p-fermer').addEventListener('click', fermerPanneau)

// ─── Interactions : molette, glisser, clic, mini-carte, boutons ──────────────────────────────────────

function position(e) {
  const r = canvas.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function centrerMini(x) {
  const t = (x - geo.gauche) / geo.largeur * geo.tMaxMini
  vue.suivi = false
  vue.t0 = t - vue.fenetre / 2
  bornerVue()
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  const unite = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
  const dx = e.deltaX * unite
  const dy = e.deltaY * unite
  const { x, y } = position(e)
  vue.suivi = false
  if (Math.abs(dx) > Math.abs(dy)) {
    vue.t0 += dx / geo.largeur * vue.fenetre
  } else {
    const ancre = y > geo.H - MINI ? vue.t0 + vue.fenetre / 2 : tDeX(x)
    const nouvelle = borne(vue.fenetre * Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0015)), 5, fenetreMax())
    vue.t0 = ancre - (ancre - vue.t0) * (nouvelle / vue.fenetre)
    vue.fenetre = nouvelle
  }
  bornerVue()
}, { passive: false })

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  const p = position(e)
  canvas.setPointerCapture(e.pointerId)
  if (p.y > geo.H - MINI) {
    glisse = { mode: 'mini' }
    centrerMini(p.x)
  } else {
    glisse = { mode: 'principal', x0: p.x, y0: p.y, t0: vue.t0, defi: vue.defiY, bouge: false }
  }
})

canvas.addEventListener('pointermove', (e) => {
  const p = position(e)
  souris = p
  if (!glisse) return
  if (glisse.mode === 'mini') {
    centrerMini(p.x)
    return
  }
  const dx = p.x - glisse.x0
  const dy = p.y - glisse.y0
  if (!glisse.bouge && Math.hypot(dx, dy) > 4) glisse.bouge = true
  if (!glisse.bouge) return
  vue.suivi = false
  vue.t0 = glisse.t0 - dx / geo.largeur * vue.fenetre
  vue.defiY = glisse.defi - dy
  bornerVue()
})

canvas.addEventListener('pointerup', (e) => {
  const p = position(e)
  if (glisse?.mode === 'principal' && !glisse.bouge) {
    const h = toucher(p.x, p.y)
    if (h) selectionner(h.agent)
    else if (selection) fermerPanneau()
  }
  glisse = null
})
canvas.addEventListener('pointercancel', () => { glisse = null })
canvas.addEventListener('pointerleave', () => {
  if (glisse) return
  souris = null
  survol = null
})

boutonDirect.addEventListener('click', () => {
  vue.suivi = true
  if (vue.cibleFenetre > fenetreMax()) vue.cibleFenetre = 150
})
commandes.querySelector('[data-c="tout"]').addEventListener('click', () => {
  vue.suivi = false
  vue.cibleT0 = -1
  vue.cibleFenetre = Math.max(30, sim.temps * 1.08 + 2)
})

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return
  if (e.key === 'Escape') fermerPanneau()
  if (e.key === 'f' || e.key === 'F') boutonDirect.click()
})

// ─── Événements ponctuels : noms d'outil, flashs, ondes, redémarrage ─────────────────────────────────

sim.surEvenement((evt) => {
  if (evt.type === 'redemarrage') {
    capturerFantome()
    reinitialiser()
    return
  }
  const a = evt.agent
  if (!a) return
  const ms = performance.now()
  // Le journal ne garde pas le nom de l'outil : on le mémorise au moment où il est choisi.
  if (evt.type === 'etat' && evt.etat === 'outil' && a.outilCourant) {
    if (!v.outils.has(a)) v.outils.set(a, new Map())
    v.outils.get(a).set(a.journal.length - 1, a.outilCourant)
  }
  if (evt.type === 'etat' || evt.type === 'demarre') v.flash.set(a, ms)
  if (evt.type === 'lance' || evt.type === 'termine' || evt.type === 'echec') {
    v.effets.push({ type: evt.type, agent: a, debut: ms })
    if (v.effets.length > 80) v.effets.shift()
  }
})

// ─── Boucle ──────────────────────────────────────────────────────────────────────────────────────────

let etatDirect = null
let droiteCommandes = -1

function majInterface(ms) {
  const droite = Math.round(vue.panneau + 18)
  if (droite !== droiteCommandes) {
    droiteCommandes = droite
    commandes.style.right = `${droite}px`
  }
  if (etatDirect !== vue.suivi) {
    etatDirect = vue.suivi
    boutonDirect.classList.toggle('en-direct', vue.suivi)
    boutonDirect.classList.toggle('hors-direct', !vue.suivi)
    boutonDirect.querySelector('span').textContent = vue.suivi ? 'En direct' : 'Suivre le direct'
  }
  majInfobulle(ms)
  if (selection && ms - panneauA > 150) {
    panneauA = ms
    majPanneau()
  }
}

sim.surTic((s, dt) => {
  const ms = performance.now()
  if (v.racine !== sim.racine) reinitialiser()
  placer(ms)
  majGeometrie(dt)
  majCamera(dt)
  survol = souris && !glisse ? toucher(souris.x, souris.y) : null
  const c = glisse ? 'grabbing' : survol ? 'pointer' : souris && souris.y > geo.H - MINI ? 'ew-resize' : 'grab'
  if (c !== curseur) {
    curseur = c
    canvas.style.cursor = c
  }
  dessiner(ms)
  majInterface(ms)
})

sim.demarrer()
