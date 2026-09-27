// R38 · Formules : extraction des passages mathématiques d'un énoncé écrit en Unicode, conversion en
// LaTeX, rendu KaTeX (chargé depuis jsDelivr, sans paquet npm).
//
// Règle générique (aucun identifiant de jeu, aucune formule écrite à la main) :
//
//   1. Mots.   L'énoncé est découpé aux espaces ; la ponctuation de fin (, ; : .) et les parenthèses
//              non appariées sont détachées du mot.
//   2. Classe. Un mot est « fort » s'il contient une lettre grecque, un indice ou un exposant Unicode,
//              une lettre mathématique grasse (𝐩, 𝟎…), un opérateur (= ≈ < > ≤ ≥ ∝ ± × · − ∂ ∇ Σ ′…),
//              un indice ASCII (C_x, T_s), ou s'il est une lettre latine isolée (v, g, s…), sauf les
//              mots français « a », « à » et « y » suivi de « a ». Il est « neutre » s'il est un nombre,
//              un opérateur seul (+ − / = …) ou une unité (m·s⁻²) ; sinon c'est du texte.
//   3. Passages. Une suite maximale de mots forts ou neutres contenant au moins un mot fort est un
//              passage mathématique. Une ponctuation de fin de mot le clôt ; une parenthèse ouverte
//              dans le passage et fermée hors de lui le coupe avant elle ; les opérateurs en bord sont
//              rendus au texte.
//   4. Formule affichée. Parmi les passages qui contiennent une relation (= ≈ ≠ < > ≤ ≥ ∝ ∈) et ne
//              sont pas coupés (un passage qui finissait par un opérateur suivi de prose, comme
//              « d𝐩/dt = Σ𝐅 + flux entrant… », ne s'affiche pas), on prend le premier situé après le
//              premier deux-points de l'énoncé, sinon le premier. Deux passages séparés par un seul
//              mot de liaison (en, pour, si, avec, dans, quand, lorsque) sans ponctuation sont réunis
//              (« T′ ≈ 0 en y = h₁ »).
//   5. Conversion. Grec → \alpha…, indices/exposants → _{} ^{}, gras → \mathbf, ′ → ', − → -,
//              virgule décimale → {,}, unités après un nombre → \mathrm. En formule affichée, un
//              membre « A / (B) » sans + ni − au premier niveau devient \frac{A}{B} ; en ligne, la
//              barre oblique reste (usage typographique).

const VERSION_KATEX = '0.16.11'
const URL_KATEX = `https://cdn.jsdelivr.net/npm/katex@${VERSION_KATEX}/dist/katex.mjs`

interface Katex {
  renderToString(tex: string, options: Record<string, unknown>): string
}

let katex: Katex | null = null
let chargement: Promise<boolean> | null = null

/** Charge KaTeX une fois ; vrai s'il est disponible. */
export function chargerKatex(): Promise<boolean> {
  chargement ??= (async () => {
    try {
      const url: string = URL_KATEX
      const m = await import(/* @vite-ignore */ url)
      katex = (m.default ?? m) as Katex
      return true
    } catch (e) {
      console.warn('[R38] KaTeX indisponible, formules en texte brut', e)
      return false
    }
  })()
  return chargement
}

export const katexPret = (): boolean => katex !== null

// ─── Classes de caractères ───────────────────────────────────────────────────

