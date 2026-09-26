// Piles de démonstration : éditeur de raisonnement inspiré de Niagara (Unreal Engine), en thème clair.
// Chaque assertion démontrée est une pile verticale, comme un émetteur dans le « System Overview » :
// en-tête nom + statut, puis sections repliables « Énoncé », « Démonstrations » (un module par
// démonstration, réordonnable et désactivable) et « Utilisé par ». Les faits admis sont des
// nœuds-paramètres compacts. Un fil part d'une prémisse et arrive sur la ligne exacte du module qui
// l'utilise. Les statuts sont recalculés par `calculerStatuts` à chaque modification.

import { STATUTS, VALIDITES } from '../../commun/raisonnement.js'
import * as S from './etat.js'
import { monterPanneaux, esc, fmtConf } from './panneaux.js'

const { E } = S
const ZOOM = { min: 0.1, max: 2 }
const MARGE_COMMENT = { cote: 32, haut: 64, bas: 32 }

const canevas = document.querySelector('.canevas')
const monde = canevas.querySelector('.monde')
const coucheComment = monde.querySelector('.commentaires')
const coucheNoeuds = monde.querySelector('.noeuds')
const gFils = monde.querySelector('.g-fils')
const apercu = monde.querySelector('.apercu')
const rectSel = canevas.querySelector('.rectangle-sel')
const zoomTexte = canevas.querySelector('.zoom')
const menu = document.querySelector('.menu')

let vue = { x: 40, y: 40, k: 0.75 }
let st = {}
let onglet = 'vue'
const selection = new Set() // 'n:<id>' pour un nœud, 'c:<id>' pour un commentaire
const mesures = new Map() // id → { l, h, sortie, entrees: Map('demo|prémisse' → point), repli }

const panneaux = monterPanneaux({
  details: document.querySelector('.details'),
  parametres: document.querySelector('.page-parametres'),
  journal: document.querySelector('.page-journal'),
  selection: () => selection,
  statuts: () => st,
  aller,
  contenus: (c) => contenus(c).noeuds,
  creerCommentaire: () => creerCommentaire(),
  dupliquer,
  supprimerSelection,
  creerFait: (type) => creerNoeud(true, centreVue(), type),
})

// ─── Vue : déplacement et zoom ───────────────────────────────────────────────────────────────────────

function appliquerVue() {
  monde.style.transform = `translate(${vue.x}px,${vue.y}px) scale(${vue.k})`
  const g = 128 * vue.k
  const f = 16 * vue.k
  canevas.style.backgroundSize = `${g}px ${g}px, ${g}px ${g}px, ${f}px ${f}px, ${f}px ${f}px`
  canevas.style.backgroundPosition = `${vue.x}px ${vue.y}px`
  zoomTexte.textContent = `Zoom ${Math.round(vue.k * 100)} %`
}

function versMonde(cx, cy) {
  const r = canevas.getBoundingClientRect()
  return { x: (cx - r.left - vue.x) / vue.k, y: (cy - r.top - vue.y) / vue.k }
}

function centreVue() {
  const r = canevas.getBoundingClientRect()
  return versMonde(r.left + r.width / 2, r.top + r.height / 2)
}

canevas.addEventListener('wheel', (e) => {
  e.preventDefault()
  const r = canevas.getBoundingClientRect()
  const px = e.clientX - r.left
  const py = e.clientY - r.top
  const k = Math.min(ZOOM.max, Math.max(ZOOM.min, vue.k * Math.exp(-e.deltaY * 0.0015)))
  vue = { k, x: px - ((px - vue.x) * k) / vue.k, y: py - ((py - vue.y) * k) / vue.k }
  appliquerVue()
}, { passive: false })

function boiteDe(ids, comms = []) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const id of ids) {
    const p = E.positions[id]
    const m = mesures.get(id)
    if (!p || !m) continue
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x + m.l); y1 = Math.max(y1, p.y + m.h)
  }
  for (const c of comms) {
    x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y)
    x1 = Math.max(x1, c.x + c.l); y1 = Math.max(y1, c.y + c.h)
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null
}

// F : cadre la sélection, ou tout le graphe.
function cadrer(tout = false) {
  const nIds = idsNoeudsChoisis()
  const cs = idsCommentairesChoisis().map(S.categorie).filter(Boolean)
  const b = !tout && (nIds.length || cs.length) ? boiteDe(nIds, cs) : boiteDe(E.graphe.noeuds.map((n) => n.id), E.graphe.categories)
  if (!b) return
  const W = canevas.clientWidth
  const H = canevas.clientHeight
  const m = 56
  const k = Math.min(1, Math.max(ZOOM.min, Math.min((W - 2 * m) / (b.x1 - b.x0), (H - 2 * m - 40) / (b.y1 - b.y0))))
  vue = { k, x: W / 2 - ((b.x0 + b.x1) / 2) * k, y: H / 2 + 12 - ((b.y0 + b.y1) / 2) * k }
  appliquerVue()
}

function aller(id) {
  if (!S.noeud(id)) return
  changerOnglet('vue')
  choisir([`n:${id}`])
  const p = E.positions[id]
  const m = mesures.get(id)
  if (!p || !m) return
  const k = Math.max(vue.k, 0.8)
  vue = { k, x: canevas.clientWidth / 2 - (p.x + m.l / 2) * k, y: canevas.clientHeight / 2 - (p.y + Math.min(m.h, 300) / 2) * k }
  appliquerVue()
}

// ─── Rendu des nœuds ─────────────────────────────────────────────────────────────────────────────────

function usagesParNoeud() {
  const m = new Map()
  for (const d of E.graphe.demonstrations) {
    for (const p of d.justifie_par) {
      if (!m.has(p)) m.set(p, [])
      m.get(p).push(d)
    }
  }
  return m
}

function section(id, cle, titre, compte, corps, extra = '') {
  const replie = !!E.replis[id]?.[cle]
  const brocheRepli = replie && cle === 'demos' && compte ? '<span class="broche entree pleine"></span>' : ''
  return `<section class="sec${replie ? ' replie' : ''}" data-section="${cle}">
    <div class="s-tete"${cle === 'demos' ? ` data-entree-repli="${id}"` : ''}>${brocheRepli}<span class="caret"></span><span>${titre}</span>${compte !== '' ? `<small>${compte}</small>` : ''}${extra}</div>
    ${replie ? '' : `<div class="s-corps">${corps}</div>`}
  </section>`
}

