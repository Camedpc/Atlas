// R24 · Registre de la démarche (direction D4 de RECHERCHE-REPRESENTATION.md).
//
// La recherche lue comme une suite de décisions dans le temps : une ligne par sous-problème, abscisse =
// date, décisions en bifurcations QOC (options écartées en embranchements), expériences en stations,
// contradictions et résolutions en arcs. Panneau : tableau options × critères, motifs × options (ACH),
// portée. Sous la frise : le registre chronologique, filtré par la fenêtre temporelle.
//
// Modèle dérivé : modele.ts ; critères et motifs : criteres.ts ; frise : dessin.ts ; panneau : panneau.ts.

import { el } from '../../src/core/ui/dom'
import { antecedentsDe, chargerJeu, dependantsDe } from '../../src/raisonnement/donnees'
import { dessinerFrise, mettreEnPage, type Mise, type ModeEchelle } from './dessin'
import meta from './meta.json'
import { construireRegistre, JOUR, porteeDe, voisinageDe, type Registre } from './modele'
import { dateCourte, ficheCourte, jourDe, rendrePanneau, rendreRegistre, type Actions } from './panneau'

interface Etat {
  echelle: ModeEchelle
  curseur: number | null
  fenetre: [number, number] | null
  survol: string | null
  selection: string | null
  portee: number | null
  correspondances: boolean
  mineurs: boolean
}

const CLE_STOCKAGE = `atlas-raisonnement:${meta.id}`
function lirePreferences(): Partial<Etat> {
  try {
    return JSON.parse(localStorage.getItem(CLE_STOCKAGE) ?? '{}') as Partial<Etat>
  } catch {
    return {}
  }
}
function ecrirePreferences(e: Etat): void {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify({ echelle: e.echelle, correspondances: e.correspondances, mineurs: e.mineurs }))
  } catch {
    // Stockage indisponible : préférences non mémorisées.
  }
}

