#!/usr/bin/env python3
"""Encodages du graphe de raisonnement d'Atlas pour une IA : génération, mesure, validation, robustesse.

Python standard uniquement. Facultatif, utilisé s'il est déjà installé : `tokenizers` + un `tokenizer.json`
du cache Hugging Face (compte de jetons BPE réel), `yaml` (relecture du YAML), `jsonschema` (validation par
schema/atlas-graphe-1.schema.json). Rien n'est installé par ce script.

    node --experimental-strip-types encodage-ia/exporter-fontaine.mjs   # fontaine/03-prototype.json
    python encodage-ia/encodage.py tout          # génère, mesure, écarts, robustesse, diff, sous-graphes
    python encodage-ia/encodage.py valider encodage-ia/fontaine/04-canonique.json
    python encodage-ia/encodage.py sous-graphe thm_rapport --sens amont --profondeur 2 --roles principale,auxiliaire
"""

from __future__ import annotations

import argparse
import copy
import difflib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ICI = Path(__file__).resolve().parent
DOSSIER = ICI / "fontaine"
SCHEMA = ICI / "schema" / "atlas-graphe-1.schema.json"

TYPES = (
    "hypothese", "definition", "axiome", "choix_modelisation", "decision", "lemme", "proposition", "theoreme",
    "assertion", "experience", "calcul", "observation", "resultat", "conjecture",
)
ROLES = ("principale", "auxiliaire", "technique", "contexte")
VALIDITES = ("a_verifier", "valide", "invalide")
GENRES = ("contredit", "resout", "remplace", "abandonne")
ORIGINES = ("humain", "ia", "ordinateur")
MOTIF_ID = re.compile(r"^[a-z][a-z0-9_]*$")
FORMAT = "atlas.graphe/1"


class ErreurSyntaxe(Exception):
    pass


# ══ Conversion du modèle des prototypes vers le format canonique proposé ════════════════════════════════════

# Le jeu des prototypes n'indique pas d'où viennent ses nœuds admis : sources complétées pour l'exemple
# (la règle proposée exige une source pour tout nœud admis, comme `raison_admis` dans l'outil MCP actuel).
SOURCES = {
    "ax_newton": "Mécanique classique : bilan sur un système ouvert.",
    "ax_gravite": "Mécanique classique.",
    "lt_chainette": "Résultat classique de statique des fils.",
    "lt_buckingham": "Analyse dimensionnelle (Vaschy 1892, Buckingham 1914).",
    "def_hauteurs": "Biggins et Warner, Proc. R. Soc. A 470 (2014).",
    "def_t_eff": "Biggins et Warner, Proc. R. Soc. A 470 (2014).",
    "def_alpha": "Biggins et Warner, Proc. R. Soc. A 470 (2014).",
    "def_beta": "Biggins et Warner, Proc. R. Soc. A 470 (2014).",
}
# L'id « def_T » du jeu viole le motif des ids de la base (^[a-z0-9_]+$) : renommé pour que le jeu soit insérable.
RENOMMAGES = {"def_T": "def_t_eff"}
# Types « posés » : leurs prémisses de pur contexte sont des dépendances d'énoncé (le \uses d'un énoncé dans un
# blueprint Lean), pas une démonstration ; en base elles rendraient « établie » une hypothèse ou une définition.
POSES = {"hypothese", "definition", "axiome", "choix_modelisation"}
AUTEURS = {"Camille Duparc": "camille", "IA · directeur de labo": "directeur_de_labo", "Expérimentateur (calcul)": "experimentateur"}
VERIFIE = {"aucune": [], "ia": ["ia"], "humain": ["humain"], "ia_humain": ["ia", "humain"]}


def depuis_prototype(p: dict) -> dict:
    """JeuRaisonnement (prototypes) → format canonique. Perd volontairement ce qui est calculé ou journalisé :
    statut, validation par nœud, intervalle de confiance, dates, auteur du nœud."""
    c: dict = {"format": FORMAT, "titre": p["titre"], "resume": p["resume"], "sous_problemes": [], "noeuds": [], "liens": []}
    for s in p["sousProblemes"]:
        sp = {"id": s["id"], "nom": s["nom"], "resume": s["resume"]}
        if s.get("abandonne"):
            sp["abandonne"] = True
        c["sous_problemes"].append(sp)
    ren = lambda i: RENOMMAGES.get(i, i)  # noqa: E731
    for n in p["noeuds"]:
        n = {**n, "id": ren(n["id"]), "demonstrations": [{**d, "premisses": [{**q, "id": ren(q["id"])} for q in d["premisses"]]} for d in n["demonstrations"]]}
        m: dict = {"id": n["id"], "type": n["type"], "nom": n["nom"], "enonce": n["enonce"],
                   "sous_probleme": n["sousProbleme"], "origine": n["origine"]}
        if (n["admis"] or n["type"] in POSES) and len(n["demonstrations"]) == 1 and all(q["role"] == "contexte" for q in n["demonstrations"][0]["premisses"]):
            m["utilise"] = [q["id"] for q in n["demonstrations"][0]["premisses"]]
            n["demonstrations"] = []
        if n["admis"]:
            m["admis"] = True
            m["source"] = SOURCES.get(n["id"], "")
        if n["piste"] == "abandonnee":
            m["abandonne"] = True
        if "choix" in n:
            m["choix"] = {k: n["choix"][k] for k in ("hypothese", "portee", "alternatives") if k in n["choix"]}
        if "decision" in n:
            m["decision"] = {
                "question": n["decision"]["question"],
                "alternatives": [{k: a[k] for k in ("libelle", "retenue", "raison") if k in a} for a in n["decision"]["alternatives"]],
                "raison": n["decision"]["raison"],
            }
        demos = []
        for d in n["demonstrations"]:
            groupes: dict[str, list[str]] = {}
            for q in d["premisses"]:
                groupes.setdefault(q["role"], []).append(q["id"])
            e: dict = {"nom": d["nom"], "premisses": {r: groupes[r] for r in ROLES if r in groupes}, "validite": d["validite"]}
            if d["validite"] != "a_verifier":
                e["confiance"] = n["confiance"]["estimation"]
                if VERIFIE[n["validation"]]:
                    e["verifie_par"] = VERIFIE[n["validation"]]
            e["auteur"] = AUTEURS.get(d["auteur"], d["auteur"])
            if d.get("texte"):
                e["texte"] = d["texte"]
            demos.append(e)
        if demos:
            m["demonstrations"] = demos
        c["noeuds"].append(m)
        for lien in n.get("liens", []):
            c["liens"].append({"source": n["id"], "genre": lien["genre"], "cible": ren(lien["cible"]), **({"note": lien["note"]} if lien.get("note") else {})})
    return c


def justifie_par(d: dict) -> list[str]:
    return [i for r in ROLES for i in d.get("premisses", {}).get(r, [])]


def calculer_statuts(c: dict) -> dict[str, str]:
    """Même règle que atlas/graphe.py : point fixe depuis les admis."""
    demos = {n["id"]: n.get("demonstrations", []) for n in c["noeuds"]}
    etablis = {n["id"] for n in c["noeuds"] if n.get("admis")}
    change = True
    while change:
        change = False
        for n in c["noeuds"]:
            if n["id"] not in etablis and any(d["validite"] == "valide" and all(p in etablis for p in justifie_par(d)) for d in demos[n["id"]]):
                etablis.add(n["id"])
                change = True
    res = {}
    for n in c["noeuds"]:
        v = {d["validite"] for d in demos[n["id"]]}
        res[n["id"]] = ("etabli" if n["id"] in etablis else "suspendu" if "valide" in v else "a_verifier" if "a_verifier" in v
                        else "invalide" if demos[n["id"]] else "ouvert")
    return res


# ══ Validation ═══════════════════════════════════════════════════════════════════════════════════════════════


def _structure(c) -> list[str]:
    """Forme des données (ce que le schéma JSON vérifie aussi) : sans elle, les règles suivantes n'ont pas de sens."""
    if not isinstance(c, dict):
        return ["racine : objet attendu"]
    err = [f"{k} : liste attendue" for k in ("noeuds", "sous_problemes", "liens") if not isinstance(c.get(k, []), list)]
    if err:
        return err
    for n in c.get("noeuds", []):
        if not isinstance(n, dict):
            err.append("nœud : objet attendu")
            continue
        err += [f"{n.get('id')} : {k} doit être un texte" for k in ("id", "nom", "enonce") if not isinstance(n.get(k), str)]
        if not isinstance(n.get("utilise", []), list):
            err.append(f"{n.get('id')} : utilise doit être une liste d'ids")
        demos = n.get("demonstrations", [])
        if not isinstance(demos, list):
            err.append(f"{n.get('id')} : demonstrations doit être une liste")
            continue
        for d in demos:
            if not (isinstance(d, dict) and isinstance(d.get("premisses"), dict)
                    and all(isinstance(v, list) and all(isinstance(x, str) for x in v) for v in d["premisses"].values())):
                err.append(f"{n.get('id')} : démonstration mal formée (premisses : {{rôle: [ids]}})")
    err += ["sous-problème : objet avec id attendu" for x in c.get("sous_problemes", []) if not (isinstance(x, dict) and isinstance(x.get("id"), str))]
    err += ["lien : objet attendu" for x in c.get("liens", []) if not isinstance(x, dict)]
    return err


