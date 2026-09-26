// Graphe de logique : éditeur façon Blueprint d'Unreal Engine, en thème clair.
// - nœud = assertion (en-tête coloré par genre, broche de sortie à droite de l'en-tête) ;
// - chaque démonstration est un groupe de broches d'entrée dans le nœud qu'elle démontre : une broche
//   par prémisse, plus une broche libre pour en ajouter ; la broche « + démonstration » en crée une ;
// - fil = prémisse → démonstration, coloré par la validité de la démonstration ;
// - boîtes « Comment » = catégories ; statuts recalculés à chaque modification (calculerStatuts).

import { STATUTS, VALIDITES } from '../../commun/raisonnement.js'
import * as M from './modele.js'

const { E, GENRES, PALETTE, L, MARGE_COM, aimanter } = M

const ZOOM_MIN = 0.2
const ZOOM_MAX = 2
const CLE_VUE = 'atlas.logique-d.vue'
const NS = 'http://www.w3.org/2000/svg'
const NOMS_NOUVEAUX = { assertion: 'Nouvelle assertion', fait: 'Nouveau fait', hypothese: 'Nouvelle hypothèse', conclusion: 'Nouvelle conclusion' }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]))
const fmtConf = (c) => c == null ? '—' : c.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const borne = (v, a, b) => Math.min(b, Math.max(a, v))
const normaliser = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ─── Squelette ───────────────────────────────────────────────────────────────────────────────────────

const ligneLegende = (couleur, tirets) => `<svg width="26" height="6"><path d="M1 3H25" stroke="${couleur}" stroke-width="2"${tirets ? ' stroke-dasharray="6 4"' : ''}/></svg>`

const editeur = document.querySelector('.editeur')
editeur.innerHTML = `
  <div class="toile">
    <div class="filigrane">LOGIQUE</div>
    <div class="monde">
      <div class="couche-com"></div>
      <svg class="fils"><g class="g-liens"></g><path class="fil-temp" style="display:none"/></svg>
      <div class="couche-noeuds"></div>
    </div>
    <div class="infos">
      <span>${ligneLegende(VALIDITES.valide.couleur)}valide</span>
      <span>${ligneLegende(VALIDITES.a_verifier.couleur, true)}à vérifier</span>
      <span>${ligneLegende(VALIDITES.invalide.couleur)}invalide</span>
      <span class="zoom"></span>
    </div>
    <div class="lasso" hidden></div>
    <div class="bulle" hidden></div>
  </div>
  <aside class="details">
    <div class="d-onglet">Détails<small></small></div>
    <div class="d-corps"></div>
  </aside>
  <div class="voile">
    <div class="aide" role="dialog" aria-label="Raccourcis">
      <header>Raccourcis de l’éditeur<button data-fermer title="Fermer (Échap)">×</button></header>
      <div class="grille">
        <div>
          <h4>Navigation</h4>
          <dl>
            <div><dt>Se déplacer</dt><dd><kbd>clic droit</kbd> ou <kbd>molette</kbd> maintenus</dd></div>
            <div><dt>Se déplacer (pavé tactile)</dt><dd><kbd>Espace</kbd> + glisser</dd></div>
            <div><dt>Zoomer sur le curseur</dt><dd><kbd>molette</kbd></dd></div>
            <div><dt>Cadrer la sélection ou tout</dt><dd><kbd>F</kbd></dd></div>
            <div><dt>Tout cadrer</dt><dd><kbd>Origine</kbd></dd></div>
          </dl>
          <h4>Sélection</h4>
          <dl>
            <div><dt>Sélectionner</dt><dd><kbd>clic</kbd></dd></div>
            <div><dt>Ajouter / basculer</dt><dd><kbd>Maj</kbd> / <kbd>Ctrl</kbd> + clic</dd></div>
            <div><dt>Rectangle de sélection</dt><dd>glisser sur le fond</dd></div>
            <div><dt>Tout sélectionner</dt><dd><kbd>Ctrl</kbd> <kbd>A</kbd></dd></div>
            <div><dt>Désélectionner</dt><dd><kbd>Échap</kbd></dd></div>
          </dl>
        </div>
        <div>
          <h4>Nœuds et liaisons</h4>
          <dl>
            <div><dt>Créer un nœud</dt><dd><kbd>clic droit</kbd> sur le fond</dd></div>
            <div><dt>Relier (prémisse → démonstration)</dt><dd>glisser de broche à broche</dd></div>
            <div><dt>Créer un nœud relié</dt><dd>relâcher un fil dans le vide</dd></div>
            <div><dt>Couper les liens d’une broche</dt><dd><kbd>Alt</kbd> + clic</dd></div>
            <div><dt>Renommer</dt><dd>double-clic ou <kbd>F2</kbd></dd></div>
            <div><dt>Dupliquer</dt><dd><kbd>Ctrl</kbd> <kbd>D</kbd></dd></div>
            <div><dt>Supprimer</dt><dd><kbd>Suppr</kbd></dd></div>
          </dl>
          <h4>Catégories et historique</h4>
          <dl>
            <div><dt>Commentaire autour de la sélection</dt><dd><kbd>C</kbd></dd></div>
            <div><dt>Redimensionner</dt><dd>glisser un bord ou le coin</dd></div>
            <div><dt>Annuler / rétablir</dt><dd><kbd>Ctrl</kbd> <kbd>Z</kbd> / <kbd>Ctrl</kbd> <kbd>Y</kbd></dd></div>
          </dl>
        </div>
      </div>
    </div>
  </div>
`

const toile = editeur.querySelector('.toile')
const monde = editeur.querySelector('.monde')
const coucheCom = editeur.querySelector('.couche-com')
const coucheNoeuds = editeur.querySelector('.couche-noeuds')
const gLiens = editeur.querySelector('.g-liens')
const filTemp = editeur.querySelector('.fil-temp')
const lasso = editeur.querySelector('.lasso')
const bulle = editeur.querySelector('.bulle')
const zoomInfo = editeur.querySelector('.zoom')
const corps = editeur.querySelector('.d-corps')
const ongletType = editeur.querySelector('.d-onglet small')
const voile = editeur.querySelector('.voile')
const barre = document.querySelector('.barre')
const B = Object.fromEntries([...barre.querySelectorAll('[data-b]')].map((b) => [b.dataset.b, b]))

// ─── Vue : déplacement et zoom ───────────────────────────────────────────────────────────────────────

let vue = { x: 0, y: 0, k: 1 }
let aimant = true
let minuterieVue = null

function appliquerVue() {
  monde.style.transform = `translate(${vue.x}px,${vue.y}px) scale(${vue.k})`
  const g = 128 * vue.k
  const f = 16 * vue.k
  toile.style.backgroundSize = `${g}px ${g}px, ${g}px ${g}px, ${f}px ${f}px, ${f}px ${f}px`
  toile.style.backgroundPosition = `${vue.x}px ${vue.y}px`
  // Les titres de catégories grossissent quand on dézoome, pour rester lisibles en vue d'ensemble.
  monde.style.setProperty('--et', borne(0.62 / vue.k, 1, 2.4).toFixed(3))
  zoomInfo.textContent = `Zoom ${Math.round(vue.k * 100)} %`
  clearTimeout(minuterieVue)
  minuterieVue = setTimeout(() => {
    try { localStorage.setItem(CLE_VUE, JSON.stringify({ vue, aimant })) } catch { /* sans conséquence */ }
  }, 300)
}

function versMonde(cx, cy) {
  const r = toile.getBoundingClientRect()
  return { x: (cx - r.left - vue.x) / vue.k, y: (cy - r.top - vue.y) / vue.k }
}

function zoomer(facteur, cx, cy) {
  const r = toile.getBoundingClientRect()
  const k = borne(vue.k * facteur, ZOOM_MIN, ZOOM_MAX)
  const sx = cx - r.left
  const sy = cy - r.top
  vue = { x: sx - (sx - vue.x) * k / vue.k, y: sy - (sy - vue.y) * k / vue.k, k }
  appliquerVue()
}

let idAnimation = 0
function allerVers(cible, anime = true) {
  const id = ++idAnimation
  if (!anime || document.hidden) { vue = cible; appliquerVue(); return }
  const depart = { ...vue }
  const t0 = performance.now()
  const pas = (t) => {
    if (id !== idAnimation) return
    const u = Math.min(1, (t - t0) / 260)
    const e = 1 - (1 - u) ** 3
    vue = { x: depart.x + (cible.x - depart.x) * e, y: depart.y + (cible.y - depart.y) * e, k: depart.k + (cible.k - depart.k) * e }
    appliquerVue()
    if (u < 1) requestAnimationFrame(pas)
  }
  requestAnimationFrame(pas)
}

function cadrerBoite(b, anime = true) {
  if (!b) return
  const lw = toile.clientWidth
  const lh = toile.clientHeight
  const k = borne(Math.min((lw - 96) / b.l, (lh - 130) / b.h, 1), ZOOM_MIN, ZOOM_MAX)
  allerVers({ k, x: (lw - b.l * k) / 2 - b.x * k, y: (lh - 40 - b.h * k) / 2 - b.y * k }, anime)
}

