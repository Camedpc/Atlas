"""Table fixe intention (P2) → commandes (P3) de l'agent navigateur. Seul fichier qui la contient.

`traduire(lot, donnees, etat, pile)` est pur : il résout les désignations (`resolution.py`) et produit le
LotCommandes, ou l'erreur à rendre. Le `lot_id` est celui du LotNavigation (un seul id de bout en bout).
La pile des états (pour « revenir ») est tenue par l'appelant ; `Traduction` dit comment la mettre à jour.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from ...affichage.protocole import (
    CriteresFiltre, Designation, EtatAffichage, ErreurProtocole, IntentionDesignation, IntentionFiltrer,
    IntentionLiensComplets, IntentionNiveau, IntentionPointDeVue, IntentionSimple, LotCommandes, LotNavigation,
)
from .resolution import Donnees, Echec, est_conversation, resoudre_conversation, resoudre_noeud

TAILLE_PILE = 20
# Niveaux de détail, du plus lisible au plus complet (« plus » / « moins » avancent d'un cran).
NIVEAUX = {"essentiel": "defaut", "normal": "roles_aux", "complet": "complet"}
ORDRE_NIVEAUX = ["defaut", "roles_aux", "complet"]
# Stratégies hors de l'échelle : cran équivalent.
CRAN_STRATEGIE = {"defaut": 0, "transitive": 0, "chaines": 0, "roles": 1, "roles_aux": 1, "complet": 2}
# Vues du protocole P2 → vues du moteur ; « cote » = vue de côté par défaut du mode 3D.
VUES = {"face": "face", "dessus": "dessus", "iso": "iso", "cote": None}


@dataclass
class Traduction:
    lot: LotCommandes
    # États à retirer du sommet de la pile (« revenir ») puis, si vrai, état d'avant le lot à y ajouter.
    depiler: int
    empiler: bool


def _cible(d: Designation, donnees: Donnees, etat: EtatAffichage, precedent: EtatAffichage | None) -> dict[str, Any]:
    if est_conversation(d):
        return {"conversation": resoudre_conversation(d, donnees, etat)}
    return {"noeud": resoudre_noeud(d, donnees, etat, precedent)}


def _noeud(d: Designation, donnees: Donnees, etat: EtatAffichage, precedent: EtatAffichage | None) -> dict[str, str]:
    cible = _cible(d, donnees, etat, precedent)
    if "noeud" not in cible:
        raise Echec("invalide", "Cette action porte sur un nœud, pas sur une conversation.")
    return cible


def _patch_filtres(c: CriteresFiltre, donnees: Donnees, etat: EtatAffichage) -> dict[str, Any]:
    patch: dict[str, Any] = {}
    if c.conversation is not None:
        patch["conversation"] = resoudre_conversation(c.conversation, donnees, etat)
    if c.statuts is not None:
        patch["statuts"] = list(c.statuts)
    if c.types is not None:
        patch["types"] = list(c.types)
    if c.periode is not None:
        patch["periode"] = {"debut": c.periode.debut, "fin": c.periode.fin}
    if c.texte is not None:
        patch["texte"] = c.texte
    return patch


def traduire(lot: LotNavigation, donnees: Donnees, etat: EtatAffichage | None,
             pile: list[EtatAffichage]) -> Traduction | ErreurProtocole:
    if etat is None:
        return ErreurProtocole(code="introuvable", message="Aucun écran du graphe n'est ouvert.")
    commandes: list[dict[str, Any]] = []
    strategie = etat.strategie
    depiler = 0
    empiler = False
    try:
        for intention in lot.intentions:
            precedent = pile[-1 - depiler] if len(pile) > depiler else None
            if isinstance(intention, IntentionSimple) and intention.intention == "revenir":
                if precedent is None:
                    raise Echec("etat_invalide", "Il n'y a rien à annuler.")
                commandes.append({"op": "restaurer", "etat": precedent.model_dump(mode="json", exclude_unset=True)})
                strategie = precedent.strategie
                depiler += 1
                continue
            empiler = True
            match intention:
                case IntentionDesignation(intention="montrer", quoi=quoi):
                    cible = _cible(quoi, donnees, etat, precedent)
                    commandes.append({"op": "cadrer", "cibles": [cible]})
                    if "noeud" in cible:
                        commandes.append({"op": "surligner", "cibles": [cible]})
                case IntentionDesignation(intention="lignee", quoi=quoi):
                    cible = _noeud(quoi, donnees, etat, precedent)
                    commandes += [{"op": "selectionner", "cible": cible}, {"op": "cadrer", "cibles": "selection"}]
                case IntentionDesignation(intention="portee", quoi=quoi):
                    cible = _noeud(quoi, donnees, etat, precedent)
                    commandes += [{"op": "portee", "cible": cible}, {"op": "cadrer", "cibles": "selection"}]
                case IntentionDesignation(intention="detailler", quoi=quoi):
                    cible = _noeud(quoi, donnees, etat, precedent)
                    commandes += [{"op": "selectionner", "cible": cible}, {"op": "fiche", "cible": cible}]
                case IntentionNiveau(niveau=niveau):
                    if niveau in NIVEAUX:
                        strategie = NIVEAUX[niveau]
                    else:
                        cran = CRAN_STRATEGIE.get(strategie, 0) + (1 if niveau == "plus" else -1)
                        strategie = ORDRE_NIVEAUX[max(0, min(len(ORDRE_NIVEAUX) - 1, cran))]
                    commandes.append({"op": "strategie", "id": strategie})
                case IntentionLiensComplets(oui=oui):
                    commandes.append({"op": "liens_complets", "oui": oui})
                case IntentionPointDeVue(mode=mode, vue=vue):
                    commandes.append({"op": "mode", "mode": mode})
                    if mode == "3d" and vue is not None and VUES[vue] is not None:
                        commandes.append({"op": "vue", "nom": VUES[vue]})
                case IntentionFiltrer(criteres=criteres, action=action):
                    commandes.append({"op": "filtres", "patch": {**_patch_filtres(criteres, donnees, etat), "mode": action}})
                case IntentionSimple(intention="effacer_filtres"):
                    commandes.append({"op": "effacer_filtres"})
                case IntentionSimple(intention="effacer_selection"):
                    commandes += [{"op": "selectionner", "cible": None}, {"op": "surligner", "cibles": []},
                                  {"op": "fiche", "cible": None}]
                case IntentionSimple(intention="tout_voir"):
                    commandes += [{"op": "effacer_filtres"}, {"op": "selectionner", "cible": None},
                                  {"op": "cadrer", "cibles": "tout"}]
    except Echec as e:
        return e.erreur
    sortie = LotCommandes.model_validate({
        "version": 1, "lot_id": lot.lot_id, "ecran": etat.ecran, "origine": "navigateur", "tache_id": lot.tache_id,
        "emis_le": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z", "commandes": commandes[:50],
    })
    return Traduction(lot=sortie, depiler=depiler, empiler=empiler)


def mettre_a_jour_pile(pile: list[EtatAffichage], t: Traduction, avant: EtatAffichage) -> None:
    """Après un compte rendu réussi : retire les états restaurés, puis garde l'état d'avant le lot."""
    for _ in range(t.depiler):
        pile.pop()
    if t.empiler:
        pile.append(avant)
        del pile[:-TAILLE_PILE]
