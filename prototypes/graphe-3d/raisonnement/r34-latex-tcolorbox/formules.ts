// R34 · Formules : extraction depuis les énoncés (Unicode) et conversion en LaTeX pour KaTeX.
//
// Règle générique d'extraction (aucun identifiant ni énoncé particulier n'est codé en dur) :
//
//   1. Découpage en jetons (espaces). Ponctuation finale « . , ; : ! ? » = fin de proposition.
//   2. Un jeton est « mathématique » s'il contient un caractère mathématique fort (lettre grecque,
//      indice / exposant Unicode, alphanumérique mathématique 𝐩 𝔼 𝓕, opérateur ou relation, chiffre,
//      « _ ^ / | ») sans suite de 3 lettres latines hors indice ou fonction connue (sup, exp…), ou s'il
//      fait 1 ou 2 lettres latines et n'est pas un mot français court (de, la, en, et, si, a…).
//   3. Une formule est une suite maximale de jetons mathématiques, dans une même proposition, qui
//      contient une relation (= ≈ < > ≤ ≥ ≠ ∝ → ∼ ≡ ∈) avec un opérande de chaque côté.
//      - Elle ne peut pas commencer par une relation ; un « + » initial est retiré.
//      - Si elle finit sur une relation ou un opérateur, elle n'est gardée que si le mot suivant clôt
//        la proposition (« = constante ; » → « = \text{constante} ») ; sinon elle est incomplète : rejetée.
//      - Parenthèses : les parenthèses non appariées aux extrémités sont retirées ; si le reste n'est
//        pas équilibré, la formule est rejetée.
//   4. Deux formules séparées par un seul mot de liaison (soit, en, pour, et, donc, avec, si, où,
//      alors, donne), éventuellement après une virgule, sont fusionnées : A \quad\text{soit}\quad B.
//   5. Au plus deux formules par énoncé, affichées en mode display. Sans formule, l'énoncé est
//      composé en texte, chaque suite de jetons mathématiques en mode inline.
//
// Conversion Unicode → LaTeX : grec (Σ → \sum), indices / exposants Unicode → _{…} ^{…}, 𝐩 → \mathbf{p},
// 𝔼 → \mathbb{E}, 𝓕 → \mathcal{F}, virgule décimale → {,}, unités après un nombre → \mathrm{…},
// mots de 3 lettres et plus → \text{…}, fonctions → \sup, \exp… ; une barre « A / B » de premier niveau
// devient \frac{A}{B} (A : le produit qui précède jusqu'à l'opérateur précédent ; B : l'atome suivant,
// parenthèses retirées).

const GREC: Record<string, string> = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ϵ: '\\epsilon', ζ: '\\zeta', η: '\\eta',
  θ: '\\theta', ϑ: '\\vartheta', ι: '\\iota', κ: '\\kappa', λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi',
  ρ: '\\rho', σ: '\\sigma', ς: '\\varsigma', τ: '\\tau', υ: '\\upsilon', φ: '\\varphi', ϕ: '\\phi', χ: '\\chi',
  ψ: '\\psi', ω: '\\omega', Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi', Π: '\\Pi',
  Σ: '\\sum', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
}

const SYMBOLES: Record<string, string> = {
  '−': '-', '–': '-', '·': '\\cdot ', '⋅': '\\cdot ', '×': '\\times ', '±': '\\pm ', '∓': '\\mp ', '≈': '\\approx ',
  '≤': '\\leq ', '≥': '\\geq ', '≠': '\\neq ', '∝': '\\propto ', '→': '\\to ', '⇒': '\\Rightarrow ', '⇔': '\\Leftrightarrow ',
  '∼': '\\sim ', '≡': '\\equiv ', '∈': '\\in ', '∉': '\\notin ', '∞': '\\infty ', '∂': '\\partial ', '∫': '\\int ',
  '∑': '\\sum ', '∏': '\\prod ', '√': '\\sqrt ', '‖': '\\| ', '⟨': '\\langle ', '⟩': '\\rangle ', '½': '\\tfrac{1}{2}',
  '…': '\\dots ', '∇': '\\nabla ', '∀': '\\forall ', '∃': '\\exists ', '⊂': '\\subset ', '⊆': '\\subseteq ', '∪': '\\cup ',
  '∩': '\\cap ', '∘': '\\circ ', '′': "'", '″': "''", '∅': '\\emptyset ', 'ℓ': '\\ell ', '≪': '\\ll ', '≫': '\\gg ',
  '∗': '\\ast ', '⊗': '\\otimes ', '%': '\\%', '#': '\\#', '&': '\\&', '~': '\\sim ', '<': '<', '>': '>',
  'ℙ': '\\mathbb{P}', 'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}',
  'ℱ': '\\mathcal{F}', 'ℋ': '\\mathcal{H}', 'ℒ': '\\mathcal{L}', 'ℳ': '\\mathcal{M}', 'ℛ': '\\mathcal{R}', 'ℬ': '\\mathcal{B}',
  'ℰ': '\\mathcal{E}', '∣': '\\mid ', '∧': '\\wedge ', '∨': '\\vee ', '¬': '\\neg ',
}

