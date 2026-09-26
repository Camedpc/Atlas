// Graphe de logique, éditeur façon Blueprint d'Unreal Engine (thème clair).
// Un nœud = une assertion ; sa broche de sortie « énoncé » porte la couleur de son statut. Chaque
// démonstration est une section du nœud qu'elle démontre : ses broches d'entrée reçoivent les fils de ses
// prémisses (`justifie_par`), fils colorés et tiretés selon la validité, épais selon la confiance.
// Les catégories sont des boîtes « Comment ». Les statuts sont recalculés à chaque modification.

import { calculerStatuts, grapheInitial, STATUTS, VALIDITES } from '../../commun/raisonnement.js'
import { disposer } from './disposition.js'

const CLE_STOCKAGE = 'atlas.logique-b.v1'
const LARGEUR = 272
const GRILLE = 16
const ZOOM_MIN = 0.2
const ZOOM_MAX = 2
const SEUIL = 4 // pixels avant qu'un clic devienne un glissement

const GENRES = {
  assertion: { libelle: 'Assertion', ico: '∴', couleur: '#2f5590', nouveau: 'Nouvelle assertion', aide: 'Énoncé à démontrer depuis des prémisses' },
  fait: { libelle: 'Fait admis', ico: '⊢', couleur: '#3f6f45', nouveau: 'Nouveau fait', aide: 'Mesure, axiome ou résultat connu : établi sans démonstration' },
  hypothese: { libelle: 'Hypothèse', ico: '?', couleur: '#6b6b74', nouveau: 'Nouvelle hypothèse', aide: 'Piste ouverte, pas encore démontrée' },
  conclusion: { libelle: 'Conclusion', ico: '⊨', couleur: '#27272a', nouveau: 'Nouvelle conclusion', aide: 'Réponse au problème' },
}
const PALETTE = ['#2563eb', '#7c3aed', '#b45309', '#0f766e', '#be123c', '#4d7c0f', '#52525b', '#18181b']
const EXPLICATIONS = {
  etabli: 'Admis, ou démontré par une démonstration valide dont toutes les prémisses sont établies.',
  suspendu: 'Une démonstration est valide, mais au moins une de ses prémisses n’est pas établie.',
  a_verifier: 'Aucune démonstration valide : au moins une attend le vérificateur.',
  invalide: 'Toutes ses démonstrations ont été jugées invalides.',
  ouvert: 'Ni admis ni démontré : aucune démonstration.',
}

// ─── Squelette ───────────────────────────────────────────────────────────────────────────────────────

const scene = document.querySelector('.scene')
scene.innerHTML = `
  <div class="toile" tabindex="-1">
    <div class="monde">
      <div class="couche c-commentaires"></div>
      <svg class="fils"><g class="g-fils"></g><path class="fil-temp" style="display:none"></path></svg>
      <div class="couche c-noeuds"></div>
    </div>
    <div class="marquee"></div>
    <div class="zoom"></div>
    <div class="filigrane">LOGIQUE</div>
    <div class="bas">
      <div class="legende-l">
        <span><svg width="26" height="6"><line x1="1" y1="3" x2="25" y2="3" stroke="#3f7a4c" stroke-width="2.4"/></svg>valide</span>
        <span><svg width="26" height="6"><line x1="1" y1="3" x2="25" y2="3" stroke="#2563eb" stroke-width="2" stroke-dasharray="7 5"/></svg>à vérifier</span>
        <span><svg width="26" height="6"><line x1="1" y1="3" x2="25" y2="3" stroke="#dc2626" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/></svg>invalide</span>
        <span style="color:var(--texte-3)">épaisseur = confiance · clic droit : actions · ? : raccourcis</span>
      </div>
      <div class="message"></div>
    </div>
    <div class="menu"><div class="m-tete"><span></span><small></small></div><input class="m-recherche" placeholder="Rechercher…" spellcheck="false"><div class="m-liste"></div></div>
    <div class="aide-pop">
      <h3>Raccourcis</h3>
      <h4>Navigation</h4>
      <dl>
        <dt>Clic droit / molette maintenus</dt><dd>se déplacer (ou Espace + glisser)</dd>
        <dt>Molette</dt><dd>zoomer sur le curseur</dd>
        <dt>F · Origine</dt><dd>cadrer la sélection · tout cadrer</dd>
      </dl>
      <h4>Édition</h4>
      <dl>
        <dt>Glisser sur le fond</dt><dd>rectangle de sélection</dd>
        <dt>Maj / Ctrl + clic</dt><dd>ajouter à la sélection</dd>
        <dt>Double-clic sur un nom</dt><dd>renommer (Entrée valide)</dd>
        <dt>Clic droit sur le fond</dt><dd>créer un nœud</dd>
        <dt>Suppr · Ctrl+D</dt><dd>supprimer · dupliquer</dd>
        <dt>C</dt><dd>boîte de catégorie autour de la sélection</dd>
        <dt>Ctrl+Z · Ctrl+Y</dt><dd>annuler · rétablir</dd>
      </dl>
      <h4>Liaisons</h4>
      <dl>
        <dt>Sortie → entrée</dt><dd>ajoute une prémisse à la démonstration</dd>
        <dt>Relâcher dans le vide</dt><dd>créer un nœud déjà relié</dd>
        <dt>Alt + clic sur une broche</dt><dd>couper ses liens</dd>
      </dl>
    </div>
  </div>
  <aside class="details"><div class="d-onglet">Détails</div><div class="d-defil"></div></aside>
`

const toile = scene.querySelector('.toile')
const monde = scene.querySelector('.monde')
const coucheCommentaires = scene.querySelector('.c-commentaires')
const coucheNoeuds = scene.querySelector('.c-noeuds')
const svgFils = scene.querySelector('.fils')
const gFils = scene.querySelector('.g-fils')
const filTemp = scene.querySelector('.fil-temp')
const marquee = scene.querySelector('.marquee')
const etiquetteZoom = scene.querySelector('.zoom')
const boiteMessage = scene.querySelector('.message')
const menu = scene.querySelector('.menu')
const menuRecherche = menu.querySelector('.m-recherche')
const menuListe = menu.querySelector('.m-liste')
const aidePop = scene.querySelector('.aide-pop')
const panneau = scene.querySelector('.d-defil')
const barre = document.querySelector('.barre')
const texteProbleme = barre.querySelector('[data-probleme]')

// ─── État ────────────────────────────────────────────────────────────────────────────────────────────

let etat = null // { probleme, noeuds, demonstrations, commentaires, compteur }
let statuts = {}
let vue = { x: 40, y: 40, k: 1 }
let aimanter = true
let selection = new Set() // 'n:id' | 'c:id' | 'd:id'
const pileAnnuler = []
const pileRetablir = []
const rendus = new Map() // id de nœud → { el, html, l, h, pins }
const boites = new Map() // id de commentaire → { el, sig }
let souris = null // dernière position du curseur dans la toile (coordonnées écran)
let espace = false

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const parId = (id) => etat.noeuds.find((n) => n.id === id)
const demo = (id) => etat.demonstrations.find((d) => d.id === id)
const commentaire = (id) => etat.commentaires.find((c) => c.id === id)
const demosDe = (id) => etat.demonstrations.filter((d) => d.noeud_id === id)
const nouvelId = (prefixe) => `${prefixe}${++etat.compteur}`
const aimante = (v) => (aimanter ? Math.round(v / GRILLE) * GRILLE : Math.round(v))
const formatConf = (c) => (c === null || c === undefined ? '—' : c.toFixed(2).replace('.', ','))
const idsSel = (type) => [...selection].filter((s) => s.startsWith(`${type}:`)).map((s) => s.slice(2))

function etatExemple() {
  const g = grapheInitial()
  const utilises = new Set(g.demonstrations.flatMap((d) => d.justifie_par))
  const demontres = new Set(g.demonstrations.map((d) => d.noeud_id))
  const genre = (n) => (n.admis ? 'fait' : !demontres.has(n.id) ? 'hypothese' : !utilises.has(n.id) ? 'conclusion' : 'assertion')
  return {
    probleme: g.probleme,
    noeuds: g.noeuds.map((n) => ({ ...n, genre: genre(n), x: 0, y: 0 })),
    demonstrations: g.demonstrations.map((d, i) => ({ id: `d${i + 1}`, ...d })),
    commentaires: [],
    categories: g.categories, // consommées par la première disposition
    compteur: 100,
  }
}

// ─── Persistance et historique ───────────────────────────────────────────────────────────────────────

let minuteurSauvegarde = 0
function sauvegarder() {
  clearTimeout(minuteurSauvegarde)
  minuteurSauvegarde = setTimeout(() => {
    try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify({ etat, vue, aimanter })) } catch { /* stockage indisponible */ }
  }, 250)
}

