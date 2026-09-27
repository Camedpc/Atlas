// R35 · Formules : extraction depuis l'énoncé (règle reprise telle quelle de R18), conversion en LaTeX pour
// KaTeX, lecture des valeurs numériques et petit évaluateur d'expressions (pour tracer les lois).
//
// Règle d'extraction des formules (aucun identifiant de jeu codé en dur) :
//
//   0. Annotation explicite : tout segment entre `$…$` dans l'énoncé est une formule, prise telle quelle
//      (sans les dollars). Si l'énoncé en contient, les règles 1 à 4 ne s'appliquent pas.
//   1. Découpage en jetons (espaces) ; une relation (= ≈ ≃ ≠ < > ≤ ≥ → ∝ ≡ ⇒) est isolée en jeton.
//      Un jeton est « mathématique » s'il ne contient pas trois lettres latines consécutives une fois
//      retirés ses indices / exposants, sauf fonctions connues (sin, max, div…), et s'il n'est pas un
//      petit mot français (de, la, le, et, en, au, à…).
//   2. Autour de chaque relation, on étend à gauche puis à droite tant que les jetons sont
//      mathématiques ; une ponctuation de fin de proposition (« , ; . : ») arrête l'extension.
//   3. Nettoyage : parenthèses déséquilibrées retirées aux bords, opérateur final remplacé par « … ».
//   4. « X est constant(e) / nul(le) / conservé(e) » s'écrit « X = cte » / « X = 0 ».
//   Priorité aux formules hors parenthèses ; au plus `max` formules, dans l'ordre du texte.
//
// Valeurs numériques (règle R35, voir `extraireValeurs`) : « symbole (= | ≈) nombre [± incertitude] »,
// le symbole n'étant pas précédé d'un opérateur (sinon c'est une combinaison : « 1 − α − β ≈ 0,86 »).
// Pentes déclarées : « Y / X = nombre ± σ » et « pente de Y contre X : nombre ± σ ».

import type { NoeudR } from '../../src/raisonnement'

// ─── Jetons ──────────────────────────────────────────────────────────────────

const RELATIONS = ['=', '≈', '≃', '≠', '<', '>', '≤', '≥', '→', '∝', '≡', '⇒']
const RE_RELATION = /\s*([=≈≃≠≤≥→∝≡⇒]|(?<![-−])>|<(?![-−]))\s*/gu
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

function jetons(texte: string): Jeton[] {
  const espace = texte.replace(RE_RELATION, ' $1 ')
  return espace.split(/\s+/).filter(Boolean).map((brut) => {
    const fin = FIN.test(brut) && brut.length > 1
    const coeur = fin ? brut.slice(0, -1) : brut
    let genre: Jeton['genre']
    if (RELATIONS.includes(brut)) genre = 'relation'
    else if (SEPARATEURS.has(brut)) genre = 'separateur'
    else genre = estMathematique(coeur) ? 'math' : 'mot'
    return { brut, coeur, fin, genre }
  })
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


// ─── Conversion en LaTeX (pour KaTeX) ────────────────────────────────────────

const GREC: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'varepsilon', ϵ: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta',
  ϑ: 'vartheta', ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma',
  τ: 'tau', υ: 'upsilon', φ: 'varphi', ϕ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega', Γ: 'Gamma', Δ: 'Delta',
  Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi', Σ: 'Sigma', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
}
const SIGNES: Record<string, string> = {
  '−': '-', '·': '\\cdot ', '×': '\\times ', '≈': '\\approx ', '≃': '\\simeq ', '≠': '\\neq ', '≤': '\\leq ',
  '≥': '\\geq ', '→': '\\to ', '∝': '\\propto ', '≡': '\\equiv ', '⇒': '\\Rightarrow ', '∂': '\\partial ',
  '±': '\\pm ', '∓': '\\mp ', '…': '\\dots ', '∞': '\\infty ', '∇': '\\nabla ', '∘': '\\circ ', '‖': '\\|',
  '′': "'", '″': "''", '∑': '\\sum ', 'ℓ': '\\ell ', '%': '\\%', '#': '\\#', '&': '\\&', '$': '\\$',
}
export const INDICES: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p',
  'ₛ': 's', 'ₜ': 't', '₊': '+', '₋': '-',
}
export const EXPOSANTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁻': '-', '⁺': '+', 'ⁿ': 'n',
}
const FONCTIONS_TEX = new Set(['sin', 'cos', 'tan', 'exp', 'ln', 'log', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'sinh', 'cosh', 'tanh', 'arg'])
const MOTS_DROITS = new Set(['cte', 'const', 'ext', 'div', 'grad', 'rot', 'tr', 'Var', 'Cov'])

