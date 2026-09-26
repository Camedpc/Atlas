-- Parents et enfants d'un nœud, lisibles directement sur sa ligne.
--   parents = prémisses citées par au moins une de ses démonstrations (union des justifie_par) ;
--   enfants = nœuds dont une démonstration le cite.
-- Colonnes dérivées de `demonstrations`, maintenues par trigger : ne jamais les écrire à la main.

alter table public.noeuds
  add column parents text[] not null default '{}',
  add column enfants text[] not null default '{}';

create function public.recalculer_liens(ids text[]) returns void
language sql as $$
  update public.noeuds n set
    parents = coalesce((
      select array_agg(distinct p order by p)
      from public.demonstrations d, unnest(d.justifie_par) as p
      where d.noeud_id = n.id
    ), '{}'),
    enfants = coalesce((
      select array_agg(distinct d.noeud_id order by d.noeud_id)
      from public.demonstrations d
      where d.justifie_par @> array[n.id]
    ), '{}')
  where n.id = any(ids);
$$;

-- Une démonstration qui change touche son nœud et toutes ses prémisses (anciennes et nouvelles).
create function public.demonstrations_maj_liens() returns trigger
language plpgsql as $$
declare
  ids text[] := '{}';
begin
  if tg_op in ('INSERT', 'UPDATE') then
    ids := ids || new.noeud_id || new.justifie_par;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    ids := ids || old.noeud_id || old.justifie_par;
  end if;
  perform public.recalculer_liens(ids);
  return null;
end;
$$;

create trigger demonstrations_maj_liens
  after insert or update of noeud_id, justifie_par or delete on public.demonstrations
  for each row execute function public.demonstrations_maj_liens();

-- Un changement de liens ne doit pas compter comme une modification du nœud :
-- modifie_le ne suit plus que les colonnes éditées par les agents ou les humains.
drop trigger noeuds_modifie_le on public.noeuds;
create trigger noeuds_modifie_le
  before update of id, nom, enonce, admis on public.noeuds
  for each row execute function public.toucher_modifie_le();

create index noeuds_parents_idx on public.noeuds using gin (parents);
create index noeuds_enfants_idx on public.noeuds using gin (enfants);

-- Rattrapage des nœuds existants.
select public.recalculer_liens(array(select id from public.noeuds));
