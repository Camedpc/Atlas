// R32 · Formules : extraction générique depuis les énoncés (texte Unicode) et composition LaTeX (KaTeX).
//
// Règle d'extraction (documentée dans NOTES.md), appliquée à tout énoncé, sans rien de propre à un jeu :
//
//   1. L'énoncé est découpé en mots (espaces). Un mot est « mathématique » s'il contient une lettre
//      grecque, un indice ou exposant Unicode, un opérateur (= ≈ ≤ ≥ < > ≠ ∝ ± − + × · / ∂ ∇ ′ _),
//      une lettre grasse mathématique ou un chiffre, ou s'il est une lettre latine isolée (sauf « a »).
//      Un mot de deux lettres ou plus sans rien de tout cela (« est », « soit », « Pente ») ne l'est pas.
//   2. Une ponctuation finale (, ; : .) termine la suite en cours ; « : » seul est un séparateur.
//   3. Une formule est une suite maximale de mots mathématiques d'au moins trois mots dont un mot
//      intérieur (ni le premier ni le dernier) est une relation (= ≈ ≤ ≥ < > ≠ ∝ ≡).
//   4. Une formule entre parenthèses est une remarque incidente : elle est ignorée.
//   5. Deux formules consécutives séparées par au plus deux mots (« soit », « en », « : »…) sont
//      composées ensemble, les mots de liaison en romain (\text{…}) ; sinon seule la première compte.
//   6. Pas de formule : la conclusion affiche le nom du nœud, dont les mots mathématiques (au moins
//      un caractère « fort » : grec, indice, exposant, opérateur, gras) sont composés en ligne.

