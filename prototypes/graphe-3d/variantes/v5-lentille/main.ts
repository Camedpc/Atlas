// V5 · Lentille : focus + contexte. Le graphe reste agrégé partout, sauf sous la lentille qui suit
// le curseur (ou le doigt en appui long) : les agrégats s'y ouvrent localement, leurs enfants sortent,
// et rentrent quand on s'éloigne. Palette de commandes Ctrl + K, fiche hiérarchisée, confiance en
// bordure / arc / badge, panneau en surimpression avec fil d'Ariane.

import {
  creerVue, el, rgba, NOMS_NIVEAUX,
  type ContexteDessin, type Projection, type ReducteurNoeud,
} from '../../src/core'
import meta from './meta.json'
import { Lentille } from './lentille'
import { Confiance } from './confiance'
import { rendreFiche } from './fiche'
import { PaletteCommandes } from './commandes'

const L = 'Lentille'
const C = 'Confiance (V5)'
const F = 'Fiche (V5)'

let detaille = false

const vue = creerVue(document.getElementById('app')!, {
  id: meta.id,
  mode: '2d',
  vueInitiale: 'dessus',
  granularite: 1,
  reglages: { libelles: 'agregats', opaciteEstompe: 0.12 },
  reglagesSupplementaires: [
    { cle: 'lentille', defaut: true, dossier: L, libelle: 'lentille active' },
    { cle: 'rayonLentille', defaut: 150, dossier: L, libelle: 'rayon (px)', min: 40, max: 450, pas: 5 },
    { cle: 'profondeurLentille', defaut: 2, dossier: L, libelle: 'profondeur (niveaux)', min: 1, max: 3, pas: 1 },
    { cle: 'delaiOuverture', defaut: 180, dossier: L, libelle: 'délai ouverture (ms)', min: 0, max: 1500, pas: 10 },
    { cle: 'delaiFermeture', defaut: 650, dossier: L, libelle: 'délai fermeture (ms)', min: 0, max: 3000, pas: 10 },
    { cle: 'hysteresis', defaut: 1.35, dossier: L, libelle: 'hystérésis (× rayon)', min: 1, max: 2.5, pas: 0.05 },
    { cle: 'fisheye', defaut: 1.6, dossier: L, libelle: 'fisheye', min: 0, max: 6, pas: 0.1 },
    { cle: 'grossissement', defaut: 0.7, dossier: L, libelle: 'grossissement nœuds', min: 0, max: 2, pas: 0.05 },
    { cle: 'grossissementSurvol', defaut: 1.6, dossier: L, libelle: 'grossissement survol', min: 1, max: 3, pas: 0.05 },
    { cle: 'estompeHors', defaut: 0.22, dossier: L, libelle: 'estompe hors lentille', min: 0, max: 0.9, pas: 0.01 },
    { cle: 'lissageLentille', defaut: 140, dossier: L, libelle: 'apparition (ms)', min: 0, max: 800, pas: 10 },
    { cle: 'cercleLentille', defaut: true, dossier: L, libelle: 'cercle' },
    { cle: 'opaciteCercle', defaut: 1, dossier: L, libelle: 'opacité cercle', min: 0, max: 1, pas: 0.05 },
    { cle: 'grilleLentille', defaut: true, dossier: L, libelle: 'trame de la loupe' },
    { cle: 'libellesLentille', defaut: true, dossier: L, libelle: 'libellés dans la lentille' },
    { cle: 'maxLibellesLentille', defaut: 16, dossier: L, libelle: 'max. libellés', min: 0, max: 80, pas: 1 },
    { cle: 'teinteRemplissage', defaut: 0.5, dossier: C, libelle: 'remplissage adouci', min: 0, max: 0.9, pas: 0.01 },
    { cle: 'bordureMin', defaut: 0.14, dossier: C, libelle: 'bordure min (incertain)', min: 0, max: 0.6, pas: 0.01 },
    { cle: 'bordureMax', defaut: 0.5, dossier: C, libelle: 'bordure max (certain)', min: 0, max: 0.9, pas: 0.01 },
    { cle: 'arcConfiance', defaut: true, dossier: C, libelle: 'arc intervalle' },
    { cle: 'seuilArc', defaut: 5.5, dossier: C, libelle: 'arc dès (px)', min: 0, max: 30, pas: 0.5 },
    { cle: 'epaisseurArc', defaut: 1.4, dossier: C, libelle: 'épaisseur arc', min: 0.5, max: 4, pas: 0.1 },
    { cle: 'anneauAgregat', defaut: true, dossier: C, libelle: 'anneau agrégats' },
    { cle: 'epaisseurAnneau', defaut: 2.5, dossier: C, libelle: 'épaisseur anneau', min: 0.5, max: 6, pas: 0.1 },
    { cle: 'badges', defaut: true, dossier: C, libelle: 'badges validation' },
    { cle: 'seuilBadge', defaut: 8, dossier: C, libelle: 'badges dès (px)', min: 0, max: 30, pas: 0.5 },
    { cle: 'maxBadges', defaut: 60, dossier: C, libelle: 'max. badges', min: 0, max: 300, pas: 1 },
    { cle: 'ficheDetaillee', defaut: false, dossier: F, libelle: 'détail déplié' },
    { cle: 'binsHistogramme', defaut: 24, dossier: F, libelle: 'barres histogramme', min: 8, max: 48, pas: 1 },
  ],
  rendreFiche: (u, v) => rendreFiche(v, u, detaille),
})
detaille = vue.reglages.lire<boolean>('ficheDetaillee')

