"""Vérificateur : juge chaque démonstration « à vérifier » seule, avec l'énoncé de son nœud et ceux de ses prémisses.

Chaque jugement est un thread Codex éphémère, sans outils ni recherche web, qui répond en sortie structurée. Le
modèle économique juge d'abord ; un verdict « invalide » ou peu sûr est rejugé par le modèle de recours, dont le
verdict fait foi. C'est Python qui écrit le verdict (validite, confiance) et sa justification dans le journal.
"""

import asyncio
import json
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass
from typing import Any, Literal

from openai_codex import ApprovalMode, AsyncCodex, Sandbox
from openai_codex.types import ReasoningEffort

from .. import decisions, ecriture, lecture, navigation
from ..modeles import Demonstration, LigneNoeud
from . import agent, config
from .consignes import consigne

AUTEUR = "verificateur"

SCHEMA_VERDICT: dict[str, Any] = {
    "type": "object",
    "properties": {
        "validite": {"type": "string", "enum": ["valide", "invalide"]},
        "confiance": {"type": "number"},
        "justification": {"type": "string"},
    },
    "required": ["validite", "confiance", "justification"],
    "additionalProperties": False,
}


@dataclass
class Verdict:
    validite: Literal["valide", "invalide"]
    confiance: float
    justification: str
    modele: str


# ── Fonctions pures ──────────────────────────────────────────────────────────


def demande(demonstration: Demonstration, noeuds: dict[str, LigneNoeud]) -> str:
    """Tout ce que voit le vérificateur : le nœud, ses prémisses et la démonstration."""
    noeud = noeuds[demonstration.noeud_id]
    def premisse(p: str) -> str:
        if p not in noeuds:
            return f"### {p}\n(nœud introuvable)"
        n = noeuds[p]
        if n.type == "decision":  # un choix posé avec ses raisons : à tenir pour acquis, comme une hypothèse
            return f"### {p} — décision : {n.nom}\n{n.enonce}\n{decisions.texte(n.details)}"
        return f"### {p} — {n.nom}\n{n.enonce}"

    premisses = "\n\n".join(premisse(p) for p in demonstration.justifie_par)
    return (
        f"# Nœud à établir : {noeud.id} — {noeud.nom}\n{noeud.enonce}\n\n"
        f"# Prémisses\n{premisses or '(aucune)'}\n\n"
        f"# Démonstration « {demonstration.nom_demonstration} »\n{demonstration.demonstration}"
    )


def lire_verdict(texte: str | None, modele: str) -> Verdict:
    donnees = json.loads(texte or "")
    if donnees.get("validite") not in ("valide", "invalide"):
        raise ValueError(f"Verdict illisible : {texte}")
    confiance = min(1.0, max(0.0, float(donnees["confiance"])))
    return Verdict(donnees["validite"], confiance, str(donnees.get("justification", "")).strip(), modele)


def a_rejuger(verdict: Verdict, seuil: float) -> bool:
    return verdict.validite == "invalide" or verdict.confiance < seuil


def a_verifier(demonstrations: list[Demonstration], noeud_ids: list[str]) -> list[Demonstration]:
    """Démonstrations « à vérifier » des nœuds demandés (tous si la liste est vide)."""
    return [
        d for d in demonstrations if d.validite == "a_verifier" and (not noeud_ids or d.noeud_id in noeud_ids)
    ]


# ── Jugement ─────────────────────────────────────────────────────────────────


async def juger(codex: AsyncCodex, texte: str, modele: str, effort: str) -> Verdict:
    dossier = config.ESPACE_TRAVAIL / ".verificateur"
    dossier.mkdir(parents=True, exist_ok=True)
    thread = await codex.thread_start(
        model=modele,
        # Il n'a besoin d'aucune commande. Sur la VM, où le sandbox Linux ne peut pas démarrer, elles échouent toutes.
        sandbox=Sandbox.read_only,
        approval_mode=ApprovalMode.deny_all,
        cwd=str(dossier),
        developer_instructions=consigne("verificateur"),
        ephemeral=True,
        config={"web_search": "disabled", "project_root_markers": [], "features": {"hooks": False}},
    )
    resultat = await thread.run(texte, effort=ReasoningEffort(effort), output_schema=SCHEMA_VERDICT)
    if resultat.status.value != "completed":
        message = resultat.error.message if resultat.error is not None else resultat.status.value
        raise RuntimeError(f"Jugement non terminé : {message}")
    return lire_verdict(resultat.final_response, modele)