const GREC: Record<string, string> = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ζ: '\\zeta', η: '\\eta', θ: '\\theta',
  ι: '\\iota', κ: '\\kappa', λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi', ρ: '\\rho', σ: '\\sigma',
  τ: '\\tau', υ: '\\upsilon', φ: '\\varphi', χ: '\\chi', ψ: '\\psi', ω: '\\omega', Γ: '\\Gamma', Δ: '\\Delta',
  Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi', Π: '\\Pi', Σ: '\\sum', Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
}
const INDICES = new Map([...'₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜ'].map((c, k) => [c, '0123456789+-=()aeoxhklmnpst'[k]!]))
const EXPOSANTS = new Map([...'⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ'].map((c, k) => [c, '0123456789+-=()ni'[k]!]))
const OPERATEURS: Record<string, string> = {
  '−': '-', '·': '\\cdot ', '×': '\\times ', '±': '\\pm ', '≈': '\\approx ', '≤': '\\le ', '≥': '\\ge ', '≠': '\\neq ',
  '∝': '\\propto ', '→': '\\to ', '∞': '\\infty ', '∂': '\\partial ', '∇': '\\nabla ', '′': "'", '″': "''",
  '∑': '\\sum ', '∫': '\\int ', '√': '\\surd ', '∈': '\\in ', '≡': '\\equiv ', '⇒': '\\Rightarrow ', '…': '\\dots ',
  '∼': '\\sim ', '∩': '\\cap ', '∪': '\\cup ', '∀': '\\forall ', '∃': '\\exists ', '‖': '\\| ', '½': '\\tfrac12 ',
  'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}',
  '%': '\\%', '#': '\\#', '&': '\\&', '$': '\\$',
}
/** Noms de fonctions usuels : composés en romain (\sup, \max…). */
const FONCTIONS = new Set(['sup', 'inf', 'max', 'min', 'lim', 'log', 'ln', 'exp', 'sin', 'cos', 'tan', 'det', 'dim', 'ker', 'div', 'rot', 'grad', 'tr', 'arg'])
const RELATION = /[=≈≤≥<>≠∝≡]/
/** Caractères « forts » : un mot qui en contient un est à coup sûr mathématique. */
const FORT = /[Α-Ωα-ω₀-ₜ⁰-ⁿ¹²³=≈≤≥<>≠∝±−×·∂∇′″_∞∑∫√≡∼‖|½ℝℕℤℚℂ]|[\u{1D400}-\u{1D433}\u{1D49C}-\u{1D503}\u{1D538}-\u{1D56B}\u{1D7CE}-\u{1D7D7}]/u
const MOT = /^[A-Za-zÀ-ÖØ-öø-ÿœŒ’'\-–]{2,}$/

/** Lettres mathématiques (gras, calligraphiques, ajourées) : commande LaTeX, ou null. */
function lettreMath(c: string): string | null {
  const cp = c.codePointAt(0)!
  const plage = (debut: number, base: number, cmd: string, n = 26) => (cp >= debut && cp < debut + n ? `\\${cmd}{${String.fromCharCode(base + cp - debut)}}` : null)
  return plage(0x1d400, 65, 'mathbf') ?? plage(0x1d41a, 97, 'mathbf') ?? plage(0x1d7ce, 48, 'mathbf', 10) ??
    plage(0x1d49c, 65, 'mathcal') ?? plage(0x1d4d0, 65, 'mathcal') ?? plage(0x1d538, 65, 'mathbb')
}

/** Conversion Unicode → LaTeX d'une formule (indices, exposants, grec, opérateurs, lettres, virgule décimale). */
export function versLatex(s: string): string {
  const c = [...s]
  let out = ''
  for (let i = 0; i < c.length; i++) {
    const x = c[i]!
    if (INDICES.has(x) || EXPOSANTS.has(x)) {
      const table = INDICES.has(x) ? INDICES : EXPOSANTS
      let g = ''
      while (i < c.length && table.has(c[i]!)) g += table.get(c[i++]!)
      i--
      out += `${table === INDICES ? '_' : '^'}{${g}}`
      continue
    }
    // Indice écrit « _ext » : plusieurs lettres → romain.
    if (x === '_' && /[A-Za-z0-9]/.test(c[i + 1] ?? '')) {
      let g = ''
      while (/[A-Za-z0-9]/.test(c[i + 1] ?? '')) g += c[++i]
      out += g.length > 1 && /^[A-Za-z]+$/.test(g) ? `_{\\mathrm{${g}}}` : `_{${g}}`
      continue
    }
    const l = lettreMath(x)
    if (l) {
      out += l
      continue
    }
    if (GREC[x]) {
      out += GREC[x] + ' '
      continue
    }
    if (OPERATEURS[x] !== undefined) {
      out += OPERATEURS[x]
      continue
    }
    // Virgule décimale (« 0,11 ») : sans espace en mode mathématique.
    if (x === ',' && /\d/.test(c[i - 1] ?? '') && /\d/.test(c[i + 1] ?? '')) {
      out += '{,}'
      continue
    }
    // Fonctions usuelles (sup, max, log…) en début de mot.
    if (/[a-z]/.test(x) && !/[A-Za-z\\]/.test(c[i - 1] ?? '')) {
      let m = x
      let k = i
      while (/[a-z]/.test(c[k + 1] ?? '')) m += c[++k]
      if (FONCTIONS.has(m)) {
        out += `\\${m} `
        i = k
        continue
      }
    }
    if (x === '\\') {
      out += '\\backslash '
      continue
    }
    out += x
  }
  return out
}

interface Mot {
  brut: string
  /** Mot sans ponctuation finale. */
  coeur: string
  math: boolean
  relation: boolean
  /** La ponctuation finale ferme la suite en cours. */
  ferme: boolean
  separateur: boolean
}

function lireMots(texte: string): Mot[] {
  return texte.split(/\s+/).filter(Boolean).map((brut) => {
    const separateur = /^[:;]$/.test(brut)
    const coeur = separateur ? '' : brut.replace(/[.,;:!?]+$/, '')
    const ferme = coeur !== brut
    const nu = coeur.replace(/^[([]+|[)\]]+$/g, '')
    const math = !separateur && nu.length > 0 && !MOT.test(nu) && (FORT.test(nu) || /\d/.test(nu) || /^[A-Za-z]$/.test(nu) && nu !== 'a' ||
      /^[+/=]$/.test(nu))
    return { brut, coeur, math, relation: math && RELATION.test(coeur), ferme, separateur }
  })
}

/** Parenthèses équilibrées qui entourent toute la chaîne. */
function entreParentheses(s: string): boolean {
  if (!s.startsWith('(') || !s.endsWith(')')) return false
  let n = 0
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '(') n++
    else if (s[k] === ')') n--
    if (n === 0 && k < s.length - 1) return false
  }
  return n === 0
}

