// Activité des sessions et des agents — MAQUETTE, données factices mais déterministes, calées sur
// le jeu de données (vraies catégories, vrais nœuds). Préfigure ce qu'Atlas montrera : qui travaille
// où, verrous de zone, conflits en attente. Les sessions récentes, elles, viennent des données.
//
// Sur le graphe, chaque agent est posé comme une petite pastille à initiales près de la zone où il
// travaille (au représentant affiché de cette zone), avec un cadenas pour les zones verrouillées.

import { hacher, rgba, type ContexteDessin, type VueGraphe } from '../../src/core'

export type GenreAgent = 'humain' | 'ia' | 'calcul'

export interface Agent {
  id: string
  nom: string
  initiales: string
  genre: GenreAgent
  etat: 'actif' | 'en pause' | 'en attente'
  /** Index de catégorie de la zone de travail. */
  zone: number
  tache: string
  depuis: number
  couleur: string
}

export interface Verrou {
  zone: number
  agent: string
  depuis: number
  motif: string
}

export interface Conflit {
  id: string
  titre: string
  noeud: number
  entre: [string, string]
  depuis: number
  nature: string
}

export interface Activite {
  agents: Agent[]
  verrous: Verrou[]
  conflits: Conflit[]
  sessions: { id: string; debut: number; fin: number; feuilles: number[]; zone: string }[]
}

const MIN = 60_000

/** Construit la maquette d'activité à partir de la hiérarchie (déterministe). */
export function construireActivite(vue: VueGraphe): Activite {
  const { h } = vue
  const sous = h.categories.filter((c) => c.niveau === 2).sort((a, b) => b.feuilles.length - a.feuilles.length || a.id.localeCompare(b.id))
  // Une zone par domaine, les plus grosses d'abord (répartition lisible sur la carte).
  const parDomaine = new Map<number, number[]>()
  for (const c of sous) {
    const l = parDomaine.get(c.domaine) ?? []
    l.push(c.index)
    parDomaine.set(c.domaine, l)
  }
  const zones: number[] = []
  for (let k = 0; zones.length < 6 && k < 4; k++) for (const l of parDomaine.values()) if (l[k] !== undefined && zones.length < 6) zones.push(l[k]!)
  const z = (i: number) => zones[i % zones.length]!
  const nom = (c: number) => h.categories[c]!.nom
  const agents: Agent[] = [
    { id: 'cd', nom: 'C. Duparc', initiales: 'CD', genre: 'humain', etat: 'actif', zone: z(0), tache: `relit les lemmes de « ${nom(z(0))} »`, depuis: 14 * MIN, couleur: '#22477a' },
    { id: 'd2', nom: 'Démonstrateur‑2', initiales: 'D2', genre: 'ia', etat: 'actif', zone: z(1), tache: `cherche une preuve dans « ${nom(z(1))} »`, depuis: 37 * MIN, couleur: '#6a4c93' },
    { id: 've', nom: 'Vérificateur', initiales: 'VÉ', genre: 'ia', etat: 'actif', zone: z(2), tache: 'contrôle les démonstrations « à vérifier »', depuis: 6 * MIN, couleur: '#8a6d9e' },
    { id: 'ml', nom: 'M. Laurent', initiales: 'ML', genre: 'humain', etat: 'en pause', zone: z(3), tache: `annote « ${nom(z(3))} »`, depuis: 52 * MIN, couleur: '#3f8583' },
    { id: 'g3', nom: 'Calcul‑GPU‑3', initiales: 'G3', genre: 'calcul', etat: 'en attente', zone: z(4), tache: 'simulations en file (12 restantes)', depuis: 3 * MIN, couleur: '#a9744f' },
  ]
  const verrous: Verrou[] = [
    { zone: z(1), agent: 'Démonstrateur‑2', depuis: 37 * MIN, motif: 'réécriture des prémisses' },
    { zone: z(0), agent: 'C. Duparc', depuis: 14 * MIN, motif: 'relecture humaine' },
  ]
  // Conflits : nœuds réels choisis de façon stable (démonstrations contradictoires, validations croisées).
  const contradictoire = h.noeuds.findIndex((n) => n.demonstrations.some((d) => d.validite === 'invalide') && n.demonstrations.some((d) => d.validite === 'valide'))
  const incertains = h.noeuds.map((n, f) => [n, f] as const).filter(([n]) => n.statut === 'incertain' && n.validation === 'ia').sort((a, b) => hacher(a[0].id, 5) - hacher(b[0].id, 5))
  const conflits: Conflit[] = []
  if (contradictoire >= 0) conflits.push({ id: 'k1', titre: h.noeuds[contradictoire]!.nom, noeud: contradictoire, entre: ['Vérificateur', 'C. Duparc'], depuis: 21 * MIN, nature: 'deux démonstrations contradictoires' })
  if (incertains[0]) conflits.push({ id: 'k2', titre: incertains[0][0].nom, noeud: incertains[0][1], entre: ['Démonstrateur‑2', 'M. Laurent'], depuis: 48 * MIN, nature: 'modification concurrente de l’énoncé' })
  if (incertains[1]) conflits.push({ id: 'k3', titre: incertains[1][0].nom, noeud: incertains[1][1], entre: ['Vérificateur', 'Démonstrateur‑2'], depuis: 2 * 60 * MIN, nature: 'statut contesté (incertain ↔ validé)' })

  // Sessions récentes : vraies données (les plus récentes d'abord).
  const sessions = [...h.sessions.entries()]
    .map(([id, feuilles]) => {
      const dates = feuilles.map((f) => h.dates[f]!)
      const compte = new Map<number, number>()
      for (const f of feuilles) compte.set(h.chaine[f * 3 + 2]!, (compte.get(h.chaine[f * 3 + 2]!) ?? 0) + 1)
      const principal = [...compte.entries()].sort((a, b) => b[1] - a[1])[0]![0]
      return { id, debut: Math.min(...dates), fin: Math.max(...dates), feuilles, zone: h.categories[principal]!.nom }
    })
    .sort((a, b) => b.fin - a.fin)
    .slice(0, 6)
  return { agents, verrous, conflits, sessions }
}

