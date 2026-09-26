// Salle de contrôle : des panneaux imbriqués façon tmux. Chaque agent est un mini-terminal niché dans
// celui de son parent ; la surface suit l'activité (flex-grow animé), les agents finis se replient en
// jetons au bas de leur parent, et les agents en file patientent en onglets fantômes au bas de la scène.
//
// Rendu incrémental : un nœud DOM par agent (clé = agent.id), mis à jour à chaque image depuis l'état
// de la simulation ; seules les valeurs qui changent touchent le DOM.

import { simulationDepuisUrl, ROLES, ETATS, estFini, estVivant, formatTemps, formatTokens, QUESTION } from '../../commun/simulation.js'
import { monterBarre } from '../../commun/barre.js'

const sim = simulationDepuisUrl()
monterBarre(sim, { titre: 'Salle de contrôle', sousTitre: 'un terminal par agent, imbriqués comme leur hiérarchie' })

const MAX_LIGNES = 40 // lignes de journal gardées dans chaque terminal
const FRAPPE = 60 // caractères par seconde de la machine à écrire (à vitesse 3×)
const RESTE = { termine: 1800, echec: 4500 } // ms pendant lesquelles un agent fini reste déplié
const SORTIE = 650 // ms de l'animation de repli
const POIDS = { vivant: 4, attente: 0.5, fini: 1.4, rouvert: 2.6 }
const CODE = { en_file: 'f', reflechit: 'v', outil: 'v', attend: 'a', termine: 't', echec: 'e' }

// ─── Squelette ──────────────────────────────────────────────────────────────────────────────────────

const scene = document.querySelector('.scene')
const legendeRoles = Object.values(ROLES)
  .map((r) => `<span><i class="pastille" style="background:${r.couleur}"></i>${r.court}</span>`)
  .join('')
scene.innerHTML = `
  <div class="salle"></div>
  <aside class="inspecteur">
    <div class="i-cadre">
      <div class="i-tete">
        <i class="pastille-role"></i>
        <div class="i-ident"><span class="i-role"></span><span class="i-modele"></span></div>
        <button class="i-fermer" title="Fermer (Échap)">×</button>
      </div>
      <h2 class="i-titre"></h2>
      <div class="i-etat"><span class="i-puce"></span><span class="i-activite"></span></div>
      <div class="i-stats">
        <div><span>Durée</span><b data-i="duree"></b></div>
        <div><span>Tokens</span><b data-i="tokens"></b></div>
        <div><span>Appels d’outils</span><b data-i="outils"></b></div>
        <div><span>Sous-agents</span><b data-i="enfants"></b></div>
      </div>
      <div class="i-lib">Résultat</div>
      <p class="i-resultat"></p>
      <div class="i-lib">Journal<span class="i-nb"></span></div>
      <ol class="i-journal"></ol>
    </div>
  </aside>
  <footer class="file">
    <span class="file-titre">File d’attente<b class="file-nb">0</b></span>
    <span class="places" title="Places d’exécution occupées"></span>
    <div class="onglets"><span class="file-vide">vide — chaque agent lancé démarre dès qu’une place se libère</span></div>
    <div class="legende-salle">
      <div>${legendeRoles}</div>
      <div>
        <span><i class="l l-vivant"></i>travaille</span>
        <span><i class="l l-attend"></i>attend</span>
        <span><i class="l l-file"></i>en file</span>
        <span><b class="ok">✓</b><b class="ko">✗</b>replié, clic pour rouvrir</span>
      </div>
    </div>
  </footer>
`

const salle = scene.querySelector('.salle')
const ongletsEl = scene.querySelector('.onglets')
const fileNb = scene.querySelector('.file-nb')
const placesEl = scene.querySelector('.places')

// ─── État de la vue ─────────────────────────────────────────────────────────────────────────────────

let racine = null // agent racine affiché (change au redémarrage)
const noeuds = new Map() // id → panneau
const jetons = new Map() // id → jeton replié
const onglets = new Map() // id → onglet de la file
const vuFini = new Map() // id → instant (performance.now) où l'on a vu l'agent finir
const rouverts = new Set() // agents finis rouverts à la main
let plein = null // id du panneau en plein écran
let cacheFile = {}
let largeurSalle = Infinity
const LARGEUR_MIN = 190 // px en dessous desquels un panneau de la rangée devient illisible
new ResizeObserver(([entree]) => { largeurSalle = entree.contentRect.width }).observe(salle)

