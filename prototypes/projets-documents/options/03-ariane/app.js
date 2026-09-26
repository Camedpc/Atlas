// 03 · Fil d'Ariane et colonnes. Le fil d'Ariane (camille › projet › session › chemin du fichier) est le
// navigateur principal : chaque segment ouvre le menu de ses frères. Sans session ouverte, le centre montre
// des colonnes Miller (Projets | Sessions | résumé) ; la vue Documents est un Finder en colonnes du bunker.
import { PROJETS, UTILISATRICE, dateRelative, projet, session, sessionsDu } from '../../commun/donnees.js'
import { AGENTS, ICONES, RACINE_AFFICHEE, arbre, fichiersDeSession, iconeFichier, libelleSegment, tailleLisible } from '../../commun/bunker.js'
import { afficherApercu } from '../../commun/apercu.js'
import {
  brancherLiensFichiers, echapper, htmlArbreAgents, htmlFil, htmlListeSessions, htmlSaisie, monterBarre, monterPanneauDroit,
} from '../../commun/ui.js'

monterBarre()
const app = document.querySelector('#app')
// projet / session : ce qui est ouvert ; selection : chemin choisi dans le Finder (dossier ou fichier) ;
// survol* : ce qui est choisi dans les colonnes d'accueil, avant d'ouvrir.
const etat = { projet: null, session: null, selection: null, survolProjet: null, survolSession: null }

function lireAncre() {
  const [p, s] = location.hash.slice(1).split('/')
  etat.projet = projet(p) ? p : null
  etat.session = etat.projet && session(s)?.projet === p ? s : null
}
const ecrireAncre = () => history.replaceState(null, '', `#${[etat.projet, etat.session].filter(Boolean).join('/')}`)

app.innerHTML = `<div class="cadre">
  <nav class="ariane" aria-label="Fil d’Ariane"></nav>
  <div class="trois-colonnes">
    <aside class="laterale">
      <div class="laterale-tete"><span class="intertitre" style="margin:0">Sessions du projet</span></div>
      <div class="zone-laterale" style="display:flex;flex-direction:column;min-height:0;flex:1"></div>
    </aside>
    <main class="conversation"></main>
    <section class="panneau"></section>
  </div></div>`

const ariane = app.querySelector('.ariane')
const laterale = app.querySelector('.zone-laterale')
const centre = app.querySelector('.conversation')
const panneau = monterPanneauDroit(app.querySelector('.panneau'), { initial: 'documents' })

// ── Arbre du bunker et index par chemin ──────────────────────

let racine, index
function construireArbre() {
  racine = arbre(etat.projet ? `${etat.projet}/` : '')
  index = new Map()
  const visiter = (n) => {
    index.set(n.chemin, n)
    if (n.type === 'dossier') n.enfants.forEach(visiter)
  }
  visiter(racine)
}
const parent = (chemin) => chemin.split('/').slice(0, -1).join('/')
const estSession = (n) => n.type === 'dossier' && n.chemin.split('/').at(-2) === 'sessions'
const libelle = (n) => (n.chemin === '' ? 'camille' : estSession(n) ? libelleSegment(n.nom, 'sessions') : !n.chemin.includes('/') ? libelleSegment(n.nom) : n.nom)

// ── Navigation ───────────────────────────────────────────────

function ouvrirProjet(p) {
  etat.projet = p
  etat.session = null
  etat.selection = null
  etat.survolProjet = p
  etat.survolSession = null
  rendre()
}
function ouvrirSession(s) {
  etat.projet = session(s).projet
  etat.session = s
  const dossier = `${etat.projet}/sessions/${s}`
  if (!etat.selection?.startsWith(dossier)) etat.selection = dossier
  rendre()
}
function revenirAccueil() {
  etat.projet = null
  etat.session = null
  etat.selection = null
  etat.survolProjet = null
  etat.survolSession = null
  rendre()
}
function choisirChemin(chemin) {
  etat.selection = chemin
  panneau.choisir('documents')
  rendreAriane()
  rendreFinder()
}

function rendre() {
  ecrireAncre()
  construireArbre()
  if (etat.projet) etat.survolProjet = etat.projet
  rendreAriane()
  rendreLaterale()
  rendreCentre()
  rendreFinder()
}

// ── Fil d'Ariane ─────────────────────────────────────────────

const chevron = ICONES.choix

