-- Site public : réglages de l'admin (vidéo de la page d'accueil, espace de démo), bucket public « site » pour la
-- vidéo, et copie d'un espace vers un autre (réinitialisation de la démo).
--
-- La démo est une copie de travail : l'admin choisit un espace « modèle », le jury travaille dans la copie, et
-- réinitialiser remplace la copie par une copie neuve du modèle. Le modèle n'est jamais touché.

-- ─── Réglages : clé → valeur, écrits seulement par le serveur (clé secrète) ───
create table public.reglages (
  cle         text primary key,
  valeur      jsonb not null,
  modifie_le  timestamptz not null default now()
);

create trigger reglages_modifie_le
  before update on public.reglages
  for each row execute function public.toucher_modifie_le();

alter table public.reglages enable row level security;

-- ─── Vidéo de la page d'accueil : bucket public (lu directement par le navigateur) ───
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 52428800, array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ─── Copie d'un espace ───
-- Vide `copie` (graphe, vue, figures, documents, conversations) puis y recopie `modele`, tout ou rien. Les ids
-- du graphe ne sont uniques que dans leur espace : ils sont gardés. Les conversations et les exécutions reçoivent
-- de nouveaux ids, reportés partout où ils figurent (y compris dans les chemins des documents et des figures,
-- « sessions/<conversation>/… ») ; les threads Codex ne sont pas repris (session_agent nul : chaque conversation
-- repart de son historique). Le journal (append-only) de la copie n'est pas vidé : il reçoit une entrée « import ».
-- Renvoie la correspondance {ancien id de conversation: nouveau}, pour recopier les dossiers du bunker.
create function public.copier_espace(modele uuid, copie uuid, auteur text default 'admin') returns jsonb
language plpgsql as $$
declare
  correspondance jsonb;
  paire record;
begin
  if modele = copie then
    raise exception 'Le modèle et la copie sont le même espace';
  end if;
  if not exists (select 1 from public.projets where id = modele) or not exists (select 1 from public.projets where id = copie) then
    raise exception 'Espace inexistant';
  end if;

  -- Vider la copie (les démonstrations, placements, figures et étiquettes de nœuds suivent leurs nœuds).
  delete from public.liens_documents where projet_id = copie;
  delete from public.documents where projet_id = copie;
  delete from public.noeuds where projet_id = copie;
  delete from public.groupes where projet_id = copie;
  delete from public.etiquettes where projet_id = copie;
  delete from public.conversations where projet_id = copie;

  -- Nouveaux ids des conversations et des exécutions.
  create temporary table conv_ids on commit drop as
    select id as ancien, gen_random_uuid() as nouveau from public.conversations where projet_id = modele;
  create temporary table exec_ids on commit drop as
    select e.id as ancien, gen_random_uuid() as nouveau
    from public.executions e join conv_ids c on c.ancien = e.conversation_id;

  insert into public.conversations (id, titre, session_agent, projet_id, cree_le, modifie_le)
    select c.nouveau, v.titre, null, copie, v.cree_le, v.modifie_le
    from public.conversations v join conv_ids c on c.ancien = v.id;

  insert into public.executions
    select (jsonb_populate_record(null::public.executions, to_jsonb(e)
      || jsonb_build_object('id', x.nouveau, 'conversation_id', c.nouveau))).*
    from public.executions e join exec_ids x on x.ancien = e.id join conv_ids c on c.ancien = e.conversation_id;

  insert into public.messages (conversation_id, execution_id, role, contenu, donnees, agent, cree_le)
    select c.nouveau, x.nouveau, m.role, m.contenu, m.donnees, m.agent, m.cree_le
    from public.messages m join conv_ids c on c.ancien = m.conversation_id
    left join exec_ids x on x.ancien = m.execution_id
    order by m.id;

  -- Graphe : cadres, nœuds (parents / enfants recalculés par les triggers des démonstrations), démonstrations.
  insert into public.groupes
    select (jsonb_populate_record(null::public.groupes, to_jsonb(g) || jsonb_build_object('projet_id', copie))).*
    from public.groupes g where g.projet_id = modele;

  insert into public.noeuds
    select (jsonb_populate_record(null::public.noeuds, to_jsonb(n) || jsonb_build_object(
      'projet_id', copie, 'parents', '[]'::jsonb, 'enfants', '[]'::jsonb,
      'conversation_id', (select to_jsonb(c.nouveau) from conv_ids c where c.ancien = n.conversation_id)))).*
    from public.noeuds n where n.projet_id = modele;

  insert into public.demonstrations
    select (jsonb_populate_record(null::public.demonstrations, to_jsonb(d) || jsonb_build_object('projet_id', copie))).*
    from public.demonstrations d where d.projet_id = modele;

  insert into public.placements
    select (jsonb_populate_record(null::public.placements, to_jsonb(p) || jsonb_build_object('projet_id', copie))).*
    from public.placements p where p.projet_id = modele;

  insert into public.etiquettes
    select (jsonb_populate_record(null::public.etiquettes, to_jsonb(e) || jsonb_build_object('projet_id', copie))).*
    from public.etiquettes e where e.projet_id = modele;

  insert into public.noeuds_etiquettes
    select (jsonb_populate_record(null::public.noeuds_etiquettes, to_jsonb(e) || jsonb_build_object('projet_id', copie))).*
    from public.noeuds_etiquettes e where e.projet_id = modele;

  -- Figures (les images et scènes du bucket sont partagées avec le modèle) et documents.
  insert into public.figures
    select (jsonb_populate_record(null::public.figures, to_jsonb(f) || jsonb_build_object(
      'projet_id', copie,
      'conversation_id', (select to_jsonb(c.nouveau) from conv_ids c where c.ancien = f.conversation_id)))).*
    from public.figures f where f.projet_id = modele;

  insert into public.documents
    select (jsonb_populate_record(null::public.documents, to_jsonb(d) || jsonb_build_object(
      'projet_id', copie,
      'conversation_id', (select to_jsonb(c.nouveau) from conv_ids c where c.ancien = d.conversation_id)))).*
    from public.documents d where d.projet_id = modele;

  insert into public.liens_documents
    select (jsonb_populate_record(null::public.liens_documents, to_jsonb(l) || jsonb_build_object('projet_id', copie))).*
    from public.liens_documents l where l.projet_id = modele;

  -- Chemins « sessions/<conversation>/… » : vers les dossiers recopiés sous le nouvel id.
  for paire in select ancien::text as ancien, nouveau::text as nouveau from conv_ids loop
    update public.documents set chemin = replace(chemin, paire.ancien, paire.nouveau)
      where projet_id = copie and chemin like '%' || paire.ancien || '%';
    update public.figures
      set fichier = replace(fichier, paire.ancien, paire.nouveau), source = replace(source, paire.ancien, paire.nouveau)
      where projet_id = copie and (fichier like '%' || paire.ancien || '%' or source like '%' || paire.ancien || '%');
  end loop;

  insert into public.journal (projet_id, action, raison, auteur)
    values (copie, 'import', 'Réinitialisation : copie de l''espace ' || modele, auteur);

  select coalesce(jsonb_object_agg(ancien, nouveau), '{}'::jsonb) into correspondance from conv_ids;
  return correspondance;
end;
$$;

revoke execute on function public.copier_espace(uuid, uuid, text) from public, anon, authenticated;
