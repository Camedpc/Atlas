// Agent graph : chaque agent est un nœud à broches, façon Blueprint d'Unreal Engine, en thème clair
// (porté de prototypes/vue-sous-agents/options/blueprint, branche visu/vue-sous-agents).
// Gauche → droite : l'événement « Question de Camille » déclenche l'orchestrateur ; chaque lancement de
// sous-agent part d'une broche d'exécution « Lance → … » vers la broche d'entrée de l'enfant, et la broche
// « contexte » alimente la broche « mission » des enfants. Tout est recalculé depuis `etat` à chaque image ;
// seules les positions glissent. Cliquer un nœud le sélectionne : le fil montre sa conversation et la saisie
// lui écrit (pas de panneau de détails : la conversation à gauche suffit).
import './agentgraph.css'
import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import type { Agent } from './api'
import {
  RACINE,
  VOIX,
  couleurRole,
  estFini,
  estVivant,
  etat,
  formatDuree,
  formatTokens,
  iconeRole,
  LIBELLES_ETAT,
  libelleRole,
  mission,
} from './agents'

// Géométrie (unités du monde) : doit rester alignée sur agentgraph.css
const L = 300 // largeur d'un nœud agent
const L_EVT = 250 // largeur du nœud événement
const TETE = 42
const MARGE = 6 // marge verticale du corps
const RANG = 22 // hauteur d'une rangée de broches
const PIED = 22
const PIN = 11 // distance du centre d'une broche au bord du nœud
const ECART_X = 110
const COL = L + ECART_X
const X0 = L_EVT + ECART_X
const ECART_Y = 18
const COMMENT = { haut: 42, bas: 14, cote: 18 }
const K_LISIBLE = 0.55 // en dessous, on ne cadre plus tout : on suit les agents au travail
const PERIODE = 2.6 // secondes pour qu'une impulsion parcoure un fil
const DELAI_REPLI = 5 // secondes entre la fin d'un sous-graphe et sa réduction

const TYPES: Record<string, string> = { texte: 'texte', entier: 'entier' }
const SVG_EXEC = '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M1.5 1.5H6.6L10.6 6L6.6 10.5H1.5Z"/></svg>'
const NS = 'http://www.w3.org/2000/svg'

const maintenant = () => Date.now() / 1000

interface LigneBroche {
  k: string
  genre: string
  lab: string
  champ?: boolean
  bouton?: string
  pic?: string
}

interface Spec {
  g: LigneBroche[]
  d: LigneBroche[]
  pied: boolean
  rangs: number
  h: number
}

interface NoeudDispo {
  cle: string
  agent: Agent
  enfants: NoeudDispo[]
  reduit: boolean
  replieManuel: boolean
  nb: number
  spec: Spec
  ph: number
  pb: number
  span: number
  bande: number
  tx: number
  ty: number
  desc: string[]
}

function texte(el: any, v: string) {
  if (el.__v !== v) {
    el.__v = v
    el.textContent = v
    el.title = v
  }
}

function basculerClasse(r: any, cls: string) {
  if (r.cls !== cls) {
    r.cls = cls
    r.el.className = cls
  }
}

export class AgentGraph {
  private scene: HTMLElement
  private monde: HTMLElement
  private coucheComment: HTMLElement
  private coucheNoeuds: HTMLElement
  private gDonnees: SVGGElement
  private gExec: SVGGElement
  private gImpulsions: SVGGElement
  private boutonRecadrer: HTMLElement
  private vide: HTMLElement
  private rendus = new Map<string, any>()
  private fils = new Map<string, any>()
  private impulsions = new Map<string, SVGCircleElement>()
  private commentaires = new Map<string, any>()
  private deplies = new Set<string>()
  private auto = true
  private premierCadrage = true
  private vue = { x: 0, y: 0, k: 1 }
  private taille = { l: 0, h: 0 }
  private zoom: ZoomBehavior<HTMLElement, unknown>
  private actif = false
  private image = 0
  private avant = 0
  private readonly surEcrire: () => void

