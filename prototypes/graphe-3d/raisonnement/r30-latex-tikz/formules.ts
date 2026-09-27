// R30 · Extraction des formules d'un énoncé écrit en texte Unicode, et rendu KaTeX.
//
// Les énoncés d'Atlas sont du texte français où les formules sont tapées en Unicode
// (« T₀ = (1 − α) λ v² », « h₁ / h₂ = α / (1 − α − β) »). La règle est générique (rien n'est codé
// pour un jeu) :
//
//  1. Découpage en mots (espaces). Un mot est « mathématique » s'il n'est fait que de caractères
//     mathématiques (lettres latines, chiffres, grec, indices / exposants Unicode, lettres grasses
//     mathématiques 𝐩, opérateurs = + − / · × ± ≈ ∝ < > ≤ ≥ → ∂, parenthèses, prime ′, « _ »), sans
//     accent ni apostrophe, dont les suites de lettres latines ont au plus 2 lettres (sauf après « _ »
//     ou fonction usuelle sin, exp…), et qui n'est pas un mot outil français (le, la, de, et, en, si…).
//  2. Une suite de mots mathématiques forme une expression. Elle est coupée par une ponctuation finale
//     (« v², soit » : la virgule reste du texte) et par une parenthèse ouvrante juxtaposée sans
//     opérateur (« λ v² (β = 0 » : deux expressions). Les opérateurs en bout de suite sont rendus au texte.
//  3. Expression « relationnelle » (contient = ≈ ∝ < > ≤ ≥ ≠ → et au moins une variable) : c'est une
//     formule, rendue en mode mathématique ; en bloc (formule centrée), ce sont elles qu'on affiche.
//     Expression à opérateur (+ − · × / ±) avec une variable : mathématique en ligne. Sinon, seul un
//     mot « symbolique » (grec, indice, exposant, gras, prime…) passe en mathématique, seul.
//  4. Conversion vers LaTeX : grec → \alpha…, Σ → \sum, indices / exposants groupés (_{0}, ^{-2}),
//     gras mathématique → \mathbf{p}, ajourées / rondes → \mathbb / \mathcal, indices de plus d'une lettre en romain (_{\mathrm{ext}}),
//     virgule décimale protégée (0{,}10), unité après un nombre en romain (9{,}81\,\mathrm{m\cdot s^{-2}}),
//     et, en bloc seulement, « A / B » → \frac{A}{B} (A et B : un mot ou un groupe parenthésé).

// ─── Tables ──────────────────────────────────────────────────────────────────

const INDICES: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p',
  'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ⱼ': 'j', 'ᵣ': 'r', 'ᵤ': 'u', 'ᵥ': 'v', '₊': '+', '₋': '-', '₌': '=',
}
const EXPOSANTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', 'ⁿ': 'n', 'ⁱ': 'i', 'ᵀ': 'T',
}
const GRECS: Record<string, string> = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ζ: '\\zeta', η: '\\eta',
  θ: '\\theta', ι: '\\iota', κ: '\\kappa', λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi',
  ρ: '\\rho', σ: '\\sigma', τ: '\\tau', υ: '\\upsilon', φ: '\\varphi', ϕ: '\\phi', χ: '\\chi', ψ: '\\psi',
  ω: '\\omega', Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi', Π: '\\Pi',
  Σ: '\\sum', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
}
const SYMBOLES: Record<string, string> = {
  '−': '-', '·': '\\cdot', '×': '\\times', '±': '\\pm', '≈': '\\approx', '∝': '\\propto', '≤': '\\leq',
  '≥': '\\geq', '≠': '\\neq', '→': '\\to', '∂': '\\partial', '∞': '\\infty', '∇': '\\nabla', '∑': '\\sum',
  '∫': '\\int', '√': '\\sqrt', '…': '\\ldots', '∈': '\\in', '⊂': '\\subset', '′': "'", '″': "''",
  '⟨': '\\langle', '⟩': '\\rangle', '∀': '\\forall', '∃': '\\exists', '‖': '\\|', '∼': '\\sim',
  '½': '\\tfrac{1}{2}', '∘': '\\circ', '⊗': '\\otimes', '∪': '\\cup', '∩': '\\cap', '∉': '\\notin',
  'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}', 'ℙ': '\\mathbb{P}',
}
const RELATIONS = new Set(['=', '≈', '∝', '<', '>', '≤', '≥', '≠', '→', '∼', '∈'])
const OPERATEURS = new Set(['+', '−', '-', '/', '·', '×', '±', '∂', '∫', '∑', '∘', '⊗'])
const FONCTIONS = new Set(['sin', 'cos', 'tan', 'exp', 'log', 'ln', 'max', 'min', 'sup', 'inf', 'lim', 'det', 'tr'])
/** Mots outils français de une ou deux lettres (ou courts) qui ne sont jamais des variables. */
const MOTS_OUTILS = new Set([
  'le', 'la', 'les', 'de', 'des', 'du', 'et', 'en', 'un', 'une', 'si', 'on', 'au', 'aux', 'ne', 'il', 'se',
  'sa', 'ou', 'ce', 'ces', 'est', 'par', 'sur', 'ni', 'nous', 'avec', 'sans', 'pour', 'dans', 'soit',
])

