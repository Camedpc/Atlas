// 10 · Chronologie des productions. Accueil maître-détail (projets à gauche, sessions du projet à droite).
// Dans l'app, la vue Documents est un journal daté : chaque fichier à son heure, avec l'agent qui l'a produit et sa
// session ; portée « Cette session » ou « Tout le projet » ; l'arbre n'est qu'une bascule secondaire.
import { PROJETS, dateLongue, dateRelative, derniereActivite, heure, projet, session, sessionsDu } from '../../commun/donnees.js'
import { AGENTS, arbre, fichier, fichiersDuProjet, iconeFichier, libelleSegment, monterArbo } from '../../commun/bunker.js'
import { afficherApercu } from '../../commun/apercu.js'
import {
  ICONES, echapper, htmlArbreAgents, htmlFil, htmlListeSessions, htmlSaisie, monterBarre, monterPanneauDroit,
} from '../../commun/ui.js'

monterBarre()
const app = document.querySelector('#app')
const etat = { projet: null, session: null, choixAccueil: null, mode: 'chrono', portee: 'session', fichier: null }

function lireAncre() {
  const [p, s] = location.hash.slice(1).split('/')
  etat.projet = projet(p) ? p : null
  etat.session = etat.projet && session(s)?.projet === p ? s : null
}
const ecrireAncre = () => history.replaceState(null, '', `#${[etat.projet, etat.session].filter(Boolean).join('/')}`)
const libelleStatut = (s) => (s.statut === 'en_cours' ? '<span class="statut-en-cours">en cours</span>' : 'terminée')

// ── Accueil maître-détail ────────────────────────────────

function rendreAccueil() {
  const choisi = etat.choixAccueil ?? [...PROJETS].sort((a, b) => derniereActivite(b.id).localeCompare(derniereActivite(a.id)))[0].id
  etat.choixAccueil = choisi
  const p = projet(choisi)
  const sessions = sessionsDu(p.id)
  app.innerHTML = `<div class="accueil-md">
    <aside class="md-projets">
      <div class="laterale-tete"><span class="marque">Atlas</span></div>
      <div class="intertitre">Projets de Camille</div>
      ${PROJETS.map((q) => `<button type="button" class="projet-choix${q.id === choisi ? ' actif' : ''}" data-projet="${q.id}">
        <div class="nom">${echapper(q.nom)}</div>
        <div class="sous">${sessionsDu(q.id).length} sessions · ${dateRelative(derniereActivite(q.id))}</div></button>`).join('')}
    </aside>
    <section class="md-detail"><div class="cadre">
      <h1>${echapper(p.nom)}</h1>
      <p class="desc">${echapper(p.description)}</p>
      <div class="actions">
        <button type="button" class="principal" data-ouvrir-projet>Ouvrir le projet</button>
        <button type="button" data-ouvrir-projet>${ICONES.plus.replace('<svg', '<svg style="vertical-align:-3px;margin-right:4px"')}Nouvelle recherche</button>
      </div>
      <table class="tableau-sessions">
        <thead><tr><th>Session</th><th>Statut</th><th>Dernière activité</th><th>Fichiers</th><th></th></tr></thead>
        <tbody>${sessions.map((s) => `<tr>
          <td class="titre">${echapper(s.titre)}</td>
          <td class="gris">${libelleStatut(s)}</td>
          <td class="gris">${dateRelative(s.modifie)} · ${heure(s.modifie)}</td>
          <td class="gris">${fichiersDuProjet(p.id).filter((f) => f.session === s.id).length}</td>
          <td><button type="button" data-session="${s.id}">Ouvrir</button></td></tr>`).join('')}</tbody>
      </table>
    </div></section></div>`
  app.querySelectorAll('[data-projet]').forEach((b) => b.addEventListener('click', () => { etat.choixAccueil = b.dataset.projet; rendreAccueil() }))
  app.querySelectorAll('[data-ouvrir-projet]').forEach((b) => b.addEventListener('click', () => entrer(choisi, null)))
  app.querySelectorAll('[data-session]').forEach((b) => b.addEventListener('click', () => entrer(choisi, b.dataset.session)))
}

function entrer(p, s) {
  etat.projet = p
  etat.session = s
  etat.fichier = null
  ecrireAncre()
  rendreApp()
}

// ── App ──────────────────────────────────────────────────

let panneau