  constructor(scene: HTMLElement, surEcrire: () => void) {
    this.scene = scene
    this.surEcrire = surEcrire
    scene.classList.add('bp')
    scene.innerHTML = `
      <div class="monde">
        <div class="commentaires"></div>
        <svg class="fils"><g class="g-donnees"></g><g class="g-exec"></g><g class="g-impulsions"></g></svg>
        <div class="noeuds"></div>
      </div>
      <p class="bp-vide">Aucun agent pour l’instant : pose une question à l’orchestrateur.</p>
      <div class="legende-bp">
        <span><span class="pin exec">${SVG_EXEC}</span>exécution</span>
        <span><i class="l-exec"></i>lancement</span>
        <span><i class="l-actif"></i>agent au travail</span>
        <span><i class="l-donnee"></i>donnée</span>
        ${Object.entries(TYPES).map(([k, v]) => `<span><span class="pin donnee t-${k}"><i></i></span>${v}</span>`).join('')}
        <span class="aide">clic : écrire à l’agent · molette : zoom · double-clic : recadrer</span>
      </div>
      <button class="recadrer" title="Recadrer automatiquement (double-clic)">Recadrer</button>`

    this.monde = scene.querySelector('.monde')!
    this.coucheComment = scene.querySelector('.commentaires')!
    this.coucheNoeuds = scene.querySelector('.noeuds')!
    this.gDonnees = scene.querySelector('.g-donnees')!
    this.gExec = scene.querySelector('.g-exec')!
    this.gImpulsions = scene.querySelector('.g-impulsions')!
    this.boutonRecadrer = scene.querySelector('.recadrer')!
    this.vide = scene.querySelector('.bp-vide')!

    new ResizeObserver(() => {
      this.taille = { l: scene.clientWidth, h: scene.clientHeight }
    }).observe(scene)

    this.zoom = d3zoom<HTMLElement, unknown>()
      .scaleExtent([0.2, 2])
      .clickDistance(5)
      .filter(
        (e: any) =>
          !e.target.closest('.legende-bp, .recadrer') && (!e.ctrlKey || e.type === 'wheel') && !e.button,
      )
      .on('zoom', (e: any) => {
        this.vue = { x: e.transform.x, y: e.transform.y, k: e.transform.k }
        this.appliquerVue()
        if (e.sourceEvent) {
          this.auto = false
          this.boutonRecadrer.classList.add('visible')
        }
      })
    select(scene).call(this.zoom).on('dblclick.zoom', null)

    this.boutonRecadrer.addEventListener('click', () => this.recadrer())
    scene.addEventListener('dblclick', (e) => {
      if (!(e.target as HTMLElement).closest('.noeud, .legende-bp')) this.recadrer()
    })
    this.coucheNoeuds.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.noeud')
      if (!el || !el.dataset.id) return
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-b]')
      if (b) {
        if (b.dataset.b === 'deplier') this.deplies.add(el.dataset.id)
        else this.deplies.delete(el.dataset.id)
        return
      }
      etat.selectionner(el.dataset.id)
      this.surEcrire()
    })

    this.appliquerVue()
  }

  /** Lance ou arrête la boucle de rendu (seulement quand l'onglet est visible). */
  afficher(visible: boolean) {
    this.actif = visible
    cancelAnimationFrame(this.image)
    if (!visible) return
    this.taille = { l: this.scene.clientWidth, h: this.scene.clientHeight }
    this.premierCadrage = this.auto
    this.avant = performance.now()
    const boucle = (t: number) => {
      const dt = Math.min(0.1, (t - this.avant) / 1000)
      this.avant = t
      this.tic(dt)
      if (this.actif) this.image = requestAnimationFrame(boucle)
    }
    this.image = requestAnimationFrame(boucle)
  }

  /** Nouvelle conversation : on repart d'une scène vide. */
  reinitialiser() {
    for (const r of this.rendus.values()) r.el.remove()
    for (const f of this.fils.values()) f.path.remove()
    for (const c of this.impulsions.values()) c.remove()
    for (const c of this.commentaires.values()) c.el.remove()
    this.rendus.clear()
    this.fils.clear()
    this.impulsions.clear()
    this.commentaires.clear()
    this.deplies.clear()
    this.recadrer()
    this.premierCadrage = true
  }

  // ─── Zoom et déplacement ───

  private appliquerVue() {
    const { x, y, k } = this.vue
    this.monde.style.transform = `translate(${x}px,${y}px) scale(${k})`
    const g = 128 * k
    const f = 16 * k
    this.scene.style.backgroundSize = `${g}px ${g}px, ${g}px ${g}px, ${f}px ${f}px, ${f}px ${f}px`
    this.scene.style.backgroundPosition = `${x}px ${y}px`
  }

  private recadrer() {
    this.auto = true
    this.boutonRecadrer.classList.remove('visible')
  }

  // Garde tout le graphe visible, tant que l'utilisateur n'a pas pris la main.
  private cadrer(dt: number) {
    if (!this.auto || !this.taille.l) return
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const r of this.rendus.values()) {
      x0 = Math.min(x0, r.tx)
      x1 = Math.max(x1, r.tx + r.l)
      y0 = Math.min(y0, r.ty)
      y1 = Math.max(y1, r.ty + r.h)
    }
    for (const c of this.commentaires.values()) {
      if (!c.boite) continue
      y0 = Math.min(y0, c.boite.y)
      y1 = Math.max(y1, c.boite.y + c.boite.h)
      x1 = Math.max(x1, c.boite.x + c.boite.l)
    }
    if (!Number.isFinite(x0)) return
    const m = { g: 32, d: 32, h: 28, b: 64 }
    const lu = Math.max(120, this.taille.l - m.g - m.d)
    const hu = Math.max(120, this.taille.h - m.h - m.b)
    let k = Math.min(1, lu / (x1 - x0), hu / (y1 - y0))
    let cy = m.h + Math.max(0, (hu - (y1 - y0) * k) / 2) - y0 * k
    if (k < K_LISIBLE) {
      // Graphe trop haut pour rester lisible : on garde la largeur et on centre sur les agents au travail.
      k = Math.max(0.3, Math.min(K_LISIBLE, lu / (x1 - x0)))
      let a0 = Infinity
      let a1 = -Infinity
      for (const [cle, r] of this.rendus) {
        const a = etat.get(cle)
        if (!a || !estVivant(a)) continue
        a0 = Math.min(a0, r.ty)
        a1 = Math.max(a1, r.ty + r.h)
      }
      if (!Number.isFinite(a0)) {
        a0 = y0
        a1 = y1
      }
      cy = m.h + hu / 2 - ((a0 + a1) / 2) * k
      cy = Math.min(m.h - y0 * k, Math.max(m.h + hu - y1 * k, cy))
    }
    const cx = m.g + Math.max(0, (lu - (x1 - x0) * k) / 2) - x0 * k
    const f = this.premierCadrage ? 1 : 1 - Math.exp(-dt * 3)
    this.premierCadrage = false
    const nk = this.vue.k + (k - this.vue.k) * f
    const nx = this.vue.x + (cx - this.vue.x) * f
    const ny = this.vue.y + (cy - this.vue.y) * f
    if (Math.abs(nx - this.vue.x) + Math.abs(ny - this.vue.y) + Math.abs(nk - this.vue.k) * 500 < 0.05) return
    select(this.scene).call(this.zoom.transform, zoomIdentity.translate(nx, ny).scale(nk))
  }

  // ─── Graphe affiché ───

  private sousArbre(a: Agent, acc: Agent[] = []): Agent[] {
    for (const e of etat.enfants(a)) {
      acc.push(e)
      this.sousArbre(e, acc)
    }
    return acc
  }

  // Un sous-graphe entièrement fini depuis un moment se réduit en une rangée « Sous-graphe réduit »,
  // comme un « Collapse Nodes » d'Unreal, sauf s'il contient la sélection.
  private construire(a: Agent): NoeudDispo {
    const n = { cle: a.chemin, agent: a, enfants: [], reduit: false, replieManuel: false, nb: 0 } as unknown as NoeudDispo
    const enfants = etat.enfants(a)
    if (enfants.length && a.chemin !== RACINE && a.chemin !== VOIX && estFini(a)) {
      const desc = this.sousArbre(a)
      if (desc.every(estFini)) {
        const derniere = Math.max(a.fin ?? 0, ...desc.map((x) => x.fin ?? 0))
        const mur = maintenant() - derniere > DELAI_REPLI
        const contientSelection = desc.some((x) => x.chemin === etat.selection)
        if (mur && !contientSelection) {
          if (!this.deplies.has(a.chemin)) {
            n.reduit = true
            n.nb = desc.length
            return n
          }
          n.replieManuel = true
        }
      }
    }
    n.enfants = enfants.map((e) => this.construire(e))
    return n
  }

  // Rangées de broches d'un nœud : à gauche les entrées, à droite les sorties.
  private lignes(n: NoeudDispo): Spec {
    const a = n.agent
    const compact = estFini(a) && etat.selection !== a.chemin
    const g: LigneBroche[] = [
      { k: 'exec', genre: 'exec', lab: '' },
      { k: 'mission', genre: 'texte', lab: 'mission' },
    ]
    if (!compact) g.push({ k: 'modele', genre: 'texte', lab: 'modèle', champ: true })
    const d: LigneBroche[] = [{ k: 'fin', genre: 'exec', lab: 'Terminé' }]
    if (n.reduit) {
      d.push({ k: 'deplier', genre: 'action', lab: `Sous-graphe réduit · ${n.nb} agents`, bouton: 'deplier', pic: '+' })
    } else {
      for (const e of etat.enfants(a)) d.push({ k: `l:${e.chemin}`, genre: 'exec', lab: `Lance → ${mission(e)}` })
      if (n.replieManuel) d.push({ k: 'replier', genre: 'action', lab: 'Réduire le sous-graphe', bouton: 'replier', pic: '−' })
    }
    if (etat.enfants(a).length) d.push({ k: 'contexte', genre: 'texte', lab: 'contexte' })
    if (!compact) d.push({ k: 'tokens', genre: 'entier', lab: 'tokens' }, { k: 'outils', genre: 'entier', lab: 'outils' })
    d.push({ k: 'resultat', genre: 'texte', lab: 'résultat' })
    const rangs = Math.max(g.length, d.length)
    return { g, d, pied: !compact, rangs, h: 2 + TETE + 2 * MARGE + rangs * RANG + (compact ? 0 : PIED) }
  }

  // Un sous-graphe occupe une bande verticale ; les directeurs réservent la place de leur boîte « Comment ».
  private mesurer(n: NoeudDispo): number {
    n.spec = this.lignes(n)
    const dir = n.agent.role === 'directeur_de_labo'
    n.ph = dir ? COMMENT.haut : 0
    n.pb = dir ? COMMENT.bas : 0
    n.span = n.enfants.length
      ? n.enfants.reduce((s, e) => s + this.mesurer(e), 0) + ECART_Y * (n.enfants.length - 1)
      : 0
    n.bande = Math.max(n.spec.h, n.span) + n.ph + n.pb
    return n.bande
  }

  private poser(n: NoeudDispo, profondeur: number, haut: number, acc: NoeudDispo[]) {
    const interieur = haut + n.ph
    const contenu = Math.max(n.spec.h, n.span)
    n.tx = X0 + profondeur * COL
    n.ty = interieur + (contenu - n.spec.h) / 2
    n.desc = []
    acc.push(n)
    let y = interieur + (contenu - n.span) / 2
    for (const e of n.enfants) {
      this.poser(e, profondeur + 1, y, acc)
      n.desc.push(e.cle, ...e.desc)
      y += e.bande + ECART_Y
    }
  }

  // ─── Nœuds ───

  private broche(genre: string, plein = false): string {
    if (genre === 'exec') return `<span class="pin exec${plein ? ' plein' : ''}">${SVG_EXEC}</span>`
    if (genre === 'action') return ''
    return `<span class="pin donnee t-${genre}${plein ? ' plein' : ''}"><i></i></span>`
  }

  private creerNoeud(a: Agent) {
    const el = document.createElement('div')
    el.dataset.id = a.chemin
    el.style.setProperty('--c', couleurRole(a.role))
    el.style.width = `${L}px`
    el.innerHTML = `
      <div class="tete">
        <span class="ico"></span>
        <div class="tt"><b></b><span></span></div>
        <span class="chrono"></span>
      </div>
      <div class="corps"><div class="col g"></div><div class="col d"></div></div>
      <div class="pied"><span class="etiq"></span><span class="txt"></span></div>
      <span class="badge">Erreur</span>`
    return {
      type: 'agent',
      el,
      l: L,
      ico: el.querySelector('.ico'),
      role: el.querySelector('.tt b'),
      mission: el.querySelector('.tt span'),
      chrono: el.querySelector('.chrono'),
      colG: el.querySelector('.col.g'),
      colD: el.querySelector('.col.d'),
      pied: el.querySelector('.pied'),
      etiq: el.querySelector('.etiq'),
      txt: el.querySelector('.pied .txt'),
    } as any
  }

  private htmlRang(ligne: LigneBroche, cote: 'g' | 'd'): string {
    const cls = `rang${ligne.genre === 'exec' ? ' exec' : ''}${ligne.bouton ? ' bouton' : ''}`
    const b = ligne.bouton ? ` data-b="${ligne.bouton}"` : ''
    const titre = ligne.genre in TYPES ? ` title="${ligne.lab} : ${TYPES[ligne.genre]}"` : ''
    const relie = ligne.k === 'exec' || ligne.k === 'mission' || ligne.k.startsWith('l:') || ligne.k === 'contexte'
    const pin = ligne.genre === 'action' ? `<span class="pin action">${ligne.pic}</span>` : this.broche(ligne.genre, relie)
    const lab = `<span class="lab"${titre}></span>`
    if (cote === 'g') {
      return `<div class="${cls}" data-k="${ligne.k}"${b}>${pin}${lab}${ligne.champ ? '<span class="champ"></span>' : ''}</div>`
    }
    return `<div class="${cls}" data-k="${ligne.k}"${b}>${pin}<span class="val"></span>${lab}</div>`
  }

  private rangee(r: any, n: NoeudDispo) {
    const s = n.spec
    const sig = `${s.g.map((x) => x.k).join(',')}|${s.d.map((x) => x.k + x.lab).join(',')}|${s.pied}`
    if (r.sig === sig) return
    r.sig = sig
    r.colG.innerHTML = s.g.map((x) => this.htmlRang(x, 'g')).join('')
    r.colD.innerHTML = s.d.map((x) => this.htmlRang(x, 'd')).join('')
    // Libellés posés en texte : ils viennent des noms de tâche choisis par les agents.
    const poserLibelles = (col: HTMLElement, lignes: LigneBroche[]) =>
      col.querySelectorAll<HTMLElement>('.rang').forEach((el, i) => {
        el.querySelector('.lab')!.textContent = lignes[i].lab
      })
    poserLibelles(r.colG, s.g)
    poserLibelles(r.colD, s.d)
    r.pied.style.display = s.pied ? '' : 'none'
    r.v = {
      modele: r.colG.querySelector('[data-k="modele"] .champ'),
      tokens: r.colD.querySelector('[data-k="tokens"] .val'),
      outils: r.colD.querySelector('[data-k="outils"] .val'),
      resultat: r.colD.querySelector('[data-k="resultat"] .val'),
      fin: r.colD.querySelector('[data-k="fin"] .pin'),
    }
    if (r.v.resultat) r.v.resultat.classList.add('v-resultat')
    r.finPlein = undefined
  }

  private etiquettePied(a: Agent): [string, string] {
    if (a.etat === 'actif' && a.chemin === VOIX) return [a.outil ?? 'En appel', a.activite]
    if (a.etat === 'actif') return [a.outil ?? 'Réfléchit', a.activite]
    if (a.etat === 'attend') {
      const enfants = etat.enfants(a)
      return [`Attend ${enfants.filter(estFini).length}/${enfants.length}`, a.activite]
    }
    return [LIBELLES_ETAT[a.etat], a.resultat ?? '']
  }

  private majNoeud(r: any, n: NoeudDispo) {
    const a = n.agent
    this.rangee(r, n)
    const choisi = etat.selection === a.chemin && a.chemin !== RACINE
    basculerClasse(r, `noeud e-${a.etat}${estVivant(a) ? ' vivant' : ''}${choisi ? ' choisi' : ''}`)
    r.el.style.setProperty('--c', couleurRole(a.role))
    texte(r.ico, iconeRole(a.role))
    texte(r.role, a.chemin === RACINE ? 'Orchestrateur' : libelleRole(a.role))
    texte(r.mission, a.chemin === RACINE ? etat.question || 'Question de Camille' : mission(a))
    texte(r.chrono, formatDuree((a.fin ?? maintenant()) - a.debut))
    if (r.v.modele) texte(r.v.modele, a.modele ?? '—')
    if (r.v.tokens) texte(r.v.tokens, formatTokens(a.tokens))
    if (r.v.outils) texte(r.v.outils, String(a.nb_outils))
    if (r.v.resultat) texte(r.v.resultat, a.resultat ?? '—')
    const finPlein = a.etat === 'termine'
    if (r.finPlein !== finPlein) {
      r.finPlein = finPlein
      r.v.fin.classList.toggle('plein', finPlein)
    }
    if (n.spec.pied) {
      const [etiq, txt] = this.etiquettePied(a)
      texte(r.etiq, etiq)
      texte(r.txt, txt)
    }
    r.spec = n.spec
  }

  // Nœud « Événement » : le point de départ du graphe, comme un Event Begin d'Unreal.
  private creerEvenement() {
    const el = document.createElement('div')
    el.className = 'noeud evenement'
    el.style.width = `${L_EVT}px`
    el.innerHTML = `
      <div class="tete"><span class="ico">▶</span><div class="tt"><b>Événement</b><span>Question de Camille</span></div></div>
      <div class="corps" style="grid-template-columns: 0 1fr">
        <div class="col g"></div>
        <div class="col d">${this.htmlRang({ k: 'exec', genre: 'exec', lab: '' }, 'd')}${this.htmlRang({ k: 'question', genre: 'texte', lab: 'question' }, 'd')}</div>
      </div>
      <div class="question"></div>`
    el.querySelectorAll('.col.d .lab')[1].textContent = 'question'
    el.querySelectorAll('.pin').forEach((p) => p.classList.add('plein'))
    return {
      type: 'evenement',
      el,
      l: L_EVT,
      cls: el.className,
      question: el.querySelector('.question'),
      spec: { d: [{ k: 'exec' }, { k: 'question' }], g: [] },
    } as any
  }

  // ─── Fils ───

  private brocheY(r: any, i: number) {
    return r.y + 1 + TETE + MARGE + i * RANG + RANG / 2
  }

  private indice(r: any, cote: 'g' | 'd', k: string): number {
    return r.spec[cote].findIndex((x: LigneBroche) => x.k === k)
  }

  private courbe(x0: number, y0: number, x1: number, y1: number): number[] {
    const dx = Math.max(60, Math.abs(x1 - x0) * 0.5)
    return [x0, y0, x0 + dx, y0, x1 - dx, y1, x1, y1]
  }

  private pointBezier(c: number[], u: number): [number, number] {
    const v = 1 - u
    const a = v * v * v
    const b = 3 * v * v * u
    const d = 3 * v * u * u
    const e = u * u * u
    return [a * c[0] + b * c[2] + d * c[4] + e * c[6], a * c[1] + b * c[3] + d * c[5] + e * c[7]]
  }

  private fil(cle: string, parent: SVGGElement) {
    let f = this.fils.get(cle)
    if (!f) {
      const path = document.createElementNS(NS, 'path')
      parent.append(path)
      f = { path }
      this.fils.set(cle, f)
    }
    f.vu = true
    return f
  }

  private tracer(f: any, cls: string, c: number[]) {
    if (f.cls !== cls) {
      f.cls = cls
      f.path.setAttribute('class', cls)
    }
    const p = c.map((v) => v.toFixed(1))
    const d = `M${p[0]},${p[1]}C${p[2]},${p[3]} ${p[4]},${p[5]} ${p[6]},${p[7]}`
    if (f.d !== d) {
      f.d = d
      f.path.setAttribute('d', d)
    }
    f.c = c
  }

  private majFils(noeuds: NoeudDispo[], t: number) {
    for (const f of this.fils.values()) f.vu = false
    const chemin = new Set<string>()
    for (let a = etat.get(etat.selection); a; a = etat.get(a.parent)) chemin.add(a.chemin)

    const vivants = new Set<string>()
    for (const n of noeuds) {
      const a = n.agent
      const r = this.rendus.get(n.cle)
      const p = this.rendus.get(a.parent ?? 'evt')
      if (!r || !p) continue
      const iExec = a.parent ? this.indice(p, 'd', `l:${a.chemin}`) : 0
      const iDonnee = a.parent ? this.indice(p, 'd', 'contexte') : 1
      const xs = p.x + p.l - PIN
      const xe = r.x + PIN
      const e = estVivant(a) ? 'vivant' : a.etat === 'attend' ? 'attend' : estFini(a) ? (a.etat === 'echec' ? 'echec' : 'termine') : a.etat
      if (iExec >= 0) {
        const cls = `fil-exec f-${e}${e !== 'vivant' && chemin.has(a.chemin) && etat.selection !== RACINE ? ' f-chemin' : ''}`
        this.tracer(this.fil(`x:${a.chemin}`, this.gExec), cls, this.courbe(xs, this.brocheY(p, iExec), xe, this.brocheY(r, 0)))
        if (e === 'vivant') vivants.add(a.chemin)
      }
      if (iDonnee >= 0) {
        this.tracer(
          this.fil(`d:${a.chemin}`, this.gDonnees),
          `fil-donnee f-${e}`,
          this.courbe(xs, this.brocheY(p, iDonnee), xe, this.brocheY(r, 1)),
        )
      }
    }
    for (const [cle, f] of this.fils) {
      if (!f.vu) {
        f.path.remove()
        this.fils.delete(cle)
      }
    }

    // Une seule impulsion par fil actif, qui parcourt lentement le fil d'exécution entrant.
    const u = t / PERIODE
    for (const id of vivants) {
      let c = this.impulsions.get(id)
      if (!c) {
        c = document.createElementNS(NS, 'circle')
        c.setAttribute('r', '4')
        c.setAttribute('class', 'impulsion')
        this.gImpulsions.append(c)
        this.impulsions.set(id, c)
      }
      let h = 0
      for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997
      const [x, y] = this.pointBezier(this.fils.get(`x:${id}`).c, (u + h / 997) % 1)
      c.setAttribute('cx', x.toFixed(1))
      c.setAttribute('cy', y.toFixed(1))
    }
    for (const [id, c] of this.impulsions) {
      if (!vivants.has(id)) {
        c.remove()
        this.impulsions.delete(id)
      }
    }
  }

  // ─── Boîtes « Comment » autour des directeurs de labo ───

  private majCommentaires(noeuds: NoeudDispo[]) {
    const vus = new Set<string>()
    for (const n of noeuds) {
      const a = n.agent
      if (a.role !== 'directeur_de_labo') continue
      vus.add(a.chemin)
      let c = this.commentaires.get(a.chemin)
      if (!c) {
        const el = document.createElement('div')
        el.className = 'commentaire'
        el.style.setProperty('--c', couleurRole(a.role))
        el.innerHTML = '<div class="c-titre"><span></span><small></small></div>'
        this.coucheComment.append(el)
        c = { el }
        this.commentaires.set(a.chemin, c)
      }
      texte(c.el.querySelector('span'), mission(a))
      texte(c.el.querySelector('small'), a.surnom ?? '')
      let x0 = Infinity
      let x1 = -Infinity
      let y0 = Infinity
      let y1 = -Infinity
      for (const cle of [n.cle, ...n.desc]) {
        const r = this.rendus.get(cle)
        if (!r) continue
        x0 = Math.min(x0, r.x)
        x1 = Math.max(x1, r.x + r.l)
        y0 = Math.min(y0, r.y)
        y1 = Math.max(y1, r.y + r.h)
      }
      c.boite = {
        x: x0 - COMMENT.cote,
        y: y0 - COMMENT.haut + 4,
        l: x1 - x0 + 2 * COMMENT.cote,
        h: y1 - y0 + COMMENT.haut - 4 + COMMENT.bas - 4,
      }
      const b = c.boite
      const style = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px)|${b.l.toFixed(1)}|${b.h.toFixed(1)}`
      if (c.style !== style) {
        c.style = style
        c.el.style.transform = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px)`
        c.el.style.width = `${b.l.toFixed(1)}px`
        c.el.style.height = `${b.h.toFixed(1)}px`
      }
    }
    for (const [id, c] of this.commentaires) {
      if (!vus.has(id)) {
        c.el.remove()
        this.commentaires.delete(id)
      }
    }
  }

  // ─── Boucle de rendu ───

  private tic(dt: number) {
    const sommets = etat.sommets
    this.vide.hidden = sommets.length > 0
    if (!sommets.length) {
      if (this.rendus.size) this.reinitialiser()
      return
    }
    // Plusieurs sommets (Atlas voix et l'orchestrateur) : empilés, tous lancés par l'événement de départ.
    const noeuds: NoeudDispo[] = []
    let haut = 0
    let racine: NoeudDispo | undefined
    for (const sommet of sommets) {
      const n = this.construire(sommet)
      this.mesurer(n)
      this.poser(n, 0, haut, noeuds)
      racine ??= n
      haut += n.bande + ECART_Y * 3
    }
    if (!racine) return
    const presents = new Set(noeuds.map((n) => n.cle))

    let evt = this.rendus.get('evt')
    if (!evt) {
      evt = this.creerEvenement()
      this.coucheNoeuds.append(evt.el)
      evt.h = evt.el.offsetHeight || 120
      evt.x = evt.tx = 0
      evt.y = evt.ty = racine.ty
      this.rendus.set('evt', evt)
    }
    texte(evt.question, etat.question || '—')
    evt.h = evt.el.offsetHeight || evt.h
    evt.tx = 0
    evt.ty = racine.ty
    presents.add('evt')

    for (const n of noeuds) {
      let r = this.rendus.get(n.cle)
      if (!r) {
        r = this.creerNoeud(n.agent)
        r.x = n.tx
        r.y = n.ty
        this.coucheNoeuds.append(r.el)
        r.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' })
        this.rendus.set(n.cle, r)
      }
      r.tx = n.tx
      r.ty = n.ty
      r.h = n.spec.h
      this.majNoeud(r, n)
    }
    for (const [cle, r] of this.rendus) {
      if (!presents.has(cle)) {
        r.el.remove()
        this.rendus.delete(cle)
      }
    }

    // Glissement vers les positions cibles
    const f = 1 - Math.exp(-dt * 7)
    for (const r of this.rendus.values()) {
      r.x += (r.tx - r.x) * f
      r.y += (r.ty - r.y) * f
      const t = `translate(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px)`
      if (r.t !== t) {
        r.t = t
        r.el.style.transform = t
      }
    }

    this.majCommentaires(noeuds)
    this.majFils(noeuds, performance.now() / 1000)
    this.cadrer(dt)
  }
}
