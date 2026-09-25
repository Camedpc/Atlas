-- Petit graphe de démo : « une suite croissante et majorée converge ».
-- Couvre les statuts : établi (admis), à vérifier, invalide, suspendu.

insert into public.noeuds (id, nom, enonce, admis) values
  ('def_suite_croissante',
   'Suite croissante',
   'Une suite réelle $(u_n)_{n \in \mathbb{N}}$ est **croissante** si $u_n \le u_{n+1}$ pour tout $n$.',
   true),
  ('def_convergence',
   'Convergence d''une suite',
   '$(u_n)$ **converge** vers $\ell$ si $\forall \varepsilon > 0,\ \exists N,\ \forall n \ge N,\ |u_n - \ell| \le \varepsilon$.',
   true),
  ('axiome_borne_sup',
   'Propriété de la borne supérieure',
   'Toute partie non vide et majorée de $\mathbb{R}$ admet une borne supérieure.',
   true),
  ('lemme_approx_sup',
   'Approximation de la borne supérieure',
   'Si $(u_n)$ est majorée, alors $\ell = \sup_n u_n$ existe et pour tout $\varepsilon > 0$ il existe $N$ tel que $u_N > \ell - \varepsilon$.',
   false),
  ('thm_convergence_monotone',
   'Théorème de la limite monotone',
   'Toute suite réelle croissante et majorée converge, vers $\sup_n u_n$.',
   false)
on conflict (id) do nothing;

insert into public.demonstrations (noeud_id, nom_demonstration, justifie_par, demonstration, validite, auteur) values
  ('lemme_approx_sup',
   'Par caractérisation de la borne supérieure',
   array['axiome_borne_sup'],
   E'L''ensemble $A = \\{u_n : n \\in \\mathbb{N}\\}$ est non vide et majoré, donc $\\ell = \\sup A$ existe.\n\nSoit $\\varepsilon > 0$. Comme $\\ell - \\varepsilon < \\ell$, le réel $\\ell - \\varepsilon$ ne majore pas $A$ : il existe donc $N$ tel que $u_N > \\ell - \\varepsilon$.',
   'a_verifier',
   'ia'),
  ('lemme_approx_sup',
   'Par l''absurde (erronée)',
   array['axiome_borne_sup'],
   E'Supposons que pour tout $N$, $u_N \\le \\ell - \\varepsilon$. Alors $\\ell - \\varepsilon$ est la borne supérieure, donc $\\varepsilon = 0$.',
   'invalide',
   'ia'),
  ('thm_convergence_monotone',
   'Démonstration directe',
   array['def_suite_croissante', 'def_convergence', 'lemme_approx_sup'],
   E'Soit $\\ell = \\sup_n u_n$ et $\\varepsilon > 0$. D''après le lemme, il existe $N$ avec $u_N > \\ell - \\varepsilon$.\n\nPour $n \\ge N$, par croissance, $\\ell - \\varepsilon < u_N \\le u_n \\le \\ell$, donc $|u_n - \\ell| \\le \\varepsilon$ : la suite converge vers $\\ell$.',
   'valide',
   'ia')
on conflict (noeud_id, nom_demonstration) do nothing;

-- Historique initial
insert into public.journal (action, noeud_id, apres, raison, auteur)
select 'creation_noeud', n.id, to_jsonb(n), 'seed', 'seed'
from public.noeuds n
where not exists (select 1 from public.journal j where j.noeud_id = n.id);
