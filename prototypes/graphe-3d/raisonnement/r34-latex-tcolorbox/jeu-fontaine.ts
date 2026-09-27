// Jeu « fontaine de chaîne » (effet Mould) : une chaîne de billes tirée d'un bécher monte au-dessus du bord
// avant de retomber au sol. Raisonnement de mécanique d'après le modèle de Biggins & Warner (Proc. R. Soc. A,
// 2014) : une réaction du tas sur les maillons au point de prise (coefficient α) fournit la quantité de
// mouvement verticale ; on en déduit v² = g h₂ / (1 − α − β) et h₁ / h₂ = α / (1 − α − β).
// Les mesures (expériences, observations, simulation) sont ILLUSTRATIVES : ordres de grandeur plausibles,
// pas des données publiées. Même format que le jeu synthétique (src/raisonnement/donnees.ts), pour montrer
// que la vision (R14, puis R34) s'applique à un autre raisonnement sans rien changer à sa dérivation.

import type {
  Confiance, DemonstrationR, InfoChoix, InfoDecision, JeuRaisonnement, LienSemantique, NoeudR, Origine, Premisse,
  Statut, TypeRaisonnement, Validation,
} from '../../src/raisonnement'

interface Options {
  sp?: string
  statut?: Statut
  validation?: Validation
  origine?: Origine
  admis?: boolean
  abandon?: boolean
  conf?: [number, number, number]
  decision?: Omit<InfoDecision, 'date' | 'auteur'>
  choix?: InfoChoix
  liens?: LienSemantique[]
}

// [id, type, nom, énoncé, prémisses, options] ; prémisses : « a » principale, « +a » auxiliaire,
// « #a » technique, « ~a » contexte, « | » sépare deux démonstrations.
type Spec = [string, TypeRaisonnement, string, string, string, Options?]

const SOUS_PROBLEMES = [
  { id: 'cadre', nom: 'Cadre et modélisation', resume: 'Principes, hypothèses et choix de modélisation de la chaîne.' },
  { id: 'dyn', nom: 'SP1 · Chaîne en mouvement stationnaire', resume: 'Équation du mouvement, tension effective, forme.' },
  { id: 'bords', nom: 'SP2 · Conditions aux extrémités', resume: 'Tension au point de prise (α), à l’arrivée au sol (β), au sommet.' },
  { id: 'pred', nom: 'SP3 · Prédictions et confrontation', resume: 'Loi h₁/h₂, vitesse, estimation de α sur les mesures.' },
  { id: 'billes', nom: 'Piste abandonnée · élan seul', resume: 'Une chaîne sans réaction du tas (α = 0) ne fait pas de fontaine.', abandonne: true },
]

