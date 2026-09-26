"""Génère bench/enonces.jsonl : 176 énoncés annotés, dont 20 % de pièges (section 5.4), navigation comprise.

Chaque énoncé : texte (à remplacer par sa transcription Gradium, voir transcrire.py), état du
registre au moment où il est dit, historique éventuel, et l'outil attendu avec ses arguments clés.
`outils_acceptes` liste les réponses également correctes (None = Atlas répond sans outil).
"""

import json
from pathlib import Path

L: list[dict] = []
X, G, C, N = "explorateur", "editeur_graphe", "conversation", "navigateur"


def e(id_, texte, etat, outil, historique=None, **attendu):
    item = {"id": id_, "texte": texte, "etat": etat, "piege": False, "attendu": {"outil": outil, **attendu}}
    if historique:
        item["historique"] = historique
    L.append(item)


A = [
    "Hey Atlas, fais-moi un résumé de ce graphe.", "combien d'étapes il y a dans le graphe énergie",
    "Est-ce qu'il reste des démonstrations à vérifier ?",
    "Explique-moi le lien entre le lemme 2 et le théorème principal.",
    "résume moi la conversation sur la topologie", "Quels énoncés dépendent du lemme de Zorn ?",
    "Cherche où on utilise le théorème des valeurs intermédiaires.",
    "Qu'est-ce qui est encore ouvert dans ce graphe ?", "Donne-moi la liste des axiomes.",
    "Est-ce que la démonstration du corollaire 3 est valide ?", "Lis-moi l'énoncé du théorème 4.",
    "Qui a écrit la démonstration du lemme 5 ?", "fait moi un résumer de la conversation d'hier",
    "Quelles étapes sont invalides en ce moment ?", "Trouve-moi les démonstrations qui utilisent la récurrence.",
    "C'est quoi la dernière chose qu'on a ajoutée au graphe ?",
    "Compare les deux démonstrations du théorème de Rolle.", "Hey Atlas combien de conversations on a",
    "Il y a combien de théorèmes établis dans le graphe dérivée ?",
    "Est-ce que quelqu'un a répondu dans la conversation analyse ?",
    "Rappelle-moi de quoi on parlait dans la dernière conversation.",
    "Quel est le chemin le plus court entre l'axiome 1 et le théorème final ?",
    ("Résume aussi le graphe de la dérivée.", "exploration_en_cours"),
    ("Pendant qu'il cherche, dis-moi combien de lemmes il y a au total.", "exploration_en_cours"),
    "Explique-moi pourquoi le lemme 3 est marqué à vérifier.",
    "Est-ce que le théorème 2 dépend de l'axiome du choix ?", "Liste les énoncés qui n'ont aucune démonstration.",
    "Qu'est-ce que dit la démonstration du lemme de Gronwall ?", "résume le graph énergie en deux phrases",
    "Montre-moi les étapes qui mènent au théorème principal.",
    "Cherche dans les conversations quand on a parlé de compacité.",
    "Combien de démonstrations ont été écrites par l'IA ?",
    "Dis-moi ce qui a changé dans le graphe depuis ce matin.", "Quel est le résultat le plus utilisé du graphe ?",
]
B = [
    "Ajoute une étape lemme 3 après le lemme 2.", "Supprime le lien entre le théorème 4 et le corollaire 2.",
    "Renomme le lemme 1 en lemme de continuité.", "Relie le lemme 5 au théorème principal.",
    "Modifie l'énoncé du corollaire 1 : f est dérivable sur l'intervalle ouvert.", "Marque le lemme 2 comme admis.",
    "Crée un nouveau nœud pour le théorème de Rolle.", "Ajoute l'axiome du choix au graphe.",
    "Enlève l'étape en double sur la continuité.", "rajoute une démonstration par récurrence pour le lemme quatre",
    "Déplace le corollaire 3 pour qu'il dépende du théorème 2.", "Supprime le nœud brouillon.",
    "Change le nom du graphe en Énergie version 2.", "Ajoute un lien du lemme 1 vers le lemme 3.",
    "Corrige la faute dans l'énoncé du théorème 4, c'est continue et pas contenue.",
    "Hey Atlas, ajoute une étape pour la conservation de l'énergie.",
    "Mets le lemme 6 comme justification du théorème final.",
    ("Ajoute aussi une étape lemme 4.", "exploration_en_cours"),
    "Remplace la démonstration du lemme 2 par celle de la conversation d'hier.",
    "Fusionne les deux nœuds sur la dérivée.", "Supprime toutes les étapes marquées invalides.",
    "Ajoute l'hypothèse f continue à l'énoncé du lemme 3.", "Retire le lien vers l'axiome 2.",
    "Insère un lemme intermédiaire entre le lemme 2 et le théorème.",
]
CV = [
    "Crée une conversation sur la preuve du théorème 4.",
    "Envoie un message dans la conversation analyse pour dire que le lemme 3 est prêt.",
    "Demande dans la conversation topologie si quelqu'un a relu la démonstration.",
    "Lance une nouvelle conversation pour vérifier le corollaire 2.",
    "Poste dans la conversation d'équipe : réunion demain à dix heures.",
    "Écris à l'équipe que le graphe énergie est terminé.", "Ouvre une conversation avec l'agent sur la compacité.",
    "Réponds dans la conversation analyse que je suis d'accord.",
    "envoi un message a la conversation de topologie pour demander la référence",
    "Démarre une discussion sur la démonstration par l'absurde du lemme 5.",
    "Pose la question dans la conversation : est-ce que l'hypothèse de continuité suffit ?",
    "Crée une conversation et demande-lui de vérifier le théorème principal.",
    "Continue la conversation sur la dérivée en demandant un contre-exemple.",
    ("Préviens la conversation analyse que j'ai ajouté le lemme 3.", "modif_appliquee"),
]
for prefixe, liste, agent in (("A", A, X), ("B", B, G), ("C", CV, C)):
    for i, t in enumerate(liste, 1):
        texte, etat = t if isinstance(t, tuple) else (t, "vide")
        e(f"{prefixe}{i:02d}", texte, etat, "lancer_tache", type_agent=agent)

