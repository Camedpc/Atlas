// R19 · Blueprint · sous-graphes réductibles : le schéma technique de R14 avec deux mécanismes
// d'Unreal Engine.
//
// - Boîtes « Comment » : chaque sous-problème est une bande colorée (fond teinté translucide, barre de
//   titre, contour fin) ; les en-têtes de blocs sont colorés par famille (déduction, empirique, calcul,
//   conjecture, résultat).
// - « Collapse to Function » : un clic sur la barre de titre réduit le groupe en un nœud-fonction
//   (broches d'entrée = liaisons venant de l'extérieur, broches de sortie = énoncés utilisés à
//   l'extérieur, statut agrégé = le plus faible, confiance = maillon le plus faible) ; un nouveau clic le
//   redéploie. La réduction est une étape de dérivation (groupes.ts), donc liaisons, lignée et
//   correspondance restent exactes ; la transition montre les blocs se resserrer dans la fonction.
// - Onglet : « OUVRIR ↗ » (ou double-clic sur un nœud-fonction) n'affiche que le groupe, avec ses
//   sources en nœud « Entrée » et ses utilisateurs en nœud « Sortie » ; fil d'Ariane en haut.
// - Le cartouche est dessiné sur la feuille, sous le schéma : il ne recouvre plus aucun bloc.

import {
  creerVueRaisonnement, el, type Disposition, type ReducteurAreteR, type ReducteurPoint, type VueRaisonnement,
} from '../../src/raisonnement'
import {
  agreger, COULEUR_FONCTION, COULEURS_FAMILLE, etatGroupes, groupeDeNoeud, horsGroupe, NOMS_FAMILLE, nomGroupe,
  resultatDe, teinteGroupe, type Famille,
} from './groupes'
import { jeuFontaine } from './jeu-fontaine'
import meta from './meta.json'
import { mettreEnPage, type MiseEnPage, type OptionsGroupes } from './mise-en-page'
import {
  cibleSous, dependantsActifs, dessinerDessous, dessinerDessus, lirePaletteR19, type EtatRendu,
} from './rendu'
import { etatSquelette, NIVEAUX, niveauDeStrategie, STRATEGIE_NIVEAU, type Niveau } from './squelette'

const etat: EtatRendu = {
  page: null,
  palette: { encre: '#16181c', gris: '#62676f', trait: '#3a3e45', surface: '#ffffff', surface2: '#f3f4f5', accent: '#1a5fd0' },
  cibles: [],
  survol: null,
  epingles: new Set(),
  hypotheses: new Map(),
  ciblesGroupes: [],
  fantomes: null,
  cartouche: null,
}

// État de la vision (déclaré avant la vue : ses rappels servent dès la construction).
let corpsPanneau: HTMLElement | null = null
let cadrerApres = true
let epinglesIds = new Set<string>()
let revision = 0

// ─── Réducteurs : points sigma invisibles, opacité pilotée par la vision ───────

const reducteurPoint: ReducteurPoint = (info, a, vue) => {
  // Sigma ne dessine plus les nœuds : blocs et spécifications sont sur le calque « dessus ».
  a.taille = 0.01
  a.libelle = null
  a.forceLibelle = false
  a.surligne = false
  // Piste abandonnée : grisée par le bloc lui-même, pas par l'opacité (qui la rendrait illisible).
  if (info.noeud.piste === 'abandonnee') a.opacite = Math.min(info.presence, a.opacite / 0.55)
  const sv = etat.survol
  const actifs = dependantsActifs(vue, etat)
  if (sv?.genre === 'pastille') {
    // Survol d'une borne : les blocs qui utilisent ce contexte restent nets.
    const us = etat.page?.usagesPastille.get(sv.noeud)
    a.opacite = info.presence * (us?.includes(info.point) ? 1 : 0.2)
  } else if (sv?.genre === 'renvoi') {
    // Survol d'un connecteur de renvoi : le bloc cité et ceux qui le citent.
    const us = etat.page?.usagesRenvoi.get(sv.point)
    a.opacite = info.presence * (info.point === sv.point || us?.includes(info.point) ? 1 : 0.2)
  } else if ((sv?.genre === 'titre' || sv?.genre === 'ouvrir') && sv.groupe) {
    // Survol d'une barre de titre : le groupe reste net, le reste s'atténue un peu.
    const gr = etat.page?.groupes.find((g) => g.id === sv.groupe)
    a.opacite = info.presence * (gr?.points.includes(info.point) ? 1 : 0.45)
  } else if (actifs && vue.survol !== null && sv?.genre === 'drapeau') {
    a.opacite = info.presence * (actifs.has(info.point) ? 1 : 0.22)
  } else if (actifs && !vue.ligneeActive && vue.survol === null) {
    a.opacite = info.presence * (actifs.has(info.point) ? 1 : 0.32)
  } else if (info.survol === 'autre') {
    a.opacite = Math.max(a.opacite, info.presence * 0.5)
  }
}