// ─── Utilitaires ────────────────────────────────────────────────────────────────────────────────────

function ecrire(el, texte, cache, cle) {
  if (cache[cle] === texte) return
  cache[cle] = texte
  el.textContent = texte
}

function basculer(el, classe, oui, cache) {
  const cle = `c:${classe}`
  if (cache[cle] === oui) return
  cache[cle] = oui
  el.classList.toggle(classe, oui)
}

function fixerGrow(el, valeur) {
  const v = String(Math.round(valeur * 100) / 100)
  if (el._grow === v) return
  el._grow = v
  el.style.flexGrow = v
}

function glyphe(e) {
  if (e.type === 'lance') return '+'
  if (e.type === 'demarre') return '▶'
  if (e.type === 'termine') return '✓'
  if (e.type === 'echec') return '✗'
  if (e.etat === 'outil') return '$'
  if (e.etat === 'attend') return '⧗'
  return '›'
}

function creerLigne(e, balise = 'div') {
  const l = document.createElement(balise)
  l.className = `l t-${e.type} e-${e.etat}`
  const h = document.createElement('span')
  h.className = 'h'
  h.textContent = formatTemps(e.t)
  const g = document.createElement('span')
  g.className = 'g'
  g.textContent = glyphe(e)
  const x = document.createElement('span')
  x.className = 'x'
  x.textContent = e.texte
  l.append(h, g, x)
  return l
}

function libelleEtat(a) {
  switch (a.etat) {
    case 'reflechit': return 'réfléchit'
    case 'outil': return a.outilCourant || 'outil'
    case 'attend': return 'attend'
    case 'termine': return '✓ terminé'
    case 'echec': return '✗ échec'
    default: return 'en file'
  }
}

const duree = (a) => (a.debut === null ? 0 : (a.fin ?? sim.temps) - a.debut)

// ─── Panneaux ───────────────────────────────────────────────────────────────────────────────────────

function creerPanneau(a, parent, maintenant) {
  const r = ROLES[a.role]
  const el = document.createElement('section')
  el.className = 'panneau'
  el.dataset.id = a.id
  el.style.setProperty('--c', r.couleur)
  el.innerHTML = `
    <header class="entete">
      <i class="pastille-role"></i>
      <span class="role">${r.court}</span>
      <span class="titre-p"></span>
      <span class="prog"></span>
      <span class="etat-p"></span>
      <span class="meta"><span class="chrono"></span><span class="tok"></span></span>
      <button class="replier" title="Replier en jeton">×</button>
    </header>
    <div class="corps">
      <div class="defile">
        <div class="lignes"></div>
        <div class="courante l"><span class="h"></span><span class="g"></span><span class="x"></span><i class="curseur"></i></div>
      </div>
    </div>
    <div class="enfants ${a.profondeur === 0 ? 'rangee' : 'colonne'}"></div>
    <div class="jetons"></div>`
  const q = (s) => el.querySelector(s)
  const n = {
    a, el,
    entete: q('.entete'), titre: q('.titre-p'), prog: q('.prog'), etat: q('.etat-p'),
    chrono: q('.chrono'), tok: q('.tok'),
    corps: q('.corps'), lignes: q('.lignes'), courante: q('.courante'),
    cH: q('.courante .h'), cG: q('.courante .g'), cX: q('.courante .x'),
    enfantsEl: q('.enfants'), jetonsEl: q('.jetons'),
    cache: {}, nbJ: 0, enCours: null, frappeDebut: 0, frappeMontres: -1,
    sortant: false, minuteur: 0,
  }
  n.titre.textContent = a === racine ? `« ${QUESTION} »` : a.titre
  n.entete.title = `${r.libelle} · ${a.titre}\nClic : inspecter · double-clic : plein écran`
  if (a.id === insp.id) el.classList.add('choisi')

  if (parent) {
    el.style.order = String(parent.a.enfants.indexOf(a.id))
    el.style.flexGrow = '0'
    el._grow = '0'
    parent.enfantsEl.append(el)
  } else {
    salle.append(el)
  }
  noeuds.set(a.id, n)
  syncJournal(n, maintenant, !estVivant(a))
  void el.offsetWidth // point de départ de la transition d'entrée (surface nulle)

  const onglet = onglets.get(a.id)
  if (onglet) {
    onglets.delete(a.id)
    envoler(onglet, el)
  }
  return n
}