function htmlModule(d) {
  const v = VALIDITES[d.validite] || VALIDITES.a_verifier
  const rangs = d.justifie_par.map((p) => {
    const n = S.noeud(p)
    const s = STATUTS[st[p]] || STATUTS.ouvert
    return `<div class="m-rang" data-entree="${d.id}|${esc(p)}"><span class="broche entree pleine" title="Alt+clic : couper"></span><span class="m-lab">Prémisse</span><span class="m-val" title="${esc(n?.enonce)}">${esc(n?.nom ?? p)}</span><span class="pt" style="--s:${s.couleur}" title="${s.libelle}"></span></div>`
  }).join('')
  return `<div class="module${d.active === false ? ' inactif' : ''}" data-demo="${d.id}">
    <div class="m-tete">
      <span class="m-poignee" title="Glisser pour réordonner">⋮⋮</span>
      <input type="checkbox" class="m-actif"${d.active !== false ? ' checked' : ''} title="Module actif : compté dans les statuts">
      <span class="m-nom" data-renommer="demo" title="${esc(d.nom_demonstration)} · ${esc(d.auteur)}">${esc(d.nom_demonstration)}</span>
      <span class="m-valid" style="--v:${v.couleur}"><i></i>${v.libelle}</span>
      <span class="m-conf" title="Confiance">${fmtConf(d.confiance)}</span>
    </div>
    ${rangs}
    <div class="m-rang ajout" data-entree="${d.id}|+"><span class="broche entree" title="Tirer un fil pour ajouter une prémisse"></span><span class="m-lab">Prémisse</span><span class="m-val">ajouter</span></div>
    ${d.demonstration ? `<div class="m-texte" title="${esc(d.demonstration)}">${esc(d.demonstration)}</div>` : ''}
  </div>`
}

function htmlPile(n, us) {
  const s = STATUTS[st[n.id]] || STATUTS.ouvert
  const demos = S.demosDe(n.id)
  const usages = us.map((d) => {
    const c = STATUTS[st[d.noeud_id]] || STATUTS.ouvert
    return `<div class="u-rang${d.active === false ? ' inactif' : ''}" data-aller="${esc(d.noeud_id)}" title="Aller à « ${esc(S.nom(d.noeud_id))} »"><span class="fl">→</span><span class="pt" style="--s:${c.couleur}"></span><span>${esc(S.nom(d.noeud_id))}</span><small>${esc(d.nom_demonstration)}</small></div>`
  }).join('')
  return `<div class="pile noeud" data-id="${esc(n.id)}">
    <div class="n-tete" data-poignee>
      <span class="n-nom" data-renommer="noeud" title="${esc(n.nom)}">${esc(n.nom)}</span>
      <span class="puce" style="--s:${s.couleur}"><i></i>${s.libelle}</span>
      <span class="broche sortie${us.length ? ' pleine' : ''}" data-sortie="${esc(n.id)}" title="Tirer vers un module pour en faire une prémisse"></span>
    </div>
    ${section(n.id, 'enonce', 'Énoncé', '', `<div class="enonce">${esc(n.enonce) || '<span class="vide">Énoncé à rédiger</span>'}</div>`)}
    ${section(n.id, 'demos', 'Démonstrations', demos.length, demos.map(htmlModule).join('') || '<div class="vide">Aucune démonstration · déposez un fil ici</div>', '<button class="s-plus" data-action="ajouter-demo" title="Ajouter une démonstration">+</button>')}
    ${section(n.id, 'usages', 'Utilisé par', us.length, usages || '<div class="vide">Aucune assertion ne s’appuie dessus</div>')}
  </div>`
}

function htmlParam(n, us) {
  const t = S.TYPES_FAIT[n.type] || S.TYPES_FAIT.mesure
  return `<div class="param noeud" data-id="${esc(n.id)}" style="--t:${t.couleur}">
    <div class="n-tete" data-poignee>
      <span class="type" title="Fait admis · ${t.libelle}"><i></i>${t.libelle}</span>
      <span class="n-nom" data-renommer="noeud" title="${esc(n.nom)}">${esc(n.nom)}</span>
      <span class="broche sortie${us.length ? ' pleine' : ''}" data-sortie="${esc(n.id)}" title="Tirer vers un module pour en faire une prémisse"></span>
    </div>
    <div class="pa-val" data-poignee title="${esc(n.enonce)}">${esc(n.enonce) || '—'}</div>
  </div>`
}

const elNoeud = (id) => coucheNoeuds.querySelector(`[data-id="${CSS.escape(id)}"]`)
const elComment = (id) => coucheComment.querySelector(`[data-cid="${CSS.escape(id)}"]`)
const placer = (el, p) => { if (el && p) el.style.transform = `translate(${p.x}px,${p.y}px)` }

function rendreNoeuds() {
  const us = usagesParNoeud()
  for (const n of E.graphe.noeuds) if (!E.positions[n.id]) E.positions[n.id] = { x: 0, y: 0 }
  coucheNoeuds.innerHTML = E.graphe.noeuds.map((n) => (n.admis ? htmlParam(n, us.get(n.id) || []) : htmlPile(n, us.get(n.id) || []))).join('')
  for (const el of coucheNoeuds.children) placer(el, E.positions[el.dataset.id])
  mesurer()
}

// Positions locales des broches, en unités du monde (indépendantes du zoom).
function decalage(el, racine) {
  let x = 0, y = 0
  while (el && el !== racine) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent }
  return { x, y }
}
function centre(el, racine) {
  const d = decalage(el, racine)
  return { x: d.x + el.offsetWidth / 2, y: d.y + el.offsetHeight / 2 }
}

function mesurer() {
  mesures.clear()
  for (const el of coucheNoeuds.children) {
    const m = { l: el.offsetWidth, h: el.offsetHeight, sortie: null, entrees: new Map(), repli: null }
    const s = el.querySelector('[data-sortie]')
    if (s) m.sortie = centre(s, el)
    for (const r of el.querySelectorAll('[data-entree]')) m.entrees.set(r.dataset.entree, centre(r.querySelector('.broche'), el))
    const rp = el.querySelector('[data-entree-repli]')
    if (rp) m.repli = rp.querySelector('.broche') ? centre(rp.querySelector('.broche'), el) : { x: 8, y: decalage(rp, el).y + rp.offsetHeight / 2 }
    mesures.set(el.dataset.id, m)
  }
}

// ─── Fils ────────────────────────────────────────────────────────────────────────────────────────────

const point = (id, loc) => { const p = E.positions[id] || { x: 0, y: 0 }; return { x: p.x + loc.x, y: p.y + loc.y } }

function chemin(a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5)
  const f = (v) => v.toFixed(1)
  return `M${f(a.x)},${f(a.y)}C${f(a.x + dx)},${f(a.y)} ${f(b.x - dx)},${f(b.y)} ${f(b.x)},${f(b.y)}`
}