def valider(c: dict, niveau: str = "complet") -> tuple[list[str], list[str]]:
    """Règles du format canonique. `niveau="base"` : seulement ce que porte le schéma actuel (ids, prémisses,
    noms de démonstration). Renvoie (erreurs, avertissements) ; les messages sont faits pour qu'un agent se corrige."""
    if forme := _structure(c):
        return forme, []
    err: list[str] = []
    av: list[str] = []
    noeuds = c.get("noeuds", [])
    connus: set[str] = set()
    for n in noeuds:
        i = n.get("id")
        if not isinstance(i, str) or not MOTIF_ID.match(i):
            err.append(f"id invalide « {i} » : minuscules, chiffres et _, commençant par une lettre")
        elif i in connus:
            err.append(f"id en double : {i}")
        connus.add(i)
    sps = {s["id"] for s in c.get("sous_problemes", [])}

    def inconnu(ref: str, ou: str) -> str:
        proche = difflib.get_close_matches(ref, sorted(connus), n=1, cutoff=0.7)
        return f"{ou} : id inconnu « {ref} »" + (f" (voulais-tu « {proche[0]} » ?)" if proche else "")

    for n in noeuds:
        nid = n.get("id")
        if niveau == "complet":
            if n.get("type") not in TYPES:
                err.append(f"{nid} : type inconnu « {n.get('type')} » ({', '.join(TYPES)})")
            if n.get("sous_probleme") not in sps:
                err.append(f"{nid} : sous-problème inconnu « {n.get('sous_probleme')} »")
            if "origine" in n and n["origine"] not in ORIGINES:
                err.append(f"{nid} : origine inconnue « {n['origine']} »")
            if (n.get("type") == "decision") != ("decision" in n):
                err.append(f"{nid} : un nœud de type decision porte un champ decision, et lui seul")
            if (n.get("type") == "choix_modelisation") != ("choix" in n):
                err.append(f"{nid} : un nœud de type choix_modelisation porte un champ choix, et lui seul")
            if "decision" in n:
                alts = n["decision"].get("alternatives", [])
                if len(alts) < 2:
                    err.append(f"{nid} : une décision compare au moins deux alternatives")
                if not any(a.get("retenue") for a in alts):
                    err.append(f"{nid} : aucune alternative retenue")
                for a in alts:
                    if not a.get("retenue") and not a.get("raison"):
                        av.append(f"{nid} : alternative rejetée sans raison « {a.get('libelle')} »")
            if n.get("admis") and not str(n.get("source", "")).strip():
                err.append(f"{nid} : un nœud admis doit citer sa source")
        for p in n.get("utilise", []):
            if p == nid:
                err.append(f"{nid} : un nœud ne peut pas s'utiliser lui-même")
            elif p not in connus:
                err.append(inconnu(p, f"{nid} / utilise"))
        demos = n.get("demonstrations", [])
        if n.get("admis") and demos:
            av.append(f"{nid} : admis et démontré à la fois")
        noms: set[str] = set()
        for d in demos:
            if d.get("nom") in noms:
                err.append(f"{nid} : deux démonstrations nommées « {d.get('nom')} »")
            noms.add(d.get("nom"))
            vus: dict[str, str] = {}
            for role, liste in d.get("premisses", {}).items():
                if role not in ROLES:
                    err.append(f"{nid} / {d.get('nom')} : rôle inconnu « {role} » ({', '.join(ROLES)})")
                for p in liste:
                    if p == nid:
                        err.append(f"{nid} / {d.get('nom')} : un nœud ne peut pas être sa propre prémisse")
                    elif p not in connus:
                        err.append(inconnu(p, f"{nid} / {d.get('nom')}"))
                    if p in vus:
                        err.append(f"{nid} / {d.get('nom')} : {p} cité deux fois ({vus[p]}, {role})")
                    vus[p] = role
            if d.get("validite") not in VALIDITES:
                err.append(f"{nid} / {d.get('nom')} : validité inconnue « {d.get('validite')} »")
            conf = d.get("confiance")
            if conf is not None and not (isinstance(conf, (int, float)) and 0 <= conf <= 1):
                err.append(f"{nid} / {d.get('nom')} : confiance hors de [0, 1]")
            if d.get("validite") == "a_verifier" and conf is not None:
                av.append(f"{nid} / {d.get('nom')} : confiance sans verdict")
    for lien in c.get("liens", []):
        for cle in ("source", "cible"):
            if lien.get(cle) not in connus:
                err.append(inconnu(str(lien.get(cle)), f"lien {lien.get('genre')}"))
        if lien.get("genre") not in GENRES:
            err.append(f"lien : genre inconnu « {lien.get('genre')} » ({', '.join(GENRES)})")
    # Cycles : légitimes entre démonstrations alternatives (A ⇔ B), donc avertissement et non erreur ;
    # le statut calculé ne peut de toute façon pas s'auto-valider.
    aretes = {n["id"]: [p for p in n.get("utilise", []) + [q for d in n.get("demonstrations", []) for q in justifie_par(d)] if p in connus]
              for n in noeuds if "id" in n}
    couleur: dict[str, int] = {}
    for depart in aretes:
        if couleur.get(depart):
            continue
        pile = [(depart, iter(aretes[depart]))]
        chemin = [depart]
        couleur[depart] = 1
        while pile:
            u, it = pile[-1]
            v = next(it, None)
            if v is None:
                couleur[u] = 2
                pile.pop()
                chemin.pop()
            elif couleur.get(v) == 1:
                av.append("cycle de prémisses : " + " → ".join(chemin[chemin.index(v):] + [v]))
            elif not couleur.get(v):
                couleur[v] = 1
                pile.append((v, iter(aretes.get(v, []))))
                chemin.append(v)
    return err, av


# ══ Encodages ════════════════════════════════════════════════════════════════════════════════════════════════

PROJET = "5b0c6a4e-2f1d-4c1e-9a57-3f6f0d7e8a21"
CONVERSATION = "c7e1d2a0-8b3f-4e55-91a2-6d0f4b3c2e19"


def _date(k: int) -> str:
    t = datetime(2026, 9, 1, tzinfo=timezone.utc) + timedelta(days=0.6 * k, microseconds=(k * 370_111) % 1_000_000)
    return t.isoformat().replace("+00:00", "Z")


def vers_api(c: dict) -> str:
    """Réponse actuelle de GET /api/graphe (modèles pydantic Graphe/Noeud/Demonstration, JSON compact)."""
    statuts = calculer_statuts(c)
    enfants: dict[str, set[str]] = {n["id"]: set() for n in c["noeuds"]}
    for n in c["noeuds"]:
        for d in n.get("demonstrations", []):
            for p in justifie_par(d):
                enfants[p].add(n["id"])
    noeuds, aretes = [], []
    for k, n in enumerate(c["noeuds"]):
        demos = [{
            "projet_id": PROJET, "noeud_id": n["id"], "nom_demonstration": d["nom"], "justifie_par": justifie_par(d),
            "demonstration": d.get("texte", ""), "validite": d["validite"], "confiance": d.get("confiance"), "auteur": "ia",
            "cree_le": _date(k), "modifie_le": _date(k),
        } for d in n.get("demonstrations", [])]
        noeuds.append({
            "projet_id": PROJET, "id": n["id"], "nom": n["nom"], "enonce": n["enonce"], "admis": bool(n.get("admis")),
            "parents": sorted({p for d in n.get("demonstrations", []) for p in justifie_par(d)}), "enfants": sorted(enfants[n["id"]]),
            "conversation_id": CONVERSATION, "cree_le": _date(k), "modifie_le": _date(k), "statut": statuts[n["id"]], "demonstrations": demos,
        })
        aretes += [{"source": p, "cible": n["id"], "nom_demonstration": d["nom"], "validite": d["validite"]}
                   for d in n.get("demonstrations", []) for p in justifie_par(d)]
    return json.dumps({"noeuds": noeuds, "aretes": aretes}, ensure_ascii=False, separators=(",", ":"))


def depuis_api(texte: str) -> dict:
    """Relit la réponse de l'API en format canonique « base » ; vérifie la cohérence des trois copies des liens
    (justifie_par, parents/enfants, aretes) : l'API est redondante, une IA qui l'écrirait devrait les tenir à jour."""
    try:
        j = json.loads(texte)
    except json.JSONDecodeError as e:
        raise ErreurSyntaxe(str(e)) from e
    c: dict = {"noeuds": [], "liens": [], "_incoherences": []}
    depuis_demos = set()
    for n in j["noeuds"]:
        m = {"id": n["id"], "nom": n["nom"], "enonce": n["enonce"]}
        if n["admis"]:
            m["admis"] = True
        demos = []
        for d in n["demonstrations"]:
            e = {"nom": d["nom_demonstration"], "premisses": {"principale": d["justifie_par"]} if d["justifie_par"] else {}, "validite": d["validite"]}
            if d.get("confiance") is not None:
                e["confiance"] = d["confiance"]
            demos.append(e)
            depuis_demos |= {(p, n["id"], d["nom_demonstration"]) for p in d["justifie_par"]}
        if demos:
            m["demonstrations"] = demos
        parents = {p for d in n["demonstrations"] for p in d["justifie_par"]}
        if set(n["parents"]) != parents:
            c["_incoherences"].append(f"{n['id']} : parents ≠ prémisses des démonstrations")
        c["noeuds"].append(m)
    depuis_aretes = {(a["source"], a["cible"], a["nom_demonstration"]) for a in j["aretes"]}
    if depuis_aretes != depuis_demos:
        c["_incoherences"].append(f"aretes ≠ justifie_par : {sorted(depuis_aretes ^ depuis_demos)[:3]}")
    return c


