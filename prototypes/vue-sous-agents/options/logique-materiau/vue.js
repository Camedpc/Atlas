// Éditeur de matériau : le raisonnement se lit comme un matériau d'Unreal, de gauche à droite, jusqu'au
// grand nœud de sortie « Conclusion ». Chaque nœud porte une vignette d'aperçu repliable ; les statuts
// sont recalculés à chaque modification par `calculerStatuts`, jamais stockés.

import { STATUTS, VALIDITES, calculerStatuts } from '../../commun/raisonnement.js'
import {
  BROCHES, TYPES, COULEURS, LARGEUR, objet, infoBroche, compatibles, cleDeBroche, liaisons, lier, delier,
  creer, supprimer, dupliquer, etatInitial, charger, sauver, chargerCam, sauverCam,
} from './modele.js'

const $ = (s) => document.querySelector(s)
const toile = $('.toile')
const monde = $('.monde')
const coucheC = $('.commentaires')
const coucheN = $('.noeuds')
const svg = $('.fils')
const details = $('.details')
const stats = $('.stats')
const menu = $('.menu')
const rectSel = $('.rect-selection')
const zoomInfo = $('.zoom')
const etatSauvegarde = $('.sauvegarde')

const PLURIELS = { etabli: 'Établis', suspendu: 'Suspendus', a_verifier: 'À vérifier', invalide: 'Invalides', ouvert: 'Ouverts' }
const CHEVRON = '<svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'

let etat = charger()
let passe = []
let futur = []
let selection = new Set()
let cam = chargerCam() ?? { x: 40, y: 40, z: 0.7 }
const camSauvee = chargerCam() !== null
let statuts = {}
let lignes = []
let lies = new Set()
let demosVers = new Map()
let stockageOk = true
let geste = null
const tailles = new Map()
const decalages = new Map()

// ─── Utilitaires ───────────────────────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fmt = (v) => (v == null ? '—' : v.toFixed(2).replace('.', ','))
const normal = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const borne = (v, a, b) => Math.min(b, Math.max(a, v))
const noeud = (id) => etat.noeuds.find((n) => n.id === id)
const demo = (id) => etat.demonstrations.find((d) => d.id === id)

function ecranVersMonde(cx, cy) {
  const r = toile.getBoundingClientRect()
  return { x: (cx - r.left - cam.x) / cam.z, y: (cy - r.top - cam.y) / cam.z }
}

function nomDe(cle) {
  const o = objet(etat, cle)
  if (!o) return '?'
  return { n: o.nom, d: o.nom_demonstration, c: o.titre, s: 'Conclusion' }[cle[0]]
}

// Confiance d'une assertion : 1 si admise, sinon la meilleure confiance de ses démonstrations valides.
function confianceNoeud(n) {
  if (n.admis) return 1
  const cs = (demosVers.get(n.id) ?? []).filter((d) => d.validite === 'valide' && d.confiance != null).map((d) => d.confiance)
  return cs.length ? Math.max(...cs) : null
}

// ─── Historique et persistance ─────────────────────────────────────────────────────────────────────

function valider(modif, options = {}) {
  const avant = JSON.stringify(etat)
  if (modif() === false) return
  passe.push(avant)
  if (passe.length > 200) passe.shift()
  futur = []
  enregistrer()
  rendre(options)
}

function enregistrer() {
  stockageOk = sauver(etat)
}

function nettoyerSelection() {
  selection = new Set([...selection].filter((c) => objet(etat, c)))
}

function annuler() {
  if (!passe.length) return
  futur.push(JSON.stringify(etat))
  etat = JSON.parse(passe.pop())
  nettoyerSelection()
  enregistrer()
  rendre()
}

function retablir() {
  if (!futur.length) return
  passe.push(JSON.stringify(etat))
  etat = JSON.parse(futur.pop())
  nettoyerSelection()
  enregistrer()
  rendre()
}

function reinitialiser() {
  valider(() => {
    etat = etatInitial()
    selection.clear()
  })
  ajusterCommentaires()
  cadrer(false)
}

// ─── Rendu ─────────────────────────────────────────────────────────────────────────────────────────

function calculer() {
  statuts = calculerStatuts(etat.noeuds, etat.demonstrations)
  lignes = liaisons(etat)
  lies = new Set(lignes.flatMap((l) => [l.de, l.vers]))
  demosVers = new Map(etat.noeuds.map((n) => [n.id, []]))
  for (const d of etat.demonstrations) demosVers.get(d.noeud_id)?.push(d)
}

function broche(cle, b, cote) {
  const pin = `${cle}|${b.nom}`
  const p = `<span class="pin t-${b.type}${lies.has(pin) ? ' plein' : ''}" data-pin="${pin}" title="${b.lab}"><i></i></span>`
  const lab = `<span class="lab">${b.lab}</span>`
  return `<div class="rang ${cote}">${cote === 'entree' ? p + lab : lab + p}</div>`
}

