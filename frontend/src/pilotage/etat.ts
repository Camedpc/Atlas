// Modèle d'état pur du pilotage (P3 → écran) : `appliquer(etat, commande, index)` calcule l'état visé
// après une commande, sans DOM ni sigma. L'adaptateur (`adaptateur.ts`) amène ensuite l'écran dans cet
// état, puis joue l'effet éventuel (caméra, rechargement) qui ne s'exprime pas comme un état.
//
// Les champs de caméra autres que `mode` et `vue` (orientation, cible, distance), `visibles` et `survol`
// ne sont pas prédits ici : l'export de l'écran fait foi.

import type {
  CommandeBas, EtatAffichage, EtatFiltres, ErreurProtocole, IdNoeud, NomVue, ParametresLecture, RefNoeud,
} from './protocole'

/** Ce que le modèle doit savoir des données : ids de nœuds et nœuds par conversation. */
export interface IndexDonnees {
  noeuds: ReadonlySet<IdNoeud>
  parConversation: ReadonlyMap<string, readonly IdNoeud[]>
}

/** Action à jouer après la mise en état : ce qui n'est pas un état stable de l'écran. */
export type Effet =
  | { genre: 'cadrer'; noeuds: IdNoeud[] }
  | { genre: 'cadrer'; tout: true }
  | { genre: 'cadrer'; selection: true }
  | { genre: 'zoomer'; facteur: number }
  | { genre: 'orbiter'; d_azimut_deg: number; d_elevation_deg: number }
  | { genre: 'vue'; nom: NomVue }
  | { genre: 'camera'; camera: EtatAffichage['camera'] }
  | { genre: 'recharger' }

export interface Application {
  etat: EtatAffichage
  effet?: Effet
}

export function filtresVides(): EtatFiltres {
  return { conversation: null, statuts: [], types: [], periode: { debut: null, fin: null }, texte: '', mode: 'masquer' }
}

export function construireIndex(noeuds: readonly { id: IdNoeud; conversation: string | null }[]): IndexDonnees {
  const parConversation = new Map<string, IdNoeud[]>()
  for (const n of noeuds) {
    if (n.conversation === null) continue
    let l = parConversation.get(n.conversation)
    if (!l) parConversation.set(n.conversation, (l = []))
    l.push(n.id)
  }
  for (const l of parConversation.values()) l.sort()
  return { noeuds: new Set(noeuds.map((n) => n.id)), parConversation }
}

export function estErreur(r: Application | ErreurProtocole): r is ErreurProtocole {
  return 'code' in r
}

const erreur = (code: ErreurProtocole['code'], message: string, details?: unknown): ErreurProtocole =>
  details === undefined ? { code, message } : { code, message, details }

function verifierNoeud(ref: RefNoeud, index: IndexDonnees): ErreurProtocole | null {
  return index.noeuds.has(ref.noeud) ? null : erreur('introuvable', `Nœud inconnu : ${ref.noeud}`, { noeud: ref.noeud })
}

function verifierParametres(p: ParametresLecture): ErreurProtocole | null {
  if (p.longueur_min_chaine !== undefined && p.longueur_max_chaine !== undefined && p.longueur_min_chaine > p.longueur_max_chaine) {
    return erreur('invalide', 'longueur_min_chaine dépasse longueur_max_chaine')
  }
  return null
}

/** Nœuds désignés par des cibles, dans l'ordre, sans doublon. */
function resoudreCibles(cibles: Extract<CommandeBas, { op: 'cadrer' }>['cibles'], index: IndexDonnees): IdNoeud[] | ErreurProtocole {
  if (typeof cibles === 'string') return []
  const ids: IdNoeud[] = []
  for (const c of cibles) {
    if ('noeud' in c) {
      const e = verifierNoeud(c, index)
      if (e) return e
      ids.push(c.noeud)
    } else {
      const l = index.parConversation.get(c.conversation)
      if (!l?.length) return erreur('introuvable', `Aucun nœud pour la conversation ${c.conversation}`, { conversation: c.conversation })
      ids.push(...l)
    }
  }
  return [...new Set(ids)]
}

