// Interface de la vue de raisonnement : fiche de survol, panneau gauche (☰), barre, compteur.

import { el, formaterDate } from '../core/ui/dom'
import { FORME_TYPE, iconeForme, couper } from './apparence'
import {
  dependantsDe, LIBELLES_ORIGINE, LIBELLES_ROLE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDITE, STATUTS,
} from './donnees'
import { COUCHES } from './disposition'
import { STRATEGIES, texteCompteur } from './lecture'
import type { VueRaisonnement } from './vue'

// ─── Fiche de survol ─────────────────────────────────────────────────────────

export class FicheRaisonnement {
  readonly element: HTMLElement
  pointAffiche: number | null = null

  constructor(parent: HTMLElement) {
    this.element = el('div', { class: 'rsn-fiche', role: 'tooltip' })
    parent.appendChild(this.element)
  }

  afficher(p: number, contenu: HTMLElement | string | null): void {
    if (contenu === null) return this.masquer()
    this.pointAffiche = p
    if (typeof contenu === 'string') this.element.innerHTML = contenu
    else this.element.replaceChildren(contenu)
    this.element.classList.add('visible')
  }

  masquer(): void {
    this.pointAffiche = null
    this.element.classList.remove('visible')
  }

  /** Place la fiche près du pointeur sans sortir du conteneur. */
  positionner(x: number, y: number, W: number, H: number): void {
    const r = this.element.getBoundingClientRect()
    let fx = x + 18, fy = y + 14
    if (fx + r.width > W - 8) fx = x - r.width - 18
    if (fy + r.height > H - 8) fy = Math.max(8, H - r.height - 8)
    this.element.style.transform = `translate(${Math.max(8, fx)}px, ${fy}px)`
  }
}

/** Barre de confiance (note sur 1). */
export function barreConfiance(confiance: number, couleur: string): HTMLElement {
  return el('div', { class: 'rsn-confiance' },
    el('div', { class: 'rsn-confiance-piste' },
      el('div', { class: 'rsn-confiance-intervalle', style: `left:0;width:${Math.max(1, confiance * 100)}%;background:${couleur}` }),
    ),
    el('span', {}, `${Math.round(confiance * 100)} %`),
  )
}

const NON_RENSEIGNE = 'non renseigné'