function pictogramme(st, t = 26) {
  const c = STATUTS[st].couleur
  const fond = `<circle cx="12" cy="12" r="10" fill="${c}" fill-opacity=".09" stroke="${c}" stroke-width="1.6"${st === 'ouvert' ? ' stroke-dasharray="3 2.4"' : ''}/>`
  const signe = {
    etabli: `<path d="M7.5 12.3l3 3 6-6.4" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    suspendu: `<path d="M10 8.2v7.6M14 8.2v7.6" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
    a_verifier: `<path d="M9.7 9.5a2.4 2.4 0 1 1 3.3 2.2c-.7.3-1 .8-1 1.5v.4" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.1" fill="${c}"/>`,
    invalide: `<path d="M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
    ouvert: '',
  }[st]
  return `<svg class="picto" width="${t}" height="${t}" viewBox="0 0 24 24">${fond}${signe}</svg>`
}

const jauge = (v, couleur) => `<span class="jauge"><i style="width:${Math.round((v ?? 0) * 100)}%;background:${couleur}"></i></span>`

function coquille(cle, genre, o, classes, titre, type, corps, apercu) {
  const cls = `noeud g-${genre}${classes}${selection.has(cle) ? ' choisi' : ''}${o.apercu === false ? ' replie' : ''}`
  return `<div class="${cls}" data-cle="${cle}" style="left:${o.x}px;top:${o.y}px">
    <div class="tete"><span class="t-nom">${esc(titre)}</span><span class="t-type">${type}</span></div>
    ${corps}
    <div class="apercu${apercu.cls ?? ''}">${apercu.html}</div>
    <button class="replier" data-replier title="${o.apercu === false ? 'Déplier' : 'Replier'} l’aperçu">${CHEVRON}</button>
  </div>`
}

function htmlNoeud(n) {
  const cle = 'n:' + n.id
  const st = statuts[n.id]
  const conf = confianceNoeud(n)
  const corps = `<div class="broches"><div class="col">${BROCHES.n.entrees.map((b) => broche(cle, b, 'entree')).join('')}</div><div class="col">${BROCHES.n.sorties.map((b) => broche(cle, b, 'sortie')).join('')}</div></div>`
  const apercu = `${pictogramme(st)}<div class="a-texte"><div class="a-ligne"><span style="color:${STATUTS[st].couleur}">${STATUTS[st].libelle}</span><span class="a-val">${fmt(conf)}</span></div>${jauge(conf, STATUTS[st].couleur)}</div>`
  return coquille(cle, 'n', n, n.admis ? ' admis' : '', n.nom, n.admis ? 'Fait' : 'Assertion', corps, { html: apercu })
}

function htmlDemo(d) {
  const cle = 'd:' + d.id
  const prem = d.justifie_par.map((p) => statuts[p]).filter(Boolean)
  const ok = prem.filter((s) => s === 'etabli').length
  const corps = `<div class="broches"><div class="col">${BROCHES.d.entrees.map((b) => broche(cle, b, 'entree')).join('')}</div><div class="col">${BROCHES.d.sorties.map((b) => broche(cle, b, 'sortie')).join('')}</div></div>`
  const tri = ['valide', 'a_verifier', 'invalide'].map((v) => `<i class="${d.validite === v ? 'actif' : ''}" style="--v:${VALIDITES[v].couleur}" title="${VALIDITES[v].libelle}"></i>`).join('')
  const apercu = `<div class="tri">${tri}</div>
    <div class="a-ligne"><span style="color:${VALIDITES[d.validite].couleur}">${VALIDITES[d.validite].libelle}</span><span class="a-val">${fmt(d.confiance)}</span></div>
    <div class="a-ligne discret"><span>Prémisses établies</span><span class="a-val">${ok}/${prem.length}</span></div>`
  return coquille(cle, 'd', d, '', d.nom_demonstration, 'Démo', corps, { html: apercu, cls: ' a-demo' })
}

function htmlSortie() {
  const s = etat.sortie
  const cle = 's:sortie'
  const n = s.enonce ? noeud(s.enonce) : null
  const dc = s.confiance ? demo(s.confiance) : null
  const dp = s.premisses ? demo(s.premisses) : null
  const prem = dp ? dp.justifie_par.map((p) => statuts[p]).filter(Boolean) : []
  const nonEtablis = s.ouverts.filter((o) => statuts[o] && statuts[o] !== 'etabli')
  const val = {
    enonce: n ? esc(n.nom) : '—',
    confiance: dc ? fmt(dc.confiance) : '—',
    premisses: dp ? `${prem.filter((x) => x === 'etabli').length} / ${prem.length}` : '—',
    ouverts: s.ouverts.length ? `${nonEtablis.length} / ${s.ouverts.length}` : '—',
  }
  const rangs = BROCHES.s.entrees.map((b) => {
    const pin = `${cle}|${b.nom}`
    return `<div class="rang entree"><span class="pin t-${b.type}${lies.has(pin) ? ' plein' : ''}" data-pin="${pin}" title="${b.lab}"><i></i></span><span class="lab">${b.lab}</span><span class="val">${val[b.nom]}</span></div>`
  }).join('')
  let apercu = '<span class="a-vide">Aucun énoncé relié à la sortie</span>'
  if (n) {
    const st = statuts[n.id]
    const conf = dc?.confiance ?? null
    apercu = `${pictogramme(st, 30)}<div class="a-texte"><div class="a-ligne"><span style="color:${STATUTS[st].couleur}">${STATUTS[st].libelle}</span><span class="a-val">${fmt(conf)}</span></div>
      <p class="a-enonce">${esc(n.enonce || n.nom)}</p>${jauge(conf, STATUTS[st].couleur)}</div>`
  }
  return coquille(cle, 's', s, '', 'Conclusion', 'Sortie', `<div class="broches unique">${rangs}</div>`, { html: apercu, cls: ' a-sortie' })
}

function htmlCommentaire(c) {
  const cle = 'c:' + c.id
  return `<div class="commentaire${selection.has(cle) ? ' choisi' : ''}" data-cle="${cle}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;--c:${c.couleur}">
    <div class="c-titre"><span class="t-nom">${esc(c.titre)}</span></div><span class="poignee" data-taille title="Redimensionner"></span></div>`
}

function rendre(options = {}) {
  calculer()
  coucheC.innerHTML = etat.commentaires.map(htmlCommentaire).join('')
  coucheN.innerHTML = [...etat.noeuds.map(htmlNoeud), ...etat.demonstrations.map(htmlDemo), htmlSortie()].join('')
  mesurer()
  rendreFils()
  if (!options.details) rendreDetails()
  rendreStats()
  majBarre()
}

// Décalage de chaque broche par rapport au coin de son nœud (unités du monde), pour tracer sans reflow.
function mesurer() {
  tailles.clear()
  decalages.clear()
  for (const el of coucheN.children) {
    const cle = el.dataset.cle
    tailles.set(cle, { w: el.offsetWidth, h: el.offsetHeight })
    const r = el.getBoundingClientRect()
    for (const p of el.querySelectorAll('[data-pin]')) {
      const q = p.getBoundingClientRect()
      decalages.set(p.dataset.pin, { cle, dx: (q.left + q.width / 2 - r.left) / cam.z, dy: (q.top + q.height / 2 - r.top) / cam.z })
    }
  }
}

function posBroche(pin) {
  const d = decalages.get(pin)
  const o = d && objet(etat, d.cle)
  return o ? { x: o.x + d.dx, y: o.y + d.dy } : null
}

function courbe(a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.45)
  return `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${(a.x + dx).toFixed(1)},${a.y.toFixed(1)} ${(b.x - dx).toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`
}

function rendreFils() {
  let h = ''
  lignes.forEach((l, i) => {
    const a = posBroche(l.de)
    const b = posBroche(l.vers)
    if (!a || !b) return
    const d = courbe(a, b)
    const actif = selection.has(cleDeBroche(l.de)) || selection.has(cleDeBroche(l.vers))
    const dem = l.genre === 'demontre' || (l.genre === 's' && l.champ !== 'enonce') ? demo(l.de.slice(2, l.de.lastIndexOf('|'))) : null
    const douteux = dem && dem.validite === 'invalide'
    h += `<path class="fil t-${l.type}${actif ? ' actif' : ''}${douteux ? ' douteux' : ''}" d="${d}"/><path class="fil-hit" data-lien="${i}" d="${d}"><title>Alt+clic pour couper</title></path>`
  })
  svg.innerHTML = h + '<path class="fil-temp" d=""/>'
}

// Au premier affichage de l'exemple, les boîtes de catégorie épousent la taille réelle de leurs nœuds.
function ajusterCommentaires() {
  if (!etat.aAjuster) return
  for (const c of etat.commentaires) {
    if (!c.membres?.length) continue
    let x1 = Infinity
    let y1 = Infinity
    let x2 = -Infinity
    let y2 = -Infinity
    for (const cle of c.membres) {
      const o = objet(etat, cle)
      const t = tailles.get(cle)
      if (!o || !t) continue
      x1 = Math.min(x1, o.x)
      y1 = Math.min(y1, o.y)
      x2 = Math.max(x2, o.x + t.w)
      y2 = Math.max(y2, o.y + t.h)
    }
    if (x1 < Infinity) Object.assign(c, { x: x1 - 26, y: y1 - 56, w: x2 - x1 + 52, h: y2 - y1 + 56 + 26 })
  }
  for (const c of etat.commentaires) delete c.membres
  delete etat.aAjuster
  enregistrer()
  rendre()
}

// ─── Caméra ────────────────────────────────────────────────────────────────────────────────────────

function appliquerCam() {
  monde.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.z})`
  const f = 16 * cam.z
  const m = 128 * cam.z
  toile.classList.toggle('grossiere', f < 7)
  toile.style.backgroundSize = f < 7 ? `${m}px ${m}px, ${m}px ${m}px` : `${m}px ${m}px, ${m}px ${m}px, ${f}px ${f}px, ${f}px ${f}px`
  toile.style.backgroundPosition = `${cam.x}px ${cam.y}px`
  zoomInfo.textContent = `Zoom ${Math.round(cam.z * 100)} %`
  sauverCam(cam)
}

function boite(cles) {
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const cle of cles) {
    const o = objet(etat, cle)
    if (!o) continue
    const t = cle[0] === 'c' ? { w: o.w, h: o.h } : tailles.get(cle)
    if (!t) continue
    x1 = Math.min(x1, o.x)
    y1 = Math.min(y1, o.y)
    x2 = Math.max(x2, o.x + t.w)
    y2 = Math.max(y2, o.y + t.h)
  }
  return x1 < Infinity ? { x1, y1, x2, y2 } : null
}

function toutesLesCles() {
  return [...etat.noeuds.map((n) => 'n:' + n.id), ...etat.demonstrations.map((d) => 'd:' + d.id), ...etat.commentaires.map((c) => 'c:' + c.id), 's:sortie']
}

function cadrer(surSelection = true) {
  const b = boite(surSelection && selection.size ? [...selection] : toutesLesCles())
  if (!b) return
  const r = toile.getBoundingClientRect()
  const marge = 56
  const z = borne(Math.min((r.width - 2 * marge) / (b.x2 - b.x1), (r.height - 2 * marge) / (b.y2 - b.y1)), 0.15, 1)
  cam = { z, x: r.width / 2 - ((b.x1 + b.x2) / 2) * z, y: r.height / 2 - ((b.y1 + b.y2) / 2) * z }
  appliquerCam()
}

function centrerSur(cle) {
  const b = boite([cle])
  if (!b) return
  const r = toile.getBoundingClientRect()
  cam.x = r.width / 2 - ((b.x1 + b.x2) / 2) * cam.z
  cam.y = r.height / 2 - ((b.y1 + b.y2) / 2) * cam.z
  appliquerCam()
}

toile.addEventListener('wheel', (e) => {
  if (e.target.closest('.menu')) return
  e.preventDefault()
  const r = toile.getBoundingClientRect()
  const mx = e.clientX - r.left
  const my = e.clientY - r.top
  const z = borne(cam.z * Math.exp(-e.deltaY * 0.0015), 0.15, 2)
  cam.x = mx - ((mx - cam.x) * z) / cam.z
  cam.y = my - ((my - cam.y) * z) / cam.z
  cam.z = z
  appliquerCam()
}, { passive: false })

// ─── Sélection ─────────────────────────────────────────────────────────────────────────────────────

function majClassesSelection() {
  for (const el of toile.querySelectorAll('[data-cle]')) el.classList.toggle('choisi', selection.has(el.dataset.cle))
  rendreFils()
}

function majSelection() {
  majClassesSelection()
  rendreDetails()
}

function toutSelectionner() {
  selection = new Set(toutesLesCles())
  majSelection()
}

// Nœuds (et commentaires) entièrement contenus dans une boîte : ils suivent la boîte quand on la déplace.
function contenus(c) {
  const dedans = (x, y, w, h) => x >= c.x && y >= c.y && x + w <= c.x + c.w && y + h <= c.y + c.h
  const res = []
  for (const [cle, t] of tailles) {
    const o = objet(etat, cle)
    if (o && dedans(o.x, o.y, t.w, t.h)) res.push(cle)
  }
  for (const k of etat.commentaires) if (k !== c && dedans(k.x, k.y, k.w, k.h)) res.push('c:' + k.id)
  return res
}

function elementsADeplacer() {
  const items = new Map()
  const ajouter = (cle) => {
    if (items.has(cle)) return
    const o = objet(etat, cle)
    const el = toile.querySelector(`[data-cle="${cle}"]`)
    if (o && el) items.set(cle, { o, el, x0: o.x, y0: o.y })
  }
  for (const cle of selection) {
    ajouter(cle)
    if (cle[0] === 'c') contenus(objet(etat, cle)).forEach(ajouter)
  }
  return [...items.values()]
}

// ─── Actions d'édition ─────────────────────────────────────────────────────────────────────────────

function creerA(type, p, apres) {
  valider(() => {
    const cle = creer(etat, type, p.x, p.y)
    selection = new Set([cle])
    apres?.(cle)
  })
}

function supprimerSelection() {
  valider(() => {
    if (!supprimer(etat, [...selection])) return false
    selection.clear()
  })
}

function dupliquerSelection() {
  valider(() => {
    const nouvelles = dupliquer(etat, [...selection])
    if (!nouvelles.length) return false
    selection = new Set(nouvelles)
  })
}

function commentaireAutour() {
  const b = boite([...selection].filter((c) => c[0] !== 'c'))
  let box
  if (b) box = { x: b.x1 - 26, y: b.y1 - 56, w: b.x2 - b.x1 + 52, h: b.y2 - b.y1 + 82 }
  else {
    const r = toile.getBoundingClientRect()
    const c = ecranVersMonde(r.left + r.width / 2, r.top + r.height / 2)
    box = { x: c.x - 220, y: c.y - 140, w: 440, h: 280 }
  }
  let cle
  valider(() => {
    cle = creer(etat, 'commentaire', box.x, box.y)
    Object.assign(objet(etat, cle), { w: Math.round(box.w), h: Math.round(box.h) })
    selection = new Set([cle])
  })
  if (cle) renommer(cle)
}

function romprePin(pin) {
  const ls = lignes.filter((l) => l.de === pin || l.vers === pin)
  if (ls.length) valider(() => ls.forEach((l) => delier(etat, l)))
}

function romprePour(cle) {
  const ls = lignes.filter((l) => cleDeBroche(l.de) === cle || cleDeBroche(l.vers) === cle)
  if (ls.length) valider(() => ls.forEach((l) => delier(etat, l)))
}

function essayerLier(a, b) {
  const avant = JSON.stringify(etat)
  if (!lier(etat, a, b)) return false
  passe.push(avant)
  futur = []
  enregistrer()
  rendre()
  return true
}

// Renommage en place (double-clic sur l'en-tête, F2).
function renommer(cle) {
  if (cle[0] === 's') return
  const cible = toile.querySelector(`[data-cle="${cle}"] .t-nom`)
  const o = objet(etat, cle)
  if (!cible || !o) return
  const champ = { n: 'nom', d: 'nom_demonstration', c: 'titre' }[cle[0]]
  const input = document.createElement('input')
  input.className = 'renommer'
  input.value = o[champ]
  cible.replaceWith(input)
  input.focus()
  input.select()
  let fini = false
  const terminer = (garder) => {
    if (fini) return
    fini = true
    const v = input.value.trim()
    if (garder && v && v !== o[champ]) valider(() => { objet(etat, cle)[champ] = v })
    else rendre()
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') terminer(true)
    else if (e.key === 'Escape') terminer(false)
  })
  input.addEventListener('blur', () => terminer(true))
  input.addEventListener('pointerdown', (e) => e.stopPropagation())
  input.addEventListener('dblclick', (e) => e.stopPropagation())
}