const R = <T extends number | boolean>(cle: string) => vue.reglages.lire<T>(cle)
const lentille = new Lentille(vue)
const confiance = new Confiance(vue)

// ─── Fisheye : déformer la projection juste avant que sigma ne lise les positions ──────────
{
  const positionner = vue.rendu.positionner.bind(vue.rendu)
  vue.rendu.positionner = (p: Projection) => {
    lentille.deformer(p, vue.h.nU)
    positionner(p)
  }
}

// ─── Réducteur : grossissement dans la lentille, contexte estompé autour ───────────────────
const reducteurLentille: ReducteurNoeud = (info, a) => {
  // Survol : le nœud grossit, ses voisins un peu (lisibilité avant tout).
  if (info.survol === 'survole') a.taille *= R<number>('grossissementSurvol')
  else if (info.survol === 'voisin' && !info.estAgregat) a.taille *= 1 + (R<number>('grossissementSurvol') - 1) * 0.4
  const I = lentille.intensite
  if (I <= 0.001) return
  const r = lentille.rayon
  const d = Math.hypot(info.x - lentille.x, info.y - lentille.y) / r
  if (d < 1) {
    a.taille *= 1 + R<number>('grossissement') * (1 - d) * I
    // Les libellés des feuilles de la lentille sont placés par notre calque (sans chevauchement).
    if (!info.estAgregat && R<boolean>('libellesLentille') && info.survol !== 'survole' && info.lignee !== 'selection') a.libelle = null
  } else if (!a.surligne && info.survol !== 'survole' && info.survol !== 'voisin') {
    const rampe = Math.min(1, (d - 1) / 0.25)
    a.opacite *= 1 - R<number>('estompeHors') * I * rampe
  }
}
vue.ajouterReducteurNoeud(confiance.reducteur)
vue.ajouterReducteurNoeud(reducteurLentille)

// ─── Calque dessous : relief de la loupe et trame déformée ─────────────────────────────────
const pointGrille = { x: 0, y: 0 }
function dessinerLoupeDessous({ ctx, vue: v }: ContexteDessin): void {
  const I = lentille.intensite
  if (I < 0.01) return
  const { x, y } = lentille
  const r = lentille.rayon
  const pal = v.palette
  const sombre = v.reglages.valeurs.theme === 'sombre'
  // Ombre portée très douce autour du disque : la loupe « flotte » au-dessus du contexte.
  const ombre = ctx.createRadialGradient(x, y, r * 0.97, x, y, r + 28)
  const teinteOmbre = sombre ? '#000000' : pal.texte
  ombre.addColorStop(0, rgba(teinteOmbre, (sombre ? 0.5 : 0.075) * I))
  ombre.addColorStop(1, rgba(teinteOmbre, 0))
  ctx.fillStyle = ombre
  ctx.beginPath()
  ctx.arc(x, y, r + 28, 0, Math.PI * 2)
  ctx.arc(x, y, r, 0, Math.PI * 2, true)
  ctx.fill()
  // Intérieur : voile d'accent à peine perceptible, plus clair au centre.
  const voile = ctx.createRadialGradient(x, y, 0, x, y, r)
  voile.addColorStop(0, rgba(sombre ? '#ffffff' : pal.fond, (sombre ? 0.035 : 0.9) * I))
  voile.addColorStop(1, rgba(pal.accent, 0.035 * I))
  ctx.fillStyle = voile
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  // Trame de points fixée à l'écran, déformée par le fisheye : on « voit » la lentille grossir.
  if (R<boolean>('grilleLentille')) {
    const pas = 16
    const chemin = new Path2D()
    for (let gx = Math.floor((x - r) / pas) * pas; gx <= x + r; gx += pas) {
      for (let gy = Math.floor((y - r) / pas) * pas; gy <= y + r; gy += pas) {
        const t = Math.hypot(gx - x, gy - y) / r
        if (t >= 0.97) continue
        lentille.deformerPoint(gx, gy, pointGrille)
        const s = 0.6 + 0.6 * (1 - t)
        chemin.rect(pointGrille.x - s / 2, pointGrille.y - s / 2, s, s)
      }
    }
    ctx.fillStyle = rgba(pal.texteDoux, 0.28 * I)
    ctx.fill(chemin)
  }
}

