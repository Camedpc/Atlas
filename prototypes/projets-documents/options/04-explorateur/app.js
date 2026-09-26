// 04 · Explorateur à onglets (façon VS Code). Barre d'activité (Sessions, Fichiers, Recherche) + panneau
// latéral ; au centre, la page Bienvenue puis la conversation ; à droite, la vue Documents est un éditeur à
// onglets : clic simple = onglet d'aperçu (italique, remplacé au prochain clic), double clic = onglet épinglé.
import { PROJETS, UTILISATRICE, dateRelative, derniereActivite, projet, session, sessionsDu } from '../../commun/donnees.js'
import {
  ICONES, RACINE_AFFICHEE, arbre, fichier, fichiersDuProjet, iconeFichier, libelleSegment, monterArbo,
} from '../../commun/bunker.js'
import { afficherApercu } from '../../commun/apercu.js'
import {
  brancherLiensFichiers, echapper, htmlArbreAgents, htmlFil, htmlListeSessions, htmlSaisie, monterBarre, monterPanneauDroit,
} from '../../commun/ui.js'

monterBarre()
const app = document.querySelector('#app')
const etat = { projet: null, session: null, cote: 'sessions', recherche: '', onglets: [], actif: null }

function lireAncre() {
  const [p, s] = location.hash.slice(1).split('/')
  etat.projet = projet(p) ? p : null
  etat.session = etat.projet && session(s)?.projet === p ? s : null
}
const ecrireAncre = () => history.replaceState(null, '', `#${[etat.projet, etat.session].filter(Boolean).join('/')}`)

const T = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"'
const ICO_ACTIVITE = {
  sessions: `<svg viewBox="0 0 24 24" ${T}><path d="M4 5h16v11h-9l-5 4v-4H4z"/></svg>`,
  fichiers: `<svg viewBox="0 0 24 24" ${T}><path d="M8 3h7l4 4v11H8z"/><path d="M15 3v4h4M5 7v14h11"/></svg>`,
  recherche: `<svg viewBox="0 0 24 24" ${T}><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg>`,
}
const TITRES = { sessions: 'Sessions', fichiers: 'Explorateur', recherche: 'Recherche' }

app.innerHTML = `<div class="ide">
  <nav class="activite">${Object.keys(ICO_ACTIVITE).map((k) => `<button type="button" data-cote="${k}" title="${TITRES[k]}">${ICO_ACTIVITE[k]}</button>`).join('')}
    <span class="espace"></span><span class="avatar" title="${UTILISATRICE.nom}">${UTILISATRICE.initiales}</span></nav>
  <aside class="cote"><div class="cote-tete"></div><button type="button" class="choix-projet"></button><div class="cote-corps"></div></aside>
  <main class="conversation"></main>
  <section class="panneau"></section>
  <footer class="etat"></footer>
</div>`

const cote = app.querySelector('.cote')
const centre = app.querySelector('.conversation')
const panneau = monterPanneauDroit(app.querySelector('.panneau'), { initial: 'documents' })
panneau.vues.documents.innerHTML = '<div class="editeur"><div class="onglets-fichiers"></div><div class="editeur-corps"></div></div>'
const barreOnglets = panneau.vues.documents.querySelector('.onglets-fichiers')
const corpsEditeur = panneau.vues.documents.querySelector('.editeur-corps')

app.querySelector('.activite').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cote]')
  if (!b) return
  etat.cote = b.dataset.cote
  rendreCote()
})
app.querySelector('.choix-projet').addEventListener('click', (e) => ouvrirMenuProjets(e.currentTarget))

// ── Navigation ───────────────────────────────────────────────

function ouvrirProjet(p) {
  if (etat.projet !== p) {
    etat.onglets = []
    etat.actif = null
  }
  etat.projet = p
  etat.session = null
  etat.cote = 'sessions'
  rendreTout()
}
function ouvrirSession(s) {
  etat.session = s
  ecrireAncre()
  rendreCote()
  rendreCentre()
  rendreEtat()
}

function rendreTout() {
  ecrireAncre()
  rendreCote()
  rendreCentre()
  rendreEditeur()
  rendreEtat()
}

