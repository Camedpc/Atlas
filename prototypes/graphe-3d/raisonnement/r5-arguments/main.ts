// R5 · Carte d'arguments : le raisonnement lu comme une suite d'arguments (Toulmin + IBIS).
//
// Unité de lecture = une carte : conclusion, 1 à 3 raisons principales, garantie (écrite sur la
// flèche), qualificatif (statut, confiance). Les cartes s'enchaînent de gauche à droite ; les
// objections sont en rouge à côté des cartes qu'elles attaquent ; les conjectures sont des
// questions « ? » ; les décisions, des questions tranchées posées au-dessus de ce qu'elles
// gouvernent ; les choix de modélisation, des hypothèses de travail en bandeau.
//
// Modules : arguments.ts (stratégie de dérivation + modèle des cartes), mise-en-page.ts
// (disposition en colonnes et couloirs), rendu.ts (cartes HTML, flèches), fiche.ts (fiche, panneau).

import { creerVueRaisonnement, type Disposition, type OptionsVueRaisonnement, type VueRaisonnement } from '../../src/raisonnement'
import { construireModele, ID_STRATEGIE } from './arguments'
import { ficheCarte, ficheEtiquette, sectionPanneau } from './fiche'
import { calculerMiseEnPage, versMonde, type ParametresMiseEnPage } from './mise-en-page'
import { RenduCartes, type EtatR5 } from './rendu'
import meta from './meta.json'

const DOSSIER = 'Vision R5 · cartes'
const etat: EtatR5 = { modele: null, mep: null, survolEtiquette: null }
let rendu: RenduCartes | null = null
let majPanneau: (() => void) | null = null
const miennes = new WeakSet<Disposition>()

const options: OptionsVueRaisonnement = {
  id: meta.id,
  strategie: ID_STRATEGIE,
  mode: '2d',
  // Les cartes remplacent les libellés, pastilles et liens sémantiques par défaut.
  reglages: { pastillesContexte: false, liensSemantiques: false, dureeTransition: 650 },
  reglagesSupplementaires: [
    { cle: 'r5SeuilRaisons', defaut: 235, min: 120, max: 600, pas: 5, dossier: DOSSIER, libelle: 'zoom : raisons (px)' },
    { cle: 'r5SeuilDetails', defaut: 370, min: 150, max: 900, pas: 5, dossier: DOSSIER, libelle: 'zoom : détails (px)' },
    { cle: 'r5LargeurCarte', defaut: 240, min: 160, max: 400, pas: 5, dossier: DOSSIER, libelle: 'largeur carte' },
    { cle: 'r5HauteurCarte', defaut: 96, min: 60, max: 200, pas: 2, dossier: DOSSIER, libelle: 'hauteur carte' },
    { cle: 'r5EcartColonnes', defaut: 80, min: 30, max: 260, pas: 2, dossier: DOSSIER, libelle: 'écart colonnes' },
    { cle: 'r5EcartLignes', defaut: 22, min: 6, max: 120, pas: 2, dossier: DOSSIER, libelle: 'écart lignes' },
    { cle: 'r5EcartCouloirs', defaut: 30, min: 0, max: 160, pas: 2, dossier: DOSSIER, libelle: 'écart couloirs' },
    { cle: 'r5Couloirs', defaut: true, dossier: DOSSIER, libelle: 'couloirs par sous-problème' },
    { cle: 'r5DecisionsAuDessus', defaut: true, dossier: DOSSIER, libelle: 'décisions au-dessus' },
    { cle: 'r5Garanties', defaut: true, dossier: DOSSIER, libelle: 'garanties sur les flèches' },
    { cle: 'r5Objections', defaut: true, dossier: DOSSIER, libelle: 'objections et réponses' },
    { cle: 'r5Bandeau', defaut: true, dossier: DOSSIER, libelle: 'bandeaux hypothèses (M)' },
    { cle: 'r5Courbure', defaut: 0.5, min: 0, max: 1, pas: 0.01, dossier: DOSSIER, libelle: 'courbure flèches' },
    { cle: 'r5OpaciteFleches', defaut: 0.7, min: 0.1, max: 1, pas: 0.01, dossier: DOSSIER, libelle: 'opacité flèches' },
    { cle: 'r5PoliceCarte', defaut: 12, min: 9, max: 16, pas: 0.5, dossier: DOSSIER, libelle: 'police des cartes' },
  ],
  // Les points des cartes sont cachés (les cartes HTML les remplacent) ; ils réapparaissent en
  // petits points avec les liens complets. Les arêtes de lecture sont dessinées par rendu.ts.
  // Le point sigma d'une carte reste actif (survol, lignée, capture) mais petit et sans libellé :
  // la carte HTML, posée au-dessus, le recouvre. Avec les liens complets, il sert d'extrémité aux liens.
  reducteursNoeud: [(info, a, v) => {
    if (!etat.modele || v.lecture.strategie.id !== ID_STRATEGIE || info.genre === 'masque') return
    a.taille = v.reglages.valeurs.liensComplets ? 3.5 : 2
    a.libelle = null
    a.forceLibelle = false
    a.surligne = false
  }],
  reducteursArete: [(info, a, v) => {
    if (etat.modele && v.lecture.strategie.id === ID_STRATEGIE && info.genre === 'lecture') a.cache = true
  }],
  dessinerDessous: (c) => rendu?.dessiner(c),
  rendreFiche: (p, v, defaut) => {
    const m = etat.modele
    if (!m || v.lecture.strategie.id !== ID_STRATEGIE) return defaut()
    if (p < m.cartes.length) return ficheCarte(v, m, m.cartes[p]!)
    return ficheEtiquette(v, m, v.indexNoeud(p)) ?? defaut()
  },
  panneau: (p, v) => { majPanneau = sectionPanneau(p, v, etat) },
}

