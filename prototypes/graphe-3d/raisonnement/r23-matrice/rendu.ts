// R23 · rendu canvas de la matrice : en-têtes figés, zoom sémantique, surimpressions.

import { confianceDe, estRetro, TYPES_COURTS, type Cellule, type Grille, type Modele } from './modele'

export const PALETTE = {
  fond: '#ffffff',
  marge: '#f6f7f9',
  encre: '#1b2029',
  texte: '#343b48',
  doux: '#687080',
  pale: '#9ba2ae',
  tresPale: '#c4c9d1',
  filet: '#dde1e7',
  filetFort: '#9aa1ad',
  grille: '#f1f3f6',
  bande: '#f0f3f7',
  bandeForte: '#e3e8f0',
  diagonale: '#f3f4f6',
  alternative: '#fafafa',
  valide: '#2f6b4f',
  incertain: '#a8741a',
  refute: '#a3402d',
  retro: '#3d5a9e',
  transitif: '#bcc3ce',
  transitifPlein: '#e2e6ec',
}

const POLICE = 'Inter, "Segoe UI", system-ui, sans-serif'
const MONO = '"JetBrains Mono", "Cascadia Mono", Consolas, monospace'

export const MARGE_BLOC = 24
export const BANDE_BLOC = 20
const LARGEUR_TEXTE = 318
const HAUTEUR_IDS = 52

/** En dessous : les glyphes deviennent des pixels (vue d'ensemble). */
export const SEUIL_GLYPHES = 6
export const SEUIL_TEXTE_LIGNES = 10
export const SEUIL_TEXTE_COLONNES = 11

export type Surimpression = 'antecedents' | 'dependants'

export type Cible =
  | { zone: 'cellule'; r: number; c: number }
  | { zone: 'ligne'; r: number }
  | { zone: 'colonne'; c: number }
  | { zone: 'blocLigne'; bloc: number }
  | { zone: 'blocColonne'; bloc: number }

export interface Brosse { r0: number; r1: number; c0: number; c1: number }

export interface Vue {
  /** Taille d'une cellule (px CSS). */
  s: number
  ox: number
  oy: number
  largeur: number
  hauteur: number
}

export interface EtatRendu {
  m: Modele
  g: Grille
  vue: Vue
  survol: Cible | null
  /** Nœud sélectionné (lignée en surimpression). */
  noeud: number | null
  cellule: { r: number; c: number } | null
  brosse: Brosse | null
  surimpression: Surimpression
  /** Ensemble mis en évidence (antécédents ou dépendants + le nœud), ou null. */
  lignee: Uint8Array | null
}

export function geometrie(v: Vue): { x0: number; y0: number; texteLignes: boolean; texteColonnes: boolean; glyphes: boolean } {
  const texteLignes = v.s >= SEUIL_TEXTE_LIGNES
  const texteColonnes = v.s >= SEUIL_TEXTE_COLONNES
  return {
    x0: MARGE_BLOC + (texteLignes ? LARGEUR_TEXTE : 6),
    y0: BANDE_BLOC + (texteColonnes ? HAUTEUR_IDS : 6),
    texteLignes, texteColonnes, glyphes: v.s >= SEUIL_GLYPHES,
  }
}

/** Taille qui fait tenir toute la matrice dans la zone. */
export function tailleAjustee(g: Grille, largeur: number, hauteur: number): number {
  const x0 = MARGE_BLOC + 6, y0 = BANDE_BLOC + 6
  const s = Math.min((largeur - x0 - 8) / g.colonnes.length, (hauteur - y0 - 8) / g.lignes.length)
  return Math.max(1.5, Math.min(32, s))
}

export function bornerVue(v: Vue, g: Grille): void {
  const { x0, y0 } = geometrie(v)
  const maxX = Math.max(0, g.colonnes.length * v.s - (v.largeur - x0) + 24)
  const maxY = Math.max(0, g.lignes.length * v.s - (v.hauteur - y0) + 24)
  v.ox = Math.max(0, Math.min(maxX, v.ox))
  v.oy = Math.max(0, Math.min(maxY, v.oy))
}

