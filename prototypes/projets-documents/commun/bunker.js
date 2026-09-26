// Le bunker de Camille (espace/utilisateurs/camille/) : fichiers du manifeste, arborescence, icônes,
// et un composant d'arborescence réutilisable par les propositions.
import { MANIFESTE } from './manifeste.js'
import { projet, session } from './donnees.js'

export const RACINE_AFFICHEE = MANIFESTE.racine // « espace/utilisateurs/camille »

const BASE = new URL('./bunker/utilisateurs/camille/', import.meta.url)

/** Tous les fichiers, enrichis : nom, dossier, url, et le chemin relatif à la session s'il y en a une. */
export const FICHIERS = MANIFESTE.fichiers.map((f) => {
  const parties = f.chemin.split('/')
  const nom = parties.at(-1)
  const prefixeSession = f.session ? `${f.projet}/sessions/${f.session}/` : `${f.projet}/`
  return {
    ...f,
    nom,
    extension: nom.includes('.') ? nom.split('.').at(-1).toLowerCase() : '',
    dossier: parties.slice(0, -1).join('/'),
    url: new URL(f.chemin, BASE).href,
    relatif: f.chemin.slice(prefixeSession.length), // ex. directeurs/01-…/rapport.md
  }
})

export const fichier = (chemin) => FICHIERS.find((f) => f.chemin === chemin)

/** Retrouve un fichier cité par son chemin relatif à la session (ex. « directeurs/01-…/rapport.md »). */
export const fichierDeSession = (sessionId, relatif) =>
  FICHIERS.find((f) => f.session === sessionId && f.relatif === relatif)

export const fichiersDuProjet = (projetId) => FICHIERS.filter((f) => f.projet === projetId)
export const fichiersDeSession = (sessionId) => FICHIERS.filter((f) => f.session === sessionId)
export const fichiersDuProjetSeul = (projetId) => FICHIERS.filter((f) => f.projet === projetId && !f.session)

export const AGENTS = {
  camille: { libelle: 'Camille', court: 'Vous' },
  orchestrateur: { libelle: 'Orchestrateur', court: 'Orch.' },
  directeur_de_labo: { libelle: 'Directeur de labo', court: 'Directeur' },
  litterature: { libelle: 'Littérature', court: 'Litt.' },
  experimentateur: { libelle: 'Expérimentateur', court: 'Expé.' },
  graphiste: { libelle: 'Graphiste', court: 'Graphiste' },
  verificateur: { libelle: 'Vérificateur', court: 'Vérif.' },
}

export const GENRES = {
  markdown: 'Markdown',
  pdf: 'PDF',
  image: 'Image',
  code: 'Script',
  donnees: 'Données',
  json: 'JSON',
  texte: 'Texte',
}

export function tailleLisible(octets) {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(octets < 10240 ? 1 : 0).replace('.', ',')} Ko`
  return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
}

/** Libellé humain d'un segment de chemin : sessions et projets par leur titre. */
export function libelleSegment(segment, parent) {
  if (parent?.endsWith('/sessions') || parent === 'sessions') return session(segment)?.titre ?? segment
  if (!parent) return projet(segment)?.nom ?? segment
  return segment
}

/**
 * Arborescence sous un préfixe (« » pour tout le bunker, « hydrures/ » pour un projet…).
 * Nœud : { type: 'dossier', nom, chemin, enfants } ou { type: 'fichier', nom, chemin, fichier }.
 * Dossiers d'abord, puis fichiers, par ordre alphabétique ; les dossiers vides du bunker sont gardés.
 */
export function arbre(prefixe = '') {
  const racine = { type: 'dossier', nom: prefixe.replace(/\/$/, '').split('/').at(-1) || 'camille', chemin: prefixe.replace(/\/$/, ''), enfants: [] }
  const index = new Map([[racine.chemin, racine]])
  const dossier = (chemin) => {
    if (index.has(chemin)) return index.get(chemin)
    const parent = dossier(chemin.split('/').slice(0, -1).join('/'))
    const n = { type: 'dossier', nom: chemin.split('/').at(-1), chemin, enfants: [] }
    parent.enfants.push(n)
    index.set(chemin, n)
    return n
  }
  for (const d of MANIFESTE.dossiers_vides) if (d.startsWith(prefixe)) dossier(d)
  for (const f of FICHIERS) {
    if (!f.chemin.startsWith(prefixe)) continue
    dossier(f.dossier).enfants.push({ type: 'fichier', nom: f.nom, chemin: f.chemin, fichier: f })
  }
  const trier = (n) => {
    n.enfants.sort((a, b) => (a.type === b.type ? a.nom.localeCompare(b.nom, 'fr') : a.type === 'dossier' ? -1 : 1))
    n.enfants.forEach((e) => e.type === 'dossier' && trier(e))
  }
  trier(racine)
  return racine
}

export function compterFichiers(noeud) {
  if (noeud.type === 'fichier') return 1
  return noeud.enfants.reduce((s, e) => s + compterFichiers(e), 0)
}

// Icônes monochromes 16 px (trait 1.3).
const TRAIT = 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"'
export const ICONES = {
  dossier: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><path d="M2 4.5v8A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5V6.5A1.5 1.5 0 0 0 12.5 5H8L6.5 3H3.5A1.5 1.5 0 0 0 2 4.5z"/></svg>`,
  dossierOuvert: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><path d="M2 12.5V4.5A1.5 1.5 0 0 1 3.5 3h3L8 5h4.5A1.5 1.5 0 0 1 14 6.5V7"/><path d="M2 12.5 3.6 7.8A1.2 1.2 0 0 1 4.7 7h9.6a.8.8 0 0 1 .75 1.05L13.6 13a1.5 1.5 0 0 1-1.4 1H3.5A1.5 1.5 0 0 1 2 12.5z"/></svg>`,
  markdown: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M9.5 1.5V5H13M6 8.5h5M6 11h5"/></svg>`,
  pdf: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M9.5 1.5V5H13"/><text x="8.5" y="12.2" font-size="4.6" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="Inter,sans-serif">PDF</text></svg>`,
  image: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><circle cx="5.8" cy="6.2" r="1.2"/><path d="m2.5 12 3.5-3.5 2.5 2.5 2-2 3 3"/></svg>`,
  code: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5l3.5 3.5-3.5 3.5"/></svg>`,
  donnees: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6h12M2 9.5h12M6.5 2.5v11"/></svg>`,
  json: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><path d="M6 2.5c-1.5 0-2 .7-2 2v1.5c0 1-.5 2-1.5 2 1 0 1.5 1 1.5 2v1.5c0 1.3.5 2 2 2M10 2.5c1.5 0 2 .7 2 2v1.5c0 1 .5 2 1.5 2-1 0-1.5 1-1.5 2v1.5c0 1.3-.5 2-2 2"/></svg>`,
  texte: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M6 8h5M6 10.5h3"/></svg>`,
  session: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>`,
  projet: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`,
  epingle: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><path d="M9.5 2 14 6.5l-2 .5-2.5 2.5.5 3-1 1L6.5 11 3 14.5M6.5 11 2 6.5l1-1 3 .5L8.5 3.5z"/></svg>`,
  recherche: `<svg width="16" height="16" viewBox="0 0 16 16" ${TRAIT}><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M3 8h10"/></svg>`,
  replier: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="3" width="13" height="12" rx="2"/><path d="M7 3v12"/></svg>`,
  envoyer: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>`,
  fermer: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m3 3 8 8M11 3l-8 8"/></svg>`,
  externe: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 2h4v4M12 2 6.5 7.5M10 8.5V12H2V4h3.5"/></svg>`,
  choix: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m3.5 4.5 2.5-2.5 2.5 2.5M3.5 7.5 6 10l2.5-2.5"/></svg>`,
}

