# V0 · Référence

Variante sobre, thème clair, qui sert d'exemple d'utilisation du moteur (`src/core`).

## Ce qu'elle montre

- `reducteursNoeud` : la bordure d'une feuille encode qui a validé (aucune / IA / humain / IA + humain),
  sauf quand la lignée ou le survol imposent leur propre bordure.
- `dessinerDessous` : halo d'incertitude, rayon = taille + largeur de l'intervalle de confiance.
  Tracé groupé par (statut, palier d'opacité) pour rester rapide.
- `dessinerDessus` : repères d'axes (mois en vue de face, types en vue de droite, domaines sur le
  bord gauche) dont l'opacité suit `vue.poidsFaces` : ils apparaissent quand la face tourne.
- `reglagesSupplementaires` : dossier « Variante V0 » du panneau Tweakpane (halo, bordure, repères).
- `panneau` : section « Variante V0 » (état courant, bascules thème / 2D-3D / faces-cube).
- `window.atlasVue` : la vue, pour expérimenter depuis la console.

## Limites

- Libellés : grille de sigma, des chevauchements restent possibles entre voisins proches.
- Les repères de domaines sont placés au barycentre Z de chaque domaine en disposition « face ».