// ── Panneau latéral ──────────────────────────────────────────

let arbo = null

function rendreCote() {
  app.querySelectorAll('.activite [data-cote]').forEach((b) => b.classList.toggle('actif', b.dataset.cote === etat.cote))
  cote.querySelector('.cote-tete').textContent = TITRES[etat.cote]
  const choix = cote.querySelector('.choix-projet')
  choix.innerHTML = `${ICONES.projet}<span class="txt">${etat.projet ? echapper(projet(etat.projet).nom) : 'Aucun projet ouvert'}</span>${ICONES.choix}`
  const corps = cote.querySelector('.cote-corps')
  arbo = null
  if (!etat.projet) {
    corps.innerHTML = '<p class="indice">Ouvrez un projet pour voir ses sessions et ses fichiers.</p>'
    return
  }
  if (etat.cote === 'sessions') {
    corps.innerHTML = `<button type="button" class="nouvelle-session">${ICONES.plus} Nouvelle recherche</button><nav class="sessions-liste">${htmlListeSessions(sessionsDu(etat.projet), etat.session)}</nav>`
    corps.querySelector('.nouvelle-session').addEventListener('click', () => ouvrirSession(null))
    corps.querySelector('.sessions-liste').addEventListener('click', (e) => {
      const a = e.target.closest('[data-session]')
      if (!a) return
      e.preventDefault()
      ouvrirSession(a.dataset.session)
    })
  } else if (etat.cote === 'fichiers') {
    corps.innerHTML = '<div class="arbo"></div>'
    const ouverts = new Set([`${etat.projet}/projet`, `${etat.projet}/sessions`])
    if (etat.session) ouverts.add(`${etat.projet}/sessions/${etat.session}`)
    arbo = monterArbo(corps.querySelector('.arbo'), {
      racine: arbre(`${etat.projet}/`),
      ouverts,
      choisi: etat.actif,
      libelle: (n) => (n.type === 'dossier' && n.chemin.split('/').at(-2) === 'sessions' ? libelleSegment(n.nom, 'sessions') : n.nom),
      surFichier: (f) => ouvrirFichier(f.chemin, false),
    })
    if (etat.actif) arbo.choisir(etat.actif)
    corps.querySelector('.arbo').addEventListener('dblclick', (e) => {
      const l = e.target.closest('.arbo-ligne[data-type="fichier"]')
      if (l) ouvrirFichier(l.dataset.chemin, true)
    })
  } else {
    corps.innerHTML = `<input class="champ-recherche" type="search" placeholder="Rechercher un fichier par nom ou chemin" value="${echapper(etat.recherche)}"><div class="resultats"></div>`
    const champ = corps.querySelector('input')
    const dessiner = () => {
      const q = etat.recherche.trim().toLowerCase()
      const liste = fichiersDuProjet(etat.projet).filter((f) => !q || f.chemin.toLowerCase().includes(q))
      const surligner = (t) => {
        const i = q ? t.toLowerCase().indexOf(q) : -1
        return i < 0 ? echapper(t) : `${echapper(t.slice(0, i))}<mark>${echapper(t.slice(i, i + q.length))}</mark>${echapper(t.slice(i + q.length))}`
      }
      corps.querySelector('.resultats').innerHTML =
        `<div class="indice" style="margin-top:0">${liste.length} fichier${liste.length > 1 ? 's' : ''}</div>` +
        liste
          .map((f) => {
            const ou = f.session ? `${session(f.session).titre} · ${f.relatif}` : `projet/${f.relatif.replace(/^projet\//, '')}`
            return `<button type="button" class="resultat" data-chemin="${f.chemin}" title="${echapper(f.chemin)}">
              <div class="l1">${iconeFichier(f)}${surligner(f.nom)}</div><div class="l2">${surligner(ou)}</div></button>`
          })
          .join('')
    }
    dessiner()
    champ.addEventListener('input', () => {
      etat.recherche = champ.value
      dessiner()
    })
    corps.querySelector('.resultats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-chemin]')
      if (b) ouvrirFichier(b.dataset.chemin, false)
    })
    corps.querySelector('.resultats').addEventListener('dblclick', (e) => {
      const b = e.target.closest('[data-chemin]')
      if (b) ouvrirFichier(b.dataset.chemin, true)
    })
    champ.focus()
  }
}