function centrerSur(b) {
  const lw = toile.clientWidth
  const lh = toile.clientHeight
  const sx = b.x * vue.k + vue.x
  const sy = b.y * vue.k + vue.y
  const visible = sx > 20 && sy > 20 && sx + b.l * vue.k < lw - 20 && sy + b.h * vue.k < lh - 50
  if (visible) return
  allerVers({ k: vue.k, x: lw / 2 - (b.x + b.l / 2) * vue.k, y: lh / 2 - (b.y + b.h / 2) * vue.k })
}

function englobe(boites) {
  if (!boites.length) return null
  const x0 = Math.min(...boites.map((b) => b.x))
  const y0 = Math.min(...boites.map((b) => b.y))
  const x1 = Math.max(...boites.map((b) => b.x + b.l))
  const y1 = Math.max(...boites.map((b) => b.y + b.h))
  return { x: x0, y: y0, l: x1 - x0, h: y1 - y0 }
}

const boiteNoeud = (n) => ({ x: n.x, y: n.y, l: L, h: rendus.get(n.id)?.h ?? 120 })
const boiteCom = (c) => ({ x: c.x, y: c.y, l: c.l, h: c.h })

function cadrerTout(anime = true) {
  cadrerBoite(englobe([...E.g.noeuds.map(boiteNoeud), ...E.g.commentaires.map(boiteCom)]), anime)
}

function boiteSelection() {
  const ids = new Set(sel.noeuds)
  const d = M.demo(sel.lien?.demo ?? sel.demo)
  if (d) { ids.add(d.noeud_id); if (sel.lien) ids.add(sel.lien.p) }
  return englobe([
    ...[...ids].map((id) => M.noeud(id)).filter(Boolean).map(boiteNoeud),
    ...[...sel.coms].map((id) => M.commentaire(id)).filter(Boolean).map(boiteCom),
  ])
}

function cadrerSelection() {
  const b = boiteSelection()
  if (b) cadrerBoite(b)
  else cadrerTout()
}

// ─── Sélection ───────────────────────────────────────────────────────────────────────────────────────

const sel = { noeuds: new Set(), coms: new Set(), demo: null, lien: null }

function vider() {
  sel.noeuds.clear()
  sel.coms.clear()
  sel.demo = null
  sel.lien = null
}

const selVide = () => !sel.noeuds.size && !sel.coms.size && !sel.demo && !sel.lien

function purgerSelection() {
  for (const id of sel.noeuds) if (!M.noeud(id)) sel.noeuds.delete(id)
  for (const id of sel.coms) if (!M.commentaire(id)) sel.coms.delete(id)
  if (sel.demo && !M.demo(sel.demo)) sel.demo = null
  if (sel.lien && !M.demo(sel.lien.demo)?.justifie_par.includes(sel.lien.p)) sel.lien = null
}

function choisir(ensemble, id, mods = {}) {
  sel.demo = null
  sel.lien = null
  if (mods.ctrl) { if (ensemble.has(id)) ensemble.delete(id); else ensemble.add(id) } else if (mods.maj) ensemble.add(id)
  else { vider(); ensemble.add(id) }
}

const mods = (e) => ({ ctrl: e.ctrlKey || e.metaKey, maj: e.shiftKey })

// Nœuds et boîtes entièrement contenus dans une boîte « Comment ».
const dedans = (b, c) => b.x >= c.x && b.y >= c.y && b.x + b.l <= c.x + c.l && b.y + b.h <= c.y + c.h
const noeudsDans = (c) => E.g.noeuds.filter((n) => dedans(boiteNoeud(n), c))
const comsDans = (c) => E.g.commentaires.filter((x) => x !== c && dedans(x, c))

// ─── Rendu ───────────────────────────────────────────────────────────────────────────────────────────

const rendus = new Map() // id de nœud → { el, html, pins, h }
const boites = new Map() // id de commentaire → { el, nom, compte }
const liens = new Map() // `${demo}|${premisse}` → { g, zone, fil, titre }
let st = {}
let enRenommage = null

function htmlNoeud(n, ds, s, noms, utilise) {
  const G = GENRES[n.genre] || GENRES.assertion
  const S = STATUTS[s]
  const groupes = ds.map((d) => {
    const V = VALIDITES[d.validite]
    const premisses = d.justifie_par.map((p) => `<div class="rang prem"><span class="pin entree plein" data-pin="p:${d.id}:${p}"><i></i></span><span class="lab">${esc(noms.get(p))}</span></div>`).join('')
    return `<div class="demo" data-demo="${d.id}" style="--v:${V.couleur}">`
      + `<div class="rang d-tete" title="${esc(d.demonstration || d.nom_demonstration)}"><span class="pin entree" data-pin="d:${d.id}" title="Déposer ici une prémisse supplémentaire"><i></i></span>`
      + `<span class="lab">${esc(d.nom_demonstration)}</span><span class="val">${V.libelle} · ${fmtConf(d.confiance)}</span></div>${premisses}</div>`
  }).join('')
  const nouvelle = n.admis ? '' : '<div class="rang nouv"><span class="pin entree" data-pin="nouv" title="Déposer une prémisse : nouvelle démonstration"><i></i></span><span class="lab">+ démonstration</span></div>'
  return `<div class="tete"><span class="ico">${G.icone}</span><div class="tt"><span class="nom" title="${esc(n.nom)}">${esc(n.nom)}</span><small>${G.libelle}</small></div>`
    + `<span class="pin sortie${utilise ? ' plein' : ''}" data-pin="out" title="Glisser vers une entrée : utiliser comme prémisse"><i></i></span></div>`
    + `<p class="enonce" title="${esc(n.enonce)}">${esc(n.enonce)}</p>${groupes}${nouvelle}`
    + `<div class="pied" style="--s:${S.couleur}"><i class="carre"></i>${S.libelle}<span class="id">${esc(n.id)}</span></div>`
}

// Position des broches relativement au nœud, en unités du monde.
function mesurer(r) {
  const base = r.el.getBoundingClientRect()
  r.pins = new Map()
  for (const p of r.el.querySelectorAll('[data-pin]')) {
    const b = p.getBoundingClientRect()
    r.pins.set(p.dataset.pin, { x: (b.left + b.width / 2 - base.left) / vue.k, y: (b.top + b.height / 2 - base.top) / vue.k })
  }
  r.h = r.el.offsetHeight
}

function remesurer() {
  for (const r of rendus.values()) mesurer(r)
  majFils()
}

const placerNoeud = (n) => { const r = rendus.get(n.id); if (r) r.el.style.transform = `translate(${n.x}px,${n.y}px)` }

function placerCom(c) {
  const o = boites.get(c.id)
  if (!o) return
  o.el.style.transform = `translate(${c.x}px,${c.y}px)`
  o.el.style.width = `${c.l}px`
  o.el.style.height = `${c.h}px`
}

function rendre() {
  const g = E.g
  purgerSelection()
  st = M.statuts()
  const noms = new Map(g.noeuds.map((n) => [n.id, n.nom]))
  const parNoeud = new Map(g.noeuds.map((n) => [n.id, []]))
  for (const d of g.demonstrations) parNoeud.get(d.noeud_id)?.push(d)
  const premisses = new Set(g.demonstrations.flatMap((d) => d.justifie_par))
  const demoChoisie = sel.lien?.demo ?? sel.demo

  const vus = new Set()
  for (const n of g.noeuds) {
    vus.add(n.id)
    let r = rendus.get(n.id)
    if (!r) {
      const el = document.createElement('div')
      el.dataset.id = n.id
      coucheNoeuds.append(el)
      r = { el, pins: new Map(), h: 0 }
      rendus.set(n.id, r)
    }
    r.el.className = `noeud s-${st[n.id]}${sel.noeuds.has(n.id) ? ' choisi' : ''}`
    r.el.style.setProperty('--c', (GENRES[n.genre] || GENRES.assertion).couleur)
    const html = htmlNoeud(n, parNoeud.get(n.id), st[n.id], noms, premisses.has(n.id))
    if (r.html !== html && r !== enRenommage) { r.html = html; r.el.innerHTML = html; mesurer(r) }
    for (const el of r.el.querySelectorAll('.demo')) el.classList.toggle('choisie', el.dataset.demo === demoChoisie)
    placerNoeud(n)
  }
  for (const [id, r] of rendus) if (!vus.has(id)) { r.el.remove(); rendus.delete(id) }

  // Les grandes boîtes derrière les petites.
  const ordre = [...g.commentaires].sort((a, b) => b.l * b.h - a.l * a.h)
  const vusC = new Set()
  ordre.forEach((c, i) => {
    vusC.add(c.id)
    let o = boites.get(c.id)
    if (!o) {
      const el = document.createElement('div')
      el.className = 'commentaire'
      el.dataset.id = c.id
      el.innerHTML = '<div class="c-titre"><span class="c-nom"></span><small></small></div>'
        + '<i data-poignee="e"></i><i data-poignee="w"></i><i data-poignee="s"></i><i data-poignee="se"></i><i data-poignee="sw"></i>'
      coucheCom.append(el)
      o = { el, nom: el.querySelector('.c-nom'), compte: el.querySelector('small') }
      boites.set(c.id, o)
    }
    if (o !== enRenommage) { o.nom.textContent = c.titre; o.nom.title = c.titre }
    const nb = noeudsDans(c).length
    o.compte.textContent = nb ? `${nb} nœud${nb > 1 ? 's' : ''}` : ''
    o.el.style.setProperty('--c', c.couleur)
    o.el.style.zIndex = String(i)
    o.el.classList.toggle('choisi', sel.coms.has(c.id))
    placerCom(c)
  })
  for (const [id, o] of boites) if (!vusC.has(id)) { o.el.remove(); boites.delete(id) }

  majFils()
  majPanneau()
  majBarre()
  M.sauverBientot()
}

