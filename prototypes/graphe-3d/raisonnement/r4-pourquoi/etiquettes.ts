// R4 · Habillage : étiquettes HTML (lisibles sans zoomer), boutons « pourquoi ? » / « comment ? »
// posés au bout des fils repliés, encarts de décision (ancrés sous le graphe, reliés au nœud par un
// trait) et calque canvas (fils, éventail des appuis, en-têtes des colonnes, axe de progression).

import {
  el, rgba, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, COUCHES,
  type ContexteDessinR, type VueRaisonnement,
} from '../../src/raisonnement'
import type { ModeleDepliage } from './modele'
import type { PlacementR4 } from './disposition'

export interface ActionsHabillage {
  pourquoi(u: number): void
  comment(u: number): void
  replier(u: number, sens: 'pourquoi' | 'comment'): void
  fermerEncart(u: number): void
  survolerUnite(u: number | null, e?: PointerEvent): void
  cliquerUnite(u: number): void
}

interface ElementsUnite {
  racine: HTMLElement
  /** Boutons de l'unité, dans un calque au-dessus de toutes les étiquettes. */
  boutons: HTMLElement
  corps: HTMLElement
  pourquoi: HTMLButtonElement
  comment: HTMLButtonElement
  replier: HTMLButtonElement
}

const TYPE_COURT: Partial<Record<string, string>> = {
  choix_modelisation: 'Choix de modélisation',
}

export class Habillage {
  readonly calque: HTMLElement
  readonly calqueBoutons: HTMLElement
  /** Encarts de décision, ancrés en bas au centre (au-dessus du ruban). */
  readonly dock: HTMLElement
  private elements = new Map<number, ElementsUnite>()
  /** Taille mesurée des étiquettes (px), pour trouver la place libre des fils. */
  private tailles = new Map<number, { w: number; h: number }>()
  private aMesurer = true
  private derniereLargeur = 0
  /** Longueur du fil (px) par unité : longue dans le vide, courte (bouton sous le nœud) si un voisin gêne. */
  private filLongueur = new Map<number, number>()
  private encartsAffiches: number[] = []
  /** Fil survolé : on dessine l'éventail de ses appuis. */
  filSurvole: { u: number; sens: 'pourquoi' | 'comment' } | null = null
  sens: 'pourquoi' | 'comment' = 'pourquoi'
  placement: PlacementR4 | null = null
  apparition = new Float32Array(0)
  /** Masquer le dock (pendant la lecture guidée, le panneau du guide le remplace). */
  dockMasque = false

  constructor(private vue: VueRaisonnement, private m: ModeleDepliage, private actions: ActionsHabillage) {
    this.calque = el('div', { class: 'r4-calque' })
    this.calqueBoutons = el('div', { class: 'r4-calque r4-calque-boutons' })
    vue.scene.append(this.calque, this.calqueBoutons)
    this.dock = el('div', { class: 'r4-dock', 'aria-live': 'polite' })
    vue.interface.appendChild(this.dock)
  }

  private R<T extends number | boolean | string>(cle: string): T {
    return this.vue.reglages.lire<T>(cle)
  }

  /** Reconstruit les éléments (nouveau graphe de lecture). */
  vider(): void {
    this.calque.replaceChildren()
    this.calqueBoutons.replaceChildren()
    this.elements.clear()
    this.tailles.clear()
    this.majDock()
  }

  /** Met à jour le contenu des éléments (après un dépliage). */
  maj(): void {
    const m = this.m
    for (let u = 0; u < m.nU; u++) {
      const vis = m.visible[u] || (this.apparition[u] ?? 0) > 0.01
      let e = this.elements.get(u)
      if (!vis) {
        if (e) e.racine.style.display = e.boutons.style.display = 'none'
        continue
      }
      if (!e) e = this.creer(u)
      this.remplir(u, e)
    }
    this.aMesurer = true
    this.majDock()
  }

  get dockVisible(): boolean {
    return this.encartsAffiches.length > 0 && !this.dockMasque
  }

