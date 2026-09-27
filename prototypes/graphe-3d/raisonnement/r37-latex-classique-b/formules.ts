// R37 (essai B) · Extraction générique des formules d'un énoncé écrit en Unicode, puis rendu KaTeX.
//
// Règle (aucune liste propre à un jeu de données) :
//
//  1. Découpage en jetons sur les espaces ; la ponctuation de tête « ( [ » et de queue « , ; : . ! ? ) ] »
//     devient des jetons séparés (la virgule décimale « 9,81 » reste dans le nombre).
//  2. Classe de chaque jeton :
//       REL   relation  = ≈ ≃ ∝ < > ≤ ≥ ≠ ≡ ∼ →
//       OP    opérateur + − - × · / ± ∓
//       NUM   nombre    12  0,86  −3
//       MATH  jeton qui contient une lettre grecque, un exposant ou un indice Unicode, une lettre
//             mathématique grasse, ∂ ∇ Σ ′, un « _ », ou un opérateur collé à une lettre (d𝐩/dt, −g)
//       VAR   une lettre latine isolée (v, g, T), sauf « a » (verbe avoir)
//       MOT   tout le reste
//  3. Une « course » est une suite maximale de jetons REL / OP / NUM / MATH / VAR / parenthèses.
//     Elle se prolonge : après un OP, par des MOTS (écrits \text{…}) jusqu'au prochain opérateur ou
//     ponctuation (« + flux entrant − flux sortant ») ; après une REL, par au plus trois MOTS
//     (« = constante ») ; par une virgule si la suite est elle-même une relation (« 𝐠 = −g𝐞_y, g = 9,81 »).
//  4. Une course qui contient une relation est une FORMULE ; sinon, si elle contient MATH ou VAR, c'est
//     une expression en ligne ; un nombre seul reste du texte. Parenthèses appariées aux deux bouts et
//     opérateurs orphelins sont rendus au texte.
//  5. Traduction : grec → \alpha…, ²³⁻¹ → ^{…}, ₀ₛ → _{…}, _ext → _{\mathrm{ext}}, 𝐩 → \mathbf{p},
//     ′ → ', − → -, ± ≈ ∝ → … ; « 9,81 » → 9{,}81 ; une unité après un nombre (m·s⁻²) → \mathrm{m\,s^{-2}}.
//     En formule hors texte, « A / B » devient \frac{A}{B} (A = produit de facteurs depuis le dernier
//     + − ou relation ; B = facteur suivant ou groupe parenthésé, parenthèses ôtées).
//  6. La formule « principale » d'un énoncé (affichée dans le bloc) est la plus longue course à relation.

declare global {
  interface Window {
    katex?: { renderToString(tex: string, options?: Record<string, unknown>): string }
  }
}

type Classe = 'REL' | 'OP' | 'NUM' | 'MATH' | 'VAR' | 'MOT' | 'OUV' | 'FER' | 'PONCT'

interface Jeton {
  t: string
  c: Classe
  /** Espace avant le jeton dans le texte d'origine. */
  espace: boolean
}

export interface Segment {
  genre: 'texte' | 'math' | 'formule'
  /** Texte d'origine (texte) ou LaTeX (math, formule). */
  valeur: string
  /** Formule : LaTeX hors texte (fractions). */
  hors?: string
  /** Nombre de jetons (pour choisir la formule principale). */
  poids: number
}

