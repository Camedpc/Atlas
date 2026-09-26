// Disposition automatique initiale : de gauche (faits, sans prémisse) à droite (conclusion).
// Colonne = profondeur (plus long chemin depuis un nœud sans prémisse) ; chaque catégorie occupe une bande
// horizontale ; une catégorie entièrement plus profonde que toutes les autres (la conclusion) se range à
// droite, centrée verticalement. Fonction pure : ne touche ni au DOM ni à l'état de l'éditeur.

export const ECART_COL = 120
export const ECART_RANG = 26
export const ECART_BANDE = 72
export const MARGE_BOITE = { cote: 28, haut: 54, bas: 28 }

export function disposer(noeuds, demonstrations, categories, hauteurs, largeur) {
  const parId = new Map(noeuds.map((n) => [n.id, n]))
  const premisses = new Map(noeuds.map((n) => [n.id, []]))
  for (const d of demonstrations) {
    if (!premisses.has(d.noeud_id)) continue
    for (const p of d.justifie_par) if (parId.has(p) && !premisses.get(d.noeud_id).includes(p)) premisses.get(d.noeud_id).push(p)
  }

  // Profondeur : plus long chemin depuis un nœud sans prémisse (un cycle est coupé à la première visite)
  const prof = new Map()
  const enCours = new Set()
  const profondeur = (id) => {
    if (prof.has(id)) return prof.get(id)
    if (enCours.has(id)) return 0
    enCours.add(id)
    const ps = premisses.get(id)
    const v = ps.length ? 1 + Math.max(...ps.map(profondeur)) : 0
    enCours.delete(id)
    prof.set(id, v)
    return v
  }
  for (const n of noeuds) profondeur(n.id)

  // Groupes : une catégorie par bande, puis les nœuds orphelins
  const categorieDe = new Map()
  for (const c of categories) for (const id of c.noeuds) if (parId.has(id) && !categorieDe.has(id)) categorieDe.set(id, c.id)
  const groupes = categories
    .map((c) => ({ c, ids: c.noeuds.filter((id) => categorieDe.get(id) === c.id) }))
    .filter((g) => g.ids.length)
  const seuls = noeuds.filter((n) => !categorieDe.has(n.id)).map((n) => n.id)
  if (seuls.length) groupes.push({ c: null, ids: seuls })

  // Une assertion ni admise ni démontrée (hypothèse ouverte) se range avec les plus profondes de son groupe
  for (const g of groupes) {
    const max = Math.max(...g.ids.map((id) => prof.get(id)))
    for (const id of g.ids) if (!parId.get(id).admis && !premisses.get(id).length) prof.set(id, max)
    g.min = Math.min(...g.ids.map((id) => prof.get(id)))
    g.max = Math.max(...g.ids.map((id) => prof.get(id)))
  }

  // Le groupe le plus profond part à droite s'il ne chevauche aucune autre bande en x
  let aDroite = null
  if (groupes.length > 1) {
    const candidat = groupes.reduce((a, b) => (b.min > a.min ? b : a))
    if (groupes.every((g) => g === candidat || g.max < candidat.min)) aDroite = candidat
  }

  const col = (p) => p * (largeur + ECART_COL)
  const positions = {}
  const boites = []

  function poserGroupe(g, haut) {
    const colonnes = new Map()
    for (const id of g.ids) {
      const p = prof.get(id)
      if (!colonnes.has(p)) colonnes.set(p, [])
      colonnes.get(p).push(id)
    }
    const hauteurCol = (ids) => ids.reduce((s, id) => s + hauteurs[id], 0) + ECART_RANG * (ids.length - 1)
    const contenu = Math.max(...[...colonnes.values()].map(hauteurCol))
    const y0 = haut + (g.c ? MARGE_BOITE.haut : 0)
    for (const p of [...colonnes.keys()].sort((a, b) => a - b)) {
      const ids = colonnes.get(p)
      // Barycentre des prémisses déjà posées : limite les croisements de fils
      const cle = (id) => {
        const ys = premisses.get(id).filter((q) => positions[q]).map((q) => positions[q].y + hauteurs[q] / 2)
        return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : Infinity
      }
      const ordre = ids.map((id, i) => ({ id, i, c: cle(id) })).sort((a, b) => (a.c === b.c ? a.i - b.i : a.c - b.c))
      let y = y0 + (contenu - hauteurCol(ids)) / 2
      for (const { id } of ordre) {
        positions[id] = { x: col(p), y }
        y += hauteurs[id] + ECART_RANG
      }
    }
    const bas = y0 + contenu + (g.c ? MARGE_BOITE.bas : 0)
    if (g.c) {
      const x0 = col(g.min) - MARGE_BOITE.cote
      boites.push({ id: g.c.id, titre: g.c.titre, couleur: g.c.couleur, x: x0, y: haut, l: col(g.max) + largeur + MARGE_BOITE.cote - x0, h: bas - haut })
    }
    return bas
  }

  // Étagères : deux catégories dont les colonnes ne se chevauchent pas partagent la même bande
  const mesurer = (g) => {
    const h = poserGroupe(g, 0)
    if (g.c) boites.pop()
    return h
  }
  const etageres = []
  for (const g of groupes) {
    if (g === aDroite) continue
    g.h = mesurer(g)
    const e = etageres.find((x) => x.groupes.every((o) => o.max < g.min || o.min > g.max))
    if (e) { e.groupes.push(g); e.h = Math.max(e.h, g.h) } else etageres.push({ groupes: [g], h: g.h })
  }
  let haut = 0
  for (const e of etageres) {
    for (const g of e.groupes) poserGroupe(g, haut + (e.h - g.h) / 2)
    haut += e.h + ECART_BANDE
  }
  if (aDroite) {
    const total = Math.max(0, haut - ECART_BANDE)
    const hauteurDroite = poserGroupe(aDroite, 0) // premier passage pour mesurer, puis on recentre
    if (aDroite.c) boites.pop()
    poserGroupe(aDroite, Math.max(0, (total - hauteurDroite) / 2))
  }
  return { positions, boites }
}