const INDICES = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜᵢⱼᵣᵤᵥ'
const INDICES_EN = '0123456789+-=()aeoxhklmnpstijruv'
const EXPOSANTS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱᵖᵗᵏ'
const EXPOSANTS_EN = '0123456789+-=()nipt' + 'k'

const FONCTIONS = new Set(['sup', 'inf', 'max', 'min', 'exp', 'log', 'ln', 'sin', 'cos', 'tan', 'lim', 'det', 'dim', 'ker', 'arg', 'deg'])
const UNITES = new Set(['m', 's', 'kg', 'g', 'N', 'J', 'W', 'Hz', 'K', 'mm', 'cm', 'km', 'ms', 'Pa', 'rad', 'mol'])
const MOTS_COURTS = new Set(['a', 'à', 'de', 'du', 'la', 'le', 'les', 'en', 'et', 'ou', 'où', 'si', 'un', 'on', 'il', 'ne', 'se', 'sa', 'ce', 'au', 'l', 'd', 's', 'n', 'qu', 'ni', 'is', 'of', 'to', 'in', 'an', 'as', 'at', 'by', 'or', 'it'])
const LIAISONS = new Set(['soit', 'en', 'pour', 'et', 'donc', 'avec', 'si', 'où', 'alors', 'donne'])

const RELATIONS = new Set(['=', '≈', '<', '>', '≤', '≥', '≠', '∝', '→', '⇒', '∼', '≡', '∈'])
const OPERATEURS = new Set(['+', '−', '-', '±', '·', '×', '/', '⋅'])
/** Arrêts d'un opérande de fraction (premier niveau). */
const ARRETS = new Set([...RELATIONS, '+', '−', '±', ',', ';', ':'])

const FORT = /[²³¹ᵏᵖᵗͰ-Ͽ⁰-ₜᵢ-ᵪ′″←-⇿∀-⋿⟨⟩‖±·×½ℂℕℙℚℝℤℓℐ-ℳ\u{1D400}-\u{1D7FF}0-9=<>+_^|/−]/u
const LETTRES = /[A-Za-zÀ-ÖØ-öø-ÿ]/

// ─── Conversion ──────────────────────────────────────────────────────────────

/** Caractère alphanumérique mathématique (U+1D400…U+1D7FF) → LaTeX. */
function alphanumMath(cp: number): string {
  const base = String.fromCodePoint(cp).normalize('NFKC')
  const grec = GREC[base]
  if (cp >= 0x1d6a8 && cp <= 0x1d7c9) return grec ? (cp < 0x1d6e2 ? `\\boldsymbol{${grec}}` : grec) : base
  if (cp >= 0x1d400 && cp <= 0x1d433) return `\\mathbf{${base}}`
  if (cp >= 0x1d468 && cp <= 0x1d49b) return `\\boldsymbol{${base}}`
  if (cp >= 0x1d49c && cp <= 0x1d503) return /[A-Z]/.test(base) ? `\\mathcal{${base}}` : base
  if ((cp >= 0x1d504 && cp <= 0x1d537) || (cp >= 0x1d56c && cp <= 0x1d59f)) return `\\mathfrak{${base}}`
  if (cp >= 0x1d538 && cp <= 0x1d56b) return `\\mathbb{${base}}`
  if (cp >= 0x1d5a0 && cp <= 0x1d66f) return `\\mathsf{${base}}`
  if (cp >= 0x1d670 && cp <= 0x1d6a3) return `\\mathtt{${base}}`
  if (cp >= 0x1d7ce && cp <= 0x1d7d7) return `\\mathbf{${base}}`
  if (cp >= 0x1d7d8 && cp <= 0x1d7e1) return `\\mathbb{${base}}`
  return base
}

