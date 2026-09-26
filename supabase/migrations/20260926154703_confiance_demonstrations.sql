-- Note du vérificateur sur une démonstration : probabilité, entre 0 et 1, que son verdict (validite) soit juste.
-- Vide tant que la démonstration n'a pas été jugée. La justification du verdict va dans le journal (action 'verdict').

alter table public.demonstrations
  add column confiance real check (confiance between 0 and 1);
