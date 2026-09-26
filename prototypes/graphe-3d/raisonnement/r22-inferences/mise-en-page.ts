// R22 · Mise en page en couches (Sugiyama simplifié) du graphe biparti, de gauche à droite.
//
//   rangs       plus long chemin depuis les sources, sur les prémisses principales et auxiliaires des
//               unités visibles (toutes démonstrations) ; une barre d'inférence est posée dans le rang
//               de sa conclusion, juste avant la boîte.
//   couloirs    un couloir horizontal par sous-problème (ordre du jeu), la piste abandonnée en bas.
//   ordre / y   trois passes (avant, arrière, avant) : dans chaque colonne d'un couloir, les boîtes sont
//               triées par barycentre de leurs voisins du même couloir puis placées au plus près de ce
//               barycentre sans chevauchement (régression isotone), si bien que les chaînes s'alignent.
//   renvois     une prémisse citée à plus de `renvoiRangs` rangs n'est pas tracée : l'inférence la cite
//               par son code (« par Prop 2 »), comme une équation numérotée.

import type { Citation, Modele } from './modele'
import type { RolePremisse } from '../../src/raisonnement/donnees'

export const LARGEUR = 184
export const ECART_RANGS = 132
export const MARGE_GAUCHE = 176
export const ECART_BOITES = 16
export const PAD = 8
/** Distance entre le bord gauche d'une boîte et l'extrémité gauche de sa barre d'inférence. */
export const RECUL_BARRE = 58
export const LONG_BARRE = 24

export interface OptionsMiseEnPage {
  visibles: Uint8Array
  /** Démonstrations non principales dessinées. */
  alternatives: boolean
  /** Prémisses auxiliaires tracées (sinon citées en étiquette « aux. »). */
  auxiliaires: boolean
  /** Au-delà de ce nombre de rangs, une prémisse est un renvoi (Infinity : jamais). */
  renvoiRangs: number
  mesurer: (texte: string, police: string) => number
}

export interface Boite {
  u: number
  x: number
  y: number
  w: number
  /** Hauteur de la boîte seule. */
  h: number
  /** Hauteur occupée (boîte + alternatives rejetées d'une décision). */
  hTotale: number
  rang: number
  lignes: string[]
}

export interface GroupeEtiquette {
  prefixe: string
  role: RolePremisse | 'renvoi'
  items: { texte: string; noeud: number; unite: number }[]
}

export interface Barre {
  inf: number
  /** Extrémité gauche de la barre et ordonnée. */
  x: number
  y: number
  /** Arêtes tracées : prémisses (unités) vers cette barre. */
  aretes: { source: number; role: RolePremisse }[]
  /** Étiquette latérale (rôles non tracés, renvois), déjà plafonnée. */
  etiquette: string[]
  groupes: GroupeEtiquette[]
  masquees: number
}

export interface Couloir {
  id: string
  nom: string
  y0: number
  y1: number
  abandonne: boolean
}

export interface ElementBande {
  noeud: number
  x: number
  y: number
  w: number
  h: number
}

export interface MiseEnPage {
  boites: (Boite | null)[]
  barres: Barre[]
  /** Barres par unité (conclusion). */
  barresDe: number[][]
  couloirs: Couloir[]
  bande: ElementBande[]
  bandeY0: number
  bandeY1: number
  rangs: number
  xRang: (r: number) => number
  bornes: { x0: number; y0: number; x1: number; y1: number }
}

export const POLICE_TITRE = '500 12.5px Inter, "Segoe UI", system-ui, sans-serif'
export const POLICE_BANDE = '12px Inter, "Segoe UI", system-ui, sans-serif'
export const POLICE_ETIQUETTE = '10px "Cascadia Mono", Consolas, "SF Mono", monospace'
export const INTERLIGNE = 15
const MAX_LIGNES = 3
const MAX_ITEMS = 3