/** Fiche par défaut d'un point (unité, étape ou nœud de contexte masqué). */
export function ficheParDefaut(vue: VueRaisonnement, p: number): HTMLElement {
  const pal = vue.palette
  const n = vue.noeud(p)
  const j = vue.justification
  const unite = p < vue.nU ? vue.lecture.unites[p] : undefined
  const etape = unite?.genre === 'etape'
  const sp = vue.jeu.sousProblemes.find((s) => s.id === n.sousProbleme)
  const couche = vue.disposition.couche[p]!
  const icone = el('span', { class: 'rsn-icone' })
  icone.innerHTML = iconeForme(etape ? 'capsule' : FORME_TYPE[n.type], pal.couches[couche]!, 14)
  const corps = el('div', {},
    el('div', { class: 'rsn-fiche-type' }, icone, etape ? `Étape · ${unite!.membres.length} nœuds` : LIBELLES_TYPE[n.type],
      !etape && n.typeDeduit ? el('span', { class: 'rsn-doux' }, ' (déduit)') : null, sp ? el('span', { class: 'rsn-doux' }, ` · ${sp.nom}`) : null),
    el('div', { class: 'rsn-fiche-titre' }, n.nom),
    el('div', { class: 'rsn-fiche-enonce' }, couper(n.enonce, 220)),
  )
  if (n.piste === 'abandonnee') corps.append(el('div', { class: 'rsn-etiquette rsn-abandon' }, 'Piste abandonnée'))
  corps.append(
    el('dl', { class: 'rsn-grille' },
      el('dt', {}, 'Statut'), el('dd', {}, el('span', { class: 'rsn-pastille', style: `background:${pal.statut[n.statut]}` }), ` ${LIBELLES_STATUT[n.statut]}`),
      el('dt', {}, 'Démonstrations'), el('dd', {}, n.admis ? 'admis' : n.demonstrations.length ? n.demonstrations.map((d) => LIBELLES_VALIDITE[d.validite].toLowerCase()).join(', ') : 'aucune'),
      el('dt', {}, 'Origine'), el('dd', {}, `${n.origine ? LIBELLES_ORIGINE[n.origine] : NON_RENSEIGNE} · ${n.auteur}`),
      el('dt', {}, 'Date'), el('dd', {}, formaterDate(Date.parse(n.cree_le))),
      el('dt', {}, 'Confiance'), el('dd', {}, n.confiance === null ? NON_RENSEIGNE : barreConfiance(n.confiance, pal.statut[n.statut])),
    ),
  )
  // Décision : alternatives et raison.
  if (n.decision) {
    const d = n.decision
    corps.append(el('div', { class: 'rsn-bloc' },
      el('div', { class: 'rsn-bloc-titre' }, d.question),
      el('ul', { class: 'rsn-alternatives' }, d.alternatives.map((a) =>
        el('li', { class: a.retenue ? 'retenue' : 'rejetee' }, el('b', {}, a.retenue ? '✓ ' : '✗ '), a.libelle, a.raison ? el('span', { class: 'rsn-doux' }, ` — ${a.raison}`) : null))),
      el('div', { class: 'rsn-doux' }, `Raison : ${d.raison}`),
    ))
  }
  // Choix de modélisation : hypothèse et portée.
  if (n.choix) {
    const nb = dependantsDe(j, vue.indexNoeud(p)).length
    corps.append(el('div', { class: 'rsn-bloc' },
      el('div', { class: 'rsn-bloc-titre' }, n.choix.hypothese),
      el('div', {}, el('b', {}, 'Portée : '), n.choix.portee),
      el('div', { class: 'rsn-doux' }, `${nb} nœud(s) en dépendent dans le graphe complet.`),
    ))
  }
  if (etape) {
    const noms = unite!.membres.map((m) => j.noeuds[m]!.nom)
    corps.append(el('div', { class: 'rsn-bloc' }, el('div', { class: 'rsn-bloc-titre' }, 'Chaîne fusionnée'), el('ol', { class: 'rsn-chaine' }, noms.map((x) => el('li', {}, couper(x, 60))))))
  }
  // Prémisses : lecture et contexte rattaché.
  if (unite) {
    const lect = vue.lecture.entrantes[p]!.length
    const ctx = unite.contexte
    const parRole = new Map<string, number>()
    for (const c of ctx) parRole.set(c.role, (parRole.get(c.role) ?? 0) + 1)
    corps.append(el('div', { class: 'rsn-premisses' },
      el('div', {}, el('b', {}, `${lect}`), ` prémisse(s) de lecture · `, el('b', {}, `${ctx.length}`), ' rattachée(s)',
        ctx.length ? el('span', { class: 'rsn-doux' }, ` (${[...parRole].map(([r, k]) => `${k} ${LIBELLES_ROLE[r as keyof typeof LIBELLES_ROLE].toLowerCase()}`).join(', ')})`) : null),
      ctx.length ? el('div', { class: 'rsn-contexte' }, ctx.slice(0, 5).map((c) => el('span', { class: `rsn-puce-role role-${c.role}` }, couper(j.noeuds[c.noeud]!.nom, 28))), ctx.length > 5 ? el('span', { class: 'rsn-doux' }, ` +${ctx.length - 5}`) : null) : null,
    ))
  } else {
    const usages = j.sortantes[vue.indexNoeud(p)]!.length
    corps.append(el('div', { class: 'rsn-premisses rsn-doux' }, `Contexte pur : cité par ${usages} nœud(s), hors du graphe de lecture.`))
  }
  if (n.liens?.length) {
    corps.append(el('div', { class: 'rsn-bloc' }, n.liens.map((l) => {
      const c = j.noeuds[j.index.get(l.cible) ?? -1]
      const verbe = l.genre === 'contredit' ? 'Contredit' : l.genre === 'resout' ? 'Résout' : l.genre === 'abandonne' ? 'Abandonne' : 'Remplace'
      return el('div', {}, el('b', {}, `${verbe} : `), c ? c.nom : l.cible, l.note ? el('span', { class: 'rsn-doux' }, ` — ${l.note}`) : null)
    })))
  }
  corps.append(el('div', { class: 'rsn-aide' }, n.choix ? 'Clic : lignée · panneau : montrer la portée' : 'Clic : lignée · double-clic : cadrer · Échap : effacer'))
  return corps
}

// ─── Panneau gauche ──────────────────────────────────────────────────────────

interface Section {
  element: HTMLDetailsElement
  corps: HTMLElement
}

