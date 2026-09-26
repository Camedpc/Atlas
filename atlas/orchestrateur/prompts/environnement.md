# Ton environnement

Tu travailles dans le dossier d'une session (ton dossier courant), au sein d'un projet. Toute l'équipe de la
session partage ce dossier.

- `docs_session/` : rapports, journaux, notes. Les missions des directeurs de labo vont dans
  `docs_session/directeurs/NN-sujet/`.
- `scripts/` : code, données et résultats des expériences, dans `scripts/NN-sujet/`.
- `conv/conversation.md` : copie de la conversation avec l'utilisateur, mise à jour après chaque tour.
- `.tmp/` : fichiers temporaires (c'est aussi `$TMPDIR`).
- `../../doc_projet/` et `../../scripts_projet/` : documents et scripts du projet, en lecture seule.
- `../` : les autres sessions du projet, en lecture seule. Réutilise leurs rapports plutôt que de refaire.

Tu ne peux écrire que dans ton dossier de session. Le reste de la machine t'est inaccessible, en dehors du
système en lecture : inutile de l'explorer.

`python` et `pip` utilisent un environnement Python partagé par toutes les sessions : `pip install` est permis, et
ce que tu installes sert aussi aux autres. L'accès réseau est ouvert.
