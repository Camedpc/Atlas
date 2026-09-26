// R5 · Fiche de survol (structure de Toulmin) et section du panneau ☰.

import {
  barreConfiance, couper, dependantsDe, el, formaterDate, LIBELLES_ORIGINE, LIBELLES_STATUT, LIBELLES_TYPE, LIBELLES_VALIDATION,
  type PanneauRaisonnement, type VueRaisonnement,
} from '../../src/raisonnement'
import type { Carte, ModeleArguments } from './arguments'
import type { EtatR5 } from './rendu'

const TITRES_GENRE: Record<Carte['genre'], string> = {
  argument: 'Argument', question: 'Question (IBIS)', decision: 'Décision · question tranchée', objection: 'Objection',
}

function bloc(titre: string, classe: string, ...contenu: (HTMLElement | string | null)[]): HTMLElement {
  return el('div', { class: `r5-f-bloc ${classe}` }, el('div', { class: 'r5-f-titre' }, titre), ...contenu)
}

/** Fiche d'une carte : conclusion, qualificatif, raisons, garantie, données, réserves, attaques. */
export function ficheCarte(vue: VueRaisonnement, m: ModeleArguments, c: Carte): HTMLElement {
  const j = vue.justification
  const pal = vue.palette
  const n = j.noeuds[c.conclusion]!
  const sp = vue.jeu.sousProblemes.find((s) => s.id === n.sousProbleme)
  const nb = vue.lecture.unites[c.unite]!.membres.length
  const corps = el('div', { class: `r5-fiche genre-${c.genre}` },
    el('div', { class: 'rsn-fiche-type' }, el('span', { class: 'r5-f-genre' }, TITRES_GENRE[c.genre]), ` · ${LIBELLES_TYPE[n.type]}`, sp ? el('span', { class: 'rsn-doux' }, ` · ${sp.nom}`) : null),
    el('div', { class: 'rsn-fiche-titre' }, c.genre === 'decision' ? `✓ ${n.nom}` : n.nom),
    el('div', { class: 'rsn-fiche-enonce' }, couper(n.enonce, 240)),
  )
  if (c.etat === 'refutee') corps.append(el('div', { class: 'rsn-etiquette r5-f-refutee' }, 'Réfutée'))
  if (c.abandonnee) corps.append(el('div', { class: 'rsn-etiquette rsn-abandon' }, 'Piste abandonnée'))
  // Qualificatif (Toulmin) : statut, validation, intervalle de confiance.
  corps.append(bloc('Qualificatif', 'qualif',
    el('dl', { class: 'rsn-grille' },
      el('dt', {}, 'Statut'), el('dd', {}, el('span', { class: 'rsn-pastille', style: `background:${pal.statut[n.statut]}` }), ` ${LIBELLES_STATUT[n.statut]}`),
      el('dt', {}, 'Validé par'), el('dd', {}, LIBELLES_VALIDATION[n.validation]),
      el('dt', {}, 'Origine'), el('dd', {}, `${LIBELLES_ORIGINE[n.origine]} · ${n.auteur} · ${formaterDate(Date.parse(n.cree_le))}`),
    ),
    barreConfiance(n, pal.statut[n.statut]),
  ))
  // Décision : question, positions retenue / rejetées, raison.
  if (n.decision) {
    const d = n.decision
    corps.append(bloc(`? ${d.question}`, 'decision',
      el('ul', { class: 'rsn-alternatives' }, d.alternatives.map((a) =>
        el('li', { class: a.retenue ? 'retenue' : 'rejetee' }, el('b', {}, a.retenue ? '✓ retenu · ' : '✗ rejeté · '), a.libelle, a.raison ? el('span', { class: 'rsn-doux' }, ` — ${a.raison}`) : null))),
      el('div', { class: 'rsn-doux' }, `Raison : ${d.raison}`),
    ))
  }
  // Raisons (données de l'argument) : prémisses principales de la conclusion.
  if (c.raisons.length) {
    corps.append(bloc('∵ Raisons principales', 'raisons', el('ul', { class: 'r5-f-liste' }, c.raisons.map((r) => {
      const nr = j.noeuds[r.noeud]!
      const autre = r.carte !== c.unite
      return el('li', {}, autre ? el('span', { class: 'r5-f-renvoi' }, '◂ carte ') : null, nr.nom,
        !autre && r.sousEtapes ? el('span', { class: 'rsn-doux' }, ` (${r.sousEtapes} sous-étape${r.sousEtapes > 1 ? 's' : ''})`) : null,
        nr.statut !== 'valide' ? el('span', { class: `r5-f-statut statut-${nr.statut}` }, ` ${LIBELLES_STATUT[nr.statut].toLowerCase()}`) : null)
    }))))
  }
  if (c.garanties.length) {
    corps.append(bloc('⊢ Garantie', 'garantie', el('div', {}, c.garanties.slice(0, 5).map((g) => j.noeuds[g]!.nom).join(' · '), c.garanties.length > 5 ? el('span', { class: 'rsn-doux' }, ` +${c.garanties.length - 5}`) : null)))
  }
  if (c.donnees.length || c.modeles.length) {
    corps.append(bloc('Sous les hypothèses', 'hyp',
      c.donnees.length ? el('div', {}, c.donnees.map((d) => el('span', { class: 'r5-f-puce h' }, `${d.code} · ${couper(j.noeuds[d.noeud]!.nom, 30)}`))) : null,
      c.modeles.length ? el('div', {}, c.modeles.map((d) => el('span', { class: 'r5-f-puce m' }, `${d.code} · ${couper(j.noeuds[d.noeud]!.nom, 30)}`))) : null,
    ))
  }
  // Attaques et réponses.
  const recues = m.liens.filter((l) => l.cible === c.unite)
  const emises = m.liens.filter((l) => l.source === c.unite)
  if (recues.length || emises.length) {
    corps.append(bloc('Attaques et réponses', 'attaques',
      ...recues.map((l) => el('div', { class: `r5-f-lien ${l.genre}` }, el('b', {}, l.genre === 'contredit' ? '✗ Contredite par : ' : l.genre === 'resout' ? '✓ Réponse : ' : '— Close par : '), j.noeuds[m.cartes[l.source]!.conclusion]!.nom, l.note ? el('span', { class: 'rsn-doux' }, ` — ${l.note}`) : null)),
      ...emises.map((l) => el('div', { class: `r5-f-lien ${l.genre}` }, el('b', {}, l.genre === 'contredit' ? '✗ Contredit : ' : l.genre === 'resout' ? '✓ Répond à : ' : '— Clôt : '), j.noeuds[m.cartes[l.cible]!.conclusion]!.nom, l.note ? el('span', { class: 'rsn-doux' }, ` — ${l.note}`) : null)),
    ))
  }
  if (c.reserves.length) {
    corps.append(bloc(`⚠ Réserves (${c.reserves.length})`, 'reserves', el('ul', { class: 'r5-f-liste' }, c.reserves.slice(0, 5).map((r) => el('li', { class: r.grave ? 'grave' : '' }, r.texte)),
      c.reserves.length > 5 ? el('li', { class: 'rsn-doux' }, `+ ${c.reserves.length - 5} autre(s)`) : null)))
  }
  const pied = [`${nb} nœud${nb > 1 ? 's' : ''} du graphe complet dans cette carte`]
  if (c.verifications.length) pied.push(`${c.verifications.length} vérification(s) machine`)
  if (c.complements.length) pied.push(`${c.complements.length} complément(s)`)
  corps.append(el('div', { class: 'rsn-aide' }, pied.join(' · '), el('br'), 'Clic : lignée et détail au panneau ☰ · molette : zoom sémantique'))
  return corps
}