const SPECS: Spec[] = [
  // ── Principes et outils admis ──
  ['ax_newton', 'axiome', 'Bilan de quantité de mouvement (système ouvert)',
    'Sur un volume de contrôle traversé par la chaîne : d𝐩/dt = Σ𝐅_ext + flux entrant de quantité de mouvement − flux sortant.', '', { admis: true }],
  ['ax_gravite', 'axiome', 'Pesanteur uniforme', '𝐠 = −g 𝐞_y, g = 9,81 m·s⁻² ; y est l’altitude comptée depuis le haut du tas.', '', { admis: true }],
  ['lt_chainette', 'lemme', 'Équilibre d’une chaîne statique',
    'Une chaîne statique souple sous pesanteur uniforme vérifie T − λ g y = constante ; sa forme est une chaînette.', '~ax_gravite', { admis: true }],
  ['lt_buckingham', 'lemme', 'Théorème de Vaschy–Buckingham',
    'Une loi physique s’écrit entre grandeurs sans dimension ; ici h₁/h₂ ne peut dépendre que de α et β.', '', { admis: true }],
  // ── Hypothèses ──
  ['h_inext', 'hypothese', 'Chaîne inextensible', 'Maillons de longueur fixe, masse linéique λ uniforme, section négligeable.', ''],
  ['h_stat', 'hypothese', 'Régime stationnaire',
    'Dans le référentiel du laboratoire, la forme de la fontaine est fixe et la chaîne la parcourt à vitesse constante v.', ''],
  ['h_etroite', 'hypothese', 'Fontaine étroite',
    'Les deux jambes sont quasi verticales et proches : au sommet, le rayon de courbure est petit devant h₁.', ''],
  // ── Définitions ──
  ['def_hauteurs', 'definition', 'Hauteurs h₁ et h₂', 'h₁ : hauteur du sommet au-dessus du tas ; h₂ : chute du tas jusqu’au sol.', '', { admis: true }],
  ['def_T', 'definition', 'Tension effective', 'T′ = T − λ v² : pour une chaîne en mouvement stationnaire, tension d’une chaîne statique de même forme.', '~h_stat', { admis: true }],
  ['def_alpha', 'definition', 'Coefficient de prise α', 'Fraction de λ v² fournie par la réaction du tas au point de prise : T₀ = (1 − α) λ v².', '', { admis: true }],
  ['def_beta', 'definition', 'Coefficient d’arrivée β', 'Tension résiduelle au sol : T_s = β λ v² (β = 0 pour un arrêt parfaitement inélastique).', '', { admis: true }],
  // ── Choix de modélisation (sans décision préalable) ──
  ['ch_souple', 'choix_modelisation', 'Chaîne parfaitement souple', 'Courbe continue sans rigidité de flexion ni de torsion.', '~h_inext', {
    choix: { hypothese: 'La chaîne est une courbe continue parfaitement souple.', portee: 'Équation du mouvement le long de la chaîne (SP1).', alternatives: ['Maillons rigides articulés discrets', 'Tige élastique avec rigidité de flexion'] },
  }],
  ['ch_air', 'choix_modelisation', 'Frottement de l’air négligé', 'Aucune force aérodynamique sur la chaîne.', '', {
    choix: { hypothese: 'La traînée de l’air est négligeable devant le poids et les forces de contact.', portee: 'Tout le bilan de forces (SP1, SP2).', alternatives: ['Traînée quadratique ∝ ρ_air C_x v²'] },
  }],
  ['ch_sol', 'choix_modelisation', 'Arrivée au sol paramétrée par β', 'Le contact avec le sol est résumé par T_s = β λ v².', '~def_beta', {
    choix: { hypothese: 'Le sol arrête la chaîne en ne lui laissant qu’une tension β λ v².', portee: 'Condition au pied de la jambe descendante (SP2).', alternatives: ['Modèle de choc maillon par maillon'] },
  }],
  // ── Observation de départ et piste abandonnée ──
  ['obs_mould', 'observation', 'La chaîne monte au-dessus du bécher',
    'Une chaîne de billes de 50 m tirée par-dessus le bord d’un bécher s’élève au-dessus de celui-ci avant de tomber (Mould, 2013).', '', { validation: 'humain' }],
  ['conj_elan', 'conjecture', 'L’élan de la chaîne suffit',
    'Sans aucune réaction du tas (α = 0), l’élan acquis par la chaîne suffirait à la faire monter au-dessus du bécher.', '~obs_mould', { sp: 'billes', abandon: true, statut: 'refute' }],
  // ── SP1 · Chaîne en mouvement stationnaire ──
  ['l_mouv', 'lemme', 'Équation du mouvement stationnaire',
    '∂ₛ(T 𝐭) − λ v² κ 𝐧 + λ𝐠 = 𝟎, où s est l’abscisse curviligne, κ la courbure et 𝐧 la normale.', 'ax_newton ~ax_gravite ~h_inext ~h_stat +ch_souple +ch_air', { sp: 'dyn' }],
  ['l_effective', 'lemme', 'Réduction à un problème statique',
    'Avec T′ = T − λ v² : ∂ₛ(T′ 𝐭) + λ𝐠 = 𝟎. La fontaine a la forme d’une chaîne statique de tension T′.', 'l_mouv ~def_T', { sp: 'dyn' }],
  ['l_conserv', 'lemme', 'Invariant le long de la chaîne',
    'T′ − λ g y est constant le long de toute la chaîne, du tas jusqu’au sol.', 'l_effective #lt_chainette', { sp: 'dyn' }],
  ['p_forme', 'proposition', 'Forme : chaînette inversée',
    'Si les jambes s’écartent, T′ < 0 au sommet : la fontaine prend la forme d’une chaînette inversée (une arche).', 'l_effective #lt_chainette', { sp: 'dyn' }],
  ['p_billes', 'proposition', 'Avec α = 0, pas de fontaine',
    'Si le tas n’exerce aucune réaction, T′₀ = 0 et l’invariant impose h₁ = 0 : la chaîne ne dépasse pas le bord.', 'conj_elan l_conserv ~def_alpha', {
      sp: 'billes', abandon: true, liens: [{ genre: 'contredit', cible: 'obs_mould', note: 'La fontaine est pourtant observée.' }],
    }],
  // ── Décision sur l'origine de la fontaine ──
  ['d_origine', 'decision', 'Origine de la fontaine', 'Quelle force fournit la quantité de mouvement verticale au point de prise ?', 'obs_mould p_billes', {
    decision: {
      question: 'Pourquoi la chaîne monte-t-elle au-dessus du bécher ?',
      alternatives: [
        { libelle: 'Réaction du tas sur les maillons (α > 0)', retenue: true },
        { libelle: 'Élan de la chaîne seule (α = 0)', retenue: false, raison: 'Le bilan de quantité de mouvement donne alors h₁ = 0.' },
        { libelle: 'Rigidité de flexion de la chaîne', retenue: false, raison: 'Aucune force verticale nette au point de prise pour une chaîne souple ; effet de second ordre.' },
      ],
      raison: 'Seule une force extérieure au point de prise peut fournir la quantité de mouvement verticale manquante.',
    },
    liens: [{ genre: 'abandonne', cible: 'conj_elan' }],
  }],
  ['ch_prise', 'choix_modelisation', 'Force de prise anormale', 'Le tas pousse les maillons vers le haut au moment où ils sont mis en mouvement.', 'd_origine ~def_alpha', {
    choix: { hypothese: 'Au point de prise, le tas exerce sur la chaîne une réaction verticale : T₀ = (1 − α) λ v², α > 0.', portee: 'Condition au point de prise, puis toutes les prédictions (SP2, SP3).', alternatives: ['α = 0 : prise classique sans réaction', 'Modèle microscopique explicite des maillons'] },
  }],
  // ── SP2 · Conditions aux extrémités ──
  ['l_prise', 'lemme', 'Tension au point de prise',
    'Bilan de quantité de mouvement sur le point de prise : T₀ = (1 − α) λ v², soit T′₀ = −α λ v².', 'ax_newton +ch_prise ~def_alpha', { sp: 'bords' }],
  ['l_sol', 'lemme', 'Tension à l’arrivée au sol',
    'Au pied de la jambe descendante : T_s = β λ v², soit T′_s = −(1 − β) λ v².', 'ax_newton +ch_sol ~def_beta', { sp: 'bords' }],
  ['l_sommet', 'lemme', 'Condition au sommet',
    'Pour une fontaine étroite, l’arche du sommet porte une tension effective négligeable : T′ ≈ 0 en y = h₁.', 'l_effective ~h_etroite ~def_hauteurs', { sp: 'bords', statut: 'incertain', validation: 'ia' }],
  ['d_alpha', 'decision', 'Estimer α', 'Comment estimer le coefficient de prise α ?', 'ch_prise', {
    sp: 'bords',
    decision: {
      question: 'Comment estimer α indépendamment de la hauteur de la fontaine ?',
      alternatives: [
        { libelle: 'Simulation de maillons rigides soulevés depuis un tas', retenue: true },
        { libelle: 'Capteur de force sous le bécher', retenue: false, raison: 'Force de prise trop brève et trop faible pour le capteur disponible.' },
        { libelle: 'Ajustement sur h₁/h₂ seulement', retenue: false, raison: 'Circulaire : on veut tester la loi, pas l’ajuster.' },
      ],
      raison: 'La simulation donne α sans utiliser la hauteur mesurée, ce qui permet une vraie confrontation.',
    },
  }],
  ['calc_tiges', 'calcul', 'Simulation de maillons rigides',
    'Dynamique de 2 000 tiges rigides articulées tirées depuis un tas désordonné : α ≈ 0,10 ± 0,04 (valeur illustrative).', 'd_alpha ax_newton ~ch_prise', {
      sp: 'bords', origine: 'ordinateur', statut: 'incertain', validation: 'ia', conf: [0.62, 0.45, 0.76],
    }],
  ['exp_sol', 'experience', 'Arrivée sur sol dur ou sur mousse', 'Vitesse v mesurée pour deux surfaces d’arrivée, à h₂ fixé.', '~ch_sol', { sp: 'bords', origine: 'humain' }],
  ['obs_beta', 'observation', 'β faible', 'β ≈ 0,1 sur sol dur, ≈ 0 sur mousse (valeurs illustratives).', 'exp_sol +l_sol', {
    sp: 'bords', statut: 'incertain', validation: 'humain', conf: [0.66, 0.5, 0.8],
  }],
  // ── SP3 · Prédictions et confrontation ──
  ['p_vitesse', 'proposition', 'Vitesse de la chaîne',
    'En égalant l’invariant au point de prise et au sol : v² = g h₂ / (1 − α − β).', 'l_conserv l_prise l_sol ~def_hauteurs', { sp: 'pred' }],
  ['p_hauteur', 'proposition', 'Hauteur de la fontaine',
    'En égalant l’invariant au point de prise et au sommet : α v² = g h₁.', 'l_conserv l_prise l_sommet ~def_hauteurs', { sp: 'pred' }],
  ['thm_rapport', 'theoreme', 'Loi de la fontaine',
    'h₁ / h₂ = α / (1 − α − β) : la hauteur de la fontaine est proportionnelle à la hauteur de chute.', 'p_vitesse p_hauteur', { sp: 'pred', validation: 'ia_humain' }],
  ['calc_dim', 'calcul', 'Contrôles de cohérence',
    'Loi sans dimension ; α → 0 donne h₁ → 0 (piste abandonnée) ; α + β → 1 fait diverger v (plus de freinage).', 'thm_rapport #lt_buckingham', {
      sp: 'pred', origine: 'ia', validation: 'ia_humain',
    }],
  ['exp_film', 'experience', 'Films à haute vitesse',
    'Chaîne à billes de 50 m, h₂ de 0,5 à 2 m ; h₁ et v relevés image par image (illustratif).', '~def_hauteurs', { sp: 'pred', origine: 'humain' }],
  ['obs_lineaire', 'observation', 'h₁ proportionnelle à h₂', 'h₁ / h₂ = 0,13 ± 0,03 sur toute la gamme de h₂ (valeurs illustratives).', 'exp_film', {
    sp: 'pred', validation: 'humain', conf: [0.8, 0.7, 0.88],
  }],
  ['obs_v', 'observation', 'v² proportionnelle à h₂', 'Pente de v² contre h₂ : 11,4 ± 0,6 m·s⁻², soit 1 − α − β ≈ 0,86 (valeurs illustratives).', 'exp_film', {
    sp: 'pred', validation: 'humain', conf: [0.78, 0.68, 0.86],
  }],
  ['res_alpha', 'resultat', 'Estimation de α',
    'Les mesures donnent α ≈ 0,11 ± 0,03, compatible avec la simulation de maillons (α ≈ 0,10 ± 0,04).', 'thm_rapport obs_lineaire obs_v +obs_beta +calc_tiges', {
      sp: 'pred', statut: 'incertain', validation: 'ia_humain', conf: [0.7, 0.55, 0.82],
    }],
  ['res_explication', 'resultat', 'La fontaine vient de la réaction du tas',
    'Une réaction verticale du tas sur les maillons au point de prise (α ≈ 0,1) explique à la fois la hauteur et la vitesse observées.', 'res_alpha thm_rapport calc_dim ~d_origine ~p_forme', {
      sp: 'pred', validation: 'ia_humain', conf: [0.82, 0.72, 0.9],
    }],
]

