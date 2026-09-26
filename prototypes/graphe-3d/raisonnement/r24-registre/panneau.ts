// Panneau latéral (décision QOC + ACH + portée, fiche de jalon, liste-clé), infobulle et registre.

import { el } from '../../src/core/ui/dom'
import {
  demonstrationPrincipale, LIBELLES_ORIGINE, LIBELLES_ROLE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, LIBELLES_VALIDITE,
  type NoeudR, type RolePremisse,
} from '../../src/raisonnement/donnees'
import { analyserACH, analyserQOC } from './criteres'
import { s } from './dessin'
import { confianceDe, JOUR, porteeDe, type Jalon, type Registre } from './modele'

export interface Actions {
  selectionner: (cle: string | null) => void
  basculerPortee: (i: number) => void
  porteeActive: () => number | null
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const fmtCourt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const pc = (v: number) => v.toFixed(2).replace('.', ',')
export const jourDe = (r: Registre, t: number) => Math.floor((t - r.debut) / JOUR) + 1
const dateLongue = (r: Registre, t: number) => `${fmtDate.format(new Date(t))} · j${jourDe(r, t)}`
export const dateCourte = (t: number) => fmtCourt.format(new Date(t))

const GENRES: Record<Jalon['genre'], string> = {
  decision: 'Décision', choix: 'Choix de modélisation', resultat: 'Résultat', enonce: 'Énoncé',
  observation: 'Observation', demarche: 'Expérience ou calcul', campagne: 'Campagne',
}

const statutEl = (n: NoeudR) => el('span', { class: `statut st-${n.statut}` }, LIBELLES_STATUT[n.statut])
const idEl = (t: string) => el('span', { class: 'id' }, t)

/** Lien cliquable vers le jalon qui couvre le nœud i (ou simple identifiant si mineur). */
function refNoeud(r: Registre, i: number, a: Actions, avecNom = true): HTMLElement {
  const j = r.jalonDe[i]
  const n = r.j.noeuds[i]!
  const contenu = [idEl(r.ident[i]!), avecNom ? ` ${n.nom}` : '']
  if (!j) return el('button', { type: 'button', class: 'ref ref-mineur', title: `${LIBELLES_TYPE[n.type]} · ${n.nom} (nœud mineur)`, onclick: () => a.selectionner(`n:${i}`) }, ...contenu)
  return el('button', { type: 'button', class: 'ref', title: `${j.ident} · ${j.titre}`, onclick: () => a.selectionner(j.cle) }, ...contenu)
}

/** Intervalle de confiance sur une échelle 0–1 graduée. */
function intervalleLarge(n: NoeudR): SVGSVGElement {
  const c = confianceDe(n)
  const L = 180
  const x = (v: number) => 6 + v * L
  const svg = s('svg', { width: L + 12, height: 26, class: 'ic-large' })
  svg.append(s('line', { x1: x(0), x2: x(1), y1: 9, y2: 9, class: 'ic-echelle' }))
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    svg.append(s('line', { x1: x(v), x2: x(v), y1: 6, y2: 12, class: 'ic-grad' }))
    if (v === 0 || v === 0.5 || v === 1) svg.append(s('text', { x: x(v), y: 23, class: 'ic-grad-lib' }, pc(v)))
  }
  svg.append(s('line', { x1: x(c.bas), x2: x(c.haut), y1: 9, y2: 9, class: 'ic-plage' }))
  svg.append(s('line', { x1: x(c.estimation), x2: x(c.estimation), y1: 4, y2: 14, class: 'ic-point' }))
  return svg
}

function meta(lignes: [string, Node | string][]): HTMLElement {
  return el('dl', { class: 'meta' }, lignes.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]))
}

