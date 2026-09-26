"""Test de contrat : les schémas de `protocoles/` et les modèles Pydantic acceptent et refusent les mêmes
exemples (`protocoles/exemples/<schéma>/{valides,invalides}/*.json`). Le front fait le même test en TS."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError
from referencing import Registry, Resource

from app.affichage.protocole import MODELES

PROTOCOLES = Path(__file__).resolve().parents[3] / "protocoles"
SCHEMAS = {f.name.removesuffix(".schema.json"): json.loads(f.read_text("utf-8")) for f in PROTOCOLES.glob("*.schema.json")}
REGISTRE = Registry().with_resources((s["$id"], Resource.from_contents(s)) for s in SCHEMAS.values())
EXEMPLES = sorted(PROTOCOLES.glob("exemples/*/*/*.json"))


def _valideur(nom: str) -> Draft202012Validator:
    return Draft202012Validator(SCHEMAS[nom], registry=REGISTRE)


def test_schemas_bien_formes():
    for schema in SCHEMAS.values():
        Draft202012Validator.check_schema(schema)


def test_chaque_schema_a_modele_et_exemples():
    avec_exemples = {f.parts[-3] for f in EXEMPLES}
    groupes = {(f.parts[-3], f.parts[-2]) for f in EXEMPLES}
    for nom in SCHEMAS.keys() - {"commun"}:
        assert nom in MODELES, nom
        assert (nom, "valides") in groupes and (nom, "invalides") in groupes, nom
    assert avec_exemples <= set(MODELES)
    assert {g for _, g in groupes} == {"valides", "invalides"}


@pytest.mark.parametrize("fichier", EXEMPLES, ids=lambda f: "/".join(f.parts[-3:]))
def test_exemple(fichier: Path):
    nom, groupe = fichier.parts[-3], fichier.parts[-2]
    texte = fichier.read_text("utf-8")
    erreurs_schema = list(_valideur(nom).iter_errors(json.loads(texte)))
    try:
        MODELES[nom].model_validate_json(texte)
        erreur_modele = None
    except ValidationError as e:
        erreur_modele = e
    if groupe == "valides":
        assert not erreurs_schema, [e.message for e in erreurs_schema]
        assert erreur_modele is None, erreur_modele
    else:
        assert erreurs_schema, "le schéma accepte un exemple invalide"
        assert erreur_modele is not None, "le modèle accepte un exemple invalide"


def test_aller_retour_modele():
    """Un message valide relu puis réécrit par le modèle (sans les champs omis) reste identique."""
    for fichier in EXEMPLES:
        nom, groupe = fichier.parts[-3], fichier.parts[-2]
        if groupe != "valides" or nom == "p1-tache":
            continue
        donnees = json.loads(fichier.read_text("utf-8"))
        relu = MODELES[nom].model_validate(donnees).model_dump(mode="json", exclude_unset=True)
        assert relu == donnees, fichier.name
