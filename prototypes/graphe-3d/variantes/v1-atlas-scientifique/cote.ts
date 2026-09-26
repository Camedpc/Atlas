// V1 · panneau latéral qui pousse le graphe (onglets Filtres / Catégories / Sélection / Légende)
// et légende de figure en haut à gauche.
//
// Le panneau du moteur (PanneauGauche) est monté dans notre propre colonne <aside>, hors de la
// vue : quand la colonne s'élargit, #app rétrécit, la scène est redimensionnée (ResizeObserver du
// moteur) et la caméra garde sa cible au centre : le graphe se recentre tout seul.

import {
  el, LIBELLES_STATUT, LIBELLES_VALIDATION, LIBELLES_VUES, NOMS_NIVEAUX, STATUTS, VALIDATIONS,
  formaterNombre, type VueGraphe,
} from '../../src/core'
import { glypheValidation, s } from './fiche'

const ONGLETS = [
  ['filtres', 'Filtres'],
  ['categories', 'Catégories'],
  ['selection', 'Sélection'],
  ['legende', 'Légende'],
] as const
type Onglet = (typeof ONGLETS)[number][0]

const CLE_STOCKAGE = 'atlas-graphe3d:v1-atlas-scientifique:cote'

function lireStockage(): { ouvert: boolean; onglet: Onglet } {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE)
    if (brut) return { ouvert: false, onglet: 'filtres', ...(JSON.parse(brut) as object) }
  } catch {
    // stockage indisponible
  }
  return { ouvert: false, onglet: 'filtres' }
}
function ecrireStockage(v: { ouvert: boolean; onglet: Onglet }): void {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(v))
  } catch {
    // ignoré
  }
}

export function monterCote(vue: VueGraphe, cote: HTMLElement, bouton: HTMLButtonElement): void {
  const etat = lireStockage()
  // Panneau du moteur monté en mode « externe » dans notre colonne (option ui.panneauMode).
  const p = vue.ui.panneau
  if (!p) return

  // Onglets, insérés entre l'en-tête et le contenu.
  const boutons = new Map<Onglet, HTMLButtonElement>()
  const nav = el('nav', { class: 'v1-onglets', role: 'tablist' }, ONGLETS.map(([id, titre]) => {
    const b = el('button', { type: 'button', role: 'tab' }, titre, el('i', { class: 'v1-pastille-onglet' }))
    b.addEventListener('click', () => choisir(id))
    boutons.set(id, b)
    return b
  }))
  const contenu = p.element.querySelector('.atlas-panneau-contenu')
  p.element.insertBefore(nav, contenu)
  for (const d of p.element.querySelectorAll<HTMLDetailsElement>('details.atlas-section')) d.open = true

  const choisir = (id: Onglet) => {
    etat.onglet = id
    cote.dataset.onglet = id
    boutons.forEach((b, k) => {
      b.classList.toggle('actif', k === id)
      b.setAttribute('aria-selected', String(k === id))
      if (k === id) b.classList.remove('signal')
    })
    ecrireStockage(etat)
  }
  const basculer = (ouvrir = !document.body.classList.contains('cote-ouvert')) => {
    etat.ouvert = ouvrir
    document.body.classList.toggle('cote-ouvert', ouvrir)
    bouton.setAttribute('aria-label', ouvrir ? 'Fermer le panneau' : 'Ouvrir le panneau')
    ecrireStockage(etat)
  }
  bouton.addEventListener('click', () => basculer())
  // Quand la colonne a fini de pousser la scène, on recadre dans la nouvelle zone sûre.
  cote.addEventListener('transitionend', (e) => {
    if (e.target === cote && e.propertyName === 'width') vue.cadrerTout()
  })
  choisir(etat.onglet)
  basculer(etat.ouvert)

  // La sélection bascule sur son onglet (ou le signale si le panneau est fermé).
  vue.on('selection', ({ unite }) => {
    if (unite === null) return
    if (document.body.classList.contains('cote-ouvert')) choisir('selection')
    else if (etat.onglet !== 'selection') boutons.get('selection')!.classList.add('signal')
  })

  // Légende propre à la variante (reconstruite au changement de thème, après celle du moteur).
  const majLegende = () => {
    p.remplacer('legende', construireLegende(vue))
    for (const d of p.element.querySelectorAll<HTMLDetailsElement>('details.atlas-section')) d.open = true
  }
  majLegende()
  vue.on('theme', majLegende)
  vue.on('selection', () => {
    for (const d of p.element.querySelectorAll<HTMLDetailsElement>('details.atlas-section')) d.open = true
  })
}

