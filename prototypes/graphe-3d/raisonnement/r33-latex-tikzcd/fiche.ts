// R33 · Fiche détaillée, ouverte au clic (pas au survol) : un nœud, une flèche (démonstration) ou un talon.
// Composée comme une notice : type en petites capitales, formule centrée (KaTeX, mode display), énoncé,
// tableau des attributs, démonstrations et prémisses par rôle avec leurs repères.

import {
  el, formaterDate, LIBELLES_ORIGINE, LIBELLES_ROLE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, LIBELLES_VALIDITE,
  type DemonstrationR, type NoeudR, type VueRaisonnement,
} from '../../src/raisonnement'
import type { Contenu, StyleFleche } from './contenu'
import { echapperTexte, formuleDuNoeud } from './formules'
import { rendreTex } from './typo'

const GLYPHE: Record<StyleFleche, { tex: string; sens: string }> = {
  simple: { tex: '\\longrightarrow', sens: 'flèche simple : démonstration valide' },
  double: { tex: '\\Longrightarrow', sens: 'flèche double : implication valide vers un théorème, un résultat ou une proposition' },
  pointillee: { tex: '\\dashrightarrow', sens: 'flèche pointillée : démonstration à vérifier' },
  barree: { tex: '\\nrightarrow', sens: 'flèche barrée : démonstration invalide ou conclusion réfutée' },
}

const nombre = (x: number) => x.toFixed(2).replace('.', ',')

function tex(t: string, display = false): HTMLElement {
  const s = el('span', { class: display ? 'r33-fiche-formule' : 'r33-tex' })
  rendreTex(s, t, display)
  return s
}

/** Nom et repère d'une prémisse, avec sa formule si elle en a une. */
function premisse(vue: VueRaisonnement, contenu: Contenu, id: string): HTMLElement {
  const j = vue.justification
  const i = j.index.get(id)
  const n = i !== undefined ? j.noeuds[i] : undefined
  if (!n) return el('span', {}, id)
  const rep = contenu.reperes.get(i!)
  const f = formuleDuNoeud(n)
  return el('span', { class: 'r33-premisse' }, rep ? el('span', { class: 'r33-rep' }, `(${rep}) `) : null, n.nom, f ? el('span', { class: 'r33-doux' }, ' : ', tex(f)) : null)
}

function listePremisses(vue: VueRaisonnement, contenu: Contenu, d: DemonstrationR): HTMLElement {
  const roles = ['principale', 'auxiliaire', 'technique', 'contexte'] as const
  return el('dl', { class: 'r33-roles' }, roles.flatMap((r) => {
    const ps = d.premisses.filter((p) => p.role === r)
    if (!ps.length) return []
    return [el('dt', {}, LIBELLES_ROLE[r]), el('dd', {}, ps.map((p) => el('div', {}, premisse(vue, contenu, p.id))))]
  }))
}

function attributs(n: NoeudR): HTMLElement {
  const c = n.confiance
  return el('dl', { class: 'r33-attributs' },
    el('dt', {}, 'Statut'), el('dd', {}, LIBELLES_STATUT[n.statut]),
    el('dt', {}, 'Validation'), el('dd', {}, LIBELLES_VALIDATION[n.validation]),
    el('dt', {}, 'Confiance'), el('dd', {}, `${nombre(c.estimation)}  [${nombre(c.bas)} ; ${nombre(c.haut)}]`),
    el('dt', {}, 'Origine'), el('dd', {}, `${LIBELLES_ORIGINE[n.origine]} · ${n.auteur}`),
    el('dt', {}, 'Date'), el('dd', {}, formaterDate(Date.parse(n.cree_le))),
  )
}

