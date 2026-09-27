// V7 · Synthèse — une seule proposition, un seul langage visuel :
//   · base « figure scientifique » de V1 (papier, encre, Source Serif + Inter, noms posés sur les
//     agrégats sans chevauchement, anneau de confiance, bordure = validation, jaillissement) ;
//   · agrégats lisibles d'un coup d'œil : anneau fin segmenté par statut (V6, en discret) ;
//   · vues de face et de droite traitées en instrument (V4) : règles, réticule, barres d'erreur,
//     couloirs nommés ; vue de dessus sans graduation ;
//   · lignée animée par impulsions sobres (V3) ; fiche hiérarchisée (V5) ;
//   · options : lentille (V5, désactivée), zoom sémantique (V2, manuel par défaut), palette Ctrl + K (V5) ;
//   · panneau gauche pensé comme l'application Atlas (Graphe, Nœud, Activité, Réglages).

import { creerVue, el, formaterNombre, LIBELLES_VUES, NOMS_NIVEAUX, type VueGraphe } from '../../src/core'
import meta from './meta.json'
import { REGLAGES_V7, SURCHARGES_MOTEUR, lire } from './reglages'
import {
  creerEtat, creerReducteurArete, creerReducteurNoeud, creerTrajectoire, dessinerAnneaux, dessinerTerritoires,
  majCouleurs, majStatuts, programmesArete, programmesNoeud, type EtatFigure,
} from './figure'
import { dessinerLibelles, zonesReservees } from './libelles'
import { Axes } from './axes'
import { ImpulsionsLignee } from './lignee'
import { Lentille } from './lentille'
import { ZoomSemantique } from './zoom'
import { rendreFiche } from './fiche'
import { PaletteCommandes, commande, type Commande } from './commandes'
import { construireActivite, dessinerPresence, type Activite } from './activite'
import { PanneauApplication } from './panneau'

const aside = document.getElementById('panneau')!
const bouton = document.getElementById('bouton-panneau') as HTMLButtonElement
// Le panneau du moteur (filtres, arbre des catégories) est monté hors de la vue, puis ses sections
// sont déplacées dans l'onglet « Graphe » de notre panneau.
const conteneurMoteur = el('div', { class: 'v7-moteur' })
aside.appendChild(conteneurMoteur)

// Modules créés après la vue : les crochets passés à creerVue les lisent quand ils existent
// (le moteur appelle déjà les réducteurs pendant sa construction).
let etat: EtatFigure | null = null
let axes: Axes | null = null
let impulsions: ImpulsionsLignee | null = null
let lentille: Lentille | null = null
let activite: Activite | null = null
let panneau: PanneauApplication | null = null
let trajectoire: ReturnType<typeof creerTrajectoire> | null = null

const vue: VueGraphe = creerVue(document.getElementById('app')!, {
  id: meta.id,
  mode: '2d',
  vueInitiale: 'dessus',
  granularite: 1,
  reglages: SURCHARGES_MOTEUR,
  reglagesSupplementaires: REGLAGES_V7,
  ui: { panneau: true, panneauMode: 'externe', conteneurPanneau: conteneurMoteur },
  programmesNoeud,
  programmesArete,
  reducteursArete: [creerReducteurArete()],
  etenduesParDefaut: false,
  rendreFiche: (u, v) => rendreFiche(v, u),
  trajectoire: (p) => {
    if (trajectoire) trajectoire(p)
    else {
      p.x = p.dx + (p.ax - p.dx) * p.t
      p.y = p.dy + (p.ay - p.dy) * p.t
      p.z = p.dz + (p.az - p.dz) * p.t
    }
  },
  apresProjection: (p) => lentille?.deformer(p),
  dessinerDessous: (c) => {
    if (!etat) return
    dessinerTerritoires(etat, c)
    lentille?.dessous(c)
    axes?.dessous(c)
    dessinerAnneaux(etat, c)
  },
  dessinerDessus: (c) => {
    if (!etat) return
    zonesReservees.length = 0
    axes?.preparer(zonesReservees)
    dessinerLibelles(etat, c)
    impulsions?.dessiner(c)
    axes?.dessus(c)
    if (activite && presenceVisible()) dessinerPresence(activite, c)
    lentille?.dessus(c)
  },
})

const racine = vue.racine
racine.classList.add('v7')
document.body.dataset.theme = vue.reglages.valeurs.theme

etat = creerEtat(vue)
trajectoire = creerTrajectoire(vue)
vue.ajouterReducteurNoeud(creerReducteurNoeud(etat))
axes = new Axes(vue, etat)
impulsions = new ImpulsionsLignee(vue)
lentille = new Lentille(vue, etat)
vue.ajouterReducteurNoeud(lentille.reducteur)
new ZoomSemantique(vue)
activite = construireActivite(vue)

// ─── Palette de commandes (Ctrl + K) ────────────────────────────────────────

