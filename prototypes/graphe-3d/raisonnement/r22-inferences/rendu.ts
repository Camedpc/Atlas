// R22 · Rendu Canvas 2D : couloirs, bande « Hypothèses et modèle », énoncés, barres d'inférence,
// prémisses, étiquettes latérales, liens sémantiques. Monde en px « papier », caméra (x, y, k).

import { LIBELLES_TYPE, type NoeudR, type Statut, type Validation, type Validite } from '../../src/raisonnement/donnees'
import type { Modele, Unite } from './modele'
import {
  couperLignes, INTERLIGNE, LONG_BARRE, PAD, POLICE_BANDE, POLICE_ETIQUETTE, POLICE_TITRE,
  type Barre, type Boite, type MiseEnPage,
} from './mise-en-page'

export const C = {
  fond: '#ffffff',
  couloir: '#fbfbfc',
  abandon: '#f4f4f5',
  filet: '#dfe2e7',
  encre: '#1d2129',
  encreDouce: '#555c6b',
  gris: '#8a909c',
  grisClair: '#b8bdc6',
  valide: '#2f6b4f',
  incertain: '#9a6f14',
  refute: '#a3402c',
  selection: '#1f3f73',
  chemin: '#3d3a8c',
}

export const REMPLISSAGE: Record<Validation, string> = { aucune: '#ffffff', ia: '#f4f5f7', humain: '#eceef1', ia_humain: '#e2e4e9' }
export const SIGLE_VALIDATION: Record<Validation, string> = { aucune: '', ia: 'IA', humain: 'H', ia_humain: 'IA+H' }
export const GLYPHE_VALIDITE: Record<Validite, string> = { valide: '✓', a_verifier: '?', invalide: '✕' }
export const COULEUR_VALIDITE: Record<Validite, string> = { valide: C.valide, a_verifier: C.incertain, invalide: C.refute }
export const COULEUR_STATUT: Record<Statut, string> = { valide: C.encre, incertain: C.incertain, refute: C.refute }
export const GLYPHE_STATUT: Record<Statut, string> = { valide: '✓', incertain: '?', refute: '✕' }

const SANS = 'Inter, "Segoe UI", system-ui, sans-serif'
const MONO = '"Cascadia Mono", Consolas, "SF Mono", monospace'

export interface Camera {
  x: number
  y: number
  k: number
}