export function cibleEn(e: EtatRendu, x: number, y: number): Cible | null {
  const v = e.vue, g = e.g
  const { x0, y0 } = geometrie(v)
  const r = Math.floor((y - y0 + v.oy) / v.s)
  const c = Math.floor((x - x0 + v.ox) / v.s)
  const rOk = y >= y0 && r >= 0 && r < g.lignes.length
  const cOk = x >= x0 && c >= 0 && c < g.colonnes.length
  if (x < MARGE_BLOC && rOk) {
    const p = g.plagesLignes.find((p) => r >= p.debut && r < p.fin)
    return p ? { zone: 'blocLigne', bloc: p.bloc } : null
  }
  if (y < BANDE_BLOC && cOk) {
    const p = g.plagesColonnes.find((p) => c >= p.debut && c < p.fin)
    return p ? { zone: 'blocColonne', bloc: p.bloc } : null
  }
  if (x < x0 && rOk) return { zone: 'ligne', r }
  if (y < y0 && cOk) return { zone: 'colonne', c }
  if (rOk && cOk) return { zone: 'cellule', r, c }
  return null
}

/** Position d'écran (coin haut-gauche) d'une cellule. */
export function ecranCellule(v: Vue, r: number, c: number): { x: number; y: number } {
  const { x0, y0 } = geometrie(v)
  return { x: x0 + c * v.s - v.ox, y: y0 + r * v.s - v.oy }
}

// ─── Outils de dessin ────────────────────────────────────────────────────────

const cacheTronque = new Map<string, string>()
function tronquer(ctx: CanvasRenderingContext2D, texte: string, largeur: number): string {
  const cle = `${ctx.font}|${largeur}|${texte}`
  const deja = cacheTronque.get(cle)
  if (deja !== undefined) return deja
  let res = texte
  if (ctx.measureText(texte).width > largeur) {
    let bas = 0, haut = texte.length
    while (bas < haut) {
      const mil = (bas + haut + 1) >> 1
      if (ctx.measureText(texte.slice(0, mil) + '…').width <= largeur) bas = mil
      else haut = mil - 1
    }
    res = texte.slice(0, bas).trimEnd() + '…'
  }
  if (cacheTronque.size > 4000) cacheTronque.clear()
  cacheTronque.set(cle, res)
  return res
}

function couleurStatut(statut: string): string {
  return statut === 'valide' ? PALETTE.valide : statut === 'refute' ? PALETTE.refute : PALETTE.incertain
}
export const GLYPHE_STATUT: Record<string, string> = { valide: '✓', incertain: '?', refute: '✕' }

function losange(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r, y)
  ctx.closePath()
}

/** Intervalle de confiance sur une échelle 0–1 de largeur `l`. */
export function dessinerIntervalle(ctx: CanvasRenderingContext2D, x: number, y: number, l: number, bas: number, haut: number, est: number, attenue = false): void {
  ctx.fillStyle = PALETTE.filet
  ctx.fillRect(x, y, l, 1)
  ctx.fillStyle = attenue ? PALETTE.pale : PALETTE.doux
  ctx.fillRect(x + bas * l, y - 1, Math.max(1, (haut - bas) * l), 3)
  ctx.fillStyle = attenue ? PALETTE.pale : PALETTE.encre
  ctx.fillRect(Math.round(x + est * l) - 0.5, y - 3, 1.5, 7)
}

// ─── Dessin principal ────────────────────────────────────────────────────────

