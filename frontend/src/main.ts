// Atlas : sessions à gauche, conversation au centre (avec l'arbre des agents au-dessus de la saisie),
// et à droite le graphe de raisonnement ou l'agent graph.
import './style.css'
import './espaces.css'
import { AgentGraph } from './agentgraph'
import { api, type Graphe, type Noeud, type RolePremisse, type Statut, type Vue } from './api'
import { PanneauConversation } from './conversations'
import { VueDocuments } from './documents'
import { enLigne, formulesAffichees, nombre, rendreTex } from './formules'
import { VueGraphe } from './graphe'
import { jeuSynthetique, sceneSynthetique } from './graphe-synthetique'
import { AdaptateurVue } from './pilotage/adaptateurVue'
import { ClientRelais } from './pilotage/client'
import { nouvelId, Pilote } from './pilotage/pilote'
import type { CommandeBas } from './pilotage/protocole'
import { installerPoignees } from './redimension'
import { echapper, rendre } from './rendu'

const INTERVALLE_GRAPHE_MS = 4000
const CLE_VUE = 'atlas.vue'

type Onglet = 'raisonnement' | 'agents' | 'documents'

const LIBELLES_STATUT: Record<Statut, string> = {
  etabli: 'établi',
  suspendu: 'suspendu',
  a_verifier: 'à vérifier',
  invalide: 'invalide',
  ouvert: 'ouvert',
}
const LIBELLES_VALIDITE = { valide: 'vérifiée', a_verifier: 'à vérifier', invalide: 'refusée' } as const

// Développement : `?synthetique=1000` remplace le graphe par un jeu synthétique (lecture seule) pour éprouver la vue.
const SYNTHETIQUE = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('synthetique')) || 0 : 0

document.querySelector<HTMLElement>('#app')!.innerHTML = `
  <aside class="panneau-sessions"></aside>
  <main class="panneau-conversation"></main>
  <section class="panneau-droit">
    <header class="droit-tete">
      <button type="button" class="icone deplier-conversation" title="Afficher la conversation" aria-label="Afficher la conversation">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="3" width="13" height="12" rx="2"/><path d="M7 3v12"/></svg>
      </button>
      <div class="onglets" role="tablist">
        <button type="button" role="tab" data-vue="raisonnement">Graphe de raisonnement</button>
        <button type="button" role="tab" data-vue="agents">Agent graph</button>
        <button type="button" role="tab" data-vue="documents">Documents</button>
      </div>
      <div class="outils-raisonnement">
        <label><input type="checkbox" class="filtre" /> Cette conversation</label>
        <span class="compteur"></span>
        <button type="button" class="recentrer" title="Cadrer tout le graphe (Origine)">Recentrer</button>
        <button type="button" class="recharger">Recharger</button>
        <button type="button" class="aide-graphe" title="Commandes de la vue" aria-label="Commandes de la vue">?</button>
      </div>
    </header>
    <div class="vue vue-raisonnement">
      <div class="graphe"></div>
      <article class="detail" hidden></article>
    </div>
    <div class="vue vue-agents" hidden><div class="scene-agents"></div></div>
    <div class="vue vue-documents" hidden></div>
  </section>`

const detail = document.querySelector<HTMLElement>('.detail')!
const filtre = document.querySelector<HTMLInputElement>('.filtre')!
const compteur = document.querySelector<HTMLElement>('.compteur')!

let graphe: Graphe = { noeuds: [], aretes: [] }
let vue: Vue = { groupes: [], placements: [], etiquettes: [], marques: [] }
let conversationId: string | null = null
// Espace ouvert : chaque espace a son graphe.
let projetId: string | null = null
let dernierChargement = 0
// Nœud dont la fiche est ouverte (pilotage : P4 `fiche`).
let ficheId: string | null = null
// Adaptateur du pilotage (défini plus bas, seulement si un relais d'affichage est configuré).
let adaptateur: AdaptateurVue | undefined

const vueGraphe = new VueGraphe(document.querySelector<HTMLElement>('.graphe')!, {
  surOuvrir: afficherDetail,
  recharger: () => chargerGraphe(),
  surChangement: () => adaptateur?.apresImage(),
  chargerScene: SYNTHETIQUE ? sceneSynthetique : undefined,
})
// Développement : accès depuis la console (tests à la main, mesures d'images).
if (import.meta.env.DEV) (window as unknown as { atlasGraphe: VueGraphe }).atlasGraphe = vueGraphe

/** « Lemme 7 » : la référence du nœud dans la vue (son id en infobulle). */
function reference(id: string): string {
  const r = vueGraphe.reference(id)
  return r ? `${r.libelle} ${r.numero}` : id
}

