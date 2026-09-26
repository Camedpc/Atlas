// 08 · Tableau de bord de projet. À l'ouverture, un tableau des projets ; en choisir un ouvre son tableau de bord
// au centre (chiffres, état du graphe, sessions récentes, derniers rapports, figures, ce qui reste ouvert).
// La barre latérale commence par « Tableau de bord » puis liste les sessions. Documents : arbre en haut, aperçu en bas.
import { PROJETS, dateRelative, derniereActivite, projet, session, sessionsDu } from '../../commun/donnees.js'
import { arbre, fichier, fichiersDuProjet, libelleSegment, monterArbo } from '../../commun/bunker.js'
import { afficherApercu, lireTexte, titreMarkdown } from '../../commun/apercu.js'
import {
  ICONES, echapper, htmlArbreAgents, htmlFil, htmlListeSessions, htmlSaisie, monterBarre, monterPanneauDroit,
} from '../../commun/ui.js'

monterBarre()
const app = document.querySelector('#app')
const etat = { projet: null, session: null }

// Mêmes couleurs de statut que le graphe de raisonnement (frontend/src/graphe.ts).
const STATUTS = [
  ['etablis', 'établis', '#2e9e5b'],
  ['a_verifier', 'à vérifier', '#4a7fd4'],
  ['invalides', 'invalides', '#d64545'],
  ['ouverts', 'ouverts', '#8a8f98'],
]

function lireAncre() {
  const [p, s] = location.hash.slice(1).split('/')
  etat.projet = projet(p) ? p : null
  etat.session = etat.projet && session(s)?.projet === p ? s : null
}
const ecrireAncre = () => history.replaceState(null, '', `#${[etat.projet, etat.session].filter(Boolean).join('/')}`)

// ── Tableau des projets ──────────────────────────────────

function rendreListe() {
  app.innerHTML = `<div class="liste-projets"><div class="cadre">
    <span class="marque">Atlas</span>
    <h1>Projets</h1>
    <p class="sous">Choisissez un projet pour ouvrir son tableau de bord.</p>
    <table class="tableau">
      <thead><tr><th>Projet</th><th class="num">Sessions</th><th class="num">Fichiers</th><th class="num">Établis</th><th class="num">À vérifier</th><th>Dernière activité</th></tr></thead>
      <tbody>${[...PROJETS]
        .sort((a, b) => derniereActivite(b.id).localeCompare(derniereActivite(a.id)))
        .map((p) => `<tr class="ligne" data-projet="${p.id}" tabindex="0">
          <td><div class="nom">${echapper(p.nom)}</div><div class="desc">${echapper(p.description)}</div></td>
          <td class="num">${sessionsDu(p.id).length}</td>
          <td class="num">${fichiersDuProjet(p.id).length}</td>
          <td class="num">${p.graphe.etablis}</td>
          <td class="num">${p.graphe.a_verifier}</td>
          <td class="date">${dateRelative(derniereActivite(p.id))}</td></tr>`)
        .join('')}</tbody>
    </table></div></div>`
  app.querySelectorAll('[data-projet]').forEach((tr) => {
    const aller = () => entrer(tr.dataset.projet)
    tr.addEventListener('click', aller)
    tr.addEventListener('keydown', (e) => e.key === 'Enter' && aller())
  })
}

function entrer(p, s = null) {
  etat.projet = p
  etat.session = s
  ecrireAncre()
  rendreApp()
}

// ── App ──────────────────────────────────────────────────

let panneau, arbo

