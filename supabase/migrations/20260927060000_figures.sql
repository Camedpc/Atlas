-- Figures du graphe : des graphiques rattachés à un nœud (en général une observation ou un résultat), qui ont leur
-- propre place dans la vue (cases de grille, par défaut à droite de leur nœud).
--
-- Une figure est vectorielle (`trace` : axes et séries, que le front dessine façon pgfplots et que l'IA lit en
-- chiffres), ou une image (fichier dans le bucket privé « figures », que l'IA voit par l'outil lire_figure), ou les
-- deux (l'image produite par un script, et les données qu'elle trace).

create table public.figures (
  projet_id        uuid not null references public.projets (id) on delete cascade,
  id               text not null check (id ~ '^[a-z0-9_]+$'),
  -- Le nœud que la figure illustre ; supprimer le nœud supprime ses figures.
  noeud_id         text not null,
  titre            text not null check (length(trim(titre)) > 0),
  -- Markdown + LaTeX.
  legende          text,
  -- {x: {titre, unite?, echelle: lin|log, min?, max?}, y: {…}, series: [{genre: mesures|courbe|loi, …}]}
  -- (format et validation : atlas/figures.py).
  trace            jsonb check (trace is null or jsonb_typeof(trace) = 'object'),
  -- Chemin dans le bucket « figures » : <projet_id>/<id>.<ext>.
  image_chemin     text,
  image_type       text check (image_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  image_largeur    integer check (image_largeur > 0),
  image_hauteur    integer check (image_hauteur > 0),
  -- D'où viennent les données ou l'image : script ou fichier de la session, article, instrument…
  source           text,
  conversation_id  uuid references public.conversations (id) on delete set null,
  -- Place dans la vue, comme `placements` ; colonne et ligne nulles = pas encore placée.
  groupe_id        text,
  colonne          integer check (colonne >= 0),
  ligne            integer check (ligne >= 0),
  largeur          integer not null default 3 check (largeur between 1 and 8),
  hauteur          integer not null default 2 check (hauteur between 1 and 8),
  fixe             boolean not null default false,
  version          integer not null default 1,
  cree_le          timestamptz not null default now(),
  modifie_le       timestamptz not null default now(),
  primary key (projet_id, id),
  foreign key (projet_id, noeud_id) references public.noeuds (projet_id, id) on delete cascade,
  foreign key (projet_id, groupe_id) references public.groupes (projet_id, id) on delete set null (groupe_id),
  check (trace is not null or image_chemin is not null),
  check ((image_chemin is null) = (image_type is null)),
  check ((colonne is null) = (ligne is null))
);

create index figures_noeud_idx on public.figures (projet_id, noeud_id);

create trigger figures_modifie_le
  before update on public.figures
  for each row execute function public.toucher_modifie_le();

alter table public.journal drop constraint journal_action_check;
alter table public.journal add constraint journal_action_check check (action in (
  'creation_noeud', 'modification_noeud', 'ajout_demonstration', 'modification_demonstration', 'verdict',
  'import', 'vue', 'figure'
));

alter table public.figures enable row level security;
create policy "lecture ouverte" on public.figures for select using (true);
grant select on public.figures to anon, authenticated;
alter publication supabase_realtime add table public.figures;

-- Images : bucket privé, lu et écrit par le serveur seulement (clé secrète) ; le front passe par /api/figures/…
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('figures', 'figures', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