// ─── Fils ────────────────────────────────────────────────────────────────────────────────────────────

function courbe(x0, y0, x1, y1) {
  const dx = Math.max(56, Math.abs(x1 - x0) * 0.5)
  const f = (v) => v.toFixed(1)
  return `M${f(x0)},${f(y0)}C${f(x0 + dx)},${f(y0)} ${f(x1 - dx)},${f(y1)} ${f(x1)},${f(y1)}`
}

function majFils() {
  const vus = new Set()
  const demoChoisie = sel.lien?.demo ?? sel.demo
  for (const d of E.g.demonstrations) {
    const nc = M.noeud(d.noeud_id)
    const rc = rendus.get(d.noeud_id)
    if (!nc || !rc) continue
    for (const p of d.justifie_par) {
      const np = M.noeud(p)
      const rp = rendus.get(p)
      const a = rp?.pins.get('out')
      const b = rc.pins.get(`p:${d.id}:${p}`)
      if (!np || !a || !b) continue
      const cle = `${d.id}|${p}`
      vus.add(cle)
      let f = liens.get(cle)
      if (!f) {
        const g = document.createElementNS(NS, 'g')
        const titre = document.createElementNS(NS, 'title')
        const zone = document.createElementNS(NS, 'path')
        const fil = document.createElementNS(NS, 'path')
        zone.setAttribute('class', 'fil-zone')
        g.append(titre, zone, fil)
        gLiens.append(g)
        f = { g, zone, fil, titre }
        liens.set(cle, f)
      }
      const chemin = courbe(np.x + a.x, np.y + a.y, nc.x + b.x, nc.y + b.y)
      if (f.d !== chemin) { f.d = chemin; f.zone.setAttribute('d', chemin); f.fil.setAttribute('d', chemin) }
      const choisi = (sel.lien && sel.lien.demo === d.id && sel.lien.p === p) || (!sel.lien && demoChoisie === d.id)
      const proche = sel.noeuds.has(p) || sel.noeuds.has(d.noeud_id)
      f.g.setAttribute('class', `lien${choisi ? ' choisi' : ''}${proche ? ' proche' : ''}`)
      f.fil.setAttribute('class', `fil v-${d.validite}`)
      f.g.dataset.demo = d.id
      f.g.dataset.p = p
      f.titre.textContent = `${np.nom} → ${nc.nom}\n${d.nom_demonstration} · ${VALIDITES[d.validite].libelle} · confiance ${fmtConf(d.confiance)}`
    }
  }
  for (const [cle, f] of liens) if (!vus.has(cle)) { f.g.remove(); liens.delete(cle) }
}

// ─── Déplacements visuels pendant un geste ───────────────────────────────────────────────────────────

function collecter() {
  const ns = new Set(sel.noeuds)
  const cs = new Set(sel.coms)
  for (const id of sel.coms) {
    const c = M.commentaire(id)
    if (!c) continue
    for (const n of noeudsDans(c)) ns.add(n.id)
    for (const x of comsDans(c)) cs.add(x.id)
  }
  return {
    noeuds: [...ns].map((id) => M.noeud(id)).filter(Boolean).map((o) => ({ o, x: o.x, y: o.y })),
    coms: [...cs].map((id) => M.commentaire(id)).filter(Boolean).map((o) => ({ o, x: o.x, y: o.y })),
  }
}

function deplacer(items, dx, dy) {
  for (const it of items.noeuds) { it.o.x = it.x + dx; it.o.y = it.y + dy; placerNoeud(it.o) }
  for (const it of items.coms) { it.o.x = it.x + dx; it.o.y = it.y + dy; placerCom(it.o) }
  majFils()
}

// ─── Gestes de la souris ─────────────────────────────────────────────────────────────────────────────

let geste = null
let espace = false
let surbrillance = []

toile.addEventListener('contextmenu', (e) => e.preventDefault())
toile.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault() })

toile.addEventListener('wheel', (e) => {
  if (e.target.closest('.menu')) return
  e.preventDefault()
  if (menu && !menu.attente) fermerMenu()
  const pas = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
  zoomer(Math.exp(-pas * 0.0015), e.clientX, e.clientY)
}, { passive: false })

toile.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.menu, .infos, .renomme')) return
  if (menu) fermerMenu()
  const base = { x0: e.clientX, y0: e.clientY, bouge: false, mods: mods(e) }
  if (e.button === 1 || e.button === 2 || (e.button === 0 && espace)) {
    geste = { ...base, type: 'pan', vx: vue.x, vy: vue.y, bouton: e.button, cible: e.target }
    e.preventDefault()
  } else if (e.button === 0) {
    const pin = e.target.closest('[data-pin]')
    const noeudEl = e.target.closest('.noeud')
    const poignee = e.target.closest('[data-poignee]')
    const titre = e.target.closest('.c-titre')
    const lienEl = e.target.closest('.lien')
    if (pin && noeudEl) {
      if (e.altKey) { couperBroche(noeudEl.dataset.id, pin.dataset.pin); return }
      geste = { ...base, ...debutFil(noeudEl.dataset.id, pin.dataset.pin) }
      toile.classList.add('relie')
    } else if (noeudEl) {
      geste = { ...base, type: 'noeud', id: noeudEl.dataset.id, demo: e.target.closest('.demo')?.dataset.demo ?? null }
    } else if (poignee) {
      const c = M.commentaire(poignee.closest('.commentaire').dataset.id)
      geste = { ...base, type: 'redim', c, dir: poignee.dataset.poignee, depart: boiteCom(c), avant: M.instantane() }
    } else if (titre) {
      geste = { ...base, type: 'com', id: titre.closest('.commentaire').dataset.id }
    } else if (lienEl) {
      choisirLien(lienEl.dataset.demo, lienEl.dataset.p)
      return
    } else {
      geste = { ...base, type: 'lasso', base: new Set(sel.noeuds), baseC: new Set(sel.coms) }
    }
  } else return
  try { toile.setPointerCapture(e.pointerId) } catch { /* pointeur synthétique */ }
})

toile.addEventListener('pointermove', (e) => {
  if (!geste) return
  const g = geste
  const dx = e.clientX - g.x0
  const dy = e.clientY - g.y0
  if (g.type === 'fil') { majFilTemp(g, e); return }
  if (!g.bouge) {
    if (Math.hypot(dx, dy) < 4) return
    g.bouge = true
    demarrerGeste(g)
  }
  const wx = dx / vue.k
  const wy = dy / vue.k
  if (g.type === 'pan') {
    vue = { ...vue, x: g.vx + dx, y: g.vy + dy }
    appliquerVue()
  } else if (g.type === 'noeud' || g.type === 'com') {
    let ddx = wx
    let ddy = wy
    if (aimant && g.ancre) {
      ddx = aimanter(g.ancre.x + wx) - g.ancre.x
      ddy = aimanter(g.ancre.y + wy) - g.ancre.y
    }
    deplacer(g.items, ddx, ddy)
  } else if (g.type === 'redim') {
    redimensionner(g, wx, wy)
  } else if (g.type === 'lasso') {
    majLasso(g, e)
  }
})

function demarrerGeste(g) {
  if (g.type === 'pan') { toile.classList.add('pan'); return }
  if (g.type === 'noeud' || g.type === 'com') {
    const ens = g.type === 'noeud' ? sel.noeuds : sel.coms
    if (!ens.has(g.id)) {
      if (!g.mods.ctrl && !g.mods.maj) vider()
      sel.demo = null
      sel.lien = null
      ens.add(g.id)
      rendre()
    }
    g.avant = M.instantane()
    g.items = collecter()
    const ancre = g.type === 'noeud' ? M.noeud(g.id) : M.commentaire(g.id)
    g.ancre = ancre && { x: ancre.x, y: ancre.y }
    toile.classList.add('deplace')
  }
}