// ─── Menu « Toutes les actions » ───────────────────────────────────────────────────────────────────

let menuActions = []
let menuVisibles = []
let menuIndex = 0

function ouvrirMenu(cx, cy, titre, actions) {
  menuActions = actions
  menu.innerHTML = `<div class="m-titre">${esc(titre)}</div><input class="recherche" type="search" placeholder="Rechercher une action" aria-label="Rechercher une action"><div class="m-liste"></div>`
  menu.classList.add('ouvert')
  const input = menu.querySelector('input')
  input.addEventListener('input', () => remplirMenu(input.value))
  input.addEventListener('keydown', clavierMenu)
  remplirMenu('')
  const r = toile.getBoundingClientRect()
  menu.style.left = `${borne(cx - r.left, 8, r.width - menu.offsetWidth - 8)}px`
  menu.style.top = `${borne(cy - r.top, 8, r.height - menu.offsetHeight - 8)}px`
  input.focus()
}

function remplirMenu(q) {
  const nq = normal(q.trim())
  menuVisibles = menuActions.filter((a) => !nq || normal(`${a.libelle} ${a.groupe}`).includes(nq))
  menuIndex = 0
  let h = ''
  let groupe = null
  menuVisibles.forEach((a, i) => {
    if (a.groupe !== groupe) {
      groupe = a.groupe
      h += `<div class="m-groupe">${esc(groupe)}</div>`
    }
    h += `<div class="m-item${i === 0 ? ' actif' : ''}" data-i="${i}"><span>${esc(a.libelle)}</span>${a.raccourci ? `<kbd>${a.raccourci}</kbd>` : ''}</div>`
  })
  menu.querySelector('.m-liste').innerHTML = h || '<div class="m-vide">Aucune action compatible</div>'
}

