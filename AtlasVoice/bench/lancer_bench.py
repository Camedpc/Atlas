"""Benchmark du modèle d'Atlas (section 5.4).

Rejoue les 176 énoncés sur chaque modèle candidat, avec exactement le prompt, les outils et le
chemin d'appel de la production (proxy d'Atlas), puis mesure :
- l'exactitude de l'outil, du type d'agent et des arguments clés ;
- le temps jusqu'au premier token (p50 / p95) depuis cette machine ;
- le coût pour 1 000 tours.
Recommande le plus rapide qui passe les seuils, et le suivant comme secours.

    python bench/lancer_bench.py                     # tous les modèles dont la clé est définie
    python bench/lancer_bench.py --modeles haiku --limite 20

À relancer à chaque changement de prompt, d'outil ou de modèle.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent / "backend"))
sys.path.insert(0, str(ICI))

from app.config import ModeleLLM  # noqa: E402  (charge aussi le .env)
from app.llm.proxy import _flux, _utile  # noqa: E402
from app.affichage.protocole import EtatResume  # noqa: E402
from app.registre.modele import ModificationProposee, Tache  # noqa: E402
from app.voix.outils import DEFINITIONS  # noqa: E402
from app.voix.prompt import instructions  # noqa: E402
from prompt_gradbot import RESET_ASR, systeme  # noqa: E402

SEUIL_OUTIL = 0.95
SEUIL_AGENT = 0.95
OUTILS = [{"type": "function", "function": d} for d in DEFINITIONS] + [RESET_ASR]
ARGUMENTS_CLES = ("decision", "mode", "tache_id")


def charger_enonces() -> list[dict[str, Any]]:
    transcrits = ICI / "enonces_transcrits.jsonl"
    fichier = transcrits if transcrits.exists() else ICI / "enonces.jsonl"
    print(f"Énoncés : {fichier.name}" + ("" if transcrits.exists() else " (texte brut, sans passage par Gradium STT)"))
    with fichier.open(encoding="utf-8") as f:
        return [json.loads(ligne) for ligne in f if ligne.strip()]


def taches(etat: list[dict[str, Any]]) -> list[Tache]:
    res = []
    for d in etat:
        modif = d.get("modification_proposee")
        res.append(Tache(
            id=d["tache_id"], utilisateur_id="bench", titre=d["titre"], type_agent=d["type_agent"],
            demande_brute="", reformulation="", statut=d["statut"], avancement=d.get("avancement"),
            question=d.get("question"), resultat_oral=d.get("resultat_oral"), erreur=d.get("erreur"),
            modification_proposee=ModificationProposee(description_orale=modif) if modif else None,
        ))
    return res


# Écran du graphe affiché pendant le bench (ligne « À l'écran » du prompt, comme en production).
_EXEMPLE_P1 = ICI.parents[1] / "protocoles" / "exemples" / "p1-tache" / "valides" / "navigation_avec_ecran.json"
ECRAN = EtatResume.model_validate(json.loads(_EXEMPLE_P1.read_text("utf-8"))["contexte"]["affichage"])


def requete(enonce: dict[str, Any], etats: dict[str, list]) -> dict[str, Any]:
    messages = [{"role": "system", "content": systeme(instructions(taches(etats[enonce["etat"]]), ecran=ECRAN))}]
    for tour in enonce.get("historique") or []:
        messages.append({"role": "user" if tour["role"] == "utilisateur" else "assistant", "content": tour["texte"]})
    messages.append({"role": "user", "content": enonce.get("transcription") or enonce["texte"]})
    return {"messages": messages, "tools": OUTILS, "stream": True, "stream_options": {"include_usage": True},
            "max_completion_tokens": 400}


async def appeler(modele: ModeleLLM, corps: dict[str, Any]) -> dict[str, Any]:
    debut = time.perf_counter()
    ttft = None
    appels: dict[int, dict[str, str]] = {}
    texte, usage = "", {}
    async for bloc in _flux(modele, corps):
        for ligne in bloc.splitlines():
            if ttft is None and _utile(ligne):
                ttft = time.perf_counter() - debut
            if not ligne.startswith("data:") or ligne.strip() == "data: [DONE]":
                continue
            charge = json.loads(ligne[5:])
            usage = charge.get("usage") or usage
            for choix in charge.get("choices") or []:
                delta = choix.get("delta") or {}
                texte += delta.get("content") or ""
                for appel in delta.get("tool_calls") or []:
                    courant = appels.setdefault(appel["index"], {"nom": "", "arguments": ""})
                    fonction = appel.get("function") or {}
                    courant["nom"] += fonction.get("name") or ""
                    courant["arguments"] += fonction.get("arguments") or ""
    outils = []
    for appel in appels.values():
        try:
            args = json.loads(appel["arguments"] or "{}")
        except json.JSONDecodeError:
            args = {"_invalide": appel["arguments"]}
        outils.append({"nom": appel["nom"], "arguments": args})
    return {"ttft": ttft, "texte": texte, "outils": outils, "usage": usage}


def noter(enonce: dict[str, Any], reponse: dict[str, Any]) -> dict[str, Any]:
    attendu = enonce["attendu"]
    appels = [o for o in reponse["outils"] if o["nom"] != "reset_asr"]
    obtenu = appels[0] if appels else None
    nom = obtenu["nom"] if obtenu else None
    acceptes = attendu.get("outils_acceptes") or [attendu["outil"]]
    ok_outil = nom in acceptes
    args = obtenu["arguments"] if obtenu else {}

    ok_agent = None
    if attendu.get("outil") == "lancer_tache" and "type_agent" in attendu:
        ok_agent = nom == "lancer_tache" and args.get("type_agent") == attendu["type_agent"]
        if nom != "lancer_tache" and ok_outil:
            ok_agent = None  # réponse alternative acceptée : le type d'agent ne s'applique pas

    ok_args = True
    if ok_outil and nom is not None and nom == attendu.get("outil"):
        for cle in ARGUMENTS_CLES:
            if cle in attendu and str(args.get(cle)) != str(attendu[cle]):
                ok_args = False
        if attendu.get("correction") and not str(args.get("correction") or "").strip():
            ok_args = False
    return {
        "id": enonce["id"], "piege": enonce["piege"], "outil_attendu": acceptes, "outil_obtenu": nom,
        "arguments": args, "texte": reponse["texte"], "ok_outil": ok_outil, "ok_agent": ok_agent,
        "ok_arguments": ok_args, "ok": ok_outil and ok_agent is not False and ok_args,
        "ttft": reponse["ttft"], "usage": reponse["usage"],
    }


def quantile(valeurs: list[float], q: float) -> float | None:
    if not valeurs:
        return None
    valeurs = sorted(valeurs)
    return valeurs[min(len(valeurs) - 1, round(q * (len(valeurs) - 1)))]


def synthese(config: dict[str, Any], notes: list[dict[str, Any]]) -> dict[str, Any]:
    reussis = [n for n in notes if "erreur" not in n]
    ttfts = [n["ttft"] for n in reussis if n["ttft"] is not None]
    agents = [n["ok_agent"] for n in reussis if n["ok_agent"] is not None]
    pieges = [n for n in reussis if n["piege"]]
    cout = None
    prix = config.get("prix_par_million")
    if prix and reussis:
        entree = statistics.mean(n["usage"].get("prompt_tokens", 0) for n in reussis)
        sortie = statistics.mean(n["usage"].get("completion_tokens", 0) for n in reussis)
        cout = 1000 * (entree * prix["entree"] + sortie * prix["sortie"]) / 1e6
    return {
        "modele": config["nom"],
        "n": len(notes),
        "erreurs_api": len(notes) - len(reussis),
        "exactitude": sum(n["ok"] for n in reussis) / len(notes) if notes else 0,
        "exactitude_outil": sum(n["ok_outil"] for n in reussis) / len(notes) if notes else 0,
        "exactitude_type_agent": sum(agents) / len(agents) if agents else None,
        "exactitude_pieges": sum(n["ok"] for n in pieges) / len(pieges) if pieges else None,
        "ttft_p50_ms": round(1000 * statistics.median(ttfts)) if ttfts else None,
        "ttft_p95_ms": round(1000 * quantile(ttfts, 0.95)) if ttfts else None,
        "cout_1000_tours_usd": round(cout, 3) if cout is not None else None,
    }


async def evaluer(config: dict[str, Any], enonces: list[dict], etats: dict) -> tuple[dict, list[dict]]:
    modele = ModeleLLM(fournisseur=config["fournisseur"], modele=config["modele"], base_url=config.get("base_url"),
                       cle=os.environ.get(config["cle_env"]), extra=config.get("extra") or {})
    notes = []
    for i, enonce in enumerate(enonces, 1):
        try:
            notes.append(noter(enonce, await appeler(modele, requete(enonce, etats))))
        except Exception as e:  # noqa: BLE001 - une erreur d'API compte comme un échec
            notes.append({"id": enonce["id"], "piege": enonce["piege"], "erreur": str(e)[:200], "ok": False,
                          "ok_outil": False})
        print(f"\r  {config['nom']} : {i}/{len(enonces)}", end="", flush=True)
    print()
    return synthese(config, notes), notes


def recommander(syntheses: list[dict[str, Any]]) -> tuple[str | None, str | None]:
    passent = [s for s in syntheses
               if s["exactitude"] >= SEUIL_OUTIL and (s["exactitude_type_agent"] or 0) >= SEUIL_AGENT
               and s["ttft_p50_ms"] is not None]
    passent.sort(key=lambda s: (s["ttft_p50_ms"], s["ttft_p95_ms"] or 0))
    return (passent[0]["modele"] if passent else None, passent[1]["modele"] if len(passent) > 1 else None)


def tableau(syntheses: list[dict[str, Any]]) -> str:
    def pct(v):
        return "—" if v is None else f"{100 * v:.1f} %"

    lignes = ["| Modèle | Outil + arguments | Type d'agent | Pièges | TTFT p50 | TTFT p95 | $ / 1 000 tours |",
              "|---|---|---|---|---|---|---|"]
    for s in syntheses:
        lignes.append(
            f"| {s['modele']} | {pct(s['exactitude'])} | {pct(s['exactitude_type_agent'])} | "
            f"{pct(s['exactitude_pieges'])} | {s['ttft_p50_ms'] or '—'} ms | {s['ttft_p95_ms'] or '—'} ms | "
            f"{s['cout_1000_tours_usd'] if s['cout_1000_tours_usd'] is not None else '—'} |")
    return "\n".join(lignes)


async def principal() -> None:
    parseur = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parseur.add_argument("--modeles", nargs="*", help="Filtre sur le nom des modèles (sous-chaîne)")
    parseur.add_argument("--limite", type=int, help="N'utiliser que les N premiers énoncés")
    options = parseur.parse_args()

    etats = json.loads((ICI / "etats.json").read_text(encoding="utf-8"))
    enonces = charger_enonces()[: options.limite]
    configs = json.loads((ICI / "modeles.json").read_text(encoding="utf-8"))
    if options.modeles:
        configs = [c for c in configs if any(f.lower() in c["nom"].lower() for f in options.modeles)]

    syntheses, details = [], {}
    for config in configs:
        if not os.environ.get(config["cle_env"]):
            print(f"  {config['nom']} : ignoré ({config['cle_env']} non défini)")
            continue
        s, notes = await evaluer(config, enonces, etats)
        syntheses.append(s)
        details[config["nom"]] = notes

    if not syntheses:
        print("Aucun modèle évalué.")
        return
    principal_, secours = recommander(syntheses)
    print("\n" + tableau(syntheses))
    print(f"\nSeuils : outil et arguments ≥ {SEUIL_OUTIL:.0%}, type d'agent ≥ {SEUIL_AGENT:.0%}.")
    print(f"Modèle principal recommandé : {principal_ or 'aucun ne passe les seuils'}")
    print(f"Modèle de secours : {secours or '—'}")

    dossier = ICI / "resultats"
    dossier.mkdir(exist_ok=True)
    horodatage = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    sortie = dossier / f"{horodatage}.json"
    sortie.write_text(json.dumps({"syntheses": syntheses, "principal": principal_, "secours": secours,
                                  "details": details}, ensure_ascii=False, indent=1), encoding="utf-8")
    (dossier / f"{horodatage}.md").write_text(tableau(syntheses) + "\n", encoding="utf-8")
    print(f"Détails : {sortie}")


if __name__ == "__main__":
    asyncio.run(principal())
