// Atlas : conversations avec l'orchestrateur à gauche, graphe de raisonnement à droite.
//
// L'écran du graphe est pilotable (P3, `pilotage/`) : les actions de l'application passent par des lots
// de commandes, comme celles d'un agent, pour que l'état exporté (P4) soit toujours juste.
import './style.css'
import { api, type Graphe } from './api'
import { PanneauConversations } from './conversations'
import { LIBELLES_STATUT, STATUTS } from './graphe/raisonnement/donnees'
import { VueGrapheAtlas } from './graphe/vueAtlas'
import { ClientRelais } from './pilotage/client'
import { Pilote } from './pilotage/pilote'
import type { CompteRendu, EtatAffichage } from './pilotage/protocole'
import { echapper, rendre } from './rendu'

const INTERVALLE_GRAPHE_MS = 4000

const app = document.querySelector<HTMLElement>('#app')!
app.innerHTML = `
  <aside class="panneau-conversations"></aside>
  <section class="panneau-graphe">
    <div class="vue-graphe"></div>
    <div class="barre">
      <button type="button" class="basculer-panneau" title="Afficher ou masquer les conversations">Conversations</button>
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
let ficheId: string | null = null
let dernierChargement = 0
let erreurGraphe: string | null = null

// Clic dans le graphe : la fiche suit la sélection de l'utilisateur.
const vue = new VueGrapheAtlas(document.querySelector<HTMLElement>('.vue-graphe')!, (id) => afficherFiche(id))

const pilote = new Pilote(vue, {
  fiche: () => ficheId,
  definirFiche: (id) => afficherFiche(id),
  panneauOuvert: () => !app.classList.contains('conversations-masquees'),
  definirPanneau: (ouvert) => app.classList.toggle('conversations-masquees', !ouvert),
  conversationAffichee: () => conversationId,
  recharger: () => chargerGraphe(),
})

// Couleurs de statut : celles du thème du moteur (variables CSS --statut-*).
function dessinerLegende() {
  const couleurs = vue.moteur.palette.statut
  legende.innerHTML = STATUTS.map((s) => `<li><i style="background:${couleurs[s]}"></i>${LIBELLES_STATUT[s]}</li>`).join('')
}
vue.moteur.on('theme', dessinerLegende)
dessinerLegende()

/** Fiche (panneau de détail) d'un nœud, ou fermée ; relue dans les données courantes. */
function afficherFiche(id: string | null) {
  const n = id === null ? null : (graphe.noeuds.find((x) => x.id === id) ?? null)
  ficheId = n?.id ?? null
  detail.hidden = !n
  // Les cadrages du moteur évitent le panneau de détail.
  vue.moteur.margesSures = { droite: n ? detail.offsetWidth + 8 : 0 }
  pilote.signaler()
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
  detail.querySelector('.fermer')!.addEventListener('click', () =>
    void pilote.commander({ op: 'selectionner', cible: null }, { op: 'fiche', cible: null }),
  )
  detail.querySelectorAll<HTMLButtonElement>('.lien').forEach((b) =>
    b.addEventListener('click', () => {
      const cible = { noeud: b.dataset.id! }
      void pilote.commander({ op: 'selectionner', cible }, { op: 'fiche', cible })
    }),
  )
}

function compter() {
  compteur.textContent = erreurGraphe === null ? `${vue.compter()} nœuds` : `Graphe indisponible : ${erreurGraphe}`
}

async function chargerGraphe() {
  dernierChargement = Date.now()
  try {
    graphe = await api.graphe()
    await vue.afficher(graphe)
    // La fiche ouverte est relue (ou fermée si son nœud a disparu).
    if (ficheId !== null) afficherFiche(ficheId)
    erreurGraphe = null
  } catch (e) {
    erreurGraphe = e instanceof Error ? e.message : String(e)
  }
  compter()
}

async function filtrerConversation() {
  const conversation = filtre.checked ? conversationId : null
  if (vue.filtres.etat.conversation === conversation) return
  await pilote.commander({ op: 'filtres', patch: { conversation } }, { op: 'cadrer', cibles: 'tout' })
}

// Tout changement d'état (lot d'un agent compris) : case à cocher et compteur à jour.
pilote.ecouter((e) => {
  filtre.checked = e.filtres.conversation !== null
  compter()
})

filtre.addEventListener('change', () => void filtrerConversation())
document.querySelector('.basculer-panneau')!.addEventListener('click', () =>
  void pilote.commander({ op: 'panneau', ouvert: app.classList.contains('conversations-masquees') }),
)
document.querySelector('.recentrer')!.addEventListener('click', () => void pilote.commander({ op: 'cadrer', cibles: 'tout' }))
document.querySelector('.recharger')!.addEventListener('click', () => void pilote.commander({ op: 'recharger_donnees' }))

const conversations = new PanneauConversations(
  document.querySelector<HTMLElement>('.panneau-conversations')!,
  (id) => {
    conversationId = id
    pilote.signaler()
    void filtrerConversation()
  },
  // Pendant une exécution, le graphe est relu au plus toutes les INTERVALLE_GRAPHE_MS.
  () => {
    if (Date.now() - dernierChargement > INTERVALLE_GRAPHE_MS) void chargerGraphe()
  },
)

// Pilotage à la main depuis la console : atlasAffichage.executer(atlasAffichage.lot([{ op: 'mode', mode: '3d' }]))
const atlasAffichage = {
  ecran: pilote.ecran,
  executer: (lot: unknown): Promise<CompteRendu> => pilote.executer(lot),
  etat: (): EtatAffichage => pilote.etat(),
  lot: pilote.lot.bind(pilote),
}
Object.assign(window, { atlasAffichage, atlasVue: vue })

void chargerGraphe()
void conversations.charger()
// Pilotage par les agents via le relais d'AtlasVoice (VITE_AFFICHAGE_URL), si configuré.
new ClientRelais(pilote).demarrer()
