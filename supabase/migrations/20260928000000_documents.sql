-- Documents du graphe : des fichiers et des dossiers du projet (script, PDF, données, dossier de résultats) qui
-- ont leur propre case dans la vue, comme les figures (pseudo-nœuds « doc:<id> »), et des liens nommés vers les
-- nœuds, les figures et les autres documents (« produit », « implémente », « source »…).
--
-- Le fichier reste sur le disque du serveur (dossier du projet dans le bunker) : la base garde son chemin, relatif
-- au dossier du projet, et un aperçu calculé à l'écriture (premières lignes, colonnes, pages, contenu d'un dossier)
-- pour que le graphe se lise sans accès au disque. Un déplacement passe par l'outil deplacer_document, qui déplace
-- sur le disque et met à jour ces chemins d'un coup.

create table public.documents (
  projet_id        uuid not null references public.projets (id) on delete cascade,
  id               text not null check (id ~ '^[a-z0-9_]+$'),
  -- Relatif au dossier du projet, séparé par / : « scripts_projet/double-pendule/simulation.py ».
  chemin           text not null check (chemin <> '' and chemin !~ '^/' and chemin !~ '(^|/)\.'),
  genre            text not null check (genre in ('fichier', 'dossier')),
  titre            text not null check (length(trim(titre)) > 0),
  -- Markdown + LaTeX : ce que contient le document, à quoi il sert.
  description      text,
  -- Aperçu calculé par atlas/documents.py (nature, extrait, lignes, colonnes, pages, entrées, taille…).
  apercu           jsonb not null default '{}'::jsonb check (jsonb_typeof(apercu) = 'object'),
  -- Vu sur le disque à la dernière vérification (faux : supprimé ou déplacé hors des outils).
  present          boolean not null default true,
  conversation_id  uuid references public.conversations (id) on delete set null,
  -- Place dans la vue, comme les figures ; colonne et ligne nulles = pas encore placé.
  groupe_id        text,
  colonne          integer check (colonne >= 0),
  ligne            integer check (ligne >= 0),
  largeur          integer not null default 1 check (largeur = 1),
  hauteur          integer not null default 1 check (hauteur = 1),
  fixe             boolean not null default false,
  version          integer not null default 1,
  cree_le          timestamptz not null default now(),
  modifie_le       timestamptz not null default now(),
  primary key (projet_id, id),
  unique (projet_id, chemin),
  foreign key (projet_id, groupe_id) references public.groupes (projet_id, id) on delete set null (groupe_id),
  check ((colonne is null) = (ligne is null))
);

create trigger documents_modifie_le
  before update on public.documents
  for each row execute function public.toucher_modifie_le();

-- Liens nommés : l'un des deux bouts au moins est un document. `de` et `vers` : id de nœud, « fig:<id> » ou
-- « doc:<id> ». Ce ne sont pas des prémisses : le vérificateur ne les juge pas.
create table public.liens_documents (
  projet_id  uuid not null references public.projets (id) on delete cascade,
  de         text not null,
  vers       text not null,
  relation   text not null check (relation in ('source', 'implemente', 'produit', 'ecrit_dans', 'entree')),
  cree_le    timestamptz not null default now(),
  primary key (projet_id, de, vers, relation),
  check (de like 'doc:%' or vers like 'doc:%'),
  check (de <> vers)
);

create index liens_documents_vers_idx on public.liens_documents (projet_id, vers);

-- Un document retiré du graphe emporte ses liens.
create function public.retirer_liens_document() returns trigger
language plpgsql as $$
begin
  delete from public.liens_documents
  where projet_id = old.projet_id and (de = 'doc:' || old.id or vers = 'doc:' || old.id);
  return old;
end;
$$;

create trigger documents_retirer_liens
  after delete on public.documents
  for each row execute function public.retirer_liens_document();

-- Fichier d'origine de l'image d'une figure, relatif au dossier du projet : suivi par deplacer_document, et montré
-- dans l'aperçu du dossier qui le contient (« → Fig. 4 »).
alter table public.figures add column fichier text;

alter table public.journal drop constraint journal_action_check;
alter table public.journal add constraint journal_action_check check (action in (
  'creation_noeud', 'modification_noeud', 'ajout_demonstration', 'modification_demonstration', 'verdict',
  'import', 'vue', 'figure', 'document'
));

alter table public.documents enable row level security;
alter table public.liens_documents enable row level security;
create policy "lecture ouverte" on public.documents for select using (true);
create policy "lecture ouverte" on public.liens_documents for select using (true);
grant select on public.documents, public.liens_documents to anon, authenticated;
alter publication supabase_realtime add table public.documents, public.liens_documents;
