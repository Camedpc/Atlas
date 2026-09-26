// Libellés posés à la main sur le calque du dessus (repris de V1) : noms de catégories sur ou sous
// les agrégats, noms des nœuds importants, sans chevauchement (boîtes englobantes, glouton par
// priorité). Priorités : survol > sélection > voisins du survol > lignée > agrégats (par poids)
// > nœuds importants à l'écran. Domaines en capitales espacées, thèmes en romain gras (serif),
// sous-thèmes en italique ; corps ∝ √poids ; halo papier.

import { rgba, type ContexteDessin } from '../../src/core'
import type { EtatFigure } from './figure'
import { lire } from './reglages'

interface Candidat {
  u: number
  prio: number
  genre: 'survol' | 'agregat' | 'feuille'
}

const candidats: Candidat[] = []
const boites: number[] = []
/** Zones réservées par d'autres calques (règles, lentille…) : x0, y0, x1, y1. */
export const zonesReservees: number[] = []

function mesurer(etat: EtatFigure, ctx: CanvasRenderingContext2D, police: string, espacement: string, texte: string): number {
  const cle = `${police}|${espacement}|${texte}`
  let l = etat.mesures.get(cle)
  if (l === undefined) {
    ctx.font = police
    l = ctx.measureText(texte).width
    if (etat.mesures.size > 6000) etat.mesures.clear()
    etat.mesures.set(cle, l)
  }
  return l
}

/** Disques d'agrégats visibles (x, y, r, unité) : un libellé ne recouvre pas le disque d'un autre. */
const disques: number[] = []

function libre(x0: number, y0: number, x1: number, y1: number, W: number, H: number, soi = -1): boolean {
  if (x0 < 2 || y0 < 2 || x1 > W - 2 || y1 > H - 2) return false
  for (let i = 0; i < boites.length; i += 4) {
    if (x0 < boites[i + 2]! && x1 > boites[i]! && y0 < boites[i + 3]! && y1 > boites[i + 1]!) return false
  }
  for (let i = 0; i < disques.length; i += 4) {
    if (disques[i + 3] === soi) continue
    const cx = disques[i]!, cy = disques[i + 1]!, r = disques[i + 2]!
    const px = cx < x0 ? x0 : cx > x1 ? x1 : cx, py = cy < y0 ? y0 : cy > y1 ? y1 : cy
    if ((px - cx) * (px - cx) + (py - cy) * (py - cy) < r * r) return false
  }
  return true
}

const tronquer = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** Boîtes des libellés posés à l'image courante (lues par la lentille et la fiche). */
export function boitesPosees(): readonly number[] {
  return boites
}

