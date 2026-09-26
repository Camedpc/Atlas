// R4 · Interface propre à la vision : outils (sens de lecture, lecture guidée, replier), fil
// d'Ariane, panneau de lecture guidée (diaporama du raisonnement) et sections du panneau ☰.

import {
  el, iconeForme, FORME_TYPE, COUCHES, LIBELLES_ROLE, LIBELLES_TYPE,
  type PanneauRaisonnement, type VueRaisonnement,
} from '../../src/raisonnement'
import { guillemets, type ModeleDepliage, type PasGuide } from './modele'

export interface ActionsInterface {
  definirSens(s: 'pourquoi' | 'comment'): void
  toutReplier(): void
  deplierUnNiveau(): void
  focaliser(u: number): void
  reveler(u: number): void
  /** Lecture guidée : installe le pas k (ou quitte si null). */
  pas(liste: PasGuide[] | null, k: number): void
}

export class InterfaceR4 {
  readonly outils: HTMLElement
  readonly ariane: HTMLElement
  readonly guide: HTMLElement
  private bPourquoi: HTMLButtonElement
  private bComment: HTMLButtonElement
  private bGuide: HTMLButtonElement
  private compteur: HTMLElement
  // Lecture guidée
  private liste: PasGuide[] | null = null
  private k = 0
  private cible = -1

