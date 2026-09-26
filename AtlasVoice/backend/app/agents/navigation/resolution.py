"""Résolution déterministe des désignations (P2) sur les vraies données : « le lemme de compacité »,
« la conversation sur l'énergie », « celui-là »… → id de nœud ou UUID de conversation.

Aucun hasard : à données, état et texte identiques, même résultat. Deux candidats trop proches donnent
une erreur `ambigu` avec la question à poser, jamais un choix arbitraire.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from ...affichage.protocole import Designation, EtatAffichage, ErreurProtocole

# Score minimal pour retenir un candidat, et écart en dessous duquel deux candidats sont « trop proches ».
SEUIL = 40
ECART_AMBIGU = 8
NB_PROPOSITIONS = 3

MOTS_VIDES = frozenset(
    "le la les l un une des du de d au aux a et en sur pour par avec ce cet cette ces celui celle ceux "
    "qui que dont son sa ses mon ma mes ton ta tes notre nos votre vos leur leurs".split()
)

# Mot de la désignation → type de raisonnement (mêmes types que le moteur d'affichage).
MOTS_TYPES: dict[str, str] = {
    "lemme": "lemme", "lemmes": "lemme", "theoreme": "theoreme", "theoremes": "theoreme", "corollaire": "theoreme",
    "definition": "definition", "definitions": "definition", "hypothese": "hypothese", "hypotheses": "hypothese",
    "axiome": "axiome", "axiomes": "axiome", "proposition": "proposition", "propositions": "proposition",
    "resultat": "resultat", "resultats": "resultat", "conjecture": "conjecture", "conjectures": "conjecture",
    "decision": "decision", "decisions": "decision", "observation": "observation", "observations": "observation",
    "experience": "experience", "experiences": "experience", "calcul": "calcul", "calculs": "calcul",
    "choix": "choix_modelisation", "assertion": "assertion", "assertions": "assertion",
}
MOTS_CONVERSATION = frozenset({"conversation", "conversations", "discussion", "echange", "recherche"})
MOTS_ACTUELLE = frozenset({"actuelle", "courante", "ouverte", "affichee", "en", "cours"})

# Mêmes règles que frontend/src/graphe/donneesAtlas.ts (deduireType).
PREFIXES = [
    (r"^(def|notation)", "definition"), (r"^ax", "axiome"), (r"^(hyp|h_)", "hypothese"),
    (r"^(cm_|choix)", "choix_modelisation"), (r"^dec", "decision"), (r"^(lem|lt_)", "lemme"),
    (r"^prop", "proposition"), (r"^(thm|theoreme|cor)", "theoreme"), (r"^exp", "experience"),
    (r"^(calc|sim)", "calcul"), (r"^obs", "observation"), (r"^res", "resultat"), (r"^conj", "conjecture"),
]


def normaliser(texte: str) -> str:
    """Minuscules sans accents ; apostrophes, tirets, soulignés et ponctuation deviennent des espaces."""
    t = unicodedata.normalize("NFD", texte)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", t)).strip()


def mots(texte: str) -> list[str]:
    return normaliser(texte).split()


def deduire_type(noeud: dict[str, Any]) -> str:
    identifiant = noeud["id"].lower()
    for motif, type_ in PREFIXES:
        if re.match(motif, identifiant):
            return type_
    if noeud.get("admis"):
        return "definition"
    if not noeud.get("enfants") and noeud.get("demonstrations"):
        return "resultat"
    return "assertion"


@dataclass
class Donnees:
    """Ce que l'agent sait du graphe : nœuds de GET /api/graphe, conversations de GET /api/conversations."""

    noeuds: list[dict[str, Any]]
    conversations: list[dict[str, Any]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.par_id = {n["id"]: n for n in self.noeuds}
        self.types = {n["id"]: deduire_type(n) for n in self.noeuds}


class Echec(Exception):
    """Désignation non résolue : l'erreur de protocole à rendre (introuvable, ambigu, etat_invalide)."""

    def __init__(self, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.erreur = ErreurProtocole(code=code, message=message, details=details)


def _correspond(terme: str, candidat: str) -> bool:
    """Même mot, ou même racine d'au moins 5 lettres (pluriels, « compacite » / « compact »)."""
    if terme == candidat:
        return True
    court, long_ = sorted((terme, candidat), key=len)
    return len(court) >= 5 and long_.startswith(court)


def _part(termes: list[str], vocabulaire: set[str]) -> float:
    if not termes:
        return 0.0
    return sum(any(_correspond(t, v) for v in vocabulaire) for t in termes) / len(termes)


def _termes(texte: str) -> tuple[list[str], str | None]:
    """Termes significatifs de la désignation et type indiqué par un mot (« le lemme de … »)."""
    termes, type_ = [], None
    for m in mots(texte):
        if m in MOTS_VIDES:
            continue
        if m in MOTS_TYPES and type_ is None:
            type_ = MOTS_TYPES[m]
            continue
        termes.append(m)
    return termes, type_


def _question(noms: list[str]) -> str:
    cites = [f"« {n} »" for n in noms]
    return f"Lequel veux-tu : {', '.join(cites[:-1])} ou {cites[-1]} ?"


def _choisir(scores: list[tuple[float, str, str]], quoi: str) -> str:
    """scores : (score, id, nom). Le meilleur, sauf s'il n'y en a pas ou s'il est trop proche du suivant."""
    retenus = sorted((s for s in scores if s[0] >= SEUIL), key=lambda s: (-s[0], s[1]))
    if not retenus:
        raise Echec("introuvable", f"Je ne trouve pas {quoi}.")
    proches = [s for s in retenus if s[0] > retenus[0][0] - ECART_AMBIGU]
    if len(proches) > 1:
        proches = proches[:NB_PROPOSITIONS]
        raise Echec("ambigu", _question([s[2] for s in proches]), {"candidats": [s[1] for s in proches]})
    return retenus[0][1]


def resoudre_noeud(d: Designation, donnees: Donnees, etat: EtatAffichage | None,
                   precedent: EtatAffichage | None = None) -> str:
    """Id du nœud désigné."""
    if d.deictique is not None:
        return _deictique(d.deictique, etat, precedent, donnees)
    termes, type_mot = _termes(d.texte)
    type_ = d.type or type_mot
    visibles = {v.noeud for v in etat.visibles} if etat else set()
    candidats = donnees.noeuds
    if type_ is not None:
        du_type = [n for n in candidats if donnees.types[n["id"]] == type_]
        candidats = du_type or candidats
    scores: list[tuple[float, str, str]] = []
    for n in candidats:
        nom = " ".join(t for t in mots(n["nom"]) if t not in MOTS_VIDES)
        if not termes:
            # « le théorème » : tous les nœuds du type sont candidats à égalité.
            score = float(SEUIL) if type_ is not None and donnees.types[n["id"]] == type_ else 0.0
        elif " ".join(termes) == nom:
            score = 100.0
        else:
            part_nom = _part(termes, set(mots(n["nom"])) | set(mots(n["id"])))
            part_enonce = _part(termes, set(mots(n.get("enonce", ""))))
            score = max(80 * part_nom if part_nom >= 0.5 else 0.0, 45 * part_enonce if part_enonce >= 0.75 else 0.0)
        if score and type_ is not None and donnees.types[n["id"]] == type_:
            score += 5
        if score and n["id"] in visibles:
            score += 3
        scores.append((score, n["id"], n["nom"]))
    return _choisir(scores, f"« {d.texte} » dans le graphe")


def _deictique(genre: str, etat: EtatAffichage | None, precedent: EtatAffichage | None, donnees: Donnees) -> str:
    ref = None
    if genre == "selection" and etat is not None:
        ref = etat.selection or etat.fiche
    elif genre == "survol" and etat is not None:
        ref = etat.survol
    elif genre == "precedent" and precedent is not None:
        ref = precedent.selection or precedent.fiche
    if ref is None:
        messages = {"selection": "Aucun nœud n'est sélectionné.", "survol": "Aucun nœud n'est survolé.",
                    "precedent": "Il n'y a pas de nœud précédent."}
        raise Echec("etat_invalide", messages[genre])
    if ref.noeud not in donnees.par_id:
        raise Echec("introuvable", f"Le nœud {ref.noeud} n'existe plus.")
    return ref.noeud


def resoudre_conversation(d: Designation, donnees: Donnees, etat: EtatAffichage | None) -> str:
    """UUID de la conversation désignée ; « cette conversation » = celle ouverte à l'écran."""
    termes = [t for t in _termes(d.texte)[0] if t not in MOTS_CONVERSATION]
    if d.deictique is not None or not termes or all(t in MOTS_ACTUELLE for t in termes):
        if etat is None or etat.conversation_affichee is None:
            raise Echec("etat_invalide", "Aucune conversation n'est ouverte.")
        return etat.conversation_affichee
    scores: list[tuple[float, str, str]] = []
    for c in donnees.conversations:
        titre = c.get("titre") or ""
        part = _part(termes, set(mots(titre)))
        scores.append((80 * part if part >= 0.5 else 0.0, c["id"], titre))
    return _choisir(scores, f"« {d.texte} » parmi les conversations")


def est_conversation(d: Designation) -> bool:
    return d.genre == "conversation" or (d.genre is None and any(m in MOTS_CONVERSATION for m in mots(d.texte)))