function charger() {
  try {
    const s = JSON.parse(localStorage.getItem(CLE_STOCKAGE))
    if (s?.etat?.noeuds && s.etat.demonstrations && s.etat.commentaires) return s
  } catch { /* stockage indisponible ou corrompu */ }
  return null
}

const instantane = () => JSON.stringify(etat)

function memoriser(avant) {
  if (avant === instantane() || pileAnnuler[pileAnnuler.length - 1] === avant) return
  pileAnnuler.push(avant)
  if (pileAnnuler.length > 200) pileAnnuler.shift()
  pileRetablir.length = 0
  sauvegarder()
  majBoutons()
}

function modifier(fn) {
  const avant = instantane()
  fn()
  toutRendre()
  memoriser(avant)
}

function restaurer(depuis, vers) {
  if (!depuis.length) return
  vers.push(instantane())
  etat = JSON.parse(depuis.pop())
  for (const s of [...selection]) {
    const [t, id] = [s[0], s.slice(2)]
    if ((t === 'n' && !parId(id)) || (t === 'd' && !demo(id)) || (t === 'c' && !commentaire(id))) selection.delete(s)
  }
  toutRendre()
  sauvegarder()
}

// ─── Vue : déplacement et zoom ───────────────────────────────────────────────────────────────────────

function appliquerVue() {
  monde.style.transform = `translate(${vue.x}px,${vue.y}px) scale(${vue.k})`
  monde.style.setProperty('--ec', Math.min(2.2, Math.max(1, 0.62 / vue.k)).toFixed(3))
  const g = 128 * vue.k
  const f = 16 * vue.k
  toile.style.backgroundSize = `${g}px ${g}px, ${g}px ${g}px, ${f}px ${f}px, ${f}px ${f}px`
  toile.style.backgroundPosition = `${vue.x}px ${vue.y}px`
  etiquetteZoom.textContent = `Zoom ${Math.round(vue.k * 100)} %`
}

const versMonde = (sx, sy) => [(sx - vue.x) / vue.k, (sy - vue.y) / vue.k]
function pointToile(e) {
  const r = toile.getBoundingClientRect()
  return [e.clientX - r.left, e.clientY - r.top]
}

function zoomer(facteur, sx, sy) {
  const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vue.k * facteur))
  const [wx, wy] = versMonde(sx, sy)
  vue = { k, x: sx - wx * k, y: sy - wy * k }
  appliquerVue()
  sauvegarder()
}

toile.addEventListener('wheel', (e) => {
  if (e.target.closest('.menu, .aide-pop, .legende-l')) return
  e.preventDefault()
  const [sx, sy] = pointToile(e)
  const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
  zoomer(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0016)), sx, sy)
}, { passive: false })

let animation = 0
function allerVers(cible) {
  cancelAnimationFrame(animation)
  const depart = { ...vue }
  const t0 = performance.now()
  const pas = (t) => {
    const u = Math.min(1, (t - t0) / 220)
    const e = 1 - (1 - u) ** 3
    vue = { x: depart.x + (cible.x - depart.x) * e, y: depart.y + (cible.y - depart.y) * e, k: depart.k + (cible.k - depart.k) * e }
    appliquerVue()
    if (u < 1) animation = requestAnimationFrame(pas)
    else sauvegarder()
  }
  animation = requestAnimationFrame(pas)
}

function rectangleDe(type, id) {
  if (type === 'n') {
    const n = parId(id)
    const r = rendus.get(id)
    return n && r ? { x: n.x, y: n.y, l: r.l, h: r.h } : null
  }
  if (type === 'c') {
    const c = commentaire(id)
    return c ? { x: c.x, y: c.y, l: c.l, h: c.h } : null
  }
  if (type === 'd') {
    const d = demo(id)
    if (!d) return null
    const rs = [d.noeud_id, ...d.justifie_par].map((n) => rectangleDe('n', n)).filter(Boolean)
    return englobant(rs)
  }
  return null
}

function englobant(rects) {
  if (!rects.length) return null
  const x0 = Math.min(...rects.map((r) => r.x))
  const y0 = Math.min(...rects.map((r) => r.y))
  const x1 = Math.max(...rects.map((r) => r.x + r.l))
  const y1 = Math.max(...rects.map((r) => r.y + r.h))
  return { x: x0, y: y0, l: x1 - x0, h: y1 - y0 }
}

// F : cadre la sélection, ou tout si rien n'est sélectionné
function cadrer(toutCadrer = false, instant = false) {
  const cles = !toutCadrer && selection.size ? [...selection] : [...etat.noeuds.map((n) => `n:${n.id}`), ...etat.commentaires.map((c) => `c:${c.id}`)]
  const b = englobant(cles.map((s) => rectangleDe(s[0], s.slice(2))).filter(Boolean))
  if (!b) return
  const m = 48
  const l = toile.clientWidth
  const h = toile.clientHeight - 40
  const k = Math.min(1, ZOOM_MAX, Math.max(ZOOM_MIN, Math.min((l - 2 * m) / b.l, (h - 2 * m) / b.h)))
  const cible = { k, x: (l - b.l * k) / 2 - b.x * k, y: (h - b.h * k) / 2 - b.y * k }
  if (instant) { vue = cible; appliquerVue() } else allerVers(cible)
}

// ─── Rendu des nœuds ─────────────────────────────────────────────────────────────────────────────────

function htmlDemo(d) {
  const v = VALIDITES[d.validite]
  const titre = `${d.nom_demonstration} · ${v.libelle} · confiance ${formatConf(d.confiance)}${d.demonstration ? `\n${d.demonstration}` : ''}`
  const premisses = d.justifie_par.map((p) => {
    const q = parId(p)
    return `<div class="rang"><span class="pin plein" data-pin="e:${d.id}:${p}" style="--p:${v.couleur}" title="Prémisse — Alt+clic pour couper"></span><span class="lab" title="${esc(q?.enonce)}">${esc(q?.nom ?? p)}</span></div>`
  }).join('')
  return `<div class="demo" data-demo="${d.id}">
    <div class="demo-tete" title="${esc(titre)}"><span class="demo-nom">${esc(d.nom_demonstration)}</span><span class="val" style="--v:${v.couleur}">${v.libelle}</span><span class="conf">${formatConf(d.confiance)}</span></div>
    ${premisses}
    <div class="rang fantome"><span class="pin vide" data-pin="plus:${d.id}" style="--p:${v.couleur}" title="Glisser vers une sortie pour ajouter une prémisse"></span><span class="lab">Ajouter une prémisse</span></div>
  </div>`
}

function htmlNoeud(n) {
  const g = GENRES[n.genre] || GENRES.assertion
  const st = STATUTS[statuts[n.id]]
  const demos = demosDe(n.id)
  const utilise = etat.demonstrations.filter((d) => d.justifie_par.includes(n.id)).length
  // Autre démonstration : bouton du panneau Détails, ou fil relâché sur l'en-tête d'un nœud à plusieurs démonstrations
  const nouvelle = n.genre === 'fait' || demos.length ? '' : '<div class="rang fantome"><span class="pin vide" data-pin="nouvelle" title="Glisser vers une sortie : nouvelle démonstration"></span><span class="lab">Démontrer depuis…</span></div>'
  return `
    <div class="tete" style="--c:${g.couleur}">
      <span class="ico">${g.ico}</span>
      <div class="tt"><b class="nom" title="${esc(n.nom)} — double-clic pour renommer">${esc(n.nom)}</b><span>${g.libelle}</span></div>
    </div>
    <div class="corps">
      <div class="rang droite"><span class="lab">énoncé</span><span class="pin${statuts[n.id] === 'etabli' ? ' plein' : ''}" data-pin="sortie" style="--p:${st.couleur}" title="Sortie — glisser vers une entrée pour en faire une prémisse"></span></div>
      ${demos.map(htmlDemo).join('')}
      ${nouvelle}
    </div>
    <div class="enonce${n.enonce ? '' : ' vide'}" title="${esc(n.enonce)}">${n.enonce ? esc(n.enonce) : 'Énoncé à rédiger dans le panneau Détails'}</div>
    <div class="pied"><span class="st" style="--s:${st.couleur}"><i></i>${st.libelle}</span><span class="nb">${n.admis ? 'admis' : `${demos.length} dém.`} · utilisé ${utilise}×</span></div>`
}

// Position d'une broche relativement au coin du nœud (indépendante du zoom)
function mesurerBroches(r) {
  r.l = r.el.offsetWidth
  r.h = r.el.offsetHeight
  r.pins = {}
  for (const p of r.el.querySelectorAll('[data-pin]')) {
    let x = p.offsetWidth / 2
    let y = p.offsetHeight / 2
    for (let e = p; e && e !== r.el; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop }
    r.pins[p.dataset.pin] = [x + r.el.clientLeft, y + r.el.clientTop]
  }
}