function terminer(e, annule = false) {
  const g = geste
  geste = null
  toile.classList.remove('pan', 'deplace', 'relie')
  if (!g) return
  if (g.type === 'pan') {
    if (!g.bouge && g.bouton === 2 && !annule) menuContextuel(e, g.cible)
  } else if (g.type === 'noeud' || g.type === 'com') {
    if (g.bouge) {
      if (M.instantane() !== g.avant) M.pousser(g.avant)
      rendre()
    } else if (!annule) {
      if (g.type === 'noeud' && g.demo && !g.mods.ctrl && !g.mods.maj) { vider(); sel.demo = g.demo } else choisir(g.type === 'noeud' ? sel.noeuds : sel.coms, g.id, g.mods)
      rendre()
    }
  } else if (g.type === 'redim') {
    if (M.instantane() !== g.avant) M.pousser(g.avant)
    rendre()
  } else if (g.type === 'lasso') {
    lasso.hidden = true
    if (!g.bouge && !g.mods.ctrl && !g.mods.maj) { vider(); rendre() }
  } else if (g.type === 'fil') {
    finFil(g, e, annule)
  }
}

toile.addEventListener('pointerup', (e) => terminer(e))
toile.addEventListener('pointercancel', (e) => terminer(e, true))

function redimensionner(g, wx, wy) {
  const d = g.depart
  const c = g.c
  const MIN_L = 160
  const MIN_H = 96
  if (g.dir.includes('e')) {
    let droite = Math.max(d.x + MIN_L, d.x + d.l + wx)
    if (aimant) droite = Math.max(d.x + MIN_L, aimanter(droite))
    c.l = droite - d.x
  }
  if (g.dir.includes('w')) {
    let gauche = Math.min(d.x + d.l - MIN_L, d.x + wx)
    if (aimant) gauche = Math.min(d.x + d.l - MIN_L, aimanter(gauche))
    c.x = gauche
    c.l = d.x + d.l - gauche
  }
  if (g.dir.includes('s')) {
    let bas = Math.max(d.y + MIN_H, d.y + d.h + wy)
    if (aimant) bas = Math.max(d.y + MIN_H, aimanter(bas))
    c.h = bas - d.y
  }
  placerCom(c)
}

function majLasso(g, e) {
  const r = toile.getBoundingClientRect()
  const x0 = Math.min(g.x0, e.clientX)
  const y0 = Math.min(g.y0, e.clientY)
  const x1 = Math.max(g.x0, e.clientX)
  const y1 = Math.max(g.y0, e.clientY)
  Object.assign(lasso.style, { left: `${x0 - r.left}px`, top: `${y0 - r.top}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` })
  lasso.hidden = false
  const a = versMonde(x0, y0)
  const b = versMonde(x1, y1)
  const zone = { x: a.x, y: a.y, l: b.x - a.x, h: b.y - a.y }
  const coupe = (n) => n.x < zone.x + zone.l && n.x + L > zone.x && n.y < zone.y + zone.h && n.y + (rendus.get(n.id)?.h ?? 0) > zone.y
  const touches = E.g.noeuds.filter(coupe).map((n) => n.id)
  const touchesC = E.g.commentaires.filter((c) => dedans(c, zone)).map((c) => c.id)
  const combiner = (base, ids) => {
    const res = new Set(g.mods.ctrl || g.mods.maj ? base : [])
    for (const id of ids) { if (g.mods.ctrl && base.has(id)) res.delete(id); else res.add(id) }
    return res
  }
  const ns = combiner(g.base, touches)
  const cs = combiner(g.baseC, touchesC)
  vider()
  for (const id of ns) sel.noeuds.add(id)
  for (const id of cs) sel.coms.add(id)
  rendre()
}

function choisirLien(demoId, p) {
  vider()
  sel.lien = { demo: demoId, p }
  rendre()
}

// ─── Liaisons ────────────────────────────────────────────────────────────────────────────────────────

function debutFil(id, pin) {
  if (pin === 'out') return { type: 'fil', sens: 'sortie', id, pin }
  if (pin === 'nouv') return { type: 'fil', sens: 'entree', id, pin, demo: null }
  return { type: 'fil', sens: 'entree', id, pin, demo: pin.split(':')[1] }
}

function pointBroche(id, pin) {
  const n = M.noeud(id)
  const p = rendus.get(id)?.pins.get(pin)
  return n && p ? { x: n.x + p.x, y: n.y + p.y } : null
}

function eclairer(els) {
  for (const el of surbrillance) el.classList.remove('cible')
  surbrillance = els.filter(Boolean)
  for (const el of surbrillance) el.classList.add('cible')
}

// Ce qui se trouve sous le curseur pendant qu'on tire un fil : null si c'est le vide.
function trouverCible(g, cx, cy) {
  const el = document.elementFromPoint(cx, cy)
  if (!el || !toile.contains(el) || el.closest('.menu, .infos')) return null
  const noeudEl = el.closest('.noeud')
  if (!noeudEl) return null
  const id = noeudEl.dataset.id
  if (g.sens === 'entree') {
    return { ...M.evaluerLien(id, g.id, g.demo), premisse: id, noeud: g.id, demo: g.demo, els: [noeudEl, noeudEl.querySelector('[data-pin="out"]')] }
  }
  const demoEl = el.closest('.demo')
  let demoId = null
  let broche = null
  if (demoEl) {
    demoId = demoEl.dataset.demo
    broche = demoEl.querySelector('.d-tete .pin')
  } else if (el.closest('.nouv')) {
    broche = noeudEl.querySelector('[data-pin="nouv"]')
  } else {
    const ds = M.demosDe(id)
    if (ds.length) {
      demoId = ds[0].id
      broche = noeudEl.querySelector(`[data-pin="d:${demoId}"]`)
    } else {
      broche = noeudEl.querySelector('[data-pin="nouv"]')
    }
  }
  const els = [noeudEl, broche, demoId ? noeudEl.querySelector(`.demo[data-demo="${demoId}"]`) : null]
  return { ...M.evaluerLien(g.id, id, demoId), premisse: g.id, noeud: id, demo: demoId, els }
}

function majFilTemp(g, e) {
  const a = pointBroche(g.id, g.pin)
  if (!a) return
  const m = versMonde(e.clientX, e.clientY)
  const cible = trouverCible(g, e.clientX, e.clientY)
  eclairer(cible?.ok ? cible.els : [])
  filTemp.style.display = ''
  filTemp.setAttribute('d', g.sens === 'sortie' ? courbe(a.x, a.y, m.x, m.y) : courbe(m.x, m.y, a.x, a.y))
  filTemp.setAttribute('class', `fil-temp${cible && !cible.ok ? ' non' : ''}`)
  const r = toile.getBoundingClientRect()
  bulle.hidden = false
  bulle.className = `bulle${cible ? (cible.ok ? ' ok' : ' non') : ''}`
  bulle.innerHTML = cible ? `<b>${cible.ok ? '✓' : '✕'}</b>${esc(cible.texte)}` : 'Relâcher dans le vide : créer un nœud relié'
  bulle.style.left = `${Math.min(e.clientX - r.left + 16, r.width - bulle.offsetWidth - 8)}px`
  bulle.style.top = `${e.clientY - r.top + 18}px`
}

function masquerFilTemp() {
  filTemp.style.display = 'none'
  bulle.hidden = true
  eclairer([])
}

function finFil(g, e, annule) {
  bulle.hidden = true
  eclairer([])
  if (annule || !e) { masquerFilTemp(); return }
  const cible = trouverCible(g, e.clientX, e.clientY)
  if (cible) {
    masquerFilTemp()
    if (cible.ok) {
      const demoId = M.modifier((G) => M.relier(G, cible.premisse, cible.noeud, cible.demo))
      vider()
      sel.demo = demoId
      rendre()
    }
    return
  }
  const r = toile.getBoundingClientRect()
  const dehors = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
  const a = pointBroche(g.id, g.pin)
  const m = versMonde(e.clientX, e.clientY)
  if (dehors || !a || Math.hypot(m.x - a.x, m.y - a.y) < 12) { masquerFilTemp(); return }
  // Comme dans Unreal : relâcher dans le vide ouvre la palette de création, le fil reste accroché.
  ouvrirMenu(e.clientX, e.clientY, {
    titre: g.sens === 'sortie' ? 'Nœud démontré par cette prémisse' : 'Nœud servant de prémisse',
    sousTitre: 'Toutes les actions',
    items: itemsCreation(g),
    attente: g,
  })
}

function couperBroche(id, pin) {
  M.modifier((G) => {
    if (pin === 'out') M.couperSortie(G, id)
    else if (pin.startsWith('p:')) { const [, d, p] = pin.split(':'); M.retirerPremisse(G, d, p) }
    else if (pin.startsWith('d:')) M.supprimer(G, { demos: [pin.slice(2)] })
  })
  rendre()
}

// ─── Création, suppression, duplication ──────────────────────────────────────────────────────────────

function centreVue() {
  return versMonde(toile.getBoundingClientRect().left + toile.clientWidth / 2, toile.getBoundingClientRect().top + toile.clientHeight / 2)
}

