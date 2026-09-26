// 01 · Espaces de travail. Écran d'accueil plein cadre : les projets sont des espaces. Une fois dans un espace,
// l'app habituelle ; le nom de l'espace en tête de barre latérale ouvre le menu pour en changer.
// La vue Documents montre le bunker du projet courant (arbre + aperçu), dépliée sur la session ouverte.
import { PROJETS, UTILISATRICE, dateRelative, projet, session, sessionsDu } from '../../commun/donnees.js'
import { RACINE_AFFICHEE, arbre, fichier, fichiersDuProjet, libelleSegment, monterArbo } from '../../commun/bunker.js'
import { afficherApercu } from '../../commun/apercu.js'
import {
  ICONES, brancherLiensFichiers, echapper, htmlArbreAgents, htmlFil, htmlListeSessions, htmlSaisie, monterBarre, monterPanneauDroit,
} from '../../commun/ui.js'

monterBarre()
const app = document.querySelector('#app')
const etat = { projet: null, session: null, fichier: null }

// L'état tient dans l'ancre (#projet/session) pour survivre au rechargement.
function lireAncre() {
  const [p, s] = location.hash.slice(1).split('/')
  etat.projet = projet(p) ? p : null
  etat.session = etat.projet && session(s)?.projet === p ? s : null
}
function ecrireAncre() {
  history.replaceState(null, '', `#${[etat.projet, etat.session].filter(Boolean).join('/')}`)
}

const monogramme = (p) => p.court.split(/\s+/).map((m) => m[0]).join('').slice(0, 2).toUpperCase()

function rendreAccueil() {
  app.innerHTML = `<div class="accueil-espaces"><div class="accueil-cadre">
    <span class="marque">Atlas</span>
    <h1>Bonjour Camille</h1>
    <p class="sous">Choisissez l’espace de recherche dans lequel travailler.</p>
    <div class="compte"><span class="avatar">${UTILISATRICE.initiales}</span>${UTILISATRICE.courriel}</div>
    <div class="espaces">${PROJETS.map((p) => {
      const n = sessionsDu(p.id).length
      return `<button type="button" class="espace-ligne" data-projet="${p.id}">
        <span class="monogramme">${monogramme(p)}</span>
        <span class="corps"><div class="nom">${echapper(p.nom)}</div><div class="desc">${echapper(p.description)}</div></span>
        <span class="chiffres">${n} session${n > 1 ? 's' : ''} · ${fichiersDuProjet(p.id).length} fichiers<br>${dateRelative(sessionsDu(p.id)[0]?.modifie ?? p.cree)}</span>
        <span class="fleche">→</span></button>`
    }).join('')}</div>
    <button type="button" class="nouveau-projet discret">${ICONES.plus.replace('<svg', '<svg style="vertical-align:-3px;margin-right:6px"')}Nouvel espace</button>
  </div></div>`
  app.querySelectorAll('[data-projet]').forEach((b) => b.addEventListener('click', () => entrer(b.dataset.projet)))
}

function entrer(p, s = null) {
  etat.projet = p
  etat.session = s
  etat.fichier = null
  ecrireAncre()
  rendreApp()
}

let panneau, arbo