function rendreNoeuds() {
  statuts = calculerStatuts(etat.noeuds, etat.demonstrations)
  const vus = new Set()
  const aMesurer = []
  for (const n of etat.noeuds) {
    vus.add(n.id)
    let r = rendus.get(n.id)
    if (!r) {
      const el = document.createElement('div')
      el.className = 'noeud'
      el.dataset.id = n.id
      coucheNoeuds.append(el)
      r = { el }
      rendus.set(n.id, r)
    }
    const html = htmlNoeud(n)
    if (r.html !== html) { r.html = html; r.el.innerHTML = html; aMesurer.push(r) }
    r.el.classList.toggle('st-invalide', statuts[n.id] === 'invalide')
    placerNoeud(n)
  }
  for (const [id, r] of rendus) if (!vus.has(id)) { r.el.remove(); rendus.delete(id) }
  for (const r of aMesurer) mesurerBroches(r)
}

function placerNoeud(n) {
  const r = rendus.get(n.id)
  if (r) r.el.style.transform = `translate(${n.x}px,${n.y}px)`
}

// ─── Rendu des boîtes « Comment » ────────────────────────────────────────────────────────────────────

function rendreCommentaires() {
  const vus = new Set()
  // Les plus grandes dessous, pour que les boîtes imbriquées restent attrapables
  const ordre = [...etat.commentaires].sort((a, b) => b.l * b.h - a.l * a.h)
  for (const c of ordre) {
    vus.add(c.id)
    let b = boites.get(c.id)
    if (!b) {
      const el = document.createElement('div')
      el.className = 'commentaire'
      el.dataset.id = c.id
      el.innerHTML = `<div class="c-titre"><span class="c-nom"></span></div>${['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map((d) => `<i class="poignee" data-dir="${d}"></i>`).join('')}`
      b = { el, nom: el.querySelector('.c-nom') }
      boites.set(c.id, b)
    }
    coucheCommentaires.append(b.el) // réordonne
    if (b.nom.textContent !== c.titre && !b.nom.isContentEditable) b.nom.textContent = c.titre
    b.el.style.setProperty('--c', c.couleur)
    placerCommentaire(c)
  }
  for (const [id, b] of boites) if (!vus.has(id)) { b.el.remove(); boites.delete(id) }
}

function placerCommentaire(c) {
  const b = boites.get(c.id)
  if (!b) return
  b.el.style.transform = `translate(${c.x}px,${c.y}px)`
  b.el.style.width = `${c.l}px`
  b.el.style.height = `${c.h}px`
}

// ─── Fils ────────────────────────────────────────────────────────────────────────────────────────────

const NS = 'http://www.w3.org/2000/svg'

function pointBroche(id, cle) {
  const n = parId(id)
  const r = rendus.get(id)
  const p = r?.pins?.[cle]
  return n && p ? [n.x + p[0], n.y + p[1]] : null
}

function courbe(a, b) {
  const dx = Math.max(50, Math.abs(b[0] - a[0]) * 0.5)
  return `M${a[0].toFixed(1)},${a[1].toFixed(1)}C${(a[0] + dx).toFixed(1)},${a[1].toFixed(1)} ${(b[0] - dx).toFixed(1)},${b[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`
}

function majFils() {
  const noeudsSel = new Set(idsSel('n'))
  const demosSel = new Set(idsSel('d'))
  const focalise = noeudsSel.size > 0 || demosSel.size > 0
  svgFils.classList.toggle('focalise', focalise)
  let html = ''
  for (const d of etat.demonstrations) {
    const arrivee = d.noeud_id
    for (const p of d.justifie_par) {
      const a = pointBroche(p, 'sortie')
      const b = pointBroche(arrivee, `e:${d.id}:${p}`)
      if (!a || !b) continue
      const actif = demosSel.has(d.id) || noeudsSel.has(p) || noeudsSel.has(arrivee)
      const epaisseur = d.confiance === null || d.confiance === undefined ? 1.8 : 1.2 + 2.4 * d.confiance
      const chemin = courbe(a, b)
      const titre = `${parId(p)?.nom} → ${parId(arrivee)?.nom} · ${d.nom_demonstration} · ${VALIDITES[d.validite].libelle} · confiance ${formatConf(d.confiance)}`
      html += `<path class="fil-zone" data-demo="${d.id}" d="${chemin}"><title>${esc(titre)}</title></path>`
      html += `<path class="fil v-${d.validite}${actif ? ' actif' : ''}${demosSel.has(d.id) ? ' choisi' : ''}" style="stroke-width:${epaisseur.toFixed(2)}" d="${chemin}"></path>`
    }
  }
  gFils.innerHTML = html
}

// ─── Sélection ───────────────────────────────────────────────────────────────────────────────────────

function majSelection() {
  for (const [id, r] of rendus) {
    r.el.classList.toggle('choisi', selection.has(`n:${id}`))
    for (const el of r.el.querySelectorAll('.demo')) el.classList.toggle('choisie', selection.has(`d:${el.dataset.demo}`))
  }
  for (const [id, b] of boites) b.el.classList.toggle('choisi', selection.has(`c:${id}`))
  majFils()
  rendrePanneau()
}

function selectionner(cles, ajouter = false) {
  if (!ajouter) selection = new Set()
  for (const c of cles) selection.add(c)
  majSelection()
}

// ─── Rendu global ────────────────────────────────────────────────────────────────────────────────────

function toutRendre() {
  rendreNoeuds()
  rendreCommentaires()
  texteProbleme.textContent = etat.probleme
  texteProbleme.parentElement.title = etat.probleme
  majSelection()
  majBoutons()
}

function majBoutons() {
  barre.querySelector('[data-cmd="annuler"]').disabled = !pileAnnuler.length
  barre.querySelector('[data-cmd="retablir"]').disabled = !pileRetablir.length
  barre.querySelector('[data-cmd="aimanter"]').classList.toggle('actif', aimanter)
}

let minuteurMessage = 0
function message(texte) {
  boiteMessage.textContent = texte
  boiteMessage.classList.add('visible')
  clearTimeout(minuteurMessage)
  minuteurMessage = setTimeout(() => boiteMessage.classList.remove('visible'), 3800)
}

// ─── Opérations sur le graphe ────────────────────────────────────────────────────────────────────────

// Toute modification des prémisses invalide la note du vérificateur
function repasserAVerifier(d) {
  if (d.validite === 'a_verifier' && d.confiance === null) return
  d.validite = 'a_verifier'
  d.confiance = null
  message(`Prémisses modifiées : « ${d.nom_demonstration} » repasse à vérifier.`)
}

function ajouterPremisse(demoId, premisseId) {
  const d = demo(demoId)
  if (!d || !parId(premisseId)) return false
  if (d.noeud_id === premisseId) { message('Une assertion ne peut pas se justifier elle-même.'); return false }
  if (d.justifie_par.includes(premisseId)) { message('Cette prémisse est déjà dans la démonstration.'); return false }
  d.justifie_par.push(premisseId)
  repasserAVerifier(d)
  return true
}

function nouvelleDemonstration(noeudId, premisses = []) {
  const n = parId(noeudId)
  if (premisses.includes(noeudId)) { message('Une assertion ne peut pas se justifier elle-même.'); return null }
  let nom = 'demonstration'
  for (let i = 2; etat.demonstrations.some((d) => d.noeud_id === noeudId && d.nom_demonstration === nom); i++) nom = `demonstration_${i}`
  const d = { id: nouvelId('d'), noeud_id: noeudId, nom_demonstration: nom, justifie_par: [...premisses], demonstration: '', validite: 'a_verifier', confiance: null, auteur: 'camille' }
  etat.demonstrations.push(d)
  if (n.genre === 'hypothese') n.genre = 'assertion'
  return d
}

// Relie `source` (sortie) à une broche d'entrée du nœud `cibleId`, ou au nœud en général
function relier(sourceId, cibleId, clePin) {
  if (sourceId === cibleId) { message('Une assertion ne peut pas se justifier elle-même.'); return }
  modifier(() => {
    if (clePin?.startsWith('e:') || clePin?.startsWith('plus:')) ajouterPremisse(clePin.split(':')[1], sourceId)
    else {
      const demos = demosDe(cibleId)
      if (!clePin && demos.length === 1) ajouterPremisse(demos[0].id, sourceId)
      else nouvelleDemonstration(cibleId, [sourceId])
    }
  })
}

// Alt+clic : coupe les liens d'une broche
function couperLiens(noeudId, clePin) {
  modifier(() => {
    if (clePin === 'sortie') {
      for (const d of etat.demonstrations) if (d.justifie_par.includes(noeudId)) { d.justifie_par = d.justifie_par.filter((p) => p !== noeudId); repasserAVerifier(d) }
    } else if (clePin.startsWith('e:')) {
      const [, dId, p] = clePin.split(':')
      const d = demo(dId)
      d.justifie_par = d.justifie_par.filter((q) => q !== p)
      repasserAVerifier(d)
    }
  })
}