// ─── Calque dessus : cercle-réticule, étiquette de niveaux, libellés sans chevauchement ────
const largeurs = new Map<number, number>()
let policeLargeurs = ''
function dessinerLoupeDessus({ ctx, vue: v, projection: p }: ContexteDessin): void {
  const I = lentille.intensite
  if (I < 0.01) return
  const { x, y } = lentille
  const r = lentille.rayon
  const pal = v.palette
  const epinglee = lentille.epinglee

  if (R<boolean>('cercleLentille')) {
    const a = I * R<number>('opaciteCercle')
    ctx.save()
    ctx.strokeStyle = rgba(epinglee ? pal.accent : pal.texte, (epinglee ? 0.75 : 0.32) * a)
    ctx.lineWidth = epinglee ? 1.5 : 1
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
    // Graduations : tous les 15°, plus longues aux points cardinaux (réticule d'instrument).
    ctx.beginPath()
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2
      const l = k % 6 === 0 ? 7 : 3
      ctx.moveTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r)
      ctx.lineTo(x + Math.cos(ang) * (r + l), y + Math.sin(ang) * (r + l))
    }
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  if (R<boolean>('libellesLentille') && R<number>('maxLibellesLentille') > 0) dessinerLibellesLentille(ctx, v, p, I)
  if (R<boolean>('cercleLentille')) dessinerEtiquette(ctx, v, I * R<number>('opaciteCercle'))
}

/** Étiquette du cercle : niveaux ouverts par la lentille (+ état épinglé). Dessinée après les libellés. */
function dessinerEtiquette(ctx: CanvasRenderingContext2D, v: typeof vue, a: number): void {
  const { x, y } = lentille
  const r = lentille.rayon
  const pal = v.palette
  const epinglee = lentille.epinglee
  ctx.save()
  const base = Math.floor(v.granularite.globale + 1e-3)
  const jusque = Math.min(3, base + R<number>('profondeurLentille'))
  const texte = `${epinglee ? 'épinglée · ' : ''}${NOMS_NIVEAUX[base]} → ${NOMS_NIVEAUX[jusque].toLowerCase()}`
  ctx.font = `500 10.5px ${pal.police}`
  const w = ctx.measureText(texte).width + 12
  const ang = -Math.PI / 4
  let tx = x + Math.cos(ang) * (r + 10), ty = y + Math.sin(ang) * (r + 10) - 16
  if (tx + w > v.rendu.largeur - 8) tx = x - Math.cos(ang) * (r + 10) - w
  if (ty < 8) ty = y + r + 10
  ctx.globalAlpha = a
  ctx.fillStyle = pal.fond
  ctx.strokeStyle = epinglee ? rgba(pal.accent, 0.6) : rgba(pal.texte, 0.14)
  ctx.beginPath()
  ctx.roundRect(tx, ty, w, 18, 9)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = epinglee ? pal.accent : pal.texteDoux
  ctx.textBaseline = 'middle'
  ctx.fillText(texte, tx + 6, ty + 9.5)
  ctx.restore()
}