function surligner() {
  for (const el of menu.querySelectorAll('.m-item')) el.classList.toggle('actif', +el.dataset.i === menuIndex)
  menu.querySelector('.m-item.actif')?.scrollIntoView({ block: 'nearest' })
}

function clavierMenu(e) {
  e.stopPropagation()
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    menuIndex = Math.min(menuIndex + 1, menuVisibles.length - 1)
    surligner()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    menuIndex = Math.max(menuIndex - 1, 0)
    surligner()
  } else if (e.key === 'Enter') {
    executer(menuIndex)
  } else if (e.key === 'Escape') {
    fermerMenu()
  }
}

function executer(i) {
  const a = menuVisibles[i]
  fermerMenu()
  a?.faire()
}

function fermerMenu() {
  if (!menu.classList.contains('ouvert')) return
  menu.classList.remove('ouvert')
  menu.innerHTML = ''
}

menu.addEventListener('click', (e) => {
  const it = e.target.closest('.m-item')
  if (it) executer(+it.dataset.i)
})
menu.addEventListener('pointermove', (e) => {
  const it = e.target.closest('.m-item')
  if (it && +it.dataset.i !== menuIndex) {
    menuIndex = +it.dataset.i
    surligner()
  }
})

function actionsCreation(p) {
  return Object.entries(TYPES).filter(([, t]) => t.genre !== 'c').map(([type, t]) => ({ groupe: t.groupe, libelle: t.libelle, faire: () => creerA(type, p) }))
}

function actionsFond(p) {
  return [
    ...actionsCreation(p),
    { groupe: 'Organisation', libelle: selection.size ? 'Commentaire autour de la sélection' : 'Commentaire', raccourci: 'C', faire: () => (selection.size ? commentaireAutour() : creerA('commentaire', p, (cle) => requestAnimationFrame(() => renommer(cle)))) },
    { groupe: 'Vue', libelle: 'Cadrer', raccourci: 'F', faire: () => cadrer() },
    { groupe: 'Édition', libelle: 'Tout sélectionner', raccourci: 'Ctrl+A', faire: toutSelectionner },
    { groupe: 'Édition', libelle: 'Annuler', raccourci: 'Ctrl+Z', faire: annuler },
    { groupe: 'Édition', libelle: 'Rétablir', raccourci: 'Ctrl+Y', faire: retablir },
    { groupe: 'Fichier', libelle: 'Réinitialiser l’exemple', faire: reinitialiser },
  ]
}

function actionsElement(cle) {
  const g = cle[0]
  const o = objet(etat, cle)
  const l = []
  if (g !== 's') l.push({ groupe: 'Élément', libelle: 'Renommer', raccourci: 'F2', faire: () => renommer(cle) })
  if (g !== 'c') l.push({ groupe: 'Élément', libelle: o.apercu === false ? 'Déplier l’aperçu' : 'Replier l’aperçu', faire: () => valider(() => { objet(etat, cle).apercu = o.apercu === false }) })
  if (g !== 's') l.push({ groupe: 'Élément', libelle: 'Dupliquer', raccourci: 'Ctrl+D', faire: dupliquerSelection })
  if (g !== 'c') l.push({ groupe: 'Élément', libelle: 'Rompre toutes les liaisons', faire: () => romprePour(cle) })
  l.push({ groupe: 'Élément', libelle: 'Commentaire autour de la sélection', raccourci: 'C', faire: commentaireAutour })
  if (g !== 's') l.push({ groupe: 'Élément', libelle: 'Supprimer', raccourci: 'Suppr', faire: supprimerSelection })
  if (g === 'c') for (const c of COULEURS) l.push({ groupe: 'Couleur', libelle: c.nom, faire: () => valider(() => { objet(etat, cle).couleur = c.valeur }) })
  l.push({ groupe: 'Vue', libelle: 'Cadrer la sélection', raccourci: 'F', faire: () => cadrer() })
  return l
}