function creerNoeud(genre, m, attente) {
  const id = M.nouvelId('n')
  let x = m.x - L / 2
  let y = m.y - 19
  if (attente?.sens === 'sortie') { x = m.x + 16; y = m.y - 82 }
  if (attente?.sens === 'entree') { x = m.x - L - 16; y = m.y - 19 }
  if (aimant) { x = aimanter(x); y = aimanter(y) }
  M.modifier((G) => {
    G.noeuds.push({ id, nom: NOMS_NOUVEAUX[genre], enonce: '', admis: genre === 'fait', genre, x, y })
    if (attente?.sens === 'sortie') M.relier(G, attente.id, id, null)
    if (attente?.sens === 'entree') M.relier(G, id, attente.id, attente.demo)
  })
  vider()
  sel.noeuds.add(id)
  rendre()
  renommerNoeud(id)
}

function creerCommentaire(m) {
  const id = M.nouvelId('k')
  const b = englobe([
    ...[...sel.noeuds].map((x) => M.noeud(x)).filter(Boolean).map(boiteNoeud),
    ...[...sel.coms].map((x) => M.commentaire(x)).filter(Boolean).map(boiteCom),
  ])
  const p = m || centreVue()
  const cadre = b
    ? { x: b.x - MARGE_COM.cote, y: b.y - MARGE_COM.haut, l: b.l + 2 * MARGE_COM.cote, h: b.h + MARGE_COM.haut + MARGE_COM.bas }
    : { x: aimanter(p.x - 200), y: aimanter(p.y - 48), l: 400, h: 224 }
  M.modifier((G) => G.commentaires.push({ id, titre: 'Nouvelle catégorie', couleur: PALETTE[0].couleur, ...cadre }))
  vider()
  sel.coms.add(id)
  rendre()
  renommerCom(id)
}

function supprimerSelection() {
  if (selVide()) return
  M.modifier((G) => {
    if (sel.lien) M.retirerPremisse(G, sel.lien.demo, sel.lien.p)
    else if (sel.demo) M.supprimer(G, { demos: [sel.demo] })
    else M.supprimer(G, { noeuds: [...sel.noeuds], commentaires: [...sel.coms] })
  })
  vider()
  rendre()
}

function dupliquerSelection() {
  if (!sel.noeuds.size) return
  const ids = M.modifier((G) => M.dupliquer(G, [...sel.noeuds]))
  vider()
  for (const id of ids) sel.noeuds.add(id)
  rendre()
}

function toutSelectionner() {
  vider()
  for (const n of E.g.noeuds) sel.noeuds.add(n.id)
  for (const c of E.g.commentaires) sel.coms.add(c.id)
  rendre()
}

function aligner(axe) {
  const ns = [...sel.noeuds].map((id) => M.noeud(id)).filter(Boolean)
  if (ns.length < 2) return
  const v = Math.min(...ns.map((n) => n[axe]))
  M.modifier((G) => { for (const n of ns) M.noeud(n.id, G)[axe] = v })
  rendre()
}

function historique(sens) {
  if (sens === 'annuler' ? M.annuler() : M.retablir()) rendre()
}

function reinitialiser() {
  M.pousser(M.instantane())
  E.g = M.exemple()
  vider()
  rendre()
  M.disposer(E.g, (id) => rendus.get(id)?.h ?? 120)
  rendre()
  cadrerTout()
}

// ─── Renommage en place ──────────────────────────────────────────────────────────────────────────────

function champEnPlace(cible, valeur, valider) {
  const input = document.createElement('input')
  input.className = 'renomme'
  input.value = valeur
  input.spellcheck = false
  cible.replaceWith(input)
  input.focus()
  input.select()
  let fini = false
  const finir = (ok) => {
    if (fini) return
    fini = true
    enRenommage = null
    const v = input.value.trim()
    input.replaceWith(cible)
    if (ok && v && v !== valeur) valider(v)
    rendre()
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') finir(true)
    if (e.key === 'Escape') finir(false)
  })
  input.addEventListener('blur', () => finir(true))
  input.addEventListener('pointerdown', (e) => e.stopPropagation())
  input.addEventListener('dblclick', (e) => e.stopPropagation())
}

function renommerNoeud(id) {
  const r = rendus.get(id)
  const n = M.noeud(id)
  if (!r || !n) return
  enRenommage = r
  champEnPlace(r.el.querySelector('.nom'), n.nom, (v) => M.modifier((G) => { M.noeud(id, G).nom = v }))
}

function renommerCom(id) {
  const o = boites.get(id)
  const c = M.commentaire(id)
  if (!o || !c) return
  enRenommage = o
  champEnPlace(o.nom, c.titre, (v) => M.modifier((G) => { M.commentaire(id, G).titre = v }))
}

function renommerSelection() {
  if (sel.noeuds.size === 1 && !sel.coms.size) renommerNoeud([...sel.noeuds][0])
  else if (sel.coms.size === 1 && !sel.noeuds.size) renommerCom([...sel.coms][0])
}

toile.addEventListener('dblclick', (e) => {
  const noeudEl = e.target.closest('.noeud')
  const titre = e.target.closest('.c-titre')
  if (noeudEl && e.target.closest('.tt')) {
    renommerNoeud(noeudEl.dataset.id)
  } else if (noeudEl && e.target.closest('.enonce')) {
    vider()
    sel.noeuds.add(noeudEl.dataset.id)
    rendre()
    corps.querySelector('[data-champ="enonce"]')?.focus()
  } else if (noeudEl && e.target.closest('.d-tete')) {
    corps.querySelector('[data-champ="demonstration"]')?.focus()
  } else if (titre) {
    renommerCom(titre.closest('.commentaire').dataset.id)
  }
})

// ─── Menu contextuel (« Toutes les actions ») ────────────────────────────────────────────────────────

let menu = null

function ouvrirMenu(cx, cy, { titre, sousTitre = '', items, recherche = true, attente = null }) {
  fermerMenu()
  const el = document.createElement('div')
  el.className = 'menu'
  el.innerHTML = `<div class="m-tete"><span>${esc(titre)}</span><small>${esc(sousTitre)}</small></div>`
    + `${recherche ? '<input class="m-cherche" placeholder="Rechercher…" spellcheck="false" autocomplete="off">' : ''}<div class="m-liste"></div>`
  toile.append(el)
  menu = { el, items, attente, filtre: '', actif: 0, m: versMonde(cx, cy), liste: el.querySelector('.m-liste') }
  remplirMenu()
  const r = toile.getBoundingClientRect()
  el.style.left = `${Math.max(8, Math.min(cx - r.left, r.width - el.offsetWidth - 8))}px`
  el.style.top = `${Math.max(8, Math.min(cy - r.top, r.height - el.offsetHeight - 8))}px`
  const champ = el.querySelector('.m-cherche')
  champ?.addEventListener('input', () => { menu.filtre = champ.value; menu.actif = 0; remplirMenu() })
  champ?.focus()
  el.addEventListener('pointermove', (e) => {
    const it = e.target.closest('.m-item')
    if (it && Number(it.dataset.i) !== menu.actif) { menu.actif = Number(it.dataset.i); marquerActif() }
  })
  el.addEventListener('click', (e) => {
    const it = e.target.closest('.m-item')
    if (it) executer(Number(it.dataset.i))
  })
}

function remplirMenu() {
  const q = normaliser(menu.filtre.trim())
  menu.visibles = menu.items.filter((it) => !q || normaliser(`${it.libelle} ${it.section}`).includes(q))
  let section = null
  let html = ''
  menu.visibles.forEach((it, i) => {
    if (it.section !== section) { section = it.section; html += `<div class="m-section">${esc(section)}</div>` }
    const ico = it.ico ? `<span class="m-ico${it.couleur ? '' : ' neutre'}" style="${it.couleur ? `--c:${it.couleur}` : ''}">${it.ico}</span>` : '<span class="m-ico neutre"></span>'
    html += `<div class="m-item${it.danger ? ' danger' : ''}" data-i="${i}">${ico}<span>${esc(it.libelle)}</span>${it.touche ? `<kbd>${esc(it.touche)}</kbd>` : ''}</div>`
  })
  menu.liste.innerHTML = html || '<div class="m-vide">Aucune action ne correspond.</div>'
  marquerActif()
}

function marquerActif() {
  for (const el of menu.liste.querySelectorAll('.m-item')) {
    const actif = Number(el.dataset.i) === menu.actif
    el.classList.toggle('actif', actif)
    if (actif) el.scrollIntoView({ block: 'nearest' })
  }
}

function executer(i) {
  const it = menu?.visibles[i]
  if (!it) return
  const m = menu.m
  menu.attente = null
  fermerMenu()
  masquerFilTemp()
  it.faire(m)
}

function fermerMenu() {
  if (!menu) return
  const attendait = menu.attente
  menu.el.remove()
  menu = null
  if (attendait) masquerFilTemp()
}

function clavierMenu(e) {
  if (e.key === 'Escape') { fermerMenu(); e.preventDefault() }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const n = menu.visibles.length
    if (n) { menu.actif = (menu.actif + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; marquerActif() }
    e.preventDefault()
  } else if (e.key === 'Enter') { executer(menu.actif); e.preventDefault() }
}

