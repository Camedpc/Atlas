// R18 · Formules : extraction générique depuis l'énoncé, grandeurs physiques, composition typographique.
//
// Règle d'extraction (aucun identifiant de jeu codé en dur) :
//
//   0. Annotation explicite : tout segment entre `$…$` dans l'énoncé est une formule, prise telle quelle
//      (sans les dollars). Si l'énoncé en contient, les règles 1 à 4 ne s'appliquent pas.
//   1. Découpage en jetons (espaces) ; une relation (= ≈ ≃ ≠ < > ≤ ≥ → ∝ ≡ ⇒) est isolée en jeton.
//      Un jeton est « mathématique » s'il ne contient pas trois lettres latines consécutives une fois
//      retirés ses indices / exposants (`_x`, `_{…}`, `^…`), sauf fonctions connues (sin, max, div…),
//      et s'il n'est pas un petit mot français (de, la, le, et, en, au, à…).
//   2. Autour de chaque relation, on étend à gauche puis à droite tant que les jetons sont
//      mathématiques ; une ponctuation de fin de proposition (« , ; . : ») arrête l'extension (le jeton
//      qui la porte est gardé à droite, pas à gauche). À droite seulement : un mot unique suivi d'une fin
//      de proposition est gardé (« = constante ; ») ; les mots de liaison « en, donne, pour, si, avec, où »
//      sont gardés s'ils sont suivis d'une nouvelle relation (« T′ ≈ 0 en y = h₁ », « α → 0 donne h₁ → 0 »).
//   3. Nettoyage : parenthèses déséquilibrées retirées aux bords, coupure avant une parenthèse ouverte
//      jamais refermée, opérateur final remplacé par « … » (« d𝐩/dt = Σ𝐅_ext + … »). Il faut un symbole
//      (lettre) d'un côté au moins et deux membres non vides.
//   4. « X est constant(e) / nul(le) / conservé(e) » s'écrit « X = cte » / « X = 0 » (X mathématique).
//   Priorité : les formules hors parenthèses d'abord ; une formule trouvée dans une parenthèse
//   (« (β = 0 pour …) ») n'est gardée que s'il n'y en a pas d'autre. Au plus `max` formules, dans l'ordre
//   du texte. Un choix de modélisation cherche aussi dans son hypothèse (`choix.hypothese`).
//
// Grandeurs physiques : table de convention de notation (T → tension, v → vitesse, h / y → longueur…).
// Elle ne dépend pas du jeu ; un symbole absent de la table n'a pas de grandeur (la broche prend alors la
// couleur du rôle de la prémisse).

import type { NoeudR } from '../../src/raisonnement'

// ─── Jetons ──────────────────────────────────────────────────────────────────

const RELATIONS = ['=', '≈', '≃', '≠', '<', '>', '≤', '≥', '→', '∝', '≡', '⇒', '+=', '−=', ':=']
const CAR_RELATION = new Set(['=', '≈', '≃', '≠', '<', '>', '≤', '≥', '→', '∝', '≡', '⇒'])
const OPERATEURS = new Set(['+', '−', '-', '±', '∓', '×', '·', '/', '∘'])
const FONCTIONS = new Set([
  'sin', 'cos', 'tan', 'exp', 'ln', 'log', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'tr', 'cte', 'const',
  'div', 'grad', 'rot', 'arg', 'sinh', 'cosh', 'tanh', 'Var', 'Cov', 'ext',
])
const PETITS_MOTS = new Set([
  'de', 'la', 'le', 'les', 'un', 'une', 'et', 'en', 'du', 'des', 'au', 'aux', 'à', 'ou', 'où', 'ne', 'sa', 'se',
  'ce', 'il', 'on', 'si', 'par', 'sur', 'est', 'qui', 'que', 'soit', 'car', 'pas', 'ni', 'sans',
])
const LIAISONS = new Set(['en', 'donne', 'pour', 'si', 'avec', 'où', 'donc'])
const FIN = /[,;.:]$/
const SEPARATEURS = new Set([':', ';', '—', '–'])

