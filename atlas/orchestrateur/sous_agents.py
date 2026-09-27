"""Sous-agents de l'orchestrateur (outils multi-agents de Codex).

Chaque rôle devient la section `[agents.<nom>]` de la config Codex : `description`, lue par l'agent qui choisit
qui lancer, et `config_file`, couche de config propre au rôle (modèle, effort, consignes de `prompts/<nom>.md`),
régénérée dans CODEX_HOME à chaque tour.

Tous les rôles sont visibles de tous les agents : qui lance qui est fixé par les consignes, pas par Codex.
Un sous-agent doit être lancé avec `fork_turns = "none"` : sinon il hérite de tout l'historique de son parent et
Codex ignore le modèle de son rôle.
"""

import json
from dataclasses import dataclass, field

from . import config
from .consignes import consigne_complete


@dataclass(frozen=True)
class Role:
    nom: str
    description: str
    modele: str
    effort: str
    reglages: dict[str, str] = field(default_factory=dict)
    """Autres clés du config.toml de Codex, propres au rôle."""


ROLES = (
    Role(
        "directeur_de_labo",
        "Mène une mission de recherche de bout en bout : convoque la littérature et les expérimentateurs, tient un "
        "journal de bord et rédige un rapport. Lancé par l'orchestrateur, avec un dossier directeurs/NN-sujet/.",
        "gpt-6-astra",
        "high",
    ),
    Role(
        "litterature",
        "Recherche bibliographique : état de l'art, faits sourcés avec références. Lancé par le directeur de labo.",
        "gpt-6-luna",
        "medium",
    ),
    Role(
        "experimentateur",
        "Calcul, simulation, code, vérification numérique, résultats reproductibles. Lancé par le directeur de labo.",
        "gpt-6-sol",
        "high",
    ),
    Role(
        "graphiste",
        "Transforme un rapport de directeur de labo en graphe de raisonnement (nœuds et démonstrations), et rien "
        "d'autre. Par défaut, il complète le graphe existant du projet (réutilise les nœuds, marque les "
        "embranchements par un nœud `decision`) ; il ne pose un raisonnement séparé que sur demande explicite. "
        "Lancé par l'orchestrateur, avec le chemin du rapport.",
        # Banc du 2026-09-27 (rapport de 40 ko) : astra couvre tout le rapport là où sol en laisse un tiers ; le
        # niveau de service « fast » divise la durée par ~1,7 (mais consomme plus de quota).
        "gpt-6-astra",
        "medium",
        {"web_search": "disabled", "service_tier": "fast"},
    ),
    Role(
        "navigateur",
        "Prépare un parcours du graphe de raisonnement (dérouler une preuve étape par étape, visite guidée d'un "
        "cadre, lignée d'un résultat) que Camille déroule à la voix ou aux boutons ; ne modifie ni le graphe ni la "
        "vue. Lancé par l'orchestrateur quand Camille demande à voir un raisonnement pas à pas.",
        "gpt-6-astra",
        "medium",
        {"web_search": "disabled"},
    ),
)


def toml_role(modele: str, effort: str, consignes: str, reglages: dict[str, str]) -> str:
    """Couche de config d'un rôle, au format config.toml (une chaîne JSON est une chaîne TOML valide)."""
    valeurs = {"model": modele, "model_reasoning_effort": effort, "developer_instructions": consignes, **reglages}
    return "".join(f"{cle} = {json.dumps(valeur, ensure_ascii=False)}\n" for cle, valeur in valeurs.items())


def sous_agents() -> dict[str, dict[str, str]]:
    """Écrit la couche de config de chaque rôle et renvoie la section `agents` de la config Codex."""
    dossier = config.CODEX_HOME / "roles"
    dossier.mkdir(parents=True, exist_ok=True)
    agents = {}
    for role in ROLES:
        chemin = dossier / f"{role.nom}.toml"
        chemin.write_text(
            toml_role(
                config.modele_agent(role.nom, role.modele),
                config.effort_agent(role.nom, role.effort),
                consigne_complete(role.nom),
                role.reglages,
            ),
            encoding="utf-8",
        )
        agents[role.nom] = {"description": role.description, "config_file": str(chemin)}
    return agents
