// 02 · Projets avec connaissances (façon Claude / ChatGPT Projects). À l'ouverture : la page Projets.
// Un projet a sa page : instructions, fichiers du projet (le contexte partagé), sessions. La vue Documents
// sépare les connaissances du projet, la session courante et les autres sessions.
import { PROJETS, dateRelative, projet, session, sessionsDu } from '../../commun/donnees.js'
import {
  arbre, fichier, fichiersDeSession, fichiersDuProjetSeul, iconeFichier, libelleSegment, monterArbo, tailleLisible,
} from '../../commun/bunker.js'
import { afficherApercu, lireTexte, markdownVersHtml } from '../../commun/apercu.js'
import {
  ICONES, brancherLiensFichiers, echapper, htmlArbreAgents, htmlFil, htmlListeSessions, htmlSaisie, monterBarre, monterPanneauDroit,
} from '../../commun/ui.js'

monterBarre()
const app = document.querySelector('#app')
// page : 'projets' | 'projet' | 'session'
const etat = { page: 'projets', projet: null, session: null, filtre: '' }

function lireAncre() {
  const [p, s] = location.hash.slice(1).split('/')
  etat.projet = projet(p) ? p : null
  etat.session = etat.projet && session(s)?.projet === p ? s : null
  etat.page = etat.session ? 'session' : etat.projet ? 'projet' : 'projets'
}
const ecrireAncre = () => history.replaceState(null, '', `#${[etat.projet, etat.session].filter(Boolean).join('/')}`)

app.innerHTML = `<div class="trois-colonnes">
  <aside class="laterale">
    <div class="laterale-tete"><span class="marque">Atlas</span></div>
    <div class="nav-lat"><button type="button" data-aller="projets">${ICONES.projet} Projets</button></div>
    <div class="zone-projet"></div>
    <nav class="sessions-liste"></nav>
  </aside>
  <main class="conversation"></main>
  <section class="panneau"></section>
</div>`

const laterale = app.querySelector('.laterale')
const centre = app.querySelector('.conversation')
const panneau = monterPanneauDroit(app.querySelector('.panneau'), { initial: 'documents', surChangement: () => {} })

laterale.addEventListener('click', (e) => {
  const aller = e.target.closest('[data-aller]')
  if (aller) {
    if (aller.dataset.aller === 'projets') allerProjets()
    else if (aller.dataset.aller === 'projet') allerProjet(etat.projet)
    else if (aller.dataset.aller === 'nouvelle') allerProjet(etat.projet)
    return
  }
  const s = e.target.closest('[data-session]')
  if (s) {
    e.preventDefault()
    allerSession(s.dataset.session)
  }
})

function allerProjets() {
  etat.page = 'projets'
  etat.projet = null
  etat.session = null
  rendre()
}
function allerProjet(p) {
  etat.page = 'projet'
  etat.projet = p
  etat.session = null
  rendre()
}
function allerSession(s) {
  etat.page = 'session'
  etat.projet = session(s).projet
  etat.session = s
  rendre()
}

function rendre() {
  ecrireAncre()
  rendreLaterale()
  if (etat.page === 'projets') rendrePageProjets()
  else if (etat.page === 'projet') rendrePageProjet()
  else rendreSession()
  rendreDocuments()
}

function rendreLaterale() {
  laterale.querySelector('[data-aller="projets"]').classList.toggle('actif', etat.page === 'projets')
  const zone = laterale.querySelector('.zone-projet')
  const liste = laterale.querySelector('.sessions-liste')
  if (!etat.projet) {
    zone.innerHTML = ''
    // Sans projet : les sessions récentes de tous les projets.
    const recentes = PROJETS.flatMap((p) => sessionsDu(p.id)).sort((a, b) => b.modifie.localeCompare(a.modifie)).slice(0, 6)
    liste.innerHTML = `<h3>Récentes, tous projets</h3>${recentes
      .map((s) => `<a class="session" data-session="${s.id}" href="#"><span class="session-titre">${echapper(s.titre)}</span><span class="session-statut">${echapper(projet(s.projet).court)}</span></a>`)
      .join('')}`
    return
  }
  const p = projet(etat.projet)
  zone.innerHTML = `<div class="projet-courant" data-aller="projet" title="Page du projet">
      <div class="etiq">Projet</div><div class="nom">${echapper(p.nom)}</div></div>
    <button type="button" class="nouvelle-session" data-aller="nouvelle" style="margin-top:8px">${ICONES.plus} Nouvelle session</button>`
  liste.innerHTML = htmlListeSessions(sessionsDu(p.id), etat.session)
}

