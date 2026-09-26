// 06 · Bibliothèque en vignettes. L'accueil montre les projets en cartes, couvertes par leurs vraies figures.
// La vue Documents est une grille de vignettes (miniatures des figures, titre et extrait des rapports), filtrée par
// type, par portée (session ou projet) et par dossier ; un clic ouvre une visionneuse plein cadre (← → Échap).
import { PROJETS, dateRelative, projet, session, sessionsDu } from '../../commun/donnees.js'
import { AGENTS, FICHIERS, ICONES, fichier, fichiersDuProjet, iconeFichier, libelleSegment } from '../../commun/bunker.js'
import { extrait, rendreContenu, titreMarkdown } from '../../commun/apercu.js'
import {
  brancherLiensFichiers, echapper, htmlArbreAgents, htmlFil, htmlListeSessions, htmlSaisie, monterBarre, monterPanneauDroit,
} from '../../commun/ui.js'

monterBarre()
const app = document.querySelector('#app')
const etat = { projet: null, session: null, portee: 'session', filtre: 'tout', dossier: null, affiches: [] }
let panneau = null

const FILTRES = [
  { id: 'tout', libelle: 'Tout', genres: null },
  { id: 'rapports', libelle: 'Rapports', genres: ['markdown'] },
  { id: 'figures', libelle: 'Figures', genres: ['image'] },
  { id: 'pdf', libelle: 'PDF', genres: ['pdf'] },
  { id: 'donnees', libelle: 'Données', genres: ['donnees', 'json', 'texte'] },
  { id: 'scripts', libelle: 'Scripts', genres: ['code'] },
]

const monogramme = (p) => p.court.split(/\s+/).map((m) => m[0]).join('').slice(0, 2).toUpperCase()

// ── Accueil : cartes de projets ─────────────────────────────

function rendreAccueil() {
  app.innerHTML = `<div class="biblio-accueil"><div class="biblio-cadre">
    <span class="marque">Atlas</span>
    <h1>Vos projets</h1>
    <p class="sous">Chaque carte montre les dernières figures produites par les agents du projet.</p>
    <div class="cartes-projets">${PROJETS.map((p) => {
      const images = fichiersDuProjet(p.id).filter((f) => f.genre === 'image').sort((a, b) => b.modifie.localeCompare(a.modifie)).slice(0, 4)
      const couverture = images.length
        ? `<div class="couverture n${images.length}">${images.map((f) => `<img src="${f.url}" alt="" loading="lazy">`).join('')}</div>`
        : `<div class="couverture sans-image"><span>${monogramme(p)}</span></div>`
      const n = sessionsDu(p.id).length
      return `<button type="button" class="carte-projet" data-projet="${p.id}">${couverture}
        <div class="corps"><div class="nom">${echapper(p.nom)}</div><div class="desc">${echapper(p.description)}</div>
        <div class="chiffres">${n} session${n > 1 ? 's' : ''} · ${fichiersDuProjet(p.id).length} documents · ${dateRelative(sessionsDu(p.id)[0]?.modifie ?? p.cree)}</div></div></button>`
    }).join('')}</div></div></div>`
  app.querySelectorAll('[data-projet]').forEach((b) => b.addEventListener('click', () => entrer(b.dataset.projet)))
}

// ── App ─────────────────────────────────────────────────────

function entrer(id) {
  etat.projet = id
  etat.session = null
  etat.portee = 'projet'
  etat.filtre = 'tout'
  etat.dossier = id
  rendreApp()
}