def projection_base(c: dict) -> dict:
    """Ce que le schéma actuel peut porter."""
    res = {"noeuds": [], "liens": []}
    for n in c["noeuds"]:
        m = {"id": n["id"], "nom": n["nom"], "enonce": n["enonce"]}
        if n.get("admis"):
            m["admis"] = True
        demos = []
        for d in n.get("demonstrations", []):
            e = {"nom": d["nom"], "premisses": {"principale": justifie_par(d)} if justifie_par(d) else {}, "validite": d["validite"]}
            if d.get("confiance") is not None:
                e["confiance"] = d["confiance"]
            demos.append(e)
        if demos:
            m["demonstrations"] = demos
        res["noeuds"].append(m)
    return res


def vers_mcp(c: dict) -> str:
    """Sortie actuelle de l'outil MCP lire_graphe (vue compacte, sans démonstrations)."""
    statuts = calculer_statuts(c)
    api = json.loads(vers_api(c))
    return json.dumps([{"id": n["id"], "nom": n["nom"], "enonce": n["enonce"][:300], "statut": statuts[n["id"]], "admis": n["admis"],
                        "parents": n["parents"], "enfants": n["enfants"]} for n in api["noeuds"]], ensure_ascii=False)


# ── JSON canonique lisible : indentation, mais listes d'ids et petits objets sur une ligne ──


def json_lisible(o, ind: int = 0, largeur: int = 110) -> str:
    plat = json.dumps(o, ensure_ascii=False, separators=(", ", ": "))
    if not isinstance(o, (dict, list)) or len(plat) + ind <= largeur and not (isinstance(o, dict) and any(isinstance(v, (dict, list)) and v for v in o.values()) and len(plat) > 60):
        return plat
    sp, sp2 = " " * ind, " " * (ind + 2)
    if isinstance(o, list):
        if all(not isinstance(x, (dict, list)) for x in o):
            return plat
        return "[\n" + ",\n".join(sp2 + json_lisible(x, ind + 2, largeur) for x in o) + "\n" + sp + "]"
    return "{\n" + ",\n".join(f"{sp2}{json.dumps(k, ensure_ascii=False)}: {json_lisible(v, ind + 2, largeur)}" for k, v in o.items()) + "\n" + sp + "}"


def depuis_json(texte: str) -> dict:
    try:
        return json.loads(texte)
    except json.JSONDecodeError as e:
        raise ErreurSyntaxe(str(e)) from e


# ── JSON Lines : un enregistrement par ligne (en-tête, sous-problèmes, nœuds avec leurs démonstrations, liens) ──


def vers_jsonl(c: dict) -> str:
    d = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))  # noqa: E731
    lignes = [d({"t": "graphe", "format": c["format"], "titre": c["titre"], "resume": c["resume"]})]
    lignes += [d({"t": "sous_probleme", **s}) for s in c["sous_problemes"]]
    lignes += [d({"t": "noeud", **n}) for n in c["noeuds"]]
    lignes += [d({"t": "lien", **lien}) for lien in c["liens"]]
    return "\n".join(lignes) + "\n"


def depuis_jsonl(texte: str) -> dict:
    """Tolérant : une ligne illisible est signalée et ignorée, les autres sont gardées."""
    c: dict = {"sous_problemes": [], "noeuds": [], "liens": [], "_lignes_rejetees": []}
    for k, ligne in enumerate(texte.splitlines(), 1):
        if not ligne.strip():
            continue
        try:
            o = json.loads(ligne)
        except json.JSONDecodeError:
            c["_lignes_rejetees"].append(k)
            continue
        t = o.pop("t", None)
        if t == "graphe":
            c.update(o)
        elif t in ("sous_probleme", "noeud", "lien"):
            c[{"sous_probleme": "sous_problemes", "noeud": "noeuds", "lien": "liens"}[t]].append(o)
        else:
            c["_lignes_rejetees"].append(k)
    return c


# ── YAML (émetteur minimal : scalaires nus quand c'est sûr, sinon entre guillemets JSON, valides en YAML) ──

_MOTS_YAML = {"yes", "no", "true", "false", "null", "on", "off", "y", "n", "~", ""}


def _yaml_sc(v, flux: bool = False) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return repr(v)
    s = str(v)
    interdit = ",[]{}" if flux else ""
    sur = (s == s.strip() and s.lower() not in _MOTS_YAML and s[0] not in "-?:,[]{}#&*!|>'\"%@`" and ": " not in s and " #" not in s
           and not s.endswith(":") and "\n" not in s and not re.match(r"^[-+.]?\d", s) and not any(ch in s for ch in interdit))
    return s if sur else json.dumps(s, ensure_ascii=False)


def vers_yaml(o, ind: int = 0) -> str:
    sp = " " * ind
    lignes = []
    for k, v in o.items():
        if isinstance(v, dict):
            lignes.append(f"{sp}{k}:" + (" {}" if not v else "\n" + vers_yaml(v, ind + 2)))
        elif isinstance(v, list) and all(not isinstance(x, (dict, list)) for x in v):
            if v and any(isinstance(x, str) and " " in x for x in v):
                lignes.append(f"{sp}{k}:\n" + "\n".join(f"{sp}  - {_yaml_sc(x)}" for x in v))
            else:
                lignes.append(f"{sp}{k}: [{', '.join(_yaml_sc(x, True) for x in v)}]")
        elif isinstance(v, list):
            lignes.append(f"{sp}{k}:")
            for x in v:
                bloc = vers_yaml(x, ind + 4).split("\n")
                lignes.append(f"{sp}  - " + bloc[0][ind + 4:])
                lignes += bloc[1:]
        else:
            lignes.append(f"{sp}{k}: {_yaml_sc(v)}")
    return "\n".join(lignes)


def depuis_yaml(texte: str) -> dict:
    import yaml  # facultatif : PyYAML si déjà installé

    try:
        o = yaml.safe_load(texte)
    except yaml.YAMLError as e:
        raise ErreurSyntaxe(str(e).splitlines()[0]) from e
    if not isinstance(o, dict):
        raise ErreurSyntaxe("document YAML sans objet racine")
    return o


# ── Blueprint LaTeX, dans l'esprit de leanblueprint (\label, \uses), étendu aux rôles et aux métadonnées ──

_MACROS_ROLE = {"principale": "uses", "auxiliaire": "usesaux", "technique": "usestech", "contexte": "usesctx"}


def _tex(s: str) -> str:
    """Échappe % # & _ hors des segments $…$."""
    morceaux = s.split("$")
    return "$".join(re.sub(r"([%#&_])", r"\\\1", m) if i % 2 == 0 else m for i, m in enumerate(morceaux))


def _detex(s: str) -> str:
    morceaux = s.split("$")
    return "$".join(re.sub(r"\\([%#&_])", r"\1", m) if i % 2 == 0 else m for i, m in enumerate(morceaux))


def vers_blueprint(c: dict) -> str:
    L = [f"% {c['format']}", f"\\title{{{_tex(c['titre'])}}}", f"\\resume{{{_tex(c['resume'])}}}", ""]
    for s in c["sous_problemes"]:
        L.append(f"\\sousprobleme{'*' if s.get('abandonne') else ''}{{{s['id']}}}{{{_tex(s['nom'])}}}{{{_tex(s['resume'])}}}")
    for n in c["noeuds"]:
        uses = f"\\uses{{{','.join(n['utilise'])}}}" if n.get("utilise") else ""
        meta = f"\\label{{{n['id']}}}{uses}\\sp{{{n['sous_probleme']}}}\\origine{{{n['origine']}}}"
        if n.get("admis"):
            meta += f"\\admis{{{_tex(n['source'])}}}"
        if n.get("abandonne"):
            meta += "\\abandonne"
        L += ["", f"\\begin{{{n['type']}}}[{_tex(n['nom'])}]{meta}", _tex(n["enonce"])]
        if "choix" in n:
            ch = n["choix"]
            L.append(f"\\hypothese{{{_tex(ch['hypothese'])}}}\\portee{{{_tex(ch['portee'])}}}")
            L += [f"\\autre{{{_tex(a)}}}" for a in ch.get("alternatives", [])]
        if "decision" in n:
            de = n["decision"]
            L.append(f"\\question{{{_tex(de['question'])}}}")
            L += [f"\\alternative{'*' if a['retenue'] else ''}{{{_tex(a['libelle'])}}}{{{_tex(a.get('raison', ''))}}}" for a in de["alternatives"]]
            L.append(f"\\raison{{{_tex(de['raison'])}}}")
        L += [f"\\lien{{{li['genre']}}}{{{li['cible']}}}{{{_tex(li.get('note', ''))}}}" for li in c["liens"] if li["source"] == n["id"]]
        L.append(f"\\end{{{n['type']}}}")
        for d in n.get("demonstrations", []):
            uses = "".join(f"\\{_MACROS_ROLE[r]}{{{','.join(ids)}}}" for r, ids in d["premisses"].items())
            verdict = f"\\validite{{{d['validite']}}}{{{d.get('confiance', '')}}}{{{','.join(d.get('verifie_par', []))}}}"
            L += [f"\\begin{{proof}}[{_tex(d['nom'])}]{uses}{verdict}\\auteur{{{d['auteur']}}}"]
            if d.get("texte"):
                L.append(_tex(d["texte"]))
            L.append("\\end{proof}")
    return "\n".join(L) + "\n"


