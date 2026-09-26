// Interface de la vision R2 : légende façon plan de métro, section du panneau ☰, fiche enrichie,
// bulle de tronçon.

import { el, LIBELLES_VALIDATION, type PanneauRaisonnement, type VueRaisonnement } from '../../src/raisonnement'
import type { PlanM, StationM, TronconM } from './plan'
import { couleurLigne, rejeteeDeLigne, type EtatMetro } from './rendu'

const NS = 'http://www.w3.org/2000/svg'

/** Petit dessin SVG pour la légende. */
function svg(largeur: number, hauteur: number, contenu: string): SVGSVGElement {
  const s = document.createElementNS(NS, 'svg')
  s.setAttribute('width', String(largeur))
  s.setAttribute('height', String(hauteur))
  s.setAttribute('viewBox', `0 0 ${largeur} ${hauteur}`)
  s.setAttribute('aria-hidden', 'true')
  s.innerHTML = contenu
  return s
}

export function pastilleLigne(etat: EtatMetro, plan: PlanM, l: number): HTMLElement {
  const L = plan.lignes[l]!
  const c = couleurLigne(etat, l)
  return el('span', { class: `r2-pastille-ligne${L.abandonnee ? ' creuse' : ''}`, style: L.abandonnee ? `color:${c}` : `background:${c}`, title: L.nom }, L.numero)
}

// ─── Légende (bandeau bas) ───────────────────────────────────────────────────

/** Fiche affichée depuis la légende (la vue ne gère le survol que dans la scène). */
export interface FicheLegende {
  montrer(u: number, ancre: DOMRect): void
  cacher(): void
}

export class LegendeMetro {
  readonly element: HTMLElement
  private corps: HTMLElement
  private bouton: HTMLButtonElement

  constructor(parent: HTMLElement, private vue: VueRaisonnement, private etat: EtatMetro, private surChangement: () => void, private fiche: FicheLegende) {
    this.bouton = el('button', { class: 'r2-legende-replier', type: 'button', title: 'Replier / déplier la légende' }, 'replier') as HTMLButtonElement
    this.corps = el('div', { class: 'r2-legende-corps' })
    this.element = el('div', { class: 'r2-legende' }, this.bouton, this.corps)
    this.bouton.addEventListener('click', () => {
      this.replier(!this.element.classList.contains('repliee'))
      this.surChangement()
    })
    parent.appendChild(this.element)
  }

  replier(oui: boolean): void {
    this.element.classList.toggle('repliee', oui)
    this.bouton.textContent = oui ? 'légende du plan' : 'replier'
  }

  /** Hauteur occupée (px), pour le cadrage. */
  get hauteur(): number {
    return this.element.style.display === 'none' ? 0 : this.element.getBoundingClientRect().height
  }

