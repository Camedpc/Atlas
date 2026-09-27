"""Documents du graphe : aperçus lus dans les fichiers, chemins ramenés au projet, déplacement qui réécrit tous les
chemins d'un coup (et revient en arrière si la base refuse), place dans la vue à droite de ce qui pointe vers eux."""

import pytest

from atlas import documents, ecriture, lecture, vue
from atlas.documents import ErreurDocument
from atlas.vue import EtatVue, NoeudVue, Placement

SCRIPT = b'''#!/usr/bin/env python
"""Double pendule : RK4, pas fixe."""
import numpy as np
from math import sin

def derivees(etat, m1, m2, l1, l2, g):
    t1, w1, t2, w2 = etat
    return w1, 0, w2, 0
'''


def test_apercu_d_un_script_sans_imports_ni_entete():
    apercu = documents.apercu_fichier("scripts_projet/p/simulation.py", SCRIPT, len(SCRIPT))
    assert apercu["nature"] == "script"
    assert apercu["lignes"] == 8
    assert apercu["extrait"][:2] == ['"""Double pendule : RK4, pas fixe."""', "def derivees(etat, m1, m2, l1, l2, g):"]


def test_apercu_de_donnees_et_de_pdf():
    csv = b"t;theta1;theta2\n0;1;2\n0.1;1.1;2.1\n"
    assert documents.apercu_fichier("r/energie.csv", csv, len(csv)) | {} == {
        "nature": "donnees",
        "taille": len(csv),
        "lignes": 2,
        "colonnes": ["t", "theta1", "theta2"],
    }
    pdf = b"%PDF-1.4 /Title (Chaos in a double pendulum) /Type /Pages /Type /Page /Type/Page"
    apercu = documents.apercu_fichier("doc_projet/sources/a.pdf", pdf, len(pdf))
    assert apercu == {"nature": "document", "taille": len(pdf), "pages": 2, "titre_pdf": "Chaos in a double pendulum"}


def test_apercu_d_un_dossier():
    apercu = documents.apercu_dossier([("b.png", False), ("anciens", True), ("a.csv", False)], fichiers=5, dossiers=1)
    assert apercu["entrees"] == ["anciens/", "a.csv", "b.png"]
    assert (apercu["fichiers"], apercu["autres"]) == (5, 0)


@pytest.mark.parametrize(
    "chemin, attendu",
    [
        ("scripts_projet/p/sim.py", "scripts_projet/p/sim.py"),
        ("docs_session/notes.md", "sessions/c1/docs_session/notes.md"),
        ("../../doc_projet/sources/a.pdf", "doc_projet/sources/a.pdf"),
        ("./scripts_projet//p/./sim.py", "scripts_projet/p/sim.py"),
    ],
)
def test_chemins_ramenes_au_projet(chemin, attendu):
    assert documents.normaliser(chemin, "sessions/c1") == attendu


@pytest.mark.parametrize("chemin", ["/etc/passwd", "../../../x", "C:/x", "scripts_projet/.cache/a", ""])
def test_chemins_refuses(chemin):
    with pytest.raises(ErreurDocument):
        documents.normaliser(chemin, "sessions/c1")


def test_plan_de_deplacement_d_un_dossier():
    docs = [
        {"id": "resultats", "chemin": "scripts_projet/p/resultats"},
        {"id": "traj", "chemin": "scripts_projet/p/resultats/traj.csv"},
        {"id": "autre", "chemin": "scripts_projet/p/resultats_bis/x.csv"},
    ]
    figs = [
        {"id": "f1", "fichier": "scripts_projet/p/resultats/traj.gif", "source": "scripts_projet/p/sim.py"},
        {"id": "f2", "fichier": None, "source": "scripts_projet/p/resultats"},
    ]
    plan = documents.planifier_deplacement("scripts_projet/p/resultats", "scripts_projet/p/v2/resultats", docs, figs)
    assert plan.documents == {
        "resultats": "scripts_projet/p/v2/resultats",
        "traj": "scripts_projet/p/v2/resultats/traj.csv",
    }
    assert plan.figures == {
        "f1": {"fichier": "scripts_projet/p/v2/resultats/traj.gif"},
        "f2": {"source": "scripts_projet/p/v2/resultats"},
    }


@pytest.mark.parametrize(
    "de, vers, message",
    [
        ("scripts_projet", "doc_projet/x", "se déplace"),
        ("sessions/c1", "scripts_projet/c1", "dossier de session"),
        ("scripts_projet/p", "scripts_projet/p/q", "en lui-même"),
        ("scripts_projet/p", "ailleurs/p", "Destination"),
    ],
)
def test_deplacements_refuses(de, vers, message):
    with pytest.raises(ErreurDocument, match=message):
        documents.planifier_deplacement(de, vers, [], [])


