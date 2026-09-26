// Atlas : conversations avec l'orchestrateur à gauche, graphe de raisonnement à droite.
import './style.css'
import { api, type Graphe, type Noeud } from './api'
import { PanneauConversations } from './conversations'
import { LIBELLES_STATUT, STATUTS } from './graphe/raisonnement/donnees'
import { VueGrapheAtlas } from './graphe/vueAtlas'
import { echapper, rendre } from './rendu'

const INTERVALLE_GRAPHE_MS = 4000

document.querySelector<HTMLElement>('#app')!.innerHTML = `
  <aside class="panneau-conversations"></aside>
  <section class="panneau-graphe">
    <div class="vue-graphe"></div>
    <div class="barre">
      <label><input type="checkbox" class="filtre" /> Cette conversation seulement</label>
      <span class="compteur"></span>
      <button type="button" class="recentrer">Recentrer</button>
      <button type="button" class="recharger">Recharger</button>
    </div>
    <ul class="legende"></ul>
    <article class="detail" hidden></article>
  </section>`

const detail = document.querySelector<HTMLElement>('.detail')!
const filtre = document.querySelector<HTMLInputElement>('.filtre')!
const compteur = document.querySelector<HTMLElement>('.compteur')!
const legende = document.querySelector<HTMLElement>('.legende')!

let graphe: Graphe = { noeuds: [], aretes: [] }
let conversationId: string | null = null
let dernierChargement = 0

const vue = new VueGrapheAtlas(document.querySelector<HTMLElement>('.vue-graphe')!, (id) =>
  afficherDetail(id === null ? null : (graphe.noeuds.find((n) => n.id === id) ?? null)),
)

// Couleurs de statut : celles du thème du moteur (variables CSS --statut-*).
function dessinerLegende() {
  const couleurs = vue.moteur.palette.statut
  legende.innerHTML = STATUTS.map((s) => `<li><i style="background:${couleurs[s]}"></i>${LIBELLES_STATUT[s]}</li>`).join('')
}
vue.moteur.on('theme', dessinerLegende)
dessinerLegende()

function afficherDetail(n: Noeud | null) {
  detail.hidden = !n
  // Les cadrages du moteur évitent le panneau de détail.
  vue.moteur.margesSures = { droite: n ? detail.offsetWidth + 8 : 0 }
  if (!n) return
  const couleur = vue.moteur.palette.statut[n.statut]
  const liens = (ids: string[]) =>
    ids.length ? ids.map((id) => `<button type="button" class="lien" data-id="${id}">${echapper(id)}</button>`).join(' ') : '—'
  detail.innerHTML = `
    <button type="button" class="fermer" aria-label="Fermer">×</button>
    <h2>${echapper(n.nom)}</h2>
    <p class="meta"><span class="pastille" style="background:${couleur}">${LIBELLES_STATUT[n.statut]}</span>
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
  detail.querySelector('.fermer')!.addEventListener('click', () => vue.selectionner(null))
  detail.querySelectorAll<HTMLButtonElement>('.lien').forEach((b) =>
    b.addEventListener('click', () => vue.selectionner(b.dataset.id!)),
  )
}

function filtrer() {
  vue.filtrerConversation(filtre.checked ? conversationId : null)
  compteur.textContent = `${vue.compter()} nœuds`
}

async function chargerGraphe() {
  dernierChargement = Date.now()
  try {
    graphe = await api.graphe()
    await vue.afficher(graphe)
    compteur.textContent = `${vue.compter()} nœuds`
  } catch (e) {
    compteur.textContent = `Graphe indisponible : ${e instanceof Error ? e.message : String(e)}`
  }
}

filtre.addEventListener('change', filtrer)
document.querySelector('.recentrer')!.addEventListener('click', () => vue.cadrer())
document.querySelector('.recharger')!.addEventListener('click', () => void chargerGraphe())

const conversations = new PanneauConversations(
  document.querySelector<HTMLElement>('.panneau-conversations')!,
  (id) => {
    conversationId = id
    filtrer()
  },
  // Pendant une exécution, le graphe est relu au plus toutes les INTERVALLE_GRAPHE_MS.
  () => {
    if (Date.now() - dernierChargement > INTERVALLE_GRAPHE_MS) void chargerGraphe()
  },
)

// Pratique pour déboguer depuis la console.
;(window as unknown as { atlasVue: VueGrapheAtlas }).atlasVue = vue

void chargerGraphe()
void conversations.charger()
