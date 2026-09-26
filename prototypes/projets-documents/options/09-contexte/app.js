// 09 · Documents épinglés au contexte. Projets en accordéon dans la barre latérale ; les fichiers cités dans le fil
// ouvrent la vue Documents ; depuis Documents (ou par « @ » dans la saisie) on épingle un fichier au contexte de la
// session : il apparaît en puce au-dessus de la saisie et partirait avec la question suivante.
import { PROJETS, dateRelative, projet, session, sessionsDu } from '../../commun/donnees.js'
import { FICHIERS, ICONES, arbre, fichier, iconeFichier, libelleSegment, monterArbo } from '../../commun/bunker.js'
import { afficherApercu } from '../../commun/apercu.js'
import { echapper, htmlArbreAgents, htmlFil, htmlSaisie, monterBarre, monterPanneauDroit } from '../../commun/ui.js'

monterBarre()
const app = document.querySelector('#app')

const etat = {
  projet: null, // projet courant (celui de la vue Documents)
  session: null,
  deplies: new Set(), // projets dépliés dans l'accordéon
  fichier: null,
}
// Épingles par session (chemins complets). Une épingle d'exemple pour la démonstration.
const epingles = new Map([['s-7f3a2c', ['hydrures/sessions/s-7f3a2c/docs_session/mesures-drozdov-2019.csv']]])
const epinglesCourantes = () => (etat.session ? (epingles.get(etat.session) ?? []) : [])
const estEpingle = (chemin) => epinglesCourantes().includes(chemin)

function basculerEpingle(chemin, forcer) {
  if (!etat.session) return
  const liste = epinglesCourantes().slice()
  const i = liste.indexOf(chemin)
  const voulu = forcer ?? i < 0
  if (voulu && i < 0) liste.push(chemin)
  if (!voulu && i >= 0) liste.splice(i, 1)
  epingles.set(etat.session, liste)
  majEpingles()
}

// ── Squelette ────────────────────────────────────────────

app.innerHTML = `<div class="trois-colonnes">
  <aside class="laterale">
    <div class="laterale-tete"><span class="marque">Atlas</span></div>
    <div class="intertitre" style="margin:4px 18px 6px">Projets</div>
    <nav class="accordeon"></nav>
  </aside>
  <main class="conversation"></main>
  <section class="panneau"></section>
</div>`

const panneau = monterPanneauDroit(app.querySelector('.panneau'), { initial: 'documents' })
const zoneConv = app.querySelector('.conversation')
let arbo

// ── Barre latérale : accordéon projets → sessions ────────

function rendreAccordeon() {
  app.querySelector('.accordeon').innerHTML = PROJETS.map((p) => {
    const ouvert = etat.deplies.has(p.id)
    const sessions = sessionsDu(p.id)
    return `<button type="button" class="projet-ligne${ouvert ? ' ouvert' : ''}${etat.projet === p.id ? ' courant' : ''}" data-projet="${p.id}" title="${echapper(p.nom)}">
        <span class="chevron">▶</span>${ICONES[ouvert ? 'dossierOuvert' : 'dossier']}<span class="nom">${echapper(p.nom)}</span><span class="compte">${sessions.length}</span></button>
      ${ouvert ? `<div class="projet-sessions">
        ${sessions.map((s) => {
          const n = (epingles.get(s.id) ?? []).length
          return `<a class="session${s.id === etat.session ? ' active' : ''}" href="#" data-session="${s.id}" title="${echapper(s.titre)}">
            <span class="session-titre">${echapper(s.titre)}</span>
            ${n ? `<span class="epingles-compte" title="${n} fichier(s) épinglé(s)">${ICONES.epingle}${n}</span>` : ''}
            ${s.statut === 'en_cours' ? '<span class="session-statut">en cours</span>' : ''}</a>`
        }).join('')}
        <button type="button" class="nouvelle" data-nouvelle="${p.id}">${ICONES.plus} Nouvelle recherche</button></div>` : ''}`
  }).join('')
}

