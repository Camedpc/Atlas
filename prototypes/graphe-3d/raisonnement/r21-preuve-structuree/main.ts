// R21 · Preuve structurée : le raisonnement comme une preuve hiérarchique numérotée (Lamport),
// avec liste-clé des fondations (Wigmore), filets de portée des choix (Fitch), marge de vérification
// alignée ligne à ligne et mini-carte synchronisée au défilement. Page DOM, sans sigma.

import { el } from '../../src/core/ui/dom'
import { demonstrationPrincipale, genererJeuRaisonnement, LIBELLES_STATUT, LIBELLES_TYPE } from '../../src/raisonnement/donnees'
import { confianceDe, construirePreuve } from './preuve'
import { formule, GLYPHE_VALIDITE, Rendu, type Rangee } from './rendu'
import meta from './meta.json'

const CLE = `atlas-raisonnement:${meta.id}`
interface Preferences { niveau: number; alt: boolean; prov: boolean; carte: boolean }
function lirePreferences(): Partial<Preferences> {
  try {
    return JSON.parse(localStorage.getItem(CLE) ?? '{}') as Partial<Preferences>
  } catch {
    return {}
  }
}
function ecrirePreferences(p: Preferences): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(p))
  } catch {
    // Stockage indisponible : préférences non mémorisées.
  }
}

const jeu = genererJeuRaisonnement()
const preuve = construirePreuve(jeu)
const s = preuve.stats
const prefs = { niveau: 3, alt: false, prov: false, carte: true, ...lirePreferences() }
prefs.niveau = Math.max(1, Math.min(s.niveauMax, prefs.niveau))

// ─── Squelette de la page ─────────────────────────────────────────────────────

const app = document.getElementById('app')!
const curseur = el('input', { type: 'range', min: 1, max: s.niveauMax, step: 1, value: prefs.niveau, 'aria-label': 'Profondeur affichée' })
const valeurNiveau = el('span', { class: 'mono' }, `⟨${prefs.niveau}⟩`)
const caseAlt = el('input', { type: 'checkbox', checked: prefs.alt })
const caseProv = el('input', { type: 'checkbox', checked: prefs.prov })
const caseCarte = el('input', { type: 'checkbox', checked: prefs.carte })
const boutonDeplier = el('button', { class: 'bouton', type: 'button' }, 'Tout déplier')
const boutonReinit = el('button', { class: 'bouton', type: 'button' }, 'Réinitialiser')

const barre = el('header', { class: 'barre' },
  el('a', { class: 'retour', href: '../../index.html' }, '← catalogue'),
  el('span', { class: 'nom-vision' }, meta.titre),
  el('label', { class: 'reglage' }, 'Profondeur ', curseur, valeurNiveau),
  el('label', { class: 'reglage' }, caseAlt, ' démonstrations alternatives'),
  el('label', { class: 'reglage' }, caseProv, ' provenance'),
  el('label', { class: 'reglage' }, caseCarte, ' mini-carte'),
  boutonDeplier, boutonReinit,
)

// En-tête de colonnes figé : étiquettes des filets, fil d'Ariane, titres de la marge.
const tetesFilets = preuve.portees.map((pt, c) => el('span', { class: 'tete-filet', 'data-portee': c, title: `${pt.etiquette} · ${jeu.noeuds[pt.i]!.nom} — survol : portée ; clic : épingler` }, pt.etiquette))
const ariane = el('div', { class: 'ariane' })
const colonnes = el('div', { class: 'rangee colonnes' },
  el('div', { class: 'gouttiere' }, tetesFilets),
  el('div', { class: 'corps' }, ariane),
  el('div', { class: 'marge' },
    el('span', { class: 'v', title: 'Validité de la démonstration principale' }, 'dém.'),
    el('span', { class: 'val', title: 'Validation' }, 'val.'),
    el('span', { class: 'ic-conteneur', title: 'Intervalle de confiance, échelle 0–1' }, '0 — 1'),
    el('span', { class: 'nd' }, ''),
  ),
)