function rendreApp() {
  const p = projet(etat.projet)
  app.innerHTML = `<div class="trois-colonnes">
    <aside class="laterale">
      <div class="laterale-tete"><span class="marque">Atlas</span></div>
      <button type="button" class="retour-projets">← Tous les projets</button>
      <div class="nom-projet-lateral">${echapper(p.nom)}</div>
      <button type="button" class="nouvelle-session">${ICONES.plus} Nouvelle recherche</button>
      <nav class="sessions-liste"></nav>
    </aside>
    <main class="conversation"></main>
    <section class="panneau"></section>
  </div>`
  app.querySelector('.retour-projets').addEventListener('click', () => { etat.projet = null; rendreAccueil() })
  app.querySelector('.nouvelle-session').addEventListener('click', () => ouvrirSession(null))
  app.querySelector('.sessions-liste').addEventListener('click', (e) => {
    const a = e.target.closest('[data-session]')
    if (!a) return
    e.preventDefault()
    ouvrirSession(a.dataset.session)
  })
  panneau = monterPanneauDroit(app.querySelector('.panneau'), { initial: 'documents' })
  monterDocuments()
  rendreSessions()
  rendreConversation()
}

function rendreSessions() {
  app.querySelector('.sessions-liste').innerHTML = htmlListeSessions(sessionsDu(etat.projet), etat.session)
}

function rendreConversation() {
  const zone = app.querySelector('.conversation')
  const p = projet(etat.projet)
  if (!etat.session) {
    zone.innerHTML = `<div class="fil"><div class="accueil-projet"><h2>${echapper(p.nom)}</h2><p>${echapper(p.description)}</p>
      <p>Ouvrez une session à gauche ; la bibliothèque à droite montre tous les documents du projet.</p></div></div>
      <div class="bas">${htmlSaisie({ placeholder: `Nouvelle recherche dans « ${p.court} »…` })}</div>`
    return
  }
  const s = session(etat.session)
  zone.innerHTML = `<header class="conv-tete"><div class="conv-titres">
      <h1 class="conv-titre">${echapper(s.titre)}</h1><div class="conv-sous">${echapper(p.court)} · ${s.statut === 'en_cours' ? 'en cours' : 'terminée'} · ${dateRelative(s.modifie)}</div></div></header>
    <div class="fil"><div class="fil-contenu">${htmlFil(s)}</div></div>
    <div class="bas">${htmlArbreAgents(s, { ouvert: false })}${htmlSaisie()}</div>`
  brancherLiensFichiers(zone, (chemin) => montrerFichier(chemin))
}

function ouvrirSession(id) {
  etat.session = id
  etat.portee = id ? 'session' : 'projet'
  etat.dossier = racinePortee()
  etat.filtre = 'tout'
  rendreSessions()
  rendreConversation()
  rendreDocuments()
}

// ── Documents : grille de vignettes ─────────────────────────

const racinePortee = () => (etat.portee === 'session' && etat.session ? `${etat.projet}/sessions/${etat.session}` : etat.projet)

function monterDocuments() {
  panneau.vues.documents.innerHTML = `<div class="biblio">
      <div class="biblio-barre">
        <div class="rang"><div class="bascule portee"><button type="button" data-portee="session">Cette session</button><button type="button" data-portee="projet">Tout le projet</button></div>
          <span class="espace"></span><span class="filtres rang"></span></div>
        <div class="rang"><nav class="fil-dossiers" aria-label="Dossier"></nav></div>
        <div class="sous-dossiers"></div>
      </div>
      <div class="grille-docs"></div>
    </div>`
  const vue = panneau.vues.documents
  vue.querySelector('.portee').addEventListener('click', (e) => {
    const b = e.target.closest('[data-portee]')
    if (!b || b.disabled) return
    etat.portee = b.dataset.portee
    etat.dossier = racinePortee()
    rendreDocuments()
  })
  vue.querySelector('.filtres').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtre]')
    if (!b) return
    etat.filtre = b.dataset.filtre
    rendreDocuments()
  })
  const allerA = (e) => {
    const b = e.target.closest('[data-dossier]')
    if (!b) return
    etat.dossier = b.dataset.dossier
    rendreDocuments()
  }
  vue.querySelector('.fil-dossiers').addEventListener('click', allerA)
  vue.querySelector('.sous-dossiers').addEventListener('click', allerA)
  vue.querySelector('.grille-docs').addEventListener('click', (e) => {
    const v = e.target.closest('[data-fichier]')
    if (v) ouvrirVisionneuse(etat.affiches.findIndex((f) => f.chemin === v.dataset.fichier))
  })
  rendreDocuments()
}

