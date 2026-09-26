// V3 · Constellation : le graphe comme une constellation lumineuse en profondeur.
//
// Assemblage : réglages propres (reglages.ts), halos / traînées / impulsions (lumiere.ts),
// squelette par importance (squelette.ts), fiche en verre dépoli (fiche.ts), tiroir et carte
// d'agrégation (ce fichier). Le moteur n'est pas modifié : on passe par ses points d'extension,
// plus une enveloppe de `granularite.calculerPositions` (voir NOTES.md).

import {
  COURBES, TRAJECTOIRES, creerVue, el, melangerCouleurs, type ReducteurArete, type ReducteurNoeud, type Trajectoire, type VueGraphe,
} from '../../src/core'
import meta from './meta.json'
import { creerRenduFiche } from './fiche'
import { Lumiere } from './lumiere'
import { DEFINITIONS_V3, R, SURCHARGES_MOTEUR } from './reglages'
import { Squelette } from './squelette'

let squelette: Squelette | null = null
let lumiere: Lumiere | null = null

// ─── Trajectoire « étincelle » ───────────────────────────────────────────────
// Les enfants jaillissent du parent en décrivant un court arc spiralé (sens et amplitude
// propres à chacun), avec un léger soulèvement en Z qui se voit en 3D.

let vueCourante: VueGraphe | null = null
const etincelle: Trajectoire = (p) => {
  const V = vueCourante ? R(vueCourante) : null
  const spirale = V ? V.spirale : 0.45
  const g = p.graine
  const sens = g < 0.5 ? -1 : 1
  const amp = spirale * Math.PI * (0.55 + 0.9 * ((g * 7.31) % 1))
  const ang = (1 - p.t) * amp * sens
  const c = Math.cos(ang), s = Math.sin(ang)
  const vx = p.ax - p.dx, vy = p.ay - p.dy
  p.x = p.dx + (vx * c - vy * s) * p.t
  p.y = p.dy + (vx * s + vy * c) * p.t
  p.z = p.dz + (p.az - p.dz) * p.t + Math.sin(Math.PI * p.t) * 0.05 * (((g * 13.7) % 1) - 0.5)
}

// ─── Réducteurs ──────────────────────────────────────────────────────────────

/** Voisins affichés du nœud survolé en mode squelette (représentants des voisins absorbés). */
let voisinsSquelette = new Set<number>()

const reducteurConstellation: ReducteurNoeud = (info, a, vue) => {
  const V = R(vue)
  const u = info.unite
  const S = squelette
  const pal = vue.palette

  // Squelette : les feuilles repliées rentrent dans leur clé ; les clés grossissent.
  if (S && S.engage && !info.estAgregat) {
    const r = S.repli[u]!
    if (r > 0) {
      // Jamais « caché » pour sigma : une arête dont une extrémité est cachée disparaît, or
      // les arêtes du squelette partent de feuilles repliées (posées sur leur clé).
      a.opacite = Math.max(0.012, a.opacite * (1 - r))
      a.taille *= 1 - 0.8 * r
      if (r > 0.5) {
        a.libelle = null
        a.forceLibelle = false
        a.zIndex = 0
      }
    }
    const ab = S.absorbes[u]!
    if (ab > 0) a.taille *= 1 + V.tailleCles * Math.sqrt(ab)
    if (vue.survol !== null && info.survol === 'autre' && voisinsSquelette.has(u)) {
      // Le moteur a atténué ce nœud comme « contexte » : on annule cette atténuation.
      a.opacite = Math.min(1, a.opacite / Math.max(0.05, V.opaciteContexte ?? 0.3))
      a.zIndex += 4000
    }
  }

  // Bordure : qui a validé (l'IA + humain porte en plus une couronne perlée sur le calque).
  if (V.bordureValidation && info.noeud && info.lignee === 'aucune' && info.survol !== 'survole') {
    const v = info.noeud.validation
    if (v !== 'aucune') {
      a.couleurBordure = pal.validation[v]
      a.tailleBordure = v === 'ia' ? 0.2 : 0.3
    }
  }

  // Profondeur de champ côté sigma : les lointains rapetissent et pâlissent vers le fond.
  const p = vue.camera.perspective
  if (p > 0.01) {
    const d = info.profondeur
    const k = Math.round(V.palirLointains * p * d * 8) / 8
    if (k > 0) a.couleur = melangerCouleurs(a.couleur, pal.fond, k * 0.8)
    a.taille *= 1 - V.reduireLointains * p * d
  }
}

