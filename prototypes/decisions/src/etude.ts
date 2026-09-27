// Étude des losanges de décision : le vrai moteur du graphe (frontend/src/graphe.ts), en lecture seule, sur la fontaine
// de chaîne (banc/preparer.py), avec un sélecteur de variante, de style de flèches et de niveau de zoom.

import './etude.css'
import type { Graphe, Vue } from '../../../frontend/src/api'
import { VueGraphe } from '../../../frontend/src/graphe'
import { reglerDecision, REGLAGES, TAILLES, type FlecheDecision, type StyleDecision } from '../../../frontend/src/graphe-decision'
import { SEUIL_CONTENU, SEUIL_POINT } from '../../../frontend/src/graphe-dessin'

interface Variante {
  style: StyleDecision
  palier: string
  nom: string
  phrase: string
}

const VARIANTES: Variante[] = [
  { style: 'r42', palier: 'Palier 1 · R42', nom: 'R42 agrandi', phrase: 'Le losange de R42, deux fois plus grand : nom au-dessus, « D1 » dedans, tige et × vers l’option non retenue. La question et la retenue ne se lisent que dans la fiche.' },
  { style: 'cartouche', palier: 'Palier 2', nom: 'Losange et cartouche', phrase: 'Losange à gauche (« Décision D1 » et le nom) ; à côté, un cartouche : question, ✓ retenue, × écartées barrées et leur raison, raison du choix.' },
  { style: 'grand', palier: 'Palier 3', nom: 'Grand losange', phrase: 'Tout dans le losange, le texte épouse sa forme : question, ✓ retenue, × écartées, raison. Le plus « losange » ; le plus haut.' },
  { style: 'branches', palier: 'Palier 4', nom: 'Losange et branches', phrase: 'Question et retenue dans le losange ; les écartées pendent dessous, au bout d’une tige pointillée, barrées avec leur raison.' },
  { style: 'etire', palier: 'Palier 5 · libre', nom: 'Losange étiré', phrase: 'Une carte à pointes : se lit comme un bloc (tête, question, ✓, ×), garde la silhouette de la décision, sur une seule rangée.' },
]

const FLECHES: { valeur: FlecheDecision; nom: string }[] = [
  { valeur: 'ordinaire', nom: 'Ordinaires' },
  { valeur: 'appuyee', nom: 'Appuyées' },
  { valeur: 'tiretee', nom: 'Tiretées' },
]

const DECISIONS = [
  { id: 'd_origine', nom: 'D · Origine de la fontaine' },
  { id: 'd_alpha', nom: 'D · Estimer α' },
  { id: 'd_mesure', nom: 'D · Mesure des hauteurs' },
]

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!

async function lire<T>(chemin: string): Promise<T> {
  const r = await fetch(chemin)
  if (!r.ok) throw new Error(`${chemin} : ${r.status}`)
  return r.json() as Promise<T>
}

function lireEtat(): { style: StyleDecision; fleches: FlecheDecision; ecartees: boolean } {
  try {
    const e = JSON.parse(localStorage.getItem('etude-decisions') ?? 'null') as Partial<typeof REGLAGES> | null
    if (e && VARIANTES.some((v) => v.style === e.style)) return { ...REGLAGES, ...e }
  } catch {
    // stockage indisponible : réglages par défaut
  }
  return { ...REGLAGES }
}

function garderEtat(): void {
  try {
    localStorage.setItem('etude-decisions', JSON.stringify(REGLAGES))
  } catch {
    // sans conséquence
  }
}

