// R23 · panneau d'inspection et fiches de survol (HTML). Les identifiants cités sont des boutons
// `.r23-ref[data-noeud]` : le clic est délégué par main.ts (sélection du nœud).

import {
  demonstrationPrincipale, LIBELLES_ORIGINE, LIBELLES_ROLE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION,
  LIBELLES_VALIDITE, ROLES_PREMISSE, type RolePremisse, type Validite,
} from '../../src/raisonnement/donnees'
import {
  cheminDe, confianceDe, estRetro, listeAncetres, listeDependants, statistiques,
  type Grille, type Modele,
} from './modele'
import type { Brosse } from './rendu'

type Enfant = Node | string | null | undefined | false
export function h(tag: string, attrs: Record<string, string> = {}, ...enfants: Enfant[]): HTMLElement {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  for (const x of enfants) if (x !== null && x !== undefined && x !== false) e.append(x)
  return e
}

const ABREV_ROLE: Record<RolePremisse, string> = { principale: 'princ.', auxiliaire: 'aux.', technique: 'tech.', contexte: 'ctx.' }
const GLYPHE_VALIDITE: Record<Validite, string> = { valide: '✓', a_verifier: '?', invalide: '✕' }
const GLYPHE_STATUT: Record<string, string> = { valide: '✓', incertain: '?', refute: '✕' }
const LIBELLES_LIEN: Record<string, string> = { contredit: 'contredit', resout: 'résout', remplace: 'remplace', abandonne: 'abandonne' }

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const fmt2 = (x: number) => x.toFixed(2).replace('.', ',')

export function ref(m: Modele, i: number): HTMLElement {
  return h('button', { class: 'r23-ref', type: 'button', 'data-noeud': String(i), title: m.noeuds[i]!.nom }, m.ident[i]!)
}

function refs(m: Modele, liste: number[], max = 40): Node[] {
  const tries = [...liste].sort((a, b) => m.rangCanonique[a]! - m.rangCanonique[b]!)
  const res: Node[] = []
  tries.slice(0, max).forEach((i, k) => {
    if (k) res.push(document.createTextNode(' '))
    res.push(ref(m, i))
  })
  if (tries.length > max) res.push(h('span', { class: 'r23-doux' }, ` … +${tries.length - max}`))
  return res
}

/** Intervalle de confiance sur une échelle 0–1 commune (SVG, 1 px). */
export function intervalle(bas: number, haut: number, est: number, largeur = 140): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', String(largeur + 2))
  svg.setAttribute('height', '14')
  svg.setAttribute('class', 'r23-intervalle')
  const L = (x: number) => 1 + x * largeur
  const trait = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
    const l = document.createElementNS(ns, 'line')
    l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1)); l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2))
    l.setAttribute('class', cls)
    svg.append(l)
  }
  trait(L(0), 7.5, L(1), 7.5, 'axe')
  for (const t of [0, 0.5, 1]) trait(L(t), 5, L(t), 10, 'axe')
  trait(L(bas), 7.5, L(haut), 7.5, 'plage')
  trait(L(est), 2, L(est), 13, 'estimation')
  return svg
}

function ligneCle(cle: string, ...valeur: Enfant[]): HTMLElement {
  return h('div', { class: 'r23-kv' }, h('span', { class: 'r23-cle' }, cle), h('span', { class: 'r23-val' }, ...valeur))
}

function statut(n: { statut: string }): HTMLElement {
  return h('span', { class: `r23-statut s-${n.statut}` }, `${GLYPHE_STATUT[n.statut]} ${LIBELLES_STATUT[n.statut as 'valide']}`)
}

function validite(v: Validite): HTMLElement {
  return h('span', { class: `r23-validite v-${v}` }, `${GLYPHE_VALIDITE[v]} ${LIBELLES_VALIDITE[v]}`)
}

function comptageTypes(m: Modele, liste: number[]): string {
  const par = new Map<string, number>()
  for (const i of liste) par.set(m.noeuds[i]!.type, (par.get(m.noeuds[i]!.type) ?? 0) + 1)
  return [...par.entries()].sort((a, b) => b[1] - a[1]).map(([t, k]) => `${k} ${LIBELLES_TYPE[t as 'lemme'].toLowerCase()}`).join(', ')
}

