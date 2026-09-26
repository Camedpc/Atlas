// 05 · Documents par agent. À l'ouverture, un dialogue « Choisir un projet » par-dessus l'app grisée.
// La vue Documents range les productions par session puis par agent auteur (qui a produit quoi) ; un clic sur
// une ligne de l'arbre des agents ouvre Documents filtré sur cet agent. Bascule « Dossiers » pour la vraie hiérarchie.
import { PROJETS, dateRelative, heure, projet, session, sessionsDu } from '../../commun/donnees.js'
import {
  AGENTS, arbre, fichier, fichiersDeSession, fichiersDuProjetSeul, iconeFichier, libelleSegment, monterArbo,
} from '../../commun/bunker.js'
import { afficherApercu } from '../../commun/apercu.js'
import {
  ICONES, brancherLiensFichiers, echapper, htmlArbreAgents, htmlFil, htmlListeSessions, htmlSaisie, monterBarre, monterPanneauDroit,
} from '../../commun/ui.js'

monterBarre()
const app = document.querySelector('#app')
const etat = { projet: null, session: null, mode: 'agent', filtre: null, fichier: null, ouvertes: new Set() }
let panneau = null
let arbo = null

// ── Coquille ────────────────────────────────────────────────

function rendreCoquille() {
  const p = projet(etat.projet)
  app.innerHTML = `<div class="trois-colonnes">
    <aside class="laterale">
      <div class="laterale-tete">
        <button type="button" class="selecteur-projet" title="Changer de projet">
          <span class="nom">${p ? echapper(p.nom) : 'Aucun projet'}</span>${ICONES.choix}</button>
      </div>
      <button type="button" class="nouvelle-session">${ICONES.plus} Nouvelle recherche</button>
      <nav class="sessions-liste"></nav>
    </aside>
    <main class="conversation"></main>
    <section class="panneau"></section>
  </div>`
  app.querySelector('.selecteur-projet').addEventListener('click', ouvrirDialogue)
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
  app.querySelector('.sessions-liste').innerHTML = etat.projet
    ? htmlListeSessions(sessionsDu(etat.projet), etat.session)
    : '<p class="vide">Choisissez un projet.</p>'
}

function rendreConversation() {
  const zone = app.querySelector('.conversation')
  const p = projet(etat.projet)
  if (!p) {
    zone.innerHTML = ''
    return
  }
  if (!etat.session) {
    zone.innerHTML = `<div class="fil"><div class="accueil-projet"><h2>${echapper(p.nom)}</h2><p>${echapper(p.description)}</p>
      <p>Ouvrez une session à gauche, ou posez une nouvelle question.</p></div></div>
      <div class="bas">${htmlSaisie({ placeholder: `Nouvelle recherche dans « ${p.court} »…` })}</div>`
    return
  }
  const s = session(etat.session)
  zone.innerHTML = `<header class="conv-tete"><div class="conv-titres">
      <h1 class="conv-titre">${echapper(s.titre)}</h1><div class="conv-sous">${echapper(p.court)} · ${s.statut === 'en_cours' ? 'en cours' : 'terminée'} · ${dateRelative(s.modifie)}</div></div></header>
    <div class="fil"><div class="fil-contenu">${htmlFil(s)}</div></div>
    <div class="bas"><div class="zone-agents"></div>${htmlSaisie({ aide: 'Cliquez un agent pour voir ses fichiers' })}</div>`
  rendreArbreAgents()
  brancherLiensFichiers(zone, (chemin) => montrerFichier(chemin))
  zone.querySelector('.zone-agents').addEventListener('click', (e) => {
    const li = e.target.closest('[data-agent]')
    if (!li) return
    filtrer(etat.filtre === li.dataset.agent ? null : li.dataset.agent)
  })
}

function rendreArbreAgents() {
  const zone = app.querySelector('.zone-agents')
  if (!zone || !etat.session) return
  const ouvert = zone.querySelector('details')?.open ?? true
  zone.innerHTML = htmlArbreAgents(session(etat.session), { cliquable: true, ouvert, choisi: etat.filtre })
}