def _macros(ligne: str) -> list[tuple[str, bool, str | None, list[str]]]:
    """Découpe une ligne en macros : (nom, étoile, [optionnel], {arguments}), accolades imbriquées comprises."""
    res, i = [], 0
    while i < len(ligne):
        m = re.match(r"\\([A-Za-z_]+)(\*?)", ligne[i:])
        if not m:
            raise ErreurSyntaxe(f"texte inattendu : {ligne[i:i + 40]!r}")
        i += m.end()
        opt = None
        if i < len(ligne) and ligne[i] == "[":
            fin = ligne.index("]", i)  # le nom ne contient pas de ]
            opt, i = ligne[i + 1:fin], fin + 1
        args = []
        while i < len(ligne) and ligne[i] == "{":
            prof, j = 0, i
            while True:
                if j >= len(ligne):
                    raise ErreurSyntaxe(f"accolade non fermée : {ligne[:60]!r}")
                if ligne[j] == "{" and ligne[j - 1] != "\\":
                    prof += 1
                elif ligne[j] == "}" and ligne[j - 1] != "\\":
                    prof -= 1
                    if prof == 0:
                        break
                j += 1
            args.append(ligne[i + 1:j])
            i = j + 1
        res.append((m.group(1), bool(m.group(2)), opt, args))
    return res


def depuis_blueprint(texte: str) -> dict:
    c: dict = {"format": FORMAT, "sous_problemes": [], "noeuds": [], "liens": []}
    courant: dict | None = None
    demo: dict | None = None
    env: str | None = None
    for ligne in texte.splitlines():
        if not ligne.strip() or ligne.startswith("%"):
            continue
        if ligne.startswith("\\end{"):
            nom = ligne[5:-1]
            if nom != env:
                raise ErreurSyntaxe(f"\\end{{{nom}}} ferme \\begin{{{env}}}")
            if env == "proof":
                courant.setdefault("demonstrations", []).append(demo)
            env = None
            continue
        if ligne.startswith("\\begin{"):
            if env:
                raise ErreurSyntaxe(f"\\begin dans l'environnement {env} non fermé")
            m = re.match(r"\\begin\{([a-z_]+)\}\[(.*?)\](.*)$", ligne)
            if not m:
                raise ErreurSyntaxe(f"\\begin mal formé : {ligne[:60]!r}")
            env = m.group(1)
            macros = {nom: args for nom, _, _, args in _macros(m.group(3))} if m.group(3) else {}
            if env == "proof":
                if courant is None:
                    raise ErreurSyntaxe("démonstration sans énoncé")
                v = macros.get("validite", ["a_verifier", "", ""])
                demo = {"nom": _detex(m.group(2)), "premisses": {r: macros[mac][0].split(",") for r, mac in _MACROS_ROLE.items() if mac in macros},
                        "validite": v[0]}
                if v[1]:
                    demo["confiance"] = float(v[1])
                if v[2]:
                    demo["verifie_par"] = v[2].split(",")
                demo["auteur"] = macros.get("auteur", [""])[0]
            else:
                courant = {"id": macros["label"][0], "type": env, "nom": _detex(m.group(2)), "enonce": "",
                           "sous_probleme": macros["sp"][0], "origine": macros["origine"][0]}
                if "uses" in macros:
                    courant["utilise"] = macros["uses"][0].split(",")
                if "admis" in macros:
                    courant["admis"] = True
                    courant["source"] = _detex(macros["admis"][0])
                if "abandonne" in macros:
                    courant["abandonne"] = True
                c["noeuds"].append(courant)
            continue
        if env is None:
            for nom, etoile, _, args in _macros(ligne):
                if nom == "title":
                    c["titre"] = _detex(args[0])
                elif nom == "resume":
                    c["resume"] = _detex(args[0])
                elif nom == "sousprobleme":
                    c["sous_problemes"].append({"id": args[0], "nom": _detex(args[1]), "resume": _detex(args[2]), **({"abandonne": True} if etoile else {})})
            continue
        if env == "proof":
            demo["texte"] = (demo.get("texte", "") + "\n" + _detex(ligne)).strip()
            continue
        if ligne.startswith("\\") and re.match(r"\\(hypothese|autre|question|alternative|raison|lien)\b", ligne):
            for nom, etoile, _, args in _macros(ligne):
                if nom == "hypothese":
                    courant["choix"] = {"hypothese": _detex(args[0])}
                elif nom == "portee":
                    courant["choix"]["portee"] = _detex(args[0])
                elif nom == "autre":
                    courant["choix"].setdefault("alternatives", []).append(_detex(args[0]))
                elif nom == "question":
                    courant["decision"] = {"question": _detex(args[0]), "alternatives": []}
                elif nom == "alternative":
                    courant["decision"]["alternatives"].append({"libelle": _detex(args[0]), "retenue": etoile, **({"raison": _detex(args[1])} if args[1] else {})})
                elif nom == "raison":
                    courant["decision"]["raison"] = _detex(args[0])
                elif nom == "lien":
                    c["liens"].append({"source": courant["id"], "genre": args[0], "cible": args[1], **({"note": _detex(args[2])} if args[2] else {})})
            continue
        courant["enonce"] = (courant["enonce"] + "\n" + _detex(ligne)).strip()
    if env:
        raise ErreurSyntaxe(f"environnement {env} non fermé en fin de fichier")
    return c


# ── Markdown à identifiants : une section par énoncé, prémisses listées par rôle ──

_VALIDITE_TXT = {"a_verifier": "à vérifier", "valide": "valide", "invalide": "invalide"}


def vers_markdown(c: dict, frontiere: list[tuple[str, str]] | None = None, statuts: dict[str, str] | None = None) -> str:
    L = [f"# {c['titre']}", "", f"> {c['resume']}", "", "## Sous-problèmes", ""]
    L += [f"- `{s['id']}`{' (abandonné)' if s.get('abandonne') else ''} — {s['nom']} : {s['resume']}" for s in c["sous_problemes"]]
    L += ["", "## Énoncés"]
    for n in c["noeuds"]:
        meta = [n["type"], n["sous_probleme"], n["origine"]] + (["admis"] if n.get("admis") else []) + (["abandonné"] if n.get("abandonne") else [])
        if statuts:
            meta.append(f"statut {statuts[n['id']]}")
        L += ["", f"### `{n['id']}` — {n['nom']}", "", f"*{' · '.join(meta)}*", ""]
        if n.get("admis"):
            L += [f"Source : {n['source']}", ""]
        if n.get("utilise"):
            L += ["Utilise : " + ", ".join(f"`{i}`" for i in n["utilise"]), ""]
        L.append(n["enonce"])
        if "choix" in n:
            L += ["", f"**Hypothèse de travail** : {n['choix']['hypothese']}", f"**Portée** : {n['choix']['portee']}"]
            if n["choix"].get("alternatives"):
                L += ["**Alternatives** :"] + [f"- {a}" for a in n["choix"]["alternatives"]]
        if "decision" in n:
            de = n["decision"]
            L += ["", f"**Question** : {de['question']}"]
            L += [f"- [{'x' if a['retenue'] else ' '}] {a['libelle']}" + (f" — {a['raison']}" if a.get("raison") else "") for a in de["alternatives"]]
            L.append(f"**Raison** : {de['raison']}")
        for d in n.get("demonstrations", []):
            verdict = _VALIDITE_TXT[d["validite"]]
            if "confiance" in d:
                verdict += f", confiance {d['confiance']}"
            if d.get("verifie_par"):
                verdict += f", vérifiée par {'+'.join(d['verifie_par'])}"
            L += ["", f"**Démonstration « {d['nom']} »** — {verdict}, par {d['auteur']}"]
            L += [f"- {r} : " + ", ".join(f"`{i}`" for i in ids) for r, ids in d["premisses"].items()]
            if d.get("texte"):
                L += ["", d["texte"]]
        liens = [li for li in c["liens"] if li["source"] == n["id"]]
        if liens:
            L += ["", "**Liens** :"] + [f"- {li['genre']} `{li['cible']}`" + (f" — {li['note']}" if li.get("note") else "") for li in liens]
    if frontiere:
        L += ["", "## Frontière (cités, non détaillés)", ""] + [f"- `{i}` — {nom}" for i, nom in frontiere]
    return "\n".join(L) + "\n"