/** Lettre grasse mathématique (𝐀…𝐳, 𝟎…𝟗) → lettre ASCII, sinon null. */
export function lettreGrasse(c: string): string | null {
  const k = c.codePointAt(0)
  if (k === undefined) return null
  if (k >= 0x1d400 && k <= 0x1d419) return String.fromCharCode(65 + k - 0x1d400)
  if (k >= 0x1d41a && k <= 0x1d433) return String.fromCharCode(97 + k - 0x1d41a)
  if (k >= 0x1d7ce && k <= 0x1d7d7) return String.fromCharCode(48 + k - 0x1d7ce)
  return null
}

// Unités après un nombre (« 9,81 m·s⁻² ») : composées en romain (\mathrm), séparées par une espace fine.
const UNITE = '(?:mm|cm|km|kg|Hz|Pa|m|s|g|N|J|W|K|A|V)[⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹]*'
const RE_UNITE = new RegExp(`(\\d)\\s+(${UNITE}(?:·${UNITE})*)(?![\\p{L}\\p{N}])`, 'gu')
const DEBUT_UNITE = '\u0001', FIN_UNITE = '\u0002', FRACTION = '\u0003'

/** Convertit un morceau de formule unicode (sans fraction) en LaTeX. */
function convertir(s: string): string {
  const c = [...s]
  let r = ''
  let i = 0
  while (i < c.length) {
    const x = c[i]!
    if (x === DEBUT_UNITE) {
      r += '\\,\\mathrm{'
      i++
      continue
    }
    if (x === FIN_UNITE) {
      r += '}'
      i++
      continue
    }
    if (INDICES[x] !== undefined) {
      let t = ''
      while (i < c.length && INDICES[c[i]!] !== undefined) t += INDICES[c[i++]!]
      r += `_{${t}}`
      continue
    }
    if (EXPOSANTS[x] !== undefined) {
      let t = ''
      while (i < c.length && EXPOSANTS[c[i]!] !== undefined) t += EXPOSANTS[c[i++]!]
      r += `^{${t}}`
      continue
    }
    if (x === '_' || x === '^') {
      // `_x`, `_ext`, `_{…}` : un mot de plusieurs lettres en indice est droit.
      i++
      let t = ''
      if (c[i] === '{') {
        let prof = 1
        i++
        while (i < c.length && prof > 0) {
          if (c[i] === '{') prof++
          else if (c[i] === '}') prof--
          if (prof > 0) t += c[i]
          i++
        }
      } else {
        while (i < c.length && /[\p{L}\p{N}]/u.test(c[i]!) && INDICES[c[i]!] === undefined) t += c[i++]
      }
      r += `${x}{${/^[A-Za-z]{2,}$/.test(t) ? `\\mathrm{${t}}` : convertir(t)}}`
      continue
    }
    const grasse = lettreGrasse(x)
    if (grasse) {
      r += `\\mathbf{${grasse}}`
      i++
      continue
    }
    if (GREC[x]) {
      r += `\\${GREC[x]} `
      i++
      continue
    }
    if (/\d/.test(x)) {
      // Nombre, virgule décimale « 9{,}81 ».
      let t = ''
      while (i < c.length) {
        const y = c[i]!
        if (/\d/.test(y)) t += y
        else if (y === ',' && /\d/.test(c[i + 1] ?? '')) t += '{,}'
        else break
        i++
      }
      r += t
      continue
    }
    if (/[A-Za-z]/.test(x)) {
      let mot = ''
      while (i < c.length && /[A-Za-z]/.test(c[i]!)) mot += c[i++]
      const suivant = c[i] ?? ''
      if (mot.length === 1) {
        // « d » différentiel collé à une variable : droit.
        const variable = !!suivant && (/[A-Za-z]/.test(suivant) || !!lettreGrasse(suivant) || !!GREC[suivant])
        r += mot === 'd' && variable ? '\\mathrm{d}' : mot
      } else if (FONCTIONS_TEX.has(mot)) r += `\\${mot} `
      else if (MOTS_DROITS.has(mot)) r += `\\mathrm{${mot}}`
      else if (/^d[A-Za-z]$/.test(mot)) r += `\\mathrm{d}${mot[1]}`
      else if (LIAISONS.has(mot) || PETITS_MOTS.has(mot) || mot.length > 2) r += `\\ \\text{${mot}}\\ `
      else r += mot
      continue
    }
    if (x === ',' || x === ';') {
      r += `${x}\\ `
      i++
      continue
    }
    if (x === '{' || x === '}') {
      r += `\\${x}`
      i++
      continue
    }
    r += SIGNES[x] ?? x
    i++
  }
  return r
}

