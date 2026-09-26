// Simulation d'une recherche Atlas : orchestrateur, directeurs de labo, littérature, expérimentateurs,
// graphistes, vérificateur et recours. Aucun vrai agent n'est lancé : chaque rôle suit un script
// (générateur) tiré au hasard à partir d'une graine, et le moteur fait avancer le temps simulé.
//
// Les vues lisent l'état (`sim.agents`, `sim.temps`, `sim.stats()`) à chaque image via `sim.surTic`,
// et peuvent écouter `sim.surEvenement` pour des effets ponctuels (lancement, fin, échec).

export const ROLES = {
  orchestrateur: { libelle: 'Orchestrateur', court: 'Orch.', couleur: '#ece6d6', modele: 'gpt-6-astra' },
  directeur_de_labo: { libelle: 'Directeur de labo', court: 'Dir.', couleur: '#f0a44b', modele: 'gpt-6-astra' },
  litterature: { libelle: 'Littérature', court: 'Litt.', couleur: '#4fc1b0', modele: 'gpt-6-luna' },
  experimentateur: { libelle: 'Expérimentateur', court: 'Exp.', couleur: '#9d8cf2', modele: 'gpt-6-sol' },
  graphiste: { libelle: 'Graphiste', court: 'Graph.', couleur: '#ef7aa8', modele: 'gpt-6-sol' },
  verificateur: { libelle: 'Vérificateur', court: 'Vérif.', couleur: '#8fd16a', modele: 'gpt-6-luna' },
  recours: { libelle: 'Recours', court: 'Rec.', couleur: '#e3d45f', modele: 'gpt-6-astra' },
}

export const ETATS = {
  en_file: { libelle: 'En file', actif: false },
  reflechit: { libelle: 'Réfléchit', actif: true },
  outil: { libelle: 'Outil', actif: true },
  attend: { libelle: 'Attend ses sous-agents', actif: false },
  termine: { libelle: 'Terminé', actif: false },
  echec: { libelle: 'Échec', actif: false },
}

export const estFini = (a) => a.etat === 'termine' || a.etat === 'echec'
export const estVivant = (a) => a.etat === 'reflechit' || a.etat === 'outil'

export const QUESTION = 'Un hydrure peut-il être supraconducteur à température ambiante sans pression extrême ?'

const SUJETS = [
  {
    titre: 'Hydrures sous pression : état des mesures', court: 'Hydrures',
    requetes: ['LaH10 Tc 250 K mégabar', 'H3S supraconductivité 203 K', 'effet Meissner diamond anvil cell', 'YH6 YH9 mesures résistivité'],
    experiences: ['Ajuste Tc(P) sur les 14 mesures publiées', 'Simule la courbe de résistivité de LaH10', 'Estime l’incertitude sur la pression'],
    assertions: ['LaH10 atteint 250 K à 170 GPa', 'H3S est reproduit par trois groupes', 'La Tc chute sous 100 GPa'],
  },
  {
    titre: 'Couplage électron-phonon : bornes théoriques', court: 'Électron-phonon',
    requetes: ['Allen-Dynes borne Tc', 'Eliashberg hydrures lambda', 'limite supérieure Tc phonon', 'Migdal breakdown hydrogène'],
    experiences: ['Résout les équations d’Eliashberg pour λ ∈ [1, 3]', 'Calcule ω_log pour cinq hydrures', 'Balaye μ* de 0,08 à 0,15'],
    assertions: ['Tc ≈ 0,18 ω_log √λ pour λ grand', 'Aucune borne dure sous 300 K', 'Le μ* domine l’incertitude'],
  },
  {
    titre: 'Reproductibilité : cas CSH et LK-99', court: 'Reproductibilité',
    requetes: ['CSH rétractation Nature 2022', 'LK-99 réplication Cu2S', 'analyse susceptibilité CSH données brutes', 'LK-99 ferromagnétisme'],
    experiences: ['Réanalyse les données brutes de susceptibilité', 'Simule la transition de Cu2S à 385 K', 'Compare 12 réplications de LK-99'],
    assertions: ['La transition de LK-99 vient de Cu2S', 'Les données CSH ont un fond soustrait non documenté', 'Aucune réplication indépendante de CSH'],
  },
  {
    titre: 'Métastabilité à pression ambiante', court: 'Métastabilité',
    requetes: ['hydrure métastable décompression', 'Mg2IrH6 prédiction ambiante', 'barrière cinétique hydrures', 'trempe haute pression'],
    experiences: ['Calcule les phonons de Mg2IrH6 à 0 GPa', 'Estime la barrière de décomposition', 'Criblage de 40 hydrures ternaires'],
    assertions: ['Mg2IrH6 est dynamiquement stable à 0 GPa', 'La barrière dépasse 0,5 eV/atome', 'Deux candidats ternaires sur 40'],
  },
]

