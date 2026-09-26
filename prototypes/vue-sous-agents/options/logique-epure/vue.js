// Blueprint épuré : éditeur de graphe de logique à la manière de l'éditeur de Blueprints d'Unreal, dessiné
// sobrement. Une assertion = un nœud ; chacune de ses démonstrations = une broche d'entrée à gauche ; sa
// broche de sortie « assertion » alimente les démonstrations qui s'en servent comme prémisse. Les fils
// portent la validité (couleur, trait) et la confiance (étiquette au milieu). Statuts recalculés en direct.

import { calculerStatuts, STATUTS } from '../../commun/raisonnement.js'
import * as M from './modele.js'
import { L, TETE, PAD, RANG, BROCHE, GRILLE, esc, aligner as caler } from './modele.js'
import { ouvrirMenu, fermerMenu, menuOuvert } from './menu.js'
import { creerPanneau } from './panneau.js'

const $ = (s) => document.querySelector(s)
const toile = $('.toile')
const monde = $('.monde')
const coucheComment = $('.c-commentaires')
const coucheNoeuds = $('.c-noeuds')
const gFils = $('.g-fils')
const gEtiquettes = $('.g-etiquettes')
const gReroutes = $('.g-reroutes')
const filTemp = $('.fil-temp')
const rectangle = $('.rectangle')
const zoomEl = $('.zoom')
const miniCarte = $('.minicarte')
const problemeEl = $('.barre .probleme')

// ─── État ────────────────────────────────────────────────────────────────────────────────────────────

let etat
let vue = null
let sel = new Set() // 'n:id' | 'c:id' | 'f:demo|premisse' | 'r:demo|premisse|i'
let statuts = {}
const hauteurs = new Map()
const elsNoeuds = new Map()
const elsComment = new Map()
let pointeurMonde = { x: 0, y: 0 }

const sauve = M.charger()
let aDisposer = false
if (sauve) { etat = sauve.etat; vue = sauve.vue ?? null } else aDisposer = true
let categoriesExemple = null
if (aDisposer) { const ex = M.exemple(); etat = ex.etat; categoriesExemple = ex.categories }
let historique = M.creerHistorique(etat)

const parId = (id) => etat.noeuds.find((n) => n.id === id)
const demo = (id) => etat.demonstrations.find((d) => d.id === id)
const commentaire = (id) => etat.commentaires.find((c) => c.id === id)
const demosDe = (id) => etat.demonstrations.filter((d) => d.noeud_id === id)
const hauteur = (id) => hauteurs.get(id) ?? 110
const rectNoeud = (n) => ({ x: n.x, y: n.y, l: L, h: hauteur(n.id) })
const idsSel = (t) => [...sel].filter((k) => k.startsWith(`${t}:`)).map((k) => k.slice(2))
const dans = (r, c) => r.x >= c.x && r.y >= c.y && r.x + r.l <= c.x + c.l && r.y + r.h <= c.y + c.h
const croise = (a, b) => a.x < b.x + b.l && b.x < a.x + a.l && a.y < b.y + b.h && b.y < a.y + a.h

function categorieDe(n) {
  const cx = n.x + L / 2
  const cy = n.y + hauteur(n.id) / 2
  let best = null
  for (const c of etat.commentaires) {
    if (cx < c.x || cy < c.y || cx > c.x + c.l || cy > c.y + c.h) continue
    if (!best || c.l * c.h < best.l * best.h) best = c
  }
  return best
}

const contenus = (c) => etat.noeuds.filter((n) => dans(rectNoeud(n), c))

// ─── Vue : zoom et déplacement ───────────────────────────────────────────────────────────────────────

function appliquerVue() {
  monde.style.transform = `translate(${vue.x}px,${vue.y}px) scale(${vue.k})`
  const pas = (vue.k < 0.5 ? 48 : 24) * vue.k
  toile.style.backgroundSize = `${pas}px ${pas}px`
  toile.style.backgroundPosition = `${vue.x}px ${vue.y}px`
  zoomEl.textContent = `${Math.round(vue.k * 100)} %`
  dessinerMiniCarte()
  planifierSauvegarde()
}

function versMonde(e) {
  const r = toile.getBoundingClientRect()
  return { x: (e.clientX - r.left - vue.x) / vue.k, y: (e.clientY - r.top - vue.y) / vue.k }
}

function zoomer(sx, sy, facteur) {
  const k = Math.min(2, Math.max(0.15, vue.k * facteur))
  const wx = (sx - vue.x) / vue.k
  const wy = (sy - vue.y) / vue.k
  vue = { k, x: sx - wx * k, y: sy - wy * k }
  appliquerVue()
}

toile.addEventListener('wheel', (e) => {
  e.preventDefault()
  const r = toile.getBoundingClientRect()
  const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
  zoomer(e.clientX - r.left, e.clientY - r.top, Math.exp(-d * 0.0016))
}, { passive: false })

function bornes(cles = null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const ajouter = (r) => { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.l); y1 = Math.max(y1, r.y + r.h) }
  for (const n of etat.noeuds) if (!cles || cles.has(`n:${n.id}`)) ajouter(rectNoeud(n))
  for (const c of etat.commentaires) if (!cles || cles.has(`c:${c.id}`)) ajouter(c)
  if (cles) {
    for (const k of cles) {
      if (!k.startsWith('f:') && !k.startsWith('r:')) continue
      const [dId, p] = k.slice(2).split('|')
      const d = demo(dId)
      if (d && parId(p) && parId(d.noeud_id)) for (const [x, y] of pointsFil(d, p)) ajouter({ x, y, l: 0, h: 0 })
    }
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, l: x1 - x0, h: y1 - y0 } : null
}

function cadrer(cles = null) {
  const b = bornes(cles)
  if (!b) return
  const W = toile.clientWidth
  const H = toile.clientHeight
  const m = 64
  const k = Math.min(1, Math.max(0.15, Math.min((W - 2 * m) / Math.max(b.l, 1), (H - 2 * m) / Math.max(b.h, 1))))
  vue = { k, x: W / 2 - (b.x + b.l / 2) * k, y: H / 2 - (b.y + b.h / 2) * k }
  appliquerVue()
}

function centrerSur(x, y) {
  vue = { ...vue, x: toile.clientWidth / 2 - x * vue.k, y: toile.clientHeight / 2 - y * vue.k }
  appliquerVue()
}

// ─── Historique et sauvegarde ────────────────────────────────────────────────────────────────────────

let minuterie = null
function planifierSauvegarde() {
  clearTimeout(minuterie)
  minuterie = setTimeout(() => M.sauver(etat, vue), 400)
}