  maj(): void {
    const plan = this.etat.plan
    this.element.style.display = plan ? '' : 'none'
    if (!plan) return
    const v = this.vue
    const pal = v.palette
    const c = this.etat.couleurs
    const trait = c.stationTrait, fond = c.stationFond
    const l1 = couleurLigne(this.etat, 0), l2 = couleurLigne(this.etat, 1), l4 = couleurLigne(this.etat, 3)

    // Lignes.
    const lignes = plan.lignes.map((L) => {
      const nb = plan.stations.filter((s) => s.lignes.includes(L.index) && s.genre !== 'terminus').length
      const ligne = el('div', { class: `r2-ligne${this.etat.ligneEpinglee === L.index ? ' actif' : ''}${this.etat.lignesMasquees.has(L.index) ? ' masquee' : ''}`, title: 'Survol : mettre la ligne en avant · clic : l’épingler' },
        pastilleLigne(this.etat, plan, L.index),
        el('span', { class: 'r2-ligne-nom' }, L.nom),
        el('span', { class: 'r2-ligne-info' }, `${nb} arrêts · ${L.etapes} étapes`),
      )
      ligne.addEventListener('mouseenter', () => { this.etat.survolLigne = L.index; v.demanderRendu() })
      ligne.addEventListener('mouseleave', () => { this.etat.survolLigne = null; v.demanderRendu() })
      ligne.addEventListener('click', () => {
        this.etat.ligneEpinglee = this.etat.ligneEpinglee === L.index ? null : L.index
        this.surChangement()
      })
      return ligne
    })

    // Symboles.
    const symbole = (dessin: SVGSVGElement, ...texte: (HTMLElement | string)[]) => el('div', { class: 'r2-symbole' }, dessin, el('span', {}, ...texte))
    const b = (t: string) => el('b', {}, t)
    const symboles = [
      symbole(svg(30, 16, `<line x1="0" y1="8" x2="30" y2="8" stroke="${l1}" stroke-width="5"/><circle cx="15" cy="8" r="5" fill="${fond}" stroke="${l1}" stroke-width="2.4"/>`), b('Station'), ' · résultat clé'),
      symbole(svg(30, 16, `<line x1="0" y1="8" x2="30" y2="8" stroke="${l1}" stroke-width="5"/><circle cx="15" cy="8" r="6.2" fill="${fond}" stroke="${trait}" stroke-width="2.4"/><circle cx="15" cy="8" r="2.4" fill="${trait}"/>`), b('Théorème'), ', ', b('résultat')),
      symbole(svg(30, 20, `<line x1="0" y1="6" x2="30" y2="6" stroke="${l1}" stroke-width="4.5"/><line x1="0" y1="14" x2="30" y2="14" stroke="${l2}" stroke-width="4.5"/><rect x="10" y="1" width="10" height="18" rx="5" fill="${fond}" stroke="${trait}" stroke-width="2.2"/>`), b('Correspondance'), ' · des fils se rejoignent'),
      symbole(svg(30, 16, `<line x1="13" y1="8" x2="30" y2="8" stroke="${l1}" stroke-width="5"/><rect x="5" y="2.5" width="11" height="11" rx="2" fill="${fond}" stroke="${trait}" stroke-width="2.2"/>`), b('Terminus de départ'), ' · hypothèse'),
      symbole(svg(30, 22, `<line x1="0" y1="13" x2="30" y2="13" stroke="${l1}" stroke-width="5"/><line x1="18" y1="8" x2="25" y2="2" stroke="${pal.texteDoux}" stroke-width="1.5" stroke-dasharray="3 2.5"/><line x1="23" y1="0" x2="27.5" y2="4" stroke="${pal.texteDoux}" stroke-width="2"/><polygon points="12,6 19,13 12,20 5,13" fill="${fond}" stroke="${trait}" stroke-width="2.2"/>`), b('Aiguillage'), ' · décision, voie rejetée ⊣'),
      symbole(svg(30, 16, `<line x1="0" y1="8" x2="20" y2="8" stroke="${l4}" stroke-width="5"/><line x1="0" y1="8" x2="20" y2="8" stroke="${pal.fond}" stroke-width="2"/><line x1="21" y1="1" x2="21" y2="15" stroke="${l4}" stroke-width="4"/>`), b('Terminus barré'), ' · piste abandonnée'),
      symbole(svg(30, 16, `<circle cx="9" cy="8" r="5" fill="${fond}" stroke="${pal.statut.incertain}" stroke-width="2.2" stroke-dasharray="3 2"/><circle cx="22" cy="8" r="5" fill="${fond}" stroke="${pal.statut.refute}" stroke-width="2.2"/><path d="M19.3 5.3l5.4 5.4M24.7 5.3l-5.4 5.4" stroke="${pal.statut.refute}" stroke-width="1.8"/>`), b('Incertain'), ', ', b('réfuté'), ' · bordure = statut'),
      symbole(svg(30, 16, `<circle cx="6" cy="8" r="3.4" fill="${pal.validation.humain}"/><circle cx="15" cy="8" r="3.4" fill="${pal.validation.ia}"/><circle cx="24" cy="8" r="3.4" fill="${pal.validation.ia_humain}"/>`), 'Validé par ', b(LIBELLES_VALIDATION.humain), ', ', b(LIBELLES_VALIDATION.ia), ', ', b(LIBELLES_VALIDATION.ia_humain)),
      symbole(svg(30, 16, `<line x1="0" y1="8" x2="30" y2="8" stroke="${l1}" stroke-width="5"/><circle cx="8" cy="8" r="1.3" fill="${pal.fond}"/><circle cx="15" cy="8" r="1.3" fill="${pal.fond}"/><circle cx="22" cy="8" r="1.3" fill="${pal.fond}"/>`), b('Étapes masquées'), ' · clic : déplier'),
      symbole(svg(30, 16, `<path d="M2 12 Q15 -2 28 12" fill="none" stroke="${pal.contredit}" stroke-width="1.5" stroke-dasharray="4 3"/>`), b('Contredit'), ' / ', el('b', { style: `color:${pal.statut.valide}` }, 'résout')),
    ]

    // Zones tarifaires : une puce par choix (et par aiguillage hors plan qui le produit).
    const lecture = plan.lecture
    const zones = plan.zones.map((z, zi) => {
      const k = Math.min(zi, c.zoneFond.length - 1)
      const puces: HTMLElement[] = []
      for (const u of z.choix) {
        for (const s of plan.stations) {
          if (s.genre !== 'aiguillage' || !s.horsPlan) continue
          if (!lecture.sortantes[s.u]!.some((e) => lecture.aretes[e]!.cible === u)) continue
          puces.push(this.puce(s.u, svg(16, 16, `<polygon points="8,1.5 14.5,8 8,14.5 1.5,8" fill="${fond}" stroke="${trait}" stroke-width="1.8"/>`), zi), el('span', { class: 'r2-fleche' }, '→'))
        }
        puces.push(this.puce(u, svg(16, 16, `<polygon points="8,1 14.1,4.5 14.1,11.5 8,15 1.9,11.5 1.9,4.5" fill="${c.zoneFond[k]}" stroke="${c.zoneTrait[k]}" stroke-width="1.8"/>`), zi))
      }
      const tete = el('div', { class: 'r2-zone-tete' },
        svg(24, 14, `<rect x="1" y="1" width="22" height="12" rx="6" fill="${c.zoneFond[k]}" stroke="${c.zoneTrait[k]}" stroke-width="1.3"/>`),
        el('b', { style: `color:${c.zoneTexte[k]}` }, `Zone ${zi + 1}`), el('span', {}, ` · ${z.nom} · ${z.stations.length} arrêts`))
      tete.addEventListener('mouseenter', () => { this.etat.survolZone = zi; v.demanderRendu() })
      tete.addEventListener('mouseleave', () => { this.etat.survolZone = null; v.demanderRendu() })
      return el('div', { class: 'r2-zone' }, tete, el('div', { class: 'r2-puces' }, ...puces))
    })

    this.corps.replaceChildren(
      el('div', { class: 'r2-col' }, el('div', { class: 'r2-legende-titre' }, 'Lignes · fils d’argument'), ...lignes),
      el('div', { class: 'r2-col' }, el('div', { class: 'r2-legende-titre' }, 'Symboles'), el('div', { class: 'r2-symboles' }, ...symboles)),
      el('div', { class: 'r2-col' }, el('div', { class: 'r2-legende-titre' }, 'Zones tarifaires · choix de modélisation'), ...zones,
        el('div', { class: 'r2-pied' }, 'Arrêts teintés : ils dépendent du choix. Survol d’une puce : sa fiche ; clic : sa portée.')),
      el('div', { class: 'r2-col' }, el('div', { class: 'r2-legende-titre' }, 'Ce qui est caché'), this.pied(plan)),
    )
  }

