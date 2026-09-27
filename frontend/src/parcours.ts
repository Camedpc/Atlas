// Lecteur de parcours (atlas/parcours.py) : une suite d'écrans préparée par l'agent navigateur, déroulée ici aux
// boutons précédent / suivant, la phrase de chaque étape en légende. Pendant un appel, Atlas voix les déroule
// elle-même (outil `jouer_etape`). Chaque étape est un lot de commandes (P3) exécuté par le pilote : rien n'est
// enregistré, et fermer le lecteur rend un écran sans filtre ni surlignage.

import { api } from './api'
import type { Pilote } from './pilotage/pilote'
import type { CommandeBas } from './pilotage/protocole'
import { echapper } from './rendu'

export interface EtapeParcours {
  phrase: string
  compris: string[]
  commandes: CommandeBas[]
}

export interface Parcours {
  version: number
  titre: string
  etapes: EtapeParcours[]
}

const EFFACER: CommandeBas[] = [
  { op: 'effacer_filtres' },
  { op: 'surligner', cibles: [] },
  { op: 'selectionner', cible: null },
  { op: 'fiche', cible: null },
]

/** Le parcours d'un espace, par son chemin relatif au dossier de l'espace (message « parcours » du fil). */
export async function chargerParcours(projetId: string, chemin: string): Promise<Parcours> {
  const p = JSON.parse(await (await api.fichier(projetId, chemin)).text()) as Parcours
  if (!Array.isArray(p?.etapes) || !p.etapes.length) throw new Error('Ce fichier n’est pas un parcours.')
  return p
}

export class LecteurParcours {
  private racine: HTMLElement
  private pilote: Pilote
  private avant: () => Promise<void>
  private parcours: Parcours | null = null
  private etape = 0
  private surHauteur: (px: number) => void

  /** `conteneur` : la vue du graphe ; `avant` rend l'onglet du graphe visible avant chaque étape ; `surHauteur`
   * reçoit la place que le lecteur prend en bas (0 fermé), pour que les cadrages ne passent pas dessous. */
  constructor(conteneur: HTMLElement, pilote: Pilote, avant: () => Promise<void>, surHauteur: (px: number) => void) {
    this.pilote = pilote
    this.avant = avant
    this.surHauteur = surHauteur
    this.racine = document.createElement('section')
    this.racine.className = 'lecteur-parcours'
    this.racine.hidden = true
    this.racine.setAttribute('aria-label', 'Parcours')
    conteneur.append(this.racine)
    this.racine.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action
      if (action === 'precedent') void this.aller(this.etape - 1)
      else if (action === 'suivant') void this.aller(this.etape + 1)
      else if (action === 'fermer') void this.fermer()
    })
  }

  get ouvert(): boolean {
    return this.parcours !== null
  }

  async ouvrir(parcours: Parcours): Promise<void> {
    this.parcours = parcours
    this.racine.hidden = false
    await this.aller(0)
  }

  async fermer(): Promise<void> {
    if (!this.parcours) return
    this.parcours = null
    this.racine.hidden = true
    this.surHauteur(0)
    await this.pilote.commander(...EFFACER)
  }

  private async aller(i: number): Promise<void> {
    const p = this.parcours
    if (!p || i < 0 || i >= p.etapes.length) return
    this.etape = i
    this.dessiner()
    await this.avant()
    // Le lecteur est posé en bas (à 12 px du bord) : sa hauteur plus une marge est retirée de la zone cadrée.
    this.surHauteur(this.racine.offsetHeight + 24)
    const cr = await this.pilote.commander(...p.etapes[i]!.commandes)
    if (!cr.ok && this.parcours === p && this.etape === i) {
      const refus = cr.erreur ?? cr.resultats.find((r) => !r.ok)?.erreur
      this.racine.querySelector('.lp-refus')!.textContent = `Écran non mis à jour : ${refus?.message ?? 'refusé'}`
    }
  }

  private dessiner(): void {
    const p = this.parcours!
    const e = p.etapes[this.etape]!
    const n = p.etapes.length
    this.racine.innerHTML = `
      <header class="lp-tete">
        <span class="lp-titre">${echapper(p.titre)}</span>
        <span class="lp-compte">Étape ${this.etape + 1} / ${n}</span>
        <button type="button" class="lp-fermer" data-action="fermer" title="Fermer le parcours" aria-label="Fermer le parcours">×</button>
      </header>
      <p class="lp-phrase">${echapper(e.phrase)}</p>
      <p class="lp-refus" role="status"></p>
      <footer class="lp-boutons">
        <button type="button" data-action="precedent" ${this.etape === 0 ? 'disabled' : ''}>Précédent</button>
        <button type="button" data-action="${this.etape === n - 1 ? 'fermer' : 'suivant'}" class="lp-principal">
          ${this.etape === n - 1 ? 'Terminer' : 'Suivant'}</button>
      </footer>`
  }
}
