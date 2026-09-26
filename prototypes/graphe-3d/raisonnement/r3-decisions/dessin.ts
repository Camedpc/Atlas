// R3 · Calques canvas : flux (Sankey sobre), cartes de blocs, libellés, embranchements des
// décisions, histoire de la contradiction, « et si ? » et portée.
//
// Sigma ne dessine que les glyphes (losanges, hexagones, cercles) ; tout le reste est ici, à partir
// des positions projetées (`vue.projection`, `vue.positions`) : cela marche aussi en vue 3D.

import { rgba, type ContexteDessinR, type ValeurReglage, type VueRaisonnement } from '../../src/raisonnement'
import { geometrie, groupes } from './disposition'
import { couperTexte, interligne, lignesTexte, police, type Polices } from './textes'
import { etat, type RectEcran } from './etat'
import { blocReplie, etatStrategie, ID_STRATEGIE, type AnalyseR3, type BlocR3 } from './modele'

// ─── Accès ───────────────────────────────────────────────────────────────────

/** Analyse courante si la stratégie R3 est active et que la disposition R3 est en place. */
export function analyseActive(vue: VueRaisonnement): AnalyseR3 | null {
  const an = etatStrategie.analyse
  if (vue.strategie.id !== ID_STRATEGIE || !an || an.j !== vue.justification) return null
  if (geometrie.lecture !== vue.lecture || geometrie.boites.length !== vue.nU) return null
  return an
}

export function blocDuPoint(vue: VueRaisonnement, an: AnalyseR3, p: number): BlocR3 | null {
  if (p >= vue.nU) return null
  const u = vue.lecture.unites[p]!
  return blocReplie(an, u.conclusion, u.membres.length)
}

const r = (vue: VueRaisonnement) => <V extends ValeurReglage>(cle: string): V => vue.reglages.lire<V>(cle)

/** Opacité logique d'un point (réducteur R3), bornée par sa visibilité. */
function alpha(vue: VueRaisonnement, p: number): number {
  return vue.projection.visible[p] ? etat.alpha[p] ?? 1 : 0
}

function texteHalo(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, fond: string, epaisseur = 3.5): void {
  ctx.lineJoin = 'round'
  ctx.lineWidth = epaisseur
  ctx.strokeStyle = fond
  ctx.strokeText(t, x, y)
  ctx.fillText(t, x, y)
}

function chevauche(a: RectEcran, liste: RectEcran[]): boolean {
  return liste.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0)
}

// ─── Géométrie projetée ──────────────────────────────────────────────────────

interface Carte {
  coins: { x: number; y: number }[]
  rect: RectEcran
}

function carteProjetee(vue: VueRaisonnement, p: number): Carte {
  const b = geometrie.boites[p]!
  const e = geometrie.echelle
  const X = vue.positions[p * 3]!, Y = vue.positions[p * 3 + 1]!, Z = vue.positions[p * 3 + 2]!
  const hw = (b.w / 2) * e, hh = (b.h / 2) * e
  const coins = ([[X - hw, Y, Z + hh], [X + hw, Y, Z + hh], [X + hw, Y, Z - hh], [X - hw, Y, Z - hh]] as [number, number, number][]).map((q) => vue.camera.projeterPoint(q))
  const xs = coins.map((c) => c.x), ys = coins.map((c) => c.y)
  return { coins, rect: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } }
}

// ─── Couleurs ────────────────────────────────────────────────────────────────

function couleurStatut(vue: VueRaisonnement, membres: number[], an: AnalyseR3): { dominant: string; parts: [number, number, number] } {
  let v = 0, i = 0, f = 0
  for (const m of membres) {
    const s = an.j.noeuds[m]!.statut
    if (s === 'valide') v++
    else if (s === 'incertain') i++
    else f++
  }
  const pal = vue.palette
  const dominant = v >= i && v >= f ? pal.statut.valide : i >= f ? pal.statut.incertain : pal.statut.refute
  return { dominant, parts: [v, i, f] }
}

// ─── Calque dessous : cadres dépliés, flux, cartes ───────────────────────────

interface Ancre {
  x: number
  y: number
}