export class PanneauRaisonnement {
  readonly element: HTMLElement
  readonly bouton: HTMLButtonElement
  private contenu: HTMLElement
  private sections = new Map<string, Section>()
  private selectStrategie!: HTMLSelectElement
  private descStrategie!: HTMLElement
  private journal!: HTMLElement
  private stats!: HTMLElement
  private caseComplets!: HTMLInputElement

  private vue: VueRaisonnement

  constructor(parent: HTMLElement, vue: VueRaisonnement, ouvert = false) {
    this.vue = vue
    this.bouton = el('button', { class: 'rsn-bouton-menu', type: 'button', title: 'Panneau (N)', 'aria-label': 'Ouvrir le panneau' }, '☰')
    this.bouton.addEventListener('click', () => this.basculer())
    this.contenu = el('div', { class: 'rsn-panneau-contenu' })
    this.element = el('aside', { class: 'rsn-panneau' },
      el('div', { class: 'rsn-panneau-entete' }, el('strong', {}, vue.jeu.titre), el('span', {}, vue.jeu.resume)),
      this.contenu)
    parent.append(this.element, this.bouton)
    this.ajouterSection('lecture', 'Graphe de lecture', this.construireLecture())
    this.ajouterSection('selection', 'Sélection', el('p', { class: 'rsn-vide' }, 'Cliquez un nœud pour afficher sa lignée.'))
    this.ajouterSection('legende', 'Légende', this.construireLegende(), { ouverte: false })
    vue.on('selection', () => this.majSelection())
    vue.on('theme', () => this.remplacer('legende', this.construireLegende()))
    vue.on('reglage', ({ cle }) => { if (cle === 'liensComplets') this.caseComplets.checked = vue.reglages.valeurs.liensComplets })
    if (ouvert) this.basculer(true)
  }

  get ouvert(): boolean {
    return this.element.classList.contains('ouvert')
  }

  basculer(ouvrir = !this.ouvert): void {
    this.element.classList.toggle('ouvert', ouvrir)
    this.bouton.classList.toggle('actif', ouvrir)
    this.vue.racine.classList.toggle('panneau-ouvert', ouvrir)
  }

  /** Ajoute une section repliable ; `position` : id d'une section avant laquelle l'insérer. */
  ajouterSection(id: string, titre: string, corps: HTMLElement, options: { ouverte?: boolean; position?: string } = {}): HTMLElement {
    const enveloppe = el('div', { class: 'rsn-section-corps' }, corps)
    const details = el('details', { class: 'rsn-section', 'data-id': id }, el('summary', {}, titre), enveloppe)
    details.open = options.ouverte ?? true
    const avant = options.position ? this.sections.get(options.position)?.element : undefined
    if (avant) this.contenu.insertBefore(details, avant)
    else this.contenu.appendChild(details)
    this.sections.set(id, { element: details, corps: enveloppe })
    return enveloppe
  }

  remplacer(id: string, corps: HTMLElement): void {
    this.sections.get(id)?.corps.replaceChildren(corps)
  }

  section(id: string): HTMLElement | undefined {
    return this.sections.get(id)?.corps
  }

  // Section « Graphe de lecture » : stratégie, liens complets, statistiques, journal.
  private construireLecture(): HTMLElement {
    const v = this.vue
    this.selectStrategie = el('select', { class: 'rsn-select' }) as HTMLSelectElement
    this.selectStrategie.addEventListener('change', () => v.definirStrategie(this.selectStrategie.value))
    this.descStrategie = el('p', { class: 'rsn-doux rsn-petit' })
    this.caseComplets = el('input', { type: 'checkbox' }) as HTMLInputElement
    this.caseComplets.checked = v.reglages.valeurs.liensComplets
    this.caseComplets.addEventListener('change', () => v.montrerLiensComplets(this.caseComplets.checked))
    this.stats = el('div', { class: 'rsn-stats' })
    this.journal = el('ol', { class: 'rsn-journal' })
    return el('div', {},
      el('label', { class: 'rsn-champ' }, el('span', {}, 'Stratégie'), this.selectStrategie),
      this.descStrategie,
      el('label', { class: 'rsn-case' }, this.caseComplets, ' Montrer les liens complets (L)'),
      this.stats,
      el('div', { class: 'rsn-doux rsn-petit' }, 'Étapes de la dérivation :'),
      this.journal,
    )
  }

