// Palette de commandes (Ctrl + K) : chercher un nœud ou une catégorie, aller à une vue, appliquer
// un filtre, ouvrir une lignée, piloter la lentille — sans quitter le clavier.
// Préfixes : « > » actions seulement, « # » catégories, « @ » nœuds.

import {
  el, normaliserTexte, LIBELLES_ORIGINE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION, NOMS_NIVEAUX,
  ORIGINES, STATUTS, TYPES_NOEUD, VALIDATIONS,
  type VueGraphe,
} from '../../src/core'
import type { Lentille } from './lentille'

type Genre = 'Nœud' | 'Catégorie' | 'Vue' | 'Filtre' | 'Lignée' | 'Lentille' | 'Affichage'

interface Commande {
  genre: Genre
  titre: string
  sous?: string
  raccourci?: string
  /** Texte normalisé pour la recherche. */
  cle: string
  couleur?: string
  executer: () => void
}

const MAX_RESULTATS = 40

export class PaletteCommandes {
  readonly element: HTMLElement
  private champ: HTMLInputElement
  private liste: HTMLElement
  private resultats: Commande[] = []
  private actif = 0
  private statiques: Commande[] = []
  private focusPrecedent: Element | null = null

  constructor(private vue: VueGraphe, private lentille: Lentille) {
    this.champ = el('input', {
      type: 'text', class: 'v5-palette-champ', placeholder: 'Chercher un nœud, une catégorie, une commande…',
      'aria-label': 'Palette de commandes', autocomplete: 'off', spellcheck: 'false',
    })
    this.liste = el('div', { class: 'v5-palette-liste', role: 'listbox' })
    const boite = el('div', { class: 'v5-palette-boite', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'v5-palette-entete' }, el('span', { class: 'v5-palette-loupe' }, '⌕'), this.champ, el('kbd', {}, 'Échap')),
      this.liste,
      el('div', { class: 'v5-palette-pied' },
        el('span', {}, el('kbd', {}, '↑'), el('kbd', {}, '↓'), ' naviguer'),
        el('span', {}, el('kbd', {}, '↵'), ' exécuter'),
        el('span', {}, el('kbd', {}, '>'), ' actions ', el('kbd', {}, '#'), ' catégories ', el('kbd', {}, '@'), ' nœuds'),
      ),
    )
    this.element = el('div', { class: 'v5-palette' }, boite)
    this.element.addEventListener('pointerdown', (e) => {
      if (e.target === this.element) this.fermer()
    })
    this.champ.addEventListener('input', () => this.filtrer())
    this.champ.addEventListener('keydown', (e) => this.touche(e))
    vue.racine.appendChild(this.element)
    this.construireStatiques()
    vue.on('theme', () => this.construireStatiques())
  }

  get ouverte(): boolean {
    return this.element.classList.contains('ouverte')
  }

  ouvrir(texte = ''): void {
    this.focusPrecedent = document.activeElement
    this.element.classList.add('ouverte')
    this.champ.value = texte
    this.filtrer()
    this.champ.focus()
  }

  fermer(): void {
    this.element.classList.remove('ouverte')
    this.champ.blur()
    if (this.focusPrecedent instanceof HTMLElement) this.focusPrecedent.focus()
  }

  basculer(): void {
    if (this.ouverte) this.fermer()
    else this.ouvrir()
  }

  private touche(e: KeyboardEvent): void {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      this.fermer()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = this.resultats.length
      if (n) this.surligner((this.actif + (e.key === 'ArrowDown' ? 1 : -1) + n) % n)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = this.resultats[this.actif]
      if (c) this.executer(c)
    } else if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      this.fermer()
    }
  }

  private executer(c: Commande): void {
    this.fermer()
    c.executer()
    this.vue.demanderRendu()
  }

  // ─── Commandes ───────────────────────────────────────────────────────────

  private cmd(genre: Genre, titre: string, executer: () => void, extra: Partial<Commande> = {}): Commande {
    return { genre, titre, executer, cle: normaliserTexte(`${titre} ${extra.sous ?? ''} ${genre}`), ...extra }
  }

  /** Amène la feuille f à l'écran : ouvre sa chaîne, la sélectionne (lignée), puis cadre. */
  private allerNoeud(f: number): void {
    const v = this.vue
    v.granularite.ouvrir(v.h.chaine[f * 3 + 2]!)
    v.selectionner(f)
    const voisins = [f, ...v.h.premisses[f]!.map((p) => v.granularite.representant(p))]
    window.setTimeout(() => v.cadrer(voisins), v.reglages.valeurs.dureeTransition + 60)
    v.demanderRendu()
  }

  private allerCategorie(c: number): void {
    const v = this.vue
    const cat = v.h.categories[c]!
    v.granularite.ouvrir(c)
    v.selectionner(cat.unite)
    window.setTimeout(() => v.cadrer([cat.unite, ...cat.feuilles]), v.reglages.valeurs.dureeTransition + 60)
    v.demanderRendu()
  }

  private construireStatiques(): void {
    const v = this.vue
    const { h } = v
    const l: Commande[] = []
    // Catégories puis nœuds.
    for (const c of h.categories) {
      l.push(this.cmd('Catégorie', c.nom, () => this.allerCategorie(c.index), {
        sous: `${NOMS_NIVEAUX[c.niveau].replace(/s$/, '')} · ${c.chemin.slice(0, -1).join(' › ') || 'racine'} · ${c.feuilles.length} nœuds`,
        couleur: v.palette.domaines[c.domaine % v.palette.domaines.length],
      }))
    }
    h.noeuds.forEach((n, f) => {
      l.push(this.cmd('Nœud', n.nom, () => this.allerNoeud(f), {
        sous: `${LIBELLES_TYPE[n.type]} · ${LIBELLES_STATUT[n.statut]} · ${n.categorie[2]}`,
        couleur: v.palette.statut[n.statut],
      }))
      l[l.length - 1]!.cle += ' ' + normaliserTexte(n.id)
    })
    this.statiques = l
  }

  /** Actions (reconstruites à chaque ouverture : leurs libellés dépendent de l'état). */
  private actions(): Commande[] {
    const v = this.vue
    const f = v.filtres
    const R = v.reglages
    const L = this.lentille
    const a: Commande[] = []
    const vue = (nom: Parameters<VueGraphe['allerVue']>[0], titre: string, raccourci: string) =>
      a.push(this.cmd('Vue', titre, () => v.allerVue(nom), { raccourci }))
    vue('dessus', 'Vue de dessus — thématique', '7')
    vue('face', 'Vue de face — temporelle', '1')
    vue('droite', 'Vue de droite — par type', '3')
    vue('iso', 'Vue 3D isométrique', '')
    a.push(this.cmd('Vue', v.mode === '2d' ? 'Passer en 3D (orbite libre)' : 'Passer en 2D (face verrouillée)', () => v.definirMode(v.mode === '2d' ? '3d' : '2d')))
    a.push(this.cmd('Vue', 'Tout cadrer', () => v.cadrerTout(), { raccourci: '⇱' }))
    NOMS_NIVEAUX.forEach((nom, g) => a.push(this.cmd('Vue', `Granularité : ${nom.toLowerCase()}`, () => v.definirGranularite(g), { raccourci: g === 0 ? '[' : g === 3 ? ']' : '' })))
    a.push(this.cmd('Vue', 'Annuler les ouvertures locales', () => {
      L.toutFermer()
      v.granularite.reinitialiserLocales()
    }))

    a.push(this.cmd('Lentille', L.epinglee ? 'Désépingler la lentille' : 'Épingler la lentille', () => L.epingler(), { raccourci: 'L' }))
    a.push(this.cmd('Lentille', R.lire<boolean>('lentille') ? 'Désactiver la lentille' : 'Activer la lentille', () => {
      R.definir('lentille', !R.lire<boolean>('lentille'))
    }))
    a.push(this.cmd('Lentille', R.lire<number>('fisheye') > 0 ? 'Fisheye : désactiver' : 'Fisheye : activer', () => {
      R.definir('fisheye', R.lire<number>('fisheye') > 0 ? 0 : 1.6)
    }))
    for (const p of [1, 2, 3]) a.push(this.cmd('Lentille', `Profondeur d'ouverture : +${p} niveau${p > 1 ? 'x' : ''}`, () => R.definir('profondeurLentille', p)))
    for (const r of [100, 160, 240]) a.push(this.cmd('Lentille', `Rayon de lentille : ${r} px`, () => R.definir('rayonLentille', r)))

    const seul = <V extends string>(ensemble: 'statutsExclus' | 'validationsExclues' | 'originesExclues' | 'typesExclus', valeurs: readonly V[], val: V) =>
      f.modifier({ [ensemble]: new Set(valeurs.filter((x) => x !== val)) })
    for (const s of STATUTS) {
      a.push(this.cmd('Filtre', `Statut : seulement « ${LIBELLES_STATUT[s]} »`, () => seul('statutsExclus', STATUTS, s), { couleur: v.palette.statut[s] }))
      a.push(this.cmd('Filtre', `Statut : exclure « ${LIBELLES_STATUT[s]} »`, () => f.basculer('statutsExclus', s), { couleur: v.palette.statut[s] }))
    }
    for (const s of VALIDATIONS) a.push(this.cmd('Filtre', `Validation : seulement « ${LIBELLES_VALIDATION[s]} »`, () => seul('validationsExclues', VALIDATIONS, s), { couleur: v.palette.validation[s] }))
    for (const s of ORIGINES) a.push(this.cmd('Filtre', `Origine : seulement « ${LIBELLES_ORIGINE[s]} »`, () => seul('originesExclues', ORIGINES, s)))
    for (const s of TYPES_NOEUD) a.push(this.cmd('Filtre', `Type : seulement « ${LIBELLES_TYPE[s]} »`, () => seul('typesExclus', TYPES_NOEUD, s)))
    for (const c of [0.5, 0.7, 0.85]) a.push(this.cmd('Filtre', `Confiance ≥ ${String(c).replace('.', ',')}`, () => f.modifier({ confianceMin: c })))
    a.push(this.cmd('Filtre', f.etat.mode === 'estomper' ? 'Mode filtres : masquer' : 'Mode filtres : estomper', () => f.modifier({ mode: f.etat.mode === 'estomper' ? 'masquer' : 'estomper' })))
    a.push(this.cmd('Filtre', 'Réinitialiser les filtres', () => f.reinitialiser()))

    const sel = v.lignee.selection
    if (sel !== null) {
      a.push(this.cmd('Lignée', `Cadrer la lignée de « ${v.h.nom(sel)} »`, () => v.cadrerSelection(), { raccourci: '.' }))
      a.push(this.cmd('Lignée', 'Effacer la sélection', () => v.selectionner(null), { raccourci: 'Échap' }))
    }
    a.push(this.cmd('Lignée', R.valeurs.descendants ? 'Lignée : ancêtres seulement' : 'Lignée : ancêtres et descendants', () => R.definir('descendants', !R.valeurs.descendants)))

    a.push(this.cmd('Affichage', R.valeurs.theme === 'clair' ? 'Thème sombre' : 'Thème clair', () => v.definirTheme(R.valeurs.theme === 'clair' ? 'sombre' : 'clair')))
    a.push(this.cmd('Affichage', v.ui.panneau?.ouvert ? 'Fermer le panneau' : 'Ouvrir le panneau', () => v.ui.panneau?.basculer()))
    a.push(this.cmd('Affichage', R.lire<boolean>('badges') ? 'Masquer les badges de validation' : 'Afficher les badges de validation', () => R.definir('badges', !R.lire<boolean>('badges'))))
    return a
  }

  private filtrer(): void {
    let brut = this.champ.value
    let genres: Genre[] | null = null
    if (brut.startsWith('>')) {
      genres = ['Vue', 'Filtre', 'Lignée', 'Lentille', 'Affichage']
      brut = brut.slice(1)
    } else if (brut.startsWith('#')) {
      genres = ['Catégorie']
      brut = brut.slice(1)
    } else if (brut.startsWith('@')) {
      genres = ['Nœud']
      brut = brut.slice(1)
    }
    const q = normaliserTexte(brut.trim())
    const mots = q.split(/\s+/).filter(Boolean)
    const toutes = [...this.actions(), ...this.statiques]
    const candidates = genres ? toutes.filter((c) => genres!.includes(c.genre)) : toutes
    let res: Commande[]
    if (!mots.length) {
      // Sans texte : actions d'abord, puis catégories de premier niveau.
      res = candidates.filter((c) => c.genre !== 'Nœud' && (c.genre !== 'Catégorie' || !c.sous?.includes('›'))).slice(0, MAX_RESULTATS)
    } else {
      const notes: [Commande, number][] = []
      for (const c of candidates) {
        if (!mots.every((m) => c.cle.includes(m))) continue
        const titre = normaliserTexte(c.titre)
        let score = 0
        if (titre.startsWith(q)) score += 6
        else if (titre.includes(' ' + mots[0])) score += 3
        else if (titre.includes(mots[0]!)) score += 2
        if (c.genre === 'Catégorie') score += 1.5
        else if (c.genre !== 'Nœud') score += 1
        score -= titre.length / 200
        notes.push([c, score])
      }
      notes.sort((a, b) => b[1] - a[1])
      res = notes.slice(0, MAX_RESULTATS).map((x) => x[0])
    }
    this.resultats = res
    this.dessiner(q)
  }

  private dessiner(q: string): void {
    const mots = q.split(/\s+/).filter(Boolean)
    const surligner = (texte: string): (Node | string)[] => {
      if (!mots.length) return [texte]
      const norm = normaliserTexte(texte)
      const marques = new Uint8Array(texte.length)
      for (const m of mots) {
        let i = norm.indexOf(m)
        while (i >= 0) {
          marques.fill(1, i, i + m.length)
          i = norm.indexOf(m, i + m.length)
        }
      }
      const out: (Node | string)[] = []
      let debut = 0
      for (let i = 1; i <= texte.length; i++) {
        if (i === texte.length || marques[i] !== marques[debut]) {
          const bout = texte.slice(debut, i)
          out.push(marques[debut] ? el('mark', {}, bout) : bout)
          debut = i
        }
      }
      return out
    }
    this.liste.replaceChildren()
    if (!this.resultats.length) {
      this.liste.append(el('div', { class: 'v5-palette-vide' }, 'Aucun résultat.'))
      return
    }
    let genrePrec: Genre | null = null
    this.resultats.forEach((c, i) => {
      if (c.genre !== genrePrec) {
        this.liste.append(el('div', { class: 'v5-palette-groupe' }, c.genre === 'Nœud' ? 'Nœuds — ouvre la lignée' : c.genre === 'Catégorie' ? 'Catégories' : c.genre))
        genrePrec = c.genre
      }
      const ligne = el('div', { class: 'v5-palette-item', role: 'option', 'data-i': i },
        el('i', { class: 'v5-palette-pastille', style: c.couleur ? `background:${c.couleur}` : '' }),
        el('div', { class: 'v5-palette-textes' },
          el('div', { class: 'v5-palette-titre' }, surligner(c.titre)),
          c.sous ? el('div', { class: 'v5-palette-sous' }, c.sous) : null),
        c.raccourci ? el('kbd', {}, c.raccourci) : null,
      )
      ligne.addEventListener('pointermove', () => this.actif !== i && this.surligner(i, false))
      ligne.addEventListener('click', () => this.executer(c))
      this.liste.append(ligne)
    })
    this.surligner(0)
  }

  private surligner(i: number, defiler = true): void {
    this.actif = i
    this.liste.querySelectorAll('.v5-palette-item').forEach((n) => {
      const actif = Number((n as HTMLElement).dataset.i) === i
      n.classList.toggle('actif', actif)
      n.setAttribute('aria-selected', String(actif))
      if (actif && defiler) (n as HTMLElement).scrollIntoView({ block: 'nearest' })
    })
  }
}
