-- Graphe de résultats : nœuds (énoncés), démonstrations, journal append-only.
-- La validité effective d'un nœud n'est PAS stockée : elle est calculée (front et back).

-- ─────────────────────────────────────────────────────────────
-- Nœuds
-- ─────────────────────────────────────────────────────────────
create table public.noeuds (
  id          text primary key check (id ~ '^[a-z0-9_]+$'),
  nom         text not null,
  enonce      text not null,
  -- Axiome, définition ou théorème connu : établi sans démonstration.
  admis       boolean not null default false,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Démonstrations (plusieurs par nœud)
-- ─────────────────────────────────────────────────────────────
create table public.demonstrations (
  noeud_id           text not null references public.noeuds (id) on delete cascade,
  nom_demonstration  text not null,
  -- Ids de nœuds utilisés comme prémisses.
  justifie_par       text[] not null default '{}',
  demonstration      text not null default '',
  validite           text not null default 'a_verifier'
                     check (validite in ('a_verifier', 'valide', 'invalide')),
  auteur             text not null default 'ia',
  cree_le            timestamptz not null default now(),
  modifie_le         timestamptz not null default now(),
  primary key (noeud_id, nom_demonstration)
);

create index demonstrations_justifie_par_idx
  on public.demonstrations using gin (justifie_par);

-- Les prémisses doivent exister (un text[] ne peut pas porter de clé étrangère).
create function public.verifier_premisses() returns trigger
language plpgsql as $$
declare
  manquants text[];
begin
  select array_agg(p) into manquants
  from unnest(new.justifie_par) as p
  where not exists (select 1 from public.noeuds n where n.id = p);

  if manquants is not null then
    raise exception 'Prémisses inexistantes : %', array_to_string(manquants, ', ')
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger demonstrations_verifier_premisses
  before insert or update of justifie_par on public.demonstrations
  for each row execute function public.verifier_premisses();

-- modifie_le automatique
create function public.toucher_modifie_le() returns trigger
language plpgsql as $$
begin
  new.modifie_le := now();
  return new;
end;
$$;

create trigger noeuds_modifie_le
  before update on public.noeuds
  for each row execute function public.toucher_modifie_le();

create trigger demonstrations_modifie_le
  before update on public.demonstrations
  for each row execute function public.toucher_modifie_le();

-- ─────────────────────────────────────────────────────────────
-- Journal append-only (historique + replay)
-- ─────────────────────────────────────────────────────────────
create table public.journal (
  id                 bigint generated always as identity primary key,
  cree_le            timestamptz not null default now(),
  action             text not null check (action in (
                       'creation_noeud',
                       'modification_noeud',
                       'ajout_demonstration',
                       'modification_demonstration',
                       'verdict',
                       'import'
                     )),
  noeud_id           text,
  nom_demonstration  text,
  avant              jsonb,
  apres              jsonb,
  raison             text,
  auteur             text not null
);

create index journal_noeud_idx on public.journal (noeud_id, id);

create function public.journal_interdit() returns trigger
language plpgsql as $$
begin
  raise exception 'Le journal est append-only (% interdit)', tg_op;
end;
$$;

create trigger journal_append_only
  before update or delete on public.journal
  for each row execute function public.journal_interdit();

create trigger journal_pas_de_truncate
  before truncate on public.journal
  for each statement execute function public.journal_interdit();

-- ─────────────────────────────────────────────────────────────
-- Accès : hackathon, sans authentification, RLS ouverte
-- ─────────────────────────────────────────────────────────────
alter table public.noeuds         enable row level security;
alter table public.demonstrations enable row level security;
alter table public.journal        enable row level security;

create policy "lecture ouverte"  on public.noeuds for select using (true);
create policy "insert ouvert"    on public.noeuds for insert with check (true);
create policy "update ouvert"    on public.noeuds for update using (true) with check (true);

create policy "lecture ouverte"  on public.demonstrations for select using (true);
create policy "insert ouvert"    on public.demonstrations for insert with check (true);
create policy "update ouvert"    on public.demonstrations for update using (true) with check (true);

create policy "lecture ouverte"  on public.journal for select using (true);
create policy "insert ouvert"    on public.journal for insert with check (true);

grant select, insert, update on public.noeuds, public.demonstrations to anon, authenticated;
grant select, insert         on public.journal                       to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Realtime
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.noeuds, public.demonstrations, public.journal;