// ─── Légende ────────────────────────────────────────────────────────────────

function construireLegende(vue: VueGraphe): HTMLElement {
  const p = vue.palette
  const ligne = (glyphe: SVGElement, texte: string, note?: string) =>
    el('div', { class: 'v1-legende-ligne' }, glyphe, el('div', {}, texte, note ? el('br') : null, note ? el('small', {}, note) : null))
  const disque = (c: string) => {
    const g = s('svg', { width: 16, height: 16, viewBox: '0 0 16 16' })
    g.append(s('circle', { cx: 8, cy: 8, r: 6, fill: c }))
    return g
  }
  // Glyphe explicatif de l'anneau de confiance.
  const anneau = () => {
    const L = 70, c = 34, r0 = 13, R = 20
    const g = s('svg', { width: L, height: 68, viewBox: `0 0 ${L} 68` })
    const arc = (a: number, b: number) => {
      const A = -Math.PI / 2 + a * Math.PI * 2, B = -Math.PI / 2 + b * Math.PI * 2
      const grand = b - a > 0.5 ? 1 : 0
      return `M${c + R * Math.cos(A)} ${c + R * Math.sin(A)} A${R} ${R} 0 ${grand} 1 ${c + R * Math.cos(B)} ${c + R * Math.sin(B)}`
    }
    g.append(s('circle', { cx: c, cy: c, r: R, fill: 'none', stroke: p.texteDoux, 'stroke-opacity': 0.3, 'stroke-width': 0.6 }))
    g.append(s('path', { d: arc(0.58, 0.86), fill: 'none', stroke: p.statut.valide, 'stroke-opacity': 0.4, 'stroke-width': 5 }))
    g.append(s('path', { d: arc(0, 0.72), fill: 'none', stroke: p.texte, 'stroke-width': 2.4 }))
    g.append(s('circle', { cx: c, cy: c, r: r0, fill: p.statut.valide }))
    g.append(s('line', { x1: c, x2: c, y1: c - R - 5, y2: c - R + 3, stroke: p.texteDoux, 'stroke-width': 0.8 }))
    g.append(s('text', { x: c + 3, y: 6, 'font-size': 8.5, fill: p.texteDoux }, '0'))
    return g
  }
  const agregat = () => {
    const g = s('svg', { width: 70, height: 60, viewBox: '0 0 70 60' })
    const c = 30, r = 18, R = 23
    let a = -Math.PI / 2
    const parts: [string, number][] = [[p.statut.valide, 0.55], [p.statut.incertain, 0.3], [p.statut.refute, 0.15]]
    for (const [coul, part] of parts) {
      const b = a + part * Math.PI * 2
      const d = `M${c + R * Math.cos(a + 0.04)} ${c + R * Math.sin(a + 0.04)} A${R} ${R} 0 ${part > 0.5 ? 1 : 0} 1 ${c + R * Math.cos(b - 0.04)} ${c + R * Math.sin(b - 0.04)}`
      g.append(s('path', { d, fill: 'none', stroke: coul, 'stroke-width': 3 }))
      a = b
    }
    g.append(s('circle', { cx: c, cy: c, r, fill: p.domaines[0]!, 'fill-opacity': 0.34, stroke: p.domaines[0]!, 'stroke-width': 1 }))
    g.append(s('text', { x: c, y: c + 3.5, 'text-anchor': 'middle', 'font-size': 9, 'font-style': 'italic', fill: p.texte }, 'Thème'))
    return g
  }
  const arete = () => {
    const g = s('svg', { width: 34, height: 16, viewBox: '0 0 34 16' })
    g.append(s('path', { d: 'M3 12 Q 16 0 29 10', fill: 'none', stroke: p.arete, 'stroke-width': 1 }))
    g.append(s('path', { d: 'M31 11.5 l-5.5 -0.5 l2.5 -4 Z', fill: p.arete }))
    return g
  }
  const pastille = (c: string) => {
    const g = s('svg', { width: 16, height: 16, viewBox: '0 0 16 16' })
    g.append(s('circle', { cx: 8, cy: 8, r: 5, fill: p.fond, stroke: c, 'stroke-width': 2.2 }))
    return g
  }
  const { h } = vue
  return el(
    'div',
    { class: 'v1-legende' },
    el('h5', {}, 'Nœud · remplissage = statut'),
    STATUTS.map((k) => ligne(disque(p.statut[k]), LIBELLES_STATUT[k])),
    el('h5', {}, 'Nœud · bordure = validation'),
    VALIDATIONS.map((v) => ligne(glypheValidation(p, v, p.statut.valide, 18), LIBELLES_VALIDATION[v], { aucune: 'filet fin', ia: 'bordure simple', humain: 'bordure double', ia_humain: 'bordure pleine' }[v])),
    el('h5', {}, 'Nœud · anneau = confiance'),
    el('div', { class: 'v1-legende-grand' }, anneau(), el('div', { class: 'v1-legende-note' }, 'Arc foncé de midi jusqu’à l’estimation (sens horaire, tour complet = 1) ; ici 0,72. Arc clair : intervalle [bas ; haut], ici [0,58 ; 0,86].')),
    el('h5', {}, 'Agrégat · catégorie'),
    el('div', { class: 'v1-legende-grand' }, agregat(), el('div', { class: 'v1-legende-note' }, 'Disque teinté du domaine, aire ∝ n. Couronne : répartition des statuts. Nom écrit sur ou sous le disque, corps ∝ poids.')),
    h.domaines.map((d) => {
      const c = h.categories[d]!
      return ligne(disque(p.domaines[c.domaine % p.domaines.length]!), c.nom)
    }),
    el('h5', {}, 'Liens et lignée'),
    ligne(arete(), 'Prémisse → conclusion'),
    ligne(pastille(p.accent), 'Sélection'),
    ligne(pastille(p.ancetre), 'Ancêtres', 'ce dont le nœud découle'),
    ligne(pastille(p.descendant), 'Descendants', 'ce qui en découle'),
    el('h5', {}, 'Navigation'),
    el('div', { class: 'v1-legende-note' },
      el('kbd', {}, '7'), ' dessus (thématique) · ', el('kbd', {}, '1'), ' face (temps) · ', el('kbd', {}, '3'), ' droite (type) · ',
      el('kbd', {}, '5'), ' ortho/persp · ', el('kbd', {}, '['), ' ', el('kbd', {}, ']'), ' granularité · ', el('kbd', {}, 'Échap'), ' efface la lignée · double-clic : ouvrir un agrégat.'),
  )
}