function dessinerFils() {
  let h = ''
  for (const d of E.graphe.demonstrations) {
    const mc = mesures.get(d.noeud_id)
    if (!mc) continue
    for (const p of d.justifie_par) {
      const ms = mesures.get(p)
      if (!ms?.sortie) continue
      const loc = mc.entrees.get(`${d.id}|${p}`) ?? mc.repli ?? { x: 0, y: 18 }
      const c = chemin(point(p, ms.sortie), point(d.noeud_id, loc))
      const lie = selection.has(`n:${p}`) || selection.has(`n:${d.noeud_id}`)
      h += `<path class="fil-zone" data-fil="${d.id}|${esc(p)}" d="${c}"><title>${esc(S.nom(p))} → ${esc(d.nom_demonstration)} · Alt+clic pour couper</title></path>`
      h += `<path class="fil v-${d.validite}${d.active === false ? ' inactif' : ''}${lie ? ' lie' : ''}" d="${c}"/>`
    }
  }
  gFils.innerHTML = h
}

// ─── Commentaires ────────────────────────────────────────────────────────────────────────────────────

function rendreCommentaires() {
  const cats = [...E.graphe.categories].sort((a, b) => b.l * b.h - a.l * a.h) // les petits au-dessus
  coucheComment.innerHTML = cats.map((c) => `<div class="commentaire" data-cid="${esc(c.id)}" style="--c:${c.couleur};transform:translate(${c.x}px,${c.y}px);width:${c.l}px;height:${c.h}px">
    <div class="c-titre" title="Glisser : déplacer avec le contenu · double-clic : renommer"><span class="c-nom" data-renommer="comment">${esc(c.titre)}</span></div>
    <span class="c-coin" data-redim title="Redimensionner"></span></div>`).join('')
}

const dedans = (x, y, l, h, c) => x >= c.x && y >= c.y && x + l <= c.x + c.l && y + h <= c.y + c.h

function contenus(c) {
  const noeuds = E.graphe.noeuds.map((n) => n.id).filter((id) => {
    const p = E.positions[id]
    const m = mesures.get(id)
    return p && m && dedans(p.x, p.y, m.l, m.h, c)
  })
  const commentaires = E.graphe.categories.filter((k) => k !== c && dedans(k.x, k.y, k.l, k.h, c))
  return { noeuds, commentaires }
}

// ─── Sélection ───────────────────────────────────────────────────────────────────────────────────────

const idsNoeudsChoisis = () => [...selection].filter((s) => s.startsWith('n:')).map((s) => s.slice(2))
const idsCommentairesChoisis = () => [...selection].filter((s) => s.startsWith('c:')).map((s) => s.slice(2))

function majSelection() {
  for (const el of coucheNoeuds.children) el.classList.toggle('choisi', selection.has(`n:${el.dataset.id}`))
  for (const el of coucheComment.children) el.classList.toggle('choisi', selection.has(`c:${el.dataset.cid}`))
  dessinerFils()
  panneaux.details()
}

function choisir(ids, ajouter = false) {
  if (!ajouter) selection.clear()
  for (const i of ids) selection.add(i)
  majSelection()
}

// ─── Rendu général ───────────────────────────────────────────────────────────────────────────────────

function rendre() {
  st = S.statuts()
  for (const s of [...selection]) {
    const id = s.slice(2)
    if (s.startsWith('n:') ? !S.noeud(id) : !S.categorie(id)) selection.delete(s)
  }
  canevas.querySelector('.probleme').textContent = E.graphe.probleme
  majBarre()
  if (onglet === 'vue') {
    rendreNoeuds()
    rendreCommentaires()
    majSelection()
  } else if (onglet === 'parametres') panneaux.parametres()
  else panneaux.journal()
}

function majBarre() {
  document.querySelector('[data-cmd="annuler"]').disabled = !S.peutAnnuler()
  document.querySelector('[data-cmd="retablir"]').disabled = !S.peutRetablir()
  document.querySelector('[data-nb="parametres"]').textContent = E.graphe.noeuds.filter((n) => n.admis).length
  document.querySelector('[data-nb="journal"]').textContent = E.journal.length
  const compte = {}
  for (const s of Object.values(st)) compte[s] = (compte[s] || 0) + 1
  document.querySelector('.onglets .compteurs').innerHTML = Object.entries(STATUTS)
    .map(([k, s]) => `<span><i class="pastille" style="background:${s.couleur}"></i>${s.libelle}<b>${compte[k] || 0}</b></span>`).join('')
}

function changerOnglet(o) {
  if (onglet === o) return
  onglet = o
  for (const b of document.querySelectorAll('[data-onglet]')) b.classList.toggle('actif', b.dataset.onglet === o)
  canevas.hidden = o !== 'vue'
  document.querySelector('.details').hidden = o !== 'vue'
  document.querySelector('.page-parametres').hidden = o !== 'parametres'
  document.querySelector('.page-journal').hidden = o !== 'journal'
  fermerMenu()
  rendre()
}

document.querySelector('.onglets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-onglet]')
  if (b) changerOnglet(b.dataset.onglet)
})

// ─── Gestes ──────────────────────────────────────────────────────────────────────────────────────────

