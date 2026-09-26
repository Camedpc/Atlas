"""Sous-agents que l'orchestrateur peut lancer (outils multi-agents de Codex).

Chaque rôle devient la section `[agents.<nom>]` de la config Codex, par exemple :

    SOUS_AGENTS["expert_litterature"] = {
        "description": "Quand le lancer (lu par l'orchestrateur pour choisir).",
        # Couche de config propre au rôle (modèle, consignes, outils…), au format config.toml de Codex.
        "config_file": str(Path(__file__).parent / "roles" / "expert_litterature.toml"),
    }
"""

SOUS_AGENTS: dict[str, dict[str, str]] = {}