// ─── Nœud ────────────────────────────────────────────────────────────────────

export function ficheNoeud(m: Modele, i: number): HTMLElement {
  const n = m.noeuds[i]!
  const conf = confianceDe(n)
  const ancetres = listeAncetres(m, i)
  const dependants = listeDependants(m, i)
  const bloc = m.blocs[m.blocDe[i]!]!
  const utilisateurs = m.sortantes[i]!.map((k) => m.deps[k]!.cible)
  const racine = h('div', { class: 'r23-fiche-noeud' },
    h('div', { class: 'r23-entete' },
      h('span', { class: 'r23-id' }, m.ident[i]!),
      h('span', { class: 'r23-type' }, LIBELLES_TYPE[n.type]),
      n.piste === 'abandonnee' ? h('span', { class: 'r23-type' }, 'piste abandonnée') : null,
    ),
    h('h2', {}, n.nom),
    h('p', { class: 'r23-enonce' }, n.enonce),
    h('div', { class: 'r23-grille-kv' },
      ligneCle('Statut', statut(n)),
      ligneCle('Validation', LIBELLES_VALIDATION[n.validation]),
      ligneCle('Confiance', intervalle(conf.bas, conf.haut, conf.estimation), h('span', { class: 'r23-mono' }, ` ${fmt2(conf.estimation)} [${fmt2(conf.bas)} ; ${fmt2(conf.haut)}]`)),
      ligneCle('Origine', `${LIBELLES_ORIGINE[n.origine]} · ${n.auteur}`),
      ligneCle('Créé le', fmtDate(n.cree_le)),
      ligneCle('Bloc', bloc.nom),
      n.admis ? ligneCle('Admis', 'établi sans démonstration dans ce projet') : null,
    ),
  )

  if (n.choix) {
    racine.append(h('section', {},
      h('h3', {}, 'Choix de modélisation'),
      h('p', {}, n.choix.hypothese),
      ligneCle('Portée déclarée', n.choix.portee),
      ligneCle('Portée calculée', `${dependants.length} nœuds — ${comptageTypes(m, dependants)}`),
      n.choix.alternatives?.length ? ligneCle('Alternatives', n.choix.alternatives.join(' · ')) : null,
    ))
  }
  if (n.decision) {
    const d = n.decision
    const table = h('table', { class: 'r23-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Option'), h('th', {}, 'Raison'))),
      h('tbody', {}, ...d.alternatives.map((a) => h('tr', { class: a.retenue ? 'retenue' : 'rejetee' },
        h('td', {}, a.retenue ? a.libelle : `✕ ${a.libelle}`), h('td', {}, a.raison ?? '—')))),
    )
    racine.append(h('section', {},
      h('h3', {}, 'Décision'),
      h('p', { class: 'r23-question' }, d.question),
      table,
      ligneCle('Raison', d.raison),
      ligneCle('Décidé le', `${fmtDate(d.date)} · ${d.auteur}`),
      ligneCle('Portée', `${dependants.length} nœuds en dépendent ; les options rejetées n'ont aucun dépendant`),
    ))
  }

  // Démonstrations, prémisses groupées par rôle.
  const princ = demonstrationPrincipale(n)
  if (n.demonstrations.length) {
    const sec = h('section', {}, h('h3', {}, `Démonstrations (${n.demonstrations.length})`))
    n.demonstrations.forEach((d, di) => {
      const parRole = new Map<RolePremisse, number[]>()
      for (const p of d.premisses) {
        const s = m.index.get(p.id)
        if (s === undefined) continue
        if (!parRole.has(p.role)) parRole.set(p.role, [])
        parRole.get(p.role)!.push(s)
      }
      const lignes = ROLES_PREMISSE.filter((r) => parRole.has(r)).map((r) =>
        h('div', { class: 'r23-par' }, h('span', { class: 'r23-role' }, ABREV_ROLE[r]), ...refs(m, parRole.get(r)!)))
      const exclue = m.mode === 'principale' && d !== princ
      sec.append(h('div', { class: `r23-demo${d === princ ? ' principale' : ''}${exclue ? ' exclue' : ''}` },
        h('div', { class: 'r23-demo-titre' },
          h('span', { class: 'r23-mono r23-doux' }, `d${di + 1}`),
          h('b', {}, d.nom),
          d === princ ? h('span', { class: 'r23-etiquette' }, 'principale') : null,
          validite(d.validite),
        ),
        h('div', { class: 'r23-doux r23-petit' }, `${d.auteur} · ${fmtDate(d.cree_le)}${exclue ? ' · masquée (mode principale)' : ''}`),
        ...lignes,
        d.texte ? h('p', { class: 'r23-petit' }, d.texte) : null,
      ))
    })
    racine.append(sec)
  }

  // Liens sémantiques.
  const sortants = m.liens.filter((l) => l.source === i)
  const entrants = m.liens.filter((l) => l.cible === i)
  if (sortants.length || entrants.length) {
    racine.append(h('section', {}, h('h3', {}, 'Liens hors justification'),
      ...sortants.map((l) => h('div', { class: 'r23-par' }, `${LIBELLES_LIEN[l.genre]} `, ref(m, l.cible), l.note ? h('span', { class: 'r23-doux' }, ` — ${l.note}`) : null)),
      ...entrants.map((l) => h('div', { class: 'r23-par' }, ref(m, l.source), ` ${LIBELLES_LIEN[l.genre]} ce nœud`, l.note ? h('span', { class: 'r23-doux' }, ` — ${l.note}`) : null)),
    ))
  }

  // Structure.
  const fondations = ancetres.filter((s) => ['hypothese', 'choix_modelisation', 'decision'].includes(m.noeuds[s]!.type))
  racine.append(h('section', {}, h('h3', {}, 'Structure'),
    ligneCle('Utilisé par', `${utilisateurs.length} directement`),
    utilisateurs.length ? h('div', { class: 'r23-par' }, ...refs(m, utilisateurs, 24)) : null,
    ligneCle('Antécédents', `${ancetres.length} (transitifs)`),
    fondations.length ? h('div', { class: 'r23-par' }, h('span', { class: 'r23-role' }, 'H · M · Déc'), ...refs(m, fondations)) : null,
    ligneCle('Dépendants', `${dependants.length} (transitifs)`),
  ))
  return racine
}

