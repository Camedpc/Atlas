# Protocoles de la chaîne voix → commandes → affichage

Contrats entre les briques décrites dans `CAHIER-DES-CHARGES.md` (section 3). Chaque liaison a un JSON Schema
(draft 2020-12) ; **ces schémas font foi**. Les modèles Python et les types TypeScript en sont des miroirs.

| Fichier | Liaison | Émetteur → destinataire |
|---|---|---|
| `commun.schema.json` | — | Références (`RefNoeud`, `RefConversation`, `Cible`), `ErreurProtocole`, `EtatFiltres`, `ParametresLecture`… |
| `p1-tache.schema.json` | P1 | Atlas vocal → registre : champs ajoutés à la tâche (`navigateur`, `extrait`, `contexte.affichage`) |
| `p2-lot-navigation.schema.json` | P2 | Agent moyen 2 → agent navigateur (`LotNavigation`) |
| `p3-lot-commandes.schema.json` | P3 | Agent navigateur, interface ou test → écran (`LotCommandes`) |
| `p3-compte-rendu.schema.json` | P3 (retour) | Écran → émetteur du lot (`CompteRendu`) |
| `p4-etat-affichage.schema.json` | P4 | Écran → relais (`EtatAffichage`, et `$defs/EtatResume` pour P1) |

## Test de contrat

`exemples/<schéma>/valides/*.json` doivent être acceptés et `exemples/<schéma>/invalides/*.json` refusés, à la
fois par le schéma et par chaque implémentation :

- Python : `AtlasVoice/backend/app/affichage/protocole.py` (Pydantic strict), testé par
  `AtlasVoice/backend/tests/test_protocoles.py` (qui valide aussi les schémas eux-mêmes) ;
- TypeScript : `frontend/src/pilotage/protocole.ts` (types + validation `ajv` compilée depuis ces schémas),
  testé par `frontend/src/pilotage/protocole.test.ts` (`npm test --prefix frontend`).

Modifier un protocole = modifier le schéma, les deux miroirs et ajouter des exemples (un valide, un invalide).
Un changement incompatible incrémente `version`.

## Règles communes

- JSON UTF-8, champ `version` (1), champs en `snake_case` français, dates ISO 8601 (UTC pour les horodatages).
- Tout objet refuse les champs inconnus. Un champ facultatif est **absent**, jamais `null`, sauf si le schéma
  autorise `null` (ex. `selection`, `fiche`, `filtres.conversation`).
- Identifiants stables uniquement : `noeuds.id` (slug `^[a-z0-9_]+$`) et UUID de conversation. Jamais d'index
  de point du moteur.
- Un message invalide est refusé avec une `ErreurProtocole` (`code: 'invalide'`), jamais ignoré.

## Précisions par rapport au cahier des charges

- `noeuds.id` est un slug lisible (contrainte de la migration `init`), pas un UUID : `RefNoeud.noeud` suit la base.
- Les clés de `ParametresLecture` sont en `snake_case` (`longueur_max_chaine`) ; l'adaptateur du front les
  traduit vers les noms du moteur (`longueurMaxChaine`).
- `emis_le` (facultatif) sur les lots et les comptes rendus, pour mesurer la latence de chaque saut.
- `CompteRendu` : `erreur` (facultative) pour une erreur du lot entier, et `etat` facultatif, absent seulement
  quand l'écran n'a pas répondu (`delai`) ou n'existe pas (`introuvable`).
- `LotCommandes.commandes` peut être vide : le compte rendu renvoie alors l'état courant.
- `filtres` (P3) fusionne superficiellement : chaque clé présente remplace la valeur courante (`periode` entière).
- Bornes : 20 intentions par `LotNavigation`, 50 commandes par `LotCommandes`, `zoomer.facteur` dans ]0, 100],
  `orbiter` dans ±360° (azimut) et ±180° (élévation).
