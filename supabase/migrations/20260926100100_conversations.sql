-- Conversations avec l'orchestrateur : messages et exécutions (un tour de recherche = une exécution).
-- Écrites uniquement par le serveur (clé secrète, qui contourne la RLS) ; le front les lit.

create table public.conversations (
  id             uuid primary key default gen_random_uuid(),
  titre          text not null default 'Nouvelle recherche',
  -- Thread Codex de l'orchestrateur, pour qu'il reprenne là où il s'était arrêté.
  session_agent  text,
  cree_le        timestamptz not null default now(),
  modifie_le     timestamptz not null default now()
);

create trigger conversations_modifie_le
  before update on public.conversations
  for each row execute function public.toucher_modifie_le();

create table public.executions (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  statut           text not null default 'en_cours'
                   check (statut in ('en_cours', 'terminee', 'erreur', 'arretee')),
  erreur           text,
  -- Consommation de jetons du thread de l'agent à la fin du tour (telle que rapportée par Codex).
  usage            jsonb,
  debut            timestamptz not null default now(),
  fin              timestamptz
);

-- Au plus une exécution en cours par conversation.
create unique index executions_une_en_cours
  on public.executions (conversation_id) where statut = 'en_cours';

create table public.messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  execution_id     uuid references public.executions (id) on delete set null,
  role             text not null check (role in ('utilisateur', 'assistant', 'outil', 'systeme')),
  contenu          text not null default '',
  -- Détail structuré : appel d'outil (nom, entrée), résultat, sous-agent parent, coût…
  donnees          jsonb,
  cree_le          timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, id);

-- Nœuds tagués par la conversation qui les a créés (le graphe reste global).
alter table public.noeuds
  add column conversation_id uuid references public.conversations (id) on delete set null;

create index noeuds_conversation_idx on public.noeuds (conversation_id);

-- ─────────────────────────────────────────────────────────────
-- Accès : lecture ouverte, écriture réservée au serveur
-- ─────────────────────────────────────────────────────────────
alter table public.conversations enable row level security;
alter table public.executions    enable row level security;
alter table public.messages      enable row level security;

create policy "lecture ouverte" on public.conversations for select using (true);
create policy "lecture ouverte" on public.executions    for select using (true);
create policy "lecture ouverte" on public.messages      for select using (true);

grant select on public.conversations, public.executions, public.messages to anon, authenticated;

alter publication supabase_realtime add table public.conversations, public.executions, public.messages;
