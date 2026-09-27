-- Figures en quatre formats, en cases de la vue (largeur × hauteur) : 1 × 1, 2 × 1, 1 × 2 ou 2 × 2 ; 2 × 2 par défaut.
-- Les figures plus grandes sont ramenées à 2 × 2 au plus : elles restent dans leur coin haut gauche, et une case
-- libérée ne peut pas créer de chevauchement.

update figures
set largeur = least(largeur, 2), hauteur = least(hauteur, 2)
where largeur > 2 or hauteur > 2;

alter table figures
  drop constraint figures_largeur_check,
  drop constraint figures_hauteur_check,
  add constraint figures_largeur_check check (largeur between 1 and 2),
  add constraint figures_hauteur_check check (hauteur between 1 and 2),
  alter column largeur set default 2,
  alter column hauteur set default 2;
