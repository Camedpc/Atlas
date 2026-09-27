"""Documents du graphe : fichiers et dossiers du projet (script, PDF, données, dossier de résultats).

Fonctions pures d'abord (nature d'un fichier, aperçu tiré de son contenu, chemins, plan d'un déplacement), puis les
seules lectures et écritures sur le disque (`examiner`, `deplacer_sur_disque`), séparées pour être testées à part.

Chemins : toujours relatifs au dossier du projet et séparés par /, ex. « scripts_projet/double-pendule/simulation.py ».
Un agent peut les donner ainsi, ou relatifs à son dossier de session (« docs_session/notes.md »).
"""

from __future__ import annotations

import json
import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

PREFIXE = "doc:"
RELATIONS = {
    "source": "source",
    "implemente": "implémente",
    "produit": "produit",
    "ecrit_dans": "écrit dans",
    "entree": "entrée",
    "redige_dans": "rédigé dans",
}
"""Relations d'un lien de document, et leur libellé affiché sur le graphe."""
RACINES_PROJET = ("doc_projet", "scripts_projet", "sessions")
"""Premiers dossiers du projet : ils ne se déplacent pas, et un chemin qui commence par eux est relatif au projet."""

SCRIPTS = {"py", "jl", "m", "r", "js", "ts", "sh", "c", "cpp", "h", "hpp", "f90", "rs", "go", "java", "ipynb", "sage"}
DONNEES = {"csv", "tsv", "json", "h5", "hdf5", "npy", "npz", "parquet", "xlsx", "xls", "dat", "mat", "nc"}
TEXTES = {"pdf", "md", "tex", "txt", "html", "docx", "bib", "rst"}
IMAGES = {"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"}
NATURES = {"script": "Script", "donnees": "Données", "document": "Document", "image": "Image", "fichier": "Fichier",
           "dossier": "Dossier"}
"""Nature d'un document → mot de sa tête sur le graphe (« Script 1 », « Dossier 2 »)."""

LECTURE_MAX = 256 * 1024
EXTRAIT_LIGNES = 7
ENTREES_DOSSIER = 10
LARGEUR_LIGNE = 90


class ErreurDocument(Exception):
    """Refus métier ; le message est renvoyé tel quel à l'agent."""


# ─── Nature et aperçu (purs) ────────────────────────────────────────────────


def extension(chemin: str) -> str:
    nom = PurePosixPath(chemin).name
    return nom.rsplit(".", 1)[1].lower() if "." in nom[1:] else ""


def nature(chemin: str, dossier: bool = False) -> str:
    if dossier:
        return "dossier"
    ext = extension(chemin)
    if ext in SCRIPTS:
        return "script"
    if ext in DONNEES:
        return "donnees"
    if ext in TEXTES:
        return "document"
    if ext in IMAGES:
        return "image"
    return "fichier"


def _couper(ligne: str) -> str:
    ligne = ligne.rstrip().expandtabs(4)
    return ligne if len(ligne) <= LARGEUR_LIGNE else ligne[: LARGEUR_LIGNE - 1] + "…"


def extrait_code(texte: str, n: int = EXTRAIT_LIGNES) -> list[str]:
    """Les lignes qui disent ce que fait un script : sa docstring (première ligne), ses définitions, puis le reste,
    sans les lignes vides, les en-têtes (#!, encodage) ni les imports."""
    utiles: list[str] = []
    for ligne in texte.splitlines():
        brute = ligne.strip()
        if not brute or brute.startswith(("#!", "# -*-", "import ", "from ")):
            continue
        utiles.append(_couper(ligne))
        if len(utiles) >= n:
            break
    return utiles


def _cellules_de_code(texte: str) -> str:
    """Le code d'un notebook Jupyter, cellules mises bout à bout."""
    try:
        cahier = json.loads(texte)
        cellules = [c for c in cahier.get("cells", []) if c.get("cell_type") == "code"]
        return "\n".join("".join(c.get("source", [])) for c in cellules)
    except (ValueError, AttributeError):
        return ""


def _pages_pdf(donnees: bytes) -> int | None:
    n = len(re.findall(rb"/Type\s*/Page(?!s)", donnees))
    return n or None


def _titre_pdf(donnees: bytes) -> str | None:
    m = re.search(rb"/Title\s*\(((?:[^()\\]|\\.){1,200})\)", donnees)
    if not m:
        return None
    brut = m.group(1)
    if brut.startswith(b"\xfe\xff"):
        texte = brut[2:].decode("utf-16-be", "ignore")
    else:
        texte = brut.decode("latin-1", "ignore")
    texte = re.sub(r"\\(.)", r"\1", texte).strip()
    return texte or None


