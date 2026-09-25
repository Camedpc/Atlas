export type Validite = 'a_verifier' | 'valide' | 'invalide'

/** Validité effective d'un nœud : calculée, jamais stockée. */
export type Statut = 'etabli' | 'suspendu' | 'a_verifier' | 'invalide' | 'ouvert'

/** Format d'échange (agents + export) d'une démonstration. */
export interface Demonstration {
  nom_demonstration: string
  justifie_par: string[]
  demonstration: string
  validite: Validite
  auteur: string
}

/** Format d'échange (agents + export) d'un nœud. */
export interface Noeud {
  id: string
  nom: string
  enonce: string
  admis: boolean
  demonstrations: Demonstration[]
}

// Lignes telles que stockées dans Supabase.
export interface NoeudRow {
  id: string
  nom: string
  enonce: string
  admis: boolean
  cree_le: string
  modifie_le: string
}

export interface DemonstrationRow extends Demonstration {
  noeud_id: string
  cree_le: string
  modifie_le: string
}

export interface JournalRow {
  id: number
  cree_le: string
  action:
    | 'creation_noeud'
    | 'modification_noeud'
    | 'ajout_demonstration'
    | 'modification_demonstration'
    | 'verdict'
    | 'import'
  noeud_id: string | null
  nom_demonstration: string | null
  avant: unknown
  apres: unknown
  raison: string | null
  auteur: string
}