def modeles_juges() -> tuple[str, str]:
    """Modèles du juge économique et du recours (ATLAS_MODELE_VERIFICATEUR, ATLAS_MODELE_VERIFICATEUR_RECOURS)."""
    return config.modele_agent("verificateur", "gpt-6-luna"), config.modele_agent("verificateur_recours", "gpt-6-sol")


def titres(
    demonstrations: list[Demonstration], noeuds: dict[str, LigneNoeud], reperes: dict[str, str]
) -> dict[str, str]:
    """Nom de chaque démonstration dans l'agent graph : « Lemme 7 · récurrence » (repère de l'écran), sinon le nom
    du nœud. Clé : `cle_demonstration`."""
    def noeud(i: str) -> str:
        return reperes.get(i) or (noeuds[i].nom if i in noeuds else i)

    return {cle_demonstration(d): f"{noeud(d.noeud_id)} · {d.nom_demonstration}" for d in demonstrations}


def cle_demonstration(d: Demonstration) -> str:
    return f"{d.noeud_id}/{d.nom_demonstration}"


Raconter = Callable[[dict[str, Any]], Awaitable[None]]


async def _reperes(projet_id: str) -> dict[str, str]:
    """Repères de l'écran (« Lemme 7 ») ; vides si la vue ne se lit pas : ce n'est qu'un affichage."""
    try:
        return navigation.reperer(await asyncio.to_thread(lecture.charger_etat_vue, projet_id)).noeuds
    except Exception:
        return {}


async def verifier(projet_id: str, noeud_ids: list[str], raconter: Raconter | None = None) -> list[dict[str, Any]]:
    """Juge en parallèle les démonstrations « à vérifier » du graphe du projet et écrit chaque verdict. Renvoie un
    résultat par démonstration (ou son erreur, sans interrompre les autres). `raconter` reçoit l'avancement (début,
    chaque juge, chaque verdict, fin : voir `SuiviAgents.verification`) pour l'agent graph."""
    demonstrations = a_verifier(await asyncio.to_thread(lecture.lister_demonstrations, projet_id), noeud_ids)
    if not demonstrations:
        return []
    noeuds = {n.id: n for n in await asyncio.to_thread(lecture.lister_noeuds, projet_id)}
    juge, juge_recours = modeles_juges()
    economique = (juge, config.effort_agent("verificateur", "high"))
    recours = (juge_recours, config.effort_agent("verificateur_recours", "high"))
    limite = asyncio.Semaphore(config.MAX_VERIFICATIONS)
    noms = titres(demonstrations, noeuds, await _reperes(projet_id) if raconter else {})

    async def dire(evenement: dict[str, Any]) -> None:
        if raconter is not None:
            try:
                await raconter(evenement)
            except Exception:
                pass  # l'agent graph manquera une étape, le verdict est quand même écrit

    await dire({"type": "debut", "total": len(demonstrations)})

    async with AsyncCodex(config=agent.config_codex()) as codex:
        await agent._connecter(codex)

        async def jugement(d: Demonstration, texte: str, etape: str, modele: str, effort: str) -> Verdict:
            base = {"cle": cle_demonstration(d), "etape": etape, "modele": modele}
            await dire({"type": "juge", "titre": noms[base["cle"]], **base})
            verdict = await juger(codex, texte, modele, effort)
            final = etape == "recours" or not a_rejuger(verdict, config.SEUIL_CONFIANCE)
            await dire({"type": "verdict", **base, **asdict(verdict), "final": final})
            return verdict

        async def une(d: Demonstration) -> dict[str, Any]:
            cle = {"noeud_id": d.noeud_id, "nom_demonstration": d.nom_demonstration}
            async with limite:
                try:
                    texte = demande(d, noeuds)
                    verdict = await jugement(d, texte, "juge", *economique)
                    if a_rejuger(verdict, config.SEUIL_CONFIANCE):
                        verdict = await jugement(d, texte, "recours", *recours)
                    await asyncio.to_thread(
                        ecriture.noter_demonstration,
                        projet_id=projet_id,
                        **cle,
                        validite=verdict.validite,
                        confiance=verdict.confiance,
                        justification=verdict.justification,
                        auteur=AUTEUR,
                    )
                except Exception as erreur:
                    await dire({"type": "erreur", "cle": cle_demonstration(d), "message": str(erreur)})
                    return {**cle, "erreur": str(erreur)}
            return {**cle, **asdict(verdict)}

        try:
            return list(await asyncio.gather(*(une(d) for d in demonstrations)))
        finally:
            await dire({"type": "fin"})
