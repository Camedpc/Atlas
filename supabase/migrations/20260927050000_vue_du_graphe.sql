-- Vue du graphe : ce qu'il faut pour dessiner et réarranger le raisonnement, façon Blueprint d'Unreal.
--
-- Deux couches :
-- - le sens (écrit par le graphiste) : type d'énoncé, détails d'une décision ou d'un choix, rôle des prémisses ;
-- - la vue (une par espace, modifiable par l'utilisateur et par l'IA) : cadres imbriqués, placement des nœuds
--   en cases de grille, étiquettes. Un nœud est dans un seul cadre ; les catégories multiples sont des étiquettes.
-- Les rectangles des cadres ne sont pas stockés : ils englobent les cases de leurs nœuds (et sous-cadres).

-- ─── Sens ────────────────────────────────────────────────────────────────────

alter table public.noeuds
  add column type text check (type in (
    'hypothese', 'definition', 'axiome', 'choix_modelisation', 'decision', 'lemme', 'proposition',
    'theoreme', 'assertion', 'experience', 'calcul', 'observation', 'resultat', 'conjecture'
  )),
  -- Décision : {question, alternatives: [{libelle, retenue, raison?}], raison}.
  -- Choix de modélisation : {hypothese, portee, alternatives?: [texte]}.
  add column details jsonb check (details is null or jsonb_typeof(details) = 'object');

-- Rôle des prémisses non principales : {premisse_id: 'auxiliaire' | 'technique' | 'contexte'}.
-- Une prémisse absente de cet objet est principale ; justifie_par reste la liste complète (triggers inchangés).
alter table public.demonstrations
  add column roles jsonb not null default '{}' check (jsonb_typeof(roles) = 'object');

-- ─── Vue ─────────────────────────────────────────────────────────────────────

create table public.groupes (
  projet_id   uuid not null references public.projets (id) on delete cascade,
  id          text not null check (id ~ '^[a-z0-9_]+$'),
  nom         text not null check (length(trim(nom)) > 0),
  -- Cadre englobant (imbrication) ; supprimer le parent remonte ses sous-cadres d'un niveau.
  parent_id   text,
  genre       text not null default 'libre'
              check (genre in ('sous_probleme', 'etape', 'piste_abandonnee', 'libre')),
  couleur     text check (couleur ~ '^#[0-9a-f]{6}$'),
  -- Réduit en un nœud-fonction à l'affichage.
  replie      boolean not null default false,
  ordre       integer not null default 0,
  version     integer not null default 1,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now(),
  primary key (projet_id, id),
  foreign key (projet_id, parent_id) references public.groupes (projet_id, id) on delete set null (parent_id),
  check (parent_id is distinct from id)
);

create table public.placements (
  projet_id   uuid not null,
  noeud_id    text not null,
  -- Le cadre du nœud (un seul) ; null = hors cadre.
  groupe_id   text,
  -- Cases de grille (colonne 0 à gauche, ligne 0 en haut) ; le front multiplie par la taille d'une case.
  colonne     integer not null check (colonne >= 0),
  ligne       integer not null check (ligne >= 0),
  largeur     integer not null default 1 check (largeur between 1 and 8),
  hauteur     integer not null default 1 check (hauteur between 1 and 8),
  -- Placé à la main (utilisateur ou IA) : la réorganisation automatique n'y touche pas.
  fixe        boolean not null default false,
  version     integer not null default 1,
  modifie_le  timestamptz not null default now(),
  primary key (projet_id, noeud_id),
  foreign key (projet_id, noeud_id) references public.noeuds (projet_id, id) on delete cascade,
  foreign key (projet_id, groupe_id) references public.groupes (projet_id, id) on delete set null (groupe_id)
);

create index placements_groupe_idx on public.placements (projet_id, groupe_id);

create table public.etiquettes (
  projet_id   uuid not null references public.projets (id) on delete cascade,
  id          text not null check (id ~ '^[a-z0-9_]+$'),
  nom         text not null check (length(trim(nom)) > 0),
  couleur     text check (couleur ~ '^#[0-9a-f]{6}$'),
  primary key (projet_id, id)
);

create table public.noeuds_etiquettes (
  projet_id     uuid not null,
  noeud_id      text not null,
  etiquette_id  text not null,
  primary key (projet_id, noeud_id, etiquette_id),
  foreign key (projet_id, noeud_id) references public.noeuds (projet_id, id) on delete cascade,
  foreign key (projet_id, etiquette_id) references public.etiquettes (projet_id, id) on delete cascade
);

create trigger groupes_modifie_le
  before update on public.groupes
  for each row execute function public.toucher_modifie_le();
create trigger placements_modifie_le
  before update on public.placements
  for each row execute function public.toucher_modifie_le();

-- Les opérations sur la vue sont journalisées comme le reste (action « vue », détail dans apres).
alter table public.journal drop constraint journal_action_check;
alter table public.journal add constraint journal_action_check check (action in (
  'creation_noeud', 'modification_noeud', 'ajout_demonstration', 'modification_demonstration', 'verdict',
  'import', 'vue'
));

-- ─── Accès : lecture ouverte, écriture réservée au serveur ──────────────────

alter table public.groupes           enable row level security;
alter table public.placements        enable row level security;
alter table public.etiquettes        enable row level security;
alter table public.noeuds_etiquettes enable row level security;

create policy "lecture ouverte" on public.groupes           for select using (true);
create policy "lecture ouverte" on public.placements        for select using (true);
create policy "lecture ouverte" on public.etiquettes        for select using (true);
create policy "lecture ouverte" on public.noeuds_etiquettes for select using (true);

grant select on public.groupes, public.placements, public.etiquettes, public.noeuds_etiquettes to anon, authenticated;

-- Le front voit en direct ce que l'IA déplace.
alter publication supabase_realtime add table public.groupes, public.placements, public.etiquettes, public.noeuds_etiquettes;
