// Panneau gauche « application » : il porte le reste d'Atlas autour du graphe.
//
//   Graphe    aperçu de la vue, filtres et arbre des catégories (ceux du moteur, déplacés ici), légende
//   Nœud      nœud sélectionné : énoncé, confiance, lignée, démonstrations, journal, liens
//   Activité  sessions et agents (MAQUETTE) : qui travaille où, verrous de zone, conflits en attente
//   Réglages  options d'usage (thème, panneau, zoom sémantique, lentille, palette…) ; Tweakpane pour le détail
//
// Ouverture / fermeture : bouton ☰ en haut à gauche ou touche N (comme le N-panel de Blender).
// Deux modes : « pousse » (la scène rétrécit, le graphe se recentre) ou « surimpression ».
// État (ouvert, onglet) mémorisé dans localStorage, toujours dans un try/catch.

import {
  el, formaterDate, formaterDateCourte, formaterNombre, statistiquesCategorie, hacher,
  LIBELLES_ORIGINE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, LIBELLES_VALIDITE, LIBELLES_VUES, NOMS_NIVEAUX, STATUTS, VALIDATIONS,
  type PanneauGauche, type Statut, type VueGraphe,
} from '../../src/core'
import type { Activite } from './activite'
import { barreStatuts, echelleConfiance, glypheValidation, svg } from './fiche'
import { lire } from './reglages'

const ONGLETS = [
  ['graphe', 'Graphe'],
  ['noeud', 'Nœud'],
  ['activite', 'Activité'],
  ['reglages', 'Réglages'],
] as const
export type Onglet = (typeof ONGLETS)[number][0]

const CLE = 'atlas-graphe3d:v7-synthese:panneau'
const MIN = 60_000

function lireEtat(): { ouvert: boolean; onglet: Onglet } {
  try {
    const brut = localStorage.getItem(CLE)
    if (brut) return { ouvert: false, onglet: 'graphe', ...(JSON.parse(brut) as object) }
  } catch {
    // stockage indisponible
  }
  return { ouvert: false, onglet: 'graphe' }
}

function ecrireEtat(e: { ouvert: boolean; onglet: Onglet }): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(e))
  } catch {
    // ignoré
  }
}

const ilYA = (ms: number) => (ms < 60 * MIN ? `il y a ${Math.round(ms / MIN)} min` : `il y a ${Math.round(ms / (60 * MIN))} h`)

export interface ActionsPanneau {
  allerNoeud(f: number): void
  allerCategorie(c: number): void
  basculerReglagesAvances(): void
  ouvrirPalette(): void
}

export class PanneauApplication {
  readonly element: HTMLElement
  private etat = lireEtat()
  private boutons = new Map<Onglet, HTMLButtonElement>()
  private pages = new Map<Onglet, HTMLElement>()
  private corpsNoeud = el('div', { class: 'v7-noeud' })
  private apercu = el('div', { class: 'v7-apercu' })
  private majReglages: (() => void)[] = []
  private ecouteursOuverture = new Set<(ouvert: boolean) => void>()