def apercu_fichier(chemin: str, donnees: bytes, taille: int) -> dict[str, Any]:
    """Aperçu d'un fichier à partir de ses premiers octets (au plus LECTURE_MAX) : ce que le graphe montre de près."""
    genre = nature(chemin)
    ext = extension(chemin)
    apercu: dict[str, Any] = {"nature": genre, "taille": taille}
    if ext == "pdf":
        apercu["pages"] = _pages_pdf(donnees)
        if titre := _titre_pdf(donnees):
            apercu["titre_pdf"] = titre
        return apercu
    if genre == "image" or b"\x00" in donnees[:4096]:
        return apercu
    texte = donnees.decode("utf-8", "replace")
    if ext == "ipynb":
        texte = _cellules_de_code(texte)
    tronque = len(donnees) >= LECTURE_MAX
    nb = texte.count("\n") + (0 if texte.endswith("\n") or not texte else 1)
    apercu["lignes"] = nb if not tronque else None
    if genre == "script":
        apercu["extrait"] = extrait_code(texte)
    elif ext in ("csv", "tsv"):
        entete = texte.split("\n", 1)[0].strip()
        separateur = "\t" if ext == "tsv" else ";" if entete.count(";") > entete.count(",") else ","
        apercu["colonnes"] = [c.strip().strip('"') for c in entete.split(separateur)][:12] if entete else []
        apercu["lignes"] = max(0, nb - 1) if not tronque else None
    elif ext == "json":
        try:
            valeur = json.loads(texte)
            apercu["cles"] = list(valeur)[:12] if isinstance(valeur, dict) else None
            apercu["elements"] = len(valeur) if isinstance(valeur, list) else None
        except ValueError:
            pass
    else:
        apercu["extrait"] = [_couper(l) for l in texte.splitlines() if l.strip()][:EXTRAIT_LIGNES]
    return {k: v for k, v in apercu.items() if v is not None}


def apercu_dossier(entrees: list[tuple[str, bool]], fichiers: int, dossiers: int) -> dict[str, Any]:
    """`entrees` : (nom, est un dossier) du premier niveau ; `fichiers`, `dossiers` : comptes sur tout le dossier."""
    tries = sorted(entrees, key=lambda e: (not e[1], e[0].lower()))
    return {
        "nature": "dossier",
        "entrees": [n + "/" if d else n for n, d in tries[:ENTREES_DOSSIER]],
        "autres": max(0, len(tries) - ENTREES_DOSSIER),
        "fichiers": fichiers,
        "dossiers": dossiers,
    }


# ─── Chemins (purs) ─────────────────────────────────────────────────────────


def normaliser(chemin: str, session_relative: str | None = None) -> str:
    """Chemin relatif au projet, à partir d'un chemin donné par un agent : relatif au projet s'il commence par
    doc_projet/, scripts_projet/ ou sessions/, sinon relatif à sa session (`session_relative` = « sessions/<id> »).
    Refuse ce qui sort du projet ou passe par un dossier caché."""
    brut = chemin.strip().replace("\\", "/")
    if not brut:
        raise ErreurDocument("Chemin vide.")
    if brut.startswith("/") or re.match(r"^[A-Za-z]:", brut):
        raise ErreurDocument(f"Chemin absolu refusé : {chemin}. Donne-le relatif au projet (doc_projet/…).")
    morceaux = [p for p in brut.split("/") if p not in ("", ".")]
    premier = morceaux[0] if morceaux else ""
    base = [] if premier in RACINES_PROJET or session_relative is None else session_relative.split("/")
    parties: list[str] = list(base)
    for p in morceaux:
        if p == "..":
            if not parties:
                raise ErreurDocument(f"Chemin hors du projet : {chemin}.")
            parties.pop()
            continue
        if p.startswith("."):
            raise ErreurDocument(f"Dossier ou fichier caché refusé : {chemin}.")
        parties.append(p)
    if not parties:
        raise ErreurDocument(f"Chemin hors du projet : {chemin} (c'est le dossier du projet lui-même).")
    return "/".join(parties)


def sous(chemin: str, dossier: str) -> bool:
    """Vrai si `chemin` est `dossier` lui-même ou l'un de ses descendants."""
    return chemin == dossier or chemin.startswith(dossier + "/")


def remplacer_prefixe(chemin: str, de: str, vers: str) -> str:
    return vers + chemin[len(de) :]


@dataclass(frozen=True)
class PlanDeplacement:
    """Ce qu'un déplacement change en base : documents (id → nouveau chemin) et figures (id → champs)."""

    documents: dict[str, str]
    figures: dict[str, dict[str, str]]