  /** Puce d'un choix de modélisation ou d'un aiguillage hors plan : survol = fiche, clic = portée. */
  private puce(u: number, icone: SVGSVGElement, zone: number): HTMLElement {
    const v = this.vue
    const p = el('span', { class: 'r2-puce', tabindex: 0 }, icone, v.noeud(u).nom)
    p.addEventListener('mouseenter', () => {
      this.etat.survolZone = zone
      this.fiche.montrer(u, p.getBoundingClientRect())
      v.demanderRendu()
    })
    p.addEventListener('mouseleave', () => {
      this.etat.survolZone = null
      this.fiche.cacher()
      v.demanderRendu()
    })
    p.addEventListener('click', () => v.montrerPortee(u))
    return p
  }

  private pied(plan: PlanM): HTMLElement {
    const arrets = plan.stations.filter((s) => !s.horsPlan).length
    const etapes = plan.troncons.reduce((n, t) => n + t.etapes.length, 0)
    const annexes = plan.annexes.reduce((n, a) => n + a.etapes.length, 0)
    const choix = plan.stations.filter((s) => s.horsPlan).length
    return el('div', { class: 'r2-pied' },
      el('div', {}, el('b', {}, `${arrets}`), ' arrêts sur le plan'),
      el('div', {}, el('b', {}, `${choix}`), ' choix et décision de cadre (zones)'),
      el('div', {}, el('b', {}, `${etapes}`), ' étapes dans les tronçons (clic)'),
      el('div', {}, el('b', {}, `${annexes}`), ' impasses (clic sur la station)'),
      el('div', {}, el('b', {}, `${plan.lecture.stats.masques}`), ' de contexte pur (touche L)'),
      el('div', { class: 'r2-total' }, '= ', el('b', {}, `${plan.lecture.stats.noeudsComplet}`), ' nœuds du graphe complet'))
  }
}

