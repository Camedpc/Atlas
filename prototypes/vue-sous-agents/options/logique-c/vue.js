// Graphe de logique : éditeur de raisonnement façon Blueprint d'Unreal Engine, en thème clair.
// Un nœud = une assertion (en-tête coloré selon sa nature, broche de sortie en haut à droite).
// Ses démonstrations sont des sections du nœud : une rangée de titre (validité, confiance) puis une broche
// d'entrée par prémisse. Un fil relie la sortie d'une prémisse à la broche correspondante ; son style dit
// la validité, son opacité la confiance. Les catégories sont des boîtes « Comment ». Statuts recalculés à
// chaque modification par `calculerStatuts`.

import { calculerStatuts, STATUTS, VALIDITES } from '../../commun/raisonnement.js'
import {
  GRILLE, LARGEUR, CADRE, PALETTE, NATURES, natureDe, aimanter, nouvelId, etatInitial, etatValide, disposer, dependDe,
} from './modele.js'

const CLE = 'atlas-logique-c-v1'
const K_MIN = 0.2
const K_MAX = 2
const NS = 'http://www.w3.org/2000/svg'

const EXPLICATIONS = {
  etabli: 'Admis, ou démontré par une démonstration valide dont toutes les prémisses sont établies.',
  suspendu: 'Une démonstration est valide, mais au moins une de ses prémisses n’est pas encore établie.',
  a_verifier: 'Ses démonstrations attendent le vérificateur.',
  invalide: 'Toutes ses démonstrations ont été jugées invalides.',
  ouvert: 'Aucune démonstration : à démontrer, ou à admettre comme fait.',
}

// ─── Éléments ────────────────────────────────────────────────────────────────────────────────────────

const $ = (s, r = document) => r.querySelector(s)
const scene = $('.scene')
const monde = $('.monde')
const coucheComment = $('.commentaires')
const coucheNoeuds = $('.noeuds')
const gFils = $('.g-fils')
const filTemp = $('.fil-temp')
const rectangle = $('.rectangle')
const infoCable = $('.info-cable')
const zoomInfo = $('.zoom-info')
const toastEl = $('.toast')
const menu = $('.menu')
const menuRecherche = $('.m-recherche', menu)
const menuListe = $('.m-liste', menu)
const aide = $('.aide')
const contenu = $('.details .d-contenu')
const barre = $('.barre')
const B = Object.fromEntries([...barre.querySelectorAll('[data-a]')].map((b) => [b.dataset.a, b]))

$('.statuts-l').innerHTML = Object.values(STATUTS)
  .map((s) => `<span class="statut" style="--s:${s.couleur}"><i></i>${s.libelle}</span>`).join('')

// ─── État ────────────────────────────────────────────────────────────────────────────────────────────

let etat = null
let statuts = {}
let vue = { x: 40, y: 40, k: 1 }
let grille = true
const sel = new Set() // 'n:id' (nœud), 'd:id' (démonstration), 'k:id' (catégorie)
const rendus = new Map() // id de nœud → { el, html, h, pins }
const boites = new Map() // id de catégorie → { el, html }
const fils = new Map() // 'demo|premisse' → { g, hit, vis, d }
let geste = null
let souris = null // dernière position du pointeur, en coordonnées du monde
let espace = false

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fmtConf = (c) => (c === null || c === undefined ? '—' : c.toFixed(2).replace('.', ','))
const noeud = (id) => etat.noeuds.find((n) => n.id === id)
const demo = (id) => etat.demonstrations.find((d) => d.id === id)
const categorie = (id) => etat.categories.find((k) => k.id === id)
const demosDe = (id) => etat.demonstrations.filter((d) => d.noeud_id === id)
const idsSel = (t) => [...sel].filter((c) => c.startsWith(`${t}:`)).map((c) => c.slice(2))

// ─── Historique et sauvegarde ────────────────────────────────────────────────────────────────────────

const passe = []
const futur = []
let fusionPrec = null
let tFusion = 0
let minuteur = 0

function historiser(instantane) {
  passe.push(instantane)
  if (passe.length > 200) passe.shift()
  futur.length = 0
}

// Toute modification du graphe passe ici : instantané pour annuler, sauvegarde, rendu.
// `fusion` regroupe les frappes successives d'un même champ en une seule étape d'annulation.
function modifier(fn, { fusion = null, panneau = true } = {}) {
  const maintenant = Date.now()
  if (!(fusion && fusion === fusionPrec && maintenant - tFusion < 1500)) historiser(JSON.stringify(etat))
  fusionPrec = fusion
  tFusion = maintenant
  fn()
  sauver()
  rendre({ panneau })
}

function restaurer(depuis, vers) {
  if (!depuis.length) return
  vers.push(JSON.stringify(etat))
  etat = JSON.parse(depuis.pop())
  fusionPrec = null
  for (const c of [...sel]) {
    const [t, id] = [c[0], c.slice(2)]
    if (!(t === 'n' ? noeud(id) : t === 'd' ? demo(id) : categorie(id))) sel.delete(c)
  }
  sauver()
  rendre()
}
const annuler = () => restaurer(passe, futur)
const retablir = () => restaurer(futur, passe)

function sauver() {
  clearTimeout(minuteur)
  minuteur = setTimeout(() => {
    try { localStorage.setItem(CLE, JSON.stringify({ etat, vue, grille })) } catch { /* stockage indisponible */ }
  }, 250)
}

function charger() {
  try {
    const s = JSON.parse(localStorage.getItem(CLE))
    if (s && etatValide(s.etat)) return s
  } catch { /* rien de sauvegardé */ }
  return null
}

// ─── Vue : zoom et déplacement ───────────────────────────────────────────────────────────────────────

function appliquerVue() {
  monde.style.transform = `translate(${vue.x}px,${vue.y}px) scale(${vue.k})`
  monde.style.setProperty('--inv', (1 / vue.k).toFixed(3))
  const g = 128 * vue.k
  const f = 16 * vue.k
  scene.style.backgroundSize = `${g}px ${g}px, ${g}px ${g}px, ${f}px ${f}px, ${f}px ${f}px`
  scene.style.backgroundPosition = `${vue.x}px ${vue.y}px`
  zoomInfo.textContent = `Zoom ${Math.round(vue.k * 100)} %`
  sauver()
}

function versMonde(cx, cy) {
  const r = scene.getBoundingClientRect()
  return { x: (cx - r.left - vue.x) / vue.k, y: (cy - r.top - vue.y) / vue.k }
}

scene.addEventListener('wheel', (e) => {
  if (e.target.closest('.menu, .aide')) return
  e.preventDefault()
  fermerMenu()
  const r = scene.getBoundingClientRect()
  const px = e.clientX - r.left
  const py = e.clientY - r.top
  const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
  const k = Math.min(K_MAX, Math.max(K_MIN, vue.k * Math.exp(-d * 0.0015)))
  vue.x = px - ((px - vue.x) * k) / vue.k
  vue.y = py - ((py - vue.y) * k) / vue.k
  vue.k = k
  appliquerVue()
}, { passive: false })

