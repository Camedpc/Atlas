# Atlas vocal

Mode vocal de l'application Atlas : Atlas écoute, comprend l'intention, confie le travail à des agents
spécialisés via un **registre des tâches**, et lit les résultats. Il ne touche jamais lui-même à la base
ni au graphe.

```
Navigateur ── audio Opus (WebSocket) ──▶ Couche vocale (Gradbot : Gradium STT/TTS + modèle d'Atlas)
   │  « Hey Atlas » détecté en local                │ 6 outils, tous vers le registre
   │                                                ▼
   └── événements des tâches (SSE) ◀──────── Registre des tâches (Postgres + LISTEN/NOTIFY)
                                                    ▲            │
                              Chat texte ───────────┘            ▼
                                                    Agents (explorateur, éditeur de graphe, conversation)
                                                                 │
                                                                 ▼ base de données
```

Atlas n'a aucune flèche vers la base de données.

## Contenu

| Dossier | Rôle |
|---|---|
| `backend/app/registre` | Registre des tâches : modèle, transitions, stockage mémoire et Postgres, verrous, expiration à 2 min |
| `backend/app/voix` | Session vocale Gradbot, prompt d'Atlas, les 6 outils |
| `backend/app/llm` | Proxy compatible OpenAI entre Gradbot et le modèle : bascule sur le secours au-delà de 1,5 s, mesure du TTFT, adaptateur Claude (SDK Anthropic) |
| `backend/app/api` | API HTTP : tâches (interface, chat texte), agents, flux SSE, métriques, relecture des sessions |
| `backend/app/agents/contrat.py` | Client du registre pour les agents (le contrat de la section 4.3). **Aucun agent n'est fourni.** |
| `frontend` | Client web : micro, mot-clé local (openWakeWord + onnxruntime-web), lecture de la voix, tâches, tableau de bord |
| `../supabase/migrations/20260926000000_registre_taches.sql` | Tables `taches`, `taches_evenements`, `verrous`, trigger de notification (même base que l'application Atlas) |
| `bench` | 150 énoncés annotés (20 % de pièges), passage par Gradium STT, benchmark des modèles |

## Démarrer en local

Toutes les commandes se lancent depuis `AtlasVoice/` (sauf la migration, depuis la racine d'Atlas).

```bash
cp .env.example .env    # renseigner GRADIUM_API_KEY et ANTHROPIC_API_KEY
```

Back (Python 3.13) :

```bash
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8001
```

Back sur le port 8001 et front sur le port 5174, pour cohabiter avec le back (8000) et le front (5173)
d'Atlas. Front :

```bash
cd frontend
npm install
npm run mot-cle         # modèles openWakeWord dans public/wakeword
npm run dev
```

Sans `DATABASE_URL`, le registre vit en mémoire : pratique pour essayer, perdu au redémarrage.
Sans modèle `hey_atlas.onnx`, l'activation se fait au bouton ou avec Alt+A ; pour tester le mot-clé
avant d'avoir entraîné « Hey Atlas », mettre `VITE_MOT_CLE_MODELE=hey_jarvis_v0.1.onnx` dans
`frontend/.env.local` (voir [docs/mot-cle.md](docs/mot-cle.md)).

Registre sur Supabase : appliquer la migration depuis la racine d'Atlas, puis définir `DATABASE_URL`
(connexion directe ou *session pooler*, nécessaires à LISTEN/NOTIFY).

```bash
npm run db:push        # depuis Atlas/
```

Tests :

```bash
backend/.venv/Scripts/python -m pytest backend
npm --prefix frontend test
```

## Comment la délégation reste fluide

Gradbot permet à un outil d'envoyer **plusieurs résultats** tant que son appel reste ouvert, et ne
fait parler le modèle d'un nouveau résultat que lorsque l'utilisateur se tait. Atlas s'en sert ainsi :

1. `lancer_tache` crée la tâche et répond tout de suite (moins de 100 ms) : Atlas dit « je lance
   l'explorateur ».
2. L'appel reste ouvert. La session s'abonne aux changements de la tâche dans le registre.
3. Quand l'agent pose une question, propose une modification, termine ou échoue, le nouvel état part
   sur ce même appel. Atlas le lit au prochain silence, sans couper la parole.
4. À l'état final, l'appel est fermé. `repondre_agent` et `confirmer` rouvrent le suivi de la tâche.

Les tâches vivent dans le registre, pas dans la session : si l'audio coupe, le client rouvre une
session et Atlas annonce d'emblée ce qui a changé entre-temps.

## Cycle de vie côté navigateur

- **attente** : micro ouvert, analysé en local par le mot-clé ; rien n'est envoyé.
- **écoute** : après « Hey Atlas » (son court + indicateur). La seconde audio qui précède le réveil
  est envoyée aussi, pour ne pas perdre le début de la demande.
- **veille** : après 8 s de silence ou « merci Atlas » / « stop », si une tâche tourne encore :
  la session reste ouverte mais seul du silence est transmis. Atlas reprend la parole à l'arrivée
  du résultat, et l'écoute se rouvre.
- Sans tâche en cours, la session se ferme et on revient en attente.

## Choix du modèle d'Atlas

Par défaut : `claude-haiku-4-5` (via le SDK Anthropic), sans raisonnement. Tout modèle compatible
OpenAI se configure par variables d'environnement, avec un secours facultatif
(`ATLAS_LLM_SECOURS_*`). Le choix définitif se fait avec le benchmark :

```bash
backend/.venv/Scripts/python bench/transcrire.py     # facultatif : transcriptions Gradium réelles
backend/.venv/Scripts/python bench/lancer_bench.py
```

Il affiche l'exactitude (outil et arguments, type d'agent, pièges), le TTFT p50/p95 et le coût pour
1 000 tours, puis recommande un modèle principal et un modèle de secours. Les candidats se règlent dans
`bench/modeles.json`. Les prix et les noms de version marqués « à vérifier » sont à compléter.

## Brancher le reste

- **Agents** : à écrire côté chat principal, sur le contrat de [docs/contrat-agents.md](docs/contrat-agents.md).
  En leur absence, une tâche vocale reste « en attente », puis passe en échec au bout de 2 minutes
  et Atlas le signale.
- **Chat texte** : créer ses tâches par `POST /api/taches` (canal `texte`). Elles suivent alors le
  même chemin que celles lancées à la voix.
- **Application Atlas** : le client vocal attend le JWT Supabase de l'utilisateur (`definirJeton`
  dans `frontend/src/api.ts`) et le graphe ou la conversation affichés (`definirContexte`). Dans
  cette version autonome, deux champs de l'en-tête les simulent.

## Correspondance avec le cahier des charges

| Jalon | État |
|---|---|
| J1 Boucle vocale | Gradbot + Gradium (endpoint UE, voix française), barge-in et tours gérés par Gradbot |
| J2 Registre | Tables, événements (NOTIFY + SSE), API du chat texte |
| J3 Délégation | 6 outils, suivi par appel différé, notification de fin. Agent explorateur : non créé (consigne) |
| J4 Modifications | Confirmation obligatoire (refusée par le registre sinon), retour en arrière, verrous. Éditeur de graphe : non créé |
| J5 Mot-clé | Détection locale openWakeWord, veille pendant les tâches. Modèle « Hey Atlas » à entraîner |
| J6 Benchmark | Jeu de 150 énoncés, banc de mesure, secours automatique, tableau de bord, journaux rejouables |