  /** Met à jour la section lecture (appelée à chaque nouvelle disposition). */
  majLecture(): void {
    const v = this.vue
    const g = v.lecture
    this.selectStrategie.replaceChildren(...STRATEGIES.map((s) => el('option', { value: s.id }, s.nom)))
    this.selectStrategie.value = g.strategie.id
    this.descStrategie.textContent = g.strategie.description
    const s = g.stats
    const ligne = (a: string, b: string | number) => el('div', {}, el('span', {}, a), el('b', {}, String(b)))
    this.stats.replaceChildren(
      ligne('Nœuds complet → lecture', `${s.noeudsComplet} → ${s.unites}`),
      ligne('Arêtes complet → lecture', `${s.aretesComplet} → ${s.aretes}`),
      ligne('Contexte pur (masqués)', s.masques),
      ligne('Étapes (nœuds fusionnés)', `${s.etapes} (${s.noeudsFusionnes})`),
      ligne('Arêtes → contexte', s.aretesContexte),
      ligne('Transitives retirées', s.transitivesRetirees),
      ligne('Rôles (P / A / T / C)', `${s.roles.principale} / ${s.roles.auxiliaire} / ${s.roles.technique} / ${s.roles.contexte}`),
    )
    this.journal.replaceChildren(...(g.journal.length ? g.journal : ['Aucune transformation.']).map((t) => el('li', {}, t)))
  }

  private construireLegende(): HTMLElement {
    const pal = this.vue.palette
    const ico = (html: string) => {
      const s = el('span', { class: 'rsn-icone' })
      s.innerHTML = html
      return s
    }
    const formes: [string, string][] = [
      ['losange', 'Décision'], ['hexagone', 'Choix de modélisation'], ['carre', 'Hypothèse, axiome'],
      ['triangle', 'Conjecture'], ['capsule', 'Étape (chaîne fusionnée)'], ['cercle', 'Autres énoncés'],
    ]
    return el('div', { class: 'rsn-legende' },
      el('div', { class: 'rsn-groupe-titre' }, 'Formes'),
      formes.map(([f, t]) => el('div', { class: 'rsn-legende-ligne' }, ico(iconeForme(f as never, pal.texteDoux, 14)), t)),
      el('div', { class: 'rsn-groupe-titre' }, 'Couleur = couche de type'),
      COUCHES.map((c, i) => el('div', { class: 'rsn-legende-ligne' }, el('span', { class: 'rsn-pastille', style: `background:${pal.couches[i]}` }), c.nom)),
      el('div', { class: 'rsn-groupe-titre' }, 'Bordure = statut'),
      STATUTS.map((s) => el('div', { class: 'rsn-legende-ligne' }, el('span', { class: 'rsn-pastille anneau', style: `border-color:${pal.statut[s]}` }), LIBELLES_STATUT[s])),
      el('div', { class: 'rsn-groupe-titre' }, 'Pastilles (à gauche du nœud) = contexte rattaché'),
      (['auxiliaire', 'technique', 'contexte'] as const).map((r) => el('div', { class: 'rsn-legende-ligne' }, el('span', { class: 'rsn-pastille petite', style: `background:${pal.role[r]}` }), LIBELLES_ROLE[r])),
    )
  }

