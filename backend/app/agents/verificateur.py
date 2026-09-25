"""Vérificateur : juge une démonstration isolément, sans l'historique du chercheur."""

import json
import logging
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from .. import config, graphe
from ..graphe import ErreurGraphe
from ..modele import Demonstration, Noeud
from .boucle import Arret, Outil, executer

log = logging.getLogger(__name__)

AUTEUR = "verificateur"

SYSTEM = """Tu es un rapporteur mathématique exigeant. On te soumet UNE démonstration d'un énoncé, avec les énoncés des prémisses qu'elle cite.

Ta seule question : cette démonstration établit-elle l'énoncé, en tenant les prémisses citées pour vraies ?
- Les prémisses sont supposées vraies : ne juge pas si elles sont elles-mêmes démontrées.
- Vérifie chaque étape. Toute étape fausse, tout trou non trivial, tout cas oublié rend la démonstration invalide.
- Tout résultat non élémentaire utilisé doit figurer parmi les prémisses citées. S'il est utilisé sans être cité, la démonstration est invalide.
- Vérifie que ce qui est démontré est bien l'énoncé exact (mêmes hypothèses, même conclusion), pas un énoncé plus faible.
- Dans le doute, invalide : un faux positif coûte bien plus cher qu'un faux négatif.

Rends ton verdict en appelant `rendre_verdict` exactement une fois. La `raison` doit être concise et utile au chercheur : si invalide, l'étape précise qui échoue et pourquoi ; si valide, une phrase qui résume pourquoi la démonstration tient."""


def _message(noeud: Noeud, demo: Demonstration, premisses: list[Noeud]) -> str:
    bloc_premisses = "\n\n".join(f"### `{p.id}` — {p.nom}\n{p.enonce}" for p in premisses) or "_(aucune)_"
    return f"""# Énoncé à démontrer
`{noeud.id}` — {noeud.nom}

{noeud.enonce}

# Prémisses citées
{bloc_premisses}

# Démonstration soumise : « {demo.nom_demonstration} »
{demo.demonstration}

---
Identifiants pour ton verdict : id = {json.dumps(noeud.id)}, nom_demonstration = {json.dumps(demo.nom_demonstration)}."""


def verifier_une(noeud: Noeud, demo: Demonstration, premisses: list[Noeud], stop: threading.Event) -> str | None:
    """Renvoie la validité rendue, ou None si le vérificateur n'a pas conclu."""
    verdict: dict[str, str] = {}

    def rendre_verdict(id: str, nom_demonstration: str, validite: str, raison: str) -> dict:
        if (id, nom_demonstration) != (noeud.id, demo.nom_demonstration):
            raise ErreurGraphe(
                f"Tu dois juger {noeud.id} / « {demo.nom_demonstration} », pas {id} / « {nom_demonstration} »."
            )
        if verdict:
            raise ErreurGraphe("Verdict déjà rendu.")
        graphe.rendre_verdict(
            noeud_id=id, nom_demonstration=nom_demonstration, validite=validite, raison=raison, auteur=AUTEUR
        )
        verdict["validite"] = validite
        return {"ok": True}

    outil = Outil(
        nom="rendre_verdict",
        description="Enregistre ton verdict sur la démonstration soumise.",
        schema={
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Id du nœud"},
                "nom_demonstration": {"type": "string"},
                "validite": {"type": "string", "enum": ["valide", "invalide"]},
                "raison": {"type": "string"},
            },
            "required": ["id", "nom_demonstration", "validite", "raison"],
            "additionalProperties": False,
        },
        fonction=rendre_verdict,
    )
    executer(
        modele=config.MODELE_VERIFICATEUR,
        effort=config.EFFORT_VERIFICATEUR,
        system=SYSTEM,
        outils=[outil],
        message=_message(noeud, demo, premisses),
        stop=stop,
        max_tours=3,
    )
    return verdict.get("validite")


def lancer(ids: list[str] | None, stop: threading.Event, progres: Callable[[str], None]) -> str:
    noeuds = graphe.charger()
    par_id = {n.id: n for n in noeuds}
    taches = [
        (n, d)
        for n in noeuds
        if ids is None or n.id in ids
        for d in n.demonstrations
        if d.validite == "a_verifier"
    ]
    if not taches:
        return "Rien à vérifier."

    faits = 0
    verrou = threading.Lock()

    def une(tache: tuple[Noeud, Demonstration]) -> str | None:
        nonlocal faits
        noeud, demo = tache
        if stop.is_set():
            return None
        try:
            premisses = [par_id[p] for p in demo.justifie_par if p in par_id]
            return verifier_une(noeud, demo, premisses, stop)
        except Arret:
            return None
        except Exception:
            log.exception("Vérification échouée : %s / %s", noeud.id, demo.nom_demonstration)
            return None
        finally:
            with verrou:
                faits += 1
                progres(f"{faits}/{len(taches)} démonstrations")

    with ThreadPoolExecutor(max_workers=config.VERIFICATIONS_PARALLELES) as pool:
        resultats = list(pool.map(une, taches))

    valides = resultats.count("valide")
    invalides = resultats.count("invalide")
    return f"{valides} valide(s), {invalides} invalide(s), {len(taches) - valides - invalides} sans verdict."
