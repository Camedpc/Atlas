import json
from pathlib import Path

import pytest

from app.modele import Noeud
from app.validite import calculer_statuts

CAS = json.loads(
    (Path(__file__).resolve().parents[2] / "shared/fixtures/validite/cas.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("cas", CAS, ids=[c["description"] for c in CAS])
def test_validite(cas):
    noeuds = [Noeud.model_validate(n) for n in cas["noeuds"]]
    assert calculer_statuts(noeuds) == cas["attendu"]