  private creer(u: number): ElementsUnite {
    const racine = el('div', { class: 'r4-unite' })
    const corps = el('div', { class: 'r4-etiquette' })
    const arreter = (ev: Event) => ev.stopPropagation()
    const pourquoi = el('button', { class: 'r4-fil-bouton r4-pourquoi', type: 'button', title: 'Pourquoi ? Déplier un niveau de prémisses (P)' }) as HTMLButtonElement
    const comment = el('button', { class: 'r4-fil-bouton r4-comment', type: 'button', title: 'Comment ? Montrer ce que cela a permis (C)' }) as HTMLButtonElement
    const replier = el('button', { class: 'r4-replier', type: 'button', title: 'Replier' }, '−') as HTMLButtonElement
    for (const b of [pourquoi, comment, replier]) {
      b.addEventListener('pointerdown', arreter)
      b.addEventListener('dblclick', arreter)
    }
    pourquoi.addEventListener('click', (ev) => { ev.stopPropagation(); this.filSurvole = null; this.actions.pourquoi(u) })
    comment.addEventListener('click', (ev) => { ev.stopPropagation(); this.filSurvole = null; this.actions.comment(u) })
    replier.addEventListener('click', (ev) => {
      ev.stopPropagation()
      this.actions.replier(u, this.m.comments.has(u) && !this.m.deplies.has(u) ? 'comment' : 'pourquoi')
    })
    pourquoi.addEventListener('pointerenter', () => { this.filSurvole = { u, sens: 'pourquoi' }; this.vue.demanderRendu() })
    comment.addEventListener('pointerenter', () => { this.filSurvole = { u, sens: 'comment' }; this.vue.demanderRendu() })
    for (const b of [pourquoi, comment]) b.addEventListener('pointerleave', () => { this.filSurvole = null; this.vue.demanderRendu() })
    // L'étiquette elle-même : survol → fiche, clic → sélection (les glisser passent à la scène).
    const boutons = el('div', { class: 'r4-unite r4-boutons' })
    // Le survol lui-même passe par la vue (pointSous reconnaît les étiquettes, voir uniteSous).
    corps.addEventListener('pointerenter', () => boutons.classList.add('survol'))
    corps.addEventListener('pointerleave', () => boutons.classList.remove('survol'))
    corps.addEventListener('click', () => this.actions.cliquerUnite(u))
    racine.append(corps)
    boutons.append(pourquoi, comment, replier)
    this.calque.appendChild(racine)
    this.calqueBoutons.appendChild(boutons)
    const e: ElementsUnite = { racine, boutons, corps, pourquoi, comment, replier }
    this.elements.set(u, e)
    return e
  }