const GREC: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'varepsilon', ϵ: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ϑ: 'vartheta',
  ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma', ς: 'varsigma', τ: 'tau',
  υ: 'upsilon', φ: 'varphi', ϕ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
  Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi', Σ: 'Sigma', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
}
const EXPOSANTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', ⁿ: 'n', ⁱ: 'i',
}
const INDICES: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')', ₐ: 'a', ₑ: 'e', ₒ: 'o', ₓ: 'x', ₕ: 'h', ₖ: 'k', ₗ: 'l', ₘ: 'm',
  ₙ: 'n', ₚ: 'p', ₛ: 's', ₜ: 't', ᵢ: 'i', ⱼ: 'j', ᵣ: 'r', ᵤ: 'u', ᵥ: 'v',
}
const SYMBOLES: Record<string, string> = {
  '−': '-', '×': '\\times ', '·': '\\cdot ', '±': '\\pm ', '∓': '\\mp ', '≈': '\\approx ', '≃': '\\simeq ', '∝': '\\propto ',
  '≤': '\\le ', '≥': '\\ge ', '≠': '\\neq ', '≡': '\\equiv ', '∼': '\\sim ', '→': '\\to ', '∂': '\\partial ', '∇': '\\nabla ',
  '∞': '\\infty ', '√': '\\sqrt ', '′': "'", '″': "''", '∑': '\\sum ', '∫': '\\int ', '⟨': '\\langle ', '⟩': '\\rangle ',
  '%': '\\%', '{': '\\{', '}': '\\}', '#': '\\#', '&': '\\&', '$': '\\$', '~': '\\sim ',
}
const RELATIONS = new Set(['=', '≈', '≃', '∝', '<', '>', '≤', '≥', '≠', '≡', '∼', '→'])
const OPERATEURS = new Set(['+', '−', '-', '×', '·', '/', '±', '∓'])
const PONCT_TETE = /^[([]/
const PONCT_QUEUE = /[,;:.!?)\]]$/
const UNITE = /^(?:(?:k|m|c|µ|n)?(?:m|s|g|N|J|W|K|Hz|Pa|rad|V|A|mol)(?:[⁻]?[⁰¹²³⁴]+)?)(?:·(?:k|m|c|µ|n)?(?:m|s|g|N|J|W|K|Hz|Pa|rad|V|A|mol)(?:[⁻]?[⁰¹²³⁴]+)?)*$/

/** Lettre mathématique grasse (𝐀…𝐳, 𝟎…𝟗) → caractère latin, sinon null. */
function grasVersLatin(cp: number): string | null {
  if (cp >= 0x1d400 && cp <= 0x1d419) return String.fromCharCode(65 + cp - 0x1d400)
  if (cp >= 0x1d41a && cp <= 0x1d433) return String.fromCharCode(97 + cp - 0x1d41a)
  if (cp >= 0x1d7ce && cp <= 0x1d7d7) return String.fromCharCode(48 + cp - 0x1d7ce)
  return null
}

const estGrec = (ch: string) => ch in GREC
const estExposant = (ch: string) => ch in EXPOSANTS
const estIndice = (ch: string) => ch in INDICES

function classer(t: string): Classe {
  if (t === '(' || t === '[') return 'OUV'
  if (t === ')' || t === ']') return 'FER'
  if (t === ',' || t === ';' || t === ':' || t === '.' || t === '!' || t === '?') return 'PONCT'
  if (RELATIONS.has(t)) return 'REL'
  if (OPERATEURS.has(t)) return 'OP'
  if (/^[−-]?\d+(?:[,.]\d+)?$/.test(t)) return 'NUM'
  for (const ch of t) {
    const cp = ch.codePointAt(0)!
    if (estGrec(ch) || estExposant(ch) || estIndice(ch) || grasVersLatin(cp) !== null || '∂∇Σ∑∫′″√∞_'.includes(ch)) return 'MATH'
  }
  if (/[A-Za-z0-9)][=+×·/−][A-Za-z0-9(]/.test(t) || /^[−][A-Za-z0-9]/.test(t)) return 'MATH'
  if (/^[A-Za-z]$/.test(t) && t !== 'a') return 'VAR'
  return 'MOT'
}

/** Jetons d'un texte, ponctuation séparée ; `espace` : précédé d'une espace dans le texte d'origine. */
function jetons(texte: string): Jeton[] {
  const r: Jeton[] = []
  texte.split(/\s+/).filter(Boolean).forEach((mot, wi) => {
    let t = mot
    const tete: string[] = []
    const queue: string[] = []
    while (t.length > 1 && PONCT_TETE.test(t)) {
      tete.push(t[0]!)
      t = t.slice(1)
    }
    // Queue : la virgule décimale reste dans le nombre ; une parenthèse appariée dans le jeton reste.
    while (t.length > 1 && PONCT_QUEUE.test(t)) {
      const ch = t[t.length - 1]!
      if (ch === ')' && (t.match(/\(/g)?.length ?? 0) >= (t.match(/\)/g)?.length ?? 0)) break
      if (ch === ']' && (t.match(/\[/g)?.length ?? 0) >= (t.match(/\]/g)?.length ?? 0)) break
      queue.unshift(ch)
      t = t.slice(0, -1)
    }
    ;[...tete, t, ...queue].forEach((x, k) => r.push({ t: x, c: classer(x), espace: k === 0 && wi > 0 }))
  })
  return r
}