/** Libellé d'un segment du fil de dossiers (titres de projet et de session plutôt qu'identifiants). */
function libelleDossier(chemin) {
  const parties = chemin.split('/')
  if (parties.length === 1) return projet(parties[0]).court
  return libelleSegment(parties.at(-1), parties.slice(0, -1).join('/'))
}

function rendreDocuments() {
  if (!panneau) return
  const vue = panneau.vues.documents
  vue.querySelectorAll('.portee button').forEach((b) => {
    b.classList.toggle('actif', b.dataset.portee === etat.portee)
    b.disabled = b.dataset.portee === 'session' && !etat.session
  })
  const racine = racinePortee()
  if (!etat.dossier?.startsWith(racine)) etat.dossier = racine
  const dansDossier = FICHIERS.filter((f) => f.chemin.startsWith(`${etat.dossier}/`))
  // Filtres par type, avec le nombre de fichiers dans le dossier courant.
  vue.querySelector('.filtres').innerHTML = FILTRES.map((x) => {
    const n = x.genres ? dansDossier.filter((f) => x.genres.includes(f.genre)).length : dansDossier.length
    return `<button type="button" class="puce${x.id === etat.filtre ? ' actif' : ''}" data-filtre="${x.id}">${x.libelle}<span class="n">${n}</span></button>`
  }).join('')
  // Fil de dossiers, de la racine de la portée au dossier courant.
  const segments = etat.dossier.slice(racine.length).split('/').filter(Boolean)
  const chemins = [racine, ...segments.map((_, i) => `${racine}/${segments.slice(0, i + 1).join('/')}`)]
  vue.querySelector('.fil-dossiers').innerHTML = chemins
    .map((c, i) => `${i ? '<span class="sep">›</span>' : ''}<button type="button" data-dossier="${c}">${echapper(libelleDossier(c))}</button>`)
    .join('')
  // Sous-dossiers immédiats (non vides).
  const sous = [...new Set(dansDossier.map((f) => f.chemin.slice(etat.dossier.length + 1).split('/')).filter((p) => p.length > 1).map((p) => p[0]))].sort()
  vue.querySelector('.sous-dossiers').innerHTML = sous
    .map((s) => {
      const c = `${etat.dossier}/${s}`
      const n = dansDossier.filter((f) => f.chemin.startsWith(`${c}/`)).length
      return `<button type="button" data-dossier="${c}">${ICONES.dossier}${echapper(libelleDossier(c))}<span style="color:var(--texte-3)">${n}</span></button>`
    })
    .join('')
  // Grille : tout le contenu du dossier, sous-dossiers compris, du plus récent au plus ancien.
  const genres = FILTRES.find((x) => x.id === etat.filtre).genres
  etat.affiches = dansDossier
    .filter((f) => !genres || genres.includes(f.genre))
    .sort((a, b) => b.modifie.localeCompare(a.modifie))
  const grille = vue.querySelector('.grille-docs')
  grille.innerHTML = etat.affiches.map(htmlVignette).join('') || '<p class="vide">Aucun document de ce type ici.</p>'
  grille.scrollTop = 0
  // Titres et extraits des rapports, chargés après coup.
  for (const f of etat.affiches.filter((x) => x.genre === 'markdown')) {
    Promise.all([titreMarkdown(f), extrait(f, 180)]).then(([t, x]) => {
      const v = grille.querySelector(`[data-fichier="${CSS.escape(f.chemin)}"] .visuel`)
      if (v) v.innerHTML = `<b>${echapper(t)}</b><span>${echapper(x)}</span>`
    })
  }
}

