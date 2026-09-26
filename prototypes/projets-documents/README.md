# Projets, sessions et documents — dix propositions

Maquettes cliquables (HTML + modules ES, sans build) pour choisir la future organisation d'Atlas :
choisir un projet à l'ouverture, retrouver ses sessions, et parcourir le bunker de l'utilisatrice
(`espace/utilisateurs/<utilisateur>/<projet>/sessions/<id>/…`) dans une vue **Documents** du panneau de droite,
avec aperçu des PDF, Markdown (formules KaTeX), images, CSV et scripts.

## Lancer

```bash
python prototypes/projets-documents/serveur.py        # http://localhost:8767 (port en argument si besoin)
```

Le serveur désactive le cache : une modification se voit au simple rechargement. Marked et KaTeX viennent de
cdn.jsdelivr.net (connexion nécessaire pour l'aperçu Markdown).

## Propositions

| # | Dossier | Idée |
|---|---|---|
| 01 | `options/01-espaces` | Écran d'accueil des projets comme espaces (Slack, Linear), changement d'espace en tête de barre latérale |
| 02 | `options/02-projets-claude` | Page projet façon Claude Projects : instructions, fichiers du projet, sessions |
| 03 | `options/03-ariane` | Fil d'Ariane camille › projet › session › fichier, Documents en colonnes façon Finder |
| 04 | `options/04-explorateur` | Barre d'activité et éditeur à onglets façon VS Code |
| 05 | `options/05-par-agent` | Documents groupés par session et par agent auteur, filtrés depuis l'arbre des agents |
| 06 | `options/06-bibliotheque` | Grille de vignettes avec filtres par type et visionneuse plein cadre |
| 07 | `options/07-palette` | Palette de commandes Ctrl+K comme navigation principale |
| 08 | `options/08-tableau-de-bord` | Tableau de bord de projet : sessions, rapports, figures, état du graphe |
| 09 | `options/09-contexte` | Documents épinglés au contexte de la conversation, mention @ |
| 10 | `options/10-chronologie` | Chronologie datée des fichiers produits par les agents |

Le détail (ce que chaque option optimise, ses limites) est sur la page d'accueil `index.html`.

## Organisation

- `commun/donnees.js` : utilisatrice, 4 projets, 8 sessions et leur fil factice.
- `commun/bunker/utilisateurs/camille/` : les vrais fichiers d'exemple ; `commun/manifeste.js` les décrit
  (taille, date, agent auteur, session). Les deux sont produits par `outils/generer_bunker.py` (matplotlib) :
  ne pas modifier le manifeste à la main, relancer le script.
- `commun/bunker.js` (arborescence, icônes, composant d'arbre), `commun/apercu.js` (aperçus),
  `commun/ui.js` (barre du prototype, fil, arbre des agents, saisie, panneau de droite à trois onglets),
  `commun/base.css` (jetons et composants de `frontend/src/style.css`).
- Les onglets « Graphe de raisonnement » et « Agent graph » sont des emplacements factices.
