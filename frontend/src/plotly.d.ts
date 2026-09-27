// Ce que le mode 3D (graphe-3d.ts) utilise de plotly.js (build gl3d, chargé à la demande).
declare module 'plotly.js-gl3d-dist-min' {
  type Objet = Record<string, unknown>
  /** L'élément du graphique une fois tracé : sa mise en page courante et ses événements. */
  export interface ElementPlotly extends HTMLElement {
    layout: Objet
    on(evenement: string, rappel: (donnees: Objet) => void): void
  }
  const Plotly: {
    newPlot(el: HTMLElement, data: Objet[], layout?: Objet, config?: Objet): Promise<ElementPlotly>
    relayout(el: HTMLElement, maj: Objet): Promise<HTMLElement>
    addFrames(el: HTMLElement, frames: Objet[]): Promise<void>
    animate(el: HTMLElement, frames: string[], options?: Objet): Promise<void>
    purge(el: HTMLElement): void
    Plots: { resize(el: HTMLElement): Promise<void> }
  }
  export default Plotly
}