function htmlVignette(f) {
  let visuel
  if (f.genre === 'image') visuel = `<div class="visuel"><img src="${f.url}" alt="" loading="lazy"></div>`
  else if (f.genre === 'markdown') visuel = `<div class="visuel texte"><b>${echapper(f.nom)}</b><span></span></div>`
  else visuel = `<div class="visuel icone-grande"><div>${iconeFichier(f)}<span class="ext">${f.extension}</span></div></div>`
  const ou = f.session && etat.portee === 'projet' ? session(f.session).titre : f.relatif.split('/').slice(0, -1).join('/') || 'racine'
  return `<button type="button" class="vignette" data-fichier="${f.chemin}" title="${echapper(f.relatif)}">${visuel}
    <div class="legende"><div class="nom">${echapper(f.nom)}</div><div class="meta">${AGENTS[f.agent].libelle} · ${echapper(ou)}</div></div></button>`
}

// ── Visionneuse plein cadre ─────────────────────────────────

let visionneuse = null

function ouvrirVisionneuse(i) {
  if (i < 0) return
  if (!visionneuse) {
    visionneuse = document.createElement('div')
    visionneuse.className = 'visionneuse'
    visionneuse.innerHTML = `<div class="visionneuse-cadre" role="dialog" aria-modal="true">
      <div class="visionneuse-tete"><span class="titre"></span><span class="compteur"></span>
        <button type="button" class="discret" data-pas="-1" title="Précédent (←)">←</button>
        <button type="button" class="discret" data-pas="1" title="Suivant (→)">→</button>
        <a class="discret ouvrir" target="_blank" rel="noopener" style="text-decoration:none;padding:4px 8px;font-size:12.5px;color:var(--texte-2)">Ouvrir ↗</a>
        <button type="button" class="icone fermer" title="Fermer (Échap)">${ICONES.fermer}</button></div>
      <div class="visionneuse-corps"></div></div>`
    document.body.append(visionneuse)
    visionneuse.addEventListener('click', (e) => {
      if (e.target === visionneuse || e.target.closest('.fermer')) return fermerVisionneuse()
      const b = e.target.closest('[data-pas]')
      if (b) naviguer(Number(b.dataset.pas))
    })
  }
  visionneuse.dataset.i = i
  const f = etat.affiches[i]
  const ou = f.session ? session(f.session).titre : 'Fichiers du projet'
  visionneuse.querySelector('.titre').innerHTML = `<b>${echapper(f.nom)}</b><span>${echapper(ou)} · ${AGENTS[f.agent].libelle}${f.directeur ? ` ${f.directeur}` : ''} · ${dateRelative(f.modifie)}</span>`
  visionneuse.querySelector('.compteur').textContent = `${i + 1} / ${etat.affiches.length}`
  visionneuse.querySelector('.ouvrir').href = f.url
  rendreContenu(visionneuse.querySelector('.visionneuse-corps'), f)
}

function naviguer(pas) {
  const n = etat.affiches.length
  ouvrirVisionneuse((Number(visionneuse.dataset.i) + pas + n) % n)
}

function fermerVisionneuse() {
  visionneuse?.remove()
  visionneuse = null
}

document.addEventListener('keydown', (e) => {
  if (!visionneuse) return
  if (e.key === 'Escape') fermerVisionneuse()
  if (e.key === 'ArrowRight') naviguer(1)
  if (e.key === 'ArrowLeft') naviguer(-1)
})

/** Lien de fichier cité dans le fil : Documents, dossier du fichier, puis visionneuse. */
function montrerFichier(chemin) {
  const f = fichier(chemin)
  panneau.choisir('documents')
  etat.portee = f.session ? 'session' : 'projet'
  etat.filtre = 'tout'
  etat.dossier = f.dossier
  rendreDocuments()
  ouvrirVisionneuse(etat.affiches.findIndex((x) => x.chemin === chemin))
}

rendreAccueil()