  constructor(private vue: VueRaisonnement, private m: ModeleDepliage, private a: ActionsInterface) {
    const bouton = (texte: string | (string | Node)[], titre: string, f: () => void, classe = '') => {
      const b = el('button', { class: `r4-outil ${classe}`, type: 'button', title: titre }, ...(Array.isArray(texte) ? texte : [texte])) as HTMLButtonElement
      b.addEventListener('click', f)
      return b
    }
    this.bPourquoi = bouton([el('span', { class: 'r4-fleche' }, '‹'), ' Pourquoi ?'], 'Remonter vers les prémisses (depuis un résultat)', () => a.definirSens('pourquoi'))
    this.bComment = bouton(['Comment ? ', el('span', { class: 'r4-fleche' }, '›')], 'Descendre vers ce qu’une hypothèse a permis', () => a.definirSens('comment'))
    this.bGuide = bouton('▶ Lecture guidée', 'Dérouler toute la preuve pas à pas (G)', () => this.basculerGuide(), 'r4-principal')
    this.compteur = el('span', { class: 'r4-compteur' })
    this.outils = el('div', { class: 'r4-outils' },
      el('div', { class: 'r4-segment', role: 'group', 'aria-label': 'Sens de lecture' }, this.bPourquoi, this.bComment),
      this.bGuide,
      bouton('Déplier un niveau', 'Déplier un niveau sur tous les fils visibles', () => a.deplierUnNiveau()),
      bouton('Tout replier', 'Revenir aux résultats et aux fondations (R)', () => a.toutReplier()),
      this.compteur,
    )
    this.ariane = el('nav', { class: 'r4-ariane', 'aria-label': 'Fil d’Ariane du raisonnement' })
    this.guide = el('section', { class: 'r4-guide', 'aria-live': 'polite' })
    vue.interface.append(this.outils, this.ariane, this.guide)
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (this.liste && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        this.aller(this.k + (e.key === 'ArrowRight' ? 1 : -1))
        e.preventDefault()
      } else if (e.key === 'g' || e.key === 'G') this.basculerGuide()
      else if (this.liste && e.key === 'Escape') this.quitterGuide()
    })
  }

  get enGuide(): boolean {
    return this.liste !== null
  }

  majOutils(sens: 'pourquoi' | 'comment'): void {
    this.bPourquoi.classList.toggle('actif', sens === 'pourquoi')
    this.bComment.classList.toggle('actif', sens === 'comment')
    this.bGuide.classList.toggle('actif', this.enGuide)
    this.bGuide.textContent = this.enGuide ? '■ Quitter la lecture' : '▶ Lecture guidée'
    const nv = this.m.nbVisibles()
    this.compteur.textContent = `${nv} / ${this.m.nU} affichées`
    this.compteur.title = `${nv} unités de lecture affichées sur ${this.m.nU} (${this.vue.lecture.stats.noeudsComplet} nœuds dans le graphe complet)`
  }

  // ─── Fil d'Ariane ──────────────────────────────────────────────────────────

  majAriane(): void {
    const chemin = this.m.ariane()
    if (!chemin.length) {
      this.ariane.replaceChildren(el('span', { class: 'r4-ariane-aide' },
        'Cliquez ', el('b', {}, '‹ pourquoi ?'), ' à gauche d’un résultat pour remonter sa preuve, ou ', el('b', {}, 'comment ? ›'), ' à droite d’une hypothèse.'))
      return
    }
    const pal = this.vue.palette
    const items: Node[] = []
    chemin.forEach((u, k) => {
      const n = this.m.noeud(u)
      const couche = Math.max(0, COUCHES.findIndex((c) => c.types.includes(n.type)))
      const ico = el('span', { class: 'r4-ico' })
      ico.innerHTML = iconeForme(this.m.g.unites[u]!.genre === 'etape' ? 'capsule' : FORME_TYPE[n.type], pal.couches[couche]!, 12)
      const b = el('button', { class: `r4-miette${u === this.m.focus ? ' actif' : ''}`, type: 'button', title: `${LIBELLES_TYPE[n.type]} : ${n.nom}` }, ico, el('span', {}, n.nom)) as HTMLButtonElement
      b.addEventListener('click', () => this.a.focaliser(u))
      if (k) items.push(el('span', { class: 'r4-sep', 'aria-hidden': 'true' }, '←'))
      items.push(b)
    })
    this.ariane.replaceChildren(el('span', { class: 'r4-ariane-titre' }, 'Chemin'), ...items)
  }

  // ─── Lecture guidée ────────────────────────────────────────────────────────

  basculerGuide(): void {
    if (this.liste) return this.quitterGuide()
    // Cible : le résultat du focus s'il y en a un, sinon le premier résultat « principal ».
    const chemin = this.m.focus !== null ? this.m.cheminVersResultat(this.m.focus) : []
    const principal = this.m.resultats.find((u) => /principal/i.test(this.m.noeud(u).nom)) ?? this.m.resultats[0]
    this.demarrerGuide(chemin.length ? chemin[chemin.length - 1]! : principal ?? 0)
  }

  demarrerGuide(cible: number): void {
    this.cible = cible
    this.liste = this.m.pasGuide(cible)
    if (!this.liste.length) { this.liste = null; return }
    this.aller(0)
  }

  quitterGuide(): void {
    this.liste = null
    this.guide.classList.remove('visible')
    this.a.pas(null, 0)
  }

  aller(k: number): void {
    if (!this.liste) return
    this.k = Math.max(0, Math.min(this.liste.length - 1, k))
    this.a.pas(this.liste, this.k)
    this.rendreGuide()
  }

  /** Après un changement d'état (ex. réglage « cumulatif ») : rejouer le pas courant. */
  rejouer(): void {
    if (this.liste) this.aller(this.k)
  }

  private rendreGuide(): void {
    const liste = this.liste!
    const p = liste[this.k]!
    const m = this.m
    const n = m.noeud(p.unite)
    const ph = m.phrase(p.unite)
    const unite = m.g.unites[p.unite]!
    const ctxNoms = unite.contexte.filter((c) => c.role !== 'contexte').slice(0, 4)
      .map((c) => `${m.g.justification.noeuds[c.noeud]!.nom} (${LIBELLES_ROLE[c.role].toLowerCase()})`)
    const choix = [p.unite, ...m.premisses(p.unite)].filter((u) => m.noeud(u).decision)
    const selectCible = el('select', { class: 'r4-select', title: 'Résultat dont on lit la preuve' }) as HTMLSelectElement
    for (const u of m.resultats) {
      const o = el('option', { value: String(u) }, m.noeud(u).nom) as HTMLOptionElement
      if (u === this.cible) o.selected = true
      selectCible.appendChild(o)
    }
    selectCible.addEventListener('change', () => this.demarrerGuide(Number(selectCible.value)))
    const barre = el('div', { class: 'r4-guide-progression', title: 'Aller à un pas' },
      el('div', { class: 'r4-guide-rempli', style: `width:${((this.k + 1) / liste.length) * 100}%` }))
    barre.addEventListener('click', (e) => {
      const r = barre.getBoundingClientRect()
      this.aller(Math.floor(((e.clientX - r.left) / r.width) * liste.length))
    })
    const prec = el('button', { class: 'r4-outil', type: 'button', title: 'Pas précédent (←)' }, '◀ Précédent') as HTMLButtonElement
    const suiv = el('button', { class: 'r4-outil r4-principal', type: 'button', title: 'Pas suivant (→)' }, 'Suivant ▶') as HTMLButtonElement
    const fermer = el('button', { class: 'r4-guide-fermer', type: 'button', title: 'Quitter (Échap)', 'aria-label': 'Quitter la lecture guidée' }, '×') as HTMLButtonElement
    prec.disabled = this.k === 0
    suiv.disabled = this.k === liste.length - 1
    prec.addEventListener('click', () => this.aller(this.k - 1))
    suiv.addEventListener('click', () => this.aller(this.k + 1))
    fermer.addEventListener('click', () => this.quitterGuide())
    const profondeur = p.chemin.length - 1
    const enfants: (Node | null)[] = [
      el('div', { class: 'r4-guide-tete' },
        el('span', { class: 'r4-guide-etiquette' }, 'Lecture guidée'), selectCible,
        el('span', { class: 'r4-guide-pas' }, `Pas ${this.k + 1} / ${liste.length}`, el('span', { class: 'r4-doux' }, ` · profondeur ${profondeur}`)),
        barre, fermer),
      el('div', { class: 'r4-guide-question' }, 'Pourquoi ', el('b', {}, guillemets(n.nom)), ' ?'),
      el('div', { class: 'r4-guide-phrase' }, ph.texte),
      ctxNoms.length ? el('div', { class: 'r4-guide-contexte' }, 'En s’appuyant aussi sur : ', ctxNoms.join(' · ')) : null,
      ...choix.map((u) => {
        const d = m.noeud(u).decision!
        const ret = d.alternatives.find((x) => x.retenue)
        const rej = d.alternatives.filter((x) => !x.retenue).map((x) => x.libelle)
        return el('div', { class: 'r4-guide-decision' },
          el('b', {}, 'Ici on a choisi '), ret ? guillemets(ret.libelle) : m.noeud(u).nom,
          rej.length ? ` plutôt que ${rej.map(guillemets).join(', ')}` : '',
          ', parce que ', d.raison.charAt(0).toLowerCase() + d.raison.slice(1))
      }),
      el('div', { class: 'r4-guide-boutons' }, prec, suiv),
    ]
    this.guide.replaceChildren(...enfants.filter((x): x is Node => x !== null))
    this.guide.classList.add('visible')
  }

  // ─── Panneau ☰ ────────────────────────────────────────────────────────────

  sectionsPanneau(p: PanneauRaisonnement): void {
    const aide = el('div', { class: 'r4-panneau-aide' },
      el('p', {}, 'On part de ce qui compte : les ', el('b', {}, 'résultats'), ' à droite, les ', el('b', {}, 'hypothèses et choix fondateurs'), ' à gauche. Entre les deux, le raisonnement est replié en fils.'),
      el('ul', {},
        el('li', {}, el('b', {}, '‹ pourquoi ?'), ' déplie un niveau de prémisses principales (P sur la sélection).'),
        el('li', {}, el('b', {}, 'comment ? ›'), ' montre ce qu’une hypothèse a permis (C).'),
        el('li', {}, el('b', {}, 'Lecture guidée'), ' (G) : la preuve pas à pas, ← → pour naviguer.'),
        el('li', {}, 'Ruban en bas : où l’on est dans le graphe complet ; clic = révéler.'),
      ),
    )
    p.ajouterSection('r4-lecture', 'Lecture progressive', aide, { position: 'lecture', ouverte: true })
    p.ajouterSection('r4-decisions', 'Décisions et choix de modélisation', this.listeDecisions(), { position: 'lecture', ouverte: true })
  }

  /** Nouvelle dérivation : la liste des décisions pointe vers de nouvelles unités. */
  majPanneau(p: PanneauRaisonnement): void {
    p.remplacer('r4-decisions', this.listeDecisions())
  }

  private listeDecisions(): HTMLElement {
    const m = this.m
    const pal = this.vue.palette
    const liste = el('div', { class: 'r4-decisions' })
    const unites: number[] = []
    for (let u = 0; u < m.nU; u++) {
      const t = m.noeud(u).type
      if (t === 'decision' || t === 'choix_modelisation') unites.push(u)
    }
    unites.sort((a, b) => Date.parse(m.noeud(a).cree_le) - Date.parse(m.noeud(b).cree_le))
    for (const u of unites) {
      const n = m.noeud(u)
      const ico = el('span', { class: 'r4-ico' })
      ico.innerHTML = iconeForme(FORME_TYPE[n.type], pal.couches[2]!, 13)
      const ret = n.decision?.alternatives.find((a) => a.retenue)
      const b = el('button', { class: 'r4-decision-ligne', type: 'button', title: 'Situer dans le raisonnement' },
        ico,
        el('span', {},
          el('span', { class: 'r4-decision-nom' }, n.nom),
          el('span', { class: 'r4-doux' }, ret ? ` — ✓ ${ret.libelle}` : n.choix ? ` — ${n.choix.hypothese}` : ''),
        ),
      ) as HTMLButtonElement
      b.addEventListener('click', () => this.a.reveler(u))
      liste.appendChild(b)
    }
    return liste
  }
}