function rendreAriane() {
  const segs = []
  const bouton = (cle, texte, { dernier = false, classe = '', icone = '' } = {}) =>
    `<button type="button" class="segment ${classe}${dernier ? ' dernier' : ''}" data-seg="${echapper(cle)}">${icone}<span class="txt">${echapper(texte)}</span>${chevron}</button>`
  segs.push(bouton('utilisateur', UTILISATRICE.id, { icone: `<span class="avatar" style="width:18px;height:18px;font-size:9px">${UTILISATRICE.initiales}</span>`, dernier: !etat.projet }))
  if (!etat.projet) {
    segs.push(bouton('projet', 'Choisir un projet', { classe: 'invite' }))
  } else {
    // Le fichier choisi peut appartenir à une autre session que celle ouverte : le fil suit le fichier.
    const sel = etat.selection && etat.selection.startsWith(etat.projet) ? etat.selection : null
    const m = sel?.match(/^[^/]+\/sessions\/([^/]+)/)
    const sessionAffichee = m ? m[1] : etat.session
    const reste = sel ? (m ? sel.slice(m[0].length + 1) : sel.slice(etat.projet.length + 1)) : ''
    const baseReste = sel ? (m ? m[0] : etat.projet) : null
    segs.push(bouton('projet', projet(etat.projet).nom, { dernier: !sessionAffichee && !reste }))
    if (sessionAffichee || !reste) {
      segs.push(sessionAffichee ? bouton('session', session(sessionAffichee).titre, { dernier: !reste, icone: ICONES.session }) : bouton('session', 'Choisir une session', { classe: 'invite' }))
    }
    if (reste) {
      const parties = reste.split('/')
      parties.forEach((nom, i) => {
        const chemin = `${baseReste}/${parties.slice(0, i + 1).join('/')}`
        const n = index.get(chemin)
        segs.push(bouton(`chemin:${chemin}`, nom, { dernier: i === parties.length - 1, classe: n?.type === 'fichier' ? 'fichier' : '' }))
      })
    }
    ariane.dataset.sessionAffichee = sessionAffichee ?? ''
  }
  ariane.innerHTML = `<span class="marque">Atlas</span>${segs.join('<span class="sep">›</span>')}`
}

ariane.addEventListener('click', (e) => {
  const b = e.target.closest('.segment')
  if (!b) return
  const cle = b.dataset.seg
  let entrees = []
  if (cle === 'utilisateur') {
    entrees = [
      { petit: 'Utilisatrice' },
      { texte: `${UTILISATRICE.nom} (vous)`, coche: true, action: () => {} },
      { sep: true },
      { texte: 'Tous les projets', icone: ICONES.projet, action: revenirAccueil },
    ]
  } else if (cle === 'projet') {
    entrees = [{ petit: 'Projets' }, ...PROJETS.map((p) => ({ texte: p.nom, icone: ICONES.projet, coche: p.id === etat.projet, action: () => ouvrirProjet(p.id) }))]
  } else if (cle === 'session') {
    const affichee = ariane.dataset.sessionAffichee
    entrees = [
      { petit: `Sessions · ${projet(etat.projet).court}` },
      ...sessionsDu(etat.projet).map((s) => ({ texte: s.titre, icone: ICONES.session, meta: dateRelative(s.modifie), coche: s.id === affichee, action: () => ouvrirSession(s.id) })),
      { sep: true },
      { texte: 'Nouvelle session', icone: ICONES.plus, action: () => { etat.session = null; rendre() } },
    ]
  } else if (cle.startsWith('chemin:')) {
    const chemin = cle.slice(7)
    const freres = index.get(parent(chemin))?.enfants ?? []
    entrees = [
      { petit: `${libelle(index.get(parent(chemin)))}/` },
      ...freres.map((n) => ({
        texte: libelle(n),
        icone: n.type === 'dossier' ? ICONES.dossier : iconeFichier(n.fichier),
        coche: n.chemin === chemin,
        action: () => choisirChemin(n.chemin),
      })),
    ]
  }
  ouvrirMenu(b, entrees)
})

function ouvrirMenu(ancre, entrees) {
  document.querySelector('.menu-flottant')?.remove()
  const r = ancre.getBoundingClientRect()
  const menu = document.createElement('div')
  menu.className = 'menu-flottant'
  menu.style.left = `${Math.min(r.left, innerWidth - 300)}px`
  menu.style.top = `${r.bottom + 4}px`
  menu.innerHTML = entrees
    .map((e, i) => {
      if (e.sep) return '<hr>'
      if (e.petit) return `<div class="petit">${echapper(e.petit)}</div>`
      return `<button type="button" data-i="${i}">${e.icone ?? ''}<span class="txt">${echapper(e.texte)}</span>${e.coche ? '<span class="coche">✓</span>' : e.meta ? `<span class="coche" style="font-size:11px;color:var(--texte-3)">${e.meta}</span>` : ''}</button>`
    })
    .join('')
  document.body.append(menu)
  const fermer = (ev) => {
    if (ev && menu.contains(ev.target)) return
    menu.remove()
    document.removeEventListener('mousedown', fermer)
  }
  setTimeout(() => document.addEventListener('mousedown', fermer))
  menu.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-i]')
    if (!b) return
    fermer()
    entrees[Number(b.dataset.i)].action()
  })
}