def depuis_markdown(texte: str) -> dict:
    c: dict = {"format": FORMAT, "sous_problemes": [], "noeuds": [], "liens": []}
    lignes = texte.splitlines()
    n: dict | None = None
    bloc = None  # sous_problemes | enonce | choix_alt | decision | demo | liens | texte_demo
    demo: dict | None = None
    retour = {v: k for k, v in _VALIDITE_TXT.items()}
    for k, ligne in enumerate(lignes):
        if k == 0:
            if not ligne.startswith("# "):
                raise ErreurSyntaxe("titre manquant")
            c["titre"] = ligne[2:]
            continue
        if ligne.startswith("> ") and n is None:
            c["resume"] = ligne[2:]
            continue
        if ligne == "## Sous-problèmes":
            bloc = "sous_problemes"
            continue
        if ligne.startswith("## "):
            bloc = None
            continue
        m = re.match(r"^### `([^`]+)` — (.*)$", ligne)
        if m:
            n = {"id": m.group(1), "nom": m.group(2), "enonce": ""}
            c["noeuds"].append(n)
            bloc = "meta"
            continue
        if not ligne.strip():
            continue
        if bloc == "sous_problemes":
            m = re.match(r"^- `([^`]+)`( \(abandonné\))? — (.*?) : (.*)$", ligne)
            if not m:
                raise ErreurSyntaxe(f"sous-problème illisible : {ligne[:60]!r}")
            c["sous_problemes"].append({"id": m.group(1), "nom": m.group(3), "resume": m.group(4), **({"abandonne": True} if m.group(2) else {})})
            continue
        if n is None:
            raise ErreurSyntaxe(f"ligne hors section : {ligne[:60]!r}")
        if bloc == "meta":
            m = re.match(r"^\*(.*)\*$", ligne)
            if not m:
                raise ErreurSyntaxe(f"{n['id']} : ligne de métadonnées attendue")
            parts = m.group(1).split(" · ")
            n.update({"type": parts[0], "sous_probleme": parts[1], "origine": parts[2]})
            if "admis" in parts[3:]:
                n["admis"] = True
            if "abandonné" in parts[3:]:
                n["abandonne"] = True
            bloc = "enonce"
            continue
        if ligne.startswith("Source : ") and n.get("admis") and bloc == "enonce" and not n["enonce"]:
            n["source"] = ligne[9:]
            continue
        if ligne.startswith("Utilise : ") and bloc == "enonce" and not n["enonce"]:
            n["utilise"] = re.findall(r"`([^`]+)`", ligne)
            continue
        if ligne.startswith("**Hypothèse de travail** : "):
            n["choix"] = {"hypothese": ligne[27:]}
            continue
        if ligne.startswith("**Portée** : "):
            n["choix"]["portee"] = ligne[13:]
            continue
        if ligne == "**Alternatives** :":
            n["choix"]["alternatives"] = []
            bloc = "choix_alt"
            continue
        if ligne.startswith("**Question** : "):
            n["decision"] = {"question": ligne[15:], "alternatives": []}
            bloc = "decision"
            continue
        if ligne.startswith("**Raison** : "):
            n["decision"]["raison"] = ligne[13:]
            continue
        m = re.match(r"^\*\*Démonstration « (.*) »\*\* — (à vérifier|valide|invalide)(?:, confiance ([\d.]+))?(?:, vérifiée par ([a-z+]+))?, par (\S+)$", ligne)
        if m:
            demo = {"nom": m.group(1), "premisses": {}, "validite": retour[m.group(2)]}
            if m.group(3):
                demo["confiance"] = float(m.group(3))
            if m.group(4):
                demo["verifie_par"] = m.group(4).split("+")
            demo["auteur"] = m.group(5)
            n.setdefault("demonstrations", []).append(demo)
            bloc = "demo"
            continue
        if ligne == "**Liens** :":
            bloc = "liens"
            continue
        if ligne.startswith("- ") and bloc in ("choix_alt", "decision", "demo", "liens"):
            corps = ligne[2:]
            if bloc == "choix_alt":
                n["choix"]["alternatives"].append(corps)
            elif bloc == "decision":
                m = re.match(r"^\[([x ])\] (.*?)(?: — (.*))?$", corps)
                if not m:
                    raise ErreurSyntaxe(f"{n['id']} : alternative illisible")
                n["decision"]["alternatives"].append({"libelle": m.group(2), "retenue": m.group(1) == "x", **({"raison": m.group(3)} if m.group(3) else {})})
            elif bloc == "demo":
                m = re.match(r"^([a-z]+) : (.*)$", corps)
                if not m:
                    raise ErreurSyntaxe(f"{n['id']} : liste de prémisses illisible")
                demo["premisses"][m.group(1)] = re.findall(r"`([^`]+)`", m.group(2))
            else:
                m = re.match(r"^([a-z]+) `([^`]+)`(?: — (.*))?$", corps)
                if not m:
                    raise ErreurSyntaxe(f"{n['id']} : lien illisible")
                c["liens"].append({"source": n["id"], "genre": m.group(1), "cible": m.group(2), **({"note": m.group(3)} if m.group(3) else {})})
            continue
        if bloc == "demo":
            demo["texte"] = (demo.get("texte", "") + "\n" + ligne).strip()
            continue
        n["enonce"] = (n["enonce"] + "\n" + ligne).strip()
    return c


# ── Texte compact : le mini-langage de donnees.ts (« a +b #c ~d »), étendu à tout le nœud ──
#   id type[*admis][!abandonné] @sous_probleme ^origine
#     # nom            (ligne suivante : énoncé)     src: source
#     = a +b #c ~d «nom de la démonstration» validite [confiance] [ia+humain] @auteur
#     ? question   [x] retenue — raison   [ ] rejetée — raison   ! raison de la décision
#     hyp: …   portée: …   alt: …   lien: genre cible — note

_PREFIXES = {"principale": "", "auxiliaire": "+", "technique": "#", "contexte": "~"}


def vers_compact(c: dict) -> str:
    L = [f"@{c['format']} {c['titre']}", f"@resume {c['resume']}"]
    L += [f"@sp{'!' if s.get('abandonne') else ''} {s['id']} {s['nom']} :: {s['resume']}" for s in c["sous_problemes"]]
    for n in c["noeuds"]:
        L.append(f"{n['id']} {n['type']}{'*' if n.get('admis') else ''}{'!' if n.get('abandonne') else ''} @{n['sous_probleme']} ^{n['origine']}")
        L.append(f"  # {n['nom']}")
        if n.get("utilise"):
            L.append("  utilise: " + " ".join(n["utilise"]))
        L.append(f"  {n['enonce']}")
        if n.get("admis"):
            L.append(f"  src: {n['source']}")
        if "choix" in n:
            L += [f"  hyp: {n['choix']['hypothese']}", f"  portée: {n['choix']['portee']}"] + [f"  alt: {a}" for a in n["choix"].get("alternatives", [])]
        if "decision" in n:
            de = n["decision"]
            L.append(f"  ? {de['question']}")
            L += [f"  [{'x' if a['retenue'] else ' '}] {a['libelle']}" + (f" — {a['raison']}" if a.get("raison") else "") for a in de["alternatives"]]
            L.append(f"  ! {de['raison']}")
        for d in n.get("demonstrations", []):
            prem = " ".join(_PREFIXES[r] + i for r, ids in d["premisses"].items() for i in ids)
            extra = "".join(f" {x}" for x in (d.get("confiance"), "+".join(d.get("verifie_par", [])) or None) if x is not None)
            L.append(f"  = {prem} «{d['nom']}» {d['validite']}{extra} @{d['auteur']}")
        L += [f"  lien: {li['genre']} {li['cible']}" + (f" — {li['note']}" if li.get("note") else "") for li in c["liens"] if li["source"] == n["id"]]
    return "\n".join(L) + "\n"


def depuis_compact(texte: str) -> dict:
    c: dict = {"sous_problemes": [], "noeuds": [], "liens": []}
    roles = {"+": "auxiliaire", "#": "technique", "~": "contexte"}
    n: dict | None = None
    for ligne in texte.splitlines():
        if not ligne.strip():
            continue
        if ligne.startswith("@resume "):
            c["resume"] = ligne[8:]
        elif ligne.startswith("@sp"):
            m = re.match(r"^@sp(!?) (\S+) (.*?) :: (.*)$", ligne)
            if not m:
                raise ErreurSyntaxe(f"sous-problème illisible : {ligne[:60]!r}")
            c["sous_problemes"].append({"id": m.group(2), "nom": m.group(3), "resume": m.group(4), **({"abandonne": True} if m.group(1) else {})})
        elif ligne.startswith("@"):
            fmt, _, titre = ligne[1:].partition(" ")
            c.update({"format": fmt, "titre": titre})
        elif not ligne.startswith("  "):
            m = re.match(r"^(\S+) ([a-z_]+)(\*?)(!?) @(\S+) \^(\S+)$", ligne)
            if not m:
                raise ErreurSyntaxe(f"en-tête de nœud illisible : {ligne[:60]!r}")
            n = {"id": m.group(1), "type": m.group(2), "nom": None, "enonce": "", "sous_probleme": m.group(5), "origine": m.group(6)}
            if m.group(3):
                n["admis"] = True
            if m.group(4):
                n["abandonne"] = True
            c["noeuds"].append(n)
        else:
            if n is None:
                raise ErreurSyntaxe("ligne indentée avant tout nœud")
            s = ligne[2:]
            if s.startswith("# ") and n["nom"] is None:
                n["nom"] = s[2:]
            elif s.startswith("= "):
                m = re.match(r"^= (.*?) ?«(.*?)» (\S+)(?: ([\d.]+))?(?: ([a-z+]+))? @(\S+)$", s)
                if not m:
                    raise ErreurSyntaxe(f"{n['id']} : démonstration illisible")
                prem: dict[str, list[str]] = {}
                for t in m.group(1).split():
                    r = roles.get(t[0], "principale")
                    prem.setdefault(r, []).append(t[1:] if t[0] in roles else t)
                d = {"nom": m.group(2), "premisses": {r: prem[r] for r in ROLES if r in prem}, "validite": m.group(3)}
                if m.group(4):
                    d["confiance"] = float(m.group(4))
                if m.group(5):
                    d["verifie_par"] = m.group(5).split("+")
                d["auteur"] = m.group(6)
                n.setdefault("demonstrations", []).append(d)
            elif s.startswith("utilise: "):
                n["utilise"] = s[9:].split()
            elif s.startswith("src: "):
                n["source"] = s[5:]
            elif s.startswith("hyp: "):
                n["choix"] = {"hypothese": s[5:]}
            elif s.startswith("portée: "):
                n["choix"]["portee"] = s[8:]
            elif s.startswith("alt: "):
                n["choix"].setdefault("alternatives", []).append(s[5:])
            elif s.startswith("? "):
                n["decision"] = {"question": s[2:], "alternatives": []}
            elif re.match(r"^\[[x ]\] ", s):
                m = re.match(r"^\[([x ])\] (.*?)(?: — (.*))?$", s)
                n["decision"]["alternatives"].append({"libelle": m.group(2), "retenue": m.group(1) == "x", **({"raison": m.group(3)} if m.group(3) else {})})
            elif s.startswith("! "):
                n["decision"]["raison"] = s[2:]
            elif s.startswith("lien: "):
                m = re.match(r"^lien: (\S+) (\S+)(?: — (.*))?$", s)
                c["liens"].append({"source": n["id"], "genre": m.group(1), "cible": m.group(2), **({"note": m.group(3)} if m.group(3) else {})})
            else:
                n["enonce"] = (n["enonce"] + "\n" + s).strip()
    for n in c["noeuds"]:
        if n["nom"] is None:
            n["nom"] = ""
    return c