const reducteurArete: ReducteurAreteR = (info, a) => {
  // Les liaisons de lecture sont tracées (orthogonales) sur le calque « dessous ».
  if (info.genre === 'lecture') a.cache = true
}

// ─── Jeu de données ──────────────────────────────────────────────────────────
// La fontaine de chaîne par défaut ; ?jeu=edp pour le jeu synthétique.

const JEUX = { fontaine: 'Fontaine de chaîne', edp: 'EDP stochastique (synthétique)' } as const
type Jeu = keyof typeof JEUX
const jeuChoisi: Jeu = new URLSearchParams(location.search).get('jeu') === 'edp' ? 'edp' : 'fontaine'

// ─── Vue ─────────────────────────────────────────────────────────────────────

const D = 'Blueprint R19'
const vue = creerVueRaisonnement(document.getElementById('app')!, {
  // Réglages mémorisés par jeu : cadrage et niveau ne se mélangent pas d'un raisonnement à l'autre.
  id: `${meta.id}-${jeuChoisi}`,
  jeu: jeuChoisi === 'fontaine' ? jeuFontaine() : undefined,
  mode: '2d',
  strategie: STRATEGIE_NIVEAU.squelette,
  reglages: {
    ajusterAspect: false,
    pastillesContexte: true,
    liensSemantiques: true,
    opaciteContexte: 0.22,
    opaciteLiensComplets: 0.22,
  },
  reglagesSupplementaires: [
    { cle: 'niveau', defaut: 'squelette', dossier: D, libelle: 'niveau de détail', options: Object.fromEntries(NIVEAUX.map((n) => [n.nom, n.id])) },
    { cle: 'largeurCarte', defaut: 136, dossier: D, libelle: 'largeur bloc', min: 96, max: 240, pas: 2 },
    { cle: 'ecartColonnes', defaut: 48, dossier: D, libelle: 'écart colonnes', min: 24, max: 160, pas: 2 },
    { cle: 'ecartLignes', defaut: 18, dossier: D, libelle: 'écart lignes', min: 4, max: 80, pas: 1 },
    { cle: 'taillePolice', defaut: 12.5, dossier: D, libelle: 'taille texte', min: 9, max: 18, pas: 0.5 },
    { cle: 'maxPastilles', defaut: 5, dossier: D, libelle: 'bornes max.', min: 0, max: 12, pas: 1 },
    { cle: 'bandesChoix', defaut: 'survol', dossier: D, libelle: 'repères d’hypothèses', options: { 'au survol / épinglés': 'survol', toujours: 'toujours' } },
    { cle: 'impasses', defaut: true, dossier: D, libelle: 'alternatives rejetées' },
    { cle: 'enTetes', defaut: true, dossier: D, libelle: 'cadre et règle' },
    { cle: 'grille', defaut: true, dossier: D, libelle: 'trame' },
    { cle: 'cartouche', defaut: true, dossier: D, libelle: 'cartouche' },
  ],
  reducteursNoeud: [reducteurPoint],
  reducteursArete: [reducteurArete],
  dessinerDessous: (c) => dessinerDessous(c, etat),
  dessinerDessus: (c) => dessinerDessus(c, etat),
  rendreFiche: (p, v, defaut) => {
    const f = defaut()
    const aide = f.querySelector('.rsn-aide')
    const u = p < v.nU ? v.lecture.unites[p] : undefined
    const n = v.noeud(p)
    const page = etat.page
    const b = page && p < v.nU ? page.boites[p] : undefined
    let texte = 'Clic : lignée · double-clic : cadrer · Échap : effacer'
    if (n.type === 'choix_modelisation') texte = 'Survol : repères sur les blocs dépendants · clic : épingler'
    else if (b?.genre === 'fonction') texte = 'Double-clic : ouvrir le sous-graphe dans un onglet · clic sur la barre de titre : déployer'
    else if (b?.genre === 'entree' || b?.genre === 'sortie') texte = 'Double-clic : revenir au graphe principal'
    else if (u && u.membres.length > 1) texte = `Double-clic : ouvrir le sous-système (${u.membres.length} énoncés) · clic : lignée`
    else if (u && dansDeplie(v, p)) texte = 'Double-clic : refermer le sous-système · clic : lignée'
    else if (!u) texte = 'Contexte : clic pour voir les blocs qui l’utilisent'
    if (aide) aide.textContent = texte
    const sv = etat.survol
    const bandeau = (t: string, couleur?: string) => {
      const d = el('div', { class: 'r19-fiche-bandeau' }, t)
      if (couleur) d.style.borderColor = d.style.color = couleur
      f.prepend(d)
    }
    if (page && sv?.genre === 'pastille') {
      const k = page.usagesPastille.get(sv.noeud)?.length ?? 0
      bandeau(`BORNE DE CONTEXTE · ${k} bloc${k > 1 ? 's' : ''} raccordé${k > 1 ? 's' : ''}`)
    } else if (page && sv?.genre === 'renvoi') {
      const k = page.usagesRenvoi.get(sv.point)?.length ?? 0
      bandeau(`RENVOI → ${page.boites[sv.point]?.ref} · cité par ${k} bloc${k > 1 ? 's' : ''} en aval`)
    } else if (page && b && u) {
      const statut = (s: string) => (s === 'valide' ? 'validé' : s === 'incertain' ? 'à vérifier' : 'réfuté')
      if (b.genre === 'fonction') {
        const ag = agreger(v.justification.noeuds, u.membres)
        const maillon = v.justification.noeuds[ag.maillon]!
        bandeau(`${b.ref} · ƒ ${nomGroupe(v.jeu, b.groupe ?? '')} · ${ag.n} énoncés · statut agrégé : ${statut(ag.statut)} · maillon faible : ${maillon.nom} (${ag.confiance.estimation.toFixed(2).replace('.', ',')})`, COULEUR_FONCTION)
        f.append(listeMembres(v, u.membres))
      } else if (b.genre === 'drapeau') {
        const k = page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0
        bandeau(`${b.ref} · HYPOTHÈSE DE MODÉLISATION · ${k} bloc${k > 1 ? 's' : ''} en dépendent`)
      } else {
        const groupe = b.groupe ? ` · ${nomGroupe(v.jeu, b.groupe)}` : ''
        const trait = n.statut === 'valide' ? 'trait continu : validé' : n.statut === 'incertain' ? 'trait tireté : à vérifier' : 'bloc barré : réfuté'
        bandeau(`${b.ref} · rang R${Math.max(0, b.rang)}${groupe} · ${trait}`, b.groupe ? teinteGroupe(v.jeu, b.groupe) : undefined)
      }
    }
    return f
  },
  panneau: (p, v) => p.ajouterSection('r19', 'Blueprint', construirePanneau(v), { position: 'lecture' }),
})