// ── Barre latérale ───────────────────────────────────────────

function rendreLaterale() {
  if (!etat.projet) {
    laterale.innerHTML = '<p class="indice">Choisissez un projet dans les colonnes ou dans le fil d’Ariane : ses sessions s’afficheront ici.</p>'
    return
  }
  laterale.innerHTML = `<button type="button" class="nouvelle-session">${ICONES.plus} Nouvelle recherche</button>
    <nav class="sessions-liste">${htmlListeSessions(sessionsDu(etat.projet), etat.session)}</nav>`
  laterale.querySelector('.nouvelle-session').addEventListener('click', () => { etat.session = null; rendre() })
  laterale.querySelector('.sessions-liste').addEventListener('click', (e) => {
    const a = e.target.closest('[data-session]')
    if (!a) return
    e.preventDefault()
    ouvrirSession(a.dataset.session)
  })
}

// ── Centre : colonnes d'accueil ou conversation ──────────────

function rendreCentre() {
  if (etat.session) {
    const s = session(etat.session)
    centre.innerHTML = `<header class="conv-tete"><div class="conv-titres">
        <h1 class="conv-titre">${echapper(s.titre)}</h1><div class="conv-sous">${s.statut === 'en_cours' ? 'en cours' : 'terminée'} · ${dateRelative(s.modifie)} · <code>sessions/${s.id}</code></div></div></header>
      <div class="fil"><div class="fil-contenu">${htmlFil(s)}</div></div>
      <div class="bas">${htmlArbreAgents(s, { ouvert: false })}${htmlSaisie()}</div>`
    brancherLiensFichiers(centre, choisirChemin)
    return
  }
  centre.innerHTML = `<div class="centre-miller"><div class="miller"></div></div>
    ${etat.projet ? `<div class="bas" style="padding-top:12px">${htmlSaisie({ placeholder: `Nouvelle recherche dans « ${projet(etat.projet).court} »…` })}</div>` : ''}`
  rendreColonnesAccueil()
}

function rendreColonnesAccueil() {
  const miller = centre.querySelector('.miller')
  if (!miller) return
  const p = etat.survolProjet
  const s = etat.survolSession
  const colProjets = `<div class="colonne"><div class="colonne-tete">Projets</div><div class="colonne-corps">${PROJETS.map(
    (x) => `<button type="button" class="entree${x.id === p ? ' choisie' : ''}" data-projet="${x.id}">${ICONES.projet}<span class="txt">${echapper(x.nom)}</span><span class="fl">▶</span></button>`,
  ).join('')}</div></div>`
  const colSessions = p
    ? `<div class="colonne"><div class="colonne-tete">Sessions · ${echapper(projet(p).court)}</div><div class="colonne-corps">${sessionsDu(p)
        .map((x) => `<button type="button" class="entree${x.id === s ? ' choisie' : ''}" data-session="${x.id}">${ICONES.session}<span class="txt">${echapper(x.titre)}</span><span class="fl">▶</span></button>`)
        .join('')}</div></div>`
    : ''
  let resume = ''
  if (s) {
    const x = session(s)
    const agents = [...new Set(fichiersDeSession(s).map((f) => f.agent))].map((a) => AGENTS[a].libelle).join(', ')
    resume = `<div class="colonne resume"><div class="resume-corps">
      <h2>${echapper(x.titre)}</h2><p>${echapper(x.messages[0].texte)}</p>
      <dl><dt>État</dt><dd>${x.statut === 'en_cours' ? 'en cours' : 'terminée'}</dd><dt>Modifiée</dt><dd>${dateRelative(x.modifie)}</dd>
      <dt>Fichiers</dt><dd>${fichiersDeSession(s).length}</dd><dt>Auteurs</dt><dd>${agents}</dd>
      <dt>Dossier</dt><dd><code>${x.projet}/sessions/${x.id}</code></dd></dl>
      <button type="button" class="principal" data-ouvrir="${x.id}">Ouvrir la session</button></div></div>`
  } else if (p) {
    const x = projet(p)
    resume = `<div class="colonne resume"><div class="resume-corps"><h2>${echapper(x.nom)}</h2><p>${echapper(x.description)}</p>
      <dl><dt>Sessions</dt><dd>${sessionsDu(p).length}</dd><dt>Graphe</dt><dd>${x.graphe.noeuds} nœuds, ${x.graphe.etablis} établis</dd></dl>
      ${etat.projet === p ? '<p style="font-size:12.5px">Choisissez une session pour la résumer.</p>' : `<button type="button" class="principal" data-ouvrir-projet="${p}">Ouvrir le projet</button>`}</div></div>`
  } else {
    resume = '<div class="colonne resume"><div class="resume-corps"><p>Choisissez un projet, puis une session.</p></div></div>'
  }
  miller.innerHTML = colProjets + colSessions + resume
}