/** Formule extraite d'un énoncé (LaTeX), ou null (règle en tête du fichier). */
export function extraireFormule(enonce: string): string | null {
  const mots = lireMots(enonce)
  // Suites : [début, fin] (fin exclue), avec leur validité.
  const suites: { debut: number; fin: number; texte: string }[] = []
  let k = 0
  while (k < mots.length) {
    if (!mots[k]!.math) {
      k++
      continue
    }
    const debut = k
    while (k < mots.length && mots[k]!.math) {
      k++
      if (mots[k - 1]!.ferme) break
    }
    let s = mots.slice(debut, k)
    // Parenthèse ouverte dans la suite et jamais refermée (remarque incidente coupée par du texte) :
    // la suite s'arrête avant elle.
    {
      const ouvertes: number[] = []
      s.forEach((m, i) => {
        for (const ch of m.coeur) {
          if (ch === '(') ouvertes.push(i)
          else if (ch === ')') ouvertes.pop()
        }
      })
      if (ouvertes.length && ouvertes[0]! > 0) s = s.slice(0, ouvertes[0])
    }
    // Opérateur final orphelin (« … + flux entrant ») : retiré.
    while (s.length && /^[+\-−=×·/±]$/.test(s[s.length - 1]!.coeur)) s = s.slice(0, -1)
    const interieure = s.some((m, i) => i > 0 && i < s.length - 1 && m.relation)
    let texte = s.map((m) => m.coeur).join(' ')
    if (s.length >= 3 && interieure && !entreParentheses(texte)) {
      // Parenthèse ouvrante ou fermante orpheline aux bords : retirée.
      if (texte.startsWith('(') && !texte.includes(')')) texte = texte.slice(1)
      if (texte.endsWith(')') && !texte.includes('(')) texte = texte.slice(0, -1)
      suites.push({ debut, fin: debut + s.length, texte })
    }
  }
  if (!suites.length) return null
  const a = suites[0]!
  let tex = versLatex(a.texte)
  const b = suites[1]
  if (b) {
    const liaison = mots.slice(a.fin, b.debut)
    if (liaison.length <= 2) {
      const mots2 = liaison.map((m) => (m.separateur ? m.brut : m.coeur)).filter(Boolean)
      tex += mots2.length ? `\\ \\text{ ${mots2.join(' ')} }\\ ` : ',\\quad '
      tex += versLatex(b.texte)
    }
  }
  return tex
}

// ─── Texte avec mathématiques en ligne ───────────────────────────────────────

interface Katex {
  renderToString(tex: string, options?: Record<string, unknown>): string
}

function katex(): Katex | null {
  return ((window as unknown as { katex?: Katex }).katex) ?? null
}