interface Jeton {
  brut: string
  /** Sans ponctuation finale. */
  coeur: string
  fin: boolean
  genre: 'relation' | 'math' | 'mot' | 'separateur'
}

function sansIndices(t: string): string {
  return t.replace(/[_^](\{[^}]*\}|[\p{L}\p{N}]+)/gu, '')
}

export function estMathematique(t: string): boolean {
  if (!t) return false
  const nu = t.replace(/^[([{|‖]+|[)\]}|‖]+$/gu, '')
  if (PETITS_MOTS.has(nu.toLowerCase())) return false
  if (FONCTIONS.has(nu)) return true
  const s = sansIndices(t)
  // Mots : trois lettres latines consécutives (sauf fonctions à l'intérieur : « sin(x) », « Σ𝐅_ext »).
  const mots = s.match(/[A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]{3,}/gu)
  if (mots && mots.some((m) => !FONCTIONS.has(m))) return false
  return true
}

/** Isole les relations hors accolades (« k≤K » dans « Σ_{k≤K} » reste un indice) ; « += » est une relation. */
function espacerRelations(texte: string): string {
  const cps = [...texte]
  let r = '', prof = 0
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i]!
    if (c === '{') prof++
    else if (c === '}') prof = Math.max(0, prof - 1)
    if (prof === 0 && CAR_RELATION.has(c)) {
      // « +=  −=  := » : l'opérateur qui précède fait partie de la relation.
      if (c === '=' && /[+−:]$/.test(r)) r = `${r.slice(0, -1)} ${r.slice(-1)}= `
      else r += ` ${c} `
    } else r += c
  }
  return r
}

function jetons(texte: string): Jeton[] {
  let prof = 0
  const J = espacerRelations(texte).split(/\s+/).filter(Boolean).map((brut) => {
    for (const c of brut) prof += c === '(' ? 1 : c === ')' ? -1 : 0
    // Une virgule dans une parenthèse ouverte (« W(t, x) ») ne termine pas la proposition.
    const fin = FIN.test(brut) && brut.length > 1 && !(brut.endsWith(',') && prof > 0)
    const coeur = fin ? brut.slice(0, -1) : brut
    let genre: Jeton['genre']
    if (RELATIONS.includes(brut)) genre = 'relation'
    else if (SEPARATEURS.has(brut)) genre = 'separateur'
    else genre = estMathematique(coeur) ? 'math' : 'mot'
    return { brut, coeur, fin, genre }
  })
  // Petit mot suivi d'un opérateur ou d'une relation : c'est un symbole (« du + b·∇u dt »).
  J.forEach((t, k) => {
    const s = J[k + 1]
    if (t.genre === 'mot' && !t.fin && PETITS_MOTS.has(t.coeur) && s && (s.genre === 'relation' || OPERATEURS.has(s.coeur))) t.genre = 'math'
  })
  return J
}

// ─── Extraction ──────────────────────────────────────────────────────────────

interface Trouvee {
  texte: string
  debut: number
  aparte: boolean
}

