// Composants d'interface partagés : barre du prototype, fil de conversation, arbre des agents, saisie,
// panneau de droite à trois onglets. Chaque proposition compose ces morceaux à sa façon.
import { OPTIONS, optionCourante } from './options.js'
import { AGENTS, ICONES, echapper, fichierDeSession, fichiersDeSession } from './bunker.js'
import { markdownVersHtml } from './apercu.js'
import { groupeDate } from './donnees.js'

/** Barre fine en haut de chaque option : retour au catalogue, numéro, titre, précédente / suivante. */
export function monterBarre() {
  const i = optionCourante()
  const o = OPTIONS[i]
  const prec = OPTIONS[(i + OPTIONS.length - 1) % OPTIONS.length]
  const suiv = OPTIONS[(i + 1) % OPTIONS.length]
  const barre = document.createElement('header')
  barre.className = 'proto-barre'
  barre.innerHTML = `
    <a href="../../index.html">← Propositions</a>
    <span class="num">${String(i + 1).padStart(2, '0')} / ${OPTIONS.length}</span>
    <span class="titre">${echapper(o.titre)}</span>
    <span class="idee">${echapper(o.idee)}</span>
    <span class="espace"></span>
    <span class="nav">
      <a href="../${prec.dossier}/index.html" title="${echapper(prec.titre)}">← Précédente</a>
      <a href="../${suiv.dossier}/index.html" title="${echapper(suiv.titre)}">Suivante →</a>
    </span>`
  document.body.classList.add('proto')
  document.body.prepend(barre)
  document.title = `${String(i + 1).padStart(2, '0')} · ${o.titre} — Atlas`
}

/**
 * HTML du fil d'une session. Les chemins de fichiers cités (entre accents graves ou dans `fichier`) deviennent des
 * boutons `.lien-fichier[data-fichier]` : à la proposition de brancher le clic (voir brancherLiensFichiers).
 */
export function htmlFil(s) {
  const lien = (relatif) => {
    const f = fichierDeSession(s.id, relatif)
    return f ? `<button type="button" class="lien-fichier" data-fichier="${f.chemin}" title="Ouvrir dans Documents">${echapper(f.nom)}</button>` : `<code>${echapper(relatif)}</code>`
  }
  const lierCodes = (html) =>
    html.replace(/<code>([^<]+\.[a-z]{2,4})<\/code>/g, (tout, chemin) => (fichierDeSession(s.id, chemin) ? lien(chemin) : tout))
  return s.messages
    .map((m) => {
      if (m.role === 'utilisateur') return `<div class="msg utilisateur"><div class="bulle">${echapper(m.texte)}</div></div>`
      if (m.role === 'assistant') return `<div class="msg assistant">${lierCodes(markdownVersHtml(m.texte))}</div>`
      if (m.role === 'outil')
        return `<div class="msg outil"><span class="etiquette">outil</span><code>${m.nom}</code> · ${echapper(m.resume)}${m.fichier ? ' · ' + lien(m.fichier) : ''}</div>`
      return `<div class="msg agent"><span class="etiquette">agent</span>${echapper(m.texte)}${m.fichier ? ' · ' + lien(m.fichier) : ''}</div>`
    })
    .join('')
}

/** Branche le clic sur les `.lien-fichier` d'un conteneur. */
export function brancherLiensFichiers(el, surFichier) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.lien-fichier')
    if (b) surFichier(b.dataset.fichier)
  })
}

/**
 * Arbre des agents d'une session, déduit de ses fichiers : orchestrateur → directeurs (→ littérature,
 * expérimentateur), graphiste, vérificateur. Chaque agent porte ses fichiers.
 */
export function agentsDeSession(s) {
  const fichiers = fichiersDeSession(s.id)
  const directeurs = [...new Set(fichiers.filter((f) => f.directeur).map((f) => f.directeur))].sort()
  const racine = { role: 'orchestrateur', nom: 'orchestrateur', etat: s.statut === 'en_cours' ? 'en_cours' : 'termine', fichiers: fichiers.filter((f) => f.agent === 'orchestrateur'), enfants: [] }
  directeurs.forEach((d, i) => {
    const siens = fichiers.filter((f) => f.directeur === d)
    const enCours = s.statut === 'en_cours' && i === directeurs.length - 1
    const dir = { role: 'directeur_de_labo', nom: 'directeur_de_labo', tache: d, etat: enCours ? 'en_cours' : 'termine', fichiers: siens.filter((f) => f.agent === 'directeur_de_labo'), enfants: [] }
    for (const role of ['litterature', 'experimentateur']) {
      const f = siens.filter((x) => x.agent === role)
      if (f.length || (role === 'litterature' && enCours)) dir.enfants.push({ role, nom: role, tache: d, etat: enCours && role === 'litterature' ? 'en_cours' : 'termine', fichiers: f, enfants: [] })
    }
    racine.enfants.push(dir)
  })
  for (const role of ['graphiste', 'verificateur']) {
    const f = fichiers.filter((x) => x.agent === role)
    if (f.length) racine.enfants.push({ role, nom: role, etat: 'termine', fichiers: f, enfants: [] })
  }
  return racine
}