async function demarrer(): Promise<void> {
  const graphe = await lire<Graphe>('./donnees/graphe.json')
  const vues = new Map<string, Vue>()
  for (const t of ['1x1', '2x1', '3x1', '2x2']) vues.set(t, await lire<Vue>(`./donnees/vue-${t}.json`))

  const vg = new VueGraphe($('.graphe'), { surOuvrir: () => {}, recharger: async () => {} })
  vg.definirProjet(null, 'Page d’étude : le graphe est en lecture seule.')
  reglerDecision(lireEtat())

  const afficher = () => {
    const [l, h] = TAILLES[REGLAGES.style]
    vg.afficher(graphe, vues.get(`${l}x${h}`)!, null)
    for (const b of document.querySelectorAll<HTMLElement>('[data-style]')) b.setAttribute('aria-checked', String(b.dataset.style === REGLAGES.style))
    for (const b of document.querySelectorAll<HTMLElement>('[data-fleches]')) b.setAttribute('aria-checked', String(b.dataset.fleches === REGLAGES.fleches))
    $<HTMLInputElement>('.ecartees').checked = REGLAGES.ecartees
    const v = VARIANTES.find((x) => x.style === REGLAGES.style)!
    $('.resume').textContent = resume(v)
    garderEtat()
  }

  // Variantes.
  const liste = $('.variantes')
  for (const v of VARIANTES) {
    const [l, h] = TAILLES[v.style]
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'variante'
    b.dataset.style = v.style
    b.setAttribute('role', 'radio')
    b.innerHTML = `<span class="palier">${v.palier} · ${l} × ${h} case${l * h > 1 ? 's' : ''}</span><span class="nom">${v.nom}</span><span class="phrase">${v.phrase}</span>`
    b.addEventListener('click', () => {
      reglerDecision({ style: v.style })
      afficher()
    })
    liste.append(b)
  }
  for (const f of FLECHES) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.fleches = f.valeur
    b.setAttribute('role', 'radio')
    b.textContent = f.nom
    b.addEventListener('click', () => {
      reglerDecision({ fleches: f.valeur })
      afficher()
    })
    $('.fleches').append(b)
  }
  $<HTMLInputElement>('.ecartees').addEventListener('change', (e) => {
    reglerDecision({ ecartees: (e.target as HTMLInputElement).checked })
    afficher()
  })

  // Regarder : tout, de loin, au niveau des titres, de près (autour de la première décision).
  let cible = DECISIONS[0]!.id
  for (const d of DECISIONS) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = d.nom
    b.addEventListener('click', async () => {
      cible = d.id
      await vg.cadrerNoeuds([d.id])
      vg.selectionner(d.id)
    })
    $('.decisions').append(b)
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-zoom]')) {
    b.addEventListener('click', async () => {
      const z = b.dataset.zoom
      if (z === 'tout') return vg.cadrerGraphe()
      await vg.cadrerNoeuds([cible])
      const c = vg.camera
      if (z === 'loin') await vg.placerCamera(c.x, c.y, SEUIL_POINT * 0.8)
      else if (z === 'titre') await vg.placerCamera(c.x, c.y, (SEUIL_POINT + SEUIL_CONTENU) / 2)
      else await vg.placerCamera(c.x, c.y, Math.max(c.z, 1))
    })
  }

  $('.copier').addEventListener('click', async () => {
    const texte = $('.resume').textContent ?? ''
    try {
      await navigator.clipboard.writeText(texte)
      $('.copie').textContent = 'Copié.'
    } catch {
      $('.copie').textContent = 'Copie refusée par le navigateur : sélectionne le texte.'
    }
    setTimeout(() => ($('.copie').textContent = ''), 2500)
  })
  $('.basculer').addEventListener('click', () => {
    const f = $('.reference')
    f.classList.toggle('reduite')
    $('.basculer').textContent = f.classList.contains('reduite') ? 'Afficher' : 'Réduire'
  })

  afficher()
  await vg.cadrerGraphe()
}

function resume(v: Variante): string {
  const [l, h] = TAILLES[v.style]
  const fleches = FLECHES.find((f) => f.valeur === REGLAGES.fleches)!.nom.toLowerCase()
  return `Décision : variante « ${v.nom} » (${v.style}, ${l} × ${h} case${l * h > 1 ? 's' : ''}), flèches ${fleches}, `
    + `${REGLAGES.ecartees ? 'flèche tiretée × vers les options écartées' : 'pas de flèche vers les options écartées'}.`
}

void demarrer().catch((e) => {
  $('.graphe').textContent = `Données indisponibles : ${e instanceof Error ? e.message : String(e)}`
})