// Les pastilles et liens sémantiques par défaut sont remplacés par ceux de la vision.
vue.dessinsDessus.splice(0, 2)

/** Membres d'un nœud-fonction, avec leur statut (fiche). */
function listeMembres(v: VueRaisonnement, membres: number[]): HTMLElement {
  const noeuds = v.justification.noeuds
  const liste = el('div', { class: 'r19-membres' })
  for (const m of membres) {
    const n = noeuds[m]!
    const marque = n.statut === 'valide' ? '─' : n.statut === 'incertain' ? '┄' : '╳'
    liste.append(el('div', { class: 'r19-membre' },
      el('span', { class: 'r19-membre-statut', title: n.statut }, marque),
      el('span', {}, n.nom),
      el('span', { class: 'r19-valeur' }, n.confiance.estimation.toFixed(2).replace('.', ','))))
  }
  return liste
}

// ─── Cartouche (dessiné sur la feuille, coin bas droit, sous le schéma) ───────

function majCartouche(): void {
  const page = etat.page
  if (!page) return
  const s = vue.lecture.stats
  const niveau = NIVEAUX.find((n) => n.id === niveauDeStrategie(vue.strategie.id))?.nom ?? vue.strategie.nom
  const rev = String.fromCharCode(65 + ((revision - 1) % 26))
  const reduits = page.groupes.filter((g) => g.reduit).length
  const onglet = etatGroupes.onglet
  etat.cartouche = {
    titre: vue.jeu.titre,
    vue: onglet ? `Onglet · ${nomGroupe(vue.jeu, onglet).split('·')[0]!.trim()}` : 'Graphe principal',
    champs: [
      ['ÉLÉMENTS', `${vue.nU} / ${s.noeudsComplet}`],
      ['LIAISONS', `${s.aretes} / ${s.aretesComplet}`],
      ['GROUPES', onglet ? '1 (onglet)' : `${page.groupes.length} · ${reduits} réduit${reduits > 1 ? 's' : ''}`],
      ['NIVEAU', niveau],
      ['RÉV.', rev],
      ['ÉCHELLE', ''],
      ['DATE', new Date().toISOString().slice(0, 10)],
      ['SOURCE', vue.jeu.source === 'api' ? 'Atlas' : 'synthétique'],
    ],
  }
}

// ─── Disposition maison ──────────────────────────────────────────────────────

const appliquerDisposition = (d: Disposition, anime: boolean) =>
  (vue as unknown as { appliquerDisposition(d: Disposition, anime: boolean): void }).appliquerDisposition(d, anime)

