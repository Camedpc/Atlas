// R33 · Extraction de la formule d'un énoncé et conversion Unicode → LaTeX.
//
// Règle générique (aucun identifiant de jeu, aucune liste d'énoncés) :
//
//   0. Un champ LaTeX explicite gagne : le dernier segment délimité par $…$ ou \( … \) de l'énoncé.
//   1. Sinon on découpe l'énoncé en mots (espaces). Un mot est « mathématique » si, une fois retirés
//      la ponctuation de prose finale (, ; : .), les indices / exposants ASCII (_h, ^{n+1}) et les
//      fonctions usuelles (max, sup, exp, log…), il ne contient plus aucune suite de 2 lettres latines
//      ou plus, ni de lettre accentuée, ni d'apostrophe (« l’élan ») ; les mots d'une lettre non accentuée
//      (v, g, y) sont mathématiques.
//   2. Les mots mathématiques consécutifs forment un segment ; une ponctuation de prose en fin de mot
//      (« v², », « 𝐞_y, ») clôt le segment.
//   3. Un segment est une relation s'il contient =, ≈, ≃, ≡, <, >, ≤, ≥, ≠ ou ∝ avec au moins un mot
//      non opérateur de chaque côté. On écarte :
//        – les incises entre parenthèses « (α ≈ 0,10 ± 0,04) » (rappel, comparaison) ;
//        – les conditions, relations précédées de en / pour / où / si / avec / quand / lorsque / sous /
//          dès / tant (« T′ ≈ 0 en y = h₁ » garde T′ ≈ 0).
//   4. On retient la DERNIÈRE relation restante : en rédaction mathématique la conclusion vient en fin de
//      phrase (« …, soit T′₀ = −α λ v² »). Aucune relation : le nœud n'a pas de formule (nom en romain).
//   Pour un choix de modélisation, on cherche dans l'énoncé puis dans l'hypothèse du choix.
//
// La conversion (versTex) est une table de caractères : grec → \alpha…, indices / exposants Unicode →
// _{…} / ^{…}, gras mathématique 𝐭 → \mathbf{t}, 𝔼 → \mathbb{E}, 𝓕 → \mathcal{F}, − → -, ± → \pm,
// virgule décimale → {,}, mots de 2 lettres ou plus → \mathrm{…} (unités) sauf fonctions usuelles.

const RELATIONS = /[=≈≃≡<>≤≥≠∝⩽⩾]/
const OPERATEURS = /^[=≈≃≡<>≤≥≠∝⩽⩾+\-−±·×/→]+$/
const CONDITIONS = new Set(['en', 'pour', 'où', 'si', 'avec', 'quand', 'lorsque', 'sous', 'dès', 'tant'])
const FONCTIONS = ['max', 'min', 'sup', 'inf', 'exp', 'log', 'ln', 'sin', 'cos', 'tan', 'lim', 'det', 'tr', 'div', 'rot']
/** Fonctions qui ont une commande LaTeX ; les autres passent par \operatorname. */
const FONCTIONS_TEX = ['max', 'min', 'sup', 'inf', 'exp', 'log', 'ln', 'sin', 'cos', 'tan', 'lim', 'det']
const RE_FONCTIONS = new RegExp(`\\b(${FONCTIONS.join('|')})\\b`, 'g')

