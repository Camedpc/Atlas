# Fontaine de chaîne (effet Mould)

> Pourquoi une chaîne tirée d’un bécher s’élève au-dessus du bord : réaction du tas au point de prise, h₁/h₂ = α/(1 − α − β). Mesures illustratives.

## Sous-problèmes

- `cadre` — Cadre et modélisation : Principes, hypothèses et choix de modélisation de la chaîne.
- `dyn` — SP1 · Chaîne en mouvement stationnaire : Équation du mouvement, tension effective, forme.
- `bords` — SP2 · Conditions aux extrémités : Tension au point de prise (α), à l’arrivée au sol (β), au sommet.
- `pred` — SP3 · Prédictions et confrontation : Loi h₁/h₂, vitesse, estimation de α sur les mesures.
- `billes` (abandonné) — Piste abandonnée · élan seul : Une chaîne sans réaction du tas (α = 0) ne fait pas de fontaine.

## Énoncés

### `ax_newton` — Bilan de quantité de mouvement (système ouvert)

*axiome · cadre · humain · admis*

Source : Mécanique classique : bilan sur un système ouvert.

Sur un volume de contrôle traversé par la chaîne : d𝐩/dt = Σ𝐅_ext + flux entrant de quantité de mouvement − flux sortant.

### `ax_gravite` — Pesanteur uniforme

*axiome · cadre · humain · admis*

Source : Mécanique classique.

𝐠 = −g 𝐞_y, g = 9,81 m·s⁻² ; y est l’altitude comptée depuis le haut du tas.

### `lt_chainette` — Équilibre d’une chaîne statique

*lemme · cadre · humain · admis*

Source : Résultat classique de statique des fils.

Utilise : `ax_gravite`

Une chaîne statique souple sous pesanteur uniforme vérifie T − λ g y = constante ; sa forme est une chaînette.

### `lt_buckingham` — Théorème de Vaschy–Buckingham

*lemme · cadre · humain · admis*

Source : Analyse dimensionnelle (Vaschy 1892, Buckingham 1914).

Une loi physique s’écrit entre grandeurs sans dimension ; ici h₁/h₂ ne peut dépendre que de α et β.

### `h_inext` — Chaîne inextensible

*hypothese · cadre · humain*

Maillons de longueur fixe, masse linéique λ uniforme, section négligeable.

### `h_stat` — Régime stationnaire

*hypothese · cadre · humain*

Dans le référentiel du laboratoire, la forme de la fontaine est fixe et la chaîne la parcourt à vitesse constante v.

### `h_etroite` — Fontaine étroite

*hypothese · cadre · humain*

Les deux jambes sont quasi verticales et proches : au sommet, le rayon de courbure est petit devant h₁.

### `def_hauteurs` — Hauteurs h₁ et h₂

*definition · cadre · humain · admis*

Source : Biggins et Warner, Proc. R. Soc. A 470 (2014).

h₁ : hauteur du sommet au-dessus du tas ; h₂ : chute du tas jusqu’au sol.

### `def_t_eff` — Tension effective

*definition · cadre · humain · admis*

Source : Biggins et Warner, Proc. R. Soc. A 470 (2014).

Utilise : `h_stat`

T′ = T − λ v² : pour une chaîne en mouvement stationnaire, tension d’une chaîne statique de même forme.

### `def_alpha` — Coefficient de prise α

*definition · cadre · humain · admis*

Source : Biggins et Warner, Proc. R. Soc. A 470 (2014).

Fraction de λ v² fournie par la réaction du tas au point de prise : T₀ = (1 − α) λ v².

### `def_beta` — Coefficient d’arrivée β

*definition · cadre · humain · admis*

Source : Biggins et Warner, Proc. R. Soc. A 470 (2014).

Tension résiduelle au sol : T_s = β λ v² (β = 0 pour un arrêt parfaitement inélastique).

### `ch_souple` — Chaîne parfaitement souple

*choix_modelisation · cadre · humain*

Utilise : `h_inext`

Courbe continue sans rigidité de flexion ni de torsion.

**Hypothèse de travail** : La chaîne est une courbe continue parfaitement souple.
**Portée** : Équation du mouvement le long de la chaîne (SP1).
**Alternatives** :
- Maillons rigides articulés discrets
- Tige élastique avec rigidité de flexion

### `ch_air` — Frottement de l’air négligé

*choix_modelisation · cadre · ia*

Aucune force aérodynamique sur la chaîne.

**Hypothèse de travail** : La traînée de l’air est négligeable devant le poids et les forces de contact.
**Portée** : Tout le bilan de forces (SP1, SP2).
**Alternatives** :
- Traînée quadratique ∝ ρ_air C_x v²

### `ch_sol` — Arrivée au sol paramétrée par β

*choix_modelisation · cadre · humain*

Utilise : `def_beta`

Le contact avec le sol est résumé par T_s = β λ v².

**Hypothèse de travail** : Le sol arrête la chaîne en ne lui laissant qu’une tension β λ v².
**Portée** : Condition au pied de la jambe descendante (SP2).
**Alternatives** :
- Modèle de choc maillon par maillon

