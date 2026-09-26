// Vue du graphe dans l'application Atlas : le moteur de raisonnement (base visuelle r0 · Référence)
// réglé pour les données réelles. Tout ce qui se règle pour l'application est en tête de fichier.

import type { Graphe } from '../api'
import { FiltresVue, noeudPasse } from '../pilotage/filtres'
import { rgba } from './core/couleurs'
import { depuisGrapheAtlas, versionDonnees } from './donneesAtlas'
import type { JeuRaisonnement } from './raisonnement/donnees'
import { creerVueRaisonnement, type ContexteDessinR, type VueRaisonnement } from './raisonnement/vue'

/** Le panneau ☰ et les réglages Tweakpane du moteur ne sont montrés qu'en développement. */
const OUTILS_DEV = import.meta.env.DEV
const SOMBRE = matchMedia('(prefers-color-scheme: dark)')
const JEU_VIDE: JeuRaisonnement = { titre: 'Graphe Atlas', resume: '', sousProblemes: [], noeuds: [], source: 'api' }

/** Repères verticaux des rangs logiques (profondeur de raisonnement), repris de r0 · Référence. */
function dessinerRangs({ ctx, vue, hauteur }: ContexteDessinR): void {
  const d = vue.disposition
  const pal = vue.palette
  const cam = vue.camera
  const z0 = d.bornes.zmin - 0.25, z1 = d.bornes.zmax + 0.25
  // En 3D, les repères sont posés sur la couche la plus proche de la caméra (les hypothèses).
  const y = -((7 - 1) / 2) * vue.reglages.valeurs.ecartCouches * vue.extrusion
  ctx.save()
  ctx.font = `10px ${pal.police}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  let dernierX = -Infinity
  d.xRangs.forEach((x, k) => {
    const a = cam.projeterPoint([x, y, z0]), b = cam.projeterPoint([x, y, z1])
    if (!a.visible || !b.visible) return
    ctx.strokeStyle = rgba(pal.texteDoux, 0.12)
    ctx.setLineDash([2, 5])
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    // Numéros espacés d'au moins 28 px.
    if (a.y < hauteur - 60 && Math.abs(a.x - dernierX) >= 28) {
      dernierX = a.x
      ctx.fillStyle = rgba(pal.texteDoux, 0.8)
      ctx.fillText(k === 0 ? 'rang 0' : `${k}`, a.x, a.y + 4)
    }
  })
  ctx.restore()
}

export class VueGrapheAtlas {
  readonly moteur: VueRaisonnement
  readonly filtres: FiltresVue
  /** Empreinte des données affichées (P4 `version_donnees`). */
  version = ''
  /** Vrai pendant un changement programmatique (pilotage, rechargement) : la sélection ne remonte pas à l'application. */
  silencieux = false
  private ids = ''

  constructor(conteneur: HTMLElement, surSelection: (id: string | null) => void) {
    this.moteur = creerVueRaisonnement(conteneur, {
      id: 'atlas',
      jeu: JEU_VIDE,
      mode: '2d',
      // Couleur = statut (le type n'est que déduit) ; libellés denses : les graphes Atlas restent petits.
      reglages: { couleur: 'statut', theme: SOMBRE.matches ? 'sombre' : 'clair', densiteLibelles: 3 },
      ui: { panneau: OUTILS_DEV, reglages: OUTILS_DEV },
      dessinerDessous: dessinerRangs,
    })
    const v = this.moteur
    // Le thème suit le système au chargement et quand il change (le bouton de la barre reste possible).
    v.definirTheme(SOMBRE.matches ? 'sombre' : 'clair')
    SOMBRE.addEventListener('change', () => v.definirTheme(SOMBRE.matches ? 'sombre' : 'clair'))
    this.filtres = new FiltresVue(v)
    v.on('selection', ({ point }) => {
      if (!this.silencieux) surSelection(point === null ? null : v.noeud(point).id)
    })
  }

  /** Affiche un graphe lu dans l'API. Ne fait rien si les données n'ont pas changé ; recadre si les nœuds changent. */
  async afficher(graphe: Graphe): Promise<void> {
    const version = versionDonnees(graphe)
    if (version === this.version) return
    this.version = version
    const ids = graphe.noeuds.map((n) => n.id).sort().join(' ')
    const nouveaux = ids !== this.ids
    this.ids = ids
    this.silencieux = true
    try {
      await this.moteur.remplacerJeu(depuisGrapheAtlas(graphe))
    } finally {
      this.silencieux = false
    }
    if (nouveaux) this.cadrer()
  }

  /** Filtre « nœuds de cette conversation » (null : tout le graphe). */
  filtrerConversation(conversation: string | null): void {
    if (this.filtres.etat.conversation === conversation) return
    this.filtres.definir({ ...this.filtres.etat, conversation })
    this.cadrer()
  }

  /** Nombre de nœuds (de justification) qui passent les filtres. */
  compter(): number {
    return this.moteur.justification.noeuds.filter((n) => noeudPasse(n, this.filtres.etat)).length
  }

  /** Sélectionne un nœud par son id (lignée) ; montre les liens complets s'il est hors du graphe de lecture. */
  selectionner(id: string | null): void {
    const v = this.moteur
    if (id === null) return v.selectionner(null)
    const i = v.justification.index.get(id)
    const p = i === undefined ? null : v.pointDeNoeud(i)
    if (p === null) return
    if (p >= v.nU && !v.reglages.valeurs.liensComplets) v.montrerLiensComplets(true)
    v.selectionner(p)
  }

  /** Cadre les points qui passent les filtres (tout, sans filtre). */
  cadrer(): void {
    const points = this.filtres.points()
    if (points.length) this.moteur.cadrer(points)
  }
}
