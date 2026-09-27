// R41 · Copie de r35-latex-pgfplots/mesures.ts.
//
// R35 · Champ optionnel `mesures` : séries de points qu'un agent expérimentateur attacherait à un énoncé
// (observation, expérience, calcul). Lu de deux façons, dans cet ordre :
//   1. `noeud.mesures` s'il existe (champ optionnel d'un NoeudR, non typé par src/raisonnement) ;
//   2. la table ci-dessous, par jeu puis par identifiant de nœud.
// Les symboles `x` et `y` s'écrivent comme dans les énoncés (« h₂ », « v² ») : c'est ainsi qu'une série est
// appariée à une loi extraite d'un énoncé (voir graphiques.ts).
//
// Jeu « fontaine » : points ILLUSTRATIFS, tirés pour être cohérents avec les énoncés du jeu
// (h₁ / h₂ = 0,13 ± 0,03 ; pente de v² contre h₂ : 11,4 ± 0,6 m·s⁻² ; h₂ de 0,5 à 2 m). Pas des données publiées.

export interface SerieMesuree {
  x: string
  y: string
  uniteX: string
  uniteY: string
  /** [x, y, incertitude sur y (±, 1σ)]. */
  points: [number, number, number][]
  note?: string
}

export const MESURES: Record<string, Record<string, SerieMesuree[]>> = {
  fontaine: {
    obs_lineaire: [{
      x: 'h₂', y: 'h₁', uniteX: 'm', uniteY: 'm',
      points: [
        [0.5, 0.068, 0.012], [0.75, 0.094, 0.014], [1.0, 0.135, 0.016], [1.25, 0.158, 0.018],
        [1.5, 0.199, 0.021], [1.75, 0.224, 0.024], [2.0, 0.262, 0.027],
      ],
      note: 'hauteur du sommet relevée image par image (illustratif)',
    }],
    obs_v: [{
      x: 'h₂', y: 'v²', uniteX: 'm', uniteY: 'm²·s⁻²',
      points: [
        [0.5, 5.8, 0.6], [0.75, 8.4, 0.75], [1.0, 11.6, 0.9], [1.25, 14.1, 1.05],
        [1.5, 17.3, 1.2], [1.75, 19.8, 1.35], [2.0, 22.9, 1.5],
      ],
      note: 'vitesse de la chaîne relevée image par image (illustratif)',
    }],
  },
}
