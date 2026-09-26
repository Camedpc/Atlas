# Tester Atlas en local, sans risque pour la production

Guide destiné à un assistant de code (Claude Code ou équivalent) qui aide une personne à faire tourner Atlas
sur sa propre machine, avec **sa propre clé OpenAI** et une **base Supabase locale**. Suis les étapes dans
l'ordre, vérifie chacune avant de passer à la suivante, et arrête-toi pour demander à la personne dès qu'une
vérification échoue.

À la fin, la personne a : l'interface sur http://localhost:5173, l'orchestrateur sur http://localhost:8000,
une base Supabase qui tourne dans Docker sur sa machine, et aucun lien avec la base ni le serveur de production.

## Règles absolues

1. **Aucune clé de production.** N'utilise jamais `https://uykaupigovrvgwsckbcn.supabase.co` ni une clé Supabase
   donnée par l'équipe. La seule base autorisée est la base locale (`http://127.0.0.1:54321`).
2. **Ne lance jamais** `npx supabase link`, `npx supabase db push` ni `npm run db:push` : ces commandes visent
   un projet Supabase distant. En local, tout passe par `npm run db:local*`.
3. **Le garde-fou reste activé** : `ATLAS_BASE_LOCALE=1` dans `.env`. Avec lui, le serveur refuse de parler à
   une base qui n'est pas locale.
4. **Ne commite jamais `.env`** (il est dans `.gitignore` : vérifie avec `git status` avant chaque commit).
5. **La clé OpenAI ne passe pas par la conversation** : c'est la personne qui la colle elle-même dans `.env`.
   Pour vérifier qu'elle est là, n'affiche que sa présence et sa longueur, jamais sa valeur.
6. Un vrai tour d'agent **coûte de l'argent** sur le compte OpenAI de la personne : préviens avant chaque test
   réel, et garde les réglages économiques de l'étape 5 tant qu'elle ne demande pas autre chose.

## Étape 0 — Prérequis

