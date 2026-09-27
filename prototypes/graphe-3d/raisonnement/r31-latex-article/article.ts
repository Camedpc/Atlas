// R31 · Article amsart : le raisonnement composé comme un article (amsart / amsmath / amsthm).
//
// - Numérotation (pure) : sections = sous-problèmes (la piste abandonnée en dernier), énoncés dans l'ordre
//   topologique du graphe de justification (prémisses d'abord, ordre du jeu à égalité). Compteur partagé
//   par section comme `\newtheorem{lemme}[theoreme]` + `\numberwithin{theoreme}{section}` : « Lemme 2.3 ».
//   Équations hors texte numérotées par section, `\numberwithin{equation}{section}` : « (2.4) ».
// - Environnements : style `plain` (tête grasse, corps italique) pour axiome, lemme, proposition,
//   théorème, résultat, conjecture, assertion ; style `definition` (corps droit) pour le reste.
// - Démonstrations générées à partir des prémisses et de leur rôle, avec renvois façon \cref / \eqref :
//   « D'après (2.2) et le lemme 2.1, avec le choix de modélisation 1.12, à l'aide du lemme 1.3, dans le
//   cadre de l'hypothèse 1.6. ∎ ». Une prémisse qui porte une équation hors texte est citée par sa
//   dernière équation (celle qui conclut l'énoncé), les autres par leur environnement ; les renvois de
//   même type sont groupés (« les lemmes 3.1 et 3.2 »).
// - Fin de démonstration : ∎ validée, □ à vérifier, ✗ invalidée. Notes marginales (\marginpar) : statut,
//   validation, confiance, et emplacement dans la figure 1 (mis à jour par la vision).

import {
  el, type DemonstrationR, type NoeudR, type RolePremisse, type TypeRaisonnement,
} from '../../src/raisonnement'
import { ponctuationTex, segmenter, type Segment } from './formules'

// ─── Environnements ──────────────────────────────────────────────────────────

interface DefEnv {
  nom: string
  pluriel: string
  abrege: string
  style: 'plain' | 'definition'
  feminin: boolean
}

export const ENVS: Record<TypeRaisonnement, DefEnv> = {
  axiome: { nom: 'Axiome', pluriel: 'axiomes', abrege: 'Ax.', style: 'plain', feminin: false },
  hypothese: { nom: 'Hypothèse', pluriel: 'hypothèses', abrege: 'Hyp.', style: 'definition', feminin: true },
  definition: { nom: 'Définition', pluriel: 'définitions', abrege: 'Déf.', style: 'definition', feminin: true },
  choix_modelisation: { nom: 'Choix de modélisation', pluriel: 'choix de modélisation', abrege: 'Choix', style: 'definition', feminin: false },
  decision: { nom: 'Décision', pluriel: 'décisions', abrege: 'Déc.', style: 'definition', feminin: true },
  lemme: { nom: 'Lemme', pluriel: 'lemmes', abrege: 'Lem.', style: 'plain', feminin: false },
  proposition: { nom: 'Proposition', pluriel: 'propositions', abrege: 'Prop.', style: 'plain', feminin: true },
  theoreme: { nom: 'Théorème', pluriel: 'théorèmes', abrege: 'Thm', style: 'plain', feminin: false },
  assertion: { nom: 'Assertion', pluriel: 'assertions', abrege: 'Ass.', style: 'plain', feminin: true },
  experience: { nom: 'Expérience', pluriel: 'expériences', abrege: 'Exp.', style: 'definition', feminin: true },
  calcul: { nom: 'Calcul', pluriel: 'calculs', abrege: 'Calc.', style: 'definition', feminin: false },
  observation: { nom: 'Observation', pluriel: 'observations', abrege: 'Obs.', style: 'definition', feminin: true },
  resultat: { nom: 'Résultat', pluriel: 'résultats', abrege: 'Rés.', style: 'plain', feminin: false },
  conjecture: { nom: 'Conjecture', pluriel: 'conjectures', abrege: 'Conj.', style: 'plain', feminin: true },
}

const elision = (mot: string) => /^[aeiouyhàâéèêëîïôöûüœ]/iu.test(mot)

// ─── Numérotation ────────────────────────────────────────────────────────────

export interface Equation {
  numero: string
  /** Identifiant d'ancre : « eq-2-4 ». */
  ancre: string
  /** Formule déjà composée plus haut : on reprend son numéro (\tag) au lieu d'en créer un. */
  reprise?: { id: string; ancre: string }
}