  constructor(
    aside: HTMLElement,
    private bouton: HTMLButtonElement,
    private vue: VueGraphe,
    moteur: PanneauGauche,
    private activite: Activite,
    private actions: ActionsPanneau,
  ) {
    this.element = aside
    const nav = el('nav', { class: 'v7-onglets', role: 'tablist' }, ONGLETS.map(([id, titre]) => {
      const b = el('button', { type: 'button', role: 'tab', 'data-onglet': id }, titre, el('i', { class: 'v7-pastille-onglet' }))
      b.addEventListener('click', () => this.choisir(id))
      this.boutons.set(id, b)
      return b
    }))
    for (const [id] of ONGLETS) this.pages.set(id, el('section', { class: 'v7-page', 'data-page': id, role: 'tabpanel' }))
    const interieur = el('div', { class: 'v7-panneau-interieur' },
      el('header', { class: 'v7-panneau-entete' },
        el('div', { class: 'v7-marque' }, 'Atlas', el('span', {}, 'graphe de recherche')),
        el('button', { class: 'v7-bouton-icone', type: 'button', title: 'Palette de commandes (Ctrl + K)', onclick: () => this.actions.ouvrirPalette() }, '⌕')),
      nav,
      el('div', { class: 'v7-panneau-corps' }, [...this.pages.values()]),
      el('footer', { class: 'v7-panneau-pied' },
        el('span', {}, el('kbd', {}, 'N'), ' panneau'),
        el('span', {}, el('kbd', {}, 'Ctrl'), el('kbd', {}, 'K'), ' commandes'),
        el('a', { href: '../../index.html' }, '← catalogue')),
    )
    aside.append(interieur)

    this.construireGraphe(moteur)
    this.pages.get('noeud')!.append(this.corpsNoeud)
    this.construireActivite()
    this.construireReglages()

    bouton.addEventListener('click', () => this.basculer())
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (e.code === 'KeyN' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        this.basculer()
      }
    })
    vue.on('selection', ({ unite }) => {
      this.majNoeud()
      if (unite === null) return
      if (this.ouvert) this.choisir('noeud')
      else {
        this.boutons.get('noeud')!.classList.add('signal')
        bouton.classList.add('signal')
      }
    })
    vue.on('filtres', () => this.majApercu())
    vue.on('granularite', () => this.majApercu())
    vue.on('vue', () => this.majApercu())
    vue.on('theme', () => this.majNoeud())
    vue.on('reglage', ({ cle }) => {
      if (cle === 'modePanneau') this.appliquerMode()
      for (const f of this.majReglages) f()
    })
    this.appliquerMode()
    this.choisir(this.etat.onglet)
    this.basculer(this.etat.ouvert, false)
    this.majNoeud()
    this.majApercu()
  }

  get ouvert(): boolean {
    return document.body.classList.contains('panneau-ouvert')
  }

  get onglet(): Onglet {
    return this.etat.onglet
  }

  quandChange(f: (ouvert: boolean) => void): void {
    this.ecouteursOuverture.add(f)
  }

  basculer(ouvrir = !this.ouvert, anime = true): void {
    this.etat.ouvert = ouvrir
    document.body.classList.toggle('sans-transition', !anime)
    document.body.classList.toggle('panneau-ouvert', ouvrir)
    this.bouton.setAttribute('aria-label', ouvrir ? 'Fermer le panneau' : 'Ouvrir le panneau')
    this.bouton.classList.toggle('actif', ouvrir)
    if (ouvrir && this.boutons.get(this.etat.onglet)!.classList.contains('signal')) this.boutons.get(this.etat.onglet)!.classList.remove('signal')
    if (ouvrir && this.vue.lignee.selection !== null && this.boutons.get('noeud')!.classList.contains('signal')) this.choisir('noeud')
    if (ouvrir) this.bouton.classList.remove('signal')
    ecrireEtat(this.etat)
    if (!anime) requestAnimationFrame(() => document.body.classList.remove('sans-transition'))
    for (const f of this.ecouteursOuverture) f(ouvrir)
    this.vue.demanderRendu()
  }

  choisir(id: Onglet): void {
    this.etat.onglet = id
    this.element.dataset.onglet = id
    this.boutons.forEach((b, k) => {
      b.classList.toggle('actif', k === id)
      b.setAttribute('aria-selected', String(k === id))
      if (k === id) b.classList.remove('signal')
    })
    ecrireEtat(this.etat)
    for (const f of this.ecouteursOuverture) f(this.ouvert)
    this.vue.demanderRendu()
  }

  private appliquerMode(): void {
    const mode = lire<string>(this.vue, 'modePanneau')
    document.body.dataset.panneau = mode
  }

  // ─── Graphe ──────────────────────────────────────────────────────────────

  private construireGraphe(moteur: PanneauGauche): void {
    const page = this.pages.get('graphe')!
    const sections = moteur.element.querySelectorAll<HTMLDetailsElement>('details.atlas-section')
    const filtres = [...sections].find((d) => d.dataset.id === 'filtres')
    const categories = [...sections].find((d) => d.dataset.id === 'categories')
    const legende = el('details', { class: 'atlas-section v7-section', open: true }, el('summary', {}, 'Légende'), el('div', { class: 'atlas-section-corps' }, this.legende()))
    page.append(this.apercu)
    if (filtres) {
      filtres.open = true
      page.append(filtres)
    }
    page.append(legende)
    if (categories) {
      categories.open = false
      page.append(categories)
    }
    this.vue.on('theme', () => legende.querySelector('.atlas-section-corps')!.replaceChildren(this.legende()))
  }

  private majApercu(): void {
    const v = this.vue
    const g = v.granularite.globale
    const n = Math.round(g)
    const niveau = Math.abs(g - n) < 0.02 ? NOMS_NIVEAUX[n] : `${NOMS_NIVEAUX[Math.floor(g)]} → ${NOMS_NIVEAUX[Math.min(3, Math.floor(g) + 1)]}`
    const vc = v.camera.vueCourante(1)
    const statuts: Record<Statut, number> = { valide: 0, incertain: 0, refute: 0 }
    for (let f = 0; f < v.h.nF; f++) if (v.filtres.actives[f]) statuts[v.h.noeuds[f]!.statut]++
    this.apercu.replaceChildren(
      el('div', { class: 'v7-apercu-ligne' },
        el('span', {}, el('b', {}, formaterNombre(v.filtres.nbActives)), ` / ${formaterNombre(v.h.nF)} nœuds`),
        el('span', { class: 'v7-doux' }, `${vc ? LIBELLES_VUES[vc] : 'vue libre'} · ${v.mode.toUpperCase()} · ${niveau}`)),
      barreStatuts(v, statuts, 300),
    )
  }

  private legende(): HTMLElement {
    const p = this.vue.palette
    const ligne = (glyphe: Element, texte: string, detail?: string) =>
      el('div', { class: 'v7-legende-ligne' }, glyphe, el('span', {}, texte, detail ? el('small', {}, ` ${detail}`) : null))
    const disque = (c: string, bord = p.texte, w = 1) => svg('svg', { width: 22, height: 18, viewBox: '0 0 22 18' }, svg('circle', { cx: 11, cy: 9, r: 5, fill: c, stroke: bord, 'stroke-width': w }))
    const anneau = svg('svg', { width: 22, height: 18, viewBox: '0 0 22 18' },
      svg('circle', { cx: 11, cy: 9, r: 4, fill: p.statut.valide }),
      svg('circle', { cx: 11, cy: 9, r: 7, fill: 'none', stroke: p.texteDoux, 'stroke-width': 0.5, opacity: 0.5 }),
      svg('path', { d: describeArc(11, 9, 7, 0.62, 0.9), fill: 'none', stroke: p.statut.valide, 'stroke-width': 2.4, opacity: 0.45 }),
      svg('path', { d: describeArc(11, 9, 7, 0, 0.78), fill: 'none', stroke: p.texte, 'stroke-width': 1.1 }))
    const agr = svg('svg', { width: 22, height: 22, viewBox: '0 0 22 22' },
      svg('circle', { cx: 11, cy: 11, r: 6, fill: p.domaines[0]!, 'fill-opacity': 0.3, stroke: p.domaines[0]!, 'stroke-width': 1 }),
      svg('path', { d: describeArc(11, 11, 9, 0.02, 0.56), fill: 'none', stroke: p.statut.valide, 'stroke-width': 2 }),
      svg('path', { d: describeArc(11, 11, 9, 0.6, 0.86), fill: 'none', stroke: p.statut.incertain, 'stroke-width': 2 }),
      svg('path', { d: describeArc(11, 11, 9, 0.9, 0.98), fill: 'none', stroke: p.statut.refute, 'stroke-width': 2 }))
    const trait = (c: string) => svg('svg', { width: 22, height: 18, viewBox: '0 0 22 18' }, svg('line', { x1: 2, x2: 16, y1: 9, y2: 9, stroke: c, 'stroke-width': 2, 'stroke-linecap': 'round' }), svg('circle', { cx: 17, cy: 9, r: 2.4, fill: c }))
    return el('div', { class: 'v7-legende' },
      el('h5', {}, 'Nœud : remplissage = statut'),
      STATUTS.map((s) => ligne(disque(p.statut[s], p.fond), LIBELLES_STATUT[s])),
      el('h5', {}, 'Bordure = qui a validé'),
      VALIDATIONS.map((v) => ligne(glypheValidation(v, p.texte, 16), LIBELLES_VALIDATION[v], v === 'aucune' ? '(filet pointillé)' : v === 'ia' ? '(simple)' : v === 'humain' ? '(double)' : '(pleine)')),
      el('h5', {}, 'Anneau de confiance'),
      ligne(anneau, 'arc foncé = estimation', '; arc clair = intervalle [bas ; haut], lu depuis midi'),
      el('h5', {}, 'Agrégat'),
      ligne(agr, 'disque teinté du domaine, taille ∝ √n', '; anneau fin = part des statuts'),
      el('h5', {}, 'Lignée (clic)'),
      ligne(trait(p.ancetre), 'ancêtres', ': ce dont le nœud découle'),
      ligne(trait(p.descendant), 'descendants', ': ce qui en découle'),
      el('h5', {}, 'Vues'),
      el('p', { class: 'v7-legende-note' }, el('kbd', {}, '7'), ' dessus : thématique · ', el('kbd', {}, '1'), ' face : temps en X · ', el('kbd', {}, '3'), ' droite : couloirs type × origine · ', el('kbd', {}, '5'), ' ortho / persp. · ', el('kbd', {}, '['), ' ', el('kbd', {}, ']'), ' granularité'),
    )
  }

  // ─── Nœud sélectionné ────────────────────────────────────────────────────

  private majNoeud(): void {
    const v = this.vue
    const u = v.lignee.selection
    const c = this.corpsNoeud
    if (u === null) {
      c.replaceChildren(el('div', { class: 'v7-vide' },
        el('p', {}, 'Aucun nœud sélectionné.'),
        el('p', { class: 'v7-doux' }, 'Cliquez un nœud du graphe : sa lignée s’anime, et vous lirez ici son énoncé, ses démonstrations et l’historique de son journal.'),
        el('button', { class: 'v7-bouton', type: 'button', onclick: () => this.actions.ouvrirPalette() }, 'Chercher un nœud… ', el('kbd', {}, 'Ctrl K'))))
      return
    }
    const { h } = v
    const lien = (f: number) => el('button', { class: 'v7-lien', type: 'button', onclick: () => this.actions.allerNoeud(f) },
      el('i', { class: 'v7-point', style: `background:${v.palette.statut[h.noeuds[f]!.statut]}` }), h.noeuds[f]!.nom)
    const nbA = v.lignee.ancetres.reduce((s, x) => s + x, 0)
    const nbD = v.lignee.descendants.reduce((s, x) => s + x, 0)
    const caseDesc = el('input', { type: 'checkbox', checked: v.lignee.inclureDescendants })
    caseDesc.addEventListener('change', () => v.reglages.definir('descendants', caseDesc.checked))
    const lignee = el('div', { class: 'v7-lignee' },
      el('span', {}, el('i', { class: 'v7-point', style: `background:${v.palette.ancetre}` }), el('b', {}, String(nbA)), ' ancêtre(s)'),
      el('span', {}, el('i', { class: 'v7-point', style: `background:${v.palette.descendant}` }), el('b', {}, String(nbD)), ' descendant(s)'),
      el('label', {}, caseDesc, ' inclure les descendants'),
      el('div', { class: 'v7-boutons' },
        el('button', { class: 'v7-bouton', type: 'button', onclick: () => v.cadrerSelection() }, 'Cadrer la lignée ', el('kbd', {}, '.')),
        el('button', { class: 'v7-bouton', type: 'button', onclick: () => v.selectionner(null) }, 'Effacer ', el('kbd', {}, 'Échap'))),
    )
    const fil = (chemin: string[], cats: number[]) => el('nav', { class: 'v7-fil' }, chemin.map((nom, i) =>
      el('button', { class: 'v7-lien', type: 'button', onclick: () => this.actions.allerCategorie(cats[i]!) }, nom)).flatMap((b, i) => (i ? [el('span', {}, '›'), b] : [b])))
    const n = h.noeudDe(u)
    if (n) {
      const coul = v.palette.statut[n.statut]
      const chaine = [0, 1, 2].map((k) => h.chaine[u * 3 + k]!)
      c.replaceChildren(
        el('div', { class: 'v7-surtitre' }, `${LIBELLES_TYPE[n.type]} · ${LIBELLES_ORIGINE[n.origine]} · `, el('span', { class: 'v7-mono' }, n.id)),
        el('h3', { class: 'v7-titre' }, n.nom),
        fil(n.categorie, chaine),
        el('div', { class: 'v7-badges' },
          el('span', { class: 'v7-badge', style: `color:${coul};border-color:${coul}` }, el('i', { class: 'v7-point', style: `background:${coul}` }), LIBELLES_STATUT[n.statut]),
          el('span', { class: 'v7-badge' }, glypheValidation(n.validation, v.palette.texte, 12), `validé : ${LIBELLES_VALIDATION[n.validation]}`)),
        el('blockquote', { class: 'v7-enonce' }, n.enonce),
        el('div', { class: 'v7-confiance' }, el('span', { class: 'v7-doux' }, 'Confiance'), echelleConfiance(n.confiance.bas, n.confiance.estimation, n.confiance.haut, coul, 190),
          el('span', { class: 'v7-num' }, formaterNombre(n.confiance.estimation), el('small', {}, ` [${formaterNombre(n.confiance.bas)} – ${formaterNombre(n.confiance.haut)}]`))),
        el('h5', {}, 'Lignée'),
        lignee,
        el('h5', {}, `Démonstrations (${n.demonstrations.length})`),
        n.demonstrations.length
          ? el('ul', { class: 'v7-demos' }, n.demonstrations.map((d) => el('li', {},
              el('div', { class: 'v7-demo-tete' }, el('strong', {}, d.nom), el('span', { class: `v7-validite ${d.validite}` }, LIBELLES_VALIDITE[d.validite])),
              el('div', { class: 'v7-doux' }, `par ${auteur(d.auteur)} · ${d.justifie_par.length} prémisse(s)`),
              el('div', { class: 'v7-liens' }, d.justifie_par.map((p) => h.indexParId.get(p)).filter((x): x is number => x !== undefined).map(lien)))))
          : el('p', { class: 'v7-doux' }, n.admis ? 'Admis (sans démonstration).' : 'Aucune démonstration.'),
        el('h5', {}, 'Journal'),
        el('ol', { class: 'v7-journal' }, journal(v, u).map((e) => el('li', {}, el('time', {}, formaterDate(e.t)), el('span', {}, e.texte)))),
        ...(h.utilisePar[u]!.length ? [el('h5', {}, `Utilisé par (${h.utilisePar[u]!.length})`), el('div', { class: 'v7-liens' }, h.utilisePar[u]!.slice(0, 12).map(lien))] : []),
      )
    } else {
      const cat = h.categorieDe(u)!
      const s = statistiquesCategorie(h, cat.index, v.filtres.actives)
      const chaine: number[] = []
      for (let x = cat.index; x >= 0; x = h.categories[x]!.parent) chaine.unshift(x)
      c.replaceChildren(
        el('div', { class: 'v7-surtitre' }, NOMS_NIVEAUX[cat.niveau].replace(/s$/, '')),
        el('h3', { class: 'v7-titre' }, cat.nom),
        fil(cat.chemin, chaine),
        el('p', {}, el('b', {}, String(s.nbActives)), ` nœud(s) · ${formaterDateCourte(s.dateMin)} → ${formaterDate(s.dateMax)}`),
        barreStatuts(v, s.statuts, 300),
        el('h5', {}, 'Lignée'),
        lignee,
        el('h5', {}, 'Nœuds principaux'),
        el('div', { class: 'v7-liens' }, s.principales.map(lien)),
        el('div', { class: 'v7-boutons' },
          el('button', { class: 'v7-bouton', type: 'button', onclick: () => { v.granularite.basculer(cat.index); v.demanderRendu() } }, 'Ouvrir / replier dans le graphe')),
      )
    }
  }

  // ─── Activité (maquette) ─────────────────────────────────────────────────

  private construireActivite(): void {
    const page = this.pages.get('activite')!
    const { h } = this.vue
    const act = this.activite
    const zone = (c: number) => el('button', { class: 'v7-lien', type: 'button', onclick: () => this.actions.allerCategorie(c) }, h.categories[c]!.chemin.slice(1).join(' › '))
    const avatar = (a: { initiales: string; couleur: string; genre: string }) => el('span', { class: `v7-avatar ${a.genre}`, style: `--c:${a.couleur}` }, a.initiales)
    page.append(
      el('div', { class: 'v7-maquette' }, 'Maquette : données d’activité factices, pour préfigurer l’application.'),
      el('h5', {}, 'En ce moment'),
      el('ul', { class: 'v7-agents' }, act.agents.map((a) => el('li', {},
        avatar(a),
        el('div', {},
          el('div', { class: 'v7-agent-tete' }, el('strong', {}, a.nom), el('span', { class: `v7-etat ${a.etat.replace(' ', '-')}` }, a.etat)),
          el('div', { class: 'v7-doux' }, a.tache),
          el('div', { class: 'v7-agent-zone' }, zone(a.zone), el('span', { class: 'v7-doux' }, ` · ${ilYA(a.depuis)}`)))))),
      el('h5', {}, `Verrous de zone (${act.verrous.length})`),
      el('ul', { class: 'v7-verrous' }, act.verrous.map((vr) => el('li', {},
        el('span', { class: 'v7-cadenas', 'aria-hidden': 'true' }),
        el('div', {}, zone(vr.zone), el('div', { class: 'v7-doux' }, `${vr.agent} · ${vr.motif} · ${ilYA(vr.depuis)}`))))),
      el('h5', {}, `Conflits en attente (${act.conflits.length})`),
      el('ul', { class: 'v7-conflits' }, act.conflits.map((k) => el('li', {},
        el('div', { class: 'v7-conflit-tete' }, el('strong', {}, k.titre)),
        el('div', { class: 'v7-doux' }, `${k.nature} · ${k.entre.join(' ↔ ')} · ${ilYA(k.depuis)}`),
        el('div', { class: 'v7-boutons' },
          el('button', { class: 'v7-bouton', type: 'button', onclick: () => this.actions.allerNoeud(k.noeud) }, 'Voir dans le graphe'),
          el('button', { class: 'v7-bouton', type: 'button', disabled: true, title: 'Maquette : arbitrage à venir' }, 'Arbitrer…'))))),
      el('h5', {}, 'Sessions récentes (données)'),
      el('ul', { class: 'v7-sessions' }, act.sessions.map((s) => el('li', {},
        el('span', { class: 'v7-mono' }, s.id),
        el('span', {}, `${s.feuilles.length} nœuds · ${s.zone}`),
        el('span', { class: 'v7-doux' }, formaterDateCourte(s.fin))))),
    )
  }

  // ─── Réglages d'usage ────────────────────────────────────────────────────

  private construireReglages(): void {
    const page = this.pages.get('reglages')!
    const v = this.vue
    const R = v.reglages
    const segment = <T extends string>(titre: string, options: [T, string][], lireV: () => T, ecrire: (x: T) => void) => {
      const boutons = options.map(([val, lib]) => {
        const b = el('button', { type: 'button' }, lib)
        b.addEventListener('click', () => {
          ecrire(val)
          maj()
        })
        return { b, val }
      })
      const maj = () => boutons.forEach(({ b, val }) => b.classList.toggle('actif', lireV() === val))
      this.majReglages.push(maj)
      maj()
      return el('div', { class: 'v7-reglage' }, el('span', {}, titre), el('div', { class: 'v7-segment' }, boutons.map((x) => x.b)))
    }
    const bascule = (titre: string, cle: string, aide?: string) => {
      const c = el('input', { type: 'checkbox' })
      c.addEventListener('change', () => R.definir(cle, c.checked))
      const maj = () => (c.checked = R.lire<boolean>(cle))
      this.majReglages.push(maj)
      maj()
      return el('label', { class: 'v7-reglage v7-bascule' }, el('span', {}, titre, aide ? el('small', {}, aide) : null), c, el('i', { 'aria-hidden': 'true' }))
    }
    const reglage = <T extends string>(titre: string, cle: string, options: [T, string][]) => segment(titre, options, () => R.lire<T>(cle), (x) => R.definir(cle, x))
    v.on('vue', () => this.majReglages.forEach((f) => f()))
    page.append(
      el('h5', {}, 'Affichage'),
      segment('Thème', [['clair', 'Clair'], ['sombre', 'Sombre']], () => R.valeurs.theme, (t) => v.definirTheme(t)),
      reglage('Panneau', 'modePanneau', [['pousse', 'Pousse le graphe'], ['surimpression', 'Surimpression']]),
      bascule('Territoires des domaines', 'territoires'),
      bascule('Légende de figure', 'legendeFigure'),
      el('h5', {}, 'Navigation'),
      segment('Mode', [['2d', '2D · face verrouillée'], ['3d', '3D · orbite']], () => v.mode, (m) => v.definirMode(m)),
      reglage('Placement 3D', 'mode3D', [['faces', 'Faces sémantiques'], ['cube', 'Cube strict']]),
      el('h5', {}, 'Agrégation'),
      reglage('Zoom sémantique', 'zoomSemantique', [['manuel', 'Manuel'], ['paliers', 'Auto · paliers'], ['continu', 'Auto · continu']]),
      bascule('Lentille focus + contexte', 'lentille', 'les agrégats s’ouvrent sous le curseur · L épingle · Maj + molette : rayon'),
      el('h5', {}, 'Lecture'),
      bascule('Impulsions de lignée', 'impulsions'),
      bascule('Inclure les descendants', 'descendants'),
      bascule('Fiche détaillée', 'ficheDetaillee', 'sinon Espace déplie le détail'),
      bascule('Règles graduées (face, droite)', 'axes'),
      bascule('Réticule de lecture', 'reticule'),
      el('h5', {}, 'Outils'),
      bascule('Palette de commandes', 'palette', 'Ctrl + K'),
      reglage('Présence des agents', 'marqueursActivite', [['onglet', 'Onglet Activité'], ['toujours', 'Toujours'], ['jamais', 'Jamais']]),
      el('div', { class: 'v7-boutons' },
        el('button', { class: 'v7-bouton', type: 'button', onclick: () => this.actions.basculerReglagesAvances() }, 'Réglages avancés (Tweakpane)'),
        el('button', { class: 'v7-bouton', type: 'button', onclick: () => R.reinitialiser() }, 'Tout réinitialiser')),
      el('h5', {}, 'Raccourcis'),
      el('dl', { class: 'v7-raccourcis' },
        ...[
          ['N', 'ouvrir / fermer ce panneau'], ['Ctrl K', 'palette de commandes'], ['7 · 1 · 3', 'vues dessus · face · droite'],
          ['5', 'ortho / perspective'], ['2 4 6 8', 'orbiter par 15°'], ['[ · ]', 'agréger · affiner'],
          ['double-clic', 'ouvrir un agrégat'], ['Alt + double-clic', 'le replier'], ['clic', 'lignée'], ['Échap', 'effacer'],
          ['Espace', 'déplier la fiche'], ['L', 'épingler la lentille'], ['. · Home', 'cadrer la sélection · tout'],
        ].flatMap(([k, t]) => [el('dt', {}, el('kbd', {}, k!)), el('dd', {}, t!)]),
      ),
    )
  }
}

