# R0 · Référence

Vision sobre qui montre toutes les fondations de `src/raisonnement`, sans recherche esthétique.
Base de comparaison pour les autres visions.

## Ce qu'on voit

- **Graphe de lecture** (stratégie par défaut a + b + c) disposé de gauche à droite avec dagre, rangs
  « ancrés » : fondations (hypothèses, définitions, choix) au rang 0, résultats terminaux au dernier rang.
  L'axe des rangs est étiré au format de l'écran.
- **Compteur** en bas à gauche avec le **sélecteur de stratégie** : « Graphe complet : 224 nœuds /
  618 arêtes → lecture : 160 / 233 » pour le jeu synthétique.
- **Formes** : décision = losange, choix de modélisation = hexagone, hypothèse / axiome = carré,
  conjecture = triangle, étape fusionnée = capsule. Couleur = couche de type, bordure = statut.
- **Pastilles** à gauche des nœuds (au zoom) : prémisses rattachées comme contexte, couleur = rôle.
- **Liens sémantiques** : la contradiction (« Pente 0,26 » contredit « Ordre 1/2 sans correction »),
  sa résolution (« Ajouter la correction d'Itô » résout) et l'abandon de la piste de compacité.
- **Survol** : fiche (type, sous-problème, énoncé, statut, validation, intervalle de confiance,
  alternatives d'une décision, portée d'un choix, chaîne d'une étape, contexte rattaché).
- **Clic** : lignée dans le graphe de lecture (ancêtres orange, descendants violets).
- **Liens complets** (`L`) : toutes les arêtes de justification par-dessus, colonne « Contexte pur » à gauche.
- **3D** (`T`) : couches de type écartées en profondeur, vue de côté, navigation Blender, retour 2D.

## Points d'extension démontrés

1. Réducteur de nœud : bordure = validation (réglage « bordure = validation », dossier Vision R0).
2. Calque dessous : repères des rangs logiques (posés sur la couche avant en 3D).
3. Fiche enrichie : rang logique et validation ajoutés à la fiche par défaut.
4. Section de panneau « Vision R0 » : état (mode, stratégie, survol, sélection) et boutons.

## Limites

- Avec ~160 unités, les libellés longs se chevauchent quand tout est cadré ; zoomer les sépare.
- La vue de côté 3D reste chargée : elle sert à lire les couches, pas à remplacer la 2D.
- ELK (bouton « Moteur dagre / ELK ») produit plus de rangs que dagre ancré.