/** Liste à plat (avec préfixes ├─ └─) de l'arbre des agents. */
export function aplatirAgents(racine) {
  const lignes = []
  const visiter = (n, prefixe, dernier, profondeur) => {
    lignes.push({ n, prefixe: profondeur === 0 ? '' : prefixe + (dernier ? '└─ ' : '├─ ') })
    const suite = profondeur === 0 ? '' : prefixe + (dernier ? '   ' : '│  ')
    n.enfants.forEach((e, i) => visiter(e, suite, i === n.enfants.length - 1, profondeur + 1))
  }
  visiter(racine, '', true, 0)
  return lignes
}

/** HTML de l'arbre des agents (au-dessus de la saisie). `cliquable` ajoute data-agent pour filtrer. */
export function htmlArbreAgents(s, { cliquable = false, ouvert = true, choisi = null } = {}) {
  const lignes = aplatirAgents(agentsDeSession(s))
  const actifs = lignes.filter((l) => l.n.etat === 'en_cours').length
  return `<details class="arbre-agents" ${ouvert ? 'open' : ''}>
    <summary>Agents <span>${lignes.length} · ${actifs ? `${actifs} en cours` : 'tous terminés'}</span></summary>
    <ul>${lignes
      .map(({ n, prefixe }, i) => {
        const cle = `${n.role}|${n.tache ?? ''}`
        return `<li class="e-${n.etat}${cliquable ? ' cliquable' : ''}${choisi === cle ? ' choisi' : ''}" ${cliquable ? `data-agent="${cle}"` : ''} data-i="${i}">
        <span class="prefixe">${prefixe}</span><span class="symbole">${n.etat === 'termine' ? '✓' : '●'}</span>
        <span class="nom">${n.nom}</span>${n.tache ? `<span class="tache">${n.tache}</span>` : ''}
        <span class="mesure">${n.fichiers.length ? `${n.fichiers.length} fichier${n.fichiers.length > 1 ? 's' : ''}` : ''}</span></li>`
      })
      .join('')}</ul></details>`
}

/** HTML de la zone de saisie. `avant` s'insère au-dessus du textarea (puces de contexte…). */
export function htmlSaisie({ placeholder = 'Poser une question de recherche…', avant = '', aide = '' } = {}) {
  return `<div class="saisie">${avant}<textarea rows="2" placeholder="${placeholder}"></textarea>
    <div class="saisie-pied"><span class="aide">${aide}</span><span class="espace"></span>
    <button type="button" class="envoyer" title="Envoyer (prototype : sans effet)">${ICONES.envoyer}</button></div></div>`
}

/** Liste des sessions groupées par date (barre latérale). */
export function htmlListeSessions(sessions, courante) {
  let dernier = ''
  const html = []
  for (const s of sessions) {
    const g = groupeDate(s.modifie)
    if (g !== dernier) {
      html.push(`<h3>${g}</h3>`)
      dernier = g
    }
    html.push(`<a class="session${s.id === courante ? ' active' : ''}" data-session="${s.id}" href="#" title="${echapper(s.titre)}">
      <span class="session-titre">${echapper(s.titre)}</span>${s.statut === 'en_cours' ? '<span class="session-statut">en cours</span>' : ''}</a>`)
  }
  return html.join('') || '<p class="vide">Aucune session dans ce projet.</p>'
}

export const ONGLETS = [
  { id: 'raisonnement', libelle: 'Graphe de raisonnement' },
  { id: 'agents', libelle: 'Agent graph' },
  { id: 'documents', libelle: 'Documents' },
]

/**
 * Monte le panneau de droite dans `el` : en-tête à onglets + trois vues. Les deux premières sont factices,
 * la vue Documents est renvoyée vide pour que la proposition la remplisse.
 * Renvoie { vues: {raisonnement, agents, documents}, outils (zone à droite des onglets), choisir(id), actif }.
 */
export function monterPanneauDroit(el, { initial = 'raisonnement', surChangement, libelles = {} } = {}) {
  el.classList.add('droit')
  el.innerHTML = `<header class="droit-tete">
      <div class="onglets" role="tablist">${ONGLETS.map((o) => `<button type="button" role="tab" data-vue="${o.id}">${libelles[o.id] ?? o.libelle}</button>`).join('')}</div>
      <div class="droit-outils" style="display:flex;align-items:center;gap:8px;margin-left:auto;min-width:0"></div>
    </header>
    <div class="vue" data-vue="raisonnement"><div class="vue-factice"><div>Graphe de raisonnement<br><small>emplacement factice : nœuds = assertions, liaisons = démonstrations</small></div></div></div>
    <div class="vue" data-vue="agents"><div class="vue-factice"><div>Agent graph<br><small>emplacement factice : orchestrateur, directeurs et sous-agents</small></div></div></div>
    <div class="vue" data-vue="documents"></div>`
  const vues = Object.fromEntries([...el.querySelectorAll('.vue')].map((v) => [v.dataset.vue, v]))
  const panneau = {
    vues,
    outils: el.querySelector('.droit-outils'),
    actif: null,
    choisir(id) {
      panneau.actif = id
      el.querySelectorAll('.onglets button').forEach((b) => b.classList.toggle('actif', b.dataset.vue === id))
      for (const [cle, v] of Object.entries(vues)) v.hidden = cle !== id
      surChangement?.(id)
    },
  }
  el.querySelector('.onglets').addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (b) panneau.choisir(b.dataset.vue)
  })
  panneau.choisir(initial)
  return panneau
}

export function libelleAgent(role) {
  return AGENTS[role]?.libelle ?? role
}

/** Petit utilitaire : crée un élément depuis du HTML. */
export function el(html) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild
}

export { echapper, ICONES }