function equilibrer(ts: string[]): string[] | null {
  if (!ts.length) return null
  const r = [...ts]
  // Parenthèse ouvrante isolée en tête, fermante isolée en queue.
  const compte = (s: string, c: string) => [...s].filter((x) => x === c).length
  const solde = () => r.reduce((t, s) => t + compte(s, '(') - compte(s, ')'), 0)
  if (solde() < 0 && r[r.length - 1]!.endsWith(')')) r[r.length - 1] = r[r.length - 1]!.slice(0, -1)
  if (solde() > 0 && r[0]!.startsWith('(')) r[0] = r[0]!.slice(1)
  // Formule entièrement entre parenthèses : « (α = 0) » → « α = 0 ».
  if (r.length > 1 && r[0]!.startsWith('(') && r[r.length - 1]!.endsWith(')')) {
    const essai = [r[0]!.slice(1), ...r.slice(1, -1), r[r.length - 1]!.slice(0, -1)]
    let t = 0, ok = true
    for (const x of essai) {
      for (const c of x) {
        if (c === '(') t++
        else if (c === ')' && --t < 0) ok = false
      }
    }
    if (ok && t === 0) r.splice(0, r.length, ...essai)
  }
  // Parenthèse ouverte jamais refermée : on coupe avant elle.
  let s = 0
  for (let k = 0; k < r.length; k++) {
    const avant = s
    s += compte(r[k]!, '(') - compte(r[k]!, ')')
    if (s > 0 && avant === 0) {
      // Est-elle refermée plus loin ?
      let t = s
      for (let m = k + 1; m < r.length && t > 0; m++) t += compte(r[m]!, '(') - compte(r[m]!, ')')
      if (t > 0) {
        r.length = k
        break
      }
    }
  }
  if (solde() < 0 && r.length && r[r.length - 1]!.endsWith(')')) r[r.length - 1] = r[r.length - 1]!.slice(0, -1)
  return r.filter(Boolean).length ? r.filter(Boolean) : null
}

function valide(ts: string[]): boolean {
  const i = ts.findIndex((t) => RELATIONS.includes(t))
  if (i <= 0 || i >= ts.length - 1) return false
  return ts.some((t) => /\p{L}/u.test(t))
}

/** Formules de l'énoncé, dans l'ordre du texte (voir la règle en tête du fichier). */
export function extraireFormules(texte: string, max = 2): string[] {
  if (!texte) return []
  const dollars = [...texte.matchAll(/\$([^$]+)\$/g)].map((m) => m[1]!.trim()).filter(Boolean)
  if (dollars.length) return dollars.slice(0, max)
  const J = jetons(texte)
  const pris = new Uint8Array(J.length)
  const trouvees: Trouvee[] = []
  for (let i = 0; i < J.length; i++) {
    if (J[i]!.genre !== 'relation' || pris[i]) continue
    // Gauche.
    let a = i
    while (a - 1 >= 0) {
      const t = J[a - 1]!
      if (t.fin || t.genre === 'separateur' || t.genre === 'mot') break
      a--
    }
    // Droite.
    let b = i
    const garde: number[] = []
    let liaisonEnAttente = -1
    while (b + 1 < J.length) {
      const t = J[b + 1]!
      if (t.genre === 'separateur') break
      if (t.genre === 'mot') {
        const suivant = J[b + 2]
        if (b === i && (t.fin || !suivant || suivant.genre === 'separateur')) {
          b++
          garde.push(b)
          break
        }
        if (LIAISONS.has(t.coeur.toLowerCase()) && suivant && suivant.genre === 'math') {
          liaisonEnAttente = liaisonEnAttente < 0 ? b + 1 : liaisonEnAttente
          b++
          continue
        }
        break
      }
      b++
      if (t.genre === 'relation') liaisonEnAttente = -1
      if (t.fin) break
    }
    // Liaison sans relation derrière : on coupe avant elle.
    if (liaisonEnAttente >= 0) b = liaisonEnAttente - 1
    for (let k = a; k <= b; k++) if (J[k]!.genre === 'relation') pris[k] = 1
    const morceaux = J.slice(a, b + 1).map((t) => t.coeur)
    // Opérateur final (la suite est en mots) : « … ».
    let suite = ''
    while (morceaux.length && OPERATEURS.has(morceaux[morceaux.length - 1]!)) suite = morceaux.pop()!
    const aparte = J[a]!.brut.startsWith('(')
    const eq = equilibrer(morceaux)
    if (!eq || !valide(eq)) continue
    trouvees.push({ texte: eq.join(' ') + (suite ? ` ${suite} …` : ''), debut: a, aparte })
  }
  // 4. « X est constant / nul / conservé ».
  for (let i = 0; i + 1 < J.length; i++) {
    if (J[i]!.coeur !== 'est') continue
    const q = J[i + 1]!.coeur.toLowerCase()
    const valeur = /^(constante?|conservée?)$/.test(q) ? 'cte' : /^nulle?$/.test(q) ? '0' : null
    if (!valeur) continue
    let a = i
    while (a - 1 >= 0 && J[a - 1]!.genre === 'math' && !J[a - 1]!.fin) a--
    if (a === i) continue
    const eq = equilibrer(J.slice(a, i).map((t) => t.coeur))
    if (eq && eq.some((t) => /\p{L}/u.test(t))) trouvees.push({ texte: `${eq.join(' ')} = ${valeur}`, debut: a, aparte: false })
  }
  trouvees.sort((x, y) => x.debut - y.debut)
  const principales = trouvees.filter((t) => !t.aparte)
  const retenues = principales.length ? principales : trouvees
  const vues = new Set<string>()
  return retenues.filter((t) => !vues.has(t.texte) && (vues.add(t.texte), true)).slice(0, max).map((t) => t.texte)
}

