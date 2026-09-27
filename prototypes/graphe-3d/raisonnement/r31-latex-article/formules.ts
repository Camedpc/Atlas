// R31 · Formules : découpage d'un énoncé en texte, mathématiques en ligne et équations hors texte,
// puis conversion Unicode → LaTeX pour KaTeX. Aucune donnée de jeu codée en dur.
//
// Règle d'extraction (générique, appliquée à tout énoncé, hypothèse de choix ou question de décision) :
//
//   0. Annotation explicite : un segment `$…$` est une formule en ligne, `$$…$$` une équation hors
//      texte ; leur contenu est pris tel quel (déjà en LaTeX). Si l'énoncé en contient, les règles
//      suivantes ne s'appliquent pas.
//   1. Jetons : l'énoncé est découpé aux espaces, chaque relation (= ≈ ≃ ≠ < > ≤ ≥ → ∝ ≡ ⇒) formant un
//      jeton à part (hors accolades : « _{t ≥ 0} » reste entier). Un jeton est « mathématique » si, une fois retirés ses indices (`_x`, `_{…}`, `_ext`),
//      ses crochets de bord et sa ponctuation finale, il ne contient ni trois lettres latines consécutives
//      (sauf fonctions : sin, exp, max…), ni apostrophe typographique (« l’altitude »), et n'est pas un
//      petit mot français (de, la, à, et, en…). Exceptions : « a » (verbe) et « y » après « il » / « n’ ».
//      Un jeton mathématique « porte un symbole » s'il contient une lettre (latine, grecque, grasse).
//   2. Relations : autour de chaque relation on étend à gauche puis à droite tant que les jetons sont
//      mathématiques. Une ponctuation de fin de proposition (, ; . :) arrête l'extension : à gauche le
//      jeton qui la porte est exclu, à droite il est inclus (la ponctuation reste hors de la formule).
//      Dans une parenthèse ouverte, la ponctuation ne coupe pas (« b ∈ W^{1,∞}(𝕋^d ; ℝ^d) », « W(t, x) = … »).
//      Les relations enchaînées (« a / b = c / d ») forment une seule formule. Il faut un membre non vide
//      de chaque côté et au moins un symbole. Parenthèses déséquilibrées aux bords : rendues au texte.
//   3. Hors texte ou en ligne : une relation est composée hors texte (équation numérotée) si ses deux
//      membres portent un symbole (un second membre nul « 0 », « 𝟎 » compte comme tel) et qu'elle compte
//      au moins quatre jetons hors relations ; sinon en ligne. Les sigles (« SP1 », « IA ») sont du texte.
//      Une formule identique à une équation déjà numérotée reprend son numéro (article.ts).
//      Ainsi « v² = g h₂ / (1 − α − β) » est numérotée, « T′ ≈ 0 » ou « α ≈ 0,10 ± 0,04 » restent en ligne.
//   4. Symboles isolés : toute suite maximale de jetons mathématiques restants qui porte un symbole est
//      composée en ligne (« où s est l’abscisse », « T′ − λ g y est constant », « 50 m »). Les nombres
//      seuls (« 2 000 tiges », « 2013 ») restent du texte.
//   5. Conversion : lettres grecques → \alpha…, lettres mathématiques Unicode → \mathbf, \mathcal,
//      \mathbb, \mathfrak… (ℝ, ℙ… → \mathbb), div / grad / rot → \operatorname, indices et
//      exposants Unicode → _{…} ^{…}, `_mot` → _{\text{mot}}, primes → ', opérateurs (− · × ± ∂ …) →
//      commandes, virgule décimale → {,}, unité après un nombre → \,\mathrm{…}, fonctions → \sin….

export type Segment =
  | { genre: 'texte'; texte: string }
  | { genre: 'math'; tex: string; brut: string }
  | { genre: 'equation'; tex: string; brut: string; ponct: string }

// ─── Jetons ──────────────────────────────────────────────────────────────────

const RELATIONS = new Set(['=', '≈', '≃', '≠', '<', '>', '≤', '≥', '→', '∝', '≡', '⇒', '∈', '∼', '⊂'])
const FONCTIONS = new Set(['sin', 'cos', 'tan', 'exp', 'ln', 'log', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'div', 'grad', 'rot', 'arg', 'sinh', 'cosh', 'tanh', 'cte'])
const PETITS_MOTS = new Set([
  'de', 'la', 'le', 'les', 'un', 'une', 'et', 'en', 'du', 'des', 'au', 'aux', 'à', 'ou', 'où', 'ne', 'sa', 'se', 'ce',
  'il', 'on', 'si', 'par', 'sur', 'est', 'qui', 'que', 'soit', 'car', 'pas', 'ni', 'sans', 'a', 'd’', 'l’',
])
const PONCT_FIN = /[,;.:!?]+$/u
const LETTRE = /[A-Za-z\u0370-\u03FF\u2119\u211D\u2124\u2115\u211A\u2102\u2113]|[\u{1D400}-\u{1D7CB}]/u

