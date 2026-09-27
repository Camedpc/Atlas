-- Registre des tâches : branche « navigateur » (affichage du graphe piloté à la voix) et découpage des demandes.
--
-- - type_agent : ajoute 'navigateur' (tâches qui n'écrivent rien en base : ni confirmation, ni verrou) ;
-- - extrait : segment de demande_brute qui concerne cette tâche (demande_brute garde la phrase entière et fait foi).
-- Le contexte (jsonb) accueille aussi `affichage`, le résumé de l'écran du graphe : pas de changement de schéma.

alter table public.taches drop constraint if exists taches_type_agent_check;
alter table public.taches add constraint taches_type_agent_check
  check (type_agent in ('explorateur', 'editeur_graphe', 'conversation', 'navigateur'));

alter table public.taches add column if not exists extrait text;
