// R5 · Rendu de la carte d'arguments : cartes HTML synchronisées avec la caméra de la vue,
// flèches, garanties, objections et couloirs dessinés sur le calque « dessous ».
//
// Sigma reste le moteur : il projette les positions (vue.projection), gère caméra, survol, clic,
// lignée et 3D. Les points des cartes y sont simplement cachés ; chaque carte est un <div> posé
// au-dessus, dont le contenu dépend de sa taille à l'écran (zoom sémantique) :
//   niveau 0  conclusion seule (+ qualificatif : statut, confiance) ;
//   niveau 1  + raisons principales, données (H) et vérifications ;
//   niveau 2  + énoncé, garantie, réserves, alternatives d'une décision.

import {
  el, rgba, couper, LIBELLES_TYPE, LIBELLES_VALIDATION,
  type ContexteDessinR, type VueRaisonnement,
} from '../../src/raisonnement'
import type { Carte, ModeleArguments } from './arguments'
import { versMonde, type MiseEnPage } from './mise-en-page'

export interface EtatR5 {
  modele: ModeleArguments | null
  mep: MiseEnPage | null
  /** Étiquette (nœud H / M) sous le pointeur. */
  survolEtiquette: number | null
}

interface Rect { g: number; h: number; l: number; H: number; cx: number; cy: number }

export class RenduCartes {
  readonly calque: HTMLDivElement
  private cartes: HTMLDivElement[] = []
  private cles: string[] = []
  private etats: string[] = []
  private blocDonnees: HTMLDivElement | null = null
  private bandeau: HTMLDivElement | null = null
  /** Rectangles écran des cartes (image courante). */
  rects: Rect[] = []
  /** Opacité affichée de chaque carte (image courante). */
  opacites = new Float32Array(0)
  niveaux = new Int8Array(0)
  /** Cartes mises en avant par le survol d'une étiquette H / M (portée). */
  private portee: Set<number> | null = null

  constructor(private vue: VueRaisonnement, private etat: EtatR5) {
    this.calque = el('div', { class: 'r5-calque' })
    vue.scene.appendChild(this.calque)
  }

  private lire<T extends number | boolean | string>(cle: string): T {
    return this.vue.reglages.lire<T>(cle)
  }

  /** Reconstruit les éléments (nouveau modèle ou nouvelle mise en page). */
  reconstruire(): void {
    this.calque.replaceChildren()
    this.cartes = []
    this.cles = []
    this.etats = []
    this.blocDonnees = this.bandeau = null
    this.etiquettes = []
    this.etat.survolEtiquette = null
    this.portee = null
    const m = this.etat.modele
    if (!m || !this.etat.mep) return
    for (const c of m.cartes) {
      const d = el('div', { class: `r5-carte genre-${c.genre}` })
      this.calque.appendChild(d)
      this.cartes.push(d)
      this.cles.push('')
      this.etats.push('')
    }
    this.blocDonnees = this.construireDonnees(m)
    this.bandeau = this.construireBandeau(m)
    this.calque.append(this.blocDonnees, this.bandeau)
    this.rects = m.cartes.map(() => ({ g: 0, h: 0, l: 0, H: 0, cx: 0, cy: 0 }))
    this.opacites = new Float32Array(m.cartes.length)
    this.niveaux = new Int8Array(m.cartes.length)
  }

  /** Étiquettes H / M : leurs éléments servent au test de survol (le calque ne reçoit pas les événements). */
  private etiquettes: { noeud: number; el: HTMLElement }[] = []

  private etiquette(noeud: number, contenu: HTMLElement): HTMLElement {
    this.etiquettes.push({ noeud, el: contenu })
    return contenu
  }

  /** Étiquette H / M sous un point de la scène (px), ou null. */
  etiquetteSous(x: number, y: number): number | null {
    if (this.calque.style.display === 'none') return null
    const sc = this.vue.scene.getBoundingClientRect()
    for (const e of this.etiquettes) {
      if (e.el.offsetParent === null) continue
      const r = e.el.getBoundingClientRect()
      if (x >= r.left - sc.left && x <= r.right - sc.left && y >= r.top - sc.top && y <= r.bottom - sc.top) return e.noeud
    }
    return null
  }

  survolerEtiquette(noeud: number | null): void {
    if (noeud === this.etat.survolEtiquette) return
    for (const e of this.etiquettes) e.el.classList.toggle('survolee', e.noeud === noeud)
    this.etat.survolEtiquette = noeud
    this.portee = null
    if (noeud !== null) {
      const m = this.etat.modele!
      const mod = m.modeles.find((x) => x.noeud === noeud)
      this.portee = new Set(mod ? mod.cartes : m.cartes.filter((c) => c.donnees.some((d) => d.noeud === noeud)).map((c) => c.unite))
    }
    this.vue.demanderRendu()
  }

