// V0 · Référence : exemple sobre de tous les points d'extension du moteur.

import {
  creerVue, el, rgba, centreCouloir, formaterDateCourte, LIBELLES_TYPE, LIBELLES_VUES, NOMS_NIVEAUX, TYPES_NOEUD, Z_MAX,
  type ContexteDessin, type ReducteurNoeud,
} from '../../src/core'
import meta from './meta.json'

// 1. Réducteur de nœud : la bordure dit qui a validé (aucune / IA / humain / IA + humain).
const bordureValidation: ReducteurNoeud = (info, a, vue) => {
  if (!vue.reglages.lire<boolean>('bordureValidation')) return
  if (info.estAgregat || info.lignee !== 'aucune' || !info.noeud) return
  const v = info.noeud.validation
  a.couleurBordure = vue.palette.validation[v]
  a.tailleBordure = v === 'aucune' ? 0.1 : v === 'ia_humain' ? 0.42 : 0.28
}

// 2. Calque « dessous » : halo dont l'épaisseur = largeur de l'intervalle de confiance.
function dessinerHalos({ ctx, vue, projection }: ContexteDessin): void {
  const k = vue.reglages.lire<number>('halo')
  if (k <= 0) return
  const { h, palette } = vue
  // Un chemin par (statut, palier d'opacité) : quelques fill() au lieu d'un par nœud.
  const chemins = new Map<string, Path2D>()
  for (let f = 0; f < h.nF; f++) {
    const op = vue.opaciteAffichee[f]!
    if (op < 0.05) continue
    const n = h.noeuds[f]!
    const r = vue.tailleAffichee[f]! + (n.confiance.haut - n.confiance.bas) * 22 * k
    const cle = `${n.statut}|${Math.ceil(op * 4)}`
    let p = chemins.get(cle)
    if (!p) chemins.set(cle, (p = new Path2D()))
    const x = projection.x[f]!, y = projection.y[f]!
    p.moveTo(x + r, y)
    p.arc(x, y, r, 0, Math.PI * 2)
  }
  for (const [cle, p] of chemins) {
    const [statut, palier] = cle.split('|') as [keyof typeof palette.statut, string]
    ctx.fillStyle = rgba(palette.statut[statut], 0.04 * Number(palier))
    ctx.fill(p)
  }
}