  private remplir(u: number, e: ElementsUnite): void {
    const m = this.m
    const n = m.noeud(u)
    const pal = this.vue.palette
    const unite = m.g.unites[u]!
    const cote = this.placement?.cote[u] ?? 'dessus'
    const couche = COUCHES.findIndex((c) => c.types.includes(n.type))
    const couleur = pal.couches[Math.max(0, couche)]!
    e.racine.style.display = e.boutons.style.display = ''
    e.racine.dataset.cote = e.boutons.dataset.cote = cote
    e.racine.dataset.id = e.boutons.dataset.id = n.id
    e.racine.classList.toggle('r4-focus', m.focus === u)
    e.boutons.classList.toggle('r4-focus', m.focus === u)
    e.racine.classList.toggle('r4-fondation', m.estFondation(u))
    e.racine.classList.toggle('r4-conclusion', n.type === 'resultat' || n.type === 'theoreme')
    e.racine.classList.toggle('r4-decision', n.type === 'decision' || n.type === 'choix_modelisation')
    e.racine.classList.toggle('r4-abandon', n.piste === 'abandonnee')
    e.racine.classList.toggle('r4-encart-ouvert', this.encartsAffiches.includes(u))
    // Méta : type · statut · confiance.
    const statut = el('span', { class: `r4-statut statut-${n.statut}`, title: `${LIBELLES_STATUT[n.statut]} · validation ${LIBELLES_VALIDATION[n.validation]} · IC ${pct(n.confiance.bas)}–${pct(n.confiance.haut)}` })
    const meta = el('div', { class: 'r4-meta' },
      el('span', { class: 'r4-type', style: `color:${couleur}` }, unite.genre === 'etape' ? `${LIBELLES_TYPE[n.type]} · ${unite.membres.length} étapes` : TYPE_COURT[n.type] ?? LIBELLES_TYPE[n.type]),
      statut,
      el('span', { class: 'r4-conf' }, n.statut === 'valide' ? pct(n.confiance.estimation) : `${LIBELLES_STATUT[n.statut].toLowerCase()} · ${pct(n.confiance.estimation)}`),
    )
    // Fondations : une seule ligne (le groupe donne le type), pastille de statut et confiance.
    const lignes: HTMLElement[] = m.estFondation(u)
      ? [el('div', { class: 'r4-nom' }, el('span', { class: `r4-statut statut-${n.statut}`, title: statut.title }), ' ', n.nom, el('span', { class: 'r4-conf-inline' }, ` ${n.statut === 'valide' ? '' : LIBELLES_STATUT[n.statut].toLowerCase() + ' · '}${pct(n.confiance.estimation)}`))]
      : [meta, el('div', { class: 'r4-nom' }, n.nom)]
    if (n.decision) {
      const ret = n.decision.alternatives.find((a) => a.retenue)
      const rej = n.decision.alternatives.filter((a) => !a.retenue)
      if (ret) lignes.push(el('div', { class: 'r4-choix r4-retenu' }, el('b', {}, '✓ '), ret.libelle, rej.length ? el('span', { class: 'r4-doux' }, ` plutôt que ${rej.map((a) => a.libelle).join(', ')}`) : null))
    } else if (n.choix?.alternatives?.length) {
      lignes.push(el('div', { class: 'r4-choix r4-alternatives' }, el('span', { class: 'r4-doux' }, `plutôt que ${n.choix.alternatives.join(', ')}`)))
    }
    e.corps.replaceChildren(...lignes)
    if (e.pourquoi.classList.contains('compact')) e.corps.appendChild(e.pourquoi)
    e.corps.style.setProperty('--couleur', couleur)

    // Boutons de fil.
    const fp = m.filPourquoi(u)
    const fc = m.filComment(u)
    e.pourquoi.hidden = !(fp && this.sens === 'pourquoi' && !m.estFondation(u))
    e.comment.hidden = !(fc && (this.sens === 'comment' || m.estFondation(u)))
    if (fp) e.pourquoi.replaceChildren(el('span', { class: 'r4-fleche' }, '‹'), ' pourquoi ?', el('span', { class: 'r4-compte' }, ` · ${fp.etapes}`))
    if (fc) e.comment.replaceChildren('comment ? ', el('span', { class: 'r4-fleche' }, '›'))
    e.comment.classList.toggle('discret', this.sens === 'pourquoi' || m.estFondation(u))
    e.replier.hidden = !((m.deplies.has(u) && !fp) || (m.comments.has(u) && !fc))
  }