const reducteurAreteSquelette: ReducteurArete = (info, a, vue) => {
  const S = squelette
  if (!S || !S.engage || !info.feuille) return
  const nF = vue.h.nF
  const n = S.aretesRetenues.get(info.source * nF + info.cible)
  if (n === undefined) {
    a.cache = true
    return
  }
  const V = R(vue)
  const rs = S.representant(info.source), rt = S.representant(info.cible)
  if (rs === rt) {
    a.cache = true
    return
  }
  const os = vue.opaciteAffichee[rs]!, ot = vue.opaciteAffichee[rt]!
  const base = V.opaciteAretes * Math.min(os, ot)
  a.cache = os < 0.01 || ot < 0.01
  a.taille = V.epaisseurArete * (0.8 + 0.5 * Math.sqrt(n - 1))
  const s = vue.survol
  if (s !== null && (rs === s || rt === s)) {
    a.couleur = vue.palette.accent
    a.opacite = Math.max(base * 2.5, 0.6)
    a.zIndex = 2
  } else if (info.lignee) {
    a.opacite = Math.max(base, 0.8)
    a.taille *= 1.5
  } else a.opacite = vue.lignee.active ? base * 0.4 : base * Math.min(1.6, 0.65 + 0.2 * Math.sqrt(n))
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

const vue = creerVue(document.getElementById('app')!, {
  id: meta.id,
  mode: '3d',
  vueInitiale: 'iso',
  granularite: 2,
  reglages: SURCHARGES_MOTEUR,
  reglagesSupplementaires: DEFINITIONS_V3,
  reducteursNoeud: [reducteurConstellation],
  reducteursArete: [reducteurAreteSquelette],
  dessinerDessous: ({ temps }) => lumiere?.dessiner(temps),
  // Nos propres « traînées de période » remplacent la capsule du moteur (lumiere.ts).
  etenduesParDefaut: false,
  // Après le moteur, on tire les feuilles repliées du squelette vers leur clé.
  apresPositions: ({ positions, vue: v }) => {
    const Rv = R(v)
    const courbe = v.courbePerso ?? COURBES[Rv.courbe] ?? COURBES.sortie
    const traj = v.trajectoirePerso ?? TRAJECTOIRES[Rv.trajectoire] ?? TRAJECTOIRES.droite
    squelette?.appliquer(positions, courbe, traj)
  },
  rendreFiche: creerRenduFiche(() => squelette),
})
vueCourante = vue
vue.racine.classList.add('v3')
const V = R(vue)

squelette = new Squelette(vue)
lumiere = new Lumiere(vue, squelette)
const S = squelette

S.modeAretes = V.aretesSquelette
S.aretesParCle = V.aretesParCle

const appliquerTrajectoire = () => (vue.trajectoirePerso = V.etincelles ? etincelle : null)
appliquerTrajectoire()

// ─── Squelette : calculs et bascules ─────────────────────────────────────────

let granulariteCategories = 2

function relancerSquelette(recalculerScores: boolean): void {
  if (recalculerScores) S.calculerScores({ descendants: V.poidsDescendants, centralite: V.poidsCentralite, resultats: V.bonusResultats })
  S.calculerCles(V.seuilImportance)
  S.definirGardees(V.garderLignee && vue.lignee.active ? unionLignee() : null)
  S.majCibles(V.dureeTransition, V.dispersion)
  majVoisinsSquelette()
  vue.granularite.version++
  vue.demanderRendu()
  carte.maj()
}

function unionLignee(): Uint8Array {
  const l = vue.lignee
  const m = new Uint8Array(vue.h.nF)
  for (let f = 0; f < m.length; f++) m[f] = l.graines[f]! | l.ancetres[f]! | l.descendants[f]!
  return m
}

function appliquerAgregation(): void {
  const importance = V.agregation === 'importance'
  if (importance === S.actif) return
  vue.racine.classList.toggle('v3-importance', importance)
  if (importance) {
    granulariteCategories = Math.round(vue.granularite.globale)
    S.actif = true
    vue.granularite.reinitialiserLocales()
    vue.definirGranularite(3)
  } else {
    S.actif = false
    S.ouvertes.clear()
    vue.definirGranularite(granulariteCategories)
  }
  relancerSquelette(false)
}

function majVoisinsSquelette(): void {
  voisinsSquelette = new Set()
  const s = vue.survol
  if (s !== null && S.engage && s < vue.h.nF) {
    const { h } = vue
    for (let f = 0; f < h.nF; f++) {
      if (f !== s && S.representant(f) !== s) continue
      for (const x of h.premisses[f]!) voisinsSquelette.add(S.representant(x))
      for (const x of h.utilisePar[f]!) voisinsSquelette.add(S.representant(x))
    }
    voisinsSquelette.delete(s)
  }
  if (lumiere) lumiere.voisinsExtra = voisinsSquelette
}

vue.on('survol', () => majVoisinsSquelette())
vue.on('selection', () => {
  if (S.engage && V.garderLignee) relancerSquelette(false)
})
// Tant que des feuilles se replient ou sortent, on relance le calcul des positions à chaque image.
vue.on('image', () => {
  if (S.enAnimation) {
    vue.granularite.version++
    vue.demanderRendu()
  }
})
vue.on('reglage', ({ cle }) => {
  switch (cle) {
    case 'agregation': appliquerAgregation(); break
    case 'seuilImportance': case 'garderLignee': relancerSquelette(false); break
    case 'aretesSquelette': case 'aretesParCle':
      S.modeAretes = V.aretesSquelette
      S.aretesParCle = V.aretesParCle
      S.retenirAretes()
      vue.demanderRendu()
      carte.maj()
      break
    case 'poidsDescendants': case 'poidsCentralite': case 'bonusResultats': relancerSquelette(true); break
    case 'etincelles': appliquerTrajectoire(); break
    case 'fondDegrade': vue.racine.classList.toggle('v3-sans-degrade', !V.fondDegrade); break
    case 'theme': carte.maj(); break
  }
})
vue.racine.classList.toggle('v3-sans-degrade', !V.fondDegrade)

// Double-clic en mode squelette : ouvrir une clé (ses nœuds jaillissent), Alt : les rentrer.
vue.rendu.sigma.on('doubleClickNode', ({ node, event }) => {
  if (!S.actif) return
  // Le moteur a pu poser une ouverture/fermeture de catégorie locale : on l'annule.
  vue.granularite.reinitialiserLocales()
  const u = vue.h.uniteParCle.get(node)
  if (u === undefined || u >= vue.h.nF) return
  const cle = S.cible[u]!
  if ((event.original as MouseEvent).altKey) S.ouvertes.delete(cle)
  else if (S.cle[u] && S.nbAbsorbes[u]! > 0) S.ouvertes.add(u)
  else return
  S.majCibles(V.dureeTransition, V.dispersion)
  vue.granularite.version++
  vue.demanderRendu()
  carte.maj()
})

// [ ] en mode squelette : moins / plus de nœuds clés (au lieu de la granularité par catégories).
window.addEventListener(
  'keydown',
  (e) => {
    if (!S.actif || (e.key !== '[' && e.key !== ']')) return
    const cible = e.target as HTMLElement | null
    if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.isContentEditable)) return
    e.stopImmediatePropagation()
    e.preventDefault()
    const part = Math.max(0.005, 1 - V.seuilImportance)
    const nouvelle = e.key === ']' ? Math.min(1, part * 1.6) : Math.max(0.005, part / 1.6)
    vue.reglages.definir('seuilImportance', Math.round((1 - nouvelle) * 1000) / 1000)
  },
  { capture: true },
)