app.querySelector('.accordeon').addEventListener('click', (e) => {
  const ligne = e.target.closest('[data-projet]')
  const s = e.target.closest('[data-session]')
  const nouvelle = e.target.closest('[data-nouvelle]')
  if (ligne) {
    const id = ligne.dataset.projet
    if (etat.deplies.has(id) && etat.projet === id) etat.deplies.delete(id)
    else etat.deplies.add(id)
    if (etat.projet !== id) choisirProjet(id)
    else rendreAccordeon()
  } else if (s) {
    e.preventDefault()
    ouvrirSession(s.dataset.session)
  } else if (nouvelle) {
    choisirProjet(nouvelle.dataset.nouvelle)
  }
})

function choisirProjet(id) {
  etat.projet = id
  etat.session = null
  etat.deplies.add(id)
  ecrireAncre()
  rendreAccordeon()
  rendreCentre()
  monterDocuments()
  majEpingles()
}

function ouvrirSession(id) {
  const s = session(id)
  const changeProjet = etat.projet !== s.projet
  etat.projet = s.projet
  etat.session = id
  etat.deplies.add(s.projet)
  ecrireAncre()
  rendreAccordeon()
  rendreCentre()
  if (changeProjet || !arbo) monterDocuments()
  arbo.deplierVers(`${s.projet}/sessions/${id}/directeurs/x`)
  majEpingles()
}

function lireAncre() {
  const [p, s] = location.hash.slice(1).split('/')
  if (session(s)?.projet === p) return ouvrirSession(s)
  if (projet(p)) return choisirProjet(p)
  rendreAccordeon()
  rendreCentre()
  monterDocuments()
  majEpingles()
}
const ecrireAncre = () => history.replaceState(null, '', `#${[etat.projet, etat.session].filter(Boolean).join('/')}`)

// ── Centre ───────────────────────────────────────────────

function rendreCentre() {
  if (!etat.projet) {
    zoneConv.innerHTML = `<div class="fil"><div class="invite">
      <h2>Choisissez un projet</h2>
      <p>Dépliez un projet dans la barre latérale pour voir ses sessions. Dans une session, épinglez des documents du bunker
        (vue Documents, ou <kbd>@</kbd> dans la saisie) : ils accompagnent votre prochaine question.</p></div></div>`
    return
  }
  const p = projet(etat.projet)
  if (!etat.session) {
    zoneConv.innerHTML = `<div class="fil"><div class="invite">
        <h2>${echapper(p.nom)}</h2><p>${echapper(p.description)}</p>
        <div class="intertitre" style="margin:0 0 8px">Sessions</div>
        <div class="sessions-du-projet">${sessionsDu(p.id).map((s) => `<button type="button" data-session="${s.id}"><span>${echapper(s.titre)}</span><span>${dateRelative(s.modifie)}</span></button>`).join('')}</div>
      </div></div>
      <div class="bas">${htmlSaisie({ placeholder: `Nouvelle recherche dans « ${p.court} »…`, aide: 'Les épingles se posent dans une session.' })}</div>`
    zoneConv.querySelectorAll('[data-session]').forEach((b) => b.addEventListener('click', () => ouvrirSession(b.dataset.session)))
    return
  }
  const s = session(etat.session)
  zoneConv.innerHTML = `<header class="conv-tete"><div class="conv-titres">
      <h1 class="conv-titre">${echapper(s.titre)}</h1>
      <div class="conv-sous">${echapper(p.court)} · ${s.statut === 'en_cours' ? 'en cours' : 'terminée'} · ${dateRelative(s.modifie)}</div></div></header>
    <div class="fil"><div class="fil-contenu">${htmlFil(s)}</div></div>
    <div class="bas">
      <div class="mentions" hidden></div>
      ${htmlArbreAgents(s, { ouvert: false })}
      ${htmlSaisie({ avant: '<div class="epingles"></div>', placeholder: 'Question suivante… (@ pour joindre un fichier)', aide: '<kbd>@</kbd> joindre un fichier' })}
    </div>`
  brancherMentions(zoneConv.querySelector('textarea'), zoneConv.querySelector('.mentions'))
}