export function dessiner(ctx: CanvasRenderingContext2D, e: EtatRendu): void {
  const { m, g, vue: v } = e
  const { x0, y0, texteLignes, texteColonnes, glyphes } = geometrie(v)
  const s = v.s
  const W = v.largeur, H = v.hauteur
  const nr = g.lignes.length, nc = g.colonnes.length
  const rMin = Math.max(0, Math.floor(v.oy / s)), rMax = Math.min(nr - 1, Math.ceil((v.oy + H - y0) / s))
  const cMin = Math.max(0, Math.floor(v.ox / s)), cMax = Math.min(nc - 1, Math.ceil((v.ox + W - x0) / s))
  const X = (c: number) => x0 + c * s - v.ox
  const Y = (r: number) => y0 + r * s - v.oy
  const finX = Math.min(W, X(nc)), finY = Math.min(H, Y(nr))

  ctx.fillStyle = PALETTE.fond
  ctx.fillRect(0, 0, W, H)

  // Ligne et colonne actives : survol, sélection.
  const survolR = e.survol && (e.survol.zone === 'cellule' || e.survol.zone === 'ligne') ? e.survol.r : -1
  const survolC = e.survol && (e.survol.zone === 'cellule' || e.survol.zone === 'colonne') ? e.survol.c : -1
  const selR = e.noeud !== null ? g.ligneDe[e.noeud]! : e.cellule ? e.cellule.r : -1
  const selC = e.noeud !== null ? g.colonneDe[e.noeud]! : e.cellule ? e.cellule.c : -1

  // ── Zone de la matrice ──
  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, y0, W - x0, H - y0)
  ctx.clip()

  // Sous-lignes d'alternatives : fond gris très clair.
  for (let r = rMin; r <= rMax; r++) {
    const l = g.lignes[r]!
    if (l.genre === 'alternative') {
      ctx.fillStyle = PALETTE.alternative
      ctx.fillRect(x0, Y(r), finX - x0, s)
    }
  }
  const bandeLigne = (r: number, couleur: string) => { if (r >= 0) { ctx.fillStyle = couleur; ctx.fillRect(x0, Y(r), finX - x0, s) } }
  const bandeColonne = (c: number, couleur: string) => { if (c >= 0) { ctx.fillStyle = couleur; ctx.fillRect(X(c), y0, s, finY - y0) } }
  bandeLigne(selR, PALETTE.bandeForte)
  bandeColonne(selC, PALETTE.bandeForte)
  if (survolR !== selR) bandeLigne(survolR, PALETTE.bande)
  if (survolC !== selC) bandeColonne(survolC, PALETTE.bande)

  // Quadrillage discret quand les cellules sont lisibles.
  if (s >= 9) {
    ctx.fillStyle = PALETTE.grille
    for (let r = rMin; r <= rMax + 1; r++) ctx.fillRect(x0, Math.round(Y(r)), finX - x0, 1)
    for (let c = cMin; c <= cMax + 1; c++) ctx.fillRect(Math.round(X(c)), y0, 1, finY - y0)
  }

  // Blocs diagonaux (DSM partitionnée) : filet autour de chaque bloc, séparateurs pleine largeur.
  if (g.plagesLignes.length) {
    ctx.fillStyle = PALETTE.filet
    for (const p of g.plagesLignes) ctx.fillRect(x0, Math.round(Y(p.debut)), finX - x0, 1)
    for (const p of g.plagesColonnes) ctx.fillRect(Math.round(X(p.debut)), y0, 1, finY - y0)
    ctx.strokeStyle = PALETTE.filetFort
    ctx.lineWidth = 1
    g.plagesLignes.forEach((p, k) => {
      const q = g.plagesColonnes[k]!
      ctx.strokeRect(Math.round(X(q.debut)) + 0.5, Math.round(Y(p.debut)) + 0.5, Math.round((q.fin - q.debut) * s), Math.round((p.fin - p.debut) * s))
    })
  }

  // Cellules visibles.
  for (const cel of g.liste) {
    if (cel.r < rMin || cel.r > rMax || cel.c < cMin || cel.c > cMax) continue
    dessinerCellule(ctx, X(cel.c), Y(cel.r), s, cel, e, glyphes)
  }

  // Lignée en surimpression : contour encre des cellules du chemin.
  if (e.lignee && e.noeud !== null) {
    ctx.strokeStyle = PALETTE.encre
    ctx.lineWidth = s >= SEUIL_GLYPHES ? 1 : 0.8
    for (const d of m.deps) {
      if (!e.lignee[d.source] || !e.lignee[d.cible]) continue
      const r = g.ligneDe[d.cible]!, c = g.colonneDe[d.source]!
      if (r < rMin || r > rMax || c < cMin || c > cMax) continue
      if (g.lignes[r]!.genre === 'bloc' || g.colonnes[c]!.genre === 'bloc') continue
      ctx.strokeRect(X(c) + 0.5, Y(r) + 0.5, s - 1, s - 1)
    }
  }
  if (e.cellule) {
    ctx.strokeStyle = PALETTE.encre
    ctx.lineWidth = 1.5
    ctx.strokeRect(X(e.cellule.c) - 0.5, Y(e.cellule.r) - 0.5, s + 1, s + 1)
  }
  if (e.brosse) {
    const b = e.brosse
    ctx.strokeStyle = PALETTE.encre
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.strokeRect(X(b.c0) + 0.5, Y(b.r0) + 0.5, (b.c1 - b.c0 + 1) * s - 1, (b.r1 - b.r0 + 1) * s - 1)
    ctx.setLineDash([])
  }
  ctx.restore()

  // ── En-têtes de lignes (figés à gauche) ──
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, y0, x0, H - y0)
  ctx.clip()
  ctx.fillStyle = PALETTE.fond
  ctx.fillRect(0, y0, x0, H - y0)
  ctx.fillStyle = PALETTE.marge
  ctx.fillRect(0, y0, MARGE_BLOC, H - y0)
  if (selR >= 0) { ctx.fillStyle = PALETTE.bandeForte; ctx.fillRect(MARGE_BLOC, Y(selR), x0 - MARGE_BLOC, s) }
  if (survolR >= 0 && survolR !== selR) { ctx.fillStyle = PALETTE.bande; ctx.fillRect(MARGE_BLOC, Y(survolR), x0 - MARGE_BLOC, s) }
  if (texteLignes) for (let r = rMin; r <= rMax; r++) dessinerEnteteLigne(ctx, e, r, Y(r), x0)
  // Étiquettes de blocs dans la marge (verticales).
  ctx.fillStyle = PALETTE.filet
  ctx.fillRect(MARGE_BLOC - 1, y0, 1, finY - y0)
  for (const p of g.plagesLignes) {
    const ya = Math.max(y0, Y(p.debut)), yb = Math.min(H, Y(p.fin))
    ctx.fillStyle = PALETTE.filetFort
    ctx.fillRect(0, Math.round(Y(p.debut)), x0, 1)
    if (yb - ya < 14) continue
    const b = m.blocs[p.bloc]!
    const replie = g.lignes[p.debut]!.genre === 'bloc'
    ctx.save()
    ctx.translate(MARGE_BLOC / 2 + 4, (ya + yb) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.font = `600 10px ${POLICE}`
    ctx.fillStyle = b.abandonne ? PALETTE.pale : PALETTE.texte
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(tronquer(ctx, (replie ? '+ ' : '') + b.court.toUpperCase(), yb - ya - 6), 0, 0)
    ctx.restore()
  }
  ctx.fillStyle = PALETTE.filet
  ctx.fillRect(x0 - 1, y0, 1, H - y0)
  ctx.restore()

  // ── En-têtes de colonnes (figés en haut) ──
  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, 0, W - x0, y0)
  ctx.clip()
  ctx.fillStyle = PALETTE.fond
  ctx.fillRect(x0, 0, W - x0, y0)
  ctx.fillStyle = PALETTE.marge
  ctx.fillRect(x0, 0, W - x0, BANDE_BLOC)
  if (selC >= 0) { ctx.fillStyle = PALETTE.bandeForte; ctx.fillRect(X(selC), BANDE_BLOC, s, y0 - BANDE_BLOC) }
  if (survolC >= 0 && survolC !== selC) { ctx.fillStyle = PALETTE.bande; ctx.fillRect(X(survolC), BANDE_BLOC, s, y0 - BANDE_BLOC) }
  if (texteColonnes) {
    ctx.font = `${Math.min(11, s - 1)}px ${MONO}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (let c = cMin; c <= cMax; c++) {
      const col = g.colonnes[c]!
      if (col.genre !== 'noeud') continue
      const i = col.i
      const attenue = e.lignee ? !e.lignee[i] : m.noeuds[i]!.piste === 'abandonnee'
      ctx.fillStyle = c === selC ? PALETTE.encre : attenue ? PALETTE.pale : PALETTE.texte
      ctx.save()
      ctx.translate(X(c) + s / 2, y0 - 4)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(m.ident[i]!, 0, 0)
      ctx.restore()
    }
  }
  ctx.fillStyle = PALETTE.filet
  ctx.fillRect(x0, BANDE_BLOC - 1, W - x0, 1)
  for (const p of g.plagesColonnes) {
    const xa = Math.max(x0, X(p.debut)), xb = Math.min(W, X(p.fin))
    ctx.fillStyle = PALETTE.filetFort
    ctx.fillRect(Math.round(X(p.debut)), 0, 1, y0)
    if (xb - xa < 16) continue
    const b = m.blocs[p.bloc]!
    const replie = g.colonnes[p.debut]!.genre === 'bloc'
    ctx.font = `600 10px ${POLICE}`
    ctx.fillStyle = b.abandonne ? PALETTE.pale : PALETTE.texte
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const texte = (replie ? '+ ' : '') + (xb - xa > 150 ? b.nom : b.court).toUpperCase()
    ctx.fillText(tronquer(ctx, texte, xb - xa - 10), xa + 6, BANDE_BLOC / 2)
  }
  ctx.fillStyle = PALETTE.filet
  ctx.fillRect(x0, y0 - 1, W - x0, 1)
  ctx.restore()

  // ── Coin : rappel de lecture ──
  ctx.fillStyle = PALETTE.fond
  ctx.fillRect(0, 0, x0, y0)
  ctx.fillStyle = PALETTE.marge
  ctx.fillRect(0, 0, x0, BANDE_BLOC)
  ctx.fillStyle = PALETTE.filet
  ctx.fillRect(0, y0 - 1, x0, 1)
  ctx.fillRect(x0 - 1, 0, 1, y0)
  ctx.fillRect(0, BANDE_BLOC - 1, x0, 1)
  if (texteLignes) {
    ctx.font = `600 9.5px ${POLICE}`
    ctx.fillStyle = PALETTE.doux
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('SOUS-PROBLÈMES', 8, BANDE_BLOC / 2)
    ctx.font = `11px ${POLICE}`
    ctx.fillStyle = PALETTE.texte
    ctx.fillText('Ligne : conclusion', MARGE_BLOC + 8, y0 - 30)
    ctx.fillText('Colonne : prémisse citée', MARGE_BLOC + 8, y0 - 14)
    ctx.textAlign = 'right'
    ctx.fillStyle = PALETTE.doux
    ctx.font = `10px ${POLICE}`
    ctx.fillText('conf. 0–1', x0 - 8, y0 - 14)
  }
}

function dessinerEnteteLigne(ctx: CanvasRenderingContext2D, e: EtatRendu, r: number, y: number, x0: number): void {
  const { m, g } = e
  const l = g.lignes[r]!
  const s = e.vue.s
  const ym = y + s / 2
  const taille = Math.min(11.5, s - 1.5)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  let x = MARGE_BLOC + 8
  if (l.genre === 'bloc') {
    const b = m.blocs[l.bloc]!
    ctx.font = `italic ${taille}px ${POLICE}`
    ctx.fillStyle = PALETTE.doux
    ctx.fillText(tronquer(ctx, `${b.nom} — ${b.noeuds.length} nœuds repliés`, x0 - x - 8), x, ym)
    return
  }
  if (l.genre === 'alternative') {
    const d = m.noeuds[l.i]!.decision!
    const a = d.alternatives[l.k]!
    ctx.font = `${taille - 0.5}px ${POLICE}`
    ctx.fillStyle = PALETTE.pale
    ctx.fillText('✕', x + 16, ym)
    ctx.font = `italic ${taille - 0.5}px ${POLICE}`
    ctx.fillText(tronquer(ctx, `${a.libelle}${a.raison ? ' — ' + a.raison : ''}`, x0 - x - 38), x + 30, ym)
    return
  }
  const i = l.i
  const n = m.noeuds[i]!
  const attenue = e.lignee ? !e.lignee[i] : n.piste === 'abandonnee'
  const encre = attenue ? PALETTE.pale : PALETTE.encre
  // Décision : en-tête en losange.
  if (n.type === 'decision') {
    ctx.strokeStyle = encre
    ctx.lineWidth = 1
    losange(ctx, x + 3.5, ym, Math.min(4, s / 2 - 1))
    ctx.stroke()
  }
  x += 11
  ctx.font = `${taille}px ${MONO}`
  ctx.fillStyle = encre
  ctx.fillText(m.ident[i]!, x, ym)
  x += 54
  ctx.font = `600 ${Math.min(8.5, taille - 2)}px ${POLICE}`
  ctx.fillStyle = attenue ? PALETTE.tresPale : PALETTE.doux
  ctx.fillText(TYPES_COURTS[n.type].toUpperCase(), x, ym + 0.5)
  x += 70
  ctx.font = `${taille}px ${POLICE}`
  ctx.fillStyle = attenue ? PALETTE.pale : PALETTE.texte
  ctx.fillText(tronquer(ctx, n.nom, x0 - x - 52), x, ym)
  const conf = confianceDe(n)
  dessinerIntervalle(ctx, x0 - 44, Math.round(ym), 36, conf.bas, conf.haut, conf.estimation, attenue)
}

function dessinerCellule(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, cel: Cellule, e: EtatRendu, glyphes: boolean): void {
  const m = e.m
  const cx = x + s / 2, cy = y + s / 2
  if (cel.diagonale) {
    const i = (e.g.lignes[cel.r] as { i: number }).i
    const n = m.noeuds[i]!
    const couleur = couleurStatut(n.statut)
    if (!glyphes) {
      ctx.fillStyle = couleur
      ctx.fillRect(x, y, s, s)
      return
    }
    ctx.fillStyle = PALETTE.diagonale
    ctx.fillRect(x + 0.5, y + 0.5, s - 1, s - 1)
    ctx.fillStyle = couleur
    ctx.font = `600 ${Math.round(s * 0.62)}px ${POLICE}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(GLYPHE_STATUT[n.statut]!, cx, s >= 14 ? cy - s * 0.1 : cy + 0.5)
    if (s >= 14) {
      const conf = confianceDe(n)
      const l = s - 4
      ctx.fillStyle = PALETTE.filet
      ctx.fillRect(x + 2, y + s - 3, l, 1)
      ctx.fillStyle = PALETTE.encre
      ctx.fillRect(x + 2 + conf.bas * l, y + s - 3.5, Math.max(1, (conf.haut - conf.bas) * l), 2)
    }
    return
  }

  if (cel.agregat) {
    const nb = cel.deps.length
    if (!nb) return
    const retro = cel.deps.some((k) => estRetro(m.deps[k]!))
    if (glyphes && s >= 12) {
      ctx.font = `${Math.min(11, s * 0.62)}px ${MONO}`
      ctx.fillStyle = retro ? PALETTE.retro : PALETTE.encre
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(nb), cx, cy + 0.5)
    } else {
      ctx.globalAlpha = Math.min(1, 0.2 + nb / 8)
      ctx.fillStyle = retro ? PALETTE.retro : PALETTE.encre
      ctx.fillRect(x + 0.5, y + 0.5, s - 1, s - 1)
      ctx.globalAlpha = 1
    }
    return
  }

  if (cel.deps.length) {
    const d = m.deps[cel.deps[0]!]!
    const couleur = estRetro(d) ? PALETTE.retro : d.principale ? PALETTE.encre : PALETTE.pale
    if (!glyphes) {
      ctx.globalAlpha = d.role === 'principale' ? 1 : d.role === 'auxiliaire' ? 0.7 : d.role === 'technique' ? 0.45 : 0.3
      ctx.fillStyle = couleur
      ctx.fillRect(x, y, s, s)
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = couleur
      ctx.strokeStyle = couleur
      if (d.role === 'principale') {
        const c = Math.round(s * 0.56)
        ctx.fillRect(Math.round(cx - c / 2), Math.round(cy - c / 2), c, c)
      } else if (d.role === 'auxiliaire') {
        const c = Math.max(2, Math.round(s * 0.32))
        ctx.fillRect(Math.round(cx - c / 2), Math.round(cy - c / 2), c, c)
      } else if (d.role === 'technique') {
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(1.1, s * 0.09), 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(1.6, s * 0.24), 0, Math.PI * 2)
        ctx.stroke()
      }
      // Liseré : validité de la démonstration citante.
      if (d.validite !== 'valide') {
        ctx.strokeStyle = d.validite === 'invalide' ? PALETTE.refute : PALETTE.incertain
        ctx.lineWidth = 1
        ctx.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3)
      }
    }
  } else if (cel.transitif) {
    if (!glyphes) {
      ctx.fillStyle = PALETTE.transitifPlein
      ctx.fillRect(x, y, s, s)
    } else {
      // Hachures légères : dépendance indirecte.
      ctx.save()
      ctx.beginPath()
      ctx.rect(x + 1, y + 1, s - 2, s - 2)
      ctx.clip()
      ctx.strokeStyle = PALETTE.transitif
      ctx.lineWidth = 1
      ctx.beginPath()
      const pas = Math.max(3, s / 3)
      for (let k = -s; k < s; k += pas) {
        ctx.moveTo(x + k, y + s)
        ctx.lineTo(x + k + s, y)
      }
      ctx.stroke()
      ctx.restore()
    }
  }

  // Liens sémantiques (hors justification) : glyphes texte, coin haut-droit si la cellule est déjà occupée.
  if (cel.liens.length) {
    const l = m.liens[cel.liens[0]!]!
    const couleur = l.genre === 'contredit' ? PALETTE.refute : l.genre === 'abandonne' ? PALETTE.doux : PALETTE.retro
    if (!glyphes) {
      ctx.fillStyle = couleur
      ctx.fillRect(x, y, s, s)
      return
    }
    const glyphe = l.genre === 'contredit' ? '⊣' : l.genre === 'resout' ? '⊢' : l.genre === 'abandonne' ? '×' : '↦'
    const seul = !cel.deps.length && !cel.transitif
    ctx.font = `600 ${Math.round(seul ? s * 0.72 : s * 0.45)}px ${POLICE}`
    ctx.fillStyle = couleur
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(glyphe, seul ? cx : x + s * 0.8, seul ? cy + 0.5 : y + s * 0.22)
  }
}