const GREC: Record<string, string> = {
  α: '\\alpha', β: '\\beta', γ: '\\gamma', δ: '\\delta', ε: '\\varepsilon', ϵ: '\\epsilon', ζ: '\\zeta', η: '\\eta',
  θ: '\\theta', ϑ: '\\vartheta', ι: '\\iota', κ: '\\kappa', λ: '\\lambda', μ: '\\mu', ν: '\\nu', ξ: '\\xi', π: '\\pi',
  ρ: '\\rho', σ: '\\sigma', ς: '\\varsigma', τ: '\\tau', υ: '\\upsilon', φ: '\\varphi', ϕ: '\\phi', χ: '\\chi', ψ: '\\psi',
  ω: '\\omega', Γ: '\\Gamma', Δ: '\\Delta', Θ: '\\Theta', Λ: '\\Lambda', Ξ: '\\Xi', Π: '\\Pi', Σ: '\\Sigma',
  Φ: '\\Phi', Ψ: '\\Psi', Ω: '\\Omega',
}
const OPERATEURS: Record<string, string> = {
  '−': '-', '·': '\\cdot ', '×': '\\times ', '≈': '\\approx ', '≃': '\\simeq ', '≠': '\\neq ', '≤': '\\leq ', '≥': '\\geq ',
  '∝': '\\propto ', '±': '\\pm ', '∓': '\\mp ', '∂': '\\partial ', '∇': '\\nabla ', '∑': '\\sum ', '∫': '\\int ',
  '√': '\\sqrt ', '∞': '\\infty ', '→': '\\to ', '∈': '\\in ', '⊥': '\\perp ', '∥': '\\parallel ', '′': "'", '″': "''",
  '∼': '\\sim ', '⟨': '\\langle ', '⟩': '\\rangle ',
}
const INDICES = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜ'
const INDICES_EN = '0123456789+-=()aeoxhklmnpst'
const EXPOSANTS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ'
const EXPOSANTS_EN = '0123456789+-=()ni'
const RELATIONS = /[=≈≃≠<>≤≥∝∈]/
const UNITES = new Set(['m', 's', 'kg', 'N', 'J', 'W', 'Hz', 'K', 'Pa', 'mol', 'rad', 'mm', 'cm', 'km', 'ms'])
const LIAISONS = new Set(['en', 'pour', 'si', 'avec', 'dans', 'quand', 'lorsque'])

/** Lettre mathématique grasse (bloc U+1D400…) → caractère ASCII, sinon null. */
function grasVersAscii(c: string): string | null {
  const cp = c.codePointAt(0)!
  if (cp >= 0x1d400 && cp <= 0x1d419) return String.fromCharCode(65 + cp - 0x1d400)
  if (cp >= 0x1d41a && cp <= 0x1d433) return String.fromCharCode(97 + cp - 0x1d41a)
  if (cp >= 0x1d7ce && cp <= 0x1d7d7) return String.fromCharCode(48 + cp - 0x1d7ce)
  return null
}

const estNombre = (m: string) => /^[−-]?\d+(?:[,.]\d+)?$/.test(m)
const estOperateurSeul = (m: string) => /^[=≈≃≠<>≤≥∝±∓×·−+/→∼-]$/.test(m)
/** Unité SI (m·s⁻², kg, Hz…) ; une unité d'une seule lettre (m, s) seulement juste après un nombre. */
function estUnite(m: string, apresNombre = false): boolean {
  const parties = m.split('·')
  return parties.every((p) => UNITES.has(p.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+$/, ''))) &&
    (apresNombre || parties.length > 1 || /[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(m) || m.length > 1)
}

type Classe = 'fort' | 'neutre' | 'texte'

function classer(noyau: string, suivant: string | undefined, apresNombre: boolean): Classe {
  if (!noyau) return 'texte'
  if (estNombre(noyau) || estOperateurSeul(noyau)) return 'neutre'
  if (apresNombre && estUnite(noyau, true)) return 'neutre'
  if (/^[A-Za-z]$/.test(noyau)) {
    if (noyau === 'a' || noyau === 'A') return 'texte'
    if (noyau === 'y' && suivant && /^(a|avait|aura)$/.test(suivant)) return 'texte'
    return 'fort'
  }
  for (const c of noyau) {
    if (GREC[c] || OPERATEURS[c] || INDICES.includes(c) || EXPOSANTS.includes(c) || grasVersAscii(c)) {
      // Un mot français qui contient seulement « · » (rare) reste du texte.
      if (c === '·' && /^[\p{L}·]+$/u.test(noyau) && !estUnite(noyau)) continue
      return 'fort'
    }
  }
  if (/[=<>]/.test(noyau)) return 'fort'
  if (/^[\p{L}\p{N}]+_[\p{L}\p{N}]+/u.test(noyau)) return 'fort'
  if (estUnite(noyau)) return 'neutre'
  return 'texte'
}

// ─── Découpage ───────────────────────────────────────────────────────────────

interface Mot {
  /** Texte d'origine complet (avec ponctuation et espace qui suit). */
  brut: string
  avant: string
  noyau: string
  apres: string
  espace: string
  classe: Classe
}

export type Morceau =
  | { genre: 'texte'; t: string }
  | { genre: 'math'; source: string; tex: string; relation: boolean; coupe: boolean }