def test_examiner_et_deplacer_sur_disque(tmp_path):
    (tmp_path / "scripts_projet" / "p" / "resultats").mkdir(parents=True)
    (tmp_path / "scripts_projet" / "p" / "sim.py").write_bytes(SCRIPT)
    (tmp_path / "scripts_projet" / "p" / "resultats" / "a.csv").write_text("t,x\n0,1\n")
    genre, apercu = documents.examiner(tmp_path, "scripts_projet/p")
    assert genre == "dossier" and apercu["entrees"] == ["resultats/", "sim.py"] and apercu["fichiers"] == 2
    assert documents.examiner(tmp_path, "scripts_projet/p/absent.py") is None
    documents.deplacer_sur_disque(tmp_path, "scripts_projet/p/resultats", "scripts_projet/q/sorties")
    assert (tmp_path / "scripts_projet" / "q" / "sorties" / "a.csv").is_file()
    with pytest.raises(ErreurDocument, match="existe déjà"):
        documents.deplacer_sur_disque(tmp_path, "scripts_projet/p/sim.py", "scripts_projet/q/sorties")
    with pytest.raises(ErreurDocument, match="hors du projet"):
        documents.sur_disque(tmp_path, "../dehors")


class _Base:
    """Supabase réduit à ce que deplacer_document écrit : update(...).eq(...).eq(...).execute()."""

    def __init__(self, echoue_sur: str | None = None):
        self.ecrits: list[tuple[str, dict]] = []
        self.echoue_sur = echoue_sur

    def table(self, nom):
        base = self

        class Requete:
            def update(self, champs):
                self.champs = champs
                return self

            def eq(self, *_):
                return self

            def insert(self, ligne):
                self.champs = ligne
                return self

            def execute(self):
                if base.echoue_sur == nom:
                    raise RuntimeError("base indisponible")
                base.ecrits.append((nom, self.champs))
                return self

        return Requete()


def _projet_sur_disque(tmp_path, monkeypatch, base):
    (tmp_path / "scripts_projet" / "p" / "resultats").mkdir(parents=True)
    (tmp_path / "scripts_projet" / "p" / "resultats" / "traj.gif").write_bytes(b"GIF89a")
    monkeypatch.setattr(ecriture, "supabase", lambda: base)
    monkeypatch.setattr(
        lecture,
        "lister_documents",
        lambda projet_id, colonnes="*": [{"id": "resultats", "chemin": "scripts_projet/p/resultats"}],
    )
    monkeypatch.setattr(
        lecture,
        "lister_figures",
        lambda projet_id, noeud_id=None, colonnes="*": [
            {"id": "traj", "fichier": "scripts_projet/p/resultats/traj.gif", "source": None}
        ],
    )
    monkeypatch.setattr(ecriture, "rafraichir_documents", lambda projet_id, racine: [])


def test_deplacer_document_reecrit_la_base(tmp_path, monkeypatch):
    base = _Base()
    _projet_sur_disque(tmp_path, monkeypatch, base)
    resume = ecriture.deplacer_document(
        projet_id="p", racine=tmp_path, de="scripts_projet/p/resultats", vers="scripts_projet/p/v2", auteur="t"
    )
    assert (tmp_path / "scripts_projet" / "p" / "v2" / "traj.gif").is_file()
    assert resume["documents"] == {"resultats": "scripts_projet/p/v2"}
    assert ("documents", {"chemin": "scripts_projet/p/v2"}) in base.ecrits
    assert ("figures", {"fichier": "scripts_projet/p/v2/traj.gif"}) in base.ecrits
    assert base.ecrits[-1][0] == "journal"


def test_deplacer_document_revient_en_arriere_si_la_base_refuse(tmp_path, monkeypatch):
    base = _Base(echoue_sur="figures")
    _projet_sur_disque(tmp_path, monkeypatch, base)
    with pytest.raises(RuntimeError):
        ecriture.deplacer_document(
            projet_id="p", racine=tmp_path, de="scripts_projet/p/resultats", vers="scripts_projet/p/v2", auteur="t"
        )
    # Le fichier est revenu, et le chemin du document a été remis.
    assert (tmp_path / "scripts_projet" / "p" / "resultats" / "traj.gif").is_file()
    assert base.ecrits[-1] == ("documents", {"chemin": "scripts_projet/p/resultats"})


def test_un_document_se_place_a_droite_de_ce_qui_pointe_vers_lui():
    etat = EtatVue(
        noeuds={
            "def_eq": NoeudVue("def_eq", "Équations", "definition"),
            "doc:sim": NoeudVue("doc:sim", "Simulation", "document", None, (("def_eq", "auxiliaire"),), detail="s.py"),
        },
        placements={"def_eq": Placement("def_eq", 2, 3)},
    )
    place = vue.placer_figure(etat, "doc:sim", None, 1, 1)
    assert (place.colonne, place.ligne) == (3, 3)
    etat.placements["doc:sim"] = place
    assert "[3,3] doc:sim · document — Simulation (s.py) ⟵ def_eq" in vue.rendre_texte(etat)
    with pytest.raises(vue.ErreurVue, match="une seule case"):
        vue.appliquer(etat, [{"op": "placer", "noeud": "doc:sim", "colonne": 5, "ligne": 0, "largeur": 2}])