# ── Index : une ligne par nœud (id, type, sous-problème, statut calculé, nom, prémisses par rôle) ──


def vers_index(c: dict) -> str:
    statuts = calculer_statuts(c)
    L = [f"# {c['titre']} — {len(c['noeuds'])} nœuds. Prémisses : a principale, +a auxiliaire, #a technique, ~a contexte ; | sépare deux démonstrations."]
    for n in c["noeuds"]:
        demos = " | ".join(" ".join(_PREFIXES[r] + i for r, ids in d["premisses"].items() for i in ids) for d in n.get("demonstrations", []))
        extra = (" (utilise " + " ".join(n["utilise"]) + ")" if n.get("utilise") else "") + (" [abandonné]" if n.get("abandonne") else "")
        L.append(f"{n['id']} · {n['type']} · {n['sous_probleme']} · {statuts[n['id']]}{' · admis' if n.get('admis') else ''} — {n['nom']}{extra}" + (f" ⟵ {demos}" if demos else ""))
    return "\n".join(L) + "\n"


# ── JSON-LD et Turtle (RDF) ──

CONTEXTE_LD = {
    "@vocab": "https://atlas.example/vocab#", "@base": "https://atlas.example/graphe/fontaine/",
    "id": "@id", "noeuds": {"@container": "@set"}, "sous_probleme": {"@type": "@id"}, "cible": {"@type": "@id"}, "source": {"@type": "@id"},
    **{r: {"@type": "@id", "@container": "@list"} for r in ROLES},
}


def vers_jsonld(c: dict) -> str:
    return json_lisible({"@context": CONTEXTE_LD, **c}) + "\n"


def depuis_jsonld(texte: str) -> dict:
    o = depuis_json(texte)
    o.pop("@context", None)
    return o


def _ttl(s: str) -> str:
    return json.dumps(s, ensure_ascii=False) + "@fr"


def vers_turtle(c: dict) -> str:
    L = ["@prefix at: <https://atlas.example/vocab#> .", "@prefix : <https://atlas.example/graphe/fontaine/> .",
         "@prefix prov: <http://www.w3.org/ns/prov#> .", "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .", "",
         f":graphe a at:Graphe ; at:titre {_ttl(c['titre'])} ; at:resume {_ttl(c['resume'])} ."]
    for s in c["sous_problemes"]:
        L.append(f":sp_{s['id']} a at:SousProbleme ; at:nom {_ttl(s['nom'])} ; at:resume {_ttl(s['resume'])}" + (" ; at:abandonne true" if s.get("abandonne") else "") + " .")
    for n in c["noeuds"]:
        p = [f":{n['id']} a at:{n['type']}", f"at:nom {_ttl(n['nom'])}", f"at:enonce {_ttl(n['enonce'])}", f"at:sousProbleme :sp_{n['sous_probleme']}", f"at:origine at:{n['origine']}"]
        if n.get("utilise"):
            p.append("at:utilise " + ", ".join(f":{i}" for i in n["utilise"]))
        if n.get("admis"):
            p.append(f"at:admis true ; at:source {_ttl(n['source'])}")
        if n.get("abandonne"):
            p.append("at:abandonne true")
        if "choix" in n:
            ch = n["choix"]
            p.append(f"at:choix [ at:hypothese {_ttl(ch['hypothese'])} ; at:portee {_ttl(ch['portee'])}" + "".join(f" ; at:alternative {_ttl(a)}" for a in ch.get("alternatives", [])) + " ]")
        if "decision" in n:
            de = n["decision"]
            alts = " , ".join(f"[ at:libelle {_ttl(a['libelle'])} ; at:retenue {'true' if a['retenue'] else 'false'}" + (f" ; at:raison {_ttl(a['raison'])}" if a.get("raison") else "") + " ]" for a in de["alternatives"])
            p.append(f"at:decision [ at:question {_ttl(de['question'])} ; at:alternative {alts} ; at:raison {_ttl(de['raison'])} ]")
        for d in n.get("demonstrations", []):
            q = [f"at:nom {_ttl(d['nom'])}"] + [f"at:{r} " + ", ".join(f":{i}" for i in ids) for r, ids in d["premisses"].items()]
            q.append(f"at:validite at:{d['validite']}")
            if "confiance" in d:
                q.append(f'at:confiance "{d["confiance"]}"^^xsd:decimal')
            q += [f"at:verifiePar at:{v}" for v in d.get("verifie_par", [])]
            q.append(f"prov:wasAttributedTo :{d['auteur']}")
            p.append("at:demonstration [ " + " ; ".join(q) + " ]")
        L.append(" ;\n  ".join(p) + " .")
    for li in c["liens"]:
        L.append(f":{li['source']} at:{li['genre']} :{li['cible']} ." + (f"  # {li['note']}" if li.get("note") else ""))
    return "\n".join(L) + "\n"


# ══ Catalogue des encodages ══════════════════════════════════════════════════════════════════════════════════
# (fichier, libellé, rendu, relecture, niveau d'information porté)

def _proto_rendu(c: dict) -> str:
    return (DOSSIER / "03-prototype.json").read_text(encoding="utf-8")


def _proto_relu(t: str) -> dict:
    try:
        return depuis_prototype(json.loads(t))
    except json.JSONDecodeError as e:
        raise ErreurSyntaxe(str(e)) from e


ENCODAGES = [
    ("01-api-graphe.json", "JSON actuel GET /api/graphe", vers_api, depuis_api, "base"),
    ("02-mcp-lire-graphe.json", "JSON actuel outil MCP lire_graphe", vers_mcp, None, "vue"),
    ("03-prototype.json", "JSON enrichi des prototypes (indent 2)", _proto_rendu, _proto_relu, "complet"),
    ("04-canonique.json", "JSON canonique proposé (lisible)", lambda c: json_lisible(c) + "\n", depuis_json, "complet"),
    ("04b-canonique-indent2.json", "JSON canonique, json.dumps indent=2", lambda c: json.dumps(c, ensure_ascii=False, indent=2) + "\n", depuis_json, "complet"),
    ("04c-canonique.min.json", "JSON canonique minifié", lambda c: json.dumps(c, ensure_ascii=False, separators=(",", ":")), depuis_json, "complet"),
    ("05-canonique.jsonl", "JSON Lines (un enregistrement par ligne)", vers_jsonl, depuis_jsonl, "complet"),
    ("06-canonique.yaml", "YAML", lambda c: vers_yaml(c) + "\n", depuis_yaml, "complet"),
    ("07-blueprint.tex", "Blueprint LaTeX (\\label, \\uses étendu)", vers_blueprint, depuis_blueprint, "complet"),
    ("08-markdown.md", "Markdown à identifiants", vers_markdown, depuis_markdown, "complet"),
    ("09-compact.txt", "Texte compact (mini-langage a +b #c ~d)", vers_compact, depuis_compact, "complet"),
    ("10-jsonld.json", "JSON-LD (canonique + @context)", vers_jsonld, depuis_jsonld, "complet"),
    ("11-turtle.ttl", "Turtle RDF (+ PROV)", vers_turtle, None, "complet"),
    ("12-index.txt", "Vue index (1 ligne par nœud, proposée pour lire_index)", vers_index, None, "vue"),
]


def charger_canonique() -> dict:
    return depuis_prototype(json.loads((DOSSIER / "03-prototype.json").read_text(encoding="utf-8")))


def generer() -> dict:
    c = charger_canonique()
    for fichier, _, rendu, _, _ in ENCODAGES:
        if fichier != "03-prototype.json":
            (DOSSIER / fichier).write_text(rendu(c), encoding="utf-8", newline="\n")
    return c


# ══ Mesures ══════════════════════════════════════════════════════════════════════════════════════════════════


def compteur_jetons():
    """Tokenizer BPE réel s'il est déjà installé (ATLAS_TOKENIZER=chemin/tokenizer.json, sinon le premier du
    cache Hugging Face), sinon caractères / 4."""
    try:
        from tokenizers import Tokenizer

        chemin = os.environ.get("ATLAS_TOKENIZER") or next(iter(sorted(Path.home().glob(".cache/huggingface/hub/models--*/snapshots/*/tokenizer.json"))), None)
        if chemin:
            tok = Tokenizer.from_file(str(chemin))
            nom = re.search(r"models--([^/\\]+)", str(chemin))
            return (lambda s: len(tok.encode(s, add_special_tokens=False).ids)), f"BPE {nom.group(1) if nom else chemin}"
    except ImportError:
        pass
    return (lambda s: round(len(s) / 4)), "caractères / 4"