/** Formules d'un nœud : énoncé, puis hypothèse du choix de modélisation. */
export function formulesDuNoeud(n: NoeudR, max = 2): string[] {
  const f = extraireFormules(n.enonce, max)
  if (f.length < max && n.choix?.hypothese) {
    for (const g of extraireFormules(n.choix.hypothese, max)) if (f.length < max && !f.includes(g)) f.push(g)
  }
  return f
}

/** Énoncé court (sans formule) : première proposition, pour le corps d'un bloc qui n'a pas d'équation. */
export function enonceCourt(n: NoeudR): string {
  const t = n.enonce.replace(/\$[^$]*\$/g, '').trim()
  // Première phrase (point ou point-virgule) ; les deux-points introduisent souvent la définition.
  const m = t.match(/^(.+?[.;])(\s|$)/)
  return (m ? m[1]! : t).replace(/[.;]$/, '').trim()
}

// ─── Symboles et grandeurs ───────────────────────────────────────────────────

export interface Grandeur {
  id: string
  nom: string
  couleur: string
  /** Rang de priorité (petit = prioritaire) quand plusieurs grandeurs sont en jeu. */
  priorite: number
}

/** Convention de notation de la mécanique (pas propre au jeu). */
export const GRANDEURS: Record<string, Grandeur> = {
  force: { id: 'force', nom: 'Tension / force', couleur: '#0e7490', priorite: 1 },
  vitesse: { id: 'vitesse', nom: 'Vitesse', couleur: '#c2410c', priorite: 2 },
  longueur: { id: 'longueur', nom: 'Hauteur / longueur', couleur: '#4d7c0f', priorite: 3 },
  impulsion: { id: 'impulsion', nom: 'Quantité de mouvement', couleur: '#4338ca', priorite: 4 },
  energie: { id: 'energie', nom: 'Énergie', couleur: '#b45309', priorite: 5 },
  temps: { id: 'temps', nom: 'Temps', couleur: '#9d174d', priorite: 6 },
  coefficient: { id: 'coefficient', nom: 'Coefficient sans dimension', couleur: '#a21caf', priorite: 7 },
  acceleration: { id: 'acceleration', nom: 'Accélération', couleur: '#57534e', priorite: 8 },
  masse: { id: 'masse', nom: 'Masse (linéique)', couleur: '#78716c', priorite: 9 },
}