// ─── Caractères ──────────────────────────────────────────────────────────────

/** Lettre grasse mathématique (𝐀…𝐳, 𝟎…𝟗) → caractère ASCII, sinon null. */
function grasVersAscii(cp: number): string | null {
  if (cp >= 0x1d400 && cp <= 0x1d419) return String.fromCharCode(65 + cp - 0x1d400)
  if (cp >= 0x1d41a && cp <= 0x1d433) return String.fromCharCode(97 + cp - 0x1d41a)
  if (cp >= 0x1d7ce && cp <= 0x1d7d7) return String.fromCharCode(48 + cp - 0x1d7ce)
  return null
}

/** Autres alphabets mathématiques : ajourées 𝔸…𝕫 (\mathbb), rondes 𝒜… et 𝓐… (\mathcal). */
function alphabetVersLatex(cp: number): string | null {
  if (cp >= 0x1d538 && cp <= 0x1d551) return `\\mathbb{${String.fromCharCode(65 + cp - 0x1d538)}}`
  if (cp >= 0x1d49c && cp <= 0x1d4b5) return `\\mathcal{${String.fromCharCode(65 + cp - 0x1d49c)}}`
  if (cp >= 0x1d4d0 && cp <= 0x1d4e9) return `\\mathcal{${String.fromCharCode(65 + cp - 0x1d4d0)}}`
  return null
}

/** Lettre d'un alphabet mathématique (grasse, ajourée, ronde). */
const estLettreSpeciale = (c: string) => grasVersAscii(c.codePointAt(0)!) !== null || alphabetVersLatex(c.codePointAt(0)!) !== null

const estLettreAscii = (c: string) => /^[A-Za-z]$/.test(c)
const estGrec = (c: string) => c in GRECS
const estSymbolique = (c: string) =>
  estGrec(c) || c in INDICES || c in EXPOSANTS || c in SYMBOLES || c === '_' || c === '^' || estLettreSpeciale(c)
const estCaractereMath = (c: string) =>
  estLettreAscii(c) || /^[0-9]$/.test(c) || estSymbolique(c) || '=+-/<>()[]{},.|*'.includes(c) || RELATIONS.has(c)

// ─── Mots ────────────────────────────────────────────────────────────────────

interface Mot {
  texte: string
  /** Partie mathématique (sans ponctuation finale). */
  coeur: string
  /** Ponctuation finale rendue au texte (« , » « ; » « : » « . »). */
  fin: string
  math: boolean
  symbolique: boolean
  variable: boolean
  relation: boolean
  operateur: boolean
}