export interface EnvArticle {
  id: string
  /** Indice du nœud dans le jeu (= graphe de justification). */
  i: number
  section: number
  numero: string
  def: DefEnv
  /** Corps de l'énoncé (texte, formules en ligne, équations numérotées). */
  corps: Segment[]
  equations: Equation[]
}

export interface SectionArticle {
  numero: number
  titre: string
  resume: string
  abandonnee: boolean
  envs: EnvArticle[]
}

export interface Numerotation {
  sections: SectionArticle[]
  parId: Map<string, EnvArticle>
  nbEquations: number
}

/** Titre de section : sans préfixe de sous-problème (« SP1 · », « Piste abandonnée · »), capitalisé. */
function titreSection(nom: string): string {
  const t = nom.replace(/^\s*SP\s*\d+\s*[·:.–-]\s*/iu, '').replace(/^\s*Piste abandonnée\s*[·:.–-]\s*/iu, '')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Minuscule initiale après « : » (« écartée : le bilan… »), sauf sigle ou nom propre en capitales. */
export function minusculeInitiale(t: string): string {
  return /^[A-ZÀ-Ý][a-zà-ÿ’' ]/u.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t
}

const normaliser = (tex: string) => tex.replace(/\s+/gu, '')

/** Corps d'un énoncé : l'hypothèse d'un choix, la question d'une décision, sinon l'énoncé. */
function texteCorps(n: NoeudR): string {
  if (n.type === 'choix_modelisation' && n.choix?.hypothese) return n.choix.hypothese
  if (n.type === 'decision' && n.decision?.question) return n.decision.question
  return n.enonce
}

export function numeroter(noeuds: NoeudR[], sousProblemes: { id: string; nom: string; resume: string; abandonne?: boolean }[]): Numerotation {
  const index = new Map(noeuds.map((n, k) => [n.id, k]))
  // Ordre topologique stable (Kahn, plus petit indice d'abord) sur toutes les démonstrations.
  const parents = noeuds.map((n) => new Set(n.demonstrations.flatMap((d) => d.premisses.map((p) => index.get(p.id))).filter((x): x is number => x !== undefined)))
  const degre = parents.map((s) => s.size)
  const enfants: number[][] = noeuds.map(() => [])
  parents.forEach((s, k) => s.forEach((p) => enfants[p]!.push(k)))
  const pret = new Set<number>()
  degre.forEach((d, k) => d === 0 && pret.add(k))
  const ordre: number[] = []
  const vus = new Uint8Array(noeuds.length)
  while (pret.size) {
    const k = Math.min(...pret)
    pret.delete(k)
    ordre.push(k)
    vus[k] = 1
    for (const e of enfants[k]!) if (--degre[e]! === 0) pret.add(e)
  }
  noeuds.forEach((_, k) => !vus[k] && ordre.push(k))
  // Sections : ordre des sous-problèmes, pistes abandonnées en dernier ; inconnus → première section.
  const sps = [...sousProblemes].sort((a, b) => Number(!!a.abandonne) - Number(!!b.abandonne))
  const rangSp = new Map(sps.map((s, k) => [s.id, k]))
  const sections: SectionArticle[] = sps.map((s, k) => ({ numero: k + 1, titre: titreSection(s.nom), resume: s.resume, abandonnee: !!s.abandonne, envs: [] }))
  if (!sections.length) sections.push({ numero: 1, titre: 'Énoncés', resume: '', abandonnee: false, envs: [] })
  const parId = new Map<string, EnvArticle>()
  const parSection: number[][] = sections.map(() => [])
  for (const k of ordre) parSection[rangSp.get(noeuds[k]!.sousProbleme) ?? 0]!.push(k)
  let nbEquations = 0
  // Une formule identique à une équation déjà numérotée reprend son numéro (pas de doublon).
  const dejaVues = new Map<string, Equation & { id: string }>()
  sections.forEach((s, si) => {
    let cpt = 0, eq = 0
    for (const k of parSection[si]!) {
      const n = noeuds[k]!
      const corps = segmenter(texteCorps(n))
      const equations: Equation[] = []
      for (const sg of corps) if (sg.genre === 'equation') {
        const cle = normaliser(sg.tex)
        const deja = dejaVues.get(cle)
        if (deja) {
          equations.push({ numero: deja.numero, ancre: `${deja.ancre}-reprise-${n.id}-${equations.length}`, reprise: { id: deja.id, ancre: deja.ancre } })
          continue
        }
        eq++
        const q: Equation = { numero: `${s.numero}.${eq}`, ancre: `eq-${s.numero}-${eq}` }
        equations.push(q)
        dejaVues.set(cle, { ...q, id: n.id })
        nbEquations++
      }
      const env: EnvArticle = { id: n.id, i: k, section: s.numero, numero: `${s.numero}.${++cpt}`, def: ENVS[n.type], corps, equations }
      s.envs.push(env)
      parId.set(n.id, env)
    }
  })
  return { sections: sections.filter((s) => s.envs.length), parId, nbEquations }
}

// ─── KaTeX ───────────────────────────────────────────────────────────────────

interface KatexGlobal {
  render(tex: string, el: HTMLElement, options?: Record<string, unknown>): void
}

const KATEX = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/'
let promesseKatex: Promise<KatexGlobal | null> | null = null

/** Charge KaTeX (script + feuille de style) depuis jsDelivr ; null si le réseau manque. */
export function chargerKatex(): Promise<KatexGlobal | null> {
  promesseKatex ??= new Promise((resoudre) => {
    const deja = (window as unknown as { katex?: KatexGlobal }).katex
    if (deja) return resoudre(deja)
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = `${KATEX}katex.min.css`
    document.head.append(css)
    const s = document.createElement('script')
    s.src = `${KATEX}katex.min.js`
    s.crossOrigin = 'anonymous'
    s.onload = () => resoudre((window as unknown as { katex?: KatexGlobal }).katex ?? null)
    s.onerror = () => resoudre(null)
    document.head.append(s)
  })
  return promesseKatex
}

/** Compose toutes les formules en attente (éléments `[data-tex]`). Repli : Unicode en italique. */
export function composerFormules(racine: HTMLElement, katex: KatexGlobal | null): void {
  if (!katex) return
  for (const e of racine.querySelectorAll<HTMLElement>('[data-tex]')) {
    try {
      katex.render(e.dataset.tex!, e, { throwOnError: false, displayMode: e.classList.contains('eq-corps'), output: 'html', strict: 'ignore' })
      e.classList.add('compose')
    } catch {
      /* formule laissée en Unicode */
    }
    delete e.dataset.tex
  }
}

function formule(tex: string, brut: string, hors = false): HTMLElement {
  return el('span', { class: hors ? 'eq-corps' : 'math', 'data-tex': tex }, brut)
}

// ─── Renvois (\cref, \eqref) ─────────────────────────────────────────────────

type Morceau = Node | string

function lienEnv(e: EnvArticle, texte: string): HTMLElement {
  return el('a', { class: 'ref', href: `#env-${e.id}`, 'data-noeud': e.id }, texte)
}

function lienEq(e: EnvArticle, q: Equation): HTMLElement {
  return el('a', { class: 'ref eqref', href: `#${q.ancre}`, 'data-noeud': e.id, 'data-eq': q.ancre }, `(${q.numero})`)
}

/** Joint des morceaux : « a », « a et b », « a, b et c ». */
function joindre(items: Morceau[][], et = 'et'): Morceau[] {
  const r: Morceau[] = []
  items.forEach((it, k) => {
    if (k > 0) r.push(k === items.length - 1 ? ` ${et} ` : ', ')
    r.push(...it)
  })
  return r
}

/** Article défini (le, la, l’, les) ou contraction avec « de » / « à ». */
function article(def: DefEnv, pluriel: boolean, prep: '' | 'de'): string {
  if (pluriel) return prep === 'de' ? 'des ' : 'les '
  const nom = def.nom.toLowerCase()
  if (elision(nom)) return prep === 'de' ? 'de l’' : 'l’'
  if (def.feminin) return prep === 'de' ? 'de la ' : 'la '
  return prep === 'de' ? 'du ' : 'le '
}

/**
 * Renvois groupés façon cleveref : équations « (2.2) et (2.4) », puis environnements groupés par type
 * (« les lemmes 3.1 et 3.2 »). `prep` : « de » répété devant chaque groupe (« de l’hypothèse 1.6 et de la
 * définition 1.9 »).
 */
function renvois(envs: EnvArticle[], prep: '' | 'de', parEquation: boolean): Morceau[] {
  const items: Morceau[][] = []
  // Une prémisse est citée par sa dernière équation si elle lui est propre (pas une reprise).
  const derniere = (e: EnvArticle) => {
    const q = e.equations[e.equations.length - 1]
    return q && !q.reprise ? q : null
  }
  const eqs = parEquation ? envs.filter((e) => derniere(e)) : []
  const autres = envs.filter((e) => !eqs.includes(e))
  eqs.forEach((e, k) => items.push([prep === 'de' && k === 0 ? 'de ' : '', lienEq(e, derniere(e)!)]))
  const parType = new Map<DefEnv, EnvArticle[]>()
  for (const e of autres) {
    const l = parType.get(e.def) ?? []
    l.push(e)
    parType.set(e.def, l)
  }
  for (const [def, l] of parType) {
    const pluriel = l.length > 1
    const nom = pluriel ? def.pluriel : def.nom.toLowerCase()
    items.push([article(def, pluriel, prep), ...joindre(l.map((e, k) => [lienEnv(e, k === 0 ? `${nom} ${e.numero}` : e.numero)]))])
  }
  return joindre(items)
}

/** Phrase de démonstration à partir des prémisses et de leurs rôles. */
function phrasePreuve(d: DemonstrationR, num: Numerotation): Morceau[] {
  const par: Record<RolePremisse, EnvArticle[]> = { principale: [], auxiliaire: [], technique: [], contexte: [] }
  for (const p of d.premisses) {
    const e = num.parId.get(p.id)
    if (e && !par[p.role].includes(e)) par[p.role].push(e)
  }
  const parts: Morceau[][] = []
  if (par.principale.length) parts.push(['D’après ', ...renvois(par.principale, '', true)])
  if (par.auxiliaire.length) parts.push([parts.length ? 'avec ' : 'Avec ', ...renvois(par.auxiliaire, '', false)])
  if (par.technique.length) parts.push([parts.length ? 'à l’aide ' : 'À l’aide ', ...renvois(par.technique, 'de', false)])
  if (par.contexte.length) parts.push([parts.length ? 'dans le cadre ' : 'Dans le cadre ', ...renvois(par.contexte, 'de', false)])
  const r: Morceau[] = []
  parts.forEach((p, k) => {
    if (k) r.push(', ')
    r.push(...p)
  })
  if (r.length) r.push('.')
  return r
}

// ─── Rendu ───────────────────────────────────────────────────────────────────

/** Segments → nœuds DOM ; les équations hors texte coupent le paragraphe. */
function composerCorps(segs: Segment[], env: EnvArticle, tete: Morceau[], classe: string): HTMLElement[] {
  const blocs: HTMLElement[] = []
  let p: HTMLElement = el('p', { class: classe }, ...tete)
  let k = 0
  const fermer = () => {
    if (p.childNodes.length) blocs.push(p)
  }
  for (const s of segs) {
    if (s.genre === 'texte') p.append(s.texte)
    else if (s.genre === 'math') p.append(formule(s.tex, s.brut))
    else {
      fermer()
      const q = env.equations[k++]!
      const numero = q.reprise
        ? el('a', { class: 'eq-numero ref eqref', href: `#${q.reprise.ancre}`, 'data-noeud': q.reprise.id, 'data-eq': q.reprise.ancre, title: 'formule déjà numérotée' }, `(${q.numero})`)
        : el('span', { class: 'eq-numero' }, `(${q.numero})`)
      blocs.push(el('div', { class: `equation${q.reprise ? ' reprise' : ''}`, id: q.ancre, 'data-noeud': env.id },
        formule(s.tex + ponctuationTex(s.ponct), s.brut + s.ponct, true), numero))
      p = el('p', { class: `${classe} suite` })
    }
  }
  fermer()
  return blocs
}

const pct = (x: number) => x.toFixed(2).replace('.', ',')

function noteMarge(n: NoeudR, env: EnvArticle): HTMLElement {
  const statut = n.admis ? 'admis' : n.statut === 'valide' ? 'validé' : n.statut === 'incertain' ? 'à vérifier' : 'réfuté'
  const val = n.validation === 'aucune' ? '' : n.validation === 'ia_humain' ? 'IA + H' : n.validation === 'humain' ? 'H' : 'IA'
  const c = n.confiance
  return el('aside', { class: `marge statut-${n.admis ? 'admis' : n.statut}` },
    el('span', { class: 'marge-statut' }, statut, val ? ` · ${val}` : ''),
    el('span', { class: 'marge-conf' }, `c = ${pct(c.estimation)} [${pct(c.bas)} ; ${pct(c.haut)}]`),
    n.piste === 'abandonnee' ? el('span', {}, 'piste abandonnée') : null,
    el('a', { class: 'marge-fig', href: '#', 'data-noeud': env.id, 'data-figure': env.id }, 'fig. 1'),
  )
}

function environnement(n: NoeudR, env: EnvArticle): HTMLElement {
  const def = env.def
  const note: Morceau[] = [n.nom]
  if (n.admis) note.push(def.feminin ? ' ; admise' : ' ; admis')
  if (n.statut === 'refute') note.push(def.feminin ? ' ; réfutée' : ' ; réfuté')
  const tete: Morceau[] = [
    el('span', { class: 'env-tete' }, `${def.nom} ${env.numero}`), ' ',
    el('span', { class: 'env-note' }, '(', ...note, ')'), '. ',
  ]
  const racine = el('section', {
    class: `env env-${def.style}${n.piste === 'abandonnee' ? ' env-abandon' : ''}`,
    id: `env-${n.id}`, 'data-noeud': n.id,
  })
  racine.append(noteMarge(n, env), ...composerCorps(env.corps, env, tete, 'env-corps'))
  // Choix de modélisation : portée et alternatives écartées ; décision : alternatives et raison.
  if (n.type === 'choix_modelisation' && n.choix) {
    const l = el('dl', { class: 'env-liste' })
    if (n.choix.portee) l.append(el('dt', {}, 'Portée.'), el('dd', {}, ...texteMath(n.choix.portee)))
    if (n.choix.alternatives?.length) l.append(el('dt', {}, 'Alternatives écartées.'), el('dd', {}, ...texteMath(n.choix.alternatives.join(' ; ') + '.')))
    racine.append(l)
  }
  if (n.type === 'decision' && n.decision) {
    const ol = el('ol', { class: 'alternatives' })
    for (const a of n.decision.alternatives) {
      ol.append(el('li', { class: a.retenue ? 'retenue' : 'ecartee' },
        ...texteMath(a.libelle),
        a.retenue ? el('span', { class: 'verdict' }, ' — retenue.') : el('span', { class: 'verdict' }, ' — écartée', a.raison ? ' : ' : '.'),
        !a.retenue && a.raison ? texteMath(minusculeInitiale(a.raison)) : null))
    }
    racine.append(ol)
    if (n.decision.raison) racine.append(el('p', { class: 'env-corps suite' }, el('em', {}, 'Raison. '), ...texteMath(n.decision.raison)))
  }
  return racine
}

/** Texte court avec formules en ligne (les équations y restent en ligne, ponctuation hors formule). */
function texteMath(t: string): Morceau[] {
  return segmenter(t).flatMap((s): Morceau[] => {
    if (s.genre === 'texte') return [s.texte]
    if (s.genre === 'math') return [formule(s.tex, s.brut)]
    return [formule(s.tex, s.brut), s.ponct ? (/[:;]/u.test(s.ponct) ? ' ' : '') + s.ponct : '']
  })
}

const QED: Record<string, { signe: string; titre: string }> = {
  valide: { signe: '∎', titre: 'démonstration validée' },
  a_verifier: { signe: '□', titre: 'démonstration à vérifier' },
  invalide: { signe: '✗', titre: 'démonstration invalidée' },
}

function preuves(n: NoeudR, num: Numerotation): HTMLElement[] {
  const r: HTMLElement[] = []
  n.demonstrations.forEach((d, k) => {
    const phrase = phrasePreuve(d, num)
    const texte = d.texte ? texteMath(d.texte) : []
    if (!phrase.length && !texte.length) return
    if (n.admis) {
      r.push(el('p', { class: 'preuve admis', 'data-noeud': n.id }, el('em', {}, 'Admis. '), ...phrase))
      return
    }
    const nom = d.nom === 'Démonstration' || !d.nom ? 'Démonstration' : d.nom
    const q = QED[d.validite] ?? QED.a_verifier!
    r.push(el('p', { class: `preuve preuve-${d.validite}`, 'data-noeud': n.id },
      el('em', {}, `${nom}${d.validite === 'invalide' ? ' (invalidée)' : ''}${k && d.nom === 'Démonstration' ? ` ${k + 1}` : ''}. `),
      ...texte, texte.length ? ' ' : '', ...phrase,
      el('span', { class: 'qed', title: q.titre }, q.signe)))
  })
  return r
}

const GENRES_LIEN: Record<string, string> = { contredit: 'Contredit', resout: 'Résout', remplace: 'Remplace', abandonne: 'Abandonne' }

function remarques(n: NoeudR, num: Numerotation): HTMLElement[] {
  if (!n.liens?.length) return []
  return n.liens.map((l) => {
    const c = num.parId.get(l.cible)
    const ref: Morceau[] = c ? [article(c.def, false, ''), lienEnv(c, `${c.def.nom.toLowerCase()} ${c.numero}`)] : [l.cible]
    return el('p', { class: 'remarque', 'data-noeud': n.id }, el('em', {}, 'Remarque. '), `${GENRES_LIEN[l.genre] ?? l.genre} `, ...ref, l.note ? ' : ' : '.', ...(l.note ? texteMath(minusculeInitiale(l.note)) : []))
  })
}

export interface OptionsArticle {
  titre: string
  resume: string
  noeuds: NoeudR[]
  num: Numerotation
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

/** Compose l'article complet (DOM). Les formules restent en Unicode jusqu'à `composerFormules`. */
export function composerArticle(o: OptionsArticle): HTMLElement {
  const { noeuds, num } = o
  const auteurs = [...new Set(noeuds.map((n) => n.auteur))]
  const derniere = Math.max(...noeuds.map((n) => Date.parse(n.cree_le)).filter(Number.isFinite))
  const nbPremisses = noeuds.reduce((s, n) => s + n.demonstrations.reduce((t, d) => t + d.premisses.length, 0), 0)
  const page = el('article', { class: 'page', lang: 'fr' })
  page.append(
    el('div', { class: 'entete-courante' }, el('span', {}, o.titre.toUpperCase()), el('span', {}, 'ATLAS')),
    el('h1', { class: 'titre' }, o.titre),
    el('div', { class: 'auteurs' }, auteurs.join(', ')),
    el('div', { class: 'date' }, Number.isFinite(derniere) ? fmtDate.format(derniere) : ''),
    el('div', { class: 'resume' }, el('span', { class: 'resume-tete' }, 'Résumé. '), ...texteMath(o.resume)),
    el('div', { class: 'resume resume-meta' },
      el('span', { class: 'resume-tete' }, 'Composition. '),
      `Article composé depuis le graphe de justification : ${noeuds.length} énoncés, ${nbPremisses} prémisses, ${num.nbEquations} équations numérotées. `,
      'Les énoncés sont numérotés comme les blocs de la ', el('a', { class: 'ref', href: '#figure-1', 'data-figure-tout': '1' }, 'figure 1'), '.'),
    legendeFigure(),
  )
  for (const s of num.sections) {
    const sec = el('section', { class: `section${s.abandonnee ? ' section-abandon' : ''}`, id: `section-${s.numero}` },
      el('h2', {}, el('span', { class: 'sec-num' }, `${s.numero}.`), ' ', s.titre))
    if (s.abandonnee) sec.append(el('p', { class: 'sec-note' }, 'Piste abandonnée, conservée pour mémoire.'))
    if (s.resume) sec.append(el('p', { class: 'sec-resume' }, ...texteMath(s.resume)))
    for (const e of s.envs) {
      const n = noeuds[e.i]!
      sec.append(environnement(n, e), ...preuves(n, num), ...remarques(n, num))
    }
    page.append(sec)
  }
  page.append(el('p', { class: 'colophon' }, 'Composé par Atlas avec les conventions amsart, amsmath et amsthm ; formules : KaTeX.'))
  return page
}

function legendeFigure(): HTMLElement {
  return el('figure', { class: 'legende-figure', id: 'figure-1' },
    el('figcaption', {},
      el('span', { class: 'fig-tete' }, 'Figure 1'), el('span', { class: 'fig-ou' }), '. ',
      'Schéma de lecture du raisonnement. Chaque bloc porte le numéro de son énoncé ; une liaison va des prémisses principales vers ce qu’elles démontrent. ',
      'Trait continu : validé ; tireté : à vérifier ; bloc barré : réfuté ; pointillé gris : piste abandonnée. ',
      'Cases sous les blocs : contexte rattaché (H hypothèse, D définition, A axiome, O outil). Losange : décision ; ',
      el('span', { class: 'math-texte' }, '×'), ' : alternative écartée. Fin de démonstration : ∎ validée, □ à vérifier, ✗ invalidée.'))
}

