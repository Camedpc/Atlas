// R25 · Audit des hypothèses et de la confiance (direction D5 de RECHERCHE-REPRESENTATION.md).
//
// Trois zones alignées sur les mêmes lignes (une par résultat majeur) : identité, matrice des
// conditions (H, M, Déc), confiance déclarée contre propagée (forest plot) et maillon le plus faible.
// Clic sur une colonne : retrait contrefactuel. Clic sur une ligne : argument de confiance (ACP).

import {
  genererJeuRaisonnement, demonstrationPrincipale,
  LIBELLES_TYPE, LIBELLES_STATUT, LIBELLES_VALIDITE, LIBELLES_ROLE, LIBELLES_ORIGINE, SOUS_PROBLEMES,
  type NoeudR, type Confiance, type Statut, type Validation, type TypeRaisonnement,
} from '../../src/raisonnement/donnees'
import { el } from '../../src/core/ui/dom'
import {
  construireAudit, calculerRetrait, cheminDependance, roleDirect, trier, exporterCsv,
  REGLAGES_DEFAUT, LIBELLES_REGLE, DESCRIPTIONS_REGLE, LIBELLES_TRI, LIBELLES_FAMILLE, FAMILLES,
  type Audit, type LigneAudit, type ColonneAudit, type Retrait, type ReglagesAudit, type Regle, type Profondeur, type Tri,
} from './modele'
import { questionsInference, questionsResultat, schemaDe, LIBELLES_SCHEMA, verdictSynthetique, type QuestionCritique } from './questions'
import meta from './meta.json'

// ─── État ────────────────────────────────────────────────────────────────────

interface Etat {
  reglages: ReglagesAudit
  tri: Tri
  filtreFragile: boolean
  masquerAbandon: boolean
  ouvertesSeulement: boolean
  /** Colonnes retirées (indice de nœud) → alternative choisie (null = simple retrait). */
  retires: Map<number, string | null>
  selection: number | null
}

const CLE = `atlas-raisonnement:${meta.id}`
const etat: Etat = {
  reglages: { ...REGLAGES_DEFAUT },
  tri: 'sous_probleme',
  filtreFragile: false,
  masquerAbandon: false,
  ouvertesSeulement: true,
  retires: new Map(),
  selection: null,
}
try {
  const m = JSON.parse(localStorage.getItem(CLE) ?? 'null') as Partial<Etat> | null
  if (m) {
    if (m.reglages) etat.reglages = { ...etat.reglages, ...m.reglages }
    if (m.tri) etat.tri = m.tri
    etat.filtreFragile = !!m.filtreFragile
    etat.masquerAbandon = !!m.masquerAbandon
    if (m.ouvertesSeulement !== undefined) etat.ouvertesSeulement = m.ouvertesSeulement
  }
} catch {
  // Stockage indisponible : réglages par défaut.
}
function memoriser(): void {
  try {
    const { reglages, tri, filtreFragile, masquerAbandon, ouvertesSeulement } = etat
    localStorage.setItem(CLE, JSON.stringify({ reglages, tri, filtreFragile, masquerAbandon, ouvertesSeulement }))
  } catch {
    // Ignoré.
  }
}

const jeu = genererJeuRaisonnement()
let audit: Audit = construireAudit(jeu, etat.reglages)
let retrait: Retrait | null = null

// ─── Utilitaires ─────────────────────────────────────────────────────────────

const NS = 'http://www.w3.org/2000/svg'
function svg(tag: string, attrs: Record<string, string | number> = {}, ...enfants: (Node | string)[]): SVGElement {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  for (const c of enfants) e.append(c)
  return e
}
const fr = (x: number, d = 2) => x.toFixed(d).replace('.', ',')
const intervalle = (c: Confiance) => `${fr(c.estimation)} [${fr(c.bas)} ; ${fr(c.haut)}]`
const GLYPHE_STATUT: Record<Statut, string> = { valide: '✓', incertain: '?', refute: '✕' }
const SIGLE_VALIDATION: Record<Validation, string> = { aucune: '—', ia: 'IA', humain: 'H', ia_humain: 'IA+H' }
const GLYPHE_VALIDITE = { valide: '✓', a_verifier: '?', invalide: '✕' } as const
const SIGLE_ORIGINE = { humain: 'H', ia: 'IA', ordinateur: 'Ord.' } as const
const noeud = (i: number): NoeudR => audit.j.noeuds[i]!
const sigle = (i: number) => audit.sigles[i]!
const typeCourt = (t: TypeRaisonnement) => LIBELLES_TYPE[t].toLowerCase()

/** Sigle en mono, nom complet au survol. */
function refSigle(i: number, classe = 'a-ref'): HTMLElement {
  return el('span', { class: classe, title: `${LIBELLES_TYPE[noeud(i).type]} · ${noeud(i).nom}` }, sigle(i))
}

// ─── Squelette de la page ────────────────────────────────────────────────────

const app = document.getElementById('app')!
const bulle = el('div', { class: 'a-bulle', hidden: true })
const menu = el('div', { class: 'a-menu', hidden: true })
const bandeau = el('div', { class: 'a-bandeau' })
const conteneurTable = el('div', { class: 'a-table-conteneur' })
const sectionBilan = el('section', { class: 'a-section a-bilan' })
const sectionCle = el('section', { class: 'a-section a-cle' })
const acp = el('aside', { class: 'a-acp', hidden: true })
const outils = el('div', { class: 'a-outils' })