function rendrePageProjets() {
  centre.innerHTML = `<div class="page"><div class="page-cadre">
    <h1>Projets</h1>
    <p class="sous">Chaque projet réunit des sessions, des instructions communes et des fichiers de référence partagés par tous les agents.</p>
    <label class="recherche">${ICONES.recherche}<input type="search" placeholder="Rechercher un projet…" value="${echapper(etat.filtre)}"></label>
    <div class="grille-projets"></div>
  </div></div>`
  const grille = centre.querySelector('.grille-projets')
  const dessiner = () => {
    const f = etat.filtre.toLowerCase()
    const liste = PROJETS.filter((p) => (p.nom + ' ' + p.description).toLowerCase().includes(f))
    grille.innerHTML =
      liste
        .map((p) => {
          const n = sessionsDu(p.id).length
          return `<button type="button" class="carte-projet" data-projet="${p.id}">
          <span class="nom">${echapper(p.nom)}</span><span class="desc">${echapper(p.description)}</span>
          <span class="pied">${n} session${n > 1 ? 's' : ''} · ${fichiersDuProjetSeul(p.id).length} fichiers du projet · ${dateRelative(sessionsDu(p.id)[0]?.modifie ?? p.cree)}</span></button>`
        })
        .join('') || '<p class="vide">Aucun projet ne correspond.</p>'
  }
  dessiner()
  centre.querySelector('input').addEventListener('input', (e) => {
    etat.filtre = e.target.value
    dessiner()
  })
  grille.addEventListener('click', (e) => {
    const b = e.target.closest('[data-projet]')
    if (b) allerProjet(b.dataset.projet)
  })
}

const ligneFichier = (f, texte = f.relatif) =>
  `<button type="button" data-fichier="${f.chemin}" title="${echapper(f.chemin)}">${iconeFichier(f)}<span class="nom">${echapper(texte)}</span><span class="meta">${tailleLisible(f.taille)}</span></button>`

function rendrePageProjet() {
  const p = projet(etat.projet)
  const fichiersProjet = fichiersDuProjetSeul(p.id)
  const instructions = fichiersProjet.find((f) => f.nom === 'instructions.md')
  const sessions = sessionsDu(p.id)
  centre.innerHTML = `<div class="page"><div class="page-cadre">
    <button type="button" class="lien-projet" data-retour>← Tous les projets</button>
    <h1 style="margin-top:10px">${echapper(p.nom)}</h1>
    <p class="sous">${echapper(p.description)}</p>
    <div style="margin-bottom:20px">${htmlSaisie({ placeholder: `Nouvelle session dans « ${p.court} »…`, aide: 'Les instructions et les fichiers du projet sont donnés à l’orchestrateur.' })}</div>
    <div class="projet-grille">
      <div class="bloc"><div class="bloc-tete"><h2>Sessions</h2><span class="aide">${sessions.length}</span></div>
        <div class="liste-sessions">${sessions
          .map((s) => `<button type="button" data-session="${s.id}"><span class="titre">${echapper(s.titre)}</span><span class="meta">${s.statut === 'en_cours' ? 'en cours · ' : ''}${fichiersDeSession(s.id).length} fichiers · ${dateRelative(s.modifie)}</span></button>`)
          .join('')}</div></div>
      <div>
        <div class="bloc"><div class="bloc-tete"><h2>Instructions</h2><button type="button" class="discret" style="font-size:12px">Modifier</button></div>
          <div class="md instructions">${instructions ? 'Chargement…' : '<p class="vide">Aucune instruction.</p>'}</div></div>
        <div class="bloc"><div class="bloc-tete"><h2>Fichiers du projet</h2><span class="aide">${fichiersProjet.length}</span></div>
          <div class="liste-fichiers">${fichiersProjet.map((f) => ligneFichier(f, f.chemin.slice(`${p.id}/projet/`.length))).join('')}</div>
          <button type="button" class="ajouter">${ICONES.plus.replace('<svg', '<svg style="vertical-align:-3px;margin-right:4px"')}Ajouter un fichier</button></div>
      </div>
    </div>
  </div></div>`
  centre.querySelector('[data-retour]').addEventListener('click', allerProjets)
  centre.querySelectorAll('[data-session]').forEach((b) => b.addEventListener('click', () => allerSession(b.dataset.session)))
  centre.querySelectorAll('[data-fichier]').forEach((b) => b.addEventListener('click', () => montrerFichier(b.dataset.fichier)))
  if (instructions) {
    lireTexte(instructions.url).then((t) => {
      const el = centre.querySelector('.instructions')
      if (el) el.innerHTML = markdownVersHtml(t, instructions.url)
    })
  }
}