// 3. Calque « dessus » : repères d'axes qui apparaissent selon la face regardée.
function dessinerReperes({ ctx, vue }: ContexteDessin): void {
  if (!vue.reglages.lire<boolean>('reperes')) return
  const { camera: cam, h, palette, poidsFaces } = vue
  const cube = vue.reglages.valeurs.mode3D === 'cube'
  const av = cam.avant
  const wTemps = (cube ? 1 : poidsFaces[1]!) * (1 - Math.abs(av[0]))
  const wCouloirs = (cube ? 1 : poidsFaces[2]!) * (1 - Math.abs(av[1]))
  const wBandes = (cube ? 1 : poidsFaces[1]! + poidsFaces[2]!) * (1 - Math.abs(av[2]))
  const bas = -Z_MAX - 0.07
  ctx.save()
  ctx.font = `11px ${palette.police}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  if (wTemps > 0.05) {
    ctx.globalAlpha = Math.min(1, wTemps * 1.3)
    ctx.fillStyle = palette.texteDoux
    ctx.strokeStyle = rgba(palette.texteDoux, 0.35)
    const d = new Date(h.dateMin)
    d.setUTCDate(1)
    for (d.setUTCMonth(d.getUTCMonth() + 1); d.getTime() < h.dateMax; d.setUTCMonth(d.getUTCMonth() + 1)) {
      const x = -1 + (2 * (d.getTime() - h.dateMin)) / (h.dateMax - h.dateMin)
      const p = cam.projeterPoint([x, 0, bas]), q = cam.projeterPoint([x, 0, Z_MAX])
      if (!p.visible) continue
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(q.x, q.y)
      ctx.setLineDash([2, 4])
      ctx.stroke()
      ctx.fillText(formaterDateCourte(d.getTime()), p.x, p.y + 4)
    }
  }
  if (wCouloirs > 0.05) {
    ctx.globalAlpha = Math.min(1, wCouloirs * 1.3)
    ctx.fillStyle = palette.texteDoux
    TYPES_NOEUD.forEach((t, i) => {
      const p = cam.projeterPoint([0, centreCouloir(i, 1), bas])
      if (p.visible) ctx.fillText(LIBELLES_TYPE[t], p.x, p.y + 4)
    })
  }
  if (wBandes > 0.05) {
    ctx.globalAlpha = Math.min(1, wBandes * 1.3)
    ctx.fillStyle = palette.texte
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.font = `600 11px ${palette.police}`
    // Bord gauche de l'écran : −X vu de face, −Y vu de droite (et l'inverse pour les faces opposées).
    const deFace = Math.abs(av[1]) >= Math.abs(av[0])
    const gx = deFace ? (av[1] > 0 ? -1.08 : 1.08) : 0
    const gy = deFace ? 0 : av[0] < 0 ? -1.08 : 1.08
    for (const d of h.domaines) {
      const c = h.categories[d]!
      const z = vue.dispositions.face[c.unite * 3 + 2]!
      const p = cam.projeterPoint([gx, gy, z])
      if (p.visible) ctx.fillText(c.nom, p.x - 6, p.y)
    }
  }
  ctx.restore()
}

const vue = creerVue(document.getElementById('app')!, {
  id: meta.id,
  mode: '2d',
  vueInitiale: 'dessus',
  granularite: 2,
  reglagesSupplementaires: [
    { cle: 'halo', defaut: 1, dossier: 'Variante V0', libelle: 'halo incertitude', min: 0, max: 3, pas: 0.05 },
    { cle: 'bordureValidation', defaut: true, dossier: 'Variante V0', libelle: 'bordure = validation' },
    { cle: 'reperes', defaut: true, dossier: 'Variante V0', libelle: "repères d'axes" },
  ],
  reducteursNoeud: [bordureValidation],
  dessinerDessous: dessinerHalos,
  dessinerDessus: dessinerReperes,
  panneau: (p, v) => {
    const etat = el('div', { class: 'v0-etat' })
    const maj = () => {
      const sel = v.lignee.selection
      etat.replaceChildren(
        el('div', {}, 'Vue : ', el('b', {}, v.camera.vueCourante(1) ? LIBELLES_VUES[v.camera.vueCourante(1)!] : 'libre'), ` · ${v.mode.toUpperCase()} · ${v.camera.perspective > 0.5 ? 'perspective' : 'ortho'}`),
        el('div', {}, 'Granularité : ', el('b', {}, v.granularite.globale.toFixed(2)), ` (${NOMS_NIVEAUX[Math.round(v.granularite.globale)]})`),
        el('div', {}, 'Survol : ', el('b', {}, v.survol === null ? '—' : v.h.nom(v.survol))),
        el('div', {}, 'Sélection : ', el('b', {}, sel === null ? '—' : v.h.nom(sel))),
      )
    }
    for (const evt of ['vue', 'granularite', 'survol', 'selection'] as const) v.on(evt, maj)
    maj()
    const bouton = (texte: string, f: () => void) => el('button', { class: 'atlas-bouton', type: 'button', onclick: f }, texte)
    p.ajouterSection(
      'variante',
      'Variante V0',
      el('div', {},
        etat,
        el('div', { class: 'v0-boutons' },
          bouton('Thème clair / sombre', () => v.definirTheme(v.reglages.valeurs.theme === 'clair' ? 'sombre' : 'clair')),
          bouton('2D / 3D', () => v.definirMode(v.mode === '2d' ? '3d' : '2d')),
          bouton('Faces / cube', () => v.reglages.definir('mode3D', v.reglages.valeurs.mode3D === 'faces' ? 'cube' : 'faces')),
        ),
      ),
      { position: 'selection' },
    )
  },
})

// Pratique pour déboguer depuis la console.
;(window as unknown as { atlasVue: typeof vue }).atlasVue = vue