function rendreApp() {
  const p = projet(etat.projet)
  app.innerHTML = `<div class="trois-colonnes">
    <aside class="laterale">
      <div class="laterale-tete">
        <button type="button" class="retour-projets" title="Tous les projets"><span class="fleche">←</span><span>${echapper(p.nom)}</span></button>
      </div>
      <a class="session entree-tdb" href="#" data-tdb>${ICONES.projet}<span class="session-titre">Tableau de bord</span></a>
      <button type="button" class="nouvelle-session">${ICONES.plus} Nouvelle recherche</button>
      <nav class="sessions-liste"></nav>
    </aside>
    <main class="conversation"></main>
    <section class="panneau"></section>
  </div>`
  app.querySelector('.retour-projets').addEventListener('click', () => {
    etat.projet = etat.session = null
    ecrireAncre()
    rendreListe()
  })
  app.querySelector('[data-tdb]').addEventListener('click', (e) => {
    e.preventDefault()
    ouvrirSession(null)
  })
  app.querySelector('.nouvelle-session').addEventListener('click', () => ouvrirSession(null))
  app.querySelector('.sessions-liste').addEventListener('click', (e) => {
    const a = e.target.closest('[data-session]')
    if (!a) return
    e.preventDefault()
    ouvrirSession(a.dataset.session)
  })
  // Liens vers les fichiers (fil, rapports, figures, sources) : un seul écouteur délégué.
  app.querySelector('.conversation').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fichier]')
    if (b) montrerFichier(b.dataset.fichier)
  })
  panneau = monterPanneauDroit(app.querySelector('.panneau'), { initial: 'raisonnement' })
  monterDocuments()
  rendreLaterale()
  rendreCentre()
}

function rendreLaterale() {
  app.querySelector('[data-tdb]').classList.toggle('active', !etat.session)
  app.querySelector('.sessions-liste').innerHTML = htmlListeSessions(sessionsDu(etat.projet), etat.session)
}

function ouvrirSession(id) {
  etat.session = id
  ecrireAncre()
  rendreLaterale()
  rendreCentre()
  if (id) {
    arbo.deplierVers(`${etat.projet}/sessions/${id}/directeurs/x`)
    arbo.redessiner()
  }
}

function rendreCentre() {
  const zone = app.querySelector('.conversation')
  if (!etat.session) return rendreTableauDeBord(zone)
  const s = session(etat.session)
  zone.innerHTML = `<header class="conv-tete"><div class="conv-titres">
      <h1 class="conv-titre">${echapper(s.titre)}</h1>
      <div class="conv-sous">${echapper(projet(s.projet).court)} · ${s.statut === 'en_cours' ? 'en cours' : 'terminée'} · ${dateRelative(s.modifie)}</div></div></header>
    <div class="fil"><div class="fil-contenu">${htmlFil(s)}</div></div>
    <div class="bas">${htmlArbreAgents(s, { ouvert: false })}${htmlSaisie()}</div>`
}

// ── Tableau de bord ──────────────────────────────────────