export const iconeFichier = (f) => ICONES[f.genre] ?? ICONES.texte

/**
 * Monte une arborescence cliquable (façon VS Code) dans `el`.
 * options : racine (nœud d'arbre), ouverts (Set de chemins dépliés), choisi (chemin), surFichier(f),
 *           libelle(noeud) → texte affiché, meta(noeud) → texte à droite, masquerRacine (bool, défaut vrai).
 * Renvoie { redessiner, choisir(chemin), deplierVers(chemin) }.
 */
export function monterArbo(el, options) {
  const definies = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined))
  const o = { ouverts: new Set(), masquerRacine: true, libelle: (n) => n.nom, meta: () => '', ...definies }
  el.classList.add('arbo')

  const ligne = (n, profondeur) => {
    const ouvert = n.type === 'dossier' && o.ouverts.has(n.chemin)
    const classes = ['arbo-ligne', ouvert ? 'ouvert' : '', o.choisi === n.chemin ? 'choisie' : '', n.nom.startsWith('.') ? 'cache' : '']
    const ico = n.type === 'dossier' ? (ouvert ? ICONES.dossierOuvert : ICONES.dossier) : iconeFichier(n.fichier)
    const vide = n.type === 'dossier' && n.enfants.length === 0
    return `<div class="${classes.join(' ')}" data-chemin="${n.chemin}" data-type="${n.type}" style="padding-left:${6 + profondeur * 14}px" title="${n.chemin}">
      <span class="chevron">${n.type === 'dossier' && !vide ? '▶' : ''}</span><span class="ico">${ico}</span>
      <span class="nom">${echapper(o.libelle(n))}</span><span class="meta">${o.meta(n) ?? ''}</span></div>`
  }
  const rendre = (n, profondeur) => {
    let html = ligne(n, profondeur)
    if (n.type === 'dossier' && o.ouverts.has(n.chemin)) for (const e of n.enfants) html += rendre(e, profondeur + 1)
    return html
  }
  const redessiner = () => {
    const r = o.racine
    el.innerHTML = o.masquerRacine ? r.enfants.map((e) => rendre(e, 0)).join('') : rendre(r, 0)
  }
  el.addEventListener('click', (e) => {
    const l = e.target.closest('.arbo-ligne')
    if (!l) return
    const chemin = l.dataset.chemin
    if (l.dataset.type === 'dossier') {
      o.ouverts.has(chemin) ? o.ouverts.delete(chemin) : o.ouverts.add(chemin)
      o.surDossier?.(chemin)
    } else {
      o.choisi = chemin
      o.surFichier?.(fichier(chemin))
    }
    redessiner()
  })
  const deplierVers = (chemin) => {
    const parties = chemin.split('/')
    for (let i = 1; i < parties.length; i++) o.ouverts.add(parties.slice(0, i).join('/'))
  }
  redessiner()
  return {
    redessiner,
    deplierVers,
    choisir(chemin) {
      o.choisi = chemin
      deplierVers(chemin)
      redessiner()
      el.querySelector('.choisie')?.scrollIntoView({ block: 'nearest' })
    },
    set racine(r) { o.racine = r; redessiner() },
    options: o,
  }
}

export function echapper(texte) {
  return String(texte).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