/** Fiche d'une étiquette : hypothèse du problème (H) ou hypothèse de travail (M). */
export function ficheEtiquette(vue: VueRaisonnement, m: ModeleArguments, noeud: number): HTMLElement | null {
  const j = vue.justification
  const n = j.noeuds[noeud]!
  const mod = m.modeles.find((x) => x.noeud === noeud)
  const don = m.donnees.find((x) => x.noeud === noeud)
  if (!mod && !don) return null
  const pal = vue.palette
  const cartes = mod ? mod.cartes : m.cartes.filter((c) => c.donnees.some((d) => d.noeud === noeud)).map((c) => c.unite)
  const corps = el('div', { class: 'r5-fiche' },
    el('div', { class: 'rsn-fiche-type' }, mod ? `Hypothèse de travail ${mod.code} · choix de modélisation` : `Donnée ${don!.code} · hypothèse du problème`),
    el('div', { class: 'rsn-fiche-titre' }, n.nom),
    el('div', { class: 'rsn-fiche-enonce' }, n.choix?.hypothese ?? n.enonce),
    el('dl', { class: 'rsn-grille' },
      el('dt', {}, 'Statut'), el('dd', {}, el('span', { class: 'rsn-pastille', style: `background:${pal.statut[n.statut]}` }), ` ${LIBELLES_STATUT[n.statut]}`),
      el('dt', {}, 'Validé par'), el('dd', {}, LIBELLES_VALIDATION[n.validation]),
    ),
    barreConfiance(n, pal.statut[n.statut]),
  )
  if (n.choix) {
    corps.append(bloc('Portée déclarée', 'hyp', el('div', {}, n.choix.portee)))
    if (n.choix.alternatives?.length) corps.append(bloc('Autres modélisations possibles', 'hyp', el('div', { class: 'rsn-doux' }, n.choix.alternatives.join(' · '))))
    const dec = j.entrantes[noeud]!.map((e) => j.noeuds[j.aretes[e]!.source]!).find((s) => s.type === 'decision')
    if (dec) corps.append(bloc('Issue de la décision', 'decision', el('div', {}, `✓ ${dec.nom}`)))
  }
  const total = dependantsDe(j, noeud).length
  corps.append(bloc(mod ? 'Portée calculée' : 'Cartes qui la citent', 'hyp',
    el('div', {}, `${cartes.length} carte(s)`, mod ? el('span', { class: 'rsn-doux' }, ` · ${total} nœuds du graphe complet en dépendent`) : null),
    el('div', { class: 'rsn-doux' }, cartes.slice(0, 6).map((u) => couper(j.noeuds[m.cartes[u]!.conclusion]!.nom, 34)).join(' · '), cartes.length > 6 ? ` +${cartes.length - 6}` : ''),
  ))
  corps.append(el('div', { class: 'rsn-aide' }, 'Survol : cartes concernées en avant · clic : portée complète'))
  return corps
}