function ouvrirMenuProjets(ancre) {
  document.querySelector('.menu-flottant')?.remove()
  const r = ancre.getBoundingClientRect()
  const menu = document.createElement('div')
  menu.className = 'menu-flottant'
  menu.style.left = `${r.left}px`
  menu.style.top = `${r.bottom + 4}px`
  menu.innerHTML = PROJETS.map((p) => `<button type="button" data-projet="${p.id}">${ICONES.projet}<span style="flex:1">${echapper(p.nom)}</span>${p.id === etat.projet ? '✓' : ''}</button>`).join('') +
    '<hr><button type="button" data-bienvenue>Page Bienvenue</button>'
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
    fermer()
    if (b.dataset.projet) ouvrirProjet(b.dataset.projet)
    else {
      etat.session = null
      ecrireAncre()
      rendreCote()
      rendreCentre()
      rendreEtat()
    }
  })
}

// ── Centre : Bienvenue ou conversation ───────────────────────

function rendreCentre() {
  if (etat.session) {
    const s = session(etat.session)
    centre.innerHTML = `<header class="conv-tete"><div class="conv-titres">
        <h1 class="conv-titre">${echapper(s.titre)}</h1><div class="conv-sous">${echapper(projet(s.projet).court)} · ${s.statut === 'en_cours' ? 'en cours' : 'terminée'} · ${dateRelative(s.modifie)}</div></div></header>
      <div class="fil"><div class="fil-contenu">${htmlFil(s)}</div></div>
      <div class="bas">${htmlArbreAgents(s, { ouvert: false })}${htmlSaisie()}</div>`
    brancherLiensFichiers(centre, (chemin) => ouvrirFichier(chemin, true))
    return
  }
  const recents = [...PROJETS].sort((a, b) => derniereActivite(b.id).localeCompare(derniereActivite(a.id)))
  const p = etat.projet && projet(etat.projet)
  centre.innerHTML = `<div class="bienvenue"><div class="bienvenue-cadre">
      <h1>Atlas</h1><p class="sous">Harnais de recherche scientifique</p>
      ${p ? `<h2>Démarrer dans « ${echapper(p.court)} »</h2>
        <button type="button" class="lien" data-action="fichiers">Parcourir les fichiers du projet…</button>
        <h2>Sessions récentes</h2>
        ${sessionsDu(p.id).map((s) => `<button type="button" class="lien" data-session="${s.id}">${echapper(s.titre)}<span class="chemin">${dateRelative(s.modifie)}</span></button>`).join('')}`
      : `<h2>Démarrer</h2>
        <button type="button" class="lien" data-action="nouveau">Nouveau projet…</button>
        <button type="button" class="lien" data-action="ouvrir">Ouvrir un projet…</button>`}
      <h2>Projets récents</h2>
      ${recents.map((x) => `<button type="button" class="lien" data-projet="${x.id}">${echapper(x.nom)}<span class="chemin">${RACINE_AFFICHEE}/${x.id}</span></button>`).join('')}
    </div></div>
    ${p ? `<div class="bas">${htmlSaisie({ placeholder: `Nouvelle recherche dans « ${p.court} »…` })}</div>` : ''}`
  centre.querySelectorAll('[data-projet]').forEach((b) => b.addEventListener('click', () => ouvrirProjet(b.dataset.projet)))
  centre.querySelectorAll('[data-session]').forEach((b) => b.addEventListener('click', () => ouvrirSession(b.dataset.session)))
  centre.querySelector('[data-action="ouvrir"]')?.addEventListener('click', () => ouvrirMenuProjets(app.querySelector('.choix-projet')))
  centre.querySelector('[data-action="fichiers"]')?.addEventListener('click', () => {
    etat.cote = 'fichiers'
    rendreCote()
  })
}

// ── Éditeur à onglets ────────────────────────────────────────