function valider() {
  if (historique.valider(etat)) { M.sauver(etat, vue); majBoutons() }
}

function restaurer(e) {
  if (!e) return
  etat = e
  nettoyerSelection()
  M.sauver(etat, vue)
  rendre()
}

const annuler = () => restaurer(historique.annuler())
const retablir = () => restaurer(historique.retablir())

function nettoyerSelection() {
  for (const k of [...sel]) {
    const [t, reste] = [k[0], k.slice(2)]
    const [dId, p, i] = reste.split('|')
    const ok = t === 'n' ? parId(reste)
      : t === 'c' ? commentaire(reste)
        : t === 'f' ? demo(dId)?.justifie_par.includes(p)
          : demo(dId)?.reroutes?.[p]?.[Number(i)]
    if (!ok) sel.delete(k)
  }
}

function reinitialiserExemple() {
  const ex = M.exemple()
  etat = ex.etat
  sel.clear()
  rendre()
  M.disposer(etat, ex.categories, hauteur)
  rendre()
  valider()
  cadrer()
}

// ─── Rendu ───────────────────────────────────────────────────────────────────────────────────────────

function rendre({ panneau = true } = {}) {
  statuts = calculerStatuts(etat.noeuds, etat.demonstrations.filter((d) => d.justifie_par.length))
  rendreCommentaires()
  rendreNoeuds()
  rendreFils()
  if (panneau) details.maj()
  if (problemeEl.textContent !== etat.probleme) { problemeEl.textContent = etat.probleme; problemeEl.title = etat.probleme }
  dessinerMiniCarte()
  majBoutons()
}

function rendreCommentaires() {
  const ordre = [...etat.commentaires].sort((a, b) => b.l * b.h - a.l * a.h)
  const vus = new Set()
  let precedent = null
  for (const c of ordre) {
    vus.add(c.id)
    let el = elsComment.get(c.id)
    if (!el) {
      el = document.createElement('div')
      el.className = 'commentaire'
      el.dataset.id = c.id
      el.innerHTML = '<div class="c-titre"><span class="c-nom"></span></div><span class="c-poignee" title="Redimensionner"></span>'
      elsComment.set(c.id, el)
    }
    // Les grandes boîtes derrière les petites
    if (precedent ? precedent.nextSibling !== el : coucheComment.firstChild !== el) {
      if (precedent) precedent.after(el)
      else coucheComment.prepend(el)
    }
    precedent = el
    const nom = el.querySelector('.c-nom')
    if (!nom.querySelector('input') && nom.textContent !== c.titre) nom.textContent = c.titre
    el.style.setProperty('--c', c.couleur)
    el.style.transform = `translate(${c.x}px,${c.y}px)`
    el.style.width = `${c.l}px`
    el.style.height = `${c.h}px`
    el.classList.toggle('choisi', sel.has(`c:${c.id}`))
  }
  for (const [id, el] of elsComment) if (!vus.has(id)) { el.remove(); elsComment.delete(id) }
}

function htmlNoeud(n, demos, st, utilise) {
  const s = STATUTS[st]
  const gauche = demos.map((d) => `
    <div class="rang"><span class="broche entree${d.justifie_par.length ? ' reliee' : ''}" data-noeud="${esc(n.id)}" data-demo="${esc(d.id)}"></span>
      <span class="lab" title="${esc(d.nom_demonstration)}${d.demonstration ? ` — ${esc(d.demonstration)}` : ''}">${esc(d.nom_demonstration)}</span></div>`).join('')
  return `
    <div class="tete"><span class="nom" title="${esc(n.nom)}">${esc(n.nom)}</span>
      <span class="statut" title="Statut recalculé : ${s.libelle}"><i style="background:${s.couleur}"></i>${s.libelle}</span></div>
    <div class="corps">
      <div class="col g">${gauche}
        <div class="rang ajout"><span class="broche entree plus" data-noeud="${esc(n.id)}" data-demo="+" title="Nouvelle démonstration"></span><span class="lab">démonstration</span></div>
      </div>
      <div class="col d">
        <div class="rang"><span class="lab">assertion</span><span class="broche sortie${utilise ? ' reliee' : ''}" data-noeud="${esc(n.id)}" data-sortie="1"></span></div>
        ${n.admis ? '<div class="rang"><span class="admis" title="Établi sans démonstration">admis</span></div>' : ''}
      </div>
    </div>
    ${n.enonce ? `<p class="enonce">${esc(n.enonce)}</p>` : '<p class="enonce vide">Énoncé à écrire</p>'}`
}

function rendreNoeuds() {
  const utilises = new Set(etat.demonstrations.flatMap((d) => d.justifie_par))
  const vus = new Set()
  for (const n of etat.noeuds) {
    vus.add(n.id)
    let el = elsNoeuds.get(n.id)
    if (!el) {
      el = document.createElement('div')
      el.className = 'noeud'
      el.dataset.id = n.id
      coucheNoeuds.append(el)
      elsNoeuds.set(n.id, el)
    }
    const demos = demosDe(n.id)
    const st = statuts[n.id]
    const cat = categorieDe(n)
    const sig = JSON.stringify([n.nom, n.enonce, n.admis, st, utilises.has(n.id), demos.map((d) => [d.id, d.nom_demonstration, d.demonstration, d.justifie_par.length])])
    if (el.__sig !== sig && !el.querySelector('.renommage')) {
      el.__sig = sig
      el.innerHTML = htmlNoeud(n, demos, st, utilises.has(n.id))
      hauteurs.set(n.id, el.offsetHeight)
    }
    el.style.setProperty('--c', cat ? cat.couleur : M.NEUTRE)
    el.style.transform = `translate(${n.x}px,${n.y}px)`
    el.classList.toggle('choisi', sel.has(`n:${n.id}`))
  }
  for (const [id, el] of elsNoeuds) if (!vus.has(id)) { el.remove(); elsNoeuds.delete(id); hauteurs.delete(id) }
}

// ─── Fils ────────────────────────────────────────────────────────────────────────────────────────────

const f1 = (v) => v.toFixed(1)

function pointSortie(id) {
  const n = parId(id)
  return [n.x + L - BROCHE, n.y + TETE + PAD + RANG / 2]
}

function pointEntree(noeudId, demoId) {
  const n = parId(noeudId)
  const demos = demosDe(noeudId)
  const i = demoId === '+' ? demos.length : demos.findIndex((d) => d.id === demoId)
  return [n.x + BROCHE, n.y + TETE + PAD + i * RANG + RANG / 2]
}

