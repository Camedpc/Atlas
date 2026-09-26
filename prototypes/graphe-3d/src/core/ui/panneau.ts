// Panneau gauche (bouton ☰) : filtres, légende, arbre des catégories, détail de la sélection.
// Les variantes ajoutent leurs sections avec `panneau.ajouterSection(...)`.

import type { VueGraphe } from '../index'
import {
  LIBELLES_ORIGINE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, LIBELLES_VALIDITE,
  ORIGINES, STATUTS, TYPES_NOEUD, VALIDATIONS,
} from '../donnees'
import type { Categorie } from '../hierarchie'
import { statistiquesCategorie } from '../hierarchie'
import { el, formaterDate, formaterDateCourte } from './dom'
import { barreConfiance, barreStatuts } from './fiche'

interface Section {
  id: string
  element: HTMLDetailsElement
  corps: HTMLElement
}

export class PanneauGauche {
  readonly element: HTMLElement
  readonly bouton: HTMLButtonElement
  private contenu: HTMLElement
  private sections = new Map<string, Section>()
  private arbre = new Map<number, { ligne: HTMLElement; etat: HTMLElement; case: HTMLInputElement }>()

  constructor(parent: HTMLElement, private vue: VueGraphe, ouvert = false) {
    this.bouton = el('button', { class: 'atlas-bouton-menu', title: 'Panneau (filtres, légende, catégories)', 'aria-label': 'Ouvrir le panneau' }, '☰')
    this.bouton.addEventListener('click', () => this.basculer())
    this.contenu = el('div', { class: 'atlas-panneau-contenu' })
    this.element = el('aside', { class: 'atlas-panneau' }, el('div', { class: 'atlas-panneau-entete' }, el('strong', {}, 'Atlas'), el('span', {}, `${vue.h.nF} nœuds`)), this.contenu)
    parent.append(this.element, this.bouton)
    if (ouvert) this.basculer(true)

    this.ajouterSection('selection', 'Sélection', el('p', { class: 'atlas-vide' }, 'Cliquez un nœud pour afficher sa lignée.'))
    this.ajouterSection('filtres', 'Filtres', this.construireFiltres())
    this.ajouterSection('legende', 'Légende', this.construireLegende(), { ouverte: false })
    this.ajouterSection('categories', 'Catégories', this.construireArbre(), { ouverte: false })

    vue.on('selection', () => this.majSelection())
    vue.on('filtres', () => this.majFiltres())
    vue.on('granularite', () => this.majArbre())
    vue.on('theme', () => this.remplacer('legende', this.construireLegende()))
    this.majArbre()
  }

  get ouvert(): boolean {
    return this.element.classList.contains('ouvert')
  }

  basculer(ouvrir = !this.ouvert): void {
    this.element.classList.toggle('ouvert', ouvrir)
    this.bouton.classList.toggle('actif', ouvrir)
    this.vue.racine.classList.toggle('panneau-ouvert', ouvrir)
  }

  /** Ajoute une section repliable. `position` : id d'une section avant laquelle l'insérer. */
  ajouterSection(id: string, titre: string, corps: HTMLElement, options: { ouverte?: boolean; position?: string } = {}): HTMLElement {
    const wrap = el('div', { class: 'atlas-section-corps' }, corps)
    const details = el('details', { class: 'atlas-section', 'data-id': id }, el('summary', {}, titre), wrap)
    details.open = options.ouverte ?? true
    const avant = options.position ? this.sections.get(options.position)?.element : undefined
    if (avant) this.contenu.insertBefore(details, avant)
    else this.contenu.appendChild(details)
    this.sections.set(id, { id, element: details, corps: wrap })
    return wrap
  }

  /** Remplace le contenu d'une section existante. */
  remplacer(id: string, corps: HTMLElement): void {
    this.sections.get(id)?.corps.replaceChildren(corps)
  }

  section(id: string): HTMLElement | undefined {
    return this.sections.get(id)?.corps
  }

  // ─── Filtres ──────────────────────────────────────────────────────────────

  private puces: { maj: () => void }[] = []