app.append(
  el('header', { class: 'a-tete' },
    el('div', { class: 'a-titres' },
      el('a', { class: 'a-retour', href: '../../index.html' }, '← catalogue'),
      el('h1', {}, 'Audit des hypothèses et de la confiance'),
      el('p', { class: 'a-sous' }, jeu.titre),
      el('p', { class: 'a-resume' }, ''),
    ),
    outils,
  ),
  bandeau,
  el('main', { class: 'a-corps' }, conteneurTable, sectionBilan, sectionCle),
  acp, bulle, menu,
)

// ─── Barre d'outils ──────────────────────────────────────────────────────────

function segment<T extends string>(libelle: string, valeurs: Record<T, string>, courant: T, choisir: (v: T) => void, titres?: Record<T, string>): HTMLElement {
  return el('div', { class: 'a-controle' },
    el('span', { class: 'a-etiquette' }, libelle),
    el('div', { class: 'a-segment' },
      (Object.keys(valeurs) as T[]).map((v) => el('button', {
        type: 'button', class: v === courant ? 'actif' : '', title: titres?.[v],
        onclick: () => choisir(v),
      }, valeurs[v])),
    ),
  )
}

function rendreOutils(): void {
  const selectTri = el('select', { class: 'a-select', onchange: (e: Event) => { etat.tri = (e.target as HTMLSelectElement).value as Tri; toutRendre() } },
    (Object.keys(LIBELLES_TRI) as Tri[]).map((t) => {
      const o = el('option', { value: t }, LIBELLES_TRI[t])
      o.selected = t === etat.tri
      return o
    }),
  )
  const case_ = (libelle: string, valeur: boolean, f: (v: boolean) => void, titre?: string) =>
    el('label', { class: 'a-case', title: titre },
      el('input', { type: 'checkbox', checked: valeur, onchange: (e: Event) => f((e.target as HTMLInputElement).checked) }), libelle)
  outils.replaceChildren(
    segment<Regle>('Propagation', { min: 'min', produit: 'produit', frechet: 'Fréchet' }, etat.reglages.regle, (v) => {
      etat.reglages.regle = v
      recalculer()
    }, DESCRIPTIONS_REGLE),
    segment<Profondeur>('Chaîne', { principale: 'principales', auxiliaire: '+ auxiliaires', technique: '+ techniques' }, etat.reglages.profondeur, (v) => {
      etat.reglages.profondeur = v
      recalculer()
    }, {
      principale: 'Suit les prémisses principales de chaque démonstration principale.',
      auxiliaire: 'Suit aussi les prémisses auxiliaires.',
      technique: 'Suit aussi les lemmes techniques non admis.',
    }),
    el('div', { class: 'a-controle' }, el('span', { class: 'a-etiquette' }, 'Tri'), selectTri),
    el('div', { class: 'a-controle a-cases' },
      case_('dépend d’une condition fragile', etat.filtreFragile, (v) => { etat.filtreFragile = v; toutRendre() }, 'Au moins une hypothèse, un choix ou une décision incertain ou réfuté parmi ses antécédents.'),
      case_('masquer la piste abandonnée', etat.masquerAbandon, (v) => { etat.masquerAbandon = v; toutRendre() }),
    ),
    el('div', { class: 'a-controle' },
      el('button', { type: 'button', class: 'a-bouton', onclick: telechargerCsv }, 'Exporter CSV'),
    ),
  )
}

function recalculer(): void {
  audit = construireAudit(jeu, etat.reglages)
  toutRendre()
}

function telechargerCsv(): void {
  const texte = '﻿' + exporterCsv(audit, lignesVisibles(), retrait)
  const url = URL.createObjectURL(new Blob([texte], { type: 'text/csv;charset=utf-8' }))
  const a = el('a', { href: url, download: `audit-hypotheses-${etat.reglages.regle}.csv` })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─── Lignes visibles et contrefactuel ────────────────────────────────────────

function lignesVisibles(): LigneAudit[] {
  let l = trier(audit.lignes, etat.tri)
  if (etat.masquerAbandon) l = l.filter((x) => !x.abandonnee)
  if (etat.filtreFragile) l = l.filter((x) => x.fragile)
  return l
}

function basculerRetrait(i: number, alternative: string | null = null, forcer?: boolean): void {
  const deja = etat.retires.has(i)
  const retirer = forcer ?? (!deja || etat.retires.get(i) !== alternative)
  if (retirer) etat.retires.set(i, alternative)
  else etat.retires.delete(i)
  fermerMenu()
  toutRendre()
}

function rendreBandeau(visibles: LigneAudit[]): void {
  if (!retrait) {
    bandeau.replaceChildren(
      el('span', { class: 'a-doux' }, 'Contrefactuel : cliquer l’en-tête d’une colonne (ou une entrée de la liste-clé) pour retirer la condition et voir ce qui tombe.'),
    )
    bandeau.classList.remove('actif')
    return
  }
  const tombent = visibles.filter((l) => retrait!.tombes[l.i]).length
  const sauves = visibles.filter((l) => retrait!.sauveurs.has(l.i)).length
  bandeau.classList.add('actif')
  bandeau.replaceChildren(
    el('span', { class: 'a-etiquette' }, 'Retirés'),
    ...[...etat.retires].map(([i, alt]) => el('button', {
      type: 'button', class: 'a-puce', title: 'Rétablir', onclick: () => basculerRetrait(i, alt, false),
    }, el('span', { class: 'a-mono' }, sigle(i)), alt ? ` → « ${alt} »` : '', ' ✕')),
    el('span', { class: 'a-compte' },
      el('b', {}, `${tombent} résultat${tombent > 1 ? 's' : ''} sur ${visibles.length}`), ` tombe${tombent > 1 ? 'nt' : ''}`,
      sauves ? ` · ${sauves} sauvé${sauves > 1 ? 's' : ''} par une démonstration alternative` : '',
      ` · ${retrait.nTombes} nœuds du graphe à reprendre`,
    ),
    el('button', { type: 'button', class: 'a-bouton', onclick: () => { etat.retires.clear(); toutRendre() } }, 'Tout rétablir'),
  )
}

// ─── Table ───────────────────────────────────────────────────────────────────

const LF = 220 // largeur du forest plot
const PAD = 10
const xConf = (v: number) => PAD + v * (LF - 2 * PAD)

function axeForest(): SVGElement {
  const s = svg('svg', { width: LF, height: 30, class: 'a-axe' })
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    s.append(svg('line', { x1: xConf(t), x2: xConf(t), y1: 20, y2: 30, class: 'a-graduation' }))
    s.append(svg('text', { x: xConf(t), y: 15, 'text-anchor': 'middle' }, t === 0 ? '0' : t === 1 ? '1' : fr(t)))
  }
  return s
}