const vue = creerVueRaisonnement(document.getElementById('app')!, options)
document.documentElement.style.setProperty('--r5-police', `${vue.reglages.lire<number>('r5PoliceCarte')}px`)

function parametres(v: VueRaisonnement): ParametresMiseEnPage {
  const l = <T extends number | boolean>(k: string) => v.reglages.lire<T>(k)
  return {
    largeurCarte: l('r5LargeurCarte'), hauteurCarte: l('r5HauteurCarte'), ecartColonnes: l('r5EcartColonnes'),
    ecartLignes: l('r5EcartLignes'), ecartCouloirs: l('r5EcartCouloirs'), couloirs: l('r5Couloirs'),
    decisionsAuDessus: l('r5DecisionsAuDessus'), ecartCouches: v.reglages.valeurs.ecartCouches,
  }
}

/** Installe notre disposition (cartes) dans la vue ; hors stratégie R5, la vue garde la sienne. */
function installer(anime: boolean): void {
  if (vue.lecture.strategie.id !== ID_STRATEGIE) {
    etat.modele = etat.mep = null
    rendu?.reconstruire()
    majPanneau?.()
    return
  }
  etat.modele = construireModele(vue.lecture)
  etat.mep = calculerMiseEnPage(vue.lecture, etat.modele, parametres(vue))
  miennes.add(etat.mep.disposition)
  // appliquerDisposition est privée dans vue.ts : c'est le seul moyen d'y poser une disposition
  // calculée hors de disposition.ts (voir NOTES.md).
  ;(vue as unknown as { appliquerDisposition(d: Disposition, anime: boolean): void }).appliquerDisposition(etat.mep.disposition, anime)
  rendu?.reconstruire()
  majPanneau?.()
}

rendu = new RenduCartes(vue, etat)
installer(false)

// Toute nouvelle disposition calculée par la vue (stratégie, réglage, format d'écran) est remplacée
// par la nôtre tant que la stratégie R5 est active.
vue.on('disposition', ({ disposition }) => {
  if (miennes.has(disposition)) return
  installer(true)
})
vue.on('reglage', ({ cle, valeur }) => {
  if (cle === 'r5PoliceCarte') document.documentElement.style.setProperty('--r5-police', `${valeur}px`)
  else if (/^r5(LargeurCarte|HauteurCarte|EcartColonnes|EcartLignes|EcartCouloirs|Couloirs|DecisionsAuDessus)$/.test(cle)) {
    installer(true)
    vue.cadrerTout()
  } else if (cle === 'r5Bandeau' || cle === 'theme') rendu?.reconstruire()
})