/** Découpe un texte en lignes de largeur max (mots), tronque la dernière avec « … ». */
export function couperLignes(texte: string, largeur: number, police: string, mesurer: OptionsMiseEnPage['mesurer'], max = MAX_LIGNES): string[] {
  const mots = texte.split(/\s+/)
  const lignes: string[] = []
  let courante = ''
  for (let i = 0; i < mots.length; i++) {
    const essai = courante ? `${courante} ${mots[i]}` : mots[i]!
    if (mesurer(essai, police) <= largeur || !courante) courante = essai
    else {
      lignes.push(courante)
      courante = mots[i]!
      if (lignes.length === max) {
        courante = ''
        const derniere = lignes[max - 1]!
        let t = derniere
        while (t.length > 1 && mesurer(`${t} …`, police) > largeur) t = t.slice(0, -1)
        lignes[max - 1] = `${t.trimEnd()} …`
        return lignes
      }
    }
  }
  if (courante) lignes.push(courante)
  return lignes
}

const PREFIXE_ROLE: Record<RolePremisse, string> = { principale: 'par', auxiliaire: 'aux.', technique: 'tech.', contexte: 'ctx.' }

/** Régression isotone (PAVA) : z croissant au plus près de t. */
function isotone(t: number[]): number[] {
  const blocs: { somme: number; n: number }[] = []
  for (const v of t) {
    blocs.push({ somme: v, n: 1 })
    while (blocs.length > 1) {
      const a = blocs[blocs.length - 2]!, b = blocs[blocs.length - 1]!
      if (a.somme / a.n <= b.somme / b.n) break
      a.somme += b.somme
      a.n += b.n
      blocs.pop()
    }
  }
  const z: number[] = []
  for (const b of blocs) for (let i = 0; i < b.n; i++) z.push(b.somme / b.n)
  return z
}