export interface EtatDessin {
  m: Modele
  page: MiseEnPage
  cam: Camera
  largeur: number
  hauteur: number
  /** Opacité par unité et par barre (lignée, filtre, portée). */
  alphaUnite: Float32Array
  alphaBarre: Float32Array
  survolUnite: number | null
  survolBarre: number | null
  selection: number | null
  /** Élément de bande actif (survol ou épinglé) : ses liens en tirets sont tracés. */
  bandeActive: number | null
  /** Tous les liens de contexte (bande → inférences) en tirets. */
  contexte: boolean
  chemin: { unites: Set<number>; barres: Set<number> } | null
  mesurer: (t: string, police: string) => number
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function contourBoite(ctx: CanvasRenderingContext2D, un: Unite, b: Boite): void {
  const { x, y, w, h } = b
  ctx.beginPath()
  switch (un.famille) {
    case 'definition':
      ctx.roundRect(x, y, w, h, 7)
      break
    case 'observation':
      ctx.roundRect(x, y, w, h, Math.min(h / 2, 22))
      break
    case 'decision': {
      const p = 12
      ctx.moveTo(x, y + h / 2)
      ctx.lineTo(x + p, y)
      ctx.lineTo(x + w - p, y)
      ctx.lineTo(x + w, y + h / 2)
      ctx.lineTo(x + w - p, y + h)
      ctx.lineTo(x + p, y + h)
      ctx.closePath()
      break
    }
    default:
      ctx.rect(x, y, w, h)
  }
}

function texteMajuscules(ctx: CanvasRenderingContext2D, t: string, x: number, y: number): void {
  ctx.font = `600 9px ${SANS}`
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.7px'
  ctx.fillText(t.toUpperCase(), x, y)
  ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'
}

function tirets(largeurIntervalle: number): number[] {
  // Incertitude (haut − bas) de l'inférence sur le trait sortant (Boukhelifa 2012 : tirets).
  if (largeurIntervalle > 0.3) return [2, 3]
  if (largeurIntervalle > 0.15) return [5, 3]
  return []
}

const fmt = (v: number) => v.toFixed(2).replace('.', ',')

function statutUnite(m: Modele, un: Unite): Statut {
  // Série : le pire statut de ses membres.
  let s: Statut = 'valide'
  for (const i of un.membres) {
    const st = m.j.noeuds[i]!.statut
    if (st === 'refute') return 'refute'
    if (st === 'incertain') s = 'incertain'
  }
  return s
}

function validationUnite(m: Modele, un: Unite): Validation {
  if (un.genre === 'noeud') return un.noeud.validation
  // Série : la validation la plus faible.
  const ordre: Validation[] = ['aucune', 'ia', 'humain', 'ia_humain']
  let v = 3
  for (const i of un.membres) v = Math.min(v, ordre.indexOf(m.j.noeuds[i]!.validation))
  return ordre[v]!
}

export { statutUnite, validationUnite }

// ─── Dessin ──────────────────────────────────────────────────────────────────

export function dessiner(ctx: CanvasRenderingContext2D, s: EtatDessin, dpr: number): void {
  const { m, page, cam } = s
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = C.fond
  ctx.fillRect(0, 0, s.largeur, s.hauteur)
  ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * cam.x, dpr * cam.y)
  const k = cam.k
  const detail = k >= 0.7
  const titres = k >= 0.42
  // Rectangle visible (monde) pour ne pas dessiner hors écran.
  const vx0 = -cam.x / k, vy0 = -cam.y / k, vx1 = (s.largeur - cam.x) / k, vy1 = (s.hauteur - cam.y) / k
  const visibleRect = (x: number, y: number, w: number, h: number) => x + w >= vx0 && x <= vx1 && y + h >= vy0 && y <= vy1

  // Couloirs.
  page.couloirs.forEach((c, i) => {
    ctx.fillStyle = c.abandonne ? C.abandon : i % 2 ? C.couloir : C.fond
    ctx.fillRect(page.bornes.x0 - 4000, c.y0, page.bornes.x1 + 8000, c.y1 - c.y0)
    ctx.strokeStyle = C.filet
    ctx.lineWidth = 1 / k
    ctx.beginPath()
    ctx.moveTo(page.bornes.x0 - 4000, c.y0)
    ctx.lineTo(page.bornes.x1 + 4000, c.y0)
    ctx.stroke()
  })

