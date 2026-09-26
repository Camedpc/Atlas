# Atlas

Harness de hackathon : des agents IA transforment leurs raisonnements scientifiques en graphe
(nœuds = énoncés, démonstrations = arêtes depuis les prémisses), stocké dans Supabase.

## Structure

| Dossier | Rôle |
|---|---|
| `supabase/` | Schéma (`migrations/`) et données de démo (`seed.sql`) |
| `atlas/` | Lecture du graphe en Python : modèles, calcul des statuts, requêtes Supabase |
| `api/index.py` | API FastAPI en lecture seule, déployée comme fonction Python sur Vercel |
| `frontend/` | Coquille Vite vide qui vérifie que tout répond |
| `tests/` | Tests Python (sans réseau) |

## API

| Route | Renvoie |
|---|---|
| `GET /api/health` | État de la connexion Supabase |
| `GET /api/graphe` | Tous les nœuds (avec statut et démonstrations) et toutes les arêtes |
| `GET /api/noeuds/{id}` | Un nœud, ses prémisses et les nœuds qui l'utilisent |
| `GET /api/journal?noeud_id=&limite=&avant_id=` | Historique, le plus récent d'abord |
| `GET /api/docs` | Documentation interactive |

Le statut d'un nœud (`etabli`, `suspendu`, `a_verifier`, `invalide`, `ouvert`) n'est pas stocké :
il est calculé à partir de tout le graphe dans `atlas/graphe.py`.

## Dev local

```bash
cp .env.example .env            # puis renseigner SUPABASE_SECRET_KEY
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # macOS/Linux : .venv/bin/pip
.venv/Scripts/python -m uvicorn api.index:app --reload --port 8000
npm install --prefix frontend
npm run dev --prefix frontend   # http://localhost:5173 (proxy /api → :8000)
.venv/Scripts/python -m pytest
```

## Base de données

```bash
npx supabase link --project-ref uykaupigovrvgwsckbcn
npm run db:push                 # applique les migrations et le seed
```

## Déploiement

Vercel, configuré par `vercel.json` : build du front dans `frontend/dist`, et `/api/*` servi par
`api/index.py`. Variables à définir sur Vercel : `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