function rendreApp() {
  const p = projet(etat.projet)
  app.innerHTML = `<div class="trois-colonnes">
    <aside class="laterale">
      <div class="laterale-tete"><span class="marque">Atlas</span><button type="button" class="retour-accueil">← Projets</button></div>
      <div class="nom-projet">${echapper(p.nom)}</div>
      <button type="button" class="nouvelle-session">${ICONES.plus} Nouvelle recherche</button>
      <nav class="sessions-liste"></nav>
    </aside>
    <main class="conversation"></main>
    <section class="panneau"></section>
  </div>`
  app.querySelector('.retour-accueil').addEventListener('click', () => {
    etat.choixAccueil = etat.projet
    etat.projet = etat.session = null
    ecrireAncre()
    rendreAccueil()
  })
  app.querySelector('.nouvelle-session').addEventListener('click', () => ouvrirSession(null))
  app.querySelector('.sessions-liste').addEventListener('click', (e) => {
    const a = e.target.closest('[data-session]')
    if (!a) return
    e.preventDefault()
    ouvrirSession(a.dataset.session)
  })
  app.querySelector('.conversation').addEventListener('click', (e) => {
    const b = e.target.closest('.lien-fichier')
    if (b) montrerFichier(b.dataset.fichier)
  })
  panneau = monterPanneauDroit(app.querySelector('.panneau'), {
    initial: 'documents',
    surChangement: (id) => {
      const o = app.querySelector('.droit-outils')
      if (o) o.style.visibility = id === 'documents' ? 'visible' : 'hidden'
    },
  })
  panneau.outils.innerHTML = `
    <div class="segmente" data-groupe="portee"><button type="button" data-v="session">Cette session</button><button type="button" data-v="projet">Tout le projet</button></div>
    <div class="segmente" data-groupe="mode"><button type="button" data-v="chrono">Chronologie</button><button type="button" data-v="arbre">Arbre</button></div>`
  panneau.outils.style.visibility = 'visible'
  panneau.outils.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]')
    if (!b || b.disabled) return
    etat[b.parentElement.dataset.groupe] = b.dataset.v
    rendreDocuments()
  })
  panneau.vues.documents.innerHTML = '<div class="docs"><div class="docs-liste"></div><div class="docs-apercu"></div></div>'
  panneau.vues.documents.querySelector('.docs-liste').addEventListener('click', (e) => {
    const b = e.target.closest('.entree')
    if (b) choisirFichier(b.dataset.chemin)
  })
  rendreLaterale()
  rendreConversation()
  rendreDocuments()
  apercu(null)
}

function rendreLaterale() {
  app.querySelector('.sessions-liste').innerHTML = htmlListeSessions(sessionsDu(etat.projet), etat.session)
}

function ouvrirSession(id) {
  etat.session = id
  ecrireAncre()
  rendreLaterale()
  rendreConversation()
  rendreDocuments()
}

function rendreConversation() {
  const zone = app.querySelector('.conversation')
  const p = projet(etat.projet)
  if (!etat.session) {
    zone.innerHTML = `<div class="fil"><div class="fil-contenu" style="margin-top:12vh">
        <h2 style="margin:0 0 6px;font-size:22px;letter-spacing:-0.015em">Nouvelle recherche</h2>
        <p style="margin:0;color:var(--texte-2)">Dans « ${echapper(p.nom)} ». À droite, tout ce que les agents ont produit dans ce projet, du plus récent au plus ancien.</p>
      </div></div>
      <div class="bas">${htmlSaisie()}</div>`
    return
  }
  const s = session(etat.session)
  zone.innerHTML = `<header class="conv-tete"><div class="conv-titres">
      <h1 class="conv-titre">${echapper(s.titre)}</h1>
      <div class="conv-sous">${echapper(p.court)} · ${s.statut === 'en_cours' ? 'en cours' : 'terminée'} · ${dateRelative(s.modifie)}</div></div></header>
    <div class="fil"><div class="fil-contenu">${htmlFil(s)}</div></div>
    <div class="bas">${htmlArbreAgents(s, { ouvert: false })}${htmlSaisie()}</div>`
}

// ── Documents ────────────────────────────────────────────

function fichiersDansLaPortee() {
  const tous = fichiersDuProjet(etat.projet)
  return etat.portee === 'session' && etat.session ? tous.filter((f) => f.session === etat.session) : tous
}

