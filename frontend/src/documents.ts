// Vue Documents (panneau de droite) : l'arborescence du dossier de l'espace dans le bunker, et l'aperçu du
// fichier choisi — Markdown (avec formules), PDF (pdf.js, la visionneuse du navigateur pouvant être
// désactivée), images, CSV en tableau, texte brut pour le reste. Les dossiers de session portent le titre de
// leur conversation. Les fichiers passent par fetch (jeton d'accès en en-tête), puis par une URL blob.
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { api, type Conversation, type NoeudFichier, type Projet } from './api'
import { echapper, rendre } from './rendu'

const IMAGES = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'])
const TEXTES = new Set([
  'txt', 'py', 'json', 'log', 'toml', 'yaml', 'yml', 'js', 'ts', 'sh', 'tex', 'bib', 'r', 'jl', 'c', 'cpp', 'h',
  'ipynb', 'xml', 'html', 'css', 'ini', 'cfg', 'out', 'err',
])
// Au-delà, le texte est tronqué dans l'aperçu (le fichier reste ouvrable en entier).
const TEXTE_MAX = 300_000

type Genre = 'markdown' | 'image' | 'pdf' | 'tableau' | 'texte' | 'autre'

function genre(nom: string): Genre {
  const ext = nom.includes('.') ? nom.slice(nom.lastIndexOf('.') + 1).toLowerCase() : ''
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (IMAGES.has(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'csv' || ext === 'tsv') return 'tableau'
  if (TEXTES.has(ext) || !ext) return 'texte'
  return 'autre'
}

const ICONES: Record<Genre | 'dossier', string> = {
  dossier: '▸',
  markdown: '¶',
  image: '▣',
  pdf: '▤',
  tableau: '▦',
  texte: '≡',
  autre: '·',
}

function taille(octets = 0): string {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 ** 2) return `${(octets / 1024).toFixed(1)} ko`
  return `${(octets / 1024 ** 2).toFixed(1)} Mo`
}