export interface Analyse {
  morceaux: Morceau[]
  /** Index (dans `morceaux`) des passages réunis en formule affichée, ou null. */
  affichee: number[] | null
  /** LaTeX de la formule affichée (fractions en \frac), ou null. */
  texAffichee: string | null
}

const cache = new Map<string, Analyse>()

function decouper(texte: string): Mot[] {
  const mots: Mot[] = []
  const re = /(\S+)(\s*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texte))) {
    const brut = m[1]!
    let avant = '', noyau = brut, apres = ''
    // Ponctuation de fin (hors virgule décimale), guillemets.
    const fin = /[,;:.!?»”]+$/.exec(noyau)
    if (fin && !/\d[,.]\d+$/.test(noyau)) {
      apres = fin[0] + apres
      noyau = noyau.slice(0, -fin[0].length)
    }
    const debut = /^[«“]+/.exec(noyau)
    if (debut) {
      avant = debut[0]
      noyau = noyau.slice(debut[0].length)
    }
    // Les parenthèses restent attachées au mot : l'équilibre est vérifié à l'échelle du passage.
    mots.push({ brut, avant, noyau, apres, espace: m[2]!, classe: 'texte' })
  }
  mots.forEach((w, k) => {
    const nu = (x: string | undefined) => x?.replace(/^\(+|\)+$/g, '')
    // Classer sans les parenthèses de bord ; une unité d'une lettre n'en est une qu'après un nombre.
    const prec = k > 0 && !mots[k - 1]!.apres ? nu(mots[k - 1]!.noyau) : undefined
    w.classe = classer(nu(w.noyau)!, nu(mots[k + 1]?.noyau), prec !== undefined && estNombre(prec))
  })
  return mots
}