/** Indice de la parenthèse / accolade fermante correspondant à l'ouvrante en `k`. */
function fermante(cs: string[], k: number): number {
  const o = cs[k]!, f = o === '(' ? ')' : o === '[' ? ']' : o === '{' ? '}' : '⟩'
  let d = 0
  for (let i = k; i < cs.length; i++) {
    if (cs[i] === o) d++
    else if (cs[i] === f && --d === 0) return i
  }
  return -1
}

/** Conversion caractère par caractère (sans fractions). */
function caracteres(s: string): string {
  const cs = [...s]
  let out = ''
  let apresNombre = false
  // Deux indices (ou exposants) de suite : un groupe vide les sépare (« a_{x}{}_{y} »), sinon KaTeX refuse.
  const fin = { _: -1, '^': -1 }
  const attacher = (c: '_' | '^', contenu: string) => {
    if (out.length === fin[c]) out += '{}'
    out += `${c}{${contenu}}`
    fin[c] = out.length
  }
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k]!
    const cp = c.codePointAt(0)!
    let i = INDICES.indexOf(c)
    if (i >= 0) {
      let r = ''
      while (k < cs.length && (i = INDICES.indexOf(cs[k]!)) >= 0) { r += INDICES_EN[i]; k++ }
      k--
      attacher('_', r)
      continue
    }
    i = EXPOSANTS.indexOf(c)
    if (i >= 0) {
      let r = ''
      while (k < cs.length && (i = EXPOSANTS.indexOf(cs[k]!)) >= 0) { r += EXPOSANTS_EN[i]; k++ }
      k--
      attacher('^', r)
      continue
    }
    if (c === '_' || c === '^') {
      const n = cs[k + 1]
      if (n === '{') {
        const f = fermante(cs, k + 1)
        if (f > 0) {
          attacher(c, caracteres(cs.slice(k + 2, f).join('')))
          k = f
          continue
        }
      }
      let m = ''
      let j = k + 1
      while (j < cs.length && /[A-Za-z]/.test(cs[j]!)) m += cs[j++]
      if (m.length >= 2) {
        attacher(c, `\\mathrm{${m}}`)
        k = j - 1
      } else if (n !== undefined) {
        attacher(c, caracteres(n))
        k++
      }
      continue
    }
    if (/[0-9]/.test(c)) {
      let r = ''
      while (k < cs.length && (/[0-9]/.test(cs[k]!) || (cs[k] === ',' && /[0-9]/.test(cs[k + 1] ?? '')))) r += cs[k++] === ',' ? '{,}' : cs[k - 1]
      k--
      out += r
      apresNombre = true
      continue
    }
    if (LETTRES.test(c)) {
      // Unité après un nombre : « 9,81 m·s⁻² » → \mathrm{m\cdot s^{-2}}.
      if (apresNombre) {
        const reste = cs.slice(k).join('')
        const u = /^([A-Za-zμ]{1,3}(?:[·⋅][A-Za-zμ]{1,3})*)([⁻⁰¹²³⁴]*)(?=$|[\s,;.)])/.exec(reste)
        if (u && (u[1]!.includes('·') || u[1]!.includes('⋅') || UNITES.has(u[1]!))) {
          const corps = u[1]!.replace(/[·⋅]/g, '\\cdot ')
          out += `\\,\\mathrm{${corps}${u[2] ? caracteres(u[2]) : ''}}`
          k += [...u[0]].length - 1
          apresNombre = false
          continue
        }
      }
      let m = ''
      let j = k
      while (j < cs.length && LETTRES.test(cs[j]!)) m += cs[j++]
      k = j - 1
      apresNombre = false
      if (FONCTIONS.has(m)) out += `\\${m} `
      else if (m.length >= 3 || /[^A-Za-z]/.test(m)) out += `\\text{${m}}`
      else out += m
      continue
    }
    if (c !== ' ') apresNombre = false
    if (cp >= 0x1d400 && cp <= 0x1d7ff) out += alphanumMath(cp) + ' '
    else if (GREC[c]) out += GREC[c] + ' '
    else if (SYMBOLES[c] !== undefined) out += SYMBOLES[c]
    else if (c === '{') out += '\\{'
    else if (c === '}') out += '\\}'
    else if (c === '\\') out += '\\backslash '
    else out += c
  }
  return out
}