/** Fiche d'un nœud de justification (unité, entrée de légende ou contexte). */
export function ficheNoeud(vue: VueRaisonnement, contenu: Contenu, i: number): HTMLElement {
  const j = vue.justification
  const n = j.noeuds[i]!
  const p = vue.pointDeNoeud(i)
  const u = p !== null && p < vue.nU ? vue.lecture.unites[p] : undefined
  const sp = vue.jeu.sousProblemes.find((s) => s.id === n.sousProbleme)
  const rep = contenu.reperes.get(i)
  const f = formuleDuNoeud(n)
  const corps = el('div', { class: 'r33-fiche-corps' },
    el('div', { class: 'r33-fiche-type' }, [rep ? `(${rep}) ` : '', LIBELLES_TYPE[n.type], sp ? ` · ${sp.nom}` : '', n.piste === 'abandonnee' ? ' · piste abandonnée' : ''].join('')),
    el('div', { class: 'r33-fiche-titre' }, n.nom),
    f ? tex(f, true) : null,
    el('p', { class: 'r33-fiche-enonce' }, n.enonce),
    attributs(n),
  )
  if (u && u.membres.length > 1) {
    corps.append(el('div', { class: 'r33-fiche-section' }, `Argument replié (${u.membres.length} énoncés, double-clic pour ouvrir)`),
      el('ol', { class: 'r33-fiche-liste' }, u.membres.map((m) => el('li', {}, j.noeuds[m]!.nom))))
  }
  if (n.decision) {
    const d = n.decision
    corps.append(el('div', { class: 'r33-fiche-section' }, d.question),
      el('ul', { class: 'r33-fiche-liste r33-alternatives' }, d.alternatives.map((a) =>
        el('li', { class: a.retenue ? 'retenue' : 'rejetee' }, a.retenue ? 'Retenue : ' : 'Rejetée : ', a.libelle, a.raison ? el('span', { class: 'r33-doux' }, ` (${a.raison})`) : null))),
      el('p', { class: 'r33-doux' }, `Raison : ${d.raison}`))
  }
  if (n.choix) {
    corps.append(el('div', { class: 'r33-fiche-section' }, 'Hypothèse de modélisation'),
      el('p', {}, n.choix.hypothese),
      el('p', { class: 'r33-doux' }, `Portée : ${n.choix.portee}`))
    if (n.choix.alternatives?.length) corps.append(el('p', { class: 'r33-doux' }, `Écartées : ${n.choix.alternatives.join(' ; ')}`))
  }
  n.demonstrations.forEach((d) => {
    corps.append(el('div', { class: 'r33-fiche-section' }, `${d.nom} · ${LIBELLES_VALIDITE[d.validite]}`), listePremisses(vue, contenu, d))
  })
  const usages = j.sortantes[i]!.length
  if (usages) corps.append(el('p', { class: 'r33-doux' }, `Cité comme prémisse par ${usages} énoncé${usages > 1 ? 's' : ''}.`))
  for (const l of n.liens ?? []) {
    const c = j.noeuds[j.index.get(l.cible) ?? -1]
    const verbe = l.genre === 'contredit' ? 'Contredit' : l.genre === 'resout' ? 'Résout' : l.genre === 'abandonne' ? 'Abandonne' : 'Remplace'
    corps.append(el('p', {}, `${verbe} : ${c ? c.nom : l.cible}`, l.note ? el('span', { class: 'r33-doux' }, ` (${l.note})`) : null))
  }
  return corps
}

/** Fiche d'une flèche : la démonstration qu'elle représente. */
export function ficheArete(vue: VueRaisonnement, contenu: Contenu, a: number): HTMLElement {
  const g = vue.lecture
  const j = g.justification
  const ar = g.aretes[a]!
  const et = contenu.aretes[a]!
  const src = j.noeuds[g.unites[ar.source]!.conclusion]!
  const cib = j.noeuds[et.noeud]!
  const fs = formuleDuNoeud(src), fc = formuleDuNoeud(cib)
  const corps = el('div', { class: 'r33-fiche-corps' },
    el('div', { class: 'r33-fiche-type' }, et.branche ? 'Branche de décision' : 'Démonstration'),
    el('div', { class: 'r33-fiche-titre' }, et.demo ? et.demo.nom : 'Démonstration', el('span', { class: 'r33-doux' }, ` de « ${cib.nom} »`)),
    tex(`${fs ? `\\left(${fs}\\right)` : `\\text{${echapperTexte(src.nom)}}`} \\;${GLYPHE[et.style].tex}\\; ${fc ? `\\left(${fc}\\right)` : `\\text{${echapperTexte(cib.nom)}}`}`, true),
    el('p', { class: 'r33-doux' }, GLYPHE[et.style].sens + '.'),
  )
  if (et.branche) {
    const alt = src.decision?.alternatives ?? []
    corps.append(el('div', { class: 'r33-fiche-section' }, src.decision?.question ?? src.nom),
      el('ul', { class: 'r33-fiche-liste r33-alternatives' }, alt.map((x) => el('li', { class: x.retenue ? 'retenue' : 'rejetee' }, x.retenue ? 'Retenue : ' : 'Rejetée : ', x.libelle))))
  }
  if (et.demo) {
    corps.append(el('dl', { class: 'r33-attributs' },
      el('dt', {}, 'Validité'), el('dd', {}, LIBELLES_VALIDITE[et.demo.validite]),
      el('dt', {}, 'Auteur'), el('dd', {}, et.demo.auteur),
      el('dt', {}, 'Date'), el('dd', {}, formaterDate(Date.parse(et.demo.cree_le))),
    ), el('div', { class: 'r33-fiche-section' }, 'Prémisses'), listePremisses(vue, contenu, et.demo))
  }
  const resume = ar.resume.length + ar.transitives.length
  if (resume > 1) corps.append(el('p', { class: 'r33-doux' }, `Cette flèche résume ${resume} arêtes du graphe de justification (${ar.transitives.length} retirée(s) par réduction transitive).`))
  if (!et.principale && !et.branche) corps.append(el('p', { class: 'r33-doux' }, 'Les étiquettes de cette démonstration sont portées par une autre flèche entrante de la même cible.'))
  return corps
}

/** Fiche d'un talon : prémisses toutes non tracées d'une racine. */
export function ficheTalon(vue: VueRaisonnement, contenu: Contenu, u: number): HTMLElement {
  const j = vue.justification
  const n = j.noeuds[vue.lecture.unites[u]!.conclusion]!
  const t = contenu.talons.get(u)!
  return el('div', { class: 'r33-fiche-corps' },
    el('div', { class: 'r33-fiche-type' }, 'Démonstration (prémisses citées)'),
    el('div', { class: 'r33-fiche-titre' }, t.demo.nom, el('span', { class: 'r33-doux' }, ` de « ${n.nom} »`)),
    el('dl', { class: 'r33-attributs' }, el('dt', {}, 'Validité'), el('dd', {}, LIBELLES_VALIDITE[t.demo.validite])),
    listePremisses(vue, contenu, t.demo),
  )
}