// ─── Section du panneau ☰ ────────────────────────────────────────────────────

export class SectionMetro {
  private corps: HTMLElement

  constructor(panneau: PanneauRaisonnement, private vue: VueRaisonnement, private etat: EtatMetro, private surChangement: () => void) {
    this.corps = el('div', {})
    panneau.ajouterSection('metro', 'Plan de métro', this.corps, { position: 'lecture' })
  }

  maj(): void {
    const plan = this.etat.plan
    if (!plan) {
      this.corps.replaceChildren(el('p', { class: 'rsn-vide' }, 'Stratégie « R2 · Plan de métro » inactive : choisissez-la pour voir le plan.'))
      return
    }
    const v = this.vue
    const cases = plan.lignes.map((L) => {
      const c = el('input', { type: 'checkbox' }) as HTMLInputElement
      c.checked = !this.etat.lignesMasquees.has(L.index)
      c.addEventListener('change', () => {
        if (c.checked) this.etat.lignesMasquees.delete(L.index)
        else this.etat.lignesMasquees.add(L.index)
        this.surChangement()
      })
      return el('label', {}, c, pastilleLigne(this.etat, plan, L.index), L.nom)
    })
    const bouton = (texte: string, f: () => void) => el('button', { class: 'rsn-bouton', type: 'button', onclick: f }, texte)
    const nom = (u: number) => v.noeud(u).nom
    const deplies = [...this.etat.deplies].map((i) => plan.troncons[i]!).filter(Boolean)
    this.corps.replaceChildren(
      el('div', { class: 'r2-panneau-lignes' }, ...cases),
      el('div', { class: 'r2-panneau-boutons' },
        bouton('Déplier tous les tronçons', () => { plan.troncons.forEach((t) => { if (t.etapes.length) this.etat.deplies.add(t.index) }); this.surChangement() }),
        bouton('Tout replier', () => { this.etat.deplies.clear(); this.surChangement() }),
      ),
      el('p', { class: 'rsn-doux rsn-petit' }, `${plan.troncons.length} tronçons, ${plan.lignes.length} lignes, ${plan.zones.length} zones tarifaires. Cliquez un tronçon pour afficher ses étapes, une station pour sa lignée et ses impasses.`),
      deplies.length
        ? el('div', {}, el('div', { class: 'rsn-groupe-titre' }, 'Tronçons dépliés'),
            ...deplies.map((t) => el('div', { class: 'rsn-demo' },
              el('div', {}, pastilleLigne(this.etat, plan, t.lignes[0]!), ' ', el('b', {}, `${nom(t.de)} → ${nom(t.vers)}`)),
              el('ol', { class: 'r2-deplies' }, ...t.etapes.map((u) => el('li', {}, nom(u)))))))
        : el('p', { class: 'rsn-vide' }, 'Aucun tronçon déplié.'),
    )
  }
}

// ─── Fiche de survol enrichie ────────────────────────────────────────────────

const GENRES: Record<StationM['genre'], string> = {
  terminus: 'Terminus de départ',
  station: 'Station',
  aiguillage: 'Aiguillage',
  zone: 'Zone tarifaire',
}