def planifier_deplacement(
    de: str, vers: str, documents: list[dict[str, Any]], figures: list[dict[str, Any]]
) -> PlanDeplacement:
    """Les chemins à réécrire quand `de` (fichier ou dossier) devient `vers` : documents dont le chemin est `de` ou
    dedans, et figures dont le fichier d'origine ou la source y sont. Pur : ne touche ni au disque ni à la base."""
    if de.split("/")[0] not in RACINES_PROJET or "/" not in de:
        raise ErreurDocument(f"{de} : seul ce qui est sous doc_projet/, scripts_projet/ ou sessions/<id>/ se déplace.")
    if de.startswith("sessions/") and de.count("/") < 2:
        raise ErreurDocument(f"{de} est un dossier de session : il ne se déplace pas.")
    if vers.split("/")[0] not in RACINES_PROJET or "/" not in vers:
        raise ErreurDocument(f"Destination {vers} : sous doc_projet/, scripts_projet/ ou sessions/<id>/.")
    if sous(vers, de):
        raise ErreurDocument(f"{vers} est dans {de} : un dossier ne se déplace pas en lui-même.")
    docs = {d["id"]: remplacer_prefixe(d["chemin"], de, vers) for d in documents if sous(d["chemin"], de)}
    figs: dict[str, dict[str, str]] = {}
    for f in figures:
        champs: dict[str, str] = {}
        if f.get("fichier") and sous(f["fichier"], de):
            champs["fichier"] = remplacer_prefixe(f["fichier"], de, vers)
        if f.get("source") and sous(f["source"], de):
            champs["source"] = remplacer_prefixe(f["source"], de, vers)
        if champs:
            figs[f["id"]] = champs
    return PlanDeplacement(docs, figs)


def verifier_lien(de: str, vers: str, relation: str) -> None:
    if relation not in RELATIONS:
        raise ErreurDocument(f"Relation « {relation} » : {', '.join(RELATIONS)}.")
    if not (de.startswith(PREFIXE) or vers.startswith(PREFIXE)):
        raise ErreurDocument(f"Lien {de} → {vers} : l'un des deux bouts doit être un document (doc:<id>).")
    if de == vers:
        raise ErreurDocument("Un document ne se lie pas à lui-même.")


# ─── Disque ─────────────────────────────────────────────────────────────────


def sur_disque(projet: Path, chemin: str) -> Path:
    """Le chemin sur le disque, en refusant tout ce qui sortirait du dossier du projet (liens symboliques compris)."""
    base = projet.resolve()
    cible = (base / chemin).resolve()
    if not cible.is_relative_to(base) or cible == base:
        raise ErreurDocument(f"Chemin hors du projet : {chemin}.")
    return cible


def _visible(p: Path) -> bool:
    return not p.name.startswith(".") and p.name not in ("__pycache__", "node_modules", ".ipynb_checkpoints")


def examiner(projet: Path, chemin: str) -> tuple[str, dict[str, Any]] | None:
    """(genre, aperçu) du fichier ou du dossier, ou None s'il n'existe pas."""
    p = sur_disque(projet, chemin)
    if p.is_dir():
        entrees = [(e.name, e.is_dir()) for e in p.iterdir() if _visible(e)]
        fichiers = dossiers = 0
        for _racine, sous_dossiers, noms in _parcourir(p):
            dossiers += len(sous_dossiers)
            fichiers += len(noms)
        return "dossier", apercu_dossier(entrees, fichiers, dossiers)
    if p.is_file():
        taille = p.stat().st_size
        with p.open("rb") as f:
            donnees = f.read(LECTURE_MAX)
        if extension(chemin) == "pdf" and taille > LECTURE_MAX:
            donnees = p.read_bytes()[: 8 * 1024 * 1024]  # les pages d'un PDF sont réparties dans tout le fichier
        return "fichier", apercu_fichier(chemin, donnees, taille)
    return None


def _parcourir(p: Path, limite: int = 20000):
    vus = 0
    for racine, sous_dossiers, noms in os.walk(p):
        sous_dossiers[:] = [d for d in sous_dossiers if _visible(Path(d))]
        noms = [n for n in noms if _visible(Path(n))]
        vus += len(noms) + len(sous_dossiers)
        yield racine, sous_dossiers, noms
        if vus > limite:
            return


def deplacer_sur_disque(projet: Path, de: str, vers: str) -> None:
    """Déplace (ou renomme) `de` en `vers`, en créant les dossiers parents ; refuse d'écraser."""
    source = sur_disque(projet, de)
    cible = sur_disque(projet, vers)
    if not source.exists():
        raise ErreurDocument(f"Introuvable : {de}.")
    if cible.exists():
        raise ErreurDocument(f"{vers} existe déjà : choisis un autre nom (rien n'est écrasé).")
    cible.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(cible))