function rendreTableauDeBord(zone) {
  const p = projet(etat.projet)
  const sessions = sessionsDu(p.id)
  const fichiers = fichiersDuProjet(p.id)
  const rapports = fichiers.filter((f) => f.nom === 'rapport.md').sort((a, b) => b.modifie.localeCompare(a.modifie))
  const figures = fichiers.filter((f) => f.genre === 'image').sort((a, b) => b.modifie.localeCompare(a.modifie))
  const g = p.graphe
  const titreSession = (id) => session(id)?.titre ?? id

  zone.innerHTML = `<div class="tdb"><div class="tdb-cadre">
    <h2>${echapper(p.nom)}</h2>
    <p class="desc">${echapper(p.description)}</p>

    <div class="chiffres">
      <div class="chiffre"><div class="valeur">${sessions.length}</div><div class="libelle">sessions</div></div>
      <div class="chiffre"><div class="valeur">${fichiers.length}</div><div class="libelle">fichiers dans le bunker</div></div>
      <div class="chiffre"><div class="valeur">${g.noeuds}</div><div class="libelle">nœuds du graphe</div></div>
      <div class="etat-graphe">
        <div class="libelle" style="font-size:12px;color:var(--texte-3)">État du graphe de raisonnement</div>
        <div class="barre">${STATUTS.map(([cle, , c]) => `<i style="width:${(100 * g[cle]) / g.noeuds}%;background:${c}" title="${g[cle]}"></i>`).join('')}</div>
        <div class="legende">${STATUTS.map(([cle, lib, c]) => `<span><i style="background:${c}"></i>${g[cle]} ${lib}</span>`).join('')}</div>
      </div>
    </div>

    <section><h3>Sessions récentes <small>${sessions.length}</small></h3>
      <div class="lignes">${sessions.slice(0, 5).map((s) => `<button type="button" data-session="${s.id}">
        <span class="titre">${echapper(s.titre)}</span>
        <span class="contexte">${s.statut === 'en_cours' ? 'en cours' : 'terminée'}</span>
        <span class="date">${dateRelative(s.modifie)}</span></button>`).join('')}</div></section>

    <section><h3>Derniers rapports <small>${rapports.length}</small></h3>
      <div class="lignes">${rapports.length ? rapports.map((f) => `<button type="button" data-fichier="${f.chemin}">
        <span class="titre" data-titre="${f.chemin}">${echapper(f.directeur ?? f.nom)}</span>
        <span class="contexte">${echapper(f.directeur ?? '')} · ${echapper(titreSession(f.session))}</span>
        <span class="date">${dateRelative(f.modifie)}</span></button>`).join('') : '<p class="vide">Aucun rapport pour l’instant.</p>'}</div></section>

    ${figures.length ? `<section><h3>Figures <small>${figures.length}</small></h3>
      <div class="figures">${figures.map((f) => `<button type="button" class="figure" data-fichier="${f.chemin}" title="${echapper(f.relatif)}">
        <img src="${f.url}" alt="${echapper(f.nom)}"><span>${echapper(f.nom)}</span></button>`).join('')}</div></section>` : ''}

    <section><h3>Ce qui reste ouvert</h3><ul class="ouverts"><li style="color:var(--texte-3)">Lecture des rapports…</li></ul></section>
  </div></div>`

  zone.querySelectorAll('[data-session]').forEach((b) => b.addEventListener('click', () => ouvrirSession(b.dataset.session)))
  // Titres des rapports (première ligne #) et section « Ce qui reste ouvert » lus dans les fichiers.
  for (const f of rapports) {
    titreMarkdown(f).then((t) => {
      const el = zone.querySelector(`[data-titre="${f.chemin}"]`)
      if (el) el.textContent = t.replace(/^Rapport\s+—\s+/, '')
    })
  }
  Promise.all(rapports.map(async (f) => ({ f, points: pointsOuverts(await lireTexte(f.url)) }))).then((liste) => {
    const ul = zone.querySelector('.ouverts')
    if (!ul) return
    const items = liste.flatMap(({ f, points }) => points.map((pt) => ({ f, pt })))
    ul.innerHTML = items.length
      ? items.map(({ f, pt }) => `<li><span>${echapper(pt)}</span><button type="button" class="source" data-fichier="${f.chemin}">${echapper(f.directeur ?? f.nom)}</button></li>`).join('')
      : '<li style="color:var(--texte-3)">Rien de signalé dans les rapports.</li>'
  })
}

/** Points de la section « Ce qui reste ouvert » d'un rapport Markdown (sans la syntaxe). */
function pointsOuverts(md) {
  const m = md.match(/##\s+Ce qui reste ouvert\s*\n([\s\S]*?)(?=\n##\s|$)/)
  if (!m) return []
  return m[1]
    .split('\n')
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, '').replace(/[*_`$\\]/g, '').trim())
}

// ── Documents ────────────────────────────────────────────

function monterDocuments() {
  const vue = panneau.vues.documents
  vue.innerHTML = '<div class="docs"><div class="docs-arbre"></div><div class="docs-apercu"></div></div>'
  const ouverts = new Set([`${etat.projet}/projet`, `${etat.projet}/sessions`])
  if (etat.session) ouverts.add(`${etat.projet}/sessions/${etat.session}`)
  arbo = monterArbo(vue.querySelector('.docs-arbre'), {
    racine: arbre(`${etat.projet}/`),
    ouverts,
    libelle: (n) => (n.type === 'dossier' && n.chemin.split('/').at(-2) === 'sessions' ? libelleSegment(n.nom, 'sessions') : n.nom),
    surFichier: apercu,
  })
  apercu(null)
}

function apercu(f) {
  afficherApercu(panneau.vues.documents.querySelector('.docs-apercu'), f, {
    vide: 'Choisissez un fichier dans l’arbre ci-dessus.',
  })
}

function montrerFichier(chemin) {
  panneau.choisir('documents')
  arbo.choisir(chemin)
  apercu(fichier(chemin))
}

lireAncre()
etat.projet ? rendreApp() : rendreListe()