/** Unité affichée qui représente la catégorie c (elle-même, un ancêtre replié, ou un enfant sorti). */
function uniteZone(vue: VueGraphe, c: number): number {
  const { h, granularite: g } = vue
  const cat = h.categories[c]!
  if (g.alpha[cat.unite]! > 0.3) return cat.unite
  const r = g.representant(cat.feuilles[0]!)
  // Catégorie ouverte : on prend son centre (barycentre affiché) même si son disque s'est effacé.
  return g.ouverture[c]! > 0.5 ? cat.unite : r
}

/** Calque dessus : pastilles d'agents et cadenas des zones verrouillées. */
export function dessinerPresence(act: Activite, { ctx, vue, projection: p }: ContexteDessin): void {
  const pal = vue.palette
  const poses = new Map<number, number>()
  ctx.save()
  ctx.font = `600 9.5px ${pal.police}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const a of act.agents) {
    const u = uniteZone(vue, a.zone)
    if (!p.visible[u]) continue
    const rang = poses.get(u) ?? 0
    poses.set(u, rang + 1)
    const r0 = vue.tailleAffichee[u]! + 10
    const ang = -Math.PI / 4 + rang * 0.62
    const x = p.x[u]! + Math.cos(ang) * r0, y = p.y[u]! + Math.sin(ang) * r0
    const verrou = act.verrous.some((v) => v.zone === a.zone && v.agent === a.nom)
    ctx.globalAlpha = a.etat === 'actif' ? 1 : 0.7
    ctx.strokeStyle = rgba(a.couleur, 0.55)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(p.x[u]! + Math.cos(ang) * (vue.tailleAffichee[u]! + 2), p.y[u]! + Math.sin(ang) * (vue.tailleAffichee[u]! + 2))
    ctx.lineTo(x - Math.cos(ang) * 9, y - Math.sin(ang) * 9)
    ctx.stroke()
    ctx.fillStyle = a.genre === 'humain' ? a.couleur : pal.fond
    ctx.strokeStyle = a.couleur
    ctx.lineWidth = 1.5
    ctx.beginPath()
    if (a.genre === 'humain') ctx.arc(x, y, 9, 0, Math.PI * 2)
    else ctx.roundRect(x - 9, y - 9, 18, 18, a.genre === 'ia' ? 5 : 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = a.genre === 'humain' ? '#ffffff' : a.couleur
    ctx.fillText(a.initiales, x, y + 0.5)
    if (a.etat === 'actif') {
      ctx.fillStyle = '#3b9a62'
      ctx.beginPath()
      ctx.arc(x + 7, y - 7, 2.6, 0, Math.PI * 2)
      ctx.fill()
    }
    if (verrou) dessinerCadenas(ctx, x - 16, y - 12, rgba(pal.texte, 0.8), pal.fond)
  }
  ctx.restore()
}

function dessinerCadenas(ctx: CanvasRenderingContext2D, x: number, y: number, encre: string, fond: string): void {
  ctx.fillStyle = fond
  ctx.strokeStyle = encre
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(x, y - 1, 2.6, Math.PI, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.roundRect(x - 3.8, y - 1, 7.6, 6, 1.2)
  ctx.fill()
  ctx.stroke()
}
