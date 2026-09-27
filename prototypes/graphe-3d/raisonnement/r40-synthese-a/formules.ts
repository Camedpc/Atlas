// R40 · Extraction des formules dans les énoncés (règle générique de R36, inchangée) et conversion Unicode → LaTeX.
//
// Les énoncés d'Atlas sont écrits en prose française avec des mathématiques en Unicode
// (« v² = g h₂ / (1 − α − β) »). Aucune balise ne sépare les deux : on applique une règle unique,
// documentée dans NOTES.md, qui ne connaît aucun identifiant ni aucun énoncé particulier.
//
// 1. Mots. Le texte est coupé aux espaces. Un mot est :
//    - « fort » s'il contient un caractère mathématique : lettre grecque, indice ou exposant Unicode,
//      opérateur ou relation (= ≈ < > ≤ ≥ ≠ ∝ ∈ ± × · − + / ∂ ∇ → ′ | ‖ ∫ ∑…), lettre mathématique
//      (𝐠, 𝟎, 𝔼, ℝ…), « _ » ou « ^ » ;
//    - « faible » s'il est un nombre (9,81), une lettre latine seule (s, y, g — sauf « a » et le « y »
//      de « il y a »), une ou deux lettres appliquées à un argument (« W(t, », « dF(X) »), un nom
//      d'opérateur (sup, div…) ou un mot de deux lettres avec une capitale (dX, BV) ;
//    - de la prose sinon.
// 2. Suites. Une suite de mots forts ou faibles consécutifs forme un morceau mathématique ; une virgule,
//    un point-virgule, un deux-points ou un point en fin de mot la termine, sauf à l'intérieur d'une
//    parenthèse (une virgule décimale n'est pas suivie d'une espace). Après un opérateur (« = », « + »),
//    jusqu'à 6 mots de prose sont absorbés en \text{…} (« T − λ g y = constante »). Dans une parenthèse
//    ouverte, un mot sans syllabe de prose continue la formule ; après une intégrale, « dt » aussi. Le
//    morceau est gardé s'il contient un mot fort, ou s'il est une lettre seule (variable citée dans la
//    prose : « où s est l'abscisse »). Les parenthèses non appariées aux bords et un opérateur final
//    retournent à la prose ; une parenthèse ouverte non refermée coupe le morceau en deux.
// 3. Formules affichées. Dans un bloc, on affiche les morceaux qui contiennent une relation
//    (= ≈ < > ≤ ≥ ≠ ∝ ≡ →) précédée d'un membre gauche, au plus trois ; à défaut, l'expression la plus
//    longue d'au moins trois mots avec un opérateur (« T′ − λ g y »). Deux formules séparées par un seul
//    mot de liaison (« soit », « en ») le gardent en \text{} ; si l'ensemble est court (≤ 24 signes), il
//    tient sur une ligne, sinon chaque formule a sa ligne (environnement gathered).
// 4. Conversion. Grec → \alpha… (Σ → \sum), indices / exposants Unicode → _{…} / ^{…} (et « _{…} »,
//    « ^{…} », « _∞ » ASCII), lettres grasses / ajourées / calligraphiées → \mathbf / \mathbb / \mathcal,
//    accents combinants → \hat…, − → -, · → \cdot, ≈ → \approx, ′ → ', virgule décimale → {,}, unité SI
//    après un nombre → \,\mathrm{…}, sup / max → \sup / \max, div → \operatorname{div}, sigle en
//    capitales → \mathrm{BV}. En mode display seulement, « a / b » devient \frac{a}{b} : le numérateur
//    remonte jusqu'à la relation ou au signe + / − précédent (hors parenthèses), le dénominateur est le
//    groupe parenthésé suivant (parenthèses retirées) ou va jusqu'au prochain signe. En ligne, la barre
//    reste (usage typographique du texte courant).

export interface Katex {
  renderToString(tex: string, options?: Record<string, unknown>): string
}

/** KaTeX chargé par index.html (cdn.jsdelivr.net), ou null tant qu'il ne l'est pas. */
export function katex(): Katex | null {
  return ((window as unknown as { katex?: Katex }).katex) ?? null
}

// ─── Tables de conversion ────────────────────────────────────────────────────