function positionsPrecedentes(): Map<string, number> | undefined {
  const page = etat.page
  if (!page || !vue.lecture) return undefined
  const m = new Map<string, number>()
  const j = vue.justification
  // Chaque membre hérite de la hauteur de son unité : un sous-système s'ouvre « sur place ».
  for (let p = 0; p < Math.min(vue.nU, vue.disposition.nU); p++) {
    const u = vue.lecture.unites[p]
    if (!u) continue
    const y = -vue.disposition.z[p]! / page.echelle
    u.membres.forEach((mb, k) => m.set(j.noeuds[mb]!.id, y + k * 1e-3))
  }
  return m
}

/** Groupe, nœud-fonction, Entrée / Sortie de chaque unité (d'après la dérivation courante). */
function optionsGroupes(): OptionsGroupes {
  const g = vue.lecture
  const r = resultatDe(g)
  const noeuds = g.justification.noeuds
  const o: OptionsGroupes = {
    groupe: [], fonction: [], entree: [], sortie: [],
    onglet: r.onglet,
    ordre: vue.jeu.sousProblemes.map((s) => s.id),
    nom: (id) => nomGroupe(vue.jeu, id),
  }
  for (const u of g.unites) {
    const n = noeuds[u.conclusion]!
    const f = r.fonctions.get(n.id)
    o.groupe.push(horsGroupe(n) ? null : f ?? groupeDeNoeud(n))
    o.fonction.push(f !== undefined)
    o.entree.push(r.entrees.has(n.id))
    o.sortie.push(r.sorties.has(n.id))
  }
  return o
}

function recalculer(anime: boolean): void {
  const R = vue.reglages
  const { disposition, page } = mettreEnPage(vue.lecture, {
    largeurCarte: R.lire<number>('largeurCarte'),
    ecartColonnes: R.lire<number>('ecartColonnes'),
    ecartLignes: R.lire<number>('ecartLignes'),
    taillePolice: R.lire<number>('taillePolice'),
    maxPastilles: R.lire<number>('maxPastilles'),
    ecartCouches: R.valeurs.ecartCouches,
    police: vue.palette.police,
    precedent: anime ? positionsPrecedentes() : undefined,
    groupes: optionsGroupes(),
  })
  attribuerHypotheses(page)
  etat.page = page
  etat.survol = null
  revision++
  majMarges()
  appliquerDisposition(disposition, anime)
  if (cadrerApres) {
    cadrerApres = false
    vue.cadrerTout(anime ? undefined : 1)
  } else if (anime && horsEcran()) vue.cadrerTout()
  majPanneau()
  majCartouche()
  majOnglets()
}

/** Repères des hypothèses de modélisation présentes ; les épingles suivent les ids. */
function attribuerHypotheses(page: MiseEnPage): void {
  etat.hypotheses = new Map()
  etat.epingles = new Set()
  for (let p = 0; p < vue.lecture.unites.length; p++) {
    const b = page.boites[p]!
    if (b.genre !== 'drapeau') continue
    etat.hypotheses.set(p, b.ref)
    if (epinglesIds.has(vue.justification.noeuds[vue.lecture.unites[p]!.conclusion]!.id)) etat.epingles.add(p)
  }
}

/** Marges de cadrage : la feuille entière est cadrée (voir cadrerTout) ; place des onglets en haut. */
function majMarges(): void {
  vue.margesSures = { gauche: 0, droite: -150, haut: 34, bas: 0 }
}

/** Vrai si une partie des unités sort de l'écran après une transition. */
function horsEcran(): boolean {
  const d = vue.disposition
  const cam = vue.camera
  for (let p = 0; p < d.nU; p++) {
    const q = cam.projeterPoint([d.x[p]!, 0, d.z[p]!])
    if (q.x < 40 || q.x > cam.largeur - 40 || q.y < 60 || q.y > cam.hauteur - 60) return true
  }
  return false
}

// La vue appelle `redisposer` à chaque nouvelle dérivation ou réglage de disposition.
vue.redisposer = async () => recalculer(true)

// Cadrage 2D : la feuille entière (règle en haut, cartouche en bas à droite), pas seulement les ancres.
const cadrerToutDefaut = vue.cadrerTout.bind(vue)
vue.cadrerTout = (duree?: number) => {
  const page = etat.page
  if (!page || vue.extrusion > 0.02 || vue.reglages.valeurs.liensComplets) return cadrerToutDefaut(duree)
  const E = page.echelle
  const f = page.feuille
  const pos = new Float32Array([(f.x0 - page.cx) * E, 0, -(f.y0 - page.cy) * E, (f.x1 - page.cx) * E, 0, -(f.y1 - page.cy) * E])
  vue.camera.cadrer(pos, [0, 1], duree ?? vue.reglages.valeurs.dureeTransition, 1.03, vue.zoneSure())
  vue.demanderRendu()
}

// ─── Survol : cibles dessinées (blocs, bornes, spécifications, barres de titre) ─