// Délégation unique : liens de fichiers du fil, puces d'épingles.
zoneConv.addEventListener('click', (e) => {
  const retirer = e.target.closest('.puce .retirer')
  if (retirer) return basculerEpingle(retirer.closest('.puce').dataset.chemin, false)
  const puce = e.target.closest('.puce')
  if (puce) return montrerFichier(puce.dataset.chemin)
  const lien = e.target.closest('.lien-fichier')
  if (lien) montrerFichier(lien.dataset.fichier)
})

// ── Épingles : puces, compteur d'onglet, arbre, en-tête d'aperçu ──

function majEpingles() {
  const conteneur = zoneConv.querySelector('.epingles')
  if (conteneur) {
    conteneur.innerHTML = epinglesCourantes()
      .map((c) => {
        const f = fichier(c)
        return `<span class="puce" data-chemin="${c}" title="${echapper(f.relatif)} — cliquer pour l’aperçu">
          <span class="ico">${iconeFichier(f)}</span><span class="nom">${echapper(f.nom)}</span>
          <button type="button" class="retirer" title="Retirer du contexte">${ICONES.fermer}</button></span>`
      })
      .join('')
  }
  const n = epinglesCourantes().length
  const onglet = app.querySelector('.onglets [data-vue="documents"]')
  onglet.innerHTML = `Documents${n ? `<span class="compte-epingles" title="${n} épinglé(s) au contexte">${n}</span>` : ''}`
  arbo?.redessiner()
  majBoutonApercu()
  rendreAccordeon()
}

function majBoutonApercu() {
  const b = panneau.vues.documents.querySelector('.epingler-apercu')
  if (!b || !etat.fichier) return
  const actif = estEpingle(etat.fichier.chemin)
  b.classList.toggle('actif', actif)
  b.disabled = !etat.session
  b.title = etat.session ? '' : 'Ouvrez une session pour épingler'
  b.innerHTML = `${ICONES.epingle}${actif ? 'Épinglé au contexte' : 'Épingler au contexte'}`
}

// ── Documents ────────────────────────────────────────────

function monterDocuments() {
  const vue = panneau.vues.documents
  const prefixe = etat.projet ? `${etat.projet}/` : ''
  vue.innerHTML = `<div class="docs">
      <div class="docs-arbre"><div class="note">${etat.projet ? `Bunker du projet <b>${echapper(projet(etat.projet).court)}</b>. Survolez un fichier pour l’épingler.` : 'Tout le bunker. Choisissez un projet pour le restreindre.'}</div><div class="arbo"></div></div>
      <div class="docs-apercu"></div></div>`
  const ouverts = new Set(etat.projet ? [`${etat.projet}/projet`, `${etat.projet}/sessions`] : [])
  const arboEl = vue.querySelector('.arbo')
  // Clic sur l'épingle d'une ligne : intercepté avant le clic de ligne de monterArbo.
  arboEl.addEventListener('click', (e) => {
    const b = e.target.closest('.epingler')
    if (!b) return
    e.stopPropagation()
    if (!etat.session) return
    basculerEpingle(b.dataset.epingler)
  }, true)
  arbo = monterArbo(arboEl, {
    racine: arbre(prefixe),
    ouverts,
    libelle: (n) => {
      if (n.type !== 'dossier') return n.nom
      if (!n.chemin.includes('/')) return libelleSegment(n.nom)
      return n.chemin.split('/').at(-2) === 'sessions' ? libelleSegment(n.nom, 'sessions') : n.nom
    },
    meta: (n) => {
      if (n.type !== 'fichier' || !etat.session) return ''
      const actif = estEpingle(n.chemin)
      return `<span class="epingler${actif ? ' actif' : ''}" data-epingler="${n.chemin}" title="${actif ? 'Retirer du contexte' : 'Épingler au contexte'}">${ICONES.epingle}</span>`
    },
    surFichier: apercu,
  })
  apercu(etat.fichier && (!etat.projet || etat.fichier.projet === etat.projet) ? etat.fichier : null)
}