D = [
    ("Où en est le résumé ?", "exploration_en_cours", {"tache_id": 12}),
    ("Qu'est-ce qui tourne en ce moment ?", "deux_en_cours", {}),
    ("Il en est où l'explorateur ?", "exploration_en_cours", {}),
    ("Ça avance ?", "exploration_en_cours", {}),
    ("Où en est celle sur la dérivée ?", "deux_en_cours", {"tache_id": 15}),
    ("Hey Atlas, t'as des tâches en cours ?", "melange", {}),
    ("C'est bientôt fini ?", "exploration_en_cours", {}),
    ("Où en est la recherche sur la dérivée ?", "deux_en_cours", {"tache_id": 15}),
    ("Combien de tâches sont en cours ?", "deux_en_cours", {}),
    ("Où en sont mes tâches ?", "melange", {}),
    ("Il fait quoi là, l'agent ?", "exploration_en_cours", {}),
    ("Le résumé du graphe énergie, ça donne quoi ?", "exploration_en_cours",
     {"outils_acceptes": ["etat_taches", "lire_resultat"]}),
    ("Pourquoi la recherche des démonstrations invalides a échoué ?", "echec",
     {"outils_acceptes": ["etat_taches", "lire_resultat"]}),
    ("Est-ce qu'il y a quelque chose qui tourne ?", "vide", {"outils_acceptes": ["etat_taches", None]}),
]
for i, (t, etat, att) in enumerate(D, 1):
    e(f"D{i:02d}", t, etat, "etat_taches", **att)

E = [
    ("Qu'est-ce qu'il a trouvé ?", "resultat_pret"), ("Redis-moi le résultat.", "resultat_pret"),
    ("Tu peux répéter le résumé ?", "resultat_pret"),
    ("C'était quoi déjà le résumé du graphe énergie ?", "resultat_pret"),
    ("Relis-moi ce qu'a dit l'explorateur.", "resultat_pret"), ("J'ai pas entendu, redis.", "resultat_pret"),
    ("Hey Atlas, le résultat du résumé ?", "resultat_pret"),
    ("Qu'est-ce que ça a donné l'ajout du lemme 3 ?", "modif_appliquee"),
    ("Répète la fin du résumé s'il te plaît.", "resultat_pret"), ("Alors, c'était quoi la réponse ?", "resultat_pret"),
]
for i, (t, etat) in enumerate(E, 1):
    e(f"E{i:02d}", t, etat, "lire_resultat")

QG = [{"role": "atlas", "texte": "L'explorateur demande : quel graphe voulez-vous, Énergie ou Dérivée ?"}]
QC = [{"role": "atlas", "texte": "L'agent demande dans quelle conversation envoyer le message : Analyse ou Topologie ?"}]
F = [
    ("Énergie.", "question_graphe", QG, 21), ("Celui sur l'énergie.", "question_graphe", QG, 21),
    ("Le graphe dérivée.", "question_graphe", QG, 21), ("Dans analyse.", "question_conversation", QC, 22),
    ("La conversation topologie.", "question_conversation", QC, 22), ("Prends le premier.", "question_graphe", QG, 21),
    ("Envoie-le dans analyse.", "question_conversation", QC, 22), ("Les deux, en fait.", "question_graphe", QG, 21),
]
for i, (t, etat, h, tid) in enumerate(F, 1):
    e(f"F{i:02d}", t, etat, "repondre_agent", historique=h, tache_id=tid)