  private construireDonnees(m: ModeleArguments): HTMLDivElement {
    const j = this.vue.justification
    return el('div', { class: 'r5-donnees' },
      el('div', { class: 'r5-bloc-titre' }, 'Données du problème'),
      m.donnees.map((d) => {
        const n = j.noeuds[d.noeud]!
        return this.etiquette(d.noeud, el('div', { class: `r5-h statut-${n.statut}` }, el('b', {}, d.code), el('span', {}, n.nom)))
      }),
    )
  }

  private construireBandeau(m: ModeleArguments): HTMLDivElement {
    const j = this.vue.justification
    return el('div', { class: 'r5-bandeau' },
      el('div', { class: 'r5-bandeau-titre' }, 'Hypothèses de travail', el('span', {}, 'choix de modélisation (M) · survol : portée')),
      el('div', { class: 'r5-bandeau-puces' }, m.modeles.map((x) => {
        const n = j.noeuds[x.noeud]!
        // Décision qui a produit ce choix (prémisse de type décision).
        const dec = j.entrantes[x.noeud]!.map((e) => j.noeuds[j.aretes[e]!.source]!).find((s) => s.type === 'decision')
        return this.etiquette(x.noeud, el('div', { class: 'r5-m', title: n.choix?.hypothese ?? n.enonce },
          el('b', {}, x.code), el('span', {}, n.nom),
          dec ? el('i', { class: 'r5-m-dec' }, `← décision`) : null,
          el('em', {}, `${x.cartes.length}`)))
      })),
    )
  }

  // ─── Image ─────────────────────────────────────────────────────────────────

  /** Calque « dessous » : couloirs, flèches, garanties, liens d'objection ; puis mise à jour du DOM. */
  dessiner(c: ContexteDessinR): void {
    const { vue } = this
    const m = this.etat.modele, mp = this.etat.mep
    const actif = !!m && !!mp && vue.nU === m.cartes.length
    this.calque.style.display = actif ? '' : 'none'
    if (!actif) return
    this.calculerRects(c)
    this.dessinerCouloirs(c)
    this.dessinerFleches(c)
    this.dessinerLiens(c)
    this.majCartes()
    this.majBlocs(c)
  }

  private calculerRects({ projection: pr }: ContexteDessinR): void {
    const v = this.vue, mp = this.etat.mep!, m = this.etat.modele!
    const k = v.camera.pixelsParUnite() * mp.echelle
    const e = v.extrusion
    const R = v.reglages.valeurs
    const seuil1 = this.lire<number>('r5SeuilRaisons'), seuil2 = this.lire<number>('r5SeuilDetails')
    for (let u = 0; u < m.cartes.length; u++) {
      const s = pr.echelle[u]! || 1
      const l = mp.p.largeurCarte * k * s * (e > 0.02 ? 1 - 0.25 * e : 1)
      const h = mp.p.hauteurCarte * k * s * (e > 0.02 ? 1 - 0.25 * e : 1)
      const r = this.rects[u]!
      r.cx = pr.x[u]!
      r.cy = pr.y[u]!
      r.l = l
      r.h = h
      r.g = r.cx - l / 2
      r.H = r.cy - h / 2
      this.niveaux[u] = e > 0.3 ? 0 : l >= seuil2 ? 2 : l >= seuil1 ? 1 : 0
      // Opacité : présence, piste abandonnée, lignée, portée survolée, brouillard 3D.
      let o = v.presence[u] ?? 1
      if (pr.visible[u] !== 1) o = 0
      const lg = v.lignee[u]!
      if (v.ligneeActive && lg === 0) o *= Math.max(0.12, R.opaciteContexte)
      if (this.portee && !this.portee.has(u)) o *= 0.28
      if (e > 0.02 && R.brouillard > 0) o *= 1 - R.brouillard * v.camera.perspective * pr.profondeurNormalisee(u) * 0.8
      if (R.liensComplets) o *= 0.55
      this.opacites[u] = o
    }
  }

  /** Point de mise en page → écran. */
  private ecran(x: number, y: number, prof = 0): { x: number; y: number } {
    return this.vue.camera.projeterPoint(versMonde(this.etat.mep!, x, y, prof))
  }