vue.pointSous = (x: number, y: number) => {
  const c = cibleSous(etat, x, y)
  const avant = etat.survol
  etat.survol = c
  const change = avant?.genre !== c?.genre || avant?.noeud !== c?.noeud || avant?.point !== c?.point || avant?.groupe !== c?.groupe
  if (change && ['pastille', 'renvoi', 'titre', 'ouvrir'].some((g) => avant?.genre === g || c?.genre === g)) vue.demanderRendu()
  vue.scene.style.cursor = c?.genre === 'titre' || c?.genre === 'ouvrir' ? 'pointer' : ''
  if (!c || c.genre === 'titre' || c.genre === 'ouvrir') return null
  if (c.genre === 'pastille') return vue.pointDeNoeud(c.noeud)
  return c.point
}

// Clic : spécification → épingler ; barre de titre → réduire / déployer ; « OUVRIR ↗ » → onglet.
const selectionnerDefaut = vue.selectionner.bind(vue)
let dernierBasculement = { groupe: '', t: 0 }
vue.selectionner = (p: number | null) => {
  const sv = etat.survol
  if (p === null && sv?.groupe && sv.genre === 'titre') {
    // Le second clic d'un double-clic ne rebascule pas le groupe.
    const t = performance.now()
    if (dernierBasculement.groupe === sv.groupe && t - dernierBasculement.t < 450) return
    dernierBasculement = { groupe: sv.groupe, t }
    return basculerReduction(sv.groupe)
  }
  if (p === null && sv?.groupe && sv.genre === 'ouvrir') return ouvrirOnglet(sv.groupe)
  if (p !== null && p < vue.nU && etat.page?.boites[p]?.genre === 'drapeau' && sv?.genre === 'drapeau') {
    basculerEpingle(vue.noeud(p).id)
    return
  }
  selectionnerDefaut(p)
}

function basculerEpingle(id: string, etatVoulu?: boolean): void {
  const actif = etatVoulu ?? !epinglesIds.has(id)
  if (actif) epinglesIds.add(id)
  else epinglesIds.delete(id)
  epinglesIds = new Set(epinglesIds)
  if (etat.page) attribuerHypotheses(etat.page)
  majPanneau()
  vue.demanderRendu()
}

// ─── Réduction des groupes (Collapse to Function) et onglets ─────────────────

/** Réduit ou redéploie un groupe ; à la réduction, les anciens blocs se resserrent vers la fonction. */
function basculerReduction(g: string, voulu?: boolean): void {
  const reduire = voulu ?? !etatGroupes.reduits.has(g)
  if (reduire === etatGroupes.reduits.has(g)) return
  const page = etat.page
  if (reduire) {
    etatGroupes.reduits.add(g)
    const gr = page?.groupes.find((x) => x.id === g)
    if (page && gr && gr.points.length > 1) {
      etat.fantomes = {
        debut: performance.now(),
        duree: vue.reglages.valeurs.dureeTransition,
        groupe: g,
        couleur: teinteGroupe(vue.jeu, g),
        boites: gr.points.map((p) => ({ x: vue.positions[p * 3]!, z: vue.positions[p * 3 + 2]!, w: page.boites[p]!.w, h: page.boites[p]!.h })),
      }
    }
  } else {
    etatGroupes.reduits.delete(g)
    etat.fantomes = null
  }
  etat.survol = null
  vue.definirStrategie(vue.strategie)
}

function toutBasculer(reduire: boolean): void {
  if (!etat.page) return
  const ids = vue.jeu.sousProblemes.map((s) => s.id)
  if (reduire) for (const id of ids) etatGroupes.reduits.add(id)
  else etatGroupes.reduits.clear()
  etat.fantomes = null
  vue.definirStrategie(vue.strategie)
}

function ouvrirOnglet(g: string): void {
  if (etatGroupes.onglet === g) return
  etatGroupes.onglet = g
  etat.survol = null
  etat.fantomes = null
  cadrerApres = true
  vue.definirStrategie(vue.strategie)
}

function fermerOnglet(): void {
  if (!etatGroupes.onglet) return
  etatGroupes.onglet = null
  etat.survol = null
  cadrerApres = true
  vue.definirStrategie(vue.strategie)
}

// Barre d'onglets et fil d'Ariane (comme les onglets de graphes d'Unreal), sous la barre d'outils.
const barreOnglets = el('nav', { class: 'r19-onglets', 'aria-label': 'Onglets de graphe' })
vue.interface.append(barreOnglets)