const NOMS_DEMO: Partial<Record<TypeRaisonnement, string>> = {
  experience: 'Protocole', calcul: 'Script', observation: 'Mesure', decision: 'Délibération',
  choix_modelisation: 'Justification du choix', definition: 'Construction', conjecture: 'Heuristique', hypothese: 'Motivation',
}
const ROLES: Record<string, Premisse['role']> = { '+': 'auxiliaire', '#': 'technique', '~': 'contexte' }

function lirePremisses(texte: string): Premisse[][] {
  if (!texte.trim()) return []
  return texte.split('|').map((bloc) =>
    bloc.trim().split(/\s+/).filter(Boolean).map((t) => (ROLES[t[0]!] ? { id: t.slice(1), role: ROLES[t[0]!]! } : { id: t, role: 'principale' as const })),
  )
}

function confianceDe(statut: Statut, validation: Validation, admis: boolean): Confiance {
  if (admis) return { estimation: 0.98, bas: 0.96, haut: 0.995 }
  if (statut === 'refute') return { estimation: 0.08, bas: 0.03, haut: 0.16 }
  if (statut === 'incertain') return { estimation: 0.6, bas: 0.45, haut: 0.74 }
  return validation === 'ia' ? { estimation: 0.84, bas: 0.76, haut: 0.9 } : { estimation: 0.91, bas: 0.86, haut: 0.95 }
}

