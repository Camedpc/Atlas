// R21 · Rendu DOM de la preuve structurée : une rangée par énoncé, alignée sur trois colonnes
// (filets de portée | texte | marge de vérification).

import { el } from '../../src/core/ui/dom'
import {
  demonstrationPrincipale, LIBELLES_ORIGINE, LIBELLES_TYPE, LIBELLES_VALIDATION, LIBELLES_VALIDITE,
  type DemonstrationR, type NoeudR, type RolePremisse, type Validite,
} from '../../src/raisonnement/donnees'
import {
  citation, confianceDe, enfantsDirects, FAMILLES, premissesParRole, TITRES_SECTION,
  type Element, type Entree, type Preuve, type Section, type Serie,
} from './preuve'

// ─── Rangées ─────────────────────────────────────────────────────────────────

export interface Rangee {
  el: HTMLDivElement
  element: Element | null
  niveau: number
  /** Rangée dont l'ouverture commande l'affichage de celle-ci. */
  parent: Rangee | null
  enfants: Rangee[]
  /** Nœuds qui décident de la portée (filets) ; vide = rangée neutre (titres). */
  pour: number[]
  cellules: HTMLSpanElement[]
  /** 'auto' : ouverte si niveau < curseur ; sinon choix explicite. */
  etat: 'auto' | 'ouvert' | 'ferme'
  bouton: HTMLButtonElement | null
  compteMasques: HTMLSpanElement | null
  visible: boolean
}

// ─── Texte ───────────────────────────────────────────────────────────────────

/** Énoncé semi-LaTeX (x^{…}, x_{…}, x^2, x_h) → texte avec exposants et indices, sans innerHTML. */
export function formule(texte: string): DocumentFragment {
  const f = document.createDocumentFragment()
  const cars = Array.from(texte)
  let pos = 0
  const simple = /[\p{L}\p{N}∞+\-−*′]/u
  const lire = (parent: Node, fin: string | null): void => {
    let tampon = ''
    const vider = () => {
      if (tampon) parent.appendChild(document.createTextNode(tampon))
      tampon = ''
    }
    while (pos < cars.length) {
      const c = cars[pos]!
      if (fin !== null && c === fin) {
        pos++
        vider()
        return
      }
      if ((c === '^' || c === '_') && pos + 1 < cars.length) {
        const s = cars[pos + 1]!
        if (s === '{') {
          vider()
          pos += 2
          const e = document.createElement(c === '^' ? 'sup' : 'sub')
          lire(e, '}')
          parent.appendChild(e)
          continue
        }
        if (simple.test(s)) {
          vider()
          const e = document.createElement(c === '^' ? 'sup' : 'sub')
          e.textContent = s
          parent.appendChild(e)
          pos += 2
          continue
        }
      }
      tampon += c
      pos++
    }
    vider()
  }
  lire(f, null)
  return f
}

/** Nom court d'un outil ou d'un résultat de la littérature (Grönwall, Kuznetsov…). */
export function nomCourt(nom: string): string {
  const mots = nom.split(/\s+/)
  const propre = mots.slice(1).find((m) => /^\p{Lu}\p{Ll}/u.test(m))
  if (propre) return propre.replace(/[,:;.]+$/, '')
  if (mots[1] === ':' || mots[0]!.includes('–')) return mots[0]!
  return mots.slice(0, 2).join(' ')
}

export const GLYPHE_VALIDITE: Record<Validite, string> = { valide: '✓', a_verifier: '?', invalide: '✕' }
const MOT_ROLE: Record<RolePremisse, string> = { principale: 'par', auxiliaire: 'aux.', technique: 'tech.', contexte: 'ctx.' }
const VALIDATION_COURTE = { aucune: '—', ia: 'IA', humain: 'H', ia_humain: 'IA+H' } as const
const NOMS_GENERIQUES = new Set(['Démonstration', 'Script', 'Mesure', 'Protocole', 'Construction', 'Délibération', 'Justification du choix', 'Heuristique', 'Motivation'])
const VERBE_LIEN = { contredit: 'contredit', resout: 'résout', remplace: 'remplace', abandonne: 'clôt' } as const
const VERBE_LIEN_ENTRANT = { contredit: 'contredit par', resout: 'résolu par', remplace: 'remplacé par', abandonne: 'close par' } as const
const dateFr = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

