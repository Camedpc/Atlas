// 07 · Palette de commandes. Ctrl+K est la navigation principale : une recherche floue unique sur les projets, les
// sessions, les fichiers et les commandes (préfixes « # » sessions, « / » fichiers, « > » commandes).
// À l'ouverture, la palette est déjà là, sur les projets. Autour, une interface minimale ; Ctrl+P filtre les fichiers.
import { PROJETS, SESSIONS, dateRelative, projet, session, sessionsDu } from '../../commun/donnees.js'
import { FICHIERS, ICONES, arbre, fichier, fichiersDuProjet, iconeFichier, libelleSegment, monterArbo } from '../../commun/bunker.js'
import { afficherApercu } from '../../commun/apercu.js'
import {
  brancherLiensFichiers, echapper, htmlArbreAgents, htmlFil, htmlListeSessions, htmlSaisie, monterBarre, monterPanneauDroit,
} from '../../commun/ui.js'

monterBarre()
const app = document.querySelector('#app')
const etat = { projet: null, session: null, fichier: null, filtre: '' }
let panneau = null
let arbo = null

// ── Recherche floue ─────────────────────────────────────────

const normaliser = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Sous-séquence de `requete` dans `texte` : { score, indices } ou null. Bonus aux débuts de mots et aux suites. */
function flou(requete, texte) {
  const q = normaliser(requete.replace(/\s+/g, ''))
  if (!q) return { score: 0, indices: [] }
  const t = normaliser(texte)
  if (t.length !== texte.length) return null
  const indices = []
  let score = 0
  let j = 0
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (t[i] !== q[j]) continue
    const debutMot = i === 0 || /[\s\-_/.·(]/.test(t[i - 1])
    const suite = indices.length && indices.at(-1) === i - 1
    score += 1 + (debutMot ? 3 : 0) + (suite ? 2 : 0)
    if (indices.length && !suite) score -= Math.min(3, (i - indices.at(-1)) / 6)
    indices.push(i)
    j++
  }
  if (j < q.length) return null
  if (t.includes(q)) score += 6
  return { score, indices }
}

function surligner(texte, indices) {
  if (!indices?.length) return echapper(texte)
  const set = new Set(indices)
  return [...texte].map((c, i) => (set.has(i) ? `<mark>${echapper(c)}</mark>` : echapper(c))).join('')
}

// ── Éléments de la palette ──────────────────────────────────

const COMMANDES = [
  { libelle: 'Aller à Documents', detail: 'panneau de droite', faire: () => panneau?.choisir('documents'), projet: true },
  { libelle: 'Aller au graphe de raisonnement', detail: 'panneau de droite', faire: () => panneau?.choisir('raisonnement'), projet: true },
  { libelle: 'Aller à l’agent graph', detail: 'panneau de droite', faire: () => panneau?.choisir('agents'), projet: true },
  { libelle: 'Filtrer les fichiers', detail: 'Ctrl P', faire: () => focaliserFiltre(), projet: true },
  { libelle: 'Nouvelle recherche', detail: 'dans le projet courant', faire: () => ouvrirSession(null), projet: true },
  { libelle: 'Changer de projet', detail: '', faire: () => setTimeout(() => ouvrirPalette('')), garder: true },
]

function elements() {
  const courant = etat.projet
  return {
    projets: PROJETS.map((p) => ({
      type: 'projet', texte: p.nom, ico: ICONES.projet,
      detail: `${sessionsDu(p.id).length} sessions · ${dateRelative(sessionsDu(p.id)[0]?.modifie ?? p.cree)}${p.id === courant ? ' · actuel' : ''}`,
      faire: () => choisirProjet(p.id),
    })),
    sessions: [...SESSIONS].sort((a, b) => (a.projet === courant) === (b.projet === courant) ? b.modifie.localeCompare(a.modifie) : a.projet === courant ? -1 : 1).map((s) => ({
      type: 'session', texte: s.titre, ico: ICONES.session, bonus: s.projet === courant ? 2 : 0,
      detail: `${projet(s.projet).court} · ${s.statut === 'en_cours' ? 'en cours · ' : ''}${dateRelative(s.modifie)}`,
      faire: () => { if (s.projet !== etat.projet) choisirProjet(s.projet, { palette: false }); ouvrirSession(s.id) },
    })),
    fichiers: FICHIERS.map((f) => ({
      type: 'fichier', chemin: f.chemin, texte: f.nom, secondaire: f.relatif, ico: iconeFichier(f), bonus: f.projet === courant ? 2 : 0, mono: true,
      detail: `${projet(f.projet).court} › ${f.session ? session(f.session).titre : 'projet'} › ${f.relatif}`,
      faire: () => ouvrirFichier(f.chemin),
    })),
    commandes: COMMANDES.filter((c) => !c.projet || courant).map((c) => ({ type: 'commande', texte: c.libelle, detail: c.detail, ico: '›', faire: c.faire, garder: c.garder })),
  }
}