// ─── Carte « Agrégation » (en bas, à côté de la granularité) ─────────────────

const carte = (() => {
  const boutons = (['categories', 'importance'] as const).map((m) =>
    el('button', { type: 'button', 'data-mode': m, onclick: () => vue.reglages.definir('agregation', m) }, m === 'categories' ? 'Catégories' : 'Importance'),
  )
  const curseur = el('input', { type: 'range', min: 0, max: 0.995, step: 0.005, 'aria-label': "Seuil d'importance" })
  curseur.addEventListener('input', () => vue.reglages.definir('seuilImportance', Number(curseur.value)))
  const compte = el('span', { class: 'v3-carte-compte' })
  const ligneSeuil = el('div', { class: 'v3-carte-seuil' },
    el('div', { class: 'v3-carte-entete' }, el('span', {}, "Seuil d'importance"), compte),
    el('div', { class: 'v3-carte-ligne' }, el('span', { class: 'v3-carte-borne' }, 'tout'), curseur, el('span', { class: 'v3-carte-borne' }, 'clés')),
    el('div', { class: 'v3-carte-aide' }, '[ ] moins / plus de clés · double-clic sur une clé : l’ouvrir · Alt : la refermer'),
  )
  const element = el('div', { class: 'v3-carte' },
    el('div', { class: 'v3-carte-entete' }, el('span', { class: 'v3-carte-titre' }, 'Agrégation'), el('div', { class: 'v3-segment' }, boutons)),
    ligneSeuil,
  )
  const bas = vue.interface.querySelector('.atlas-bas')
  bas?.insertBefore(element, bas.firstChild)
  const maj = () => {
    boutons.forEach((b) => b.classList.toggle('actif', b.dataset.mode === V.agregation))
    curseur.value = String(V.seuilImportance)
    const ouvertes = S.ouvertes.size ? ` · ${S.ouvertes.size} ouverte(s)` : ''
    compte.textContent = `${S.nbCles} clé(s) / ${vue.h.nF} · ${S.aretesRetenues.size} arête(s)${ouvertes}`
  }
  return { element, maj }
})()

