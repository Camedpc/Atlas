// Nœud « décision » : un losange assez grand pour lire le choix (question, option retenue, options écartées ×, raison),
// qui pointe vers les nœuds qui découlent de chaque option (details.alternatives[].noeuds, voir atlas/decisions.py) :
// flèche pleine vers ceux d'une option retenue, pointillée et marquée × vers ceux d'une option écartée.
//
// Plusieurs rendus (REGLAGES.style), du plus proche de R42 au plus libre ; chacun a sa taille en cases
// (atlas/vue.py, TAILLE_DECISION). Géométrie pure ici (coordonnées relatives au coin du bloc, px de mise en page) ;
// le canevas (graphe-dessin.ts) trace le losange, la couche HTML y pose le texte au niveau « contenu ».

import { echapper, enLigne } from './formules'

export type StyleDecision = 'r42' | 'cartouche' | 'grand' | 'branches' | 'etire'
export type FlecheDecision = 'ordinaire' | 'appuyee' | 'tiretee'

export const REGLAGES: { style: StyleDecision; fleches: FlecheDecision; ecartees: boolean } = {
  style: 'grand',
  fleches: 'ordinaire',
  ecartees: true,
}

export function reglerDecision(r: Partial<typeof REGLAGES>): void {
  Object.assign(REGLAGES, r)
}

/** Taille (cases) de chaque rendu : à reporter dans atlas/vue.py (TAILLE_DECISION) pour le rendu choisi. */
export const TAILLES: Record<StyleDecision, [number, number]> = {
  r42: [1, 1],
  cartouche: [3, 1],
  grand: [2, 2],
  branches: [2, 2],
  etire: [2, 1],
}

export interface Alternative {
  libelle: string
  retenue: boolean
  raison?: string
  noeuds?: string[]
}

export interface DetailsDecision {
  question: string
  alternatives: Alternative[]
  raison?: string
}

/** Détails d'une décision, tolérants (un champ mal formé est ignoré) ; null s'il n'y a pas de question. */
export function lireDecision(details: unknown): DetailsDecision | null {
  if (!details || typeof details !== 'object') return null
  const d = details as Record<string, unknown>
  if (typeof d.question !== 'string') return null
  const alternatives = (Array.isArray(d.alternatives) ? d.alternatives : [])
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && typeof (a as { libelle?: unknown }).libelle === 'string')
    .map((a) => ({
      libelle: a.libelle as string,
      retenue: a.retenue === true,
      raison: typeof a.raison === 'string' ? a.raison : undefined,
      noeuds: Array.isArray(a.noeuds) ? a.noeuds.filter((n): n is string => typeof n === 'string') : [],
    }))
  return { question: d.question, alternatives, raison: typeof d.raison === 'string' ? d.raison : undefined }
}

export interface GeometrieDecision {
  /** Contour du losange (ou de sa forme), points x, y relatifs au coin du bloc. */
  contour: number[]
  /** Point de départ des flèches vers les nœuds commandés. */
  sortie: { x: number; y: number }
  /** Tige pointillée vers les options écartées (r42, branches) : de (x, y0) à (x, y1), × au bout. */
  tige: { x: number; y0: number; y1: number } | null
  /** Filet vertical qui sépare le losange de son cartouche. */
  filet: { x: number; y0: number; y1: number } | null
  /** Zone du texte hors de la forme (cartouche, options pendantes), peinte en blanc : les liaisons passent dessous. */
  fond: { x0: number; y0: number; x1: number; y1: number } | null
  /** Centre du losange (numéro « D1 » au niveau titre du rendu r42). */
  centre: { x: number; y: number; r: number }
}

const losange = (cx: number, cy: number, rx: number, ry: number) => [cx, cy - ry, cx + rx, cy, cx, cy + ry, cx - rx, cy]

export function geometrieDecision(w: number, h: number, style: StyleDecision = REGLAGES.style): GeometrieDecision {
  switch (style) {
    case 'r42': {
      const r = 21, cy = 52
      return { contour: losange(w / 2, cy, r, r), sortie: { x: w / 2 + r, y: cy }, tige: { x: w / 2, y0: cy + r, y1: cy + r + 18 }, filet: null, fond: null, centre: { x: w / 2, y: cy, r } }
    }
    case 'cartouche': {
      const rx = 96
      return { contour: losange(rx, h / 2, rx, h / 2), sortie: { x: w, y: h / 2 }, tige: null, filet: { x: 2 * rx + 12, y0: 4, y1: h - 4 }, fond: { x0: 2 * rx + 12, y0: 0, x1: w, y1: h }, centre: { x: rx, y: h / 2, r: h / 2 } }
    }
    case 'branches': {
      const hd = Math.round(h * 0.64)
      return { contour: losange(w / 2, hd / 2, w / 2, hd / 2), sortie: { x: w, y: hd / 2 }, tige: { x: w / 2, y0: hd, y1: hd + 12 }, filet: null, fond: { x0: 12, y0: hd + 13, x1: w - 12, y1: h }, centre: { x: w / 2, y: hd / 2, r: hd / 2 } }
    }
    case 'etire': {
      const p = Math.min(40, w * 0.1)
      return { contour: [0, h / 2, p, 0, w - p, 0, w, h / 2, w - p, h, p, h], sortie: { x: w, y: h / 2 }, tige: null, filet: null, fond: null, centre: { x: w / 2, y: h / 2, r: h / 2 } }
    }
    default:
      return { contour: losange(w / 2, h / 2, w / 2, h / 2), sortie: { x: w, y: h / 2 }, tige: null, filet: null, fond: null, centre: { x: w / 2, y: h / 2, r: h / 2 } }
  }
}