  private dessinerCouloirs({ ctx, vue }: ContexteDessinR): void {
    const mp = this.etat.mep!
    const a = 1 - vue.extrusion
    if (!mp.p.couloirs || a < 0.05 || !this.lire<boolean>('r5Couloirs')) return
    const pal = vue.palette
    const z = mp.zone
    ctx.save()
    mp.couloirs.forEach((co, k) => {
      const p0 = this.ecran(z.x - z.l / 2, co.haut - 8), p1 = this.ecran(z.x + z.l / 2, co.bas + 8)
      const w = p1.x - p0.x, h = p1.y - p0.y
      ctx.fillStyle = rgba(pal.texte, (k % 2 ? 0.018 : 0.034) * a)
      ctx.beginPath()
      ctx.roundRect(p0.x, p0.y, w, h, 10)
      ctx.fill()
      if (co.abandonne) {
        // Hachures : piste abandonnée.
        ctx.save()
        ctx.clip()
        ctx.strokeStyle = rgba(pal.texteDoux, 0.09 * a)
        ctx.lineWidth = 1
        for (let x = p0.x - h; x < p0.x + w; x += 10) {
          ctx.beginPath()
          ctx.moveTo(x, p0.y + h)
          ctx.lineTo(x + h, p0.y)
          ctx.stroke()
        }
        ctx.restore()
      }
      const cartes = this.etat.modele!.cartes.filter((c) => mp.couloir[c.unite] === k)
      const nb = cartes.length
      const col0 = Math.min(...cartes.map((c) => mp.colonne[c.unite]!))
      if (col0 >= 1) {
        // Première colonne libre : libellé horizontal, lisible, en haut à gauche du couloir.
        const pas = (mp.p.largeurCarte + mp.p.ecartColonnes) * vue.camera.pixelsParUnite() * mp.echelle
        const largeur = pas * col0 - 20
        ctx.textBaseline = 'top'
        ctx.font = `650 11px ${pal.police}`
        const mots = co.nom.toUpperCase().split(' ')
        let ligne = '', yl = p0.y + 9
        for (const mot of mots) {
          const essai = ligne ? `${ligne} ${mot}` : mot
          if (ctx.measureText(essai).width > largeur && ligne) {
            ctx.fillStyle = rgba(co.abandonne ? pal.texteDoux : pal.texte, (co.abandonne ? 0.75 : 0.6) * a)
            ctx.fillText(ligne, p0.x + 12, yl)
            ligne = mot
            yl += 14
          } else ligne = essai
        }
        ctx.fillStyle = rgba(co.abandonne ? pal.texteDoux : pal.texte, (co.abandonne ? 0.75 : 0.6) * a)
        ctx.fillText(ligne, p0.x + 12, yl)
        ctx.font = `11px ${pal.police}`
        ctx.fillStyle = rgba(pal.texteDoux, 0.65 * a)
        ctx.fillText(`${nb} carte${nb > 1 ? 's' : ''}${co.abandonne ? ' · piste close' : ''}`, p0.x + 12, yl + 15)
        return
      }
      // Libellé vertical dans la marge gauche du couloir (ne gêne pas les cartes).
      const hauteur = h - 12
      ctx.save()
      ctx.translate(p0.x + 13, p0.y + h - 6)
      ctx.rotate(-Math.PI / 2)
      ctx.textBaseline = 'middle'
      let taille = 11
      const texte = co.nom.toUpperCase()
      ctx.font = `650 ${taille}px ${pal.police}`
      while (taille > 8 && ctx.measureText(texte).width > hauteur) ctx.font = `650 ${--taille}px ${pal.police}`
      let t = texte
      while (t.length > 4 && ctx.measureText(t).width > hauteur) t = t.slice(0, -2) + '…'
      ctx.fillStyle = rgba(co.abandonne ? pal.texteDoux : pal.texte, (co.abandonne ? 0.7 : 0.55) * a)
      ctx.fillText(t, 0, 0)
      const lt = ctx.measureText(t).width
      ctx.font = `${Math.min(10, taille)}px ${pal.police}`
      ctx.fillStyle = rgba(pal.texteDoux, 0.55 * a)
      if (lt + 60 < hauteur) ctx.fillText(`· ${nb} carte${nb > 1 ? 's' : ''}`, lt + 6, 0)
      ctx.restore()
    })
    ctx.restore()
  }

