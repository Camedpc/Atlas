# Fontaine de chaîne (effet Mould)

> Pourquoi une chaîne tirée d’un bécher s’élève au-dessus du bord : réaction du tas au point de prise, h₁/h₂ = α/(1 − α − β). Mesures illustratives.

## Sous-problèmes

- `cadre` — Cadre et modélisation : Principes, hypothèses et choix de modélisation de la chaîne.
- `dyn` — SP1 · Chaîne en mouvement stationnaire : Équation du mouvement, tension effective, forme.
- `bords` — SP2 · Conditions aux extrémités : Tension au point de prise (α), à l’arrivée au sol (β), au sommet.
- `pred` — SP3 · Prédictions et confrontation : Loi h₁/h₂, vitesse, estimation de α sur les mesures.

## Énoncés

### `def_hauteurs` — Hauteurs h₁ et h₂

*definition · cadre · humain · admis · statut etabli*

Source : Biggins et Warner, Proc. R. Soc. A 470 (2014).

h₁ : hauteur du sommet au-dessus du tas ; h₂ : chute du tas jusqu’au sol.

### `l_conserv` — Invariant le long de la chaîne

*lemme · dyn · ia · statut suspendu*

T′ − λ g y est constant le long de toute la chaîne, du tas jusqu’au sol.

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par humain, par directeur_de_labo
- principale : `l_effective`
- technique : `lt_chainette`

### `l_prise` — Tension au point de prise

*lemme · bords · humain · statut suspendu*

Bilan de quantité de mouvement sur le point de prise : T₀ = (1 − α) λ v², soit T′₀ = −α λ v².

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par ia+humain, par camille
- principale : `ax_newton`
- auxiliaire : `ch_prise`
- contexte : `def_alpha`

### `l_sol` — Tension à l’arrivée au sol

*lemme · bords · ia · statut suspendu*

Au pied de la jambe descendante : T_s = β λ v², soit T′_s = −(1 − β) λ v².

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par humain, par directeur_de_labo
- principale : `ax_newton`
- auxiliaire : `ch_sol`
- contexte : `def_beta`

### `l_sommet` — Condition au sommet

*lemme · bords · humain · statut a_verifier*

Pour une fontaine étroite, l’arche du sommet porte une tension effective négligeable : T′ ≈ 0 en y = h₁.

**Démonstration « Démonstration »** — à vérifier, par camille
- principale : `l_effective`
- contexte : `h_etroite`, `def_hauteurs`

### `p_vitesse` — Vitesse de la chaîne

*proposition · pred · ia · statut suspendu*

En égalant l’invariant au point de prise et au sol : v² = g h₂ / (1 − α − β).

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par humain, par directeur_de_labo
- principale : `l_conserv`, `l_prise`, `l_sol`
- contexte : `def_hauteurs`

### `p_hauteur` — Hauteur de la fontaine

*proposition · pred · humain · statut suspendu*

En égalant l’invariant au point de prise et au sommet : α v² = g h₁.

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par ia+humain, par camille
- principale : `l_conserv`, `l_prise`, `l_sommet`
- contexte : `def_hauteurs`

### `thm_rapport` — Loi de la fontaine

*theoreme · pred · humain · statut suspendu*

h₁ / h₂ = α / (1 − α − β) : la hauteur de la fontaine est proportionnelle à la hauteur de chute.

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par ia+humain, par camille
- principale : `p_vitesse`, `p_hauteur`

## Frontière (cités, non détaillés)

- `ax_newton` — Bilan de quantité de mouvement (système ouvert)
- `lt_chainette` — Équilibre d’une chaîne statique
- `h_etroite` — Fontaine étroite
- `def_alpha` — Coefficient de prise α
- `def_beta` — Coefficient d’arrivée β
- `ch_sol` — Arrivée au sol paramétrée par β
- `l_effective` — Réduction à un problème statique
- `ch_prise` — Force de prise anormale