function forest(l: LigneAudit, suspendu: boolean): SVGElement {
  const s = svg('svg', { width: LF, height: 26, class: 'a-forest' })
  for (const t of [0, 0.25, 0.5, 0.75, 1]) s.append(svg('line', { x1: xConf(t), x2: xConf(t), y1: 0, y2: 26, class: 'a-grille' }))
  if (suspendu) {
    s.append(svg('line', { x1: xConf(0), x2: xConf(1), y1: 13, y2: 13, class: 'a-vide' }))
    return s
  }
  const d = l.declaree, p = l.propagee
  const surevaluee = d.bas > p.haut
  // Propagée (dessous, gris) puis déclarée (encre ; ocre si surévaluée).
  s.append(svg('line', { x1: xConf(p.bas), x2: Math.max(xConf(p.haut), xConf(p.bas) + 1), y1: 18, y2: 18, class: 'a-propagee' }))
  s.append(svg('circle', { cx: xConf(p.estimation), cy: 18, r: 2.6, class: 'a-propagee-point' }))
  s.append(svg('line', { x1: xConf(d.bas), x2: Math.max(xConf(d.haut), xConf(d.bas) + 1), y1: 9, y2: 9, class: surevaluee ? 'a-declaree surevaluee' : 'a-declaree' }))
  s.append(svg('circle', { cx: xConf(d.estimation), cy: 9, r: 3, class: surevaluee ? 'a-declaree-point surevaluee' : 'a-declaree-point' }))
  return s
}

function celluleDependance(l: LigneAudit, c: ColonneAudit, retiree: boolean): HTMLElement {
  const d = l.deps[c.k]!
  let glyphe = '', classe = 'a-cellule'
  if (d === 2) {
    const r = roleDirect(audit.j, c.i, l.i)
    const inference = r && (r.role === 'principale' || r.role === 'auxiliaire')
    glyphe = '●'
    classe += inference ? ' directe' : ' directe contexte'
  } else if (d === 1) {
    glyphe = '○'
    classe += ' transitive'
  }
  if (retiree) classe += ' retiree'
  if (c.famille !== FAMILLES[0] && c === audit.colonnes.find((x) => x.famille === c.famille)) classe += ' debut-famille'
  const td = el('td', { class: classe, 'data-col': c.k }, glyphe)
  if (d) {
    td.addEventListener('mouseenter', (e) => montrerBulle(e, bulleCellule(l, c)))
    td.addEventListener('mouseleave', cacherBulle)
  }
  return td
}

function texteMaillon(l: LigneAudit): HTMLElement {
  if (retrait?.tombes[l.i]) {
    const causes = audit.colonnes.filter((c) => etat.retires.has(c.i) && l.deps[c.k])
    return el('span', { class: 'a-suspendu' }, 'suspendu : ', causes.map((c) => c.sigle).join(', ') || 'antécédent retiré')
  }
  const sauveur = retrait?.sauveurs.get(l.i)
  if (sauveur) {
    return el('span', {}, 'sauvé par « ', sauveur.nom, ' » ', el('span', { class: 'a-doux' }, `(${LIBELLES_VALIDITE[sauveur.validite].toLowerCase()})`))
  }
  const m = noeud(l.maillon)
  const d = demonstrationPrincipale(m)
  return el('span', {},
    '← ', l.maillon === l.i ? el('span', { class: 'a-mono' }, 'lui-même') : refSigle(l.maillon),
    el('span', { class: 'a-doux' }, ` · ${SIGLE_ORIGINE[m.origine]} · ${d ? LIBELLES_VALIDITE[d.validite].toLowerCase() : '—'} · ${fr(m.confiance.estimation)}`),
  )
}

function celluleEvidence(l: LigneAudit): HTMLElement {
  const incertaines = l.soutiens.filter((v) => noeud(v).statut !== 'valide').length
  const td = el('td', { class: 'a-evidence' },
    el('span', { class: l.soutiens.length ? '' : 'a-doux' }, `${l.soutiens.length}`),
    incertaines ? el('span', { class: 'a-ocre' }, `(${incertaines}?)`) : '',
    el('span', { class: 'a-sep' }, '·'),
    el('span', { class: l.contradictionsActives.length ? 'a-brique' : 'a-doux' }, `${l.contradictionsActives.length} ⊣`),
    l.contradictionsResolues.length ? el('span', { class: 'a-doux' }, ` ${l.contradictionsResolues.length} rés.`) : '',
  )
  td.addEventListener('mouseenter', (e) => montrerBulle(e, bulleEvidence(l)))
  td.addEventListener('mouseleave', cacherBulle)
  return td
}

