import pytest

from app import config
from app.registre.service import Registre
from app.registre.stockage import StockageMemoire


@pytest.fixture(autouse=True)
def donnees_temporaires(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DOSSIER_DONNEES", tmp_path)


@pytest.fixture
async def registre():
    # Pas de `demarrer()` : la surveillance périodique n'a rien à faire dans les tests.
    return Registre(StockageMemoire())


async def nouvelle(registre: Registre, utilisateur="u1", type_agent="explorateur", titre="résumé du graphe"):
    return await registre.creer_tache(
        utilisateur_id=utilisateur, type_agent=type_agent, titre=titre,
        reformulation="Résumer le graphe affiché.", demande_brute="fais-moi un résumé de ce graphe",
    )
