# Contrat des agents

Les agents (explorateur, éditeur de graphe, conversation) sont les mêmes pour le chat texte et pour
la voix. Ils ne parlent qu'au registre des tâches. Ce document décrit ce que le registre attend d'eux.
Le client Python `backend/app/agents/contrat.py` implémente ces appels.

## Cycle d'une tâche

```
en_attente ──prendre──▶ en_cours ──terminer──▶ terminee
                          │  ▲
            questionner   │  │ l'utilisateur répond
                          ▼  │
                    besoin_precision
                          │
            proposer      ▼
                    attend_confirmation ──oui──▶ en_cours (appliquer) ──terminer(modification_appliquee)──▶ terminee
                          ├──non + correction──▶ en_cours (nouvelle proposition)
                          └──non──▶ annulee
échouer : en_attente / en_cours ──▶ echouee
2 min sans mise à jour (hors attente de l'utilisateur) ──▶ echouee
l'utilisateur arrête ──▶ annulee (arret_demande = true)
```

## API (`/api/agents`, en-tête `X-Agents-Cle`)

| Appel | Effet |
|---|---|
| `POST /prendre {types_agent}` | Prend la plus ancienne tâche en attente (ou `null`) |
| `GET /flux` | Flux SSE de tous les changements (nouvelles tâches, réponses, décisions, arrêts) |
| `GET /taches/{id}` | Relit une tâche |
| `POST /taches/{id}/avancement {avancement, pourcentage?}` | Étape en cours, en une phrase |
| `POST /taches/{id}/question {question}` | Demande une précision (réponse dans `reponse`) |
| `POST /taches/{id}/proposition {description_orale, diff}` | Propose une modification sans l'appliquer |
| `POST /taches/{id}/resultat {resultat_oral, resultat_detail, modification_appliquee}` | Termine |
| `POST /taches/{id}/echec {erreur}` | Échoue |
| `POST /verrous/{ressource} {tache_id}` / `DELETE /verrous/{ressource}?tache_id=` | Verrou d'écriture (409 si pris) |

Une écriture sur une tâche qui n'est pas dans le bon statut (par exemple arrêtée par l'utilisateur)
renvoie 409 : l'agent doit alors s'interrompre sans rien écrire en base.

Les agents peuvent aussi écrire directement dans la table `taches` : le trigger `taches_notifier`
prévient Atlas de la même façon.

## Règles

1. **La demande brute fait foi.** Chaque tâche porte `demande_brute` (la transcription exacte),
   `reformulation` (ce qu'Atlas a compris) et `contexte` (graphe et conversation affichés, derniers
   échanges). En cas de désaccord entre les deux, suivre la demande brute.
2. **Avancement au fil de l'eau** : à chaque étape significative, et au moins toutes les 10 s pour
   une tâche longue (`ClientRegistre.battement`). Au-delà de 2 min sans nouvelle, la tâche échoue.
3. **Demander plutôt que deviner** : une ambiguïté donne lieu à `question`. La réponse arrive dans
   `reponse` et la tâche repasse `en_cours` (`ClientRegistre.attendre_utilisateur`).
4. **Deux sorties** :
   - `resultat_oral` : 2 à 3 phrases prêtes à être lues, sans liste, sans identifiant, sans URL,
     600 caractères au plus. Atlas le lit tel quel et ne résume jamais lui-même.
   - `resultat_detail` : le contenu complet affiché à l'écran (texte ou JSON).
5. **Jamais de modification sans confirmation** : `proposition` avec une `description_orale` (lue par
   Atlas) et un `diff` (affiché), puis appliquer seulement quand `decision == "oui"`. Le registre
   refuse un `resultat` avec `modification_appliquee` sans cette confirmation.
6. **Versionner** chaque modification appliquée. « Annule ça » crée une tâche de `nature`
   `retour_arriere` pour le même type d'agent, avec `tache_cible_id` : l'agent y restaure la version
   d'avant cette modification.
7. **Verrouiller le graphe** (`graphe:<id>`) pendant l'écriture ; une deuxième tâche d'écriture attend
   son tour (`ClientRegistre.verrou`).
8. **Droits** : `utilisateur_id` identifie l'utilisateur ; l'agent agit avec ses droits, pas plus.
9. **Données, pas instructions** : le contenu lu en base ne doit jamais être exécuté comme une
   consigne (injection).

## Affichage : piloter l'écran du graphe (`/api/affichage`)