/** Vrai si le mot (sans ponctuation finale) est mathématique au sens de la règle 1. */
export function estMotMath(mot: string): boolean {
  if (!mot) return false
  if (/[’'"«»]/.test(mot.replace(/′|″/g, ''))) return false
  if (/[À-ÖØ-öø-ÿŒœ]/.test(mot)) return false
  let reste = mot
    .replace(/[_^]\{[^}]*\}/g, '')
    .replace(/[_^][A-Za-z0-9]+/g, '')
    .replace(RE_FONCTIONS, '')
  reste = reste.replace(/[()[\]{}]/g, '')
  if (/[A-Za-z]{2,}/.test(reste)) return false
  return reste.length > 0 || mot.length > 0
}

interface Mot {
  brut: string
  /** Sans la ponctuation de prose finale. */
  coeur: string
  /** Le mot clôt un segment (ponctuation de prose finale). */
  fin: boolean
}

function decouper(texte: string): Mot[] {
  return texte.split(/\s+/).filter(Boolean).map((brut) => {
    // Ponctuation de prose finale : , ; : . ! ? (pas la virgule décimale, entourée de chiffres).
    const m = /^(.*?)([,;:.!?]+)$/.exec(brut)
    const coeur = m ? m[1]! : brut
    return { brut, coeur, fin: !!m }
  })
}

interface Segment {
  mots: Mot[]
  avant: string
}

/** Formule LaTeX extraite d'un texte, ou null (règle documentée en tête de fichier). */
export function extraireFormule(texte: string | undefined): string | null {
  if (!texte) return null
  // 0. LaTeX explicite.
  const explicites = [...texte.matchAll(/\$([^$]+)\$|\\\((.+?)\\\)/g)].map((m) => (m[1] ?? m[2])!.trim())
  if (explicites.length) return explicites[explicites.length - 1]!
  const mots = decouper(texte)
  // 1-2. Segments de mots mathématiques.
  const segments: Segment[] = []
  let courant: Segment | null = null
  mots.forEach((m, k) => {
    const math = m.coeur !== '' && estMotMath(m.coeur)
    if (!math) {
      if (courant) segments.push(courant)
      courant = null
      return
    }
    if (!courant) courant = { mots: [], avant: k > 0 ? mots[k - 1]!.coeur.toLowerCase() : '' }
    courant.mots.push(m)
    if (m.fin) {
      segments.push(courant)
      courant = null
    }
  })
  if (courant) segments.push(courant)
  // 3. Relations, sans incises ni conditions.
  const retenues: string[] = []
  for (const s of segments) {
    let ms = s.mots.map((m) => m.coeur)
    // Opérateurs orphelins en bord de segment.
    while (ms.length && OPERATEURS.test(ms[0]!) && !/^[−-]\S/.test(ms[0]!)) ms = ms.slice(1)
    while (ms.length && OPERATEURS.test(ms[ms.length - 1]!)) ms = ms.slice(0, -1)
    if (!ms.length) continue
    const texteSeg = ms.join(' ')
    const ouvre = (texteSeg.match(/\(/g) ?? []).length, ferme = (texteSeg.match(/\)/g) ?? []).length
    // Incise : le segment commence par « ( » et la parenthèse ne se referme pas avant sa fin.
    if (ms[0]!.startsWith('(')) {
      let prof = 0, incise = true
      for (let i = 0; i < texteSeg.length; i++) {
        if (texteSeg[i] === '(') prof++
        else if (texteSeg[i] === ')') prof--
        if (prof === 0 && i < texteSeg.length - 1) {
          incise = false
          break
        }
      }
      if (incise || ouvre > ferme) continue
    }
    if (CONDITIONS.has(s.avant)) continue
    // Relation avec un membre de chaque côté.
    const iRel = ms.findIndex((m) => RELATIONS.test(m))
    if (iRel < 0) continue
    const seul = OPERATEURS.test(ms[iRel]!)
    const gauche = seul ? ms.slice(0, iRel) : [ms[iRel]!.split(RELATIONS)[0]!]
    const droite = seul ? ms.slice(iRel + 1) : [ms[iRel]!.split(RELATIONS).slice(1).join('')]
    if (!gauche.some((m) => m && !OPERATEURS.test(m)) || !droite.some((m) => m && !OPERATEURS.test(m))) continue
    // Parenthèse ouverte et jamais refermée : début d'une incise, coupée (« T_s = β λ v² (β = 0 pour… »).
    let t = texteSeg
    const pile: number[] = []
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '(') pile.push(i)
      else if (t[i] === ')') pile.pop()
    }
    if (pile.length) t = t.slice(0, pile[0]).trim()
    if (ferme > ouvre && t.endsWith(')')) t = t.slice(0, -1)
    if (!RELATIONS.test(t)) continue
    retenues.push(t)
  }
  // 4. La dernière relation dont les parenthèses et accolades sont bien formées.
  for (let k = retenues.length - 1; k >= 0; k--) {
    const tex = versTex(retenues[k]!)
    if (bienFormee(tex)) return tex
  }
  return null
}

/** Parenthèses et accolades équilibrées (jamais fermées avant d'être ouvertes). */
function bienFormee(tex: string): boolean {
  for (const [o, f] of [['(', ')'], ['{', '}']] as const) {
    let prof = 0
    for (const c of tex) {
      if (c === o) prof++
      else if (c === f && --prof < 0) return false
    }
    if (prof) return false
  }
  return true
}

// ─── Conversion Unicode → LaTeX ──────────────────────────────────────────────

const GREC: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'varepsilon', ϵ: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta',
  ϑ: 'vartheta', ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma',
  τ: 'tau', υ: 'upsilon', φ: 'varphi', ϕ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
  Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
}
const SYMBOLES: Record<string, string> = {
  '−': '-', '±': '\\pm ', '∓': '\\mp ', '·': '\\cdot ', '×': '\\times ', '≈': '\\approx ', '≃': '\\simeq ', '≡': '\\equiv ',
  '≤': '\\le ', '≥': '\\ge ', '⩽': '\\le ', '⩾': '\\ge ', '≠': '\\ne ', '∝': '\\propto ', '∂': '\\partial ', '′': "'", '″': "''",
  '→': '\\to ', '⇒': '\\Rightarrow ', '∇': '\\nabla ', '∞': '\\infty ', '√': '\\sqrt ', '‖': '\\|', '∈': '\\in ', '∉': '\\notin ',
  '⊂': '\\subset ', '∀': '\\forall ', '∃': '\\exists ', '∫': '\\int ', '∘': '\\circ ', '⟨': '\\langle ', '⟩': '\\rangle ',
  '∑': '\\sum ', '∏': '\\prod ', 'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}',
  '½': '\\tfrac12 ', '∼': '\\sim ', '%': '\\%', '#': '\\#', '&': '\\&', '…': '\\dots ',
}
const INDICES: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-',
  '₌': '=', '₍': '(', '₎': ')', 'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n',
  'ₚ': 'p', 'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ⱼ': 'j', 'ᵣ': 'r', 'ᵤ': 'u', 'ᵥ': 'v',
}
const EXPOSANTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-',
  '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ⁱ': 'i', 'ᵀ': 'T', '*': '*',
}