function ouvrirSession(id) {
  etat.session = id
  etat.filtre = null
  if (id) etat.ouvertes.add(id)
  rendreSessions()
  rendreConversation()
  if (arbo && id) {
    arbo.options.ouverts.add(`${etat.projet}/sessions`)
    arbo.deplierVers(`${etat.projet}/sessions/${id}/directeurs/x`)
  }
  rendreDocuments()
}

// ── Dialogue de choix du projet ─────────────────────────────

function ouvrirDialogue() {
  app.firstElementChild?.classList.add('app-grisee')
  const voile = document.createElement('div')
  voile.className = 'voile'
  voile.innerHTML = `<div class="dialogue" role="dialog" aria-modal="true" aria-labelledby="titre-dialogue">
    <div class="dialogue-tete"><h2 id="titre-dialogue">Choisir un projet</h2><p>Les sessions et les documents affichés sont ceux du projet choisi.</p></div>
    <div class="dialogue-liste">${PROJETS.map((p) => {
      const n = sessionsDu(p.id).length
      return `<button type="button" class="choix-projet" data-projet="${p.id}">
        <span class="corps"><div class="nom">${echapper(p.nom)}</div>
        <div class="meta">${n} session${n > 1 ? 's' : ''} · dernière activité ${dateRelative(sessionsDu(p.id)[0]?.modifie ?? p.cree)}</div></span>
        ${p.id === etat.projet ? '<span class="actuel">actuel</span>' : ''}</button>`
    }).join('')}</div>
    <div class="dialogue-pied"><span>↑ ↓ pour choisir, Entrée pour ouvrir</span>${etat.projet ? '<span>Échap pour fermer</span>' : ''}</div>
  </div>`
  document.body.append(voile)
  const boutons = [...voile.querySelectorAll('.choix-projet')]
  ;(boutons.find((b) => b.dataset.projet === etat.projet) ?? boutons[0]).focus()
  const fermer = () => {
    voile.remove()
    document.removeEventListener('keydown', clavier)
    app.firstElementChild?.classList.remove('app-grisee')
  }
  const clavier = (e) => {
    const i = boutons.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); boutons[(i + 1) % boutons.length].focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); boutons[(i - 1 + boutons.length) % boutons.length].focus() }
    if (e.key === 'Escape' && etat.projet) fermer()
  }
  document.addEventListener('keydown', clavier)
  voile.addEventListener('mousedown', (e) => { if (e.target === voile && etat.projet) fermer() })
  voile.addEventListener('click', (e) => {
    const b = e.target.closest('[data-projet]')
    if (!b) return
    fermer()
    choisirProjet(b.dataset.projet)
  })
}

function choisirProjet(id) {
  if (id !== etat.projet) {
    etat.projet = id
    etat.session = sessionsDu(id)[0]?.id ?? null
    etat.filtre = null
    etat.fichier = null
    etat.ouvertes = new Set(etat.session ? [etat.session] : [])
    arbo = null
  }
  rendreCoquille()
}

// ── Documents ───────────────────────────────────────────────

function monterDocuments() {
  panneau.vues.documents.innerHTML = `<div class="docs5">
      <div class="docs5-barre">
        <div class="bascule"><button type="button" data-mode="agent">Par agent</button><button type="button" data-mode="dossiers">Dossiers</button></div>
        <span class="zone-filtre"></span><span class="espace"></span><span class="docs5-compte"></span>
      </div>
      <div class="docs5-liste"></div>
      <div class="docs5-arbo" hidden></div>
      <div class="tiroir"><div class="tiroir-barre"><button type="button" class="discret retour">← Documents</button><span class="ou"></span></div><div class="tiroir-corps"></div></div>
    </div>`
  const vue = panneau.vues.documents
  vue.querySelector('.bascule').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]')
    if (!b) return
    etat.mode = b.dataset.mode
    rendreDocuments()
  })
  vue.querySelector('.zone-filtre').addEventListener('click', (e) => { if (e.target.closest('.retirer')) filtrer(null) })
  vue.querySelector('.retour').addEventListener('click', fermerApercu)
  vue.querySelector('.docs5-liste').addEventListener('click', (e) => {
    const l = e.target.closest('[data-fichier]')
    if (l) ouvrirApercu(fichier(l.dataset.fichier))
  })
  vue.querySelector('.docs5-liste').addEventListener('toggle', (e) => {
    const d = e.target.closest('.groupe-session')
    if (!d?.dataset.session) return
    d.open ? etat.ouvertes.add(d.dataset.session) : etat.ouvertes.delete(d.dataset.session)
  }, true)
  if (etat.projet) {
    const ouverts = new Set([`${etat.projet}/projet`, `${etat.projet}/sessions`])
    if (etat.session) ouverts.add(`${etat.projet}/sessions/${etat.session}`)
    arbo = monterArbo(vue.querySelector('.docs5-arbo'), {
      racine: arbre(`${etat.projet}/`),
      ouverts,
      libelle: (n) => (n.type === 'dossier' && n.chemin.split('/').at(-2) === 'sessions' ? libelleSegment(n.nom, 'sessions') : n.nom),
      surFichier: (f) => ouvrirApercu(f),
    })
  }
  rendreDocuments()
}