export function dessinerDessousR3(c: ContexteDessinR): void {
  const { ctx, vue } = c
  const an = analyseActive(vue)
  etat.cartes.clear()
  etat.entetes = []
  if (!an) return
  const pal = vue.palette
  const pr = vue.projection
  const g = vue.lecture
  const lire = r(vue)
  const k = Math.max(0.6, Math.min(1.6, vue.camera.pixelsParUnite() * geometrie.echelle))

  // 1. Blocs dépliés : cadre autour des membres, pastille « replier » en tête.
  for (const gp of groupes) {
    const e = geometrie.echelle
    const hw = (gp.w / 2) * e, hh = (gp.h / 2) * e
    const Y = 0
    const c = [[gp.x - hw, Y, gp.z + hh], [gp.x + hw, Y, gp.z + hh], [gp.x + hw, Y, gp.z - hh], [gp.x - hw, Y, gp.z - hh]].map((q) => vue.camera.projeterPoint(q as [number, number, number]))
    if (c.some((q) => !q.visible)) continue
    ctx.save()
    ctx.beginPath()
    c.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
    ctx.closePath()
    ctx.fillStyle = rgba(pal.accent, 0.035)
    ctx.fill()
    ctx.strokeStyle = rgba(pal.accent, 0.4)
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = `600 11.5px ${pal.police}`
    const t = `▾ ${gp.titre} · ${gp.n} nœuds dépliés — replier`
    const w = ctx.measureText(t).width + 18
    const px = c[0]!.x, py = c[0]!.y - 27
    ctx.fillStyle = pal.surface
    ctx.strokeStyle = rgba(pal.accent, 0.6)
    ctx.beginPath()
    ctx.roundRect(px, py, w, 22, 11)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = pal.accent
    ctx.textBaseline = 'middle'
    ctx.fillText(t, px + 9, py + 11.5)
    etat.entetes.push({ id: gp.id, rect: { x0: px, y0: py, x1: px + w, y1: py + 22 } })
    ctx.restore()
  }

  // 2. Cartes (géométrie) pour les ancres des flux.
  const cartes = new Map<number, Carte>()
  for (let p = 0; p < vue.nU; p++) if (blocDuPoint(vue, an, p)) cartes.set(p, carteProjetee(vue, p))

  // 3. Flux : empilés le long des bords des cartes (Sankey sobre).
  const largeurFlux = (a: (typeof g.aretes)[number]): number => {
    const s = g.unites[a.source]!, t = g.unites[a.cible]!
    const bt = cartes.has(a.cible) ? blocDuPoint(vue, an, a.cible) : null
    // Flux d'ancrage (ce que ce choix a permis) : épaisseur ∝ nombre de résultats du bloc.
    if (bt && bt.ancre === s.conclusion) return 1.4 + lire<number>('epaisseurFlux') * 0.09 * t.membres.length
    const n = a.resume.length + a.transitives.length
    return 1 + lire<number>('epaisseurFlux') * 0.3 * Math.sqrt(Math.max(1, n))
  }
  const sortants = new Map<number, number[]>(), entrants = new Map<number, number[]>()
  for (const a of g.aretes) {
    if (!sortants.has(a.source)) sortants.set(a.source, [])
    if (!entrants.has(a.cible)) entrants.set(a.cible, [])
    sortants.get(a.source)!.push(a.index)
    entrants.get(a.cible)!.push(a.index)
  }
  const decal = new Map<string, number>()
  const empiler = (p: number, liste: number[] | undefined, cote: 'in' | 'out') => {
    const ca = cartes.get(p)
    if (!ca || !liste) return
    const autres = liste.map((e) => {
      const a = g.aretes[e]!
      const q = cote === 'in' ? a.source : a.cible
      return { e, y: pr.y[q]!, w: largeurFlux(a) * k }
    }).sort((u, v) => u.y - v.y)
    const h = ca.rect.y1 - ca.rect.y0 - 12
    const total = autres.reduce((s, x) => s + x.w, 0) + 2 * (autres.length - 1)
    const f = total > h ? h / total : 1
    let y = -(Math.min(total, h)) / 2
    for (const x of autres) {
      decal.set(`${cote}${x.e}`, y + (x.w * f) / 2)
      y += x.w * f + 2 * f
    }
  }
  for (const [p, l] of sortants) empiler(p, l, 'out')
  for (const [p, l] of entrants) empiler(p, l, 'in')
  const ancreDe = (p: number, cote: 'in' | 'out', e: number): Ancre => {
    const ca = cartes.get(p)
    if (ca) {
      const [a, b] = cote === 'out' ? [ca.coins[1]!, ca.coins[2]!] : [ca.coins[0]!, ca.coins[3]!]
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + (decal.get(`${cote}${e}`) ?? 0) }
    }
    const rr = vue.tailleAffichee[p]! + 1
    return { x: pr.x[p]! + (cote === 'out' ? rr : -rr), y: pr.y[p]! }
  }
  const N = an.j.noeuds
  const portee = etat.portee, etSi = etat.etSi
  ctx.save()
  for (const a of g.aretes) {
    const s = a.source, t = a.cible
    const as = alpha(vue, s), at = alpha(vue, t)
    if (as < 0.02 || at < 0.02) continue
    const ns = N[g.unites[s]!.conclusion]!, nt = N[g.unites[t]!.conclusion]!
    const gs = an.genre[g.unites[s]!.conclusion]
    const abandon = ns.piste === 'abandonnee' || nt.piste === 'abandonnee' || an.genre[g.unites[s]!.conclusion] === 'impasse'
    const versRefute = nt.statut === 'refute'
    let couleur = gs === 'pivot' ? pal.couches[2]! : pal.arete
    let op = (gs === 'pivot' ? 0.4 : 0.42) * lire<number>('opaciteFlux') / 0.5
    let tirets: number[] = abandon || versRefute ? [5, 4] : a.resume.length === 0 && gs !== 'pivot' ? [2, 3] : []
    if (abandon) op *= 0.7
    op *= Math.min(as, at)
    if (portee) {
      const dedans = (portee.parts.get(t) ?? 0) > 0 && (s === portee.point || (portee.parts.get(s) ?? 0) > 0)
      if (dedans) { couleur = pal.accent; op = Math.max(op, 0.7) } else op *= 0.25
    } else if (etSi) {
      const ts = etSi.parts.get(t)
      if (ts && ts[0] > 0 && (s === etSi.point || (etSi.parts.get(s)?.[0] ?? 0) > 0)) { couleur = pal.contredit; op = 0.75; tirets = [6, 4] }
    } else if (vue.ligneeActive) {
      const ls = vue.lignee[s]!, lt = vue.lignee[t]!
      if (ls && lt) { couleur = ls === 1 || lt === 1 ? pal.ancetre : pal.descendant; op = 0.8 }
    }
    if (op < 0.01) continue
    const A = ancreDe(s, 'out', a.index), B = ancreDe(t, 'in', a.index)
    const w = Math.max(0.8, largeurFlux(a) * k * (cartes.has(t) || cartes.has(s) ? Math.min(1, (decal.has(`in${a.index}`) ? 1 : 1)) : 1))
    const dx = Math.max(24, Math.abs(B.x - A.x) * 0.5)
    ctx.strokeStyle = rgba(couleur, op)
    ctx.lineWidth = w
    ctx.lineCap = 'butt'
    ctx.setLineDash(tirets)
    ctx.beginPath()
    ctx.moveTo(A.x, A.y)
    ctx.bezierCurveTo(A.x + dx, A.y, B.x - dx, B.y, B.x - 4, B.y)
    ctx.stroke()
    // Pointe de flèche.
    ctx.setLineDash([])
    ctx.fillStyle = rgba(couleur, Math.min(1, op * 1.4))
    const pw = Math.max(3.2, Math.min(6, w * 0.8 + 2.4))
    ctx.beginPath()
    ctx.moveTo(B.x, B.y)
    ctx.lineTo(B.x - pw * 1.5, B.y - pw)
    ctx.lineTo(B.x - pw * 1.5, B.y + pw)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  // 4. Cartes des blocs.
  for (const [p, ca] of cartes) {
    const b = blocDuPoint(vue, an, p)!
    const op = alpha(vue, p)
    if (op < 0.02) continue
    etat.cartes.set(p, ca.rect)
    dessinerCarte(ctx, vue, an, p, b, ca, op)
  }
}