function majOnglets(): void {
  const onglet = etatGroupes.onglet
  const racine = vue.jeu.titre.split('(')[0]!.trim()
  const principal = el('button', { type: 'button', class: `r19-onglet${onglet ? '' : ' actif'}`, onclick: () => fermerOnglet() },
    el('span', { class: 'r19-onglet-glyphe' }, '▦'), racine)
  const enfants: HTMLElement[] = [principal]
  if (onglet) {
    const c = teinteGroupe(vue.jeu, onglet)
    const fermer = el('span', { class: 'r19-onglet-fermer', title: 'Fermer l’onglet', onclick: (e: Event) => {
      e.stopPropagation()
      fermerOnglet()
    } }, '×')
    const o = el('button', { type: 'button', class: 'r19-onglet actif' },
      el('span', { class: 'r19-onglet-glyphe', style: `color: ${COULEUR_FONCTION}` }, 'ƒ'), nomGroupe(vue.jeu, onglet), fermer)
    o.style.borderTopColor = c
    enfants.push(o)
  }
  const ariane = el('div', { class: 'r19-ariane' },
    onglet
      ? [el('a', { href: '#', onclick: (e: Event) => {
          e.preventDefault()
          fermerOnglet()
        } }, racine), el('span', { class: 'r19-ariane-sep' }, '›'), el('span', {}, nomGroupe(vue.jeu, onglet))]
      : [el('span', {}, racine), el('span', { class: 'r19-ariane-sep' }, '›'), el('span', { class: 'rsn-doux' }, 'graphe principal')])
  barreOnglets.replaceChildren(el('div', { class: 'r19-onglets-liste' }, enfants), ariane)
}

// ─── Double-clic : sous-système sur place, onglet d'un nœud-fonction ──────────

function dansDeplie(v: VueRaisonnement, p: number): string | null {
  const j = v.justification
  const u = v.lecture.unites[p]
  if (!u) return null
  const ids = u.membres.map((m) => j.noeuds[m]!.id)
  let trouve: string | null = null
  for (const [tete, membres] of etatSquelette.deplies) {
    if (ids.some((id) => id === tete || membres.includes(id))) trouve = tete
  }
  return trouve
}

function deplier(p: number): void {
  const u = vue.lecture.unites[p]!
  const j = vue.justification
  const id = j.noeuds[u.conclusion]!.id
  etatSquelette.ouvertes.add(id)
  etatSquelette.deplies.set(id, u.membres.map((m) => j.noeuds[m]!.id).filter((x) => x !== id))
  vue.definirStrategie(vue.strategie)
}

function replier(tete: string): void {
  const membres = etatSquelette.deplies.get(tete) ?? []
  for (const m of membres) if (etatSquelette.deplies.has(m)) replier(m)
  etatSquelette.ouvertes.delete(tete)
  etatSquelette.deplies.delete(tete)
}

function doubleClic(x: number, y: number): void {
  const p = vue.pointSous(x, y)
  if (p === null) {
    if (etat.survol?.genre === 'titre' || etat.survol?.genre === 'ouvrir') return
    return vue.cadrerTout()
  }
  if (p < vue.nU) {
    const b = etat.page?.boites[p]
    if (b?.genre === 'fonction' && b.groupe) return ouvrirOnglet(b.groupe)
    if (b?.genre === 'entree' || b?.genre === 'sortie') return fermerOnglet()
    const u = vue.lecture.unites[p]!
    if (u.membres.length > 1) return deplier(p)
    const tete = dansDeplie(vue, p)
    if (tete) {
      replier(tete)
      vue.definirStrategie(vue.strategie)
      return
    }
  }
  vue.selectionner(p)
  vue.cadrerSelection()
}

vue.sigma.removeAllListeners('doubleClickNode')
vue.sigma.removeAllListeners('doubleClickStage')
const surDoubleClic = (e: { event: { x: number; y: number; preventSigmaDefault(): void }; preventSigmaDefault(): void }) => {
  e.preventSigmaDefault()
  e.event.preventSigmaDefault()
  doubleClic(e.event.x, e.event.y)
}
vue.sigma.on('doubleClickNode', surDoubleClic)
vue.sigma.on('doubleClickStage', surDoubleClic)

// ─── Niveau de détail et réglages ────────────────────────────────────────────

function definirNiveau(n: Niveau): void {
  if (vue.reglages.lire<string>('niveau') !== n) return vue.reglages.definir('niveau', n)
  if (vue.strategie.id === STRATEGIE_NIVEAU[n]) return
  cadrerApres = true
  vue.definirStrategie(STRATEGIE_NIVEAU[n])
}

vue.on('reglage', ({ cle, valeur }) => {
  if (cle === 'niveau') definirNiveau(valeur as Niveau)
  else if (['largeurCarte', 'ecartColonnes', 'ecartLignes', 'taillePolice', 'maxPastilles', 'ecartCouches'].includes(cle)) {
    cadrerApres = cle !== 'maxPastilles'
    recalculer(true)
  } else if (cle === 'cartouche') vue.demanderRendu()
  else if (cle === 'strategie') cadrerApres = true
  else if (cle === 'liensComplets') window.setTimeout(() => vue.cadrerTout(), 30)
})
vue.on('lecture', () => {
  const n = niveauDeStrategie(vue.strategie.id)
  if (n && vue.reglages.lire<string>('niveau') !== n) {
    ;(vue.reglages.valeurs as unknown as Record<string, string>).niveau = n
    vue.reglages.pane?.refresh()
  }
  cadrerApres ||= !n
})
vue.on('theme', () => {
  etat.palette = lirePaletteR19(vue.racine)
})
etat.palette = lirePaletteR19(vue.racine)