P = [{"role": "atlas", "texte": "J'ajoute l'étape lemme 3 après le lemme 2, reliée au théorème principal. Je valide ?"}]
P2 = [{"role": "atlas", "texte": "Deux modifications attendent : l'ajout du lemme 3, et la suppression du lien vers le corollaire."}]
GC = [
    ("Vas-y.", "proposition", P, {"decision": "oui"}), ("Oui, c'est bon.", "proposition", P, {"decision": "oui"}),
    ("Non, pas ça.", "proposition", P, {"decision": "non"}),
    ("Non, mets-le plutôt après le lemme 1.", "proposition", P, {"decision": "non", "correction": True}),
    ("Ok valide.", "proposition", P, {"decision": "oui"}),
    ("Attends, non, relie-le au corollaire plutôt.", "proposition", P, {"decision": "non", "correction": True}),
    ("Parfait, fais-le.", "proposition", P, {"decision": "oui"}),
    ("Valide l'ajout du lemme 3.", "deux_propositions", P2, {"decision": "oui", "tache_id": 31}),
    ("Non, n'applique pas la suppression du lien.", "deux_propositions", P2, {"decision": "non", "tache_id": 33}),
    ("Oui pour le lemme 3.", "melange", None, {"decision": "oui", "tache_id": 31}),
]
for i, (t, etat, h, att) in enumerate(GC, 1):
    e(f"G{i:02d}", t, etat, "confirmer", historique=h, **att)

H = [
    ("Arrête le résumé.", "exploration_en_cours", {"mode": "arreter"}),
    ("Laisse tomber.", "exploration_en_cours", {"mode": "arreter"}),
    ("Annule ça.", "modif_appliquee", {"mode": "revenir"}),
    ("Stoppe la recherche sur la dérivée.", "deux_en_cours", {"mode": "arreter", "tache_id": 15}),
    ("Reviens en arrière sur l'ajout du lemme 3.", "modif_appliquee", {"mode": "revenir"}),
    ("Finalement laisse tomber le résumé du graphe énergie.", "melange", {"mode": "arreter", "tache_id": 12}),
]
for i, (t, etat, att) in enumerate(H, 1):
    e(f"H{i:02d}", t, etat, "annuler", **att)

LANCE = [{"role": "utilisateur", "texte": "Fais-moi un résumé du graphe Énergie."},
         {"role": "atlas", "texte": "D'accord, je lance l'explorateur."}]
QD = [{"role": "utilisateur", "texte": "Où en est la recherche ?"},
      {"role": "atlas", "texte": "Le résumé du graphe Énergie lit les étapes du graphe."}]
