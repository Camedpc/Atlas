// Atlas : sessions à gauche, conversation au centre (avec l'arbre des agents au-dessus de la saisie),
// et à droite le graphe de raisonnement ou l'agent graph.
import './style.css'
import './espaces.css'
import { AgentGraph } from './agentgraph'
import { api, type Graphe, type Noeud } from './api'
import { PanneauConversation } from './conversations'
import { VueDocuments } from './documents'
import { COULEURS_STATUT, LIBELLES_STATUT, VueGraphe } from './graphe'
import { installerPoignees } from './redimension'
import { echapper, rendre } from './rendu'

const INTERVALLE_GRAPHE_MS = 4000
const CLE_VUE = 'atlas.vue'

type Vue = 'raisonnement' | 'agents' | 'documents'

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
        <button type="button" class="recentrer">Recentrer</button>
        <button type="button" class="recharger">Recharger</button>
      </div>
    </header>
    <div class="vue vue-raisonnement">
      <div class="sigma"></div>
      <ul class="legende">${Object.entries(LIBELLES_STATUT)
        .map(([s, libelle]) => `<li><i style="background:${COULEURS_STATUT[s as Noeud['statut']]}"></i>${libelle}</li>`)
        .join('')}</ul>
      <article class="detail" hidden></article>
    </div>
    <div class="vue vue-agents" hidden><div class="scene-agents"></div></div>
    <div class="vue vue-documents" hidden></div>
  </section>`

const detail = document.querySelector<HTMLElement>('.detail')!
const filtre = document.querySelector<HTMLInputElement>('.filtre')!
const compteur = document.querySelector<HTMLElement>('.compteur')!

let graphe: Graphe = { noeuds: [], aretes: [] }
let conversationId: string | null = null
// Espace ouvert : chaque espace a son graphe.
let projetId: string | null = null
let dernierChargement = 0

const vueGraphe = new VueGraphe(document.querySelector<HTMLElement>('.sigma')!, afficherDetail)

function afficherDetail(n: Noeud | null) {
  detail.hidden = !n
  if (!n) return
  const liens = (ids: string[]) =>
    ids.length ? ids.map((id) => `<button type="button" class="lien" data-id="${id}">${echapper(id)}</button>`).join(' ') : '—'
  detail.innerHTML = `
    <button type="button" class="fermer" aria-label="Fermer">×</button>
    <h2>${echapper(n.nom)}</h2>
    <p class="meta"><span class="pastille" style="background:${COULEURS_STATUT[n.statut]}">${LIBELLES_STATUT[n.statut]}</span>
      <code>${echapper(n.id)}</code>${n.admis ? ' · admis' : ''}</p>
    <div class="enonce">${rendre(n.enonce)}</div>
    <p><strong>Parents :</strong> ${liens(n.parents)}</p>
    <p><strong>Enfants :</strong> ${liens(n.enfants)}</p>
    ${n.demonstrations
      .map(
        (d) => `<details class="demo" open>
          <summary>${echapper(d.nom_demonstration)} · <em>${d.validite}</em> · ${echapper(d.auteur)}</summary>
          <p class="meta">Justifié par : ${liens(d.justifie_par)}</p>
          <div>${rendre(d.demonstration)}</div>
        </details>`,
      )
      .join('')}`
  detail.querySelector('.fermer')!.addEventListener('click', () => vueGraphe.selectionner(null))
  detail.querySelectorAll<HTMLButtonElement>('.lien').forEach((b) =>
    b.addEventListener('click', () => vueGraphe.selectionner(b.dataset.id!)),
  )
}

function redessiner() {
  const visibles = vueGraphe.afficher(graphe, filtre.checked ? conversationId : null)
  compteur.textContent = `${visibles} nœuds`
}

async function chargerGraphe() {
  dernierChargement = Date.now()
  const projet = projetId
  try {
    const lu = await api.graphe(projet)
    if (projet !== projetId) return // l'espace a changé pendant la lecture
    graphe = lu
    redessiner()
  } catch (e) {
    compteur.textContent = `Graphe indisponible : ${e instanceof Error ? e.message : String(e)}`
  }
}

filtre.addEventListener('change', redessiner)
document.querySelector('.recentrer')!.addEventListener('click', () => vueGraphe.recentrer())
document.querySelector('.recharger')!.addEventListener('click', () => void chargerGraphe())

// ─── Onglets du panneau de droite ───

const documents = new VueDocuments(document.querySelector<HTMLElement>('.vue-documents')!)
const agentGraph = new AgentGraph(document.querySelector<HTMLElement>('.scene-agents')!, () => conversation.focaliser())

function montrer(vue: Vue) {
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
  if (vue === 'raisonnement') vueGraphe.recentrer()
  try {
    localStorage.setItem(CLE_VUE, vue)
  } catch {
    // sans importance
  }
}

document.querySelector('.onglets')!.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-vue]')
  if (b) montrer(b.dataset.vue as Vue)
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
    vueGraphe.selectionner(null)
    graphe = { noeuds: [], aretes: [] }
    redessiner()
    void chargerGraphe()
  },
)

installerPoignees((replie) => conversation.replierSessions(replie))

let vueInitiale: Vue = 'raisonnement'
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
