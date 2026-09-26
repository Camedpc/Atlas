// Panneau latéral façon « N-panel » de Blender, mais à gauche : onglets verticaux sur le bord
// (Élément, Vue, Filtres, Outils). Reprend les sections du panneau du moteur (sélection, filtres,
// arbre des catégories) en déplaçant leurs éléments DOM : leurs écouteurs restent actifs.

import {
  el, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_ORIGINE, type PanneauGauche, type VueGraphe, type ValeurReglage,
} from '../../src/core'
import { etat } from './axes'
import { dateIso } from './echelles'
import type { Pilote } from './entete'

export type Onglet = 'element' | 'vue' | 'filtres' | 'outils'
const ONGLETS: [Onglet, string][] = [['element', 'Élément'], ['vue', 'Vue'], ['filtres', 'Filtres'], ['outils', 'Outils']]

export interface NPanel {
  element: HTMLElement
  ouvert: () => boolean
  onglet: () => Onglet
  basculer: (onglet?: string) => void
  detruire: () => void
}

export function construireNPanel(p: Pilote, moteur: PanneauGauche, ouvertInitial: Onglet | null): NPanel {
  const { vue } = p
  const R = vue.reglages
  // Le panneau du moteur reste hors écran : on récupère ses sections.
  moteur.element.remove()
  moteur.bouton.remove()
  const section = (id: string) => moteur.section(id)?.parentElement ?? null

  const corps = new Map<Onglet, HTMLElement>()
  const desabonnements: (() => void)[] = []

  // ── Élément ──
  const transformation = el('div', { class: 'v4-transfo' })
  const majTransfo = () => {
    const u = vue.lignee.selection ?? vue.survol
    if (u === null) {
      transformation.replaceChildren(el('p', { class: 'atlas-vide' }, 'Survolez ou cliquez un symbole : ses coordonnées et leur lecture apparaissent ici.'))
      return
    }
    const x = vue.positions[u * 3]!, y = vue.positions[u * 3 + 1]!, z = vue.positions[u * 3 + 2]!
    const n = vue.h.noeudDe(u)
    const sem = etat.sem
    const lx = n && sem.temps > 0.5 ? dateIso(vue.h.dates[u]!) : sem.temps > 0.5 ? 'agrégat' : 'carte'
    const ly = n && sem.couloirs > 0.5 ? `${LIBELLES_TYPE[n.type]} · ${LIBELLES_ORIGINE[n.origine]}` : sem.couloirs > 0.5 ? 'agrégat' : 'carte'
    const b = n ? p.ech.bandes[p.ech.bandeFeuille[u]!] : p.ech.bandeDe(z)
    const ligne = (axe: string, v: number, lecture: string) =>
      el('div', { class: `v4-transfo-ligne axe-${axe.toLowerCase()}` }, el('span', { class: 'v4-axe' }, axe), el('span', { class: 'v4-mono v4-valeur' }, v.toFixed(3)), el('span', { class: 'v4-lecture' }, lecture))
    transformation.replaceChildren(
      el('div', { class: 'v4-transfo-titre' }, vue.lignee.selection !== null ? 'Sélection' : 'Survol', ' · ', el('b', {}, vue.h.nom(u))),
      ligne('X', x, lx), ligne('Y', y, ly), ligne('Z', z, b ? b.nom : '—'),
      n ? el('div', { class: 'v4-transfo-pied v4-mono' }, `${LIBELLES_STATUT[n.statut]} · ${n.confiance.estimation.toFixed(2)} [${n.confiance.bas.toFixed(2)}, ${n.confiance.haut.toFixed(2)}]`) : '',
    )
  }
  let sigTransfo = ''
  desabonnements.push(vue.on('image', () => {
    const u = vue.lignee.selection ?? vue.survol
    const s = u === null ? '' : `${u}|${vue.positions[u * 3]!.toFixed(3)}|${vue.positions[u * 3 + 2]!.toFixed(3)}|${etat.sem.temps > 0.5}`
    if (s !== sigTransfo) {
      sigTransfo = s
      majTransfo()
    }
  }), vue.on('selection', majTransfo), vue.on('survol', majTransfo))
  majTransfo()
  corps.set('element', el('div', {},
    bloc('Emplacement', transformation),
    section('selection'),
  ))

  // ── Vue ──
  const boutonsVues = el('div', { class: 'v4-grille-vues' },
    ([['dessus', 'Dessus', '7'], ['face', 'Face', '1'], ['droite', 'Droite', '3'], ['iso', 'Iso.', ''], ['dessous', 'Dessous', 'C7'], ['arriere', 'Arrière', 'C1'], ['gauche', 'Gauche', 'C3']] as const).map(([n, t, k]) =>
      el('button', { type: 'button', class: 'atlas-bouton', onclick: () => vue.allerVue(n) }, t, k ? el('kbd', {}, k) : null)),
    el('button', { type: 'button', class: 'atlas-bouton', onclick: () => vue.cadrerTout() }, 'Cadrer', el('kbd', {}, '⌂')),
  )
  const superpositions = el('div', { class: 'v4-cases' },
    caseReglage(vue, 'grille', 'Grilles des faces'),
    caseReglage(vue, 'facesTeintees', 'Faces teintées'),
    caseReglage(vue, 'axesOrigine', "Axes d'origine (sol)"),
    caseReglage(vue, 'secteurs', 'Secteurs thématiques (dessus)'),
    caseReglage(vue, 'graduations', 'Règles graduées'),
    caseReglage(vue, 'regleEcran', "Règles collées au bord de l'écran"),
    caseReglage(vue, 'reticule', 'Réticule de lecture'),
    caseReglage(vue, 'pastillesReticule', 'Valeurs lues sur les axes'),
    caseReglage(vue, 'crochetsAgregat', "Étendue d'un agrégat sur les axes"),
    listeReglage(vue, 'barresErreur', "Barres d'erreur", { verticales: 'verticales', horizontales: 'horizontales', croix: 'croix', aucune: 'aucune' }),
    listeReglage(vue, 'libelles', 'Libellés', { automatiques: 'auto', 'agrégats seulement': 'agregats', aucun: 'aucun' }),
  )
  const legende = el('div', { class: 'v4-legende-conteneur' })
  const majLegende = () => legende.replaceChildren(construireLegende(vue, p))
  desabonnements.push(vue.on('theme', majLegende))
  majLegende()
  corps.set('vue', el('div', {}, bloc('Point de vue', boutonsVues), bloc('Superpositions', superpositions), bloc('Légende', legende)))

  // ── Filtres ──
  corps.set('filtres', el('div', {}, section('filtres'), section('categories')))

  // ── Outils ──
  const regroupement = el('div', { class: 'v4-radios' },
    ...(['categories', 'cases'] as const).map((m) => {
      const r = el('input', { type: 'radio', name: `v4-regroupement-${vue.id}`, value: m, checked: p.regroupement === m })
      r.addEventListener('change', () => r.checked && p.changerRegroupement(m))
      return el('label', {}, r, m === 'categories' ? ' Catégories thématiques' : ' Cases période × type')
    }),
  )
  const niveaux = el('div', { class: 'v4-grille-vues' },
    p.nomsNiveaux.map((n, i) => el('button', { type: 'button', class: 'atlas-bouton', onclick: () => vue.definirGranularite(i) }, n)))
  const copier = el('button', { type: 'button', class: 'atlas-bouton' }, 'Copier la configuration JSON')
  copier.addEventListener('click', () => {
    const texte = R.exporterJSON()
    const retour = (ok: boolean) => {
      copier.textContent = ok ? 'Copiée ✓' : 'Copie impossible (voir console)'
      if (!ok) console.info('[atlas v4] configuration :\n' + texte)
      window.setTimeout(() => (copier.textContent = 'Copier la configuration JSON'), 1500)
    }
    try {
      navigator.clipboard.writeText(texte).then(() => retour(true), () => retour(false))
    } catch {
      retour(false)
    }
  })
  corps.set('outils', el('div', {},
    bloc('Agrégation', el('div', {},
      el('div', { class: 'atlas-groupe-titre' }, 'Regroupement'), regroupement,
      listeReglage(vue, 'pasCases', 'Pas des cases', { mois: 'mois', quinzaine: 'quinzaine', semaine: 'semaine' }),
      listeReglage(vue, 'ordreCases', 'Ordre', { 'période › type': 'periode', 'type › période': 'type' }),
      el('div', { class: 'atlas-groupe-titre' }, 'Granularité globale'), niveaux,
      el('button', { type: 'button', class: 'atlas-lien', onclick: () => { vue.granularite.reinitialiserLocales(); vue.demanderRendu() } }, 'Annuler les ouvertures locales'),
    )),
    bloc('Transitions', el('div', { class: 'v4-cases' },
      caseReglage(vue, 'courbeExpo', 'Courbe « sortie exponentielle »'),
      el('p', { class: 'v4-note' }, 'Durées, trajectoires et toutes les tailles : panneau Réglages (à droite).'),
    )),
    bloc('Configuration', el('div', { class: 'v4-colonne' },
      el('button', { type: 'button', class: 'atlas-bouton', onclick: () => vue.definirTheme(R.valeurs.theme === 'clair' ? 'sombre' : 'clair') }, 'Thème clair / sombre'),
      copier,
      el('button', { type: 'button', class: 'atlas-bouton', onclick: () => R.reinitialiser() }, 'Réinitialiser les réglages'),
    )),
  ))

  // ── Assemblage ──
  const onglets = el('nav', { class: 'v4-onglets', 'aria-label': 'Onglets du panneau' })
  const contenu = el('div', { class: 'v4-npanel-contenu' })
  const boutons = new Map<Onglet, HTMLButtonElement>()
  for (const [id, titre] of ONGLETS) {
    const b = el('button', { type: 'button', class: 'v4-onglet', title: titre }, el('span', {}, titre))
    b.addEventListener('click', () => basculer(id))
    boutons.set(id, b)
    onglets.appendChild(b)
    const c = corps.get(id)!
    c.classList.add('v4-onglet-corps')
    c.dataset.onglet = id
    contenu.appendChild(c)
  }
  const tiroir = el('div', { class: 'v4-tiroir' }, el('div', { class: 'v4-tiroir-entete' }, el('span', { class: 'v4-tiroir-titre' }), el('button', { type: 'button', class: 'v4-fermer', title: 'Fermer', onclick: () => basculer() }, '×')), contenu)
  const element = el('aside', { class: 'v4-npanel' }, onglets, tiroir)
  vue.interface.appendChild(element)

  let actif: Onglet = ouvertInitial ?? 'element'
  let ouvert = false
  function appliquer(): void {
    element.classList.toggle('ouvert', ouvert)
    vue.racine.classList.toggle('v4-npanel-ouvert', ouvert)
    boutons.forEach((b, id) => b.classList.toggle('actif', ouvert && id === actif))
    corps.forEach((c, id) => (c.hidden = id !== actif))
    tiroir.querySelector('.v4-tiroir-titre')!.textContent = ONGLETS.find(([id]) => id === actif)![1]
    etat.marges.gauche = (ouvert ? 34 + 316 : 34) + 12
    vue.demanderRendu()
  }
  function basculer(onglet?: string): void {
    const o = (ONGLETS.some(([id]) => id === onglet) ? onglet : undefined) as Onglet | undefined
    if (o && (!ouvert || o !== actif)) {
      actif = o
      ouvert = true
    } else ouvert = !ouvert
    appliquer()
  }
  if (ouvertInitial) ouvert = true
  appliquer()
  return { element, ouvert: () => ouvert, onglet: () => actif, basculer, detruire: () => desabonnements.forEach((f) => f()) }
}