const doc = el('div', { class: 'doc' })
const entete = el('div', { class: 'entete-doc' },
  el('div', { class: 'surtitre' }, 'Preuve structurée · jeu synthétique'),
  el('h1', {}, formule(jeu.titre)),
  el('p', { class: 'resume' }, formule(jeu.resume)),
  el('p', { class: 'chiffres' },
    `${s.noeuds} énoncés : ${s.fondations} fondations, ${s.entrees} entrées, ${s.etapes} étapes numérotées, ${s.decisions} décisions, ` +
    `${s.series} séries (${s.lignesSerie} mesures), ${s.controles} contrôles · ${s.renvoisCroises} renvois croisés · profondeur ${s.niveauMax}.`),
  el('details', { class: 'notation' },
    el('summary', {}, 'Notation'),
    el('dl', {},
      el('dt', {}, '⟨2⟩3'), el('dd', {}, 'troisième étape de niveau 2 de l’entrée ; hors de son entrée : « Th 2 ⟨2⟩3 ». H, M, D, A, T, L : hypothèses, choix, définitions, axiomes, outils, littérature. Déc k : décision. Ctl k : contrôle.'),
      el('dt', {}, 'par · aux. · tech. · ctx.'), el('dd', {}, 'rôle de la prémisse dans la démonstration principale : principale, auxiliaire, technique, contexte.'),
      el('dt', {}, 'Filets'), el('dd', {}, 'à gauche, un filet par choix de modélisation M : l’étape en dépend (graphe complet, transitivement). Survol d’un M : portée surlignée ; clic : épinglée.'),
      el('dt', {}, 'Marge'), el('dd', {}, 'validité de la démonstration principale (✓ valide, ? à vérifier, ✕ invalide, adm. admis) · validation (H, IA, IA+H) · intervalle de confiance sur l’échelle 0–1 (point = estimation) · nombre de démonstrations.'),
      el('dt', {}, 'États'), el('dd', {}, 'incertain, réfuté, piste abandonnée : en petites capitales après le titre ; la piste abandonnée est en gris.'),
    ),
  ),
)
doc.appendChild(entete)

const carteSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
const carte = el('aside', { class: 'carte', 'aria-label': 'Mini-carte de la preuve' }, el('div', { class: 'titre-carte' }, 'Carte · arbre et renvois'))
carte.appendChild(carteSvg)
const apercu = el('div', { class: 'apercu', role: 'tooltip' })

const page = el('main', { class: 'page' }, colonnes, doc)
app.append(barre, page, carte, apercu)

const rendu = new Rendu(preuve, doc)
rendu.construire()
const rangees = rendu.rangees

// ─── Visibilité (profondeur + replis) ─────────────────────────────────────────

const ouverte = (r: Rangee) => (r.etat === 'ouvert' ? true : r.etat === 'ferme' ? false : r.niveau < prefs.niveau)

function majVisibilite(): void {
  for (const r of rangees) {
    let v = true
    for (let a = r.parent; a; a = a.parent) if (!ouverte(a)) {
      v = false
      break
    }
    r.visible = v
    r.el.classList.toggle('masquee', !v)
  }
  // Triangles et compte des descendants masqués.
  const masques = new Map<Rangee, number>()
  for (let k = rangees.length - 1; k >= 0; k--) {
    const r = rangees[k]!
    let m = 0
    for (const c of r.enfants) m += (c.visible ? 0 : 1) + (masques.get(c) ?? 0)
    masques.set(r, m)
    if (r.bouton?.classList.contains('actif')) r.bouton.textContent = ouverte(r) ? '▾' : '▸'
    if (r.compteMasques) r.compteMasques.textContent = m ? ` +${m}` : ''
  }
  majFilets()
  majCarte()
}

// ─── Filets de portée ─────────────────────────────────────────────────────────

function majFilets(): void {
  preuve.portees.forEach((pt, c) => {
    let avant = false
    for (const r of rangees) {
      const cell = r.cellules[c]!
      const dedans = r.pour.some((i) => i === pt.i || pt.dependants.has(i))
      cell.classList.toggle('actif', dedans)
      if (!r.visible) continue
      const debut = dedans && !avant
      cell.classList.toggle('debut', debut)
      cell.textContent = debut ? pt.etiquette : ''
      avant = dedans
    }
  })
}

let porteeEpinglee: number | null = null
function surlignerPortee(c: number | null): void {
  const pt = c === null ? null : preuve.portees[c]!
  for (const r of rangees) r.el.classList.toggle('en-portee', !!pt && r.pour.some((i) => i === pt.i || pt.dependants.has(i)))
  tetesFilets.forEach((t, k) => t.classList.toggle('active', k === c))
}

// ─── Aller à un énoncé ────────────────────────────────────────────────────────

let minuterieCible = 0
function aller(i: number): void {
  const r = rendu.rangeeDe.get(i)
  if (!r) return
  for (let a = r.parent; a; a = a.parent) if (!ouverte(a)) a.etat = 'ouvert'
  majVisibilite()
  r.el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  document.querySelectorAll('.cible').forEach((x) => x.classList.remove('cible'))
  r.el.classList.add('cible')
  window.clearTimeout(minuterieCible)
  minuterieCible = window.setTimeout(() => r.el.classList.remove('cible'), 1800)
}

// ─── Aperçu au survol d'un renvoi ────────────────────────────────────────────