document.addEventListener('pointerdown', (e) => { if (menu && !e.target.closest('.menu') && !toile.contains(e.target)) fermerMenu() })

function itemsCreation(attente = null) {
  const items = []
  for (const [genre, G] of Object.entries(GENRES)) {
    if (attente?.sens === 'sortie' && genre === 'fait') continue // un fait admis ne se démontre pas
    items.push({ section: 'Assertions', libelle: G.libelle, ico: G.icone, couleur: G.couleur, faire: (m) => creerNoeud(genre, m, attente) })
  }
  if (attente) return items
  const groupe = sel.noeuds.size || sel.coms.size
  items.push({ section: 'Organisation', libelle: groupe ? 'Commentaire autour de la sélection' : 'Commentaire', ico: '▭', touche: 'C', faire: (m) => creerCommentaire(groupe ? null : m) })
  items.push({ section: 'Vue', libelle: 'Tout cadrer', ico: '⤢', touche: 'Origine', faire: () => cadrerTout() })
  if (!selVide()) items.push({ section: 'Vue', libelle: 'Cadrer la sélection', ico: '⤢', touche: 'F', faire: cadrerSelection })
  items.push({ section: 'Édition', libelle: 'Tout sélectionner', ico: '⬚', touche: 'Ctrl+A', faire: toutSelectionner })
  if (E.annuler.length) items.push({ section: 'Édition', libelle: 'Annuler', ico: '↶', touche: 'Ctrl+Z', faire: () => historique('annuler') })
  if (E.retablir.length) items.push({ section: 'Édition', libelle: 'Rétablir', ico: '↷', touche: 'Ctrl+Y', faire: () => historique('retablir') })
  return items
}

function menuContextuel(e, cible) {
  const noeudEl = cible.closest?.('.noeud')
  const titre = cible.closest?.('.c-titre')
  const lienEl = cible.closest?.('.lien')
  if (noeudEl) {
    const id = noeudEl.dataset.id
    if (!sel.noeuds.has(id)) { vider(); sel.noeuds.add(id); rendre() }
    const n = M.noeud(id)
    const plusieurs = sel.noeuds.size > 1
    ouvrirMenu(e.clientX, e.clientY, {
      titre: plusieurs ? `${sel.noeuds.size} nœuds` : n.nom,
      sousTitre: 'Actions du nœud',
      recherche: false,
      items: [
        ...(plusieurs ? [] : [{ section: 'Nœud', libelle: 'Renommer', ico: '✎', touche: 'F2', faire: () => renommerNoeud(id) }]),
        { section: 'Nœud', libelle: 'Dupliquer', ico: '⧉', touche: 'Ctrl+D', faire: dupliquerSelection },
        ...(plusieurs ? [] : [{ section: 'Nœud', libelle: n.admis ? 'Ne plus admettre' : 'Admettre comme fait', ico: '⊤', faire: () => { M.modifier((G) => { const x = M.noeud(id, G); x.admis = !x.admis; x.genre = x.admis ? 'fait' : 'assertion' }); rendre() } }]),
        { section: 'Nœud', libelle: 'Couper tous les liens', ico: '✂', touche: 'Alt+clic', faire: () => { M.modifier((G) => { for (const x of sel.noeuds) M.couperTout(G, x) }); rendre() } },
        { section: 'Organisation', libelle: 'Commentaire autour', ico: '▭', touche: 'C', faire: () => creerCommentaire() },
        { section: 'Organisation', libelle: 'Aligner à gauche', ico: '⇤', faire: () => aligner('x') },
        { section: 'Organisation', libelle: 'Aligner en haut', ico: '⤒', faire: () => aligner('y') },
        { section: 'Organisation', libelle: 'Supprimer', ico: '×', touche: 'Suppr', danger: true, faire: supprimerSelection },
      ].filter((it) => plusieurs || !it.libelle.startsWith('Aligner')),
    })
  } else if (titre) {
    const id = titre.closest('.commentaire').dataset.id
    vider()
    sel.coms.add(id)
    rendre()
    ouvrirMenu(e.clientX, e.clientY, {
      titre: M.commentaire(id).titre,
      sousTitre: 'Commentaire',
      recherche: false,
      items: [
        { section: 'Commentaire', libelle: 'Renommer', ico: '✎', touche: 'F2', faire: () => renommerCom(id) },
        { section: 'Commentaire', libelle: 'Sélectionner le contenu', ico: '⬚', faire: () => selectionnerContenu(id) },
        { section: 'Commentaire', libelle: 'Supprimer le commentaire', ico: '×', touche: 'Suppr', danger: true, faire: supprimerSelection },
      ],
    })
  } else if (lienEl) {
    const { demo: demoId, p } = lienEl.dataset
    choisirLien(demoId, p)
    const valider = (v) => () => { M.modifier((G) => { M.demo(demoId, G).validite = v }); rendre() }
    ouvrirMenu(e.clientX, e.clientY, {
      titre: M.demo(demoId).nom_demonstration,
      sousTitre: 'Liaison',
      recherche: false,
      items: [
        ...Object.entries(VALIDITES).map(([v, V]) => ({ section: 'Validité de la démonstration', libelle: `Marquer « ${V.libelle.toLowerCase()} »`, ico: '●', couleur: V.couleur, faire: valider(v) })),
        { section: 'Liaison', libelle: 'Retirer cette prémisse', ico: '✂', touche: 'Suppr', danger: true, faire: supprimerSelection },
      ],
    })
  } else {
    ouvrirMenu(e.clientX, e.clientY, { titre: 'Toutes les actions', sousTitre: 'clic droit', items: itemsCreation() })
  }
}

function selectionnerContenu(id) {
  const c = M.commentaire(id)
  if (!c) return
  vider()
  for (const n of noeudsDans(c)) sel.noeuds.add(n.id)
  rendre()
}

// ─── Panneau Détails ─────────────────────────────────────────────────────────────────────────────────

let contexte = { type: 'graphe' }
let htmlPanneau = ''
let avantEdition = null

const estSaisie = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')))
const lienNoeud = (id) => `<button class="lien-d" data-a="noeud" data-id="${id}">${esc(M.noeud(id)?.nom ?? id)}</button>`

function tete(ico, couleur, genre, titre, boite = false) {
  return `<div class="d-tete" style="--c:${couleur}"><span class="d-ico${boite ? ' boite' : ''}">${ico}</span><div><div class="d-genre">${esc(genre)}</div><h2 class="d-titre">${esc(titre)}</h2></div></div>`
}

function expliquer(n) {
  const s = st[n.id]
  const ds = M.demosDe(n.id)
  const nom = (p) => `« ${esc(M.noeud(p)?.nom ?? p)} »`
  if (s === 'etabli') {
    if (n.admis) return 'Admis : établi sans démonstration.'
    const d = ds.find((x) => x.validite === 'valide' && x.justifie_par.every((p) => st[p] === 'etabli'))
    return `Établi par <b>${esc(d?.nom_demonstration ?? '')}</b> : démonstration valide dont toutes les prémisses sont établies.`
  }
  if (s === 'suspendu') {
    const manquent = [...new Set(ds.filter((x) => x.validite === 'valide').flatMap((x) => x.justifie_par).filter((p) => st[p] !== 'etabli'))]
    return `Démonstration valide, mais ces prémisses ne sont pas établies : ${manquent.map(nom).join(', ')}.`
  }
  if (s === 'a_verifier') return 'Aucune démonstration validée : au moins une attend le vérificateur.'
  if (s === 'invalide') return 'Toutes ses démonstrations ont été jugées invalides.'
  return 'Aucune démonstration : à démontrer, ou à admettre comme fait.'
}