// Relâcher un fil dans le vide : créer un nœud déjà relié, comme dans Unreal.
function actionsFil(info, p) {
  const l = []
  for (const [type, t] of Object.entries(TYPES)) {
    if (t.genre === 'c') continue
    const pins = BROCHES[t.genre][info.cote === 'sortie' ? 'entrees' : 'sorties'].filter((b) => b.type === info.type)
    for (const b of pins) {
      l.push({
        groupe: t.groupe,
        libelle: pins.length > 1 ? `${t.libelle} → ${b.lab}` : t.libelle,
        faire: () => valider(() => {
          const x = info.cote === 'sortie' ? p.x + 12 : p.x - LARGEUR[t.genre] - 12
          const cle = creer(etat, type, x, p.y - 40)
          lier(etat, info.pin, `${cle}|${b.nom}`)
          selection = new Set([cle])
        }),
      })
    }
  }
  return l
}

// ─── Gestes sur la toile ───────────────────────────────────────────────────────────────────────────

toile.addEventListener('contextmenu', (e) => e.preventDefault())

toile.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.menu, .renommer')) return
  fermerMenu()
  document.activeElement?.blur?.()
  const base = { x0: e.clientX, y0: e.clientY, bouge: false }
  if (e.button === 1 || e.button === 2) {
    e.preventDefault()
    geste = { ...base, type: 'pan', bouton: e.button, cx: cam.x, cy: cam.y, cible: e.target }
    return
  }
  if (e.button !== 0) return
  const pinEl = e.target.closest('[data-pin]')
  if (pinEl) {
    e.preventDefault()
    if (e.altKey) return romprePin(pinEl.dataset.pin)
    const info = infoBroche(pinEl.dataset.pin)
    geste = { ...base, type: 'fil', pin: pinEl.dataset.pin, info }
    toile.classList.add('tirage')
    for (const el of coucheN.querySelectorAll('[data-pin]')) el.classList.toggle('compatible', compatibles(info, infoBroche(el.dataset.pin)))
    return
  }
  const hit = e.target.closest('.fil-hit')
  if (hit && e.altKey) {
    const l = lignes[+hit.dataset.lien]
    if (l) valider(() => delier(etat, l))
    return
  }
  if (e.target.closest('[data-replier]')) return
  const poignee = e.target.closest('[data-taille]')
  if (poignee) {
    e.preventDefault()
    const cle = poignee.parentElement.dataset.cle
    const c = objet(etat, cle)
    selection = new Set([cle])
    majSelection()
    geste = { ...base, type: 'taille', c, el: poignee.parentElement, w0: c.w, h0: c.h, avant: JSON.stringify(etat) }
    return
  }
  const el = e.target.closest('.noeud') || e.target.closest('.c-titre')?.parentElement
  if (el) {
    const cle = el.dataset.cle
    const modif = e.shiftKey || e.ctrlKey || e.metaKey
    if (e.ctrlKey || e.metaKey) {
      if (selection.has(cle)) selection.delete(cle)
      else selection.add(cle)
      majSelection()
      if (!selection.has(cle)) return
    } else if (e.shiftKey) {
      selection.add(cle)
      majSelection()
    } else if (!selection.has(cle)) {
      selection = new Set([cle])
      majSelection()
    }
    geste = { ...base, type: 'deplacer', cle, modif, items: elementsADeplacer(), avant: JSON.stringify(etat) }
    return
  }
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    geste = { ...base, type: 'rect', initiale: new Set(selection) }
    return
  }
  geste = { ...base, type: 'pan', bouton: 0, cx: cam.x, cy: cam.y }
})

window.addEventListener('pointermove', (e) => {
  if (!geste) return
  const dx = e.clientX - geste.x0
  const dy = e.clientY - geste.y0
  if (!geste.bouge && Math.hypot(dx, dy) > 3) {
    geste.bouge = true
    if (geste.type === 'pan') toile.classList.add('panoramique')
  }
  if (!geste.bouge) return
  const g = geste
  if (g.type === 'pan') {
    cam.x = g.cx + dx
    cam.y = g.cy + dy
    appliquerCam()
  } else if (g.type === 'deplacer') {
    // Aimantation à la grille fine (8 unités), en conservant les écarts relatifs.
    const mx = Math.round(dx / cam.z / 8) * 8
    const my = Math.round(dy / cam.z / 8) * 8
    for (const it of g.items) {
      it.o.x = it.x0 + mx
      it.o.y = it.y0 + my
      it.el.style.left = `${it.o.x}px`
      it.el.style.top = `${it.o.y}px`
    }
    rendreFils()
  } else if (g.type === 'taille') {
    g.c.w = Math.max(180, Math.round(g.w0 + dx / cam.z))
    g.c.h = Math.max(90, Math.round(g.h0 + dy / cam.z))
    g.el.style.width = `${g.c.w}px`
    g.el.style.height = `${g.c.h}px`
  } else if (g.type === 'fil') {
    const a = posBroche(g.pin)
    const b = ecranVersMonde(e.clientX, e.clientY)
    const temp = svg.querySelector('.fil-temp')
    temp.setAttribute('class', `fil-temp t-${g.info.type}`)
    temp.setAttribute('d', g.info.cote === 'sortie' ? courbe(a, b) : courbe(b, a))
  } else if (g.type === 'rect') {
    const r = toile.getBoundingClientRect()
    const x1 = Math.min(g.x0, e.clientX)
    const y1 = Math.min(g.y0, e.clientY)
    const x2 = Math.max(g.x0, e.clientX)
    const y2 = Math.max(g.y0, e.clientY)
    Object.assign(rectSel.style, { display: 'block', left: `${x1 - r.left}px`, top: `${y1 - r.top}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` })
    const a = ecranVersMonde(x1, y1)
    const b = ecranVersMonde(x2, y2)
    selection = new Set(g.initiale)
    for (const [cle, t] of tailles) {
      const o = objet(etat, cle)
      if (o && o.x < b.x && o.x + t.w > a.x && o.y < b.y && o.y + t.h > a.y) selection.add(cle)
    }
    for (const c of etat.commentaires) if (c.x >= a.x && c.y >= a.y && c.x + c.w <= b.x && c.y + c.h <= b.y) selection.add('c:' + c.id)
    majClassesSelection()
  }
})

window.addEventListener('pointerup', (e) => {
  if (!geste) return
  const g = geste
  geste = null
  toile.classList.remove('panoramique')
  if (g.type === 'pan') {
    if (g.bouge) return
    if (g.bouton === 2) menuContextuel(e, g.cible)
    else if (g.bouton === 0 && selection.size) {
      selection.clear()
      majSelection()
    }
  } else if (g.type === 'deplacer') {
    if (g.bouge) {
      passe.push(g.avant)
      futur = []
      enregistrer()
      majBarre()
    } else if (!g.modif && selection.size > 1) {
      selection = new Set([g.cle])
      majSelection()
    }
  } else if (g.type === 'taille') {
    if (g.bouge) {
      passe.push(g.avant)
      futur = []
      enregistrer()
      majBarre()
    }
  } else if (g.type === 'fil') {
    toile.classList.remove('tirage')
    for (const el of coucheN.querySelectorAll('.pin.compatible')) el.classList.remove('compatible')
    svg.querySelector('.fil-temp')?.setAttribute('d', '')
    if (!g.bouge) return
    const cible = document.elementFromPoint(e.clientX, e.clientY)
    const pinEl = cible?.closest('[data-pin]')
    if (pinEl) {
      essayerLier(g.pin, pinEl.dataset.pin)
      return
    }
    const nEl = cible?.closest('.noeud')
    if (nEl) {
      const pin = [...nEl.querySelectorAll('[data-pin]')].map((x) => x.dataset.pin).find((q) => compatibles(g.info, infoBroche(q)))
      if (pin) essayerLier(g.pin, pin)
      return
    }
    if (cible && toile.contains(cible)) {
      const nom = BROCHES[g.info.genre][g.info.cote === 'sortie' ? 'sorties' : 'entrees'].find((b) => b.nom === g.info.nom).lab
      ouvrirMenu(e.clientX, e.clientY, `Depuis « ${nom} »`, actionsFil(g.info, ecranVersMonde(e.clientX, e.clientY)))
    }
  } else if (g.type === 'rect') {
    rectSel.style.display = 'none'
    majSelection()
  }
})

