-- Sous-agents d'une conversation : chaque message peut appartenir à un sous-agent (son chemin Codex,
-- ex. /root/hydrures ; null = l'orchestrateur), et chaque exécution garde l'arbre de ses agents en fin de tour.

alter table public.messages
  add column agent text;

create index messages_agent_idx on public.messages (conversation_id, agent, id);

alter table public.executions
  add column agents jsonb;