// ─── Aides de construction ──────────────────────────────────────────────────

function bloc(titre: string, contenu: HTMLElement): HTMLElement {
  const d = el('details', { class: 'atlas-section v4-bloc' }, el('summary', {}, titre), el('div', { class: 'atlas-section-corps' }, contenu))
  d.open = true
  return d
}

function caseReglage(vue: VueGraphe, cle: string, libelle: string): HTMLElement {
  const c = el('input', { type: 'checkbox', checked: vue.reglages.lire<boolean>(cle) })
  c.addEventListener('change', () => vue.reglages.definir(cle, c.checked))
  vue.on('reglage', (e) => e.cle === cle && (c.checked = e.valeur as boolean))
  return el('label', { class: 'v4-case' }, c, ` ${libelle}`)
}

function listeReglage(vue: VueGraphe, cle: string, libelle: string, options: Record<string, ValeurReglage>): HTMLElement {
  const s = el('select', { class: 'v4-select' }, Object.entries(options).map(([t, v]) => el('option', { value: String(v) }, t)))
  s.value = String(vue.reglages.lire(cle))
  s.addEventListener('change', () => vue.reglages.definir(cle, s.value))
  vue.on('reglage', (e) => e.cle === cle && (s.value = String(e.valeur)))
  return el('label', { class: 'v4-ligne-select' }, el('span', {}, libelle), s)
}