/** Analyse d'un énoncé (mise en cache). */
export function analyser(texte: string): Analyse {
  const c = cache.get(texte)
  if (c) return c
  const mots = decouper(texte)
  // Passages : suites de mots forts / neutres avec au moins un fort.
  interface Passage { debut: number; fin: number; coupe: boolean }
  const passages: Passage[] = []
  let k = 0
  while (k < mots.length) {
    if (mots[k]!.classe === 'texte') {
      k++
      continue
    }
    let f = k
    let fort = mots[k]!.classe === 'fort'
    while (!mots[f]!.apres && f + 1 < mots.length && mots[f + 1]!.classe !== 'texte' && !mots[f + 1]!.avant) {
      f++
      if (mots[f]!.classe === 'fort') fort = true
    }
    if (fort) passages.push({ debut: k, fin: f, coupe: false })
    k = f + 1
  }
  // Équilibre des parenthèses : une « ( » fermée hors du passage le coupe avant elle.
  const equilibres: Passage[] = []
  for (const p of passages) {
    let file: Passage[] = [p]
    const sortie: Passage[] = []
    while (file.length) {
      const q = file.shift()!
      let prof = 0, coupeA = -1
      const ouvertes: number[] = []
      for (let i = q.debut; i <= q.fin; i++) {
        for (const ch of mots[i]!.noyau) {
          if (ch === '(') {
            prof++
            ouvertes.push(i)
          } else if (ch === ')') {
            if (prof > 0) {
              prof--
              ouvertes.pop()
            }
          }
        }
      }
      if (ouvertes.length) coupeA = ouvertes[0]!
      if (coupeA > q.debut) {
        sortie.push({ debut: q.debut, fin: coupeA - 1, coupe: false })
        // Le reste, sans la parenthèse ouvrante (rendue au texte), est analysé à part.
        mots[coupeA]!.avant += '('
        mots[coupeA]!.noyau = mots[coupeA]!.noyau.slice(1)
        file.push({ debut: coupeA, fin: q.fin, coupe: false })
      } else if (coupeA === q.debut && mots[q.debut]!.noyau.startsWith('(')) {
        mots[q.debut]!.avant += '('
        mots[q.debut]!.noyau = mots[q.debut]!.noyau.slice(1)
        file.push(q)
      } else sortie.push(q)
    }
    equilibres.push(...sortie)
  }
  // Parenthèse fermante finale sans ouvrante dans le passage : rendue au texte.
  for (const p of equilibres) {
    const w = mots[p.fin]!
    const o = [...mots.slice(p.debut, p.fin + 1)].reduce((s, x) => s + (x.noyau.match(/\(/g) ?? []).length - (x.noyau.match(/\)/g) ?? []).length, 0)
    if (o < 0 && w.noyau.endsWith(')')) {
      w.noyau = w.noyau.slice(0, -1)
      w.apres = ')' + w.apres
    }
    // Passage entièrement entre parenthèses, « (α ≈ 0,1) » : les parenthèses reviennent au texte.
    const d = mots[p.debut]!
    if (d.noyau.startsWith('(') && w.noyau.endsWith(')') && (p.fin > p.debut || d.noyau.length > 2)) {
      const interieur = mots.slice(p.debut, p.fin + 1).map((x) => x.noyau).join(' ').slice(1, -1)
      let prof = 0, ok = true
      for (const ch of interieur) {
        if (ch === '(') prof++
        else if (ch === ')' && --prof < 0) ok = false
      }
      if (ok && prof === 0) {
        d.avant += '('
        d.noyau = d.noyau.slice(1)
        w.noyau = w.noyau.slice(0, -1)
        w.apres = ')' + w.apres
      }
    }
  }
  // Opérateurs en bord rendus au texte ; un opérateur final suivi de prose marque le passage « coupé ».
  const valides: Passage[] = []
  for (const p of equilibres) {
    let { debut, fin } = p
    let coupe = false
    while (debut <= fin && estOperateurSeul(mots[debut]!.noyau) && mots[debut]!.noyau !== '−') debut++
    while (fin >= debut && estOperateurSeul(mots[fin]!.noyau)) {
      if (!mots[fin]!.apres && mots[fin + 1]?.classe === 'texte') coupe = true
      fin--
    }
    if (fin < debut) continue
    if (!mots.slice(debut, fin + 1).some((w) => w.classe === 'fort')) continue
    valides.push({ debut, fin, coupe })
  }
  valides.sort((a, b) => a.debut - b.debut)
  // Morceaux.
  const morceaux: Morceau[] = []
  const indexPassage: number[] = []
  let texteCourant = ''
  let i = 0
  for (const p of valides) {
    for (; i < p.debut; i++) texteCourant += recomposer(mots[i]!)
    texteCourant += mots[p.debut]!.avant
    if (texteCourant) morceaux.push({ genre: 'texte', t: texteCourant })
    texteCourant = ''
    const source = mots.slice(p.debut, p.fin + 1).map((w, n, l) => w.noyau + (n + 1 < l.length ? ' ' : '')).join('')
    const tex = versLatex(mots.slice(p.debut, p.fin + 1).map((w) => w.noyau))
    indexPassage.push(morceaux.length)
    morceaux.push({ genre: 'math', source, tex, relation: aRelation(source), coupe: p.coupe })
    texteCourant = mots[p.fin]!.apres + mots[p.fin]!.espace
    i = p.fin + 1
  }
  for (; i < mots.length; i++) texteCourant += recomposer(mots[i]!)
  if (texteCourant) morceaux.push({ genre: 'texte', t: texteCourant })

  // Formule affichée.
  let affichee: number[] | null = null
  const candidats = indexPassage.filter((x) => {
    const m = morceaux[x] as Extract<Morceau, { genre: 'math' }>
    return m.relation && !m.coupe
  })
  if (candidats.length) {
    // Le premier candidat après le premier deux-points (l'énoncé annonce sa formule), sinon le premier.
    const deuxPoints = texte.indexOf(':')
    const apres = deuxPoints >= 0 ? candidats.find((c) => positionDe(morceaux, c) > deuxPoints) : undefined
    const choisi = apres ?? candidats[0]!
    affichee = [choisi]
    // Réunion par un mot de liaison : math, « en », math (sans ponctuation).
    const t = morceaux[choisi + 1], suiv = morceaux[choisi + 2]
    if (t?.genre === 'texte' && suiv?.genre === 'math' && suiv.relation && !suiv.coupe && LIAISONS.has(t.t.trim()) && /^\s+\S+\s+$/.test(t.t)) {
      affichee.push(choisi + 2)
    }
  }
  let texAffichee: string | null = null
  if (affichee) {
    const parts = affichee.map((x) => fractions((morceaux[x] as Extract<Morceau, { genre: 'math' }>).tex))
    texAffichee = parts.length === 2 ? `${parts[0]}\\quad\\text{${(morceaux[affichee[0]! + 1] as { t: string }).t.trim()}}\\quad ${parts[1]}` : parts[0]!
  }
  const a: Analyse = { morceaux, affichee, texAffichee }
  cache.set(texte, a)
  return a
}