function panneauNoeud(id) {
  const n = M.noeud(id)
  const G = GENRES[n.genre] || GENRES.assertion
  const S = STATUTS[st[id]]
  const ds = M.demosDe(id)
  const usages = M.utilisePar(id)
  const cats = E.g.commentaires.filter((c) => dedans(boiteNoeud(n), c))
  contexte = { type: 'noeud', id }
  return tete(G.icone, G.couleur, `${G.libelle} · ${id}`, n.nom)
    + `<section class="section"><h3>Assertion</h3><div class="champs">
      <label class="champ"><span>Nom</span><input type="text" data-champ="nom" value="${esc(n.nom)}"></label>
      <label class="champ"><span>Énoncé</span><textarea data-champ="enonce" rows="4">${esc(n.enonce)}</textarea></label>
      <label class="champ"><span>Genre</span><select data-champ="genre">${Object.entries(GENRES).map(([k, g]) => `<option value="${k}"${k === n.genre ? ' selected' : ''}>${g.libelle}</option>`).join('')}</select></label>
      <div class="champ"><span>Admis</span><label class="case"><input type="checkbox" data-champ="admis"${n.admis ? ' checked' : ''}>Établi sans démonstration</label></div>
      <div class="champ"><span>Statut</span><div class="lecture"><span class="statut" style="--s:${S.couleur}"><i></i>${S.libelle}</span><p class="explication">${expliquer(n)}</p></div></div>
    </div></section>`
    + `<section class="section"><h3>Démonstrations<small>${ds.length}</small></h3><ul class="liste">${ds.length
      ? ds.map((d) => `<li style="--v:${VALIDITES[d.validite].couleur}"><i class="pt"></i><button class="lien-d mono" data-a="demo" data-id="${d.id}">${esc(d.nom_demonstration)}</button><span class="meta">${VALIDITES[d.validite].libelle} · ${fmtConf(d.confiance)}</span></li>`).join('')
      : `<li class="vide">${n.admis ? 'Aucune : fait admis.' : 'Aucune. Glissez une sortie vers « + démonstration ».'}</li>`}</ul></section>`
    + `<section class="section"><h3>Utilisée par<small>${usages.length}</small></h3><ul class="liste">${usages.length
      ? usages.map((d) => `<li style="--s:${STATUTS[st[d.noeud_id]].couleur}"><i class="pt carre"></i>${lienNoeud(d.noeud_id)}<span class="meta">${esc(d.nom_demonstration)}</span></li>`).join('')
      : '<li class="vide">Aucune démonstration ne s’appuie dessus.</li>'}</ul></section>`
    + `<section class="section"><h3>Catégories<small>${cats.length}</small></h3><ul class="liste">${cats.length
      ? cats.map((c) => `<li style="--s:${c.couleur}"><i class="pt carre"></i><button class="lien-d" data-a="com" data-id="${c.id}">${esc(c.titre)}</button></li>`).join('')
      : '<li class="vide">Hors catégorie.</li>'}</ul></section>`
    + `<div class="actions"><button class="bouton" data-a="renommer">Renommer<kbd>F2</kbd></button><button class="bouton" data-a="dupliquer">Dupliquer<kbd>Ctrl+D</kbd></button><button class="bouton danger" data-a="supprimer">Supprimer<kbd>Suppr</kbd></button></div>`
}

function panneauDemo(id, pChoisie) {
  const d = M.demo(id)
  const V = VALIDITES[d.validite]
  contexte = { type: 'demo', id }
  return tete('∵', V.couleur, `Démonstration · ${pChoisie ? 'liaison sélectionnée' : id}`, d.nom_demonstration)
    + `<section class="section"><h3>Démonstration</h3><div class="champs">
      <label class="champ"><span>Nom</span><input type="text" class="mono" data-champ="nom_demonstration" value="${esc(d.nom_demonstration)}"></label>
      <div class="champ"><span>Démontre</span><div class="lecture">${lienNoeud(d.noeud_id)}</div></div>
      <label class="champ"><span>Raisonnement</span><textarea data-champ="demonstration" rows="4">${esc(d.demonstration)}</textarea></label>
      <div class="champ"><span>Validité</span><div class="segment">${Object.entries(VALIDITES).map(([k, v]) => `<label style="--v:${v.couleur}"><input type="radio" name="validite" data-champ="validite" value="${k}"${k === d.validite ? ' checked' : ''}>${v.libelle}</label>`).join('')}</div></div>
      <label class="champ"><span>Confiance</span><span class="conf"><input type="number" data-champ="confiance" min="0" max="1" step="0.01" placeholder="—" value="${d.confiance ?? ''}"><small>sur 1 · vide = non notée</small></span></label>
      <label class="champ"><span>Auteur</span><input type="text" class="mono" data-champ="auteur" value="${esc(d.auteur ?? '')}"></label>
    </div></section>`
    + `<section class="section"><h3>Prémisses<small>${d.justifie_par.length}</small></h3><ul class="liste">${d.justifie_par.map((p) => `<li class="${p === pChoisie ? 'li-choisi' : ''}" style="--s:${STATUTS[st[p]].couleur}"><i class="pt carre"></i>${lienNoeud(p)}<button class="retirer" data-a="retirer" data-p="${p}" title="Retirer cette prémisse">×</button></li>`).join('')}</ul>
      <p class="texte-aide">Glissez la sortie d’une assertion sur la broche de <b>${esc(d.nom_demonstration)}</b> pour ajouter une prémisse ; <kbd>Alt</kbd> + clic sur une broche coupe ses liens.</p></section>`
    + `<div class="actions">${pChoisie ? '<button class="bouton danger" data-a="supprimer">Retirer ce lien<kbd>Suppr</kbd></button>' : ''}<button class="bouton danger" data-a="supprimerDemo">Supprimer la démonstration</button></div>`
}

function panneauCom(id) {
  const c = M.commentaire(id)
  const contenu = noeudsDans(c)
  contexte = { type: 'com', id }
  return tete('▭', c.couleur, 'Commentaire · catégorie', c.titre, true)
    + `<section class="section"><h3>Commentaire</h3><div class="champs">
      <label class="champ"><span>Titre</span><input type="text" data-champ="titre" value="${esc(c.titre)}"></label>
      <div class="champ"><span>Couleur</span><div class="palette">${PALETTE.map((p) => `<button data-a="couleur" data-c="${p.couleur}" title="${p.nom}" style="--c:${p.couleur}" class="${p.couleur === c.couleur ? 'actif' : ''}"></button>`).join('')}</div></div>
      <div class="champ"><span>Taille</span><span class="lecture mono">${Math.round(c.l)} × ${Math.round(c.h)}</span></div>
    </div></section>`
    + `<section class="section"><h3>Contenu<small>${contenu.length}</small></h3><ul class="liste">${contenu.length
      ? contenu.map((n) => `<li style="--s:${STATUTS[st[n.id]].couleur}"><i class="pt carre"></i>${lienNoeud(n.id)}</li>`).join('')
      : '<li class="vide">Vide. Les nœuds entièrement dans la boîte la suivent quand on la déplace.</li>'}</ul></section>`
    + '<div class="actions"><button class="bouton" data-a="renommer">Renommer<kbd>F2</kbd></button><button class="bouton" data-a="contenu">Sélectionner le contenu</button><button class="bouton danger" data-a="supprimer">Supprimer<kbd>Suppr</kbd></button></div>'
}

function panneauMulti() {
  contexte = { type: 'multi' }
  const ns = [...sel.noeuds]
  const titre = [ns.length && `${ns.length} nœud${ns.length > 1 ? 's' : ''}`, sel.coms.size && `${sel.coms.size} commentaire${sel.coms.size > 1 ? 's' : ''}`].filter(Boolean).join(', ')
  return tete('⬚', '#52525b', 'Sélection multiple', titre)
    + `<section class="section"><h3>Nœuds<small>${ns.length}</small></h3><ul class="liste">${ns.map((id) => `<li style="--s:${STATUTS[st[id]].couleur}"><i class="pt carre"></i>${lienNoeud(id)}</li>`).join('') || '<li class="vide">Aucun nœud.</li>'}</ul></section>`
    + `<div class="actions"><button class="bouton" data-a="commentaire">Commentaire autour<kbd>C</kbd></button>${ns.length ? '<button class="bouton" data-a="dupliquer">Dupliquer<kbd>Ctrl+D</kbd></button>' : ''}${ns.length > 1 ? '<button class="bouton" data-a="alignerX">Aligner à gauche</button><button class="bouton" data-a="alignerY">Aligner en haut</button>' : ''}<button class="bouton danger" data-a="supprimer">Supprimer<kbd>Suppr</kbd></button></div>`
}

function panneauGraphe() {
  contexte = { type: 'graphe' }
  const compte = (cle, val) => Object.values(st).filter((s) => s === cle).length + val
  const validites = (k) => E.g.demonstrations.filter((d) => d.validite === k).length
  return tete('∴', '#27272a', 'Graphe de logique', 'Problème')
    + `<section class="section"><div class="champs"><label class="champ" style="grid-template-columns:1fr"><textarea data-champ="probleme" rows="3">${esc(E.g.probleme)}</textarea></label></div></section>`
    + `<section class="section"><h3>Statuts des assertions<small>${E.g.noeuds.length}</small></h3><ul class="liste">${Object.entries(STATUTS).map(([k, S]) => `<li style="--s:${S.couleur}"><i class="pt carre"></i>${S.libelle}<span class="meta">${compte(k, 0)}</span></li>`).join('')}</ul></section>`
    + `<section class="section"><h3>Démonstrations<small>${E.g.demonstrations.length}</small></h3><ul class="liste">${Object.entries(VALIDITES).map(([k, V]) => `<li style="--v:${V.couleur}"><i class="pt"></i>${V.libelle}<span class="meta">${validites(k)}</span></li>`).join('')}</ul></section>`
    + `<section class="section"><h3>Prise en main</h3><p class="texte-aide">
      <kbd>clic droit</kbd> sur le fond : créer un nœud · maintenu : se déplacer.<br>
      Glisser la broche de sortie <b>○</b> d’une assertion sur une entrée : la déclarer prémisse.<br>
      Relâcher un fil dans le vide : créer le nœud relié.<br>
      <kbd>C</kbd> catégorie autour de la sélection · <kbd>F</kbd> cadrer · <kbd>Suppr</kbd> supprimer · <kbd>Ctrl</kbd> <kbd>Z</kbd> annuler.
    </p></section>`
}