function dessinerCarte(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, an: AnalyseR3, p: number, b: BlocR3, ca: Carte, op: number): void {
  const pal = vue.palette
  const { dominant, parts } = couleurStatut(vue, b.membres, an)
  const survole = vue.survol === p
  ctx.save()
  ctx.globalAlpha = op
  ctx.beginPath()
  ca.coins.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
  ctx.closePath()
  ctx.fillStyle = b.abandonne ? rgba(pal.surface, 0.7) : pal.surface
  ctx.fill()
  if (b.abandonne) {
    // Hachures : piste abandonnée.
    ctx.save()
    ctx.clip()
    ctx.strokeStyle = rgba(pal.texteDoux, 0.12)
    ctx.lineWidth = 1
    const { x0, y0, x1, y1 } = ca.rect
    for (let x = x0 - (y1 - y0); x < x1; x += 7) {
      ctx.beginPath()
      ctx.moveTo(x, y1)
      ctx.lineTo(x + (y1 - y0), y0)
      ctx.stroke()
    }
    ctx.restore()
  }
  ctx.lineWidth = survole ? 1.6 : 1
  ctx.strokeStyle = survole ? pal.accent : b.abandonne ? rgba(pal.texteDoux, 0.55) : pal.bord
  ctx.setLineDash(b.abandonne ? [4, 3] : [])
  ctx.stroke()
  ctx.setLineDash([])
  const { x0, y0, x1, y1 } = ca.rect
  const w = x1 - x0, h = y1 - y0
  if (vue.mode === '2d' || vue.extrusion < 0.05) {
    // Bord gauche : statut dominant.
    ctx.fillStyle = b.abandonne ? rgba(pal.texteDoux, 0.5) : dominant
    ctx.fillRect(x0, y0 + 1, 3, h - 2)
    // Répartition des statuts (bas de la carte).
    const n = b.membres.length
    let x = x0 + 9
    const lw = w - 18
    const cols = [pal.statut.valide, pal.statut.incertain, pal.statut.refute]
    parts.forEach((v, k) => {
      if (!v) return
      ctx.fillStyle = rgba(cols[k]!, 0.85)
      const ww = (lw * v) / n
      ctx.fillRect(x, y1 - 7, Math.max(1, ww - 1), 3)
      x += ww
    })
  }
  ctx.restore()
}