function blocPortee(r: Registre, i: number, a: Actions, nomSujet: string): HTMLElement {
  const portee = porteeDe(r, i)
  const parLigne = new Map<string, { n: number; jalons: Set<string> }>()
  const parStatut = { valide: 0, incertain: 0, refute: 0 }
  for (const k of portee) {
    const n = r.j.noeuds[k]!
    parStatut[n.statut]++
    const e = parLigne.get(n.sousProbleme) ?? { n: 0, jalons: new Set() }
    e.n++
    const j = r.jalonDe[k]
    if (j) e.jalons.add(j.ident)
    parLigne.set(n.sousProbleme, e)
  }
  const resultats = portee.filter((k) => ['theoreme', 'resultat'].includes(r.j.noeuds[k]!.type))
  const active = a.porteeActive() === i
  return el('section', { class: 'p-section' },
    el('h3', {}, 'Portée'),
    el('p', { class: 'p-chiffre' }, el('b', {}, String(portee.length)), ` nœuds dépendent de ${nomSujet} (graphe complet, transitif) : `,
      `${parStatut.valide} validés, ${parStatut.incertain} incertains, ${parStatut.refute} réfutés.`),
    portee.length ? el('table', { class: 'tab tab-compacte' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Ligne'), el('th', { class: 'num' }, 'Nœuds'), el('th', {}, 'Jalons touchés'))),
      el('tbody', {}, r.lignes.filter((l) => parLigne.has(l.sp.id)).map((l) => {
        const e = parLigne.get(l.sp.id)!
        return el('tr', {}, el('td', {}, l.sp.nom), el('td', { class: 'num' }, String(e.n)), el('td', { class: 'mono' }, [...e.jalons].join(' ') || '—'))
      })),
    ) : null,
    resultats.length ? el('p', { class: 'p-liste' }, 'Résultats touchés : ', ...resultats.flatMap((k, n) => [n ? ', ' : '', refNoeud(r, k, a)])) : null,
    portee.length ? el('button', { type: 'button', class: `bouton${active ? ' actif' : ''}`, onclick: () => a.basculerPortee(i) },
      active ? 'Masquer la portée sur la frise' : 'Montrer la portée sur la frise') : null,
  )
}

function blocDemonstrations(r: Registre, n: NoeudR, a: Actions): HTMLElement | null {
  if (!n.demonstrations.length) return null
  const princ = demonstrationPrincipale(n)
  return el('section', { class: 'p-section' },
    el('h3', {}, n.demonstrations.length > 1 ? `Démonstrations (${n.demonstrations.length})` : 'Démonstration'),
    ...n.demonstrations.map((d) => {
      const parRole = new Map<RolePremisse, number[]>()
      for (const p of d.premisses) {
        const i = r.j.index.get(p.id)
        if (i === undefined) continue
        parRole.set(p.role, [...(parRole.get(p.role) ?? []), i])
      }
      return el('div', { class: `demo${d === princ ? ' demo-principale' : ''}` },
        el('div', { class: 'demo-tete' },
          el('span', { class: 'demo-nom' }, d.nom), d === princ && n.demonstrations.length > 1 ? el('span', { class: 'etiquette' }, 'principale') : null,
          el('span', { class: `validite va-${d.validite}` }, LIBELLES_VALIDITE[d.validite]),
          el('span', { class: 'demo-auteur' }, d.auteur)),
        ...(['principale', 'auxiliaire', 'technique', 'contexte'] as RolePremisse[]).filter((ro) => parRole.has(ro)).map((ro) =>
          el('div', { class: 'demo-role' }, el('span', { class: 'demo-role-nom' }, LIBELLES_ROLE[ro].toLowerCase()),
            el('span', { class: 'demo-refs' }, ...parRole.get(ro)!.flatMap((i, k) => [k ? ' ' : '', refNoeud(r, i, a, false)])))),
      )
    }),
  )
}

// ─── Décision ────────────────────────────────────────────────────────────────

function panneauDecision(r: Registre, j: Jalon, a: Actions): HTMLElement {
  const n = r.j.noeuds[j.noeud]!
  const d = n.decision!
  const qoc = analyserQOC(d)
  const ach = analyserACH(n, r.j.noeuds, r.j.index)
  const lettres = d.alternatives.map((_, k) => String.fromCharCode(97 + k))
  const enTeteOptions = d.alternatives.map((alt, k) =>
    el('th', { class: `opt${alt.retenue ? ' opt-retenue' : ''}`, title: alt.libelle }, el('span', { class: 'mono' }, lettres[k]!), ' ', alt.libelle, alt.retenue ? el('div', { class: 'etiquette' }, 'retenue') : null))
  const contraintes = r.contraintes.get(j.cle) ?? []

  const tableQOC = el('table', { class: 'tab qoc' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Critère'), ...enTeteOptions)),
    el('tbody', {},
      qoc.lignes.map((l) => el('tr', { class: l.determinant ? 'determinant' : '' },
        el('th', { scope: 'row' }, l.critere.libelle, l.determinant ? el('div', { class: 'etiquette' }, 'déterminant') : null),
        ...l.cellules.map((c) => c
          ? el('td', { class: `cel cel-${c.polarite}${c.source === 'statut' ? ' cel-deduite' : ''}`, title: `« ${c.extrait} »${c.source === 'statut' ? ' — polarité déduite du statut de l’option' : ''}` },
            c.polarite === 'favorable' ? '✓' : '✕', c.source === 'statut' ? el('sup', {}, '*') : null)
          : el('td', { class: 'cel cel-vide' }, '—')))),
    ),
    el('tfoot', {},
      el('tr', {}, el('th', { scope: 'row' }, 'Solde ✓ − ✕'), ...qoc.soldes.map((v) => el('td', { class: 'cel num' }, v > 0 ? `+${v}` : String(v)))),
      el('tr', { class: 'raisons' }, el('th', { scope: 'row' }, 'Raison'), ...d.alternatives.map((alt) => el('td', {}, alt.raison ?? '—'))),
    ),
  )
  const verdict = qoc.retenueDominante === null
    ? 'Aucun critère déterminant évalué sur les options : cohérence non vérifiable.'
    : qoc.retenueDominante
      ? 'L’option retenue est au moins aussi bien placée que les autres sur les critères déterminants.'
      : 'Incohérence : une option écartée est mieux placée que l’option retenue sur les critères déterminants.'

  const tableACH = ach.length ? el('table', { class: 'tab ach' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Prémisse'), el('th', {}, 'Rôle'), ...lettres.map((l, k) => el('th', { class: `num${d.alternatives[k]!.retenue ? ' opt-retenue' : ''}`, title: d.alternatives[k]!.libelle }, l)), el('th', {}, 'Diagn.'))),
    el('tbody', {}, ach.map((l) => el('tr', { class: l.diagnostique ? '' : 'non-diagnostique' },
      el('td', {}, refNoeud(r, l.noeud, a)),
      el('td', { class: 'petit' }, LIBELLES_ROLE[l.role].toLowerCase()),
      ...l.marques.map((mq, k) => el('td', { class: `num marque marque-${mq === '+' ? 'plus' : mq === '−' ? 'moins' : 'neutre'}`, title: l.communs[k]!.length ? `Mots partagés : ${l.communs[k]!.join(', ')}` : 'Aucun mot partagé' }, mq)),
      el('td', { class: 'petit' }, l.diagnostique ? 'oui' : 'non')))),
  ) : el('p', { class: 'p-note' }, 'Aucune prémisse déclarée.')

  return el('div', { class: 'p-contenu' },
    el('div', { class: 'p-entete' }, idEl(j.ident), el('span', { class: 'p-type' }, 'Décision'), el('span', { class: 'p-date' }, dateLongue(r, j.date))),
    el('p', { class: 'p-question' }, d.question),
    el('h2', { class: 'p-titre' }, n.nom),
    meta([
      ['Auteur', `${d.auteur} (${LIBELLES_ORIGINE[n.origine].toLowerCase()})`],
      ['Ligne', r.lignes.find((l) => l.sp.id === j.ligne)?.sp.nom ?? j.ligne],
      ['Statut', el('span', {}, statutEl(n), ` · validation ${LIBELLES_VALIDATION[n.validation]}`)],
      ['Contrainte par', contraintes.length ? el('span', {}, ...contraintes.flatMap((c, k) => [k ? ', ' : '', refNoeud(r, r.j.index.get(c)!, a)])) : '—'],
    ]),
    el('section', { class: 'p-section' },
      el('h3', {}, 'Options × critères'),
      tableQOC,
      el('p', { class: `p-note${qoc.retenueDominante === false ? ' alerte' : ''}` }, verdict),
      el('p', { class: 'p-note' }, 'Critères extraits des raisons par lexique fixe ; ', el('sup', {}, '*'), ' polarité déduite du statut de l’option (la raison cite le critère sans le qualifier). Survoler une cellule pour lire l’extrait.'),
    ),
    el('section', { class: 'p-section' },
      el('h3', {}, 'Motifs × options'),
      tableACH,
      el('p', { class: 'p-note' }, '− : la prémisse partage du vocabulaire avec la raison du rejet ; + : elle fonde l’option retenue ; · : non pertinente. Une prémisse non diagnostique marque toutes les options pareil.'),
    ),
    el('section', { class: 'p-section' }, el('h3', {}, 'Raison déclarée'), el('p', { class: 'p-texte' }, d.raison)),
    blocPortee(r, j.noeud, a, j.ident),
  )
}

// ─── Jalon ───────────────────────────────────────────────────────────────────

function panneauJalon(r: Registre, j: Jalon, a: Actions): HTMLElement {
  const n = r.j.noeuds[j.noeud]!
  const amont = r.correspondances.filter(([, b]) => b === j.cle).map(([x]) => r.parCle.get(x)!)
  const aval = r.correspondances.filter(([x]) => x === j.cle).map(([, b]) => r.parCle.get(b)!)
  const refJ = (x: Jalon) => el('button', { type: 'button', class: 'ref', onclick: () => a.selectionner(x.cle) }, idEl(x.ident), ` ${x.titre}`)
  const decisionsContraintes = [...r.contraintes].filter(([, cs]) => cs.includes(n.id)).map(([k]) => r.parCle.get(k)!)
  const liens = r.arcs.filter((x) => x.de === j.noeud || x.vers === j.noeud)

  if (j.genre === 'campagne') {
    const exps = j.membres.filter((i) => r.j.noeuds[i]!.type !== 'observation')
    const obsDe = (i: number) => j.membres.filter((o) => r.j.noeuds[o]!.type === 'observation' && r.j.noeuds[o]!.demonstrations.some((d) => d.premisses.some((p) => p.id === r.j.noeuds[i]!.id)))
    return el('div', { class: 'p-contenu' },
      el('div', { class: 'p-entete' }, idEl(j.ident), el('span', { class: 'p-type' }, 'Campagne'), el('span', { class: 'p-date' }, `${dateCourte(j.debut)} → ${dateLongue(r, j.date)}`)),
      el('h2', { class: 'p-titre' }, j.titre),
      el('p', { class: 'p-note' }, `${exps.length} ${LIBELLES_TYPE[r.j.noeuds[exps[0]!]!.type].toLowerCase()}s de même souche et leurs ${j.membres.length - exps.length} observations, regroupés en un jalon.`),
      el('table', { class: 'tab tab-compacte' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Id'), el('th', {}, 'Réglage'), el('th', {}, 'Observation'), el('th', {}, 'Statut'))),
        el('tbody', {}, exps.map((i) => {
          const obs = obsDe(i)
          const e = r.j.noeuds[i]!
          return el('tr', {},
            el('td', { class: 'mono' }, r.ident[i]!),
            el('td', {}, e.nom),
            el('td', {}, obs.length ? obs.map((o) => r.j.noeuds[o]!.enonce).join(' ') : '—'),
            el('td', {}, statutEl(obs.length ? r.j.noeuds[obs[0]!]! : e)))
        })),
      ),
      amont.length ? el('section', { class: 'p-section' }, el('h3', {}, 'Vient d’autres lignes'), el('div', { class: 'p-refs' }, amont.map(refJ))) : null,
      aval.length ? el('section', { class: 'p-section' }, el('h3', {}, 'Sert à d’autres lignes'), el('div', { class: 'p-refs' }, aval.map(refJ))) : null,
      blocPortee(r, j.noeud, a, `${j.ident} (dernier réglage)`),
    )
  }

  return el('div', { class: 'p-contenu' },
    el('div', { class: 'p-entete' }, idEl(j.ident), el('span', { class: 'p-type' }, `${LIBELLES_TYPE[n.type]}${!r.jalonDe[j.noeud] ? ' · nœud mineur' : j.genre === 'choix' ? '' : ` · ${GENRES[j.genre].toLowerCase()}`}`), el('span', { class: 'p-date' }, dateLongue(r, j.date))),
    el('h2', { class: 'p-titre' }, n.nom),
    el('p', { class: 'p-enonce' }, n.enonce),
    n.choix ? el('section', { class: 'p-section' },
      el('h3', {}, 'Choix de modélisation'),
      meta([
        ['Hypothèse', n.choix.hypothese],
        ['Portée déclarée', n.choix.portee],
        ['Autres modèles', n.choix.alternatives?.length ? n.choix.alternatives.join(' ; ') : '—'],
        ['Décisions contraintes', decisionsContraintes.length ? el('span', {}, ...decisionsContraintes.flatMap((x, k) => [k ? ', ' : '', refJ(x)])) : '—'],
      ])) : null,
    meta([
      ['Auteur', `${n.auteur} (${LIBELLES_ORIGINE[n.origine].toLowerCase()})`],
      ['Statut', el('span', {}, statutEl(n), ` · validation ${LIBELLES_VALIDATION[n.validation]}`)],
      ['Confiance', el('span', { class: 'ic-ligne' }, intervalleLarge(n), el('span', { class: 'mono petit' }, `${pc(confianceDe(n).estimation)} [${pc(confianceDe(n).bas)} ; ${pc(confianceDe(n).haut)}]`))],
      ['Piste', n.piste === 'abandonnee' ? 'abandonnée' : 'active'],
    ]),
    liens.length ? el('section', { class: 'p-section' }, el('h3', {}, 'Liens'),
      ...liens.map((x) => el('p', { class: 'p-liste' }, refNoeud(r, x.de, a), ` ${x.genre === 'resout' ? 'résout' : x.genre} `, refNoeud(r, x.vers, a), x.note ? el('span', { class: 'p-note' }, ` — ${x.note}`) : null))) : null,
    blocDemonstrations(r, n, a),
    amont.length ? el('section', { class: 'p-section' }, el('h3', {}, 'Vient d’autres lignes'), el('div', { class: 'p-refs' }, amont.map(refJ))) : null,
    aval.length ? el('section', { class: 'p-section' }, el('h3', {}, 'Sert à d’autres lignes'), el('div', { class: 'p-refs' }, aval.map(refJ))) : null,
    blocPortee(r, j.noeud, a, j.ident),
  )
}

// ─── Par défaut : légende et liste-clé ───────────────────────────────────────

function echantillon(genre: Jalon['genre'] | 'rug' | 'branche' | 'ic', cls = ''): SVGSVGElement {
  const svg = s('svg', { width: 28, height: 18, class: 'echantillon' })
  const g = s('g', { transform: 'translate(14 9)', class: `gl st-valide ${cls}` })
  if (genre === 'decision') g.append(s('path', { d: 'M0 -6.5 L6.5 0 L0 6.5 L-6.5 0 Z', class: 'f-creux' }))
  else if (genre === 'resultat') g.append(s('circle', { r: 5.5, class: 'f-plein' }))
  else if (genre === 'enonce') g.append(s('circle', { r: 5, class: 'f-creux' }))
  else if (genre === 'observation') g.append(s('ellipse', { rx: 6.5, ry: 4.2, class: 'f-creux' }))
  else if (genre === 'demarche') g.append(s('rect', { x: -4.5, y: -4.5, width: 9, height: 9, class: 'f-creux' }))
  else if (genre === 'campagne') g.append(s('rect', { x: -2.5, y: -6.5, width: 9, height: 9, class: 'f-creux f-arriere' }), s('rect', { x: -4.5, y: -4.5, width: 9, height: 9, class: 'f-creux' }))
  else if (genre === 'rug') for (const x of [-8, -5, -1, 4, 6, 9]) g.append(s('line', { x1: x, x2: x, y1: -3, y2: 3, class: 'tiret' }))
  else if (genre === 'branche') g.append(s('path', { d: 'M-10 -6 L-2 4 H3', class: 'branche' }), s('text', { x: 4, y: 7, class: 'branche-croix' }, '✕'))
  else if (genre === 'ic') g.append(s('line', { x1: -12, x2: 12, y1: 0, y2: 0, class: 'ic-echelle' }), s('line', { x1: 2, x2: 9, y1: 0, y2: 0, class: 'ic-plage' }), s('line', { x1: 6, x2: 6, y1: -2.5, y2: 2.5, class: 'ic-point' }))
  svg.append(g)
  return svg
}

export function panneauDefaut(r: Registre, a: Actions): HTMLElement {
  const leg = (svg: SVGSVGElement, texte: string) => el('li', {}, svg, el('span', {}, texte))
  return el('div', { class: 'p-contenu' },
    el('h2', { class: 'p-titre' }, 'Lecture'),
    el('p', { class: 'p-texte' }, `Abscisse = date de création des nœuds (${dateCourte(r.debut)} → ${dateCourte(r.fin)}), une ligne par sous-problème. `,
      `${r.jalons.length} jalons couvrent ${r.jalonDe.filter(Boolean).length} des ${r.j.noeuds.length} nœuds ; les autres sont des tirets de densité à leur date exacte.`),
    el('ul', { class: 'legende' },
      leg(echantillon('decision'), 'Décision : la ligne continue sur l’option retenue'),
      leg(echantillon('branche'), 'Option écartée (survol : raison)'),
      leg(echantillon('resultat'), 'Théorème, résultat'),
      leg(echantillon('enonce'), 'Proposition ; en tirets : conjecture'),
      leg(echantillon('observation'), 'Observation qui fonde un énoncé'),
      leg(echantillon('demarche'), 'Expérience ou calcul cité par une conclusion'),
      leg(echantillon('campagne'), 'Campagne : série de même protocole (barre = durée)'),
      leg(echantillon('rug'), 'Nœuds mineurs, à leur date'),
      leg(echantillon('ic'), 'Confiance [bas ; haut] et estimation, échelle 0–1 commune'),
    ),
    el('p', { class: 'p-note' }, 'Contour : encre = validé, ocre = incertain, brique barrée = réfuté ; gris en tirets : piste abandonnée. Arcs : contredit ⊣, résout ⊢. Filets pointillés : choix de modélisation (M) qui contraignent une décision. Courbes grises : prémisse venue d’une autre ligne (en tirets si ajoutée après coup).'),
    el('section', { class: 'p-section' },
      el('h3', {}, 'Liste-clé des jalons'),
      ...r.lignes.map((l) => el('div', { class: 'cle-ligne' },
        el('div', { class: 'cle-titre' }, l.sp.nom),
        el('table', { class: 'tab tab-cle' }, el('tbody', {},
          [...l.choix, ...l.jalons].map((j) => el('tr', { class: 'cliquable', onclick: () => a.selectionner(j.cle) },
            el('td', { class: 'mono' }, j.ident), el('td', {}, j.titre), el('td', { class: 'petit droite' }, dateCourte(j.date)))))),
      )),
    ),
  )
}

export function rendrePanneau(r: Registre, cle: string | null, a: Actions): HTMLElement {
  let j = cle ? r.parCle.get(cle) : undefined
  if (!j && cle?.startsWith('n:')) {
    const i = Number(cle.slice(2))
    const n = r.j.noeuds[i]
    if (n) j = { cle, genre: 'enonce', ident: r.ident[i]!, titre: n.nom, ligne: n.sousProbleme, noeud: i, membres: [i], date: r.dates[i]!, debut: r.dates[i]! }
  }
  if (!j) return panneauDefaut(r, a)
  const contenu = j.genre === 'decision' && r.j.noeuds[j.noeud]!.decision ? panneauDecision(r, j, a) : panneauJalon(r, j, a)
  return el('div', {}, el('button', { type: 'button', class: 'retour-liste', onclick: () => a.selectionner(null) }, '← Liste-clé'), contenu)
}

// ─── Infobulle ───────────────────────────────────────────────────────────────

export function ficheCourte(r: Registre, cle: string | null, noeud: number | null): HTMLElement | null {
  const j = cle ? r.parCle.get(cle) : undefined
  const i = j ? j.noeud : noeud
  if (i === null || i === undefined) return null
  const n = r.j.noeuds[i]!
  const c = confianceDe(n)
  const titre = j?.genre === 'campagne' ? j.titre : n.nom
  return el('div', {},
    el('div', { class: 'ib-tete' }, idEl(j?.ident ?? r.ident[i]!), el('span', { class: 'ib-type' }, j ? GENRES[j.genre] : `${LIBELLES_TYPE[n.type]} · mineur`), el('span', { class: 'ib-date' }, j?.genre === 'campagne' ? `${dateCourte(j.debut)} → ${dateCourte(j.date)}` : dateCourte(r.dates[i]!))),
    el('div', { class: 'ib-titre' }, titre),
    n.decision ? el('div', { class: 'ib-question' }, n.decision.question) : j?.genre === 'campagne' ? null : el('div', { class: 'ib-enonce' }, n.enonce),
    el('div', { class: 'ib-pied' }, statutEl(n), ` · ${LIBELLES_VALIDATION[n.validation]} · confiance ${pc(c.estimation)} [${pc(c.bas)} ; ${pc(c.haut)}] · ${n.auteur}`),
  )
}

// ─── Registre (tableaux sous la frise) ───────────────────────────────────────

export function rendreRegistre(r: Registre, fenetre: [number, number] | null, curseur: number | null, selection: string | null, a: Actions): HTMLElement {
  const dans = (t: number) => !fenetre || (t >= fenetre[0] && t <= fenetre[1])
  const futur = (t: number) => curseur !== null && t > curseur
  const decisions = r.decisions.filter((j) => dans(j.date))
  const nomLigne = (id: string) => r.lignes.find((l) => l.sp.id === id)?.sp.nom ?? id
  const lignesDecisions = decisions.map((j) => {
    const n = r.j.noeuds[j.noeud]!
    const d = n.decision
    const qoc = d ? analyserQOC(d) : null
    const dets = qoc?.lignes.filter((l) => l.determinant).map((l) => l.critere.libelle) ?? []
    const retenue = d?.alternatives.find((x) => x.retenue)
    const ecartees = d?.alternatives.filter((x) => !x.retenue) ?? []
    return el('tr', { class: `cliquable${selection === j.cle ? ' ligne-selection' : ''}${futur(j.date) ? ' futur' : ''}`, onclick: () => a.selectionner(j.cle) },
      el('td', { class: 'mono' }, j.ident),
      el('td', { class: 'petit' }, `${dateCourte(j.date)} · j${jourDe(r, j.date)}`),
      el('td', { class: 'petit' }, nomLigne(j.ligne)),
      el('td', { class: 'question-cel' }, d?.question ?? n.nom),
      el('td', {}, retenue?.libelle ?? n.nom),
      el('td', { class: 'petit' }, ecartees.map((x) => x.libelle).join(' ; ') || '—'),
      el('td', { class: 'petit' }, dets.join(', ') || '—', qoc?.retenueDominante === false ? el('span', { class: 'alerte' }, ' · incohérent') : null),
      el('td', { class: 'mono petit' }, (r.contraintes.get(j.cle) ?? []).map((c) => r.parCle.get(c)?.ident ?? c).join(' ') || '—'),
      el('td', { class: 'num' }, String(porteeDe(r, j.noeud).length)),
      el('td', { class: 'petit' }, d?.auteur ?? n.auteur),
    )
  })
  const evenements = r.arcs.filter((x) => dans(r.dates[x.de]!)).sort((x, y) => r.dates[x.de]! - r.dates[y.de]!)
  const lignesEvts = evenements.map((x) => el('tr', { class: futur(r.dates[x.de]!) ? 'futur' : '' },
    el('td', { class: 'petit' }, `${dateCourte(r.dates[x.de]!)} · j${jourDe(r, r.dates[x.de]!)}`),
    el('td', {}, refNoeud(r, x.de, a)),
    el('td', { class: 'petit' }, x.genre === 'resout' ? 'résout' : x.genre),
    el('td', {}, refNoeud(r, x.vers, a)),
    el('td', { class: 'petit' }, `${Math.round((r.dates[x.de]! - r.dates[x.vers]!) / JOUR)} j après`),
    el('td', { class: 'petit' }, x.note ?? ''),
  ))
  const filtre = fenetre ? `${dateCourte(fenetre[0])} → ${dateCourte(fenetre[1])}` : 'toute la démarche'
  return el('div', {},
    el('div', { class: 'reg-tete' }, el('h2', {}, 'Registre des décisions'), el('span', { class: 'reg-filtre' }, `${decisions.length} sur ${r.decisions.length} · ${filtre}`)),
    el('table', { class: 'tab registre' },
      el('thead', {}, el('tr', {}, ...['N°', 'Date', 'Ligne', 'Question', 'Option retenue', 'Options écartées', 'Critères déterminants', 'Choix', 'Portée', 'Auteur'].map((t, k) => el('th', { class: k === 8 ? 'num' : '' }, t)))),
      el('tbody', {}, lignesDecisions.length ? lignesDecisions : el('tr', {}, el('td', { colspan: 10, class: 'vide' }, 'Aucune décision dans la fenêtre.'))),
    ),
    el('div', { class: 'reg-tete' }, el('h2', {}, 'Contradictions, résolutions, abandons'), el('span', { class: 'reg-filtre' }, `${evenements.length} sur ${r.arcs.length}`)),
    el('table', { class: 'tab registre' },
      el('thead', {}, el('tr', {}, ...['Date', 'Source', 'Relation', 'Cible', 'Délai', 'Note'].map((t) => el('th', {}, t)))),
      el('tbody', {}, lignesEvts.length ? lignesEvts : el('tr', {}, el('td', { colspan: 6, class: 'vide' }, 'Aucun événement dans la fenêtre.'))),
    ),
  )
}