function rendreApp() {
  const p = projet(etat.projet)
  app.innerHTML = `<div class="trois-colonnes">
    <aside class="laterale">
      <div class="laterale-tete">
        <button type="button" class="selecteur-espace" title="Changer d’espace">
          <span class="monogramme">${monogramme(p)}</span><span class="nom">${echapper(p.nom)}</span>${ICONES.choix}</button>
      </div>
      <button type="button" class="nouvelle-session">${ICONES.plus} Nouvelle recherche</button>
      <nav class="sessions-liste"></nav>
      <div class="laterale-pied"><span class="avatar">${UTILISATRICE.initiales}</span>${UTILISATRICE.nom}</div>
    </aside>
    <main class="conversation"></main>
    <section class="panneau"></section>
  </div>`
  app.querySelector('.selecteur-espace').addEventListener('click', ouvrirMenuEspaces)
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
    const recentes = sessionsDu(p.id).slice(0, 4)
    zone.innerHTML = `<div class="fil"><div class="arrivee">
        <h2>${echapper(p.nom)}</h2>
        <p>${echapper(p.description)}</p>
        <div class="intertitre" style="margin:0 0 8px">Reprendre une session</div>
        <div class="recentes">${recentes.map((s) => `<button type="button" data-session="${s.id}"><span>${echapper(s.titre)}</span><span>${dateRelative(s.modifie)}</span></button>`).join('')}</div>
      </div></div>
      <div class="bas">${htmlSaisie({ placeholder: `Nouvelle recherche dans « ${p.court} »…` })}</div>`
    zone.querySelectorAll('[data-session]').forEach((b) => b.addEventListener('click', () => ouvrirSession(b.dataset.session)))
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
  ecrireAncre()
  rendreSessions()
  rendreConversation()
  if (id) {
    arbo.options.ouverts.add(`${etat.projet}/sessions`)
    arbo.deplierVers(`${etat.projet}/sessions/${id}/directeurs/x`)
    arbo.redessiner()
  }
}

function monterDocuments() {
  const vue = panneau.vues.documents
  vue.innerHTML = `<div class="docs">
      <div class="docs-arbre"><div class="racine" title="${RACINE_AFFICHEE}/${etat.projet}">${RACINE_AFFICHEE}/${etat.projet}/</div><div class="arbo"></div></div>
      <div class="docs-apercu"></div></div>`
  const racine = arbre(`${etat.projet}/`)
  const ouverts = new Set([`${etat.projet}/projet`, `${etat.projet}/sessions`])
  if (etat.session) ouverts.add(`${etat.projet}/sessions/${etat.session}`)
  arbo = monterArbo(vue.querySelector('.arbo'), {
    racine,
    ouverts,
    // Les dossiers de session portent l'identifiant ; on affiche le titre de la session.
    libelle: (n) => (n.type === 'dossier' && n.chemin.split('/').at(-2) === 'sessions' ? libelleSegment(n.nom, 'sessions') : n.nom),
    surFichier: (f) => apercu(f),
  })
  apercu(null)
}

function apercu(f) {
  etat.fichier = f
  afficherApercu(panneau.vues.documents.querySelector('.docs-apercu'), f, {
    vide: 'Choisissez un fichier du projet.<br><small>Rapports, journaux, figures, PDF, scripts.</small>',
  })
}

function montrerFichier(chemin) {
  panneau.choisir('documents')
  arbo.choisir(chemin)
  apercu(fichier(chemin))
}

function ouvrirMenuEspaces(e) {
  const bouton = e.currentTarget
  const r = bouton.getBoundingClientRect()
  const menu = document.createElement('div')
  menu.className = 'menu-flottant'
  menu.style.left = `${r.left}px`
  menu.style.top = `${r.bottom + 4}px`
  menu.innerHTML = `<div class="petit">Espaces</div>
    ${PROJETS.map((p) => `<button type="button" data-projet="${p.id}"><span class="monogramme" style="width:22px;height:22px;font-size:10px">${monogramme(p)}</span>${echapper(p.nom)}${p.id === etat.projet ? '<span class="coche">✓</span>' : ''}</button>`).join('')}
    <hr><button type="button" data-tous>Tous les espaces…</button>`
  document.body.append(menu)
  const fermer = (ev) => {
    if (ev && menu.contains(ev.target)) return
    menu.remove()
    document.removeEventListener('mousedown', fermer)
  }
  setTimeout(() => document.addEventListener('mousedown', fermer))
  menu.addEventListener('click', (ev) => {
    const b = ev.target.closest('button')
    if (!b) return
    menu.remove()
    document.removeEventListener('mousedown', fermer)
    if (b.dataset.tous !== undefined) {
      etat.projet = null
      ecrireAncre()
      rendreAccueil()
    } else entrer(b.dataset.projet)
  })
}

lireAncre()
etat.projet ? rendreApp() : rendreAccueil()
