-- Suppression d'un espace de travail : il est retiré des listes, rien n'est effacé. Le journal est append-only et
-- porte le projet_id de chaque écriture, donc ni lui ni le graphe qu'il raconte ne peuvent disparaître ; le dossier
-- du bunker reste aussi, et son nom reste pris (un nouvel espace du même nom reçoit un suffixe).

alter table public.projets add column supprime_le timestamptz;

create index projets_actifs_idx on public.projets (modifie_le desc) where supprime_le is null;