/** Libellés des feuilles de la lentille, placés sans chevauchement (glouton, les plus gros d'abord). */
function dessinerLibellesLentille(ctx: CanvasRenderingContext2D, v: typeof vue, p: Projection, I: number): void {
  const { x, y } = lentille
  const r = lentille.rayon
  const pal = v.palette
  const max = R<number>('maxLibellesLentille')
  const { h } = v
  const op = v.opaciteAffichee, taille = v.tailleAffichee
  const candidats: number[] = []
  for (let f = 0; f < h.nF; f++) {
    if (op[f]! < 0.35 || f === v.survol) continue
    if (Math.hypot(p.x[f]! - x, p.y[f]! - y) >= r * 0.98) continue
    candidats.push(f)
  }
  candidats.sort((a, b) => taille[b]! - taille[a]! || h.importance[b]! - h.importance[a]!)
  const tp = v.reglages.valeurs.tailleLibelle - 1
  const police = `450 ${tp}px ${pal.police}`
  if (police !== policeLargeurs) {
    largeurs.clear()
    policeLargeurs = police
  }
  ctx.save()
  ctx.font = police
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = pal.fond
  const boites: number[] = []
  const libre = (bx: number, by: number, bw: number, bh: number) => {
    for (let i = 0; i < boites.length; i += 4) {
      if (bx - 4 < boites[i]! + boites[i + 2]! && bx + bw + 4 > boites[i]! && by < boites[i + 1]! + boites[i + 3]! && by + bh > boites[i + 1]!) return false
    }
    return true
  }
  // Réserver la pastille du nœud survolé (dessinée par sigma).
  if (v.survol !== null) boites.push(p.x[v.survol]!, p.y[v.survol]! - 14, 260, 28)
  let places = 0
  for (const f of candidats) {
    if (places >= max) break
    let nom = h.noeuds[f]!.nom
    if (nom.length > 36) nom = nom.slice(0, 34) + '…'
    let w = largeurs.get(f)
    if (w === undefined) largeurs.set(f, (w = ctx.measureText(nom).width))
    const rr = taille[f]!, hh = tp + 4
    const fx = p.x[f]!, fy = p.y[f]!
    const by = fy - hh / 2
    const gauche = x - r - 70, droite = x + r + 70
    let bx = fx + rr + 5
    if (bx + w > droite || !libre(bx, by, w, hh)) {
      bx = fx - rr - 5 - w
      if (bx < gauche || !libre(bx, by, w, hh)) continue
    }
    boites.push(bx, by, w, hh)
    places++
    ctx.globalAlpha = Math.min(1, op[f]! * 1.2) * I
    ctx.fillStyle = pal.texte
    ctx.strokeText(nom, bx, fy)
    ctx.fillText(nom, bx, fy)
  }
  ctx.restore()
}

vue.ajouterDessin('dessous', dessinerLoupeDessous)
vue.ajouterDessin('dessus', confiance.dessiner)
vue.ajouterDessin('dessus', dessinerLoupeDessus)

// ─── Boucle : lissage de l'intensité, logique d'ouverture ─────────────────────────────────
vue.on('image', ({ dt }) => {
  if (lentille.lisser(dt)) vue.demanderRendu()
})
window.setInterval(() => {
  lentille.mettreAJour(performance.now())
  majAriane()
}, 50)
vue.on('reglage', ({ cle, valeur }) => {
  if (cle === 'lentille' && valeur === false) lentille.toutFermer()
  if (cle === 'ficheDetaillee') {
    detaille = valeur as boolean
    rafraichirFiche()
  }
  if (cle === 'lentille' || cle === 'rayonLentille' || cle === 'profondeurLentille') majPuce()
})

// ─── Souris ───────────────────────────────────────────────────────────────────────────
const scene = vue.scene
const local = (e: { clientX: number; clientY: number }) => {
  const r = scene.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
scene.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return
  lentille.dedans = true
  if (!lentille.epinglee) {
    const q = local(e)
    lentille.x = q.x
    lentille.y = q.y
  }
  if (R<boolean>('lentille')) vue.demanderRendu()
})
scene.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'touch') return
  lentille.dedans = false
  vue.demanderRendu()
})
// Maj + molette : rayon de la lentille (intercepte le zoom du moteur).
scene.addEventListener('wheel', (e) => {
  if (!e.shiftKey) return
  e.preventDefault()
  e.stopImmediatePropagation()
  const d = e.deltaY || e.deltaX
  if (!d) return
  const r = Math.round(Math.min(450, Math.max(40, lentille.rayon * Math.pow(1.08, -Math.sign(d)))))
  vue.reglages.definir('rayonLentille', r)
}, { capture: true, passive: false })