export function dessinerLibelles(etat: EtatFigure, c: ContexteDessin): void {
  const { vue, ctx, projection: p, largeur: W, hauteur: H } = c
  const { h, granularite: g, palette } = vue
  const R = vue.reglages.valeurs
  const strategie = R.libelles
  const survol = vue.survol
  const voisins = vue.voisinsSurvol
  const lignee = vue.lignee
  candidats.length = 0
  boites.length = 0
  boites.push(...zonesReservees)
  const visible = (u: number) => vue.opaciteAffichee[u]! > 0.04 && p.visible[u] === 1 && g.alpha[u]! > 0.05

  disques.length = 0
  for (let ci = 0; ci < h.nC; ci++) {
    const u = h.nF + ci
    if (!visible(u) || g.alpha[u]! < 0.3) continue
    const r = vue.tailleAffichee[u]! * 0.92
    if (r > 5) disques.push(p.x[u]!, p.y[u]!, r, u)
  }
  if (survol !== null && visible(survol)) candidats.push({ u: survol, prio: 1e9, genre: 'survol' })
  if (lignee.selection !== null && lignee.selection !== survol && visible(lignee.selection)) candidats.push({ u: lignee.selection, prio: 9e8, genre: 'survol' })
  if (survol !== null) {
    for (const v of voisins) if (visible(v)) candidats.push({ u: v, prio: 8e8 + (v < h.nF ? h.importance[v]! : 1e4), genre: v < h.nF ? 'feuille' : 'agregat' })
  }
  if (strategie !== 'aucun' && lire<boolean>(vue, 'libellesAgregats')) {
    for (let ci = 0; ci < h.nC; ci++) {
      const u = h.nF + ci
      if (u === survol || voisins.has(u) || !visible(u)) continue
      const role = lignee.role(u)
      const bonus = role === 'ancetre' || role === 'descendant' ? 5e5 : 0
      candidats.push({ u, prio: 1e5 + bonus + g.nbActives[ci]! + etat.priorite[u]!, genre: 'agregat' })
    }
  }
  const nbFeuilles = lire<number>(vue, 'libellesFeuilles')
  if (strategie === 'auto' && nbFeuilles > 0) {
    let pris = 0
    const seuil = R.seuilLibelle * 0.5
    for (let i = 0; i < etat.ordreImportance.length && pris < nbFeuilles * 3; i++) {
      const f = etat.ordreImportance[i]!
      if (f === survol || voisins.has(f) || f === lignee.selection || !visible(f) || vue.tailleAffichee[f]! < seuil) continue
      const x = p.x[f]!, y = p.y[f]!
      if (x < 0 || y < 0 || x > W || y > H || g.alpha[f]! < 0.6) continue
      const role = lignee.role(f)
      const bonus = role === 'ancetre' || role === 'descendant' ? 5e5 : 0
      candidats.push({ u: f, prio: bonus + h.importance[f]! + etat.priorite[f]! * 1e3, genre: 'feuille' })
      pris++
    }
    // Nœuds mis en avant par un module (lentille) même peu importants : les plus au centre d'abord,
    // plafonnés (réglage « libellés dans la lentille »).
    const enAvant: number[] = []
    for (let f = 0; f < h.nF; f++) if (etat.priorite[f]! > 0 && visible(f) && f !== survol && !voisins.has(f)) enAvant.push(f)
    enAvant.sort((a, b) => etat.priorite[b]! - etat.priorite[a]! || h.importance[b]! - h.importance[a]!)
    const maxLentille = lire<number>(vue, 'libellesLentille')
    for (let i = 0; i < Math.min(enAvant.length, maxLentille * 2); i++) {
      const f = enAvant[i]!
      candidats.push({ u: f, prio: 2e5 + etat.priorite[f]! * 1e3 + h.importance[f]!, genre: 'feuille' })
    }
  }
  candidats.sort((a, b) => b.prio - a.prio)

  const halo = lire<number>(vue, 'haloLibelles')
  const base = lire<number>(vue, 'tailleNomsAgregats')
  const echelle = lire<number>(vue, 'echellePoids')
  const ecartAgregat = lire<boolean>(vue, 'anneauStatuts') ? lire<number>(vue, 'ecartStatuts') + lire<number>(vue, 'epaisseurStatuts') + 1 : 0
  const ecartFeuille = lire<boolean>(vue, 'anneauConfiance') ? lire<number>(vue, 'ecartAnneau') + lire<number>(vue, 'epaisseurAnneau') * 1.5 : 0
  const tailleTexte = R.tailleLibelle
  const attenue = survol !== null || lignee.active
  let feuillesPlacees = 0
  let lentillePlacees = 0
  const vus = new Set<number>()

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.textBaseline = 'middle'
  for (const cand of candidats) {
    const u = cand.u
    if (vus.has(u)) continue
    vus.add(u)
    const agr = u >= h.nF
    const x = p.x[u]!, y = p.y[u]!
    const r = vue.tailleAffichee[u]! + (agr ? ecartAgregat : ecartFeuille)
    let texte: string
    let police: string
    let couleur = palette.texte
    let taille: number
    let espacement = '0px'
    if (agr) {
      const cat = h.categories[u - h.nF]!
      taille = Math.max(9.5, base * (0.72 + echelle * Math.sqrt(g.nbActives[cat.index]! / h.nF) * 1.4))
      if (cat.niveau === 0) {
        texte = cat.nom.toUpperCase()
        police = `600 ${taille.toFixed(1)}px ${etat.policeTexte}`
        espacement = `${(taille * 0.09).toFixed(1)}px`
      } else if (cat.niveau === 1) {
        texte = cat.nom
        police = `600 ${taille.toFixed(1)}px ${etat.policeTitre}`
      } else {
        texte = cat.nom
        police = `italic 500 ${taille.toFixed(1)}px ${etat.policeTitre}`
      }
    } else if (cand.genre === 'survol') {
      taille = tailleTexte + 1
      texte = tronquer(h.nom(u), 60)
      police = `600 ${taille}px ${etat.policeTitre}`
    } else {
      if (cand.prio < 8e8) {
        if (etat.priorite[u]! > 0 ? lentillePlacees >= lire<number>(vue, 'libellesLentille') : feuillesPlacees >= nbFeuilles) continue
      }
      taille = tailleTexte - 1
      texte = tronquer(h.nom(u), 34)
      police = `400 ${taille}px ${etat.policeTexte}`
      couleur = palette.texteDoux
    }
    ctx.letterSpacing = espacement
    const l = mesurer(etat, ctx, police, espacement, texte)
    const hb = taille * 1.15
    // Positions candidates : dedans (agrégat assez grand), dessous, dessus, droite, gauche.
    const essais: [number, number][] = []
    if (agr && l <= r * 1.6 && taille <= r * 0.7) essais.push([x, y])
    if (agr) essais.push([x, y + r + 3 + hb / 2], [x, y - r - 3 - hb / 2], [x + r + 5 + l / 2, y], [x - r - 5 - l / 2, y])
    else essais.push([x + r + 4 + l / 2, y], [x - r - 4 - l / 2, y], [x, y - r - 2 - hb / 2], [x, y + r + 2 + hb / 2])
    let place: [number, number] | null = null
    for (const [cx, cy] of essais) {
      if (libre(cx - l / 2 - 2, cy - hb / 2, cx + l / 2 + 2, cy + hb / 2, W, H, cx === x && cy === y ? u : -2)) {
        place = [cx, cy]
        break
      }
    }
    if (!place && cand.genre === 'survol') place = essais[0]!
    if (!place) continue
    const [cx, cy] = place
    boites.push(cx - l / 2 - 2, cy - hb / 2, cx + l / 2 + 2, cy + hb / 2)
    if (!agr && cand.genre === 'feuille') {
      if (etat.priorite[u]! > 0) lentillePlacees++
      else feuillesPlacees++
    }

    // Opacité : suit le nœud ; les agrégats apparaissent quand ils sont bien formés.
    let alpha = Math.min(1, vue.opaciteAffichee[u]! * 1.5)
    if (agr) alpha *= Math.min(1, Math.max(0, (g.alpha[u]! - 0.3) / 0.45))
    const role = lignee.role(u)
    const concerne = u === survol || voisins.has(u) || role === 'selection' || role === 'ancetre' || role === 'descendant'
    if (attenue && !concerne) {
      if (!agr) continue
      alpha = Math.min(alpha, 0.35)
    }
    if (cand.genre === 'survol') alpha = 1
    if (alpha < 0.03) continue
    ctx.globalAlpha = alpha
    ctx.font = police
    ctx.textAlign = 'center'
    if (halo > 0) {
      ctx.lineWidth = halo
      ctx.strokeStyle = rgba(palette.fond, 0.92)
      ctx.strokeText(texte, cx, cy + 0.5)
    }
    ctx.fillStyle = couleur
    ctx.fillText(texte, cx, cy + 0.5)
  }
  ctx.letterSpacing = '0px'
  ctx.restore()
}