/** Fiche courte de survol d'un nœud. */
export function resumeNoeud(m: Modele, i: number): HTMLElement {
  const n = m.noeuds[i]!
  const conf = confianceDe(n)
  return h('div', {},
    h('div', { class: 'r23-entete' }, h('span', { class: 'r23-id' }, m.ident[i]!), h('span', { class: 'r23-type' }, LIBELLES_TYPE[n.type])),
    h('div', { class: 'r23-titre-fiche' }, n.nom),
    h('div', { class: 'r23-enonce' }, n.enonce),
    h('div', { class: 'r23-petit' }, statut(n), ` · ${LIBELLES_VALIDATION[n.validation]} · conf. ${fmt2(conf.estimation)} [${fmt2(conf.bas)} ; ${fmt2(conf.haut)}] · ${n.demonstrations.length} dém. · ${m.entrantes[i]!.length} prémisses · ${m.sortantes[i]!.length} usages`),
  )
}

// ─── Cellule ─────────────────────────────────────────────────────────────────

export function ficheCellule(m: Modele, g: Grille, r: number, c: number, complete: boolean): HTMLElement | null {
  const ligne = g.lignes[r]!, col = g.colonnes[c]!
  if (ligne.genre === 'alternative') {
    const d = m.noeuds[ligne.i]!.decision!
    const a = d.alternatives[ligne.k]!
    return h('div', {},
      h('div', { class: 'r23-entete' }, h('span', { class: 'r23-id' }, m.ident[ligne.i]!), h('span', { class: 'r23-type' }, 'option rejetée')),
      h('div', { class: 'r23-titre-fiche' }, `✕ ${a.libelle}`),
      h('div', { class: 'r23-enonce' }, a.raison ?? 'Raison non renseignée.'),
      h('div', { class: 'r23-petit r23-doux' }, 'Ligne vide : aucun énoncé ne dépend de cette option.'),
    )
  }
  if (ligne.genre === 'bloc' || col.genre === 'bloc') {
    const cel = g.cellules.get(r * g.colonnes.length + c)
    const nomL = ligne.genre === 'bloc' ? m.blocs[ligne.bloc]!.nom : m.ident[(ligne as { i: number }).i]!
    const nomC = col.genre === 'bloc' ? m.blocs[col.bloc]!.nom : m.ident[col.i]!
    const deps = cel?.deps ?? []
    const retro = deps.filter((k) => estRetro(m.deps[k]!)).length
    const parRole = ROLES_PREMISSE.map((ro) => [ro, deps.filter((k) => m.deps[k]!.role === ro).length] as const).filter(([, k]) => k)
    return h('div', {},
      h('div', { class: 'r23-titre-fiche' }, `${nomL} utilise ${nomC}`),
      h('div', { class: 'r23-petit' }, `${deps.length} dépendance(s) agrégée(s)${parRole.length ? ' — ' + parRole.map(([ro, k]) => `${k} ${ABREV_ROLE[ro]}`).join(', ') : ''}${retro ? ` · ${retro} rétroaction(s)` : ''}`),
      complete && deps.length ? h('div', { class: 'r23-par' }, ...deps.slice(0, 30).flatMap((k, j) => {
        const d = m.deps[k]!
        return [j ? document.createTextNode(' · ') : null, ref(m, d.cible), document.createTextNode(' ← '), ref(m, d.source)].filter(Boolean) as Node[]
      })) : null,
    )
  }
  const ci = ligne.i, si = col.i
  if (ci === si) return resumeNoeud(m, ci)
  const k = m.directe.get(ci * m.n + si)
  const cel = g.cellules.get(r * g.colonnes.length + c)
  const liens = (cel?.liens ?? []).map((x) => m.liens[x]!)
  const blocs: Enfant[] = []
  if (k !== undefined) {
    const d = m.deps[k]!
    const n = m.noeuds[ci]!
    blocs.push(h('div', { class: 'r23-titre-fiche' },
      h('span', { class: 'r23-mono' }, m.ident[ci]!), ' utilise ', h('span', { class: 'r23-mono' }, m.ident[si]!),
      ` (${LIBELLES_ROLE[d.role].toLowerCase()}) dans la démonstration « ${n.demonstrations[d.demo]!.nom} »`))
    blocs.push(h('div', { class: 'r23-petit r23-doux' }, `${m.noeuds[ci]!.nom} ← ${m.noeuds[si]!.nom}`))
    const table = h('table', { class: 'r23-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Dém.'), h('th', {}, 'Rôle'), h('th', {}, 'Validité'))),
      h('tbody', {}, ...d.citations.map((cit) => {
        const dem = n.demonstrations[cit.demo]!
        return h('tr', { class: cit.demo === d.demo ? 'retenue' : '' },
          h('td', {}, `d${cit.demo + 1} ${dem.nom}${d.principale && cit.demo === d.demo ? ' (principale)' : ''}`),
          h('td', {}, LIBELLES_ROLE[cit.role]), h('td', {}, validite(dem.validite)))
      })),
    )
    blocs.push(table)
    if (!d.principale) blocs.push(h('div', { class: 'r23-petit' }, 'Hors démonstration principale : marque en gris.'))
    if (d.retroOrdre) blocs.push(h('div', { class: 'r23-petit r23-retro' }, `Rétroaction : la prémisse (${m.blocs[m.blocDe[si]!]!.court}) vient après la conclusion (${m.blocs[m.blocDe[ci]!]!.court}) dans l'ordre des blocs.`))
    if (d.retroDate) blocs.push(h('div', { class: 'r23-petit r23-retro' }, `Rétroaction : prémisse créée le ${fmtDate(m.noeuds[si]!.cree_le)}, après la conclusion (${fmtDate(m.noeuds[ci]!.cree_le)}) : démonstration révisée.`))
  } else if (cel?.transitif) {
    const chemin = cheminDe(m, si, ci)
    blocs.push(h('div', { class: 'r23-titre-fiche' }, h('span', { class: 'r23-mono' }, m.ident[ci]!), ' dépend indirectement de ', h('span', { class: 'r23-mono' }, m.ident[si]!)))
    if (chemin) blocs.push(h('div', { class: 'r23-par' }, h('span', { class: 'r23-role' }, `chemin (${chemin.length - 1})`),
      ...chemin.flatMap((x, j) => (j ? [document.createTextNode(' → '), ref(m, x)] : [ref(m, x)]))))
  } else if (!liens.length) {
    return null
  }
  for (const l of liens) {
    blocs.push(h('div', { class: `r23-par ${l.genre === 'contredit' ? 'r23-refute' : 'r23-retro'}` },
      h('span', { class: 'r23-mono' }, m.ident[l.source]!), ` ${LIBELLES_LIEN[l.genre]} `, h('span', { class: 'r23-mono' }, m.ident[l.cible]!),
      l.note ? h('span', { class: 'r23-doux' }, ` — ${l.note}`) : null))
  }
  return h('div', {}, ...blocs)
}