/** Barre de fraction de premier niveau (hors parenthèses, accolades, crochets). */
function barreHaute(cs: string[]): number {
  let d = 0
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k]!
    if (c === '(' || c === '{' || c === '[' || c === '⟨') d++
    else if (c === ')' || c === '}' || c === ']' || c === '⟩') d--
    else if (c === '/' && d === 0) return k
  }
  return -1
}

/** Retire une paire de parenthèses englobant tout le texte. */
function sansParentheses(s: string): string {
  const t = s.trim()
  const cs = [...t]
  if (cs[0] === '(' && fermante(cs, 0) === cs.length - 1) return cs.slice(1, -1).join('')
  return t
}

/** Unicode → LaTeX (mode mathématique). */
export function versLatex(s: string): string {
  const cs = [...s]
  const k = barreHaute(cs)
  if (k < 0) return caracteres(s)
  // Opérande gauche : produit qui précède, jusqu'à l'opérateur ou la relation précédente.
  let g = k - 1
  while (g >= 0 && cs[g] === ' ') g--
  let d = 0
  let debut = g + 1
  for (let i = g; i >= 0; i--) {
    const c = cs[i]!
    if (c === ')' || c === '}' || c === ']' || c === '⟩') d++
    else if (c === '(' || c === '{' || c === '[' || c === '⟨') {
      if (d === 0) break
      d--
    } else if (d === 0 && ARRETS.has(c)) break
    debut = i
  }
  // Opérande droit : un atome (groupe parenthésé ou suite sans espace), avec ses indices / exposants.
  let a = k + 1
  while (a < cs.length && cs[a] === ' ') a++
  let fin = a
  if (cs[a] === '(') {
    const f = fermante(cs, a)
    fin = f > 0 ? f + 1 : cs.length
    while (fin < cs.length && (INDICES.includes(cs[fin]!) || EXPOSANTS.includes(cs[fin]!) || cs[fin] === '′')) fin++
  } else {
    while (fin < cs.length && cs[fin] !== ' ' && !ARRETS.has(cs[fin]!) && cs[fin] !== '/' && cs[fin] !== ')' && cs[fin] !== ',') fin++
  }
  const gauche = cs.slice(debut, k).join('').trim()
  const droite = cs.slice(a, fin).join('').trim()
  if (!gauche || !droite) return caracteres(cs.slice(0, k).join('')) + '/' + versLatex(cs.slice(k + 1).join(''))
  return `${caracteres(cs.slice(0, debut).join(''))}\\frac{${versLatex(sansParentheses(gauche))}}{${versLatex(sansParentheses(droite))}}${versLatex(cs.slice(fin).join(''))}`
}

// ─── Extraction ──────────────────────────────────────────────────────────────

interface Jeton {
  brut: string
  /** Sans ponctuation finale. */
  corps: string
  /** Ponctuation finale (fin de proposition) : « , » « ; » « . » « : »… ou vide. */
  fin: string
  genre: 'mot' | 'math' | 'relation' | 'operateur' | 'vide'
}