### `obs_mould` — La chaîne monte au-dessus du bécher

*observation · cadre · humain*

Une chaîne de billes de 50 m tirée par-dessus le bord d’un bécher s’élève au-dessus de celui-ci avant de tomber (Mould, 2013).

### `conj_elan` — L’élan de la chaîne suffit

*conjecture · billes · ia · abandonné*

Sans aucune réaction du tas (α = 0), l’élan acquis par la chaîne suffirait à la faire monter au-dessus du bécher.

**Démonstration « Heuristique »** — invalide, confiance 0.08, vérifiée par ia, par directeur_de_labo
- contexte : `obs_mould`

### `l_mouv` — Équation du mouvement stationnaire

*lemme · dyn · humain*

∂ₛ(T 𝐭) − λ v² κ 𝐧 + λ𝐠 = 𝟎, où s est l’abscisse curviligne, κ la courbure et 𝐧 la normale.

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par humain, par camille
- principale : `ax_newton`
- auxiliaire : `ch_souple`, `ch_air`
- contexte : `ax_gravite`, `h_inext`, `h_stat`

### `l_effective` — Réduction à un problème statique

*lemme · dyn · humain*

Avec T′ = T − λ v² : ∂ₛ(T′ 𝐭) + λ𝐠 = 𝟎. La fontaine a la forme d’une chaîne statique de tension T′.

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par ia+humain, par camille
- principale : `l_mouv`
- contexte : `def_t_eff`

### `l_conserv` — Invariant le long de la chaîne

*lemme · dyn · ia*

T′ − λ g y est constant le long de toute la chaîne, du tas jusqu’au sol.

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par humain, par directeur_de_labo
- principale : `l_effective`
- technique : `lt_chainette`

### `p_forme` — Forme : chaînette inversée

*proposition · dyn · humain*

Si les jambes s’écartent, T′ < 0 au sommet : la fontaine prend la forme d’une chaînette inversée (une arche).

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par ia+humain, par camille
- principale : `l_effective`
- technique : `lt_chainette`

### `p_billes` — Avec α = 0, pas de fontaine

*proposition · billes · humain · abandonné*

Si le tas n’exerce aucune réaction, T′₀ = 0 et l’invariant impose h₁ = 0 : la chaîne ne dépasse pas le bord.

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par humain, par camille
- principale : `conj_elan`, `l_conserv`
- contexte : `def_alpha`

**Liens** :
- contredit `obs_mould` — La fontaine est pourtant observée.

### `d_origine` — Origine de la fontaine

*decision · cadre · ia*

Quelle force fournit la quantité de mouvement verticale au point de prise ?

**Question** : Pourquoi la chaîne monte-t-elle au-dessus du bécher ?
- [x] Réaction du tas sur les maillons (α > 0)
- [ ] Élan de la chaîne seule (α = 0) — Le bilan de quantité de mouvement donne alors h₁ = 0.
- [ ] Rigidité de flexion de la chaîne — Aucune force verticale nette au point de prise pour une chaîne souple ; effet de second ordre.
**Raison** : Seule une force extérieure au point de prise peut fournir la quantité de mouvement verticale manquante.

**Démonstration « Délibération »** — valide, confiance 0.91, vérifiée par ia+humain, par directeur_de_labo
- principale : `obs_mould`, `p_billes`

**Liens** :
- abandonne `conj_elan`

### `ch_prise` — Force de prise anormale

*choix_modelisation · cadre · humain*

Le tas pousse les maillons vers le haut au moment où ils sont mis en mouvement.

**Hypothèse de travail** : Au point de prise, le tas exerce sur la chaîne une réaction verticale : T₀ = (1 − α) λ v², α > 0.
**Portée** : Condition au point de prise, puis toutes les prédictions (SP2, SP3).
**Alternatives** :
- α = 0 : prise classique sans réaction
- Modèle microscopique explicite des maillons

**Démonstration « Justification du choix »** — valide, confiance 0.91, vérifiée par humain, par camille
- principale : `d_origine`
- contexte : `def_alpha`

### `l_prise` — Tension au point de prise

*lemme · bords · humain*

Bilan de quantité de mouvement sur le point de prise : T₀ = (1 − α) λ v², soit T′₀ = −α λ v².

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par ia+humain, par camille
- principale : `ax_newton`
- auxiliaire : `ch_prise`
- contexte : `def_alpha`

### `l_sol` — Tension à l’arrivée au sol

*lemme · bords · ia*

Au pied de la jambe descendante : T_s = β λ v², soit T′_s = −(1 − β) λ v².

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par humain, par directeur_de_labo
- principale : `ax_newton`
- auxiliaire : `ch_sol`
- contexte : `def_beta`

### `l_sommet` — Condition au sommet

*lemme · bords · humain*

Pour une fontaine étroite, l’arche du sommet porte une tension effective négligeable : T′ ≈ 0 en y = h₁.

**Démonstration « Démonstration »** — à vérifier, par camille
- principale : `l_effective`
- contexte : `h_etroite`, `def_hauteurs`