// ─── Brosse ──────────────────────────────────────────────────────────────────

export function noeudsBrosse(g: Grille, b: Brosse): number[] {
  const res = new Set<number>()
  for (let r = b.r0; r <= b.r1; r++) { const l = g.lignes[r]; if (l && l.genre === 'noeud') res.add(l.i) }
  for (let c = b.c0; c <= b.c1; c++) { const l = g.colonnes[c]; if (l && l.genre === 'noeud') res.add(l.i) }
  return [...res]
}

export function ficheBrosse(m: Modele, g: Grille, b: Brosse): HTMLElement {
  const noeuds = noeudsBrosse(g, b)
  const dans = new Set(noeuds)
  const internes = m.deps.filter((d) => dans.has(d.source) && dans.has(d.cible))
  const retro = internes.filter(estRetro).length
  const faibles = [...noeuds].sort((a, c) => confianceDe(m.noeuds[a]!).estimation - confianceDe(m.noeuds[c]!).estimation).slice(0, 5)
  const nonValides = internes.filter((d) => d.validite !== 'valide').length
  return h('div', {},
    h('div', { class: 'r23-entete' }, h('span', { class: 'r23-type' }, 'sous-matrice')),
    h('h2', {}, `${noeuds.length} nœuds · ${internes.length} dépendances internes`),
    h('div', { class: 'r23-grille-kv' },
      ligneCle('Lignes', `${b.r0 + 1} – ${b.r1 + 1}`),
      ligneCle('Colonnes', `${b.c0 + 1} – ${b.c1 + 1}`),
      ligneCle('Rétroactions', String(retro)),
      ligneCle('Dém. non valides', `${nonValides} citation(s) dans une démonstration à vérifier ou invalide`),
      ligneCle('Types', comptageTypes(m, noeuds)),
    ),
    h('section', {}, h('h3', {}, 'Confiance la plus basse'), ...faibles.map((i) => {
      const cf = confianceDe(m.noeuds[i]!)
      return h('div', { class: 'r23-par' }, ref(m, i), ' ', intervalle(cf.bas, cf.haut, cf.estimation, 90), h('span', { class: 'r23-mono r23-doux' }, ` ${fmt2(cf.estimation)}`))
    })),
    h('section', {}, h('h3', {}, 'Nœuds'), h('div', { class: 'r23-par' }, ...refs(m, noeuds, 80))),
    h('div', { class: 'r23-boutons' },
      h('button', { class: 'r23-bouton', type: 'button', 'data-action': 'copier-brosse' }, 'Copier les identifiants'),
      h('button', { class: 'r23-bouton', type: 'button', 'data-action': 'effacer' }, 'Effacer'),
    ),
  )
}

