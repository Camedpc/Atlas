# Atlas · voix en direct

Prototype autonome d'agent vocal en direct, façon mode vocal de ChatGPT : on parle en continu, on coupe la
parole à l'agent, on lui donne des consignes, et il lance des commandes, des outils et des sous-agents.
Écrit de zéro, indépendant du reste d'Atlas (et d'`AtlasVoice/`), pour être testé en local avant intégration.

```
navigateur ── micro PCM 24 kHz (WebSocket) ──▶ serveur voix-live ── audio ──▶ Gradium STT (VAD sémantique)
    ▲                                              │  texte du tour
    │ voix PCM 48 kHz                              ▼
    └────────────── Gradium TTS ◀── phrases ── thread Codex vocal (gpt-5.6-luna, tier fast)
                                                   │ terminal, recherche web, MCP `taches`
                                                   ▼
                                           tâches de fond = threads Codex (gpt-6-sol), sous-agents natifs
```

## Lancer

Depuis `voix-live/`, avec le venv d'Atlas (il a déjà `openai-codex`, `fastapi`, `websockets`, `mcp`) :

```bash
cp .env.example .env          # renseigner GRADIUM_API_KEY
../.venv/Scripts/python -m uvicorn voix.serveur:app --port 8010
```

Puis ouvrir http://localhost:8010 dans Chrome, « Démarrer la conversation », autoriser le micro, et parler.
Codex utilise la connexion ChatGPT d'Atlas (`espace/.codex`) : si elle manque,
`python -m atlas.orchestrateur.connexion` depuis la racine.

## Comment ça marche

- **Écoute continue** : le micro part en continu vers Gradium STT (`language: fr`, `delay_in_frames: 10`,
  mots-clés boostés). Toutes les 80 ms, le VAD sémantique donne la probabilité que Camille se taise : au-delà
  de 0,6 sur l'horizon 2 s pendant 3 mesures, on vide le STT (`flush`) et le texte part à Codex.
- **Coupure** : si Camille parle (probabilité de silence sous 0,35 à 0,5 s, pendant 4 mesures) alors que la
  voix de l'agent joue, la voix s'arrête net (génération audio incrémentée, file du lecteur vidée, connexion TTS
  fermée) et le tour Codex est interrompu s'il écrit encore. Le tour suivant commence par ce que Camille a
  réellement entendu (horodatages TTS × position de lecture remontée par le navigateur).
  Sans casque, décocher « Coupure immédiate » : la coupure attend alors des mots qui ne sont pas l'écho de
  l'agent.
- **Consignes** : à la voix (« réponds plus court »), ou dans le panneau Consignes, injectées au tour suivant ou
  dans le tour en cours (`steer`). Si Camille parle pendant que l'agent exécute un outil, sa phrase est injectée
  dans le tour au lieu de l'interrompre.
- **Actions** : le thread vocal a le terminal (accès complet, dossier de travail = dépôt Atlas), la recherche
  web et le serveur MCP `taches` : `lancer_tache` crée un thread Codex de fond sur un modèle plus fort, qui
  peut lui-même lancer des sous-agents ; la conversation continue, et le résultat est annoncé au premier blanc.
- **Latence** : connexion TTS préchauffée, premier morceau de phrase envoyé dès la première virgule, tier
  Codex `fast`, tour d'échauffement muet au démarrage. Les latences s'affichent en haut à droite.

## Mesures (faux navigateur, voix Gradium, 27/09/2026)

| Scénario | Résultat |
|---|---|
| Fin de parole → texte transcrit | 0,35 à 0,7 s (`delay_in_frames` 10) ; 1,1 s avec 16 |
| Fin de parole → premier son | ≈ 2,5 s en médiane (1,7 à 3,3 s), dont 0,85 à 2 s de Codex |
| Coupure | voix arrêtée ≈ 0,7 s après le début de la parole |
| Consigne « commence par Chef » | appliquée dès le tour suivant, commandes comprises |
| Voix marmonnée (volume bas, étouffée, bruit) | transcription approximative, mais l'agent retrouve le sens ou demande de préciser |
| Sous-agent | lancé en ~2 s, conversation fluide pendant, résultat annoncé spontanément |
| STT seul (15 phrases × 3 voix) | ≈ 93 % nette, ≈ 89 % marmonnée, 55 à 72 % marmonnée + rapide + bruit |

Le poste le plus lent est le premier jeton de Codex (compte ChatGPT). L'offre gratuite de Gradium limite à
3 sessions simultanées : une seule conversation à la fois (STT + TTS en cours + TTS préchauffée).

## Essais

```bash
../.venv/Scripts/python -m pytest                              # fonctions pures (découpage, écho)
../.venv/Scripts/python -m essais.transcription 8 12 20        # banc STT : voix Gradium nettes et marmonnées
../.venv/Scripts/python -m essais.bout_en_bout                 # serveur lancé : bonjour, commande, questions,
                                                               # coupure, consignes, marmonne, tache
```

Les phrases de test et les réponses de l'agent (WAV) sont écrites dans `essais/sorties/`.

## Réglages

Tout est dans `.env.example` (`VOIX_*`) : voix, vitesse, délai et mots-clés du STT, seuils du VAD, modèles et
effort de l'agent et des tâches, tier Codex, dossier de travail. La voix, le modèle et le mode de coupure se
changent aussi dans l'interface.