interface MorceauTex {
  t: string
  genre: 'atome' | 'groupe' | 'op' | 'barre' | 'espace'
}
const OPS_TEX = new Set(['=', '≈', '≃', '≠', '<', '>', '≤', '≥', '→', '∝', '≡', '⇒', '+', '−', '-', '±', '∓', '·', '×', ',', ';', ':'])

function morceauxTex(s: string): MorceauTex[] {
  const c = [...s]
  const r: MorceauTex[] = []
  let i = 0
  let atome = ''
  let dansUnite = false
  const fin = () => {
    if (atome) r.push({ t: atome, genre: 'atome' })
    atome = ''
  }
  while (i < c.length) {
    const x = c[i]!
    if (x === DEBUT_UNITE) dansUnite = true
    if (x === FIN_UNITE) dansUnite = false
    if (x === '(') {
      fin()
      let prof = 0, t = ''
      while (i < c.length) {
        const y = c[i]!
        if (y === '(') prof++
        else if (y === ')') prof--
        t += y
        i++
        if (prof === 0) break
      }
      r.push({ t, genre: 'groupe' })
      continue
    }
    // Virgule décimale et points des unités : partie de l'atome.
    const decimale = x === ',' && /\d/.test(c[i - 1] ?? '') && /\d/.test(c[i + 1] ?? '')
    if (x === '/') {
      fin()
      r.push({ t: '/', genre: 'barre' })
    } else if (/\s/.test(x)) {
      fin()
      if (r[r.length - 1]?.genre !== 'espace') r.push({ t: ' ', genre: 'espace' })
    } else if (OPS_TEX.has(x) && !decimale && !dansUnite) {
      fin()
      r.push({ t: x, genre: 'op' })
    } else atome += x
    i++
  }
  fin()
  return r
}

function composerTex(s: string): string {
  const m = morceauxTex(s)
  const tex = (x: MorceauTex): string => {
    if (x.genre === 'groupe') {
      const ferme = x.t.endsWith(')')
      return `\\left(${composerTex(ferme ? x.t.slice(1, -1) : x.t.slice(1))}${ferme ? '\\right)' : '\\right.'}`
    }
    if (x.genre === 'espace') return ' '
    if (x.t.startsWith(FRACTION)) return x.t.slice(1)
    return convertir(x.t)
  }
  const interieur = (x: MorceauTex) => (x.genre === 'groupe' && x.t.endsWith(')') ? composerTex(x.t.slice(1, -1)) : tex(x))
  const pile: MorceauTex[] = []
  for (let k = 0; k < m.length; k++) {
    const x = m[k]!
    if (x.genre !== 'barre') {
      pile.push(x)
      continue
    }
    // Numérateur : atomes et groupes juxtaposés à gauche ; dénominateur : l'atome ou le groupe suivant.
    let a = pile.length
    while (a > 0 && pile[a - 1]!.genre === 'espace') a--
    const finNum = a
    while (a > 0 && (pile[a - 1]!.genre === 'atome' || pile[a - 1]!.genre === 'groupe' || pile[a - 1]!.genre === 'espace')) a--
    while (a < finNum && pile[a]!.genre === 'espace') a++
    let q = k + 1
    while (q < m.length && m[q]!.genre === 'espace') q++
    const den = m[q]
    const num = pile.slice(a, finNum)
    if (!num.length || !den || (den.genre !== 'atome' && den.genre !== 'groupe')) {
      pile.push(x)
      continue
    }
    pile.splice(a)
    const numTex = num.length === 1 ? interieur(num[0]!) : num.map(tex).join('')
    pile.push({ t: `${FRACTION}\\frac{${numTex}}{${interieur(den)}}`, genre: 'atome' })
    k = q
  }
  return pile.map((x) => (x.genre === 'barre' ? '/' : tex(x))).join('').replace(/\s+/g, ' ').trim()
}

