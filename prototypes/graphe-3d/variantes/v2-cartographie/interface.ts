// Interface de la variante V2 : rail d'icônes (panneau en surimpression par onglet), fiche de
// survol compacte façon info-bulle de carte, sections Couches / Recherche / légende de la carte.

import {
  barreConfiance, barreStatuts, el, formaterDate, formaterDateCourte, formaterNombre, normaliserTexte, statistiquesCategorie,
  LIBELLES_ORIGINE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, NOMS_NIVEAUX, VALIDATIONS,
  type PanneauGauche, type Validation, type VueGraphe,
} from '../../src/core'
import type { Carte } from './carte'
import type { ModeZoom, ZoomSemantique } from './zoom'

// ─── Pictogrammes ────────────────────────────────────────────────────────────

const svg = (corps: string, taille = 20) =>
  `<svg viewBox="0 0 20 20" width="${taille}" height="${taille}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corps}</svg>`

const ICONES = {
  menu: svg('<path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"/>'),
  filtres: svg('<path d="M3 4.5h14l-5.3 6.2v4.6l-3.4 1.7v-6.3z"/>'),
  couches: svg('<path d="M10 3 2.8 6.8 10 10.6l7.2-3.8z"/><path d="m2.8 10.2 7.2 3.8 7.2-3.8"/><path d="m2.8 13.6 7.2 3.8 7.2-3.8"/>'),
  recherche: svg('<circle cx="8.6" cy="8.6" r="5.1"/><path d="m12.4 12.4 4.6 4.6"/>'),
  selection: svg('<path d="M10 17.5s-5.2-5-5.2-9a5.2 5.2 0 0 1 10.4 0c0 4-5.2 9-5.2 9z"/><circle cx="10" cy="8.4" r="1.9"/>'),
  theme: svg('<circle cx="10" cy="10" r="6.3"/><path d="M10 3.7a6.3 6.3 0 0 1 0 12.6z" fill="currentColor"/>'),
  retour: svg('<path d="M12 4.5 6.5 10l5.5 5.5"/>'),
  fermer: svg('<path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/>', 16),
}

/** Pictogrammes de validation (IA : puce ; humain : silhouette). */
const PICTO_IA = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3.6" y="3.6" width="8.8" height="8.8" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.2 1.6v2M9.8 1.6v2M6.2 12.4v2M9.8 12.4v2M1.6 6.2h2M1.6 9.8h2M12.4 6.2h2M12.4 9.8h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="8" cy="8" r="1.7" fill="currentColor"/></svg>'
const PICTO_HUMAIN = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="4.9" r="2.7" fill="currentColor"/><path d="M2.8 14.4c0-3.1 2.3-5.3 5.2-5.3s5.2 2.2 5.2 5.3z" fill="currentColor"/></svg>'
const PICTO_AUCUNE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 2"/></svg>'

function icone(html: string, classe = ''): HTMLElement {
  const s = el('span', { class: `v2-icone ${classe}` })
  s.innerHTML = html
  return s
}

/** Pictogramme(s) de validation : aucune / IA / humain / IA + humain. */
export function pictoValidation(v: Validation, vue: VueGraphe): HTMLElement {
  const conteneur = el('span', { class: `v2-picto v2-picto-${v}`, title: `Validé par : ${LIBELLES_VALIDATION[v]}`, style: `color:${vue.palette.validation[v]}` })
  if (v === 'aucune') conteneur.append(icone(PICTO_AUCUNE))
  if (v === 'ia' || v === 'ia_humain') conteneur.append(icone(PICTO_IA))
  if (v === 'humain' || v === 'ia_humain') conteneur.append(icone(PICTO_HUMAIN))
  return conteneur
}

// ─── Fiche de survol ─────────────────────────────────────────────────────────