function svg(contenu: string, taille = 18): HTMLElement {
  const s = el('span', { class: 'v4-icone-legende' })
  s.innerHTML = `<svg width="${taille}" height="${taille}" viewBox="-10 -10 20 20">${contenu}</svg>`
  return s
}

function construireLegende(vue: VueGraphe, p: Pilote): HTMLElement {
  const pal = vue.palette
  const [v, i, r] = [pal.statut.valide, pal.statut.incertain, pal.statut.refute]
  const ligne = (icone: HTMLElement, texte: string, detail?: string) =>
    el('div', { class: 'v4-legende-ligne' }, icone, el('span', {}, texte, detail ? el('small', {}, detail) : null))
  const agregat = p.regroupement === 'cases'
    ? `<rect x="-6" y="-6" width="12" height="12" fill="${pal.domaines[0]}" fill-opacity=".16" stroke="${pal.domaines[0]}" stroke-width="1.4"/><circle r="1.3" fill="${pal.domaines[0]}"/>`
    : `<circle r="6.5" fill="${pal.domaines[0]}" fill-opacity=".16" stroke="${pal.domaines[0]}" stroke-width="1.3"/><circle r="1.3" fill="${pal.domaines[0]}"/>`
  return el('div', { class: 'v4-legende' },
    el('div', { class: 'atlas-groupe-titre' }, 'Statut = forme'),
    ligne(svg(`<circle r="5.5" fill="${v}"/>`), LIBELLES_STATUT.valide),
    ligne(svg(`<circle r="5.5" fill="${i}" fill-opacity=".16"/><circle r="4.7" fill="none" stroke="${i}" stroke-width="1.6"/><path d="M0,-3.8 A3.8,3.8 0 0,0 0,3.8 Z" fill="${i}"/>`), LIBELLES_STATUT.incertain),
    ligne(svg(`<path d="M-4.5,-4.5 L4.5,4.5 M4.5,-4.5 L-4.5,4.5" stroke="${r}" stroke-width="2.8"/>`), LIBELLES_STATUT.refute),
    ligne(svg(agregat), p.regroupement === 'cases' ? 'Case (période × type)' : 'Agrégat (catégorie)', 'taille ∝ √n · couleur = groupe'),
    el('div', { class: 'atlas-groupe-titre' }, 'Validation = indicateurs'),
    ligne(svg(`<circle r="4" fill="${pal.texteDoux}"/><circle cx="-5.5" cy="-5.5" r="2" fill="none" stroke="${pal.validation.ia}" stroke-width="1.2"/>`), 'IA', 'point creux au nord-ouest'),
    ligne(svg(`<circle r="4" fill="${pal.texteDoux}"/><circle cx="5.5" cy="-5.5" r="2.2" fill="${pal.validation.humain}"/>`), 'Humain', 'point plein au nord-est'),
    ligne(svg(`<circle r="4" fill="${pal.texteDoux}"/><circle cx="-5.5" cy="-5.5" r="2" fill="none" stroke="${pal.validation.ia}" stroke-width="1.2"/><circle cx="5.5" cy="-5.5" r="2.2" fill="${pal.validation.humain}"/>`), 'IA + humain'),
    ligne(svg(`<circle r="4" fill="${pal.texteDoux}"/>`), 'Aucune validation'),
    el('div', { class: 'atlas-groupe-titre' }, 'Intervalle de confiance'),
    ligne(svg(`<path d="M0,-8 L0,6 M-3,-8 L3,-8 M-3,6 L3,6" stroke="${v}" stroke-width="1.3"/><circle r="3" fill="${v}"/>`), "Barre d'erreur", 'du bas au haut de l’intervalle ; symbole = estimation'),
    el('div', { class: 'atlas-groupe-titre' }, 'Axes'),
    ligne(svg(`<path d="M-8,0 L8,0" stroke="${pal.axes[0]}" stroke-width="2"/>`), 'X · date de création', 'vue de face (1)'),
    ligne(svg(`<path d="M-8,0 L8,0" stroke="${pal.axes[1]}" stroke-width="2"/>`), 'Y · couloirs type × origine', 'vue de droite (3)'),
    ligne(svg(`<path d="M0,-8 L0,8" stroke="${pal.axes[2]}" stroke-width="2"/>`), 'Z · bandes thématiques', 'domaine › thème › sous-thème'),
    el('div', { class: 'atlas-groupe-titre' }, 'Lignée'),
    ligne(svg(`<circle r="5" fill="none" stroke="${pal.accent}" stroke-width="2"/>`), 'Sélection'),
    ligne(svg(`<circle r="5" fill="none" stroke="${pal.ancetre}" stroke-width="2"/>`), 'Ancêtres', 'ce dont le nœud découle'),
    ligne(svg(`<circle r="5" fill="none" stroke="${pal.descendant}" stroke-width="2"/>`), 'Descendants', 'ce qui en découle'),
  )
}