function couperTousLiens(noeudId) {
  modifier(() => {
    couperSansHistorique(noeudId)
    for (const d of demosDe(noeudId)) { if (d.justifie_par.length) { d.justifie_par = []; repasserAVerifier(d) } }
  })
}

function couperSansHistorique(noeudId) {
  for (const d of etat.demonstrations) if (d.justifie_par.includes(noeudId)) { d.justifie_par = d.justifie_par.filter((p) => p !== noeudId); repasserAVerifier(d) }
}

function creerNoeud(genre, wx, wy, connexion = null) {
  const g = GENRES[genre]
  const n = { id: nouvelId('n'), nom: g.nouveau, enonce: '', admis: genre === 'fait', genre, x: 0, y: 0 }
  n.x = aimante(connexion?.vers ? wx - LARGEUR - 8 : wx)
  n.y = aimante(connexion ? wy - 50 : wy)
  modifier(() => {
    etat.noeuds.push(n)
    if (connexion?.depuis) nouvelleDemonstration(n.id, [connexion.depuis])
    if (connexion?.vers) {
      const { noeud, cle } = connexion.vers
      if (cle === 'nouvelle') nouvelleDemonstration(noeud, [n.id])
      else ajouterPremisse(cle.split(':')[1], n.id)
    }
    selection = new Set([`n:${n.id}`])
  })
  renommerNoeud(n.id)
}

function supprimerSelection() {
  if (!selection.size) return
  modifier(() => {
    const noeuds = new Set(idsSel('n'))
    const demos = new Set(idsSel('d'))
    const comms = new Set(idsSel('c'))
    for (const id of noeuds) couperSansHistorique(id)
    etat.noeuds = etat.noeuds.filter((n) => !noeuds.has(n.id))
    etat.demonstrations = etat.demonstrations.filter((d) => !demos.has(d.id) && !noeuds.has(d.noeud_id))
    etat.commentaires = etat.commentaires.filter((c) => !comms.has(c.id))
    selection = new Set()
  })
}

// Ctrl+D : copie les nœuds choisis et leurs démonstrations ; les prémisses internes suivent la copie
function dupliquer() {
  const ids = idsSel('n')
  if (!ids.length) return
  modifier(() => {
    const table = new Map(ids.map((id) => [id, nouvelId('n')]))
    const copies = ids.map((id) => {
      const n = parId(id)
      return { ...structuredClone(n), id: table.get(id), x: n.x + 32, y: n.y + 32 }
    })
    etat.noeuds.push(...copies)
    for (const d of etat.demonstrations.filter((x) => table.has(x.noeud_id))) {
      etat.demonstrations.push({ ...structuredClone(d), id: nouvelId('d'), noeud_id: table.get(d.noeud_id), justifie_par: d.justifie_par.map((p) => table.get(p) || p) })
    }
    selection = new Set(copies.map((c) => `n:${c.id}`))
  })
  message(`${ids.length} nœud${ids.length > 1 ? 's' : ''} dupliqué${ids.length > 1 ? 's' : ''}.`)
}

// C : boîte autour de la sélection, ou boîte vide au curseur
function creerCommentaire(wx, wy) {
  const cles = [...selection].filter((s) => s[0] === 'n' || s[0] === 'c')
  const b = englobant(cles.map((s) => rectangleDe(s[0], s.slice(2))).filter(Boolean))
  const c = { id: nouvelId('k'), titre: 'Nouvelle catégorie', couleur: PALETTE[6] }
  if (b) Object.assign(c, { x: b.x - 28, y: b.y - 54, l: b.l + 56, h: b.h + 82 })
  else {
    if (wx === undefined) [wx, wy] = versMonde(...(souris || [toile.clientWidth / 2 - 200, toile.clientHeight / 2 - 120]))
    Object.assign(c, { x: aimante(wx), y: aimante(wy), l: 420, h: 260 })
  }
  modifier(() => {
    etat.commentaires.push(c)
    selection = new Set([`c:${c.id}`])
  })
  renommerCommentaire(c.id)
}

function reinitialiser() {
  modifier(() => {
    etat = etatExemple()
    disposerInitialement()
    selection = new Set()
  })
  cadrer(true)
  message('Exemple rétabli — Ctrl+Z pour revenir à votre version.')
}

// ─── Disposition initiale ────────────────────────────────────────────────────────────────────────────

function disposerInitialement() {
  rendreNoeuds() // mesure des hauteurs réelles
  const hauteurs = Object.fromEntries(etat.noeuds.map((n) => [n.id, rendus.get(n.id).h]))
  const { positions, boites: cadres } = disposer(etat.noeuds, etat.demonstrations, etat.categories || [], hauteurs, LARGEUR)
  for (const n of etat.noeuds) Object.assign(n, positions[n.id])
  etat.commentaires = cadres
  delete etat.categories
}

// ─── Renommage en place ──────────────────────────────────────────────────────────────────────────────

function editerEnPlace(el, surValider) {
  const avant = el.textContent
  let annule = false
  el.contentEditable = 'plaintext-only'
  el.focus()
  const plage = document.createRange()
  plage.selectNodeContents(el)
  const sel = getSelection()
  sel.removeAllRanges()
  sel.addRange(plage)
  const touche = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); el.blur() }
    if (e.key === 'Escape') { annule = true; el.blur() }
  }
  const fin = () => {
    el.removeEventListener('keydown', touche)
    el.removeEventListener('blur', fin)
    el.contentEditable = 'false'
    el.removeAttribute('contenteditable')
    const t = el.textContent.replace(/\s+/g, ' ').trim()
    if (annule || !t || t === avant) { el.textContent = avant; return }
    surValider(t)
  }
  el.addEventListener('keydown', touche)
  el.addEventListener('blur', fin)
}

function renommerNoeud(id) {
  const el = rendus.get(id)?.el.querySelector('.nom')
  if (el) editerEnPlace(el, (t) => modifier(() => { parId(id).nom = t }))
}

function renommerCommentaire(id) {
  const el = boites.get(id)?.nom
  if (el) editerEnPlace(el, (t) => modifier(() => { commentaire(id).titre = t }))
}

function renommerDemo(id, el) {
  editerEnPlace(el, (t) => modifier(() => { demo(id).nom_demonstration = t.replace(/\s/g, '_') }))
}

// ─── Gestes à la souris ──────────────────────────────────────────────────────────────────────────────

let geste = null

function contenus(c) {
  // Nœuds et boîtes entièrement contenus dans la boîte c (déplacés avec elle, comme dans UE)
  const dedans = (r) => r && r.x >= c.x && r.y >= c.y && r.x + r.l <= c.x + c.l && r.y + r.h <= c.y + c.h
  return {
    noeuds: etat.noeuds.filter((n) => dedans(rectangleDe('n', n.id))).map((n) => n.id),
    comms: etat.commentaires.filter((o) => o !== c && dedans(o)).map((o) => o.id),
  }
}

function debuterDeplacement(e, primaire) {
  const noeuds = new Set(idsSel('n'))
  const comms = new Set(idsSel('c'))
  for (const id of [...comms]) {
    const k = contenus(commentaire(id))
    k.noeuds.forEach((n) => noeuds.add(n))
    k.comms.forEach((o) => comms.add(o))
  }
  geste = {
    type: 'deplacer', x0: e.clientX, y0: e.clientY, bouge: false, avant: instantane(), primaire,
    noeuds: [...noeuds].map((id) => { const n = parId(id); return { n, x: n.x, y: n.y } }),
    comms: [...comms].map((id) => { const c = commentaire(id); return { c, x: c.x, y: c.y } }),
  }
}

toile.addEventListener('contextmenu', (e) => e.preventDefault())
toile.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault() }) // pas d'autodéfilement