PV = [{"role": "atlas", "texte": "Je valide l'ajout du lemme 3 ?"}]
T = [
    ("Arrête.", "deux_en_cours", None, {"outil": None}, "ambiguïté"),
    ("Laisse tomber celle-là.", "deux_en_cours", None, {"outil": None}, "ambiguïté"),
    ("Vas-y.", "deux_propositions", P2, {"outil": None}, "ambiguïté"),
    ("Oui.", "deux_propositions", P2, {"outil": None}, "ambiguïté"),
    ("Résume-le.", "vide", None,
     {"outil": "lancer_tache", "type_agent": X, "outils_acceptes": ["lancer_tache", None]}, "ambiguïté"),
    ("Quel temps fait-il à Paris ?", "vide", None, {"outil": None}, "hors périmètre"),
    ("Mets de la musique.", "vide", None, {"outil": None}, "hors périmètre"),
    ("Réserve-moi un train pour Lyon.", "vide", None, {"outil": None}, "hors périmètre"),
    ("Envoie un mail à Paul.", "vide", None, {"outil": None}, "hors périmètre"),
    ("Non, pas celle-là, l'autre.", "deux_en_cours", QD,
     {"outil": "etat_taches", "tache_id": 15, "outils_acceptes": ["etat_taches", None]}, "pas celle-là"),
    ("Non, pas celle-là, l'autre.", "deux_propositions", PV,
     {"outil": None, "outils_acceptes": [None, "confirmer"], "tache_id": 33}, "pas celle-là"),
    ("Merci Atlas.", "vide", None, {"outil": None}, "bavardage"),
    ("Bonjour !", "vide", None, {"outil": None}, "bavardage"),
    ("Tu t'appelles comment ?", "vide", None, {"outil": None}, "bavardage"),
    ("T'es rapide dis donc.", "exploration_en_cours", LANCE, {"outil": None}, "bavardage"),
    ("Attends deux secondes.", "exploration_en_cours", LANCE, {"outil": None}, "bavardage"),
    ("Hmm...", "vide", None, {"outil": None}, "bavardage"),
    ("Ça veut dire quoi un corollaire ?", "vide", None,
     {"outil": None, "outils_acceptes": [None, "lancer_tache"]}, "bavardage"),
    ("Tu peux répéter ?", "exploration_en_cours", LANCE,
     {"outil": None, "outils_acceptes": [None, "etat_taches"]}, "bavardage"),
    ("Résume celui sur l'énergie.", "question_graphe", QG,
     {"outil": "repondre_agent", "tache_id": 21}, "réponse à un agent"),
    ("Envoie-le dans la conversation topologie.", "question_conversation", QC,
     {"outil": "repondre_agent", "tache_id": 22}, "réponse à un agent"),
    ("Ajoute-le plutôt après le lemme 1.", "proposition", P,
     {"outil": "confirmer", "decision": "non", "correction": True}, "réponse à un agent"),
    ("Vas-y.", "vide", None, {"outil": None}, "rien en attente"),
    ("Annule ça.", "vide", None, {"outil": None, "outils_acceptes": [None, "annuler"]}, "rien en attente"),
    ("Stop la tâche sur l'énergie.", "exploration_en_cours", None,
     {"outil": "annuler", "mode": "arreter", "tache_id": 12}, "faux mot de fin"),
    ("Merci, et le résumé il en est où ?", "exploration_en_cours", None, {"outil": "etat_taches"}, "faux mot de fin"),
    ("euh atlas est-ce que tu peux euh non rien", "vide", None, {"outil": None}, "transcription"),
    ("Qu'est-ce que tu as fait tout à l'heure ?", "modif_appliquee", None,
     {"outil": "lire_resultat", "outils_acceptes": ["lire_resultat", "etat_taches"]}, "ambiguïté"),
    ("Supprime tout.", "vide", None,
     {"outil": None, "outils_acceptes": [None, "lancer_tache"], "type_agent": G}, "ambiguïté"),
    ("Dis à l'explorateur de se dépêcher.", "exploration_en_cours", LANCE,
     {"outil": None, "outils_acceptes": [None, "etat_taches"]}, "hors périmètre"),
]
for i, (t, etat, h, att, cat) in enumerate(T, 1):
    item = {"id": f"T{i:02d}", "texte": t, "etat": etat, "piege": True, "categorie": cat, "attendu": att}
    if h:
        item["historique"] = h
    L.append(item)

# Navigation : changer ce qui est affiché (agent navigateur), sans rien expliquer ni modifier.
NAV = [
    "Montre-moi la lignée du lemme de compacité.", "Affiche le théorème principal.", "Zoome sur le lemme 2.",
    "Passe en 3D.", "Reviens à la vue d'avant.", "Filtre pour ne garder que les nœuds suspendus.",
    "Cadre tout le graphe.", "Déplie le graphe, je veux tout voir en détail.", "Ouvre la fiche de celui-là.",
    "Montre ce qui dépend du choix de jauge.",
    "Affiche seulement ce qu'on a fait dans la conversation sur l'énergie.", "Enlève les filtres.",
    "Remets la vue en 2D.", "Montre-moi aussi les prémisses de contexte.", "Moins de détails, c'est illisible.",
    "Surligne le lemme de Grönwall.", "Mets la vue de dessus.", "Efface la sélection.",
    "Hey Atlas, recentre sur le théorème de convergence.", "Isole les nœuds à vérifier.",
]
for i, t in enumerate(NAV, 1):
    e(f"N{i:02d}", t, "vide", "lancer_tache", type_agent=N)

# Pièges navigation / explorateur / éditeur : des mots d'affichage, mais une question ou une modification.
TN = [
    ("Montre-moi un résumé du graphe.", X), ("Combien de nœuds sont affichés ?", X),
    ("Explique-moi ce qu'on voit à l'écran.", X), ("Montre-moi comment on démontre le lemme 2.", X),
    ("Ajoute un lien entre le lemme 2 et le théorème affiché.", G), ("Supprime le nœud sélectionné.", G),
]
for i, (t, agent) in enumerate(TN, 1):
    L.append({"id": f"TN{i:02d}", "texte": t, "etat": "vide", "piege": True, "categorie": "navigation ou contenu",
              "attendu": {"outil": "lancer_tache", "type_agent": agent}})

assert len(L) == 176, len(L)
assert sum(x["piege"] for x in L) == 36

if __name__ == "__main__":
    sortie = Path(__file__).with_name("enonces.jsonl")
    with sortie.open("w", encoding="utf-8") as f:
        for x in L:
            f.write(json.dumps(x, ensure_ascii=False) + "\n")
    print(f"{len(L)} énoncés, dont {sum(x['piege'] for x in L)} pièges -> {sortie}")