function genreDe(t: string): Jeton['genre'] {
  if (!t) return 'vide'
  if (RELATIONS.has(t)) return 'relation'
  if (OPERATEURS.has(t)) return 'operateur'
  const nu = t.replace(/^[([«"]+|[)\]»"]+$/g, '')
  if (!nu) return 'vide'
  if (/[’']/.test(nu) && LETTRES.test(nu)) return 'mot'
  if (FORT.test(nu)) {
    // Suite de 3 lettres latines hors indice « _ext » et hors fonction : un mot (« c’est-à-dire »).
    const sansIndices = nu.replace(/[_^]\{[^}]*\}|[_^][A-Za-z]+/g, '')
    for (const m of sansIndices.match(/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/g) ?? []) if (!FONCTIONS.has(m)) return 'mot'
    return 'math'
  }
  if (/^[A-Za-z]{1,2}$/.test(nu) && !MOTS_COURTS.has(nu.toLowerCase())) return 'math'
  if (/^[A-Za-z]{3}$/.test(nu) && FONCTIONS.has(nu)) return 'math'
  return 'mot'
}

function jetons(texte: string): Jeton[] {
  // Un groupe entre accolades (« e^{C T} ») reste un seul jeton.
  const bruts: string[] = []
  for (const t of texte.split(/\s+/).filter(Boolean)) {
    const d = bruts[bruts.length - 1]
    if (d !== undefined && (d.match(/\{/g)?.length ?? 0) > (d.match(/\}/g)?.length ?? 0)) bruts[bruts.length - 1] = `${d} ${t}`
    else bruts.push(t)
  }
  return bruts.map((brut) => {
    // Ponctuation finale détachée (« 0,1 » garde sa virgule décimale ; « v², » la perd).
    const m = /^(.*?)([.,;:!?]*)$/u.exec(brut)!
    return { brut, corps: m[1]!, fin: m[2]!, genre: genreDe(m[1]!) }
  })
}

/** Équilibre les parenthèses aux extrémités ; null si le reste n'est pas équilibré. */
function equilibrer(s: string): string | null {
  let t = s.trim()
  for (let n = 0; n < 4; n++) {
    const cs = [...t]
    let d = 0, min = 0
    for (const c of cs) {
      if (c === '(') d++
      else if (c === ')') min = Math.min(min, --d)
    }
    if (d === 0 && min === 0) return sansParentheses(t)
    if (cs[0] === '(' && d > 0) t = cs.slice(1).join('').trim()
    else if (cs[cs.length - 1] === ')' && (d < 0 || min < 0)) t = cs.slice(0, -1).join('').trim()
    else return null
  }
  return null
}

/** Coupe une suite de jetons sur une parenthèse non appariée en son milieu (« v² (β = 0 pour… »). */
function scinder(js: Jeton[], debut: number, fin: number): [number, number][] {
  const pile: number[] = []
  for (let t = debut; t <= fin; t++) {
    for (const c of js[t]!.corps) {
      if (c === '(') pile.push(t)
      else if (c === ')') {
        if (pile.length) pile.pop()
        else if (t < fin) return [...scinder(js, debut, t), ...scinder(js, t + 1, fin)]
      }
    }
  }
  const t = pile[0]
  if (t !== undefined && t > debut) return [...scinder(js, debut, t - 1), ...scinder(js, t, fin)]
  return [[debut, fin]]
}

interface Formule {
  debut: number
  fin: number
  texte: string
}

const estLien = (j: Jeton) => j.genre === 'relation' || j.genre === 'operateur'
const mathematique = (j: Jeton | undefined) => !!j && j.genre !== 'mot' && j.genre !== 'vide'

/** Fin (indice) de la suite de jetons mathématiques commençant en k, dans la même proposition. */
function finDeSuite(js: Jeton[], k: number): number {
  let f = k
  while (f + 1 < js.length && !js[f]!.fin && mathematique(js[f + 1])) f++
  return f
}

/** Vrai si le jeton t clôt une proposition (ponctuation attachée, isolée, ou fin du texte). */
function clot(js: Jeton[], t: number): boolean {
  return !!js[t]!.fin || t + 1 >= js.length || js[t + 1]!.genre === 'vide'
}

/** Formules d'un énoncé, en LaTeX (au plus `max`). */
export function extraireFormules(enonce: string, max = 2): string[] {
  const js = jetons(enonce)
  const trouvees: Formule[] = []
  for (let k = 0; k < js.length; ) {
    if (!mathematique(js[k])) {
      k++
      continue
    }
    const f = finDeSuite(js, k)
    for (const [d0, f0] of scinder(js, k, f)) {
      let debut = d0, fin = f0
      while (debut <= fin && js[debut]!.corps === '+') debut++
      if (debut > fin || js[debut]!.genre === 'relation') continue
      const morceaux = js.slice(debut, fin + 1).map((j) => j.corps)
      // Fin sur une relation / un opérateur : un seul mot qui clôt la proposition peut compléter.
      if (estLien(js[fin]!)) {
        const suivant = js[fin + 1]
        if (fin === f && !js[fin]!.fin && suivant?.genre === 'mot' && clot(js, fin + 1)) {
          morceaux.push(`\u0000${suivant.corps}`)
          fin++
        } else continue
      }
      const joint = morceaux.join(' ')
      const cs = [...joint]
      const r0 = cs.findIndex((c) => RELATIONS.has(c))
      if (r0 <= 0) continue
      let r1 = r0
      cs.forEach((c, i) => { if (RELATIONS.has(c)) r1 = i })
      if (!cs.slice(0, r0).join('').trim() || !cs.slice(r1 + 1).join('').replace('\u0000', '').trim()) continue
      const eq = equilibrer(joint)
      if (eq === null) continue
      trouvees.push({ debut, fin, texte: eq })
    }
    k = f + 1
  }
  // Fusion par un mot de liaison.
  const latex: string[] = []
  for (let i = 0; i < trouvees.length; i++) {
    const a = trouvees[i]!
    let t = convertir(a.texte)
    let fin = a.fin
    while (i + 1 < trouvees.length) {
      const b = trouvees[i + 1]!
      const entre = js.slice(fin + 1, b.debut)
      const finA = js[fin]!.fin
      if (entre.length === 1 && LIAISONS.has(entre[0]!.corps.toLowerCase()) && !entre[0]!.fin && (!finA || finA === ',')) {
        t += `${finA ? ',' : ''} \\quad\\text{${entre[0]!.corps}}\\quad ${convertir(b.texte)}`
        fin = b.fin
        i++
      } else break
    }
    latex.push(t)
  }
  return latex.slice(0, max)
}

function convertir(texte: string): string {
  // Le mot final ajouté (marqué \0) passe en \text{…}.
  const k = texte.indexOf('\u0000')
  if (k < 0) return versLatex(texte)
  return `${versLatex(texte.slice(0, k))}\\text{${texte.slice(k + 1)}}`
}

/** Morceau de texte composé : texte courant ou mathématique inline. */
export interface Morceau {
  math: boolean
  /** Texte courant, ou LaTeX si `math`. */
  texte: string
  /** Source Unicode (repli sans KaTeX). */
  source: string
}

/** Retire les parenthèses non appariées aux extrémités (rendues en texte). */
function peler(s: string): { avant: string; milieu: string; apres: string } {
  let cs = [...s]
  let avant = '', apres = ''
  for (let n = 0; n < 4; n++) {
    let d = 0, min = 0
    for (const c of cs) {
      if (c === '(') d++
      else if (c === ')') min = Math.min(min, --d)
    }
    if (d === 0 && min === 0) break
    if (cs[0] === '(' && d > 0) {
      avant += '('
      cs = cs.slice(1)
    } else if (cs[cs.length - 1] === ')' && (d < 0 || min < 0)) {
      apres = ')' + apres
      cs = cs.slice(0, -1)
    } else break
  }
  return { avant, milieu: cs.join(''), apres }
}

/** Énoncé en texte, chaque suite de jetons mathématiques en inline (LaTeX). */
export function texteAvecMaths(enonce: string): Morceau[] {
  const js = jetons(enonce)
  const r: Morceau[] = []
  const texte = (t: string) => {
    if (!t) return
    const d = r[r.length - 1]
    if (d && !d.math) {
      d.texte += t
      d.source += t
    }
    else r.push({ math: false, texte: t, source: t })
  }
  for (let k = 0; k < js.length; ) {
    const j = js[k]!
    const sep = k ? ' ' : ''
    if (!mathematique(j)) {
      texte(sep + j.brut)
      k++
      continue
    }
    const f = finDeSuite(js, k)
    const { avant, milieu, apres } = peler(js.slice(k, f + 1).map((x) => x.corps).join(' '))
    texte(sep + avant)
    if (milieu.trim()) r.push({ math: true, texte: versLatex(milieu), source: milieu })
    texte(apres + js[f]!.fin)
    k = f + 1
  }
  return r
}
