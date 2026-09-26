-- Réparation : le rattachement des conversations au projet « defaut » (20260927020000_projets.sql) a déclenché
-- toucher_modifie_le et remis toutes les dates de modification à l'heure de la migration, ce qui brouille l'ordre
-- des sessions. On recale chaque conversation sur son dernier message (ou sa création), trigger coupé.

alter table public.conversations disable trigger conversations_modifie_le;

update public.conversations c
  set modifie_le = coalesce(
    (select max(m.cree_le) from public.messages m where m.conversation_id = c.id),
    c.cree_le
  );

alter table public.conversations enable trigger conversations_modifie_le;