function apercu(f) {
  etat.fichier = f
  const el = panneau.vues.documents.querySelector('.docs-apercu')
  afficherApercu(el, f, {
    vide: 'Choisissez un fichier.<br><small>Le bouton « Épingler au contexte » le joint à la question suivante.</small>',
    suite: '<button type="button" class="epingler-apercu"></button>',
  })
  el.querySelector('.epingler-apercu')?.addEventListener('click', () => basculerEpingle(f.chemin))
  majBoutonApercu()
}

function montrerFichier(chemin) {
  panneau.choisir('documents')
  arbo.choisir(chemin)
  apercu(fichier(chemin))
}

// ── Mention @ dans la saisie ─────────────────────────────

function candidats() {
  // Fichiers de la session d'abord, puis ceux du projet, puis les autres sessions du projet.
  const rang = (f) => (f.session === etat.session ? 0 : !f.session ? 1 : 2)
  return FICHIERS.filter((f) => f.projet === etat.projet).sort((a, b) => rang(a) - rang(b) || a.relatif.localeCompare(b.relatif))
}

function brancherMentions(zone, menu) {
  let resultats = []
  let curseur = 0
  const requete = () => zone.value.slice(0, zone.selectionStart).match(/(?:^|\s)@([^\s@]*)$/)
  const fermer = () => { menu.hidden = true; resultats = [] }
  const dessiner = () => {
    menu.innerHTML = `<div class="titre">Joindre un fichier au contexte</div>${resultats
      .map((f, i) => `<div class="mention${i === curseur ? ' curseur' : ''}" data-i="${i}">
        <span class="ico">${iconeFichier(f)}</span><span class="nom">${echapper(f.nom)}</span>
        <span class="chemin">${echapper(f.session ? (f.session === etat.session ? f.relatif : `${session(f.session).titre} › ${f.relatif}`) : `projet › ${f.relatif.replace(/^projet\//, '')}`)}</span>
        ${estEpingle(f.chemin) ? '<span class="deja">épinglé</span>' : ''}</div>`)
      .join('') || '<div class="titre">Aucun fichier ne correspond.</div>'}`
    menu.querySelector('.curseur')?.scrollIntoView({ block: 'nearest' })
  }
  const choisir = (f) => {
    const m = requete()
    const debut = zone.selectionStart - m[1].length - 1
    zone.value = zone.value.slice(0, debut) + zone.value.slice(zone.selectionStart)
    zone.selectionStart = zone.selectionEnd = debut
    basculerEpingle(f.chemin, true)
    fermer()
    zone.focus()
  }
  zone.addEventListener('input', () => {
    const m = requete()
    if (!m) return fermer()
    const q = m[1].toLowerCase()
    resultats = candidats().filter((f) => f.relatif.toLowerCase().includes(q)).slice(0, 8)
    curseur = 0
    menu.hidden = false
    dessiner()
  })
  zone.addEventListener('keydown', (e) => {
    if (menu.hidden) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      curseur = (curseur + (e.key === 'ArrowDown' ? 1 : -1) + resultats.length) % Math.max(1, resultats.length)
      dessiner()
    } else if ((e.key === 'Enter' || e.key === 'Tab') && resultats[curseur]) {
      e.preventDefault()
      choisir(resultats[curseur])
    } else if (e.key === 'Escape') fermer()
  })
  zone.addEventListener('blur', () => setTimeout(fermer, 150))
  menu.addEventListener('mousedown', (e) => {
    const l = e.target.closest('.mention')
    if (!l) return
    e.preventDefault()
    choisir(resultats[Number(l.dataset.i)])
  })
}

lireAncre()
