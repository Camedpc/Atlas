// V6 · Corolles — les agrégats sont des diagrammes : un anneau dit leur composition
// (statuts, validation) sans qu'on les survole ; les enfants éclosent en corolle.

import {
  creerVue, el, formaterDate, formaterDateCourte, formaterNombre, genererJeuSynthetique, rgba,
  LIBELLES_STATUT, LIBELLES_VALIDATION, NOMS_NIVEAUX, STATUTS, TRAJECTOIRES, VALIDATIONS,
  statistiquesCategorie,
  type DefinitionReglage, type JeuDonnees, type PanneauGauche, type Palette, type ReducteurNoeud, type VueGraphe,
} from '../../src/core'
import { Anneaux } from './anneaux'
import { communautes } from './communautes'
import { Corolle, type FormeTrajectoire } from './corolle'
import meta from './meta.json'

const DOSSIER_ANNEAUX = 'Corolles · anneaux'
const DOSSIER_ECLOSION = 'Corolles · éclosion'
const DOSSIER_SURVOL = 'Corolles · survol'
const DOSSIER_REGROUPEMENT = 'Corolles · regroupement'

const REGLAGES: DefinitionReglage[] = [
  { cle: 'tailleAnneau', defaut: 2.6, dossier: DOSSIER_ANNEAUX, libelle: 'rayon ∝ √n', min: 0.5, max: 8, pas: 0.05 },
  { cle: 'rayonMin', defaut: 7, dossier: DOSSIER_ANNEAUX, libelle: 'rayon minimal', min: 2, max: 30, pas: 0.5 },
  { cle: 'epaisseurAnneau', defaut: 0.26, dossier: DOSSIER_ANNEAUX, libelle: 'épaisseur statuts', min: 0.06, max: 0.7, pas: 0.01 },
  { cle: 'epaisseurValidation', defaut: 0.07, dossier: DOSSIER_ANNEAUX, libelle: 'épaisseur validation', min: 0, max: 0.25, pas: 0.005 },
  { cle: 'ecartAnneaux', defaut: 1.5, dossier: DOSSIER_ANNEAUX, libelle: 'écart entre anneaux', min: 0, max: 6, pas: 0.1 },
  { cle: 'ecartSecteurs', defaut: 2.5, dossier: DOSSIER_ANNEAUX, libelle: 'écart secteurs (°)', min: 0, max: 15, pas: 0.1 },
  { cle: 'teinteCentre', defaut: 0.07, dossier: DOSSIER_ANNEAUX, libelle: 'teinte du centre', min: 0, max: 0.4, pas: 0.01 },
  { cle: 'ombreAnneaux', defaut: 0.6, dossier: DOSSIER_ANNEAUX, libelle: 'ombre portée', min: 0, max: 2, pas: 0.05 },
  { cle: 'nomCentre', defaut: true, dossier: DOSSIER_ANNEAUX, libelle: 'nom des agrégats' },
  { cle: 'tailleNom', defaut: 11.5, dossier: DOSSIER_ANNEAUX, libelle: 'taille du nom', min: 8, max: 18, pas: 0.5 },
  { cle: 'seuilNom', defaut: 13, dossier: DOSSIER_ANNEAUX, libelle: 'nom dessous si rayon ≥', min: 0, max: 60, pas: 1 },
  { cle: 'seuilCompact', defaut: 10, dossier: DOSSIER_ANNEAUX, libelle: 'compact si rayon <', min: 0, max: 24, pas: 0.5 },
  { cle: 'rubans', defaut: true, dossier: DOSSIER_ANNEAUX, libelle: 'rubans (vues face / droite)' },
  { cle: 'hauteurRuban', defaut: 22, dossier: DOSSIER_ANNEAUX, libelle: 'hauteur des rubans', min: 4, max: 40, pas: 0.5 },
  { cle: 'eviterChevauchement', defaut: 0.9, dossier: DOSSIER_ANNEAUX, libelle: 'anti-chevauchement', min: 0, max: 1, pas: 0.05 },
  { cle: 'bordureValidation', defaut: true, dossier: DOSSIER_ANNEAUX, libelle: 'feuilles : bordure = validation' },
  { cle: 'grille', defaut: true, dossier: DOSSIER_ANNEAUX, libelle: 'fond pointillé' },

  { cle: 'formeEclosion', defaut: 'corolle', dossier: DOSSIER_ECLOSION, libelle: 'trajectoire', options: { corolle: 'corolle', ...Object.fromEntries(Object.keys(TRAJECTOIRES).map((k) => [k, k])) } },
  { cle: 'ordreEclosion', defaut: 'statut', dossier: DOSSIER_ECLOSION, libelle: 'ordre', options: { statut: 'statut', date: 'date', validation: 'validation', confiance: 'confiance' } },
  { cle: 'amplitudeCorolle', defaut: 1, dossier: DOSSIER_ECLOSION, libelle: 'amplitude', min: 0, max: 3, pas: 0.05 },
  { cle: 'arcCorolle', defaut: 360, dossier: DOSSIER_ECLOSION, libelle: 'arc (°)', min: 30, max: 360, pas: 5 },
  { cle: 'phaseCorolle', defaut: 0.45, dossier: DOSSIER_ECLOSION, libelle: 'part « pétales »', min: 0.1, max: 0.9, pas: 0.01 },
  { cle: 'decalageEclosion', defaut: 0.12, dossier: DOSSIER_ECLOSION, libelle: 'décalage (cascade)', min: 0, max: 0.5, pas: 0.01 },
  { cle: 'seuilCorolle', defaut: 3, dossier: DOSSIER_ECLOSION, libelle: 'corolle si ≤ n agrégats', min: 0, max: 20, pas: 1 },
  { cle: 'vagueGlobale', defaut: 0.35, dossier: DOSSIER_ECLOSION, libelle: 'vague (ouverture globale)', min: 0, max: 0.8, pas: 0.01 },
  { cle: 'deroulement', defaut: 1, dossier: DOSSIER_ECLOSION, libelle: 'déroulé du parent', min: 0, max: 3, pas: 0.05 },

  { cle: 'detacheSurvol', defaut: 4, dossier: DOSSIER_SURVOL, libelle: 'détachement secteurs (px)', min: 0, max: 16, pas: 0.5 },
  { cle: 'apercuSecteur', defaut: true, dossier: DOSSIER_SURVOL, libelle: 'aperçu des nœuds repliés' },
  { cle: 'violon', defaut: true, dossier: DOSSIER_SURVOL, libelle: 'violon de confiance' },
  { cle: 'largeurViolon', defaut: 130, dossier: DOSSIER_SURVOL, libelle: 'largeur violon', min: 60, max: 260, pas: 1 },

  { cle: 'regroupement', defaut: 'categories', dossier: DOSSIER_REGROUPEMENT, libelle: 'agréger par', options: { catégories: 'categories', 'communautés (Louvain)': 'communautes' } },
  { cle: 'resolutionLouvain', defaut: 1, dossier: DOSSIER_REGROUPEMENT, libelle: 'résolution Louvain', min: 0.1, max: 4, pas: 0.05 },
  { cle: 'liensSession', defaut: 0.5, dossier: DOSSIER_REGROUPEMENT, libelle: 'poids liens de session', min: 0, max: 3, pas: 0.05 },
]