  // Repères de rangs (profondeur logique).
  if (titres) {
    ctx.fillStyle = C.gris
    ctx.font = `10px ${MONO}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const yR = page.bandeY1 + 18
    for (let r = 0; r < page.rangs; r++) ctx.fillText(`rang ${r}`, page.xRang(r), yR)
  }

  // Bande « Hypothèses et modèle ».
  ctx.textBaseline = 'middle'
  ctx.fillStyle = C.encreDouce
  ctx.textAlign = 'left'
  texteMajuscules(ctx, 'Hypothèses', 16, page.bande[0] ? page.bande[0].y + 13 : 40)
  const premierChoix = page.bande.find((e) => m.j.noeuds[e.noeud]!.type === 'choix_modelisation')
  if (premierChoix) texteMajuscules(ctx, 'Modèle', 16, premierChoix.y + 13)
  for (const e of page.bande) dessinerElementBande(ctx, s, e.noeud, e.x, e.y, e.w, e.h)

  // Arêtes de prémisses.
  const infs = m.inferences
  ctx.lineCap = 'butt'
  for (let bi = 0; bi < page.barres.length; bi++) {
    const bar = page.barres[bi]!
    const inf = infs[bar.inf]!
    const aB = s.alphaBarre[bi]!
    for (const a of bar.aretes) {
      const src = page.boites[a.source]!
      const sx = src.x + src.w, sy = src.y + src.h / 2
      if (!visibleRect(Math.min(sx, bar.x), Math.min(sy, bar.y), Math.abs(bar.x - sx), Math.abs(bar.y - sy) + 1)) continue
      const alpha = Math.min(aB, s.alphaUnite[a.source]!)
      const surChemin = s.chemin?.barres.has(bi) && s.chemin.unites.has(a.source)
      ctx.globalAlpha = alpha * (inf.principale ? 1 : 0.7)
      ctx.strokeStyle = surChemin ? C.chemin : a.role === 'principale' && inf.principale ? C.encre : C.gris
      ctx.lineWidth = surChemin ? 2.2 : a.role === 'principale' ? 1 : 0.8
      ctx.setLineDash(inf.principale ? [] : [3, 2])
      const dx = Math.max(40, (bar.x - sx) * 0.5)
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.bezierCurveTo(sx + dx, sy, bar.x - dx, bar.y, bar.x, bar.y)
      ctx.stroke()
      // « a produit » : activité → observation (grammaire PROV).
      if (detail && src && m.unites[a.source]!.famille === 'activite' && m.unites[inf.conclusion]!.type === 'observation') {
        ctx.setLineDash([])
        ctx.fillStyle = C.gris
        ctx.font = `italic 9.5px ${SANS}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText('a produit', (sx + bar.x) / 2, (sy + bar.y) / 2 - 3)
      }
    }
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 1

  // Liens de contexte (bande → inférences) : actifs ou tous.
  dessinerLiensBande(ctx, s)

  // Barres d'inférence.
  for (let bi = 0; bi < page.barres.length; bi++) {
    const bar = page.barres[bi]!
    const b = page.boites[infs[bar.inf]!.conclusion]!
    if (!visibleRect(bar.x - 130, bar.y - 30, b.x - bar.x + 140, 70)) continue
    dessinerBarre(ctx, s, bi, bar, b, detail)
  }

  // Boîtes.
  for (let u = 0; u < page.boites.length; u++) {
    const b = page.boites[u]
    if (!b || !visibleRect(b.x - 4, b.y - 4, b.w + 8, b.hTotale + 8)) continue
    dessinerBoite(ctx, s, m.unites[u]!, b, titres, detail)
  }

  // Liens sémantiques (hors disposition).
  dessinerLiensSemantiques(ctx, s)

  // Libellés des couloirs, collés au bord gauche de l'écran.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  for (const c of page.couloirs) {
    const y0 = c.y0 * k + cam.y, y1 = c.y1 * k + cam.y
    if (y1 < 0 || y0 > s.hauteur) continue
    const x = Math.max(12, 16 * k + cam.x)
    const lignes = couperLignes(c.nom, 150, `600 11px ${SANS}`, s.mesurer, 2)
    const yT = Math.min(Math.max(y0 + 8, 8), y1 - 40)
    const w = Math.max(...lignes.map((l) => s.mesurer(l, `600 11px ${SANS}`))) + 12
    ctx.fillStyle = c.abandonne ? 'rgba(244,244,245,0.94)' : 'rgba(255,255,255,0.94)'
    ctx.fillRect(x - 6, yT - 4, w, lignes.length * 14 + (c.abandonne ? 14 : 0) + 8)
    ctx.fillStyle = c.abandonne ? C.gris : C.encreDouce
    ctx.font = `600 11px ${SANS}`
    lignes.forEach((l, i) => ctx.fillText(l, x, yT + i * 14))
    if (c.abandonne) {
      ctx.font = `italic 10px ${SANS}`
      ctx.fillText('piste abandonnée', x, yT + lignes.length * 14)
    }
  }
}

function dessinerElementBande(ctx: CanvasRenderingContext2D, s: EtatDessin, noeud: number, x: number, y: number, w: number, h: number): void {
  const n = s.m.j.noeuds[noeud]!
  const actif = s.bandeActive === noeud
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = actif ? C.selection : n.statut === 'valide' ? C.grisClair : COULEUR_STATUT[n.statut]
  ctx.lineWidth = actif ? 1.6 : 1
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.fill()
  ctx.stroke()
  // Glyphe : carré (hypothèse), hexagone plat (choix de modélisation).
  const gx = x + 11, gy = y + h / 2
  ctx.strokeStyle = C.encreDouce
  ctx.lineWidth = 1
  ctx.beginPath()
  if (n.type === 'hypothese') ctx.rect(gx - 4, gy - 4, 8, 8)
  else for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i
    const px = gx + 5.5 * Math.cos(a), py = gy + 5.5 * Math.sin(a)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.stroke()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = C.encreDouce
  ctx.font = `10px ${MONO}`
  ctx.fillText(s.m.code[noeud]!, x + 21, gy)
  ctx.fillStyle = C.encre
  ctx.font = POLICE_BANDE
  const dispo = w - 44 - 8
  let t = n.nom
  while (t.length > 3 && s.mesurer(t, POLICE_BANDE) > dispo) t = t.slice(0, -2)
  if (t !== n.nom) t = `${t.trimEnd()}…`
  ctx.fillText(t, x + 44, gy + 0.5)
}