// Suit un geste au pointeur : `bouger` n'est appelé qu'au-delà de 4 px, `fin(ev, aBouge)` au relâchement.
function suivre(e, bouger, fin) {
  const x0 = e.clientX
  const y0 = e.clientY
  let bouge = false
  const mv = (ev) => {
    if (!bouge && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return
    bouge = true
    bouger(ev, ev.clientX - x0, ev.clientY - y0)
  }
  const up = (ev) => {
    // Relâché loin sans mouvement intermédiaire reçu : on applique quand même le geste.
    if (!bouge && Math.hypot(ev.clientX - x0, ev.clientY - y0) >= 4) { bouge = true; bouger(ev, ev.clientX - x0, ev.clientY - y0) }
    window.removeEventListener('pointermove', mv)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    fin(ev, bouge)
  }
  window.addEventListener('pointermove', mv)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

function debutPan(e, { menuSiClic = false, viderSiClic = false } = {}) {
  const v0 = { ...vue }
  const cible = e.target
  suivre(e, (ev, dx, dy) => {
    canevas.classList.add('glisse')
    vue = { ...v0, x: v0.x + dx, y: v0.y + dy }
    appliquerVue()
  }, (ev, bouge) => {
    canevas.classList.remove('glisse')
    if (bouge) return
    if (menuSiClic) menuContextuel(ev.clientX, ev.clientY, cible)
    else if (viderSiClic) choisir([])
  })
}

function debutRectangle(e) {
  const base = new Set(selection)
  const r = canevas.getBoundingClientRect()
  suivre(e, (ev) => {
    const x0 = Math.min(e.clientX, ev.clientX), x1 = Math.max(e.clientX, ev.clientX)
    const y0 = Math.min(e.clientY, ev.clientY), y1 = Math.max(e.clientY, ev.clientY)
    Object.assign(rectSel.style, { display: 'block', left: `${x0 - r.left}px`, top: `${y0 - r.top}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` })
    const a = versMonde(x0, y0)
    const b = versMonde(x1, y1)
    selection.clear()
    for (const s of base) selection.add(s)
    for (const n of E.graphe.noeuds) {
      const p = E.positions[n.id]
      const m = mesures.get(n.id)
      if (p && m && p.x < b.x && p.x + m.l > a.x && p.y < b.y && p.y + m.h > a.y) selection.add(`n:${n.id}`)
    }
    majSelection()
  }, () => { rectSel.style.display = 'none' })
}

// Déplace la sélection ; un commentaire choisi emporte les nœuds et commentaires qu'il contient.
function debutDeplacement(e) {
  const avant = S.commencer()
  const nIds = new Set(idsNoeudsChoisis())
  const comms = new Set(idsCommentairesChoisis().map(S.categorie).filter(Boolean))
  for (const c of [...comms]) {
    const k = contenus(c)
    k.noeuds.forEach((i) => nIds.add(i))
    k.commentaires.forEach((x) => comms.add(x))
  }
  const orig = new Map([...nIds].map((i) => [i, { ...E.positions[i] }]))
  const origC = new Map([...comms].map((c) => [c, { x: c.x, y: c.y }]))
  suivre(e, (ev, dx, dy) => {
    const gx = S.aligner(dx / vue.k)
    const gy = S.aligner(dy / vue.k)
    for (const [i, p] of orig) { E.positions[i] = { x: p.x + gx, y: p.y + gy }; placer(elNoeud(i), E.positions[i]) }
    for (const [c, p] of origC) { c.x = p.x + gx; c.y = p.y + gy; placer(elComment(c.id), c) }
    dessinerFils()
  }, (ev, bouge) => {
    if (!bouge) return
    const n = nIds.size + comms.size
    const seul = nIds.size === 1 && !comms.size ? `« ${S.nom([...nIds][0])} »` : comms.size === 1 && n === 1 + contenus([...comms][0]).noeuds.length ? `le commentaire « ${[...comms][0].titre} »` : 'la sélection'
    S.terminer(avant, `Déplacer ${seul}`)
  })
}

function debutRedim(e, c) {
  const avant = S.commencer()
  const l0 = c.l
  const h0 = c.h
  const el = elComment(c.id)
  suivre(e, (ev, dx, dy) => {
    c.l = Math.max(192, S.aligner(l0 + dx / vue.k))
    c.h = Math.max(96, S.aligner(h0 + dy / vue.k))
    el.style.width = `${c.l}px`
    el.style.height = `${c.h}px`
  }, (ev, bouge) => { if (bouge) S.terminer(avant, `Redimensionner le commentaire « ${c.titre} »`) })
}

// Glisser-déposer d'un module dans sa pile, comme dans une pile Niagara.
function debutReordre(e, modEl) {
  const pileEl = modEl.closest('.pile')
  const id = pileEl.dataset.id
  const mods = [...pileEl.querySelectorAll('.module')]
  const ids = mods.map((m) => m.dataset.demo)
  const autres = mods.filter((m) => m !== modEl)
  const ligne = document.createElement('div')
  ligne.className = 'insertion'
  pileEl.append(ligne)
  let rang = mods.indexOf(modEl)
  suivre(e, (ev, dx, dy) => {
    modEl.classList.add('souleve')
    modEl.style.transform = `translateY(${dy / vue.k}px)`
    rang = autres.filter((m) => { const r = m.getBoundingClientRect(); return ev.clientY > r.top + r.height / 2 }).length
    const ref = rang === 0 ? autres[0] : autres[rang - 1]
    if (!ref) return
    const d = decalage(ref, pileEl)
    ligne.style.top = `${rang === 0 ? d.y - 4 : d.y + ref.offsetHeight + 2}px`
    ligne.style.display = 'block'
  }, (ev, bouge) => {
    ligne.remove()
    modEl.classList.remove('souleve')
    modEl.style.transform = ''
    if (!bouge) return
    const ordre = autres.map((m) => m.dataset.demo)
    ordre.splice(rang, 0, modEl.dataset.demo)
    if (ordre.join() !== ids.join()) S.modifier(`Réordonner les démonstrations de « ${S.nom(id)} »`, () => S.reordonnerDemos(id, ordre))
  })
}

// ─── Fils tirés à la main ────────────────────────────────────────────────────────────────────────────

function lierVers(premisse, demoId) {
  const d = S.demo(demoId)
  if (!d) return
  S.modifier(`Lier « ${S.nom(premisse)} » → ${d.nom_demonstration} (« ${S.nom(d.noeud_id)} »)`, () => S.lier(premisse, demoId))
}

function debutFil(e, src) {
  const noeudId = src.de === 'sortie' ? src.id : S.demo(src.demo)?.noeud_id
  const m = mesures.get(noeudId)
  const loc = src.de === 'sortie' ? m?.sortie : m?.entrees.get(`${src.demo}|${src.prem}`)
  if (!loc) return
  const a = point(noeudId, loc)
  suivre(e, (ev) => {
    canevas.classList.add('liaison')
    const b = versMonde(ev.clientX, ev.clientY)
    apercu.setAttribute('d', src.de === 'sortie' ? chemin(a, b) : chemin(b, a))
    apercu.style.display = ''
  }, (ev, bouge) => {
    apercu.style.display = 'none'
    canevas.classList.remove('liaison')
    if (bouge) deposerFil(src, ev)
  })
}

function deposerFil(src, ev) {
  const cible = document.elementFromPoint(ev.clientX, ev.clientY)
  if (!cible || !canevas.contains(cible)) return
  const w = versMonde(ev.clientX, ev.clientY)
  const nEl = cible.closest('.noeud')
  if (src.de === 'sortie') {
    const mEl = cible.closest('[data-demo]')
    if (mEl) return lierVers(src.id, mEl.dataset.demo)
    if (nEl?.classList.contains('pile')) {
      const id = nEl.dataset.id
      if (id === src.id) return
      const ds = S.demosDe(id)
      if (ds.length) return lierVers(src.id, ds[0].id)
      return S.modifier(`Démontrer « ${S.nom(id)} » depuis « ${S.nom(src.id)} »`, () => S.ajouterDemo(id, [src.id]))
    }
    if (nEl) return // un fait admis n'a pas d'entrée
    return ouvrirMenu(ev.clientX, ev.clientY, `Depuis « ${S.nom(src.id)} »`, actionsDepuisSortie(src.id, w))
  }
  const d = S.demo(src.demo)
  if (!d) return
  if (nEl) {
    const id = nEl.dataset.id
    if (id === d.noeud_id) return
    if (src.prem === '+') return lierVers(id, d.id)
    if (id !== src.prem) S.modifier(`Rebrancher ${d.nom_demonstration} : « ${S.nom(src.prem)} » → « ${S.nom(id)} »`, () => S.remplacerPremisse(d.id, src.prem, id))
    return
  }
  ouvrirMenu(ev.clientX, ev.clientY, `Prémisse pour ${d.nom_demonstration}`, actionsVersEntree(d, src.prem, w))
}

function actionsDepuisSortie(id, w) {
  const nomSrc = S.nom(id)
  const creer = {
    groupe: 'Créer', libelle: `Nouvelle assertion démontrée par « ${nomSrc} »`,
    faire: () => creerNoeud(false, { x: w.x, y: w.y - 90 }, null, (nid) => S.ajouterDemo(nid, [id])),
  }
  const modules = E.graphe.demonstrations.filter((d) => d.noeud_id !== id && !d.justifie_par.includes(id))
    .map((d) => ({ groupe: 'Brancher sur un module', libelle: `${S.nom(d.noeud_id)} · ${d.nom_demonstration}`, faire: () => lierVers(id, d.id) }))
  return [creer, ...modules]
}

function actionsVersEntree(d, prem, w) {
  const brancher = (nid) => { if (prem === '+') S.lier(nid, d.id); else S.remplacerPremisse(d.id, prem, nid) }
  const creer = [
    ...Object.entries(S.TYPES_FAIT).map(([t, v]) => ({
      groupe: 'Créer', libelle: `Nouveau fait admis · ${v.libelle}`, detail: 'paramètre',
      faire: () => creerNoeud(true, { x: w.x - 240, y: w.y - 16 }, t, brancher),
    })),
    { groupe: 'Créer', libelle: 'Nouvelle assertion', detail: 'pile', faire: () => creerNoeud(false, { x: w.x - 320, y: w.y - 18 }, null, brancher) },
  ]
  const existants = E.graphe.noeuds.filter((n) => n.id !== d.noeud_id && !d.justifie_par.includes(n.id))
    .map((n) => ({ groupe: 'Utiliser une assertion existante', libelle: n.nom, detail: STATUTS[st[n.id]]?.libelle, faire: () => (prem === '+' ? lierVers(n.id, d.id) : S.modifier(`Rebrancher ${d.nom_demonstration} sur « ${n.nom} »`, () => brancher(n.id))) }))
  return [...creer, ...existants]
}

// ─── Création, suppression, duplication ──────────────────────────────────────────────────────────────

function creerNoeud(admis, w, type, apres) {
  let id
  const nomNeuf = admis ? 'Nouveau fait' : 'Nouvelle assertion'
  S.modifier(`Créer « ${nomNeuf} »`, () => {
    id = S.ajouterNoeud({ admis, nom: nomNeuf, type: type || 'mesure', x: w.x, y: w.y })
    apres?.(id)
  })
  if (onglet !== 'vue') return
  choisir([`n:${id}`])
  const el = elNoeud(id)?.querySelector('.n-nom')
  if (el) renommer(el)
}

function creerCommentaire(w) {
  const nIds = idsNoeudsChoisis()
  const cs = idsCommentairesChoisis().map(S.categorie).filter(Boolean)
  const b = boiteDe(nIds, cs)
  const M = MARGE_COMMENT
  const boite = b
    ? { x: b.x0 - M.cote, y: b.y0 - M.haut, l: b.x1 - b.x0 + 2 * M.cote, h: b.y1 - b.y0 + M.haut + M.bas }
    : (() => { const c = w || centreVue(); return { x: c.x - 200, y: c.y - 120, l: 400, h: 240 } })()
  let id
  S.modifier('Créer un commentaire', () => {
    id = S.ajouterCommentaire({
      x: Math.floor(boite.x / S.GRILLE) * S.GRILLE, y: Math.floor(boite.y / S.GRILLE) * S.GRILLE,
      l: Math.ceil(boite.l / S.GRILLE + 1) * S.GRILLE, h: Math.ceil(boite.h / S.GRILLE + 1) * S.GRILLE,
    })
  })
  choisir([`c:${id}`])
  const el = elComment(id)?.querySelector('.c-nom')
  if (el) renommer(el)
}

function supprimerSelection() {
  const n = idsNoeudsChoisis()
  const c = idsCommentairesChoisis()
  if (!n.length && !c.length) return
  const quoi = n.length + c.length === 1 ? (n.length ? `« ${S.nom(n[0])} »` : `le commentaire « ${S.categorie(c[0])?.titre} »`) : `${n.length + c.length} éléments`
  S.modifier(`Supprimer ${quoi}`, () => { S.supprimerNoeuds(n); S.supprimerCommentaires(c) })
}

function dupliquer() {
  const n = idsNoeudsChoisis()
  if (!n.length) return
  let neufs = []
  S.modifier(n.length === 1 ? `Dupliquer « ${S.nom(n[0])} »` : `Dupliquer ${n.length} nœuds`, () => { neufs = S.dupliquerNoeuds(n) })
  choisir(neufs.map((i) => `n:${i}`))
}

function basculerReplis(replier) {
  S.modifierVue(() => {
    for (const n of E.graphe.noeuds) if (!n.admis) E.replis[n.id] = replier ? { enonce: true, demos: false, usages: true } : {}
  })
}

// ─── Renommer en place ───────────────────────────────────────────────────────────────────────────────

function renommer(el) {
  const genre = el.dataset.renommer
  const hote = genre === 'comment' ? el.closest('.commentaire')?.dataset.cid : genre === 'demo' ? el.closest('[data-demo]')?.dataset.demo : el.closest('.noeud')?.dataset.id
  if (!hote) return
  const init = el.textContent
  let fini = false
  el.contentEditable = 'plaintext-only'
  el.classList.add('edition')
  el.focus()
  getSelection().selectAllChildren(el)
  const fin = (garder) => {
    if (fini) return
    fini = true
    el.removeEventListener('keydown', touches)
    el.removeEventListener('blur', surBlur)
    el.contentEditable = 'false'
    el.classList.remove('edition')
    const v = el.textContent.replace(/\s+/g, ' ').trim()
    if (!garder || !v || v === init) { el.textContent = init; return }
    if (genre === 'noeud') { const n = S.noeud(hote); S.modifier(`Renommer « ${init} » en « ${v} »`, () => { n.nom = v }) }
    if (genre === 'demo') { const d = S.demo(hote); S.modifier(`Renommer la démonstration ${init} en ${v}`, () => { d.nom_demonstration = v }) }
    if (genre === 'comment') { const c = S.categorie(hote); S.modifier(`Renommer le commentaire « ${init} » en « ${v} »`, () => { c.titre = v }) }
  }
  const touches = (ev) => {
    ev.stopPropagation()
    if (ev.key === 'Enter') { ev.preventDefault(); fin(true); el.blur() }
    if (ev.key === 'Escape') { ev.preventDefault(); fin(false); el.blur() }
  }
  const surBlur = () => fin(true)
  el.addEventListener('keydown', touches)
  el.addEventListener('blur', surBlur)
}

canevas.addEventListener('dblclick', (e) => {
  if (e.target.isContentEditable || e.target.closest('input, .broche, .s-tete, .m-rang, .u-rang')) return
  const el = e.target.closest('[data-renommer]')
    || e.target.closest('.n-tete')?.querySelector('.n-nom')
    || e.target.closest('.c-titre')?.querySelector('.c-nom')
  if (el) renommer(el)
})

// ─── Menu « Toutes les actions » ─────────────────────────────────────────────────────────────────────

let menuActions = []
let menuVisibles = []
let menuIndex = 0

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function ouvrirMenu(cx, cy, titre, actions) {
  menuActions = actions
  menu.innerHTML = `<div class="mn-titre">${esc(titre)}</div><input class="mn-recherche" placeholder="Rechercher…" spellcheck="false"><div class="mn-liste"></div>`
  menu.hidden = false
  menu.style.left = `${Math.max(8, Math.min(cx, innerWidth - 318))}px`
  menu.style.top = `${Math.max(8, Math.min(cy, innerHeight - 428))}px`
  const champ = menu.querySelector('.mn-recherche')
  champ.addEventListener('input', () => filtrerMenu(champ.value))
  champ.addEventListener('keydown', toucheMenu)
  filtrerMenu('')
  champ.focus()
}

function filtrerMenu(q) {
  const nq = norm(q.trim())
  menuVisibles = menuActions.filter((a) => !nq || norm(`${a.libelle} ${a.groupe}`).includes(nq))
  menuIndex = 0
  let groupe = null
  let h = ''
  menuVisibles.forEach((a, i) => {
    if (a.groupe !== groupe) { groupe = a.groupe; h += `<div class="mn-groupe">${esc(groupe)}</div>` }
    h += `<div class="mn-item${i === 0 ? ' actif' : ''}" data-i="${i}"><span>${esc(a.libelle)}</span>${a.detail ? `<small>${esc(a.detail)}</small>` : ''}</div>`
  })
  menu.querySelector('.mn-liste').innerHTML = h || '<div class="mn-vide">Aucune action ne correspond.</div>'
}

function surlignerMenu(i) {
  menuIndex = Math.max(0, Math.min(menuVisibles.length - 1, i))
  for (const el of menu.querySelectorAll('.mn-item')) el.classList.toggle('actif', Number(el.dataset.i) === menuIndex)
  menu.querySelector(`.mn-item[data-i="${menuIndex}"]`)?.scrollIntoView({ block: 'nearest' })
}

function executerMenu(i) {
  const a = menuVisibles[i]
  fermerMenu()
  a?.faire()
}

function toucheMenu(e) {
  e.stopPropagation()
  if (e.key === 'ArrowDown') { e.preventDefault(); surlignerMenu(menuIndex + 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); surlignerMenu(menuIndex - 1) }
  else if (e.key === 'Enter') { e.preventDefault(); executerMenu(menuIndex) }
  else if (e.key === 'Escape') { e.preventDefault(); fermerMenu() }
}

function fermerMenu() {
  if (menu.hidden) return
  menu.hidden = true
  menu.innerHTML = ''
}

menu.addEventListener('click', (e) => {
  const it = e.target.closest('.mn-item')
  if (it) executerMenu(Number(it.dataset.i))
})
menu.addEventListener('pointermove', (e) => {
  const it = e.target.closest('.mn-item')
  if (it && Number(it.dataset.i) !== menuIndex) surlignerMenu(Number(it.dataset.i))
})
window.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) fermerMenu() }, true)