/** Lettre de base → grandeur ; `constante` : ne suffit pas à dire ce que transmet une liaison. */
const NOTATION: Record<string, { g: string; constante?: boolean }> = {
  T: { g: 'force' }, F: { g: 'force' }, N: { g: 'force' }, '𝐅': { g: 'force' }, '𝐓': { g: 'force' },
  v: { g: 'vitesse' }, '𝐯': { g: 'vitesse' },
  h: { g: 'longueur' }, y: { g: 'longueur' }, z: { g: 'longueur' }, L: { g: 'longueur' }, 'ℓ': { g: 'longueur' },
  p: { g: 'impulsion' }, '𝐩': { g: 'impulsion' },
  E: { g: 'energie' },
  t: { g: 'temps' }, 'τ': { g: 'temps' },
  'α': { g: 'coefficient' }, 'β': { g: 'coefficient' }, 'γ': { g: 'coefficient' },
  g: { g: 'acceleration', constante: true }, '𝐠': { g: 'acceleration', constante: true },
  'λ': { g: 'masse', constante: true }, 'ρ': { g: 'masse', constante: true }, m: { g: 'masse', constante: true },
}

/**
 * Symboles d'une formule : lettre (latine, grecque, mathématique) suivie de ses primes et indices
 * (« T′₀ », « h₁ », « T_s »). Les fonctions, les mots de liaison et le contenu des exposants sont ignorés.
 */
export function symbolesDe(formule: string): string[] {
  const s = formule.replace(/\^(\{[^}]*\}|[\p{L}\p{N}]+)/gu, ' ')
  const r: string[] = []
  // Lettre de base : pas un indice (ₛ), ni un opérateur grec (Σ, Π).
  const re = /([A-Za-z]+|(?![ₐ-ₜΣΠ])\p{L})([′″]*)((?:[₀-₉ₐ-ₜ]|_\{[^}]*\}|_[\p{L}\p{N}]+)*)/gu
  for (const m of s.matchAll(re)) {
    const base = m[1]!
    if (/^[A-Za-z]{2,}$/.test(base)) {
      // Mot (≥ 3 lettres) ou fonction : pas un symbole.
      if (base.length > 2 || FONCTIONS.has(base) || LIAISONS.has(base) || PETITS_MOTS.has(base)) continue
      // « dt », « ab » : produits de lettres ; « d » différentiel ignoré.
      for (const c of base) if (c !== 'd') r.push(c)
      continue
    }
    r.push(base + m[2]! + m[3]!)
  }
  return [...new Set(r)]
}

function baseDe(symbole: string): string {
  return [...symbole][0] ?? ''
}

export function grandeurDuSymbole(symbole: string): { g: Grandeur; constante: boolean } | null {
  const n = NOTATION[baseDe(symbole)]
  return n ? { g: GRANDEURS[n.g]!, constante: !!n.constante } : null
}

/** Grandeur principale d'une formule : celle du membre de gauche, la plus prioritaire. */
export function grandeurPrincipale(formules: string[]): Grandeur | null {
  const f = formules[0]
  if (!f) return null
  const gauche = f.split(new RegExp(`\\s(?:${RELATIONS.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s`))[0] ?? f
  return meilleure(symbolesDe(gauche), false) ?? meilleure(symbolesDe(f), false)
}

function meilleure(symboles: string[], sansConstantes: boolean): Grandeur | null {
  let m: Grandeur | null = null
  for (const s of symboles) {
    const x = grandeurDuSymbole(s)
    if (!x || (sansConstantes && x.constante)) continue
    if (!m || x.g.priorite < m.priorite) m = x.g
  }
  return m
}

/**
 * Grandeur transmise par une liaison source → cible : symbole partagé par leurs formules (hors
 * constantes), le plus prioritaire ; sinon grandeur principale de la source ; sinon null (rôle).
 */
export function grandeurTransmise(source: string[], cible: string[]): { g: Grandeur; symbole: string } | null {
  const ss = new Set(source.flatMap(symbolesDe))
  const partages = [...new Set(cible.flatMap(symbolesDe))].filter((s) => ss.has(s))
  let m: { g: Grandeur; symbole: string } | null = null
  for (const s of partages) {
    const x = grandeurDuSymbole(s)
    if (!x || x.constante) continue
    if (!m || x.g.priorite < m.g.priorite) m = { g: x.g, symbole: s }
  }
  if (m) return m
  const g = grandeurPrincipale(source)
  if (!g) return null
  const sym = source.flatMap(symbolesDe).find((s) => grandeurDuSymbole(s)?.g === g) ?? ''
  return { g, symbole: sym }
}

