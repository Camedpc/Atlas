// Aperçu de fichiers : Markdown (marked + KaTeX), PDF (visionneuse du navigateur), images, CSV en tableau,
// et texte brut pour le reste (.py, .json, .log).
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js'
import katex from 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs'
import { AGENTS, GENRES, echapper, tailleLisible } from './bunker.js'
import { dateRelative, session } from './donnees.js'

const feuilleKatex = document.createElement('link')
feuilleKatex.rel = 'stylesheet'
feuilleKatex.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'
document.head.append(feuilleKatex)

const cache = new Map()
async function lireTexte(url) {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.statusText)))))
  return cache.get(url)
}

/** Markdown → HTML, formules $…$ et $$…$$ rendues par KaTeX, liens et images relatifs résolus depuis `base`. */
export function markdownVersHtml(source, base) {
  const formules = []
  const garder = (tex, bloc) => {
    formules.push(katex.renderToString(tex, { displayMode: bloc, throwOnError: false }))
    return `@@F${formules.length - 1}@@`
  }
  let texte = source.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => `\n\n${garder(tex.trim(), true)}\n\n`)
  texte = texte.replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, avant, tex) => avant + garder(tex, false))
  let html = marked.parse(texte, { gfm: true })
  html = html.replace(/@@F(\d+)@@/g, (_, i) => formules[Number(i)])
  if (base) {
    html = html.replace(/(src|href)="(?!https?:|#|data:)([^"]+)"/g, (_, attr, chemin) => `${attr}="${new URL(chemin, base).href}"`)
  }
  return html
}

/** En-tête d'aperçu : chemin, agent, date, taille, lien « ouvrir ». */
export function enTeteApercu(f, { chemin = f.relatif, suite = '' } = {}) {
  const dossier = chemin.includes('/') ? chemin.slice(0, chemin.lastIndexOf('/') + 1) : ''
  return `<div class="apercu-tete">
    <span class="chemin" title="${echapper(f.chemin)}">${echapper(dossier)}<b>${echapper(f.nom)}</b></span>
    <span class="apercu-meta">${AGENTS[f.agent].libelle} · ${dateRelative(f.modifie)} · ${tailleLisible(f.taille)}</span>
    ${suite}
    <a class="icone" href="${f.url}" target="_blank" rel="noopener" title="Ouvrir dans un nouvel onglet" style="display:grid;place-items:center;width:28px;height:28px;color:var(--texte-2)">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 2h4v4M12 2 6.5 7.5M10 8.5V12H2V4h3.5"/></svg></a>
  </div>`
}

/** Rend le contenu du fichier `f` dans `el` (qui doit pouvoir défiler). */
export async function rendreContenu(el, f) {
  el.dataset.chemin = f.chemin
  const encore = () => el.dataset.chemin === f.chemin
  switch (f.genre) {
    case 'pdf':
      rendrePdf(el, f, encore)
      return
    case 'image':
      el.innerHTML = `<div class="apercu-image"><img src="${f.url}" alt="${echapper(f.nom)}"></div>`
      return
  }
  el.innerHTML = '<div class="apercu-vide">Chargement…</div>'
  let texte
  try {
    texte = await lireTexte(f.url)
  } catch {
    if (encore()) el.innerHTML = '<div class="apercu-vide">Fichier illisible.</div>'
    return
  }
  if (!encore()) return
  if (f.genre === 'markdown') {
    el.innerHTML = `<article class="md">${markdownVersHtml(texte, f.url)}</article>`
  } else if (f.genre === 'donnees') {
    el.innerHTML = tableauCsv(texte)
  } else {
    el.innerHTML = `<pre class="apercu-texte">${echapper(texte)}</pre>`
  }
}

// PDF rendu page par page par pdf.js (la visionneuse intégrée du navigateur peut être désactivée).
let pdfjs
async function rendrePdf(el, f, encore) {
  el.innerHTML = '<div class="apercu-vide">Chargement du PDF…</div>'
  try {
    if (!pdfjs) {
      pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs')
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs'
    }
    const doc = await pdfjs.getDocument(f.url).promise
    if (!encore()) return
    el.innerHTML = '<div class="apercu-pdf"></div>'
    const pages = el.firstElementChild
    const largeur = Math.max(240, Math.min(el.clientWidth - 48, 900))
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      if (!encore()) return
      const base = page.getViewport({ scale: 1 })
      const densite = window.devicePixelRatio || 1
      const vue = page.getViewport({ scale: (largeur / base.width) * densite })
      const toile = document.createElement('canvas')
      toile.width = vue.width
      toile.height = vue.height
      toile.style.width = `${largeur}px`
      pages.append(toile)
      await page.render({ canvasContext: toile.getContext('2d'), viewport: vue }).promise
    }
  } catch (e) {
    if (encore()) el.innerHTML = `<div class="apercu-vide"><div>PDF illisible ici. <a href="${f.url}" target="_blank" rel="noopener">Ouvrir le fichier</a></div></div>`
  }
}

function tableauCsv(texte) {
  const lignes = texte.trim().split('\n').map((l) => l.split(','))
  const [tete, ...corps] = lignes
  return `<table class="tableau-donnees"><thead><tr>${tete.map((c) => `<th>${echapper(c)}</th>`).join('')}</tr></thead>
    <tbody>${corps.map((l) => `<tr>${l.map((c) => `<td>${echapper(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

/** Aperçu complet (en-tête + corps) dans `el`. Renvoie l'élément de corps. */
export function afficherApercu(el, f, options = {}) {
  el.classList.add('apercu')
  if (!f) {
    el.innerHTML = `<div class="apercu-vide"><div>${options.vide ?? 'Choisissez un fichier pour l’afficher ici.'}</div></div>`
    return null
  }
  el.innerHTML = `${enTeteApercu(f, options)}<div class="apercu-corps"></div>`
  const corps = el.querySelector('.apercu-corps')
  rendreContenu(corps, f)
  return corps
}

/** Première ligne de titre d'un Markdown (pour les vignettes et les listes). */
export async function titreMarkdown(f) {
  if (f.genre !== 'markdown') return f.nom
  const t = await lireTexte(f.url)
  return t.match(/^#\s+(.+)$/m)?.[1] ?? f.nom
}

/** Extrait brut d'un fichier texte (sans Markdown), pour les vignettes. */
export async function extrait(f, n = 220) {
  const t = await lireTexte(f.url)
  return t
    .replace(/^#.*$/gm, '')
    .replace(/[*_`>|$\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n)
}

export { lireTexte, GENRES }
export const libelleSession = (id) => session(id)?.titre ?? id