/** Position des pastilles numérotées (à gauche de l'étiquette de genre), par point. */
const pastilles = new Map<number, { x: number; y: number }>()

// ─── Calque dessus : textes, embranchements, histoire, « et si ? » ────────────

export function dessinerDessusR3(c: ContexteDessinR): void {
  const { ctx, vue, temps } = c
  const an = analyseActive(vue)
  if (!an) return
  const pal = vue.palette
  const pr = vue.projection
  const g = vue.lecture
  const N = an.j.noeuds
  const lire = r(vue)
  // Les textes suivent le zoom quand le graphe est plus petit que prévu (jamais plus grands).
  const s = Math.max(0.72, Math.min(1, vue.camera.pixelsParUnite() * geometrie.echelle))
  const pol: Polices = { famille: pal.police, taille: lire<number>('tailleTexte') * s }
  const places: RectEcran[] = []
  pastilles.clear()
  ctx.save()

  // 1. Textes des cartes : titre au-dessus, résumé dedans.
  for (const [p, rect] of etat.cartes) {
    const b = blocDuPoint(vue, an, p)!
    const bo = geometrie.boites[p]!
    const op = alpha(vue, p)
    const w = rect.x1 - rect.x0, h = rect.y1 - rect.y0
    ctx.globalAlpha = op
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.font = police.titreCarte(pol, b.abandonne)
    ctx.fillStyle = b.abandonne ? pal.texteDoux : pal.texte
    texteHalo(ctx, bo.titre, rect.x0, rect.y0 - 4, pal.fond)
    if (w < 60 || h < 24 || vue.extrusion > 0.3) continue
    const n = b.membres.length
    const valides = b.membres.filter((m) => N[m]!.statut === 'valide').length
    const cadre = b.id === 'cadre'
    ctx.textBaseline = 'top'
    ctx.font = police.carte(pol)
    ctx.fillStyle = pal.texteDoux
    const nom = cadre ? (n > 1 ? 'hypothèses' : 'hypothèse') : n > 1 ? 'résultats' : 'résultat'
    const pct = Math.round((100 * valides) / n)
    const long = `${n} ${nom} · ${pct} % validés`
    ctx.fillText(ctx.measureText(long).width <= w - 16 ? long : couperTexte(ctx, `${n} ${nom} · ${pct} %`, w - 16), rect.x0 + 9, rect.y0 + 6)
    if (h >= 38) {
      ctx.font = police.carte(pol, true)
      ctx.fillStyle = pal.texte
      const lignes = lignesTexte(ctx, `★ ${N[b.vedette]!.nom}`, w - 18, h >= 52 ? 2 : 1)
      lignes.forEach((l, k) => ctx.fillText(l, rect.x0 + 9, rect.y0 + 8 + interligne.alternative(pol) * (k + 1)))
    }
    // Survol d'un pivot : part des résultats du bloc qui en dépendent ; « et si ? » : suspendus.
    const part = etat.portee?.parts.get(p) ?? 0
    const ts = etat.etSi?.parts.get(p)
    if (etat.portee && part > 0) bandeau(ctx, vue, rect, `${Math.round(part * n)} / ${n} en dépendent`, pal.accent, part)
    if (ts && ts[0] > 0) bandeau(ctx, vue, rect, `${ts[0]} / ${ts[1]} suspendus`, pal.contredit, ts[0] / ts[1], true)
  }
  ctx.globalAlpha = 1

  // 2. Glyphes : étiquette de genre, libellé, embranchements.
  const ordre: number[] = []
  for (let p = 0; p < vue.nU; p++) if (!etat.cartes.has(p) && geometrie.boites[p]?.genre === 'glyphe') ordre.push(p)
  const prio = (p: number) => { const gg = an.genre[g.unites[p]!.conclusion]; return gg === 'pivot' ? 0 : gg === 'cle' || gg === 'impasse' ? 1 : 2 }
  ordre.sort((a, b) => prio(a) - prio(b))
  for (const p of ordre) {
    const op = alpha(vue, p)
    if (op < 0.04 || !pr.visible[p]) continue
    const bo = geometrie.boites[p]!
    const i = g.unites[p]!.conclusion
    const n = N[i]!
    const genre = an.genre[i]
    const x = pr.x[p]!, y = pr.y[p]!
    const rr = vue.tailleAffichee[p]!
    const important = genre === 'pivot' || genre === 'cle' || genre === 'impasse'
    const il = interligne.nom(pol)
    const yBas = y - rr - 5
    const L = bo.lignes.length
    ctx.font = police.nom(pol, important)
    const lmax = Math.max(...bo.lignes.map((l) => ctx.measureText(l).width))
    const rect = { x0: x - lmax / 2, y0: yBas - L * il - (bo.etiquette ? interligne.etiquette(pol) : 0), x1: x + lmax / 2, y1: yBas }
    // Membres d'un bloc déplié : libellé omis s'il gêne.
    if (!important && chevauche(rect, places)) continue
    places.push(rect)
    ctx.globalAlpha = op
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    if (bo.etiquette) {
      ctx.save()
      ctx.font = police.etiquette(pol)
      ctx.fillStyle = genre === 'pivot' ? pal.couches[2]! : genre === 'impasse' ? pal.texteDoux : n.statut === 'refute' ? pal.statut.refute : pal.texteDoux
      if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0.06em'
      const te = bo.etiquette.toUpperCase()
      texteHalo(ctx, te, x, yBas - L * il, pal.fond, 3)
      pastilles.set(p, { x: x - ctx.measureText(te).width / 2 - 10, y: yBas - L * il - interligne.etiquette(pol) / 2 + 1 })
      ctx.restore()
    }
    ctx.font = police.nom(pol, important)
    ctx.fillStyle = n.piste === 'abandonnee' || genre === 'impasse' ? pal.texteDoux : pal.texte
    bo.lignes.forEach((l, k) => {
      const yl = yBas - (L - 1 - k) * il
      texteHalo(ctx, l, x, yl, pal.fond)
      if (n.statut === 'refute') {
        // Réfuté : barré.
        const lw = ctx.measureText(l).width
        ctx.save()
        ctx.strokeStyle = rgba(pal.statut.refute, 0.85)
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(x - lw / 2, yl - pol.taille * 0.42)
        ctx.lineTo(x + lw / 2, yl - pol.taille * 0.42)
        ctx.stroke()
        ctx.restore()
      }
    })
    if (genre === 'impasse') {
      // Barre d'arrêt : la piste s'arrête ici.
      ctx.strokeStyle = rgba(pal.texteDoux, 0.95)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x + rr + 6, y - rr - 4)
      ctx.lineTo(x + rr + 6, y + rr + 4)
      ctx.stroke()
    }
    if (genre === 'pivot' && bo.alternatives.length && vue.extrusion < 0.3) dessinerEmbranchements(ctx, vue, p, x, y, rr, op, pol)
  }
  ctx.globalAlpha = 1

  // 3. Histoire de la contradiction résolue et liens sémantiques.
  if (lire<boolean>('histoire')) dessinerHistoire(ctx, vue, an)

  // 4. « Et si ? » : glyphes suspendus.
  if (etat.etSi) {
    for (const [p, [t]] of etat.etSi.parts) {
      if (etat.cartes.has(p) || t === 0 || !pr.visible[p]) continue
      const x = pr.x[p]!, y = pr.y[p]!, rr = vue.tailleAffichee[p]! + 4
      ctx.strokeStyle = rgba(pal.contredit, 0.9)
      ctx.lineWidth = 1.6
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.arc(x, y, rr, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = `700 ${pol.taille - 3}px ${pal.police}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = pal.contredit
      texteHalo(ctx, 'suspendu', x + rr + 4, y + 1, pal.fond, 3)
    }
  }

  // 5. Mise en évidence passagère (journal).
  if (etat.focus) {
    const p = vue.pointDeNoeud(etat.focus.noeud)
    const t = (temps - etat.focus.t0) / 1400
    if (t > 1) etat.focus = null
    else if (p !== null && t >= 0) {
      const ca = etat.cartes.get(p)
      const x = ca ? (ca.x0 + ca.x1) / 2 : pr.x[p]!, y = ca ? (ca.y0 + ca.y1) / 2 : pr.y[p]!
      const rr = (ca ? Math.max(ca.x1 - ca.x0, ca.y1 - ca.y0) / 2 : vue.tailleAffichee[p]!) + 6 + 28 * t
      ctx.strokeStyle = rgba(pal.accent, 0.9 * (1 - t))
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(x, y, rr, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function bandeau(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, rect: RectEcran, texte: string, couleur: string, part: number, hachure = false): void {
  const pal = vue.palette
  const w = rect.x1 - rect.x0, h = rect.y1 - rect.y0
  ctx.save()
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.rect(rect.x0, rect.y0, w * part, h)
  ctx.fillStyle = rgba(couleur, hachure ? 0.08 : 0.1)
  ctx.fill()
  if (hachure) {
    ctx.save()
    ctx.clip()
    ctx.strokeStyle = rgba(couleur, 0.35)
    ctx.lineWidth = 1
    for (let x = rect.x0 - h; x < rect.x0 + w * part; x += 6) {
      ctx.beginPath()
      ctx.moveTo(x, rect.y1)
      ctx.lineTo(x + h, rect.y0)
      ctx.stroke()
    }
    ctx.restore()
  }
  ctx.font = `700 10.5px ${pal.police}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillStyle = couleur
  texteHalo(ctx, texte, rect.x1, rect.y1 + 3, pal.fond, 3)
  ctx.restore()
}

/** Bifurcation : sous le glyphe, les alternatives écartées, pâles, chacune avec sa raison. */
function dessinerEmbranchements(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, p: number, x: number, y: number, rr: number, op: number, pol: Polices): void {
  const pal = vue.palette
  const bo = geometrie.boites[p]!
  const opa = op * (vue.survol === p ? 1 : 0.9)
  ctx.save()
  // Tige de la bifurcation (pointillés pâles), puis les branches écartées.
  const y0 = y + rr + 2
  let yy = y + rr + 8
  ctx.strokeStyle = rgba(pal.texteDoux, 0.5 * opa)
  ctx.lineWidth = 1
  ctx.setLineDash([2, 2])
  ctx.beginPath()
  ctx.moveTo(x, y0)
  ctx.lineTo(x, yy - 1)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const a of bo.alternatives) {
    ctx.font = police.alternative(pol)
    ctx.fillStyle = rgba(pal.texteDoux, 0.95 * opa)
    texteHalo(ctx, a.texte, x, yy, rgba(pal.fond, 0.92), 3)
    // Le ✗ en rouge pâle, par-dessus le début du texte.
    const w = ctx.measureText(a.texte).width
    ctx.fillStyle = rgba(pal.statut.refute, 0.8 * opa)
    ctx.textAlign = 'left'
    ctx.fillText('✗', x - w / 2, yy)
    ctx.textAlign = 'center'
    yy += interligne.alternative(pol)
    if (a.raison) {
      ctx.font = police.raison(pol)
      ctx.fillStyle = rgba(pal.texteDoux, 0.78 * opa)
      texteHalo(ctx, a.raison, x, yy, rgba(pal.fond, 0.92), 3)
      yy += interligne.raison(pol)
    }
    yy += 1
  }
  ctx.restore()
}

/** Contradiction résolue : pastilles numérotées et arcs « contredit » / « résout ». */
function dessinerHistoire(ctx: CanvasRenderingContext2D, vue: VueRaisonnement, an: AnalyseR3): void {
  const pal = vue.palette
  const pr = vue.projection
  const h = an.histoire
  const centre = (i: number): { x: number; y: number; r: number; op: number } | null => {
    if (i < 0) return null
    const p = vue.pointDeNoeud(i)
    if (p === null || p >= vue.nU || !pr.visible[p]) return null
    const ca = etat.cartes.get(p)
    if (ca) return { x: (ca.x0 + ca.x1) / 2, y: ca.y0, r: 4, op: alpha(vue, p) }
    return { x: pr.x[p]!, y: pr.y[p]!, r: vue.tailleAffichee[p]!, op: alpha(vue, p) }
  }
  // Arcs des liens sémantiques (contredit, résout, abandonne).
  const N = an.j.noeuds
  ctx.save()
  for (let i = 0; i < N.length; i++) {
    for (const l of N[i]!.liens ?? []) {
      // L'abandon est déjà raconté par la piste qui mène à l'impasse.
      if (l.genre === 'abandonne') continue
      const ci = an.j.index.get(l.cible)
      if (ci === undefined) continue
      const A = centre(i), B = centre(ci)
      if (!A || !B) continue
      const op = Math.min(A.op, B.op)
      if (op < 0.05) continue
      const couleur = l.genre === 'contredit' ? pal.contredit : l.genre === 'resout' ? pal.statut.valide : pal.texteDoux
      const d = Math.hypot(B.x - A.x, B.y - A.y)
      // Arc au-dessous pour « contredit » et « abandonne », au-dessus pour « résout ».
      const sens = l.genre === 'resout' ? -1 : 1
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2 + sens * Math.max(34, d * 0.22)
      ctx.strokeStyle = rgba(couleur, 0.85 * op)
      ctx.lineWidth = 1.5
      ctx.setLineDash(l.genre === 'resout' ? [] : [5, 4])
      ctx.beginPath()
      ctx.moveTo(A.x, A.y + sens * A.r)
      ctx.quadraticCurveTo(mx, my, B.x, B.y + sens * B.r)
      ctx.stroke()
      ctx.setLineDash([])
      const tx = (A.x + 2 * mx + B.x) / 4, ty = (A.y + 2 * my + B.y) / 4
      const texte = l.genre === 'contredit' ? 'contredit' : l.genre === 'resout' ? 'résout' : 'remplace'
      ctx.font = `700 10px ${pal.police}`
      const w = ctx.measureText(texte).width + 10
      ctx.fillStyle = rgba(pal.surface, 0.95 * op)
      ctx.strokeStyle = rgba(couleur, 0.6 * op)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(tx - w / 2, ty - 8, w, 16, 8)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = rgba(couleur, op)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(texte, tx, ty + 0.5)
    }
  }
  ctx.restore()
  if (!h) return
  // Pastilles ①…⑤ : conjecture, mesure, diagnostic, décision corrective, confirmation.
  const etapes: [number, string][] = [[h.conjecture, pal.statut.refute], [h.mesure, pal.contredit], [h.diagnostic, pal.accent], [h.decision, pal.couches[2]!], [h.confirmation, pal.statut.valide]]
  let k = 0
  ctx.save()
  for (const [i, couleur] of etapes) {
    if (i < 0) continue
    k++
    const A = centre(i)
    if (!A || A.op < 0.1) continue
    const q = vue.pointDeNoeud(i)
    const ou = q === null ? undefined : pastilles.get(q)
    const x = ou ? ou.x : A.x - A.r - 9, y = ou ? ou.y : A.y + A.r + 7
    ctx.globalAlpha = A.op
    ctx.fillStyle = couleur
    ctx.beginPath()
    ctx.arc(x, y, 7.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = pal.fond
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 10px ${pal.police}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(k), x, y + 0.5)
  }
  ctx.restore()
}