function rendreTable(visibles: LigneAudit[]): void {
  const cols = audit.colonnes
  const nCols = 4 + cols.length + 4
  const table = el('table', { class: 'a-table' })

  // En-tête : familles, sigles (cliquables), nombre de résultats touchés.
  const t1 = el('tr', { class: 'a-familles' },
    el('th', { colspan: 4, class: 'a-gauche' }, 'Résultat'),
    FAMILLES.map((f) => {
      const n = cols.filter((c) => c.famille === f).length
      return n ? el('th', { colspan: n, class: 'a-famille debut-famille' }, LIBELLES_FAMILLE[f]) : null
    }),
    el('th', { class: 'a-gauche a-col-evidence', title: 'Observations qui soutiennent · contradictions actives ⊣ · résolues' }, 'Évidence'),
    el('th', { class: 'a-gauche' }, 'Confiance'),
    el('th', { class: 'a-droite' }, 'Δ'),
    el('th', { class: 'a-gauche' }, 'Maillon le plus faible'),
  )
  const t2 = el('tr', { class: 'a-sigles' },
    el('th', { class: 'a-gauche' }, 'id'),
    el('th', { class: 'a-gauche' }, 'énoncé'),
    el('th', { title: 'Statut' }, 'st.'),
    el('th', { title: 'Validation' }, 'val.'),
    cols.map((c) => {
      const retiree = etat.retires.has(c.i)
      const th = el('th', {
        class: `a-col${c.fragile ? ' fragile' : ''}${retiree ? ' retiree' : ''}${c === cols.find((x) => x.famille === c.famille) && c.famille !== FAMILLES[0] ? ' debut-famille' : ''}`,
        'data-col': c.k,
      }, el('button', { type: 'button', class: 'a-sigle-col', onclick: (e: Event) => clicColonne(c, e.currentTarget as HTMLElement) }, c.sigle))
      th.addEventListener('mouseenter', (e) => { surlignerColonne(c.k, true); montrerBulle(e, bulleColonne(c)) })
      th.addEventListener('mouseleave', () => { surlignerColonne(c.k, false); cacherBulle() })
      return th
    }),
    el('th', { class: 'a-gauche a-doux a-petit' }, 'obs. · ⊣'),
    el('th', { class: 'a-axe-th' }, axeForest()),
    el('th', { class: 'a-droite a-doux a-petit', title: 'Estimation déclarée − estimation propagée' }, 'décl. − prop.'),
    el('th', { class: 'a-gauche a-doux a-petit' }, LIBELLES_REGLE[etat.reglages.regle]),
  )
  const t3 = el('tr', { class: 'a-comptes' },
    el('th', { colspan: 4, class: 'a-gauche a-doux a-petit' }, 'résultats touchés →'),
    cols.map((c) => el('th', {
      class: `a-compte-col${c === cols.find((x) => x.famille === c.famille) && c.famille !== FAMILLES[0] ? ' debut-famille' : ''}`,
      title: `${c.touches} résultats (dont ${c.directes} directement)`,
    }, String(c.touches))),
    el('th', { colspan: 4, class: 'a-gauche a-doux a-petit' }, 'intervalle déclaré (encre) · propagé (gris, dessous)'),
  )
  const thead = el('thead', {}, t1, t2, t3)

  const tbody = el('tbody')
  let groupe = ''
  for (const l of visibles) {
    if (etat.tri === 'sous_probleme') {
      const g = l.abandonnee ? 'abandon' : l.noeud.sousProbleme
      if (g !== groupe) {
        groupe = g
        const sp = SOUS_PROBLEMES.find((s) => s.id === (l.abandonnee ? 'comp' : g))
        tbody.append(el('tr', { class: 'a-groupe' }, el('td', { colspan: nCols }, sp?.nom ?? g, sp?.resume ? el('span', { class: 'a-doux' }, ` — ${sp.resume}`) : '')))
      }
    }
    const tombe = !!retrait?.tombes[l.i]
    const n = l.noeud
    const tr = el('tr', {
      class: `a-ligne${tombe ? ' suspendue' : ''}${l.abandonnee ? ' abandonnee' : ''}${etat.selection === l.i ? ' selection' : ''}`,
      onclick: () => selectionner(l.i),
    },
      el('td', { class: 'a-id a-mono' }, l.sigle),
      el('td', { class: 'a-titre' }, el('span', { class: 'a-type' }, typeCourt(n.type)), ' ', el('span', { class: 'a-nom' }, n.nom)),
      el('td', { class: `a-statut ${n.statut}`, title: LIBELLES_STATUT[n.statut] }, GLYPHE_STATUT[n.statut]),
      el('td', { class: 'a-validation a-mono', title: `Validation : ${n.validation}` }, SIGLE_VALIDATION[n.validation]),
      cols.map((c) => celluleDependance(l, c, etat.retires.has(c.i))),
      celluleEvidence(l),
      el('td', { class: 'a-forest-td' }, forest(l, tombe)),
      el('td', { class: `a-ecart a-mono${!tombe && l.declaree.bas > l.propagee.haut ? ' a-ocre' : ''}` }, tombe ? '' : (l.ecart >= 0 ? '+' : '−') + fr(Math.abs(l.ecart))),
      el('td', { class: 'a-maillon' }, texteMaillon(l)),
    )
    tr.querySelector('.a-titre')!.addEventListener('mouseenter', (e) => montrerBulle(e, bulleLigne(l)))
    tr.querySelector('.a-titre')!.addEventListener('mouseleave', cacherBulle)
    tbody.append(tr)
  }
  if (!visibles.length) tbody.append(el('tr', {}, el('td', { colspan: nCols, class: 'a-vide-table' }, 'Aucun résultat ne correspond aux filtres.')))
  table.append(thead, tbody)
  conteneurTable.replaceChildren(table, legende())
}

