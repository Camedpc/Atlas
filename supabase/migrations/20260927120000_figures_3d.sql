-- Figures 3D : une scène Plotly animée (JSON), produite par un script Python qu'Atlas exécute lui-même
-- (atlas/orchestrateur/figure3d.py), jouée en boucle par le front. La vignette de la grille est l'image de la figure.
--
-- Le JSON est dans le bucket « figures » (<projet_id>/<id>.json) ; le texte du script est copié en base pour que
-- la scène reste reproductible même si l'espace de travail de la session disparaît.

alter table public.figures
  add column scene_chemin text,
  -- Le script qui a produit la scène, tel qu'il a été exécuté.
  add column scene_script text,
  -- Une scène a toujours sa vignette (l'image), et son script.
  add constraint figures_scene_vignette check (scene_chemin is null or image_chemin is not null),
  add constraint figures_scene_script check ((scene_chemin is null) = (scene_script is null));

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/json']
where id = 'figures';