// ─── Traduction d'un jeton ───────────────────────────────────────────────────

function latexJeton(t: string): string {
  let s = ''
  const cars = [...t]
  for (let i = 0; i < cars.length; i++) {
    const ch = cars[i]!
    const cp = ch.codePointAt(0)!
    const gras = grasVersLatin(cp)
    if (gras !== null) s += `\\mathbf{${gras}}`
    else if (estGrec(ch)) s += `\\${GREC[ch]} `
    else if (estExposant(ch)) {
      let e = ''
      while (i < cars.length && estExposant(cars[i]!)) e += EXPOSANTS[cars[i++]!]
      i--
      s += `^{${e}}`
    } else if (estIndice(ch)) {
      let e = ''
      while (i < cars.length && estIndice(cars[i]!)) e += INDICES[cars[i++]!]
      i--
      s += `_{${e}}`
    } else if (ch === '_') {
      let e = ''
      i++
      while (i < cars.length && /[A-Za-z0-9]/.test(cars[i]!)) e += cars[i++]!
      i--
      s += e.length > 1 && /[A-Za-z]/.test(e) ? `_{\\mathrm{${e}}}` : `_{${e}}`
    } else if (ch === ',' && /\d/.test(cars[i - 1] ?? '') && /\d/.test(cars[i + 1] ?? '')) s += '{,}'
    else if (ch in SYMBOLES) s += SYMBOLES[ch]
    else s += ch
  }
  return s
}

function latexUnite(t: string): string {
  return `\\mathrm{${t.split('·').map((u) => latexJeton(u)).join('\\,')}}`
}