function toutesLesActions(w) {
  return [
    { groupe: 'Créer', libelle: 'Nouvelle assertion', detail: 'pile', faire: () => creerNoeud(false, w) },
    ...Object.entries(S.TYPES_FAIT).map(([t, v]) => ({ groupe: 'Créer', libelle: `Nouveau fait admis · ${v.libelle}`, detail: 'paramètre', faire: () => creerNoeud(true, w, t) })),
    { groupe: 'Créer', libelle: 'Commentaire', detail: 'C', faire: () => creerCommentaire(w) },
    { groupe: 'Vue', libelle: 'Cadrer tout', detail: 'F', faire: () => cadrer(true) },
    { groupe: 'Vue', libelle: 'Replier les énoncés et usages', faire: () => basculerReplis(true) },
    { groupe: 'Vue', libelle: 'Tout déplier', faire: () => basculerReplis(false) },
    { groupe: 'Édition', libelle: 'Tout sélectionner', detail: 'Ctrl+A', faire: () => choisir(E.graphe.noeuds.map((n) => `n:${n.id}`)) },
    { groupe: 'Édition', libelle: 'Annuler', detail: 'Ctrl+Z', faire: S.annuler },
    { groupe: 'Édition', libelle: 'Rétablir', detail: 'Ctrl+Y', faire: S.retablir },
    ...E.graphe.noeuds.map((n) => ({ groupe: 'Aller à', libelle: n.nom, detail: STATUTS[st[n.id]]?.libelle, faire: () => aller(n.id) })),
  ]
}