function resultats(saisie) {
  const tout = elements()
  let q = saisie.trim()
  let sections
  const prefixe = q[0]
  if (prefixe === '#') { sections = [['Sessions', tout.sessions]]; q = q.slice(1) }
  else if (prefixe === '/') { sections = [['Fichiers', tout.fichiers]]; q = q.slice(1) }
  else if (prefixe === '>') { sections = [['Commandes', tout.commandes]]; q = q.slice(1) }
  else if (!q && !etat.projet) sections = [['Projets', tout.projets]]
  else if (!q) {
    const recents = fichiersDuProjet(etat.projet).sort((a, b) => b.modifie.localeCompare(a.modifie)).slice(0, 5).map((f) => f.chemin)
    sections = [
      ['Sessions du projet', tout.sessions.filter((s) => s.bonus)],
      ['Fichiers récents', tout.fichiers.filter((e) => recents.includes(e.chemin))],
      ['Projets', tout.projets],
      ['Commandes', tout.commandes],
    ]
  } else sections = [['Projets', tout.projets], ['Sessions', tout.sessions], ['Fichiers', tout.fichiers], ['Commandes', tout.commandes]]
  const vide = !q.trim()
  return sections
    .map(([titre, liste]) => {
      const trouves = liste
        .map((e) => {
          if (vide) return { ...e, score: 0, indices: [] }
          const m = flou(q, e.texte)
          if (m) return { ...e, score: m.score + (e.bonus ?? 0), indices: m.indices }
          const m2 = e.secondaire && flou(q, e.secondaire)
          return m2 ? { ...e, score: m2.score / 2 + (e.bonus ?? 0), indices: [] } : null
        })
        .filter(Boolean)
      if (!vide) trouves.sort((a, b) => b.score - a.score)
      return [titre, trouves.slice(0, vide && titre !== 'Sessions' ? 8 : 7)]
    })
    .filter(([, l]) => l.length)
    .sort((a, b) => (vide ? 0 : b[1][0].score - a[1][0].score))
}

// ── Palette ─────────────────────────────────────────────────

let palette = null

