---
name: lancer-atlas
description: Démarre l'API FastAPI et le front Vite d'Atlas en local et vérifie qu'ils répondent. À utiliser pour lancer, tester à la main ou faire une capture de l'app.
---

1. Si `.env` manque à la racine, s'arrêter et demander à Camille de le créer depuis `.env.example`
   (ne jamais inventer de clé).
2. Si `.venv/` manque : `python -m venv .venv` puis `.venv/Scripts/pip install -r requirements-dev.txt`.
   Si `frontend/node_modules/` manque : `npm install --prefix frontend`.
3. Lancer en arrière-plan (deux commandes séparées, `run_in_background`) :
   - `.venv/Scripts/python -m uvicorn atlas.serveur:app --port 8000 --reload --reload-dir atlas --reload-dir api`
   - `npm run dev --prefix frontend` (http://localhost:5173, proxy `/api` → :8000)
4. Vérifier : `curl -s localhost:8000/api/health` puis `curl -s localhost:5173/api/graphe | head -c 300`.
   Si `health` renvoie 503, c'est Supabase (clé ou URL) : le dire plutôt que relancer en boucle.
5. Donner les URL à Camille. Si les ports sont déjà pris, un serveur tourne sans doute déjà : vérifier
   avant de lancer un doublon.
