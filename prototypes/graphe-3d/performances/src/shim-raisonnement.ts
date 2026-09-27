// Remplace `src/raisonnement/index.ts` dans le banc Node : mêmes exports utiles aux visions, sans sigma,
// Tweakpane ni DOM (vue.ts, ui.ts et formes.ts ne sont pas chargés). Branché par le greffon de résolution
// de `construire.mjs` sur toute importation de `../../src/raisonnement`.

export * from '../../src/raisonnement/donnees'
export * from '../../src/raisonnement/lecture'
export * from '../../src/raisonnement/disposition'
export { rgba, rgbaGL, melangerCouleurs } from '../../src/core/apparence'
export { quat, vec, clamp, lerp } from '../../src/core/maths'