function tableau(texte: string, separateur: string): string {
  const lignes = texte.trim().split(/\r?\n/).slice(0, 500).map((l) => l.split(separateur))
  const [tete = [], ...corps] = lignes
  return `<table class="tableau-donnees"><thead><tr>${tete.map((c) => `<th>${echapper(c)}</th>`).join('')}</tr></thead>
    <tbody>${corps.map((l) => `<tr>${l.map((c) => `<td>${echapper(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

let pdfjs: typeof import('pdfjs-dist') | undefined

export class VueDocuments {
  private arbreEl: HTMLElement
  private racineEl: HTMLElement
  private apercu: HTMLElement
  private projet: Projet | null = null
  private titres = new Map<string, string>()
  private arbre: NoeudFichier | null = null
  private ouverts = new Set<string>(['sessions', 'doc_projet'])
  private choisi: string | null = null
  private visible = false
  private aJour = false
  private url: string | null = null
  private generation = 0

  constructor(racine: HTMLElement) {
    racine.innerHTML = `
      <div class="docs">
        <div class="docs-arbre">
          <div class="docs-tete"><span class="docs-racine"></span>
            <button type="button" class="icone docs-recharger" title="Recharger les fichiers" aria-label="Recharger les fichiers">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5"/></svg>
            </button></div>
          <div class="arbo" role="tree"></div>
        </div>
        <div class="docs-apercu"></div>
      </div>`
    this.arbreEl = racine.querySelector('.arbo')!
    this.racineEl = racine.querySelector('.docs-racine')!
    this.apercu = racine.querySelector('.docs-apercu')!
    racine.querySelector('.docs-recharger')!.addEventListener('click', () => void this.charger())
    this.arbreEl.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-chemin]')
      if (!el) return
      const chemin = el.dataset.chemin!
      if (el.dataset.type === 'dossier') {
        if (this.ouverts.has(chemin)) this.ouverts.delete(chemin)
        else this.ouverts.add(chemin)
        this.dessiner()
      } else void this.montrer(chemin)
    })
    this.vider()
  }

  /** Nouvel espace (ou nouvelle liste de sessions, pour nommer leurs dossiers). */
  definirProjet(projet: Projet | null, conversations: Conversation[]) {
    this.titres = new Map(conversations.map((c) => [c.id, c.titre]))
    if (projet?.id !== this.projet?.id) {
      this.projet = projet
      this.arbre = null
      this.choisi = null
      this.ouverts = new Set(['sessions', 'doc_projet'])
      this.vider()
      this.aJour = false
    }
    this.racineEl.textContent = projet ? `${projet.dossier}/` : ''
    if (this.visible) void this.charger()
    else this.dessiner()
  }

  /** Déplie le dossier de la session ouverte. */
  revelerSession(id: string | null) {
    if (!id) return
    this.ouverts.add('sessions').add(`sessions/${id}`)
    this.aJour = false
    if (this.visible) void this.charger()
  }

  /** Montre un fichier du projet (chemin relatif au projet) : déplie ses dossiers et ouvre son aperçu. */
  async ouvrir(chemin: string) {
    const parties = chemin.split('/')
    for (let i = 1; i < parties.length; i++) this.ouverts.add(parties.slice(0, i).join('/'))
    if (!this.aJour) await this.charger()
    const n = this.noeud(chemin)
    if (n?.type === 'dossier') {
      this.ouverts.add(chemin)
      this.choisi = chemin
      this.dessiner()
    } else await this.montrer(chemin)
    this.arbreEl.querySelector(`[data-chemin="${CSS.escape(chemin)}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  afficher(visible: boolean) {
    this.visible = visible
    if (visible && !this.aJour) void this.charger()
  }

  private async charger() {
    if (!this.projet) {
      this.arbreEl.innerHTML = '<p class="docs-vide">Aucun espace ouvert.</p>'
      return
    }
    const projet = this.projet
    try {
      const arbre = await api.fichiers(projet.id)
      if (projet !== this.projet) return
      this.arbre = arbre
      this.aJour = true
      this.dessiner()
    } catch (e) {
      this.arbreEl.innerHTML = `<p class="docs-vide">Fichiers indisponibles : ${echapper(e instanceof Error ? e.message : String(e))}</p>`
    }
  }

  private libelle(n: NoeudFichier): string {
    const parties = n.chemin.split('/')
    if (n.type === 'dossier' && parties.length === 2 && parties[0] === 'sessions') return this.titres.get(n.nom) ?? n.nom
    return n.nom
  }

  private dessiner() {
    if (!this.arbre) return
    const lignes: string[] = []
    const parcourir = (noeuds: NoeudFichier[], profondeur: number) => {
      for (const n of noeuds) {
        const ouvert = this.ouverts.has(n.chemin)
        const g = n.type === 'dossier' ? 'dossier' : genre(n.nom)
        const icone = g === 'dossier' ? `<span class="chevron${ouvert ? ' ouvert' : ''}">▸</span>` : `<span class="type">${ICONES[g]}</span>`
        const titre = n.type === 'dossier' && this.libelle(n) !== n.nom ? `${n.nom} — ${this.libelle(n)}` : n.chemin
        lignes.push(`<div class="noeud-fichier${n.chemin === this.choisi ? ' choisi' : ''}" role="treeitem"
          data-chemin="${echapper(n.chemin)}" data-type="${n.type}" style="padding-left:${8 + profondeur * 14}px" title="${echapper(titre)}">
          ${icone}<span class="nom">${echapper(this.libelle(n))}</span>
          ${n.type === 'dossier' ? `<span class="compte">${n.enfants?.length ?? 0}</span>` : ''}</div>`)
        if (n.type === 'dossier' && ouvert) parcourir(n.enfants ?? [], profondeur + 1)
      }
    }
    parcourir(this.arbre.enfants ?? [], 0)
    this.arbreEl.innerHTML =
      lignes.join('') +
      (this.arbre.tronque ? '<p class="docs-vide">Liste tronquée : trop de fichiers.</p>' : '') +
      (lignes.length ? '' : '<p class="docs-vide">Cet espace n’a pas encore de fichiers.</p>')
  }

  private vider() {
    this.liberer()
    this.apercu.innerHTML = `<div class="apercu-vide"><div>Choisis un fichier de l’espace.<br>
      <small>Rapports, journaux, figures, PDF, scripts.</small></div></div>`
  }

  private liberer() {
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
  }

  private noeud(chemin: string): NoeudFichier | undefined {
    const chercher = (noeuds: NoeudFichier[] = []): NoeudFichier | undefined => {
      for (const n of noeuds) {
        if (n.chemin === chemin) return n
        if (n.type === 'dossier' && chemin.startsWith(`${n.chemin}/`)) return chercher(n.enfants)
      }
      return undefined
    }
    return chercher(this.arbre?.enfants)
  }

  private async montrer(chemin: string) {
    if (!this.projet) return
    this.choisi = chemin
    this.dessiner()
    const n = this.noeud(chemin)
    const nom = chemin.slice(chemin.lastIndexOf('/') + 1)
    const dossier = chemin.slice(0, chemin.length - nom.length)
    const generation = ++this.generation
    this.liberer()
    const date = n?.modifie ? new Date(n.modifie * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''
    this.apercu.innerHTML = `
      <div class="apercu-tete">
        <span class="chemin" title="${echapper(chemin)}">${echapper(dossier)}<b>${echapper(nom)}</b></span>
        <span class="apercu-meta">${[date, taille(n?.taille)].filter(Boolean).join(' · ')}</span>
        <a class="icone apercu-ouvrir" target="_blank" rel="noopener" title="Ouvrir dans un nouvel onglet" aria-label="Ouvrir dans un nouvel onglet" hidden>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 2h4v4M12 2 6.5 7.5M10 8.5V12H2V4h3.5"/></svg></a>
        <a class="icone apercu-telecharger" title="Télécharger" aria-label="Télécharger" hidden>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M7 2v7M4 6.5 7 9.5l3-3M2.5 12h9"/></svg></a>
      </div>
      <div class="apercu-corps"><div class="apercu-vide">Chargement…</div></div>`
    const corps = this.apercu.querySelector<HTMLElement>('.apercu-corps')!
    let blob: Blob
    try {
      blob = await api.fichier(this.projet.id, chemin)
    } catch (e) {
      if (generation === this.generation) corps.innerHTML = `<div class="apercu-vide">Fichier illisible : ${echapper(String(e))}</div>`
      return
    }
    if (generation !== this.generation) return
    this.url = URL.createObjectURL(blob)
    const ouvrir = this.apercu.querySelector<HTMLAnchorElement>('.apercu-ouvrir')!
    const telecharger = this.apercu.querySelector<HTMLAnchorElement>('.apercu-telecharger')!
    ouvrir.href = telecharger.href = this.url
    telecharger.download = nom
    ouvrir.hidden = telecharger.hidden = false

    const g = genre(nom)
    if (g === 'image') {
      corps.innerHTML = `<div class="apercu-image"><img src="${this.url}" alt="${echapper(nom)}" /></div>`
    } else if (g === 'pdf') {
      await this.rendrePdf(corps, blob, generation)
    } else if (g === 'autre' && blob.size > TEXTE_MAX) {
      corps.innerHTML = '<div class="apercu-vide">Pas d’aperçu pour ce type de fichier. Il reste téléchargeable.</div>'
    } else {
      const texte = await blob.text()
      if (generation !== this.generation) return
      const extrait = texte.length > TEXTE_MAX ? `${texte.slice(0, TEXTE_MAX)}\n…` : texte
      if (g === 'markdown') corps.innerHTML = `<article class="md">${rendre(extrait)}</article>`
      else if (g === 'tableau') corps.innerHTML = tableau(extrait, nom.endsWith('.tsv') ? '\t' : ',')
      else if (g === 'autre' && extrait.includes('\u0000')) {
        corps.innerHTML = '<div class="apercu-vide">Pas d’aperçu pour ce type de fichier. Il reste téléchargeable.</div>'
      } else corps.innerHTML = `<pre class="apercu-texte">${echapper(extrait)}</pre>`
    }
  }

  private async rendrePdf(corps: HTMLElement, blob: Blob, generation: number) {
    try {
      if (!pdfjs) {
        pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker
      }
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
      if (generation !== this.generation) return
      corps.innerHTML = '<div class="apercu-pdf"></div>'
      const pages = corps.firstElementChild as HTMLElement
      const largeur = Math.max(240, Math.min(corps.clientWidth - 48, 900))
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        if (generation !== this.generation) return
        const densite = window.devicePixelRatio || 1
        const vue = page.getViewport({ scale: (largeur / page.getViewport({ scale: 1 }).width) * densite })
        const toile = document.createElement('canvas')
        toile.width = vue.width
        toile.height = vue.height
        toile.style.width = `${largeur}px`
        pages.append(toile)
        await page.render({ canvas: toile, viewport: vue }).promise
      }
    } catch (e) {
      console.warn(e)
      if (generation === this.generation) {
        corps.innerHTML = '<div class="apercu-vide">PDF illisible ici : ouvre-le dans un nouvel onglet.</div>'
      }
    }
  }
}