  /** Flèches entre cartes : la conclusion d'une carte devient la raison de la suivante. */
  private dessinerFleches({ ctx, vue }: ContexteDessinR): void {
    const g = vue.lecture, m = this.etat.modele!, mp = this.etat.mep!
    const pal = vue.palette
    const courbure = this.lire<number>('r5Courbure')
    const alphaBase = this.lire<number>('r5OpaciteFleches')
    const R = this.rects
    const survol = vue.survol !== null && vue.survol < m.cartes.length ? vue.survol : null
    // Ports : les flèches entrantes (sortantes) sont réparties sur le bord gauche (droit).
    const ports = (u: number, liste: number[], cote: 'e' | 's') => {
      const autres = liste.map((e) => (cote === 'e' ? g.aretes[e]!.source : g.aretes[e]!.cible)).filter((v) => mp.colonne[v] !== mp.colonne[u])
      autres.sort((a, b) => R[a]!.cy - R[b]!.cy)
      return autres
    }
    ctx.save()
    ctx.lineCap = 'round'
    for (const a of g.aretes) {
      const s = a.source, t = a.cible
      const S = R[s]!, T = R[t]!
      const op = Math.min(this.opacites[s]!, this.opacites[t]!)
      if (op < 0.02) continue
      const cs = m.cartes[s]!
      const lg = vue.ligneeActive && vue.lignee[s]! > 0 && vue.lignee[t]! > 0 && !(vue.lignee[s] === 2 && vue.lignee[t] === 1) && !(vue.lignee[s] === 1 && vue.lignee[t] === 2)
      const incident = survol !== null && (s === survol || t === survol)
      let couleur = pal.arete, alpha = alphaBase, largeur = 1.4, tirets: number[] = []
      if (cs.genre === 'decision') { couleur = pal.couches[2]!; alpha = Math.min(1, alphaBase + 0.1) }
      if (cs.etat === 'refutee' || cs.abandonnee) { tirets = [5, 4]; alpha *= 0.75 }
      if (incident) { couleur = pal.accent; alpha = 0.95; largeur = 2.2 }
      if (lg) { couleur = vue.lignee[s] === 1 || vue.lignee[t] === 1 ? pal.ancetre : pal.descendant; alpha = 0.95; largeur = 2.4 }
      else if (vue.ligneeActive) alpha *= 0.35
      ctx.strokeStyle = rgba(couleur, alpha * op)
      ctx.fillStyle = rgba(couleur, alpha * op)
      ctx.lineWidth = largeur
      ctx.setLineDash(tirets)
      let x0: number, y0: number, x1: number, y1: number, dir: [number, number]
      ctx.beginPath()
      if (mp.colonne[s] === mp.colonne[t]) {
        // Lien vertical (décision au-dessus de la carte qu'elle gouverne).
        const bas = T.cy > S.cy
        x0 = S.cx - S.l * 0.18; x1 = T.cx - T.l * 0.18
        y0 = bas ? S.H + S.h : S.H; y1 = bas ? T.H : T.H + T.h
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        dir = [0, bas ? 1 : -1]
      } else {
        const sort = ports(s, g.sortantes[s]!, 's'), ent = ports(t, g.entrantes[t]!, 'e')
        const is = sort.indexOf(t), it = ent.indexOf(s)
        const pasS = Math.min(12, S.h / (sort.length + 1)), pasT = Math.min(12, T.h / (ent.length + 1))
        x0 = S.g + S.l; y0 = S.cy + (is - (sort.length - 1) / 2) * pasS
        x1 = T.g - 1; y1 = T.cy + (it - (ent.length - 1) / 2) * pasT
        const dx = Math.max(24, (x1 - x0) * courbure)
        ctx.moveTo(x0, y0)
        ctx.bezierCurveTo(x0 + dx, y0, x1 - dx, y1, x1 - 6, y1)
        ctx.lineTo(x1, y1)
        dir = [1, 0]
      }
      ctx.stroke()
      ctx.setLineDash([])
      fleche(ctx, x1, y1, dir, 4 + largeur * 1.6)
    }
    // Garanties (Toulmin) : écrites en petit près de l'entrée de la carte.
    if (this.lire<boolean>('r5Garanties')) {
      const j = vue.justification
      ctx.font = `italic 10.5px ${pal.police}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      const ecart = (mp.p.ecartColonnes) * vue.camera.pixelsParUnite() * mp.echelle
      for (const c of m.cartes) {
        const u = c.unite
        if (this.niveaux[u]! < 1 || !c.garanties.length) continue
        const ent = ports(u, g.entrantes[u]!, 'e')
        if (!ent.length) continue
        const T = R[u]!
        const op = this.opacites[u]!
        if (op < 0.1) continue
        const pasT = Math.min(12, T.h / (ent.length + 1))
        const yHaut = T.cy - ((ent.length - 1) / 2) * pasT
        const max = ecart - 16
        if (max < 40) continue
        // Nom court de la garantie (« Lemme de Grönwall discret » → « Grönwall discret »), sur deux lignes au plus.
        const nom = nomCourt(j.noeuds[c.garanties[0]!]!.nom) + (c.garanties.length > 1 ? ` +${c.garanties.length - 1}` : '')
        const lignes = couperLignes(ctx, `⊢ ${nom}`, max, 2)
        ctx.lineWidth = 3
        lignes.forEach((l, i) => {
          const yl = yHaut - 5 - (lignes.length - 1 - i) * 12
          ctx.strokeStyle = rgba(pal.fond, 0.9 * op)
          ctx.strokeText(l, T.g - 8, yl)
          ctx.fillStyle = rgba(pal.texteDoux, op)
          ctx.fillText(l, T.g - 8, yl)
        })
      }
    }
    ctx.restore()
  }

  /** Liens hors justification : objection (contredit), réponse (résout), abandon. */
  private dessinerLiens({ ctx, vue }: ContexteDessinR): void {
    if (!this.lire<boolean>('r5Objections')) return
    const m = this.etat.modele!
    const pal = vue.palette
    const R = this.rects
    ctx.save()
    for (const l of m.liens) {
      const S = R[l.source]!, T = R[l.cible]!
      const op = Math.min(this.opacites[l.source]!, this.opacites[l.cible]!)
      if (op < 0.05) continue
      const couleur = l.genre === 'contredit' ? pal.statut.refute : l.genre === 'resout' ? pal.statut.valide : pal.texteDoux
      const texte = l.genre === 'contredit' ? '✗ contredit' : l.genre === 'resout' ? '✓ répond' : l.genre === 'abandonne' ? 'clôt la piste' : 'remplace'
      ctx.strokeStyle = rgba(couleur, 0.9 * op)
      ctx.fillStyle = rgba(couleur, 0.9 * op)
      ctx.lineWidth = l.genre === 'contredit' ? 2.2 : 1.6
      ctx.setLineDash(l.genre === 'contredit' ? [6, 4] : l.genre === 'abandonne' ? [2, 4] : [])
      let x0: number, y0: number, x1: number, y1: number, dir: [number, number]
      let mx: number, my: number
      ctx.beginPath()
      if (T.g > S.g + S.l || T.g + T.l < S.g) {
        // Vers la droite ou vers la gauche : courbe entre les bords qui se font face.
        const versDroite = T.g > S.g + S.l
        x0 = versDroite ? S.g + S.l : S.g; y0 = S.cy + S.h * 0.28
        x1 = versDroite ? T.g : T.g + T.l; y1 = T.cy + T.h * 0.28
        const dx = (x1 - x0) * 0.45
        ctx.moveTo(x0, y0)
        ctx.bezierCurveTo(x0 + dx, y0, x1 - dx, y1, x1, y1)
        mx = (x0 + 3 * (x0 + dx) + 3 * (x1 - dx) + x1) / 8
        my = (y0 + 3 * y0 + 3 * y1 + y1) / 8
        dir = [versDroite ? 1 : -1, 0]
      } else {
        // Même colonne : l'objection est juste sous la carte qu'elle attaque ; badge sur le lien.
        const bas = T.cy > S.cy
        x0 = S.g + S.l * 0.72; y0 = bas ? S.H + S.h : S.H
        x1 = T.g + T.l * 0.72; y1 = bas ? T.H : T.H + T.h
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1)
        mx = (x0 + x1) / 2; my = (y0 + y1) / 2
        dir = [0, bas ? 1 : -1]
      }
      ctx.stroke()
      ctx.setLineDash([])
      fleche(ctx, x1, y1, dir, 7)
      // Étiquette du lien.
      ctx.font = `600 10px ${pal.police}`
      const w = ctx.measureText(texte).width + 10
      ctx.fillStyle = rgba(pal.surface, 0.95 * op)
      ctx.strokeStyle = rgba(couleur, 0.5 * op)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(mx - w / 2, my - 8, w, 16, 8)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = rgba(couleur, op)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(texte, mx, my + 0.5)
    }
    ctx.restore()
  }

  // ─── DOM ───────────────────────────────────────────────────────────────────

  private majCartes(): void {
    const v = this.vue, m = this.etat.modele!, mp = this.etat.mep!
    const k = v.camera.pixelsParUnite() * mp.echelle
    const pas = (mp.p.hauteurCarte + mp.p.ecartLignes) * k
    const survol = v.survol
    for (const c of m.cartes) {
      const u = c.unite
      const d = this.cartes[u]!
      const r = this.rects[u]!
      const o = this.opacites[u]!
      if (o < 0.02 || r.l < 8) {
        if (d.style.display !== 'none') d.style.display = 'none'
        continue
      }
      if (d.style.display === 'none') d.style.display = ''
      const niv = this.niveaux[u]!
      const cle = `${niv}`
      if (this.cles[u] !== cle) {
        this.cles[u] = cle
        this.remplir(d, c, niv)
      }
      const lg = v.lignee[u]!
      const etat = [
        `r5-carte genre-${c.genre} type-${v.justification.noeuds[c.conclusion]!.type} niv-${niv}`,
        c.etat ? `etat-${c.etat}` : '',
        c.abandonnee ? 'abandonnee' : '',
        survol === u ? 'survolee' : '',
        v.ligneeActive ? (lg === 3 ? 'selection' : lg === 1 ? 'ancetre' : lg === 2 ? 'descendant' : '') : '',
        this.portee?.has(u) ? 'portee' : '',
        v.extrusion > 0.3 ? 'en-3d' : '',
      ].filter(Boolean).join(' ')
      if (this.etats[u] !== etat) {
        this.etats[u] = etat
        d.className = etat
      }
      // Écritures de style mises en cache : un simple déplacement ne touche que la transformation.
      const f = Math.max(0.62, Math.min(1, r.l / 140))
      const st = d.style
      const z = String(survol === u ? 30 : lg === 3 ? 20 : v.extrusion > 0.3 ? Math.round(1000 - (v.projection.profondeurNormalisee(u) * 900)) : 1)
      ecrire(st, 'transform', `translate(${r.g.toFixed(1)}px, ${r.H.toFixed(1)}px)`)
      ecrire(st, 'width', `${r.l.toFixed(1)}px`)
      ecrire(st, 'height', niv === 0 ? `${r.h.toFixed(1)}px` : '')
      ecrire(st, 'minHeight', niv === 0 ? '' : `${r.h.toFixed(1)}px`)
      ecrire(st, 'maxHeight', niv === 0 ? '' : `${Math.max(r.h, pas - 6).toFixed(1)}px`)
      ecrire(st, 'opacity', o.toFixed(2))
      ecrire(st, 'zIndex', z)
      if (d.dataset.f !== f.toFixed(2)) {
        d.dataset.f = f.toFixed(2)
        st.setProperty('--f', f.toFixed(2))
      }
    }
  }

  private majBlocs(c: ContexteDessinR): void {
    const mp = this.etat.mep!
    const v = this.vue
    const e = v.extrusion
    const milieu = 3
    const place = (elt: HTMLElement | null, r: { x: number; y: number; l: number; h: number }, couche: number, visible: boolean) => {
      if (!elt) return
      if (!visible) { elt.style.display = 'none'; return }
      elt.style.display = ''
      const prof = (couche - milieu) * v.reglages.valeurs.ecartCouches * e
      const a = v.camera.projeterPoint(versMonde(mp, r.x - r.l / 2, r.y - r.h / 2, prof))
      const k = v.camera.pixelsParUnite() * mp.echelle * (a.echelle || 1)
      elt.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px)`
      elt.style.width = `${(r.l * k).toFixed(1)}px`
      elt.style.setProperty('--f', Math.max(0.6, Math.min(1.15, (r.l * k) / 170)).toFixed(3))
      elt.style.opacity = String(v.ligneeActive ? 0.55 : 1)
    }
    place(this.blocDonnees, mp.blocDonnees, 0, true)
    place(this.bandeau, mp.bandeau, 2, this.lire<boolean>('r5Bandeau'))
    void c
  }