const echapperTexte = (t: string) => t.replace(/[\\{}$&#%_^~]/g, (c) => `\\${c === '\\' ? 'textbackslash{}' : c}`)

/** Découpe un jeton contenant « / » interne (d𝐩/dt, h₁/h₂) en trois jetons, pour les fractions. */
function eclaterBarre(l: Jeton[]): Jeton[] {
  const r: Jeton[] = []
  for (const j of l) {
    const k = j.t.indexOf('/')
    if (j.c === 'MATH' && k > 0 && k < j.t.length - 1 && !j.t.includes('(')) {
      r.push({ t: j.t.slice(0, k), c: 'MATH', espace: j.espace }, { t: '/', c: 'OP', espace: false }, { t: j.t.slice(k + 1), c: 'MATH', espace: false })
    } else r.push(j)
  }
  return r
}

/** LaTeX d'une course ; `hors` : fractions pour une formule hors texte. */
function latexCourse(l: Jeton[], hors: boolean): string {
  const js = hors ? eclaterBarre(l) : l
  // Facteurs : chaque élément LaTeX, avec son rôle pour délimiter les opérandes d'une fraction.
  const elems: { tex: string; c: Classe }[] = []
  for (let i = 0; i < js.length; i++) {
    const j = js[i]!
    const prec = js[i - 1]
    if (j.c === 'MOT') {
      let mots = j.t
      while (js[i + 1]?.c === 'MOT') mots += ' ' + js[++i]!.t
      elems.push({ tex: `\\text{${echapperTexte(mots)}}`, c: 'MOT' })
    } else if (j.c === 'PONCT') elems.push({ tex: j.t === ',' ? ',\\quad ' : j.t, c: 'PONCT' })
    else if ((j.c === 'VAR' || j.c === 'MATH') && prec?.c === 'NUM' && UNITE.test(j.t)) elems.push({ tex: `\\,${latexUnite(j.t)}`, c: 'MATH' })
    else if (j.c === 'NUM' && prec?.c === 'NUM' && /^\d{3}$/.test(j.t)) elems[elems.length - 1]!.tex += `\\,${j.t}`
    else elems.push({ tex: latexJeton(j.t), c: j.c })
  }
  if (!hors) return elems.map((e) => e.tex).join(' ')
  // Fractions : A / B avec A = facteurs depuis la dernière frontière (+ − relation), B = facteur ou groupe.
  const sortie: { tex: string; c: Classe }[] = []
  for (let i = 0; i < elems.length; i++) {
    const e = elems[i]!
    if (!(e.c === 'OP' && e.tex === '/')) {
      sortie.push(e)
      continue
    }
    // Numérateur.
    let k = sortie.length
    let prof = 0
    while (k > 0) {
      const x = sortie[k - 1]!
      if (x.c === 'FER') prof++
      else if (x.c === 'OUV') {
        if (prof === 0) break
        prof--
      } else if (prof === 0 && (x.c === 'REL' || x.c === 'PONCT' || x.c === 'MOT' || (x.c === 'OP' && x.tex !== '/'))) break
      k--
    }
    let num = sortie.splice(k)
    // Dénominateur : un groupe parenthésé ou un facteur.
    let den: { tex: string; c: Classe }[] = []
    let m = i + 1
    if (elems[m]?.c === 'OUV') {
      let p = 0
      for (; m < elems.length; m++) {
        const x = elems[m]!
        if (x.c === 'OUV') p++
        else if (x.c === 'FER') p--
        den.push(x)
        if (p === 0) break
      }
      den = den.slice(1, -1)
    } else if (elems[m]) den = [elems[m]!]
    if (!num.length || !den.length) {
      sortie.push(...num, e)
      continue
    }
    if (num.length > 2 && num[0]!.c === 'OUV' && num[num.length - 1]!.c === 'FER') num = num.slice(1, -1)
    sortie.push({ tex: `\\frac{${num.map((x) => x.tex).join(' ')}}{${den.map((x) => x.tex).join(' ')}}`, c: 'MATH' })
    i = m
  }
  return sortie.map((x) => x.tex).join(' ')
}

// ─── Segmentation ────────────────────────────────────────────────────────────

const mathematique = (c: Classe) => c === 'REL' || c === 'OP' || c === 'NUM' || c === 'MATH' || c === 'VAR' || c === 'OUV' || c === 'FER'

/** Profondeur de parenthèses d'une suite de jetons (caractères comptés, jetons composés compris). */
function equilibre(l: Jeton[]): boolean {
  let p = 0
  for (const j of l) for (const ch of j.t) {
    if (ch === '(' || ch === '[') p++
    else if ((ch === ')' || ch === ']') && --p < 0) return false
  }
  return p === 0
}

/** Découpe un texte en segments texte / math en ligne / formule (course à relation). */
export function segmenter(texte: string): Segment[] {
  const js = jetons(texte)
  const segs: Segment[] = []
  const ajouterTexte = (s: string) => {
    if (!s) return
    const d = segs[segs.length - 1]
    if (d?.genre === 'texte') d.valeur += s
    else segs.push({ genre: 'texte', valeur: s, poids: 0 })
  }
  const texteJeton = (j: Jeton) => (j.espace ? ' ' : '') + j.t
  let i = 0
  while (i < js.length) {
    const j = js[i]!
    if (!mathematique(j.c)) {
      ajouterTexte(texteJeton(j))
      i++
      continue
    }
    // Course : jetons mathématiques, prolongée par des mots après un opérateur ou une relation.
    const course: Jeton[] = []
    let k = i
    while (k < js.length) {
      const x = js[k]!
      if (mathematique(x.c)) {
        course.push(x)
        k++
        continue
      }
      const dernier = course[course.length - 1]
      const aRelation = course.some((y) => y.c === 'REL')
      if (x.c === 'MOT' && dernier?.c === 'OP' && aRelation) {
        while (js[k]?.c === 'MOT') course.push(js[k++]!)
        continue
      }
      if (x.c === 'MOT' && dernier?.c === 'REL') {
        let n = 0
        while (js[k]?.c === 'MOT' && n < 3) {
          course.push(js[k++]!)
          n++
        }
        continue
      }
      if (x.t === ',' && aRelation) {
        let m = k + 1
        let rel = false
        while (m < js.length && mathematique(js[m]!.c)) if (js[m++]!.c === 'REL') rel = true
        if (rel && m > k + 2) {
          course.push(x)
          k++
          continue
        }
      }
      break
    }
    // Rendre au texte : parenthèses appariées aux deux bouts, parenthèses et opérateurs orphelins.
    let debut = 0, fin = course.length
    let change = true
    while (change && debut < fin) {
      change = false
      const a = course[debut]!, b = course[fin - 1]!
      if (a.c === 'OUV' && b.c === 'FER' && fin - debut > 2 && equilibre(course.slice(debut + 1, fin - 1))) {
        debut++
        fin--
      } else if (b.c === 'OUV' || b.c === 'OP' || b.c === 'PONCT' || b.c === 'REL') fin--
      else if (a.c === 'FER' || (a.c === 'OP' && a.t !== '−' && a.t !== '±')) debut++
      else if (a.c === 'OUV' && !equilibre(course.slice(debut, fin))) debut++
      else if (b.c === 'FER' && !equilibre(course.slice(debut, fin))) fin--
      else continue
      change = true
    }
    const coeur = course.slice(debut, fin)
    const aRel = coeur.some((y) => y.c === 'REL')
    const aMath = coeur.some((y) => y.c === 'MATH' || y.c === 'VAR' || (y.c === 'NUM' && coeur.length > 1))
    if (!coeur.length || (!aRel && !aMath)) for (const x of course) ajouterTexte(texteJeton(x))
    else {
      for (const x of course.slice(0, debut)) ajouterTexte(texteJeton(x))
      if (coeur[0]!.espace) ajouterTexte(' ')
      segs.push(aRel
        ? { genre: 'formule', valeur: latexCourse(coeur, false), hors: latexCourse(coeur, true), poids: coeur.length }
        : { genre: 'math', valeur: latexCourse(coeur, false), poids: coeur.length })
      for (const x of course.slice(fin)) ajouterTexte(texteJeton(x))
    }
    i = k
  }
  return segs
}

/** Formule principale d'un énoncé : la plus longue course à relation (LaTeX hors texte), sinon null. */
export function formulePrincipale(texte: string): string | null {
  let meilleure: Segment | null = null
  for (const s of segmenter(texte)) if (s.genre === 'formule' && (!meilleure || s.poids > meilleure.poids)) meilleure = s
  return meilleure?.hors ?? null
}

// ─── Rendu ───────────────────────────────────────────────────────────────────

const cacheRendu = new Map<string, string>()

/** HTML KaTeX d'une expression (repli : le LaTeX en italique si KaTeX n'est pas chargé). */
export function katexHtml(tex: string, affiche = false): string {
  const cle = `${affiche ? 'D' : 'T'}${tex}`
  const c = cacheRendu.get(cle)
  if (c !== undefined) return c
  let h: string
  const k = window.katex
  if (k) {
    try {
      h = k.renderToString(affiche ? `\\displaystyle ${tex}` : tex, { throwOnError: false, strict: 'ignore', output: 'html' })
    } catch {
      h = `<i>${echapperHtml(tex)}</i>`
    }
  } else h = `<i>${echapperHtml(tex)}</i>`
  cacheRendu.set(cle, h)
  return h
}

const echapperHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** HTML d'un texte : le texte tel quel, expressions et formules en mathématiques en ligne. */
export function texteHtml(texte: string): string {
  return segmenter(texte).map((s) => (s.genre === 'texte' ? echapperHtml(s.valeur) : katexHtml(s.valeur))).join('')
}

/** Nombre en notation française (virgule décimale), en LaTeX. */
export const nombreTex = (x: number, chiffres = 2) => x.toFixed(chiffres).replace('.', '{,}')

/** Chiffres romains minuscules (hypothèses (i), (ii)…). */
export function romain(n: number): string {
  const t: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let r = ''
  for (const [v, s] of t) while (n >= v) {
    r += s
    n -= v
  }
  return r
}
