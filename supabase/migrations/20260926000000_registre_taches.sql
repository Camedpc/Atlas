-- Registre des tâches : seul point de contact entre Atlas (voix), le chat texte et les agents.
-- À appliquer sur la même base que l'application Atlas (supabase db push).

create table if not exists public.taches (
  id                     bigint generated always as identity primary key,
  utilisateur_id         text not null,
  titre                  text not null,
  type_agent             text not null check (type_agent in ('explorateur', 'editeur_graphe', 'conversation')),
  nature                 text not null default 'travail' check (nature in ('travail', 'retour_arriere')),
  tache_cible_id         bigint references public.taches (id),
  demande_brute          text not null,
  reformulation          text not null,
  contexte               jsonb not null default '{}',
  statut                 text not null default 'en_attente' check (statut in (
                           'en_attente', 'en_cours', 'besoin_precision', 'attend_confirmation',
                           'terminee', 'echouee', 'annulee')),
  avancement             text,
  pourcentage            smallint check (pourcentage between 0 and 100),
  question               text,
  reponse                text,
  modification_proposee  jsonb,
  decision               text check (decision in ('oui', 'non')),
  correction             text,
  resultat_oral          text,
  resultat_detail        jsonb,
  modification_appliquee boolean not null default false,
  erreur                 text,
  canal                  text not null default 'vocal' check (canal in ('vocal', 'texte')),
  annoncee               boolean not null default true,
  arret_demande          boolean not null default false,
  cree_le                timestamptz not null default now(),
  maj_le                 timestamptz not null default now(),
  termine_le             timestamptz
);

create index if not exists taches_utilisateur_idx on public.taches (utilisateur_id, maj_le desc);
create index if not exists taches_file_idx on public.taches (type_agent, id) where statut = 'en_attente';
create index if not exists taches_actives_idx on public.taches (maj_le)
  where statut in ('en_attente', 'en_cours');

-- Historique de chaque tâche (durées par agent, relecture des sessions).
create table if not exists public.taches_evenements (
  id         bigint generated always as identity primary key,
  tache_id   bigint not null references public.taches (id) on delete cascade,
  statut     text not null,
  avancement text,
  cree_le    timestamptz not null default now()
);

create index if not exists taches_evenements_tache_idx on public.taches_evenements (tache_id, id);

-- Verrous d'écriture : une seule tâche modifie un même graphe à la fois.
create table if not exists public.verrous (
  ressource text primary key,
  tache_id  bigint not null references public.taches (id) on delete cascade,
  pris_le   timestamptz not null default now()
);

-- Chaque écriture, quel que soit l'écrivain (Atlas, chat texte, agent), notifie le canal `taches`.
create or replace function public.taches_notifier() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT'
     or new.statut is distinct from old.statut
     or new.avancement is distinct from old.avancement then
    insert into public.taches_evenements (tache_id, statut, avancement)
    values (new.id, new.statut, new.avancement);
  end if;
  perform pg_notify('taches', new.id::text);
  return new;
end;
$$;

drop trigger if exists taches_notifier on public.taches;
create trigger taches_notifier
  after insert or update on public.taches
  for each row execute function public.taches_notifier();

-- Accès : le back (connexion directe) contourne la RLS ; un client connecté ne voit que ses tâches.
alter table public.taches            enable row level security;
alter table public.taches_evenements enable row level security;
alter table public.verrous           enable row level security;

drop policy if exists "lecture de ses tâches" on public.taches;
create policy "lecture de ses tâches" on public.taches
  for select using (utilisateur_id = coalesce(auth.uid()::text, 'anonyme'));

drop policy if exists "lecture de ses événements" on public.taches_evenements;
create policy "lecture de ses événements" on public.taches_evenements
  for select using (exists (
    select 1 from public.taches t
    where t.id = tache_id and t.utilisateur_id = coalesce(auth.uid()::text, 'anonyme')));

grant select on public.taches, public.taches_evenements to anon, authenticated;