let animation = 0
function allerVers(cible, anime = true) {
  cancelAnimationFrame(animation)
  if (!anime) { vue = cible; appliquerVue(); return }
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

const rectNoeud = (n) => ({ x: n.x, y: n.y, l: LARGEUR, h: rendus.get(n.id)?.h || 120 })
const rectCat = (k) => ({ x: k.x, y: k.y, l: k.l, h: k.h })

// F : la sélection (ou tout) ; Origine : tout.
function cadrer(toutLeGraphe = false, anime = true) {
  let rects = []
  if (!toutLeGraphe && sel.size) {
    for (const id of idsSel('n')) rects.push(rectNoeud(noeud(id)))
    for (const id of idsSel('d')) rects.push(rectNoeud(noeud(demo(id).noeud_id)))
    for (const id of idsSel('k')) rects.push(rectCat(categorie(id)))
  }
  if (!rects.length) rects = [...etat.noeuds.map(rectNoeud), ...etat.categories.map(rectCat)]
  if (!rects.length) return
  const x0 = Math.min(...rects.map((r) => r.x))
  const y0 = Math.min(...rects.map((r) => r.y))
  const x1 = Math.max(...rects.map((r) => r.x + r.l))
  const y1 = Math.max(...rects.map((r) => r.y + r.h))
  const m = 40
  const lu = scene.clientWidth - 2 * m
  const hu = scene.clientHeight - 2 * m - 40
  const k = Math.min(1, Math.max(K_MIN, Math.min(lu / (x1 - x0), hu / (y1 - y0))))
  allerVers({ k, x: scene.clientWidth / 2 - ((x0 + x1) / 2) * k, y: (scene.clientHeight - 40) / 2 - ((y0 + y1) / 2) * k }, anime)
}

function centrerSur(r) {
  allerVers({ k: vue.k, x: scene.clientWidth / 2 - (r.x + r.l / 2) * vue.k, y: scene.clientHeight / 2 - (r.y + r.h / 2) * vue.k })
}

// ─── Rendu des nœuds ─────────────────────────────────────────────────────────────────────────────────

function htmlNoeud(n, utilisations) {
  const nat = NATURES[natureDe(n)]
  const s = STATUTS[statuts[n.id]]
  const u = utilisations.get(n.id) || 0
  let h = `
    <div class="tete"><span class="ico">${nat.ico}</span>
      <div class="tt"><b class="nom" title="${esc(n.nom)}">${esc(n.nom)}</b><span>${nat.libelle}</span></div>
      <span class="pin sortie${u ? ' plein' : ''}" data-pin="sortie" data-noeud="${n.id}" title="Glisser vers une démonstration pour en faire une prémisse"><i></i></span>
    </div>
    <p class="enonce" title="${esc(n.enonce)}">${n.enonce ? esc(n.enonce) : '<i>Énoncé à rédiger dans le panneau Détails</i>'}</p>`
  const demos = demosDe(n.id)
  for (const d of demos) {
    const v = VALIDITES[d.validite]
    h += `<div class="demo v-${d.validite}" data-demo="${d.id}">
      <div class="rang d-tete" data-demo-tete="${d.id}" title="${esc(d.demonstration)}">
        <span class="pin entree ajout" data-pin="ajout" data-demo="${d.id}" title="Déposer ici une nouvelle prémisse"><i></i></span>
        <span class="d-nom">${esc(d.nom_demonstration)}</span>
        <span class="chip">${v.libelle}<b>${fmtConf(d.confiance)}</b></span>
      </div>`
    for (const p of d.justifie_par) {
      const pn = noeud(p)
      h += `<div class="rang"><span class="pin entree plein" data-pin="premisse" data-demo="${d.id}" data-p="${p}" title="Alt+clic : retirer cette prémisse"><i></i></span><span class="lab">${esc(pn ? pn.nom : p)}</span></div>`
    }
    h += '</div>'
  }
  if (!demos.length && !n.admis) {
    h += `<div class="rang nouvelle"><span class="pin entree" data-pin="nouvelle" data-noeud="${n.id}" title="Déposer une prémisse : crée une démonstration à vérifier"><i></i></span><span class="lab">à démontrer</span></div>`
  }
  h += `<div class="pied"><span class="statut" style="--s:${s.couleur}"><i></i>${s.libelle}</span><span class="util">${u ? `prémisse de ${u}` : ''}</span></div>`
  return h
}

// Centre d'un élément dans le repère du nœud (indépendant du zoom)
function decalage(el, racine) {
  let x = el.offsetWidth / 2 + racine.clientLeft
  let y = el.offsetHeight / 2 + racine.clientTop
  while (el && el !== racine) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent }
  return { x, y }
}

function mesurer(r) {
  r.h = r.el.offsetHeight
  r.pins = new Map()
  for (const p of r.el.querySelectorAll('.pin')) {
    const t = p.dataset.pin
    const cle = t === 'sortie' ? 'out' : t === 'premisse' ? `p:${p.dataset.demo}:${p.dataset.p}` : t === 'ajout' ? `a:${p.dataset.demo}` : 'n'
    r.pins.set(cle, decalage(p, r.el))
  }
}

function rendreNoeuds() {
  const utilisations = new Map()
  for (const d of etat.demonstrations) for (const p of d.justifie_par) utilisations.set(p, (utilisations.get(p) || 0) + 1)
  const presents = new Set()
  for (const n of etat.noeuds) {
    presents.add(n.id)
    let r = rendus.get(n.id)
    if (!r) {
      const el = document.createElement('div')
      el.dataset.id = n.id
      coucheNoeuds.append(el)
      r = { el }
      rendus.set(n.id, r)
    }
    const nat = NATURES[natureDe(n)]
    r.el.className = `noeud s-${statuts[n.id]}${sel.has(`n:${n.id}`) ? ' choisi' : ''}`
    r.el.style.setProperty('--c', nat.couleur)
    const html = htmlNoeud(n, utilisations)
    if (r.html !== html) { r.html = html; r.el.innerHTML = html; mesurer(r) }
    for (const d of r.el.querySelectorAll('.demo')) d.classList.toggle('choisie', sel.has(`d:${d.dataset.demo}`))
  }
  for (const [id, r] of rendus) if (!presents.has(id)) { r.el.remove(); rendus.delete(id) }
}

// ─── Catégories (boîtes « Comment ») ─────────────────────────────────────────────────────────────────

const POIGNEES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const dedans = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.l <= b.x + b.l && a.y + a.h <= b.y + b.h

function contenuDe(k) {
  const b = rectCat(k)
  return {
    noeuds: etat.noeuds.filter((n) => dedans(rectNoeud(n), b)),
    categories: etat.categories.filter((c) => c !== k && dedans(rectCat(c), b)),
  }
}

function rendreCategories() {
  const presents = new Set()
  // Les plus grandes derrière, pour que les boîtes imbriquées restent attrapables
  const ordre = [...etat.categories].sort((a, b) => b.l * b.h - a.l * a.h)
  for (const k of ordre) {
    presents.add(k.id)
    let r = boites.get(k.id)
    if (!r) {
      const el = document.createElement('div')
      el.dataset.id = k.id
      r = { el }
      boites.set(k.id, r)
    }
    if (coucheComment.children[ordre.indexOf(k)] !== r.el) coucheComment.insertBefore(r.el, coucheComment.children[ordre.indexOf(k)] || null)
    const nb = contenuDe(k).noeuds.length
    const html = `<div class="c-titre"><span class="c-nom">${esc(k.titre)}</span><small>${nb} nœud${nb > 1 ? 's' : ''}</small></div>${POIGNEES.map((p) => `<span class="poignee p-${p}" data-poignee="${p}"></span>`).join('')}`
    if (r.html !== html) { r.html = html; r.el.innerHTML = html }
    r.el.className = `commentaire${sel.has(`k:${k.id}`) ? ' choisi' : ''}`
    r.el.style.setProperty('--c', k.couleur)
  }
  for (const [id, r] of boites) if (!presents.has(id)) { r.el.remove(); boites.delete(id) }
}

// ─── Fils ────────────────────────────────────────────────────────────────────────────────────────────