interface Jeton {
  brut: string
  /** Sans ponctuation finale. */
  coeur: string
  /** Ponctuation finale (fin de proposition). */
  ponct: string
  relation: boolean
  math: boolean
  symbole: boolean
}

function sansIndices(t: string): string {
  return t.replace(/_(\{[^}]*\}|[A-Za-z0-9]+)/gu, '')
}

function classer(brut: string, precedent: string | undefined): Jeton {
  const m = brut.length > 1 ? brut.match(PONCT_FIN) : null
  const ponct = m ? m[0] : ''
  const coeur = ponct ? brut.slice(0, -ponct.length) : brut
  if (RELATIONS.has(brut)) return { brut, coeur: brut, ponct: '', relation: true, math: true, symbole: false }
  const nu = coeur.replace(/^[([{]+|[)\]}]+$/gu, '')
  const bas = nu.toLowerCase()
  let math = nu.length > 0
  if (!/[\p{L}\p{N}]|[−+±×·∂∑∫√∞′/]/u.test(nu)) math = false
  if (PETITS_MOTS.has(bas)) math = false
  if (/[’']\p{L}/u.test(nu)) math = false
  // Sigles et identifiants (« SP1 », « IA », « EDP ») : du texte.
  if (/^[A-Z]{2,}\d*$/u.test(nu)) math = false
  if (bas === 'y' && precedent && /^(il|n’|n')$/iu.test(precedent)) math = false
  if (math && !FONCTIONS.has(nu)) {
    const mots = sansIndices(nu).match(/[A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]{3,}/gu)
    if (mots && mots.some((w) => !FONCTIONS.has(w))) math = false
    if (/[À-ÖØ-öø-ÿŒœÆæ]/u.test(nu)) math = false
  }
  const symbole = math && LETTRE.test(nu)
  return { brut, coeur, ponct, relation: false, math, symbole }
}

/** Isole les relations en jetons, sauf à l'intérieur d'accolades (« (𝓕_t)_{t ≥ 0} » reste entier). */
function espacerRelations(texte: string): string {
  let r = ''
  let prof = 0
  for (const c of texte) {
    if (c === '{') prof++
    else if (c === '}') prof = Math.max(0, prof - 1)
    r += prof === 0 && RELATIONS.has(c) ? ` ${c} ` : c
  }
  return r
}

function jetons(texte: string): Jeton[] {
  const brut = espacerRelations(texte).split(/\s+/u).filter(Boolean)
  return brut.map((b, k) => classer(b, brut[k - 1]))
}

// ─── Découpage ───────────────────────────────────────────────────────────────

const OPERATEUR = /^[+−\-·×/±∓]$/u

/** Vrai si le jeton k ouvre une parenthèse qui contient une relation : c'est une remarque, pas un facteur. */
function remarqueEntreParentheses(js: Jeton[], k: number): boolean {
  if (!js[k]!.coeur.startsWith('(')) return false
  let prof = 0
  for (let m = k; m < js.length; m++) {
    const c = js[m]!.brut
    prof += (c.match(/\(/gu)?.length ?? 0) - (c.match(/\)/gu)?.length ?? 0)
    if (m > k && js[m]!.relation) return true
    if (prof <= 0) return false
  }
  return false
}

interface Formule {
  debut: number
  fin: number // inclus
  hors: boolean
}

/** Rend au texte les parenthèses de bord déséquilibrées. */
function equilibrer(s: string): { avant: string; corps: string; apres: string } {
  let avant = '', apres = ''
  let corps = s
  const compte = (x: string, c: string) => x.split(c).length - 1
  while (corps.startsWith('(') && compte(corps, '(') > compte(corps, ')')) {
    avant += '('
    corps = corps.slice(1)
  }
  while (corps.endsWith(')') && compte(corps, ')') > compte(corps, '(')) {
    apres = ')' + apres
    corps = corps.slice(0, -1)
  }
  return { avant, corps: corps.trim(), apres }
}

/** Découpe un texte selon la règle d'extraction (voir l'en-tête du fichier). */
export function segmenter(texte: string): Segment[] {
  if (/\$[^$]+\$/u.test(texte)) return segmenterExplicite(texte)
  const js = jetons(texte)
  const n = js.length
  const pris = new Int32Array(n).fill(-1)
  const formules: Formule[] = []
  // Règle 2 : relations.
  for (let i = 0; i < n; i++) {
    if (!js[i]!.relation || pris[i]! >= 0) continue
    let a = i
    // À gauche : une parenthèse fermée à droite et pas encore ouverte laisse passer la ponctuation (« W(t, x) »).
    let profG = 0
    while (a - 1 >= 0 && pris[a - 1]! < 0) {
      const t = js[a - 1]!
      const admis = (t.math && (!t.ponct || profG > 0)) || (profG > 0 && /^[;,]$/u.test(t.brut))
      if (!admis) break
      a--
      profG += (t.brut.match(/\)/gu)?.length ?? 0) - (t.brut.match(/\(/gu)?.length ?? 0)
    }
    let b = i
    if (!js[i]!.ponct) {
      let prof = 0
      const suivantAdmis = (k: number) => js[k]!.math || (prof > 0 && /^[;,]$/u.test(js[k]!.brut))
      while (b + 1 < n && suivantAdmis(b + 1) && pris[b + 1]! < 0 && !remarqueEntreParentheses(js, b + 1)) {
        b++
        prof += (js[b]!.brut.match(/\(/gu)?.length ?? 0) - (js[b]!.brut.match(/\)/gu)?.length ?? 0)
        if (js[b]!.ponct && prof <= 0) break
      }
      // « X = constante » : le mot unique du second membre s'écrit « cte ».
      if (b === i && b + 1 < n && /^constante?s?$/iu.test(js[b + 1]!.coeur)) b++
    }
    // Un opérateur en bord de formule (« … + flux entrant ») est rendu au texte.
    while (b > i && OPERATEUR.test(js[b]!.coeur) && !js[b]!.ponct) b--
    while (a < i && OPERATEUR.test(js[a]!.coeur)) a++
    const gauche = js.slice(a, i), droite = js.slice(i + 1, b + 1)
    if (!droite.length || droite.every((j) => j.relation) || gauche.some((j) => j.relation) && gauche.every((j) => j.relation)) continue
    const symG = gauche.some((j) => j.symbole), symD = droite.some((j) => j.symbole)
    // Premier membre sous-entendu (« …, ≈ 0 sur mousse ») : formule en ligne.
    if (gauche.length && !symG && !symD) continue
    const nb = [...gauche, ...droite].filter((j) => !j.relation).length
    // Second membre nul (« … = 𝟎 ») : compté comme symbolique.
    const nul = droite.length === 1 && /^[0𝟎]$/u.test(droite[0]!.coeur)
    const f: Formule = { debut: a, fin: b, hors: symG && (symD || nul) && nb >= 4 }
    for (let k = a; k <= b; k++) pris[k] = formules.length
    formules.push(f)
    i = b
  }
  // Règle 4 : suites de symboles restantes (sans relation : elles ont été traitées).
  for (let i = 0; i < n; i++) {
    if (pris[i]! >= 0 || !js[i]!.math || js[i]!.relation) continue
    let b = i
    if (!js[i]!.ponct) {
      while (b + 1 < n && js[b + 1]!.math && !js[b + 1]!.relation && pris[b + 1]! < 0) {
        b++
        if (js[b]!.ponct) break
      }
    }
    if (js.slice(i, b + 1).some((j) => j.symbole)) {
      for (let k = i; k <= b; k++) pris[k] = formules.length
      formules.push({ debut: i, fin: b, hors: false })
    }
    i = b
  }
  // Assemblage.
  const segs: Segment[] = []
  let texteCourant = ''
  const ajouterTexte = (t: string) => {
    if (!t) return
    texteCourant += (texteCourant && !/^[,.)]/u.test(t) && !texteCourant.endsWith('(') ? ' ' : '') + t
  }
  const viderTexte = () => {
    if (texteCourant) segs.push({ genre: 'texte', texte: texteCourant })
    texteCourant = ''
  }
  let i = 0
  while (i < n) {
    const f = pris[i]! >= 0 ? formules[pris[i]!]! : null
    if (!f) {
      ajouterTexte(js[i]!.brut)
      i++
      continue
    }
    const t = js.slice(f.debut, f.fin + 1)
    const ponct = t[t.length - 1]!.ponct
    const brut = t.map((j, k) => (k === t.length - 1 ? j.coeur : j.brut)).join(' ')
    const { avant, corps, apres } = equilibrer(brut)
    if (!corps) {
      ajouterTexte(brut + ponct)
      i = f.fin + 1
      continue
    }
    if (f.hors) {
      ajouterTexte(avant)
      viderTexte()
      // La ponctuation qui suit l'équation entre dans l'équation (usage typographique).
      let suite = apres + ponct
      let fin = ''
      if (!apres && !ponct && f.fin + 1 < n && /^[,;:.]$/u.test(js[f.fin + 1]!.brut)) {
        fin = js[f.fin + 1]!.brut
        i = f.fin + 2
      } else i = f.fin + 1
      if (!apres && ponct) {
        fin = ponct
        suite = ''
      }
      segs.push({ genre: 'equation', tex: versTex(corps), brut: corps, ponct: fin })
      ajouterTexte(suite)
      continue
    }
    ajouterTexte(avant)
    viderTexte()
    segs.push({ genre: 'math', tex: versTex(corps), brut: corps })
    texteCourant = apres + ponct
    i = f.fin + 1
  }
  viderTexte()
  return fusionnerTexte(segs)
}

/** Ponctuation qui suit une équation hors texte, composée dans l'équation. */
export function ponctuationTex(p: string): string {
  if (!p) return ''
  if (p === ':' || p === ';') return `\\;\\text{${p}}`
  return p
}

/** Espaces de liaison autour des formules en ligne (le rendu DOM les colle sinon). */
function fusionnerTexte(segs: Segment[]): Segment[] {
  const r: Segment[] = []
  for (const s of segs) {
    const prec = r[r.length - 1]
    if (s.genre === 'texte' && prec?.genre === 'texte') prec.texte += ' ' + s.texte
    else r.push(s.genre === 'texte' ? { ...s } : s)
  }
  for (let k = 0; k < r.length; k++) {
    const s = r[k]!
    if (s.genre !== 'texte') continue
    const avant = r[k - 1], apres = r[k + 1]
    if (avant && avant.genre !== 'texte' && !/^[,.)’]/u.test(s.texte)) s.texte = ' ' + s.texte
    if (apres && apres.genre !== 'texte' && !s.texte.endsWith('(')) s.texte = s.texte + ' '
  }
  return r
}

function segmenterExplicite(texte: string): Segment[] {
  const segs: Segment[] = []
  const re = /\$\$([^$]+)\$\$|\$([^$]+)\$/gu
  let dernier = 0
  for (const m of texte.matchAll(re)) {
    if (m.index! > dernier) segs.push({ genre: 'texte', texte: texte.slice(dernier, m.index) })
    if (m[1]) segs.push({ genre: 'equation', tex: m[1].trim(), brut: m[1].trim(), ponct: '' })
    else segs.push({ genre: 'math', tex: m[2]!.trim(), brut: m[2]!.trim() })
    dernier = m.index! + m[0].length
  }
  if (dernier < texte.length) segs.push({ genre: 'texte', texte: texte.slice(dernier) })
  return segs
}

// ─── Unicode → LaTeX ─────────────────────────────────────────────────────────

const GREC: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'varepsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota',
  κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma', τ: 'tau', υ: 'upsilon',
  φ: 'varphi', χ: 'chi', ψ: 'psi', ω: 'omega', Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi',
  Σ: 'Sigma', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
}
const SYMBOLES: Record<string, string> = {
  '∩': '\\cap ', '∪': '\\cup ', '∼': '\\sim ', '⊂': '\\subset ', '½': '\\tfrac{1}{2}', '∀': '\\forall ', '∃': '\\exists ',
  'ℓ': '\\ell ', 'ℙ': '\\mathbb{P}', 'ℝ': '\\mathbb{R}', 'ℤ': '\\mathbb{Z}', 'ℕ': '\\mathbb{N}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}',
  '−': '-', '·': '\\cdot ', '×': '\\times ', '±': '\\pm ', '∓': '\\mp ', '≈': '\\approx ', '≃': '\\simeq ',
  '≠': '\\neq ', '≤': '\\leq ', '≥': '\\geq ', '→': '\\to ', '∝': '\\propto ', '≡': '\\equiv ', '⇒': '\\Rightarrow ',
  '∂': '\\partial ', '∞': '\\infty ', '…': '\\ldots ', '′': "'", '″': "''", '∇': '\\nabla ', '∫': '\\int ',
  '∑': '\\sum ', '√': '\\sqrt ', '‖': '\\|', '%': '\\%', '∈': '\\in ', '∘': '\\circ ', '⟨': '\\langle ', '⟩': '\\rangle ',
}
const INDICES = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜᵢⱼᵣᵤᵥ'
const INDICES_A = '0123456789+-=()aeoxhklmnpstijruv'
const EXPOSANTS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ'
const EXPOSANTS_A = '0123456789+-=()ni'

/** Lettres mathématiques Unicode (gras, italique, ronde, gothique, ajourée) → commande LaTeX. */
const ALPHABETS: [number, string][] = [
  [0x1d400, '\\mathbf'], [0x1d434, ''], [0x1d468, '\\boldsymbol'], [0x1d49c, '\\mathcal'], [0x1d4d0, '\\mathcal'],
  [0x1d504, '\\mathfrak'], [0x1d538, '\\mathbb'], [0x1d56c, '\\mathfrak'], [0x1d5a0, '\\mathsf'], [0x1d670, '\\mathtt'],
]
function lettreMath(cp: number): string | null {
  if (cp >= 0x1d7ce && cp <= 0x1d7d7) return `\\mathbf{${String.fromCharCode(48 + cp - 0x1d7ce)}}`
  for (const [debut, cmd] of ALPHABETS) {
    if (cp < debut || cp >= debut + 52) continue
    const k = cp - debut
    const lettre = String.fromCharCode(k < 26 ? 65 + k : 97 + k - 26)
    // Ronde et ajourée n'existent qu'en capitales dans KaTeX : minuscules en italique simple.
    if (k >= 26 && (cmd.includes('mathcal') || cmd.includes('mathbb'))) return lettre
    return cmd ? `${cmd}{${lettre}}` : lettre
  }
  return null
}

/** Convertit une formule écrite en Unicode en source LaTeX (règle 5). */
export function versTex(s: string): string {
  let t = s
  // Indices en mots (`_ext`) et virgule décimale.
  t = t.replace(/_([A-Za-z]{2,})/gu, '_{\\text{$1}}')
  t = t.replace(/(\d),(\d)/gu, '$1{,}$2')
  // Unité après un nombre : « 9,81 m·s⁻² », « 50 m ».
  t = t.replace(/(\d)\s+([A-Za-z][A-Za-z·⁻⁰¹²³⁴⁵⁶⁷⁸⁹]*)(?=$|[\s,;.)])/gu, (_, d: string, u: string) => `${d}\\,\\mathrm{${u}}`)
  // Fonctions et « constante ».
  t = t.replace(/(?<![\\A-Za-z{])(sin|cos|tan|exp|ln|log|lim|max|min|sup|inf|det|sinh|cosh|tanh)(?![A-Za-z])/gu, '\\$1 ')
  t = t.replace(/(?<![\\A-Za-z{])(div|grad|rot)(?![A-Za-z])/gu, '\\operatorname{$1} ')
  t = t.replace(/(?<![\\A-Za-z{])(cte|constante|constant)(?![A-Za-z])/gu, '\\text{cte}')
  let r = ''
  const cars = [...t]
  for (let k = 0; k < cars.length; k++) {
    const c = cars[k]!
    const iBas = INDICES.indexOf(c), iHaut = EXPOSANTS.indexOf(c)
    if (iBas >= 0) {
      let x = ''
      while (k < cars.length && INDICES.indexOf(cars[k]!) >= 0) x += INDICES_A[INDICES.indexOf(cars[k++]!)]
      k--
      r += `_{${x}}`
      continue
    }
    if (iHaut >= 0) {
      let x = ''
      while (k < cars.length && EXPOSANTS.indexOf(cars[k]!) >= 0) x += EXPOSANTS_A[EXPOSANTS.indexOf(cars[k++]!)]
      k--
      r += `^{${x}}`
      continue
    }
    const g = lettreMath(c.codePointAt(0)!)
    if (g) {
      r += g
      continue
    }
    if (GREC[c]) {
      r += `\\${GREC[c]} `
      continue
    }
    if (SYMBOLES[c] !== undefined) {
      r += SYMBOLES[c]
      continue
    }
    r += c
  }
  // Un prime suivi d'un indice : T'_{0} convient à KaTeX ; espaces multiples réduits.
  return r.replace(/\s+/gu, ' ').trim()
}
