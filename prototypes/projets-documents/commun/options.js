// Les dix propositions : catalogue (index.html) et barre de navigation (précédente / suivante).

export const OPTIONS = [
  {
    dossier: '01-espaces',
    titre: 'Espaces de travail',
    idee: 'Un écran d’accueil plein cadre liste les projets comme des espaces (Slack, Linear) ; on entre dans un projet, on change d’espace par le nom en haut de la barre latérale.',
    optimise: 'Séparation nette entre projets, entrée évidente pour une nouvelle utilisatrice.',
    limites: 'Un clic de plus pour passer d’un projet à l’autre ; les documents restent cantonnés au projet courant.',
  },
  {
    dossier: '02-projets-claude',
    titre: 'Projets avec connaissances',
    idee: 'Façon Claude / ChatGPT Projects : chaque projet a une page (instructions, fichiers du projet, sessions) et les documents de session s’ajoutent sous les fichiers du projet.',
    optimise: 'Le contexte partagé du projet (instructions, données de référence) devient visible et modifiable.',
    limites: 'Deux niveaux de documents (projet et session) à expliquer ; page projet peu utile avec une seule session.',
  },
  {
    dossier: '03-ariane',
    titre: 'Fil d’Ariane et colonnes',
    idee: 'Un fil d’Ariane camille › projet › session › fichier sert de navigateur : chaque segment est un menu, et la vue Documents est un Finder en colonnes.',
    optimise: 'On sait toujours où l’on est dans le bunker ; la hiérarchie réelle des dossiers est montrée telle quelle.',
    limites: 'Colonnes gourmandes en largeur dans un panneau de droite ; peu de place pour l’aperçu.',
  },
  {
    dossier: '04-explorateur',
    titre: 'Explorateur à onglets',
    idee: 'Façon VS Code : une barre d’activité (Sessions, Fichiers) dans la colonne de gauche, et la vue Documents ouvre plusieurs fichiers en onglets.',
    optimise: 'Comparer plusieurs rapports et figures côte à côte ; familier pour qui code.',
    limites: 'Densité et vocabulaire de développeur ; deux arbres (sessions, fichiers) à gauche.',
  },
  {
    dossier: '05-par-agent',
    titre: 'Documents par agent',
    idee: 'La vue Documents regroupe les productions par session puis par agent auteur (directeur 01, littérature, expérimentateur, graphiste) ; un clic sur l’arbre des agents filtre ses fichiers.',
    optimise: 'Le lien « qui a produit quoi » entre agents et documents, cœur d’Atlas.',
    limites: 'Cache la structure réelle des dossiers (bascule nécessaire) ; les fichiers de Camille forment un groupe à part.',
  },
  {
    dossier: '06-bibliotheque',
    titre: 'Bibliothèque en vignettes',
    idee: 'Projets en cartes illustrées, et la vue Documents en grille de vignettes (vraies miniatures des figures, premières lignes des rapports) avec filtres par type et aperçu en grand.',
    optimise: 'Retrouver visuellement une figure ou un rapport ; lecture confortable en plein écran.',
    limites: 'Peu adaptée aux scripts et aux journaux ; la hiérarchie des dossiers s’efface.',
  },
  {
    dossier: '07-palette',
    titre: 'Palette de commandes',
    idee: 'Ctrl+K est la navigation principale : projets, sessions et fichiers dans une seule recherche floue, dès l’ouverture ; l’interface autour reste minimale.',
    optimise: 'La vitesse pour une utilisatrice régulière ; aucun menu à parcourir.',
    limites: 'Peu découvrable ; il faut savoir ce que l’on cherche.',
  },
  {
    dossier: '08-tableau-de-bord',
    titre: 'Tableau de bord de projet',
    idee: 'Choisir un projet ouvre son tableau de bord : sessions récentes, derniers rapports, figures, état du graphe ; la vue Documents garde l’arbre complet.',
    optimise: 'Reprendre un projet après une pause ; voir l’avancement sans ouvrir de session.',
    limites: 'Un écran de plus à maintenir ; redondant avec la barre latérale pour les sessions.',
  },
  {
    dossier: '09-contexte',
    titre: 'Documents épinglés au contexte',
    idee: 'Les fichiers cités dans le fil sont cliquables ; depuis la vue Documents, on épingle un fichier au contexte de la conversation (puces au-dessus de la saisie) ou on le mentionne avec @.',
    optimise: 'Le va-et-vient conversation ↔ documents : réutiliser un rapport comme entrée de la question suivante.',
    limites: 'Suppose que l’orchestrateur sache exploiter ces épingles ; logique d’épingle à expliquer.',
  },
  {
    dossier: '10-chronologie',
    titre: 'Chronologie des productions',
    idee: 'La vue Documents est un journal daté : chaque fichier produit apparaît à son heure, avec l’agent et la session ; l’arbre n’est qu’une bascule secondaire.',
    optimise: 'Suivre ce qui vient d’être produit pendant un tour ; relier documents et déroulé de la recherche.',
    limites: 'Les fichiers anciens et de projet se noient dans le flux ; pas de vue d’ensemble du dossier.',
  },
]

export function optionCourante() {
  const m = location.pathname.match(/options\/([^/]+)\//)
  return m ? OPTIONS.findIndex((o) => o.dossier === m[1]) : -1
}