function sortir(n) {
  n.sortant = true
  n.el.classList.add('sortant')
  fixerGrow(n.el, 0)
  if (plein && (plein === n.a.id || n.el.querySelector('.plein'))) quitterPlein()
  n.minuteur = setTimeout(() => supprimer(n), SORTIE)
}

function annulerSortie(n) {
  clearTimeout(n.minuteur)
  n.sortant = false
  n.el.classList.remove('sortant')
}

function supprimer(n) {
  if (noeuds.get(n.a.id) !== n) return // déjà nettoyé (redémarrage)
  for (const [id, m] of noeuds) if (n.el.contains(m.el)) noeuds.delete(id)
  for (const [id, j] of jetons) if (n.el.contains(j)) jetons.delete(id)
  n.el.remove()
}

function assurerJeton(a, parent) {
  if (jetons.has(a.id)) return
  const r = ROLES[a.role]
  const j = document.createElement('button')
  j.className = `jeton ${a.etat}`
  j.dataset.id = a.id
  j.style.setProperty('--c', r.couleur)
  j.style.order = String(parent.a.enfants.indexOf(a.id))
  j.innerHTML = `<b>${a.etat === 'echec' ? '✗' : '✓'}</b><span class="r">${r.court}</span><span class="t"></span>`
  j.querySelector('.t').textContent = a.titre
  j.title = `${r.libelle} · ${a.titre}\n${a.etat === 'echec' ? 'Échec' : 'Résultat'} : ${a.resultat}\nClic : rouvrir le panneau`
  if (a.id === insp.id) j.classList.add('choisi')
  parent.jetonsEl.append(j)
  jetons.set(a.id, j)
}

function retirerJeton(id) {
  const j = jetons.get(id)
  if (!j) return
  j.remove()
  jetons.delete(id)
}