function actionsNoeud(id) {
  const n = S.noeud(id)
  const a = [
    { groupe: 'Nœud', libelle: 'Renommer', detail: 'F2', faire: () => { const el = elNoeud(id)?.querySelector('.n-nom'); if (el) renommer(el) } },
    { groupe: 'Nœud', libelle: 'Dupliquer', detail: 'Ctrl+D', faire: dupliquer },
    { groupe: 'Nœud', libelle: 'Supprimer', detail: 'Suppr', faire: supprimerSelection },
    { groupe: 'Nœud', libelle: 'Commentaire autour de la sélection', detail: 'C', faire: () => creerCommentaire() },
    { groupe: 'Liens', libelle: 'Rompre tous les liens sortants', faire: () => S.modifier(`Rompre les liens de « ${n.nom} »`, () => { for (const d of S.usages(id)) S.delier(id, d.id) }) },
  ]
  if (!n.admis) {
    a.splice(1, 0, { groupe: 'Nœud', libelle: 'Ajouter une démonstration', faire: () => S.modifier(`Ajouter une démonstration à « ${n.nom} »`, () => S.ajouterDemo(id)) })
    a.push({ groupe: 'Nature', libelle: 'Transformer en fait admis', faire: () => S.modifier(`« ${n.nom} » devient un fait admis`, () => S.convertir(id, true)) })
  } else {
    a.push({ groupe: 'Nature', libelle: 'Transformer en assertion à démontrer', faire: () => S.modifier(`« ${n.nom} » devient une assertion`, () => S.convertir(id, false)) })
  }
  return a
}

