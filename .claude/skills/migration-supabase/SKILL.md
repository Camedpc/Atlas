---
name: migration-supabase
description: Fait évoluer le schéma Supabase d'Atlas (nouvelle table, colonne, contrainte) de bout en bout — migration SQL, modèles pydantic, lecture, tests. À utiliser pour ajouter conversations/messages, confiance sur les démonstrations, etc.
disable-model-invocation: true
---

Changement demandé : $ARGUMENTS

1. Lire `supabase/migrations/` (toutes les migrations, dans l'ordre) pour connaître le schéma actuel.
2. Créer `supabase/migrations/<AAAAMMJJHHMMSS>_<nom_en_francais>.sql` (horodatage UTC actuel).
   Ne jamais modifier une migration existante. Reprendre les conventions de l'init : ids `^[a-z0-9_]+$`,
   `cree_le`/`modifie_le`, RLS explicite, ajout à la publication realtime si le front doit suivre en direct,
   `journal` append-only (étendre le `check` sur `action` si besoin).
3. Si `seed.sql` doit refléter la nouvelle forme, le mettre à jour.
4. Aligner `atlas/modeles.py`, puis `atlas/lecture.py` / `atlas/graphe.py` / `api/index.py` si concernés.
5. Ajouter ou adapter les tests dans `tests/` (sans réseau) et lancer `.venv/Scripts/python -m pytest`.
6. Montrer le SQL à Camille et **attendre son accord** avant `npm run db:push` : ça touche la base
   partagée `uykaupigovrvgwsckbcn`.