function legende(): HTMLElement {
  return el('div', { class: 'a-legende' },
    el('span', {}, el('b', {}, '●'), ' prémisse directe (principale ou auxiliaire)'),
    el('span', {}, el('b', { class: 'a-doux' }, '●'), ' directe de contexte ou technique'),
    el('span', {}, el('b', { class: 'a-doux' }, '○'), ' dépendance transitive'),
    el('span', {}, el('span', { class: 'a-ocre a-mono' }, 'H6'), ' condition incertaine'),
    el('span', {}, '✓ ? ✕ statut · H / IA / IA+H validation'),
    el('span', {}, 'Évidence : observations les plus proches sur la chaîne, (k?) incertaines, ⊣ contradictions actives, rés. résolues'),
  )
}

function surlignerColonne(k: number, oui: boolean): void {
  for (const td of conteneurTable.querySelectorAll(`[data-col="${k}"]`)) td.classList.toggle('col-survol', oui)
}

// ─── Bulles (inspection) ─────────────────────────────────────────────────────

function montrerBulle(e: Event, contenu: HTMLElement): void {
  const cible = e.currentTarget as HTMLElement
  bulle.replaceChildren(contenu)
  bulle.hidden = false
  const r = cible.getBoundingClientRect()
  const b = bulle.getBoundingClientRect()
  let x = r.left + r.width / 2 - b.width / 2
  let y = r.bottom + 6
  x = Math.max(8, Math.min(window.innerWidth - b.width - 8, x))
  if (y + b.height > window.innerHeight - 8) y = r.top - b.height - 6
  bulle.style.left = `${x}px`
  bulle.style.top = `${Math.max(8, y)}px`
}
function cacherBulle(): void {
  bulle.hidden = true
}

function bulleCellule(l: LigneAudit, c: ColonneAudit): HTMLElement {
  const d = l.deps[c.k]!
  const tete = el('div', { class: 'b-tete' }, el('span', { class: 'a-mono' }, c.sigle), ' → ', el('span', { class: 'a-mono' }, l.sigle), el('span', { class: 'a-doux' }, d === 2 ? '  dépendance directe' : '  dépendance transitive'))
  if (d === 2) {
    const r = roleDirect(audit.j, c.i, l.i)!
    return el('div', {}, tete,
      el('div', {}, `« ${l.noeud.nom} » cite « ${c.noeud.nom} »`),
      el('div', { class: 'a-doux' }, `rôle ${LIBELLES_ROLE[r.role].toLowerCase()} · ${r.principale ? 'dans la démonstration principale' : 'hors démonstration principale'} · ${r.demonstrations.map((x) => `« ${x} »`).join(', ')}`),
    )
  }
  const chemin = cheminDependance(audit.j, c.i, l.i)
  return el('div', {}, tete,
    el('div', { class: 'b-chemin a-mono' }, chemin.map(sigle).join(' → ')),
    el('ol', { class: 'b-etapes' }, chemin.map((v) => el('li', {}, el('span', { class: 'a-mono' }, sigle(v)), ' ', noeud(v).nom))),
    el('div', { class: 'a-doux' }, `plus court chemin (${chemin.length - 1} pas) dans le graphe de justification complet`),
  )
}

function bulleColonne(c: ColonneAudit): HTMLElement {
  const n = c.noeud
  const corps: (HTMLElement | null)[] = [
    el('div', { class: 'b-tete' }, el('span', { class: 'a-mono' }, c.sigle), ` ${LIBELLES_TYPE[n.type]} · `, el('span', { class: `a-statut-texte ${n.statut}` }, LIBELLES_STATUT[n.statut])),
    el('div', { class: 'b-nom' }, n.nom),
    el('div', { class: 'b-enonce' }, n.enonce),
    el('div', { class: 'a-doux' }, `touche ${c.touches} résultat${c.touches > 1 ? 's' : ''} (${c.directes} directement)`),
  ]
  if (n.choix) {
    corps.push(el('div', {}, el('span', { class: 'a-doux' }, 'portée déclarée : '), n.choix.portee))
    if (n.choix.alternatives?.length) corps.push(el('div', {}, el('span', { class: 'a-doux' }, 'alternatives : '), n.choix.alternatives.join(' · ')))
  }
  if (n.decision) {
    corps.push(el('div', {}, el('i', {}, n.decision.question)))
    corps.push(el('ul', { class: 'b-alternatives' }, n.decision.alternatives.map((a) => el('li', { class: a.retenue ? 'retenue' : 'rejetee' }, a.retenue ? '▸ ' : '✕ ', a.libelle, a.raison ? el('span', { class: 'a-doux' }, ` — ${a.raison}`) : ''))))
  }
  corps.push(el('div', { class: 'a-doux b-aide' }, etat.retires.has(c.i) ? 'clic : rétablir' : n.choix || n.decision ? 'clic : retirer ou remplacer' : 'clic : retirer'))
  return el('div', {}, ...corps.filter(Boolean) as HTMLElement[])
}