const palette: PaletteCommandes = new PaletteCommandes(vue, (): Commande[] => {
  const R = vue.reglages
  const p = panneau
  const l: Commande[] = []
  if (p) {
    l.push(commande('Panneau', p.ouvert ? 'Fermer le panneau' : 'Ouvrir le panneau', () => p.basculer(), { raccourci: 'N' }))
    for (const [id, t] of [['graphe', 'Graphe et filtres'], ['noeud', 'Nœud sélectionné'], ['activite', 'Activité des agents'], ['reglages', 'Réglages']] as const) {
      l.push(commande('Panneau', `Panneau : ${t}`, () => {
        p.choisir(id)
        p.basculer(true)
      }))
    }
    l.push(commande('Panneau', lire<string>(vue, 'modePanneau') === 'pousse' ? 'Panneau en surimpression' : 'Panneau qui pousse le graphe', () => R.definir('modePanneau', lire<string>(vue, 'modePanneau') === 'pousse' ? 'surimpression' : 'pousse')))
  }
  l.push(commande('Options', lire<boolean>(vue, 'lentille') ? 'Désactiver la lentille' : 'Activer la lentille focus + contexte', () => R.definir('lentille', !lire<boolean>(vue, 'lentille'))))
  if (lire<boolean>(vue, 'lentille') && lentille) l.push(commande('Options', lentille.epinglee ? 'Désépingler la lentille' : 'Épingler la lentille', () => lentille!.epingler(), { raccourci: 'L' }))
  l.push(commande('Options', 'Réglages avancés (Tweakpane)', basculerReglagesAvances))
  return l
})

function basculerReglagesAvances(): void {
  const r = vue.ui.reglages
  if (!r) return
  r.classList.toggle('masque')
  const pane = vue.reglages.pane
  if (pane && !r.classList.contains('masque')) pane.expanded = true
}

// ─── Panneau application ────────────────────────────────────────────────────

panneau = new PanneauApplication(aside, bouton, vue, vue.ui.panneau!, activite, {
  allerNoeud: (f) => palette.allerNoeud(f),
  allerCategorie: (c) => palette.allerCategorie(c),
  basculerReglagesAvances,
  ouvrirPalette: () => lire<boolean>(vue, 'palette') && palette.ouvrir(),
})
panneau.quandChange(() => {
  axes?.majMarges(true)
  vue.demanderRendu()
})

function presenceVisible(): boolean {
  const m = lire<string>(vue, 'marqueursActivite')
  return m === 'toujours' || (m === 'onglet' && panneau !== null && panneau.ouvert && panneau.onglet === 'activite')
}

// ─── Légende de figure (en haut à gauche, façon revue) ─────────────────────

const legende = el('div', { class: 'v7-legende-figure', 'aria-live': 'polite' })
vue.interface.appendChild(legende)
function majLegende(): void {
  legende.style.display = lire<boolean>(vue, 'legendeFigure') ? '' : 'none'
  const vc = vue.camera.vueCourante(1)
  const lecture = vc === 'dessus' ? 'thématique : proximité = même logique, sessions voisines'
    : vc === 'face' ? 'temporelle : X = date de création, barres = étendue des agrégats'
      : vc === 'droite' ? 'par type : couloirs type × origine (humain, IA, ordinateur)'
        : 'libre : les points glissent entre les organisations des faces'
  const g = vue.granularite.globale
  const n = Math.round(g)
  const niveau = Math.abs(g - n) < 0.02 ? NOMS_NIVEAUX[n].toLowerCase() : 'transition'
  let visibles = 0
  for (let u = 0; u < vue.h.nU; u++) if (vue.granularite.alpha[u]! > 0.5 && (u >= vue.h.nF ? vue.granularite.nbActives[u - vue.h.nF]! > 0 : vue.filtres.actives[u])) visibles++
  legende.replaceChildren(
    el('b', { class: 'v7-panneau-lettre' }, 'a'),
    el('span', { class: 'v7-legende-titre' }, 'Graphe de recherche Atlas. '),
    el('span', {}, `Vue ${vc ? LIBELLES_VUES[vc].toLowerCase() : 'libre'} — ${lecture}. Agrégation : ${niveau} ; ${formaterNombre(visibles)} éléments pour ${formaterNombre(vue.filtres.nbActives)} nœuds.`),
  )
}
let minuterieLegende = 0
const planifierLegende = () => {
  clearTimeout(minuterieLegende)
  minuterieLegende = window.setTimeout(majLegende, 120)
}
for (const e of ['vue', 'granularite', 'filtres'] as const) vue.on(e, planifierLegende)
vue.on('image', () => {
  if (vue.camera.enAnimation) planifierLegende()
})

// ─── Thème, polices, clavier ────────────────────────────────────────────────

const appliquerGrain = () => racine.style.setProperty('--grain', String(lire<number>(vue, 'grain')))
appliquerGrain()
vue.on('theme', ({ theme }) => {
  document.body.dataset.theme = theme
  if (etat) majCouleurs(etat)
})
vue.on('filtres', () => etat && majStatuts(etat))
vue.on('reglage', ({ cle }) => {
  if (cle === 'grain') appliquerGrain()
  else if (cle === 'teinteAgregat' && etat) majCouleurs(etat)
  else if (cle === 'legendeFigure') majLegende()
  else if (cle === 'ficheDetaillee') rafraichirFiche()
})

function rafraichirFiche(): void {
  const f = vue.ui.fiche
  if (f && f.uniteAffichee !== null) f.afficher(f.uniteAffichee, rendreFiche(vue, f.uniteAffichee))
}

window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return
  if (e.code === 'Space' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    vue.reglages.definir('ficheDetaillee', !lire<boolean>(vue, 'ficheDetaillee'))
  } else if (e.code === 'KeyL' && !e.ctrlKey && !e.metaKey && lire<boolean>(vue, 'lentille')) {
    lentille?.epingler()
  }
})

// Les polices web arrivent après le premier rendu : on remesure les libellés.
document.fonts?.ready.then(() => {
  if (etat) majCouleurs(etat)
  vue.demanderRendu()
})
majLegende()

// Pratique pour déboguer et piloter les captures depuis la console.
;(window as unknown as Record<string, unknown>).atlasVue = vue
;(window as unknown as Record<string, unknown>).v7 = { vue, panneau, palette, lentille, impulsions, axes }