function menuContextuel(e, cible) {
  const el = cible?.closest?.('.noeud, .commentaire')
  if (el) {
    const cle = el.dataset.cle
    if (!selection.has(cle)) {
      selection = new Set([cle])
      majSelection()
    }
    ouvrirMenu(e.clientX, e.clientY, nomDe(cle), actionsElement(cle))
    return
  }
  ouvrirMenu(e.clientX, e.clientY, 'Toutes les actions', actionsFond(ecranVersMonde(e.clientX, e.clientY)))
}

toile.addEventListener('dblclick', (e) => {
  const t = e.target.closest('.tete, .c-titre')
  if (t) renommer(t.closest('[data-cle]').dataset.cle)
})

toile.addEventListener('click', (e) => {
  const b = e.target.closest('[data-replier]')
  if (!b) return
  const cle = b.closest('[data-cle]').dataset.cle
  valider(() => {
    const o = objet(etat, cle)
    o.apercu = o.apercu === false
  })
})

document.addEventListener('pointerdown', (e) => {
  if (!menu.contains(e.target) && !toile.contains(e.target)) fermerMenu()
})

// Glisser-déposer depuis la palette.
toile.addEventListener('dragover', (e) => {
  if (e.dataTransfer.types.includes('text/x-atlas-type')) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
})
toile.addEventListener('drop', (e) => {
  const type = e.dataTransfer.getData('text/x-atlas-type')
  if (!TYPES[type]) return
  e.preventDefault()
  const p = ecranVersMonde(e.clientX, e.clientY)
  const g = TYPES[type].genre
  creerA(type, { x: p.x - (g === 'c' ? 40 : 60), y: p.y - 12 }, g === 'c' ? (cle) => requestAnimationFrame(() => renommer(cle)) : null)
})

// ─── Clavier ───────────────────────────────────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select')) return
  const ctrl = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  if (ctrl && k === 'z') {
    e.preventDefault()
    if (e.shiftKey) retablir()
    else annuler()
  } else if (ctrl && k === 'y') {
    e.preventDefault()
    retablir()
  } else if (ctrl && k === 'd') {
    e.preventDefault()
    dupliquerSelection()
  } else if (ctrl && k === 'a') {
    e.preventDefault()
    toutSelectionner()
  } else if (ctrl || e.altKey) {
    // rien
  } else if (e.key === 'Delete') {
    supprimerSelection()
  } else if (k === 'f') {
    cadrer()
  } else if (k === 'c') {
    commentaireAutour()
  } else if (e.key === 'F2' && selection.size === 1) {
    e.preventDefault()
    renommer([...selection][0])
  } else if (e.key === 'Escape') {
    fermerMenu()
    if (selection.size) {
      selection.clear()
      majSelection()
    }
  }
})

// ─── Palette ───────────────────────────────────────────────────────────────────────────────────────

const palette = $('.palette .p-liste')
const recherchePalette = $('.palette .recherche')
const TETES = { assertion: 'var(--h-ass)', fait: 'var(--h-fait)', demonstration: 'var(--h-dem)', 'demonstration-valide': 'var(--h-dem)', 'demonstration-invalide': 'var(--h-dem)' }

function rendrePalette() {
  const q = normal(recherchePalette.value.trim())
  let h = ''
  let groupe = null
  for (const [type, t] of Object.entries(TYPES)) {
    if (q && !normal(`${t.libelle} ${t.groupe} ${t.aide}`).includes(q)) continue
    if (t.groupe !== groupe) {
      groupe = t.groupe
      h += `<div class="p-groupe">${groupe}</div>`
    }
    h += `<div class="p-item" draggable="true" data-type="${type}" title="Glisser sur la toile (double-clic : créer au centre)">
      <span class="p-ico${t.genre === 'c' ? ' c' : ''}" style="--h:${TETES[type] ?? 'transparent'}"></span><div><b>${t.libelle}</b><small>${t.aide}</small></div></div>`
  }
  palette.innerHTML = (h || '<div class="vide">Aucun type ne correspond</div>') + '<p class="p-note">Glissez un type sur la toile, ou tirez un fil dans le vide pour créer un nœud déjà relié.</p>'
}

recherchePalette.addEventListener('input', rendrePalette)
palette.addEventListener('dragstart', (e) => {
  const it = e.target.closest('.p-item')
  if (!it) return
  e.dataTransfer.setData('text/x-atlas-type', it.dataset.type)
  e.dataTransfer.effectAllowed = 'copy'
})
palette.addEventListener('dblclick', (e) => {
  const it = e.target.closest('.p-item')
  if (!it) return
  const r = toile.getBoundingClientRect()
  const p = ecranVersMonde(r.left + r.width / 2, r.top + r.height / 2)
  creerA(it.dataset.type, { x: p.x - 100, y: p.y - 50 })
})

// ─── Panneau Détails ───────────────────────────────────────────────────────────────────────────────

const pastille = (couleur) => `<span class="pastille" style="background:${couleur}"></span>`
const lienVers = (cle) => `<span class="lien" data-aller="${cle}">${esc(nomDe(cle))}</span>`
const champTexte = (lab, champ, val) => `<label class="champ"><span>${lab}</span><input data-champ="${champ}" value="${esc(val)}"></label>`
const champZone = (lab, champ, val, rows = 4) => `<label class="champ"><span>${lab}</span><textarea data-champ="${champ}" rows="${rows}">${esc(val)}</textarea></label>`
const section = (titre, corps) => `<div class="section"><h3>${titre}</h3>${corps}</div>`
const entete = (ico, h, role, nom) => `<div class="d-entete"><span class="d-ico" style="--h:${h}">${ico}</span><div><div class="d-role">${role}</div><div class="d-nom">${esc(nom)}</div></div></div>`

