# Graphe de raisonnement — cahier de conception

Branche `visu/graphe-raisonnement` (worktree `Hackathon/Atlas-raisonnement`). Tout le nouveau travail
vit dans `prototypes/graphe-3d/` sous `src/raisonnement/` (partagé) et `raisonnement/<id>/` (visions).
Ne pas modifier `src/core/` ni `variantes/` (la série précédente reste consultable telle quelle).

## 1. Le problème

La série précédente affiche tout le graphe des démonstrations : trop de points, organisation peu claire.
Un chercheur ne lit pas un graphe de dépendances exhaustif ; il lit **un raisonnement**.

## 2. Deux graphes

1. **Graphe de justification** (existant) : toutes les prémisses de toutes les démonstrations. Exhaustif,
   sert à la vérification et au calcul de validité. Jamais affiché tel quel par défaut.
2. **Graphe de lecture** (affiché) : dérivé du premier. Un lien parent → enfant n'existe que s'il
   correspond à une **déduction naturelle pour un humain** (« de A et B, on déduit C »). Les prémisses
   de contexte (définitions, axiomes, lemmes techniques, notations, hypothèses générales) ne deviennent
   pas des arêtes : elles sont rattachées autrement (pastilles, notes, panneau), ou visibles à la demande.

Comment dériver le graphe de lecture est **la question à explorer**. Pistes : rôle de chaque prémisse
(principale / auxiliaire / contexte) annoté par l'agent qui écrit la démonstration ; réduction
transitive ; fusion des chaînes linéaires en « étapes » ; repli des sous-arguments ; importance.

## 3. Progression gauche → droite

- À gauche : hypothèses, prémisses, données, définitions de départ.
- Vers la droite, petit à petit : les étapes du raisonnement, jusqu'aux résultats.
- L'axe horizontal est une **profondeur logique** (rang dans le raisonnement), pas le temps.

## 4. Décisions et choix de modélisation

Des nœuds dédiés, **clairement visibles** sur le graphe :
- **Décision** : un choix fait pendant la recherche (ex. « on abandonne l'approche par compacité »),
  avec les alternatives envisagées, celle retenue, la raison.
- **Choix de modélisation** : une hypothèse de travail qui conditionne la suite (ex. « bruit gaussien »,
  « schéma implicite », « domaine borné »). Tout ce qui en dépend doit pouvoir être retrouvé.

## 5. 2D d'abord, 3D en option

- Le mode normal est **2D** : pan, zoom, survol, clic.
- Une bascule **3D** passe en **vue de côté** : le graphe 2D (x = progression, y = disposition) est
  extrudé en profondeur, **la profondeur = le type de nœud** (hypothèse, définition, choix de
  modélisation / décision, assertion / lemme, expérience, calcul machine, résultat). La caméra pivote
  pour montrer ces couches. Navigation façon Blender (réutiliser `src/core/camera3d.ts`,
  `controles.ts`, `gizmo.ts` si pertinent).

## 6. Toujours valables (série précédente)

Lisibilité au survol avant tout (fiche claire), thème clair prioritaire, style scientifique et
professionnel, statut validé / incertain / réfuté + validation IA / humain / IA+humain + intervalle de
confiance, lignée au clic, panneau gauche via ☰, réglages Tweakpane, sigma.js + graphology.

## 7. Organisation

```
prototypes/graphe-3d/
├── RAISONNEMENT.md            ce fichier
├── src/raisonnement/          fondations partagées (données, dérivation, disposition, rendu de base)
└── raisonnement/<id>/         une vision = index.html + main.ts + style.css + meta.json + NOTES.md
```