function libelleFiltre(cle) {
  const [role, tache] = cle.split('|')
  return `${AGENTS[role]?.libelle ?? role}${tache ? ` ${tache}` : ''}`
}

function filtrer(cle) {
  etat.filtre = cle
  if (cle) {
    etat.mode = 'agent'
    panneau.choisir('documents')
    fermerApercu()
  }
  rendreArbreAgents()
  rendreDocuments()
}

/** Groupes d'agents d'une session : [{ titre, tache, retrait, cle, fichiers }] dans l'ordre de l'arbre. */
function groupesDeSession(sessionId) {
  const fichiers = fichiersDeSession(sessionId).sort((a, b) => a.modifie.localeCompare(b.modifie))
  const groupes = []
  const ajouter = (titre, cle, liste, options = {}) => { if (liste.length) groupes.push({ titre, cle, fichiers: liste, ...options }) }
  ajouter('Orchestrateur', 'orchestrateur|', fichiers.filter((f) => f.agent === 'orchestrateur'))
  const directeurs = [...new Set(fichiers.filter((f) => f.directeur).map((f) => f.directeur))].sort()
  for (const d of directeurs) {
    const siens = fichiers.filter((f) => f.directeur === d)
    groupes.push({ titre: 'Directeur de labo', tache: d, cle: `directeur_de_labo|${d}`, fichiers: siens.filter((f) => f.agent === 'directeur_de_labo') })
    ajouter('Littérature', `litterature|${d}`, siens.filter((f) => f.agent === 'litterature'), { retrait: true })
    ajouter('Expérimentateur', `experimentateur|${d}`, siens.filter((f) => f.agent === 'experimentateur'), { retrait: true })
  }
  ajouter('Graphiste', 'graphiste|', fichiers.filter((f) => f.agent === 'graphiste'))
  ajouter('Vérificateur', 'verificateur|', fichiers.filter((f) => f.agent === 'verificateur'))
  ajouter('Camille', 'camille|', fichiers.filter((f) => f.agent === 'camille'), { note: 'docs_session' })
  return groupes
}

function htmlLigne(f) {
  const dossier = f.relatif.includes('/') ? f.relatif.slice(0, f.relatif.lastIndexOf('/') + 1) : ''
  return `<div class="ligne-fichier${etat.fichier?.chemin === f.chemin ? ' choisie' : ''}" data-fichier="${f.chemin}" title="${echapper(f.relatif)}">
    <span class="ico">${iconeFichier(f)}</span><span class="nom">${echapper(f.nom)}</span>
    <span class="dossier">${echapper(dossier)}</span><span class="heure">${heure(f.modifie)}</span></div>`
}

function htmlGroupe(g) {
  return `<div class="groupe-agent${g.retrait ? ' retrait' : ''}">
    <h4>${g.retrait ? '<span class="ramification">└─</span>' : ''}${g.titre}${g.tache ? `<span class="tache">${g.tache}</span>` : ''}${g.note ? `<span class="tache">${g.note}</span>` : ''}</h4>
    ${g.fichiers.length ? g.fichiers.map(htmlLigne).join('') : '<div class="vide" style="margin:2px 8px">Aucun fichier propre ; voir ses sous-agents.</div>'}
  </div>`
}

