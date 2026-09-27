# Encoder le graphe de raisonnement pour une IA

Étude pour Atlas : quel format pour que les agents Codex lisent et écrivent le graphe (via le serveur MCP
`atlas`) et que Camille le visualise. Mesures faites sur le jeu réel des prototypes, la **fontaine de chaîne**
(`raisonnement/r14-schema-technique/jeu-fontaine.ts` : 39 énoncés, 24 démonstrations, 61 prémisses après
normalisation). Rien n'est appliqué au dépôt principal : schéma, outils et prompt sont des **propositions**.

Tout est reproductible :

```bash
node --experimental-strip-types encodage-ia/exporter-fontaine.mjs   # jeu TS → fontaine/03-prototype.json
python encodage-ia/encodage.py tout                                  # génère, mesure, teste (→ resultats.txt)
python encodage-ia/encodage.py valider encodage-ia/fontaine/08-markdown.md
python encodage-ia/encodage.py sous-graphe thm_rapport --sens amont --profondeur 2 --roles principale,auxiliaire
```

`encodage.py` est en Python standard ; il utilise en plus, s'ils sont déjà là, `tokenizers` (jetons BPE réels),
`yaml` (relecture YAML) et `jsonschema` (schéma `encodage-ia/schema/atlas-graphe-1.schema.json`).

## 1. Synthèse

- **Le schéma actuel ne porte pas ce que les vues dessinent.** Sur la fontaine, l'adaptateur `depuisApiAtlas`
  ne devine juste que **23 types sur 39** et **44 rôles de prémisse sur 65** ; décisions (2), choix de
  modélisation (4), sous-problèmes, pistes abandonnées et liens sémantiques sont simplement perdus.
- **Le calcul de statut d'Atlas ne connaît pas les hypothèses.** Une hypothèse n'est ni admise ni démontrée,
  donc « ouverte », et tout ce qui en dépend est « suspendu » : la fontaine donne 11 établis, 16 suspendus,
  7 ouverts, là où les prototypes affichent 34 « validés ». Traiter hypothèses, choix et décisions comme
  **posés** (établis *sous hypothèses*) donne 28 établis, le reste à vérifier ou réellement en attente.
- **Deux formats, pas un seul.** Stockage canonique : les tables Supabase étendues, avec pour forme
  d'échange un JSON canonique `atlas.graphe/1` validé par un schéma JSON. Rendu pour les prompts : du texte,
  à trois niveaux (index d'une ligne par nœud, fiche Markdown à identifiants d'un sous-graphe, détail d'un
  nœud).
- **Les chiffres :** le JSON de `/api/graphe` coûte **16 400 jetons** pour la fontaine (421 par nœud, 89 %
  de structure) et perd la moitié de l'information ; le Markdown à identifiants porte **tout** pour
  **5 200 jetons** (134 par nœud) ; l'index d'une ligne par nœud tient en **1 440 jetons**, contre 4 100
  pour l'actuel `lire_graphe`, qui en dit moins.
