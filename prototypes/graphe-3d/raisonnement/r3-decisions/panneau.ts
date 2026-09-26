// R3 · Fiche de survol et panneau gauche : journal des décisions, légende de l'arbre.

import {
  el, formaterDateCourte, iconeForme, LIBELLES_ORIGINE, LIBELLES_STATUT, LIBELLES_TYPE,
  dependantsDe, type PanneauRaisonnement, type TypeRaisonnement, type VueRaisonnement,
} from '../../src/raisonnement'
import { analyseActive, blocDuPoint } from './dessin'
import { etSi, type AnalyseR3, type BlocR3 } from './modele'

const couper = (t: string, n: number) => (t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…')

// ─── Fiche ───────────────────────────────────────────────────────────────────

export function ficheR3(p: number, vue: VueRaisonnement, defaut: () => HTMLElement): HTMLElement {
  const an = analyseActive(vue)
  if (!an) return defaut()
  const b = blocDuPoint(vue, an, p)
  if (b) return ficheBloc(vue, an, b)
  const i = vue.indexNoeud(p)
  const f = defaut()
  const aide = f.querySelector('.rsn-aide')
  const genre = an.genre[i]
  if (genre === 'pivot') {
    const n = an.j.noeuds[i]!
    const dep = dependantsDe(an.j, i).length
    const es = etSi(an.j, an.topo, i)
    const bloc = el('div', { class: 'rsn-bloc r3-etsi' },
      el('div', { class: 'rsn-bloc-titre' }, n.type === 'decision' ? 'Portée de cette décision' : 'Portée de ce choix'),
      el('div', {}, el('b', {}, `${dep}`), ` nœud(s) en dépendent dans le graphe complet.`),
      el('div', {}, 'Et si on le retirait ? ', el('b', { class: 'r3-rouge' }, `${es.nbTombes} suspendu(s)`),
        es.survivants.length ? el('span', { class: 'rsn-doux' }, ` · ${es.survivants.length} tiennent par une autre démonstration`) : null),
    )
    if (aide) f.insertBefore(bloc, aide)
    else f.append(bloc)
    if (aide) aide.textContent = 'Survol : portée en surbrillance · clic : mode « et si ? » · Échap : quitter'
  } else if (genre === 'impasse') {
    f.insertBefore(el('div', { class: 'rsn-etiquette rsn-abandon' }, 'Impasse : la piste s’arrête ici'), f.children[3] ?? null)
  }
  const h = an.histoire
  if (h) {
    const etapes: [number, string][] = [
      [h.conjecture, 'la conjecture'], [h.mesure, 'la mesure la contredit'], [h.diagnostic, 'le diagnostic'],
      [h.decision, 'la décision corrective'], [h.confirmation, 'le résultat confirmé'],
    ]
    const k = etapes.filter(([x]) => x >= 0).findIndex(([x]) => x === i)
    if (k >= 0) {
      const texte = etapes.filter(([x]) => x >= 0)[k]![1]
      f.insertBefore(el('div', { class: 'r3-histoire' }, el('span', { class: 'r3-num' }, String(k + 1)), `Contradiction résolue, étape ${k + 1} : ${texte}.`), f.children[1] ?? null)
    }
  }
  return f
}

function ficheBloc(vue: VueRaisonnement, an: AnalyseR3, b: BlocR3): HTMLElement {
  const N = an.j.noeuds
  const pal = vue.palette
  const n = b.membres.length
  const parStatut = { valide: 0, incertain: 0, refute: 0 }
  const parType = new Map<TypeRaisonnement, number>()
  for (const m of b.membres) {
    parStatut[N[m]!.statut]++
    parType.set(N[m]!.type, (parType.get(N[m]!.type) ?? 0) + 1)
  }
  const ancre = b.ancre >= 0 ? N[b.ancre]! : null
  const tri = [...b.membres].sort((x, y) => poids(N[y]!.type) - poids(N[x]!.type) || dependantsDe(an.j, y).length - dependantsDe(an.j, x).length)
  const barre = el('div', { class: 'r3-barre-statut' },
    (['valide', 'incertain', 'refute'] as const).map((s) => parStatut[s] ? el('span', { style: `flex:${parStatut[s]};background:${pal.statut[s]}`, title: `${LIBELLES_STATUT[s]} : ${parStatut[s]}` }) : null))
  const confMoy = b.membres.reduce((s, m) => s + N[m]!.confiance.estimation, 0) / n
  const bas = Math.min(...b.membres.map((m) => N[m]!.confiance.bas)), haut = Math.max(...b.membres.map((m) => N[m]!.confiance.haut))
  return el('div', {},
    el('div', { class: 'rsn-fiche-type' }, b.id === 'cadre' ? 'Cadre · hypothèses de départ' : b.abandonne ? 'Bloc · piste abandonnée' : 'Bloc de résultats'),
    el('div', { class: 'rsn-fiche-titre' }, b.titre),
    ancre ? el('div', { class: 'rsn-fiche-enonce' }, 'Ce que ', el('b', {}, `« ${ancre.nom} »`), ' a permis : tout ce qui n’en dépend qu’à partir de là.') : null,
    el('dl', { class: 'rsn-grille' },
      el('dt', {}, 'Contenu'), el('dd', {}, `${n} nœud(s) : ${[...parType].sort((x, y) => y[1] - x[1]).map(([t, k]) => `${k} ${LIBELLES_TYPE[t].toLowerCase()}`).join(', ')}`),
      el('dt', {}, 'Statut'), el('dd', {}, `${parStatut.valide} validé(s) · ${parStatut.incertain} incertain(s) · ${parStatut.refute} réfuté(s)`),
      el('dt', {}, 'Confiance'), el('dd', {}, `moyenne ${Math.round(confMoy * 100)} % · étendue [${Math.round(bas * 100)}–${Math.round(haut * 100)}]`),
    ),
    barre,
    el('div', { class: 'rsn-bloc' },
      el('div', { class: 'rsn-bloc-titre' }, 'Résultats principaux'),
      el('ol', { class: 'rsn-chaine' }, tri.slice(0, 5).map((m) => el('li', {}, couper(N[m]!.nom, 58), el('span', { class: 'rsn-doux' }, ` · ${LIBELLES_STATUT[N[m]!.statut].toLowerCase()}`)))),
      n > 5 ? el('div', { class: 'rsn-doux' }, `… et ${n - 5} autre(s).`) : null,
    ),
    el('div', { class: 'rsn-aide' }, 'Clic : déplier le bloc · clic sur son cadre : replier'),
  )
}

const POIDS: Partial<Record<TypeRaisonnement, number>> = { theoreme: 9, resultat: 9, proposition: 7, lemme: 6, observation: 5, conjecture: 4, assertion: 4, calcul: 3, experience: 3 }
const poids = (t: TypeRaisonnement) => POIDS[t] ?? 1

// ─── Panneau ─────────────────────────────────────────────────────────────────

/** Section « Journal des décisions » : cliquer une entrée centre la décision. */
export function monterPanneau(p: PanneauRaisonnement, vue: VueRaisonnement, centrer: (noeud: number) => void): void {
  const journal = el('div', { class: 'r3-journal' })
  const maj = () => {
    const an = analyseActive(vue)
    if (!an) {
      journal.replaceChildren(el('p', { class: 'rsn-vide' }, 'Journal disponible avec la stratégie « R3 · Arbre des décisions ».'))
      return
    }
    const N = an.j.noeuds
    const pal = vue.palette
    const entrees = [...an.pivots].sort((a, b) => Date.parse(N[a]!.decision?.date ?? N[a]!.cree_le) - Date.parse(N[b]!.decision?.date ?? N[b]!.cree_le))
    journal.replaceChildren(
      el('p', { class: 'rsn-doux rsn-petit' }, `${entrees.length} décisions et choix de modélisation, du plus ancien au plus récent. Cliquer une entrée la centre dans le graphe.`),
      ...entrees.map((i) => {
        const n = N[i]!
        const d = n.decision
        const ia = n.origine === 'ia' || /IA/.test(d?.auteur ?? n.auteur)
        const icone = el('span', { class: 'rsn-icone' })
        icone.innerHTML = iconeForme(d ? 'losange' : 'hexagone', pal.couches[2]!, 13)
        const retenue = d?.alternatives.find((a) => a.retenue)
        const rejetees = d ? d.alternatives.filter((a) => !a.retenue).length : n.choix?.alternatives?.length ?? 0
        const b = el('button', { type: 'button', class: 'r3-entree', 'data-noeud': n.id, title: 'Centrer dans le graphe' },
          el('div', { class: 'r3-entree-tete' },
            el('span', { class: 'r3-date' }, formaterDateCourte(Date.parse(d?.date ?? n.cree_le))),
            icone,
            el('span', { class: 'r3-genre' }, d ? 'Décision' : 'Choix'),
            el('span', { class: `r3-auteur ${ia ? 'ia' : 'humain'}` }, ia ? 'IA' : LIBELLES_ORIGINE[n.origine === 'ordinateur' ? 'ordinateur' : 'humain']),
          ),
          el('div', { class: 'r3-entree-titre' }, n.nom),
          d ? el('div', { class: 'r3-entree-q' }, d.question) : null,
          el('div', { class: 'r3-entree-raison' }, d ? d.raison : n.choix?.hypothese ?? n.enonce),
          el('div', { class: 'r3-entree-pied' },
            `${d?.auteur ?? n.auteur}`,
            retenue ? ` · ✓ ${couper(retenue.libelle, 34)}` : '',
            rejetees ? ` · ✗ ${rejetees} écartée(s)` : '',
          ),
        )
        b.addEventListener('click', () => centrer(i))
        return b
      }),
    )
  }
  p.ajouterSection('journal', 'Journal des décisions', journal, { position: 'lecture' })
  p.ajouterSection('r3-legende', 'Lire l’arbre des décisions', legende(vue), { position: 'lecture', ouverte: false })
  vue.on('disposition', maj)
  vue.on('theme', () => { maj(); p.remplacer('r3-legende', legende(vue)) })
  maj()
}

function legende(vue: VueRaisonnement): HTMLElement {
  const pal = vue.palette
  const ico = (html: string) => { const s = el('span', { class: 'rsn-icone' }); s.innerHTML = html; return s }
  const ligne = (g: HTMLElement | string, t: string) => el('div', { class: 'rsn-legende-ligne' }, typeof g === 'string' ? el('span', { class: 'r3-glyphe' }, g) : g, t)
  return el('div', { class: 'rsn-legende' },
    ligne(ico(iconeForme('losange', pal.couches[2]!, 14)), 'Décision (question tranchée pendant la recherche)'),
    ligne(ico(iconeForme('hexagone', pal.couches[2]!, 14)), 'Choix de modélisation (hypothèse de travail)'),
    ligne('┆ ✗', 'Alternative rejetée, avec sa raison (pâle, courte)'),
    ligne(el('span', { class: 'r3-carte-mini' }), 'Bloc : ce que le choix a permis ; hauteur ∝ nombre de résultats'),
    ligne(el('span', { class: 'r3-barre-mini' }, el('i', { style: `background:${pal.statut.valide}` }), el('i', { style: `background:${pal.statut.incertain}` })), 'Bas de carte : répartition des statuts'),
    ligne('⊣', 'Impasse : la piste abandonnée s’arrête'),
    ligne(el('span', { class: 'r3-num' }, '1'), 'Contradiction résolue, racontée en étapes numérotées'),
    el('p', { class: 'rsn-doux rsn-petit' }, 'Survoler un choix met en évidence sa portée ; le cliquer ouvre le mode « et si ? » (ce qui deviendrait suspendu). Cliquer un bloc le déplie.'),
  )
}