/** Historique du journal (maquette dérivée des données : création, démonstrations, validation, statut). */
function journal(v: VueGraphe, f: number): { t: number; texte: string }[] {
  const { h } = v
  const n = h.noeuds[f]!
  const t0 = h.dates[f]!
  const heure = 3_600_000
  const e: { t: number; texte: string }[] = [{ t: t0, texte: `Création (session ${n.session}, ${LIBELLES_ORIGINE[n.origine].toLowerCase()})` }]
  let t = t0
  n.demonstrations.forEach((d, i) => {
    t += (2 + hacher(n.id, 10 + i) * 30) * heure
    e.push({ t, texte: `Démonstration « ${d.nom} » ajoutée par ${auteur(d.auteur)} — ${LIBELLES_VALIDITE[d.validite].toLowerCase()}` })
  })
  if (n.validation !== 'aucune') {
    t += (4 + hacher(n.id, 3) * 48) * heure
    e.push({ t, texte: n.validation === 'ia' ? 'Vérification automatique : validée par l’IA' : n.validation === 'humain' ? 'Relecture humaine : validée' : 'Validée par l’IA puis relue par un humain' })
  }
  if (n.statut !== 'valide') {
    t += (1 + hacher(n.id, 4) * 24) * heure
    e.push({ t, texte: n.statut === 'refute' ? `Marqué réfuté (intervalle ${formaterNombre(n.confiance.bas)} – ${formaterNombre(n.confiance.haut)})` : `Signalé incertain : intervalle ${formaterNombre(n.confiance.bas)} – ${formaterNombre(n.confiance.haut)}` })
  }
  return e
}

function auteur(a: string): string {
  return a === 'ia' ? 'l’IA' : a === 'calcul' ? 'le calcul' : a
}

/** Chemin SVG d'un arc (fractions de tour depuis midi, sens horaire). */
function describeArc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.cos(-Math.PI / 2 + a * Math.PI * 2), cy + r * Math.sin(-Math.PI / 2 + a * Math.PI * 2)]
  const [x0, y0] = p(a0), [x1, y1] = p(a1)
  return `M${x0!.toFixed(2)} ${y0!.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 0.5 ? 1 : 0} 1 ${x1!.toFixed(2)} ${y1!.toFixed(2)}`
}