function actionsCommentaire(c) {
  return [
    { groupe: 'Commentaire', libelle: 'Renommer', faire: () => { const el = elComment(c.id)?.querySelector('.c-nom'); if (el) renommer(el) } },
    { groupe: 'Commentaire', libelle: 'Ajuster au contenu', faire: () => ajusterCommentaire(c) },
    { groupe: 'Commentaire', libelle: 'Supprimer', detail: 'Suppr', faire: supprimerSelection },
    ...S.COULEURS_COMMENT.map((k, i) => ({ groupe: 'Couleur', libelle: ['Gris', 'Bleu', 'Violet', 'Ambre', 'Sarcelle', 'Framboise', 'Vert', 'Encre'][i], detail: k, faire: () => S.modifier(`Couleur du commentaire « ${c.titre} »`, () => { c.couleur = k }) })),
  ]
}

function ajusterCommentaire(c) {
  const b = boiteDe(contenus(c).noeuds)
  if (!b) return
  const M = MARGE_COMMENT
  S.modifier(`Ajuster le commentaire « ${c.titre} »`, () => {
    c.x = Math.floor((b.x0 - M.cote) / S.GRILLE) * S.GRILLE
    c.y = Math.floor((b.y0 - M.haut) / S.GRILLE) * S.GRILLE
    c.l = Math.ceil((b.x1 - b.x0 + 2 * M.cote) / S.GRILLE + 1) * S.GRILLE
    c.h = Math.ceil((b.y1 - b.y0 + M.haut + M.bas) / S.GRILLE + 1) * S.GRILLE
  })
}

function menuContextuel(cx, cy, cible) {
  const w = versMonde(cx, cy)
  const n = cible.closest?.('.noeud')
  const c = cible.closest?.('.commentaire')
  if (n) {
    const id = n.dataset.id
    if (!selection.has(`n:${id}`)) choisir([`n:${id}`])
    return ouvrirMenu(cx, cy, S.nom(id), actionsNoeud(id))
  }
  if (c) {
    const k = S.categorie(c.dataset.cid)
    if (!selection.has(`c:${k.id}`)) choisir([`c:${k.id}`])
    return ouvrirMenu(cx, cy, `Commentaire « ${k.titre} »`, actionsCommentaire(k))
  }
  ouvrirMenu(cx, cy, 'Toutes les actions', toutesLesActions(w))
}

// ─── Souris ──────────────────────────────────────────────────────────────────────────────────────────

canevas.addEventListener('contextmenu', (e) => e.preventDefault())
canevas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault() }) // pas d'auto-défilement

canevas.addEventListener('pointerdown', (e) => {
  const t = e.target
  if (t.isContentEditable || t.closest('input, textarea, select, .legende-p')) return
  if (e.button === 1 || e.button === 2) { e.preventDefault(); debutPan(e, { menuSiClic: e.button === 2 }); return }
  if (e.button !== 0) return

  if (e.altKey) {
    e.preventDefault()
    const zone = t.closest('[data-fil]')
    const entree = t.closest('.broche.entree') && t.closest('[data-entree]')
    const sortie = t.closest('[data-sortie]')
    if (zone || entree) {
      const [demoId, prem] = (zone ? zone.dataset.fil : entree.dataset.entree).split('|')
      if (prem !== '+') S.modifier(`Couper « ${S.nom(prem)} » → ${S.demo(demoId)?.nom_demonstration}`, () => S.delier(prem, demoId))
    } else if (sortie) {
      const id = sortie.dataset.sortie
      if (S.usages(id).length) S.modifier(`Couper les liens de « ${S.nom(id)} »`, () => { for (const d of S.usages(id)) S.delier(id, d.id) })
    }
    return
  }

  const sortie = t.closest('[data-sortie]')
  if (sortie) { e.preventDefault(); debutFil(e, { de: 'sortie', id: sortie.dataset.sortie }); return }
  const entree = t.closest('.broche.entree') && t.closest('[data-entree]')
  if (entree) {
    e.preventDefault()
    const [demo, prem] = entree.dataset.entree.split('|')
    debutFil(e, { de: 'entree', demo, prem })
    return
  }
  if (t.closest('.m-actif, [data-action], .s-plus')) return

  const coin = t.closest('[data-redim]')
  if (coin) {
    e.preventDefault()
    const c = S.categorie(coin.closest('.commentaire').dataset.cid)
    choisir([`c:${c.id}`])
    debutRedim(e, c)
    return
  }

  const titre = t.closest('.c-titre')
  if (titre) {
    e.preventDefault()
    const cle = `c:${titre.closest('.commentaire').dataset.cid}`
    if (e.shiftKey || e.ctrlKey) { selection.has(cle) ? selection.delete(cle) : selection.add(cle); majSelection() }
    else if (!selection.has(cle)) choisir([cle])
    debutDeplacement(e)
    return
  }

  const nEl = t.closest('.noeud')
  if (nEl) {
    const cle = `n:${nEl.dataset.id}`
    if (e.shiftKey || e.ctrlKey) { selection.has(cle) ? selection.delete(cle) : selection.add(cle); majSelection() }
    else if (!selection.has(cle)) choisir([cle])
    const poignee = t.closest('.m-poignee')
    if (poignee) { e.preventDefault(); debutReordre(e, poignee.closest('.module')); return }
    if (t.closest('[data-poignee]')) { e.preventDefault(); debutDeplacement(e) }
    return
  }

  e.preventDefault()
  if (e.shiftKey || e.ctrlKey) debutRectangle(e)
  else debutPan(e, { viderSiClic: true })
})

canevas.addEventListener('click', (e) => {
  const t = e.target
  if (e.altKey || t.isContentEditable) return
  const plus = t.closest('[data-action="ajouter-demo"]')
  if (plus) {
    const id = plus.closest('.noeud').dataset.id
    S.modifier(`Ajouter une démonstration à « ${S.nom(id)} »`, () => S.ajouterDemo(id))
    return
  }
  const u = t.closest('[data-aller]')
  if (u) { aller(u.dataset.aller); return }
  const tete = t.closest('.s-tete')
  if (tete && !t.closest('.broche')) {
    const id = tete.closest('.noeud').dataset.id
    const cle = tete.closest('[data-section]').dataset.section
    S.modifierVue(() => { E.replis[id] = { ...E.replis[id], [cle]: !E.replis[id]?.[cle] } })
  }
})

canevas.addEventListener('change', (e) => {
  if (!e.target.classList.contains('m-actif')) return
  const d = S.demo(e.target.closest('[data-demo]').dataset.demo)
  const v = e.target.checked
  S.modifier(`${v ? 'Activer' : 'Désactiver'} ${d.nom_demonstration} (« ${S.nom(d.noeud_id)} »)`, () => { d.active = v })
})

