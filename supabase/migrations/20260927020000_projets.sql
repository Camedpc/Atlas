-- Espaces de travail (projets) : chaque conversation appartient à un projet, qui a son dossier dans le bunker
-- (espace/utilisateurs/<utilisateur>/<dossier>/). Les conversations existantes vont dans le projet « defaut »,
-- dont le dossier est celui qu'utilisait déjà le bunker. Une conversation sans projet compte comme « defaut ».

create table public.projets (
  id           uuid primary key default gen_random_uuid(),
  nom          text not null check (length(trim(nom)) > 0),
  description  text not null default '',
  dossier      text not null unique check (dossier ~ '^[a-z0-9][a-z0-9_-]*$'),
  cree_le      timestamptz not null default now(),
  modifie_le   timestamptz not null default now()
);

create trigger projets_modifie_le
  before update on public.projets
  for each row execute function public.toucher_modifie_le();

insert into public.projets (nom, description, dossier)
values ('Premières recherches', 'Les sessions d’Atlas d’avant les espaces de travail.', 'defaut');

alter table public.conversations
  add column projet_id uuid references public.projets (id) on delete cascade;

update public.conversations
  set projet_id = (select id from public.projets where dossier = 'defaut');

create index conversations_projet_idx on public.conversations (projet_id, modifie_le desc);

alter table public.projets enable row level security;
create policy "lecture ouverte" on public.projets for select using (true);
grant select on public.projets to anon, authenticated;