const GREC: Record<string, string> = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ϵ: '\\epsilon', ζ: '\\zeta', η: '\\eta',
  θ: '\\theta', ϑ: '\\vartheta', ι: '\\iota', κ: '\\kappa', λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi',
  ρ: '\\rho', σ: '\\sigma', ς: '\\varsigma', τ: '\\tau', υ: '\\upsilon', φ: '\\varphi', ϕ: '\\phi', χ: '\\chi',
  ψ: '\\psi', ω: '\\omega', Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi', Π: '\\Pi',
  // Σ majuscule isolée : presque toujours une somme dans un énoncé (« Σ𝐅_ext », « Σ_K »).
  Σ: '\\sum', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega', 'µ': '\\mu',
}

/** Relations (séparent les membres d'une formule). */
const RELATIONS: Record<string, string> = {
  '=': '=', '≈': '\\approx', '<': '<', '>': '>', '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '∝': '\\propto',
  '≡': '\\equiv', '∼': '\\sim', '→': '\\to', '⇒': '\\Rightarrow', '⇔': '\\Leftrightarrow', '≪': '\\ll',
  '≫': '\\gg', '≲': '\\lesssim', '≳': '\\gtrsim', '≃': '\\simeq', '≅': '\\cong', '⊂': '\\subset', '⊆': '\\subseteq',
  '⊃': '\\supset', '⊇': '\\supseteq', '∈': '\\in', '∉': '\\notin', '↦': '\\mapsto', '⟶': '\\longrightarrow',
}
/** Signes additifs (bornent numérateur et dénominateur d'une fraction). */
const ADDITIFS: Record<string, string> = { '+': '+', '−': '-', '-': '-', '±': '\\pm', '∓': '\\mp' }
/** Autres symboles. */
const SYMBOLES: Record<string, string> = {
  '×': '\\times', '·': '\\cdot', '∂': '\\partial', '∇': '\\nabla', '∞': '\\infty', '′': "'", '″': "''",
  '∑': '\\sum', '∫': '\\int', '√': '\\sqrt', '⟨': '\\langle', '⟩': '\\rangle', '…': '\\ldots',
  '|': '|', '*': '*', '‖': '\\|', '∩': '\\cap', '∪': '\\cup', '∀': '\\forall', '∃': '\\exists', '∅': '\\emptyset',
  '∏': '\\prod', '∮': '\\oint', '⊗': '\\otimes', '⊕': '\\oplus', '∘': '\\circ', '⋅': '\\cdot', '∧': '\\wedge',
  '∨': '\\vee', '¬': '\\neg', '°': '^{\\circ}', 'ℓ': '\\ell', 'ℏ': '\\hbar', '½': '\\tfrac{1}{2}', '¼': '\\tfrac{1}{4}',
  '⌊': '\\lfloor', '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil', '†': '^{\\dagger}',
}
/** Lettres ajourées du plan multilingue de base. */
const AJOUREES: Record<string, string> = { ℂ: 'C', ℍ: 'H', ℕ: 'N', ℙ: 'P', ℚ: 'Q', ℝ: 'R', ℤ: 'Z' }
/** Noms d'opérateurs composés en romain (\sup, \max…). */
const OPERATEURS_NOMMES = new Set(['sup', 'inf', 'max', 'min', 'lim', 'liminf', 'limsup', 'log', 'ln', 'exp', 'sin', 'cos',
  'tan', 'sinh', 'cosh', 'tanh', 'det', 'dim', 'ker', 'arg', 'deg', 'gcd', 'Pr'])
const OPERATEURS_ROMAINS = new Set(['div', 'grad', 'rot', 'tr', 'Var', 'Cov', 'supp', 'sgn', 'diag', 'Re', 'Im'])
const INDICES: Record<string, string> = Object.fromEntries(
  [...'₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜᵢⱼᵣᵤᵥ'].map((c, k) => [c, '0123456789+-=()aeoxhklmnpstijruv'[k]!]),
)
const EXPOSANTS: Record<string, string> = Object.fromEntries(
  [...'⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ'].map((c, k) => [c, '0123456789+-=()ni'[k]!]),
)
/** Unités SI reconnues après un nombre. */
const UNITES = new Set(['m', 's', 'kg', 'g', 'N', 'J', 'W', 'Pa', 'K', 'Hz', 'rad', 'mol', 'A', 'V', 'cm', 'mm', 'µm', 'ms', 'min', 'h'])