const DEBUT = Date.UTC(2026, 8, 1)
const AUTEURS = { humain: 'Camille Duparc', ia: 'IA · directeur de labo', ordinateur: 'Expérimentateur (calcul)' }

/** Raisonnement sur la fontaine de chaîne, au format des visions de raisonnement. */
export function jeuFontaine(): JeuRaisonnement {
  const connus = new Map<string, NoeudR>()
  const noeuds: NoeudR[] = []
  SPECS.forEach(([id, type, nom, enonce, texte, o = {}], k) => {
    const blocs = lirePremisses(texte)
    for (const b of blocs) for (const p of b) if (!connus.has(p.id)) throw new Error(`[fontaine] ${id} cite ${p.id}, inconnu ou défini après`)
    const admis = o.admis ?? false
    const origine: Origine = o.origine ?? (type === 'calcul' ? 'ordinateur' : admis || type === 'hypothese' || type === 'experience' ? 'humain' : k % 3 === 0 ? 'ia' : 'humain')
    const statut: Statut = o.statut ?? 'valide'
    const validation: Validation = o.validation ?? (admis ? 'humain' : statut === 'valide' ? (k % 2 ? 'ia_humain' : 'humain') : 'ia')
    const date = new Date(DEBUT + k * 0.6 * 86_400_000).toISOString()
    const auteur = AUTEURS[origine]
    const demonstrations: DemonstrationR[] = blocs.map((premisses, i) => ({
      nom: i === 0 ? NOMS_DEMO[type] ?? 'Démonstration' : `Variante ${i + 1}`,
      premisses,
      validite: statut === 'refute' ? 'invalide' : statut === 'valide' ? 'valide' : 'a_verifier',
      auteur,
      cree_le: date,
    }))
    const n: NoeudR = {
      id, nom, enonce, type, origine, auteur, cree_le: date, sousProbleme: o.sp ?? 'cadre',
      piste: o.abandon ? 'abandonnee' : 'active', statut, validation,
      confiance: o.conf ? { estimation: o.conf[0], bas: o.conf[1], haut: o.conf[2] } : confianceDe(statut, validation, admis),
      admis, demonstrations,
    }
    if (o.decision) n.decision = { ...o.decision, date, auteur }
    if (o.choix) n.choix = o.choix
    if (o.liens) n.liens = o.liens
    connus.set(id, n)
    noeuds.push(n)
  })
  return {
    titre: 'Fontaine de chaîne (effet Mould)',
    resume: 'Pourquoi une chaîne tirée d’un bécher s’élève au-dessus du bord : réaction du tas au point de prise, h₁/h₂ = α/(1 − α − β). Mesures illustratives.',
    sousProblemes: SOUS_PROBLEMES,
    noeuds,
    source: 'synthetique',
  }
}