/** Applique une commande (déjà validée par le schéma) : nouvel état visé, ou erreur sans rien changer. */
export function appliquer(etat: EtatAffichage, c: CommandeBas, index: IndexDonnees): Application | ErreurProtocole {
  const e = structuredClone(etat)
  switch (c.op) {
    case 'strategie':
      e.strategie = c.id
      return { etat: e }
    case 'parametres_lecture': {
      const p = { ...e.parametres_lecture, ...c.patch }
      const err = verifierParametres(p)
      if (err) return err
      e.parametres_lecture = p
      return { etat: e }
    }
    case 'liens_complets':
      e.liens_complets = c.oui
      return { etat: e }
    case 'mode':
      e.camera.mode = c.mode
      e.camera.vue = c.mode === '2d' ? 'face' : null
      return { etat: e }
    case 'vue':
      // Toute vue autre que la face passe en 3D (comme le moteur).
      if (!(c.nom === 'face' && e.camera.mode === '2d')) e.camera.mode = '3d'
      e.camera.vue = c.nom
      return { etat: e, effet: { genre: 'vue', nom: c.nom } }
    case 'orbiter':
      if (e.camera.mode !== '3d') return erreur('etat_invalide', 'orbiter demande le mode 3d')
      e.camera.vue = null
      return { etat: e, effet: { genre: 'orbiter', d_azimut_deg: c.d_azimut_deg, d_elevation_deg: c.d_elevation_deg } }
    case 'zoomer':
      return { etat: e, effet: { genre: 'zoomer', facteur: c.facteur } }
    case 'cadrer': {
      if (c.cibles === 'tout') return { etat: e, effet: { genre: 'cadrer', tout: true } }
      if (c.cibles === 'selection') {
        if (!e.selection) return erreur('etat_invalide', 'cadrer « selection » sans sélection')
        return { etat: e, effet: { genre: 'cadrer', selection: true } }
      }
      const ids = resoudreCibles(c.cibles, index)
      if (!Array.isArray(ids)) return ids
      return { etat: e, effet: { genre: 'cadrer', noeuds: ids } }
    }
    case 'selectionner': {
      if (c.cible) {
        const err = verifierNoeud(c.cible, index)
        if (err) return err
      }
      e.selection = c.cible ? { noeud: c.cible.noeud } : null
      e.portee = null
      return { etat: e }
    }
    case 'portee': {
      const err = verifierNoeud(c.cible, index)
      if (err) return err
      e.selection = { noeud: c.cible.noeud }
      e.portee = { noeud: c.cible.noeud }
      return { etat: e }
    }
    case 'surligner': {
      for (const r of c.cibles) {
        const err = verifierNoeud(r, index)
        if (err) return err
      }
      e.surlignes = [...new Set(c.cibles.map((r) => r.noeud))]
      return { etat: e }
    }
    case 'filtres':
      e.filtres = { ...e.filtres, ...c.patch }
      return { etat: e }
    case 'effacer_filtres':
      e.filtres = filtresVides()
      return { etat: e }
    case 'fiche': {
      if (c.cible) {
        const err = verifierNoeud(c.cible, index)
        if (err) return err
      }
      e.fiche = c.cible ? { noeud: c.cible.noeud } : null
      return { etat: e }
    }
    case 'panneau':
      e.panneau_ouvert = c.ouvert
      return { etat: e }
    case 'theme':
      e.theme = c.theme
      return { etat: e }
    case 'restaurer': {
      const r = c.etat
      const refs = [r.selection, r.portee, r.fiche, ...r.surlignes.map((noeud) => ({ noeud }))]
      for (const ref of refs) {
        if (!ref) continue
        const err = verifierNoeud(ref, index)
        if (err) return err
      }
      const err = verifierParametres(r.parametres_lecture)
      if (err) return err
      // L'identité de l'écran, les données, ce qui est à l'écran et la conversation ouverte ne se restaurent pas.
      const restaure: EtatAffichage = {
        ...structuredClone(r),
        ecran: e.ecran, utilisateur_id: e.utilisateur_id, version_donnees: e.version_donnees,
        visibles: e.visibles, survol: e.survol, conversation_affichee: e.conversation_affichee,
      }
      return { etat: restaure, effet: { genre: 'camera', camera: structuredClone(r.camera) } }
    }
    case 'recharger_donnees':
      return { etat: e, effet: { genre: 'recharger' } }
  }
}

export interface ResultatLot {
  /** État visé après le lot (inchangé si refus atomique). */
  etat: EtatAffichage
  /** Une entrée par commande appliquée, dans l'ordre : état visé et effet. */
  applications: (Application | null)[]
  resultats: { index: number; ok: boolean; erreur?: ErreurProtocole }[]
  ok: boolean
}

/**
 * Applique un lot. Atomique (défaut) : validé entièrement avant toute action ; à la première erreur,
 * rien n'est appliqué. Sinon, chaque commande en erreur est sautée et les suivantes continuent.
 */
export function appliquerLot(etat: EtatAffichage, commandes: CommandeBas[], index: IndexDonnees, atomique = true): ResultatLot {
  let courant = etat
  const applications: (Application | null)[] = []
  const resultats: ResultatLot['resultats'] = []
  for (const [i, c] of commandes.entries()) {
    const r = appliquer(courant, c, index)
    if (estErreur(r)) {
      resultats.push({ index: i, ok: false, erreur: r })
      applications.push(null)
      if (atomique) return { etat, applications: [], resultats, ok: false }
      continue
    }
    courant = r.etat
    applications.push(r)
    resultats.push({ index: i, ok: true })
  }
  return { etat: courant, applications, resultats, ok: resultats.every((r) => r.ok) }
}