// ─── Tactile : appui long = la lentille suit le doigt ; au relâchement elle reste épinglée ─
let appui: { id: number; x: number; y: number; minuterie: number } | null = null
scene.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return
  if (appui) {
    // Deuxième doigt : geste de caméra, pas de lentille.
    clearTimeout(appui.minuterie)
    appui = null
    return
  }
  const q = local(e)
  appui = {
    id: e.pointerId, ...q,
    minuterie: window.setTimeout(() => {
      if (!appui) return
      lentille.tactile = true
      lentille.epinglee = false
      lentille.x = appui.x
      lentille.y = appui.y
      lentille.notifier()
      try {
        navigator.vibrate?.(8)
      } catch {
        // vibration indisponible
      }
      vue.demanderRendu()
    }, 450),
  }
}, { capture: true })
window.addEventListener('pointermove', (e) => {
  if (!appui || e.pointerId !== appui.id) return
  const q = local(e)
  if (lentille.tactile) {
    // Le doigt pilote la lentille : on empêche le moteur d'orbiter / déplacer.
    e.stopPropagation()
    lentille.x = q.x
    lentille.y = q.y
    vue.demanderRendu()
  } else if (Math.hypot(q.x - appui.x, q.y - appui.y) > 8) {
    clearTimeout(appui.minuterie)
    appui = null
  }
}, { capture: true })
const finAppui = (e: PointerEvent) => {
  if (!appui || e.pointerId !== appui.id) return
  clearTimeout(appui.minuterie)
  appui = null
  if (lentille.tactile) {
    lentille.tactile = false
    lentille.epinglee = true
    lentille.notifier()
    vue.demanderRendu()
  }
}
window.addEventListener('pointerup', finAppui, { capture: true })
window.addEventListener('pointercancel', finAppui, { capture: true })

// ─── Palette de commandes et clavier ───────────────────────────────────────────────────
const palette = new PaletteCommandes(vue, lentille)

function rafraichirFiche(): void {
  const u = vue.survol
  const f = vue.ui.fiche
  if (u === null || !f) return
  f.afficher(u, rendreFiche(vue, u, detaille))
  f.positionner(vue.controles.souris.x, vue.controles.souris.y, vue.rendu.largeur, vue.rendu.hauteur)
}

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    palette.basculer()
    return
  }
  const t = e.target as HTMLElement | null
  if (palette.ouverte || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (e.code === 'KeyL') {
    e.preventDefault()
    lentille.epingler()
  } else if (e.code === 'Space' && vue.survol !== null) {
    e.preventDefault()
    detaille = !detaille
    rafraichirFiche()
  } else if (e.key === '/') {
    e.preventDefault()
    palette.ouvrir()
  }
})

// ─── Barre d'outils (sous ☰) ───────────────────────────────────────────────────────────
const puceLentille = el('button', { class: 'v5-puce', type: 'button', title: 'Épingler / libérer la lentille (L). Tablette : appui long pour la déplacer.' })
const outils = el('div', { class: 'v5-outils' },
  el('button', { class: 'v5-puce', type: 'button', title: 'Palette de commandes', onclick: () => palette.ouvrir() },
    el('span', { class: 'v5-puce-icone' }, '⌕'), 'Commandes', el('kbd', {}, 'Ctrl K')),
  puceLentille,
  el('button', {
    class: 'v5-puce v5-puce-carree', type: 'button', title: 'Thème clair / sombre',
    onclick: () => vue.definirTheme(vue.reglages.valeurs.theme === 'clair' ? 'sombre' : 'clair'),
  }, '◐'),
)
vue.interface.appendChild(outils)
puceLentille.addEventListener('click', () => {
  if (!R<boolean>('lentille')) vue.reglages.definir('lentille', true)
  else lentille.epingler()
})
function majPuce(): void {
  const actif = R<boolean>('lentille')
  puceLentille.replaceChildren(
    el('i', { class: `v5-icone-lentille${lentille.epinglee ? ' epinglee' : ''}` }),
    !actif ? 'Lentille désactivée' : lentille.epinglee ? 'Lentille épinglée' : 'Lentille : suit le curseur',
    el('kbd', {}, 'L'),
  )
  puceLentille.classList.toggle('actif', actif && lentille.epinglee)
  puceLentille.classList.toggle('inactif', !actif)
}
lentille.quandChange(majPuce)
majPuce()