### `d_alpha` — Estimer α

*decision · bords · humain*

Comment estimer le coefficient de prise α ?

**Question** : Comment estimer α indépendamment de la hauteur de la fontaine ?
- [x] Simulation de maillons rigides soulevés depuis un tas
- [ ] Capteur de force sous le bécher — Force de prise trop brève et trop faible pour le capteur disponible.
- [ ] Ajustement sur h₁/h₂ seulement — Circulaire : on veut tester la loi, pas l’ajuster.
**Raison** : La simulation donne α sans utiliser la hauteur mesurée, ce qui permet une vraie confrontation.

**Démonstration « Délibération »** — valide, confiance 0.91, vérifiée par humain, par camille
- principale : `ch_prise`

### `calc_tiges` — Simulation de maillons rigides

*calcul · bords · ordinateur*

Dynamique de 2 000 tiges rigides articulées tirées depuis un tas désordonné : α ≈ 0,10 ± 0,04 (valeur illustrative).

**Démonstration « Script »** — à vérifier, par experimentateur
- principale : `d_alpha`, `ax_newton`
- contexte : `ch_prise`

### `exp_sol` — Arrivée sur sol dur ou sur mousse

*experience · bords · humain*

Vitesse v mesurée pour deux surfaces d’arrivée, à h₂ fixé.

**Démonstration « Protocole »** — valide, confiance 0.91, vérifiée par humain, par camille
- contexte : `ch_sol`

### `obs_beta` — β faible

*observation · bords · humain*

β ≈ 0,1 sur sol dur, ≈ 0 sur mousse (valeurs illustratives).

**Démonstration « Mesure »** — à vérifier, par camille
- principale : `exp_sol`
- auxiliaire : `l_sol`

### `p_vitesse` — Vitesse de la chaîne

*proposition · pred · ia*

En égalant l’invariant au point de prise et au sol : v² = g h₂ / (1 − α − β).

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par humain, par directeur_de_labo
- principale : `l_conserv`, `l_prise`, `l_sol`
- contexte : `def_hauteurs`

### `p_hauteur` — Hauteur de la fontaine

*proposition · pred · humain*

En égalant l’invariant au point de prise et au sommet : α v² = g h₁.

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par ia+humain, par camille
- principale : `l_conserv`, `l_prise`, `l_sommet`
- contexte : `def_hauteurs`

### `thm_rapport` — Loi de la fontaine

*theoreme · pred · humain*

h₁ / h₂ = α / (1 − α − β) : la hauteur de la fontaine est proportionnelle à la hauteur de chute.

**Démonstration « Démonstration »** — valide, confiance 0.91, vérifiée par ia+humain, par camille
- principale : `p_vitesse`, `p_hauteur`

### `calc_dim` — Contrôles de cohérence

*calcul · pred · ia*

Loi sans dimension ; α → 0 donne h₁ → 0 (piste abandonnée) ; α + β → 1 fait diverger v (plus de freinage).

**Démonstration « Script »** — valide, confiance 0.91, vérifiée par ia+humain, par directeur_de_labo
- principale : `thm_rapport`
- technique : `lt_buckingham`

### `exp_film` — Films à haute vitesse

*experience · pred · humain*

Chaîne à billes de 50 m, h₂ de 0,5 à 2 m ; h₁ et v relevés image par image (illustratif).

**Démonstration « Protocole »** — valide, confiance 0.91, vérifiée par humain, par camille
- contexte : `def_hauteurs`

### `obs_lineaire` — h₁ proportionnelle à h₂

*observation · pred · humain*

h₁ / h₂ = 0,13 ± 0,03 sur toute la gamme de h₂ (valeurs illustratives).

**Démonstration « Mesure »** — valide, confiance 0.8, vérifiée par humain, par camille
- principale : `exp_film`

### `obs_v` — v² proportionnelle à h₂

*observation · pred · ia*

Pente de v² contre h₂ : 11,4 ± 0,6 m·s⁻², soit 1 − α − β ≈ 0,86 (valeurs illustratives).

**Démonstration « Mesure »** — valide, confiance 0.78, vérifiée par humain, par directeur_de_labo
- principale : `exp_film`

### `res_alpha` — Estimation de α

*resultat · pred · humain*

Les mesures donnent α ≈ 0,11 ± 0,03, compatible avec la simulation de maillons (α ≈ 0,10 ± 0,04).

**Démonstration « Démonstration »** — à vérifier, par camille
- principale : `thm_rapport`, `obs_lineaire`, `obs_v`
- auxiliaire : `obs_beta`, `calc_tiges`

### `res_explication` — La fontaine vient de la réaction du tas

*resultat · pred · humain*

Une réaction verticale du tas sur les maillons au point de prise (α ≈ 0,1) explique à la fois la hauteur et la vitesse observées.

**Démonstration « Démonstration »** — valide, confiance 0.82, vérifiée par ia+humain, par camille
- principale : `res_alpha`, `thm_rapport`, `calc_dim`
- contexte : `d_origine`, `p_forme`