function rendreDocuments() {
  // Sans session ouverte, seule la portée projet a un sens.
  const porteeEffective = etat.session ? etat.portee : 'projet'
  panneau.outils.querySelectorAll('[data-groupe="portee"] button').forEach((b) => {
    b.classList.toggle('actif', b.dataset.v === porteeEffective)
    b.disabled = b.dataset.v === 'session' && !etat.session
  })
  panneau.outils.querySelectorAll('[data-groupe="mode"] button').forEach((b) => b.classList.toggle('actif', b.dataset.v === etat.mode))
  const liste = panneau.vues.documents.querySelector('.docs-liste')
  if (etat.mode === 'arbre') return rendreArbre(liste, porteeEffective)
  liste.innerHTML = htmlChronologie(fichiersDansLaPortee())
  liste.scrollTop = 0
}

function htmlChronologie(fichiers) {
  const tries = [...fichiers].sort((a, b) => b.modifie.localeCompare(a.modifie) || a.chemin.localeCompare(b.chemin))
  if (!tries.length) return '<p class="vide" style="margin:16px">Aucun fichier produit pour l’instant.</p>'
  let jour = ''
  let groupe = null
  const html = ['<div class="chrono">']
  for (const f of tries) {
    const j = f.modifie.slice(0, 10)
    if (j !== jour) {
      jour = j
      groupe = null
      html.push(`<div class="chrono-jour">${dateLongue(f.modifie)}</div>`)
    }
    const g = f.session ?? '·projet'
    if (g !== groupe) {
      groupe = g
      const s = f.session && session(f.session)
      html.push(s
        ? `<div class="chrono-session">Session <b>${echapper(s.titre)}</b>${s.statut === 'en_cours' ? '<span class="en-cours">en cours</span>' : ''}</div>`
        : '<div class="chrono-session"><b>Fichiers du projet</b></div>')
    }
    const enCours = f.session && session(f.session)?.statut === 'en_cours'
    const vignette = f.genre === 'image' ? `<img src="${f.url}" alt="" loading="lazy">` : iconeFichier(f)
    html.push(`<button type="button" class="entree${enCours ? ' en-cours' : ''}${etat.fichier?.chemin === f.chemin ? ' choisie' : ''}" data-chemin="${f.chemin}" title="${echapper(f.chemin)}">
      <span class="h">${heure(f.modifie)}</span><span class="vignette">${vignette}</span>
      <span class="corps"><div class="qui"><b>${AGENTS[f.agent].libelle}</b>${f.directeur ? ` (${echapper(f.directeur)})` : ''}</div>
      <div class="quoi">${echapper(f.relatif)}</div></span></button>`)
  }
  html.push('</div>')
  return html.join('')
}

let arbo = null
function rendreArbre(liste, portee) {
  liste.innerHTML = '<div class="arbo"></div>'
  const prefixe = portee === 'session' ? `${etat.projet}/sessions/${etat.session}/` : `${etat.projet}/`
  const ouverts = new Set(portee === 'session' ? [`${prefixe}directeurs`] : [`${etat.projet}/projet`, `${etat.projet}/sessions`])
  arbo = monterArbo(liste.querySelector('.arbo'), {
    racine: arbre(prefixe),
    ouverts,
    choisi: etat.fichier?.chemin,
    libelle: (n) => (n.type === 'dossier' && n.chemin.split('/').at(-2) === 'sessions' ? libelleSegment(n.nom, 'sessions') : n.nom),
    surFichier: apercu,
  })
  if (etat.fichier?.chemin.startsWith(prefixe)) arbo.choisir(etat.fichier.chemin)
}

function choisirFichier(chemin) {
  apercu(fichier(chemin))
  panneau.vues.documents.querySelectorAll('.entree').forEach((b) => b.classList.toggle('choisie', b.dataset.chemin === chemin))
}

function apercu(f) {
  etat.fichier = f
  afficherApercu(panneau.vues.documents.querySelector('.docs-apercu'), f, {
    vide: 'Choisissez une production dans la liste ci-dessus.',
  })
}

function montrerFichier(chemin) {
  panneau.choisir('documents')
  const f = fichier(chemin)
  if (etat.portee === 'session' && f.session !== etat.session) etat.portee = 'projet'
  etat.fichier = f
  rendreDocuments()
  choisirFichier(chemin)
  if (etat.mode === 'arbre') arbo?.choisir(chemin)
  panneau.vues.documents.querySelector('.entree.choisie')?.scrollIntoView({ block: 'nearest' })
}

lireAncre()
etat.projet ? rendreApp() : rendreAccueil()