function ouvrirPalette(saisieInitiale = '') {
  fermerPalette()
  palette = document.createElement('div')
  palette.className = 'voile palette-voile'
  palette.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="Palette de commandes">
    <div class="palette-champ">${ICONES.recherche}<input type="text" spellcheck="false" autocomplete="off"
      placeholder="Projet, session, fichier… ( # sessions · / fichiers · > commandes )"><span class="portee"></span></div>
    <div class="palette-resultats" role="listbox"></div>
    <div class="palette-pied"><span><kbd>↑</kbd><kbd>↓</kbd> choisir</span><span><kbd>Entrée</kbd> ouvrir</span>
      <span><kbd>#</kbd> sessions</span><span><kbd>/</kbd> fichiers</span><span><kbd>&gt;</kbd> commandes</span>
      ${etat.projet ? '<span style="margin-left:auto"><kbd>Échap</kbd> fermer</span>' : ''}</div></div>`
  document.body.append(palette)
  const champ = palette.querySelector('input')
  const zone = palette.querySelector('.palette-resultats')
  let liste = []
  let curseur = 0
  const rendre = () => {
    const sections = resultats(champ.value)
    liste = sections.flatMap(([, l]) => l)
    curseur = Math.min(curseur, Math.max(0, liste.length - 1))
    let k = 0
    zone.innerHTML = sections.length
      ? sections.map(([titre, l]) => `<h4>${titre}</h4>${l.map((e) => `<div class="resultat${k === curseur ? ' curseur' : ''}" data-k="${k++}" role="option">
          <span class="ico">${e.ico}</span><span class="libelle">${surligner(e.texte, e.indices)}</span>
          <span class="detail${e.mono ? ' mono' : ''}">${echapper(e.detail ?? '')}</span><span class="entree">Entrée ↵</span></div>`).join('')}`).join('')
      : '<div class="palette-vide">Aucun résultat.</div>'
    palette.querySelector('.portee').textContent = etat.projet ? projet(etat.projet).court : 'aucun projet'
  }
  const deplacer = (d) => {
    if (!liste.length) return
    curseur = (curseur + d + liste.length) % liste.length
    zone.querySelectorAll('.resultat').forEach((r) => r.classList.toggle('curseur', Number(r.dataset.k) === curseur))
    zone.querySelector('.curseur')?.scrollIntoView({ block: 'nearest' })
  }
  const valider = (e) => {
    if (!e) return
    if (!e.garder) fermerPalette()
    e.faire()
  }
  champ.addEventListener('input', () => { curseur = 0; rendre() })
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); deplacer(1) }
    if (e.key === 'ArrowUp') { e.preventDefault(); deplacer(-1) }
    if (e.key === 'Enter') { e.preventDefault(); valider(liste[curseur]) }
  })
  zone.addEventListener('mousemove', (e) => {
    const r = e.target.closest('.resultat')
    if (r && Number(r.dataset.k) !== curseur) deplacer(Number(r.dataset.k) - curseur)
  })
  zone.addEventListener('click', (e) => {
    const r = e.target.closest('.resultat')
    if (r) valider(liste[Number(r.dataset.k)])
  })
  palette.addEventListener('mousedown', (e) => { if (e.target === palette && etat.projet) fermerPalette() })
  champ.value = saisieInitiale
  rendre()
  champ.focus()
  champ.setSelectionRange(champ.value.length, champ.value.length)
}

function fermerPalette() {
  palette?.remove()
  palette = null
}

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    palette && etat.projet ? fermerPalette() : ouvrirPalette('')
  } else if (mod && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    etat.projet ? (fermerPalette(), focaliserFiltre()) : ouvrirPalette('')
  } else if (e.key === 'Escape' && palette && etat.projet) {
    fermerPalette()
  }
})

// ── Interface autour ────────────────────────────────────────

function rendreCoquille() {
  const p = projet(etat.projet)
  app.innerHTML = `<div class="trois-colonnes">
    <aside class="laterale">
      <div class="laterale-tete">
        <button type="button" class="tete-projet" title="Changer de projet (Ctrl K)">
          <span class="nom${p ? '' : ' vide-projet'}">${p ? echapper(p.nom) : 'Aucun projet'}</span><kbd>Ctrl K</kbd></button>
      </div>
      <nav class="sessions-liste"></nav>
      <div class="raccourcis">
        <div><span>Tout chercher</span><kbd>Ctrl K</kbd></div>
        <div><span>Sessions</span><span><kbd>Ctrl K</kbd> <kbd>#</kbd></span></div>
        <div><span>Filtrer les fichiers</span><kbd>Ctrl P</kbd></div>
        <div><span>Commandes</span><span><kbd>Ctrl K</kbd> <kbd>&gt;</kbd></span></div>
      </div>
    </aside>
    <main class="conversation"></main>
    <section class="panneau"></section>
  </div>`
  app.querySelector('.tete-projet').addEventListener('click', () => ouvrirPalette(''))
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
    ? `<h3>Sessions</h3>${htmlListeSessions(sessionsDu(etat.projet), etat.session).replace(/<h3>[^<]*<\/h3>/g, '')}`
    : ''
}

function rendreConversation() {
  const zone = app.querySelector('.conversation')
  const p = projet(etat.projet)
  if (!p) {
    zone.innerHTML = '<div class="invite"><div><b>Atlas</b><br>Choisissez un projet dans la palette.<br><kbd>Ctrl K</kbd></div></div>'
    return
  }
  if (!etat.session) {
    zone.innerHTML = `<div class="fil"><div class="invite"><div><b>${echapper(p.nom)}</b><br>Nouvelle recherche : écrivez ci-dessous.<br>
      Reprendre une session : <kbd>Ctrl K</kbd> puis <kbd>#</kbd>.</div></div></div>
      <div class="bas">${htmlSaisie({ placeholder: `Nouvelle recherche dans « ${p.court} »…`, aide: '<kbd>Ctrl K</kbd> pour naviguer' })}</div>`
    return
  }
  const s = session(etat.session)
  zone.innerHTML = `<header class="conv-tete"><div class="conv-titres">
      <h1 class="conv-titre">${echapper(s.titre)}</h1><div class="conv-sous">${echapper(p.court)} · ${s.statut === 'en_cours' ? 'en cours' : 'terminée'} · ${dateRelative(s.modifie)}</div></div></header>
    <div class="fil"><div class="fil-contenu">${htmlFil(s)}</div></div>
    <div class="bas">${htmlArbreAgents(s, { ouvert: false })}${htmlSaisie({ aide: '<kbd>Ctrl K</kbd> pour naviguer · <kbd>Ctrl P</kbd> fichiers' })}</div>`
  brancherLiensFichiers(zone, (chemin) => ouvrirFichier(chemin))
}

function choisirProjet(id, { palette: garderPalette = true } = {}) {
  const change = id !== etat.projet
  etat.projet = id
  if (change) {
    etat.session = null
    etat.fichier = null
    etat.filtre = ''
  }
  rendreCoquille()
  // Enchaînement naturel : projet choisi → ses sessions dans la palette.
  if (garderPalette) ouvrirPalette('#')
}

function ouvrirSession(id) {
  etat.session = id
  rendreSessions()
  rendreConversation()
  if (id && arbo) {
    arbo.options.ouverts.add(`${etat.projet}/sessions`)
    arbo.deplierVers(`${etat.projet}/sessions/${id}/directeurs/x`)
    if (!etat.filtre) arbo.redessiner()
  }
}

// ── Documents : filtre, arbre, aperçu ───────────────────────

function monterDocuments() {
  const vue = panneau.vues.documents
  if (!etat.projet) {
    vue.innerHTML = '<div class="apercu-vide">Aucun projet choisi.</div>'
    arbo = null
    return
  }
  vue.innerHTML = `<div class="docs7">
      <div class="docs7-gauche">
        <label class="docs7-filtre">${ICONES.recherche}<input type="text" spellcheck="false" placeholder="Filtrer les fichiers…"><kbd>Ctrl P</kbd></label>
        <div class="docs7-arbo"></div><div class="docs7-arbo docs7-plat" hidden></div>
      </div>
      <div class="docs7-apercu"></div></div>`
  const ouverts = new Set([`${etat.projet}/projet`, `${etat.projet}/sessions`])
  if (etat.session) ouverts.add(`${etat.projet}/sessions/${etat.session}`)
  arbo = monterArbo(vue.querySelector('.docs7-arbo'), {
    racine: arbre(`${etat.projet}/`),
    ouverts,
    libelle: (n) => (n.type === 'dossier' && n.chemin.split('/').at(-2) === 'sessions' ? libelleSegment(n.nom, 'sessions') : n.nom),
    surFichier: (f) => apercu(f),
  })
  const champ = vue.querySelector('.docs7-filtre input')
  const plat = vue.querySelector('.docs7-plat')
  champ.value = etat.filtre
  champ.addEventListener('input', () => { etat.filtre = champ.value; rendreFiltre() })
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') plat.querySelector('.ligne')?.click()
    if (e.key === 'Escape') { champ.value = ''; etat.filtre = ''; rendreFiltre(); champ.blur() }
  })
  plat.addEventListener('click', (e) => {
    const l = e.target.closest('[data-fichier]')
    if (l) apercu(fichier(l.dataset.fichier))
  })
  rendreFiltre()
  apercu(etat.fichier)
}

function rendreFiltre() {
  const vue = panneau.vues.documents
  const plat = vue.querySelector('.docs7-plat')
  const arbreEl = vue.querySelector('.docs7-arbo:not(.docs7-plat)')
  const q = etat.filtre.trim()
  plat.hidden = !q
  arbreEl.hidden = Boolean(q)
  if (!q) return
  const trouves = fichiersDuProjet(etat.projet)
    .map((f) => {
      const m = flou(q, f.nom)
      if (m) return { f, score: m.score + 5, indices: m.indices }
      // Sur le chemin, seulement une correspondance exacte : sinon trop de faux positifs.
      return normaliser(f.relatif).includes(normaliser(q)) ? { f, score: 1, indices: [] } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
  plat.innerHTML = trouves.length
    ? trouves.map(({ f, indices }) => `<div class="ligne${etat.fichier?.chemin === f.chemin ? ' choisie' : ''}" data-fichier="${f.chemin}">
        <span class="n">${surligner(f.nom, indices)}</span><span class="c">${echapper(f.session ? session(f.session).titre : 'projet')} › ${echapper(f.relatif)}</span></div>`).join('')
    : '<p class="vide">Aucun fichier.</p>'
}

function apercu(f) {
  etat.fichier = f
  const el = panneau.vues.documents.querySelector('.docs7-apercu')
  if (!el) return
  afficherApercu(el, f, { vide: 'Choisissez un fichier.<br><small><kbd>Ctrl P</kbd> pour filtrer, <kbd>Ctrl K</kbd> <kbd>/</kbd> pour chercher partout.</small>' })
  panneau.vues.documents.querySelectorAll('.docs7-plat .ligne').forEach((l) => l.classList.toggle('choisie', l.dataset.fichier === f?.chemin))
}

function focaliserFiltre() {
  panneau.choisir('documents')
  panneau.vues.documents.querySelector('.docs7-filtre input')?.focus()
}

function ouvrirFichier(chemin) {
  const f = fichier(chemin)
  if (f.projet !== etat.projet) {
    choisirProjet(f.projet, { palette: false })
    if (f.session) ouvrirSession(f.session)
  }
  panneau.choisir('documents')
  if (etat.filtre) {
    etat.filtre = ''
    panneau.vues.documents.querySelector('.docs7-filtre input').value = ''
    rendreFiltre()
  }
  arbo.choisir(chemin)
  apercu(f)
}

rendreCoquille()
ouvrirPalette('')