export function enrichirFiche(vue: VueRaisonnement, etat: EtatMetro, p: number, defaut: () => HTMLElement): HTMLElement {
  const plan = etat.plan
  const f = defaut()
  if (!plan || p >= vue.nU) return f
  const si = plan.stationDe[p]!
  const tete = el('div', { class: 'r2-fiche-lignes' })
  if (si >= 0) {
    const s = plan.stations[si]!
    const genre = s.genre === 'station' && s.lignes.length > 1 ? 'Correspondance' : GENRES[s.genre]
    tete.append(genre, ...s.lignes.map((l) => pastilleLigne(etat, plan, l)))
    if (s.genre === 'zone') {
      const z = plan.zones.find((x) => x.choix.includes(p))
      if (z) tete.append(` · zone ${plan.zones.indexOf(z) + 1}`)
    }
    f.prepend(tete)
    const entrants = plan.troncons.filter((t) => t.vers === p)
    const nb = entrants.reduce((n, t) => n + t.etapes.length, 0)
    const an = plan.annexes.find((a) => a.station === p)
    const lignesAide: string[] = []
    if (nb) lignesAide.push(`${nb} étape(s) masquée(s) dans ${entrants.length} tronçon(s) entrant(s) : cliquez un tronçon pour le déplier.`)
    if (an) lignesAide.push(`${an.etapes.length} étape(s) en impasse (vérifications, annexes) : cliquez la station pour les voir.`)
    const zones = plan.zones.filter((z) => z.stations.includes(p)).map((z) => `zone ${plan.zones.indexOf(z) + 1}`)
    if (zones.length) lignesAide.push(`Dépend des choix de modélisation de la ${zones.join(' et de la ')}.`)
    if (s.genre === 'zone') lignesAide.push('Panneau ☰ → Sélection : « Montrer la portée » pour voir tout ce qui dépend de ce choix.')
    if (lignesAide.length) f.append(el('div', { class: 'rsn-aide' }, ...lignesAide.map((t) => el('div', {}, t))))
  } else {
    const ti = plan.tronconDe[p]!
    const ai = plan.annexeDe[p]!
    if (ti >= 0) {
      const t = plan.troncons[ti]!
      tete.append('Étape du tronçon', ...t.lignes.map((l) => pastilleLigne(etat, plan, l)))
      f.prepend(tete)
      f.append(el('div', { class: 'rsn-aide' }, `${vue.noeud(t.de).nom} → ${vue.noeud(t.vers).nom} · étape ${t.etapes.indexOf(p) + 1} / ${t.etapes.length}`))
    } else if (ai >= 0) {
      tete.append('Impasse de la station')
      f.prepend(tete)
      f.append(el('div', { class: 'rsn-aide' }, vue.noeud(plan.annexes[ai]!.station).nom))
    }
  }
  return f
}

/** Contenu de la bulle d'un tronçon survolé. */
export function contenuBulle(vue: VueRaisonnement, etat: EtatMetro, t: TronconM, ligne: number): HTMLElement {
  const plan = etat.plan!
  const L = plan.lignes[ligne]!
  const nom = (u: number) => vue.noeud(u).nom
  const corps = el('div', {},
    el('div', { class: 'r2-fiche-lignes' }, pastilleLigne(etat, plan, ligne), `Ligne ${L.numero}`, t.lignes.length > 1 ? ` · tronçon partagé avec ${t.lignes.filter((l) => l !== ligne).map((l) => plan.lignes[l]!.numero).join(', ')}` : ''),
    el('div', { class: 'rsn-fiche-titre' }, L.nom),
    el('div', { class: 'rsn-fiche-enonce' }, `${nom(t.de)} → ${nom(t.vers)}`),
  )
  const n = vue.noeud(t.vers)
  if (L.abandonnee && n.decision) {
    const alt = rejeteeDeLigne(plan, t, n)
    corps.append(el('div', { class: 'rsn-etiquette rsn-abandon' }, 'Terminus barré'), el('div', { class: 'rsn-doux' }, `${n.decision.question} ${alt ? `« ${alt.libelle} » rejetée : ${alt.raison ?? ''}` : n.decision.raison}`))
  }
  if (t.etapes.length) {
    const max = 7
    corps.append(
      el('div', { class: 'rsn-bloc-titre', style: 'margin-top:6px' }, `${t.etapes.length} étape(s) masquée(s)`),
      el('ol', { class: 'r2-etapes' }, ...t.etapes.slice(0, max).map((u) => el('li', {}, nom(u))), t.etapes.length > max ? el('li', { style: 'list-style:none' }, `… et ${t.etapes.length - max} autre(s)`) : null),
    )
  } else corps.append(el('div', { class: 'rsn-doux' }, 'Déduction directe (aucune étape intermédiaire).'))
  corps.append(el('div', { class: 'rsn-aide' }, t.etapes.length ? (etat.deplies.has(t.index) ? 'Clic : replier le tronçon' : 'Clic : déplier le tronçon') : 'Survol : la ligne entière est mise en avant'))
  return corps
}