/** Fiche d'un nœud (double-clic), composée comme un énoncé d'article (R41). */
function afficherDetail(n: Noeud | null) {
  ficheId = n?.id ?? null
  detail.hidden = !n
  // Les cadrages du pilotage évitent la fiche, posée par-dessus la droite du graphe.
  vueGraphe.margeDroite = n ? detail.offsetWidth + 12 : 0
  if (!n) return
  const lien = (id: string, role?: RolePremisse) =>
    `<button type="button" class="lien" data-id="${echapper(id)}" title="${echapper(id)}">${echapper(reference(id))}</button>`
    + (role && role !== 'principale' ? ` <span class="role">${role}</span>` : '')
  const liens = (ids: string[], roles?: Record<string, RolePremisse>) =>
    ids.length ? ids.map((id) => lien(id, roles?.[id])).join(' ') : '—'
  const ref = vueGraphe.reference(n.id)
  const tex = formulesAffichees(n.enonce)
  const texte = (v: unknown) => echapper(typeof v === 'string' ? v : JSON.stringify(v))
  const champs = n.details && typeof n.details === 'object'
    ? Object.entries(n.details)
      .filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => `<dt>${echapper(k)}</dt><dd>${Array.isArray(v) ? v.map(texte).join(' ; ') : texte(v)}</dd>`)
      .join('')
    : ''
  detail.innerHTML = `
    <button type="button" class="fermer" aria-label="Fermer">×</button>
    <h2 class="fiche-titre"><b>${echapper(ref ? `${ref.libelle} ${ref.numero}` : 'Énoncé')}</b> (${enLigne(n.nom)}).</h2>
    <p class="meta"><em>${LIBELLES_STATUT[n.statut]}</em> · <code>${echapper(n.id)}</code>${n.admis ? ' · admis' : ''}</p>
    ${tex ? `<div class="fiche-formule">${rendreTex(tex, n.enonce, true)}</div>` : ''}
    <div class="enonce">${rendre(n.enonce)}</div>
    ${champs ? `<dl class="fiche-details">${champs}</dl>` : ''}
    <p><strong>Prémisses :</strong> ${liens(n.parents)}</p>
    <p><strong>Utilisé par :</strong> ${liens(n.enfants)}</p>
    ${n.demonstrations
      .map(
        (d) => `<details class="demo" open>
          <summary>${echapper(d.nom_demonstration)} · <em>${LIBELLES_VALIDITE[d.validite]}</em>${
            d.confiance !== null ? ` · ${rendreTex(`c = ${nombre(d.confiance)}`, String(d.confiance))}` : ''} · ${echapper(d.auteur)}</summary>
          <p class="meta">Justifié par : ${liens(d.justifie_par, d.roles)}</p>
          <div>${rendre(d.demonstration)}</div>
        </details>`,
      )
      .join('')}`
  detail.querySelector('.fermer')!.addEventListener('click', () => vueGraphe.montrer(null))
  detail.querySelectorAll<HTMLButtonElement>('.lien').forEach((b) =>
    b.addEventListener('click', () => vueGraphe.montrer(b.dataset.id!)),
  )
}

function redessiner() {
  const visibles = vueGraphe.afficher(graphe, vue, filtre.checked ? conversationId : null)
  const nonPlaces = vueGraphe.nonPlaces
  compteur.textContent = `${visibles} nœuds${nonPlaces ? ` · ${nonPlaces} non placés` : ''}`
}

/** Relit le graphe et sa vue (cases, cadres) : ce que l'IA déplace apparaît à la lecture suivante. */
async function chargerGraphe() {
  dernierChargement = Date.now()
  const projet = projetId
  if (SYNTHETIQUE) {
    if (!graphe.noeuds.length) ({ graphe, vue } = jeuSynthetique(SYNTHETIQUE))
    vueGraphe.definirProjet(null, `Jeu synthétique de ${SYNTHETIQUE} nœuds : vue en lecture seule.`)
    redessiner()
    return
  }
  // Une lecture qui échoue (erreur réseau passagère du serveur vers Supabase) est retentée une fois.
  const lire = () => Promise.all([api.graphe(projet), api.vue(projet)])
  try {
    const [lu, luVue] = await lire().catch(async () => {
      await new Promise((r) => setTimeout(r, 400))
      return lire()
    })
    if (projet !== projetId) return // l'espace a changé pendant la lecture
    graphe = lu
    vue = luVue
    redessiner()
  } catch (e) {
    compteur.textContent = `Graphe indisponible : ${e instanceof Error ? e.message : String(e)}`
  }
}