function ouvrirFichier(chemin, epingle) {
  const existant = etat.onglets.find((o) => o.chemin === chemin)
  if (existant) {
    if (epingle) existant.epingle = true
  } else {
    const temp = etat.onglets.findIndex((o) => !o.epingle)
    const onglet = { chemin, epingle }
    // Un seul onglet d'aperçu à la fois : le nouveau fichier prend sa place.
    if (!epingle && temp >= 0) etat.onglets[temp] = onglet
    else etat.onglets.push(onglet)
  }
  etat.actif = chemin
  panneau.choisir('documents')
  rendreEditeur()
  arbo?.choisir(chemin)
  rendreEtat()
}

function fermerOnglet(chemin) {
  const i = etat.onglets.findIndex((o) => o.chemin === chemin)
  if (i < 0) return
  etat.onglets.splice(i, 1)
  if (etat.actif === chemin) etat.actif = (etat.onglets[i] ?? etat.onglets[i - 1])?.chemin ?? null
  rendreEditeur()
  rendreEtat()
}

let rendu = null

function rendreEditeur() {
  barreOnglets.innerHTML = etat.onglets
    .map((o) => {
      const f = fichier(o.chemin)
      return `<div class="onglet-fichier${o.chemin === etat.actif ? ' actif' : ''}${o.epingle ? '' : ' apercu-temp'}" data-chemin="${o.chemin}" title="${echapper(f.chemin)}${o.epingle ? '' : ' (aperçu : double-cliquez pour garder l’onglet)'}">
        ${iconeFichier(f)}<span class="nom">${echapper(f.nom)}</span><button type="button" class="fermer" title="Fermer">${ICONES.fermer}</button></div>`
    })
    .join('')
  barreOnglets.hidden = etat.onglets.length === 0
  if (!etat.actif) {
    rendu = null
    corpsEditeur.innerHTML = `<div class="editeur-vide"><div>${etat.projet ? 'Aucun fichier ouvert.<br><small>Clic : aperçu · double clic : garder l’onglet</small>' : 'Ouvrez un projet pour parcourir ses documents.'}</div></div>`
    return
  }
  if (rendu === etat.actif && corpsEditeur.querySelector('.apercu')) return
  rendu = etat.actif
  corpsEditeur.innerHTML = '<div class="doc"></div>'
  const f = fichier(etat.actif)
  afficherApercu(corpsEditeur.querySelector('.doc'), f, { chemin: f.chemin.slice(etat.projet.length + 1) })
  barreOnglets.querySelector('.actif')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

barreOnglets.addEventListener('click', (e) => {
  const o = e.target.closest('.onglet-fichier')
  if (!o) return
  if (e.target.closest('.fermer')) return fermerOnglet(o.dataset.chemin)
  etat.actif = o.dataset.chemin
  rendreEditeur()
  arbo?.choisir(etat.actif)
  rendreEtat()
})
barreOnglets.addEventListener('dblclick', (e) => {
  const o = e.target.closest('.onglet-fichier')
  if (o && !e.target.closest('.fermer')) ouvrirFichier(o.dataset.chemin, true)
})
barreOnglets.addEventListener('auxclick', (e) => {
  const o = e.target.closest('.onglet-fichier')
  if (o && e.button === 1) fermerOnglet(o.dataset.chemin)
})

// ── Barre d'état ─────────────────────────────────────────────

function rendreEtat() {
  const p = etat.projet && projet(etat.projet)
  app.querySelector('.etat').innerHTML = `
    <span>${p ? echapper(p.nom) : 'Aucun projet'}</span>
    ${etat.session ? `<span>${echapper(session(etat.session).titre)}</span>` : ''}
    <span class="espace"></span>
    <span>${etat.onglets.length} fichier${etat.onglets.length > 1 ? 's' : ''} ouvert${etat.onglets.length > 1 ? 's' : ''}</span>
    <code>${RACINE_AFFICHEE}${p ? '/' + p.id : ''}${etat.actif ? '/' + etat.actif.slice(p.id.length + 1) : ''}</code>`
}

lireAncre()
rendreTout()