const CLE_STOCKAGE = `atlas-graphe3d:${meta.id}`
const TRANSPARENT = 'rgba(0,0,0,0)'

// ─── Données : catégories ou communautés ─────────────────────────────────────

let jeuBase: JeuDonnees | null = null
const cacheCommunautes = new Map<string, { jeu: JeuDonnees; nb: [number, number, number]; ms: number }>()

function lireStocke(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(CLE_STOCKAGE) ?? '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Itération 1 : l'ancien moteur enregistrait toutes les valeurs, y compris nos anciens défauts
 * (1 200 ms, courbe douce, cascade 0,3). On les oublie pour que les nouveaux défauts s'appliquent.
 */
function migrerReglages(): void {
  try {
    const s = lireStocke()
    const anciens: Record<string, unknown> = { dureeTransition: 1200, courbe: 'douce', decalageEclosion: 0.3 }
    let change = false
    for (const [k, v] of Object.entries(anciens)) if (s[k] === v) (delete s[k], (change = true))
    if (change) localStorage.setItem(CLE_STOCKAGE, JSON.stringify(s))
  } catch {
    // stockage indisponible : rien à migrer
  }
}
migrerReglages()

function donnees(): { jeu: JeuDonnees; info: string } {
  jeuBase ??= genererJeuSynthetique()
  const s = lireStocke()
  if (s.regroupement !== 'communautes') return { jeu: jeuBase, info: 'Catégories du jeu (domaine › thème › sous-thème)' }
  const resolution = typeof s.resolutionLouvain === 'number' ? s.resolutionLouvain : 1
  const poidsSession = typeof s.liensSession === 'number' ? s.liensSession : 0.5
  const cle = `${resolution}|${poidsSession}`
  let r = cacheCommunautes.get(cle)
  if (!r) {
    const t0 = performance.now()
    const c = communautes(jeuBase, { resolution, poidsSession })
    r = { jeu: c.jeu, nb: c.nbParNiveau, ms: performance.now() - t0 }
    cacheCommunautes.set(cle, r)
  }
  return { jeu: r.jeu, info: `Communautés Louvain (résolution ${formaterNombre(resolution)}) : ${r.nb[0]} › ${r.nb[1]} › ${r.nb[2]} groupes, calculées en ${Math.round(r.ms)} ms` }
}

// ─── Montage ─────────────────────────────────────────────────────────────────

interface EtatMontage {
  granularite?: number
  panneauOuvert?: boolean
  mode?: '2d' | '3d'
}

let vueCourante: VueGraphe | null = null

function monter(etat: EtatMontage = {}): VueGraphe {
  const { jeu, info } = donnees()
  const communaute = jeu !== jeuBase
  // Références créées après la vue (le moteur a besoin des options avant).
  let anneaux: Anneaux | null = null
  let corolle: Corolle | null = null
  // Rayon maximal (px) de chaque agrégat pour ne pas mordre sur ses voisins (image précédente).
  let plafond: Float32Array | null = null

  const reducteur: ReducteurNoeud = (i, a, v) => {
    if (!anneaux) return
    const R = v.reglages.valeurs
    if (i.estAgregat) {
      a.taille = anneaux.rayon(i.nbFeuilles) * (R.taillePerspective ? Math.max(0.15, i.echelle) : 1)
      const k = v.reglages.lire<number>('eviterChevauchement')
      // Au survol, l'anneau reprend sa taille naturelle (lisible même en zone dense).
      if (k > 0 && plafond && plafond[i.unite]! > 0 && i.survol !== 'survole') a.taille = Math.min(a.taille, a.taille * (1 - k) + plafond[i.unite]! * k)
      a.libelle = null
      a.forceLibelle = false
      // Le nœud sigma reste là pour le pointage, mais invisible : l'anneau est dessiné au-dessus.
      a.extra = { color: TRANSPARENT, couleurBordure: TRANSPARENT }
      return
    }
    const n = i.noeud!
    // Pendant une corolle locale, les feuilles qui éclosent sont affichées franchement
    // (la part visible du moteur les laisserait pâles jusqu'à mi-parcours).
    if (corolle && i.alpha > 0 && i.alpha < 1 && i.survol !== 'autre' && i.lignee !== 'hors' && corolle.corolleComplete(v.h.chaine[i.unite * 3 + 2]!)) {
      a.opacite = Math.max(a.opacite, Math.sqrt(i.alpha) * (a.opacite / Math.max(1e-3, i.alpha)))
    }
    if (i.lignee === 'aucune' && v.reglages.lire<boolean>('bordureValidation')) {
      const val = n.validation
      a.couleurBordure = val === 'aucune' ? v.palette.bordureNoeud : v.palette.validation[val]
      a.tailleBordure = val === 'aucune' ? 0.12 : val === 'ia_humain' ? 0.42 : val === 'humain' ? 0.3 : 0.22
    }
    if (anneaux.secteur) {
      if (anneaux.feuillesSecteur.has(i.unite)) {
        a.taille *= 1.35
        a.opacite = Math.max(a.opacite, i.alpha)
        a.zIndex += 6000
        a.surligne = true
      } else a.opacite *= 0.35
    }
  }

  const vue = creerVue(document.getElementById('app')!, {
    id: meta.id,
    donnees: jeu,
    mode: etat.mode ?? '2d',
    vueInitiale: 'dessus',
    granularite: etat.granularite ?? 1,
    reglages: { dureeTransition: 700, courbe: 'sortie', opaciteAretes: 0.22 },
    etenduesParDefaut: false,
    dessinerDessous: (c) => anneaux?.dessinerRubans(c),
    reglagesSupplementaires: REGLAGES,
    trajectoire: (p) => (corolle ? corolle.trajectoire(p) : TRAJECTOIRES.droite(p)),
    reducteursNoeud: [reducteur],
    dessinerDessus: (c) => {
      if (!anneaux) return
      anneaux.dessiner(c)
      if (c.vue.reglages.lire<boolean>('violon')) {
        const s = c.vue.survol, sel = c.vue.lignee.selection
        if (sel !== null && sel < c.vue.h.nF && sel !== s) anneaux.dessinerViolon(c, sel)
        if (s !== null && s < c.vue.h.nF) anneaux.dessinerViolon(c, s)
      }
    },
    rendreFiche: (u, v, defaut) => (u < v.h.nF ? defaut() : ficheAgregat(v, u)),
    ui: { panneauOuvert: etat.panneauOuvert ?? false },
    panneau: (p, v) => amenagerPanneau(p, v, info, communaute),
  })
  vue.racine.classList.add('v6')
  vue.racine.classList.toggle('v6-grille', vue.reglages.lire<boolean>('grille'))

  anneaux = new Anneaux(vue)
  corolle = new Corolle(vue, (n) => anneaux!.rayon(n))
  const appliquerEclosion = () => {
    corolle!.forme = vue.reglages.lire<FormeTrajectoire>('formeEclosion')
    corolle!.phase = vue.reglages.lire<number>('phaseCorolle')
    corolle!.decalage = vue.reglages.lire<number>('decalageEclosion')
    corolle!.vague = vue.reglages.lire<number>('vagueGlobale')
    corolle!.seuilCorolle = vue.reglages.lire<number>('seuilCorolle')
    vue.granularite.version++
    vue.demanderRendu()
  }
  appliquerEclosion()

  // Survol d'un secteur : suivi du pointeur sur l'agrégat survolé.
  const majSecteur = (x: number, y: number) => {
    const u = vue.survol
    const s = u !== null && u >= vue.h.nF ? anneaux!.secteurSous(u, x, y) : null
    if (anneaux!.definirSecteur(s)) {
      // La bulle et les graines disent l'essentiel : on efface la fiche pour ne pas les masquer.
      const f = vue.ui.fiche?.element
      if (f) f.style.opacity = s ? '0' : ''
      vue.demanderRendu()
    }
  }
  vue.scene.addEventListener('pointermove', (e) => {
    const r = vue.scene.getBoundingClientRect()
    majSecteur(e.clientX - r.left, e.clientY - r.top)
  })
  vue.on('survol', ({ unite }) => {
    if (unite === null || unite < vue.h.nF) anneaux!.definirSecteur(null)
    else majSecteur(vue.controles.souris.x, vue.controles.souris.y)
    vue.demanderRendu()
  })
  plafond = new Float32Array(vue.h.nU)
  const calculerPlafonds = (): boolean => {
    const { h, projection: p, granularite: g } = vue
    const vis: number[] = []
    for (let u = h.nF; u < h.nU; u++) if (g.alpha[u]! > 0.3 && p.visible[u]) vis.push(u)
    let change = false
    for (const u of vis) {
      let dmin = Infinity
      for (const w of vis) {
        if (w === u) continue
        const d = Math.hypot(p.x[u]! - p.x[w]!, p.y[u]! - p.y[w]!)
        if (d < dmin) dmin = d
      }
      // Deux voisins se partagent la distance ; 3 px d'air entre les anneaux.
      const cap = dmin === Infinity ? 0 : Math.max(5, dmin / 2 - 3)
      if (Math.abs(cap - plafond![u]!) > 0.5) change = true
      plafond![u] = cap
    }
    return change
  }
  vue.on('image', ({ dt }) => {
    corolle!.observer()
    const encore = anneaux!.avancer(dt)
    if (calculerPlafonds() || encore) vue.demanderRendu()
  })
  vue.on('filtres', () => {
    anneaux!.recompter()
    corolle!.invalider()
    vue.demanderRendu()
  })

  const reconstruire = new Set(['regroupement', 'resolutionLouvain', 'liensSession'])
  const tailles = new Set(['ordreEclosion', 'arcCorolle', 'amplitudeCorolle', 'rayonMin', 'tailleAnneau', 'tailleNoeud', 'tailleImportance'])
  vue.on('reglage', ({ cle }) => {
    if (reconstruire.has(cle)) return planifierReconstruction()
    if (tailles.has(cle)) corolle!.invalider()
    if (['formeEclosion', 'phaseCorolle', 'decalageEclosion', 'vagueGlobale', 'seuilCorolle'].includes(cle)) appliquerEclosion()
    if (cle === 'grille') vue.racine.classList.toggle('v6-grille', vue.reglages.lire<boolean>('grille'))
  })

  // Bascule de thème dans la barre de vues.
  const barre = vue.ui.barre?.element
  if (barre) {
    const b = el('button', { type: 'button', title: 'Thème clair / sombre' })
    const maj = () => (b.textContent = vue.reglages.valeurs.theme === 'clair' ? '◐ Sombre' : '◑ Clair')
    b.addEventListener('click', () => vue.definirTheme(vue.reglages.valeurs.theme === 'clair' ? 'sombre' : 'clair'))
    vue.on('theme', maj)
    maj()
    barre.appendChild(el('div', { class: 'atlas-barre-groupe' }, b))
  }

  vueCourante = vue
  ;(window as unknown as { atlasVue: VueGraphe; atlasV6: unknown }).atlasVue = vue
  ;(window as unknown as { atlasV6: unknown }).atlasV6 = { anneaux, corolle }
  return vue
}

let minuterieReconstruction = 0
/** Changer de regroupement reconstruit la vue (après l'enregistrement différé des réglages). */
function planifierReconstruction(): void {
  clearTimeout(minuterieReconstruction)
  minuterieReconstruction = window.setTimeout(() => {
    const v = vueCourante
    if (!v) return
    v.reglages.sauver()
    const etat: EtatMontage = { granularite: Math.round(v.granularite.globale), panneauOuvert: v.ui.panneau?.ouvert, mode: v.mode }
    v.detruire()
    monter(etat)
  }, 450)
}

// ─── Fiche d'agrégat ─────────────────────────────────────────────────────────

function ficheAgregat(v: VueGraphe, u: number): HTMLElement {
  const { h, palette: pal } = v
  const c = h.categorieDe(u)!
  const s = statistiquesCategorie(h, c.index, v.filtres.actives)
  const total = Math.max(1, s.nbActives)
  const ligne = (couleur: string, libelle: string, n: number) =>
    el('div', { class: 'v6-ligne' },
      el('i', { style: `background:${couleur}` }),
      el('span', { class: 'v6-ligne-nom' }, libelle),
      el('span', { class: 'v6-ligne-barre' }, el('b', { style: `width:${(100 * n) / total}%;background:${couleur}` })),
      el('span', { class: 'v6-ligne-n' }, String(n)),
    )
  // Intervalle moyen des feuilles actives.
  let bas = 0, haut = 0
  for (const f of c.feuilles) {
    if (!v.filtres.actives[f]) continue
    bas += h.noeuds[f]!.confiance.bas
    haut += h.noeuds[f]!.confiance.haut
  }
  bas /= total
  haut /= total
  const couleurDomaine = pal.domaines[c.domaine % pal.domaines.length]!
  return el('div', { class: 'atlas-fiche-contenu v6-fiche' },
    el('div', { class: 'atlas-fiche-titre' }, el('i', { class: 'atlas-pastille grande', style: `background:${couleurDomaine}` }), c.nom),
    el('div', { class: 'atlas-fiche-chemin' }, `${NOMS_NIVEAUX[c.niveau].replace(/s$/, '')} · ${c.chemin.slice(0, -1).join(' › ') || 'racine'}`),
    el('div', { class: 'atlas-fiche-compte' }, el('strong', {}, String(s.nbActives)), ` nœud(s)${s.nbActives !== s.nb ? ` sur ${s.nb}` : ''}`,
      s.nbActives ? el('span', { class: 'v6-periode' }, ` · ${formaterDateCourte(s.dateMin)} → ${formaterDate(s.dateMax)}`) : null),
    el('div', { class: 'v6-bloc' }, el('div', { class: 'v6-bloc-titre' }, 'Statut · anneau épais'), STATUTS.map((k) => ligne(pal.statut[k], LIBELLES_STATUT[k], s.statuts[k]))),
    el('div', { class: 'v6-bloc' }, el('div', { class: 'v6-bloc-titre' }, 'Validation · anneau fin'), VALIDATIONS.map((k) => ligne(pal.validation[k], LIBELLES_VALIDATION[k], s.validations[k]))),
    s.nbActives
      ? el('div', { class: 'v6-bloc' },
          el('div', { class: 'v6-bloc-titre' }, 'Confiance moyenne'),
          el('div', { class: 'v6-intervalle' },
            el('span', { class: 'v6-intervalle-piste' },
              el('b', { style: `left:${bas * 100}%;width:${Math.max(1, (haut - bas) * 100)}%` }),
              el('em', { style: `left:${s.confianceMoyenne * 100}%` })),
            el('span', {}, `${formaterNombre(Math.round(s.confianceMoyenne * 100) / 100)} [${formaterNombre(Math.round(bas * 100) / 100)} – ${formaterNombre(Math.round(haut * 100) / 100)}]`)),
        )
      : null,
    s.principales.length
      ? el('div', { class: 'atlas-fiche-principaux' }, el('span', {}, 'Principaux'), el('ol', {}, s.principales.slice(0, 3).map((f) => el('li', {}, h.noeuds[f]!.nom))))
      : null,
    el('div', { class: 'atlas-fiche-aide' }, 'Survolez un secteur pour isoler ses nœuds · double-clic : éclore · Alt + double-clic : replier'),
  )
}

// ─── Panneau : cartes flottantes ─────────────────────────────────────────────

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`
  const g = a1 - a0 > Math.PI ? 1 : 0
  return `M${p(r1, a0)}A${r1} ${r1} 0 ${g} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 ${g} 0 ${p(r0, a0)}Z`
}

function donutSvg(pal: Palette): string {
  const statuts: [string, number][] = [[pal.statut.valide, 0.55], [pal.statut.incertain, 0.3], [pal.statut.refute, 0.15]]
  const vals: [string, number][] = [[pal.validation.aucune, 0.3], [pal.validation.ia, 0.25], [pal.validation.humain, 0.25], [pal.validation.ia_humain, 0.2]]
  const segs = (liste: [string, number][], r0: number, r1: number) => {
    let a = -Math.PI / 2
    const g = 0.05
    return liste.map(([c, part]) => {
      const d = arc(44, 44, r0, r1, a + g / 2, a + part * 2 * Math.PI - g / 2)
      a += part * 2 * Math.PI
      return `<path d="${d}" fill="${c}"/>`
    }).join('')
  }
  return `<svg viewBox="0 0 88 88" width="88" height="88" aria-hidden="true">
    <circle cx="44" cy="44" r="28" fill="${rgba(pal.domaines[0]!, 0.08)}"/>
    ${segs(statuts, 30, 42)}${segs(vals, 25.5, 28.5)}
    <text x="44" y="41" text-anchor="middle" font-size="8.5" font-weight="600" fill="${pal.texte}" font-family="${pal.police}">Topologie</text>
    <text x="44" y="53" text-anchor="middle" font-size="11" font-weight="500" fill="${pal.texteDoux}" font-family="${pal.police}">42</text>
  </svg>`
}

function legende(v: VueGraphe): HTMLElement {
  const pal = v.palette
  const puce = (c: string, bord?: string) => el('i', { class: 'v6-puce', style: `background:${c};${bord ? `box-shadow:0 0 0 2px ${bord}` : ''}` })
  const schema = el('div', { class: 'v6-schema' })
  schema.innerHTML = donutSvg(pal)
  return el('div', { class: 'v6-legende' },
    el('div', { class: 'v6-legende-haut' },
      schema,
      el('div', { class: 'v6-legende-lecture' },
        el('div', {}, el('b', {}, 'Anneau épais'), ' : statuts'),
        el('div', {}, el('b', {}, 'Anneau fin'), ' : validation'),
        el('div', {}, el('b', {}, 'Centre'), ' : nom, effectif'),
        el('div', {}, el('b', {}, 'Rayon'), ' ∝ √effectif'),
      ),
    ),
    el('div', { class: 'v6-legende-grille' },
      el('div', { class: 'atlas-groupe-titre' }, 'Statut'),
      el('div', { class: 'v6-legende-puces' }, STATUTS.map((s) => el('span', {}, puce(pal.statut[s]), LIBELLES_STATUT[s]))),
      el('div', { class: 'atlas-groupe-titre' }, 'Validation'),
      el('div', { class: 'v6-legende-puces' }, VALIDATIONS.map((s) => el('span', {}, puce(pal.validation[s]), LIBELLES_VALIDATION[s]))),
      el('div', { class: 'atlas-groupe-titre' }, 'Nœuds'),
      el('div', { class: 'v6-legende-texte' }, 'Couleur = statut, bordure = validation. Au survol, un violon montre l’intervalle de confiance (trait = estimation ; contour pointillé, fin, moyen ou double selon la validation).'),
      el('div', { class: 'atlas-groupe-titre' }, 'Lignée (clic)'),
      el('div', { class: 'v6-legende-puces' },
        el('span', {}, puce(pal.accent), 'sélection'),
        el('span', {}, puce(pal.ancetre), 'ancêtres'),
        el('span', {}, puce(pal.descendant), 'descendants')),
      el('div', { class: 'v6-legende-texte' }, 'Autour d’un agrégat, une jauge donne la part de ses nœuds dans la lignée.'),
    ),
  )
}

function amenagerPanneau(p: PanneauGauche, v: VueGraphe, info: string, communaute: boolean): void {
  p.remplacer('legende', legende(v))
  // Le moteur remet sa légende au changement de thème : on repasse derrière lui.
  v.on('theme', () => p.remplacer('legende', legende(v)))

  // Regroupement (catégories / communautés) en tête de la carte Filtres.
  const filtres = p.section('filtres')
  if (filtres) {
    const choix = (valeur: string, texte: string) => {
      const b = el('button', { type: 'button', class: v.reglages.lire<string>('regroupement') === valeur ? 'actif' : '' }, texte)
      b.addEventListener('click', () => v.reglages.definir('regroupement', valeur))
      return b
    }
    filtres.prepend(el('div', { class: 'v6-regroupement' },
      el('div', { class: 'atlas-groupe-titre' }, 'Agréger par'),
      el('div', { class: 'v6-segments' }, choix('categories', 'Catégories'), choix('communautes', 'Communautés')),
      el('div', { class: 'v6-info' }, info),
    ))
  }

  // Ordre des cartes : Filtres, Légende, Sélection, puis l'arbre ; entrée en cascade.
  const contenu = p.element.querySelector('.atlas-panneau-contenu')
  const ordre = ['filtres', 'legende', 'selection', 'categories']
  ordre.forEach((id, i) => {
    const d = p.element.querySelector<HTMLDetailsElement>(`.atlas-section[data-id="${id}"]`)
    if (!d || !contenu) return
    contenu.appendChild(d)
    d.style.setProperty('--i', String(i))
    if (id === 'legende' || id === 'selection') d.open = true
    if (id === 'categories' && communaute) d.querySelector('summary')!.textContent = 'Communautés'
  })
}

monter()