filtre.addEventListener('change', redessiner)
document.querySelector('.recentrer')!.addEventListener('click', () => vueGraphe.recentrer())
document.querySelector('.recharger')!.addEventListener('click', () => void chargerGraphe())
document.querySelector('.aide-graphe')!.addEventListener('click', () => vueGraphe.basculerAide())

// ─── Onglets du panneau de droite ───

const documents = new VueDocuments(document.querySelector<HTMLElement>('.vue-documents')!)
const agentGraph = new AgentGraph(document.querySelector<HTMLElement>('.scene-agents')!, () => conversation.focaliser())

function montrer(vue: Onglet) {
  document.querySelectorAll<HTMLButtonElement>('.onglets [data-vue]').forEach((b) => {
    b.classList.toggle('actif', b.dataset.vue === vue)
    b.setAttribute('aria-selected', String(b.dataset.vue === vue))
  })
  document.querySelector<HTMLElement>('.vue-raisonnement')!.hidden = vue !== 'raisonnement'
  document.querySelector<HTMLElement>('.vue-agents')!.hidden = vue !== 'agents'
  document.querySelector<HTMLElement>('.vue-documents')!.hidden = vue !== 'documents'
  documents.afficher(vue === 'documents')
  document.querySelector<HTMLElement>('.outils-raisonnement')!.hidden = vue !== 'raisonnement'
  agentGraph.afficher(vue === 'agents')
  try {
    localStorage.setItem(CLE_VUE, vue)
  } catch {
    // sans importance
  }
}

document.querySelector('.onglets')!.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-vue]')
  if (b) montrer(b.dataset.vue as Onglet)
})

const conversation = new PanneauConversation(
  document.querySelector<HTMLElement>('.panneau-conversation')!,
  document.querySelector<HTMLElement>('.panneau-sessions')!,
  (id) => {
    if (id !== conversationId) agentGraph.reinitialiser()
    conversationId = id
    documents.revelerSession(id)
    redessiner()
  },
  // Pendant une exécution, le graphe est relu au plus toutes les INTERVALLE_GRAPHE_MS.
  () => {
    if (Date.now() - dernierChargement > INTERVALLE_GRAPHE_MS) void chargerGraphe()
  },
  () => montrer('agents'),
  (projet, conversations) => {
    documents.definirProjet(projet, conversations)
    if ((projet?.id ?? null) === projetId) return
    projetId = projet?.id ?? null
    vueGraphe.definirProjet(projetId)
    graphe = { noeuds: [], aretes: [] }
    vue = { groupes: [], placements: [], etiquettes: [], marques: [] }
    redessiner()
    void chargerGraphe()
  },
)

const panneau = installerPoignees((replie) => conversation.replierSessions(replie))

// ─── Pilotage de l'écran par l'agent navigateur d'AtlasVoice (P3/P4, relais VITE_AFFICHAGE_URL) ───
// Sans relais configuré, rien ne change : la vue reste pilotée à la souris seulement.

if (ClientRelais.configure()) {
  adaptateur = new AdaptateurVue(vueGraphe, {
    fiche: () => ficheId,
    definirFiche: (id) => afficherDetail(id === null ? null : (graphe.noeuds.find((n) => n.id === id) ?? null)),
    panneauOuvert: () => panneau.ouvert(),
    definirPanneau: (ouvert) => panneau.ouvrir(ouvert),
    conversationAffichee: () => conversationId,
    recharger: () => chargerGraphe(),
  }, `ecran_${nouvelId().slice(0, 8)}`, 'local')
  const pilote = new Pilote(adaptateur)
  new ClientRelais(pilote).demarrer()
  // Développement : pilotage à la main depuis la console, ex. atlasAffichage.commander({ op: 'zoomer', facteur: 2 }).
  if (import.meta.env.DEV) {
    const atlasAffichage = { etat: () => pilote.etat(), commander: (...c: CommandeBas[]) => pilote.commander(...c), pilote }
    Object.assign(window, { atlasAffichage })
  }
}

let vueInitiale: Onglet = 'raisonnement'
try {
  const garde = localStorage.getItem(CLE_VUE)
  if (garde === 'agents' || garde === 'documents') vueInitiale = garde
} catch {
  // stockage indisponible
}
montrer(vueInitiale)

// Le graphe suit l'espace ouvert ; sans espace (serveur de l'orchestrateur injoignable), celui du projet « defaut ».
void conversation.charger().then(() => {
  if (!projetId) void chargerGraphe()
})