function pointsFil(d, p) {
  return [pointSortie(p), ...(d.reroutes?.[p] ?? []).map((r) => [r.x, r.y]), pointEntree(d.noeud_id, d.id)]
}

function segment(a, b) {
  const dx = Math.max(40, Math.abs(b[0] - a[0]) * 0.5)
  return [a[0], a[1], a[0] + dx, a[1], b[0] - dx, b[1], b[0], b[1]]
}

function chemin(pts) {
  let s = `M${f1(pts[0][0])},${f1(pts[0][1])}`
  for (let i = 1; i < pts.length; i++) {
    const c = segment(pts[i - 1], pts[i])
    s += `C${f1(c[2])},${f1(c[3])} ${f1(c[4])},${f1(c[5])} ${f1(c[6])},${f1(c[7])}`
  }
  return s
}

function pointBezier(c, u) {
  const v = 1 - u
  const a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u
  return [a * c[0] + b * c[2] + d * c[4] + e * c[6], a * c[1] + b * c[3] + d * c[5] + e * c[7]]
}

function milieu(pts) {
  const i = Math.floor((pts.length - 1) / 2)
  return pointBezier(segment(pts[i], pts[i + 1]), 0.5)
}

function rendreFils() {
  const choisisN = new Set(idsSel('n'))
  let fils = ''
  let etiquettes = ''
  let reroutes = ''
  for (const d of etat.demonstrations) {
    if (!parId(d.noeud_id)) continue
    for (const p of d.justifie_par) {
      if (!parId(p)) continue
      const cle = `${d.id}|${p}`
      const pts = pointsFil(d, p)
      const dd = chemin(pts)
      const cls = `fil v-${d.validite}${sel.has(`f:${cle}`) ? ' choisi' : ''}${choisisN.has(p) || choisisN.has(d.noeud_id) ? ' lie' : ''}`
      fils += `<g class="${cls}" data-fil="${esc(cle)}"><path class="zone" d="${dd}"/><path class="trait" d="${dd}"/></g>`
      const [mx, my] = milieu(pts)
      if (d.validite === 'invalide') {
        etiquettes += `<g class="croix" transform="translate(${f1(mx)},${f1(my)})"><circle r="6"/><path d="M-3,-3L3,3M3,-3L-3,3"/></g>`
      }
      const t = M.fmtConfiance(d.confiance)
      if (t) {
        const w = t.length * 6.1 + 10
        const oy = d.validite === 'invalide' ? 15 : 0
        etiquettes += `<g class="etiquette" transform="translate(${f1(mx)},${f1(my + oy)})"><rect x="${f1(-w / 2)}" y="-8" width="${f1(w)}" height="16" rx="4"/><text y="3.5" text-anchor="middle">${t}</text></g>`
      }
      ;(d.reroutes?.[p] ?? []).forEach((r, i) => {
        const k = `r:${cle}|${i}`
        reroutes += `<circle class="reroute v-${d.validite}${sel.has(k) ? ' choisi' : ''}" data-cle="${esc(k)}" cx="${f1(r.x)}" cy="${f1(r.y)}" r="5"/>`
      })
    }
  }
  gFils.innerHTML = fils
  gEtiquettes.innerHTML = etiquettes
  gReroutes.innerHTML = reroutes
}

function dessinerTemp(a, b) {
  filTemp.setAttribute('d', chemin([a, b]))
  filTemp.style.display = ''
}

// ─── Mini-carte ──────────────────────────────────────────────────────────────────────────────────────

const MC = { l: 184, h: 116, k: 1, ox: 0, oy: 0 }
{
  const dpr = window.devicePixelRatio || 1
  miniCarte.width = MC.l * dpr
  miniCarte.height = MC.h * dpr
  miniCarte.style.width = `${MC.l}px`
  miniCarte.style.height = `${MC.h}px`
}