function analyserMot(texte: string): Mot {
  const m = /^(.*?)([,;:.!?]*)$/u.exec(texte)!
  let coeur = m[1]!
  let fin = m[2]!
  // « 9,81 » garde sa virgule ; « v², » la rend au texte.
  if (!coeur) {
    coeur = ''
    fin = texte
  }
  const chars = [...coeur]
  let math = chars.length > 0 && !/[’'«»]/.test(coeur) && !MOTS_OUTILS.has(coeur.toLowerCase())
  if (math) math = chars.every((c) => estCaractereMath(c))
  if (math) {
    // Suites de lettres latines : au plus 2 lettres, sauf après « _ » ou fonction usuelle.
    for (const r of coeur.matchAll(/[A-Za-z]+/g)) {
      const avant = coeur[r.index! - 1]
      if (r[0].length > 2 && avant !== '_' && !FONCTIONS.has(r[0])) math = false
    }
  }
  const symbolique = math && chars.some((c) => estSymbolique(c) || RELATIONS.has(c) || OPERATEURS.has(c))
  const variable = math && chars.some((c) => estLettreAscii(c) || estGrec(c) || estLettreSpeciale(c))
  const relation = math && chars.some((c) => RELATIONS.has(c))
  const operateur = math && chars.some((c) => OPERATEURS.has(c) || c === '−')
  return { texte, coeur, fin, math, symbolique, variable, relation, operateur }
}

/**
 * Variable isolée : mot symbolique contenant une lettre (α, h₁, T′), ou lettre latine seule autre que
 * « a » et « y » (mots français).
 */
const estVariable = (m: Mot) => m.math && m.variable && (m.symbolique || (/^[A-Za-z]$/.test(m.coeur) && !/^[aAyY]$/.test(m.coeur)))

/** Mot qui n'est qu'un opérateur ou une relation (« = », « − », « / »). */
const estOperateurSeul = (m: Mot) => m.math && [...m.coeur].every((c) => RELATIONS.has(c) || OPERATEURS.has(c))

// ─── Segmentation ────────────────────────────────────────────────────────────

export interface Segment {
  genre: 'texte' | 'math'
  valeur: string
  /** Expression relationnelle (formule candidate à l'affichage en bloc). */
  relation?: boolean
}

/** Vrai si la parenthèse ouvrante initiale se referme au dernier caractère. */
function enveloppe(e: string): boolean {
  let n = 0
  for (let k = 0; k < e.length; k++) {
    if (e[k] === '(') n++
    else if (e[k] === ')') n--
    if (n === 0 && k < e.length - 1) return false
  }
  return n === 0
}

/** Retire les parenthèses non appariées aux extrémités d'une expression. */
function equilibrer(expr: string): { expr: string; avant: string; apres: string } {
  let e = expr, avant = '', apres = ''
  const compte = (s: string) => [...s].reduce((n, c) => n + (c === '(' ? 1 : c === ')' ? -1 : 0), 0)
  while (compte(e) > 0 && e.startsWith('(')) {
    avant += '('
    e = e.slice(1)
  }
  while (compte(e) < 0 && e.endsWith(')')) {
    apres = ')' + apres
    e = e.slice(0, -1)
  }
  // Parenthèses qui enveloppent toute l'expression : typographiquement du texte.
  while (e.startsWith('(') && e.endsWith(')') && enveloppe(e)) {
    avant += '('
    apres = ')' + apres
    e = e.slice(1, -1)
  }
  return { expr: e, avant, apres }
}

/** Découpe un texte en segments texte / mathématique (règles en tête de fichier). */
export function segmenter(texte: string): Segment[] {
  const morceaux = texte.split(/(\s+)/)
  const segs: Segment[] = []
  const pousserTexte = (t: string) => {
    if (!t) return
    const d = segs[segs.length - 1]
    if (d?.genre === 'texte') d.valeur += t
    else segs.push({ genre: 'texte', valeur: t })
  }
  const pousserMath = (e: string, relation: boolean) => {
    const { expr, avant, apres } = equilibrer(e.trim())
    pousserTexte(avant)
    if (expr) segs.push({ genre: 'math', valeur: expr, relation })
    pousserTexte(apres)
  }
  // Suite de mots mathématiques en cours (indices dans `morceaux`).
  let suite: Mot[] = []
  const vider = () => {
    if (!suite.length) return
    // Opérateurs en bout de suite : rendus au texte.
    let debut = 0, fin = suite.length
    while (debut < fin && estOperateurSeul(suite[debut]!) && !suite[debut]!.coeur.startsWith('∂')) debut++
    while (fin > debut && estOperateurSeul(suite[fin - 1]!)) fin--
    const tete = suite.slice(0, debut), corps = suite.slice(debut, fin), queue = suite.slice(fin)
    for (const m of tete) pousserTexte(m.texte + ' ')
    const aVariable = corps.some((m) => m.variable)
    const relation = aVariable && corps.some((m) => m.relation)
    const operation = aVariable && corps.length > 1 && corps.some((m) => m.operateur)
    if (corps.length && (relation || operation)) {
      pousserMath(corps.map((m) => m.coeur).join(' '), relation)
      pousserTexte(corps[corps.length - 1]!.fin)
    } else {
      // Mots isolés ; des variables juxtaposées (« λ v² ») forment un seul produit.
      let k = 0
      while (k < corps.length) {
        const m = corps[k]!
        if (!estVariable(m)) {
          pousserTexte(m.coeur + m.fin)
          if (++k < corps.length) pousserTexte(' ')
          continue
        }
        let j = k
        while (j + 1 < corps.length && !corps[j]!.fin && estVariable(corps[j + 1]!)) j++
        pousserMath(corps.slice(k, j + 1).map((x) => x.coeur).join(' '), false)
        pousserTexte(corps[j]!.fin)
        k = j + 1
        if (k < corps.length) pousserTexte(' ')
      }
    }
    for (const m of queue) pousserTexte(' ' + m.texte)
    suite = []
  }
  for (const morceau of morceaux) {
    if (!morceau) continue
    if (/^\s+$/.test(morceau)) {
      if (suite.length) continue // l'espace interne d'une suite est reconstruit par join(' ')
      pousserTexte(morceau)
      continue
    }
    const m = analyserMot(morceau)
    if (!m.math) {
      if (suite.length) {
        vider()
        pousserTexte(' ')
      }
      pousserTexte(morceau)
      continue
    }
    // Parenthèse ouvrante juxtaposée sans opérateur : nouvelle expression.
    const prec = suite[suite.length - 1]
    if (prec && m.coeur.startsWith('(') && !estOperateurSeul(prec)) {
      vider()
      pousserTexte(' ')
    }
    suite.push(m)
    // Ponctuation finale : l'expression s'arrête là, sauf virgule ou point-virgule dans une parenthèse
    // encore ouverte (« (Ω, 𝓕, ℙ) », « W^{1,∞}(𝕋^d ; ℝ^d) »).
    if (m.fin) {
      const ouvertes = [...suite.map((x) => x.coeur).join('')].reduce((n, c) => n + (c === '(' ? 1 : c === ')' ? -1 : 0), 0)
      if (ouvertes > 0 && /^[,;]$/.test(m.fin)) {
        m.coeur += m.fin
        m.fin = ''
      } else vider()
    }
  }
  vider()
  // Espaces : une suite vidée en fin de texte n'a pas d'espace après ; on normalise les doubles espaces.
  for (const s of segs) if (s.genre === 'texte') s.valeur = s.valeur.replace(/ {2,}/g, ' ')
  return segs
}

/** Formules relationnelles d'un énoncé (dans l'ordre), candidates à l'affichage centré. */
export function formulesDe(texte: string): string[] {
  return segmenter(texte).filter((s) => s.genre === 'math' && s.relation).map((s) => s.valeur)
}

// ─── Conversion vers LaTeX ───────────────────────────────────────────────────

/** Fractions « A / B » (A, B : un mot ou un groupe parenthésé) → \frac{A}{B} (texte encore Unicode). */
function fractions(e: string): string {
  // Pas de fraction dans un groupe déjà en LaTeX (« ^{p/2} » reste tel quel).
  const op = String.raw`\([^()]*\)|[^\s()=≈∝<>≤≥≠→+−\-/,;±·\{\}\^]+`
  // Numérateur : un produit juxtaposé (« g h₂ / (1 − α − β) » → \frac{g h₂}{1 − α − β}).
  const re = new RegExp(String.raw`(?<![\{\^_])((?:${op})(?:\s+(?:${op}))*)\s*/\s*(${op})(?!\})`, 'gu')
  const nu = (s: string) => (s.startsWith('(') && s.endsWith(')') ? s.slice(1, -1) : s)
  return e.replace(re, (_t, a: string, b: string) => `\\frac{${nu(a)}}{${nu(b)}}`)
}

/** Expression Unicode → LaTeX (règles en tête de fichier). */
export function versLatex(expr: string, bloc = false): string {
  let e = expr
  // Unités après un nombre : « 9,81 m·s⁻² » → romain.
  e = e.replace(/(\d)\s+((?:[a-zA-Z]{1,3}[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]*)(?:·[a-zA-Z]{1,3}[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]*)+)(?=$|[\s,;.)])/gu, '$1\\,\\mathrm{$2}')
  if (bloc) e = fractions(e)
  let r = ''
  const chars = [...e]
  for (let k = 0; k < chars.length; k++) {
    const c = chars[k]!
    if (c in INDICES || c in EXPOSANTS) {
      const table = c in INDICES ? INDICES : EXPOSANTS
      let groupe = ''
      while (k < chars.length && chars[k]! in table) groupe += table[chars[k++]!]
      k--
      r += `${table === INDICES ? '_' : '^'}{${groupe}}`
      continue
    }
    const g = grasVersAscii(c.codePointAt(0)!)
    if (g) {
      r += `\\mathbf{${g}}`
      continue
    }
    const al = alphabetVersLatex(c.codePointAt(0)!)
    if (al) {
      r += al
      continue
    }
    const cmd = GRECS[c] ?? SYMBOLES[c]
    if (cmd !== undefined) {
      r += /^\\[a-zA-Z]+$/.test(cmd) ? `${cmd} ` : cmd
      continue
    }
    r += c
  }
  // Indices de plus d'une lettre : romains ; virgule décimale protégée.
  r = r.replace(/_([A-Za-z]{2,})/g, '_{\\mathrm{$1}}')
  r = r.replace(/(\d),(\d)/g, '$1{,}$2')
  // Fonctions usuelles en romain (\sup, \exp…).
  r = r.replace(/(?<![\\A-Za-z])(sin|cos|tan|exp|log|ln|max|min|sup|inf|lim|det)(?![A-Za-z])/g, '\\$1 ')
  return r.replace(/ {2,}/g, ' ').trim()
}

// ─── Rendu KaTeX ─────────────────────────────────────────────────────────────

interface KaTeX {
  renderToString(tex: string, options?: Record<string, unknown>): string
}
const katex = (): KaTeX | null => (window as unknown as { katex?: KaTeX }).katex ?? null

const cache = new Map<string, string>()

export function echapper(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Une expression en mode mathématique (HTML KaTeX ; repli : texte en italique). */
export function htmlMath(expr: string, bloc = false): string {
  const cle = `${bloc ? 'B' : 'L'}${expr}`
  const c = cache.get(cle)
  if (c !== undefined) return c
  const k = katex()
  const tex = versLatex(expr, bloc)
  const html = k
    ? k.renderToString(bloc ? `\\displaystyle ${tex}` : tex, { throwOnError: false, output: 'html', strict: 'ignore' })
    : `<i>${echapper(expr)}</i>`
  if (k) cache.set(cle, html)
  return html
}

/** Texte avec ses formules en ligne rendues. */
export function htmlTexte(texte: string): string {
  return segmenter(texte).map((s) => (s.genre === 'texte' ? echapper(s.valeur) : htmlMath(s.valeur))).join('')
}

/** Vrai si KaTeX est chargé. */
export const katexPret = () => katex() !== null