// ─── Panneau ☰ ───────────────────────────────────────────────────────────────

function construirePanneau(v: VueRaisonnement): HTMLElement {
  corpsPanneau = el('div', { class: 'r19-panneau' })
  void v
  return corpsPanneau
}

function majPanneau(): void {
  if (!corpsPanneau || !etat.page) return
  const v = vue
  const page = etat.page
  const niveau = niveauDeStrategie(v.strategie.id)
  const compte = { blocs: 0, fonctions: 0, decisions: 0, hypotheses: 0, rejetees: 0, bornes: 0, renvois: 0 }
  for (let p = 0; p < v.nU; p++) {
    const b = page.boites[p]!
    if (b.genre === 'drapeau') compte.hypotheses++
    else if (b.genre === 'decision') {
      compte.decisions++
      if (b.impasse) compte.rejetees++
    } else {
      compte.blocs++
      if (b.genre === 'fonction') compte.fonctions++
    }
    compte.bornes += b.pastilles.length
    compte.renvois += b.renvois.length
  }
  const s = v.lecture.stats
  const r = resultatDe(v.lecture)
  const boutons = el('div', { class: 'r19-niveaux' }, NIVEAUX.map((n) =>
    el('button', { type: 'button', class: `rsn-bouton${n.id === niveau ? ' actif' : ''}`, onclick: () => definirNiveau(n.id) }, n.nom)))
  const ligne = (k: string, val: string | number) => el('div', { class: 'r19-ligne' }, el('span', {}, k), el('span', { class: 'r19-valeur' }, String(val)))
  // Groupes : un par sous-problème présent, avec réduire / déployer et ouvrir.
  const presents = new Map(page.groupes.map((g) => [g.id, g]))
  const groupes = v.jeu.sousProblemes.filter((sp) => presents.has(sp.id) || etatGroupes.onglet === sp.id).map((sp) => {
    const gr = presents.get(sp.id)
    const n = gr?.points.reduce((t, p) => t + (v.lecture.unites[p]?.membres.length ?? 1), 0) ?? 0
    const reduit = etatGroupes.reduits.has(sp.id) && !r.refus.has(sp.id)
    const pastille = el('span', { class: 'r19-teinte' })
    pastille.style.background = teinteGroupe(v.jeu, sp.id)
    return el('div', { class: 'r19-groupe' },
      pastille,
      el('span', { class: 'r19-groupe-nom', title: sp.resume }, sp.nom),
      el('span', { class: 'r19-valeur' }, String(n)),
      etatGroupes.onglet
        ? el('span', {})
        : el('button', { type: 'button', class: 'rsn-bouton', disabled: r.refus.has(sp.id), title: r.refus.get(sp.id) ?? '', onclick: () => basculerReduction(sp.id) }, reduit ? 'Déployer' : 'Réduire'),
      el('button', { type: 'button', class: 'rsn-bouton', onclick: () => (etatGroupes.onglet === sp.id ? fermerOnglet() : ouvrirOnglet(sp.id)) }, etatGroupes.onglet === sp.id ? 'Fermer' : 'Ouvrir ↗'))
  })
  const hyps = [...etat.hypotheses].map(([p, ref]) => {
    const n = v.noeud(p)
    const c = el('input', { type: 'checkbox' }) as HTMLInputElement
    c.checked = etat.epingles.has(p)
    c.addEventListener('change', () => basculerEpingle(n.id, c.checked))
    return el('label', { class: 'r19-hyp' }, c,
      el('span', { class: 'r19-ref' }, ref),
      el('span', { class: 'r19-hyp-nom' }, n.nom),
      el('span', { class: 'r19-valeur' }, `→${page.portees.get(p)?.filter((q) => q < v.nU).length ?? 0}`))
  })
  const familles = (['deduction', 'empirique', 'calcul', 'conjecture', 'resultat', 'fonction'] as Famille[]).map((f) => {
    const t = el('span', { class: 'r19-teinte r19-teinte-pleine' })
    t.style.background = COULEURS_FAMILLE[f]
    return el('div', { class: 'r19-famille' }, t, NOMS_FAMILLE[f])
  })
  corpsPanneau.replaceChildren(
    el('div', { class: 'rsn-doux rsn-petit' }, 'Niveau de détail'),
    boutons,
    el('div', { class: 'rsn-groupe-titre' }, etatGroupes.onglet ? 'Groupes (onglet ouvert)' : 'Groupes (boîtes « Comment »)'),
    el('div', { class: 'r19-groupes' }, groupes),
    etatGroupes.onglet
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => fermerOnglet() }, '← Graphe principal')
      : el('div', { class: 'r19-niveaux' },
          el('button', { type: 'button', class: 'rsn-bouton', onclick: () => toutBasculer(true) }, 'Tout réduire'),
          el('button', { type: 'button', class: 'rsn-bouton', onclick: () => toutBasculer(false) }, 'Tout déployer')),
    el('div', { class: 'r19-nomenclature' },
      ligne('Éléments visibles / nœuds', `${v.nU} / ${s.noeudsComplet}`),
      ligne('Liaisons / arêtes', `${s.aretes} / ${s.aretesComplet}`),
      ligne('Blocs (B) · dont fonctions', `${compte.blocs} · ${compte.fonctions}`),
      ligne('Décisions (D) · alternatives NC', `${compte.decisions} · ${compte.rejetees}`),
      ligne('Hypothèses (H)', compte.hypotheses),
      ligne('Bornes · renvois', `${compte.bornes} · ${compte.renvois}`),
      ligne('Jonctions', page.jonctions.length),
    ),
    etatSquelette.deplies.size
      ? el('button', { type: 'button', class: 'rsn-bouton', onclick: () => {
          etatSquelette.ouvertes.clear()
          etatSquelette.deplies.clear()
          v.definirStrategie(v.strategie)
        } }, `Refermer les sous-systèmes (${etatSquelette.deplies.size})`)
      : el('div', { class: 'rsn-doux rsn-petit' }, 'Double-clic sur un sous-système (contour doublé) pour l’ouvrir sur place.'),
    el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de modélisation (épingler)'),
    el('div', { class: 'r19-liste-hyp' }, hyps),
    el('div', { class: 'rsn-groupe-titre' }, 'Légende'),
    el('div', { class: 'r19-familles' }, familles),
    el('div', { class: 'r19-legende' },
      el('div', {}, el('b', {}, 'Boîte « Comment »'), ' : un sous-problème. Clic sur sa barre de titre : réduire en fonction / déployer ; « OUVRIR ↗ » : onglet.'),
      el('div', {}, el('b', {}, 'Nœud-fonction'), ' : ▶ broche d’entrée (liaison venant de l’extérieur), ● broche de sortie (énoncé utilisé à l’extérieur) ; trait = statut le plus faible du groupe, jauge = maillon le plus faible.'),
      el('div', {}, el('b', {}, 'Trait continu'), ' validé · ', el('b', {}, 'tireté'), ' à vérifier · ', el('b', {}, 'barré'), ' réfuté · ', el('b', {}, 'pointillé gris'), ' piste abandonnée.'),
      el('div', {}, el('b', {}, 'En-tête'), ' : repère (B, D, H), type, validation (H, IA, IA+H), couleur de la famille.'),
      el('div', {}, el('b', {}, 'Jauge'), ' : confiance sur 0–1, barre = intervalle, index = estimation.'),
      el('div', {}, el('b', {}, 'Point plein'), ' : jonction (une sortie alimente plusieurs blocs).'),
      el('div', {}, el('b', {}, 'Pentagone'), ' : renvoi vers un bloc plus en amont, cité par son repère.'),
      el('div', {}, el('b', {}, 'Bornes'), ' : contexte (H hypothèse, D définition, O outil, A axiome, L littérature, + auxiliaire).'),
      el('div', {}, el('b', {}, 'Losange'), ' : décision ; ', el('b', {}, '× NC'), ' : alternative rejetée, non connectée.'),
      el('div', {}, el('b', {}, '⊢ H1'), ' : le bloc dépend de l’hypothèse H1 (survol ou épingle, en bleu).'),
    ),
  )
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

