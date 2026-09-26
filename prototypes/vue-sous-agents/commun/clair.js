// Couleurs de rôle pour le thème clair : contraste suffisant sur fond blanc (texte et traits).
// Les couleurs de ROLES (simulation.js) sont pensées pour le fond sombre.

export const COULEURS_CLAIR = {
  orchestrateur: '#27272a',
  directeur_de_labo: '#b45309',
  litterature: '#0f766e',
  experimentateur: '#6d28d9',
  graphiste: '#be185d',
  verificateur: '#15803d',
  recours: '#a16207',
}

export const couleurClair = (role) => COULEURS_CLAIR[role] || '#52525b'