function bulleLigne(l: LigneAudit): HTMLElement {
  const n = l.noeud
  return el('div', {},
    el('div', { class: 'b-tete' }, el('span', { class: 'a-mono' }, l.sigle), ` ${LIBELLES_TYPE[n.type]} · ${LIBELLES_STATUT[n.statut]} · ${LIBELLES_ORIGINE[n.origine]}`),
    el('div', { class: 'b-nom' }, n.nom),
    el('div', { class: 'b-enonce' }, n.enonce),
    el('div', { class: 'a-doux' }, `déclarée ${intervalle(l.declaree)} · propagée ${intervalle(l.propagee)} sur ${l.chaine.length} inférence${l.chaine.length > 1 ? 's' : ''}`),
    el('div', { class: 'a-doux b-aide' }, 'clic : argument de confiance'),
  )
}

function bulleEvidence(l: LigneAudit): HTMLElement {
  return el('div', {},
    el('div', { class: 'b-tete' }, 'Évidence empirique de ', el('span', { class: 'a-mono' }, l.sigle)),
    l.soutiens.length
      ? el('ul', { class: 'b-alternatives' }, l.soutiens.map((v) => el('li', {}, el('span', { class: 'a-mono' }, sigle(v)), ' ', noeud(v).nom, noeud(v).statut !== 'valide' ? el('span', { class: 'a-ocre' }, ' (incertaine)') : '')))
      : el('div', { class: 'a-doux' }, 'Aucune observation sur la chaîne suivie.'),
    ...l.contradictionsActives.map((c) => el('div', { class: 'a-brique' }, `⊣ active : ${sigle(c.source)} contredit ${sigle(c.cible)}`)),
    ...l.contradictionsResolues.map((c) => el('div', { class: 'a-doux' }, `⊣ résolue : ${sigle(c.source)} contredit ${sigle(c.cible)}, résolu par ${c.par === null ? '—' : sigle(c.par)}`)),
    el('div', { class: 'a-doux b-aide' }, 'observations les plus proches le long de la chaîne suivie, arrêt aux décisions'),
  )
}

// ─── Menu contrefactuel (choix et décisions) ─────────────────────────────────