// ─── Tiroir (panneau gauche en surimpression) ────────────────────────────────

function construireTiroir(): void {
  const p = vue.ui.panneau
  if (!p) return
  const bascule = (libelle: string, cle: string) => {
    const c = el('input', { type: 'checkbox', checked: vue.reglages.lire<boolean>(cle) })
    c.addEventListener('change', () => vue.reglages.definir(cle, c.checked))
    vue.on('reglage', (e) => e.cle === cle && (c.checked = e.valeur as boolean))
    return el('label', { class: 'v3-bascule' }, c, el('span', {}, libelle))
  }
  const bouton = (texte: string, f: () => void) => el('button', { class: 'atlas-bouton', type: 'button', onclick: f }, texte)
  const vitesse = el('input', { type: 'range', min: 0.2, max: 6, step: 0.05, value: V.vitesseImpulsions })
  vitesse.addEventListener('input', () => vue.reglages.definir('vitesseImpulsions', Number(vitesse.value)))
  vue.on('reglage', (e) => e.cle === 'vitesseImpulsions' && (vitesse.value = String(e.valeur)))
  p.ajouterSection(
    'constellation',
    'Constellation',
    el('div', { class: 'v3-tiroir' },
      el('div', { class: 'v3-boutons' },
        bouton('Thème clair / sombre', () => vue.definirTheme(V.theme === 'clair' ? 'sombre' : 'clair')),
        bouton('2D / 3D', () => vue.definirMode(vue.mode === '2d' ? '3d' : '2d')),
        bouton('Tout cadrer', () => vue.cadrerTout()),
      ),
      el('div', { class: 'v3-bascules' },
        bascule('Halos', 'halo'),
        bascule('Impulsions de lignée', 'impulsions'),
        bascule('Scintillement « incertain »', 'scintillement'),
        bascule('Couronne IA + humain', 'couronne'),
        bascule('Étincelles aux transitions', 'etincelles'),
        bascule('La lignée sort du squelette', 'garderLignee'),
      ),
      el('div', { class: 'atlas-groupe-titre' }, 'Vitesse des impulsions'),
      vitesse,
    ),
    { position: 'selection' },
  )
  const item = (vignette: HTMLElement, titre: string, texte: string) =>
    el('div', { class: 'v3-code' }, vignette, el('div', {}, el('b', {}, titre), el('span', {}, texte)))
  const vig = (classe: string) => el('i', { class: `v3-vignette ${classe}` })
  p.ajouterSection(
    'encodage',
    'Lire la lumière',
    el('div', { class: 'v3-codes' },
      item(vig('nette'), 'Halo net et vif', 'estimation de confiance élevée'),
      item(vig('diffuse'), 'Halo pâle et flou', 'estimation faible'),
      item(vig('large'), 'Halo large', 'intervalle de confiance large (incertitude)'),
      item(vig('scintille'), 'Scintillement', 'statut « incertain »'),
      item(vig('couronne'), 'Couronne perlée', 'validé par IA + humain'),
      item(vig('bordure'), 'Liseré coloré', 'validé par un humain (bleu) ou une IA (violet)'),
      item(vig('impulsion'), 'Impulsions', 'orange : des ancêtres vers le nœud · violet : vers les descendants'),
      item(vig('nebuleuse'), 'Nébuleuse', 'agrégat (couleur du domaine, taille ∝ √n)'),
      item(vig('lointain'), 'Lointain', 'en 3D : plus petit, plus pâle, plus flou'),
    ),
    { position: 'filtres', ouverte: false },
  )
}
construireTiroir()

// ─── Démarrage ───────────────────────────────────────────────────────────────

S.calculerScores({ descendants: V.poidsDescendants, centralite: V.poidsCentralite, resultats: V.bonusResultats })
S.calculerCles(V.seuilImportance)
carte.maj()
if (V.agregation === 'importance') {
  // Réglage mémorisé : démarrer directement en squelette.
  appliquerAgregation()
}
vue.granularite.version++
vue.demanderRendu()

// Pratique pour déboguer depuis la console (et piloter la boucle quand la fenêtre est masquée).
Object.assign(window as unknown as Record<string, unknown>, {
  atlasVue: vue,
  v3: {
    squelette: S,
    lumiere,
    /** Calcule une image complète du moteur à l'instant t (ms), utile quand rAF est suspendu. */
    image: (t = performance.now()) => vue.image(t),
  },
})