centre.addEventListener('click', (e) => {
  const t = e.target
  const bp = t.closest('[data-projet]')
  const bs = t.closest('.miller [data-session]')
  const o = t.closest('[data-ouvrir]')
  const op = t.closest('[data-ouvrir-projet]')
  if (o) return ouvrirSession(o.dataset.ouvrir)
  if (op) return ouvrirProjet(op.dataset.ouvrirProjet)
  if (bp) {
    etat.survolProjet = bp.dataset.projet
    etat.survolSession = null
    // Choisir un projet dans les colonnes l'ouvre : barre latérale et Documents suivent.
    if (etat.projet !== bp.dataset.projet) return ouvrirProjet(bp.dataset.projet)
    return rendreColonnesAccueil()
  }
  if (bs) {
    etat.survolSession = bs.dataset.session
    rendreColonnesAccueil()
  }
})
centre.addEventListener('dblclick', (e) => {
  const bs = e.target.closest('.miller [data-session]')
  if (bs) ouvrirSession(bs.dataset.session)
})

// ── Documents : Finder en colonnes ───────────────────────────

function rendreFinder() {
  const vue = panneau.vues.documents
  const sel = etat.selection && index.has(etat.selection) ? etat.selection : null
  // Chaîne de dossiers ouverts, de la racine au dossier de la sélection.
  const chaine = [racine]
  if (sel) {
    const relatif = racine.chemin ? sel.slice(racine.chemin.length + 1) : sel
    const parties = relatif.split('/')
    let courant = racine.chemin
    for (const p of parties) {
      courant = courant ? `${courant}/${p}` : p
      chaine.push(index.get(courant))
    }
  }
  const dernier = chaine.at(-1)
  const dossiers = dernier.type === 'fichier' ? chaine.slice(0, -1) : chaine
  const colonnes = dossiers.map((d, i) => {
    const choisi = chaine[i + 1]?.chemin
    const corps = d.enfants.length
      ? d.enfants
          .map((n) => {
            const cls = ['entree', n.chemin === choisi ? 'choisie' : '', n.type === 'fichier' ? 'feuille' : '', n.nom.startsWith('.') ? 'cache' : ''].join(' ')
            const ico = n.type === 'dossier' ? ICONES.dossier : iconeFichier(n.fichier)
            const droite = n.type === 'dossier' ? (estSession(n) ? `<span class="meta">${n.nom}</span>` : '<span class="fl">▶</span>') : `<span class="meta">${tailleLisible(n.fichier.taille)}</span>`
            return `<button type="button" class="${cls}" data-chemin="${echapper(n.chemin)}" title="${echapper(n.chemin)}">${ico}<span class="txt">${echapper(libelle(n))}</span>${droite}</button>`
          })
          .join('')
      : '<p class="vide">Dossier vide</p>'
    const titre = i === 0 ? `${RACINE_AFFICHEE}${racine.chemin ? '/' + racine.chemin : ''}` : libelle(d)
    return `<div class="colonne"><div class="colonne-tete" title="${echapper(titre)}">${echapper(titre)}</div><div class="colonne-corps">${corps}</div></div>`
  })
  vue.innerHTML = `<div class="miller">${colonnes.join('')}<div class="colonne apercu-col"></div></div>`
  const colApercu = vue.querySelector('.apercu-col')
  if (dernier.type === 'fichier') {
    const f = dernier.fichier
    afficherApercu(colApercu, f, { chemin: f.chemin.slice(racine.chemin ? racine.chemin.length + 1 : 0) })
  } else {
    afficherApercu(colApercu, null, { vide: `<div>${dernier.enfants.length} élément${dernier.enfants.length > 1 ? 's' : ''} dans <b>${echapper(libelle(dernier))}</b>.<br><small>Choisissez un fichier pour l’afficher ici.</small></div>` })
  }
  const miller = vue.querySelector('.miller')
  miller.scrollLeft = miller.scrollWidth
}

panneau.vues.documents.addEventListener('click', (e) => {
  const b = e.target.closest('.entree[data-chemin]')
  if (b) choisirChemin(b.dataset.chemin)
})

lireAncre()
if (etat.session) etat.selection = `${etat.projet}/sessions/${etat.session}`
rendre()