function rendreDocuments() {
  if (!panneau) return
  const vue = panneau.vues.documents
  vue.querySelectorAll('.bascule button').forEach((b) => b.classList.toggle('actif', b.dataset.mode === etat.mode))
  vue.querySelector('.zone-filtre').innerHTML = etat.filtre && etat.mode === 'agent'
    ? `<span class="puce-filtre">Filtre : ${echapper(libelleFiltre(etat.filtre))}<button type="button" class="retirer" title="Retirer le filtre">${ICONES.fermer}</button></span>`
    : ''
  const liste = vue.querySelector('.docs5-liste')
  const zoneArbo = vue.querySelector('.docs5-arbo')
  liste.hidden = etat.mode !== 'agent'
  zoneArbo.hidden = etat.mode !== 'dossiers'
  const compte = vue.querySelector('.docs5-compte')
  if (!etat.projet) {
    liste.innerHTML = '<p class="vide">Choisissez un projet.</p>'
    compte.textContent = ''
    return
  }
  if (etat.mode === 'dossiers') {
    arbo?.redessiner()
    compte.textContent = ''
    return
  }
  // Filtre sur un agent : seulement ses fichiers, dans la session courante.
  if (etat.filtre && etat.session) {
    const g = groupesDeSession(etat.session).filter((x) => x.cle === etat.filtre)
    const n = g.reduce((s, x) => s + x.fichiers.length, 0)
    compte.textContent = `${n} fichier${n > 1 ? 's' : ''}`
    liste.innerHTML = `<div class="groupe-session"><div class="intertitre" style="margin:6px 6px 0">${echapper(session(etat.session).titre)}</div>
      ${g.length ? g.map(htmlGroupe).join('') : '<p class="vide">Cet agent n’a produit aucun fichier.</p>'}</div>`
    return
  }
  const sessions = sessionsDu(etat.projet)
  const ordre = etat.session ? [session(etat.session), ...sessions.filter((s) => s.id !== etat.session)] : sessions
  let total = 0
  const html = ordre.map((s) => {
    const groupes = groupesDeSession(s.id)
    const n = groupes.reduce((t, g) => t + g.fichiers.length, 0)
    total += n
    const ouvert = s.id === etat.session || etat.ouvertes.has(s.id)
    return `<details class="groupe-session" data-session="${s.id}" ${ouvert ? 'open' : ''}>
      <summary>${echapper(s.titre)}${s.id === etat.session ? '<span class="courante">session ouverte</span>' : ''}<span class="compte">${n} fichiers</span></summary>
      ${groupes.map(htmlGroupe).join('')}</details>`
  })
  const duProjet = fichiersDuProjetSeul(etat.projet)
  total += duProjet.length
  html.push(`<details class="groupe-session" data-session="__projet" ${etat.ouvertes.has('__projet') ? 'open' : ''}>
    <summary>Fichiers du projet<span class="compte">${duProjet.length} fichiers</span></summary>
    ${htmlGroupe({ titre: 'Camille', note: 'projet/', fichiers: duProjet })}</details>`)
  liste.innerHTML = html.join('')
  compte.textContent = `${total} fichiers`
}

function ouvrirApercu(f) {
  if (!f) return
  etat.fichier = f
  const vue = panneau.vues.documents
  const tiroir = vue.querySelector('.tiroir')
  const auteur = `${AGENTS[f.agent].libelle}${f.directeur ? ` · ${f.directeur}` : ''}`
  tiroir.querySelector('.ou').textContent = f.session ? `${session(f.session).titre} › ${auteur}` : `Fichiers du projet › ${auteur}`
  afficherApercu(tiroir.querySelector('.tiroir-corps'), f)
  tiroir.classList.add('ouvert')
  vue.querySelectorAll('.ligne-fichier').forEach((l) => l.classList.toggle('choisie', l.dataset.fichier === f.chemin))
}

function fermerApercu() {
  panneau?.vues.documents.querySelector('.tiroir')?.classList.remove('ouvert')
}

function montrerFichier(chemin) {
  const f = fichier(chemin)
  panneau.choisir('documents')
  if (f.session) etat.ouvertes.add(f.session)
  etat.filtre = null
  rendreArbreAgents()
  rendreDocuments()
  arbo?.choisir(chemin)
  ouvrirApercu(f)
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.querySelector('.voile')) fermerApercu()
})

rendreCoquille()
ouvrirDialogue()