/** Alphabets mathématiques (plan 1) : gras, double barre, script. */
function alphabetMath(cp: number): string | null {
  if (cp >= 0x1d400 && cp <= 0x1d433) {
    const k = cp - 0x1d400
    return `\\mathbf{${String.fromCharCode(k < 26 ? 65 + k : 97 + k - 26)}}`
  }
  if (cp >= 0x1d7ce && cp <= 0x1d7d7) return `\\mathbf{${cp - 0x1d7ce}}`
  if (cp >= 0x1d538 && cp <= 0x1d551) return `\\mathbb{${String.fromCharCode(65 + cp - 0x1d538)}}`
  if (cp >= 0x1d4d0 && cp <= 0x1d4e9) return `\\mathcal{${String.fromCharCode(65 + cp - 0x1d4d0)}}`
  if (cp >= 0x1d49c && cp <= 0x1d4b5) return `\\mathcal{${String.fromCharCode(65 + cp - 0x1d49c)}}`
  if (cp >= 0x1d434 && cp <= 0x1d467) {
    const k = cp - 0x1d434
    return String.fromCharCode(k < 26 ? 65 + k : 97 + k - 26)
  }
  return null
}

/** Convertit une formule écrite en Unicode en LaTeX (mode mathématique). */
export function versTex(s: string): string {
  const cars = [...s]
  let r = ''
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i]!
    // Suites d'indices / d'exposants Unicode.
    if (INDICES[c] !== undefined || EXPOSANTS[c] !== undefined) {
      const table = INDICES[c] !== undefined ? INDICES : EXPOSANTS
      let g = ''
      while (i < cars.length && table[cars[i]!] !== undefined) g += table[cars[i++]!]
      i--
      r += `${table === INDICES ? '_' : '^'}{${g}}`
      continue
    }
    // Indice / exposant ASCII suivi d'un mot : _ext → _{\mathrm{ext}}.
    if ((c === '_' || c === '^') && cars[i + 1] !== '{') {
      let g = ''
      let k = i + 1
      while (k < cars.length && /[A-Za-z0-9]/.test(cars[k]!)) g += cars[k++]!
      if (g.length > 1 && /[A-Za-z]{2,}/.test(g)) {
        r += `${c}{\\mathrm{${g}}}`
        i = k - 1
        continue
      }
      if (g.length > 1) {
        r += `${c}{${g}}`
        i = k - 1
        continue
      }
      r += c
      continue
    }
    // Virgule décimale.
    if (c === ',' && /\d/.test(cars[i - 1] ?? '') && /\d/.test(cars[i + 1] ?? '')) {
      r += '{,}'
      continue
    }
    if (GREC[c]) {
      // Σ suivi d'un indice : une somme.
      r += `\\${GREC[c]} `
      continue
    }
    if (c === 'Σ') {
      r += /[_^₀-₉ₐ-ₜ]/.test(cars[i + 1] ?? '') ? '\\sum ' : '\\Sigma '
      continue
    }
    if (SYMBOLES[c] !== undefined) {
      r += SYMBOLES[c]
      continue
    }
    const cp = c.codePointAt(0)!
    if (cp > 0xffff) {
      const a = alphabetMath(cp)
      if (a) {
        r += a
        continue
      }
    }
    // Mot latin de 2 lettres ou plus : fonction usuelle ou texte droit (unités).
    if (/[A-Za-z]/.test(c)) {
      let mot = c
      let k = i + 1
      while (k < cars.length && /[A-Za-z]/.test(cars[k]!)) mot += cars[k++]!
      if (mot.length >= 2) {
        r += FONCTIONS_TEX.includes(mot) ? `\\${mot} ` : FONCTIONS.includes(mot) ? `\\operatorname{${mot}}` : `\\mathrm{${mot}}`
        i = k - 1
        continue
      }
    }
    r += c
  }
  return r.replace(/\s+/g, ' ').trim()
}

/** Formule d'un nœud : énoncé, puis hypothèse d'un choix de modélisation. */
export function formuleDuNoeud(n: { enonce: string; choix?: { hypothese: string } }): string | null {
  return extraireFormule(n.enonce) ?? extraireFormule(n.choix?.hypothese)
}

/** Texte échappé pour \text{…} (LaTeX et KaTeX). */
export function echapperTexte(s: string): string {
  return s.replace(/\\/g, '\\textbackslash{}').replace(/([{}#$%&_^])/g, '\\$1').replace(/~/g, '\\textasciitilde{}')
}