function positionDe(morceaux: Morceau[], index: number): number {
  let pos = 0
  for (let x = 0; x < index; x++) {
    const m = morceaux[x]!
    pos += m.genre === 'texte' ? m.t.length : m.source.length
  }
  return pos
}

function recomposer(w: Mot): string {
  return w.avant + w.noyau + w.apres + w.espace
}

const aRelation = (s: string) => {
  let prof = 0
  for (const c of s) {
    if (c === '(') prof++
    else if (c === ')') prof--
    else if (prof === 0 && RELATIONS.test(c)) return true
  }
  return false
}

// ─── Conversion Unicode → LaTeX ──────────────────────────────────────────────

function convertirMot(m: string, precedentNombre: boolean): string {
  if (precedentNombre && estUnite(m, true)) {
    return `\\,\\mathrm{${m.split('·').map((u) => convertirMot(u, false)).join('\\cdot ')}}`
  }
  let r = ''
  const cs = [...m]
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]!
    if (INDICES.includes(c)) {
      let s = ''
      while (i < cs.length && INDICES.includes(cs[i]!)) s += INDICES_EN[INDICES.indexOf(cs[i++]!)]
      i--
      r += `_{${s}}`
    } else if (EXPOSANTS.includes(c)) {
      let s = ''
      while (i < cs.length && EXPOSANTS.includes(cs[i]!)) s += EXPOSANTS_EN[EXPOSANTS.indexOf(cs[i++]!)]
      i--
      r += `^{${s}}`
    } else if (c === '_') {
      // Indice ASCII : un mot de plusieurs lettres est un indice textuel (droit).
      let s = ''
      i++
      while (i < cs.length && /[\p{L}\p{N}]/u.test(cs[i]!)) s += cs[i++]!
      i--
      r += s.length > 1 && /\p{L}/u.test(s) ? `_{\\mathrm{${s}}}` : `_{${s}}`
    } else if (GREC[c]) r += GREC[c] + ' '
    else if (OPERATEURS[c]) r += OPERATEURS[c]
    else if (grasVersAscii(c)) r += `\\mathbf{${grasVersAscii(c)}}`
    else if (c === ',' && /\d/.test(cs[i - 1] ?? '') && /\d/.test(cs[i + 1] ?? '')) r += '{,}'
    else if (c === '%') r += '\\%'
    else if (c === '{' || c === '}') r += '\\' + c
    else r += c
  }
  return r
}

function versLatex(mots: string[]): string {
  const r: string[] = []
  mots.forEach((m, k) => r.push(convertirMot(m, k > 0 && estNombre(mots[k - 1]!))))
  // Les \mathbf{…} et commandes ont déjà leur séparation ; les espaces entre mots n'ont pas d'effet en mode math.
  return r.join(' ').replace(/\s+/g, ' ').trim()
}

/** En formule affichée : un membre « A / (B) » (ou « A / B ») sans + ni − au premier niveau → \frac{A}{B}. */
function fractions(tex: string): string {
  // Découpe aux relations de premier niveau (en gardant les séparateurs).
  const membres = decouperNiveau(tex, /^(=|<|>|\\approx |\\simeq |\\neq |\\leq |\\geq |\\propto |\\in )/)
  return membres.map((m) => (m.sep ? m.t : fractionMembre(m.t))).join('')
}

function decouperNiveau(tex: string, sep: RegExp): { t: string; sep: boolean }[] {
  const r: { t: string; sep: boolean }[] = []
  let prof = 0, cour = ''
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i]!
    if (c === '(' || c === '{' || c === '[') prof++
    else if (c === ')' || c === '}' || c === ']') prof--
    if (prof === 0) {
      const m = sep.exec(tex.slice(i))
      if (m && tex[i - 1] !== '\\') {
        r.push({ t: cour, sep: false }, { t: m[0], sep: true })
        cour = ''
        i += m[0].length - 1
        continue
      }
    }
    cour += c
  }
  r.push({ t: cour, sep: false })
  return r
}