// ─── Clavier ─────────────────────────────────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (!menu.hidden) return
  const t = e.target
  if (t.isContentEditable || t.closest?.('input, textarea, select')) return
  const ctrl = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); S.annuler(); return }
  if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); S.retablir(); return }
  if (onglet !== 'vue') return
  if (ctrl && k === 'd') { e.preventDefault(); dupliquer() }
  else if (ctrl && k === 'a') { e.preventDefault(); choisir(E.graphe.noeuds.map((n) => `n:${n.id}`)) }
  else if (ctrl) return
  else if (k === 'f') cadrer()
  else if (k === 'c') { e.preventDefault(); creerCommentaire() }
  else if (e.key === 'Delete') supprimerSelection()
  else if (e.key === 'Escape') choisir([])
  else if (e.key === 'F2') {
    e.preventDefault()
    const [s] = selection
    if (selection.size !== 1) return
    const el = s.startsWith('n:') ? elNoeud(s.slice(2))?.querySelector('.n-nom') : elComment(s.slice(2))?.querySelector('.c-nom')
    if (el) renommer(el)
  }
})

// ─── Barre d'outils ──────────────────────────────────────────────────────────────────────────────────

document.querySelector('.barre').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]')
  if (!b) return
  const cmd = b.dataset.cmd
  if (cmd === 'annuler') S.annuler()
  else if (cmd === 'retablir') S.retablir()
  else if (cmd === 'cadrer') { changerOnglet('vue'); cadrer() }
  else if (cmd === 'commentaire') { changerOnglet('vue'); creerCommentaire() }
  else if (cmd === 'reinitialiser') {
    changerOnglet('vue')
    selection.clear()
    S.modifier('Réinitialiser l’exemple', () => {
      S.remettreExemple()
      st = S.statuts()
      rendreNoeuds()
      disposerExemple()
    })
    cadrer(true)
  }
})

// ─── Disposition initiale du jeu d'exemple ───────────────────────────────────────────────────────────

// Une boîte « Comment » par catégorie ; dedans, une colonne par profondeur de démonstration.
const RANGEES = [['k1', 'k2'], ['k3', 'k4']]

function profondeurs() {
  const p = {}
  const calc = (id, pile = new Set()) => {
    if (id in p) return p[id]
    if (pile.has(id)) return 0
    pile.add(id)
    let v = 0
    for (const d of S.demosDe(id)) for (const q of d.justifie_par) v = Math.max(v, calc(q, pile) + 1)
    pile.delete(id)
    p[id] = v
    return v
  }
  for (const n of E.graphe.noeuds) calc(n.id)
  return p
}

function disposerExemple() {
  const prof = profondeurs()
  const M = MARGE_COMMENT
  const EX = 96, EY = 28, ECART = 112
  const places = new Set()
  const blocs = E.graphe.categories.map((c) => {
    const ids = (c.noeuds || []).filter((id) => S.noeud(id) && !places.has(id))
    ids.forEach((i) => places.add(i))
    return { c, ids }
  })
  const orphelins = E.graphe.noeuds.map((n) => n.id).filter((i) => !places.has(i))
  if (orphelins.length) blocs.push({ c: null, ids: orphelins })

  for (const b of blocs) {
    const niveaux = [...new Set(b.ids.map((i) => prof[i]))].sort((x, y) => x - y)
    const cols = niveaux.map((v) => b.ids.filter((i) => prof[i] === v))
    const hauteurs = cols.map((col) => col.reduce((s, i) => s + mesures.get(i).h, 0) + EY * (col.length - 1))
    const hMax = Math.max(0, ...hauteurs)
    b.local = {}
    let x = 0
    cols.forEach((col, ci) => {
      const l = Math.max(...col.map((i) => mesures.get(i).l))
      let y = (hMax - hauteurs[ci]) / 2
      for (const i of col) {
        b.local[i] = { x: x + l - mesures.get(i).l, y }
        y += mesures.get(i).h + EY
      }
      x += l + EX
    })
    b.l = Math.ceil((x - EX + 2 * M.cote) / S.GRILLE) * S.GRILLE
    b.h = Math.ceil((hMax + M.haut + M.bas) / S.GRILLE) * S.GRILLE
  }

  // Rangées tassées à gauche ; les catégories hors rangées (conclusion…) forment une colonne à droite.
  const parId = new Map(blocs.filter((b) => b.c).map((b) => [b.c.id, b]))
  const rangees = RANGEES.map((r) => r.map((id) => parId.get(id)).filter(Boolean)).filter((r) => r.length)
  const dansRangee = new Set(rangees.flat())
  const droite = blocs.filter((b) => !dansRangee.has(b))
  let y = 0
  let largeur = 0
  for (const r of rangees) {
    let x = 0
    for (const b of r) { b.bx = x; b.by = y; x += b.l + ECART }
    largeur = Math.max(largeur, x)
    y += Math.max(...r.map((b) => b.h)) + ECART
  }
  const hTotal = Math.max(0, y - ECART)
  const hDroite = droite.reduce((s, b) => s + b.h, 0) + ECART * (droite.length - 1)
  let yd = Math.max(0, (hTotal - hDroite) / 2)
  for (const b of droite) { b.bx = largeur; b.by = yd; yd += b.h + ECART }

  for (const b of blocs) {
    const bx = S.aligner(b.bx)
    const by = S.aligner(b.by)
    if (b.c) {
      Object.assign(b.c, { x: bx, y: by, l: b.l, h: b.h })
      delete b.c.noeuds
    }
    for (const i of b.ids) E.positions[i] = { x: S.aligner(bx + M.cote + b.local[i].x), y: S.aligner(by + M.haut + b.local[i].y) }
  }
}

// ─── Légende et démarrage ────────────────────────────────────────────────────────────────────────────

canevas.querySelector('.legende-p').innerHTML = `
  ${Object.entries(VALIDITES).map(([k, v]) => `<span><i class="l" style="border-color:${k === 'valide' ? '#3f3f46' : v.couleur}"></i>${v.libelle}</span>`).join('')}
  <span><i class="l" style="border-top-style:dashed;border-color:#a1a1aa"></i>Module désactivé</span>
  ${Object.entries(S.TYPES_FAIT).map(([, v]) => `<span><i class="pastille" style="background:${v.couleur};border-radius:3px;margin:0"></i>${v.libelle}</span>`).join('')}
  <span class="aide">Clic droit : actions · Maj+glisser : sélection · C : commentaire · F : cadrer · Alt+clic : couper</span>`

// Les hauteurs des piles dépendent de la police : on attend Inter avant de mesurer et disposer.
try { await document.fonts.ready } catch { /* polices indisponibles : on mesure avec la police de repli */ }
S.surChangement(rendre)
const restaure = S.charger()
appliquerVue()
rendre()
if (!restaure || E.graphe.categories.some((c) => c.x === undefined)) {
  disposerExemple()
  S.sauver()
  rendre()
}
cadrer(true)
