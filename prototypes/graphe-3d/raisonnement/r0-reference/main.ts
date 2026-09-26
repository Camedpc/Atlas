// R0 · Référence : vision sobre qui démontre tous les points d'extension des fondations.

import {
  creerVueRaisonnement, el, rgba, LIBELLES_VALIDATION,
  type ContexteDessinR, type ReducteurPoint,
} from '../../src/raisonnement'
import meta from './meta.json'

// 1. Réducteur : bordure = qui a validé (au lieu du statut), en option.
const bordureValidation: ReducteurPoint = (info, a, vue) => {
  if (!vue.reglages.lire<boolean>('bordureValidation') || info.lignee !== 'aucune') return
  a.couleurBordure = vue.palette.validation[info.noeud.validation]
  a.epaisseurBordure = info.noeud.validation === 'aucune' ? 0.15 : 0.36
}

// 2. Calque « dessous » : repères verticaux des rangs logiques (profondeur de raisonnement).
function dessinerRangs({ ctx, vue, hauteur }: ContexteDessinR): void {
  if (!vue.reglages.lire<boolean>('reperesRangs')) return
  const d = vue.disposition
  const pal = vue.palette
  const cam = vue.camera
  const e = vue.extrusion
  const z0 = d.bornes.zmin - 0.25, z1 = d.bornes.zmax + 0.25
  ctx.save()
  ctx.font = `10px ${pal.police}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  // En 3D, les repères sont posés sur la couche la plus proche de la caméra (les hypothèses).
  const y = -((7 - 1) / 2) * vue.reglages.valeurs.ecartCouches * e
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

const vue = creerVueRaisonnement(document.getElementById('app')!, {
  id: meta.id,
  mode: '2d',
  reglagesSupplementaires: [
    { cle: 'bordureValidation', defaut: false, dossier: 'Vision R0', libelle: 'bordure = validation' },
    { cle: 'reperesRangs', defaut: true, dossier: 'Vision R0', libelle: 'repères de rangs' },
  ],
  reducteursNoeud: [bordureValidation],
  dessinerDessous: dessinerRangs,
  // 3. Fiche : on enrichit la fiche par défaut.
  rendreFiche: (p, v, defaut) => {
    const f = defaut()
    const rang = v.disposition.rang[p]!
    f.append(el('div', { class: 'rsn-aide' }, rang >= 0 ? `Rang logique ${rang} · validation ${LIBELLES_VALIDATION[v.noeud(p).validation]}` : 'Hors des rangs (isolé ou contexte pur)'))
    return f
  },
  // 4. Panneau : une section propre à la vision.
  panneau: (p, v) => {
    const etat = el('div', { class: 'r0-etat' })
    const maj = () => {
      etat.replaceChildren(
        el('div', {}, 'Mode : ', el('b', {}, v.mode.toUpperCase()), ` · ${v.camera.perspective > 0.5 ? 'perspective' : 'orthographique'}`),
        el('div', {}, 'Stratégie : ', el('b', {}, v.strategie.nom)),
        el('div', {}, 'Survol : ', el('b', {}, v.survol === null ? '—' : v.noeud(v.survol).nom)),
        el('div', {}, 'Sélection : ', el('b', {}, v.selection === null ? '—' : v.noeud(v.selection).nom)),
      )
    }
    for (const evt of ['mode', 'survol', 'selection', 'lecture'] as const) v.on(evt, maj)
    maj()
    const bouton = (texte: string, f: () => void) => el('button', { class: 'rsn-bouton', type: 'button', onclick: f }, texte)
    p.ajouterSection('vision', 'Vision R0', el('div', {},
      etat,
      el('div', { class: 'r0-boutons' },
        bouton('2D / 3D (T)', () => v.definirMode(v.mode === '2d' ? '3d' : '2d')),
        bouton('Liens complets (L)', () => v.montrerLiensComplets(!v.reglages.valeurs.liensComplets)),
        bouton('Moteur dagre / ELK', () => v.reglages.definir('moteur', v.reglages.valeurs.moteur === 'dagre' ? 'elk' : 'dagre')),
        bouton('Thème', () => v.definirTheme(v.reglages.valeurs.theme === 'clair' ? 'sombre' : 'clair')),
      ),
    ), { position: 'selection' })
  },
})

// Pratique pour déboguer (et pour le script de capture).
;(window as unknown as { rsnVue: typeof vue }).rsnVue = vue