// ─── Composition HTML (niveau « contenu ») ───────────────────────────────────

function ecarteesHtml(alts: Alternative[], raisons: boolean): string {
  return alts.filter((a) => !a.retenue).map((a) => `<li class="gr-dec-ecartee"><span class="gr-dec-puce">×</span><s>${enLigne(a.libelle)}</s>`
    + (raisons && a.raison ? ` <span class="gr-dec-raison">— ${enLigne(a.raison)}</span>` : '') + '</li>').join('')
}

function retenuesHtml(alts: Alternative[]): string {
  return alts.filter((a) => a.retenue).map((a) => `<li class="gr-dec-retenue"><span class="gr-dec-puce">✓</span>${enLigne(a.libelle)}</li>`).join('')
}

export function cleDecision(): string {
  return `${REGLAGES.style}|${REGLAGES.ecartees ? 1 : 0}`
}

/** HTML d'une décision dans son bloc (w × h px de mise en page). */
export function htmlDecision(d: DetailsDecision, nom: string, numero: string, w: number, h: number): string {
  const g = geometrieDecision(w, h)
  const tete = `<span class="gr-type">Décision <span class="gr-num">${echapper(numero)}</span></span>`
  const question = `<p class="gr-dec-question">${enLigne(d.question)}</p>`
  const raison = d.raison ? `<p class="gr-dec-motif">${enLigne(d.raison)}</p>` : ''
  switch (REGLAGES.style) {
    case 'r42': {
      // R42 : le nom au-dessus du losange (numéro dedans), « non retenu : … » sous la tige.
      const ec = d.alternatives.filter((a) => !a.retenue)
      const nr = ec.length
        ? `<div class="gr-dec-nr" style="top:${g.tige!.y1 + 8}px"><i>non retenu :</i> ${enLigne(ec[0]!.libelle)}${ec.length > 1 ? ` <span class="gr-doux">(+${ec.length - 1})</span>` : ''}</div>`
        : ''
      return `<div class="gr-dec-r42-nom" style="height:${g.centre.y - g.centre.r - 4}px">${enLigne(nom)}</div>`
        + `<div class="gr-dec-num" style="left:${g.centre.x - 20}px;top:${g.centre.y - 8}px">${echapper(numero)}</div>${nr}`
    }
    case 'cartouche': {
      const f = g.filet!
      return `<div class="gr-dec-dans" style="left:${g.centre.x - g.centre.r * 1.05}px;width:${g.centre.r * 2.1}px;top:0;height:${h}px">`
        + `<div>${tete}<br>${enLigne(nom)}</div></div>`
        + `<div class="gr-corps gr-dec-corps" style="left:${f.x + 8}px;right:0;top:0;bottom:0"><div class="gr-corps-int">`
        + `${question}<ul class="gr-dec-liste">${retenuesHtml(d.alternatives)}${ecarteesHtml(d.alternatives, true)}</ul>${raison}</div></div>`
    }
    case 'branches': {
      const t = g.tige!
      const hd = t.y0
      return `<div class="gr-corps gr-dec-corps gr-dec-forme" style="left:0;top:0;width:${w}px;height:${hd}px"><div class="gr-corps-int">`
        + formeLosange(hd, hd * 0.2)
        + `<p class="gr-dec-tete">${tete} (${enLigne(nom)}).</p>${question}<ul class="gr-dec-liste">${retenuesHtml(d.alternatives)}</ul>${raison}</div></div>`
        + `<div class="gr-dec-dessous" style="top:${t.y1 + 4}px"><ul class="gr-dec-liste">${ecarteesHtml(d.alternatives, true)}</ul></div>`
    }
    case 'etire':
      return `<div class="gr-corps gr-dec-corps" style="left:${w * 0.09}px;right:${w * 0.09}px;top:5px;bottom:3px"><div class="gr-corps-int">`
        + `<p class="gr-dec-tete gr-dec-gauche">${tete} (${enLigne(nom)}). <span class="gr-dec-question">${enLigne(d.question)}</span></p>`
        + `<ul class="gr-dec-liste">${retenuesHtml(d.alternatives)}${ecarteesHtml(d.alternatives, true)}</ul></div></div>`
    default:
      // Grand losange : tout dedans, le texte épouse la forme (shape-outside), centré.
      return `<div class="gr-corps gr-dec-corps gr-dec-forme" style="left:0;top:0;width:${w}px;height:${h}px"><div class="gr-corps-int">`
        + formeLosange(h, h * 0.17)
        + `<p class="gr-dec-tete">${tete} (${enLigne(nom)}).</p>${question}<ul class="gr-dec-liste">${retenuesHtml(d.alternatives)}${ecarteesHtml(d.alternatives, true)}</ul>${raison}</div></div>`
  }
}

/** Deux flottants dont `shape-outside` découpe un losange : le texte (centré) s'inscrit dedans. */
function formeLosange(h: number, haut: number): string {
  return `<div class="gr-dec-flot gr-dec-flot-g" style="height:${h}px"></div><div class="gr-dec-flot gr-dec-flot-d" style="height:${h}px"></div>`
    + `<div style="height:${haut.toFixed(0)}px"></div>`
}

/** Texte du titre (niveau « titre » du canevas) : « Décision D1 » puis le nom. */
export function titreDecision(numero: string): string {
  return `Décision ${numero}`
}