function courbe(x0, y0, x1, y1) {
  const dx = Math.max(50, Math.abs(x1 - x0) * 0.5)
  return `M${x0.toFixed(1)},${y0.toFixed(1)}C${(x0 + dx).toFixed(1)},${y0.toFixed(1)} ${(x1 - dx).toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
}

function brocheMonde(id, cle) {
  const n = noeud(id)
  const o = rendus.get(id)?.pins.get(cle)
  return n && o ? { x: n.x + o.x, y: n.y + o.y } : null
}

function rendreFils() {
  const vus = new Set()
  for (const d of etat.demonstrations) {
    const actif = sel.has(`d:${d.id}`) || sel.has(`n:${d.noeud_id}`)
    for (const p of d.justifie_par) {
      const a = brocheMonde(p, 'out')
      const b = brocheMonde(d.noeud_id, `p:${d.id}:${p}`)
      if (!a || !b) continue
      const cle = `${d.id}|${p}`
      vus.add(cle)
      let f = fils.get(cle)
      if (!f) {
        const g = document.createElementNS(NS, 'g')
        const hit = document.createElementNS(NS, 'path')
        const vis = document.createElementNS(NS, 'path')
        const titre = document.createElementNS(NS, 'title')
        hit.setAttribute('class', 'fil-hit')
        hit.dataset.demo = d.id
        hit.dataset.p = p
        hit.append(titre)
        g.append(hit, vis)
        gFils.append(g)
        f = { g, hit, vis, titre }
        fils.set(cle, f)
      }
      const chemin = courbe(a.x, a.y, b.x, b.y)
      if (f.d !== chemin) { f.d = chemin; f.hit.setAttribute('d', chemin); f.vis.setAttribute('d', chemin) }
      f.vis.setAttribute('class', `fil v-${d.validite}${actif || sel.has(`n:${p}`) ? ' actif' : ''}`)
      f.vis.style.strokeOpacity = d.confiance === null || d.confiance === undefined ? 0.85 : (0.3 + 0.7 * d.confiance).toFixed(2)
      f.titre.textContent = `${noeud(p)?.nom} → ${noeud(d.noeud_id)?.nom}\n${d.nom_demonstration} · ${VALIDITES[d.validite].libelle} · confiance ${fmtConf(d.confiance)}\nAlt+clic : couper`
    }
  }
  for (const [cle, f] of fils) if (!vus.has(cle)) { f.g.remove(); fils.delete(cle) }
}

// Positions seules (pendant un glissement)
function placer() {
  for (const n of etat.noeuds) {
    const r = rendus.get(n.id)
    if (r) r.el.style.transform = `translate(${n.x}px,${n.y}px)`
  }
  for (const k of etat.categories) {
    const r = boites.get(k.id)
    if (!r) continue
    r.el.style.transform = `translate(${k.x}px,${k.y}px)`
    r.el.style.width = `${k.l}px`
    r.el.style.height = `${k.h}px`
  }
  rendreFils()
}

function rendre({ panneau = true } = {}) {
  statuts = calculerStatuts(etat.noeuds, etat.demonstrations)
  rendreNoeuds()
  rendreCategories()
  placer()
  $('.probleme', barre).textContent = etat.probleme
  $('.probleme', barre).title = etat.probleme
  B.annuler.disabled = !passe.length
  B.retablir.disabled = !futur.length
  B.grille.classList.toggle('actif', grille)
  if (panneau) rendrePanneau()
}

// ─── Opérations sur le graphe ────────────────────────────────────────────────────────────────────────

const idsDe = (liste) => new Set(liste.map((x) => x.id))

function nouvelleDemo(noeudId, premisses) {
  const d = {
    id: nouvelId('d', idsDe(etat.demonstrations)),
    noeud_id: noeudId,
    nom_demonstration: 'nouvelle_demonstration',
    justifie_par: [...premisses],
    demonstration: '',
    validite: 'a_verifier',
    confiance: null,
    auteur: 'camille',
  }
  etat.demonstrations.push(d)
  return d
}

function creerNoeud(nature, p, lien = null) {
  const id = nouvelId('n', idsDe(etat.noeuds))
  const x = lien?.demo || lien?.noeud ? p.x - LARGEUR - 24 : p.x
  modifier(() => {
    etat.noeuds.push({ id, nom: NATURES[nature].nouveau, enonce: '', admis: nature === 'fait', nature, x: aimanter(x), y: aimanter(p.y - 20) })
    if (lien?.premisse) nouvelleDemo(id, [lien.premisse])
    else if (lien?.demo) demo(lien.demo)?.justifie_par.push(id)
    else if (lien?.noeud) nouvelleDemo(lien.noeud, [id])
  }, { panneau: false })
  choisir([`n:${id}`])
  renommerNoeud(id)
}

function creerCategorie(p = null) {
  const id = nouvelId('k', idsDe(etat.categories))
  const rects = [...idsSel('n').map((i) => rectNoeud(noeud(i))), ...idsSel('k').map((i) => rectCat(categorie(i)))]
  let b
  if (rects.length) {
    const x0 = Math.min(...rects.map((r) => r.x)) - CADRE.cote
    const y0 = Math.min(...rects.map((r) => r.y)) - CADRE.haut
    const x1 = Math.max(...rects.map((r) => r.x + r.l)) + CADRE.cote
    const y1 = Math.max(...rects.map((r) => r.y + r.h)) + CADRE.bas
    b = { x: Math.floor(x0 / GRILLE) * GRILLE, y: Math.floor(y0 / GRILLE) * GRILLE }
    b.l = Math.ceil((x1 - b.x) / GRILLE) * GRILLE
    b.h = Math.ceil((y1 - b.y) / GRILLE) * GRILLE
  } else {
    const c = p || souris || versMonde(scene.getBoundingClientRect().left + scene.clientWidth / 2, scene.getBoundingClientRect().top + scene.clientHeight / 2)
    b = { x: aimanter(c.x - 200), y: aimanter(c.y - 120), l: 400, h: 240 }
  }
  const couleur = PALETTE[etat.categories.length % PALETTE.length]
  modifier(() => etat.categories.push({ id, titre: 'Nouvelle catégorie', couleur, ...b }), { panneau: false })
  choisir([`k:${id}`])
  renommerCategorie(id)
}

function supprimerSelection() {
  if (!sel.size) return
  const n = new Set(idsSel('n'))
  const d = new Set(idsSel('d'))
  const k = new Set(idsSel('k'))
  modifier(() => {
    etat.noeuds = etat.noeuds.filter((x) => !n.has(x.id))
    etat.demonstrations = etat.demonstrations.filter((x) => !d.has(x.id) && !n.has(x.noeud_id))
    for (const x of etat.demonstrations) x.justifie_par = x.justifie_par.filter((p) => !n.has(p))
    etat.categories = etat.categories.filter((x) => !k.has(x.id))
  }, { panneau: false })
  choisir([])
}

// Duplique nœuds et catégories choisis ; les démonstrations suivent leur nœud, les prémisses internes à
// la copie sont redirigées vers les copies (comme un copier-coller de Blueprint).
function dupliquer() {
  const ns = idsSel('n').map(noeud)
  const ks = idsSel('k').map(categorie)
  if (!ns.length && !ks.length) return
  const nouveaux = []
  modifier(() => {
    const ids = idsDe(etat.noeuds)
    const map = new Map()
    for (const n of ns) {
      const id = nouvelId('n', ids)
      ids.add(id)
      map.set(n.id, id)
      etat.noeuds.push({ ...n, id, x: n.x + 32, y: n.y + 32 })
      nouveaux.push(`n:${id}`)
    }
    for (const d of [...etat.demonstrations]) {
      if (!map.has(d.noeud_id)) continue
      etat.demonstrations.push({ ...d, id: nouvelId('d', idsDe(etat.demonstrations)), noeud_id: map.get(d.noeud_id), justifie_par: d.justifie_par.map((p) => map.get(p) ?? p) })
    }
    for (const k of ks) {
      const id = nouvelId('k', idsDe(etat.categories))
      etat.categories.push({ ...k, id, x: k.x + 32, y: k.y + 32 })
      nouveaux.push(`k:${id}`)
    }
  }, { panneau: false })
  choisir(nouveaux)
}

function couperLiensNoeud(id) {
  modifier(() => {
    for (const d of etat.demonstrations) {
      d.justifie_par = d.justifie_par.filter((p) => p !== id)
      if (d.noeud_id === id) d.justifie_par = []
    }
  })
}

function retirerPremisse(demoId, p) {
  modifier(() => {
    const d = demo(demoId)
    if (d) d.justifie_par = d.justifie_par.filter((x) => x !== p)
  })
}

function couperBroche(pin) {
  const t = pin.dataset.pin
  if (t === 'sortie') {
    modifier(() => { for (const d of etat.demonstrations) d.justifie_par = d.justifie_par.filter((p) => p !== pin.dataset.noeud) })
  } else if (t === 'premisse') retirerPremisse(pin.dataset.demo, pin.dataset.p)
  else if (t === 'ajout') modifier(() => { demo(pin.dataset.demo).justifie_par = [] })
}

// ─── Sélection ───────────────────────────────────────────────────────────────────────────────────────

function choisir(cles, { panneau = true } = {}) {
  sel.clear()
  for (const c of cles) sel.add(c)
  rendre({ panneau })
}

function choisirAuClic(cle, e) {
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    if (sel.has(cle) && (e.ctrlKey || e.metaKey)) sel.delete(cle)
    else sel.add(cle)
    rendre()
  } else if (!sel.has(cle)) choisir([cle])
}

// ─── Gestes au pointeur ──────────────────────────────────────────────────────────────────────────────

const distance = (e, d) => Math.hypot(e.clientX - d.x, e.clientY - d.y)

scene.addEventListener('contextmenu', (e) => e.preventDefault())

scene.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.menu, .aide, .legende-bp')) return
  if (e.target.isContentEditable) return
  fermerMenu()
  if (!aide.hidden) aide.hidden = true
  // Repérer les cibles AVANT de valider une saisie en cours (le rendu qui suit peut remplacer le DOM)
  const pin = e.target.closest('.pin')
  const poignee = e.target.closest('[data-poignee]')
  const titre = e.target.closest('.c-titre')
  const hit = e.target.closest('.fil-hit')
  const el = e.target.closest('.noeud')
  const tete = e.target.closest('[data-demo-tete]')
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur()
  if (e.button === 1 || e.button === 2 || (e.button === 0 && espace)) { e.preventDefault(); debutPanoramique(e); return }
  if (e.button !== 0) return

  if (pin) {
    e.preventDefault()
    if (e.altKey) couperBroche(pin)
    else debutCable(pin, e)
    return
  }
  if (poignee) { debutRedimension(poignee, e); return }
  if (titre) {
    const cle = `k:${titre.parentElement.dataset.id}`
    choisirAuClic(cle, e)
    debutDeplacement(e, cle)
    return
  }
  if (hit) {
    if (e.altKey) retirerPremisse(hit.dataset.demo, hit.dataset.p)
    else choisirAuClic(`d:${hit.dataset.demo}`, e)
    return
  }
  if (el) {
    const cle = `n:${el.dataset.id}`
    if (!tete) choisirAuClic(cle, e)
    debutDeplacement(e, cle, () => {
      if (tete) choisirAuClic(`d:${tete.dataset.demoTete}`, e)
      else if (!e.shiftKey && !e.ctrlKey && !e.metaKey && sel.size > 1) choisir([cle])
    })
    return
  }
  debutRectangle(e)
})

window.addEventListener('pointermove', (e) => {
  if (e.target instanceof Element && scene.contains(e.target)) souris = versMonde(e.clientX, e.clientY)
  // Bouton relâché hors de la fenêtre : on clôt le geste au lieu de le laisser pendre
  if (geste && e.buttons === 0 && e.pointerType === 'mouse') { finGeste(e); return }
  geste?.bouger(e)
})
const finGeste = (e) => {
  const g = geste
  geste = null
  g?.finir(e)
}
window.addEventListener('pointerup', finGeste)
window.addEventListener('pointercancel', finGeste)

function debutPanoramique(e) {
  const d = { x: e.clientX, y: e.clientY, vx: vue.x, vy: vue.y }
  let bouge = false
  geste = {
    bouger(ev) {
      if (!bouge && distance(ev, d) < 4) return
      bouge = true
      scene.classList.add('panoramique')
      vue.x = d.vx + ev.clientX - d.x
      vue.y = d.vy + ev.clientY - d.y
      appliquerVue()
    },
    finir() {
      scene.classList.remove('panoramique')
      if (!bouge && e.button === 2) menuContextuel(e)
    },
  }
}

// Glisser des nœuds et des catégories ; une catégorie emporte ce qu'elle contient.
function debutDeplacement(e, cle, surClic = null) {
  const d = { x: e.clientX, y: e.clientY }
  let bouge = false
  let avant = null
  let cibles = []
  let ancre = null
  geste = {
    bouger(ev) {
      if (!bouge) {
        if (distance(ev, d) < 3) return
        bouge = true
        avant = JSON.stringify(etat)
        if (!sel.has(cle)) choisir([cle])
        const objets = new Set()
        for (const id of idsSel('n')) objets.add(noeud(id))
        const pile = idsSel('k').map(categorie)
        while (pile.length) {
          const k = pile.pop()
          if (objets.has(k)) continue
          objets.add(k)
          const c = contenuDe(k)
          c.noeuds.forEach((n) => objets.add(n))
          pile.push(...c.categories)
        }
        cibles = [...objets].map((o) => ({ o, x0: o.x, y0: o.y }))
        const o = cle[0] === 'n' ? noeud(cle.slice(2)) : categorie(cle.slice(2))
        ancre = { x0: o.x, y0: o.y }
      }
      let ax = ancre.x0 + (ev.clientX - d.x) / vue.k
      let ay = ancre.y0 + (ev.clientY - d.y) / vue.k
      if (grille && !ev.altKey) { ax = aimanter(ax); ay = aimanter(ay) }
      for (const c of cibles) { c.o.x = c.x0 + ax - ancre.x0; c.o.y = c.y0 + ay - ancre.y0 }
      placer()
    },
    finir() {
      if (bouge) {
        if (JSON.stringify(etat) !== avant) { historiser(avant); fusionPrec = null; sauver() }
        rendre({ panneau: false })
      } else surClic?.()
    },
  }
}

function debutRedimension(poignee, e) {
  const el = poignee.closest('.commentaire')
  const k = categorie(el.dataset.id)
  const sens = poignee.dataset.poignee
  const d = { x: e.clientX, y: e.clientY }
  const b0 = { x: k.x, y: k.y, l: k.l, h: k.h }
  const avant = JSON.stringify(etat)
  if (!sel.has(`k:${k.id}`)) choisir([`k:${k.id}`])
  geste = {
    bouger(ev) {
      const sn = (v) => (grille && !ev.altKey ? aimanter(v) : v)
      const dx = (ev.clientX - d.x) / vue.k
      const dy = (ev.clientY - d.y) / vue.k
      let x0 = b0.x, y0 = b0.y, x1 = b0.x + b0.l, y1 = b0.y + b0.h
      if (sens.includes('w')) x0 = Math.min(sn(b0.x + dx), x1 - 160)
      if (sens.includes('e')) x1 = Math.max(sn(x1 + dx), x0 + 160)
      if (sens.includes('n')) y0 = Math.min(sn(b0.y + dy), y1 - 80)
      if (sens.includes('s')) y1 = Math.max(sn(y1 + dy), y0 + 80)
      Object.assign(k, { x: x0, y: y0, l: x1 - x0, h: y1 - y0 })
      placer()
    },
    finir() {
      if (JSON.stringify(etat) !== avant) { historiser(avant); fusionPrec = null; sauver() }
      rendre({ panneau: false })
    },
  }
}

function debutRectangle(e) {
  const r = scene.getBoundingClientRect()
  const d = { x: e.clientX, y: e.clientY }
  const ajout = e.shiftKey || e.ctrlKey || e.metaKey
  const base = ajout ? new Set(sel) : new Set()
  let bouge = false
  geste = {
    bouger(ev) {
      if (!bouge && distance(ev, d) < 3) return
      bouge = true
      const x0 = Math.min(d.x, ev.clientX) - r.left
      const y0 = Math.min(d.y, ev.clientY) - r.top
      const l = Math.abs(ev.clientX - d.x)
      const h = Math.abs(ev.clientY - d.y)
      Object.assign(rectangle.style, { display: 'block', left: `${x0}px`, top: `${y0}px`, width: `${l}px`, height: `${h}px` })
      const m = { x: (x0 - vue.x) / vue.k, y: (y0 - vue.y) / vue.k, l: l / vue.k, h: h / vue.k }
      const croise = (a) => a.x < m.x + m.l && a.x + a.l > m.x && a.y < m.y + m.h && a.y + a.h > m.y
      const cles = new Set(base)
      for (const n of etat.noeuds) if (croise(rectNoeud(n))) cles.add(`n:${n.id}`)
      for (const k of etat.categories) if (dedans(rectCat(k), m)) cles.add(`k:${k.id}`)
      choisir(cles, { panneau: false })
    },
    finir() {
      rectangle.style.display = 'none'
      if (bouge) rendrePanneau()
      else if (!ajout) choisir([])
    },
  }
}

// ─── Câblage ─────────────────────────────────────────────────────────────────────────────────────────

let cibleMarquee = null
function marquer(el, ok) {
  if (cibleMarquee) cibleMarquee.classList.remove('cible-ok', 'cible-ko')
  cibleMarquee = el
  if (el) el.classList.add(ok ? 'cible-ok' : 'cible-ko')
}

function lier(a, n, demoId, el) {
  if (a === n) return { ok: false, el, texte: 'Un nœud ne peut pas se justifier lui-même' }
  if (dependDe(etat, a, n)) return { ok: false, el, texte: 'Liaison refusée : elle fermerait un cycle' }
  const d = demoId ? demo(demoId) : null
  const nomA = noeud(a).nom
  if (d?.justifie_par.includes(a)) return { ok: false, el, texte: 'Déjà prémisse de cette démonstration' }
  if (d) return { ok: true, el, texte: `« ${nomA} » → prémisse de ${d.nom_demonstration}`, appliquer: () => modifier(() => d.justifie_par.push(a)) }
  return { ok: true, el, texte: `Nouvelle démonstration de « ${noeud(n).nom} » (à vérifier)`, appliquer: () => modifier(() => nouvelleDemo(n, [a])) }
}

// Cible sous le pointeur pendant un câblage. null : le vide (on proposera de créer un nœud).
function resoudreCible(el, src) {
  if (!el || !scene.contains(el) || el.closest('.legende-bp, .zoom-info')) return { ok: false, el: null, texte: '', annule: true }
  const ne = el.closest('.noeud')
  if (!ne) return null
  const id = ne.dataset.id
  if (src.sortie) {
    const pin = el.closest('.pin')
    if (pin?.dataset.pin === 'sortie') return { ok: false, el: pin, texte: 'Relier une sortie à une entrée' }
    let demoId = pin?.dataset.demo || el.closest('[data-demo]')?.dataset.demo
    if (!demoId && !pin) {
      const ds = demosDe(id)
      demoId = ds.length ? ds[ds.length - 1].id : null
    }
    return lier(src.noeud, id, demoId, pin || ne)
  }
  const pin = el.closest('.pin')
  if (pin && pin.dataset.pin !== 'sortie') return { ok: false, el: pin, texte: 'Relier une entrée à une sortie' }
  return lier(id, src.noeud, src.demo, pin || ne)
}

function debutCable(pin, e) {
  const t = pin.dataset.pin
  const noeudId = pin.closest('.noeud').dataset.id
  const src = t === 'sortie' ? { sortie: true, noeud: noeudId } : { sortie: false, noeud: noeudId, demo: pin.dataset.demo || null }
  const cle = t === 'sortie' ? 'out' : t === 'premisse' ? `p:${pin.dataset.demo}:${pin.dataset.p}` : t === 'ajout' ? `a:${pin.dataset.demo}` : 'n'
  const ancre = brocheMonde(noeudId, cle)
  const r = scene.getBoundingClientRect()
  let cible = null
  scene.classList.add('cablage')
  geste = {
    bouger(ev) {
      const p = versMonde(ev.clientX, ev.clientY)
      filTemp.style.display = ''
      filTemp.setAttribute('d', src.sortie ? courbe(ancre.x, ancre.y, p.x, p.y) : courbe(p.x, p.y, ancre.x, ancre.y))
      cible = resoudreCible(document.elementFromPoint(ev.clientX, ev.clientY), src)
      marquer(cible?.el || null, cible?.ok)
      const texte = cible ? cible.texte : 'Relâcher : créer un nœud relié'
      infoCable.textContent = texte
      infoCable.classList.toggle('ko', !!cible && !cible.ok)
      Object.assign(infoCable.style, { display: texte ? 'block' : 'none', left: `${ev.clientX - r.left + 16}px`, top: `${ev.clientY - r.top + 14}px` })
    },
    finir(ev) {
      scene.classList.remove('cablage')
      filTemp.style.display = 'none'
      infoCable.style.display = 'none'
      marquer(null)
      if (!filTemp.getAttribute('d')) return
      filTemp.removeAttribute('d')
      if (cible?.ok) cible.appliquer()
      else if (cible && !cible.annule && cible.texte) toast(cible.texte)
      else if (!cible) {
        const p = versMonde(ev.clientX, ev.clientY)
        const lien = src.sortie ? { premisse: src.noeud } : src.demo ? { demo: src.demo } : { noeud: src.noeud }
        ouvrirMenu(ev.clientX, ev.clientY, 'Créer un nœud relié', actionsCreation(p, lien))
      }
    },
  }
}

// ─── Renommage en place ──────────────────────────────────────────────────────────────────────────────

function editerEnPlace(el, valeur, appliquer) {
  if (!el) return
  el.contentEditable = 'plaintext-only'
  el.classList.add('edition')
  el.textContent = valeur
  el.focus()
  const plage = document.createRange()
  plage.selectNodeContents(el)
  const s = getSelection()
  s.removeAllRanges()
  s.addRange(plage)
  let fini = false
  const fin = (ok) => {
    if (fini) return
    fini = true
    el.removeEventListener('keydown', touche)
    el.removeEventListener('blur', flou)
    el.contentEditable = 'false'
    el.classList.remove('edition')
    const v = el.textContent.replace(/\s+/g, ' ').trim()
    if (ok && v && v !== valeur) appliquer(v)
    else el.textContent = valeur
  }
  const touche = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); fin(true) }
    if (e.key === 'Escape') { e.preventDefault(); fin(false) }
  }
  const flou = () => fin(true)
  el.addEventListener('keydown', touche)
  el.addEventListener('blur', flou)
}

function renommerNoeud(id) {
  const n = noeud(id)
  editerEnPlace(rendus.get(id)?.el.querySelector('.nom'), n.nom, (v) => modifier(() => { n.nom = v }))
}
function renommerCategorie(id) {
  const k = categorie(id)
  editerEnPlace(boites.get(id)?.el.querySelector('.c-nom'), k.titre, (v) => modifier(() => { k.titre = v }))
}
function renommerDemo(id) {
  const d = demo(id)
  const el = rendus.get(d.noeud_id)?.el.querySelector(`[data-demo-tete="${id}"] .d-nom`)
  editerEnPlace(el, d.nom_demonstration, (v) => modifier(() => { d.nom_demonstration = v.replace(/\s/g, '_') }))
}

function renommerSelection() {
  if (sel.size !== 1) return
  const [c] = sel
  const id = c.slice(2)
  if (c[0] === 'n') renommerNoeud(id)
  else if (c[0] === 'k') renommerCategorie(id)
  else renommerDemo(id)
}

scene.addEventListener('dblclick', (e) => {
  const nom = e.target.closest('.nom')
  if (nom) { renommerNoeud(nom.closest('.noeud').dataset.id); return }
  const dnom = e.target.closest('.d-nom')
  if (dnom) { renommerDemo(dnom.closest('[data-demo-tete]').dataset.demoTete); return }
  const cnom = e.target.closest('.c-titre')
  if (cnom) { renommerCategorie(cnom.parentElement.dataset.id); return }
  const enonce = e.target.closest('.enonce')
  if (enonce) {
    const champ = contenu.querySelector('[data-champ="enonce"]')
    champ?.focus()
    champ?.select()
  }
})

// ─── Menu contextuel « Toutes les actions » ──────────────────────────────────────────────────────────

let actionsMenu = []
let indiceMenu = 0

function actionsCreation(p, lien = null) {
  const a = Object.entries(NATURES).map(([cle, nat]) => ({
    groupe: 'Assertions', libelle: nat.libelle, ico: nat.ico, couleur: nat.couleur, faire: () => creerNoeud(cle, p, lien),
  }))
  if (lien) return a
  a.push({ groupe: 'Organisation', libelle: 'Commentaire (catégorie)', ico: '▭', raccourci: 'C', faire: () => { choisir([]); creerCategorie(p) } })
  if (idsSel('n').length) a.push({ groupe: 'Organisation', libelle: 'Commentaire autour de la sélection', ico: '▭', faire: () => creerCategorie() })
  a.push({ groupe: 'Vue', libelle: 'Tout cadrer', ico: '⤢', raccourci: 'Origine', faire: () => cadrer(true) })
  return a
}

function actionsNoeud(id) {
  const n = noeud(id)
  return [
    { groupe: 'Nœud', libelle: 'Renommer', ico: '✎', raccourci: 'F2', faire: () => renommerNoeud(id) },
    { groupe: 'Nœud', libelle: 'Dupliquer', ico: '⧉', raccourci: 'Ctrl+D', faire: dupliquer },
    { groupe: 'Nœud', libelle: 'Supprimer', ico: '×', raccourci: 'Suppr', faire: supprimerSelection },
    { groupe: 'Logique', libelle: 'Ajouter une démonstration', ico: '∴', faire: () => { let d; modifier(() => { d = nouvelleDemo(id, []) }); choisir([`d:${d.id}`]) } },
    { groupe: 'Logique', libelle: n.admis ? 'Ne plus admettre ce fait' : 'Admettre comme fait', ico: '◆', faire: () => modifier(() => { n.admis = !n.admis; if (!n.admis && n.nature === 'fait') n.nature = 'assertion' }) },
    { groupe: 'Logique', libelle: 'Couper tous les liens', ico: '⌁', faire: () => couperLiensNoeud(id) },
    { groupe: 'Organisation', libelle: 'Commentaire autour de la sélection', ico: '▭', raccourci: 'C', faire: () => creerCategorie() },
  ]
}

function actionsCategorie(id) {
  return [
    { groupe: 'Catégorie', libelle: 'Renommer', ico: '✎', raccourci: 'F2', faire: () => renommerCategorie(id) },
    { groupe: 'Catégorie', libelle: 'Sélectionner son contenu', ico: '⬚', faire: () => choisir(contenuDe(categorie(id)).noeuds.map((n) => `n:${n.id}`)) },
    { groupe: 'Catégorie', libelle: 'Supprimer (garde les nœuds)', ico: '×', raccourci: 'Suppr', faire: supprimerSelection },
  ]
}

function actionsFil(demoId, p) {
  const d = demo(demoId)
  return [
    { groupe: 'Liaison', libelle: 'Couper cette liaison', ico: '⌁', faire: () => retirerPremisse(demoId, p) },
    { groupe: 'Liaison', libelle: `Détails de ${d.nom_demonstration}`, ico: '∴', faire: () => choisir([`d:${demoId}`]) },
    ...Object.entries(VALIDITES).filter(([v]) => v !== d.validite).map(([v, info]) => ({
      groupe: 'Validité', libelle: `Marquer « ${info.libelle} »`, ico: '●', couleur: info.couleur, faire: () => modifier(() => { d.validite = v }),
    })),
  ]
}

function menuContextuel(e) {
  const p = versMonde(e.clientX, e.clientY)
  const el = e.target.closest('.noeud')
  if (el) {
    if (!sel.has(`n:${el.dataset.id}`)) choisir([`n:${el.dataset.id}`])
    ouvrirMenu(e.clientX, e.clientY, noeud(el.dataset.id).nom, actionsNoeud(el.dataset.id))
    return
  }
  const titre = e.target.closest('.c-titre')
  if (titre) {
    const id = titre.parentElement.dataset.id
    choisir([`k:${id}`])
    ouvrirMenu(e.clientX, e.clientY, categorie(id).titre, actionsCategorie(id))
    return
  }
  const hit = e.target.closest('.fil-hit')
  if (hit) {
    choisir([`d:${hit.dataset.demo}`])
    ouvrirMenu(e.clientX, e.clientY, 'Liaison', actionsFil(hit.dataset.demo, hit.dataset.p))
    return
  }
  ouvrirMenu(e.clientX, e.clientY, 'Toutes les actions', actionsCreation(p))
}

const normaliser = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function listerMenu() {
  const q = normaliser(menuRecherche.value.trim())
  const visibles = actionsMenu.filter((a) => !q || normaliser(`${a.groupe} ${a.libelle}`).includes(q))
  indiceMenu = Math.min(indiceMenu, Math.max(0, visibles.length - 1))
  let groupe = null
  let h = ''
  visibles.forEach((a, i) => {
    if (a.groupe !== groupe) { groupe = a.groupe; h += `<div class="m-groupe">${esc(groupe)}</div>` }
    const ico = a.couleur ? `<span class="m-ico" style="--c:${a.couleur}">${a.ico}</span>` : `<span class="m-ico vide">${a.ico}</span>`
    h += `<div class="m-item${i === indiceMenu ? ' actif' : ''}" data-i="${i}">${ico}<span>${esc(a.libelle)}</span>${a.raccourci ? `<kbd>${a.raccourci}</kbd>` : ''}</div>`
  })
  menuListe.innerHTML = h || '<div class="m-vide">Aucune action</div>'
  menuListe.visibles = visibles
}

function ouvrirMenu(cx, cy, titre, actions) {
  actionsMenu = actions
  indiceMenu = 0
  $('.m-titre', menu).textContent = titre
  $('.m-sous', menu).textContent = `${actions.length} action${actions.length > 1 ? 's' : ''}`
  menuRecherche.value = ''
  listerMenu()
  menu.hidden = false
  const r = scene.getBoundingClientRect()
  const x = Math.min(cx - r.left, scene.clientWidth - menu.offsetWidth - 8)
  const y = Math.min(cy - r.top, scene.clientHeight - menu.offsetHeight - 8)
  menu.style.left = `${Math.max(8, x)}px`
  menu.style.top = `${Math.max(8, y)}px`
  menuRecherche.focus()
}

function fermerMenu() { if (!menu.hidden) menu.hidden = true }

function executerMenu(i) {
  const a = menuListe.visibles?.[i]
  fermerMenu()
  a?.faire()
}

menuRecherche.addEventListener('input', () => { indiceMenu = 0; listerMenu() })
menuRecherche.addEventListener('keydown', (e) => {
  const n = menuListe.visibles?.length || 0
  if (e.key === 'ArrowDown') { e.preventDefault(); indiceMenu = (indiceMenu + 1) % Math.max(1, n); listerMenu() }
  else if (e.key === 'ArrowUp') { e.preventDefault(); indiceMenu = (indiceMenu - 1 + n) % Math.max(1, n); listerMenu() }
  else if (e.key === 'Enter') { e.preventDefault(); executerMenu(indiceMenu) }
  else if (e.key === 'Escape') { e.preventDefault(); fermerMenu() }
  e.stopPropagation()
})
menuListe.addEventListener('pointermove', (e) => {
  const it = e.target.closest('.m-item')
  if (it && Number(it.dataset.i) !== indiceMenu) {
    menuListe.querySelector('.m-item.actif')?.classList.remove('actif')
    it.classList.add('actif')
    indiceMenu = Number(it.dataset.i)
  }
})
menuListe.addEventListener('click', (e) => {
  const it = e.target.closest('.m-item')
  if (it) executerMenu(Number(it.dataset.i))
})
document.addEventListener('pointerdown', (e) => {
  if (!menu.hidden && !e.target.closest('.menu')) fermerMenu()
  if (!aide.hidden && !e.target.closest('.aide, [data-a="aide"]')) aide.hidden = true
})

// ─── Panneau Détails ─────────────────────────────────────────────────────────────────────────────────

function tete(couleur, ico, role, titre) {
  return `<div class="d-tete" style="--c:${couleur}"><span class="d-ico">${ico}</span><div><div class="d-role">${esc(role)}</div><h2 class="d-titre">${esc(titre)}</h2></div></div>`
}

const chip = (d) => `<span class="chip v-${d.validite}">${VALIDITES[d.validite].libelle}<b>${fmtConf(d.confiance)}</b></span>`

function panneauGraphe() {
  const compte = {}
  for (const s of Object.values(statuts)) compte[s] = (compte[s] || 0) + 1
  return `${tete('#27272a', '⊢', 'Graphe de logique', 'Résolution de problème')}
    <div class="d-defil">
      <details open><summary>Problème</summary><div class="props">
        <label class="ligne haute" style="grid-template-columns: 1fr"><textarea data-champ="probleme" rows="3">${esc(etat.probleme)}</textarea></label>
      </div></details>
      <details open><summary>Bilan</summary>
        <div class="stats">
          <span>Assertions</span><b>${etat.noeuds.length}</b>
          <span>Démonstrations</span><b>${etat.demonstrations.length}</b>
          <span>Catégories</span><b>${etat.categories.length}</b>
          ${Object.entries(STATUTS).map(([k, s]) => `<span class="statut" style="--s:${s.couleur}"><i></i>${s.libelle}</span><b>${compte[k] || 0}</b>`).join('')}
        </div>
      </details>
      <p class="conseil">Sélectionnez un nœud, une démonstration (sa rangée de titre ou un fil) ou une catégorie pour en modifier les propriétés.
        <kbd>Clic droit</kbd> sur le fond pour ajouter un nœud, <kbd>C</kbd> pour une catégorie, <kbd>?</kbd> pour les raccourcis.</p>
    </div>`
}

function panneauNoeud(n) {
  const nature = natureDe(n)
  const nat = NATURES[nature]
  const s = statuts[n.id]
  const demos = demosDe(n.id)
  const usages = etat.demonstrations.filter((d) => d.justifie_par.includes(n.id))
  return `${tete(nat.couleur, nat.ico, `${nat.libelle} · ${n.id}`, n.nom)}
    <div class="d-defil">
      <details open><summary>Assertion</summary><div class="props">
        <label class="ligne"><span>Nom</span><input type="text" data-champ="nom" value="${esc(n.nom)}"></label>
        <label class="ligne haute"><span>Énoncé</span><textarea data-champ="enonce" rows="4">${esc(n.enonce)}</textarea></label>
        <label class="ligne"><span>Admis</span><span class="case"><input type="checkbox" data-champ="admis"${n.admis ? ' checked' : ''}>fait établi sans démonstration</span></label>
        <label class="ligne"><span>Nature</span><select data-champ="nature"${n.admis ? ' disabled' : ''}>
          ${Object.entries(NATURES).filter(([k]) => k !== 'fait').map(([k, v]) => `<option value="${k}"${k === nature ? ' selected' : ''}>${v.libelle}</option>`).join('')}
          ${n.admis ? '<option selected>Fait admis</option>' : ''}
        </select></label>
        <div class="ligne"><span>Statut</span><span class="statut" style="--s:${STATUTS[s].couleur}"><i></i>${STATUTS[s].libelle}</span></div>
      </div><p class="explication">${EXPLICATIONS[s]}</p></details>
      <details open><summary>Démonstrations <small>${demos.length}</small></summary>
        <ul class="liste">${demos.map((d) => `<li><button class="lien mono" data-aller="d:${d.id}">${esc(d.nom_demonstration)}</button>${chip(d)}</li>`).join('') || '<li class="vide">Aucune</li>'}</ul>
        <button class="ajouter" data-act="nouvelle-demo">+ Ajouter une démonstration</button>
      </details>
      <details open><summary>Prémisse de <small>${usages.length}</small></summary>
        <ul class="liste">${usages.map((d) => `<li><button class="lien" data-aller="n:${d.noeud_id}">${esc(noeud(d.noeud_id)?.nom)}</button>${chip(d)}</li>`).join('') || '<li class="vide">Aucune démonstration</li>'}</ul>
      </details>
      <div class="d-actions"><button data-act="renommer">Renommer</button><button data-act="dupliquer">Dupliquer</button><button data-act="couper">Couper les liens</button><button class="danger" data-act="supprimer">Supprimer</button></div>
    </div>`
}

function panneauDemo(d) {
  const v = VALIDITES[d.validite]
  const c = noeud(d.noeud_id)
  const note = d.confiance !== null && d.confiance !== undefined
  return `${tete(v.couleur, '∴', `Démonstration · ${d.id}`, d.nom_demonstration)}
    <div class="d-defil">
      <details open><summary>Démonstration</summary><div class="props">
        <label class="ligne"><span>Nom</span><input type="text" class="mono" data-champ="nom_demonstration" value="${esc(d.nom_demonstration)}"></label>
        <div class="ligne"><span>Démontre</span><button class="lien" data-aller="n:${c.id}">${esc(c.nom)}</button></div>
        <label class="ligne haute"><span>Argument</span><textarea data-champ="demonstration" rows="4">${esc(d.demonstration)}</textarea></label>
        <div class="ligne"><span>Validité</span><div class="segments">${Object.entries(VALIDITES).map(([k, x]) => `<button data-validite="${k}" class="${k === d.validite ? 'actif' : ''}" style="--v:${x.couleur}">${x.libelle}</button>`).join('')}</div></div>
        <div class="ligne"><span>Confiance</span><div class="confiance">
          <input type="range" min="0" max="1" step="0.01" data-champ="confiance" value="${note ? d.confiance : 0.5}"${note ? '' : ' disabled'}>
          <output>${fmtConf(d.confiance)}</output></div></div>
        <label class="ligne"><span></span><span class="case"><input type="checkbox" data-champ="notee"${note ? ' checked' : ''}>notée par le vérificateur</span></label>
        <label class="ligne"><span>Auteur</span><input type="text" class="mono" data-champ="auteur" value="${esc(d.auteur)}"></label>
      </div></details>
      <details open><summary>Prémisses <small>${d.justifie_par.length}</small></summary>
        <ul class="liste">${d.justifie_par.map((p) => `<li><span class="statut" style="--s:${STATUTS[statuts[p]]?.couleur}"><i></i></span><button class="lien" data-aller="n:${p}">${esc(noeud(p)?.nom ?? p)}</button><button class="retirer" data-retirer="${p}" title="Retirer cette prémisse">×</button></li>`).join('') || '<li class="vide">Glissez une sortie sur la broche de la démonstration</li>'}</ul>
      </details>
      <div class="d-actions"><button data-act="renommer">Renommer</button><button class="danger" data-act="supprimer">Supprimer la démonstration</button></div>
    </div>`
}

function panneauCategorie(k) {
  const c = contenuDe(k)
  return `${tete(k.couleur, '▭', `Catégorie · ${k.id}`, k.titre)}
    <div class="d-defil">
      <details open><summary>Commentaire</summary><div class="props">
        <label class="ligne"><span>Titre</span><input type="text" data-champ="titre" value="${esc(k.titre)}"></label>
        <div class="ligne"><span>Couleur</span><div class="palette">${PALETTE.map((p) => `<button data-couleur="${p}" style="--c:${p}" class="${p === k.couleur ? 'actif' : ''}" title="${p}"></button>`).join('')}</div></div>
        <div class="ligne"><span>Taille</span><span class="mono" style="font: 11.5px var(--mono)">${Math.round(k.l)} × ${Math.round(k.h)}</span></div>
      </div></details>
      <details open><summary>Contenu <small>${c.noeuds.length}</small></summary>
        <ul class="liste">${c.noeuds.map((n) => `<li><span class="statut" style="--s:${STATUTS[statuts[n.id]].couleur}"><i></i></span><button class="lien" data-aller="n:${n.id}">${esc(n.nom)}</button></li>`).join('') || '<li class="vide">Vide : déplacez des nœuds dedans</li>'}</ul>
      </details>
      <div class="d-actions"><button data-act="renommer">Renommer</button><button data-act="contenu">Sélectionner le contenu</button><button class="danger" data-act="supprimer">Supprimer</button></div>
    </div>`
}

function panneauMulti() {
  const n = idsSel('n').length
  const d = idsSel('d').length
  const k = idsSel('k').length
  const parts = [n && `${n} nœud${n > 1 ? 's' : ''}`, d && `${d} démonstration${d > 1 ? 's' : ''}`, k && `${k} catégorie${k > 1 ? 's' : ''}`].filter(Boolean)
  return `${tete('#52525b', '⬚', 'Sélection multiple', parts.join(', '))}
    <div class="d-defil">
      <p class="conseil" style="margin-top: 12px">Glissez un des éléments pour tout déplacer. <kbd>C</kbd> regroupe la sélection dans une catégorie.</p>
      <div class="d-actions"><button data-act="categorie">Commentaire autour</button><button data-act="dupliquer">Dupliquer</button><button class="danger" data-act="supprimer">Supprimer</button></div>
    </div>`
}

function selUnique() {
  if (sel.size !== 1) return null
  const [c] = sel
  const id = c.slice(2)
  if (c[0] === 'n') return { t: 'n', o: noeud(id) }
  if (c[0] === 'd') return { t: 'd', o: demo(id) }
  return { t: 'k', o: categorie(id) }
}

function rendrePanneau() {
  const u = selUnique()
  const defil = contenu.querySelector('.d-defil')
  const cle = [...sel].join(',')
  const haut = contenu.dataset.cle === cle && defil ? defil.scrollTop : 0
  contenu.dataset.cle = cle
  contenu.innerHTML = !sel.size ? panneauGraphe()
    : !u ? panneauMulti()
      : u.t === 'n' ? panneauNoeud(u.o)
        : u.t === 'd' ? panneauDemo(u.o)
          : panneauCategorie(u.o)
  const nd = contenu.querySelector('.d-defil')
  if (nd) nd.scrollTop = haut
}

contenu.addEventListener('input', (e) => {
  const champ = e.target.dataset.champ
  if (!champ || e.target.type === 'checkbox' || e.target.tagName === 'SELECT') return
  const v = e.target.value
  const u = selUnique()
  const fusion = `${[...sel].join()}:${champ}`
  if (!u) { modifier(() => { etat.probleme = v }, { fusion, panneau: false }); return }
  modifier(() => {
    if (champ === 'confiance') u.o.confiance = Number(v)
    else if (champ === 'nom_demonstration') u.o[champ] = v.replace(/\s/g, '_')
    else u.o[champ] = v
  }, { fusion, panneau: false })
  if (champ === 'confiance') contenu.querySelector('.confiance output').textContent = fmtConf(Number(v))
  if (['nom', 'titre', 'nom_demonstration'].includes(champ)) contenu.querySelector('.d-titre').textContent = v
})

contenu.addEventListener('change', (e) => {
  const champ = e.target.dataset.champ
  const u = selUnique()
  if (!u) return
  if (champ === 'admis') {
    modifier(() => {
      u.o.admis = e.target.checked
      if (u.o.admis) u.o.nature = 'fait'
      else if (u.o.nature === 'fait') u.o.nature = 'assertion'
    })
  } else if (champ === 'nature') modifier(() => { u.o.nature = e.target.value })
  else if (champ === 'notee') modifier(() => { u.o.confiance = e.target.checked ? 0.5 : null })
  else if (champ === 'confiance') rendrePanneau()
})

contenu.addEventListener('click', (e) => {
  const aller = e.target.closest('[data-aller]')
  if (aller) {
    const c = aller.dataset.aller
    choisir([c])
    const id = c.slice(2)
    const n = c[0] === 'n' ? noeud(id) : noeud(demo(id).noeud_id)
    centrerSur(rectNoeud(n))
    return
  }
  const u = selUnique()
  const val = e.target.closest('[data-validite]')
  if (val && u) { modifier(() => { u.o.validite = val.dataset.validite }); return }
  const coul = e.target.closest('[data-couleur]')
  if (coul && u) { modifier(() => { u.o.couleur = coul.dataset.couleur }); return }
  const ret = e.target.closest('[data-retirer]')
  if (ret && u) { retirerPremisse(u.o.id, ret.dataset.retirer); return }
  const act = e.target.closest('[data-act]')?.dataset.act
  if (!act) return
  if (act === 'supprimer') supprimerSelection()
  else if (act === 'dupliquer') dupliquer()
  else if (act === 'renommer') renommerSelection()
  else if (act === 'categorie') creerCategorie()
  else if (act === 'couper') couperLiensNoeud(u.o.id)
  else if (act === 'contenu') choisir(contenuDe(u.o).noeuds.map((n) => `n:${n.id}`))
  else if (act === 'nouvelle-demo') {
    let d
    modifier(() => { d = nouvelleDemo(u.o.id, []) }, { panneau: false })
    choisir([`d:${d.id}`])
  }
})

// ─── Clavier et barre d'outils ───────────────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  const t = e.target
  if (t.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')) {
    if (e.key === 'Escape') t.blur()
    return
  }
  const ctrl = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  if (e.key === ' ') { e.preventDefault(); espace = true; scene.classList.add('espace'); return }
  if (ctrl && k === 'z') { e.preventDefault(); if (e.shiftKey) retablir(); else annuler(); return }
  if (ctrl && k === 'y') { e.preventDefault(); retablir(); return }
  if (ctrl && k === 'd') { e.preventDefault(); dupliquer(); return }
  if (ctrl && k === 'a') { e.preventDefault(); choisir(etat.noeuds.map((n) => `n:${n.id}`)); return }
  if (ctrl || e.altKey) return
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); supprimerSelection() }
  else if (k === 'c') { e.preventDefault(); creerCategorie() }
  else if (k === 'f') { e.preventDefault(); cadrer(false) }
  else if (e.key === 'Home') { e.preventDefault(); cadrer(true) }
  else if (e.key === 'F2') { e.preventDefault(); renommerSelection() }
  else if (e.key === '?') aide.hidden = !aide.hidden
  else if (e.key === 'Escape') {
    if (!aide.hidden) aide.hidden = true
    else if (sel.size) choisir([])
  }
})
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') { espace = false; scene.classList.remove('espace') }
})
window.addEventListener('blur', () => { espace = false; scene.classList.remove('espace') })

let minuteurToast = 0
function toast(texte) {
  toastEl.textContent = texte
  toastEl.classList.add('visible')
  clearTimeout(minuteurToast)
  minuteurToast = setTimeout(() => toastEl.classList.remove('visible'), 2600)
}

function reinitialiserExemple(historique = true) {
  if (historique && etat) historiser(JSON.stringify(etat))
  etat = etatInitial()
  sel.clear()
  rendre({ panneau: false }) // mesure les hauteurs réelles des nœuds
  disposer(etat, new Map([...rendus].map(([id, r]) => [id, r.h])))
  rendre()
  cadrer(true, false)
  sauver()
}

barre.addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a
  if (a === 'annuler') annuler()
  else if (a === 'retablir') retablir()
  else if (a === 'cadrer') cadrer(false)
  else if (a === 'commentaire') creerCategorie()
  else if (a === 'grille') { grille = !grille; sauver(); rendre({ panneau: false }) }
  else if (a === 'reinitialiser') { reinitialiserExemple(); toast('Exemple réinitialisé · Ctrl+Z pour revenir en arrière') }
  else if (a === 'aide') aide.hidden = !aide.hidden
})

// ─── Démarrage ───────────────────────────────────────────────────────────────────────────────────────

// Les hauteurs de nœuds dépendent de la police : on l'attend (sans bloquer plus d'une seconde et demie).
await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))])

const sauve = charger()
if (sauve) {
  etat = sauve.etat
  grille = sauve.grille ?? true
  if (sauve.vue && Number.isFinite(sauve.vue.k)) vue = sauve.vue
  rendre()
  appliquerVue()
} else {
  appliquerVue()
  reinitialiserExemple(false)
}