export function mettreEnPage(m: Modele, o: OptionsMiseEnPage): MiseEnPage {
  const U = m.unites.length
  const vis = o.visibles
  const infsDe = (u: number) => m.unites[u]!.inferences.filter((i) => o.alternatives || m.inferences[i]!.principale)
  const trace = (c: Citation) => c.unite >= 0 && vis[c.unite] && (c.role === 'principale' || (c.role === 'auxiliaire' && o.auxiliaires))

  // Rangs (plus long chemin), sur toutes les arêtes tracables avant renvois.
  const rang = new Int32Array(U).fill(-1)
  const enCours = new Uint8Array(U)
  const calculerRang = (u: number): number => {
    if (rang[u]! >= 0) return rang[u]!
    if (enCours[u]) return 0
    enCours[u] = 1
    let r = 0
    for (const i of infsDe(u)) for (const c of m.inferences[i]!.premisses) if (trace(c) && c.unite !== u) r = Math.max(r, calculerRang(c.unite) + 1)
    enCours[u] = 0
    rang[u] = r
    return r
  }
  let rangs = 0
  for (let u = 0; u < U; u++) if (vis[u]) rangs = Math.max(rangs, calculerRang(u) + 1)
  const xRang = (r: number) => MARGE_GAUCHE + ECART_RANGS + r * (LARGEUR + ECART_RANGS)

  // Arêtes tracées et renvois.
  const barres: Barre[] = []
  const barresDe: number[][] = m.unites.map(() => [])
  const voisinsAvant: number[][] = m.unites.map(() => [])
  const voisinsApres: number[][] = m.unites.map(() => [])
  for (let u = 0; u < U; u++) {
    if (!vis[u]) continue
    for (const i of infsDe(u)) {
      const inf = m.inferences[i]!
      const aretes: Barre['aretes'] = []
      const groupes = new Map<string, GroupeEtiquette>()
      const ajouter = (prefixe: string, role: GroupeEtiquette['role'], texte: string, c: Citation) => {
        if (!groupes.has(prefixe)) groupes.set(prefixe, { prefixe, role, items: [] })
        const g = groupes.get(prefixe)!
        if (!g.items.some((x) => x.texte === texte)) g.items.push({ texte, noeud: c.noeud, unite: c.unite })
      }
      for (const c of inf.premisses) {
        if (trace(c)) {
          if (rang[u]! - rang[c.unite]! > o.renvoiRangs) ajouter(PREFIXE_ROLE[c.role], c.role, m.unites[c.unite]!.code, c)
          else {
            aretes.push({ source: c.unite, role: c.role })
            voisinsAvant[u]!.push(c.unite)
            voisinsApres[c.unite]!.push(u)
          }
        } else ajouter(PREFIXE_ROLE[c.role], c.role, c.unite >= 0 ? m.unites[c.unite]!.code : m.court[c.noeud]!, c)
      }
      // Étiquette : groupes dans l'ordre des rôles, au plus MAX_ITEMS éléments + « +n ».
      const ordre = ['par', 'aux.', 'tech.', 'ctx.']
      const gs = [...groupes.values()].sort((a, b) => ordre.indexOf(a.prefixe) - ordre.indexOf(b.prefixe))
      const etiquette: string[] = []
      let montres = 0, total = 0
      for (const g of gs) {
        total += g.items.length
        if (montres >= MAX_ITEMS) continue
        const pris = g.items.slice(0, MAX_ITEMS - montres)
        montres += pris.length
        etiquette.push(`${g.prefixe} ${pris.map((x) => x.texte).join(', ')}`)
      }
      if (total > montres) etiquette.push(`+${total - montres}`)
      barresDe[u]!.push(barres.length)
      barres.push({ inf: i, x: 0, y: 0, aretes, etiquette, groupes: gs, masquees: total - montres })
    }
  }

  // Boîtes : dimensions.
  const boites: (Boite | null)[] = m.unites.map((un, u) => {
    if (!vis[u]) return null
    const pad = un.famille === 'observation' ? 16 : PAD
    const lignes = couperLignes(un.titre, LARGEUR - 2 * pad, POLICE_TITRE, o.mesurer)
    const aSpark = !!un.serie && un.serie.points.filter((p) => p.y !== null).length >= 2
    let h = 7 + 12 + 4 + lignes.length * INTERLIGNE + 3 + (aSpark ? 26 : 13) + 5
    if (un.famille === 'activite') h += 3
    if (un.famille === 'observation') h += 4
    const rejetees = un.noeud.decision?.alternatives.filter((a) => !a.retenue).length ?? 0
    // Hauteur minimale : les barres empilées doivent tenir face à la boîte.
    const nb = barresDe[u]!.length
    h = Math.max(h, nb > 1 ? nb * 30 : 0)
    return { u, x: xRang(rang[u]!), y: 0, w: LARGEUR, h, hTotale: h + (rejetees ? 6 + rejetees * 16 : 0), rang: rang[u]!, lignes }
  })

  // Couloirs : sous-problèmes dans l'ordre du jeu, piste abandonnée en dernier.
  const sps = [...m.jeu.sousProblemes].sort((a, b) => Number(!!a.abandonne) - Number(!!b.abandonne))
  const colonnes = new Map<string, number[][]>()
  for (const sp of sps) colonnes.set(sp.id, Array.from({ length: rangs }, () => []))
  for (let u = 0; u < U; u++) {
    const b = boites[u]
    if (!b) continue
    const un = m.unites[u]!
    const cle = colonnes.has(un.couloir) ? un.couloir : sps[0]!.id
    colonnes.get(cle)![b.rang]!.push(u)
  }
  const couloirDe = new Map<number, string>()
  for (const [id, cols] of colonnes) for (const col of cols) for (const u of col) couloirDe.set(u, id)

  // Placement relatif (y dans le couloir), trois passes.
  const centre = (u: number) => boites[u]!.y + boites[u]!.h / 2
  const placerColonne = (col: number[], voisins: (u: number) => number[], melange: number) => {
    const souhait = new Map<number, number>()
    col.forEach((u, i) => {
      const vs = voisins(u).filter((v) => couloirDe.get(v) === couloirDe.get(u))
      const actuel = boites[u]!.y + boites[u]!.h / 2
      const bary = vs.length ? vs.reduce((s, v) => s + centre(v), 0) / vs.length : actuel + i * 0.001
      souhait.set(u, melange * bary + (1 - melange) * actuel)
    })
    col.sort((a, b) => souhait.get(a)! - souhait.get(b)!)
    // Décalages cumulés : y_i = z_i + o_i, z croissant ≥ 0.
    const decal: number[] = []
    let acc = 0
    for (const u of col) {
      decal.push(acc)
      acc += boites[u]!.hTotale + ECART_BOITES
    }
    const z = isotone(col.map((u, i) => souhait.get(u)! - boites[u]!.h / 2 - decal[i]!)).map((v) => Math.max(0, v))
    // max(0, ·) casse la monotonie seulement au début : on la rétablit.
    for (let i = 1; i < z.length; i++) z[i] = Math.max(z[i]!, z[i - 1]!)
    col.forEach((u, i) => (boites[u]!.y = z[i]! + decal[i]!))
  }
  for (const cols of colonnes.values()) {
    // Empilement initial dans l'ordre du jeu.
    for (const col of cols) {
      let y = 0
      for (const u of col) {
        boites[u]!.y = y
        y += boites[u]!.hTotale + ECART_BOITES
      }
    }
    for (const col of cols) placerColonne(col, (u) => voisinsAvant[u]!, 1)
    for (let r = cols.length - 1; r >= 0; r--) placerColonne(cols[r]!, (u) => [...voisinsApres[u]!, ...voisinsAvant[u]!], 0.6)
    for (const col of cols) placerColonne(col, (u) => [...voisinsAvant[u]!, ...voisinsApres[u]!], 0.7)
  }

  // Bande « Hypothèses et modèle » en tête : deux rangées (hypothèses, choix).
  const bande: ElementBande[] = []
  const bandeY0 = 0
  let yb = bandeY0 + 30
  let largeurMax = 0
  for (const groupe of ['hypothese', 'choix_modelisation']) {
    let x = MARGE_GAUCHE + 16
    for (const b of m.bande) {
      const n = m.j.noeuds[b]!
      if (n.type !== groupe) continue
      const w = Math.min(230, 44 + o.mesurer(n.nom, POLICE_BANDE) + 12)
      bande.push({ noeud: b, x, y: yb, w, h: 26 })
      x += w + 10
    }
    largeurMax = Math.max(largeurMax, x)
    yb += 34
  }
  const bandeY1 = yb + 8

  // Couloirs : positions absolues.
  const couloirs: Couloir[] = []
  let y = bandeY1 + 28
  for (const sp of sps) {
    const cols = colonnes.get(sp.id)!
    let hMax = 0
    for (const col of cols) for (const u of col) hMax = Math.max(hMax, boites[u]!.y + boites[u]!.hTotale)
    if (hMax === 0) continue
    const y0 = y
    for (const col of cols) for (const u of col) boites[u]!.y += y0 + 26
    const y1 = y0 + 26 + hMax + 26
    couloirs.push({ id: sp.id, nom: sp.nom, y0, y1, abandonne: !!sp.abandonne })
    y = y1
  }

  // Barres : empilées devant la boîte, la principale en haut.
  for (let u = 0; u < U; u++) {
    const b = boites[u]
    if (!b) continue
    const ids = barresDe[u]!
    const pas = 30
    const y0 = b.y + b.h / 2 - ((ids.length - 1) * pas) / 2
    ids.forEach((k, i) => {
      barres[k]!.x = b.x - RECUL_BARRE
      barres[k]!.y = y0 + i * pas
    })
  }

  const x1 = Math.max(xRang(rangs - 1) + LARGEUR + 60, largeurMax + 40)
  return { boites, barres, barresDe, couloirs, bande, bandeY0, bandeY1, rangs, xRang, bornes: { x0: 0, y0: bandeY0, x1, y1: y + 20 } }
}