function choix(lab, champ, options, val, vide = '— aucun —') {
  const opts = options.map(([v, l]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')
  return `<label class="champ"><span>${lab}</span><select data-champ="${champ}"><option value="">${vide}</option>${opts}</select></label>`
}

const optionsNoeuds = (exclure = []) => etat.noeuds.filter((n) => !exclure.includes(n.id)).map((n) => [n.id, n.nom])
const optionsDemos = () => etat.demonstrations.map((d) => [d.id, d.nom_demonstration])

function listeCles(cles, retirer) {
  if (!cles.length) return '<div class="vide">Aucun</div>'
  return `<ul class="liste">${cles.map((cle) => {
    const id = cle.slice(2)
    const couleur = cle[0] === 'n' ? STATUTS[statuts[id]].couleur : VALIDITES[demo(id).validite].couleur
    return `<li>${pastille(couleur)}${lienVers(cle)}${retirer ? `<button class="retirer" data-${retirer}="${id}" title="Retirer">×</button>` : ''}</li>`
  }).join('')}</ul>`
}

function detailsNoeud(n) {
  const st = statuts[n.id]
  const usages = etat.demonstrations.filter((d) => d.justifie_par.includes(n.id)).map((d) => 'd:' + d.id)
  return entete(n.admis ? 'F' : 'A', n.admis ? 'var(--h-fait)' : 'var(--h-ass)', `${n.admis ? 'Fait admis' : 'Assertion'} · ${n.id}`, n.nom)
    + section('Général', champTexte('Nom', 'nom', n.nom) + champZone('Énoncé', 'enonce', n.enonce)
      + `<label class="champ"><span>Admis</span><span class="coche"><input type="checkbox" data-champ="admis"${n.admis ? ' checked' : ''}> établi sans démonstration</span></label>`)
    + section('Statut calculé', `<div class="champ"><span>Statut</span><span class="valeur">${pastille(STATUTS[st].couleur)}${STATUTS[st].libelle}</span></div>
      <div class="champ"><span>Confiance</span><span class="mono">${fmt(confianceNoeud(n))}</span></div>`)
    + section(`Démontrée par (${demosVers.get(n.id).length})`, listeCles(demosVers.get(n.id).map((d) => 'd:' + d.id)))
    + section(`Utilisée par (${usages.length})`, listeCles(usages))
    + section('Aperçu', `<label class="champ"><span>Vignette</span><span class="coche"><input type="checkbox" data-champ="apercu"${n.apercu !== false ? ' checked' : ''}> affichée</span></label>`)
}

function detailsDemo(d) {
  const prem = d.justifie_par.map((p) => 'n:' + p)
  const ajout = optionsNoeuds([...d.justifie_par, d.noeud_id])
  return entete('∴', 'var(--h-dem)', `Démonstration · ${d.id}`, d.nom_demonstration)
    + section('Général', champTexte('Nom', 'nom_demonstration', d.nom_demonstration)
      + choix('Démontre', 'noeud_id', optionsNoeuds(), d.noeud_id)
      + champZone('Raisonnement', 'demonstration', d.demonstration)
      + champTexte('Auteur', 'auteur', d.auteur ?? ''))
    + section('Vérification', `<label class="champ"><span>Validité</span><select data-champ="validite">${Object.entries(VALIDITES).map(([v, x]) => `<option value="${v}"${v === d.validite ? ' selected' : ''}>${x.libelle}</option>`).join('')}</select></label>
      <label class="champ"><span>Confiance</span><input data-champ="confiance" type="number" min="0" max="1" step="0.01" placeholder="non notée" value="${d.confiance ?? ''}"></label>`)
    + section(`Prémisses (${prem.length})`, listeCles(prem, 'retirer') + choix('Ajouter', 'ajout-premisse', ajout, null, 'Choisir une assertion…'))
    + section('Aperçu', `<label class="champ"><span>Vignette</span><span class="coche"><input type="checkbox" data-champ="apercu"${d.apercu !== false ? ' checked' : ''}> affichée</span></label>`)
}

function detailsCommentaire(c) {
  const dedans = contenus(c).filter((k) => k[0] !== 'c')
  const nuancier = COULEURS.map((x) => `<button class="${x.valeur === c.couleur ? 'actif' : ''}" style="--c:${x.valeur}" data-couleur="${x.valeur}" title="${x.nom}"></button>`).join('')
  return entete('▭', c.couleur, `Commentaire · ${c.id}`, c.titre)
    + section('Général', champTexte('Titre', 'titre', c.titre) + `<div class="champ"><span>Couleur</span><div class="nuancier">${nuancier}</div></div>
      <div class="champ"><span>Taille</span><span class="mono">${Math.round(c.w)} × ${Math.round(c.h)}</span></div>`)
    + section(`Contenu (${dedans.length})`, dedans.length ? `<ul class="liste">${dedans.map((k) => `<li>${lienVers(k)}</li>`).join('')}</ul>` : '<div class="vide">Aucun nœud entièrement dans la boîte</div>')
}

function detailsSortie() {
  const s = etat.sortie
  const ouverts = s.ouverts.map((o) => 'n:' + o)
  return entete('◎', 'var(--h-sortie)', 'Nœud de sortie', 'Conclusion')
    + section('Problème', champZone('Question', 'probleme', etat.probleme, 3))
    + section('Entrées', choix('Énoncé', 'sortie.enonce', optionsNoeuds(), s.enonce)
      + choix('Confiance', 'sortie.confiance', optionsDemos(), s.confiance)
      + choix('Prémisses', 'sortie.premisses', optionsDemos(), s.premisses))
    + section(`Points ouverts (${ouverts.length})`, listeCles(ouverts, 'retirer-ouvert') + choix('Ajouter', 'ajout-ouvert', optionsNoeuds(s.ouverts), null, 'Choisir une assertion…'))
}

function detailsVide() {
  return entete('?', 'var(--h-sortie)', 'Problème étudié', 'Aucune sélection')
    + section('Problème', champZone('Question', 'probleme', etat.probleme, 3))
    + section('Raccourcis', `<dl class="raccourcis">
      <dt>Clic droit</dt><dd>Toutes les actions (glisser : déplacer la vue)</dd>
      <dt>Molette</dt><dd>Zoom centré sur le curseur</dd>
      <dt>Maj / Ctrl + glisser</dt><dd>Sélection rectangle</dd>
      <dt>Broche → broche</dt><dd>Lier ; relâcher dans le vide : créer</dd>
      <dt>Alt + clic</dt><dd>Couper un fil ou toute une broche</dd>
      <dt>Double-clic</dt><dd>Renommer (ou F2)</dd>
      <dt>C</dt><dd>Commentaire autour de la sélection</dd>
      <dt>F</dt><dd>Cadrer la sélection ou tout</dd>
      <dt>Ctrl+D · Suppr</dt><dd>Dupliquer · Supprimer</dd>
      <dt>Ctrl+Z · Ctrl+Y</dt><dd>Annuler · Rétablir</dd></dl>`)
}

function rendreDetails() {
  const cles = [...selection]
  let h = '<div class="p-titre">Détails</div>'
  details.dataset.cle = cles.length === 1 ? cles[0] : ''
  if (!cles.length) h += detailsVide()
  else if (cles.length > 1) {
    h += entete(cles.length, 'var(--texte-3)', 'Sélection multiple', `${cles.length} éléments`)
      + section('Éléments', `<ul class="liste">${cles.map((k) => `<li>${lienVers(k)}</li>`).join('')}</ul>`)
  } else {
    const cle = cles[0]
    const o = objet(etat, cle)
    h += { n: detailsNoeud, d: detailsDemo, c: detailsCommentaire, s: detailsSortie }[cle[0]](o)
  }
  details.innerHTML = h
}

details.addEventListener('change', (e) => {
  const t = e.target
  const champ = t.dataset.champ
  if (!champ) return
  const cle = details.dataset.cle
  const o = cle ? objet(etat, cle) : null
  const structurel = t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'number'
  valider(() => {
    if (champ === 'probleme') etat.probleme = t.value
    else if (champ === 'admis') o.admis = t.checked
    else if (champ === 'apercu') o.apercu = t.checked
    else if (champ === 'confiance') {
      const v = parseFloat(String(t.value).replace(',', '.'))
      o.confiance = Number.isFinite(v) ? borne(v, 0, 1) : null
    } else if (champ === 'noeud_id') o.noeud_id = t.value || null
    else if (champ === 'ajout-premisse') {
      if (!t.value) return false
      o.justifie_par.push(t.value)
    } else if (champ === 'ajout-ouvert') {
      if (!t.value) return false
      etat.sortie.ouverts.push(t.value)
    } else if (champ.startsWith('sortie.')) etat.sortie[champ.slice(7)] = t.value || null
    else if (['nom', 'titre', 'nom_demonstration'].includes(champ)) {
      const v = t.value.trim()
      if (!v) return false
      o[champ] = v
    } else o[champ] = t.value
  }, { details: !structurel })
})

details.addEventListener('click', (e) => {
  const aller = e.target.closest('[data-aller]')
  if (aller) {
    selection = new Set([aller.dataset.aller])
    majSelection()
    centrerSur(aller.dataset.aller)
    return
  }
  const cle = details.dataset.cle
  const r = e.target.closest('[data-retirer]')
  if (r) return valider(() => { const d = objet(etat, cle); d.justifie_par = d.justifie_par.filter((p) => p !== r.dataset.retirer) })
  const ro = e.target.closest('[data-retirer-ouvert]')
  if (ro) return valider(() => { etat.sortie.ouverts = etat.sortie.ouverts.filter((o) => o !== ro.dataset.retirerOuvert) })
  const c = e.target.closest('[data-couleur]')
  if (c) valider(() => { objet(etat, cle).couleur = c.dataset.couleur })
})

// ─── Statistiques ──────────────────────────────────────────────────────────────────────────────────

function avertissements() {
  const l = []
  for (const d of etat.demonstrations) {
    if (!d.noeud_id) l.push({ cle: 'd:' + d.id, txt: `« ${d.nom_demonstration} » ne démontre aucune assertion` })
    if (!d.justifie_par.length) l.push({ cle: 'd:' + d.id, txt: `« ${d.nom_demonstration} » n’a aucune prémisse` })
  }
  for (const n of etat.noeuds) if (statuts[n.id] === 'invalide') l.push({ cle: 'n:' + n.id, txt: `« ${n.nom} » : toutes ses démonstrations sont invalides` })
  for (const b of BROCHES.s.entrees) {
    const v = etat.sortie[b.nom]
    if (Array.isArray(v) ? false : !v) l.push({ cle: 's:sortie', txt: `Entrée « ${b.lab} » de la conclusion non reliée` })
  }
  return l
}

function rendreStats() {
  const c = Object.fromEntries(Object.keys(STATUTS).map((k) => [k, 0]))
  for (const n of etat.noeuds) c[statuts[n.id]]++
  const v = Object.fromEntries(Object.keys(VALIDITES).map((k) => [k, 0]))
  for (const d of etat.demonstrations) v[d.validite]++
  const tuiles = [
    `<div class="s-tuile"><span>Nœuds</span><b>${etat.noeuds.length + etat.demonstrations.length}</b><small>${etat.noeuds.length} assertions · ${etat.demonstrations.length} démos</small></div>`,
    ...Object.entries(STATUTS).map(([k, s]) => `<div class="s-tuile"><span>${pastille(s.couleur)}${PLURIELS[k]}</span><b>${c[k]}</b><small>${Math.round((100 * c[k]) / Math.max(1, etat.noeuds.length))} % des assertions</small></div>`),
  ].join('')
  const av = avertissements()
  const s = etat.sortie
  const conclusion = s.enonce && noeud(s.enonce)
  const journal = [
    `<li class="info"><b>[Calcul]</b> ${etat.noeuds.length} statuts recalculés · ${lignes.length} liaisons · démonstrations : ${v.valide} valides, ${v.a_verifier} à vérifier, ${v.invalide} invalide${v.invalide > 1 ? 's' : ''}</li>`,
    conclusion ? `<li data-aller="s:sortie"><b>[Sortie]</b> Conclusion « ${esc(conclusion.nom)} » : ${STATUTS[statuts[conclusion.id]].libelle.toLowerCase()}${s.confiance && demo(s.confiance) ? ` · confiance ${fmt(demo(s.confiance).confiance)}` : ''}</li>` : '',
    ...av.slice(0, 6).map((a) => `<li class="avert" data-aller="${a.cle}"><b>[Avertissement]</b> ${esc(a.txt)}</li>`),
    av.length > 6 ? `<li>… et ${av.length - 6} autre${av.length - 6 > 1 ? 's' : ''}</li>` : '',
    av.length ? '' : '<li class="info"><b>[Graphe]</b> Aucun avertissement</li>',
  ].join('')
  stats.innerHTML = `<div class="p-titre">Statistiques<small>${av.length} avertissement${av.length > 1 ? 's' : ''}</small></div>
    <div class="s-corps"><div class="s-tuiles">${tuiles}</div><ul class="s-journal">${journal}</ul></div>`
}

stats.addEventListener('click', (e) => {
  const aller = e.target.closest('[data-aller]')
  if (!aller) return
  selection = new Set([aller.dataset.aller])
  majSelection()
  centrerSur(aller.dataset.aller)
})

// ─── Barre d'outils ────────────────────────────────────────────────────────────────────────────────

function majBarre() {
  $('[data-action="annuler"]').disabled = !passe.length
  $('[data-action="retablir"]').disabled = !futur.length
  etatSauvegarde.textContent = stockageOk ? 'Enregistré dans ce navigateur' : 'Stockage indisponible : modifications non conservées'
}

$('.barre').addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]')
  if (!b) return
  const actions = { annuler, retablir, cadrer: () => cadrer(), commentaire: commentaireAutour, reinitialiser }
  actions[b.dataset.action]?.()
})

// ─── Démarrage ─────────────────────────────────────────────────────────────────────────────────────

rendrePalette()
appliquerCam()
rendre()
const neuf = Boolean(etat.aAjuster)
ajusterCommentaires()
if (neuf || !camSauvee) cadrer(false)