  private groupePuces<V extends string>(
    titre: string,
    valeurs: readonly V[],
    libelles: Record<V, string>,
    ensemble: 'typesExclus' | 'originesExclues' | 'statutsExclus' | 'validationsExclues',
    couleur?: (v: V) => string,
  ): HTMLElement {
    const f = this.vue.filtres
    const boutons = valeurs.map((v) => {
      const b = el('button', { class: 'atlas-puce', type: 'button' }, couleur ? el('i', { style: `background:${couleur(v)}` }) : null, libelles[v])
      b.addEventListener('click', () => f.basculer(ensemble, v as never))
      return { b, v }
    })
    this.puces.push({ maj: () => boutons.forEach(({ b, v }) => b.classList.toggle('exclue', (f.etat[ensemble] as Set<string>).has(v))) })
    return el('div', { class: 'atlas-groupe' }, el('div', { class: 'atlas-groupe-titre' }, titre), el('div', { class: 'atlas-puces' }, boutons.map((x) => x.b)))
  }

  private champTexte!: HTMLInputElement
  private curseurConfiance!: HTMLInputElement
  private texteConfiance!: HTMLElement
  private textePeriode!: HTMLElement
  private compteActifs!: HTMLElement
  private modes!: HTMLInputElement[]

  private construireFiltres(): HTMLElement {
    const v = this.vue
    const f = v.filtres
    this.champTexte = el('input', { type: 'search', class: 'atlas-recherche', placeholder: 'Rechercher un nœud, une notion…' })
    let minuterie = 0
    this.champTexte.addEventListener('input', () => {
      clearTimeout(minuterie)
      minuterie = window.setTimeout(() => f.modifier({ texte: this.champTexte.value }), 120)
    })
    this.modes = (['estomper', 'masquer'] as const).map((m) => {
      const r = el('input', { type: 'radio', name: `mode-${v.id}`, value: m })
      r.addEventListener('change', () => r.checked && f.modifier({ mode: m }))
      return r
    })
    this.curseurConfiance = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0 })
    this.texteConfiance = el('span', { class: 'atlas-valeur' })
    this.curseurConfiance.addEventListener('input', () => f.modifier({ confianceMin: Number(this.curseurConfiance.value) }))
    this.textePeriode = el('span', { class: 'atlas-valeur' })
    this.compteActifs = el('span', { class: 'atlas-compte' })
    const pal = () => v.palette
    const corps = el(
      'div',
      { class: 'atlas-filtres' },
      this.champTexte,
      el('div', { class: 'atlas-ligne' },
        el('label', {}, this.modes[0]!, ' estomper'),
        el('label', {}, this.modes[1]!, ' masquer'),
        this.compteActifs,
      ),
      this.groupePuces('Statut', STATUTS, LIBELLES_STATUT, 'statutsExclus', (s) => pal().statut[s]),
      this.groupePuces('Validation', VALIDATIONS, LIBELLES_VALIDATION, 'validationsExclues', (s) => pal().validation[s]),
      this.groupePuces('Origine', ORIGINES, LIBELLES_ORIGINE, 'originesExclues', (s) => pal().origine[s]),
      this.groupePuces('Type', TYPES_NOEUD, LIBELLES_TYPE, 'typesExclus'),
      el('div', { class: 'atlas-groupe' }, el('div', { class: 'atlas-groupe-titre' }, 'Confiance minimale ', this.texteConfiance), this.curseurConfiance),
      el('div', { class: 'atlas-groupe' }, el('div', { class: 'atlas-groupe-titre' }, 'Période ', this.textePeriode),
        el('button', { class: 'atlas-lien', type: 'button', onclick: () => f.modifier({ periode: null }) }, 'toute la période'),
      ),
      el('button', { class: 'atlas-bouton', type: 'button', onclick: () => { f.reinitialiser(); this.champTexte.value = '' } }, 'Réinitialiser les filtres'),
    )
    this.majFiltres()
    return corps
  }

  private majFiltres(): void {
    const f = this.vue.filtres
    const e = f.etat
    this.puces.forEach((p) => p.maj())
    this.modes?.forEach((r) => (r.checked = r.value === e.mode))
    if (this.curseurConfiance) {
      this.curseurConfiance.value = String(e.confianceMin)
      this.texteConfiance.textContent = e.confianceMin > 0 ? `≥ ${e.confianceMin.toFixed(2)}` : ''
      this.textePeriode.textContent = e.periode ? `${formaterDateCourte(e.periode[0])} → ${formaterDateCourte(e.periode[1])}` : '(tout)'
      this.compteActifs.textContent = `${f.nbActives} / ${this.vue.h.nF}`
      if (this.champTexte.value !== e.texte && document.activeElement !== this.champTexte) this.champTexte.value = e.texte
    }
    this.arbre.forEach((x, c) => (x.case.checked = !e.categoriesExclues.has(c)))
  }

  // ─── Légende ──────────────────────────────────────────────────────────────

  private construireLegende(): HTMLElement {
    const p = this.vue.palette
    const ligne = (pastille: HTMLElement, texte: string) => el('div', { class: 'atlas-legende-ligne' }, pastille, texte)
    const rond = (c: string, bord?: string) => el('i', { class: 'atlas-pastille', style: `background:${c};${bord ? `box-shadow:0 0 0 2px ${bord}` : ''}` })
    return el(
      'div',
      { class: 'atlas-legende' },
      el('div', { class: 'atlas-groupe-titre' }, 'Nœuds (couleur = statut)'),
      STATUTS.map((s) => ligne(rond(p.statut[s]), LIBELLES_STATUT[s])),
      el('div', { class: 'atlas-groupe-titre' }, 'Agrégats (couleur = domaine, taille ∝ √n)'),
      this.vue.h.domaines.map((d) => ligne(rond(p.domaines[this.vue.h.categories[d]!.domaine % p.domaines.length]!), this.vue.h.categories[d]!.nom)),
      el('div', { class: 'atlas-groupe-titre' }, 'Lignée'),
      ligne(rond(p.accent), 'Sélection'),
      ligne(rond(p.ancetre), 'Ancêtres (ce dont le nœud découle)'),
      ligne(rond(p.descendant), 'Descendants (ce qui en découle)'),
      el('div', { class: 'atlas-groupe-titre' }, 'Vues (pavé numérique ou chiffres du haut)'),
      el('div', { class: 'atlas-legende-texte' }, '7 dessus : thématique · 1 face : temps en X · 3 droite : couloirs type × origine · Ctrl/Alt + chiffre : vue opposée · 5 ortho/persp · Home : tout cadrer · [ ] granularité'),
    )
  }

  // ─── Arbre des catégories ─────────────────────────────────────────────────

  private construireArbre(): HTMLElement {
    const v = this.vue
    const { h } = v
    const construire = (c: Categorie): HTMLElement => {
      const caseC = el('input', { type: 'checkbox', checked: true, title: 'Inclure dans les filtres' })
      caseC.addEventListener('change', () => v.filtres.basculer('categoriesExclues', c.index))
      const etat = el('button', { class: 'atlas-arbre-etat', type: 'button', title: 'Ouvrir / replier dans le graphe' })
      etat.addEventListener('click', (e) => {
        e.preventDefault()
        v.granularite.basculer(c.index)
        v.demanderRendu()
      })
      const nom = el('button', { class: 'atlas-arbre-nom', type: 'button', title: 'Sélectionner et cadrer' }, c.nom)
      nom.addEventListener('click', (e) => {
        e.preventDefault()
        v.selectionner(c.unite)
        v.cadrer([c.unite, ...c.feuilles])
      })
      const ligne = el('div', { class: `atlas-arbre-ligne niveau-${c.niveau}` }, caseC, etat, nom, el('span', { class: 'atlas-arbre-compte' }, String(c.feuilles.length)))
      this.arbre.set(c.index, { ligne, etat, case: caseC })
      if (!c.enfants.length) return ligne
      const d = el('details', { class: 'atlas-arbre-groupe' }, el('summary', {}, ligne), c.enfants.map((e) => construire(h.categories[e]!)))
      d.open = c.niveau === 0
      return d
    }
    return el(
      'div',
      { class: 'atlas-arbre' },
      h.domaines.map((d) => construire(h.categories[d]!)),
      el('button', { class: 'atlas-lien', type: 'button', onclick: () => { v.granularite.reinitialiserLocales(); v.demanderRendu() } }, 'Annuler les ouvertures locales'),
    )
  }

  private majArbre(): void {
    const g = this.vue.granularite
    this.arbre.forEach((x, c) => {
      const o = g.ouverture[c]!
      x.etat.textContent = o > 0.5 ? '▾' : '▸'
      x.etat.classList.toggle('local', g.surcharge(c) !== null)
    })
  }

  // ─── Sélection ────────────────────────────────────────────────────────────

  private majSelection(): void {
    const v = this.vue
    const u = v.lignee.selection
    if (u === null) {
      this.remplacer('selection', el('p', { class: 'atlas-vide' }, 'Cliquez un nœud pour afficher sa lignée.'))
      return
    }
    const { h } = v
    const lien = (f: number) => {
      const b = el('button', { class: 'atlas-lien', type: 'button' }, h.noeuds[f]!.nom)
      b.addEventListener('click', () => {
        v.selectionner(f)
        v.cadrer([f])
      })
      return b
    }
    const nbA = v.lignee.ancetres.reduce((s, x) => s + x, 0)
    const nbD = v.lignee.descendants.reduce((s, x) => s + x, 0)
    const caseDesc = el('input', { type: 'checkbox', checked: v.lignee.inclureDescendants })
    caseDesc.addEventListener('change', () => v.reglages.definir('descendants', caseDesc.checked))
    const resumeLignee = el('div', { class: 'atlas-lignee-resume' },
      el('span', {}, el('i', { class: 'atlas-pastille', style: `background:${v.palette.ancetre}` }), `${nbA} ancêtre(s)`),
      el('span', {}, el('i', { class: 'atlas-pastille', style: `background:${v.palette.descendant}` }), `${nbD} descendant(s)`),
      el('label', {}, caseDesc, ' descendants'),
    )
    const n = h.noeudDe(u)
    let corps: HTMLElement
    if (n) {
      corps = el(
        'div',
        { class: 'atlas-detail' },
        el('h3', {}, n.nom),
        el('div', { class: 'atlas-fiche-chemin' }, n.categorie.join(' › ')),
        el('div', { class: 'atlas-badges' },
          el('span', { class: 'atlas-badge' }, LIBELLES_TYPE[n.type]),
          el('span', { class: 'atlas-badge' }, LIBELLES_ORIGINE[n.origine]),
          el('span', { class: 'atlas-badge', style: `border-color:${v.palette.statut[n.statut]};color:${v.palette.statut[n.statut]}` }, LIBELLES_STATUT[n.statut]),
          el('span', { class: 'atlas-badge' }, `validé : ${LIBELLES_VALIDATION[n.validation]}`),
        ),
        el('p', { class: 'atlas-enonce' }, n.enonce),
        barreConfiance(n.confiance.bas, n.confiance.estimation, n.confiance.haut, v.palette.statut[n.statut]),
        resumeLignee,
        el('div', { class: 'atlas-groupe-titre' }, `Démonstrations (${n.demonstrations.length})`),
        n.demonstrations.length
          ? el('ul', { class: 'atlas-demos' }, n.demonstrations.map((d) =>
              el('li', {},
                el('div', {}, el('strong', {}, d.nom), ' ', el('span', { class: `atlas-validite ${d.validite}` }, LIBELLES_VALIDITE[d.validite]), el('span', { class: 'atlas-auteur' }, ` · ${d.auteur}`)),
                el('div', { class: 'atlas-premisses' }, d.justifie_par.map((p) => h.indexParId.get(p)).filter((x): x is number => x !== undefined).map(lien)),
              )))
          : el('p', { class: 'atlas-vide' }, n.admis ? 'Admis (sans démonstration).' : 'Aucune démonstration.'),
        el('div', { class: 'atlas-groupe-titre' }, 'Historique'),
        el('ul', { class: 'atlas-historique' },
          el('li', {}, `${formaterDate(h.dates[u]!)} — création (session ${n.session}, ${LIBELLES_ORIGINE[n.origine]})`),
          n.demonstrations.map((d) => el('li', {}, `démonstration « ${d.nom} » par ${d.auteur} : ${LIBELLES_VALIDITE[d.validite].toLowerCase()}`)),
          el('li', {}, `état actuel : ${LIBELLES_STATUT[n.statut].toLowerCase()}, validation ${LIBELLES_VALIDATION[n.validation]}`),
        ),
        h.utilisePar[u]!.length ? el('div', { class: 'atlas-groupe-titre' }, `Utilisé par (${h.utilisePar[u]!.length})`) : null,
        h.utilisePar[u]!.length ? el('div', { class: 'atlas-premisses' }, h.utilisePar[u]!.slice(0, 12).map(lien)) : null,
      )
    } else {
      const c = h.categorieDe(u)!
      const s = statistiquesCategorie(h, c.index, v.filtres.actives)
      corps = el(
        'div',
        { class: 'atlas-detail' },
        el('h3', {}, c.nom),
        el('div', { class: 'atlas-fiche-chemin' }, c.chemin.join(' › ')),
        el('p', {}, `${s.nbActives} nœud(s) · ${formaterDateCourte(s.dateMin)} → ${formaterDate(s.dateMax)}`),
        barreStatuts(v, s.statuts),
        resumeLignee,
        el('div', { class: 'atlas-groupe-titre' }, 'Nœuds principaux'),
        el('div', { class: 'atlas-premisses' }, s.principales.map(lien)),
        el('button', { class: 'atlas-bouton', type: 'button', onclick: () => { v.granularite.basculer(c.index); v.demanderRendu() } }, 'Ouvrir / replier'),
      )
    }
    this.remplacer('selection', corps)
    this.sections.get('selection')!.element.open = true
  }
}