toile.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.menu, .aide-pop, .legende-l')) return
  if (e.target.isContentEditable) return
  fermerMenu()
  aidePop.classList.remove('ouvert')
  if (document.activeElement && document.activeElement !== document.body && !e.target.closest('.details')) document.activeElement.blur()
  const [sx, sy] = pointToile(e)
  const pin = e.target.closest('[data-pin]')
  const noeudEl = e.target.closest('.noeud')
  const boiteEl = e.target.closest('.commentaire')
  const zoneFil = e.target.closest('.fil-zone')

  // Déplacement de la vue : clic droit, molette, ou Espace + clic
  if (e.button === 1 || e.button === 2 || (e.button === 0 && espace)) {
    e.preventDefault()
    geste = { type: 'vue', bouton: e.button, x0: e.clientX, y0: e.clientY, vx: vue.x, vy: vue.y, bouge: false, sx, sy, noeud: noeudEl?.dataset.id, boite: boiteEl?.dataset.id }
    return
  }
  if (e.button !== 0) return
  const ajout = e.shiftKey || e.ctrlKey || e.metaKey

  if (pin && noeudEl) {
    e.preventDefault()
    const cle = pin.dataset.pin
    if (e.altKey) { couperLiens(noeudEl.dataset.id, cle); return }
    geste = { type: 'fil', noeud: noeudEl.dataset.id, cle, sortie: cle === 'sortie', x0: e.clientX, y0: e.clientY }
    toile.classList.add('relie')
    return
  }
  if (noeudEl) {
    const id = noeudEl.dataset.id
    const tete = e.target.closest('.demo-tete')
    if (tete) {
      selectionner([`d:${tete.parentElement.dataset.demo}`], ajout)
      geste = { type: 'rien' }
      return
    }
    const cle = `n:${id}`
    const dejaChoisi = selection.has(cle)
    if (!dejaChoisi) selectionner([cle], ajout)
    debuterDeplacement(e, { n: parId(id) })
    geste.basculer = dejaChoisi && ajout ? cle : null
    geste.seul = dejaChoisi && !ajout ? cle : null
    return
  }
  if (boiteEl) {
    const id = boiteEl.dataset.id
    const c = commentaire(id)
    const poignee = e.target.closest('.poignee')
    if (poignee) {
      if (!selection.has(`c:${id}`)) selectionner([`c:${id}`])
      geste = { type: 'redim', c, dir: poignee.dataset.dir, x0: e.clientX, y0: e.clientY, depart: { ...c }, avant: instantane() }
      return
    }
    if (e.target.closest('.c-titre')) {
      const cle = `c:${id}`
      const dejaChoisi = selection.has(cle)
      if (!dejaChoisi) selectionner([cle], ajout)
      debuterDeplacement(e, { c })
      geste.basculer = dejaChoisi && ajout ? cle : null
      geste.seul = dejaChoisi && !ajout ? cle : null
      return
    }
  }
  if (zoneFil) {
    selectionner([`d:${zoneFil.dataset.demo}`], ajout)
    geste = { type: 'rien' }
    return
  }
  // Fond : rectangle de sélection
  geste = { type: 'marquee', sx, sy, x0: e.clientX, y0: e.clientY, base: ajout ? new Set(selection) : new Set(), bouge: false }
})