def _textes(o) -> list[str]:
    """Charge utile : toutes les chaînes « de contenu » (hors ids, énumérations, métadonnées)."""
    cles = {"titre", "resume", "nom", "enonce", "source", "hypothese", "portee", "question", "libelle", "raison", "note", "texte"}
    res: list[str] = []
    if isinstance(o, dict):
        for k, v in o.items():
            if k in cles and isinstance(v, str):
                res.append(v)
            elif k == "alternatives" and isinstance(v, list) and v and isinstance(v[0], str):
                res += v
            else:
                res += _textes(v)
    elif isinstance(o, list):
        for x in o:
            res += _textes(x)
    return res


def normaliser(c: dict) -> str:
    """Forme comparable (ordre des nœuds, des clés et des listes d'ids sans importance)."""
    d = copy.deepcopy({k: v for k, v in c.items() if not k.startswith("_")})
    for n in d.get("noeuds", []):
        for dm in n.get("demonstrations", []):
            dm["premisses"] = {r: sorted(v) for r, v in dm.get("premisses", {}).items() if v}
    d["noeuds"] = sorted(d.get("noeuds", []), key=lambda n: n.get("id", ""))
    d["liens"] = sorted(d.get("liens", []), key=lambda li: json.dumps(li, sort_keys=True))
    return json.dumps(d, sort_keys=True, ensure_ascii=False)


def attendu(c: dict, niveau: str) -> dict:
    return projection_base(c) if niveau == "base" else c


def mesurer(c: dict) -> list[dict]:
    jetons, methode = compteur_jetons()
    res = []
    for fichier, libelle, _, relu, niveau in ENCODAGES:
        t = (DOSSIER / fichier).read_text(encoding="utf-8")
        charge = "\n".join(([n["nom"] for n in c["noeuds"]] + [c["titre"]] if fichier.startswith("12") else _textes(json.loads(t))) if niveau == "vue"
                           else _textes(attendu(c, niveau)))
        aller_retour = "—"
        if relu is not None:
            try:
                aller_retour = "sans perte" if normaliser(relu(t)) == normaliser(attendu(c, niveau)) else "ÉCART"
            except ImportError:
                aller_retour = "non testé (module absent)"
        tj, tc = jetons(t), jetons(charge)
        tj_ind = jetons(re.sub(r"(?m)^ +", " ", t))
        res.append({"fichier": fichier, "format": libelle, "caracteres": len(t), "octets": len(t.encode()), "lignes": t.count("\n") + 1,
                    "jetons": tj, "jetons_indent1": tj_ind, "jetons_c4": round(len(t) / 4), "structure": tj - tc, "structure_pct": round(100 * (tj - tc) / tj),
                    "par_noeud": round(tj / len(c["noeuds"])), "information": niveau, "aller_retour": aller_retour})
    print(f"\nTaille des encodages de la fontaine ({len(c['noeuds'])} nœuds, {sum(len(n.get('demonstrations', [])) for n in c['noeuds'])} démonstrations, "
          f"{sum(len(justifie_par(d)) for n in c['noeuds'] for d in n.get('demonstrations', []))} prémisses) — jetons : {methode}\n")
    print(f"{'fichier':30} {'caract.':>8} {'jetons':>7} {'jet.i1':>7} {'c/4':>7} {'struct.':>8} {'/nœud':>6}  {'info':8} aller-retour")
    for r in res:
        print(f"{r['fichier']:30} {r['caracteres']:8} {r['jetons']:7} {r['jetons_indent1']:7} {r['jetons_c4']:7} {r['structure']:5} {r['structure_pct']:2}% {r['par_noeud']:6}  {r['information']:8} {r['aller_retour']}")
    return res


# ══ Écart base / visualisations : ce que depuisApiAtlas devine faute de données ══════════════════════════════


def deviser_type(i: str, admis: bool) -> str:
    """Copie de deviserType (src/raisonnement/donnees.ts)."""
    regles = [(r"^(def|notation)", "definition"), (r"^ax", "axiome"), (r"^(hyp|h_)", "hypothese"), (r"^(cm_|choix)", "choix_modelisation"),
              (r"^dec", "decision"), (r"^(lem|lt_)", "lemme"), (r"^prop", "proposition"), (r"^(thm|theoreme|cor)", "theoreme"),
              (r"^(exp)", "experience"), (r"^(calc|sim)", "calcul"), (r"^obs", "observation"), (r"^(res)", "resultat"), (r"^conj", "conjecture")]
    for motif, t in regles:
        if re.match(motif, i.lower()):
            return t
    return "definition" if admis else "assertion"


def ecart(c: dict) -> None:
    types_ok = sum(deviser_type(n["id"], bool(n.get("admis"))) == n["type"] for n in c["noeuds"])
    faux_types = [f"{n['id']} ({n['type']} → {deviser_type(n['id'], bool(n.get('admis')))})" for n in c["noeuds"] if deviser_type(n["id"], bool(n.get("admis"))) != n["type"]]
    par_id = {n["id"]: n for n in c["noeuds"]}

    def role_devine(p: str) -> str:  # deviserRole, appliqué au type deviné (seul disponible depuis l'API)
        q = par_id[p]
        t = deviser_type(p, bool(q.get("admis")))
        return "contexte" if t in ("definition", "axiome") else "technique" if t == "lemme" and q.get("admis") else "principale"

    total = ok = 0
    confusion: dict[tuple[str, str], int] = {}
    for n in c["noeuds"]:
        for d in n.get("demonstrations", []) + ([{"premisses": {"contexte": n["utilise"]}}] if n.get("utilise") else []):
            for r, ids in d["premisses"].items():
                for p in ids:
                    total += 1
                    g = role_devine(p)
                    ok += g == r
                    if g != r:
                        confusion[(r, g)] = confusion.get((r, g), 0) + 1
    perdus = {
        "type": len(c["noeuds"]), "decision": sum("decision" in n for n in c["noeuds"]), "choix": sum("choix" in n for n in c["noeuds"]),
        "sous_probleme": len(c["noeuds"]), "abandonne": sum(bool(n.get("abandonne")) for n in c["noeuds"]), "liens": len(c["liens"]),
        "origine": len(c["noeuds"]),
    }
    print(f"\nÉcart base / visualisations : types devinés justes {types_ok}/{len(c['noeuds'])} ; rôles devinés justes {ok}/{total}")
    print("  types faux :", ", ".join(faux_types))
    print("  rôles faux (vrai → deviné) :", ", ".join(f"{a} → {b} × {k}" for (a, b), k in sorted(confusion.items())))
    print("  champs sans colonne en base :", ", ".join(f"{k} ({v})" for k, v in perdus.items()))


# ══ Robustesse d'écriture : altérations typiques d'une sortie de LLM ═════════════════════════════════════════


def _apres(t: str, frac: float, motif: str) -> int:
    m = re.compile(motif, re.M).search(t, int(len(t) * frac))
    return m.start() if m else -1


def alt_faute_id(t: str, fichier: str) -> str:
    i = t.rfind("l_conserv")
    return t[:i] + "l_conserve" + t[i + len("l_conserv"):]


