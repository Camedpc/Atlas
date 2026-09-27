-- Figures 3D : une scène Plotly animée (JSON), produite par un script Python qu'Atlas exécute lui-même
-- (atlas/orchestrateur/figure3d.py), jouée en boucle par le front.
--
-- Le JSON est dans le bucket « figures » (<projet_id>/<id>.json) ; le texte du script est copié en base pour que
-- la scène reste reproductible même si l'espace de travail de la session disparaît.

alter table public.figures
  add column scene_chemin text,
  -- Le script qui a produit la scène, tel qu'il a été exécuté.
  add column scene_script text,
  add constraint figures_scene_script check ((scene_chemin is null) = (scene_script is null));

-- Une figure est un tracé, une image, une scène 3D, ou plusieurs d'entre eux : on remplace la contrainte
-- « tracé ou image » de 20260927060000_figures.sql (sans nom, donc retrouvée par sa définition).
do $$
declare
  nom text;
begin
  select conname into nom
  from pg_constraint
  where conrelid = 'public.figures'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%trace IS NOT NULL%image_chemin IS NOT NULL%'
    and pg_get_constraintdef(oid) not ilike '%scene_chemin%';
  if nom is not null then
    execute format('alter table public.figures drop constraint %I', nom);
  end if;
end $$;

alter table public.figures
  add constraint figures_contenu check (trace is not null or image_chemin is not null or scene_chemin is not null);

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/json']
where id = 'figures';