type StyleLettre = 'bf' | 'it' | 'bb' | 'cal' | 'frak'
/** Lettre mathématique (bloc U+1D400–U+1D7FF) : lettre et style (gras, italique, ajouré, calligraphié). */
function lettreMath(cp: number): { c: string; style: StyleLettre } | null {
  const alpha = (base: number, style: StyleLettre) => {
    const k = cp - base
    return k >= 0 && k < 52 ? { c: String.fromCharCode(k < 26 ? 65 + k : 97 + k - 26), style } : null
  }
  if (cp >= 0x1d7ce && cp <= 0x1d7d7) return { c: String.fromCharCode(48 + cp - 0x1d7ce), style: 'bf' }
  if (cp >= 0x1d7d8 && cp <= 0x1d7e1) return { c: String.fromCharCode(48 + cp - 0x1d7d8), style: 'bb' }
  return alpha(0x1d400, 'bf') ?? alpha(0x1d434, 'it') ?? alpha(0x1d468, 'bf') ?? alpha(0x1d49c, 'cal') ?? alpha(0x1d4d0, 'cal')
    ?? alpha(0x1d504, 'frak') ?? alpha(0x1d538, 'bb') ?? alpha(0x1d56c, 'frak')
}
const COMMANDE_STYLE: Record<StyleLettre, string> = { bf: '\\mathbf', it: '', bb: '\\mathbb', cal: '\\mathcal', frak: '\\mathfrak' }

// ─── 1–2. Découpage prose / mathématiques ────────────────────────────────────

const FORT = /[Α-Ωα-ωϕϵϑµ∂∇′″=≈≠<>≤≥±∓∝≡≪≫≲≳≃≅⊂⊆⊃⊇∈∉↦×·⋅−+/→⇒⇔²³¹⁰⁴-⁹⁻⁺₀-₉ₐ-ₜᵢⱼ_^|‖⟨⟩∩∪∀∃∅∑∏∫∮√∞½ℓℏℂℍℕℙℚℝℤ⊗⊕∘]|[\u{1D400}-\u{1D7FF}]/u
const RELATION = /[=≈<>≤≥≠∝≡→]/
const OPERATEUR = /[−+±×·/∂∇]/

export interface Morceau {
  math: boolean
  /** Texte d'origine (Unicode). */
  texte: string
  /** Contient une relation précédée d'un membre gauche. */
  relation: boolean
  /** Nombre de mots (morceau mathématique). */
  mots: number
}

function coeurDe(mot: string): string {
  return mot.replace(/^[(«[]+/, '').replace(/[)»\],;:.!?]+$/, '')
}