- **L'IA écrit en appels d'outil, jamais en texte libre relu par un analyseur.** Les formats texte laissent
  passer silencieusement une sortie tronquée (Markdown : 13 coupes sur 19, compact : 9, YAML : 5) ; le JSON
  la rejette toujours. Écriture recommandée : des opérations atomiques en JSON (schéma d'entrée MCP), validées
  côté serveur, regroupables en un lot transactionnel avec essai à blanc.

## 2. Écart entre la base et les visualisations

### 2.1 Ce qu'on a en base, ce que les vues consomment

| Besoin des vues (prototypes R1–R38) | En base aujourd'hui | Ce que fait `depuisApiAtlas` | Mesure sur la fontaine |
|---|---|---|---|
| Type du nœud (14 types : hypothèse, choix, décision, lemme…) | rien (`admis` seulement) | devine par le préfixe de l'id | **23/39** justes ; `l_`, `p_`, `ch_`, `d_` non reconnus |
| Rôle de chaque prémisse (principale, auxiliaire, technique, contexte) | rien (`justifie_par text[]`) | devine par le type de la prémisse | **44/65** justes : 10 contextes et 7 auxiliaires vus comme principaux, 4 principales vues comme contexte |
| Décision (question, alternatives retenues ou rejetées et pourquoi) | rien | perdu | 2 décisions, 6 alternatives |
| Choix de modélisation (hypothèse de travail, portée, alternatives) | rien | perdu | 4 choix |
| Sous-problèmes (boîtes, imbrication `parent.enfant` de R18) | rien | un seul sous-problème « atlas » | 5 sous-problèmes |
| Piste abandonnée | rien | `active` partout | 2 nœuds |
| Liens hors justification (contredit, résout, remplace, abandonne) | rien | perdus | 2 liens |
| Origine (humain, IA, ordinateur) | `auteur` de la démonstration (`ia` en dur) | majorité des auteurs | — |
| Validation (IA, humain, IA + humain) | auteur du verdict, dans le journal seulement | déduite de `auteur` | — |
| Confiance avec intervalle `{estimation, bas, haut}` | `confiance` scalaire sur la démonstration | valeur par défaut selon le statut | — |
| Statut `valide / incertain / refute` | calculé : `etabli / suspendu / a_verifier / invalide / ouvert` | table de correspondance | 16 nœuds « suspendus » à cause des hypothèses |
| Formules (R18 : équation dans le bloc, grandeur transmise) | dans `enonce` | extraction heuristique (Unicode) | la fontaine écrit ses formules en Unicode, pas en `$…$` |
| Source d'un nœud admis | `raison_admis` va au **journal**, pas sur le nœud | — | 8 nœuds admis sans source affichable |

Deux défauts du jeu lui-même, révélés par le validateur : l'id `def_T` viole le motif de la base
(`^[a-z0-9_]+$`, renommé `def_t_eff`), et quatre nœuds posés (`lt_chainette`, `def_T`, `ch_souple`,
`ch_sol`) ont une « démonstration » faite uniquement de contexte. Ce ne sont pas des preuves mais des
**dépendances d'énoncé** (le `\uses` d'un énoncé dans un blueprint Lean) : en base, elles rendraient
« établie » une hypothèse ou une définition dès qu'un vérificateur les jugerait valides.

### 2.2 Où l'ajouter

**Schéma** (nouvelle migration, jamais `init.sql`) :

```sql
-- Proposition, non appliquée.
create table public.sous_problemes (
  projet_id uuid not null references public.projets (id),
  id text not null check (id ~ '^[a-z][a-z0-9_]*$'),
  nom text not null, resume text not null default '',
  parent text, abandonne boolean not null default false,
  primary key (projet_id, id)
);
alter table public.noeuds
  add column type text not null default 'assertion' check (type in ('hypothese','definition','axiome',
    'choix_modelisation','decision','lemme','proposition','theoreme','assertion','experience','calcul',
    'observation','resultat','conjecture')),
  add column sous_probleme text,               -- (projet_id, sous_probleme) → sous_problemes
  add column origine text check (origine in ('humain','ia','ordinateur')),
  add column source text,                      -- remplace raison_admis (aujourd'hui au journal seulement)
  add column abandonne boolean not null default false,
  add column utilise text[] not null default '{}',   -- dépendances d'énoncé, vérifiées comme justifie_par
  add column choix jsonb,                      -- {hypothese, portee, alternatives[]}
  add column decision jsonb;                   -- {question, alternatives[{libelle, retenue, raison, mene_a}], raison}
alter table public.demonstrations
  add column roles jsonb not null default '{}';  -- {"<id prémisse>": "auxiliaire" | "technique" | "contexte"} ; absent = principale
create table public.liens (
  projet_id uuid not null, source text not null, genre text not null
    check (genre in ('contredit','resout','remplace','abandonne')),
  cible text not null, note text not null default '', auteur text not null, cree_le timestamptz not null default now(),
  primary key (projet_id, source, genre, cible),
  foreign key (projet_id, source) references public.noeuds (projet_id, id) on delete cascade,
  foreign key (projet_id, cible)  references public.noeuds (projet_id, id) on delete cascade
);
-- journal : ajouter les actions 'creation_lien', 'creation_sous_probleme', 'abandon'.
```

Choix de conception :