function rgba(hex, a) {
  const v = Number.parseInt(hex.slice(1), 16)
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`
}

function dessinerMiniCarte() {
  if (!vue) return
  const g = miniCarte.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, MC.l, MC.h)
  const b = bornes()
  const v = { x: -vue.x / vue.k, y: -vue.y / vue.k, l: toile.clientWidth / vue.k, h: toile.clientHeight / vue.k }
  const u = b ? { x: Math.min(b.x, v.x), y: Math.min(b.y, v.y) } : { x: v.x, y: v.y }
  u.l = (b ? Math.max(b.x + b.l, v.x + v.l) : v.x + v.l) - u.x
  u.h = (b ? Math.max(b.y + b.h, v.y + v.h) : v.y + v.h) - u.y
  const m = 8
  MC.k = Math.min((MC.l - 2 * m) / u.l, (MC.h - 2 * m) / u.h)
  MC.ox = m + (MC.l - 2 * m - u.l * MC.k) / 2 - u.x * MC.k
  MC.oy = m + (MC.h - 2 * m - u.h * MC.k) / 2 - u.y * MC.k
  const R = (r) => [MC.ox + r.x * MC.k, MC.oy + r.y * MC.k, r.l * MC.k, r.h * MC.k]
  for (const c of etat.commentaires) {
    g.fillStyle = rgba(c.couleur, 0.1)
    g.fillRect(...R(c))
  }
  for (const n of etat.noeuds) {
    g.fillStyle = sel.has(`n:${n.id}`) ? '#2563eb' : '#b4b4bb'
    g.fillRect(...R(rectNoeud(n)))
  }
  g.strokeStyle = 'rgba(24,24,27,0.55)'
  g.lineWidth = 1
  const [x, y, l, h] = R(v)
  g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(l), Math.round(h))
}

miniCarte.addEventListener('pointerdown', (e) => {
  e.stopPropagation()
  const aller = (ev) => {
    const r = miniCarte.getBoundingClientRect()
    centrerSur((ev.clientX - r.left - MC.ox) / MC.k, (ev.clientY - r.top - MC.oy) / MC.k)
  }
  aller(e)
  suivre(e, aller, null, 0)
})

// ─── Gestes ──────────────────────────────────────────────────────────────────────────────────────────

function suivre(e, surBouge, surFin, seuil = 4) {
  const x0 = e.clientX
  const y0 = e.clientY
  let bouge = false
  const mv = (ev) => {
    if (!bouge && Math.hypot(ev.clientX - x0, ev.clientY - y0) < seuil) return
    bouge = true
    surBouge(ev)
  }
  const up = (ev) => {
    window.removeEventListener('pointermove', mv)
    window.removeEventListener('pointerup', up)
    surFin?.(ev, bouge)
  }
  window.addEventListener('pointermove', mv)
  window.addEventListener('pointerup', up)
}

let dernierClic = { cle: null, t: 0 }
function estDouble(cle) {
  const t = performance.now()
  const ok = dernierClic.cle === cle && t - dernierClic.t < 420
  dernierClic = ok ? { cle: null, t: 0 } : { cle, t }
  return ok
}

function panoramique(e, surClic) {
  const x0 = e.clientX
  const y0 = e.clientY
  const v0 = { ...vue }
  suivre(e, (ev) => {
    toile.classList.add('deplace')
    vue = { ...v0, x: v0.x + ev.clientX - x0, y: v0.y + ev.clientY - y0 }
    appliquerVue()
  }, (ev, bouge) => {
    toile.classList.remove('deplace')
    if (!bouge) surClic?.(ev)
  })
}

// Déplace la sélection ; une boîte Comment emporte les assertions, points et boîtes qu'elle contient.
function glisserSelection(e, surClicSimple) {
  const depart = versMonde(e)
  const nIds = new Set(idsSel('n'))
  const cIds = new Set(idsSel('c'))
  const points = new Set()
  for (const k of sel) {
    if (!k.startsWith('r:')) continue
    const [dId, p, i] = k.slice(2).split('|')
    const r = demo(dId)?.reroutes?.[p]?.[Number(i)]
    if (r) points.add(r)
  }
  for (const id of [...cIds]) {
    const c = commentaire(id)
    for (const n of contenus(c)) nIds.add(n.id)
    for (const x of etat.commentaires) if (x !== c && dans(x, c)) cIds.add(x.id)
    for (const d of etat.demonstrations) for (const pts of Object.values(d.reroutes ?? {})) for (const r of pts) if (dans({ x: r.x, y: r.y, l: 0, h: 0 }, c)) points.add(r)
  }
  const objets = [...[...nIds].map(parId), ...[...cIds].map(commentaire), ...points].filter(Boolean).map((o) => ({ o, x: o.x, y: o.y }))
  suivre(e, (ev) => {
    const p = versMonde(ev)
    const dx = caler(p.x - depart.x)
    const dy = caler(p.y - depart.y)
    for (const it of objets) { it.o.x = it.x + dx; it.o.y = it.y + dy }
    rendre({ panneau: false })
  }, (ev, bouge) => {
    if (bouge) { valider(); rendre() } else surClicSimple?.(ev)
  })
}

function choisir(cle, e) {
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    if (sel.has(cle)) { sel.delete(cle); rendre(); return false }
    sel.add(cle)
  } else if (!sel.has(cle)) sel = new Set([cle])
  rendre()
  return true
}

// Clic sans glisser sur un élément déjà sélectionné : il devient la seule sélection (comme dans Unreal),
// sauf si le clic ajoutait à la sélection (modificateurs lus à l'appui).
function selectionnerSeul(cle, e) {
  const ajout = e.shiftKey || e.ctrlKey || e.metaKey
  return () => {
    if (!ajout && (sel.size !== 1 || !sel.has(cle))) { sel = new Set([cle]); rendre() }
  }
}

toile.addEventListener('contextmenu', (e) => e.preventDefault())

toile.addEventListener('pointermove', (e) => { pointeurMonde = versMonde(e) })

toile.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.minicarte, .renommage')) return
  const t = e.target
  pointeurMonde = versMonde(e)

  if (e.button === 1 || e.button === 2) {
    e.preventDefault()
    panoramique(e, (ev) => menuContextuel(t, ev))
    return
  }
  if (e.button !== 0) return

  const broche = t.closest('.broche')
  if (broche) {
    if (e.altKey) couperBroche(broche)
    else tirerFil(broche, e)
    return
  }

  const rer = t.closest('.reroute')
  if (rer) {
    const cle = rer.dataset.cle
    if (e.altKey) { sel = new Set([cle]); supprimerSelection(); return }
    if (choisir(cle, e)) glisserSelection(e, selectionnerSeul(cle, e))
    return
  }

  const fil = t.closest('.fil')
  if (fil) {
    const [dId, p] = fil.dataset.fil.split('|')
    if (e.altKey) { couper(dId, p); return }
    if (estDouble(`f:${fil.dataset.fil}`)) { ajouterReroute(demo(dId), p, versMonde(e)); return }
    if (e.shiftKey || e.ctrlKey) sel.has(`f:${fil.dataset.fil}`) ? sel.delete(`f:${fil.dataset.fil}`) : sel.add(`f:${fil.dataset.fil}`)
    else sel = new Set([`f:${fil.dataset.fil}`])
    rendre()
    return
  }

  const elNoeud = t.closest('.noeud')
  if (elNoeud) {
    const id = elNoeud.dataset.id
    const cle = `n:${id}`
    if (t.closest('.tete') && estDouble(cle)) { sel = new Set([cle]); rendre(); renommerNoeud(id); return }
    if (choisir(cle, e)) glisserSelection(e, selectionnerSeul(cle, e))
    return
  }

  const poignee = t.closest('.c-poignee')
  if (poignee) { redimensionner(commentaire(poignee.closest('.commentaire').dataset.id), e); return }

  const titre = t.closest('.c-titre')
  if (titre) {
    const id = titre.closest('.commentaire').dataset.id
    const cle = `c:${id}`
    if (estDouble(cle)) { sel = new Set([cle]); rendre(); renommerCommentaire(id); return }
    if (choisir(cle, e)) glisserSelection(e, selectionnerSeul(cle, e))
    return
  }

  // Fond : Maj/Ctrl + glisser = rectangle de sélection, sinon déplacement de la vue.
  if (e.shiftKey || e.ctrlKey || e.metaKey) selectionRectangle(e)
  else panoramique(e, () => { if (sel.size) { sel.clear(); rendre() } })
})

function selectionRectangle(e) {
  const base = new Set(sel)
  const a = versMonde(e)
  const r0 = toile.getBoundingClientRect()
  suivre(e, (ev) => {
    const b = versMonde(ev)
    const z = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), l: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
    Object.assign(rectangle.style, {
      display: 'block',
      left: `${Math.min(e.clientX, ev.clientX) - r0.left}px`,
      top: `${Math.min(e.clientY, ev.clientY) - r0.top}px`,
      width: `${Math.abs(ev.clientX - e.clientX)}px`,
      height: `${Math.abs(ev.clientY - e.clientY)}px`,
    })
    sel = new Set(base)
    for (const n of etat.noeuds) if (croise(rectNoeud(n), z)) sel.add(`n:${n.id}`)
    for (const c of etat.commentaires) if (dans(c, z)) sel.add(`c:${c.id}`)
    for (const d of etat.demonstrations) {
      for (const [p, pts] of Object.entries(d.reroutes ?? {})) pts.forEach((r, i) => { if (dans({ x: r.x, y: r.y, l: 0, h: 0 }, z)) sel.add(`r:${d.id}|${p}|${i}`) })
    }
    rendre({ panneau: false })
  }, () => {
    rectangle.style.display = 'none'
    rendre()
  })
}

function redimensionner(c, e) {
  const p0 = versMonde(e)
  const l0 = c.l
  const h0 = c.h
  sel = new Set([`c:${c.id}`])
  rendre()
  suivre(e, (ev) => {
    const p = versMonde(ev)
    c.l = Math.max(200, caler(l0 + p.x - p0.x))
    c.h = Math.max(104, caler(h0 + p.y - p0.y))
    rendre({ panneau: false })
  }, (_, bouge) => { if (bouge) { valider(); rendre() } })
}

// ─── Fils : tirer, lier, couper, reroutage ───────────────────────────────────────────────────────────

function tirerFil(broche, e) {
  const depuisSortie = Boolean(broche.dataset.sortie)
  const id = broche.dataset.noeud
  const demoId = broche.dataset.demo
  const origine = depuisSortie ? pointSortie(id) : pointEntree(id, demoId)
  toile.classList.add(depuisSortie ? 'tire-sortie' : 'tire-entree')
  suivre(e, (ev) => {
    const p = versMonde(ev)
    if (depuisSortie) dessinerTemp(origine, [p.x, p.y])
    else dessinerTemp([p.x, p.y], origine)
  }, (ev, bouge) => {
    toile.classList.remove('tire-sortie', 'tire-entree')
    filTemp.style.display = 'none'
    if (!bouge) return
    const cible = document.elementFromPoint(ev.clientX, ev.clientY)
    const p = versMonde(ev)
    if (depuisSortie) {
      const b = cible?.closest('.broche.entree')
      const n = cible?.closest('.noeud')
      if (b && b.dataset.noeud !== id) lier(id, b.dataset.noeud, b.dataset.demo)
      else if (n && n.dataset.id !== id && !cible.closest('.broche')) lier(id, n.dataset.id, '+')
      else if (!n && toile.contains(cible)) menuCreation(ev, p, { premisse: id })
    } else {
      const b = cible?.closest('.broche.sortie')
      const n = cible?.closest('.noeud')
      if (b && b.dataset.noeud !== id) lier(b.dataset.noeud, id, demoId)
      else if (n && n.dataset.id !== id && !cible.closest('.broche')) lier(n.dataset.id, id, demoId)
      else if (!n && toile.contains(cible)) menuCreation(ev, p, { conclusion: id, demoId })
    }
  })
}

function nouvelleDemo(noeudId, premisses) {
  const ids = M.tousIds(etat)
  const nb = demosDe(noeudId).length + 1
  const d = {
    id: M.nouvelId('d', ids), noeud_id: noeudId, nom_demonstration: `demonstration_${nb}`, justifie_par: [...premisses],
    demonstration: '', validite: 'a_verifier', confiance: null, auteur: 'camille', reroutes: {},
  }
  etat.demonstrations.push(d)
  valider()
  rendre()
  return d
}

function lier(premisse, conclusion, demoId) {
  if (premisse === conclusion) return
  if (demoId === '+' || !demo(demoId)) {
    const d = nouvelleDemo(conclusion, [premisse])
    sel = new Set([`f:${d.id}|${premisse}`])
  } else {
    const d = demo(demoId)
    if (!d.justifie_par.includes(premisse)) d.justifie_par.push(premisse)
    sel = new Set([`f:${d.id}|${premisse}`])
  }
  valider()
  rendre()
}

function couper(dId, p) {
  const d = demo(dId)
  if (!d) return
  d.justifie_par = d.justifie_par.filter((x) => x !== p)
  if (d.reroutes) delete d.reroutes[p]
  nettoyerSelection()
  valider()
  rendre()
}

function couperBroche(b) {
  const id = b.dataset.noeud
  if (b.dataset.sortie) {
    for (const d of etat.demonstrations) if (d.justifie_par.includes(id)) { d.justifie_par = d.justifie_par.filter((x) => x !== id); if (d.reroutes) delete d.reroutes[id] }
  } else if (b.dataset.demo !== '+') {
    const d = demo(b.dataset.demo)
    if (!d) return
    if (d.justifie_par.length) { d.justifie_par = []; d.reroutes = {} } else etat.demonstrations = etat.demonstrations.filter((x) => x !== d)
  }
  nettoyerSelection()
  valider()
  rendre()
}

function supprimerDemo(id) {
  etat.demonstrations = etat.demonstrations.filter((d) => d.id !== id)
  nettoyerSelection()
  valider()
  rendre()
}

function ajouterReroute(d, p, pt) {
  if (!d) return
  const pts = pointsFil(d, p)
  let meilleur = 0
  let dist = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const c = segment(pts[i], pts[i + 1])
    for (let u = 0; u <= 1; u += 0.05) {
      const [x, y] = pointBezier(c, u)
      const q = (x - pt.x) ** 2 + (y - pt.y) ** 2
      if (q < dist) { dist = q; meilleur = i }
    }
  }
  d.reroutes ??= {}
  d.reroutes[p] ??= []
  d.reroutes[p].splice(meilleur, 0, { x: Math.round(pt.x), y: Math.round(pt.y) })
  sel = new Set([`r:${d.id}|${p}|${meilleur}`])
  valider()
  rendre()
}

// ─── Création, suppression, duplication ──────────────────────────────────────────────────────────────

function nouvelleAssertion(x, y, { admis = false, nom = 'Nouvelle assertion' } = {}) {
  const n = { id: M.nouvelId('n', M.tousIds(etat)), nom, enonce: '', admis, x: caler(x), y: caler(y) }
  etat.noeuds.push(n)
  sel = new Set([`n:${n.id}`])
  return n
}

function creerPuisRenommer(n) {
  valider()
  rendre()
  renommerNoeud(n.id)
}

function supprimerSelection() {
  if (!sel.size) return
  const nIds = new Set(idsSel('n'))
  const cIds = new Set(idsSel('c'))
  const points = idsSel('r').map((k) => k.split('|')).sort((a, b) => Number(b[2]) - Number(a[2]))
  for (const [dId, p, i] of points) demo(dId)?.reroutes?.[p]?.splice(Number(i), 1)
  for (const k of idsSel('f')) {
    const [dId, p] = k.split('|')
    const d = demo(dId)
    if (d) { d.justifie_par = d.justifie_par.filter((x) => x !== p); if (d.reroutes) delete d.reroutes[p] }
  }
  etat.noeuds = etat.noeuds.filter((n) => !nIds.has(n.id))
  etat.demonstrations = etat.demonstrations.filter((d) => !nIds.has(d.noeud_id))
  for (const d of etat.demonstrations) {
    if (!d.justifie_par.some((p) => nIds.has(p))) continue
    d.justifie_par = d.justifie_par.filter((p) => !nIds.has(p))
    for (const p of nIds) if (d.reroutes) delete d.reroutes[p]
  }
  etat.commentaires = etat.commentaires.filter((c) => !cIds.has(c.id))
  sel.clear()
  valider()
  rendre()
}

function dupliquer() {
  const nIds = idsSel('n')
  const cIds = idsSel('c')
  if (!nIds.length && !cIds.length) return
  const ids = M.tousIds(etat)
  const D = 32
  const correspondance = new Map()
  const nouveaux = []
  for (const id of nIds) {
    const n = parId(id)
    const c = { ...structuredClone(n), id: M.nouvelId('n', ids), x: n.x + D, y: n.y + D }
    correspondance.set(id, c.id)
    etat.noeuds.push(c)
    nouveaux.push(`n:${c.id}`)
  }
  for (const d of [...etat.demonstrations]) {
    if (!correspondance.has(d.noeud_id)) continue
    const c = structuredClone(d)
    c.id = M.nouvelId('d', ids)
    c.noeud_id = correspondance.get(d.noeud_id)
    c.justifie_par = d.justifie_par.map((p) => correspondance.get(p) ?? p)
    c.reroutes = Object.fromEntries(Object.entries(d.reroutes ?? {}).map(([p, pts]) => [correspondance.get(p) ?? p, pts.map((r) => ({ x: r.x + D, y: r.y + D }))]))
    etat.demonstrations.push(c)
  }
  for (const id of cIds) {
    const c = commentaire(id)
    const k = { ...structuredClone(c), id: M.nouvelId('k', ids), x: c.x + D, y: c.y + D }
    etat.commentaires.push(k)
    nouveaux.push(`c:${k.id}`)
  }
  sel = new Set(nouveaux)
  valider()
  rendre()
}

function commentaireAutour() {
  const cles = new Set([...sel].filter((k) => !k.startsWith('c:')))
  const b = cles.size ? bornes(cles) : null
  const m = { cote: 32, haut: M.TITRE_COMMENT + 12, bas: 32 }
  const r = b
    ? { x: caler(b.x - m.cote), y: caler(b.y - m.haut), l: caler(b.l + 2 * m.cote), h: caler(b.h + m.haut + m.bas) }
    : { x: caler(pointeurMonde.x - 200), y: caler(pointeurMonde.y - 60), l: 400, h: 240 }
  const c = { id: M.nouvelId('k', M.tousIds(etat)), titre: 'Nouveau commentaire', couleur: '#64748b', ...r }
  etat.commentaires.push(c)
  sel = new Set([`c:${c.id}`])
  valider()
  rendre()
  renommerCommentaire(c.id)
}

function alignerSelection(sens) {
  const ns = idsSel('n').map(parId).filter(Boolean)
  if (ns.length < 2) return
  const h = (n) => hauteur(n.id)
  if (sens === 'haut') { const m = Math.min(...ns.map((n) => n.y)); for (const n of ns) n.y = m }
  else if (sens === 'bas') { const m = Math.max(...ns.map((n) => n.y + h(n))); for (const n of ns) n.y = m - h(n) }
  else if (sens === 'gauche') { const m = Math.min(...ns.map((n) => n.x)); for (const n of ns) n.x = m }
  else if (sens === 'droite') { const m = Math.max(...ns.map((n) => n.x)); for (const n of ns) n.x = m }
  else if (sens === 'repartir-h' && ns.length > 2) {
    ns.sort((a, b) => a.x - b.x)
    const pas = (ns.at(-1).x - ns[0].x) / (ns.length - 1)
    ns.forEach((n, i) => { n.x = caler(ns[0].x + i * pas) })
  } else if (sens === 'repartir-v' && ns.length > 2) {
    ns.sort((a, b) => a.y - b.y)
    const total = ns.at(-1).y + h(ns.at(-1)) - ns[0].y
    const ecart = (total - ns.reduce((s, n) => s + h(n), 0)) / (ns.length - 1)
    let y = ns[0].y
    for (const n of ns) { n.y = Math.round(y); y += h(n) + ecart }
  }
  valider()
  rendre()
}

// ─── Renommage en place ──────────────────────────────────────────────────────────────────────────────

function editerEnPlace(conteneur, valeur, surFin) {
  const champ = document.createElement('input')
  champ.className = 'renommage'
  champ.value = valeur
  champ.spellcheck = false
  conteneur.replaceChildren(champ)
  champ.focus()
  champ.select()
  let fini = false
  const finir = (ok) => {
    if (fini) return
    fini = true
    const v = champ.value.trim()
    champ.remove()
    surFin(ok && v && v !== valeur ? v : null)
  }
  champ.addEventListener('keydown', (ev) => {
    ev.stopPropagation()
    if (ev.key === 'Enter') finir(true)
    else if (ev.key === 'Escape') finir(false)
  })
  champ.addEventListener('blur', () => finir(true))
}

function renommerNoeud(id) {
  const el = elsNoeuds.get(id)
  const n = parId(id)
  if (!el || !n) return
  editerEnPlace(el.querySelector('.nom'), n.nom, (v) => {
    if (v) { n.nom = v; valider() }
    el.__sig = null
    rendre()
  })
}

function renommerCommentaire(id) {
  const el = elsComment.get(id)
  const c = commentaire(id)
  if (!el || !c) return
  editerEnPlace(el.querySelector('.c-nom'), c.titre, (v) => {
    if (v) { c.titre = v; valider() }
    el.querySelector('.c-nom').textContent = c.titre
    rendre()
  })
}

// ─── Menus contextuels ───────────────────────────────────────────────────────────────────────────────

function itemsAssertionsExistantes(groupe, action, exclure) {
  return etat.noeuds.filter((n) => n.id !== exclure).map((n) => ({ groupe, libelle: n.nom, couleur: STATUTS[statuts[n.id]].couleur, action: () => action(n) }))
}

function menuCreation(ev, p, { premisse, conclusion, demoId }) {
  const items = []
  if (premisse) {
    const src = parId(premisse)
    items.push(
      { groupe: 'Créer', libelle: `Nouvelle assertion démontrée par « ${src.nom} »`, action: () => {
        const n = nouvelleAssertion(p.x - BROCHE, p.y - TETE - PAD - RANG / 2)
        nouvelleDemo(n.id, [premisse])
        creerPuisRenommer(n)
      } },
      ...itemsAssertionsExistantes('Démontrer une assertion existante', (n) => lier(premisse, n.id, '+'), premisse),
    )
  } else {
    const cible = parId(conclusion)
    const brancher = (n) => lier(n.id, conclusion, demoId)
    items.push(
      { groupe: 'Créer', libelle: `Nouvelle prémisse de « ${cible.nom} »`, action: () => { const n = nouvelleAssertion(p.x - L + BROCHE, p.y - TETE - PAD - RANG / 2); brancher(n); renommerNoeud(n.id) } },
      { groupe: 'Créer', libelle: 'Nouveau fait admis comme prémisse', action: () => { const n = nouvelleAssertion(p.x - L + BROCHE, p.y - TETE - PAD - RANG / 2, { admis: true, nom: 'Nouveau fait' }); brancher(n); renommerNoeud(n.id) } },
      ...itemsAssertionsExistantes('Prendre comme prémisse', brancher, conclusion),
    )
  }
  ouvrirMenu({ x: ev.clientX, y: ev.clientY, titre: 'Actions pour ce fil', recherche: true, items })
}

function menuContextuel(cible, ev) {
  const p = versMonde(ev)
  const elNoeud = cible.closest('.noeud')
  const fil = cible.closest('.fil, .reroute')
  const titre = cible.closest('.c-titre, .c-poignee')

  if (elNoeud) {
    const id = elNoeud.dataset.id
    const n = parId(id)
    if (!sel.has(`n:${id}`)) { sel = new Set([`n:${id}`]); rendre() }
    ouvrirMenu({ x: ev.clientX, y: ev.clientY, titre: n.nom, items: [
      { groupe: 'Assertion', libelle: 'Renommer', touche: 'F2', action: () => renommerNoeud(id) },
      { groupe: 'Assertion', libelle: n.admis ? 'Ne plus admettre' : 'Admettre (fait, axiome)', action: () => { n.admis = !n.admis; valider(); rendre() } },
      { groupe: 'Assertion', libelle: 'Ajouter une démonstration', action: () => nouvelleDemo(id, []) },
      { groupe: 'Assertion', libelle: 'Couper tous les liens', action: () => {
        etat.demonstrations = etat.demonstrations.filter((d) => d.noeud_id !== id)
        for (const d of etat.demonstrations) if (d.justifie_par.includes(id)) { d.justifie_par = d.justifie_par.filter((x) => x !== id); if (d.reroutes) delete d.reroutes[id] }
        nettoyerSelection()
        valider()
        rendre()
      } },
      { groupe: 'Édition', libelle: 'Commentaire autour de la sélection', touche: 'C', action: commentaireAutour },
      { groupe: 'Édition', libelle: 'Dupliquer', touche: 'Ctrl+D', action: dupliquer },
      { groupe: 'Édition', libelle: 'Supprimer', touche: 'Suppr', action: supprimerSelection },
    ] })
    return
  }

  if (fil) {
    const cle = fil.dataset.fil ?? fil.dataset.cle.slice(2).split('|').slice(0, 2).join('|')
    const [dId, prem] = cle.split('|')
    const d = demo(dId)
    if (!d) return
    const k = fil.dataset.cle ?? `f:${cle}`
    if (!sel.has(k)) { sel = new Set([k]); rendre() }
    const valid = (v) => () => { d.validite = v; valider(); rendre() }
    ouvrirMenu({ x: ev.clientX, y: ev.clientY, titre: `${parId(prem)?.nom} → ${parId(d.noeud_id)?.nom}`, items: [
      { groupe: 'Fil', libelle: 'Ajouter un point de reroutage', action: () => ajouterReroute(d, prem, p) },
      ...(fil.dataset.cle ? [{ groupe: 'Fil', libelle: 'Supprimer ce point de reroutage', touche: 'Suppr', action: supprimerSelection }] : []),
      { groupe: 'Fil', libelle: 'Couper le lien', touche: 'Alt+clic', action: () => couper(dId, prem) },
      { groupe: 'Validité de la démonstration', libelle: 'Valide', couleur: 'var(--v-valide)', desactive: d.validite === 'valide', action: valid('valide') },
      { groupe: 'Validité de la démonstration', libelle: 'À vérifier', couleur: 'var(--v-a_verifier)', desactive: d.validite === 'a_verifier', action: valid('a_verifier') },
      { groupe: 'Validité de la démonstration', libelle: 'Invalide', couleur: 'var(--v-invalide)', desactive: d.validite === 'invalide', action: valid('invalide') },
    ] })
    return
  }

  if (titre) {
    const id = titre.closest('.commentaire').dataset.id
    const c = commentaire(id)
    if (!sel.has(`c:${id}`)) { sel = new Set([`c:${id}`]); rendre() }
    ouvrirMenu({ x: ev.clientX, y: ev.clientY, titre: c.titre, items: [
      { groupe: 'Commentaire', libelle: 'Renommer', touche: 'F2', action: () => renommerCommentaire(id) },
      { groupe: 'Commentaire', libelle: 'Ajuster au contenu', action: () => {
        const cles = new Set(contenus(c).map((n) => `n:${n.id}`))
        const b = bornes(cles)
        if (!b) return
        Object.assign(c, { x: caler(b.x - 32), y: caler(b.y - M.TITRE_COMMENT - 12), l: caler(b.l + 64), h: caler(b.h + M.TITRE_COMMENT + 44) })
        valider()
        rendre()
      } },
      { groupe: 'Commentaire', libelle: 'Supprimer la boîte (garder les assertions)', touche: 'Suppr', action: supprimerSelection },
      ...M.COULEURS.map((k) => ({ groupe: 'Couleur', libelle: k === c.couleur ? `${k} (actuelle)` : k, couleur: k, desactive: k === c.couleur, action: () => { c.couleur = k; valider(); rendre() } })),
    ] })
    return
  }

  ouvrirMenu({ x: ev.clientX, y: ev.clientY, titre: 'Toutes les actions', recherche: true, items: [
    { groupe: 'Assertion', libelle: 'Nouvelle assertion', action: () => creerPuisRenommer(nouvelleAssertion(p.x, p.y)) },
    { groupe: 'Assertion', libelle: 'Nouveau fait admis (mesure, axiome)', action: () => creerPuisRenommer(nouvelleAssertion(p.x, p.y, { admis: true, nom: 'Nouveau fait' })) },
    { groupe: 'Organisation', libelle: sel.size ? 'Commentaire autour de la sélection' : 'Nouvelle boîte Comment', touche: 'C', action: commentaireAutour },
    { groupe: 'Organisation', libelle: 'Aligner en haut', touche: 'Maj+W', desactive: idsSel('n').length < 2, action: () => alignerSelection('haut') },
    { groupe: 'Organisation', libelle: 'Aligner à gauche', touche: 'Maj+A', desactive: idsSel('n').length < 2, action: () => alignerSelection('gauche') },
    { groupe: 'Organisation', libelle: 'Aligner en bas', touche: 'Maj+S', desactive: idsSel('n').length < 2, action: () => alignerSelection('bas') },
    { groupe: 'Organisation', libelle: 'Aligner à droite', touche: 'Maj+D', desactive: idsSel('n').length < 2, action: () => alignerSelection('droite') },
    { groupe: 'Organisation', libelle: 'Répartir horizontalement', touche: 'Maj+H', desactive: idsSel('n').length < 3, action: () => alignerSelection('repartir-h') },
    { groupe: 'Organisation', libelle: 'Répartir verticalement', touche: 'Maj+V', desactive: idsSel('n').length < 3, action: () => alignerSelection('repartir-v') },
    { groupe: 'Édition', libelle: 'Tout sélectionner', touche: 'Ctrl+A', action: toutSelectionner },
    { groupe: 'Édition', libelle: 'Annuler', touche: 'Ctrl+Z', desactive: !historique.peutAnnuler, action: annuler },
    { groupe: 'Édition', libelle: 'Rétablir', touche: 'Ctrl+Y', desactive: !historique.peutRetablir, action: retablir },
    { groupe: 'Vue', libelle: 'Cadrer tout', touche: 'F', action: () => cadrer() },
    { groupe: 'Vue', libelle: 'Zoom 1:1', action: () => zoomer(ev.clientX - toile.getBoundingClientRect().left, ev.clientY - toile.getBoundingClientRect().top, 1 / vue.k) },
    { groupe: 'Vue', libelle: 'Réinitialiser l’exemple', action: reinitialiserExemple },
    ...etat.noeuds.map((n) => ({ groupe: 'Aller à', libelle: n.nom, couleur: STATUTS[statuts[n.id]].couleur, action: () => selectionner([`n:${n.id}`], true) })),
  ] })
}

function toutSelectionner() {
  sel = new Set([...etat.noeuds.map((n) => `n:${n.id}`), ...etat.commentaires.map((c) => `c:${c.id}`)])
  rendre()
}

function selectionner(cles, centrer = false) {
  sel = new Set(cles)
  rendre()
  if (centrer) {
    const b = bornes(sel)
    if (b) centrerSur(b.x + b.l / 2, b.y + b.h / 2)
  }
}

// ─── Clavier ─────────────────────────────────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (menuOuvert() || e.target.closest?.('input, textarea, select, [contenteditable]')) return
  const ctrl = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  if (ctrl && k === 'z') { e.preventDefault(); e.shiftKey ? retablir() : annuler(); return }
  if (ctrl && k === 'y') { e.preventDefault(); retablir(); return }
  if (ctrl && k === 'd') { e.preventDefault(); dupliquer(); return }
  if (ctrl && k === 'a') { e.preventDefault(); toutSelectionner(); return }
  if (ctrl || e.altKey) return
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); supprimerSelection(); return }
  if (e.key === 'Escape') { if (sel.size) { sel.clear(); rendre() } return }
  if (e.key === 'F2') {
    e.preventDefault()
    const [cle] = sel
    if (sel.size === 1 && cle.startsWith('n:')) renommerNoeud(cle.slice(2))
    if (sel.size === 1 && cle.startsWith('c:')) renommerCommentaire(cle.slice(2))
    return
  }
  if (e.shiftKey) {
    const sens = { w: 'haut', a: 'gauche', s: 'bas', d: 'droite', h: 'repartir-h', v: 'repartir-v' }[k]
    if (sens) { e.preventDefault(); alignerSelection(sens) }
    return
  }
  if (k === 'c') { e.preventDefault(); commentaireAutour() }
  else if (k === 'f') { e.preventDefault(); cadrer(sel.size ? sel : null) }
})

// ─── Barre d'outils ──────────────────────────────────────────────────────────────────────────────────

document.querySelector('.barre').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-outil]')
  if (!b) return
  const o = b.dataset.outil
  if (o === 'annuler') annuler()
  else if (o === 'retablir') retablir()
  else if (o === 'commentaire') commentaireAutour()
  else if (o === 'cadrer') cadrer(sel.size ? sel : null)
  else if (o === 'reinitialiser') reinitialiserExemple()
  else alignerSelection(o)
})

function majBoutons() {
  const nb = idsSel('n').length
  for (const b of document.querySelectorAll('.barre button[data-outil]')) {
    const o = b.dataset.outil
    b.disabled = o === 'annuler' ? !historique.peutAnnuler
      : o === 'retablir' ? !historique.peutRetablir
        : o.startsWith('repartir') ? nb < 3
          : ['haut', 'bas', 'gauche', 'droite'].includes(o) ? nb < 2 : false
  }
}

// ─── Panneau Détails ─────────────────────────────────────────────────────────────────────────────────

const details = creerPanneau(document.querySelector('.details'), {
  etat: () => etat,
  sel: () => sel,
  statuts: () => statuts,
  parId, demo, commentaire, demosDe, categorieDe, contenus,
  modifie: () => rendre({ panneau: false }),
  valider,
  rendre: () => rendre(),
  selectionner,
  couper,
  supprimerDemo,
  nouvelleDemo,
  aligner: alignerSelection,
  commentaireAutour,
  dupliquer,
  supprimerSelection,
})

// ─── Démarrage ───────────────────────────────────────────────────────────────────────────────────────

vue ??= { x: 0, y: 0, k: 1 }
rendre()
if (aDisposer) {
  M.disposer(etat, categoriesExemple, hauteur)
  rendre()
  historique = M.creerHistorique(etat)
  majBoutons()
  cadrer()
} else appliquerVue()
new ResizeObserver(() => dessinerMiniCarte()).observe(toile)