// ─── Constructeur ────────────────────────────────────────────────────────────

export class Rendu {
  readonly rangees: Rangee[] = []
  /** Nœud → rangée où il est affiché (une activité renvoie à la ligne de sa série). */
  readonly rangeeDe = new Map<number, Rangee>()
  /** Rangée de chaque racine d'entrée, pour le fil d'Ariane. */
  readonly racines: { entree: Entree; rangee: Rangee }[] = []
  private readonly p: Preuve
  private readonly doc: HTMLElement

  constructor(p: Preuve, doc: HTMLElement) {
    this.p = p
    this.doc = doc
  }

  private noeud(i: number): NoeudR {
    return this.p.j.noeuds[i]!
  }

  // Une rangée : [filets | corps | marge].
  private rangee(element: Element | null, niveau: number, parent: Rangee | null, pour: number[], corps: HTMLElement, marge: HTMLElement | null, classe = ''): Rangee {
    const cellules = this.p.portees.map((_, c) => el('span', { class: 'filet', 'data-portee': c }))
    const gouttiere = el('div', { class: 'gouttiere' }, cellules)
    const id = element ? `n-${this.noeud(element.i).id}` : undefined
    const div = el('div', { class: `rangee ${classe}`.trim(), id }, gouttiere, corps, marge ?? el('div', { class: 'marge' }))
    corps.style.setProperty('--niveau', String(Math.min(niveau, 12)))
    const r: Rangee = { el: div, element, niveau, parent, enfants: [], pour, cellules, etat: element?.replie ? 'ferme' : 'auto', bouton: null, compteMasques: null, visible: true }
    if (parent) parent.enfants.push(r)
    if (element) this.rangeeDe.set(element.i, r)
    this.rangees.push(r)
    this.doc.appendChild(div)
    return r
  }

  private titreSection(texte: string, sous: string | null, classe = 'section'): void {
    const corps = el('div', { class: 'corps' }, el('h2', {}, texte), sous ? el('p', { class: 'sous' }, sous) : null)
    this.rangee(null, 0, null, [], corps, null, classe)
  }

  // ─── Renvois ───────────────────────────────────────────────────────────────

  renvoi(k: number, depuis: Entree | null, avecNom = false): HTMLElement {
    const e = this.p.elements[k]!
    const n = this.noeud(k)
    const txt = citation(this.p, k, depuis)
    const a = el('a', { class: `renvoi${n.piste === 'abandonnee' ? ' abandonne' : ''}`, href: `#n-${n.id}`, 'data-i': k }, txt)
    if (e.famille === 'M') a.dataset.portee = String(this.p.portees.findIndex((x) => x.i === k))
    if (avecNom && (e.famille === 'T' || e.famille === 'L')) return el('span', { class: 'renvoi-nomme' }, a, ' ', el('span', { class: 'nom-court' }, nomCourt(n.nom)))
    return a
  }

  /** Ligne PAR : prémisses de la démonstration, groupées par rôle, citées par numéro. */
  lignePar(d: DemonstrationR, depuis: Entree | null, prefixe?: string): HTMLElement {
    const groupes = premissesParRole(this.p, d)
    const ligne = el('div', { class: 'par' })
    if (prefixe) ligne.append(el('span', { class: 'mot' }, prefixe), ' ')
    if (!groupes.length) ligne.append(el('span', { class: 'mot' }, 'sans prémisse'))
    groupes.forEach(([role, ks], g) => {
      if (g) ligne.append(el('span', { class: 'sep' }, ' ; '))
      ligne.append(el('span', { class: `mot role-${role}` }, MOT_ROLE[role]), ' ')
      ks.forEach((k, x) => {
        if (x) ligne.append(', ')
        ligne.append(this.renvoi(k, depuis, role === 'technique' || role === 'auxiliaire'))
      })
    })
    if (!NOMS_GENERIQUES.has(d.nom)) ligne.append(el('span', { class: 'nom-dem' }, ` — ${d.nom}`))
    return ligne
  }

  // ─── Marge de vérification ────────────────────────────────────────────────