// ─── Panneau gauche : fil d'Ariane + lecture des encodages ─────────────────────────────
const ariane = el('nav', { class: 'v5-ariane', 'aria-label': "Fil d'Ariane" })
let cleAriane = ''
function majAriane(): void {
  const panneau = vue.ui.panneau
  if (!panneau) return
  const { h } = vue
  let u = vue.lignee.selection
  let source = 'sélection'
  if (u === null) {
    u = lentille.uniteAuCentre()
    source = lentille.epinglee ? 'sous la lentille épinglée' : 'sous la lentille'
  }
  const c = u === null ? null : u < h.nF ? h.chaine[u * 3 + 2]! : u - h.nF
  const cle = `${u}|${source}|${vue.reglages.valeurs.theme}`
  if (cle === cleAriane) return
  cleAriane = cle
  const miettes: HTMLElement[] = [
    el('button', { type: 'button', class: 'v5-miette', onclick: () => vue.cadrerTout() }, 'Atlas'),
  ]
  if (c !== null) {
    for (const k of h.categories[c]!.chemin.map((_, i, ch) => ch.slice(0, i + 1).join('/'))) {
      const cat = h.categories.find((x) => x.id === k)!
      miettes.push(el('span', { class: 'v5-sep' }, '›'),
        el('button', {
          type: 'button', class: 'v5-miette', title: `Cadrer « ${cat.nom} »`,
          style: cat.niveau === 0 ? `--pastille:${vue.palette.domaines[cat.domaine % vue.palette.domaines.length]}` : '',
          onclick: () => vue.cadrer([cat.unite, ...cat.feuilles]),
        }, cat.nom))
    }
    if (u !== null && u < h.nF) miettes.push(el('span', { class: 'v5-sep' }, '›'), el('span', { class: 'v5-miette courante' }, h.noeuds[u]!.nom))
    else miettes[miettes.length - 1]!.classList.add('courante')
  }
  ariane.replaceChildren(
    el('div', { class: 'v5-ariane-miettes' }, miettes),
    el('div', { class: 'v5-ariane-source' }, c === null ? 'Survolez le graphe : la lentille indique où vous êtes.' : source),
  )
}
if (vue.ui.panneau) {
  vue.ui.panneau.element.querySelector('.atlas-panneau-entete')?.after(ariane)
  vue.on('selection', majAriane)
  const glyphe = `<svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
    <circle cx="23" cy="23" r="17" fill="none" stroke="currentColor" stroke-opacity=".1" stroke-width="2"/>
    <path d="M23 6 A17 17 0 0 1 39.2 28.3" fill="none" stroke="var(--statut-valide)" stroke-width="2" stroke-linecap="round"/>
    <line x1="37.5" y1="12" x2="41" y2="9.4" stroke="currentColor" stroke-width="1.2"/>
    <circle cx="23" cy="23" r="11" fill="color-mix(in srgb, var(--statut-valide) 45%, var(--fond))" stroke="var(--statut-valide)" stroke-width="4"/>
    <rect x="29" y="3" width="17" height="11" rx="5.5" fill="var(--validation-ia-humain)"/>
    <text x="37.5" y="11" font-size="7" font-weight="700" fill="#fff" text-anchor="middle">IA+H</text></svg>`
  const lecture = el('div', { class: 'v5-lecture' })
  lecture.innerHTML = `<div class="v5-lecture-glyphe">${glyphe}</div>
    <ul>
      <li><b>Bordure</b> : couleur = statut, épaisseur = certitude (intervalle étroit ⇒ bordure épaisse).</li>
      <li><b>Arc fin</b> : intervalle de confiance sur un cadran (0 en haut, 1 au tour complet) ; le trait marque l'estimation.</li>
      <li><b>Badge</b> : qui a validé — IA, H (humain), IA+H.</li>
      <li><b>Agrégat</b> : couleur = domaine ; anneau = répartition des statuts.</li>
    </ul>
    <div class="v5-lecture-touches"><kbd>L</kbd> épingler · <kbd>Maj</kbd>+molette rayon · <kbd>Espace</kbd> détail de la fiche · <kbd>Ctrl K</kbd> commandes</div>`
  vue.ui.panneau.ajouterSection('lecture', 'Lire un nœud', lecture, { position: 'filtres', ouverte: false })
  majAriane()
}

// Pratique pour déboguer depuis la console.
;(window as unknown as { atlasVue: typeof vue; atlasLentille: Lentille }).atlasVue = vue
;(window as unknown as { atlasLentille: Lentille }).atlasLentille = lentille