  /** Contenu d'une carte selon le niveau de zoom sémantique. */
  private remplir(d: HTMLDivElement, c: Carte, niv: number): void {
    const v = this.vue, j = v.justification, m = this.etat.modele!
    const n = j.noeuds[c.conclusion]!
    const conf = n.confiance
    const enfants: (HTMLElement | null)[] = []
    // Bandeau des hypothèses de travail directes (au-dessus de la carte).
    if (c.modeles.length && this.lire<boolean>('r5Bandeau')) {
      enfants.push(el('div', { class: 'r5-carte-m', title: 'Hypothèses de travail dont dépend directement la carte' }, c.modeles.map((x) => x.code).join(' · ')))
    }
    // En-tête : genre / question, qualificatif (statut, confiance).
    const statut = el('span', { class: `r5-statut statut-${n.statut}`, title: `Statut : ${n.statut}` })
    const qualif = el('span', { class: 'r5-qualif', title: `Confiance ${Math.round(conf.estimation * 100)} % [${Math.round(conf.bas * 100)}–${Math.round(conf.haut * 100)}] · validation ${LIBELLES_VALIDATION[n.validation]}` },
      statut, `${Math.round(conf.estimation * 100)} %`, niv >= 1 && n.validation !== 'aucune' ? el('span', { class: `r5-valid valid-${n.validation}` }, n.validation === 'ia_humain' ? 'IA+H' : n.validation === 'ia' ? 'IA' : 'H') : null)
    // Dézoomé : étiquettes courtes ; zoomé : la question d'une décision, l'état d'une question.
    let genre: string
    if (c.genre === 'decision') genre = niv >= 1 ? '? ' + (n.decision?.question ?? 'Décision') : 'Décision'
    else if (c.genre === 'question') genre = c.etat === 'refutee' ? (niv >= 1 ? '? Question · réfutée' : '? Réfutée') : c.etat === 'abandonnee' ? (niv >= 1 ? '? Question · abandonnée' : '? Abandonnée') : (niv >= 1 ? '? Question ouverte' : '? Ouverte')
    else if (c.genre === 'objection') genre = niv >= 1 ? `✗ Objection · ${LIBELLES_TYPE[n.type].toLowerCase()}` : '✗ Objection'
    else genre = LIBELLES_TYPE[n.type]
    enfants.push(el('div', { class: 'r5-tete' }, el('span', { class: 'r5-genre', title: genre }, genre), qualif))
    // Conclusion.
    const titre = c.genre === 'decision' ? `✓ ${n.nom}` : n.nom
    enfants.push(el('div', { class: 'r5-titre' }, titre))
    if (niv >= 2) enfants.push(el('div', { class: 'r5-enonce' }, couper(n.enonce, 170)))
    // Raisons (niveau 1+) ou alternatives d'une décision.
    if (niv >= 1) {
      // Objections reçues et réponses.
      const recues = m.liens.filter((l) => l.cible === c.unite && l.genre !== 'abandonne')
      for (const l of recues) {
        const src = j.noeuds[m.cartes[l.source]!.conclusion]!
        enfants.push(el('div', { class: `r5-attaque ${l.genre}` }, el('b', {}, l.genre === 'contredit' ? '✗ Contredit par ' : '✓ Réponse : '), couper(src.nom, 48)))
      }
      if (c.genre === 'decision' && n.decision) {
        const alts = n.decision.alternatives.filter((a) => !a.retenue)
        enfants.push(el('ul', { class: 'r5-alternatives' }, alts.slice(0, niv >= 2 ? 3 : 2).map((a) => el('li', {}, el('b', {}, '✗ '), a.libelle, niv >= 2 && a.raison ? el('span', {}, ` — ${couper(a.raison, 60)}`) : null))))
        if (niv >= 2) enfants.push(el('div', { class: 'r5-garantie' }, el('b', {}, 'Raison : '), couper(n.decision.raison, 110)))
      }
      if (c.raisons.length) {
        const max = 3
        enfants.push(el('ul', { class: 'r5-raisons' },
          c.raisons.slice(0, max).map((r) => {
            const nr = j.noeuds[r.noeud]!
            const autre = r.carte !== c.unite
            return el('li', { class: autre ? 'autre' : '' }, el('i', {}, autre ? '◂' : '∵'), couper(nr.nom, niv >= 2 ? 70 : 44),
              !autre && r.sousEtapes ? el('em', {}, ` +${r.sousEtapes}`) : null)
          }),
          c.raisons.length > max ? el('li', { class: 'plus' }, `+ ${c.raisons.length - max} autre(s)`) : null))
      }
      if (niv >= 2 && c.garanties.length && c.genre !== 'decision') {
        enfants.push(el('div', { class: 'r5-garantie' }, el('b', {}, '⊢ Garantie : '), c.garanties.slice(0, 3).map((g) => j.noeuds[g]!.nom).join(', '), c.garanties.length > 3 ? ` +${c.garanties.length - 3}` : ''))
      }
      if (niv >= 2 && c.reserves.length) {
        enfants.push(el('ul', { class: 'r5-reserves' }, c.reserves.slice(0, 3).map((r) => el('li', { class: r.grave ? 'grave' : '' }, '⚠ ', couper(r.texte, 64))),
          c.reserves.length > 3 ? el('li', {}, `+ ${c.reserves.length - 3} autre(s)`) : null))
      }
      const pied: (string | HTMLElement)[] = []
      if (c.donnees.length) pied.push(el('span', { class: 'r5-pied-h' }, 'sous ', c.donnees.map((x) => x.code).join(' ')))
      if (c.verifications.length) pied.push(el('span', { class: 'r5-pied-v' }, `✓ vérifié ×${c.verifications.length}`))
      const nb = v.lecture.unites[c.unite]!.membres.length
      if (nb > 1) pied.push(el('span', {}, `${nb} nœuds`))
      if (pied.length) enfants.push(el('div', { class: 'r5-pied' }, pied))
    }
    // Onglets latéraux : attaques (rouge) et réserves (ambre), visibles à tous les niveaux.
    const contredite = m.liens.some((l) => l.cible === c.unite && l.genre === 'contredit')
    const onglets: HTMLElement[] = []
    if (contredite || n.statut === 'refute') onglets.push(el('span', { class: 'r5-onglet attaque', title: 'Attaquée : contredite par une mesure ou réfutée' }, '✗'))
    if (c.reserves.length) onglets.push(el('span', { class: 'r5-onglet reserve', title: `${c.reserves.length} réserve(s) : énoncés incertains, variantes non vérifiées` }, `⚠${c.reserves.length}`))
    if (onglets.length) enfants.push(el('div', { class: 'r5-onglets' }, onglets))
    // Qualificatif : intervalle de confiance (barre fine en bas de la carte).
    enfants.push(el('div', { class: 'r5-ic', title: `Intervalle de confiance [${Math.round(conf.bas * 100)}–${Math.round(conf.haut * 100)}] %` },
      el('div', { class: 'r5-ic-int', style: `left:${conf.bas * 100}%;width:${Math.max(1.5, (conf.haut - conf.bas) * 100)}%` }),
      el('div', { class: 'r5-ic-pt', style: `left:${conf.estimation * 100}%` })))
    d.replaceChildren(...enfants.filter((x): x is HTMLElement => !!x))
  }