function montrerApercu(i: number, x: number, y: number): void {
  const n = jeu.noeuds[i]!
  const e = preuve.elements[i]!
  const d = demonstrationPrincipale(n)
  const c = confianceDe(n)
  apercu.replaceChildren(
    el('div', { class: 'ap-tete' }, el('span', { class: 'mono' }, e.entree && e.genre !== 'racine' && e.genre !== 'decision' ? `${e.entree.court} ${e.etiquette}` : e.etiquette), ' ', el('span', { class: 'type' }, LIBELLES_TYPE[n.type])),
    el('div', { class: 'ap-titre' }, formule(n.nom)),
    el('div', { class: 'ap-enonce' }, formule(n.enonce)),
    el('div', { class: 'ap-pied' },
      `${LIBELLES_STATUT[n.statut]} · ${d ? `dém. ${GLYPHE_VALIDITE[d.validite]}` : n.admis ? 'admis' : 'sans démonstration'} · confiance ${c.estimation.toFixed(2)} [${c.bas.toFixed(2)} ; ${c.haut.toFixed(2)}]`),
  )
  apercu.classList.add('visible')
  const l = apercu.offsetWidth, h = apercu.offsetHeight
  apercu.style.left = `${Math.min(x + 14, window.innerWidth - l - 12)}px`
  apercu.style.top = `${y + 18 + h > window.innerHeight ? y - h - 12 : y + 18}px`
}

document.addEventListener('mouseover', (ev) => {
  const t = ev.target as HTMLElement
  const renvoi = t.closest<HTMLElement>('.renvoi')
  if (renvoi?.dataset.i) montrerApercu(Number(renvoi.dataset.i), (ev as MouseEvent).clientX, (ev as MouseEvent).clientY)
  const p = t.closest<HTMLElement>('[data-portee]')
  if (p && porteeEpinglee === null) surlignerPortee(Number(p.dataset.portee))
})
document.addEventListener('mouseout', (ev) => {
  const t = ev.target as HTMLElement
  if (t.closest('.renvoi')) apercu.classList.remove('visible')
  if (t.closest('[data-portee]') && porteeEpinglee === null) surlignerPortee(null)
})

document.addEventListener('click', (ev) => {
  const t = ev.target as HTMLElement
  const epingle = t.closest<HTMLElement>('[data-epingler], .tete-filet, .filet.debut')
  if (epingle) {
    const c = Number(epingle.dataset.epingler ?? epingle.dataset.portee)
    porteeEpinglee = porteeEpinglee === c ? null : c
    surlignerPortee(porteeEpinglee)
    return
  }
  const lien = t.closest<HTMLElement>('.renvoi, .num')
  if (lien?.dataset.i) {
    ev.preventDefault()
    apercu.classList.remove('visible')
    aller(Number(lien.dataset.i))
    return
  }
  const tri = t.closest<HTMLButtonElement>('.tri.actif')
  if (tri) {
    const r = rangees.find((x) => x.bouton === tri)
    if (r) {
      r.etat = ouverte(r) ? 'ferme' : 'ouvert'
      majVisibilite()
    }
  }
})
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    porteeEpinglee = null
    surlignerPortee(null)
  }
})

// ─── Réglages ─────────────────────────────────────────────────────────────────

function appliquerPreferences(): void {
  document.body.classList.toggle('alt-on', prefs.alt)
  document.body.classList.toggle('prov-on', prefs.prov)
  document.body.classList.toggle('carte-on', prefs.carte)
  valeurNiveau.textContent = `⟨${prefs.niveau}⟩`
  ecrirePreferences(prefs)
}
curseur.addEventListener('input', () => {
  prefs.niveau = Number(curseur.value)
  // Le curseur redonne la main : les replis explicites sont oubliés (sauf les compléments, fermés).
  for (const r of rangees) r.etat = r.element?.replie ? 'ferme' : 'auto'
  appliquerPreferences()
  majVisibilite()
})
caseAlt.addEventListener('change', () => {
  prefs.alt = caseAlt.checked
  appliquerPreferences()
  majCarte()
})
caseProv.addEventListener('change', () => {
  prefs.prov = caseProv.checked
  appliquerPreferences()
  majCarte()
})
caseCarte.addEventListener('change', () => {
  prefs.carte = caseCarte.checked
  appliquerPreferences()
  majCarte()
})
boutonDeplier.addEventListener('click', () => {
  prefs.niveau = s.niveauMax
  curseur.value = String(s.niveauMax)
  for (const r of rangees) r.etat = 'ouvert'
  appliquerPreferences()
  majVisibilite()
})
boutonReinit.addEventListener('click', () => {
  prefs.niveau = Math.min(3, s.niveauMax)
  prefs.alt = false
  prefs.prov = false
  prefs.carte = true
  curseur.value = String(prefs.niveau)
  caseAlt.checked = caseProv.checked = false
  caseCarte.checked = true
  for (const r of rangees) r.etat = r.element?.replie ? 'ferme' : 'auto'
  porteeEpinglee = null
  surlignerPortee(null)
  appliquerPreferences()
  majVisibilite()
})