{
  const n = vue.reglages.lire<string>('niveau') as Niveau
  if (STRATEGIE_NIVEAU[n] && vue.strategie.id !== STRATEGIE_NIVEAU[n]) vue.definirStrategie(STRATEGIE_NIVEAU[n])
  else recalculer(false)
}

// Convention : le script de capture lit window.rsnVue.
;(window as unknown as { rsnVue: typeof vue; r19: EtatRendu; r19Groupes: typeof etatGroupes }).rsnVue = vue
;(window as unknown as { r19: EtatRendu }).r19 = etat
;(window as unknown as { r19Groupes: typeof etatGroupes }).r19Groupes = etatGroupes

// Sélecteur de jeu, sous le lien vers le catalogue.
{
  const choix = el('select', { class: 'r19-jeu-choix', 'aria-label': 'Raisonnement affiché' }) as HTMLSelectElement
  for (const [cle, libelle] of Object.entries(JEUX)) choix.append(new Option(libelle, cle, false, cle === jeuChoisi))
  choix.addEventListener('change', () => {
    const url = new URL(location.href)
    if (choix.value === 'fontaine') url.searchParams.delete('jeu')
    else url.searchParams.set('jeu', choix.value)
    location.href = url.toString()
  })
  document.body.append(el('label', { class: 'r19-jeu' }, el('span', {}, 'JEU'), choix))
}