// Cadrage : on cadre les coins des cartes (et les blocs H / M), pas seulement leurs centres.
const cadrerDefaut = vue.cadrer.bind(vue)
vue.cadrer = (points = null, duree = vue.reglages.valeurs.dureeTransition, extrusion = vue.extrusion) => {
  const m = etat.modele, mp = etat.mep
  if (!m || !mp || vue.reglages.valeurs.liensComplets || vue.nU !== m.cartes.length) return cadrerDefaut(points, duree, extrusion)
  const liste = points ? [...points].filter((p) => p < m.cartes.length) : m.cartes.map((c) => c.unite)
  if (!liste.length) return cadrerDefaut(points, duree, extrusion)
  const coins: number[] = []
  const d = mp.disposition
  const ajouter = (x: number, y: number, prof: number) => coins.push(...versMonde(mp, x, y, prof))
  const L = mp.p.largeurCarte / 2, H = mp.p.hauteurCarte / 2
  for (const u of liste) {
    const prof = d.yCouche[u]! * extrusion
    ajouter(mp.x[u]! - L, mp.y[u]! - H - 16, prof)
    ajouter(mp.x[u]! + L + 12, mp.y[u]! + H, prof)
  }
  if (!points) {
    // Bloc des données (couche « hypothèses ») et bandeau (couche « choix »), à leur profondeur.
    const r = mp.blocDonnees, b = mp.bandeau
    const prof = (couche: number) => (couche - 3) * vue.reglages.valeurs.ecartCouches * extrusion
    ajouter(r.x - r.l / 2, r.y - r.h / 2, prof(0))
    ajouter(r.x + r.l / 2, r.y + r.h / 2, prof(0))
    if (vue.reglages.lire<boolean>('r5Bandeau')) {
      ajouter(b.x - b.l / 2, b.y - b.h / 2, prof(2))
      ajouter(b.x + b.l / 2, b.y + b.h / 2, prof(2))
    }
  }
  const zone = vue.zoneSure()
  zone.droite = Math.max(16, zone.droite - 150)
  zone.gauche = Math.max(zone.gauche, 12)
  vue.camera.cadrer(new Float32Array(coins), null, duree, extrusion > 0.5 ? 1.2 : 1.03, zone)
  vue.demanderRendu()
}
vue.cadrerTout(1)

// Survol : les cartes et les étiquettes H / M sont des éléments DOM ; la vue interroge pointSous.
const pointSousDefaut = vue.pointSous.bind(vue)
vue.pointSous = (x, y, marge) => {
  const m = etat.modele
  if (m && rendu && vue.lecture.strategie.id === ID_STRATEGIE) {
    // Le calque des cartes ne reçoit pas les événements (sigma les écoute sous lui) : test géométrique.
    const et = rendu.etiquetteSous(x, y)
    rendu.survolerEtiquette(et)
    if (et !== null) return vue.pointDeNoeud(et)
    const u = rendu.carteSous(x, y, marge ?? 0)
    if (u !== null) return u
    if (!vue.reglages.valeurs.liensComplets) return null
  }
  return pointSousDefaut(x, y, marge)
}

// Clic sur une étiquette H / M : portée complète (tout ce qui en dépend).
let dansPortee = false
vue.on('selection', ({ point }) => {
  const m = etat.modele
  if (dansPortee || !m || point === null || point < m.cartes.length) return
  const i = vue.indexNoeud(point)
  if (!m.modeles.some((x) => x.noeud === i) && !m.donnees.some((x) => x.noeud === i)) return
  dansPortee = true
  vue.montrerPortee(point)
  dansPortee = false
})

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r5: EtatR5 }).rsnVue = vue
;(window as unknown as { r5: EtatR5 }).r5 = etat