window.addEventListener('pointermove', (e) => {
  if (e.target instanceof Node && toile.contains(e.target)) souris = pointToile(e)
  if (!geste) return
  const dx = e.clientX - geste.x0
  const dy = e.clientY - geste.y0
  const loin = Math.abs(dx) + Math.abs(dy) > SEUIL

  if (geste.type === 'vue') {
    if (!geste.bouge && !loin) return
    geste.bouge = true
    toile.classList.add('panoramique')
    vue.x = geste.vx + dx
    vue.y = geste.vy + dy
    appliquerVue()
  } else if (geste.type === 'deplacer') {
    if (!geste.bouge && !loin) return
    geste.bouge = true
    let mx = dx / vue.k
    let my = dy / vue.k
    const p = geste.primaire.n || geste.primaire.c
    const depart = (geste.noeuds.find((x) => x.n === p) || geste.comms.find((x) => x.c === p))
    if (depart && aimanter) {
      mx = aimante(depart.x + mx) - depart.x
      my = aimante(depart.y + my) - depart.y
    }
    for (const x of geste.noeuds) { x.n.x = x.x + mx; x.n.y = x.y + my; placerNoeud(x.n) }
    for (const x of geste.comms) { x.c.x = x.x + mx; x.c.y = x.y + my; placerCommentaire(x.c) }
    majFils()
  } else if (geste.type === 'redim') {
    const { c, dir, depart: d } = geste
    const mx = dx / vue.k
    const my = dy / vue.k
    const MIN_L = 160
    const MIN_H = 80
    if (dir.includes('e')) c.l = Math.max(MIN_L, aimante(d.x + d.l + mx) - d.x)
    if (dir.includes('s')) c.h = Math.max(MIN_H, aimante(d.y + d.h + my) - d.y)
    if (dir.includes('w')) { const x = Math.min(aimante(d.x + mx), d.x + d.l - MIN_L); c.l = d.x + d.l - x; c.x = x }
    if (dir.includes('n')) { const y = Math.min(aimante(d.y + my), d.y + d.h - MIN_H); c.h = d.y + d.h - y; c.y = y }
    placerCommentaire(c)
  } else if (geste.type === 'fil') {
    const a = pointBroche(geste.noeud, geste.cle)
    const [sx, sy] = pointToile(e)
    const b = versMonde(sx, sy)
    filTemp.style.display = ''
    filTemp.setAttribute('d', geste.sortie ? courbe(a, b) : courbe(b, a))
    for (const el of toile.querySelectorAll('.pin.cible')) el.classList.remove('cible')
    const cible = cibleSous(e)
    if (cible?.pin) cible.pin.classList.add('cible')
  } else if (geste.type === 'marquee') {
    if (!geste.bouge && !loin) return
    geste.bouge = true
    const [sx, sy] = pointToile(e)
    const r = { x: Math.min(sx, geste.sx), y: Math.min(sy, geste.sy), l: Math.abs(sx - geste.sx), h: Math.abs(sy - geste.sy) }
    Object.assign(marquee.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.l}px`, height: `${r.h}px` })
    const [wx0, wy0] = versMonde(r.x, r.y)
    const [wx1, wy1] = versMonde(r.x + r.l, r.y + r.h)
    const nouvelle = new Set(geste.base)
    for (const n of etat.noeuds) {
      const q = rectangleDe('n', n.id)
      if (q && q.x < wx1 && q.x + q.l > wx0 && q.y < wy1 && q.y + q.h > wy0) nouvelle.add(`n:${n.id}`)
    }
    for (const c of etat.commentaires) if (c.x >= wx0 && c.y >= wy0 && c.x + c.l <= wx1 && c.y + c.h <= wy1) nouvelle.add(`c:${c.id}`)
    selection = nouvelle
    for (const [id, rr] of rendus) rr.el.classList.toggle('choisi', selection.has(`n:${id}`))
    for (const [id, b] of boites) b.el.classList.toggle('choisi', selection.has(`c:${id}`))
  }
})

// Broche compatible sous le curseur pendant un tirage de fil
function cibleSous(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const noeudEl = el?.closest('.noeud')
  if (!noeudEl || noeudEl.dataset.id === geste.noeud) return noeudEl ? { interdit: true } : null
  const pin = el.closest('[data-pin]')
  const compatible = pin && (geste.sortie ? pin.dataset.pin !== 'sortie' : pin.dataset.pin === 'sortie')
  return { noeud: noeudEl.dataset.id, pin: compatible ? pin : null }
}

window.addEventListener('pointerup', (e) => {
  if (!geste) return
  const g = geste
  geste = null
  toile.classList.remove('panoramique', 'relie')

  if (g.type === 'vue') {
    if (g.bouge) { sauvegarder(); return }
    if (g.bouton !== 2) return
    // Clic droit sans glisser : menu contextuel
    if (g.noeud) {
      if (!selection.has(`n:${g.noeud}`)) selectionner([`n:${g.noeud}`])
      menuNoeud(g.sx, g.sy, g.noeud)
    } else if (g.boite) {
      if (!selection.has(`c:${g.boite}`)) selectionner([`c:${g.boite}`])
      menuCommentaire(g.sx, g.sy, g.boite)
    } else menuCreation(g.sx, g.sy)
  } else if (g.type === 'deplacer') {
    if (g.bouge) { memoriser(g.avant); rendrePanneau(); return }
    if (g.basculer) { selection.delete(g.basculer); majSelection() } else if (g.seul && selection.size > 1) selectionner([g.seul])
  } else if (g.type === 'redim') {
    memoriser(g.avant)
  } else if (g.type === 'fil') {
    filTemp.style.display = 'none'
    for (const el of toile.querySelectorAll('.pin.cible')) el.classList.remove('cible')
    geste = g
    const cible = cibleSous(e)
    geste = null
    const bouge = Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) > SEUIL
    if (!bouge) return
    if (cible?.interdit) return
    if (cible?.noeud) {
      if (g.sortie) relier(g.noeud, cible.noeud, cible.pin?.dataset.pin)
      else if (g.cle === 'nouvelle') relier(cible.noeud, g.noeud, 'nouvelle')
      else relier(cible.noeud, g.noeud, g.cle)
      return
    }
    // Relâché dans le vide : menu de création, le nouveau nœud sera relié (comme dans UE)
    const [sx, sy] = pointToile(e)
    menuCreation(sx, sy, g.sortie ? { depuis: g.noeud } : { vers: { noeud: g.noeud, cle: g.cle } })
  } else if (g.type === 'marquee') {
    marquee.style.display = 'none'
    if (!g.bouge && !g.base.size) selection = new Set()
    majSelection()
  }
})

toile.addEventListener('dblclick', (e) => {
  const nom = e.target.closest('.nom')
  if (nom) { renommerNoeud(nom.closest('.noeud').dataset.id); return }
  const dn = e.target.closest('.demo-nom')
  if (dn) { renommerDemo(dn.closest('.demo').dataset.demo, dn); return }
  const titre = e.target.closest('.c-titre')
  if (titre) { renommerCommentaire(titre.closest('.commentaire').dataset.id); return }
  const noeudEl = e.target.closest('.noeud')
  if (noeudEl) {
    selectionner([`n:${noeudEl.dataset.id}`])
    const champ = panneau.querySelector('[data-champ="n.enonce"]')
    if (champ) { champ.focus(); champ.select() }
  }
})

// ─── Menu contextuel ─────────────────────────────────────────────────────────────────────────────────

let menuElements = []
let menuActif = 0

const normaliser = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function ouvrirMenu(sx, sy, titre, elements, recherche = true) {
  menuElements = elements
  menu.querySelector('.m-tete span').textContent = titre
  menu.querySelector('.m-tete small').textContent = recherche ? 'contextuel' : ''
  menuRecherche.style.display = recherche ? '' : 'none'
  menuRecherche.value = ''
  menu.classList.add('ouvert')
  filtrerMenu()
  const l = menu.offsetWidth
  const h = menu.offsetHeight
  menu.style.left = `${Math.min(sx, toile.clientWidth - l - 8)}px`
  menu.style.top = `${Math.max(8, Math.min(sy, toile.clientHeight - h - 8))}px`
  if (recherche) menuRecherche.focus()
  else menu.focus()
}

function fermerMenu() {
  if (!menu.classList.contains('ouvert')) return
  menu.classList.remove('ouvert')
  if (document.activeElement === menuRecherche) menuRecherche.blur()
}

function filtrerMenu() {
  const q = normaliser(menuRecherche.value.trim())
  const visibles = menuElements.filter((x) => !q || normaliser(`${x.groupe} ${x.lab} ${x.mots || ''}`).includes(q))
  menuActif = 0
  let groupe = null
  let html = ''
  visibles.forEach((x, i) => {
    if (x.groupe !== groupe) { groupe = x.groupe; html += `<div class="m-groupe">${esc(groupe)}</div>` }
    html += `<div class="m-item${i === 0 ? ' actif' : ''}" data-i="${i}" title="${esc(x.aide || '')}"><span class="m-ico" style="--c:${x.couleur || '#71717a'}">${x.ico || ''}</span>${esc(x.lab)}${x.kbd ? `<kbd>${x.kbd}</kbd>` : ''}</div>`
  })
  menuListe.innerHTML = html || '<div class="m-vide">Aucune action</div>'
  menuListe.visibles = visibles
}

function executerMenu(i) {
  const x = menuListe.visibles?.[i]
  if (!x) return
  fermerMenu()
  x.faire()
}

menuRecherche.addEventListener('input', filtrerMenu)
menu.addEventListener('pointerdown', (e) => { if (!e.target.closest('.m-recherche')) e.preventDefault() })
menu.addEventListener('click', (e) => {
  const it = e.target.closest('.m-item')
  if (it) executerMenu(Number(it.dataset.i))
})
menu.addEventListener('pointermove', (e) => {
  const it = e.target.closest('.m-item')
  if (!it || Number(it.dataset.i) === menuActif) return
  menuActif = Number(it.dataset.i)
  for (const el of menuListe.querySelectorAll('.m-item')) el.classList.toggle('actif', Number(el.dataset.i) === menuActif)
})
menu.addEventListener('keydown', (e) => {
  const n = menuListe.visibles?.length || 0
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    menuActif = (menuActif + (e.key === 'ArrowDown' ? 1 : -1) + n) % Math.max(1, n)
    for (const el of menuListe.querySelectorAll('.m-item')) el.classList.toggle('actif', Number(el.dataset.i) === menuActif)
    menuListe.querySelector('.m-item.actif')?.scrollIntoView({ block: 'nearest' })
  } else if (e.key === 'Enter') { e.preventDefault(); executerMenu(menuActif) } else if (e.key === 'Escape') { e.preventDefault(); fermerMenu() }
  e.stopPropagation()
})
menu.tabIndex = -1

function menuCreation(sx, sy, connexion = null) {
  const [wx, wy] = versMonde(sx, sy)
  const ordre = connexion?.depuis ? ['assertion', 'conclusion', 'hypothese', 'fait'] : ['assertion', 'fait', 'hypothese', 'conclusion']
  const elements = ordre.map((k) => ({
    groupe: connexion ? (connexion.depuis ? 'Nouveau nœud démontré par ce fil' : 'Nouvelle prémisse') : 'Raisonnement',
    lab: GENRES[k].libelle, ico: GENRES[k].ico, couleur: GENRES[k].couleur, aide: GENRES[k].aide, mots: 'nœud noeud ajouter creer',
    faire: () => creerNoeud(k, wx, wy, connexion),
  }))
  if (!connexion) {
    elements.push(
      { groupe: 'Organisation', lab: selection.size ? 'Commentaire autour de la sélection' : 'Commentaire (catégorie)', ico: '▭', kbd: 'C', mots: 'categorie boite groupe', faire: () => (selection.size ? creerCommentaire() : creerCommentaire(wx, wy)) },
      { groupe: 'Vue', lab: 'Tout cadrer', ico: '⤢', kbd: 'Origine', faire: () => cadrer(true) },
      { groupe: 'Vue', lab: aimanter ? 'Désactiver la grille aimantée' : 'Activer la grille aimantée', ico: '#', mots: 'aimanter grille', faire: basculerAimant },
    )
  }
  ouvrirMenu(sx, sy, connexion ? 'Actions pour cette broche' : 'Toutes les actions', elements)
}

function menuNoeud(sx, sy, id) {
  const plusieurs = idsSel('n').length > 1
  ouvrirMenu(sx, sy, plusieurs ? `${idsSel('n').length} nœuds` : parId(id).nom, [
    ...(plusieurs ? [] : [{ groupe: 'Nœud', lab: 'Renommer', ico: 'A', kbd: 'Dbl-clic', faire: () => renommerNoeud(id) }]),
    { groupe: 'Nœud', lab: 'Dupliquer', ico: '⧉', kbd: 'Ctrl+D', faire: dupliquer },
    ...(plusieurs ? [] : [{ groupe: 'Nœud', lab: 'Couper tous les liens', ico: '✂', faire: () => couperTousLiens(id) }]),
    { groupe: 'Nœud', lab: 'Supprimer', ico: '×', kbd: 'Suppr', faire: supprimerSelection },
    { groupe: 'Organisation', lab: 'Commentaire autour', ico: '▭', kbd: 'C', faire: () => creerCommentaire() },
    { groupe: 'Organisation', lab: 'Cadrer', ico: '⤢', kbd: 'F', faire: () => cadrer() },
  ], false)
}

function menuCommentaire(sx, sy, id) {
  ouvrirMenu(sx, sy, commentaire(id).titre, [
    { groupe: 'Commentaire', lab: 'Renommer', ico: 'A', kbd: 'Dbl-clic', faire: () => renommerCommentaire(id) },
    { groupe: 'Commentaire', lab: 'Sélectionner son contenu', ico: '⬚', faire: () => { const k = contenus(commentaire(id)); selectionner(k.noeuds.map((n) => `n:${n}`)) } },
    { groupe: 'Commentaire', lab: 'Supprimer la boîte', ico: '×', kbd: 'Suppr', faire: supprimerSelection },
  ], false)
}

// ─── Clavier ─────────────────────────────────────────────────────────────────────────────────────────

const enSaisie = () => {
  const a = document.activeElement
  return a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (menu.classList.contains('ouvert')) { fermerMenu(); return }
    if (aidePop.classList.contains('ouvert')) { aidePop.classList.remove('ouvert'); return }
    if (enSaisie()) { document.activeElement.blur(); return }
    if (geste?.type === 'fil') { geste = null; filTemp.style.display = 'none'; toile.classList.remove('relie'); return }
    selectionner([])
    return
  }
  if (enSaisie()) return
  const ctrl = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); restaurer(pileAnnuler, pileRetablir) } else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); restaurer(pileRetablir, pileAnnuler) } else if (ctrl && k === 'd') { e.preventDefault(); dupliquer() } else if (ctrl && k === 'a') { e.preventDefault(); selectionner(etat.noeuds.map((n) => `n:${n.id}`)) } else if (ctrl) return
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); supprimerSelection() } else if (k === 'f') { e.preventDefault(); cadrer() } else if (e.key === 'Home') { e.preventDefault(); cadrer(true) } else if (k === 'c') { e.preventDefault(); creerCommentaire() } else if (e.key === 'F2') {
    const ids = idsSel('n')
    if (ids.length === 1) renommerNoeud(ids[0])
  } else if (e.key === ' ') { espace = true; e.preventDefault() } else if (e.key === '?') aidePop.classList.toggle('ouvert')
})
window.addEventListener('keyup', (e) => { if (e.key === ' ') espace = false })
window.addEventListener('blur', () => { espace = false })

// ─── Barre d'outils ──────────────────────────────────────────────────────────────────────────────────

function basculerAimant() {
  aimanter = !aimanter
  majBoutons()
  sauvegarder()
  message(aimanter ? `Grille aimantée (${GRILLE} px).` : 'Grille aimantée désactivée.')
}

barre.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]')
  if (!b) return
  const cmd = b.dataset.cmd
  if (cmd === 'annuler') restaurer(pileAnnuler, pileRetablir)
  else if (cmd === 'retablir') restaurer(pileRetablir, pileAnnuler)
  else if (cmd === 'cadrer') cadrer()
  else if (cmd === 'commentaire') creerCommentaire()
  else if (cmd === 'aimanter') basculerAimant()
  else if (cmd === 'reinitialiser') reinitialiser()
  else if (cmd === 'aide') aidePop.classList.toggle('ouvert')
  b.blur()
})
barre.querySelector('.probleme').addEventListener('click', () => {
  selectionner([])
  panneau.querySelector('[data-champ="probleme"]')?.focus()
})

// ─── Panneau Détails ─────────────────────────────────────────────────────────────────────────────────

const prop = (label, controle, haut = false) => `<div class="prop${haut ? ' haut' : ''}"><label>${label}</label><div>${controle}</div></div>`
const lienNoeud = (id) => {
  const n = parId(id)
  const s = STATUTS[statuts[id]]
  return `<li><i class="pt" style="--s:${s.couleur}" title="${s.libelle}"></i><span class="lien" data-aller="n:${id}" title="${esc(n?.enonce)}">${esc(n?.nom ?? id)}</span></li>`
}

function rendrePanneau() {
  const cles = [...selection]
  if (cles.length > 1) return panneauMultiple(cles)
  if (!cles.length) return panneauGraphe()
  const [t, id] = [cles[0][0], cles[0].slice(2)]
  if (t === 'n') return panneauNoeud(parId(id))
  if (t === 'd') return panneauDemo(demo(id))
  if (t === 'c') return panneauCommentaire(commentaire(id))
}

function panneauGraphe() {
  const compte = Object.fromEntries(Object.keys(STATUTS).map((k) => [k, 0]))
  for (const n of etat.noeuds) compte[statuts[n.id]]++
  const conclusions = etat.noeuds.filter((n) => n.genre === 'conclusion')
  panneau.innerHTML = `
    <div class="d-tete"><span class="d-ico" style="--c:#3f3f46">⌗</span><div><div class="d-sur">Graphe</div><h2 class="d-titre">Résolution de problème</h2></div></div>
    <section class="section"><h3>Problème</h3><div class="props">${prop('Énoncé', `<textarea data-champ="probleme" rows="4">${esc(etat.probleme)}</textarea>`, true)}</div></section>
    <section class="section"><h3>Statuts <small>${etat.noeuds.length} assertions · ${etat.demonstrations.length} démonstrations</small></h3>
      <div class="compte">${Object.entries(STATUTS).map(([k, s]) => `<span class="statut-l" style="--s:${s.couleur}"><i></i>${s.libelle}</span><span>${compte[k]}</span>`).join('')}</div>
    </section>
    ${conclusions.length ? `<section class="section"><h3>Conclusions</h3><ul class="liste">${conclusions.map((n) => lienNoeud(n.id)).join('')}</ul></section>` : ''}
    <section class="section"><h3>Catégories <small>${etat.commentaires.length}</small></h3><ul class="liste">${etat.commentaires.map((c) => `<li><i class="pt" style="--s:${c.couleur}"></i><span class="lien" data-aller="c:${c.id}">${esc(c.titre)}</span><span class="mono">${contenus(c).noeuds.length}</span></li>`).join('') || '<li class="vide">Aucune</li>'}</ul></section>
    <p class="note">Cliquez un nœud, un fil ou un titre de démonstration pour l’éditer. Le statut d’un nœud n’est jamais saisi : il est recalculé depuis tout le graphe.</p>`
}

function panneauMultiple(cles) {
  const n = cles.filter((c) => c[0] === 'n').length
  const c = cles.filter((x) => x[0] === 'c').length
  panneau.innerHTML = `
    <div class="d-tete"><span class="d-ico" style="--c:#3f3f46">⬚</span><div><div class="d-sur">Sélection multiple</div><h2 class="d-titre">${n} nœud${n > 1 ? 's' : ''}${c ? ` · ${c} boîte${c > 1 ? 's' : ''}` : ''}</h2></div></div>
    <ul class="liste">${cles.filter((x) => x[0] === 'n').map((x) => lienNoeud(x.slice(2))).join('')}</ul>
    <div class="boutons"><button class="bouton" data-action="commentaire">Commentaire autour (C)</button><button class="bouton" data-action="dupliquer">Dupliquer (Ctrl+D)</button><button class="bouton danger" data-action="supprimer">Supprimer</button></div>`
}

function panneauNoeud(n) {
  const g = GENRES[n.genre]
  const st = statuts[n.id]
  const demos = demosDe(n.id)
  const utilisateurs = [...new Set(etat.demonstrations.filter((d) => d.justifie_par.includes(n.id)).map((d) => d.noeud_id))]
  const categories = etat.commentaires.filter((c) => contenus(c).noeuds.includes(n.id))
  panneau.innerHTML = `
    <div class="d-tete"><span class="d-ico" style="--c:${g.couleur}">${g.ico}</span><div><div class="d-sur">${g.libelle} · ${esc(n.id)}</div><h2 class="d-titre">${esc(n.nom)}</h2></div></div>
    <section class="section"><h3>Assertion</h3><div class="props">
      ${prop('Nom', `<input class="champ" data-champ="n.nom" value="${esc(n.nom)}">`)}
      ${prop('Énoncé', `<textarea data-champ="n.enonce" rows="4" placeholder="Énoncé précis de l’assertion">${esc(n.enonce)}</textarea>`, true)}
      ${prop('Type', `<select data-champ="n.genre">${Object.entries(GENRES).map(([k, x]) => `<option value="${k}"${k === n.genre ? ' selected' : ''}>${x.libelle}</option>`).join('')}</select>`)}
      ${prop('Admis', `<label class="coche"><input type="checkbox" data-champ="n.admis"${n.admis ? ' checked' : ''}> établi sans démonstration</label>`)}
      ${prop('Catégorie', categories.length ? categories.map((c) => `<span class="lien" data-aller="c:${c.id}" style="cursor:pointer;color:${c.couleur}">${esc(c.titre)}</span>`).join(', ') : '<span style="color:var(--texte-3)">aucune</span>')}
    </div></section>
    <section class="section"><h3>Statut</h3>
      <div class="props">${prop('Calculé', `<span class="statut-l" style="--s:${STATUTS[st].couleur}"><i></i>${STATUTS[st].libelle}</span>`)}</div>
      <p class="aide-statut">${EXPLICATIONS[st]}</p>
    </section>
    <section class="section"><h3>Démonstrations <small>${demos.length}</small></h3>
      <ul class="liste">${demos.map((d) => `<li><i class="pt" style="--s:${VALIDITES[d.validite].couleur}" title="${VALIDITES[d.validite].libelle}"></i><span class="lien" data-aller="d:${d.id}">${esc(d.nom_demonstration)}</span><span class="mono">${d.justifie_par.length} prém. · ${formatConf(d.confiance)}</span></li>`).join('') || '<li class="vide">Aucune</li>'}</ul>
      <div class="boutons"><button class="bouton" data-action="ajout-demo">Ajouter une démonstration</button></div>
    </section>
    <section class="section"><h3>Utilisé par <small>${utilisateurs.length}</small></h3><ul class="liste">${utilisateurs.map(lienNoeud).join('') || '<li class="vide">Aucune assertion</li>'}</ul></section>
    <div class="boutons"><button class="bouton" data-action="cadrer">Cadrer (F)</button><button class="bouton" data-action="dupliquer">Dupliquer</button><button class="bouton danger" data-action="supprimer">Supprimer</button></div>`
}

function panneauDemo(d) {
  const v = VALIDITES[d.validite]
  const conclusion = parId(d.noeud_id)
  const nonNotee = d.confiance === null || d.confiance === undefined
  panneau.innerHTML = `
    <div class="d-tete"><span class="d-ico" style="--c:${v.couleur}">⇒</span><div><div class="d-sur">Démonstration · ${esc(d.id)}</div><h2 class="d-titre">${esc(d.nom_demonstration)}</h2></div></div>
    <section class="section"><h3>Démonstration</h3><div class="props">
      ${prop('Nom', `<input class="champ mono" data-champ="d.nom_demonstration" value="${esc(d.nom_demonstration)}">`)}
      ${prop('Démontre', `<span class="lien" data-aller="n:${conclusion.id}" style="cursor:pointer;text-decoration:underline">${esc(conclusion.nom)}</span>`)}
      ${prop('Raisonnement', `<textarea data-champ="d.demonstration" rows="4" placeholder="Comment les prémisses entraînent la conclusion">${esc(d.demonstration)}</textarea>`, true)}
      ${prop('Auteur', `<input class="champ mono" data-champ="d.auteur" value="${esc(d.auteur)}">`)}
    </div></section>
    <section class="section"><h3>Vérification</h3><div class="props">
      ${prop('Validité', `<select data-champ="d.validite">${Object.entries(VALIDITES).map(([k, x]) => `<option value="${k}"${k === d.validite ? ' selected' : ''}>${x.libelle}</option>`).join('')}</select>`)}
      ${prop('Confiance', `<div class="conf-ligne"><input type="range" min="0" max="1" step="0.01" data-champ="d.confiance" value="${nonNotee ? 0.5 : d.confiance}"${nonNotee ? ' disabled' : ''}><output>${formatConf(d.confiance)}</output></div>`)}
      ${prop('', `<label class="coche"><input type="checkbox" data-champ="d.nonNotee"${nonNotee ? ' checked' : ''}> non notée</label>`)}
    </div></section>
    <section class="section"><h3>Prémisses <small>${d.justifie_par.length}</small></h3>
      <ul class="liste">${d.justifie_par.map((p) => lienNoeud(p).replace('</li>', `<button class="x" data-action="retirer" data-p="${p}" title="Retirer cette prémisse">×</button></li>`)).join('') || '<li class="vide">Aucune — tirez un fil depuis une sortie</li>'}</ul>
    </section>
    <div class="boutons"><button class="bouton" data-action="cadrer">Cadrer (F)</button><button class="bouton danger" data-action="supprimer">Supprimer la démonstration</button></div>`
}

function panneauCommentaire(c) {
  const k = contenus(c)
  panneau.innerHTML = `
    <div class="d-tete"><span class="d-ico" style="--c:${c.couleur}">▭</span><div><div class="d-sur">Commentaire · catégorie</div><h2 class="d-titre">${esc(c.titre)}</h2></div></div>
    <section class="section"><h3>Commentaire</h3><div class="props">
      ${prop('Titre', `<input class="champ" data-champ="c.titre" value="${esc(c.titre)}">`)}
      ${prop('Couleur', `<div class="palette">${PALETTE.map((p) => `<button data-action="couleur" data-couleur="${p}" style="--c:${p}" class="${p === c.couleur ? 'actif' : ''}" title="${p}"></button>`).join('')}</div>`)}
      ${prop('Taille', `<span class="mono" style="font:11.5px var(--mono)">${Math.round(c.l)} × ${Math.round(c.h)}</span>`)}
    </div></section>
    <section class="section"><h3>Contenu <small>${k.noeuds.length}</small></h3><ul class="liste">${k.noeuds.map(lienNoeud).join('') || '<li class="vide">Vide — glissez des nœuds dedans</li>'}</ul></section>
    <div class="boutons"><button class="bouton" data-action="cadrer">Cadrer (F)</button><button class="bouton danger" data-action="supprimer">Supprimer la boîte</button></div>`
}

// Édition au clavier : l'état suit la frappe, l'historique retient une seule étape par champ
let avantEdition = null
panneau.addEventListener('focusin', (e) => { if (e.target.dataset.champ) avantEdition = instantane() })
panneau.addEventListener('focusout', (e) => {
  if (!e.target.dataset.champ || avantEdition === null) return
  const avant = avantEdition
  avantEdition = null
  memoriser(avant)
})

function cible() {
  const s = [...selection][0]
  if (!s || selection.size !== 1) return {}
  return { n: s[0] === 'n' ? parId(s.slice(2)) : null, d: s[0] === 'd' ? demo(s.slice(2)) : null, c: s[0] === 'c' ? commentaire(s.slice(2)) : null }
}

panneau.addEventListener('input', (e) => {
  const champ = e.target.dataset.champ
  if (!champ) return
  const { n, d, c } = cible()
  const v = e.target.value
  if (champ === 'probleme') { etat.probleme = v; texteProbleme.textContent = v } else if (champ === 'n.nom' && n) n.nom = v
  else if (champ === 'n.enonce' && n) n.enonce = v
  else if (champ === 'd.nom_demonstration' && d) d.nom_demonstration = v.replace(/\s/g, '_')
  else if (champ === 'd.demonstration' && d) d.demonstration = v
  else if (champ === 'd.auteur' && d) d.auteur = v
  else if (champ === 'd.confiance' && d) { d.confiance = Number(v); e.target.nextElementSibling.textContent = formatConf(d.confiance) } else if (champ === 'c.titre' && c) c.titre = v
  else return
  const titre = panneau.querySelector('.d-titre')
  if (titre && /^(n\.nom|d\.nom_demonstration|c\.titre)$/.test(champ)) titre.textContent = v
  rendreNoeuds()
  rendreCommentaires()
  majFils()
  sauvegarder()
})

panneau.addEventListener('change', (e) => {
  const champ = e.target.dataset.champ
  const { n, d } = cible()
  if (champ === 'n.genre' && n) modifier(() => { n.genre = e.target.value; n.admis = n.genre === 'fait' })
  else if (champ === 'n.admis' && n) modifier(() => { n.admis = e.target.checked; if (n.admis) n.genre = 'fait'; else if (n.genre === 'fait') n.genre = demosDe(n.id).length ? 'assertion' : 'hypothese' })
  else if (champ === 'd.validite' && d) modifier(() => { d.validite = e.target.value })
  else if (champ === 'd.nonNotee' && d) modifier(() => { d.confiance = e.target.checked ? null : 0.5 })
})

panneau.addEventListener('click', (e) => {
  const aller = e.target.closest('[data-aller]')
  if (aller) {
    const cle = aller.dataset.aller
    selectionner([cle])
    const r = rectangleDe(cle[0], cle.slice(2))
    if (r) {
      // Amène l'élément dans la vue s'il en est sorti, sans changer le zoom
      const l = toile.clientWidth
      const h = toile.clientHeight
      const x0 = r.x * vue.k + vue.x
      const y0 = r.y * vue.k + vue.y
      if (x0 < 0 || y0 < 0 || x0 + r.l * vue.k > l || y0 + r.h * vue.k > h) allerVers({ k: vue.k, x: l / 2 - (r.x + r.l / 2) * vue.k, y: h / 2 - (r.y + r.h / 2) * vue.k })
    }
    return
  }
  const b = e.target.closest('[data-action]')
  if (!b) return
  const { n, d, c } = cible()
  const a = b.dataset.action
  if (a === 'supprimer') supprimerSelection()
  else if (a === 'dupliquer') dupliquer()
  else if (a === 'commentaire') creerCommentaire()
  else if (a === 'cadrer') cadrer()
  else if (a === 'ajout-demo' && n) {
    let nd
    modifier(() => { nd = nouvelleDemonstration(n.id) })
    message(`Démonstration ajoutée à « ${n.nom} » : tirez des fils vers « Ajouter une prémisse ».`)
    if (nd) selectionner([`n:${n.id}`])
  } else if (a === 'retirer' && d) modifier(() => { d.justifie_par = d.justifie_par.filter((p) => p !== b.dataset.p); repasserAVerifier(d) })
  else if (a === 'couleur' && c) modifier(() => { c.couleur = b.dataset.couleur })
})

// ─── Démarrage ───────────────────────────────────────────────────────────────────────────────────────

const sauve = charger()
if (sauve) {
  etat = sauve.etat
  aimanter = sauve.aimanter ?? true
  if (sauve.vue?.k) vue = sauve.vue
} else {
  etat = etatExemple()
}
if (etat.categories) {
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))])
  disposerInitialement()
}
toutRendre()
appliquerVue()
if (!sauve?.vue?.k) cadrer(true, true)

// Les polices web changent la hauteur des nœuds : on remesure une fois chargées
document.fonts?.ready.then(() => {
  for (const r of rendus.values()) mesurerBroches(r)
  majFils()
})