function classer(mot: string, suivant: string | undefined): 'fort' | 'faible' | 'prose' {
  const c = coeurDe(mot)
  if (!c) return 'prose'
  if (FORT.test(c)) return 'fort'
  if (/^\d+(?:[.,]\d+)?$/.test(c)) return 'faible'
  // Lettre(s) appliquée(s) à un argument : « W(t, », « dF(X) », « C([0,T]; ».
  if (/^[A-Za-z]{1,2}[([]/.test(c)) return 'faible'
  // Nom d'opérateur (sup, div…) ; mot de deux lettres avec une capitale (dX, BV) : jamais du français.
  if (OPERATEURS_NOMMES.has(c) || OPERATEURS_ROMAINS.has(c)) return 'faible'
  if (/^[A-Za-z]{2}$/.test(c) && /[A-Z]/.test(c)) return 'faible'
  if (/^[A-Za-z]$/.test(c)) {
    if (c === 'a' || c === 'A') return 'prose'
    if (c === 'y' && suivant !== undefined && /^(a|avait|aura)$/.test(coeurDe(suivant))) return 'prose'
    return 'faible'
  }
  return 'prose'
}

/** Mot réduit à un opérateur ou une relation (« = », « − », « + »…) : la formule continue après lui. */
const OPERATEUR_SEUL = /^[=≈<>≤≥≠∝≡→+−±∓×·]$/
/** Début / fin d'un passage de prose absorbé dans une formule (rendu en \text{…}). */
export const TEXTE_DEBUT = '\u0001'
export const TEXTE_FIN = '\u0002'
/** Au plus 6 mots de prose absorbés après un opérateur (« = \text{constante} »). */
const MAX_ABSORBES = 6

interface MotSuite {
  mot: string
  fort: boolean
  /** Prose absorbée après un opérateur. */
  texte: boolean
}

/** Coupe un texte en morceaux de prose et de mathématiques (règle générique, voir en tête). */
export function decouper(texte: string): Morceau[] {
  const mots = texte.split(/\s+/).filter(Boolean)
  const res: Morceau[] = []
  const prose = (t: string) => {
    if (!t) return
    const d = res[res.length - 1]
    if (d && !d.math) d.texte += t
    else res.push({ math: false, texte: t, relation: false, mots: 0 })
  }
  let suite: MotSuite[] = []
  const vider = (liste: MotSuite[] = suite) => {
    if (liste === suite) suite = []
    if (!liste.length) return
    // Parenthèse ouverte non refermée au milieu : deux formules (« T_s = β λ v² (β = 0 pour… »).
    let pile = 0, coupe = -1
    liste.forEach((m, k) => {
      if (m.texte) return
      for (const c of m.mot) {
        if (c === '(') {
          if (pile === 0) coupe = k
          pile++
        } else if (c === ')') pile = Math.max(0, pile - 1)
      }
    })
    if (pile > 0 && coupe > 0 && liste[coupe]!.mot.startsWith('(')) {
      vider(liste.slice(0, coupe))
      vider(liste.slice(coupe))
      return
    }
    // Opérateur final sans suite : rendu à la prose.
    let queue = ''
    while (liste.length > 1 && OPERATEUR_SEUL.test(coeurDe(liste[liste.length - 1]!.mot)) && !liste[liste.length - 1]!.texte) {
      queue = liste[liste.length - 1]!.mot + ' ' + queue
      liste = liste.slice(0, -1)
    }
    const garde = liste.some((m) => m.fort) || (liste.length === 1 && /^[A-Za-z]$/.test(coeurDe(liste[0]!.mot)))
    const n = liste.length
    if (!garde) return prose(liste.map((m) => m.mot).join(' ') + ' ' + queue)
    // Prose absorbée : un seul \text{…} par passage ; ponctuation finale rendue à la prose.
    let fin = ''
    const morceaux: string[] = []
    liste.forEach((m, k) => {
      if (!m.texte) return morceaux.push(m.mot)
      let t = m.mot
      if (k === liste.length - 1) {
        const f = t.match(/[,;:.!?»]+$/)
        if (f) {
          fin = f[0]
          t = t.slice(0, -f[0].length)
        }
      }
      if (liste[k - 1]?.texte) morceaux[morceaux.length - 1] = morceaux[morceaux.length - 1]!.slice(0, -1) + ' ' + t + TEXTE_FIN
      else morceaux.push(TEXTE_DEBUT + t + TEXTE_FIN)
    })
    let debut = ''
    let m = morceaux.join(' ')
    // Ponctuation et parenthèses non appariées aux bords : rendues à la prose.
    for (;;) {
      const f = m.match(/[,;:.!?»\]]$/)
      if (f) {
        fin = f[0] + fin
        m = m.slice(0, -1)
        continue
      }
      const ouv = (m.match(/\(/g) ?? []).length, fer = (m.match(/\)/g) ?? []).length
      if (m.endsWith(')') && fer > ouv) {
        fin = ')' + fin
        m = m.slice(0, -1)
        continue
      }
      if (m.startsWith('(') && ouv > fer) {
        debut += '('
        m = m.slice(1)
        continue
      }
      if (/^[«[]/.test(m)) {
        debut += m[0]
        m = m.slice(1)
        continue
      }
      // Parenthèses qui enveloppent tout le morceau : « (α = 0) ».
      if (m.startsWith('(') && m.endsWith(')') && enveloppe(m)) {
        debut += '('
        fin = ')' + fin
        m = m.slice(1, -1)
        continue
      }
      break
    }
    prose(debut)
    const rel = RELATION.exec(m.replace(new RegExp(`${TEXTE_DEBUT}[^${TEXTE_FIN}]*${TEXTE_FIN}`, 'g'), ''))
    const avant = rel ? m.slice(0, m.indexOf(rel[0])).trim() : ''
    res.push({ math: true, texte: m, relation: !!rel && avant.length > 0, mots: n })
    prose(fin + ' ' + queue)
  }
  let absorbes = 0
  mots.forEach((mot, k) => {
    let c = classer(mot, mots[k + 1])
    // Différentielle après une intégrale : « ∫ |φ|² dt ».
    if (c === 'prose' && /^d[a-zα-ω]$/.test(coeurDe(mot)) && suite.some((m) => /[∫∮]/.test(m.mot))) c = 'faible'
    // Dans une parenthèse ouverte, un mot sans syllabe de prose (« C([0,T]; ») continue la formule.
    if (c === 'prose' && suite.some((m) => m.fort) && profondeur(suite) > 0 && !/[a-zà-ÿ]{3,}/.test(coeurDe(mot))) c = 'faible'
    if (c === 'prose') {
      const dernier = suite[suite.length - 1]
      const apresOperateur = !!dernier && suite.some((m) => m.fort) && (dernier.texte || OPERATEUR_SEUL.test(coeurDe(dernier.mot)))
      if (apresOperateur && coeurDe(mot) && (dernier!.texte ? absorbes < MAX_ABSORBES : true)) {
        absorbes = dernier!.texte ? absorbes + 1 : 1
        suite.push({ mot, fort: false, texte: true })
        if (/[,;:.!?»]$/.test(mot)) vider()
        return
      }
      // Ponctuation isolée (« ; ») après de la prose absorbée : la formule se termine là.
      if (dernier?.texte && !coeurDe(mot)) {
        vider()
        prose(mot + ' ')
        return
      }
      // Trop long : la prose absorbée retourne à la prose.
      const rendus: string[] = []
      while (suite.length && suite[suite.length - 1]!.texte) rendus.unshift(suite.pop()!.mot)
      vider()
      prose(rendus.map((r) => r + ' ').join('') + mot + ' ')
      return
    }
    suite.push({ mot, fort: c === 'fort', texte: false })
    // Une ponctuation finale termine la formule, sauf à l'intérieur de parenthèses, crochets ou accolades
    // (« W^{1,∞}(𝕋^d; ℝ^d) »).
    if (/[,;:.!?]\)?$|[,;:.!?]»?$/.test(mot) && profondeur(suite) === 0) vider()
  })
  vider()
  const d = res[res.length - 1]
  if (d && !d.math) d.texte = d.texte.trimEnd()
  return res
}

/** Parenthèses, crochets et accolades ouverts dans la suite (hors prose absorbée). */
function profondeur(suite: MotSuite[]): number {
  let p = 0
  for (const m of suite) {
    if (m.texte) continue
    for (const c of m.mot) {
      if (c === '(' || c === '[' || c === '{') p++
      else if (c === ')' || c === ']' || c === '}') p = Math.max(0, p - 1)
    }
  }
  return p
}

function enveloppe(m: string): boolean {
  let p = 0
  for (let k = 0; k < m.length; k++) {
    if (m[k] === '(') p++
    else if (m[k] === ')') {
      p--
      if (p === 0 && k < m.length - 1) return false
    }
  }
  return p === 0
}

// ─── 4. Conversion Unicode → LaTeX ───────────────────────────────────────────

type GenreAtome = 'terme' | 'relation' | 'additif' | 'ouvre' | 'ferme' | 'barre' | 'espace' | 'virgule'
interface Atome {
  g: GenreAtome
  tex: string
}

/** Une commande (\leq) est suivie d'une espace pour ne pas se coller à la lettre suivante. */
const commande = (tex: string) => (/^\\[A-Za-z]+$/.test(tex) ? tex + ' ' : tex)

/** Accents combinants (après décomposition NFD) → commandes d'accent mathématique. */
const ACCENTS: Record<string, string> = {
  '̂': '\\hat', '̃': '\\tilde', '̄': '\\bar', '̅': '\\bar', '̇': '\\dot', '̈': '\\ddot',
  '⃗': '\\vec', '́': '\\acute', '̀': '\\grave', '̌': '\\check',
}

function atomiser(source: string): Atome[] {
  const cs = [...source.normalize('NFD')]
  const a: Atome[] = []
  const terme = (tex: string) => a.push({ g: 'terme', tex })
  const estChiffre = (c: string | undefined) => !!c && /[0-9]/.test(c)
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k]!
    const cp = c.codePointAt(0)!
    if (c === TEXTE_DEBUT) {
      let t = ''
      while (++k < cs.length && cs[k] !== TEXTE_FIN) t += cs[k]
      terme(`\\text{${t.replace(/[\\{}$&%#_^~]/g, (x) => `\\${x}`)}}`)
      continue
    }
    if (/\s/.test(c)) {
      if (a[a.length - 1]?.g !== 'espace') a.push({ g: 'espace', tex: ' ' })
      continue
    }
    // Unité SI après un nombre : « 9,81 m·s⁻² ».
    // Unité si elle est composée (· / exposant) ou si le nombre n'est pas un simple chiffre (« 2 g h » reste
    // un produit).
    const nombrePrecedent = a[a.length - 1]?.g === 'espace' ? cs.slice(0, k).join('').match(/(\d+(?:[.,]\d+)?)\s+$/) : null
    if (nombrePrecedent) {
      const reste = cs.slice(k).join('')
      const u = reste.match(/^((?:[a-zA-Zµ]{1,3}[⁰¹²³⁴-⁹⁻]*)(?:[·/][a-zA-Zµ]{1,3}[⁰¹²³⁴-⁹⁻]*)*)(?=$|\s)/)
      const compose = !!u && /[·/⁰¹²³⁴-⁹⁻]/.test(u[1]!)
      if (u && (compose || nombrePrecedent[1]!.length > 1) && u[1]!.split(/[·/]/).every((x) => UNITES.has(x.replace(/[⁰¹²³⁴-⁹⁻]/g, '')))) {
        const tex = u[1]!.replace(/[⁰¹²³⁴-⁹⁻]+/g, (e) => `^{${[...e].map((x) => EXPOSANTS[x]).join('')}}`).replace(/·/g, '\\cdot ').replace(/µ/g, '\\mu ')
        a.pop()
        terme(`\\,\\mathrm{${tex}}`)
        k += [...u[1]!].length - 1
        continue
      }
    }
    if (c === '(' || c === '[') { a.push({ g: 'ouvre', tex: c }); continue }
    if (c === ')' || c === ']') { a.push({ g: 'ferme', tex: c }); continue }
    if (c === '/') { a.push({ g: 'barre', tex: '/' }); continue }
    if (RELATIONS[c]) { a.push({ g: 'relation', tex: commande(RELATIONS[c]!) }); continue }
    if (ADDITIFS[c] !== undefined) { a.push({ g: 'additif', tex: commande(ADDITIFS[c]!) }); continue }
    if (c === ',') {
      if (estChiffre(cs[k - 1]) && estChiffre(cs[k + 1])) terme('{,}')
      else a.push({ g: 'virgule', tex: ',' })
      continue
    }
    if (c === ';' || c === ':') { a.push({ g: 'virgule', tex: c === ':' ? '\\colon' : ';' }); continue }
    if (INDICES[c] !== undefined) {
      let s = ''
      while (k < cs.length && INDICES[cs[k]!] !== undefined) s += INDICES[cs[k++]!]
      k--
      terme(`_{${s}}`)
      continue
    }
    if (EXPOSANTS[c] !== undefined) {
      let s = ''
      while (k < cs.length && EXPOSANTS[cs[k]!] !== undefined) s += EXPOSANTS[cs[k++]!]
      k--
      terme(`^{${s}}`)
      continue
    }
    // Indice ou exposant ASCII avec accolades : « a_{n+1} », « e^{C t_n} » (contenu converti).
    if ((c === '_' || c === '^') && cs[k + 1] === '{') {
      let q = 0, f = k + 1
      for (; f < cs.length; f++) {
        if (cs[f] === '{') q++
        else if (cs[f] === '}' && --q === 0) break
      }
      terme(`${c}{${versLatex(cs.slice(k + 2, f).join(''))}}`)
      k = f
      continue
    }
    if (c === '^' && k + 1 < cs.length && /[A-Za-z0-9]/.test(cs[k + 1]!)) {
      terme(`^{${cs[k + 1]}}`)
      k++
      continue
    }
    if ((c === '_' || c === '^') && k + 1 < cs.length && !/[\sA-Za-z0-9{]/.test(cs[k + 1]!)) {
      let f = k + 2
      while (f < cs.length && /[̀-ͯ⃐-⃿]/.test(cs[f]!)) f++
      terme(`${c}{${versLatex(cs.slice(k + 1, f).join(''))}}`)
      k = f - 1
      continue
    }
    if (c === '{' || c === '}') { terme(c === '{' ? '\\{' : '\\}'); continue }
    if (c === '_' && k + 1 < cs.length && /[A-Za-z0-9]/.test(cs[k + 1]!)) {
      let s = ''
      k++
      while (k < cs.length && /[A-Za-z0-9]/.test(cs[k]!)) s += cs[k++]
      k--
      terme(s.length > 1 && /[A-Za-z]{2}/.test(s) ? `_{\\mathrm{${s}}}` : `_{${s}}`)
      continue
    }
    const lm = lettreMath(cp)
    if (lm) {
      if (lm.style === 'it') { terme(lm.c); continue }
      let s = lm.c
      while (k + 1 < cs.length) {
        const suiv = lettreMath(cs[k + 1]!.codePointAt(0)!)
        if (suiv?.style !== lm.style) break
        s += suiv.c
        k++
      }
      terme(`${COMMANDE_STYLE[lm.style]}{${s}}`)
      continue
    }
    if (AJOUREES[c]) { terme(`\\mathbb{${AJOUREES[c]}}`); continue }
    if (/[A-Za-z]/.test(c) && ACCENTS[cs[k + 1] ?? '']) {
      let t = c
      while (ACCENTS[cs[k + 1] ?? '']) t = `${ACCENTS[cs[++k]!]}{${t}}`
      terme(t)
      continue
    }
    // Mot de lettres : opérateur nommé (\sup), opérateur romain (div), sigle en capitales (BV) ; sinon
    // chaque lettre est une variable (« ab » = a b).
    if (/[A-Za-z]/.test(c) && !/[A-Za-z]/.test(cs[k - 1] ?? '')) {
      let f = k
      while (f < cs.length && /[A-Za-z]/.test(cs[f]!)) f++
      const mot = cs.slice(k, f).join('')
      const nom = OPERATEURS_NOMMES.has(mot) ? `\\${mot} ` : OPERATEURS_ROMAINS.has(mot) ? `\\operatorname{${mot}} `
        : mot.length >= 2 && /^[A-Z]+$/.test(mot) ? `\\mathrm{${mot}}` : ''
      if (nom) {
        terme(nom)
        k = f - 1
        continue
      }
    }
    if (GREC[c]) { terme(GREC[c]! + ' '); continue }
    if (SYMBOLES[c]) { terme(SYMBOLES[c]!.startsWith('\\') ? SYMBOLES[c]! + ' ' : SYMBOLES[c]!); continue }
    if (/[A-Za-z0-9.!'"]/.test(c)) { terme(c); continue }
    if (c === '«' || c === '»') continue
    // Tout autre caractère (lettre accentuée…) : en texte.
    terme(`\\text{${c}}`)
  }
  while (a[0]?.g === 'espace') a.shift()
  while (a[a.length - 1]?.g === 'espace') a.pop()
  return a
}

const joindre = (a: Atome[]) => a.map((x) => x.tex).join('').replace(/\s+/g, ' ').trim()

/** Retire des parenthèses qui enveloppent tout le groupe. */
function sansEnveloppe(a: Atome[]): Atome[] {
  const b = a.filter((x, k) => !(x.g === 'espace' && (k === 0 || k === a.length - 1)))
  if (b[0]?.g !== 'ouvre' || b[b.length - 1]?.g !== 'ferme') return b
  let p = 0
  for (let k = 0; k < b.length; k++) {
    if (b[k]!.g === 'ouvre') p++
    else if (b[k]!.g === 'ferme' && --p === 0 && k < b.length - 1) return b
  }
  return b.slice(1, -1)
}

const borne = (x: Atome) => x.g === 'relation' || x.g === 'additif' || x.g === 'virgule'

/** Fractions « a / b » → \frac{a}{b} (mode display). */
function fractions(a: Atome[]): Atome[] {
  let k = a.findIndex((x) => x.g === 'barre')
  while (k >= 0) {
    // Numérateur : vers la gauche jusqu'à une relation / un signe hors parenthèses.
    let i = k - 1
    while (i >= 0 && a[i]!.g === 'espace') i--
    let p = 0
    let d = i
    for (; d >= 0; d--) {
      const x = a[d]!
      if (x.g === 'ferme') p++
      else if (x.g === 'ouvre') {
        if (p === 0) break
        p--
      } else if (p === 0 && borne(x)) break
    }
    const debut = d + 1
    // Dénominateur : groupe parenthésé, ou jusqu'au prochain signe.
    let j = k + 1
    while (j < a.length && a[j]!.g === 'espace') j++
    let f = j
    if (a[j]?.g === 'ouvre') {
      let q = 0
      for (; f < a.length; f++) {
        if (a[f]!.g === 'ouvre') q++
        else if (a[f]!.g === 'ferme' && --q === 0) break
      }
      f = Math.min(f + 1, a.length)
      // Un indice ou exposant collé au groupe en fait partie.
      while (f < a.length && a[f]!.g === 'terme' && /^[_^]/.test(a[f]!.tex)) f++
    } else {
      let q = 0
      for (; f < a.length; f++) {
        const x = a[f]!
        if (x.g === 'ouvre') q++
        else if (x.g === 'ferme') {
          if (q === 0) break
          q--
        } else if (q === 0 && (borne(x) || x.g === 'barre')) break
      }
    }
    const num = sansEnveloppe(a.slice(debut, i + 1))
    const den = sansEnveloppe(a.slice(j, f))
    if (!num.length || !den.length) {
      a[k] = { g: 'terme', tex: '/' }
    } else {
      const frac: Atome = { g: 'terme', tex: `\\frac{${joindre(num)}}{${joindre(den)}}` }
      const avant = a.slice(0, debut), apres = a.slice(f)
      a = [...avant, ...(avant.length && avant[avant.length - 1]!.g !== 'espace' ? [{ g: 'espace' as const, tex: ' ' }] : []), frac, ...apres]
    }
    k = a.findIndex((x) => x.g === 'barre')
  }
  return a
}

/** Formule Unicode → LaTeX. `display` : fractions empilées. */
export function versLatex(source: string, display = false): string {
  let a = atomiser(source)
  if (display) a = fractions(a)
  return joindre(a)
}

// ─── 3. Formules affichées d'un énoncé ───────────────────────────────────────

/** LaTeX des formules à afficher dans un bloc (vide s'il n'y en a pas). */
export function formulesAffichees(enonce: string): string {
  const ms = decouper(enonce)
  const choisis: { k: number; m: Morceau }[] = []
  ms.forEach((m, k) => {
    if (m.math && m.relation && choisis.length < 3) choisis.push({ k, m })
  })
  if (!choisis.length) {
    let meilleur = ''
    for (const m of ms) if (m.math && m.mots >= 3 && OPERATEUR.test(m.texte) && m.texte.length > meilleur.length) meilleur = m.texte
    return meilleur ? versLatex(meilleur, true) : ''
  }
  // Mot de liaison entre deux formules consécutives (un seul mot de prose).
  const lignes: string[] = []
  let courante = ''
  let longueur = 0
  choisis.forEach(({ k, m }, i) => {
    const tex = versLatex(m.texte, true)
    if (i === 0) {
      courante = tex
      longueur = sansMarques(m.texte).length
      return
    }
    const entre = ms.slice(choisis[i - 1]!.k + 1, k).filter((x) => !x.math).map((x) => x.texte).join(' ')
    const motsEntre = entre.replace(/[,;:.()]/g, ' ').trim().split(/\s+/).filter(Boolean)
    const liaison = motsEntre.length === 1 ? motsEntre[0]! : ''
    const texteLiaison = liaison ? `\\text{${liaison}}\\;\\;` : ''
    const l = sansMarques(m.texte).length
    if (longueur + l <= 24) {
      courante += `${liaison ? '\\quad ' : ',\\quad '}${texteLiaison}${tex}`
      longueur += l
    } else {
      lignes.push(courante)
      courante = `${texteLiaison}${tex}`
      longueur = l
    }
  })
  lignes.push(courante)
  return lignes.length > 1 ? `\\begin{gathered}${lignes.join(' \\\\ ')}\\end{gathered}` : lignes[0]!
}

// ─── Rendu HTML ──────────────────────────────────────────────────────────────

/** Texte d'un morceau sans les marques de prose absorbée. */
export function sansMarques(t: string): string {
  return t.replace(/[\u0001\u0002]/g, '')
}

export function echapper(t: string): string {
  return sansMarques(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Formule LaTeX en HTML (KaTeX), ou texte Unicode en italique si KaTeX n'est pas chargé. */
export function rendreTex(tex: string, secours: string, display = false): string {
  const k = katex()
  if (!k) return `<span class="r40-secours">${echapper(secours)}</span>`
  try {
    return k.renderToString(display ? `\\displaystyle ${tex}` : tex, { throwOnError: false, strict: false, output: 'html' })
  } catch {
    return `<span class="r40-secours">${echapper(secours)}</span>`
  }
}

/** Texte courant avec mathématiques en ligne (titres, fiche, hypothèses, légende). */
export function enLigne(texte: string): string {
  return decouper(texte).map((m) => (m.math ? rendreTex(versLatex(m.texte), m.texte) : echapper(m.texte))).join('')
    .replace(/ ([;:!?»])/g, '&#8239;$1').replace(/« /g, '«&#8239;')
}

/** Formules affichées d'un énoncé en HTML ('' s'il n'y en a pas). */
export function formulesHtml(enonce: string): string {
  const tex = formulesAffichees(enonce)
  return tex ? rendreTex(tex, enonce, true) : ''
}

/** Nombre au format français (virgule décimale). */
export function nombre(x: number, d = 2): string {
  return x.toFixed(d).replace('.', '{,}')
}

/** Confiance en notation d'incertitude asymétrique : c = 0,82 (+0,08, −0,10). */
export function texConfiance(c: { estimation: number; bas: number; haut: number }): string {
  const plus = Math.max(0, c.haut - c.estimation), moins = Math.max(0, c.estimation - c.bas)
  return `c = ${nombre(c.estimation)}^{+${nombre(plus)}}_{-${nombre(moins)}}`
}
