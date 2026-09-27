// Documents du graphe (fichiers et dossiers du projet, « doc:<id> »), dessinés dans leur case de la grille.
//
// Même corps que les nœuds, reconnaissables à leur silhouette (comme le losange d'une décision) : coin corné en haut
// à droite pour un fichier, onglet en haut à gauche pour un dossier (la tête s'y écrit). De loin, la silhouette seule ;
// à mi-distance, « Script 1 — simulation.py » ; de près (HTML), l'aperçu calculé par le serveur : premières lignes
// d'un script, colonnes d'un CSV, première page stylisée d'un PDF, contenu d'un dossier (les fichiers devenus figures
// y sont signalés « → Fig. 4 »). Un document introuvable sur le disque est tracé en rouge pointillé.

import type { ApercuDocument, DocumentVue } from './api'
import { colorer, langageDe } from './coloration'
import { echapper, enLigne, texteBrut } from './formules'
import { natureDocument, type Bloc } from './graphe-modele'

/** Hauteur de la tête (fichier) ou de l'onglet (dossier), px de mise en page. */
export const TETE_DOCUMENT = 22
/** Coin corné d'un fichier (px de mise en page). */
const CORNE = 12
/** Largeur de l'onglet d'un dossier (fraction du bloc) et de son biseau. */
const ONGLET = 0.64
const BISEAU = 9

export const COULEURS_DOCUMENT = {
  trait: '#000000',
  corne: '#f1f1f1',
  filet: '#d6d6d6',
  absent: '#b42318',
}

function nomDe(chemin: string): string {
  const nom = chemin.slice(chemin.lastIndexOf('/') + 1)
  return nom
}

function dossierDe(chemin: string): string {
  const i = chemin.lastIndexOf('/')
  return i < 0 ? '' : chemin.slice(0, i + 1)
}

/** Contour d'un document (ajouté au chemin courant) : x0, y0, w, h à l'écran, `t` = px d'écran par px de mise en page. */
export function silhouette(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, dossier: boolean, t: number): void {
  if (dossier) {
    const o = Math.max(8, w * ONGLET), tete = Math.min(h * 0.3, TETE_DOCUMENT * t), b = Math.min(o * 0.3, BISEAU * t)
    ctx.moveTo(x0, y0)
    ctx.lineTo(x0 + o - b, y0)
    ctx.lineTo(x0 + o, y0 + tete)
    ctx.lineTo(x0 + w, y0 + tete)
    ctx.lineTo(x0 + w, y0 + h)
    ctx.lineTo(x0, y0 + h)
    ctx.closePath()
  } else {
    const c = Math.min(w * 0.3, h * 0.3, CORNE * t)
    ctx.moveTo(x0, y0)
    ctx.lineTo(x0 + w - c, y0)
    ctx.lineTo(x0 + w, y0 + c)
    ctx.lineTo(x0 + w, y0 + h)
    ctx.lineTo(x0, y0 + h)
    ctx.closePath()
  }
}

/** Le pli du coin corné (fichier) ou le filet sous l'onglet (dossier), une fois le contour tracé. */
export function detailSilhouette(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, dossier: boolean, t: number): void {
  ctx.beginPath()
  if (dossier) {
    const o = Math.max(8, w * ONGLET), tete = Math.min(h * 0.3, TETE_DOCUMENT * t)
    ctx.moveTo(x0, y0 + tete)
    ctx.lineTo(x0 + o, y0 + tete)
    ctx.stroke()
  } else {
    const c = Math.min(w * 0.3, h * 0.3, CORNE * t)
    ctx.moveTo(x0 + w - c, y0)
    ctx.lineTo(x0 + w - c, y0 + c)
    ctx.lineTo(x0 + w, y0 + c)
    ctx.fillStyle = COULEURS_DOCUMENT.corne
    ctx.fill()
    ctx.stroke()
  }
}

/** « Script 1 — simulation.py » (tête sur le canevas, en attendant le HTML ou à mi-distance). */
export function titreDocument(b: Bloc): string {
  const d = b.document!
  return ` ${b.numero} — ${nomDe(d.chemin)}${d.genre === 'dossier' ? '/' : ''}`
}

// ─── HTML (niveau « contenu ») ───────────────────────────────────────────────

function taille(octets = 0): string {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 ** 2) return `${(octets / 1024).toFixed(0)} ko`
  return `${(octets / 1024 ** 2).toFixed(1)} Mo`
}

/** Ce que dit le pied à droite : lignes, pages, fichiers, taille. */
function mesure(d: DocumentVue): string {
  const a = d.apercu
  if (d.genre === 'dossier') return `${a.fichiers ?? 0} fichier${(a.fichiers ?? 0) > 1 ? 's' : ''}`
  if (a.pages) return `${a.pages} p.`
  if (a.lignes !== undefined && a.nature !== 'document') return `${a.lignes} l.`
  return taille(a.taille)
}