  marge(i: number): HTMLElement {
    const n = this.noeud(i)
    const d = demonstrationPrincipale(n)
    const glyphe = d
      ? el('span', { class: `v v-${d.validite}`, title: `Démonstration principale : ${LIBELLES_VALIDITE[d.validite]}` }, GLYPHE_VALIDITE[d.validite])
      : el('span', { class: 'v v-sans', title: n.admis ? 'Admis sans démonstration' : 'Posé sans démonstration' }, n.admis ? 'adm.' : '·')
    const c = confianceDe(n)
    const x = (v: number) => (2 + v * 40).toFixed(1)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'ic')
    svg.setAttribute('width', '44')
    svg.setAttribute('height', '10')
    svg.innerHTML = `<line x1="2" y1="5" x2="42" y2="5" class="ic-axe"/><line x1="22" y1="3" x2="22" y2="7" class="ic-axe"/>` +
      `<line x1="${x(c.bas)}" y1="5" x2="${x(c.haut)}" y2="5" class="ic-int"/><circle cx="${x(c.estimation)}" cy="5" r="1.8" class="ic-est"/>`
    const ic = el('span', { class: 'ic-conteneur', title: `Confiance ${c.estimation.toFixed(2)} [${c.bas.toFixed(2)} ; ${c.haut.toFixed(2)}]` })
    ic.appendChild(svg)
    const nd = n.demonstrations.length > 1 ? el('span', { class: 'nd', title: n.demonstrations.map((x) => `${x.nom} (${LIBELLES_VALIDITE[x.validite]})`).join('\n') }, `${n.demonstrations.length} dém.`) : el('span', { class: 'nd' })
    return el('div', { class: 'marge' },
      glyphe,
      el('span', { class: 'val', title: `Validation : ${LIBELLES_VALIDATION[n.validation]}` }, VALIDATION_COURTE[n.validation]),
      ic, nd)
  }

  // ─── Lignes complémentaires ───────────────────────────────────────────────

  private tete(e: Element, n: NoeudR, extra?: HTMLElement): HTMLElement {
    const t = el('div', { class: 'tete' },
      el('button', { class: 'tri', type: 'button', 'aria-label': 'Replier / déplier', tabindex: -1 }, ''),
      el('a', { class: 'num', href: `#n-${n.id}`, 'data-i': e.i }, e.etiquette),
      ' ', el('span', { class: 'type' }, LIBELLES_TYPE[n.type]), ' ',
      el('span', { class: 'titre' }, formule(n.nom)),
    )
    if (n.statut !== 'valide') t.append(' ', el('span', { class: `etat etat-${n.statut}` }, n.statut === 'refute' ? 'réfuté' : 'incertain'))
    if (n.piste === 'abandonnee') t.append(' ', el('span', { class: 'etat etat-abandon' }, 'piste abandonnée'))
    if (extra) t.append(extra)
    t.append(el('span', { class: 'masques' }))
    return t
  }

  private complements(corps: HTMLElement, i: number, depuis: Entree | null): void {
    const n = this.noeud(i)
    // Liens sémantiques : sortants puis entrants.
    for (const l of n.liens ?? []) {
      const c = this.p.j.index.get(l.cible)
      if (c === undefined) continue
      const ligne = el('div', { class: 'lien' }, `${VERBE_LIEN[l.genre]} `, this.renvoi(c, depuis), ` (${this.noeud(c).nom})`)
      if (l.genre === 'contredit') {
        const res = (this.p.liensEntrants.get(c) ?? []).filter((x) => x.genre === 'resout')
        if (res.length) {
          ligne.append(' — résolu par ')
          res.forEach((x, k) => ligne.append(k ? ', ' : '', this.renvoi(x.source, depuis)))
        }
      }
      if (l.note) ligne.append(el('span', { class: 'note' }, ` · ${l.note}`))
      corps.append(ligne)
    }
    for (const l of this.p.liensEntrants.get(i) ?? []) {
      corps.append(el('div', { class: 'lien' }, `${VERBE_LIEN_ENTRANT[l.genre]} `, this.renvoi(l.source, depuis), ` (${this.noeud(l.source).nom})`))
    }
    const ctl = this.p.controlesDe.get(i)
    if (ctl?.length) {
      const ligne = el('div', { class: 'controle' }, el('span', { class: 'mot' }, 'contrôlé par'), ' ')
      ctl.forEach((k, x) => {
        const d = demonstrationPrincipale(this.noeud(k))
        ligne.append(x ? ', ' : '', this.renvoi(k, depuis), ` ${d ? GLYPHE_VALIDITE[d.validite] : ''} `, el('span', { class: 'nom-court' }, this.noeud(k).nom.replace(/\s*:.*$/, '')))
      })
      corps.append(ligne)
    }
    // Démonstrations alternatives (bascule).
    const princ = demonstrationPrincipale(n)
    n.demonstrations.forEach((d, k) => {
      if (d === princ) return
      const bloc = el('div', { class: 'alt' },
        el('span', { class: 'mot' }, `dém. ${k + 1}`), ' ',
        el('span', { class: `v v-${d.validite}` }, GLYPHE_VALIDITE[d.validite]), ' ',
        el('span', { class: 'nom-alt' }, d.nom), ' · ', d.auteur,
      )
      bloc.append(this.lignePar(d, depuis))
      corps.append(bloc)
    })
    // Provenance (bascule).
    const prov = el('div', { class: 'prov' },
      `${n.auteur} · ${LIBELLES_ORIGINE[n.origine]} · ${dateFr.format(new Date(n.cree_le))} · validation ${LIBELLES_VALIDATION[n.validation]}`)
    if (princ && princ.auteur !== n.auteur) prov.append(` · dém. « ${princ.nom} » : ${princ.auteur}`)
    corps.append(prov)
  }

  // ─── Éléments ─────────────────────────────────────────────────────────────

  private fondation(e: Element): Rangee {
    const n = this.noeud(e.i)
    const corps = el('div', { class: 'corps fondation' },
      el('div', { class: 'tete' },
        el('button', { class: 'tri', type: 'button', tabindex: -1 }, ''),
        el('a', { class: 'num', href: `#n-${n.id}`, 'data-i': e.i }, e.etiquette), ' ',
        el('span', { class: 'titre' }, formule(n.nom)),
        n.statut !== 'valide' ? el('span', { class: `etat etat-${n.statut}` }, ` ${n.statut === 'refute' ? 'réfuté' : 'incertain'}`) : null,
        el('span', { class: 'masques' }),
      ),
      el('div', { class: 'enonce' }, formule(n.enonce)),
    )
    if (e.famille === 'M') {
      const k = this.p.portees.findIndex((x) => x.i === e.i)
      const portee = this.p.portees[k]!
      const bouton = el('button', { class: 'lien-bouton', type: 'button', 'data-epingler': k }, `portée calculée : ${portee.dependants.size} énoncés`)
      corps.append(el('div', { class: 'par' }, bouton, n.choix ? el('span', { class: 'note' }, ` · déclarée : ${n.choix.portee}`) : null))
      if (n.choix?.alternatives?.length) corps.append(el('div', { class: 'par' }, el('span', { class: 'mot' }, 'alternatives'), ' ', el('span', { class: 'rejete' }, n.choix.alternatives.join(' · '))))
    }
    const d = demonstrationPrincipale(n)
    if (d && d.premisses.length) corps.append(this.lignePar(d, null))
    this.complements(corps, e.i, null)
    const r = this.rangee(e, 0, null, [e.i], corps, this.marge(e.i), 'r-fondation')
    this.enfantsDe(e, r)
    return r
  }

  private etape(e: Element, parent: Rangee | null): Rangee {
    const n = this.noeud(e.i)
    const racine = e.genre === 'racine'
    const corps = el('div', { class: `corps ${racine ? 'racine' : 'etape'}${n.piste === 'abandonnee' ? ' abandonnee' : ''}` })
    if (racine) {
      const en = e.entree!
      corps.append(el('div', { class: 'tete' },
        el('button', { class: 'tri', type: 'button', tabindex: -1 }, ''),
        el('a', { class: 'num num-racine', href: `#n-${n.id}`, 'data-i': e.i }, en.long), ' ',
        el('span', { class: 'titre' }, formule(n.nom)),
        n.statut !== 'valide' ? el('span', { class: `etat etat-${n.statut}` }, ` ${n.statut === 'refute' ? 'réfuté' : 'incertain'}`) : null,
        n.piste === 'abandonnee' ? el('span', { class: 'etat etat-abandon' }, ' piste abandonnée') : null,
        el('span', { class: 'masques' }),
      ))
      corps.append(el('div', { class: 'enonce enonce-racine' }, formule(n.enonce)))
    } else {
      corps.append(this.tete(e, n), el('div', { class: 'enonce' }, formule(n.enonce)))
    }
    const d = demonstrationPrincipale(n)
    if (d) corps.append(this.lignePar(d, e.entree, racine ? 'Preuve.' : undefined))
    this.complements(corps, e.i, e.entree)
    const r = this.rangee(e, e.niveau, parent, [e.i], corps, this.marge(e.i), racine ? 'r-racine' : '')
    this.enfantsDe(e, r)
    return r
  }

  private decision(e: Element, parent: Rangee | null): Rangee {
    const n = this.noeud(e.i)
    const info = n.decision
    const cadre = el('div', { class: 'cadre-decision' },
      el('div', { class: 'tete' },
        el('button', { class: 'tri', type: 'button', tabindex: -1 }, ''),
        el('span', { class: 'type' }, 'Décision'), ' ',
        el('a', { class: 'num', href: `#n-${n.id}`, 'data-i': e.i }, e.etiquette), ' — ',
        el('span', { class: 'question' }, info?.question ?? n.nom),
        el('span', { class: 'masques' }),
      ),
    )
    if (info) {
      const table = el('table', { class: 'alternatives' })
      for (const a of info.alternatives) {
        table.append(el('tr', { class: a.retenue ? 'retenue' : 'rejetee' },
          el('td', { class: 'marque' }, a.retenue ? 'retenue' : 'rejetée'),
          el('td', { class: 'libelle' }, formule(a.libelle)),
          el('td', { class: 'raison' }, a.raison ? formule(a.raison) : ''),
        ))
      }
      cadre.append(table, el('div', { class: 'raison-dec' }, formule(info.raison)), el('div', { class: 'date-dec' }, `${dateFr.format(new Date(info.date))} · ${info.auteur}`))
    } else cadre.append(el('div', { class: 'enonce' }, formule(n.enonce)))
    const d = demonstrationPrincipale(n)
    if (d) cadre.append(this.lignePar(d, e.entree))
    this.complements(cadre, e.i, e.entree)
    const corps = el('div', { class: `corps decision${n.piste === 'abandonnee' ? ' abandonnee' : ''}` }, cadre)
    const r = this.rangee(e, e.niveau, parent, [e.i], corps, this.marge(e.i), 'r-decision')
    this.enfantsDe(e, r)
    return r
  }

  private serie(s: Serie, parent: Rangee): void {
    const noeuds = s.lignes.map((l) => this.noeud(l.i))
    const reParam = /\(?\s*([^\s(]+)\s*=\s*([^\s)]+)\s*\)?/
    const params = noeuds.map((n) => n.nom.match(reParam))
    const nomParam = params.every((m) => m && m[1] === params[0]![1]) ? params[0]![1]! : null
    const titres = noeuds.map((n, k) => (nomParam ? n.nom.replace(params[k]![0], ' ') : n.nom).replace(/\s+/g, ' ').replace(/[\s,]+$/, '').trim())
    const titreCommun = titres.every((t) => t === titres[0]) ? titres[0]! : null
    const reMesure = /^(.+?)\s*=\s*(.+?)\s*±\s*(.+?)\.?$/
    const mesures = noeuds.map((n) => n.enonce.match(reMesure))
    const lhs = mesures.every((m) => m && m[1] === mesures[0]![1]) ? mesures[0]![1]! : null
    const colonnes = ['4.6em', ...(nomParam ? ['5em'] : []), ...(titreCommun === null ? ['minmax(0, 1fr)'] : []), ...(lhs ? ['6em', '4em'] : ['minmax(0, 1.4fr)']), '6.5em']
    const gabarit = colonnes.join(' ')
    const grille = (...cellules: (HTMLElement | string)[]) => el('div', { class: 'grille-serie', style: `grid-template-columns: ${gabarit}` }, ...cellules.map((c) => (typeof c === 'string' ? el('span', {}, c) : c)))
    const type = LIBELLES_TYPE[noeuds[0]!.type].toLowerCase()
    const pour = s.lignes.map((l) => l.i)
    // En-tête du tableau.
    const tete = el('div', { class: 'corps serie-tete' },
      el('div', { class: 'legende-serie' }, el('span', { class: 'type' }, 'Série'), ` · ${s.lignes.length} ${type}s`, titreCommun ? el('span', { class: 'titre' }, ' — ', formule(titreCommun)) : null),
      grille('n°', ...(nomParam ? [el('span', {}, formule(nomParam))] : []), ...(titreCommun === null ? ['énoncé'] : []), ...(lhs ? [el('span', {}, formule(lhs)), '±'] : ['mesure']), 'activité'),
    )
    tete.style.setProperty('--niveau', String(Math.min(s.niveau, 12)))
    const rt = this.rangee(null, s.niveau, parent, pour, tete, null, 'r-serie-tete')
    void rt
    // Lignes.
    s.lignes.forEach((l, k) => {
      const n = noeuds[k]!
      const act = l.activite!
      const actEl = this.p.elements[act]!
      const cellAct = el('span', { class: 'activite' })
      const lienAct = this.renvoi(act, l.entree)
      if (actEl.parent === l) lienAct.id = `n-${this.noeud(act).id}`
      cellAct.append(lienAct, ' ', el('span', { class: 'nom-court' }, LIBELLES_ORIGINE[this.noeud(act).origine]))
      const cells: (HTMLElement | string)[] = [el('a', { class: 'num', href: `#n-${n.id}`, 'data-i': l.i }, l.etiquette)]
      if (nomParam) cells.push(el('span', { class: 'mono' }, params[k]![2]!))
      if (titreCommun === null) cells.push(el('span', {}, formule(titres[k]!), n.statut !== 'valide' ? el('span', { class: `etat etat-${n.statut}` }, ' incertain') : null))
      if (lhs) cells.push(el('span', { class: 'mono' }, mesures[k]![2]!), el('span', { class: 'mono doux' }, mesures[k]![3]!))
      else cells.push(el('span', { class: 'mesure' }, formule(n.enonce)))
      cells.push(cellAct)
      const corps = el('div', { class: 'corps serie-ligne' }, grille(...cells))
      this.complements(corps, l.i, l.entree)
      const r = this.rangee(l, s.niveau, parent, [l.i], corps, this.marge(l.i), 'r-serie')
      if (actEl.parent === l) this.rangeeDe.set(act, r)
    })
    // Pied : prémisses des activités, mises en commun.
    const pied = el('div', { class: 'corps serie-pied' })
    pied.style.setProperty('--niveau', String(Math.min(s.niveau, 12)))
    if (s.activites.length) {
      const d0 = demonstrationPrincipale(this.noeud(s.activites[0]!.i))
      const memes = s.activites.every((a) => {
        const d = demonstrationPrincipale(this.noeud(a.i))
        return d && d0 && d.premisses.map((x) => x.id).join() === d0.premisses.map((x) => x.id).join()
      })
      const bornes = `${s.activites[0]!.etiquette}–${s.activites[s.activites.length - 1]!.etiquette}`
      if (d0 && memes) pied.append(this.lignePar(d0, s.parent.entree, `activités ${bornes}`))
      else for (const a of s.activites) {
        const d = demonstrationPrincipale(this.noeud(a.i))
        if (d) pied.append(this.lignePar(d, s.parent.entree, `activité ${a.etiquette}`))
      }
    }
    const d1 = demonstrationPrincipale(noeuds[0]!)
    if (d1) {
      const ctx = premissesParRole(this.p, d1).filter(([r]) => r === 'contexte')
      if (ctx.length) {
        const ligne = el('div', { class: 'par' }, el('span', { class: 'mot' }, `${type}s`), ' ', el('span', { class: 'mot role-contexte' }, 'ctx.'), ' ')
        ctx[0]![1].forEach((k, x) => ligne.append(x ? ', ' : '', this.renvoi(k, s.parent.entree)))
        pied.append(ligne)
      }
    }
    if (pied.childNodes.length) this.rangee(null, s.niveau, parent, pour, pied, null, 'r-serie-pied')
    for (const c of s.communs) this.element(c, parent)
  }

  private element(e: Element, parent: Rangee | null): Rangee {
    return e.genre === 'decision' ? this.decision(e, parent) : this.etape(e, parent)
  }

  private enfantsDe(e: Element, r: Rangee): void {
    for (const b of e.enfants) {
      if (b.genre === 'element') this.element(b.e, r)
      else this.serie(b.s, r)
    }
  }

  // ─── Document ─────────────────────────────────────────────────────────────

  construire(): void {
    const p = this.p
    // Supposons.
    this.titreSection('Supposons', 'Hypothèses, choix de modélisation et définitions sur lesquels reposent tous les résultats ; les filets à gauche suivent la portée calculée de chaque choix M.')
    for (const f of FAMILLES) {
      const liste = p.fondations.get(f.id)!
      if (!liste.length) continue
      this.titreSection(`${f.titre} · ${f.id}1–${f.id}${liste.length}`, null, 'sous-section')
      for (const e of liste) this.fondation(e)
    }
    // Entrées, par section.
    let section: Section | null = null
    for (const en of p.entrees) {
      if (en.section !== section) {
        section = en.section
        const nb = p.entrees.filter((x) => x.section === section).length
        const sous = section === 'resultats'
          ? 'Chaque résultat est suivi de sa preuve : ⟨1⟩ = prémisses principales de sa démonstration principale, ⟨2⟩ = les leurs, etc. Un énoncé partagé est développé une seule fois, puis cité par son numéro.'
          : section === 'complements' ? 'Énoncés qu’aucun résultat n’utilise comme prémisse principale (lemmes annexes, variantes, suivis de constantes). Repliés par défaut.'
            : null
        this.titreSection(`${TITRES_SECTION[section]} · ${nb}`, sous)
      }
      const r = this.element(en.racine, null)
      this.racines.push({ entree: en, rangee: r })
    }
    // Contrôles.
    if (p.controles.length) {
      this.titreSection(`Contrôles · ${p.controles.length}`, 'Calculs qui ne font que vérifier un énoncé (calcul formel, formalisation Lean) ; chacun est aussi signalé sous l’énoncé qu’il contrôle.')
      for (const c of p.controles) {
        const n = this.noeud(c.i)
        const cible = p.j.index.get(demonstrationPrincipale(n)!.premisses.find((x) => x.role === 'principale')!.id)!
        const corps = el('div', { class: 'corps fondation' },
          el('div', { class: 'tete' },
            el('button', { class: 'tri', type: 'button', tabindex: -1 }, ''),
            el('a', { class: 'num', href: `#n-${n.id}`, 'data-i': c.i }, c.etiquette), ' ',
            el('span', { class: 'titre' }, formule(n.nom)), ' ', el('span', { class: 'mot' }, 'contrôle'), ' ', this.renvoi(cible, null),
            el('span', { class: 'masques' }),
          ),
          el('div', { class: 'enonce' }, formule(n.enonce)),
        )
        this.complements(corps, c.i, null)
        this.rangee(c, 0, null, [c.i], corps, this.marge(c.i), 'r-fondation')
      }
    }
    // Rangées qui ont des descendants : triangle actif.
    for (const r of this.rangees) {
      r.bouton = r.el.querySelector<HTMLButtonElement>('.corps > .tete > .tri, .cadre-decision > .tete > .tri')
      r.compteMasques = r.el.querySelector<HTMLSpanElement>('.masques')
      if (r.bouton && r.enfants.length) r.bouton.classList.add('actif')
    }
  }

  /** Renvois croisés (prémisses principales citées et non développées dessous) pour la mini-carte. */
  renvoisDe(r: Rangee): number[] {
    const e = r.element
    if (!e || e.genre === 'fondation' || e.genre === 'controle') return []
    const d = demonstrationPrincipale(this.noeud(e.i))
    if (!d) return []
    const dessous = new Set(enfantsDirects(e))
    const res: number[] = []
    for (const q of d.premisses) {
      if (q.role !== 'principale') continue
      const k = this.p.j.index.get(q.id)
      if (k === undefined || dessous.has(k)) continue
      const g = this.p.elements[k]!.genre
      if (g !== 'fondation') res.push(k)
    }
    return res
  }
}