// ─── Légende de figure ──────────────────────────────────────────────────────

const LECTURE_VUE: Record<string, string> = {
  dessus: 'thématique : proximité = même logique, sessions voisines',
  dessous: 'thématique (vue opposée)',
  face: 'temporelle : date de création en abscisse',
  arriere: 'temporelle (vue opposée)',
  droite: 'par type : couloirs type × origine',
  gauche: 'par type (vue opposée)',
  iso: 'perspective libre',
}

export function monterLegendeFigure(vue: VueGraphe): () => void {
  const corps = el('span', { class: 'v1-figure-corps' })
  const bloc = el('div', { class: 'v1-figure' },
    el('b', { class: 'v1-panel' }, 'a'),
    el('span', { class: 'v1-figure-titre' }, 'Graphe de recherche Atlas. '),
    corps, ' ',
    el('a', { href: '../../index.html', title: 'Retour au catalogue des variantes' }, '← catalogue'),
  )
  vue.interface.appendChild(bloc)
  const nbLiens = vue.h.aretesSource.length
  let attente = 0
  const maj = () => {
    attente = 0
    const nom = vue.camera.vueCourante(1)
    const g = vue.granularite.globale
    let affiches = 0
    for (let u = 0; u < vue.h.nU; u++) if (vue.granularite.alpha[u]! > 0.5) affiches++
    const niveau = NOMS_NIVEAUX[Math.min(3, Math.round(g))]!.toLowerCase()
    corps.textContent =
      `${nom ? `Vue ${LIBELLES_VUES[nom].toLowerCase()} — ${LECTURE_VUE[nom] ?? ''}` : 'Vue libre en perspective'}. ` +
      `Agrégation : ${niveau} (g = ${formaterNombre(Math.round(g * 100) / 100)}) ; ${affiches} éléments ` +
      `pour ${vue.filtres.nbActives} / ${vue.h.nF} nœuds, ${nbLiens} liens.`
  }
  const planifier = () => {
    if (!attente) attente = window.setTimeout(maj, 90)
  }
  for (const evt of ['vue', 'granularite', 'filtres', 'image'] as const) vue.on(evt, planifier)
  maj()
  const appliquerVisibilite = () => (bloc.style.display = vue.reglages.lire<boolean>('legendeFigure') ? '' : 'none')
  vue.on('reglage', ({ cle }) => cle === 'legendeFigure' && appliquerVisibilite())
  appliquerVisibilite()
  return maj
}