- **`roles jsonb` à côté de `justifie_par`**, plutôt qu'une table `premisses` : triggers de prémisses
  existantes, `parents / enfants` et index GIN restent intacts. Un trigger vérifie que les clés de `roles`
  sont dans `justifie_par`. À terme, une table `premisses (projet_id, noeud_id, nom_demonstration,
  premisse_id, role, rang)` donnerait de vraies clés étrangères, au prix d'une migration plus lourde.
- **Liens dans une table**, pas en jsonb : la cible est vérifiée et se lit dans les deux sens.
- **Pas de colonne pour** le statut, la validation humain / IA ni l'intervalle de confiance : ils se
  calculent. `validation` vient des auteurs des verdicts (journal) ; l'intervalle, des deux modèles du
  vérificateur (juge et recours), dont les deux confiances peuvent aller au journal ; il n'existe pas si un
  seul modèle a jugé.
- **Formules :** pas de colonne. Exiger `$…$` dans les énoncés (le graphiste le fait déjà) suffit à
  l'annotation explicite de R18 (`formules.ts`, règle 0) ; une table de symboles (`α` → coefficient de prise)
  pourra venir plus tard pour les broches colorées.
- **Statut (`atlas/graphe.py`)** : hypothèses, choix et décisions deviennent **posés**. Ils propagent
  l'établissement comme un admis, et chaque nœud porte l'ensemble des hypothèses dont il dépend (calculé),
  ce que R14 affiche en `⊢ H1 H3`. Leurs éventuelles prémisses sont une motivation, que le vérificateur juge
  comme telle.

**Outils MCP** : voir § 4.3. **Prompt du graphiste** : voir § 4.5.

## 3. Comparaison des encodages sur la fontaine

### 3.1 Les fichiers

Tous dans `encodage-ia/fontaine/`, générés depuis le même contenu (sauf `03`, exporté du TypeScript) :