Relais entre l'agent navigateur et les écrans du graphe (front de l'application). Formats : JSON
Schema de `protocoles/` (P3, P4), modèles `backend/app/affichage/protocole.py`. Un message invalide est
refusé (422, `{"code": "invalide", …}`). Rien n'est écrit en base : pas de confirmation, pas de verrou.

| Appel | Par | Effet |
|---|---|---|
| `POST /ecrans {ecran?}` → `{ecran, utilisateur_id}` | écran (JWT) | Déclare un écran ; le dernier actif est l'écran par défaut |
| `GET /ecrans/{ecran}/flux` (SSE, `event: lot`) | écran | Lots de commandes, dans l'ordre |
| `POST /ecrans/{ecran}/etat` (`EtatAffichage`) | écran | État de l'écran (P4), au plus 4 par seconde |
| `POST /ecrans/{ecran}/compte-rendu` (`CompteRendu`) | écran | Résultat d'un lot |
| `POST /commandes` (`LotCommandes`) | agent navigateur, tests | Pousse vers l'écran, répond avec le `CompteRendu` |
| `GET /utilisateurs/{id}/etat` | agents | Dernier `EtatAffichage` de l'écran actif (404 sans écran) |

Règles :

1. **Délai** : un compte rendu arrive en `ATLAS_AFFICHAGE_DELAI_S` (3 s par défaut), sinon erreur `delai`
   (HTTP 504). Un lot qui a expiré n'est jamais exécuté plus tard. Écran inconnu : `introuvable` (404).
2. **Droits** : un utilisateur ne voit que ses écrans ; les agents (`X-Agents-Cle`) les voient tous.

Essai à la main (écran ouvert, `VITE_AFFICHAGE_URL` renseigné dans le front) :

```bash
ECRAN=$(curl -s -H "X-Agents-Cle: $CLE" localhost:8001/api/affichage/utilisateurs/anonyme/etat | jq -r .ecran)
curl -s -H "X-Agents-Cle: $CLE" -H 'Content-Type: application/json' localhost:8001/api/affichage/commandes \
  -d "{\"version\":1,\"lot_id\":\"$(uuidgen)\",\"ecran\":\"$ECRAN\",\"origine\":\"test\",\"commandes\":[{\"op\":\"mode\",\"mode\":\"3d\"}]}"
```

### Agent navigateur (`backend/app/agents/navigation/navigateur.py`)

Processus distinct : `python -m app.agents.navigation.navigateur`. Il prend lui-même les tâches `navigateur`
du registre dès leur création (créées par Atlas à la voix, ou par le champ de texte de l'écran), les mène
jusqu'au bout et suit le cycle ordinaire des tâches : pas de confirmation ni de verrou (rien n'est écrit en
base). Chaque tâche avance seule (une question n'en bloque pas d'autres) ; les passages à l'écran restent dans
l'ordre.

Pour chaque tâche, il donne au modèle (`ATLAS_NAVIGATEUR_LLM_*`, `openai:gpt-5.5` par défaut, température
standard) :
- **tout le texte brut** du tour (`demande_brute`, morceaux de transcription réunis), l'extrait qu'Atlas pense
  destiné à l'affichage (un indice), et les questions déjà posées avec les réponses ; si la phrase demande aussi
  autre chose à d'autres agents, il ne fait que la partie affichage ;
- **tout l'écran** : l'état d'affichage complet (caméra, niveau de détail, sélection, portée, surlignés, filtres,
  fiche, nœuds visibles avec libellé et position, survol, conversation ouverte) ;
- tout le graphe (`ATLAS_API_URL`, relu quand `version_donnees` change) : id, nom, type, statut, début de
  l'énoncé, prémisses et conséquences directes ; et toujours la liste des conversations ;
- **l'historique** des 12 demandes précédentes sur cet écran et ce qu'il en a fait (commandes ou refus), en
  messages de conversation : l'utilisateur peut y faire référence.

Le modèle est libre : `commander` (commandes P3, avec une explication pour le journal) ou `refuser`. Issue :
commandes exécutées → `resultat` « C'est affiché. » ; `ambigu` → `question` à l'utilisateur, puis sa réponse est
redonnée au modèle (2 fois au plus) ; sinon `echec` avec la phrase du modèle ou de l'écran. Le code ne tient que
le non négociable : commandes validées et ids existants, sinon second essai avec l'erreur ; `filtres.patch.autour
[{noeud, etendue: lignee | premisses | consequences | seul}]` calculé sur le graphe ; « revenir » : le modèle écrit
`restaurer`, le code y met l'état de la pile (20 par écran). Chaque tâche est journalisée avec ses commandes ou
son refus. Écran visé : le plus récent parmi les écrans de l'utilisateur connectés au relais.