function pagePdf(): string {
  const traits = [1, 1, 0.7, 1, 1, 0.55, 1, 1, 0.8].map((l) => `<i style="width:${l * 100}%"></i>`).join('')
  return `<div class="gr-doc-page"><b></b>${traits}</div>`
}

function corps(d: DocumentVue, figures: Map<string, string>): string {
  const a: ApercuDocument = d.apercu
  const nature = natureDocument(d)
  if (nature === 'dossier') {
    // Cinq lignes tiennent dans la case : au-delà, quatre entrées et le compte du reste.
    const toutes = a.entrees ?? []
    const montrees = toutes.length + (a.autres ? 1 : 0) > 5 ? toutes.slice(0, 4) : toutes
    const autres = (a.autres ?? 0) + toutes.length - montrees.length
    const lignes = montrees.map((e) => {
      const fig = figures.get(`${d.chemin}/${e}`)
      return `<div>${echapper(e)}${fig ? ` <span class="gr-doc-fig">→ ${echapper(fig)}</span>` : ''}</div>`
    })
    if (autres) lignes.push(`<div class="gr-doc-plus">+ ${autres} autre${autres > 1 ? 's' : ''}</div>`)
    if (!lignes.length) lignes.push('<div class="gr-doc-plus">vide</div>')
    return `<div class="gr-doc-arbo">${lignes.join('')}</div>`
  }
  if (a.extrait?.length && (nature === 'script' || !a.pages)) {
    const langage = langageDe(d.chemin)
    if (nature === 'script' || langage) {
      return `<div class="gr-doc-code hl">${colorer(a.extrait.slice(0, 6).join('\n'), langage)}</div>`
    }
    return `<div class="gr-doc-texte">${a.extrait.slice(0, 6).map((l) => `<div>${echapper(l) || '&nbsp;'}</div>`).join('')}</div>`
  }
  if (a.colonnes?.length) {
    return `<div class="gr-doc-code"><div class="gr-doc-plus">colonnes</div>${a.colonnes.map((c) => `<div>${echapper(c)}</div>`).join('')}</div>`
  }
  if (a.cles?.length) {
    return `<div class="gr-doc-code"><div class="gr-doc-plus">clés</div>${a.cles.map((c) => `<div>${echapper(c)}</div>`).join('')}</div>`
  }
  if (a.pages !== undefined || nature === 'document') {
    const titre = a.titre_pdf ?? d.titre
    const description = d.description ? `<div class="gr-doc-desc">${enLigne(d.description)}</div>` : ''
    return `${pagePdf()}<div class="gr-doc-resume"><div>${enLigne(titre)}</div>${description}</div>`
  }
  return d.description ? `<div class="gr-doc-desc">${enLigne(d.description)}</div>` : ''
}

/** Clé du contenu HTML (le recomposer seulement s'il change). */
export function cleDocument(b: Bloc, figures: Map<string, string>): string {
  const d = b.document!
  const figs = d.genre === 'dossier' ? [...figures].filter(([f]) => f.startsWith(`${d.chemin}/`)).join(',') : ''
  return `${b.id}|${b.libelle}|${b.numero}|${d.chemin}|${d.modifie_le}|${d.present}|${d.titre}|${figs}`
}

/** Contenu HTML d'un document ; `figures` : fichier d'origine (relatif au projet) → « Fig. 4 ». */
export function htmlDocument(b: Bloc, figures: Map<string, string>): string {
  const d = b.document!
  const dossier = d.genre === 'dossier'
  const tete = `<div class="gr-doc-tete${dossier ? ' gr-doc-onglet' : ''}" style="height:${TETE_DOCUMENT}px">`
    + `<span class="gr-fig-mot">${echapper(b.libelle)} ${echapper(b.numero)}</span> — <span class="gr-doc-nom">${echapper(nomDe(d.chemin))}${dossier ? '/' : ''}</span></div>`
  const contenu = d.present
    ? corps(d, figures)
    : `<div class="gr-doc-absent">Introuvable sur le disque.<br>Dernier chemin connu :</div>`
  const pied = `<div class="gr-doc-pied"><span class="gr-doc-chemin">${echapper(d.present ? dossierDe(d.chemin) : d.chemin)}</span>`
    + `<span>${d.present ? echapper(mesure(d)) : ''}</span></div>`
  const info = [d.titre, d.description ?? ''].filter(Boolean).map((t) => texteBrut(t)).join(' — ')
  return `<div class="gr-doc${d.present ? '' : ' gr-doc-perdu'}" title="${echapper(info)}">${tete}<div class="gr-doc-corps">${contenu}</div>${pied}</div>`
}