  /** Unité dont l'étiquette est sous le point (px de la scène), ou null. */
  uniteSous(x: number, y: number): number | null {
    const sc = this.vue.scene.getBoundingClientRect()
    let meilleur: number | null = null
    for (const [u, e] of this.elements) {
      if (e.racine.style.visibility === 'hidden' || e.racine.style.display === 'none' || (this.apparition[u] ?? 0) < 0.3) continue
      const r = e.corps.getBoundingClientRect()
      const cx = x + sc.left, cy = y + sc.top
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) meilleur = u
    }
    return meilleur
  }

  /** Arêtes longues (≥ 2 colonnes, hors fondations) dessinées en arc sur le calque, pas par sigma. */
  arcs: { s: number; c: number }[] = []
  /** Unités du fil d'Ariane (arêtes en accent). */
  ariane = new Set<number>()

  // ─── Encarts de décision (dock) ────────────────────────────────────────────

  private majDock(): void {
    const m = this.m
    const liste = this.R<boolean>('encarts') ? [...m.encarts].filter((u) => u < m.nU && m.visible[u] && m.noeud(u).decision).slice(0, 2) : []
    const identique = liste.length === this.encartsAffiches.length && liste.every((u, k) => u === this.encartsAffiches[k])
    this.encartsAffiches = liste
    for (const [u, e] of this.elements) e.racine.classList.toggle('r4-encart-ouvert', liste.includes(u))
    this.dock.classList.toggle('visible', this.dockVisible)
    if (identique && this.dock.childElementCount === liste.length) return
    this.dock.replaceChildren(...liste.map((u) => this.creerEncart(u)))
  }

  private creerEncart(u: number): HTMLElement {
    const n = this.m.noeud(u)
    const d = n.decision!
    const ret = d.alternatives.find((a) => a.retenue)
    const rej = d.alternatives.filter((a) => !a.retenue)
    const fermer = el('button', { class: 'r4-encart-fermer', type: 'button', title: 'Fermer', 'aria-label': 'Fermer' }, '×')
    fermer.addEventListener('click', () => this.actions.fermerEncart(u))
    const carte = el('div', { class: 'r4-encart', 'data-unite': String(u) },
      fermer,
      el('div', { class: 'r4-encart-titre' }, 'Ici, on a fait un choix · ', el('span', { class: 'r4-encart-nom' }, n.nom)),
      el('div', { class: 'r4-encart-question' }, d.question),
      el('div', { class: 'r4-encart-corps' },
        ret ? el('span', { class: 'r4-encart-retenu' }, el('b', {}, 'On a choisi '), ret.libelle) : null,
        rej.length ? el('span', { class: 'r4-encart-rejete' }, el('b', {}, ' plutôt que '), rej.map((a, k) => el('span', { title: a.raison ?? '' }, k ? ', ' : '', a.libelle))) : null,
        el('span', { class: 'r4-encart-raison' }, el('b', {}, ', parce que '), minuscule(d.raison)),
      ),
    )
    carte.addEventListener('pointerenter', () => this.actions.survolerUnite(u))
    carte.addEventListener('pointerleave', () => this.actions.survolerUnite(null))
    return carte
  }

  // ─── Position à chaque image ───────────────────────────────────────────────

  /** Place les éléments sur la projection courante. */
  positionner(): void {
    const v = this.vue
    const pr = v.projection
    const pxCol = v.camera.pixelsParUnite() * this.R<number>('ecartColonnes')
    const largeur = this.R<number>('largeurEtiquette')
    const largeurDessus = Math.round(Math.max(110, Math.min(largeur, pxCol - 26)))
    if (largeurDessus !== this.derniereLargeur) { this.derniereLargeur = largeurDessus; this.aMesurer = true }
    const Lmax = this.longueurFil()
    const troisD = v.extrusion > 0.4
    this.calque.classList.toggle('r4-3d', troisD)
    this.calqueBoutons.classList.toggle('r4-3d', troisD)
    this.calque.style.setProperty('--taille', `${this.R<number>('tailleEtiquette')}px`)
    const pl = this.placement
    const affiches: number[] = []
    for (const [u, e] of this.elements) {
      const a = this.apparition[u] ?? 0
      if (a < 0.02 || !pr.visible[u] || e.racine.style.display === 'none') {
        e.racine.style.visibility = e.boutons.style.visibility = 'hidden'
        continue
      }
      affiches.push(u)
      e.racine.style.visibility = e.boutons.style.visibility = ''
      const r = v.tailleAffichee[u]! || 6
      e.racine.style.transform = e.boutons.style.transform = `translate(${pr.x[u]!.toFixed(1)}px, ${pr.y[u]!.toFixed(1)}px)`
      e.racine.style.opacity = e.boutons.style.opacity = a.toFixed(3)
      e.racine.style.setProperty('--r', `${r.toFixed(1)}px`)
      e.boutons.style.setProperty('--r', `${r.toFixed(1)}px`)
      const cote = e.racine.dataset.cote
      e.corps.style.maxWidth = `${cote === 'dessus' ? largeurDessus : cote === 'gauche' ? largeur + 40 : largeur}px`
      e.racine.style.zIndex = this.m.focus === u ? '20' : ''
    }
    if (this.aMesurer) {
      for (const u of affiches) {
        const c = this.elements.get(u)!.corps
        this.tailles.set(u, { w: c.offsetWidth, h: c.offsetHeight })
      }
      this.aMesurer = false
    }
    // Longueur des fils « pourquoi ? » : place libre à gauche, à hauteur du nœud.
    this.filLongueur.clear()
    const bande = 12
    for (const u of affiches) {
      const e = this.elements.get(u)!
      if (e.pourquoi.hidden || troisD) {
        e.boutons.style.setProperty('--fil', `${Lmax.toFixed(0)}px`)
        continue
      }
      const x = pr.x[u]!, y = pr.y[u]!, r = v.tailleAffichee[u]! || 6
      let libre = Infinity
      for (const q of affiches) {
        if (q === u) continue
        const xq = pr.x[q]!, yq = pr.y[q]!, rq = v.tailleAffichee[q]! || 6
        if (xq >= x - 2) continue
        const t = this.tailles.get(q) ?? { w: largeur, h: 40 }
        // Boîtes occupées par q : son nœud et son étiquette.
        const boites: [number, number, number, number][] = [[xq - rq, yq - rq, xq + rq, yq + rq]]
        const cote = pl?.cote[q]
        if (cote === 'dessus') boites.push([xq - t.w / 2, yq - rq - 5 - t.h, xq + t.w / 2, yq - rq - 5])
        else if (cote === 'droite') boites.push([xq + rq + 10, yq - t.h / 2, xq + rq + 10 + t.w, yq + t.h / 2])
        else if (cote === 'gauche' && !this.elements.get(q)!.comment.hidden) boites.push([xq + rq, yq - 10, xq + rq + 96, yq + 10])
        for (const [x0, y0, x1, y1] of boites) {
          if (y1 < y - bande || y0 > y + bande) continue
          if (x0 >= x - r) continue
          libre = Math.min(libre, x - r - x1)
        }
      }
      const place = libre - 118
      // Hystérésis : on ne rebascule pas à chaque image quand la place est juste.
      const etaitCompact = e.pourquoi.classList.contains('compact')
      const long = etaitCompact ? place >= 50 : place >= 28
      const L = long ? Math.min(Lmax, place) : 10
      this.filLongueur.set(u, L)
      if (long === etaitCompact) {
        // Bouton court : il entre dans l'étiquette (dernière ligne), où la place est garantie.
        e.pourquoi.classList.toggle('compact', !long)
        if (long) e.boutons.prepend(e.pourquoi)
        else e.corps.appendChild(e.pourquoi)
        this.aMesurer = true
      }
      e.boutons.style.setProperty('--fil', `${L.toFixed(0)}px`)
    }
  }

  longueurFil(): number {
    const pxCol = this.vue.camera.pixelsParUnite() * this.R<number>('ecartColonnes')
    return Math.max(34, Math.min(120, pxCol * 0.36))
  }

  // ─── Calque canvas ─────────────────────────────────────────────────────────

  /** Calque canvas « dessous » : fils repliés, éventail des appuis, traits des encarts, en-têtes, axe. */
  dessiner({ ctx, vue, projection: pr }: ContexteDessinR): void {
    const m = this.m
    const pal = vue.palette
    const pl = this.placement
    if (!pl) return
    const L = this.longueurFil()
    const opFils = this.R<number>('opaciteFils')
    ctx.save()
    ctx.font = `500 10.5px ${pal.police}`
    // Fils repliés.
    for (let u = 0; u < m.nU; u++) {
      const a = this.apparition[u] ?? 0
      if (a < 0.05 || !m.visible[u] || !pr.visible[u]) continue
      const r = vue.tailleAffichee[u]! || 6
      const x = pr.x[u]!, y = pr.y[u]!
      const fp = m.filPourquoi(u)
      if (fp && this.sens === 'pourquoi' && !m.estFondation(u)) {
        const Lu = this.filLongueur.get(u) ?? L
        this.fil(ctx, x - r - 2, y, x - r - Lu, y, Lu > 20 ? fp.etapes : 0, a * opFils, -1)
      }
      const fc = m.filComment(u)
      if (fc && (this.sens === 'comment' || m.estFondation(u))) {
        const discret = this.sens === 'pourquoi' || m.estFondation(u)
        this.fil(ctx, x + r + 2, y, x + r + (discret ? 10 : L), y, discret ? 0 : fc.etapes, a * opFils * (discret ? 0.6 : 1), 1)
      }
    }
    // Arcs des arêtes longues : ils contournent les rangées au lieu de les traverser.
    if (vue.extrusion < 0.5 && this.arcs.length) {
      let ymin = Infinity, ymax = -Infinity
      for (let u = 0; u < m.nU; u++) if (m.visible[u] && pr.visible[u]) { ymin = Math.min(ymin, pr.y[u]!); ymax = Math.max(ymax, pr.y[u]!) }
      const ymil = (ymin + ymax) / 2
      const R = vue.reglages.valeurs
      for (const { s, c } of this.arcs) {
        const a = Math.min(this.apparition[s] ?? 0, this.apparition[c] ?? 0)
        if (a < 0.02 || !pr.visible[s] || !pr.visible[c]) continue
        const rs = vue.tailleAffichee[s]! || 6, rc = vue.tailleAffichee[c]! || 6
        const x0 = pr.x[s]! + rs, y0 = pr.y[s]!, x1 = pr.x[c]! - rc - 2, y1 = pr.y[c]!
        const haut = (y0 + y1) / 2 <= ymil ? -1 : 1
        const h = haut * (26 + 0.1 * Math.abs(x1 - x0))
        const k = Math.min(140, Math.abs(x1 - x0) * 0.3)
        let couleur = pal.arete, alpha = R.opaciteAretes * 0.9, epaisseur = R.epaisseurArete
        const lignee = vue.ligneeActive ? vue.lignee[s]! > 0 && vue.lignee[c]! > 0 : false
        if (vue.survol === s || vue.survol === c) { couleur = pal.accent; alpha = 0.9 }
        else if (lignee) { couleur = vue.lignee[s] === 2 || vue.lignee[c] === 2 ? pal.descendant : pal.ancetre; alpha = 0.9; epaisseur *= 1.5 }
        else if (vue.ligneeActive) alpha *= R.opaciteContexte
        else if (this.ariane.has(s) && this.ariane.has(c)) { couleur = pal.accent; alpha = 0.85; epaisseur *= 1.6 }
        ctx.strokeStyle = rgba(couleur, alpha * a)
        ctx.fillStyle = rgba(couleur, alpha * a)
        ctx.lineWidth = epaisseur
        const c1x = x0 + k, c1y = y0 + h, c2x = x1 - k, c2y = y1 + h
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x1, y1)
        ctx.stroke()
        // Pointe de flèche.
        const ang = Math.atan2(y1 - c2y, x1 - c2x), L = 4 + epaisseur * 3, W = 2 + epaisseur * 1.6
        ctx.beginPath()
        ctx.moveTo(x1 + 2, y1)
        ctx.lineTo(x1 + 2 - L * Math.cos(ang) + W * Math.sin(ang), y1 - L * Math.sin(ang) - W * Math.cos(ang))
        ctx.lineTo(x1 + 2 - L * Math.cos(ang) - W * Math.sin(ang), y1 - L * Math.sin(ang) + W * Math.cos(ang))
        ctx.closePath()
        ctx.fill()
      }
    }
    // Éventail : les fondations (ou suites) sur lesquelles repose le fil survolé.
    const fs = this.filSurvole
    if (fs && m.visible[fs.u]) {
      const f = fs.sens === 'pourquoi' ? m.filPourquoi(fs.u) : m.filComment(fs.u)
      if (f) {
        const r = vue.tailleAffichee[fs.u]! || 6
        const Lu = fs.sens === 'pourquoi' ? this.filLongueur.get(fs.u) ?? L : L
        const x0 = pr.x[fs.u]! + (fs.sens === 'pourquoi' ? -r - Lu : r + L), y0 = pr.y[fs.u]!
        for (const q of f.appuis) {
          if (!pr.visible[q]) continue
          const x1 = pr.x[q]!, y1 = pr.y[q]!
          const mx = (x0 + x1) / 2
          ctx.strokeStyle = rgba(pal.accent, 0.5)
          ctx.lineWidth = 1.2
          ctx.setLineDash([2, 4])
          ctx.beginPath()
          ctx.moveTo(x0, y0)
          ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.strokeStyle = rgba(pal.accent, 0.75)
          ctx.beginPath()
          ctx.arc(x1, y1, (vue.tailleAffichee[q]! || 6) + 4, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }
    // Traits des encarts ancrés vers leur décision.
    if (this.dockVisible) {
      const sc = vue.scene.getBoundingClientRect()
      for (const carte of this.dock.children) {
        const u = Number((carte as HTMLElement).dataset.unite)
        if (!(u >= 0) || !pr.visible[u] || (this.apparition[u] ?? 0) < 0.3) continue
        const rc = carte.getBoundingClientRect()
        const xa = rc.left + rc.width / 2 - sc.left, ya = rc.top - sc.top
        const xn = pr.x[u]!, yn = pr.y[u]! + (vue.tailleAffichee[u]! || 6) + 2
        const c = pal.couches[2]!
        ctx.strokeStyle = rgba(c, 0.55)
        ctx.lineWidth = 1.2
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(xa, ya)
        ctx.bezierCurveTo(xa, (ya + yn) / 2, xn, (ya + yn) / 2, xn, yn)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = rgba(c, 0.8)
        ctx.beginPath()
        ctx.arc(xa, ya, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // En-têtes des groupes de fondations et axe de progression (plan 2D seulement).
    if (vue.extrusion < 0.3) {
      const alpha = 1 - vue.extrusion * 3
      ctx.font = `600 10.5px ${pal.police}`
      ctx.fillStyle = rgba(pal.texteDoux, 0.95 * alpha)
      ctx.textBaseline = 'bottom'
      ctx.textAlign = 'right'
      for (const t of pl.enTetes) {
        const p = t.point
        if (!pr.visible[p]) continue
        const r = vue.tailleAffichee[p]! || 6
        const h = this.tailles.get(p)?.h ?? 32
        ctx.fillText(`${t.groupe.toUpperCase()} · ${t.nb}`, pr.x[p]! + r, pr.y[p]! - h / 2 - 6)
      }
      let ymax = -Infinity, xg = Infinity, xd = -Infinity
      for (let u = 0; u < m.nU; u++) if (m.visible[u] && pr.visible[u]) {
        ymax = Math.max(ymax, pr.y[u]!)
        xg = Math.min(xg, pr.x[u]!)
        xd = Math.max(xd, pr.x[u]!)
      }
      if (Number.isFinite(ymax) && xd - xg > 200) {
        const y = ymax + 32
        ctx.strokeStyle = rgba(pal.texteDoux, 0.35 * alpha)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(xg, y)
        ctx.lineTo(xd, y)
        ctx.moveTo(xd - 6, y - 4)
        ctx.lineTo(xd, y)
        ctx.lineTo(xd - 6, y + 4)
        ctx.stroke()
        ctx.textBaseline = 'top'
        ctx.fillStyle = rgba(pal.texteDoux, 0.85 * alpha)
        ctx.font = `500 10.5px ${pal.police}`
        ctx.textAlign = 'left'
        ctx.fillText('FONDATIONS', xg, y + 6)
        ctx.textAlign = 'center'
        ctx.fillText('profondeur logique : chaque colonne est un pas de déduction', (xg + xd) / 2, y + 6)
        ctx.textAlign = 'right'
        ctx.fillText('RÉSULTATS', xd, y + 6)
      }
    }
    ctx.restore()
  }

  /** Un fil replié : pointillés qui s'estompent, compteur « n étapes » sous le fil. */
  private fil(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, etapes: number, alpha: number, sens: number): void {
    const pal = this.vue.palette
    const grad = ctx.createLinearGradient(x0, y0, x1, y1)
    grad.addColorStop(0, rgba(pal.texteDoux, 0.85 * alpha))
    grad.addColorStop(1, rgba(pal.texteDoux, 0.15 * alpha))
    ctx.strokeStyle = grad
    ctx.lineWidth = 1.4
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    ctx.setLineDash([])
    if (etapes > 0 && Math.abs(x1 - x0) > 30) {
      ctx.fillStyle = rgba(pal.texteDoux, Math.min(1, alpha * 1.4))
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(`${etapes} étape${etapes > 1 ? 's' : ''}`, (x0 + x1) / 2 + sens * 2, y0 + 5)
    }
  }
}

function pct(v: number): string {
  return `${Math.round(v * 100)} %`
}

function minuscule(s: string): string {
  return s ? s[0]!.toLowerCase() + s.slice(1) : s
}