export function creerRenduFiche(carte: () => Carte | undefined) {
  return (u: number, vue: VueGraphe): HTMLElement => {
    const { h, palette } = vue
    const n = h.noeudDe(u)
    if (n) {
      const coul = palette.statut[n.statut]
      const k = n.confiance
      return el('div', { class: 'v2-fiche', style: `--v2-lisere:${coul}` },
        el('div', { class: 'v2-fiche-chemin' }, n.categorie.join('  ›  ')),
        el('div', { class: 'v2-fiche-titre' }, n.nom),
        el('div', { class: 'v2-fiche-meta' }, `${LIBELLES_TYPE[n.type]} · ${LIBELLES_ORIGINE[n.origine]} · ${formaterDate(h.dates[u]!)}`),
        el('div', { class: 'v2-fiche-confiance' },
          el('span', { class: 'v2-statut', style: `--c:${coul}` }, LIBELLES_STATUT[n.statut]),
          pictoValidation(n.validation, vue),
          el('span', { class: 'v2-fiche-valid' }, LIBELLES_VALIDATION[n.validation]),
        ),
        barreConfiance(k.bas, k.estimation, k.haut, coul),
        el('div', { class: 'v2-fiche-pied' },
          `${h.premisses[u]!.length} prémisse(s) · ${h.importance[u]} descendant(s) · incertitude ±${formaterNombre((k.haut - k.bas) / 2)}`),
      )
    }
    const c = h.categorieDe(u)!
    const s = statistiquesCategorie(h, c.index, vue.filtres.actives)
    const teinte = carte()?.teintesTexte[c.index] ?? palette.texte
    const lisere = carte()?.teintes[c.index] ?? palette.accent
    const niveau = NOMS_NIVEAUX[c.niveau].replace(/s$/, '')
    return el('div', { class: 'v2-fiche agregat', style: `--v2-lisere:${lisere}` },
      el('div', { class: 'v2-fiche-chemin' }, [niveau, ...c.chemin.slice(0, -1)].join('  ›  ')),
      el('div', { class: 'v2-fiche-toponyme', style: `color:${teinte}` }, c.nom),
      el('div', { class: 'v2-fiche-meta' },
        el('strong', {}, String(s.nbActives)), ` nœud(s)${s.nbActives !== s.nb ? ` sur ${s.nb}` : ''}`,
        s.nbActives ? ` · ${formaterDateCourte(s.dateMin)} → ${formaterDate(s.dateMax)}` : ''),
      s.nbActives ? barreStatuts(vue, s.statuts) : null,
      s.nbActives
        ? el('div', { class: 'v2-fiche-validations' },
            VALIDATIONS.map((v) => el('span', { class: 'v2-fiche-validation' }, pictoValidation(v, vue), String(s.validations[v]))),
            el('span', { class: 'v2-fiche-moy' }, `confiance moy. ${formaterNombre(s.confianceMoyenne)}`),
          )
        : null,
      s.principales.length
        ? el('ol', { class: 'v2-fiche-principaux' }, s.principales.slice(0, 3).map((f) => el('li', {}, h.noeuds[f]!.nom)))
        : null,
      el('div', { class: 'v2-fiche-aide' }, 'Double-clic : ouvrir · Alt + double-clic : replier'),
    )
  }
}

// ─── Rail d'icônes ───────────────────────────────────────────────────────────

type Onglet = 'filtres' | 'couches' | 'recherche' | 'selection'
const ONGLETS: { id: Onglet; titre: string; court: string; touche?: string }[] = [
  { id: 'filtres', titre: 'Filtres', court: 'Filtres' },
  { id: 'couches', titre: 'Couches et légende', court: 'Couches' },
  { id: 'recherche', titre: 'Recherche', court: 'Chercher', touche: '/' },
  { id: 'selection', titre: 'Sélection', court: 'Sélection' },
]

export class Rail {
  readonly element: HTMLElement
  private boutons = new Map<Onglet, HTMLButtonElement>()
  private onglet: Onglet = 'filtres'
  private titre: HTMLElement