def alt_delimiteur(t: str, fichier: str) -> str:
    if fichier.endswith((".json", ".jsonl")):
        i = t.find("}", len(t) // 2)
        return t[:i] + t[i + 1:]
    if fichier.endswith(".yaml"):
        i = _apres(t, 0.5, r"^ {6,}\S")
        return t[:i] + t[i + 2:]
    if fichier.endswith(".tex"):
        i = _apres(t, 0.5, r"^\\end\{")
        return t[:i] + t[t.index("\n", i) + 1:]
    if fichier.endswith(".md"):
        i = _apres(t, 0.5, r"^### ")
        return t[:i] + t[i + 4:]
    i = _apres(t, 0.5, r"^  = ")  # compact : la démonstration perd son indentation
    return t[:i] + t[i + 2:]


def alt_troncature(t: str, fichier: str) -> list[str]:
    return [t[: int(len(t) * k / 20)] for k in range(1, 20)]


def alt_guillemet(t: str, fichier: str) -> str:
    return t.replace("chaînette inversée", 'chaînette "inversée', 1)


def _attendu_guillemet(c: dict) -> dict:
    d = copy.deepcopy(c)
    for n in d["noeuds"]:
        for k in ("nom", "enonce"):
            if "chaînette inversée" in n[k]:
                n[k] = n[k].replace("chaînette inversée", 'chaînette "inversée', 1)
                return d
    return d


ALTERATIONS = [
    ("id mal orthographié", alt_faute_id, None),
    ("délimiteur oublié", alt_delimiteur, None),
    ("sortie tronquée (19 coupes)", alt_troncature, None),
    ('guillemet " non échappé', alt_guillemet, _attendu_guillemet),
]


def _issue(relu, texte: str, ref: dict, niveau: str) -> str:
    """syntaxe : rejet à la lecture ; validation : lu mais refusé par les règles ; partiel : lignes illisibles
    signalées, le reste gardé ; correct : accepté et identique à l'attendu ; SILENCIEUX : accepté mais faux."""
    try:
        lu = relu(texte)
    except ErreurSyntaxe:
        return "syntaxe"
    except ImportError:
        return "non testé"
    except (KeyError, IndexError, AttributeError, TypeError, ValueError) as e:
        return f"plantage ({type(e).__name__})"
    erreurs, _ = valider(lu, "base" if niveau == "base" else "complet")
    erreurs += lu.get("_incoherences", [])
    if not erreurs and normaliser(lu) == normaliser(ref):
        return "correct"
    if lu.get("_lignes_rejetees"):
        return "partiel+validation" if erreurs else "partiel"
    return "validation" if erreurs else "SILENCIEUX"


def robustesse(c: dict) -> list[tuple[str, list[str]]]:
    print("\nRobustesse d'écriture (relecture + validation après altération) :")
    lignes = []
    for fichier, libelle, _, relu, niveau in ENCODAGES:
        if relu is None or fichier.startswith("04b"):
            continue
        t = (DOSSIER / fichier).read_text(encoding="utf-8")
        issues = []
        for _, alterer, cible in ALTERATIONS:
            ref = attendu(cible(c) if cible else c, niveau)
            variantes = alterer(t, fichier)
            comptes: dict[str, int] = {}
            for v in variantes if isinstance(variantes, list) else [variantes]:
                i = _issue(relu, v, ref, niveau)
                comptes[i] = comptes.get(i, 0) + 1
            issues.append(", ".join(f"{k} {n}" if len(comptes) > 1 or n > 1 else k for k, n in comptes.items()))
        lignes.append((fichier, issues))
        print(f"  {fichier:26} " + " | ".join(f"{a[0]} : {i}" for a, i in zip(ALTERATIONS, issues)))
    return lignes


# ══ Diff : une mise à jour typique (verdict du vérificateur sur l_sommet) ════════════════════════════════════


def diff(c: dict) -> None:
    apres = copy.deepcopy(c)
    for n in apres["noeuds"]:
        if n["id"] == "l_sommet":
            n["demonstrations"][0].update({"validite": "valide", "confiance": 0.83, "verifie_par": ["ia"]})
    print("\nDiff après un verdict (l_sommet : à vérifier → valide, confiance 0.83) :")
    for fichier, _, rendu, _, _ in ENCODAGES:
        if fichier.startswith(("03", "04b")):
            continue
        a, b = rendu(c).splitlines(), rendu(apres).splitlines()
        changees = [x for x in difflib.unified_diff(a, b, lineterm="", n=0) if x[:1] in "+-" and not x.startswith(("+++", "---"))]
        print(f"  {fichier:26} {len(changees):3} lignes +/-, {sum(len(x) for x in changees):6} caractères dans le diff")


# ══ Sous-graphes pour tenir dans un contexte ═════════════════════════════════════════════════════════════════


def sous_graphe(c: dict, centre: str, sens: str = "amont", profondeur: int = 2, roles=ROLES) -> tuple[dict, list[tuple[str, str]]]:
    par_id = {n["id"]: n for n in c["noeuds"]}
    if centre not in par_id:
        raise SystemExit(f"nœud inconnu : {centre}")
    amont = {n["id"]: (n.get("utilise", []) if "contexte" in roles else [])
             + [p for d in n.get("demonstrations", []) for r, ids in d["premisses"].items() if r in roles for p in ids] for n in c["noeuds"]}
    aval: dict[str, list[str]] = {i: [] for i in par_id}
    for i, ps in amont.items():
        for p in ps:
            aval[p].append(i)
    retenus, front = {centre}, [centre]
    for _ in range(profondeur):
        suivant = []
        for u in front:
            for v in (amont[u] if sens in ("amont", "les_deux") else []) + (aval[u] if sens in ("aval", "les_deux") else []):
                if v not in retenus:
                    retenus.add(v)
                    suivant.append(v)
        front = suivant
    sg = {**{k: c[k] for k in ("format", "titre", "resume")}, "sous_problemes": [s for s in c["sous_problemes"] if any(par_id[i]["sous_probleme"] == s["id"] for i in retenus)],
          "noeuds": [n for n in c["noeuds"] if n["id"] in retenus], "liens": [li for li in c["liens"] if li["source"] in retenus and li["cible"] in retenus]}
    cites = {p for n in sg["noeuds"] for d in n.get("demonstrations", []) for p in justifie_par(d)} | {p for n in sg["noeuds"] for p in n.get("utilise", [])} | {li["cible"] for li in c["liens"] if li["source"] in retenus}
    frontiere = [(i, par_id[i]["nom"]) for i in par_id if i in cites and i not in retenus]
    return sg, frontiere


def sous_graphes(c: dict) -> None:
    jetons, _ = compteur_jetons()
    sg, fr = sous_graphe(c, "thm_rapport", "amont", 2, ROLES)
    (DOSSIER / "13-prompt-sous-graphe-thm_rapport.md").write_text(vers_markdown(sg, fr, calculer_statuts(c)), encoding="utf-8", newline="\n")
    total = jetons(vers_markdown(c))
    print(f"\nSous-graphes rendus en Markdown (graphe entier : {total} jetons) :")
    for centre, sens, prof, roles in [("thm_rapport", "amont", 1, ROLES), ("thm_rapport", "amont", 2, ROLES), ("thm_rapport", "amont", 2, ("principale",)),
                                      ("thm_rapport", "amont", 99, ("principale", "auxiliaire")), ("ch_prise", "aval", 99, ROLES), ("l_sommet", "les_deux", 1, ROLES)]:
        sg, fr = sous_graphe(c, centre, sens, prof, roles)
        t = vers_markdown(sg, fr)
        print(f"  {centre:12} {sens:8} prof. {prof if prof < 99 else '∞':2} rôles {'+'.join(r[:4] for r in roles):24} → {len(sg['noeuds']):2} nœuds + {len(fr):2} en frontière, "
              f"{jetons(t):5} jetons ({round(100 * jetons(t) / total)} %)")


# ══ Commandes ════════════════════════════════════════════════════════════════════════════════════════════════


def cmd_valider(chemin: str) -> int:
    p = Path(chemin)
    t = p.read_text(encoding="utf-8")
    lecteur = {".json": depuis_jsonld if "jsonld" in p.name else depuis_json, ".jsonl": depuis_jsonl, ".yaml": depuis_yaml, ".tex": depuis_blueprint,
               ".md": depuis_markdown, ".txt": depuis_compact}[p.suffix]
    try:
        c = lecteur(t)
    except ErreurSyntaxe as e:
        print(f"Syntaxe : {e}")
        return 2
    erreurs, av = valider(c)
    try:
        import jsonschema

        schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        propre = {k: v for k, v in c.items() if not k.startswith("_")}
        erreurs += [f"schéma : {e.json_path} : {e.message}" for e in jsonschema.Draft202012Validator(schema).iter_errors(propre)]
    except ImportError:
        av.append("jsonschema absent : schéma JSON non vérifié (règles internes appliquées)")
    for e in erreurs:
        print("ERREUR", e)
    for a in av:
        print("avert.", a)
    print(f"{len(c.get('noeuds', []))} nœuds, {len(erreurs)} erreur(s), {len(av)} avertissement(s)")
    return 1 if erreurs else 0


def demo_validation(c: dict) -> None:
    """Erreurs sémantiques typiques d'un agent, injectées dans le canonique."""
    print("\nValidation : erreurs sémantiques injectées")
    cas = []
    d = copy.deepcopy(c)
    d["noeuds"][-1]["demonstrations"][0]["premisses"]["principale"].append("thm_rapor")
    cas.append(("prémisse inconnue", d))
    d = copy.deepcopy(c)
    next(n for n in d["noeuds"] if n["id"] == "l_mouv")["demonstrations"][0]["premisses"]["principale"].append("p_vitesse")
    cas.append(("cycle", d))
    d = copy.deepcopy(c)
    for a in next(n for n in d["noeuds"] if n["id"] == "d_alpha")["decision"]["alternatives"]:
        a["retenue"] = False
    cas.append(("décision sans alternative retenue", d))
    d = copy.deepcopy(c)
    next(n for n in d["noeuds"] if n["id"] == "ax_gravite")["source"] = ""
    cas.append(("admis sans source", d))
    d = copy.deepcopy(c)
    next(n for n in d["noeuds"] if n["id"] == "p_vitesse")["demonstrations"][0]["premisses"]["contexte"].append("l_prise")
    cas.append(("prémisse citée sous deux rôles", d))
    for nom, x in cas:
        e, a = valider(x)
        print(f"  {nom:34} → " + "; ".join(e + [f"(avert.) {v}" for v in a]))


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sous = ap.add_subparsers(dest="cmd", required=True)
    sous.add_parser("tout")
    sous.add_parser("generer")
    v = sous.add_parser("valider")
    v.add_argument("fichier")
    s = sous.add_parser("sous-graphe")
    s.add_argument("centre")
    s.add_argument("--sens", default="amont", choices=["amont", "aval", "les_deux"])
    s.add_argument("--profondeur", type=int, default=2)
    s.add_argument("--roles", default=",".join(ROLES))
    a = ap.parse_args()
    if a.cmd == "valider":
        return cmd_valider(a.fichier)
    if a.cmd == "sous-graphe":
        sg, fr = sous_graphe(charger_canonique(), a.centre, a.sens, a.profondeur, tuple(a.roles.split(",")))
        print(vers_markdown(sg, fr))
        return 0
    c = generer()
    if a.cmd == "tout":
        erreurs, av = valider(c)
        print(f"Canonique de la fontaine : {len(erreurs)} erreur(s), {len(av)} avertissement(s)" + "".join(f"\n  {x}" for x in erreurs + av))
        res = mesurer(c)
        (ICI / "mesures.json").write_text(json.dumps(res, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        ecart(c)
        demo_validation(c)
        robustesse(c)
        diff(c)
        sous_graphes(c)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