function majPanneau() {
  let html
  let type
  if (sel.lien) { html = panneauDemo(sel.lien.demo, sel.lien.p); type = 'Liaison' }
  else if (sel.demo) { html = panneauDemo(sel.demo); type = 'Démonstration' }
  else if (sel.noeuds.size === 1 && !sel.coms.size) { html = panneauNoeud([...sel.noeuds][0]); type = 'Assertion' }
  else if (sel.coms.size === 1 && !sel.noeuds.size) { html = panneauCom([...sel.coms][0]); type = 'Commentaire' }
  else if (!selVide()) { html = panneauMulti(); type = 'Sélection' }
  else { html = panneauGraphe(); type = 'Graphe' }
  ongletType.textContent = type
  const cle = `${contexte.type}:${contexte.id ?? ''}`
  // Pendant la frappe, on ne reconstruit pas le panneau (le curseur serait perdu).
  if (estSaisie(document.activeElement) && corps.contains(document.activeElement) && corps.dataset.cle === cle) return
  if (html === htmlPanneau) return
  htmlPanneau = html
  corps.dataset.cle = cle
  corps.innerHTML = html
}

function appliquer(G, el) {
  const champ = el.dataset.champ
  const v = el.type === 'checkbox' ? el.checked : el.value
  if (champ === 'probleme') { G.probleme = v; return }
  if (contexte.type === 'noeud') {
    const n = M.noeud(contexte.id, G)
    if (!n) return
    if (champ === 'genre') { n.genre = v; n.admis = v === 'fait' } else if (champ === 'admis') {
      n.admis = v
      if (v) n.genre = 'fait'
      else if (n.genre === 'fait') n.genre = 'assertion'
    } else n[champ] = v
  } else if (contexte.type === 'demo') {
    const d = M.demo(contexte.id, G)
    if (!d) return
    if (champ === 'confiance') {
      const x = parseFloat(String(v).replace(',', '.'))
      d.confiance = v === '' || Number.isNaN(x) ? null : borne(x, 0, 1)
    } else d[champ] = v
  } else if (contexte.type === 'com') {
    const c = M.commentaire(contexte.id, G)
    if (c) c[champ] = v
  }
}

function validerEdition() {
  if (avantEdition && avantEdition !== M.instantane()) M.pousser(avantEdition)
  avantEdition = M.instantane()
}

corps.addEventListener('focusin', (e) => { if (estSaisie(e.target) && e.target.dataset.champ) avantEdition = M.instantane() })
corps.addEventListener('input', (e) => {
  const el = e.target
  if (!estSaisie(el) || !el.dataset.champ) return
  appliquer(E.g, el)
  if (el.dataset.champ === 'nom' || el.dataset.champ === 'titre' || el.dataset.champ === 'nom_demonstration') {
    const t = corps.querySelector('.d-titre')
    if (t) t.textContent = el.value
  }
  rendre()
})
corps.addEventListener('change', (e) => {
  const el = e.target
  if (!el.dataset.champ) return
  if (estSaisie(el)) { appliquer(E.g, el); validerEdition() } else M.modifier((G) => appliquer(G, el))
  rendre()
})
corps.addEventListener('focusout', (e) => {
  if (!estSaisie(e.target) || !e.target.dataset.champ) return
  validerEdition()
  avantEdition = null
  if (!corps.contains(e.relatedTarget)) setTimeout(rendre)
})
corps.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur()
})

corps.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]')
  if (!b) return
  const { a, id } = b.dataset
  if (a === 'noeud') { vider(); sel.noeuds.add(id); rendre(); centrerSur(boiteNoeud(M.noeud(id))) }
  else if (a === 'demo') { vider(); sel.demo = id; rendre(); centrerSur(boiteNoeud(M.noeud(M.demo(id).noeud_id))) }
  else if (a === 'com') { vider(); sel.coms.add(id); rendre(); centrerSur(boiteCom(M.commentaire(id))) }
  else if (a === 'retirer') { M.modifier((G) => M.retirerPremisse(G, contexte.id, b.dataset.p)); rendre() }
  else if (a === 'supprimerDemo') { M.modifier((G) => M.supprimer(G, { demos: [contexte.id] })); vider(); rendre() }
  else if (a === 'couleur') { M.modifier((G) => { M.commentaire(contexte.id, G).couleur = b.dataset.c }); rendre() }
  else if (a === 'renommer') renommerSelection()
  else if (a === 'dupliquer') dupliquerSelection()
  else if (a === 'supprimer') supprimerSelection()
  else if (a === 'commentaire') creerCommentaire()
  else if (a === 'contenu') selectionnerContenu(contexte.id)
  else if (a === 'alignerX') aligner('x')
  else if (a === 'alignerY') aligner('y')
})

// ─── Barre d'outils, aide et clavier ─────────────────────────────────────────────────────────────────

const probleme = barre.querySelector('.probleme')

function majBarre() {
  B.annuler.disabled = !E.annuler.length
  B.retablir.disabled = !E.retablir.length
  B.aimant.classList.toggle('actif', aimant)
  if (probleme.textContent !== E.g.probleme) { probleme.textContent = E.g.probleme; probleme.title = E.g.probleme }
}

const ouvrirAide = () => voile.classList.add('ouvert')
const fermerAide = () => voile.classList.remove('ouvert')
voile.addEventListener('click', (e) => { if (e.target === voile || e.target.closest('[data-fermer]')) fermerAide() })

barre.addEventListener('click', (e) => {
  const b = e.target.closest('[data-b]')
  if (!b) return
  const action = {
    annuler: () => historique('annuler'),
    retablir: () => historique('retablir'),
    cadrer: cadrerSelection,
    commentaire: () => creerCommentaire(),
    aimant: () => { aimant = !aimant; majBarre(); appliquerVue() },
    reinitialiser,
    aide: ouvrirAide,
  }[b.dataset.b]
  action?.()
})

window.addEventListener('keydown', (e) => {
  if (voile.classList.contains('ouvert')) {
    if (e.key === 'Escape' || e.key === '?') { fermerAide(); e.preventDefault() }
    return
  }
  if (menu) { clavierMenu(e); return }
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) {
    if (e.key === 'Escape') e.target.blur()
    return
  }
  const ctrl = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  if (e.key === ' ') { espace = true; e.preventDefault(); return }
  if (ctrl && k === 'z' && !e.shiftKey) historique('annuler')
  else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) historique('retablir')
  else if (ctrl && k === 'd') dupliquerSelection()
  else if (ctrl && k === 'a') toutSelectionner()
  else if (ctrl || e.altKey) return
  else if (e.key === 'Delete' || e.key === 'Backspace') supprimerSelection()
  else if (k === 'c') creerCommentaire()
  else if (k === 'f') cadrerSelection()
  else if (e.key === 'Home') cadrerTout()
  else if (e.key === 'F2') renommerSelection()
  else if (e.key === '?') ouvrirAide()
  else if (e.key === 'Escape') {
    if (geste?.type === 'fil') { const g = geste; geste = null; toile.classList.remove('relie'); finFil(g, null, true) }
    vider()
    rendre()
  } else return
  e.preventDefault()
})
window.addEventListener('keyup', (e) => { if (e.key === ' ') espace = false })
window.addEventListener('blur', () => { espace = false })

// ─── Démarrage ───────────────────────────────────────────────────────────────────────────────────────

async function demarrer() {
  M.charger()
  let memo = null
  try { memo = JSON.parse(localStorage.getItem(CLE_VUE) || 'null') } catch { /* sans conséquence */ }
  aimant = memo?.aimant ?? true
  // Mesurer les nœuds avec les vraies polices, sinon les broches se décalent après leur chargement.
  const polices = Promise.all(['400 12px Inter', '600 12px Inter', '500 11px "JetBrains Mono"'].map((p) => document.fonts.load(p)))
  await Promise.race([polices.catch(() => null), new Promise((r) => setTimeout(r, 1500))])
  appliquerVue()
  rendre()
  if (E.g.aDisposer) {
    M.disposer(E.g, (id) => rendus.get(id)?.h ?? 120)
    rendre()
    cadrerTout(false)
  } else if (memo?.vue && Number.isFinite(memo.vue.k)) {
    vue = { x: memo.vue.x, y: memo.vue.y, k: borne(memo.vue.k, ZOOM_MIN, ZOOM_MAX) }
    appliquerVue()
  } else cadrerTout(false)
  document.fonts.addEventListener?.('loadingdone', remesurer)
  // Tant que Camille n'a pas touché à la vue, elle reste cadrée sur tout le graphe si la fenêtre change.
  let touche = false
  const marquer = () => { touche = true }
  toile.addEventListener('pointerdown', marquer, { once: true })
  toile.addEventListener('wheel', marquer, { once: true })
  new ResizeObserver(() => { if (!touche) cadrerTout(false) }).observe(toile)
}

demarrer()