// Un onglet de la file s'envole vers le panneau qui vient de naître.
function envoler(onglet, cible) {
  const de = onglet.getBoundingClientRect()
  const clone = onglet.cloneNode(true)
  clone.classList.add('envol')
  Object.assign(clone.style, {
    left: `${de.left}px`, top: `${de.top}px`, width: `${de.width}px`, height: `${de.height}px`, order: '',
  })
  document.body.append(clone)
  onglet.remove()
  requestAnimationFrame(() => {
    const vers = cible.getBoundingClientRect()
    const dx = vers.left + 8 - de.left
    const dy = vers.top + 2 - de.top
    clone.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(.96)`, opacity: 0.95, offset: 0.78 },
      { transform: `translate(${dx}px, ${dy}px) scale(.9)`, opacity: 0 },
    ], { duration: 720, easing: 'cubic-bezier(.3, .7, .2, 1)' }).onfinish = () => clone.remove()
  })
}

// ─── Journal et machine à écrire ────────────────────────────────────────────────────────────────────

function syncJournal(n, maintenant, instantane = false) {
  const j = n.a.journal
  if (j.length === n.nbJ) return
  const frag = document.createDocumentFragment()
  if (n.enCours) frag.append(creerLigne(n.enCours)) // l'ancienne ligne courante devient statique
  for (let i = Math.max(n.nbJ, j.length - MAX_LIGNES - 1); i < j.length - 1; i++) frag.append(creerLigne(j[i]))
  n.lignes.append(frag)
  let surplus = n.lignes.childElementCount - MAX_LIGNES
  while (surplus-- > 0) n.lignes.firstElementChild.remove()

  const e = j[j.length - 1]
  n.nbJ = j.length
  n.enCours = e
  n.frappeDebut = instantane ? -Infinity : maintenant
  n.frappeMontres = -1
  n.courante.className = `courante l t-${e.type} e-${e.etat}`
  n.cH.textContent = formatTemps(e.t)
  n.cG.textContent = glyphe(e)
}

function majFrappe(n, maintenant) {
  const e = n.enCours
  if (!e) return
  const vitesse = FRAPPE * Math.max(1, sim.vitesse / 3)
  const k = Math.min(e.texte.length, Math.floor(((maintenant - n.frappeDebut) / 1000) * vitesse))
  if (k === n.frappeMontres) return
  n.frappeMontres = k
  n.cX.textContent = e.texte.slice(0, k)
}

// ─── Rendu de l'arbre ───────────────────────────────────────────────────────────────────────────────

function doitAfficher(a, maintenant) {
  if (a === racine) return true
  if (a.etat === 'en_file') return false
  if (!estFini(a) || rouverts.has(a.id)) return true
  return maintenant - vuFini.get(a.id) < RESTE[a.etat]
}

// Rend l'agent et sa descendance ; renvoie le poids (surface demandée) du panneau, 0 s'il est replié.
function rendre(a, parent, maintenant) {
  const fini = estFini(a)
  let n = noeuds.get(a.id)
  // Premier constat de fin : on laisse le panneau déplié un instant, sauf s'il n'a jamais été vu.
  if (fini && !vuFini.has(a.id)) vuFini.set(a.id, n && !n.sortant ? maintenant : -Infinity)

  if (!doitAfficher(a, maintenant)) {
    if (n && !n.sortant) sortir(n)
    if (fini && parent) assurerJeton(a, parent)
    return 0
  }
  if (!n) n = creerPanneau(a, parent, maintenant)
  else if (n.sortant) annulerSortie(n)
  retirerJeton(a.id)

  let poidsEnfants = 0
  let nbAffiches = 0
  for (const id of a.enfants) {
    const p = rendre(sim.get(id), n, maintenant)
    if (p > 0) {
      poidsEnfants += p
      nbAffiches++
    }
  }

  const vivant = estVivant(a)
  const corps = vivant ? POIDS.vivant
    : fini ? (a === racine || rouverts.has(a.id) ? POIDS.rouvert : POIDS.fini)
      : nbAffiches ? 0 : POIDS.attente
  const total = corps + poidsEnfants + (a.etat === 'attend' ? POIDS.attente : 0)

  majPanneau(n, a, maintenant, corps, poidsEnfants, nbAffiches)
  if (a !== racine) fixerGrow(n.el, total)
  return total
}

function majPanneau(n, a, maintenant, corps, poidsEnfants, nbAffiches) {
  const c = n.cache
  if (c.etat !== a.etat) {
    c.etat = a.etat
    n.el.dataset.etat = a.etat
    n.el.classList.toggle('vivant', estVivant(a))
  }
  ecrire(n.etat, libelleEtat(a), c, 'libEtat')
  ecrire(n.chrono, formatTemps(duree(a)), c, 'chrono')
  ecrire(n.tok, `${formatTokens(a.tokens)} tok`, c, 'tok')
  majProgression(n, a)
  basculer(n.el, 'a-enfants', nbAffiches > 0, c)
  basculer(n.el, 'a-jetons', n.jetonsEl.childElementCount > 0, c)
  basculer(n.el, 'rouvert', rouverts.has(a.id), c)
  // Rangée de l'orchestrateur : au-delà de ce que la largeur permet, on passe en grille qui enveloppe.
  if (n.enfantsEl.classList.contains('rangee')) basculer(n.enfantsEl, 'grille', nbAffiches * LARGEUR_MIN > largeurSalle - 40, c)
  fixerGrow(n.corps, corps)
  fixerGrow(n.enfantsEl, poidsEnfants)
  syncJournal(n, maintenant)
  majFrappe(n, maintenant)
}

// Une pastille par sous-agent dans l'en-tête : on voit d'un coup d'œil qui avance sous un agent en attente.
function majProgression(n, a) {
  if (!a.enfants.length) return
  let signature = ''
  for (const id of a.enfants) signature += CODE[sim.get(id).etat]
  if (n.cache.prog === signature) return
  n.cache.prog = signature
  n.prog.innerHTML = a.enfants.map((id, i) => {
    const e = sim.get(id)
    return `<i class="p-${signature[i]}" style="--c:${ROLES[e.role].couleur}" title="${ROLES[e.role].libelle} · ${ETATS[e.etat].libelle}"></i>`
  }).join('')
}

// ─── File d'attente ─────────────────────────────────────────────────────────────────────────────────

function creerOnglet(a) {
  const r = ROLES[a.role]
  const parent = a.parentId ? sim.get(a.parentId) : null
  const o = document.createElement('div')
  o.className = 'onglet'
  o.dataset.id = a.id
  o.style.setProperty('--c', r.couleur)
  o.innerHTML = '<i class="pastille-role"></i><span class="r"></span><span class="t"></span><span class="w"></span>'
  o.querySelector('.r').textContent = r.court
  o.querySelector('.t').textContent = a.titre
  o.title = `${r.libelle} · ${a.titre}${parent ? `\nLancé par ${ROLES[parent.role].libelle.toLowerCase()}` : ''}`
  o._w = o.querySelector('.w')
  if (a.id === insp.id) o.classList.add('choisi')
  return o
}

function majFile() {
  for (const [id, o] of onglets) {
    const a = sim.get(id)
    if (!a || a.etat !== 'en_file') {
      o.remove()
      onglets.delete(id)
    }
  }
  sim.file.forEach((a, i) => {
    let o = onglets.get(a.id)
    if (!o) {
      o = creerOnglet(a)
      ongletsEl.append(o)
      onglets.set(a.id, o)
    }
    if (o._ordre !== i) {
      o._ordre = i
      o.style.order = String(i)
    }
    const w = formatTemps(sim.temps - a.creeA)
    if (o._texteW !== w) {
      o._texteW = w
      o._w.textContent = w
    }
  })
  ecrire(fileNb, String(sim.file.length), cacheFile, 'nb')

  let actifs = 0
  for (const a of sim.agents.values()) if (estVivant(a)) actifs++
  const cle = `${actifs}/${sim.places}`
  if (cacheFile.places !== cle) {
    cacheFile.places = cle
    placesEl.innerHTML = Array.from({ length: sim.places }, (_, i) => `<i class="${i < actifs ? 'pris' : ''}"></i>`).join('')
      + `<span>${actifs}/${sim.places} places</span>`
  }
}

// ─── Inspecteur ─────────────────────────────────────────────────────────────────────────────────────

const inspEl = scene.querySelector('.inspecteur')
const insp = {
  id: null, nbJ: 0, maj: 0,
  cadre: inspEl.querySelector('.i-cadre'),
  role: inspEl.querySelector('.i-role'),
  modele: inspEl.querySelector('.i-modele'),
  titre: inspEl.querySelector('.i-titre'),
  puce: inspEl.querySelector('.i-puce'),
  activite: inspEl.querySelector('.i-activite'),
  duree: inspEl.querySelector('[data-i="duree"]'),
  tokens: inspEl.querySelector('[data-i="tokens"]'),
  outils: inspEl.querySelector('[data-i="outils"]'),
  enfants: inspEl.querySelector('[data-i="enfants"]'),
  resultat: inspEl.querySelector('.i-resultat'),
  nb: inspEl.querySelector('.i-nb'),
  journal: inspEl.querySelector('.i-journal'),
}

function marquerChoisi(id, oui) {
  if (!id) return
  noeuds.get(id)?.el.classList.toggle('choisi', oui)
  jetons.get(id)?.classList.toggle('choisi', oui)
  onglets.get(id)?.classList.toggle('choisi', oui)
}

function ouvrirInspecteur(id) {
  const a = sim.get(id)
  if (!a) return
  if (insp.id !== id) {
    marquerChoisi(insp.id, false)
    insp.id = id
    insp.nbJ = 0
    insp.maj = 0
    insp.journal.replaceChildren()
    const r = ROLES[a.role]
    inspEl.style.setProperty('--c', r.couleur)
    insp.role.textContent = r.libelle
    insp.modele.textContent = a.modele
    insp.titre.textContent = a.titre
    marquerChoisi(id, true)
  }
  scene.classList.add('inspecte')
}

function fermerInspecteur() {
  marquerChoisi(insp.id, false)
  insp.id = null
  scene.classList.remove('inspecte')
}

function majInspecteur(maintenant) {
  if (!insp.id) return
  const a = sim.get(insp.id)
  if (!a) return fermerInspecteur()

  // Journal horodaté : ajout incrémental, défilement collé en bas si l'on y était déjà.
  if (a.journal.length > insp.nbJ) {
    const j = insp.journal
    const enBas = j.scrollHeight - j.scrollTop - j.clientHeight < 30
    const frag = document.createDocumentFragment()
    for (let i = insp.nbJ; i < a.journal.length; i++) frag.append(creerLigne(a.journal[i], 'li'))
    j.append(frag)
    insp.nbJ = a.journal.length
    insp.nb.textContent = ` · ${insp.nbJ} entrées`
    if (enBas) j.scrollTop = j.scrollHeight
  }

  if (maintenant - insp.maj < 120) return
  insp.maj = maintenant
  const vivant = estVivant(a)
  insp.puce.className = `i-puce ${vivant ? 'vivant' : a.etat}`
  insp.puce.textContent = a.etat === 'outil' ? `$ ${a.outilCourant}` : ETATS[a.etat].libelle
  insp.activite.textContent = a.etat === 'outil' || a.etat === 'reflechit' || a.etat === 'attend' ? a.activite : ''
  insp.duree.textContent = a.debut === null ? `file ${formatTemps(sim.temps - a.creeA)}` : formatTemps(duree(a))
  insp.tokens.textContent = formatTokens(a.tokens)
  insp.outils.textContent = String(a.nbOutils)
  const enfants = sim.enfants(a)
  insp.enfants.textContent = enfants.length
    ? `${enfants.filter(estFini).length}/${enfants.length}${enfants.some((e) => e.etat === 'echec') ? ' ✗' : ''}`
    : '—'
  insp.resultat.className = `i-resultat ${a.resultat === null ? 'vide' : a.etat}`
  insp.resultat.textContent = a.resultat ?? (a.etat === 'en_file' ? 'Pas encore démarré' : 'En cours…')
}

// ─── Plein écran (zoom tmux) ────────────────────────────────────────────────────────────────────────

function quitterPlein() {
  plein = null
  salle.querySelectorAll('.plein, .chemin').forEach((el) => el.classList.remove('plein', 'chemin'))
  scene.classList.remove('a-plein')
}

function basculerPlein(id) {
  const cible = plein === id ? null : id
  quitterPlein()
  const n = cible && noeuds.get(cible)
  if (!n || n.sortant) return
  plein = cible
  n.el.classList.add('plein')
  let p = n.el.parentElement.closest('.panneau')
  while (p) {
    p.classList.add('chemin')
    p = p.parentElement.closest('.panneau')
  }
  scene.classList.add('a-plein')
}

// ─── Redémarrage ────────────────────────────────────────────────────────────────────────────────────

function reinitialiser() {
  fermerInspecteur()
  quitterPlein()
  for (const n of noeuds.values()) clearTimeout(n.minuteur)
  for (const o of onglets.values()) o.remove()
  salle.replaceChildren()
  noeuds.clear()
  jetons.clear()
  onglets.clear()
  vuFini.clear()
  rouverts.clear()
  cacheFile = {}
  racine = sim.racine
}

// ─── Interactions ───────────────────────────────────────────────────────────────────────────────────

scene.addEventListener('click', (e) => {
  const t = e.target
  if (t.closest('.i-fermer')) return fermerInspecteur()
  const replier = t.closest('.replier')
  if (replier) {
    rouverts.delete(replier.closest('.panneau').dataset.id)
    return
  }
  const jeton = t.closest('.jeton')
  if (jeton) {
    rouverts.add(jeton.dataset.id)
    ouvrirInspecteur(jeton.dataset.id)
    return
  }
  const onglet = t.closest('.onglet')
  if (onglet) return ouvrirInspecteur(onglet.dataset.id)
  const zone = t.closest('.entete, .corps')
  if (zone) ouvrirInspecteur(zone.parentElement.dataset.id)
})

scene.addEventListener('dblclick', (e) => {
  if (e.target.closest('.replier')) return
  const entete = e.target.closest('.entete')
  if (entete) basculerPlein(entete.parentElement.dataset.id)
})

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (plein) quitterPlein()
  else if (insp.id) fermerInspecteur()
})

// ─── Boucle ─────────────────────────────────────────────────────────────────────────────────────────

sim.surEvenement((evt) => {
  if (evt.type === 'redemarrage') return reinitialiser()
  // Un lancement fait clignoter l'en-tête du parent, dans la couleur du nouveau sous-agent.
  if (evt.type !== 'lance' || !evt.agent.parentId) return
  const n = noeuds.get(evt.agent.parentId)
  if (!n || n.sortant || n.a !== sim.get(evt.agent.parentId)) return
  n.entete.animate([{ backgroundColor: `${ROLES[evt.agent.role].couleur}55`, offset: 0 }], { duration: 800, easing: 'ease-out' })
})

sim.surTic(() => {
  const maintenant = performance.now()
  if (sim.racine !== racine) reinitialiser()
  rendre(racine, null, maintenant)
  majFile()
  majInspecteur(maintenant)
})

sim.demarrer()
