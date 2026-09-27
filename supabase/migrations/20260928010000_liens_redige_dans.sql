-- Relation « redige_dans » : un résultat → l'article PDF du scribe qui l'expose.
alter table public.liens_documents drop constraint liens_documents_relation_check;
alter table public.liens_documents add constraint liens_documents_relation_check
  check (relation in ('source', 'implemente', 'produit', 'ecrit_dans', 'entree', 'redige_dans'));