// ─── Accueil et légende ──────────────────────────────────────────────────────

export function ficheAccueil(m: Modele, g: Grille): HTMLElement {
  const st = statistiques(m)
  return h('div', {},
    h('div', { class: 'r23-entete' }, h('span', { class: 'r23-type' }, m.jeu.source === 'api' ? 'graphe Atlas' : 'jeu synthétique')),
    h('h2', {}, m.jeu.titre),
    h('p', { class: 'r23-enonce' }, m.jeu.resume),
    h('div', { class: 'r23-grille-kv' },
      ligneCle('Nœuds', `${st.noeuds} (${m.blocs.length} blocs)`),
      ligneCle('Dépendances', `${st.dependances} — densité ${(st.densite * 100).toFixed(1).replace('.', ',')} %`),
      ligneCle('Par rôle', ROLES_PREMISSE.map((r) => `${st.parRole[r]} ${ABREV_ROLE[r]}`).join(' · ')),
      ligneCle('Hors principale', `${st.horsPrincipale} (démonstrations alternatives)`),
      ligneCle('Dém. citantes', `${st.aVerifier} à vérifier · ${st.invalides} invalides`),
      ligneCle('Rétroactions', `${st.retroOrdre} entre blocs · ${st.retroDate} par révision`),
      ligneCle('Au-dessus', `${g.auDessus} marques au-dessus de la diagonale (ordre affiché)`),
      ligneCle('Liens', `${st.liens} hors justification (contredit, résout, abandonne)`),
    ),
    h('p', { class: 'r23-petit r23-doux' }, 'Cliquer un en-tête de ligne ou de colonne : sélection et chemin des antécédents. Maj + glisser : sous-matrice. Clic dans la marge d’un bloc : le replier.'),
  )
}