async function demarrer(): Promise<void> {
  const app = document.getElementById('app')!
  app.replaceChildren(el('p', { class: 'chargement' }, 'Chargement du graphe…'))
  const r = construireRegistre(await chargerJeu())
  const pref = lirePreferences()
  const etat: Etat = {
    echelle: pref.echelle === 'calendaire' ? 'calendaire' : 'activite',
    curseur: null, fenetre: null, survol: null, selection: null, portee: null,
    correspondances: pref.correspondances ?? true, mineurs: pref.mineurs ?? true,
  }

  // ─── Squelette de page ──────────────────────────────────────────────────────
  const btnEchelle = (mode: ModeEchelle, texte: string, aide: string) =>
    el('button', { type: 'button', class: 'seg', title: aide, 'data-mode': mode, onclick: () => { etat.echelle = mode; ecrirePreferences(etat); tout() } }, texte)
  const segEchelle = el('div', { class: 'segmente', role: 'group', 'aria-label': 'Échelle du temps' },
    btnEchelle('activite', 'Par activité', 'Périodes sans activité repliées, jalons d’une même ligne espacés ; graduations aux vraies dates'),
    btnEchelle('calendaire', 'Calendaire', 'Temps linéaire ; les jalons trop proches sont décalés, leur vraie date est marquée sur la ligne'))
  const curseur = el('input', { type: 'range', min: r.debut, max: r.fin, step: JOUR / 4, value: r.fin, class: 'curseur-temps', 'aria-label': 'État à une date' })
  const sortieCurseur = el('output', { class: 'sortie' })
  const btnFin = el('button', { type: 'button', class: 'bouton petit-bouton', onclick: () => { etat.curseur = null; tout() } }, 'Fin')
  const caseCor = el('input', { type: 'checkbox', checked: etat.correspondances })
  const caseMin = el('input', { type: 'checkbox', checked: etat.mineurs })
  const sortieFenetre = el('span', { class: 'sortie' })
  const btnFenetre = el('button', { type: 'button', class: 'bouton petit-bouton', onclick: () => { etat.fenetre = null; tout() } }, 'Effacer')
  const resume = el('div', { class: 'resume-etat' })

  const tete = el('header', { class: 'tete' },
    el('div', { class: 'titres' },
      el('a', { class: 'retour', href: '../../index.html', title: 'Retour au catalogue' }, '← catalogue'),
      el('h1', {}, 'Registre de la démarche'),
      el('p', { class: 'sous-titre' }, r.jeu.titre)),
    el('div', { class: 'commandes' },
      el('div', { class: 'groupe' }, el('span', { class: 'groupe-lib' }, 'Échelle'), segEchelle),
      el('div', { class: 'groupe' }, el('span', { class: 'groupe-lib' }, 'État au'), curseur, sortieCurseur, btnFin),
      el('div', { class: 'groupe' }, el('span', { class: 'groupe-lib' }, 'Fenêtre'), sortieFenetre, btnFenetre),
      el('div', { class: 'groupe' },
        el('label', { class: 'case' }, caseCor, 'Correspondances'),
        el('label', { class: 'case' }, caseMin, 'Nœuds mineurs')),
    ),
    resume,
  )
  const conteneurFrise = el('div', { class: 'frise-conteneur' })
  const registre = el('section', { class: 'registre-conteneur' })
  const corps = el('main', { class: 'corps' }, conteneurFrise, registre)
  const panneau = el('aside', { class: 'panneau', 'aria-label': 'Détail' })
  const infobulle = el('div', { class: 'infobulle', role: 'tooltip' })
  infobulle.hidden = true
  app.replaceChildren(tete, corps, panneau)
  document.body.append(infobulle)

  // ─── Actions ────────────────────────────────────────────────────────────────
  const actions: Actions = {
    selectionner: (cle) => {
      etat.selection = cle
      etat.portee = null
      tout()
      panneau.scrollTop = 0
    },
    basculerPortee: (i) => {
      etat.portee = etat.portee === i ? null : i
      tout()
    },
    porteeActive: () => etat.portee,
  }

  // ─── Rendu ──────────────────────────────────────────────────────────────────
  let mise: Mise | null = null
  let cleMise = ''
  const miseEnPage = (): Mise => {
    const largeur = Math.max(960, Math.floor(conteneurFrise.clientWidth))
    const cle = `${etat.echelle}|${largeur}`
    if (!mise || cle !== cleMise) {
      mise = mettreEnPage(r, etat.echelle, largeur)
      cleMise = cle
    }
    return mise
  }

  const voisinsDeNoeud = (i: number) => new Set([i, ...antecedentsDe(r.j, i), ...dependantsDe(r.j, i)])
  const actifsCourants = (): { actifs: Set<number> | null; focus: string | null } => {
    if (etat.portee !== null) return { actifs: new Set([etat.portee, ...porteeDe(r, etat.portee)]), focus: r.jalonDe[etat.portee]?.cle ?? null }
    const cle = etat.survol ?? etat.selection
    if (!cle) return { actifs: null, focus: null }
    if (cle.startsWith('n:')) return { actifs: voisinsDeNoeud(Number(cle.slice(2))), focus: null }
    const j = r.parCle.get(cle)
    if (!j) return { actifs: null, focus: null }
    const v = voisinageDe(r, j)
    return { actifs: new Set([...j.membres, ...v.amont, ...v.aval]), focus: cle }
  }

  const rendreFrise = () => {
    const m = miseEnPage()
    const { actifs, focus } = actifsCourants()
    conteneurFrise.replaceChildren(dessinerFrise(r, m, {
      curseur: etat.curseur, fenetre: etat.fenetre, actifs, focus, selection: etat.selection,
      correspondances: etat.correspondances, mineurs: etat.mineurs,
    }))
  }

  const rendreCommandes = () => {
    for (const b of segEchelle.querySelectorAll<HTMLButtonElement>('.seg')) b.classList.toggle('actif', b.dataset.mode === etat.echelle)
    curseur.value = String(etat.curseur ?? r.fin)
    sortieCurseur.textContent = etat.curseur === null ? `fin (${dateCourte(r.fin)})` : `${dateCourte(etat.curseur)} · j${jourDe(r, etat.curseur)}`
    btnFin.disabled = etat.curseur === null
    sortieFenetre.textContent = etat.fenetre ? `${dateCourte(etat.fenetre[0])} → ${dateCourte(etat.fenetre[1])}` : 'glisser sur l’axe'
    btnFenetre.disabled = !etat.fenetre
    resume.replaceChildren(...resumeEtat(r, etat.curseur))
  }

  const tout = () => {
    rendreCommandes()
    rendreFrise()
    panneau.replaceChildren(rendrePanneau(r, etat.selection, actions))
    registre.replaceChildren(rendreRegistre(r, etat.fenetre, etat.curseur, etat.selection, actions))
  }

  // ─── Événements ─────────────────────────────────────────────────────────────
  curseur.addEventListener('input', () => {
    const v = Number(curseur.value)
    etat.curseur = v >= r.fin ? null : v
    rendreCommandes()
    rendreFrise()
    registre.replaceChildren(rendreRegistre(r, etat.fenetre, etat.curseur, etat.selection, actions))
  })
  caseCor.addEventListener('change', () => { etat.correspondances = caseCor.checked; ecrirePreferences(etat); rendreFrise() })
  caseMin.addEventListener('change', () => { etat.mineurs = caseMin.checked; ecrirePreferences(etat); rendreFrise() })

  const cibleSous = (t: EventTarget | null): { cle: string | null; noeud: number | null } => {
    const e = t instanceof Element ? t : null
    const j = e?.closest<SVGElement>('[data-cle]')
    if (j) return { cle: j.dataset.cle ?? null, noeud: null }
    const n = e?.closest<SVGElement>('[data-noeud]')
    if (n) return { cle: null, noeud: Number(n.dataset.noeud) }
    return { cle: null, noeud: null }
  }

  conteneurFrise.addEventListener('mousemove', (ev) => {
    if (glisse) return
    const { cle, noeud } = cibleSous(ev.target)
    const survol = cle ?? (noeud !== null ? `n:${noeud}` : null)
    if (survol !== etat.survol) {
      etat.survol = survol
      rendreFrise()
    }
    const fiche = survol ? ficheCourte(r, cle, noeud) : null
    if (!fiche) {
      infobulle.hidden = true
      return
    }
    infobulle.replaceChildren(fiche)
    infobulle.hidden = false
    const w = infobulle.offsetWidth
    const h = infobulle.offsetHeight
    const x = ev.clientX + 16 + w > window.innerWidth - 8 ? ev.clientX - 16 - w : ev.clientX + 16
    const y = Math.min(ev.clientY + 16, window.innerHeight - h - 8)
    infobulle.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`
  })
  conteneurFrise.addEventListener('mouseleave', () => {
    infobulle.hidden = true
    if (etat.survol !== null) {
      etat.survol = null
      rendreFrise()
    }
  })
  conteneurFrise.addEventListener('click', (ev) => {
    if (glisseRecent) return
    const { cle, noeud } = cibleSous(ev.target)
    const sel = cle ?? (noeud !== null ? `n:${noeud}` : null)
    if ((ev.target as Element).closest('[data-zone]')) return
    actions.selectionner(sel === etat.selection ? null : sel)
  })

  // Axe : clic = état à cette date, glisser = fenêtre temporelle.
  let glisse: { x0: number; bouge: boolean } | null = null
  let glisseRecent = false
  const xLocal = (ev: PointerEvent) => ev.clientX - conteneurFrise.querySelector('svg')!.getBoundingClientRect().left
  conteneurFrise.addEventListener('pointerdown', (ev) => {
    if (!(ev.target instanceof Element) || !ev.target.closest('[data-zone="axe"]')) return
    glisse = { x0: xLocal(ev), bouge: false }
    ev.preventDefault()
  })
  window.addEventListener('pointermove', (ev) => {
    if (!glisse || !mise) return
    const x = xLocal(ev)
    if (!glisse.bouge && Math.abs(x - glisse.x0) < 4) return
    glisse.bouge = true
    const ech = mise.echelle
    const a = ech.x2t(Math.max(ech.x0, Math.min(glisse.x0, x)))
    const b = ech.x2t(Math.min(ech.x1, Math.max(glisse.x0, x)))
    etat.fenetre = [a, b]
    rendreCommandes()
    rendreFrise()
  })
  window.addEventListener('pointerup', (ev) => {
    if (!glisse || !mise) return
    if (glisse.bouge) {
      registre.replaceChildren(rendreRegistre(r, etat.fenetre, etat.curseur, etat.selection, actions))
    } else {
      const t = mise.echelle.x2t(xLocal(ev))
      etat.curseur = t >= r.fin ? null : t
      tout()
    }
    glisse = null
    glisseRecent = true
    setTimeout(() => { glisseRecent = false }, 0)
  })

  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return
    if (etat.portee !== null) etat.portee = null
    else if (etat.selection !== null) etat.selection = null
    else if (etat.fenetre !== null) etat.fenetre = null
    else if (etat.curseur !== null) etat.curseur = null
    tout()
  })

  new ResizeObserver(() => rendreFrise()).observe(conteneurFrise)
  tout()
  ;(window as unknown as { r24: unknown }).r24 = { registre: r, etat }
}

/** Résumé de l'état de la démarche à une date (ou à la fin). */
function resumeEtat(r: Registre, curseur: number | null): Node[] {
  const t = curseur ?? r.fin
  const noeuds = r.dates.filter((d) => d <= t).length
  const decisions = r.decisions.filter((j) => j.date <= t).length
  const contredits = r.arcs.filter((a) => a.genre === 'contredit' && r.dates[a.de]! <= t)
  const ouvertes = contredits.filter((c) => !r.arcs.some((a) => a.genre === 'resout' && a.vers === c.vers && r.dates[a.de]! <= t)).length
  const abandons = r.lignes.filter((l) => l.abandon && l.abandon.date <= t).length
  const b = (v: number) => el('b', {}, String(v))
  return [
    el('span', {}, b(noeuds), ` nœuds sur ${r.dates.length}`),
    el('span', {}, b(decisions), ` décisions sur ${r.decisions.length}`),
    el('span', { class: ouvertes ? 'alerte' : '' }, b(ouvertes), ` contradiction${ouvertes > 1 ? 's' : ''} ouverte${ouvertes > 1 ? 's' : ''}`, ` (${contredits.length - ouvertes} résolue${contredits.length - ouvertes > 1 ? 's' : ''})`),
    el('span', {}, b(abandons), ` piste${abandons > 1 ? 's' : ''} close${abandons > 1 ? 's' : ''}`),
  ]
}

void demarrer()