  private majSelection(): void {
    const v = this.vue
    const p = v.selection
    if (p === null) return this.remplacer('selection', el('p', { class: 'rsn-vide' }, 'Cliquez un nœud pour afficher sa lignée.'))
    const n = v.noeud(p)
    const j = v.justification
    const bloc = el('div', { class: 'rsn-detail' },
      el('div', { class: 'rsn-fiche-titre' }, n.nom),
      el('div', { class: 'rsn-fiche-enonce' }, n.enonce),
    )
    let anc = 0, desc = 0
    for (let q = 0; q < v.nP; q++) {
      if (v.lignee[q] === 1) anc++
      else if (v.lignee[q] === 2) desc++
    }
    bloc.append(el('div', { class: 'rsn-doux' }, `Lignée : ${anc} ancêtre(s), ${desc} descendant(s) dans le graphe de lecture.`))
    if (n.choix || n.type === 'hypothese' || n.type === 'decision') {
      bloc.append(el('button', { class: 'rsn-bouton', type: 'button', onclick: () => v.montrerPortee(p) }, 'Montrer la portée (graphe complet)'))
    }
    bloc.append(el('div', { class: 'rsn-groupe-titre' }, 'Démonstrations'))
    for (const d of n.demonstrations) {
      bloc.append(el('div', { class: 'rsn-demo' },
        el('div', {}, el('b', {}, d.nom), el('span', { class: 'rsn-doux' }, ` · ${LIBELLES_VALIDITE[d.validite]} · ${d.auteur}`
          + (d.confiance === null || d.confiance === undefined ? '' : ` · confiance ${Math.round(d.confiance * 100)} %`))),
        el('div', { class: 'rsn-contexte' }, d.premisses.map((pr) => el('span', { class: `rsn-puce-role role-${pr.role}`, title: LIBELLES_ROLE[pr.role] }, couper(j.noeuds[j.index.get(pr.id) ?? 0]?.nom ?? pr.id, 30)))),
      ))
    }
    if (!n.demonstrations.length) bloc.append(el('div', { class: 'rsn-doux' }, n.admis ? 'Admis (sans démonstration).' : 'Aucune démonstration.'))
    this.remplacer('selection', bloc)
    const s = this.sections.get('selection')
    if (s) s.element.open = true
  }
}

// ─── Barre d'outils (haut, centre) ───────────────────────────────────────────

export class BarreRaisonnement {
  readonly element: HTMLElement
  private b2d: HTMLButtonElement
  private b3d: HTMLButtonElement
  private bComplets: HTMLButtonElement
  private bTheme: HTMLButtonElement

  private vue: VueRaisonnement

  constructor(parent: HTMLElement, vue: VueRaisonnement) {
    this.vue = vue
    const bouton = (texte: string, titre: string, f: () => void) => el('button', { type: 'button', title: titre, onclick: f }, texte)
    this.b2d = bouton('2D', 'Vue de face, plate (T)', () => vue.definirMode('2d'))
    this.b3d = bouton('3D', 'Vue de côté, profondeur = type (T)', () => vue.definirMode('3d'))
    this.bComplets = bouton('Liens complets', 'Montrer toutes les prémisses (L)', () => vue.montrerLiensComplets(!vue.reglages.valeurs.liensComplets))
    this.bTheme = bouton('Sombre', 'Thème clair / sombre', () => vue.definirTheme(vue.reglages.valeurs.theme === 'clair' ? 'sombre' : 'clair'))
    this.element = el('div', { class: 'rsn-barre' },
      el('div', { class: 'rsn-barre-groupe' }, this.b2d, this.b3d),
      el('div', { class: 'rsn-barre-groupe' }, this.bComplets),
      el('div', { class: 'rsn-barre-groupe' }, bouton('Cadrer', 'Tout cadrer (Origine)', () => vue.cadrerTout()), this.bTheme),
    )
    parent.appendChild(this.element)
    this.maj()
  }

  maj(): void {
    const v = this.vue
    this.b2d.classList.toggle('actif', v.mode === '2d')
    this.b3d.classList.toggle('actif', v.mode === '3d')
    this.bComplets.classList.toggle('actif', v.reglages.valeurs.liensComplets)
    this.bTheme.textContent = v.reglages.valeurs.theme === 'clair' ? 'Sombre' : 'Clair'
  }
}

// ─── Compteur (bas, gauche) ──────────────────────────────────────────────────

/** Sélecteur de stratégie + « graphe complet : N nœuds / M arêtes → lecture : n / m ». */
export class Compteur {
  readonly element: HTMLElement
  readonly select: HTMLSelectElement
  private texte: HTMLElement

  private vue: VueRaisonnement

  constructor(parent: HTMLElement, vue: VueRaisonnement) {
    this.vue = vue
    this.select = el('select', { class: 'rsn-select', title: 'Stratégie de lecture' }) as HTMLSelectElement
    this.select.addEventListener('change', () => vue.definirStrategie(this.select.value))
    this.texte = el('span', { class: 'rsn-compteur-texte' })
    this.element = el('div', { class: 'rsn-compteur' }, this.select, this.texte)
    parent.appendChild(this.element)
  }

  maj(): void {
    const g = this.vue.lecture
    this.select.replaceChildren(...STRATEGIES.map((s) => el('option', { value: s.id }, s.nom)))
    this.select.value = g.strategie.id
    this.texte.textContent = texteCompteur(g)
    this.texte.title = g.journal.join('\n')
  }
}