export function legende(): HTMLElement {
  const glyphe = (svg: string) => { const s = h('span', { class: 'r23-glyphe' }); s.innerHTML = svg; return s }
  const G = (inner: string) => `<svg width="14" height="14" viewBox="0 0 14 14">${inner}</svg>`
  const ligne = (g: HTMLElement, texte: string) => h('div', { class: 'r23-leg' }, g, h('span', {}, texte))
  return h('section', { class: 'r23-legende' },
    h('h3', {}, 'Lecture'),
    ligne(glyphe(G('<rect x="3" y="3" width="8" height="8" fill="#1b2029"/>')), 'prémisse principale'),
    ligne(glyphe(G('<rect x="5" y="5" width="4" height="4" fill="#1b2029"/>')), 'auxiliaire'),
    ligne(glyphe(G('<circle cx="7" cy="7" r="1.4" fill="#1b2029"/>')), 'technique (outil)'),
    ligne(glyphe(G('<circle cx="7" cy="7" r="3.4" fill="none" stroke="#1b2029"/>')), 'contexte (sens de l’énoncé)'),
    ligne(glyphe(G('<rect x="3" y="3" width="8" height="8" fill="#9ba2ae"/>')), 'citée hors démonstration principale'),
    ligne(glyphe(G('<rect x="3" y="3" width="8" height="8" fill="#3d5a9e"/>')), 'rétroaction (bloc ultérieur ou prémisse plus récente)'),
    ligne(glyphe(G('<rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="#a8741a"/><rect x="4" y="4" width="6" height="6" fill="#1b2029"/>')), 'liseré ocre / brique : démonstration à vérifier / invalide'),
    ligne(glyphe(G('<path d="M0 14L14 0M-5 14L9 0M5 14L19 0" stroke="#bcc3ce"/>')), 'dépendance indirecte (bascule transitif)'),
    ligne(glyphe(G('<text x="7" y="11" font-size="12" text-anchor="middle" fill="#a3402d">⊣</text>')), 'contredit · ⊢ résout · × abandonne'),
    ligne(glyphe(G('<rect x="0.5" y="0.5" width="13" height="13" fill="#f3f4f6"/><text x="7" y="11" font-size="10" text-anchor="middle" fill="#2f6b4f">✓</text>')), 'diagonale : statut ✓ ? ✕ et confiance'),
    ligne(glyphe(G('<path d="M7 2.5L11.5 7L7 11.5L2.5 7Z" fill="none" stroke="#1b2029"/>')), 'décision ; sous-lignes grises = options rejetées'),
    h('p', { class: 'r23-petit r23-doux' }, 'Sous 6 px par cellule, les glyphes deviennent des pixels (intensité = rôle). Intervalle : échelle 0–1 commune, trait = estimation.'),
  )
}