// ─── Mini-carte : arbre (x = niveau) et renvois croisés en arcs ──────────────

let cadreVue: SVGRectElement | null = null
let echelle = 1
let hautDoc = 0

function majCarte(): void {
  if (!prefs.carte) return
  const L = carte.clientWidth
  const H = carte.clientHeight - 28
  carteSvg.setAttribute('width', String(L))
  carteSvg.setAttribute('height', String(H))
  hautDoc = doc.offsetTop
  const total = Math.max(1, doc.offsetHeight)
  echelle = H / total
  const y = (r: Rangee) => (r.el.offsetTop - doc.offsetTop + Math.min(r.el.offsetHeight, 24) / 2) * echelle
  const x = (r: Rangee) => 10 + Math.min(r.niveau, 12) * 9
  const xArc = L - 8
  let arbre = '', arcs = '', points = ''
  const racines: string[] = []
  for (const r of rangees) {
    if (!r.visible || !r.element) continue
    const yr = y(r).toFixed(1)
    if (r.parent?.visible) arbre += `M${x(r.parent)} ${y(r.parent).toFixed(1)}V${yr}H${x(r)}`
    for (const k of rendu.renvoisDe(r)) {
      const c = rendu.rangeeDe.get(k)
      if (!c?.visible) continue
      const y2 = y(c)
      const bosse = Math.min(L * 0.45, 6 + Math.abs(y2 - y(r)) * 0.35)
      arcs += `M${xArc} ${yr}C${xArc - bosse} ${yr} ${xArc - bosse} ${y2.toFixed(1)} ${xArc} ${y2.toFixed(1)}`
    }
    const n = jeu.noeuds[r.element.i]!
    const d = demonstrationPrincipale(n)
    const cls = d?.validite === 'invalide' ? 'pt-invalide' : d?.validite === 'a_verifier' ? 'pt-verifier' : n.piste === 'abandonnee' ? 'pt-abandon' : 'pt'
    const rayon = r.element.genre === 'racine' ? 2.6 : r.element.genre === 'decision' ? 2.2 : 1.5
    if (r.element.genre === 'decision') points += `<rect x="${x(r) - rayon}" y="${(y(r) - rayon).toFixed(1)}" width="${rayon * 2}" height="${rayon * 2}" transform="rotate(45 ${x(r)} ${yr})" class="${cls}"/>`
    else points += `<circle cx="${x(r)}" cy="${yr}" r="${rayon}" class="${cls}"/>`
    if (r.element.genre === 'racine' && r.element.entree) racines.push(`<text x="${x(r) + 6}" y="${(y(r) + 3).toFixed(1)}" class="lbl">${r.element.entree.court}</text>`)
  }
  carteSvg.innerHTML = `<path d="${arbre}" class="arbre"/><path d="${arcs}" class="arcs"/>${points}${racines.join('')}<rect class="vue" x="1" y="0" width="${L - 2}" height="10"/>`
  cadreVue = carteSvg.querySelector('rect.vue')
  majCadreVue()
}

function majCadreVue(): void {
  if (!cadreVue) return
  const haut = (window.scrollY + barre.offsetHeight + colonnes.offsetHeight - hautDoc) * echelle
  const h = (window.innerHeight - barre.offsetHeight - colonnes.offsetHeight) * echelle
  cadreVue.setAttribute('y', String(Math.max(0, haut)))
  cadreVue.setAttribute('height', String(Math.max(4, h)))
}

carteSvg.addEventListener('click', (ev) => {
  const b = carteSvg.getBoundingClientRect()
  const yDoc = (ev.clientY - b.top) / echelle + hautDoc
  window.scrollTo({ top: yDoc - window.innerHeight / 2, behavior: 'smooth' })
})

// ─── Fil d'Ariane (entrée en cours) et défilement ────────────────────────────

function majAriane(): void {
  const limite = window.scrollY + barre.offsetHeight + colonnes.offsetHeight + 8
  let courante: (typeof rendu.racines)[number] | null = null
  for (const x of rendu.racines) if (x.rangee.el.offsetTop <= limite) courante = x
  const n = courante ? jeu.noeuds[courante.entree.racine.i]! : null
  const texte = n && courante ? `${courante.entree.long} · ${n.nom}` : 'Supposons'
  if (ariane.textContent !== texte) ariane.replaceChildren(texte)
}

let attente = false
window.addEventListener('scroll', () => {
  if (attente) return
  attente = true
  requestAnimationFrame(() => {
    attente = false
    majCadreVue()
    majAriane()
  })
}, { passive: true })
window.addEventListener('resize', () => majCarte())

appliquerPreferences()
majVisibilite()
majAriane()

// Pour déboguer depuis la console.
;(window as unknown as { r21: unknown }).r21 = { preuve, rendu, aller }