  constructor(vue: VueGraphe, private panneau: PanneauGauche, private surOnglet: (o: Onglet) => void) {
    const menu = el('button', { class: 'v2-rail-bouton v2-rail-menu', type: 'button', title: 'Panneau (filtres, couches, recherche, sélection)', 'aria-label': 'Ouvrir le panneau' })
    menu.append(icone(ICONES.menu))
    menu.addEventListener('click', () => this.basculer())
    const boutons = ONGLETS.map((o) => {
      const b = el('button', { class: 'v2-rail-bouton', type: 'button', title: o.touche ? `${o.titre} (${o.touche})` : o.titre, 'data-onglet': o.id })
      b.append(icone(ICONES[o.id]), el('span', { class: 'v2-rail-libelle' }, o.court))
      b.addEventListener('click', () => (this.panneau.ouvert && this.onglet === o.id ? this.fermer() : this.ouvrir(o.id)))
      this.boutons.set(o.id, b)
      return b
    })
    const theme = el('button', { class: 'v2-rail-bouton', type: 'button', title: 'Thème clair / sombre' })
    theme.append(icone(ICONES.theme), el('span', { class: 'v2-rail-libelle' }, 'Thème'))
    theme.addEventListener('click', () => vue.definirTheme(vue.reglages.valeurs.theme === 'clair' ? 'sombre' : 'clair'))
    const retour = el('a', { class: 'v2-rail-bouton', href: '../../index.html', title: 'Retour au catalogue' })
    retour.append(icone(ICONES.retour), el('span', { class: 'v2-rail-libelle' }, 'Catalogue'))
    this.element = el('nav', { class: 'v2-rail', 'aria-label': 'Outils de la carte' },
      menu, el('div', { class: 'v2-rail-sep' }), boutons, el('div', { class: 'v2-rail-espace' }), theme, retour)
    vue.interface.appendChild(this.element)

    // En-tête du panneau : titre de l'onglet + bouton fermer.
    const entete = panneau.element.querySelector('.atlas-panneau-entete')!
    this.titre = entete.querySelector('strong')!
    const fermer = el('button', { class: 'v2-panneau-fermer', type: 'button', title: 'Fermer (Échap)', 'aria-label': 'Fermer le panneau' })
    fermer.append(icone(ICONES.fermer))
    fermer.addEventListener('click', () => this.fermer())
    entete.appendChild(fermer)

    vue.on('selection', ({ unite }) => this.boutons.get('selection')!.classList.toggle('pastille', unite !== null))
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.key === '/') {
        e.preventDefault()
        this.ouvrir('recherche')
      }
    })
    this.appliquer()
  }

  ouvrir(o: Onglet): void {
    this.onglet = o
    this.panneau.basculer(true)
    this.appliquer()
    this.surOnglet(o)
  }

  fermer(): void {
    this.panneau.basculer(false)
    this.appliquer()
  }

  basculer(): void {
    if (this.panneau.ouvert) this.fermer()
    else this.ouvrir(this.onglet)
  }

  private appliquer(): void {
    const ouvert = this.panneau.ouvert
    this.panneau.element.dataset.onglet = this.onglet
    this.titre.textContent = ONGLETS.find((x) => x.id === this.onglet)!.titre
    this.boutons.forEach((b, id) => b.classList.toggle('actif', ouvert && id === this.onglet))
    this.element.classList.toggle('ouvert', ouvert)
  }
}

// ─── Section « Couches » ─────────────────────────────────────────────────────