/** Section « Carte d'arguments » du panneau : mode d'emploi, questions, décisions, hypothèses, carte dépliée. */
export function sectionPanneau(p: PanneauRaisonnement, vue: VueRaisonnement, etat: EtatR5): () => void {
  const racine = el('div', { class: 'r5-panneau' })
  const deplie = el('div', { class: 'r5-deplie' })
  const aller = (u: number) => {
    vue.selectionner(u)
    vue.cadrerSelection()
  }
  const maj = () => {
    const m = etat.modele
    if (!m) {
      racine.replaceChildren(el('p', { class: 'rsn-vide' }, 'Stratégie de lecture autre que R5 : les cartes sont masquées.'))
      return
    }
    const j = vue.justification
    const nom = (u: number) => j.noeuds[m.cartes[u]!.conclusion]!.nom
    const ligne = (u: number, prefixe: string, classe: string) =>
      el('li', { class: classe }, el('button', { type: 'button', class: 'r5-lien', onclick: () => aller(u) }, prefixe, couper(nom(u), 46)))
    const decisions = m.cartes.filter((c) => c.genre === 'decision')
    const questions = m.cartes.filter((c) => c.genre === 'question')
    const objections = m.cartes.filter((c) => c.genre === 'objection')
    const portee = (noeud: number) => {
      const q = vue.pointDeNoeud(noeud)
      if (q !== null) vue.montrerPortee(q)
    }
    racine.replaceChildren(
      el('div', { class: 'r5-anatomie' },
        el('div', { class: 'r5-anat-carte' },
          el('div', { class: 'r5-anat-m' }, 'M · hypothèses de travail'),
          el('div', { class: 'r5-anat-tete' }, 'TYPE', el('span', {}, '● 92 %')),
          el('div', { class: 'r5-anat-titre' }, 'Conclusion'),
          el('div', { class: 'r5-anat-l' }, '∵ raison (+ sous-étapes)'),
          el('div', { class: 'r5-anat-l' }, '◂ raison venue d’une autre carte'),
          el('div', { class: 'r5-anat-ic' }),
        ),
        el('ul', { class: 'r5-anat-legende' },
          el('li', {}, el('b', {}, 'Flèche '), '« donc » : la conclusion d’une carte devient une raison de la suivante ; ', el('i', {}, '⊢ garantie'), ' écrite à l’entrée.'),
          el('li', {}, el('b', {}, 'Qualificatif '), ': point de statut, confiance, barre = intervalle de confiance.'),
          el('li', {}, el('b', { class: 'rouge' }, '✗ '), 'attaquée · ', el('b', { class: 'ambre' }, '⚠ '), 'réserves (énoncés incertains).'),
          el('li', {}, el('b', {}, '? '), 'question ouverte (IBIS) · ', el('b', { class: 'orange' }, '✓ '), 'décision posée au-dessus de la carte qu’elle gouverne.'),
          el('li', {}, 'Zoom : conclusions → raisons → énoncés, garanties et réserves.'),
        ),
      ),
      el('div', { class: 'rsn-groupe-titre' }, `Décisions (${decisions.length})`),
      el('ul', { class: 'r5-liste' }, decisions.map((c) => ligne(c.unite, '✓ ', 'decision'))),
      el('div', { class: 'rsn-groupe-titre' }, `Questions (${questions.length}) et objections (${objections.length})`),
      el('ul', { class: 'r5-liste' },
        questions.map((c) => ligne(c.unite, c.etat === 'refutee' ? '✗ ' : c.etat === 'abandonnee' ? '— ' : '? ', `question ${c.etat}`)),
        objections.map((c) => ligne(c.unite, '✗ ', 'objection'))),
      el('div', { class: 'rsn-groupe-titre' }, 'Hypothèses de travail (portée)'),
      el('ul', { class: 'r5-liste' }, m.modeles.map((x) => el('li', {}, el('button', { type: 'button', class: 'r5-lien', onclick: () => portee(x.noeud) }, el('b', {}, `${x.code} `), couper(j.noeuds[x.noeud]!.nom, 34), el('span', { class: 'rsn-doux' }, ` · ${x.cartes.length}`))))),
      el('div', { class: 'rsn-groupe-titre' }, 'Données du problème'),
      el('ul', { class: 'r5-liste' }, m.donnees.map((x) => el('li', {}, el('button', { type: 'button', class: 'r5-lien', onclick: () => portee(x.noeud) }, el('b', {}, `${x.code} `), couper(j.noeuds[x.noeud]!.nom, 38))))),
      el('div', { class: 'rsn-groupe-titre' }, 'Carte dépliée'),
      deplie,
    )
    majDeplie()
  }
  // Carte sélectionnée, dépliée : tous ses nœuds, dans l'ordre du raisonnement.
  const majDeplie = () => {
    const m = etat.modele
    const u = vue.selection
    if (!m || u === null || u >= m.cartes.length) {
      deplie.replaceChildren(el('p', { class: 'rsn-vide' }, 'Cliquez une carte pour la déplier ici.'))
      return
    }
    const c = m.cartes[u]!
    const j = vue.justification
    const unite = vue.lecture.unites[u]!
    const autres = new Set([...c.verifications, ...c.complements])
    const chemin = unite.membres.filter((x) => !autres.has(x))
    const item = (i: number) => {
      const n = j.noeuds[i]!
      return el('li', { class: `statut-${n.statut}` }, el('span', { class: 'r5-d-type' }, LIBELLES_TYPE[n.type]), n.nom)
    }
    const blocs: (HTMLElement | null)[] = [
      el('div', { class: 'r5-d-titre' }, j.noeuds[c.conclusion]!.nom),
      el('ol', { class: 'r5-d-liste' }, chemin.map(item)),
      c.verifications.length ? el('div', { class: 'rsn-doux rsn-petit' }, 'Vérifications machine') : null,
      c.verifications.length ? el('ul', { class: 'r5-d-liste' }, c.verifications.map(item)) : null,
      c.complements.length ? el('div', { class: 'rsn-doux rsn-petit' }, 'Compléments et appuis (hors chemin principal)') : null,
      c.complements.length ? el('ul', { class: 'r5-d-liste' }, c.complements.map(item)) : null,
    ]
    deplie.replaceChildren(...blocs.filter((x): x is HTMLElement => x !== null))
  }
  vue.on('selection', majDeplie)
  p.ajouterSection('r5', 'Carte d’arguments', racine, { position: 'lecture' })
  maj()
  return maj
}
