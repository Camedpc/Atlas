# Graphe de l'application

Moteur « graphe de raisonnement » porté depuis `prototypes/graphe-3d/src/raisonnement/` (et les modules de
`src/core` qu'il utilise), base visuelle **r0 · Référence**. Le prototype reste le laboratoire ; son guide
(`prototypes/graphe-3d/src/raisonnement/README.md`) vaut pour ce code, avec ces différences :

| Fichier | Rôle |
|---|---|
| `vueAtlas.ts` | La vue dans l'application : réglages, thème du système, filtre de conversation, sélection par id |
| `donneesAtlas.ts` | Adaptateur P5 : `GET /api/graphe` → modèle du moteur ; seul fichier qui connaît les deux formats |
| `raisonnement/` | Moteur porté : dérivation de lecture, disposition, vue sigma 2D / 3D, fiche, barre |
| `core/` | Caméra 3D, contrôles, gizmo, réglages, animations, couleurs (`couleurs.ts` : `rgba`, `rgbaGL`) |

- Modèle Atlas : cinq statuts (`etabli`…`ouvert`), validité et confiance **par démonstration** ; type
  déduit (`typeDeduit`), rôles de prémisses « principale » tant que la base ne les stocke pas.
- Pas de jeu synthétique : la vue reçoit toujours un `jeu` ; `remplacerJeu(jeu)` recharge les données sans
  perdre caméra, mode, stratégie ni sélection (retrouvée par id).
- Panneau ☰ et réglages Tweakpane : en développement seulement (`import.meta.env.DEV`).
- Couleurs WebGL translucides uniquement via `rgbaGL` (alpha prémultiplié).
- Filtres (`../pilotage/filtres.ts`) : réducteur de point, `masquer` ou `estomper`.
