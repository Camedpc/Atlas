"""Format d'échange d'un nœud : vu par les agents, exporté et importé tel quel."""

from typing import Literal

from pydantic import BaseModel, Field

Validite = Literal["a_verifier", "valide", "invalide"]
Statut = Literal["etabli", "suspendu", "a_verifier", "invalide", "ouvert"]

ID_PATTERN = r"^[a-z0-9_]+$"


class Demonstration(BaseModel):
    nom_demonstration: str = Field(min_length=1)
    justifie_par: list[str] = []
    demonstration: str = ""
    validite: Validite = "a_verifier"
    auteur: str = "ia"


class Noeud(BaseModel):
    id: str = Field(pattern=ID_PATTERN)
    nom: str
    enonce: str
    admis: bool = False
    demonstrations: list[Demonstration] = []