| Fichier | Encodage |
|---|---|
| `01-api-graphe.json` | réponse actuelle de `GET /api/graphe` (modèles pydantic, JSON compact, dates, uuid) |
| `02-mcp-lire-graphe.json` | sortie actuelle de l'outil MCP `lire_graphe` |
| `03-prototype.json` | modèle enrichi des prototypes (`JeuRaisonnement`, champs calculés compris) |
| `04-canonique.json` | JSON canonique proposé `atlas.graphe/1`, indenté mais listes d'ids sur une ligne |
| `04b-…indent2.json`, `04c-….min.json` | le même en `indent=2` standard, et minifié |
| `05-canonique.jsonl` | JSON Lines : en-tête, sous-problèmes, un nœud par ligne (démonstrations incluses), liens |
| `06-canonique.yaml` | YAML (scalaires nus quand c'est sûr) |
| `07-blueprint.tex` | blueprint à la leanblueprint : `\begin{lemme}[nom]\label{…}\uses{…}`, preuve avec `\uses`, `\usesaux`, `\usestech`, `\usesctx` |
| `08-markdown.md` | Markdown à identifiants : une section `### \`id\` — nom` par énoncé, prémisses listées par rôle |
| `09-compact.txt` | mini-langage de `donnees.ts` (`a +b #c ~d`) étendu à tout le nœud |
| `10-jsonld.json` | JSON-LD : le canonique + un `@context` |
| `11-turtle.ttl` | Turtle RDF, vocabulaire `at:` + `prov:wasAttributedTo` |
| `12-index.txt` | vue proposée pour `lire_index` : une ligne par nœud, sans énoncé |
| `13-prompt-sous-graphe-thm_rapport.md` | rendu proposé pour `lire_sous_graphe` (amont de `thm_rapport`, profondeur 2, statuts, frontière) |

### 3.2 Mesures

Jetons : BPE réel du tokenizer déjà installé (Whisper large-v3, multilingue, 51 k entrées). Il compte chaque
espace d'indentation, ce que les BPE récents (o200k, celui des modèles de Codex) ne font pas : la colonne
« indent. fusionnée » recompte en réduisant chaque indentation à un espace. `c/4` est la borne basse usuelle.
L'ordre des formats est le même dans les trois colonnes. « Structure » : part des jetons qui ne sont pas du
texte (noms, énoncés, questions, raisons…). Les démonstrations du jeu n'ont pas de texte : avec des preuves
rédigées, la charge utile grossit et la part de structure baisse pour tous les formats, sans changer l'ordre.

| Format | Caract. | Jetons BPE | Indent. fusionnée | c/4 | Structure | Jetons / nœud | Info portée | Aller-retour |
|---|---:|---:|---:|---:|---:|---:|---|---|
| JSON `/api/graphe` actuel | 31 294 | 16 410 | 16 410 | 7 824 | 89 % | 421 | base (≈ la moitié) | sans perte (de ce qu'il porte) |
| JSON `lire_graphe` actuel | 10 220 | 4 113 | 4 113 | 2 555 | 60 % | 105 | vue sans démonstrations ni rôles | — |
| JSON prototypes | 39 462 | 23 110 | 13 164 | 9 866 | 89 % | 593 | complet + champs calculés | sans perte |
| JSON canonique (lisible) | 23 020 | 12 023 | 7 703 | 5 755 | 78 % | 308 | complet | sans perte |
| JSON canonique `indent=2` | 25 612 | 14 587 | 8 050 | 6 403 | 82 % | 374 | complet | sans perte |
| JSON canonique minifié | 16 727 | 6 919 | 6 919 | 4 182 | 62 % | 177 | complet | sans perte |
| JSON Lines | 17 291 | 7 285 | 7 285 | 4 323 | 64 % | 187 | complet | sans perte |
| YAML | 18 154 | 8 000 | 5 610 | 4 538 | 67 % | 205 | complet | sans perte |
| Blueprint LaTeX | 13 760 | 5 917 | 5 917 | 3 440 | 56 % | 152 | complet | sans perte |
| **Markdown à identifiants** | 13 319 | **5 212** | 5 212 | 3 330 | 50 % | **134** | complet | sans perte |
| Texte compact | 10 849 | 4 046 | 3 906 | 2 712 | 35 % | 104 | complet | sans perte |
| JSON-LD | 23 531 | 12 298 | 7 943 | 5 883 | 79 % | 315 | complet | sans perte |
| Turtle RDF | 18 797 | 7 781 | 7 581 | 4 699 | 66 % | 200 | complet | non relu (pas de rdflib) |
| **Index (1 ligne / nœud)** | 3 606 | **1 440** | 1 440 | 902 | 76 % | **37** | vue : type, statut, nom, prémisses par rôle | — |

« Aller-retour » : le fichier est relu par l'analyseur de `encodage.py` et comparé au canonique (ordre
indifférent) ; tous les formats relus sont sans perte. À l'échelle : à 500 nœuds, le JSON de l'API ferait
≈ 210 000 jetons, le Markdown ≈ 67 000, l'index ≈ 18 500.

### 3.3 Robustesse de l'écriture

Quatre altérations typiques d'une sortie de LLM, appliquées au texte, puis relecture et validation
(`robustesse()` dans le script). *Syntaxe* : rejet à la lecture ; *validation* : lu mais refusé par les
règles ; *partiel* : ligne illisible signalée, le reste gardé ; *silencieux* : accepté alors que c'est faux.

| Format | Id de prémisse mal orthographié | Délimiteur oublié | Sortie tronquée (19 coupes, 5 %…95 %) | `"` non échappé dans un énoncé |
|---|---|---|---|---|
| JSON (API, prototypes, canonique, minifié, JSON-LD) | validation | syntaxe | syntaxe 19/19 | syntaxe |
| JSON Lines | validation | partiel + validation | **partiel 19/19** (préfixe valide) | partiel + validation |
| YAML | validation | syntaxe | validation 10, **silencieux 5**, syntaxe 4 | syntaxe |
| Blueprint LaTeX | validation | syntaxe | syntaxe 18, **silencieux 1** | correct |
| Markdown à identifiants | validation | validation (le nœud absorbé est cité plus loin) | syntaxe 4, validation 2, **silencieux 13** | correct |
| Texte compact | validation | syntaxe | syntaxe 7, validation 3, **silencieux 9** | correct |

Lectures :

- L'id mal orthographié est toujours rattrapé, **par la validation et non par le format** : c'est la règle
  « prémisse connue » qui protège, avec une suggestion (`id inconnu « thm_rapor » (voulais-tu « thm_rapport » ?)`).
  Dans le JSON de l'API, la faute tombait dans `aretes`, une des **trois copies** des mêmes liens
  (`justifie_par`, `parents / enfants`, `aretes`) : seul un contrôle de cohérence la voit. Un format écrit par
  une IA ne doit avoir qu'une copie.
- Les formats texte n'ont pas de fin explicite : une réponse coupée reste un document valide et plausible.
  Un marqueur de fin avec le nombre de nœuds le corrigerait, mais la vraie parade est de ne pas relire de
  texte libre (§ 4.3).
- Le JSON est fragile à l'échappement quand un modèle l'écrit en texte libre, pas quand il passe par les
  arguments d'un appel d'outil, que l'API du modèle produit et échappe elle-même.
- JSON Lines en ordre topologique a une propriété rare : tout préfixe est un graphe valide. C'est la forme
  naturelle d'un journal d'opérations.

### 3.4 Diff et versionnage

Mise à jour typique, un verdict (`l_sommet` : à vérifier → valide, confiance 0.83) :

| Format | Lignes +/- | Caractères dans le diff |
|---|---:|---:|
| JSON API / minifié | 2 | 62 572 / 33 490 (tout le fichier tient sur une ligne) |
| JSON canonique lisible, JSON-LD | 6 | 190 |
| YAML | 6 | 152 |
| JSON Lines | 2 | 836 (la ligne du nœud) |
| Markdown, compact, blueprint, index | 2 | 153 à 242 |

Le JSON lisible (clés dans un ordre fixe, listes d'ids sur une ligne) donne un diff aussi net que le texte.

### 3.5 Extraction de sous-graphes

Rendu Markdown d'un voisinage (`sous_graphe()`), avec une section « Frontière » qui nomme les prémisses
citées mais non détaillées (le graphe entier : 5 212 jetons) :

| Centre | Sens | Profondeur | Rôles | Nœuds + frontière | Jetons |
|---|---|---|---|---|---:|
| `thm_rapport` | amont | 1 | tous | 3 + 5 | 620 (12 %) |
| `thm_rapport` | amont | 2 | tous | 8 + 8 | 1 401 (27 %) |
| `thm_rapport` | amont | 2 | principale | 7 + 9 | 1 294 (25 %) |
| `thm_rapport` | amont | ∞ | principale + auxiliaire | 18 + 9 | 3 061 (59 %) |
| `ch_prise` (portée du choix) | aval | ∞ | tous | 10 + 12 | 1 941 (37 %) |
| `l_sommet` | les deux | 1 | tous | 5 + 4 | 873 (17 %) |

Filtrer par rôle est ce qui rend l'extraction utile : la chaîne déductive complète du théorème, sans le
contexte, tient dans 59 % du graphe, et chaque fiche reste autonome grâce à la frontière. L'extraction se
fait sur le modèle, pas sur le texte : peu importe le format de stockage tant que le serveur rend le
sous-graphe.

### 3.6 Verdicts

Échelle : ++ très bon, + bon, ~ moyen, − mauvais.

| Format | Lecture LLM | Écriture LLM | Validation auto | Diff | Sous-graphes | Humain | Verdict |
|---|---|---|---|---|---|---|---|
| JSON `/api/graphe` | − (uuid, dates, 3 copies des liens) | − | ~ (pydantic, rien sur les rôles) | − | ~ | − | garder pour le front, ne pas le donner à une IA |
| JSON `lire_graphe` | ~ (sans rôles ni démonstrations) | — | — | − | − | ~ | à remplacer par l'index |
| JSON prototypes | − (champs calculés, noms d'auteurs répétés) | − | ~ | ~ | ~ | ~ | modèle de vue, pas de stockage |
| **JSON canonique** | + | ++ en arguments d'outil | ++ (schéma JSON + règles) | + (lisible) | + | ~ | **format d'échange et forme des écritures** |
| JSON Lines | + | + (tolère la troncature) | ++ par ligne | ~ | ++ (grep par ligne) | ~ | export, journal d'opérations, flux |
| YAML | + | − (guillemets, indentation, troncature silencieuse) | + (après chargement) | + | ~ | + | à éviter pour l'écriture |
| Blueprint LaTeX | + (familier aux modèles en maths) | ~ (échappements `_ % # &`, macros étendues) | ~ (analyseur maison) | + | ~ | ++ pour un mathématicien | export Lean / article, pas canonique |
| **Markdown à identifiants** | ++ (autodescriptif, rôles en clair) | ~ (troncature silencieuse) | ~ (analyseur maison) | ++ | ++ par section | ++ | **rendu des sous-graphes dans les prompts** |
| Texte compact | + avec sa légende (≈ 50 jetons) | ~ | ~ | ++ | ++ | ~ | **index du graphe entier** |
| JSON-LD / Turtle + PROV | ~ | − (préfixes, ponctuation `; , .`) | + (SHACL, hors stdlib) | + | ++ (SPARQL) | − | export d'interopérabilité seulement |

## 4. Recommandation

### 4.1 En bref

1. **Stockage** : les tables Supabase, étendues (§ 2.2). Une seule copie des liens dans ce qui est écrit
   (`justifie_par` + `roles`) ; `parents / enfants` restent des index maintenus par trigger.
2. **Échange** : le JSON canonique `atlas.graphe/1` (`encodage-ia/schema/atlas-graphe-1.schema.json`) pour
   l'export, les instantanés versionnés, les tests, et comme forme des arguments d'écriture MCP.
3. **Rendu pour les prompts** : trois niveaux de texte produits par le serveur : l'**index** compact (une ligne
   par nœud), la **fiche Markdown à identifiants** d'un sous-graphe (avec statuts et frontière), le
   **détail** d'un nœud (textes de démonstration, justification des verdicts).
4. **Écriture** : des opérations atomiques en arguments JSON, validées par le schéma puis par les règles
   de § 4.4, regroupables en un lot transactionnel avec essai à blanc. Jamais de texte libre relu.
5. **Statut** : hypothèses, choix et décisions posés ; chaque nœud sait sous quelles hypothèses il tient.

### 4.2 Le format canonique

Forme d'un nœud (extrait de `04-canonique.json`) :

```json
{
  "id": "l_prise", "type": "lemme", "nom": "Tension au point de prise",
  "enonce": "Bilan de quantité de mouvement sur le point de prise : $T_0 = (1-\\alpha)\\lambda v^2$.",
  "sous_probleme": "bords", "origine": "humain",
  "demonstrations": [{
    "nom": "Démonstration",
    "premisses": {"principale": ["ax_newton"], "auxiliaire": ["ch_prise"], "contexte": ["def_alpha"]},
    "texte": "…", "validite": "valide", "confiance": 0.91, "verifie_par": ["ia", "humain"], "auteur": "directeur_de_labo"
  }]
}
```

- Prémisses **groupées par rôle** (`{rôle: [ids]}`) plutôt qu'une liste `[{id, role}]` : 44 % de caractères en
  moins sur les prémisses, et le modèle réfléchit rôle par rôle. En base : `justifie_par` = concaténation,
  `roles` = rôles non principaux.
- `utilise` (dépendances d'énoncé), `choix`, `decision` et `liens` suivent le schéma ; `decision.alternatives[].mene_a`
  peut pointer le nœud qui met en œuvre l'alternative retenue.
- Absents exprès : `statut`, `parents`, `enfants`, dates, `projet_id`, `conversation_id`, intervalle de
  confiance. Ils sont calculés, journalisés ou implicites dans l'appel.

### 4.3 Outils MCP proposés

**Lecture** (le serveur rend du texte, jamais le JSON brut de l'API) :

| Outil | Rend | Ordre de grandeur (fontaine) |
|---|---|---|
| `lire_index(sous_probleme?, types?, statuts?)` | l'index : `id · type · sous-problème · statut — nom ⟵ a +b ~c`, légende en tête | 1 440 jetons pour 39 nœuds |
| `lire_sous_graphe(centres, sens = "amont", profondeur = 2, roles = tous, budget_jetons = 4000)` | fiche Markdown des nœuds retenus + frontière ; si le budget déborde, retire d'abord le contexte puis réduit la profondeur, et le dit | 620 à 3 000 |
| `lire_noeud(id)` | détail en Markdown : énoncé, démonstrations avec texte, verdicts et justifications (journal), utilisateurs directs | — |
| `chercher_noeuds(texte, types?)` | ids + noms proches (sur nom et énoncé), pour réutiliser au lieu de dupliquer | — |

`lire_graphe` devient un alias de `lire_index`. Le paramètre `roles` est le levier principal : un agent qui
vérifie une chaîne déductive lit `principale,auxiliaire`, un agent qui rédige ajoute `contexte`.

**Écriture** :

- `appliquer_operations(operations, essai = false)` : lot **tout ou rien**, validé en entier (références en
  avant permises dans le lot, ordre libre), journalisé opération par opération avec un identifiant de lot.
  `essai = true` rend le diagnostic sans rien écrire. Opérations :
  `creer_noeud`, `ajouter_demonstration`, `modifier_noeud` (nom, énoncé, type, sous-problème, avec `raison`),
  `creer_sous_probleme`, `ajouter_lien`, `abandonner` (nœud ou sous-problème).
- `creer_noeud` et `ajouter_demonstration` restent, comme raccourcis d'une opération, avec les nouveaux
  champs : `type`, `sous_probleme`, `utilise`, `source`, `choix`, `decision`, et `premisses: {rôle: [ids]}`
  (`justifie_par` reste accepté, tout en principale).
- **Pas de modification des prémisses d'une démonstration existante** : un verdict porte sur un ensemble de
  prémisses ; on en ajoute une nouvelle.
- `noter_demonstration` reste réservé au vérificateur.

Exemple de lot (extrait de la fontaine, décision puis choix qu'elle motive) :

```json
{"essai": true, "operations": [
  {"op": "creer_noeud", "id": "d_origine", "type": "decision", "nom": "Origine de la fontaine",
   "enonce": "Quelle force fournit la quantité de mouvement verticale au point de prise ?", "sous_probleme": "cadre",
   "decision": {"question": "Pourquoi la chaîne monte-t-elle au-dessus du bécher ?",
     "alternatives": [{"libelle": "Réaction du tas sur les maillons ($\\alpha > 0$)", "retenue": true, "mene_a": "ch_prise"},
                      {"libelle": "Élan de la chaîne seule ($\\alpha = 0$)", "retenue": false, "raison": "Le bilan donne alors $h_1 = 0$."}],
     "raison": "Seule une force extérieure au point de prise peut fournir la quantité de mouvement manquante."}},
  {"op": "ajouter_demonstration", "noeud_id": "d_origine", "nom": "Délibération",
   "premisses": {"principale": ["obs_mould", "p_billes"]}, "texte": "…"},
  {"op": "creer_noeud", "id": "ch_prise", "type": "choix_modelisation", "nom": "Force de prise anormale", "…": "…"},
  {"op": "ajouter_lien", "source": "d_origine", "genre": "abandonne", "cible": "conj_elan"}
]}
```

### 4.4 Règles de validation

Implémentées dans `encodage.py` (`_structure`, `valider`), à porter dans une fonction pure d'`atlas/`
appelée par `ecriture.py`. Messages rédigés pour que l'agent se corrige seul.

| # | Règle | Gravité |
|---|---|---|
| R1 | forme conforme au schéma JSON (types, énumérations, champs inconnus refusés) | erreur |
| R2 | id : `^[a-z][a-z0-9_]*$`, ≤ 64 caractères, unique dans l'espace | erreur |
| R3 | toute prémisse, tout `utilise`, toute cible de lien existe (dans la base ou le lot), avec suggestion de l'id le plus proche | erreur |
| R4 | pas d'auto-prémisse ; une prémisse n'apparaît qu'une fois, sous un seul rôle | erreur |
| R5 | nom de démonstration unique par nœud | erreur |
| R6 | `admis` ⇒ `source` non vide ; admis et démontré ⇒ avertissement | erreur / avert. |
| R7 | type `decision` ⇔ champ `decision` ; au moins deux alternatives, au moins une retenue ; alternative rejetée sans raison ⇒ avertissement | erreur / avert. |
| R8 | type `choix_modelisation` ⇔ champ `choix` (hypothèse et portée) | erreur |
| R9 | sous-problème existant ; `parent` sans cycle | erreur |
| R10 | cycle de prémisses : avertissement avec le chemin (légitime entre démonstrations alternatives, A ⇔ B ; le statut ne s'auto-valide pas) | avert. |
| R11 | démonstration écrite par un agent : `validite = a_verifier`, sans confiance | forcé par le serveur |
| R12 | nœud créé : chercher les doublons (nom ou énoncé très proches) et les signaler | avert. |

### 4.5 Prompt du graphiste (proposition de contenu)

- Commencer par `lire_index`, puis `chercher_noeuds` avant chaque création.
- Donner un **type** à chaque nœud (liste fermée, avec une ligne de définition chacun).
- Pour chaque démonstration, classer les prémisses : **principale** (le pas de déduction repose dessus),
  **auxiliaire** (sert mais secondaire), **technique** (outil standard : Grönwall, Cauchy–Schwarz),
  **contexte** (définitions, notations, hypothèses générales). Exemple tiré de la fontaine : `l_mouv` a pour
  principale `ax_newton`, auxiliaires `ch_souple`, `ch_air`, contexte `ax_gravite`, `h_inext`, `h_stat`.
- Les dépendances d'énoncé (notations nécessaires pour lire l'énoncé) vont dans `utilise`, pas dans une
  démonstration.
- Chaque bifurcation du rapport devient une **décision** avec ses alternatives rejetées et leurs raisons ;
  chaque hypothèse de travail, un **choix de modélisation** avec sa portée ; chaque piste abandonnée reste,
  marquée `abandonne`, avec un lien `contredit` ou `abandonne`.
- Un sous-problème par section du rapport (`directeurs/NN-sujet/` → sous-problème `nn_sujet`).
- Formules en `$…$` dans les énoncés (une équation d'en-tête par énoncé quand il y en a une).
- Écrire tout le rapport en un lot `appliquer_operations`, d'abord avec `essai = true`, corriger, puis écrire.

## 5. Étapes de migration

Chaque étape est livrable seule ; l'ordre limite les ruptures.

1. **Migration SQL** (§ 2.2), valeurs par défaut compatibles (`type = 'assertion'`, `roles = '{}'`), triggers
   de cohérence `roles ⊂ justifie_par` et `utilise` existants ; `atlas/modeles.py` aligné.
2. **Validation pure** dans `atlas/` (port de `valider`), testée sans réseau sur la fontaine exportée ;
   `ecriture.py` l'appelle avant toute insertion.
3. **Outils MCP** : champs nouveaux sur `creer_noeud` / `ajouter_demonstration` (compatibles), puis
   `lire_index`, `lire_sous_graphe`, `chercher_noeuds`, `appliquer_operations`.
4. **Statut** : hypothèses, choix et décisions posés ; ensemble d'hypothèses par nœud dans `Noeud`.
5. **Prompts** : graphiste (§ 4.5) ; vérificateur, qui reçoit les rôles et juge une motivation comme telle.
6. **API et prototypes** : `/api/graphe` expose les nouveaux champs ; `depuisApiAtlas` les lit et ne devine
   plus qu'en repli ; l'API peut abandonner `aretes` (dérivable des démonstrations) pour les nouveaux clients.
7. **Reprise de l'existant** : types devinés une fois par `deviserType`, marqués comme tels dans le journal
   (`action = 'import'`), à confirmer par le graphiste au passage suivant.
8. **Export** : `GET /api/graphe/export` au format canonique, pour les instantanés et les tests.

## 6. Limites

- Pas d'essai avec un vrai modèle (le quota Codex est réservé) : la robustesse est mesurée par altérations
  types, pas par des sorties réelles. Prochaine étape utile : faire écrire la fontaine par le graphiste depuis
  un rapport, en Markdown et en lot JSON, et compter les erreurs.
- Jetons comptés avec un tokenizer multilingue de 2023 ; les tokenizers des modèles de Codex donneront moins de
  jetons, surtout pour le JSON indenté, mais le même classement.
- La fontaine est petite (39 nœuds) et sans texte de démonstration ; ses mesures (expériences, observations)
  sont illustratives. Les sources des nœuds admis ont été complétées pour l'exemple.
- Les analyseurs des formats texte sont minimaux (une ligne par énoncé) : ils prouvent que l'aller-retour est
  possible, pas qu'on doive relire du texte libre en production.