function dessinerLiensBande(ctx: CanvasRenderingContext2D, s: EtatDessin): void {
  const { m, page } = s
  const cibles: number[] = s.contexte ? page.bande.map((e) => e.noeud) : s.bandeActive !== null ? [s.bandeActive] : []
  if (!cibles.length && !m.liensBande.length) return
  const barreDeInf = new Map<number, number>()
  page.barres.forEach((b, i) => barreDeInf.set(b.inf, i))
  ctx.setLineDash([3, 3])
  for (const nb of cibles) {
    const e = page.bande.find((x) => x.noeud === nb)!
    const actif = s.bandeActive === nb
    ctx.strokeStyle = actif ? C.selection : C.grisClair
    ctx.lineWidth = actif ? 1 : 0.7
    ctx.globalAlpha = actif ? 0.85 : 0.55
    for (const i of m.citeeParNoeud[nb]!) {
      const bi = barreDeInf.get(i)
      if (bi === undefined) continue
      const bar = page.barres[bi]!
      const x0 = e.x + e.w / 2, y0 = e.y + e.h
      const x1 = bar.x + LONG_BARRE / 2, y1 = bar.y
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.bezierCurveTo(x0, y0 + (y1 - y0) * 0.5, x1, y1 - (y1 - y0) * 0.4, x1, y1)
      ctx.stroke()
    }
  }
  // Liens « instaure » : une unité (décision) qui fonde un élément de la bande. Toujours tracés.
  ctx.strokeStyle = C.encreDouce
  ctx.lineWidth = 0.9
  ctx.globalAlpha = 0.8
  for (const l of m.liensBande) {
    const src = page.boites[l.source]
    const e = page.bande.find((x) => x.noeud === l.bande)
    if (!src || !e) continue
    const x0 = src.x + src.w / 2, y0 = src.y
    const x1 = e.x + e.w / 2, y1 = e.y + e.h
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.bezierCurveTo(x0, y0 - 40, x1, y1 + 40, x1, y1)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = C.encreDouce
    ctx.font = `italic 9.5px ${SANS}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('instaure', x0 + 4, y0 - 4)
    ctx.setLineDash([3, 3])
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 1
}

function dessinerBarre(ctx: CanvasRenderingContext2D, s: EtatDessin, bi: number, bar: Barre, b: Boite, detail: boolean): void {
  const inf = s.m.inferences[bar.inf]!
  const alpha = s.alphaBarre[bi]!
  const survol = s.survolBarre === bi
  const surChemin = !!s.chemin?.barres.has(bi)
  ctx.globalAlpha = alpha
  const couleur = surChemin ? C.chemin : survol ? C.selection : inf.principale ? C.encre : C.gris
  // Trait sortant barre → conclusion : tirets selon la largeur de l'intervalle de confiance.
  const xFin = bar.x + LONG_BARRE
  ctx.strokeStyle = couleur
  ctx.lineWidth = 1
  ctx.setLineDash(tirets(inf.confiance.haut - inf.confiance.bas))
  ctx.beginPath()
  ctx.moveTo(xFin, bar.y)
  // Rejoint le centre de la boîte (les barres empilées convergent).
  const yb = b.y + b.h / 2
  ctx.bezierCurveTo(xFin + 14, bar.y, b.x - 14, yb, b.x, yb)
  ctx.stroke()
  ctx.setLineDash([])
  // Barre : épaisseur ∝ confiance (1 à 4 px).
  const ep = 1 + 3 * inf.confiance.estimation
  ctx.fillStyle = couleur
  ctx.fillRect(bar.x, bar.y - ep / 2, LONG_BARRE, ep)
  if (survol) {
    ctx.strokeStyle = C.selection
    ctx.lineWidth = 0.8
    ctx.strokeRect(bar.x - 3, bar.y - ep / 2 - 3, LONG_BARRE + 6, ep + 6)
  }
  // Glyphe de validité (✓ ? ✕), à droite de la barre, au-dessus du trait sortant.
  ctx.font = `600 11px ${SANS}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = COULEUR_VALIDITE[inf.validite]
  ctx.fillText(GLYPHE_VALIDITE[inf.validite], xFin + 3, bar.y - 2)
  if (detail) {
    // Confiance chiffrée, sous le trait sortant.
    ctx.font = `9px ${MONO}`
    ctx.fillStyle = C.encreDouce
    ctx.textBaseline = 'top'
    ctx.fillText(fmt(inf.confiance.estimation), xFin + 3, bar.y + 3)
    // Nom de la démonstration, au-dessus de la barre (aligné sur sa fin).
    ctx.font = `9.5px ${SANS}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = inf.principale ? C.encreDouce : C.gris
    let nom = inf.nom
    while (nom.length > 4 && s.mesurer(nom, `9.5px ${SANS}`) > 116) nom = nom.slice(0, -2)
    if (nom !== inf.nom) nom = `${nom.trimEnd()}…`
    const wNom = s.mesurer(nom, `9.5px ${SANS}`)
    ctx.globalAlpha = alpha * 0.92
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillRect(xFin - wNom - 1, bar.y - 16, wNom + 2, 12)
    ctx.globalAlpha = alpha
    ctx.fillStyle = inf.principale ? C.encreDouce : C.gris
    ctx.fillText(nom, xFin, bar.y - 4)
    // Étiquette latérale (InContextOf) : rôles non tracés et renvois, sous la barre.
    if (bar.etiquette.length) {
      const lignes = couperLignes(bar.etiquette.join(' · '), 118, POLICE_ETIQUETTE, s.mesurer, 3)
      ctx.font = POLICE_ETIQUETTE
      ctx.textBaseline = 'top'
      const wMax = Math.max(...lignes.map((l) => s.mesurer(l, POLICE_ETIQUETTE)))
      ctx.globalAlpha = alpha * 0.92
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fillRect(xFin - wMax - 1, bar.y + 5, wMax + 2, lignes.length * 12 + 1)
      ctx.globalAlpha = alpha
      ctx.fillStyle = C.encreDouce
      lignes.forEach((l, i) => ctx.fillText(l, xFin, bar.y + 6 + i * 12))
    }
  }
  ctx.globalAlpha = 1
}

function dessinerBoite(ctx: CanvasRenderingContext2D, s: EtatDessin, un: Unite, b: Boite, titres: boolean, detail: boolean): void {
  const m = s.m
  const alpha = s.alphaUnite[un.k]! * (un.abandonnee ? 0.55 : 1)
  const statut = statutUnite(m, un)
  const validation = validationUnite(m, un)
  const sel = s.selection === un.k
  const survol = s.survolUnite === un.k
  const surChemin = !!s.chemin?.unites.has(un.k)
  ctx.globalAlpha = alpha

  // Fond (validation) puis contour (statut ; tirets si non démontré).
  ctx.fillStyle = REMPLISSAGE[validation]
  contourBoite(ctx, un, b)
  ctx.fill()
  if (un.famille === 'activite') {
    // En-tête gris 5 % (activité PROV) : l'agent.
    ctx.fillStyle = '#f2f3f5'
    ctx.fillRect(b.x, b.y, b.w, 18)
    ctx.strokeStyle = C.filet
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(b.x, b.y + 18)
    ctx.lineTo(b.x + b.w, b.y + 18)
    ctx.stroke()
  }
  ctx.strokeStyle = surChemin ? C.chemin : sel || survol ? C.selection : COULEUR_STATUT[statut]
  ctx.lineWidth = sel || surChemin ? 2 : survol ? 1.5 : statut === 'valide' ? 1 : 1.3
  ctx.setLineDash(un.ouvert ? [4, 3] : [])
  contourBoite(ctx, un, b)
  ctx.stroke()
  ctx.setLineDash([])
  if (un.famille === 'resultat') {
    // Double filet.
    ctx.lineWidth = 1
    ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6)
  }
  if (un.genre === 'serie') {
    // Feuillets empilés discrets : la boîte représente n membres.
    ctx.strokeStyle = C.grisClair
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(b.x + 3, b.y + b.h + 3)
    ctx.lineTo(b.x + b.w + 3, b.y + b.h + 3)
    ctx.lineTo(b.x + b.w + 3, b.y + 3)
    ctx.stroke()
  }

  const pad = un.famille === 'observation' ? 16 : PAD
  const xT = b.x + pad
  const xD = b.x + b.w - pad
  if (!titres) {
    // Vue d'ensemble : le code seul, à taille lisible.
    ctx.fillStyle = C.encre
    ctx.font = `${Math.min(26, 11 / s.cam.k)}px ${MONO}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(un.code, b.x + b.w / 2, b.y + b.h / 2)
    ctx.globalAlpha = 1
    return
  }
  // Ligne de tête : type (petites capitales) ou agent (activité), code à droite.
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = C.encreDouce
  const yTete = b.y + 7 + 6
  // Activité : type et agent (PROV) ; série : « × n ». Tronqué pour laisser la place au code.
  let tete = un.famille === 'activite' ? `${LIBELLES_TYPE[un.type]} · ${un.noeud.auteur}` : LIBELLES_TYPE[un.type]
  if (un.genre === 'serie') tete += ` × ${un.membres.length}`
  ctx.font = `10px ${MONO}`
  const dispo = xD - xT - s.mesurer(un.code, `10px ${MONO}`) - 10
  const largeurTete = (t: string) => s.mesurer(t.toUpperCase(), `600 9px ${SANS}`) + 0.7 * t.length
  if (largeurTete(tete) > dispo) {
    while (tete.length > 3 && largeurTete(`${tete}…`) > dispo) tete = tete.slice(0, -1)
    tete = `${tete.trimEnd()}…`
  }
  texteMajuscules(ctx, tete, xT, yTete + (un.famille === 'activite' ? -2.5 : 0))
  ctx.font = `10px ${MONO}`
  ctx.textAlign = 'right'
  ctx.fillText(un.code, xD, yTete + (un.famille === 'activite' ? -2.5 : 0))

  // Titre.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = C.encre
  ctx.font = POLICE_TITRE
  const yTitre = b.y + 7 + 12 + 4 + (un.famille === 'activite' ? 3 : 0) + (un.famille === 'observation' ? 2 : 0)
  b.lignes.forEach((l, i) => ctx.fillText(l, xT, yTitre + i * INTERLIGNE))

  // Pied : sparkline ou contrôles à gauche, statut + validation à droite.
  const yPied = b.y + b.h - 5 - (un.famille === 'observation' ? 3 : 0)
  ctx.textBaseline = 'bottom'
  ctx.font = `9.5px ${MONO}`
  ctx.textAlign = 'right'
  const sigle = SIGLE_VALIDATION[validation]
  let xDroite = xD
  if (sigle) {
    ctx.fillStyle = C.encreDouce
    ctx.fillText(sigle, xDroite, yPied)
    xDroite -= s.mesurer(sigle, `9.5px ${MONO}`) + 6
  }
  if (statut !== 'valide') {
    ctx.fillStyle = COULEUR_STATUT[statut]
    ctx.font = `600 11px ${SANS}`
    ctx.fillText(GLYPHE_STATUT[statut], xDroite, yPied + 1)
  }
  ctx.textAlign = 'left'
  if (un.serie && un.serie.points.filter((p) => p.y !== null).length >= 2) dessinerSparkline(ctx, un, xT, yPied - 20, 64, 18)
  else if (un.controles.length && detail) {
    ctx.font = `9.5px ${SANS}`
    let x = xT
    for (const c of un.controles) {
      const n = m.j.noeuds[c]!
      const d = n.demonstrations[0]
      const marque = n.nom.split(' : ')[0]!.split(' ').pop()!
      ctx.fillStyle = COULEUR_VALIDITE[d?.validite ?? 'a_verifier']
      ctx.fillText(GLYPHE_VALIDITE[d?.validite ?? 'a_verifier'], x, yPied - 10)
      x += 9
      ctx.fillStyle = C.encreDouce
      ctx.fillText(marque, x, yPied - 10)
      x += s.mesurer(marque, `9.5px ${SANS}`) + 8
    }
  }

  // Décision : alternatives rejetées (losanges creux gris, reliés en tirets, libellé barré ✕).
  const rejetees = un.noeud.decision?.alternatives.filter((a) => !a.retenue) ?? []
  if (rejetees.length) {
    const x0 = b.x + 14
    ctx.strokeStyle = C.grisClair
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(x0, b.y + b.h)
    ctx.lineTo(x0, b.y + b.h + 6 + (rejetees.length - 0.5) * 16)
    ctx.stroke()
    ctx.setLineDash([])
    rejetees.forEach((a, i) => {
      const yy = b.y + b.h + 6 + i * 16 + 8
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = C.gris
      ctx.beginPath()
      ctx.moveTo(x0 + 10, yy - 4.5)
      ctx.lineTo(x0 + 14.5, yy)
      ctx.lineTo(x0 + 10, yy + 4.5)
      ctx.lineTo(x0 + 5.5, yy)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.font = `10.5px ${SANS}`
      ctx.textBaseline = 'middle'
      let t = a.libelle
      const dispo = b.w - 40
      while (t.length > 3 && s.mesurer(t, `10.5px ${SANS}`) > dispo) t = t.slice(0, -2)
      if (t !== a.libelle) t = `${t.trimEnd()}…`
      const w = s.mesurer(t, `10.5px ${SANS}`)
      ctx.fillStyle = C.gris
      ctx.fillText(t, x0 + 20, yy)
      ctx.strokeStyle = C.gris
      ctx.beginPath()
      ctx.moveTo(x0 + 20, yy + 0.5)
      ctx.lineTo(x0 + 20 + w, yy + 0.5)
      ctx.stroke()
      ctx.fillStyle = C.refute
      ctx.fillText('✕', x0 + 24 + w, yy)
    })
  }
  ctx.globalAlpha = 1
}

function dessinerSparkline(ctx: CanvasRenderingContext2D, un: Unite, x: number, y: number, w: number, h: number): void {
  const sr = un.serie!
  const tx = (v: number) => (sr.logX ? Math.log(v) : v)
  const ty = (v: number) => (sr.logY ? Math.log(v) : v)
  const pts = sr.points
  const xs = pts.map((p) => tx(p.x ?? 1))
  const ysDef = pts.filter((p) => p.y !== null).map((p) => ty(p.y!))
  const xmin = Math.min(...xs), xmax = Math.max(...xs)
  const ymin = Math.min(...ysDef), ymax = Math.max(...ysDef)
  const px = (v: number) => x + (xmax > xmin ? ((v - xmin) / (xmax - xmin)) * w : w / 2)
  const py = (v: number) => y + h - (ymax > ymin ? ((v - ymin) / (ymax - ymin)) * h : h / 2)
  ctx.strokeStyle = C.filet
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, y + h + 0.5)
  ctx.lineTo(x + w, y + h + 0.5)
  ctx.stroke()
  ctx.strokeStyle = C.encre
  ctx.lineWidth = 1
  ctx.beginPath()
  let premier = true
  pts.forEach((p, i) => {
    if (p.y === null) return
    const X = px(xs[i]!), Y = py(ty(p.y))
    if (premier) ctx.moveTo(X, Y)
    else ctx.lineTo(X, Y)
    premier = false
  })
  ctx.stroke()
  ctx.fillStyle = C.encre
  pts.forEach((p, i) => {
    const X = px(xs[i]!)
    if (p.y === null) {
      // Valeur non mesurable (ex. explosion) : croix en haut.
      ctx.fillStyle = C.refute
      ctx.font = `8px ${SANS}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('✕', X, y - 3)
      ctx.fillStyle = C.encre
      return
    }
    ctx.fillRect(X - 1.2, py(ty(p.y)) - 1.2, 2.4, 2.4)
  })
  ctx.textAlign = 'left'
  ctx.font = `8.5px ${MONO}`
  ctx.fillStyle = C.gris
  ctx.textBaseline = 'bottom'
  ctx.fillText(sr.logX ? (sr.logY ? 'log–log' : 'log x') : 'lin.', x + w + 5, y + h + 1)
}

function dessinerLiensSemantiques(ctx: CanvasRenderingContext2D, s: EtatDessin): void {
  const { m, page } = s
  for (const u of m.unites) {
    for (const i of u.membres) {
      for (const l of m.j.noeuds[i]!.liens ?? []) {
        const c = m.j.index.get(l.cible)
        if (c === undefined) continue
        const v = m.uniteDe[c]!
        const a = page.boites[u.k], b = page.boites[v]
        if (!a || !b || v < 0) continue
        const alpha = Math.min(s.alphaUnite[u.k]!, s.alphaUnite[v]!)
        const couleur = l.genre === 'contredit' ? C.refute : l.genre === 'resout' ? C.encre : C.gris
        ctx.globalAlpha = alpha
        ctx.strokeStyle = couleur
        ctx.fillStyle = couleur
        ctx.lineWidth = 1.1
        ctx.setLineDash(l.genre === 'resout' ? [] : [5, 3])
        // Du bord de A vers le bord de B, arqué.
        const ax = a.x + a.w / 2, ay = a.y + a.h / 2
        const bx = b.x + b.w / 2, by = b.y + b.h / 2
        const [x0, y0] = bordVers(a, bx, by)
        const [x1, y1] = bordVers(b, ax, ay)
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
        const nx = -(y1 - y0), ny = x1 - x0
        const L = Math.hypot(nx, ny) || 1
        const cx = mx + (nx / L) * 40, cy = my + (ny / L) * 40
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.quadraticCurveTo(cx, cy, x1, y1)
        ctx.stroke()
        ctx.setLineDash([])
        // ⊣ : barre plate perpendiculaire à l'arrivée ; ⊢ : barre au départ (résolution).
        const barre = (px: number, py: number, dx: number, dy: number) => {
          const d = Math.hypot(dx, dy) || 1
          const ox = (-dy / d) * 6, oy = (dx / d) * 6
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.moveTo(px - ox, py - oy)
          ctx.lineTo(px + ox, py + oy)
          ctx.stroke()
        }
        if (l.genre === 'resout') barre(x0, y0, cx - x0, cy - y0)
        else barre(x1, y1, x1 - cx, y1 - cy)
        if (l.genre === 'resout') {
          // Pointe à l'arrivée.
          const dx = x1 - cx, dy = y1 - cy, d = Math.hypot(dx, dy) || 1
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x1 - (dx / d) * 8 - (dy / d) * 3.5, y1 - (dy / d) * 8 + (dx / d) * 3.5)
          ctx.lineTo(x1 - (dx / d) * 8 + (dy / d) * 3.5, y1 - (dy / d) * 8 - (dx / d) * 3.5)
          ctx.closePath()
          ctx.fill()
        }
        ctx.font = `italic 10px ${SANS}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const libelle = { contredit: 'contredit', resout: 'résout', remplace: 'remplace', abandonne: 'abandonne' }[l.genre]
        const tx = 0.25 * x0 + 0.5 * cx + 0.25 * x1, ty = 0.25 * y0 + 0.5 * cy + 0.25 * y1
        const w = s.mesurer(libelle, `italic 10px ${SANS}`)
        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.fillRect(tx - w / 2 - 3, ty - 7, w + 6, 14)
        ctx.fillStyle = couleur
        ctx.fillText(libelle, tx, ty)
      }
    }
  }
  ctx.globalAlpha = 1
}

function bordVers(b: Boite, x: number, y: number): [number, number] {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const dx = x - cx, dy = y - cy
  if (!dx && !dy) return [cx, cy]
  const t = Math.min(Math.abs((b.w / 2) / (dx || 1e-9)), Math.abs((b.h / 2) / (dy || 1e-9)))
  return [cx + dx * t, cy + dy * t]
}

/** Statut d'un nœud pour une fiche. */
export function glypheNoeud(n: NoeudR): string {
  return GLYPHE_STATUT[n.statut]
}
