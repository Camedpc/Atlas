# Pilotage de l'écran du graphe (P3 → écran, P4)

Programme déterministe : il exécute des `LotCommandes` (P3, `protocoles/`) et exporte l'`EtatAffichage` (P4).
Aucun appel à un modèle. Même suite de lots depuis le même état = même écran.

| Fichier | Rôle |
|---|---|
| `protocole.ts` | Types P1–P4 et validation (ajv, compilée depuis `protocoles/*.schema.json`) |
| `etat.ts` | Modèle pur : `appliquer(etat, commande, index)` → état visé + effet, ou `ErreurProtocole` ; `appliquerLot` (atomique) |
| `adaptateur.ts` | `synchroniser(etat)`, `jouer(effet)`, `exporter()` ; seul endroit qui traduit id de nœud ↔ point du moteur |
| `pilote.ts` | File des lots, validation, idempotence (`lot_id`), compte rendu, états vers les abonnés (≤ 4/s) |
| `client.ts` | Relais d'AtlasVoice (`VITE_AFFICHAGE_URL`) : déclare l'écran, lit le flux des lots (fetch + SSE), renvoie comptes rendus et états ; reconnexion automatique |
| `filtres.ts` | `EtatFiltres` appliqués par réducteur de point (`masquer` / `estomper`) |

- Les actions de l'application (case « cette conversation », liens et fermeture du détail, panneau des
  conversations, Recentrer, Recharger) passent par des lots `origine: 'interface'`. Les gestes dans le
  moteur (clic, clavier, barre) le modifient directement : `exporter()` lit donc l'écran réel.
- Caméra exportée = caméra **visée** (fin d'animation) : l'état est exact dès la fin d'un lot. Zoom et orbite
  se composent avec la cible visée ; la taille de la scène est relue après chaque commande
  (`ajusterDimensions`), pour que les cadrages ne dépendent pas du minutage.
- Console : `atlasAffichage.executer(atlasAffichage.lot([{ op: 'mode', mode: '3d' }]))`, `atlasAffichage.etat()`.
- Tests : `npm test --prefix frontend` (modèle pur, contrat), `npm run e2e --prefix frontend` (Playwright :
  données fixes, un lot, capture de référence dans `e2e/*-snapshots/`, rejouabilité, aller-retour `restaurer`).