function rendreSession() {
  const s = session(etat.session)
  const p = projet(s.projet)
  centre.innerHTML = `<header class="conv-tete"><div class="conv-titres">
      <h1 class="conv-titre">${echapper(s.titre)}</h1>
      <div class="conv-sous"><button type="button" class="lien-projet" data-retour title="Page du projet">${echapper(p.nom)}</button> · ${s.statut === 'en_cours' ? 'en cours' : 'terminée'} · ${dateRelative(s.modifie)}</div></div></header>
    <div class="fil"><div class="fil-contenu">${htmlFil(s)}</div></div>
    <div class="bas">${htmlArbreAgents(s, { ouvert: false })}${htmlSaisie()}</div>`
  centre.querySelector('[data-retour]').addEventListener('click', () => allerProjet(p.id))
  brancherLiensFichiers(centre, montrerFichier)
}

// ── Documents ────────────────────────────────────────────────

let arbos = {}

function rendreDocuments() {
  const vue = panneau.vues.documents
  arbos = {}
  if (!etat.projet) {
    vue.innerHTML = `<div class="apercu"><div class="apercu-vide"><div>Ouvrez un projet pour voir ses documents :<br>
      connaissances du projet et productions de chaque session.</div></div></div>`
    return
  }
  const p = etat.projet
  const autres = sessionsDu(p).filter((s) => s.id !== etat.session)
  vue.innerHTML = `<div class="docs">
    <div class="docs-sections">
      <details class="section-docs" open data-section="projet"><summary>Connaissances du projet <span class="n">${fichiersDuProjetSeul(p).length}</span></summary><div class="a"></div></details>
      <details class="section-docs" open data-section="session"><summary>Cette session <span class="n">${etat.session ? fichiersDeSession(etat.session).length : ''}</span></summary><div class="a"></div></details>
      <details class="section-docs" data-section="autres"><summary>Autres sessions <span class="n">${autres.length}</span></summary><div class="a"></div></details>
    </div>
    <div class="docs-apercu"></div></div>`
  const monter = (section, racine, ouverts, libelle) => {
    const el = vue.querySelector(`[data-section="${section}"] .a`)
    // monterArbo remplace ses défauts par toute clé fournie, même undefined : ne passer libelle que s'il existe.
    const a = monterArbo(el, { racine, ouverts, ...(libelle && { libelle }), surFichier: (f) => choisir(f, a) })
    arbos[section] = a
  }
  monter('projet', arbre(`${p}/projet/`), new Set([`${p}/projet/donnees`]))
  if (etat.session) {
    const prefixe = `${p}/sessions/${etat.session}`
    monter('session', arbre(`${prefixe}/`), new Set([`${prefixe}/directeurs`, `${prefixe}/docs_session`]))
  } else {
    vue.querySelector('[data-section="session"] .a').innerHTML = '<p class="vide">Aucune session ouverte.</p>'
  }
  const racineAutres = arbre(`${p}/sessions/`)
  racineAutres.enfants = racineAutres.enfants.filter((n) => n.nom !== etat.session)
  monter('autres', racineAutres, new Set(), (n) =>
    n.type === 'dossier' && n.chemin.split('/').at(-2) === 'sessions' ? libelleSegment(n.nom, 'sessions') : n.nom,
  )
  apercu(null)
}

function apercu(f) {
  afficherApercu(panneau.vues.documents.querySelector('.docs-apercu'), f, {
    vide: 'Choisissez un fichier.<br><small>Les fichiers du projet sont lus par tous les agents de toutes les sessions.</small>',
  })
}

function choisir(f, source) {
  for (const a of Object.values(arbos)) if (a !== source) { a.options.choisi = null; a.redessiner() }
  apercu(f)
}

function montrerFichier(chemin) {
  const f = fichier(chemin)
  panneau.choisir('documents')
  const section = !f.session ? 'projet' : f.session === etat.session ? 'session' : 'autres'
  const details = panneau.vues.documents.querySelector(`[data-section="${section}"]`)
  details.open = true
  const a = arbos[section]
  a.choisir(chemin)
  choisir(f, a)
}

lireAncre()
rendre()