export function sectionCouches(vue: VueGraphe, zoom: ZoomSemantique): HTMLElement {
  const majs: (() => void)[] = []
  const interrupteur = (cle: string, libelle: string, aide?: string) => {
    const c = el('input', { type: 'checkbox', class: 'v2-interrupteur' })
    c.addEventListener('change', () => vue.reglages.definir(cle, c.checked))
    majs.push(() => (c.checked = vue.reglages.lire<boolean>(cle)))
    return el('label', { class: 'v2-couche', title: aide ?? '' }, c, el('span', {}, libelle))
  }
  const modes: [ModeZoom, string][] = [['paliers', 'Automatique'], ['continu', 'Continu'], ['manuel', 'Manuel']]
  const boutonsMode = modes.map(([m, t]) => {
    const b = el('button', { type: 'button', class: 'v2-segment' }, t)
    b.addEventListener('click', () => zoom.definirMode(m))
    majs.push(() => b.classList.toggle('actif', zoom.mode === m))
    return b
  })
  const themes = (['clair', 'sombre'] as const).map((t) => {
    const b = el('button', { type: 'button', class: 'v2-segment' }, t === 'clair' ? 'Clair' : 'Sombre')
    b.addEventListener('click', () => vue.definirTheme(t))
    majs.push(() => b.classList.toggle('actif', vue.reglages.valeurs.theme === t))
    return b
  })
  const corps = el('div', { class: 'v2-couches' },
    el('div', { class: 'atlas-groupe-titre' }, 'Zoom sémantique'),
    el('div', { class: 'v2-segments' }, boutonsMode),
    el('p', { class: 'v2-aide' }, 'Automatique : loin = domaines, près = nœuds (paliers avec hystérésis). Continu : zoomer fait défiler la transition. Manuel : curseur de granularité.'),
    el('div', { class: 'atlas-groupe-titre' }, 'Couches de la carte'),
    interrupteur('territoires', 'Territoires', 'Zones de densité teintées par catégorie'),
    interrupteur('courbes', 'Courbes de niveau', 'Isolignes de densité de nœuds'),
    interrupteur('toponymes', 'Toponymes', 'Noms des domaines, thèmes et sous-thèmes'),
    interrupteur('halo', 'Halo de confiance', 'Rayon = largeur de l’intervalle, couleur = statut'),
    interrupteur('graticule', 'Quadrillage'),
    interrupteur('cadre', 'Cadre de feuille'),
    interrupteur('miniCarte', 'Mini-carte'),
    el('div', { class: 'atlas-groupe-titre' }, 'Thème'),
    el('div', { class: 'v2-segments' }, themes),
  )
  const maj = () => majs.forEach((f) => f())
  vue.on('reglage', maj)
  vue.on('theme', maj)
  maj()
  return corps
}

/** Légende propre à la carte (encodages de la variante). */
export function legendeCarte(vue: VueGraphe): HTMLElement {
  const p = vue.palette
  const trait = (dash: string, larg = 1.4) =>
    `<svg width="34" height="12" aria-hidden="true"><path d="M2 6h30" stroke="${p.texte}" stroke-opacity=".7" stroke-width="${larg}" stroke-dasharray="${dash}" stroke-linecap="round"/></svg>`
  const halo = (r: number, c: string) =>
    `<svg width="34" height="26" aria-hidden="true"><defs><radialGradient id="h${r}${c.replace('#', '')}"><stop offset="0" stop-color="${c}" stop-opacity=".8"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><circle cx="17" cy="13" r="${r}" fill="url(#h${r}${c.replace('#', '')})"/><circle cx="17" cy="13" r="3.6" fill="${c}" stroke="${p.bordureNoeud}" stroke-width="1"/></svg>`
  const ligne = (visuel: string | HTMLElement, texte: string) => {
    const v = typeof visuel === 'string' ? icone(visuel, 'v2-legende-visuel') : visuel
    return el('div', { class: 'v2-legende-ligne' }, v, el('span', {}, texte))
  }
  return el('div', { class: 'v2-legende' },
    el('div', { class: 'atlas-groupe-titre' }, 'Territoires'),
    ligne(trait('', 1.8), 'Côte de domaine'),
    ligne(trait('6 3.5'), 'Frontière de thème'),
    ligne(trait('0.1 3.2', 2), 'Limite de sous-thème'),
    ligne(trait('', 0.7), 'Courbe de niveau (densité)'),
    el('div', { class: 'atlas-groupe-titre' }, 'Confiance'),
    ligne(halo(6, p.statut.valide), 'Intervalle étroit : halo net'),
    ligne(halo(12, p.statut.incertain), 'Intervalle large : halo diffus'),
    el('div', { class: 'v2-legende-ligne' }, el('span', { class: 'v2-legende-pictos' }, VALIDATIONS.map((v) => pictoValidation(v, vue))), el('span', {}, 'Validation : aucune · IA · humain · IA + humain')),
    el('div', { class: 'atlas-groupe-titre' }, 'Agrégats'),
    ligne(`<svg width="34" height="22" aria-hidden="true"><circle cx="17" cy="11" r="7" fill="${p.fond}" stroke="${p.domaines[0]}" stroke-width="3"/></svg>`, 'Agrégat : anneau teinté, taille ∝ √n'),
  )
}