function clicColonne(c: ColonneAudit, ancre: HTMLElement): void {
  cacherBulle()
  const n = c.noeud
  if (etat.retires.has(c.i) || (!n.choix?.alternatives?.length && !n.decision)) {
    basculerRetrait(c.i)
    return
  }
  const options: HTMLElement[] = [
    el('div', { class: 'm-tete' }, el('span', { class: 'a-mono' }, c.sigle), ' ', n.nom),
    el('button', { type: 'button', onclick: () => basculerRetrait(c.i, null, true) }, n.decision ? 'Rouvrir la décision (retrait simple)' : 'Retirer ce choix'),
  ]
  if (n.choix?.alternatives) {
    options.push(el('div', { class: 'm-sous' }, 'Remplacer par'))
    for (const a of n.choix.alternatives) options.push(el('button', { type: 'button', onclick: () => basculerRetrait(c.i, a, true) }, a))
  }
  if (n.decision) {
    const rejetees = n.decision.alternatives.filter((a) => !a.retenue)
    if (rejetees.length) options.push(el('div', { class: 'm-sous' }, 'Retenir plutôt une option rejetée'))
    for (const a of rejetees) options.push(el('button', { type: 'button', onclick: () => basculerRetrait(c.i, a.libelle, true), title: a.raison }, a.libelle, a.raison ? el('span', { class: 'a-doux' }, ` — ${a.raison}`) : ''))
  }
  menu.replaceChildren(...options)
  menu.hidden = false
  const r = ancre.getBoundingClientRect()
  const b = menu.getBoundingClientRect()
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - b.width - 8, r.left))}px`
  menu.style.top = `${r.bottom + 4}px`
}
function fermerMenu(): void {
  menu.hidden = true
}
document.addEventListener('mousedown', (e) => {
  if (!menu.hidden && !menu.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.a-sigle-col')) fermerMenu()
})

// ─── Bilan contrefactuel et liste-clé ────────────────────────────────────────

const ORDRE_TYPES: TypeRaisonnement[] = ['resultat', 'theoreme', 'proposition', 'conjecture', 'lemme', 'assertion', 'definition', 'decision', 'choix_modelisation', 'experience', 'calcul', 'observation', 'hypothese', 'axiome']

function rendreBilan(): void {
  if (!retrait) {
    sectionBilan.hidden = true
    return
  }
  sectionBilan.hidden = false
  const r = retrait
  const parType = new Map<TypeRaisonnement, number[]>()
  audit.j.noeuds.forEach((n, v) => {
    if (!r.tombes[v] || etat.retires.has(v)) return
    parType.set(n.type, [...(parType.get(n.type) ?? []), v])
  })
  const remplacements = [...etat.retires].filter(([, alt]) => alt)
  const sauves = [...r.sauveurs]
  const exposes = audit.j.noeuds.map((_, v) => v).filter((v) => r.exposes[v] && !r.sauveurs.has(v))
  sectionBilan.replaceChildren(
    el('h2', {}, 'À reprendre'),
    el('p', { class: 'a-doux' },
      `${r.nTombes} nœuds perdent toutes leurs démonstrations utilisables. `,
      remplacements.length ? `À refaire sous ${remplacements.map(([i, alt]) => `« ${alt} » (au lieu de ${sigle(i)})`).join(', ')}.` : 'Retrait simple : aucune modélisation de remplacement.',
    ),
    el('div', { class: 'a-bilan-grille' },
      ORDRE_TYPES.filter((t) => parType.has(t)).map((t) => el('div', { class: 'a-bilan-type' },
        el('div', { class: 'a-etiquette' }, `${LIBELLES_TYPE[t]} · ${parType.get(t)!.length}`),
        el('div', { class: 'a-bilan-liste' }, parType.get(t)!.map((v) => refSigle(v))),
      )),
    ),
    sauves.length ? el('div', { class: 'a-bilan-sauves' },
      el('div', { class: 'a-etiquette' }, `Sauvés par une démonstration alternative · ${sauves.length}`),
      sauves.map(([v, d]) => el('div', {}, refSigle(v), ` ${noeud(v).nom} ← « ${d.nom} » `, el('span', { class: 'a-doux' }, `(${LIBELLES_VALIDITE[d.validite].toLowerCase()})`))),
    ) : '',
    exposes.length ? el('p', { class: 'a-doux' }, `${exposes.length} autre${exposes.length > 1 ? 's' : ''} nœud${exposes.length > 1 ? 's' : ''} dans la portée brute (dependantsDe) sans tomber : la dépendance passe par une démonstration non principale.`) : '',
  )
}

function rendreCle(): void {
  sectionCle.replaceChildren(
    el('h2', {}, 'Liste-clé des conditions'),
    el('div', { class: 'a-cle-grille' },
      FAMILLES.map((f) => el('div', { class: 'a-cle-famille' },
        el('div', { class: 'a-etiquette' }, LIBELLES_FAMILLE[f]),
        el('ul', {}, audit.colonnes.filter((c) => c.famille === f).map((c) => el('li', { class: etat.retires.has(c.i) ? 'retiree' : '' },
          el('button', { type: 'button', class: `a-sigle-col${c.fragile ? ' fragile' : ''}`, onclick: (e: Event) => clicColonne(c, e.currentTarget as HTMLElement) }, c.sigle),
          el('div', {},
            el('div', {}, c.noeud.nom, ' ', el('span', { class: `a-statut ${c.noeud.statut}` }, GLYPHE_STATUT[c.noeud.statut]),
              el('span', { class: 'a-doux' }, ` · ${c.touches} résultat${c.touches > 1 ? 's' : ''}`)),
            el('div', { class: 'a-cle-enonce' }, c.noeud.choix?.hypothese ?? c.noeud.decision?.question ?? c.noeud.enonce),
          ),
        ))),
      )),
    ),
  )
}

// ─── Argument de confiance (panneau ACP) ─────────────────────────────────────

function selectionner(i: number | null): void {
  etat.selection = etat.selection === i ? null : i
  toutRendre()
}

function barreMini(c: Confiance): SVGElement {
  const L = 84, x = (v: number) => 2 + v * (L - 4)
  return svg('svg', { width: L, height: 10, class: 'a-mini' },
    svg('line', { x1: x(0), x2: x(1), y1: 5, y2: 5, class: 'a-mini-fond' }),
    svg('line', { x1: x(c.bas), x2: Math.max(x(c.haut), x(c.bas) + 1), y1: 5, y2: 5, class: 'a-mini-intervalle' }),
    svg('circle', { cx: x(c.estimation), cy: 5, r: 2.4, class: 'a-mini-point' }),
  )
}

function listeQuestions(qs: QuestionCritique[]): HTMLElement | null {
  const affichees = etat.ouvertesSeulement ? qs.filter((q) => !q.traitee) : qs
  if (!affichees.length) return null
  return el('ul', { class: 'acp-questions' }, affichees.map((q) => el('li', { class: q.traitee ? 'traitee' : 'ouverte' },
    el('span', { class: 'a-mono acp-regle', title: 'Règle de dérivation (NOTES.md)' }, q.regle),
    el('span', { class: 'acp-marque' }, q.traitee ? '✓' : '○'),
    el('span', {}, q.texte, q.reponse ? el('span', { class: 'a-doux' }, ` — ${q.reponse}`) : ''),
  )))
}

function rendreAcp(): void {
  const l = audit.lignes.find((x) => x.i === etat.selection)
  if (!l) {
    acp.hidden = true
    document.body.classList.remove('acp-ouvert')
    return
  }
  acp.hidden = false
  document.body.classList.add('acp-ouvert')
  const n = l.noeud
  const tombe = !!retrait?.tombes[l.i]
  const inferences = [...l.chaine].sort((a, b) => noeud(a).confiance.estimation - noeud(b).confiance.estimation || a - b)
  const qResultat = questionsResultat(audit, l)
  const qParInference = new Map(inferences.map((v) => [v, questionsInference(audit, v)]))
  const toutes = [...qResultat, ...[...qParInference.values()].flat()]
  const ouvertes = toutes.filter((q) => !q.traitee).length
  const conditions = audit.colonnes.filter((c) => l.deps[c.k])
  const recours = inferences.filter((v) => verdictSynthetique(noeud(v), etat.reglages.seuilRecours).recours).length

  acp.replaceChildren(
    el('div', { class: 'acp-tete' },
      el('span', { class: 'a-mono acp-sigle' }, l.sigle),
      el('span', { class: 'a-type' }, typeCourt(n.type)),
      el('span', { class: `a-statut ${n.statut}` }, GLYPHE_STATUT[n.statut]),
      el('button', { type: 'button', class: 'acp-fermer', title: 'Fermer (Échap)', onclick: () => selectionner(null) }, '×'),
    ),
    el('h2', {}, n.nom),
    el('p', { class: 'acp-enonce' }, n.enonce),
    tombe ? el('p', { class: 'a-suspendu' }, 'Suspendu par le contrefactuel en cours.') : '',
    el('dl', { class: 'acp-chiffres' },
      el('dt', {}, 'Déclarée'), el('dd', { class: 'a-mono' }, intervalle(l.declaree)),
      el('dt', {}, 'Propagée'), el('dd', {}, el('span', { class: 'a-mono' }, intervalle(l.propagee)), el('span', { class: 'a-doux' }, ` · ${LIBELLES_REGLE[etat.reglages.regle]}`)),
      el('dt', {}, 'Chaîne'), el('dd', {}, `${l.chaine.length} inférence${l.chaine.length > 1 ? 's' : ''} (prémisses ${etat.reglages.profondeur === 'principale' ? 'principales' : etat.reglages.profondeur === 'auxiliaire' ? 'principales et auxiliaires' : 'principales, auxiliaires et techniques'}, arrêt aux conditions)`),
      el('dt', {}, 'Maillon'), el('dd', {}, refSigle(l.maillon), ` ${noeud(l.maillon).nom} `, el('span', { class: 'a-mono a-doux' }, fr(noeud(l.maillon).confiance.estimation))),
      el('dt', {}, 'Évidence'), el('dd', {}, `${l.soutiens.length} observation${l.soutiens.length > 1 ? 's' : ''}, ${l.contradictionsActives.length} contradiction active, ${l.contradictionsResolues.length} résolue${l.contradictionsResolues.length > 1 ? 's' : ''}`),
      el('dt', {}, 'Conditions'), el('dd', { class: 'acp-conditions' }, conditions.length
        ? conditions.map((c) => el('span', { class: `a-mono${l.deps[c.k] === 2 ? ' directe' : ''}${c.fragile ? ' a-ocre' : ''}`, title: `${c.noeud.nom} (${l.deps[c.k] === 2 ? 'directe' : 'transitive'})` }, c.sigle))
        : el('span', { class: 'a-doux' }, 'aucune')),
    ),
    el('h3', {}, `Questions critiques · ${ouvertes} ouverte${ouvertes > 1 ? 's' : ''} sur ${toutes.length}`),
    el('label', { class: 'a-case' },
      el('input', { type: 'checkbox', checked: etat.ouvertesSeulement, onchange: (e: Event) => { etat.ouvertesSeulement = (e.target as HTMLInputElement).checked; memoriser(); rendreAcp() } }),
      'questions ouvertes seulement'),
    el('div', { class: 'acp-bloc' },
      el('div', { class: 'a-etiquette' }, 'Au niveau du résultat'),
      listeQuestions(qResultat) ?? el('div', { class: 'a-doux' }, 'Aucune.'),
    ),
    el('h3', {}, `Argument de confiance · ${inferences.length} inférence${inferences.length > 1 ? 's' : ''}, confiance croissante`),
    el('p', { class: 'a-doux acp-note' },
      `Juge : ATLAS_MODELE_VERIFICATEUR ; recours (ATLAS_MODELE_VERIFICATEUR_RECOURS) si invalide ou sous ${fr(etat.reglages.seuilRecours)} : ${recours} inférence${recours > 1 ? 's' : ''}. `,
      'Le jeu synthétique n’a pas d’entrées de journal « verdict » : la justification du juge n’est pas disponible.'),
    el('ol', { class: 'acp-inferences' }, inferences.map((v) => {
      const m = noeud(v)
      const d = demonstrationPrincipale(m)
      const verdict = verdictSynthetique(m, etat.reglages.seuilRecours)
      const qs = qParInference.get(v) ?? []
      const nOuvertes = qs.filter((q) => !q.traitee).length
      return el('li', { class: `acp-inference${retrait?.tombes[v] ? ' suspendue' : ''}` },
        el('div', { class: 'acp-ligne' },
          el('span', { class: `acp-validite ${d?.validite ?? ''}`, title: d ? LIBELLES_VALIDITE[d.validite] : '' }, d ? GLYPHE_VALIDITE[d.validite] : '—'),
          el('span', { class: 'a-mono acp-id' }, sigle(v)),
          el('span', { class: 'acp-nom', title: m.enonce }, m.nom),
          barreMini(m.confiance),
          el('span', { class: 'a-mono acp-est' }, fr(m.confiance.estimation)),
        ),
        el('div', { class: 'acp-meta a-doux' },
          `${LIBELLES_SCHEMA[schemaDe(audit, v)]} · « ${d?.nom ?? '—'} » · ${d?.auteur ?? m.auteur} · validation ${SIGLE_VALIDATION[m.validation]}`,
          verdict.recours ? el('span', { class: 'a-ocre' }, ` · recours (${verdict.motifRecours})`) : ' · juge seul',
          nOuvertes ? ` · ${nOuvertes} question${nOuvertes > 1 ? 's' : ''} ouverte${nOuvertes > 1 ? 's' : ''}` : '',
        ),
        listeQuestions(qs),
      )
    })),
  )
}

// ─── Rendu global ────────────────────────────────────────────────────────────

function rendreResume(): void {
  const r = document.querySelector('.a-resume')!
  const f = (fam: string) => audit.colonnes.filter((c) => c.famille === fam).length
  r.textContent = `${audit.lignes.length} résultats majeurs · ${f('hypothese')} hypothèses · ${f('choix')} choix de modélisation · ${f('decision')} décisions · graphe de justification : ${audit.j.noeuds.length} nœuds, ${audit.j.aretes.length} prémisses`
}

function toutRendre(): void {
  retrait = etat.retires.size ? calculerRetrait(audit, etat.retires.keys()) : null
  const visibles = lignesVisibles()
  memoriser()
  rendreOutils()
  rendreResume()
  rendreBandeau(visibles)
  rendreTable(visibles)
  rendreBilan()
  rendreCle()
  rendreAcp()
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (!menu.hidden) fermerMenu()
  else if (etat.selection !== null) selectionner(null)
})
window.addEventListener('scroll', cacherBulle, true)

toutRendre()

// Débogage.
;(window as unknown as { audit: () => Audit }).audit = () => audit
