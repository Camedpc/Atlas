-- Un graphe par espace de travail : nœuds, démonstrations et entrées du journal appartiennent à un projet.
-- Un id de nœud n'est plus unique que dans son projet : les clés deviennent (projet_id, …), et les triggers
-- (prémisses existantes, parents / enfants) ne regardent plus que le graphe du projet.
-- Le graphe existant va dans le projet « defaut ».

alter table public.noeuds         add column projet_id uuid references public.projets (id);
alter table public.demonstrations add column projet_id uuid;
alter table public.journal        add column projet_id uuid references public.projets (id);

-- Rattachement de l'existant, sans toucher aux dates de modification ni ouvrir le journal au-delà de ce update.
alter table public.demonstrations disable trigger demonstrations_modifie_le;
alter table public.journal        disable trigger journal_append_only;

update public.noeuds         set projet_id = (select id from public.projets where dossier = 'defaut');
update public.demonstrations set projet_id = (select id from public.projets where dossier = 'defaut');
update public.journal        set projet_id = (select id from public.projets where dossier = 'defaut');

alter table public.demonstrations enable trigger demonstrations_modifie_le;
alter table public.journal        enable trigger journal_append_only;

alter table public.noeuds         alter column projet_id set not null;
alter table public.demonstrations alter column projet_id set not null;
alter table public.journal        alter column projet_id set not null;

-- Clés : un nœud est identifié par (projet_id, id), une démonstration par (projet_id, noeud_id, nom).
alter table public.demonstrations drop constraint demonstrations_noeud_id_fkey;
alter table public.demonstrations drop constraint demonstrations_pkey;
alter table public.noeuds         drop constraint noeuds_pkey;

alter table public.noeuds         add primary key (projet_id, id);
alter table public.demonstrations add primary key (projet_id, noeud_id, nom_demonstration);
alter table public.demonstrations
  add foreign key (projet_id, noeud_id) references public.noeuds (projet_id, id) on delete cascade;

drop index public.journal_noeud_idx;
create index journal_projet_idx       on public.journal (projet_id, id);
create index journal_projet_noeud_idx on public.journal (projet_id, noeud_id, id);

-- Les prémisses doivent exister dans le même projet.
create or replace function public.verifier_premisses() returns trigger
language plpgsql as $$
declare
  manquants text[];
begin
  select array_agg(p) into manquants
  from unnest(new.justifie_par) as p
  where not exists (select 1 from public.noeuds n where n.projet_id = new.projet_id and n.id = p);

  if manquants is not null then
    raise exception 'Prémisses inexistantes : %', array_to_string(manquants, ', ')
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

drop trigger demonstrations_verifier_premisses on public.demonstrations;
create trigger demonstrations_verifier_premisses
  before insert or update of projet_id, justifie_par on public.demonstrations
  for each row execute function public.verifier_premisses();

-- Parents et enfants, calculés dans le graphe du projet.
create function public.recalculer_liens(projet uuid, ids text[]) returns void
language sql as $$
  update public.noeuds n set
    parents = coalesce((
      select array_agg(distinct p order by p)
      from public.demonstrations d, unnest(d.justifie_par) as p
      where d.projet_id = n.projet_id and d.noeud_id = n.id
    ), '{}'),
    enfants = coalesce((
      select array_agg(distinct d.noeud_id order by d.noeud_id)
      from public.demonstrations d
      where d.projet_id = n.projet_id and d.justifie_par @> array[n.id]
    ), '{}')
  where n.projet_id = projet and n.id = any(ids);
$$;

create or replace function public.demonstrations_maj_liens() returns trigger
language plpgsql as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.recalculer_liens(new.projet_id, array[new.noeud_id] || new.justifie_par);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recalculer_liens(old.projet_id, array[old.noeud_id] || old.justifie_par);
  end if;
  return null;
end;
$$;

drop trigger demonstrations_maj_liens on public.demonstrations;
create trigger demonstrations_maj_liens
  after insert or update of projet_id, noeud_id, justifie_par or delete on public.demonstrations
  for each row execute function public.demonstrations_maj_liens();

drop function public.recalculer_liens(text[]);