const SUIVI = {
  titre: 'Contre-exemples : hydrures ternaires', court: 'Ternaires',
  requetes: ['LaBeH8 Tc 110 K 80 GPa', 'ternaires hydrures stabilisation chimique', 'précompression chimique'],
  experiences: ['Compare Tc et pression de stabilité sur 9 ternaires', 'Ajuste un front de Pareto Tc / pression'],
  assertions: ['LaBeH8 garde 110 K à 80 GPa', 'Le front de Pareto recule d’environ 30 GPa par an'],
}

const ARXIV = ['2101.01315', '1812.01561', '2203.05441', '2307.12008', '2308.01516', '1506.08190', '2210.10149', '2402.07714']

function mulberry32(graine) {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Étapes que les scripts produisent (yield)
const pense = (duree, texte) => ({ etat: 'reflechit', duree, texte })
const outil = (duree, nom, texte) => ({ etat: 'outil', duree, outil: nom, texte })
const lancer = (role, titre, donnees = {}) => ({ lancer: { role, titre, donnees } })
const attendre = (ids) => ({ attendre: ids })
const attendreUn = (ids) => ({ attendreUn: ids })

// ─── Scripts des rôles ───────────────────────────────────────────────────────────────────────────────

function* orchestrateur(a, h) {
  yield pense(h.entre(5, 7), `Lit la question : « ${QUESTION} »`)
  yield outil(h.entre(2, 3), 'lire_graphe', 'Lit le graphe existant (148 nœuds, 211 démonstrations)')
  yield pense(h.entre(4, 6), 'Découpe la recherche en trois missions de directeur de labo')
  const sujets = h.melanger(SUJETS).slice(0, 3)
  let restants = []
  for (const [i, sujet] of sujets.entries()) {
    restants.push(yield lancer('directeur_de_labo', sujet.titre, { ...sujet, dossier: `directeurs/0${i + 1}-${sujet.court.toLowerCase()}` }))
    yield pense(h.entre(1, 2), `Rédige la mission « ${sujet.court} »`)
  }
  const graphistes = []
  let suiviLance = false
  while (restants.length) {
    const fini = yield attendreUn(restants)
    restants = restants.filter((id) => id !== fini.id)
    yield pense(h.entre(2, 4), `Lit le rapport « ${fini.donnees.court} » (${fini.resultat})`)
    graphistes.push(yield lancer('graphiste', `Graphe : ${fini.donnees.court}`, fini.donnees))
    if (!suiviLance && h.hasard() < 0.85) {
      suiviLance = true
      yield pense(h.entre(3, 5), 'Une question reste ouverte : prépare une mission de suivi')
      restants.push(yield lancer('directeur_de_labo', SUIVI.titre, { ...SUIVI, dossier: 'directeurs/04-ternaires' }))
    }
  }
  yield attendre(graphistes)
  const demos = h.entier(18, 27)
  yield outil(h.entre(1, 2), 'verifier', `Appelle le vérificateur sur ${demos} démonstrations à vérifier`)
  const verif = yield lancer('verificateur', `Vérification de ${demos} démonstrations`, { demos })
  yield attendre([verif])
  yield outil(h.entre(2, 3), 'lire_graphe', 'Relit le graphe noté')
  yield pense(h.entre(7, 10), 'Rédige la synthèse pour Camille')
  return 'Synthèse rédigée'
}

function* directeur(a, h) {
  const d = a.donnees
  yield outil(h.entre(1, 2), 'ecrire', `Crée ${d.dossier}/journal.md`)
  yield pense(h.entre(5, 8), `Planifie la mission « ${d.titre} »`)
  const enfants = []
  const nLit = h.entier(1, 2)
  for (let i = 0; i < nLit; i++) {
    const requetes = h.melanger(d.requetes).slice(0, h.entier(2, 3))
    enfants.push(yield lancer('litterature', `Biblio : ${requetes[0]}`, { requetes }))
  }
  const experiences = h.melanger(d.experiences).slice(0, h.entier(1, 2))
  for (const exp of experiences) enfants.push(yield lancer('experimentateur', exp, { experience: exp }))
  yield outil(h.entre(1, 2), 'ecrire', 'Note les missions confiées dans journal.md')
  const resultats = yield attendre(enfants)
  for (const r of resultats.filter((r) => r.etat === 'echec')) {
    yield pense(h.entre(3, 5), `Analyse l’échec de « ${r.titre} » : ${r.resultat}`)
    const relance = yield lancer('experimentateur', `${r.donnees.experience} (relance)`, { ...r.donnees, relance: true })
    yield attendre([relance])
  }
  yield pense(h.entre(7, 11), 'Confronte la littérature aux résultats numériques')
  yield outil(h.entre(3, 5), 'ecrire', `Rédige ${d.dossier}/rapport.md`)
  return `${d.assertions.length + h.entier(2, 5)} assertions`
}

function* litterature(a, h) {
  let refs = 0
  for (const requete of a.donnees.requetes) {
    yield outil(h.entre(3, 5), 'recherche_web', `Recherche « ${requete} »`)
    const n = h.entier(1, 2)
    for (let i = 0; i < n; i++) {
      yield pense(h.entre(3, 6), `Lit arXiv:${h.choisir(ARXIV)}`)
      refs++
    }
  }
  yield pense(h.entre(4, 6), 'Synthétise l’état de l’art avec références')
  return `${refs} références`
}

function* experimentateur(a, h) {
  yield pense(h.entre(4, 6), `Conçoit le protocole : ${a.donnees.experience}`)
  yield outil(h.entre(2, 4), 'ecrire', 'Écrit simulation.py')
  yield outil(h.entre(8, 16), 'executer', 'Exécute python simulation.py')
  if (!a.donnees.relance && h.hasard() < 0.22) {
    yield pense(h.entre(2, 3), 'Lit la trace d’erreur')
    return { echec: h.choisir(['NaN dans le solveur d’Eliashberg', 'Divergence au-delà de 300 GPa', 'Données brutes introuvables']) }
  }
  yield pense(h.entre(4, 7), 'Analyse les résultats')
  yield outil(h.entre(2, 4), 'executer', 'Trace les figures (figures/*.png)')
  return 'Résultats reproductibles'
}

function* graphiste(a, h) {
  yield outil(h.entre(2, 3), 'lire', `Lit ${a.donnees.dossier}/rapport.md`)
  yield pense(h.entre(3, 5), 'Découpe le rapport en assertions')
  for (const assertion of a.donnees.assertions) {
    yield outil(h.entre(1, 2), 'creer_noeud', `Crée « ${assertion} »`)
  }
  const demos = h.entier(3, 6)
  for (let i = 0; i < demos; i++) yield outil(h.entre(1, 2), 'ajouter_demonstration', `Relie la démonstration ${i + 1}/${demos}`)
  return `${a.donnees.assertions.length} nœuds, ${demos} démonstrations`
}

function* verificateur(a, h) {
  const recours = []
  let valides = 0
  for (let i = 1; i <= a.donnees.demos; i++) {
    const confiance = 0.35 + h.hasard() * 0.64
    yield pense(h.entre(1, 2.5), `Démonstration ${i} : ${confiance > 0.6 ? 'valide' : 'douteuse'} (${confiance.toFixed(2)})`)
    if (confiance < 0.55 && recours.length < 3) recours.push(yield lancer('recours', `Recours : démonstration ${i}`, { demo: i }))
    else valides++
  }
  if (recours.length) yield attendre(recours)
  return `${valides} valides, ${recours.length} en recours`
}

function* recoursScript(a, h) {
  yield pense(h.entre(5, 9), `Rejuge la démonstration ${a.donnees.demo} avec le modèle de recours`)
  yield outil(h.entre(1, 2), 'noter_demonstration', 'Écrit le verdict définitif')
  return h.hasard() < 0.5 ? 'Invalide (0,81)' : 'Valide (0,72)'
}

const SCRIPTS = {
  orchestrateur, directeur_de_labo: directeur, litterature, experimentateur, graphiste, verificateur, recours: recoursScript,
}

const DEBIT = { orchestrateur: 70, directeur_de_labo: 90, litterature: 120, experimentateur: 60, graphiste: 50, verificateur: 140, recours: 80 }

// ─── Moteur ──────────────────────────────────────────────────────────────────────────────────────────

export class Simulation {
  constructor({ graine = 7, places = 6, vitesse = 4 } = {}) {
    this.places = places
    this.vitesse = vitesse
    this.enPause = false
    this.bouclage = true
    this._ecouteursTic = new Set()
    this._ecouteursEvt = new Set()
    this.redemarrer(graine)
  }

  redemarrer(graine = Math.floor(Math.random() * 1e6)) {
    this.graine = graine
    this.hasard = mulberry32(graine)
    this.temps = 0
    this.agents = new Map()
    this.ordre = []
    this.file = []
    this.evenements = []
    this.fini = false
    this._finiA = null
    this._compteur = 0
    this.racine = this._lancer(null, { role: 'orchestrateur', titre: QUESTION, donnees: {} })
    this._emettre({ type: 'redemarrage' })
  }

  surTic(fn) { this._ecouteursTic.add(fn); return () => this._ecouteursTic.delete(fn) }
  surEvenement(fn) { this._ecouteursEvt.add(fn); return () => this._ecouteursEvt.delete(fn) }

  get(id) { return this.agents.get(id) }
  enfants(a) { return a.enfants.map((id) => this.agents.get(id)) }
  liste() { return this.ordre.map((id) => this.agents.get(id)) }

  stats() {
    const s = { total: 0, actifs: 0, enFile: 0, attente: 0, termines: 0, echecs: 0, tokens: 0 }
    for (const a of this.agents.values()) {
      s.total++
      s.tokens += a.tokens
      if (estVivant(a)) s.actifs++
      else if (a.etat === 'en_file') s.enFile++
      else if (a.etat === 'attend') s.attente++
      else if (a.etat === 'termine') s.termines++
      else if (a.etat === 'echec') s.echecs++
    }
    return s
  }

  // Avance le temps simulé de `dt` secondes, par petits pas.
  avancer(dt) {
    let reste = dt
    while (reste > 1e-9) {
      const pas = Math.min(0.25, reste)
      this._pas(pas)
      reste -= pas
    }
  }

  avancerJusqua(t) { if (t > this.temps) this.avancer(t - this.temps) }

  demarrer() {
    let avant = performance.now()
    const boucle = (maintenant) => {
      const dtReel = Math.min(0.1, (maintenant - avant) / 1000)
      avant = maintenant
      if (!this.enPause) this.avancer(dtReel * this.vitesse)
      if (this.fini && this.bouclage && performance.now() - this._finiA > 12000) this.redemarrer()
      for (const fn of this._ecouteursTic) fn(this, dtReel)
      requestAnimationFrame(boucle)
    }
    requestAnimationFrame(boucle)
  }

  // ─── interne ───

  _outils() {
    const h = this.hasard
    return {
      hasard: h,
      entre: (min, max) => min + h() * (max - min),
      entier: (min, max) => min + Math.floor(h() * (max - min + 1)),
      choisir: (liste) => liste[Math.floor(h() * liste.length)],
      melanger: (liste) => liste.map((x) => [h(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]),
    }
  }

  _lancer(parent, { role, titre, donnees }) {
    const id = `a${++this._compteur}`
    const a = {
      id, role, titre, donnees,
      parentId: parent ? parent.id : null,
      profondeur: parent ? parent.profondeur + 1 : 0,
      enfants: [],
      modele: ROLES[role].modele,
      etat: 'en_file',
      creeA: this.temps, debut: null, fin: null, finEtat: null,
      tokens: 0, nbOutils: 0,
      activite: 'En attente d’une place',
      outilCourant: null,
      journal: [],
      resultat: null,
      _gen: null, _prochain: 0, _attente: null, _valeur: undefined, _debutEtat: this.temps,
    }
    a._gen = SCRIPTS[role](a, this._outils())
    this.agents.set(id, a)
    this.ordre.push(id)
    if (parent) parent.enfants.push(id)
    this.file.push(a)
    this._journal(a, 'lance', parent ? `Lancé par ${ROLES[parent.role].libelle.toLowerCase()}` : 'Tour lancé par Camille')
    return a
  }

  _journal(a, type, texte) {
    const entree = { t: this.temps, type, etat: a.etat, texte }
    a.journal.push(entree)
    const evt = { ...entree, agent: a }
    this.evenements.push(evt)
    this._emettre(evt)
  }

  _emettre(evt) { for (const fn of this._ecouteursEvt) fn(evt, this) }

  _changerEtat(a, etat, texte, nomOutil = null) {
    a.etat = etat
    a._debutEtat = this.temps
    a.activite = texte
    a.outilCourant = nomOutil
    if (etat === 'outil') a.nbOutils++
    this._journal(a, 'etat', texte)
  }

  _pas(dt) {
    if (this.fini) return
    this.temps += dt
    const h = this.hasard

    for (const a of this.agents.values()) {
      if (a.etat === 'reflechit') a.tokens += dt * DEBIT[a.role] * (0.6 + 0.8 * h())
      else if (a.etat === 'outil') a.tokens += dt * 6
    }

    // Des places libres : on démarre les agents en file, dans l'ordre de lancement.
    let actifs = 0
    for (const a of this.agents.values()) if (estVivant(a)) actifs++
    while (this.file.length && actifs < this.places) {
      const a = this.file.shift()
      a.debut = this.temps
      this._journal(a, 'demarre', `Démarre sur ${a.modele}`)
      this._executer(a)
      if (estVivant(a)) actifs++
    }

    for (const a of [...this.agents.values()]) {
      if (a.etat === 'attend') {
        const { ids, mode } = a._attente
        const agents = ids.map((id) => this.agents.get(id))
        if (mode === 'tous' && agents.every(estFini)) {
          a._valeur = agents
        } else if (mode === 'un') {
          const finis = agents.filter(estFini).sort((p, q) => p.fin - q.fin)
          if (finis.length) a._valeur = finis[0]
        }
        if (a._valeur !== undefined) { a._attente = null; this._executer(a) }
      } else if (estVivant(a) && this.temps >= a._prochain) {
        this._executer(a)
      }
    }
  }

  _executer(a) {
    let valeur = a._valeur
    a._valeur = undefined
    for (let garde = 0; garde < 64; garde++) {
      const { value, done } = a._gen.next(valeur)
      valeur = undefined
      if (done) return this._finir(a, value)
      if (value.lancer) {
        valeur = this._lancer(a, value.lancer).id
        continue
      }
      if (value.attendre || value.attendreUn) {
        const ids = value.attendre || value.attendreUn
        a._attente = { ids, mode: value.attendre ? 'tous' : 'un' }
        const n = ids.length
        this._changerEtat(a, 'attend', value.attendre ? `Attend ${n} sous-agent${n > 1 ? 's' : ''}` : `Attend le premier de ${n} sous-agents`)
        return
      }
      a._prochain = this.temps + value.duree
      this._changerEtat(a, value.etat, value.texte, value.outil || null)
      return
    }
  }

  _finir(a, valeur) {
    a.fin = this.temps
    a.outilCourant = null
    if (valeur && typeof valeur === 'object' && valeur.echec) {
      a.resultat = valeur.echec
      a.etat = 'echec'
      a.activite = `Échec : ${valeur.echec}`
      this._journal(a, 'echec', a.activite)
    } else {
      a.resultat = valeur
      a.etat = 'termine'
      a.activite = `Terminé : ${valeur}`
      this._journal(a, 'termine', a.activite)
    }
    if (a === this.racine) {
      this.fini = true
      this._finiA = performance.now()
    }
  }
}

// Construit une simulation à partir des paramètres d'URL (?graine=&vitesse=&places=&t=).
export function simulationDepuisUrl() {
  const p = new URLSearchParams(location.search)
  const sim = new Simulation({
    graine: Number(p.get('graine') || 7),
    vitesse: Number(p.get('vitesse') || 4),
    places: Number(p.get('places') || 6),
  })
  if (p.get('t')) sim.avancerJusqua(Number(p.get('t')))
  return sim
}

export function formatTemps(t) {
  const s = Math.max(0, Math.floor(t))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function formatTokens(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)} k` : `${Math.round(n)}`
}