export function echapper(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** HTML d'une formule (KaTeX si chargé, sinon repli en italique). */
export function htmlFormule(tex: string, display = false): string {
  const k = katex()
  if (k) {
    try {
      return k.renderToString(tex, { throwOnError: false, strict: 'ignore', displayMode: false, output: 'html' }).replace('class="katex"', `class="katex${display ? ' r32-display' : ''}"`)
    } catch {
      // repli ci-dessous
    }
  }
  return `<span class="r32-repli">${echapper(tex)}</span>`
}

/** HTML d'un texte courant : les mots mathématiques « forts » passent en KaTeX en ligne. */
export function htmlTexte(texte: string): string {
  const mots = texte.split(/(\s+)/)
  let out = ''
  let tampon: string[] = []
  const vider = () => {
    if (!tampon.length) return
    let s = tampon.join('')
    const fin = s.trimEnd()
    const espaces = s.slice(fin.length)
    s = fin
    // Ponctuation et parenthèses aux bords : en texte.
    const avant = /^[([]*/.exec(s)![0]
    s = s.slice(avant.length)
    const apres = /[)\].,;:!?]*$/.exec(s)![0]
    s = s.slice(0, s.length - apres.length)
    out += echapper(avant) + htmlFormule(versLatex(s)) + echapper(apres) + espaces
    tampon = []
  }
  for (const m of mots) {
    if (/^\s+$/.test(m)) {
      if (tampon.length) tampon.push(m)
      else out += m
      continue
    }
    const nu = m.replace(/^[([]+|[)\].,;:!?]+$/g, '')
    const math = nu.length > 0 && !MOT.test(nu) && (FORT.test(nu) || (tampon.length > 0 && (/\d/.test(nu) || /^[A-Za-z]$/.test(nu))))
    if (math) {
      tampon.push(m)
      if (/[.,;:!?]$/.test(m)) vider()
    } else {
      vider()
      out += echapper(m)
    }
  }
  vider()
  return out
}

// ─── Noms de règles ──────────────────────────────────────────────────────────

const LIAISONS = new Set(['de', 'du', 'des', 'd’', "d'", 'd’une', 'd’un', "d'une", "d'un", 'la', 'le', 'les', 'l’', "l'", 'un', 'une', 'à', 'au', 'aux'])
const TETES: Record<string, string> = {
  Théorème: 'Th.', Lemme: 'Lem.', Proposition: 'Prop.', Définition: 'Déf.', Hypothèse: 'Hyp.', Corollaire: 'Cor.',
  Équation: 'Éq.', Principe: 'Princ.', Inégalité: 'Inég.', Estimation: 'Estim.',
}

/**
 * Nom court d'une règle (au plus `max` caractères), par étapes :
 *   1. parenthèse finale retirée ;
 *   2. « tête de nom de nom » tout en minuscules → tête + sigle (« Bilan de quantité de mouvement » → « Bilan q.d.m. ») ;
 *   3. tête usuelle abrégée (Théorème → Th., Lemme → Lem.…) ;
 *   4. coupe au dernier mot entier (au moins un mot plein après la tête), sans mot de liaison final, puis « … ».
 */
export function nomCourt(nom: string, max = 26): string {
  let s = nom.replace(/\s*\([^)]*\)\s*$/, '').trim()
  if (s.length <= max) return s
  const mots = s.split(/\s+/)
  const tete = mots[0]!
  const queue = mots.slice(2)
  const sigle = ['de', 'du', 'des'].includes(mots[1] ?? '') && queue.length >= 3 &&
    queue.every((m, i) => (i % 2 === 1 ? ['de', 'du', 'des'].includes(m) : /^[a-zà-ÿœ]+$/.test(m)))
  if (sigle) return `${tete} ${queue.map((m) => m[0]).join('.')}.`
  if (TETES[tete]) {
    s = [TETES[tete], ...mots.slice(1)].join(' ')
    if (s.length <= max) return s
  }
  const liste = s.split(/\s+/)
  const r: string[] = []
  for (const m of liste) {
    const plein = r.slice(1).some((x) => !LIAISONS.has(x.toLowerCase()))
    if (plein && [...r, m].join(' ').length > max - 1) break
    r.push(m)
  }
  if (r.length === liste.length) return r.join(' ')
  while (r.length > 1 && LIAISONS.has(r[r.length - 1]!.toLowerCase())) r.pop()
  return `${r.join(' ')}…`
}