// ─── Composition typographique (canvas) ──────────────────────────────────────

export const POLICE_MATH = `'Cambria Math', 'STIX Two Math', 'Latin Modern Math', Cambria, 'Times New Roman', serif`

type Style = 'var' | 'droit' | 'rel' | 'op' | 'mot' | 'espace'
interface Morceau {
  t: string
  style: Style
  /** 0 ligne de base, 1 indice, 2 exposant. */
  pos: 0 | 1 | 2
}

const GREC_MINUSCULE = /^[α-ωϑϕϵ]$/u
const LETTRE = /\p{L}/u

/** Découpe une formule en morceaux stylés (variables en italique, opérateurs espacés…). */
export function composer(formule: string): Morceau[] {
  const r: Morceau[] = []
  const pousser = (t: string, style: Style, pos: 0 | 1 | 2 = 0) => {
    const d = r[r.length - 1]
    if (d && d.style === style && d.pos === pos && style !== 'rel' && style !== 'op' && style !== 'espace') d.t += t
    else r.push({ t, style, pos })
  }
  const cps = [...formule]
  let i = 0
  const precedentSignificatif = () => {
    for (let k = r.length - 1; k >= 0; k--) if (r[k]!.style !== 'espace') return r[k]!
    return null
  }
  const indice = (pos: 1 | 2) => {
    // `_x`, `_{…}`, `^2`, `^{…}`.
    i++
    let contenu = ''
    if (cps[i] === '{') {
      let prof = 1
      i++
      while (i < cps.length && prof > 0) {
        if (cps[i] === '{') prof++
        else if (cps[i] === '}') prof--
        if (prof > 0) contenu += cps[i]
        i++
      }
    } else {
      while (i < cps.length && /[\p{L}\p{N}]/u.test(cps[i]!)) contenu += cps[i++]
    }
    for (const c of contenu) pousser(c, /[A-Za-z]/.test(c) || GREC_MINUSCULE.test(c) ? 'var' : 'droit', pos)
  }
  while (i < cps.length) {
    const c = cps[i]!
    if (/\s/.test(c)) {
      while (i < cps.length && /\s/.test(cps[i]!)) i++
      const d = r[r.length - 1]
      if (d && d.style !== 'rel' && d.style !== 'op' && d.style !== 'espace') r.push({ t: ' ', style: 'espace', pos: 0 })
      continue
    }
    if (c === '_' || c === '^') {
      indice(c === '_' ? 1 : 2)
      continue
    }
    if (/[A-Za-z]/.test(c)) {
      let mot = ''
      while (i < cps.length && /[A-Za-z]/.test(cps[i]!)) mot += cps[i++]
      if (FONCTIONS.has(mot)) pousser(mot, 'droit')
      else if (LIAISONS.has(mot) || PETITS_MOTS.has(mot)) {
        if (r[r.length - 1]?.style === 'espace') r.pop()
        r.push({ t: mot, style: 'mot', pos: 0 })
      } else pousser(mot, 'var')
      continue
    }
    if (RELATIONS.includes(c)) {
      if (r[r.length - 1]?.style === 'espace') r.pop()
      r.push({ t: c, style: 'rel', pos: 0 })
      i++
      continue
    }
    if (c === '+' || c === '−' || c === '-' || c === '±' || c === '∓' || c === '×' || c === '∘') {
      if (r[r.length - 1]?.style === 'espace') r.pop()
      const p = precedentSignificatif()
      const unaire = !p || p.style === 'rel' || p.style === 'op' || p.style === 'mot' || /[([{,]$/.test(p.t)
      r.push({ t: c === '-' ? '−' : c, style: unaire ? 'droit' : 'op', pos: 0 })
      i++
      continue
    }
    if (/[0-9]/.test(c)) {
      let nb = ''
      while (i < cps.length && (/[0-9]/.test(cps[i]!) || (cps[i] === ',' && /[0-9]/.test(cps[i + 1] ?? '')))) nb += cps[i++]
      pousser(nb, 'droit')
      continue
    }
    if (c === '…') {
      if (r[r.length - 1]?.style !== 'espace') r.push({ t: ' ', style: 'espace', pos: 0 })
      pousser(c, 'droit')
      i++
      continue
    }
    pousser(c, GREC_MINUSCULE.test(c) ? 'var' : 'droit')
    i++
  }
  while (r.length && r[r.length - 1]!.style === 'espace') r.pop()
  return r
}

function police(m: Morceau, taille: number): string {
  const t = m.pos ? taille * 0.7 : taille
  if (m.style === 'mot') return `italic 400 ${taille * 0.82}px ${POLICE_MATH}`
  if (m.style === 'var' && LETTRE.test(m.t)) return `italic 400 ${t}px ${POLICE_MATH}`
  return `400 ${t}px ${POLICE_MATH}`
}

function espaceAvant(m: Morceau, taille: number): number {
  if (m.style === 'rel') return taille * 0.28
  if (m.style === 'op') return taille * 0.22
  if (m.style === 'mot') return taille * 0.33
  if (m.style === 'espace') return taille * 0.17
  return 0
}

function espaceApres(m: Morceau, taille: number): number {
  if (m.style === 'rel') return taille * 0.28
  if (m.style === 'op') return taille * 0.22
  if (m.style === 'mot') return taille * 0.33
  return 0
}

/** Largeur (px) d'une formule composée. */
export function mesurerFormule(ctx: CanvasRenderingContext2D, morceaux: Morceau[], taille: number): number {
  let x = 0
  for (const m of morceaux) {
    if (m.style === 'espace') {
      x += espaceAvant(m, taille)
      continue
    }
    ctx.font = police(m, taille)
    x += espaceAvant(m, taille) + ctx.measureText(m.t).width + espaceApres(m, taille)
    // Correction d'italique : une variable suivie d'un caractère droit.
    if (m.style === 'var' && !m.pos) x += taille * 0.04
  }
  return x
}

/** Dessine une formule composée, ligne de base en (x, y), alignée à gauche. */
export function dessinerFormule(
  ctx: CanvasRenderingContext2D, morceaux: Morceau[], x: number, y: number, taille: number, encre: string, doux: string,
): void {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  for (const m of morceaux) {
    if (m.style === 'espace') {
      x += espaceAvant(m, taille)
      continue
    }
    ctx.font = police(m, taille)
    x += espaceAvant(m, taille)
    ctx.fillStyle = m.style === 'mot' ? doux : encre
    const dy = m.pos === 1 ? taille * 0.22 : m.pos === 2 ? -taille * 0.38 : 0
    ctx.fillText(m.t, x, y + dy)
    x += ctx.measureText(m.t).width + espaceApres(m, taille)
    if (m.style === 'var' && !m.pos) x += taille * 0.04
  }
}

/**
 * Coupe une formule trop large aux relations (la relation commence la ligne suivante, comme en
 * typographie mathématique). Renvoie les lignes composées.
 */
export function couperFormule(ctx: CanvasRenderingContext2D, formule: string, taille: number, largeur: number): Morceau[][] {
  const tout = composer(formule)
  if (mesurerFormule(ctx, tout, taille) <= largeur) return [tout]
  const lignes: Morceau[][] = []
  let courante: Morceau[] = []
  for (const m of tout) {
    if (m.style === 'rel' && courante.length && mesurerFormule(ctx, courante, taille) > largeur * 0.35) {
      lignes.push(courante)
      courante = []
    }
    courante.push(m)
  }
  if (courante.length) lignes.push(courante)
  return lignes
}

export type { Morceau }