Vérifie, et fais installer ce qui manque (la personne doit le faire elle-même s'il faut des droits admin) :

```bash
git --version
python --version        # 3.13 conseillé (3.10 minimum)
node --version          # 20 ou plus
docker info             # Docker Desktop doit être installé ET démarré
```

Sans Docker, la base locale ne peut pas tourner : arrête-toi et explique-le. (Solution de repli : un projet
Supabase gratuit au nom de la personne — mais alors c'est une base distante, à traiter avec les mêmes règles.)

## Étape 1 — Le code et la branche

```bash
git clone https://github.com/Camedpc/Atlas.git
cd Atlas
git switch <sa-branche>          # branche existante ; pour en créer une : git switch -c <sa-branche>
```

## Étape 2 — Dépendances

```bash
python -m venv .venv
# Windows :
.venv/Scripts/pip install -r requirements-dev.txt
# macOS / Linux :
.venv/bin/pip install -r requirements-dev.txt

npm install                      # CLI Supabase (racine)
npm install --prefix frontend    # interface
```

Dans la suite, `PY` désigne `.venv/Scripts/python` (Windows) ou `.venv/bin/python` (macOS/Linux).
Le SDK `openai-codex` installe aussi le binaire Codex : rien d'autre à installer pour l'orchestrateur.

Vérification : `PY -m pytest -q` doit passer entièrement (les tests n'utilisent ni réseau ni base).

## Étape 3 — Base Supabase locale

```bash
npm run db:local          # premier lancement : quelques minutes (téléchargement des images Docker)
```

La commande crée une base vide, applique **toutes les migrations de la branche** (`supabase/migrations/`) puis
le graphe de démo (`supabase/seed.sql`). Récupère ensuite l'URL et la clé **locales** :

```bash
npm run db:local:env
```

Garde `API_URL` et la clé secrète locale : `SECRET_KEY` si elle existe, sinon `SERVICE_ROLE_KEY`. Ces clés
locales ne donnent accès qu'à la base de la machine : elles ne sont pas sensibles.

Tableau de bord de la base locale : http://127.0.0.1:54323 (Supabase Studio).

## Étape 4 — Le fichier `.env`

```bash
cp .env.example .env
```

Puis remplis `.env` avec les valeurs de l'étape 3 — par exemple avec ce script, qui lit `npm run db:local:env`
et n'écrit que les variables Supabase et le garde-fou :

```bash
npm run db:local:env --silent > .supabase-local.env
PY - <<'EOF'
import re
from pathlib import Path

local = dict(
    ligne.split("=", 1) for ligne in Path(".supabase-local.env").read_text().splitlines() if "=" in ligne
)
local = {k: v.strip().strip('"') for k, v in local.items()}
cle = local.get("SECRET_KEY") or local["SERVICE_ROLE_KEY"]
valeurs = {"SUPABASE_URL": local["API_URL"], "SUPABASE_SECRET_KEY": cle, "ATLAS_BASE_LOCALE": "1"}

env = Path(".env")
texte = env.read_text(encoding="utf-8")
for nom, valeur in valeurs.items():
    if re.search(rf"(?m)^{nom}=", texte):
        texte = re.sub(rf"(?m)^{nom}=.*$", lambda _: f"{nom}={valeur}", texte)
    else:
        texte += f"\n{nom}={valeur}\n"
env.write_text(texte, encoding="utf-8")
print("SUPABASE_URL =", valeurs["SUPABASE_URL"])
EOF
rm .supabase-local.env
```

Vérifie : `SUPABASE_URL` vaut `http://127.0.0.1:54321` et `ATLAS_BASE_LOCALE=1` est présent.

Laisse **vides** : `ATLAS_JETON_ACCES` (pas de jeton en local), `ATLAS_DOMAINE`, `ATLAS_CORS_ORIGINES`,
`SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`.

### La clé OpenAI

Demande à la personne d'ouvrir `.env` et de coller **elle-même** sa clé sur la ligne `OPENAI_API_KEY=` (créée sur
https://platform.openai.com/api-keys ; conseille-lui un plafond de dépense sur son compte). Vérifie sans l'afficher :

```bash
PY -c "import os; from dotenv import load_dotenv; load_dotenv('.env'); v = os.environ.get('OPENAI_API_KEY', ''); print('OPENAI_API_KEY :', f'présente ({len(v)} car.)' if v else 'ABSENTE')"
```

Variante sans clé API : laisser `OPENAI_API_KEY` vide et connecter un abonnement ChatGPT avec
`PY -m atlas.orchestrateur.connexion` (ouvre le navigateur).

## Étape 5 — Réglages économiques pour les tests

Dans `.env` :

- `ATLAS_MAX_SOUS_AGENTS=2` : peu de sous-agents en parallèle.
- Les modèles : chaque agent a un modèle par défaut (voir les commentaires de `.env.example`). Si le compte
  OpenAI n'y a pas accès, ou pour réduire le coût, renseigne `ATLAS_MODELE_ORCHESTRATEUR` et les
  `ATLAS_MODELE_*` des sous-agents et du vérificateur avec des modèles disponibles sur le compte.
- `ATLAS_EFFORT_ORCHESTRATEUR=medium` (et les `ATLAS_EFFORT_*` à `low` ou `medium`).

## Étape 6 — Lancer

Deux terminaux :

```bash
# 1. serveur (API + orchestrateur)
PY -m uvicorn atlas.serveur:app --port 8000 --reload --reload-dir atlas --reload-dir api

# 2. interface
npm run dev --prefix frontend
```

Vérifications :

```bash
curl http://localhost:8000/api/health        # {"ok":true,"supabase":"ok"}
curl http://localhost:8000/api/graphe        # le graphe de démo (5 nœuds, théorème de la limite monotone)
```

Si le serveur refuse de démarrer avec « ATLAS_BASE_LOCALE est activé mais SUPABASE_URL pointe vers… »,
c'est le garde-fou : `.env` vise une autre base. Corrige `SUPABASE_URL` (étape 4), ne désactive pas le garde-fou.

## Étape 7 — Premier test réel

Préviens la personne que ce test consomme des crédits OpenAI, puis ouvre http://localhost:5173, crée une
conversation (**+ Nouvelle**) et envoie une question courte, par exemple : « Montre que la somme de deux entiers
pairs est paire, en construisant le raisonnement dans le graphe, en peu de nœuds. »

Attendu : les messages de l'orchestrateur et ses appels d'outils s'affichent à gauche au fil de l'eau, les nœuds
apparaissent à droite (case « Cette conversation seulement » pour les isoler), l'état passe à « Terminé ».

## Au quotidien

| Besoin | Commande |
|---|---|
| Repartir d'une base propre (migrations + démo) | `npm run db:local:reset` |
| Tester une nouvelle migration de la branche | l'ajouter dans `supabase/migrations/`, puis `npm run db:local:reset` |
| Arrêter la base locale | `npm run db:local:stop` |
| Lancer les tests | `PY -m pytest -q` |
| Lint | `PY -m ruff check .` et `npm run lint --prefix frontend` |

Les fichiers de l'agent (espace de travail, connexion Codex) sont dans `espace/`, ignoré par git.

## Dépannage

- **`docker info` échoue** : démarrer Docker Desktop, attendre qu'il soit prêt, relancer `npm run db:local`.
- **Ports déjà pris** (54321–54324) : un autre projet Supabase local tourne ; `npx supabase stop --all` ou le
  fermer.
- **« Codex n'est pas connecté »** : `OPENAI_API_KEY` est vide ou mal collée (étape 4).
- **Erreur de modèle introuvable ou non autorisé** : renseigner les `ATLAS_MODELE_*` (étape 5).
- **Un changement Python semble ignoré** (Windows) : `--reload` peut rester bloqué ; arrêter le serveur (port
  8000) et le relancer.
- **Erreur EPERM / EBUSY sur `node_modules`** : dépôt dans un dossier synchronisé (OneDrive…) ; déplacer le dépôt
  ou mettre la synchronisation en pause.

## Proposer son travail

Pousser sa branche (`git push -u origin <sa-branche>`) et ouvrir une pull request vers `main`. Le passage en
production (Vercel, VM, migrations sur la vraie base) est fait par l'équipe, pas depuis cette machine.