// ─── Section « Recherche » ───────────────────────────────────────────────────

export function sectionRecherche(vue: VueGraphe, carte: () => Carte | undefined, allerA: (u: number) => void): { corps: HTMLElement; focus: () => void } {
  const { h } = vue
  const noms = Array.from({ length: h.nU }, (_, u) => normaliserTexte(h.nom(u)))
  const champ = el('input', { type: 'search', class: 'atlas-recherche', placeholder: 'Un lieu (thème…) ou un nœud', 'aria-label': 'Rechercher' })
  const resultats = el('div', { class: 'v2-resultats' })
  const filtrer = el('button', { class: 'atlas-lien', type: 'button' }, 'Filtrer le graphe avec ce texte')
  filtrer.addEventListener('click', () => vue.filtres.modifier({ texte: champ.value }))
  let premier: number | null = null
  const maj = () => {
    const q = normaliserTexte(champ.value.trim())
    premier = null
    if (q.length < 2) {
      resultats.replaceChildren(el('p', { class: 'atlas-vide' }, 'Tapez au moins deux lettres. Entrée : aller au premier résultat.'))
      return
    }
    const lieux: number[] = [], noeuds: number[] = []
    for (let u = h.nF; u < h.nU && lieux.length < 8; u++) if (noms[u]!.includes(q)) lieux.push(u)
    const debut: number[] = [], milieu: number[] = []
    for (let f = 0; f < h.nF; f++) {
      const i = noms[f]!.indexOf(q)
      if (i === 0) debut.push(f)
      else if (i > 0) milieu.push(f)
    }
    noeuds.push(...debut, ...milieu)
    const ligne = (u: number) => {
      const n = h.noeudDe(u)
      const c = h.categorieDe(u)
      const couleur = n ? vue.palette.statut[n.statut] : carte()?.teintes[c!.index] ?? vue.palette.accent
      const b = el('button', { type: 'button', class: `v2-resultat ${n ? '' : 'lieu'}` },
        el('i', { class: 'atlas-pastille', style: `background:${couleur}` }),
        el('span', { class: 'v2-resultat-nom' }, n ? n.nom : c!.nom),
        el('span', { class: 'v2-resultat-chemin' }, n ? n.categorie.slice(1).join(' › ') : NOMS_NIVEAUX[c!.niveau].replace(/s$/, '')),
      )
      b.addEventListener('click', () => allerA(u))
      return b
    }
    premier = lieux[0] ?? noeuds[0] ?? null
    resultats.replaceChildren(el('div', {},
      lieux.length ? el('div', { class: 'atlas-groupe-titre' }, 'Lieux') : null,
      lieux.map(ligne),
      noeuds.length ? el('div', { class: 'atlas-groupe-titre' }, `Nœuds (${noeuds.length})`) : null,
      noeuds.slice(0, 40).map(ligne),
      !lieux.length && !noeuds.length ? el('p', { class: 'atlas-vide' }, 'Aucun résultat.') : null,
    ))
  }
  let minuterie = 0
  champ.addEventListener('input', () => {
    clearTimeout(minuterie)
    minuterie = window.setTimeout(maj, 90)
  })
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && premier !== null) allerA(premier)
  })
  maj()
  return { corps: el('div', { class: 'v2-recherche' }, champ, filtrer, resultats), focus: () => champ.focus() }
}