function fractionMembre(m: string): string {
  const parts = decouperNiveau(m, /^\//)
  if (parts.length !== 3) return m
  const num = parts[0]!.t.trim(), den0 = parts[2]!.t.trim()
  const premierNiveau = (s: string) => decouperNiveau(s.replace(/^-/, ''), /^[+-]/).length > 1
  if (!num || !den0 || premierNiveau(num)) return m
  const den = /^\(.*\)$/.test(den0) && decouperNiveau(den0.slice(1, -1), /^\)/).length === 1 ? den0.slice(1, -1) : den0
  if (den === den0 && premierNiveau(den0)) return m
  const signe = num.startsWith('-') ? '-' : ''
  return ` ${signe}\\frac{${signe ? num.slice(1) : num}}{${den}} `
}

// ─── Rendu HTML ──────────────────────────────────────────────────────────────

export function echapper(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Formule KaTeX (ou texte brut en italique si KaTeX n'est pas encore chargé). */
export function htmlMath(tex: string, affichee = false, source = tex): string {
  if (!katex) return `<span class="r38-math-brut">${echapper(source)}</span>`
  try {
    return katex.renderToString(tex, { displayMode: affichee, throwOnError: false, output: 'html', strict: 'ignore' })
  } catch {
    return `<span class="r38-math-brut">${echapper(source)}</span>`
  }
}

/** Texte avec ses passages mathématiques en ligne. */
export function htmlTexte(texte: string): string {
  return analyser(texte).morceaux.map((m) => (m.genre === 'texte' ? echapper(m.t) : htmlMath(m.tex, false, m.source))).join('')
}

/** Formule affichée d'un énoncé (HTML), ou null s'il n'en a pas. */
export function htmlFormule(texte: string): string | null {
  const a = analyser(texte)
  if (!a.texAffichee) return null
  const source = a.affichee!.map((x) => (a.morceaux[x] as Extract<Morceau, { genre: 'math' }>).source).join(' … ')
  return htmlMath(a.texAffichee, true, source)
}

export const aFormule = (texte: string): boolean => analyser(texte).texAffichee !== null

/**
 * Formule d'un bloc du schéma : en ligne mais en \displaystyle (fractions pleines), pour pouvoir la
 * mesurer et la réduire si elle dépasse la largeur du bloc (comme un \resizebox, borné).
 */
export function htmlFormuleBloc(texte: string): string | null {
  const a = analyser(texte)
  if (!a.texAffichee) return null
  const source = a.affichee!.map((x) => (a.morceaux[x] as Extract<Morceau, { genre: 'math' }>).source).join(' … ')
  return htmlMath(`\\displaystyle ${a.texAffichee}`, false, source)
}

/**
 * Énoncé complet comme un corps de théorème : texte avec math en ligne, la formule retenue en
 * formule centrée numérotée (\tag) à sa place dans la phrase.
 */
export function htmlEnonce(texte: string, numero: number | null): string {
  const a = analyser(texte)
  if (!a.affichee) return htmlTexte(texte)
  const [premier, dernier] = [a.affichee[0]!, a.affichee[a.affichee.length - 1]!]
  // La ponctuation qui suit la formule entre dans la formule affichée (usage typographique).
  const suite = a.morceaux[dernier + 1]
  const ponct = suite?.genre === 'texte' ? /^[.,;]/.exec(suite.t)?.[0] ?? '' : ''
  let h = ''
  a.morceaux.forEach((m, x) => {
    if (x === premier) {
      const corps = `${a.texAffichee}${ponct ? `\\,${ponct}` : ''}`
      const tex = numero !== null ? `${corps}\\tag{${numero}}` : corps
      h += `<div class="r38-affichee">${htmlMath(tex, true, m.genre === 'math' ? m.source : '')}</div>`
    } else if (x > premier && x <= dernier) return
    else if (x === dernier + 1 && ponct && m.genre === 'texte') h += echapper(m.t.slice(ponct.length))
    else h += m.genre === 'texte' ? echapper(m.t) : htmlMath(m.tex, false, m.source)
  })
  return h
}

/** Remplace, dans un arbre DOM, les passages mathématiques des nœuds texte par leur rendu KaTeX. */
export function mathifier(racine: HTMLElement): void {
  const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT)
  const textes: Text[] = []
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) textes.push(n as Text)
  for (const t of textes) {
    const s = t.textContent ?? ''
    if (!s.trim() || t.parentElement?.closest('.katex, .r38-sans-math')) continue
    const a = analyser(s)
    if (!a.morceaux.some((m) => m.genre === 'math')) continue
    const span = document.createElement('span')
    span.innerHTML = htmlTexte(s)
    t.replaceWith(span)
  }
}