/** Formule unicode (« h₁ / h₂ = α / (1 − α − β) ») → LaTeX (« \frac{h_{1}}{h_{2}} = \frac{\alpha}{1-\alpha-\beta} »). */
export function enLatex(formule: string): string {
  return composerTex(formule.replace(RE_UNITE, `$1${DEBUT_UNITE}$2${FIN_UNITE}`))
}

// ─── Évaluateur (lois à tracer) ──────────────────────────────────────────────

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'sym'; s: string }
  | { k: 'neg'; a: Expr }
  | { k: 'pow'; a: Expr; n: number }
  | { k: 'op'; o: '+' | '-' | '*' | '/'; a: Expr; b: Expr }

type JetonE = { t: 'num'; v: number } | { t: 'sym'; s: string } | { t: 'pow'; n: number } | { t: 'op'; o: string } | { t: '(' } | { t: ')' }

const RE_SYMBOLE = /^(?:[A-Za-z]|[α-ωΑ-Ωϑϕϵ])[′″]*(?:[₀-₉ₐ-ₜ]+|_\{[^}]*\}|_[\p{L}\p{N}]+)?/u

function jetonsExpr(s: string): JetonE[] | null {
  const r: JetonE[] = []
  const t = s.replace(/\s+/g, ' ')
  let i = 0
  while (i < t.length) {
    const x = t[i]!
    const reste = t.slice(i)
    if (x === ' ') {
      i++
      continue
    }
    const nombre = /^\d+(?:[.,]\d+)?/.exec(reste)
    if (nombre) {
      r.push({ t: 'num', v: Number(nombre[0].replace(',', '.')) })
      i += nombre[0].length
      continue
    }
    const exp = /^[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/.exec(reste)
    if (exp) {
      r.push({ t: 'pow', n: Number([...exp[0]].map((c) => EXPOSANTS[c]).join('')) })
      i += exp[0].length
      continue
    }
    const cp = String.fromCodePoint(t.codePointAt(i)!)
    if (lettreGrasse(cp)) {
      r.push({ t: 'sym', s: cp })
      i += cp.length
      continue
    }
    const sym = RE_SYMBOLE.exec(reste)
    if (sym) {
      r.push({ t: 'sym', s: sym[0] })
      i += sym[0].length
      continue
    }
    if (x === '(' || x === ')') {
      r.push({ t: x })
      i++
      continue
    }
    if ('+-−·×*/'.includes(x)) {
      r.push({ t: 'op', o: x === '−' ? '-' : x === '·' || x === '×' ? '*' : x })
      i++
      continue
    }
    return null
  }
  return r
}

/** Analyse une expression unicode (« g h₂ / (1 − α − β) ») ; null si elle sort de l'arithmétique simple. */
export function analyserExpr(s: string): Expr | null {
  const J0 = jetonsExpr(s)
  if (!J0 || !J0.length) return null
  const J: JetonE[] = J0
  let i = 0
  const primaire = (): Expr | null => {
    const j = J[i]
    if (!j) return null
    if (j.t === 'num') {
      i++
      return { k: 'num', v: j.v }
    }
    if (j.t === 'sym') {
      i++
      return { k: 'sym', s: j.s }
    }
    if (j.t === '(') {
      i++
      const e = somme()
      if (!e || J[i]?.t !== ')') return null
      i++
      return e
    }
    return null
  }
  const puissance = (): Expr | null => {
    let e = primaire()
    for (let j = J[i]; e && j?.t === 'pow'; j = J[i]) {
      e = { k: 'pow', a: e, n: j.n }
      i++
    }
    return e
  }
  const unaire = (): Expr | null => {
    const j = J[i]
    if (j?.t === 'op' && j.o === '-') {
      i++
      const a = unaire()
      return a && { k: 'neg', a }
    }
    return puissance()
  }
  const produit = (): Expr | null => {
    let e = unaire()
    while (e) {
      const j = J[i]
      if (j?.t === 'op' && (j.o === '*' || j.o === '/')) {
        i++
        const b = unaire()
        if (!b) return null
        e = { k: 'op', o: j.o, a: e, b }
      } else if (j && (j.t === 'num' || j.t === 'sym' || j.t === '(')) {
        const b = unaire()
        if (!b) return null
        e = { k: 'op', o: '*', a: e, b }
      } else break
    }
    return e
  }
  function somme(): Expr | null {
    let e = produit()
    while (e) {
      const j = J[i]
      if (j?.t === 'op' && (j.o === '+' || j.o === '-')) {
        i++
        const b = produit()
        if (!b) return null
        e = { k: 'op', o: j.o, a: e, b }
      } else break
    }
    return e
  }
  const e = somme()
  return e && i === J.length ? e : null
}

export function symbolesExpr(e: Expr, r = new Set<string>()): Set<string> {
  if (e.k === 'sym') r.add(e.s)
  else if (e.k === 'neg' || e.k === 'pow') symbolesExpr(e.a, r)
  else if (e.k === 'op') {
    symbolesExpr(e.a, r)
    symbolesExpr(e.b, r)
  }
  return r
}

export function evaluer(e: Expr, env: (s: string) => number): number {
  switch (e.k) {
    case 'num':
      return e.v
    case 'sym':
      return env(e.s)
    case 'neg':
      return -evaluer(e.a, env)
    case 'pow':
      return evaluer(e.a, env) ** e.n
    case 'op': {
      const a = evaluer(e.a, env), b = evaluer(e.b, env)
      return e.o === '+' ? a + b : e.o === '-' ? a - b : e.o === '*' ? a * b : a / b
    }
  }
}

const EXPOSANT_DE: Record<string, string> = Object.fromEntries(Object.entries(EXPOSANTS).map(([k, v]) => [v, k]))

/** Écriture canonique d'une expression simple (clé de comparaison : « v² », « h₁ »). */
export function texteExpr(e: Expr): string {
  if (e.k === 'sym') return e.s
  if (e.k === 'num') return String(e.v)
  if (e.k === 'pow') return texteExpr(e.a) + [...String(e.n)].map((c) => EXPOSANT_DE[c] ?? c).join('')
  if (e.k === 'neg') return `−${texteExpr(e.a)}`
  return `${texteExpr(e.a)} ${e.o} ${texteExpr(e.b)}`
}

/**
 * Loi traçable : « Y / X = f(paramètres) » (rapport : Y = X · f) ou « Y = f(X, paramètres) » (explicite),
 * Y étant un symbole ou une puissance de symbole. La variable X d'une loi explicite est choisie plus tard :
 * le seul symbole de f sans valeur connue.
 */
export interface Loi {
  formule: string
  forme: 'rapport' | 'explicite'
  y: string
  /** Variable en abscisse (rapport) ; null pour une loi explicite. */
  x: string | null
  droite: Expr
}

export function analyserLoi(formule: string): Loi | null {
  const m = /^(.+?)\s(=|≈)\s(.+)$/.exec(formule)
  if (!m) return null
  const g = analyserExpr(m[1]!), d = analyserExpr(m[3]!)
  if (!g || !d) return null
  const droite = symbolesExpr(d)
  if (g.k === 'op' && g.o === '/' && g.a.k === 'sym' && g.b.k === 'sym') {
    if (droite.has(g.b.s) || droite.has(g.a.s)) return null
    return { formule, forme: 'rapport', y: g.a.s, x: g.b.s, droite: d }
  }
  const base = g.k === 'sym' ? g.s : g.k === 'pow' && g.a.k === 'sym' ? g.a.s : null
  if (base && !droite.has(base)) return { formule, forme: 'explicite', y: texteExpr(g), x: null, droite: d }
  return null
}

// ─── Valeurs numériques des énoncés ──────────────────────────────────────────

export interface Valeur {
  symbole: string
  valeur: number
  /** Incertitude (±), 0 si non donnée. */
  sigma: number
  /** Vrai si la valeur est écrite entre parenthèses (rappel, variante). */
  aparte: boolean
}

export interface PenteDeclaree {
  y: string
  x: string
  valeur: number
  sigma: number
}

const SYM = '(?:[A-Za-z]|[α-ωΑ-Ω])′*(?:[₀-₉ₐ-ₜ]+)?'
const NB = '(\\d+(?:,\\d+)?)'
const RE_VALEUR = new RegExp(
  `(?<![\\p{L}\\p{N}_′])(?<![-−+/·×*]\\s*)(${SYM})\\s*(?:=|≈)\\s*([-−]?)${NB}(?:\\s*±\\s*${NB})?(?![\\d,]*\\d|\\s*[·×/*+−-]\\s*[\\p{L}\\d(])`,
  'gu',
)
const RE_RAPPORT = new RegExp(`(?<![\\p{L}\\p{N}_])(${SYM})\\s*/\\s*(${SYM})\\s*(?:=|≈)\\s*${NB}(?:\\s*±\\s*${NB})?`, 'gu')
const RE_PENTE = new RegExp(`[Pp]ente de (${SYM}[⁰¹²³⁴⁵⁶⁷⁸⁹]*) contre (${SYM}[⁰¹²³⁴⁵⁶⁷⁸⁹]*)\\s*:\\s*${NB}(?:\\s*±\\s*${NB})?`, 'gu')
const nombreFr = (s: string | undefined) => (s ? Number(s.replace(',', '.')) : 0)

/** Profondeur de parenthèses à chaque position (unités UTF-16) du texte. */
function dansParentheses(texte: string): (k: number) => boolean {
  const prof = new Uint8Array(texte.length + 1)
  let p = 0
  for (let k = 0; k < texte.length; k++) {
    if (texte[k] === '(') p++
    prof[k] = p
    if (texte[k] === ')') p = Math.max(0, p - 1)
  }
  return (k) => prof[k]! > 0
}

/** Valeurs « symbole = nombre ± σ » d'un énoncé, dans l'ordre du texte (les rapports « Y / X = … » exclus). */
export function extraireValeurs(texte: string): Valeur[] {
  const r: Valeur[] = []
  const dedans = dansParentheses(texte)
  for (const m of texte.matchAll(RE_VALEUR)) {
    const signe = m[2] ? -1 : 1
    r.push({ symbole: m[1]!, valeur: signe * nombreFr(m[3]), sigma: nombreFr(m[4]), aparte: dedans(m.index!) })
  }
  return r
}

/** Pentes déclarées : « h₁ / h₂ = 0,13 ± 0,03 », « pente de v² contre h₂ : 11,4 ± 0,6 ». */
export function extrairePentes(texte: string): PenteDeclaree[] {
  const r: PenteDeclaree[] = []
  for (const m of texte.matchAll(RE_RAPPORT)) r.push({ y: m[1]!, x: m[2]!, valeur: nombreFr(m[3]), sigma: nombreFr(m[4]) })
  for (const m of texte.matchAll(RE_PENTE)) r.push({ y: m[1]!, x: m[2]!, valeur: nombreFr(m[3]), sigma: nombreFr(m[4]) })
  return r
}

/** Nombre au format français (virgule décimale), `n` chiffres significatifs utiles. */
export function nombreFrancais(v: number, decimales: number): string {
  return v.toFixed(decimales).replace('-', '−').replace('.', ',')
}