  /** Carte sous un point écran (secours géométrique quand le DOM n'a pas signalé de survol). */
  carteSous(x: number, y: number, marge = 0): number | null {
    const m = this.etat.modele
    if (!m || this.calque.style.display === 'none') return null
    for (let u = m.cartes.length - 1; u >= 0; u--) {
      const r = this.rects[u]!
      if (this.opacites[u]! < 0.05) continue
      const h = this.cartes[u]?.offsetHeight || r.h
      if (x >= r.g - marge && x <= r.g + r.l + marge && y >= r.H - marge && y <= r.H + h + marge) return u
    }
    return null
  }
}

/** Nom court d'un énoncé outil : sans « Lemme de », « Inégalité de »… */
export function nomCourt(nom: string): string {
  return nom.replace(/^(Lemme|Inégalité|Théorème|Critère|Formule|Représentation|Inégalité maximale) (de |d['’]|du )/i, '').replace(/^./, (c) => c.toUpperCase())
}

/** Découpe un texte en au plus `max` lignes de largeur `largeur` (dernière ligne tronquée). */
function couperLignes(ctx: CanvasRenderingContext2D, texte: string, largeur: number, max: number): string[] {
  const mots = texte.split(' ')
  const lignes: string[] = []
  let ligne = ''
  for (const mot of mots) {
    const essai = ligne ? `${ligne} ${mot}` : mot
    if (ctx.measureText(essai).width <= largeur || !ligne) ligne = essai
    else {
      lignes.push(ligne)
      ligne = mot
    }
  }
  if (ligne) lignes.push(ligne)
  const res = lignes.slice(0, max)
  if (lignes.length > max) res[max - 1] = res[max - 1]! + '…'
  for (let i = 0; i < res.length; i++) {
    let l = res[i]!
    while (l.length > 3 && ctx.measureText(l).width > largeur) l = l.slice(0, -2) + '…'
    res[i] = l
  }
  return res
}

/** Écrit une propriété de style seulement si elle change (évite des recalculs de style inutiles). */
function ecrire(st: CSSStyleDeclaration, cle: 'transform' | 'width' | 'height' | 'minHeight' | 'maxHeight' | 'opacity' | 'zIndex', valeur: string): void {
  if (st[cle] !== valeur) st[cle] = valeur
}

/** Pointe de flèche en (x, y), orientée selon dir. */
function fleche(ctx: CanvasRenderingContext2D, x: number, y: number, dir: [number, number], t: number): void {
  const [dx, dy] = dir
  const px = -dy, py = dx
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - dx * t + px * t * 0.55, y - dy * t + py * t * 0.55)
  ctx.lineTo(x - dx * t - px * t * 0.55, y - dy * t - py * t * 0.55)
  ctx.closePath()
  ctx.fill()
}
