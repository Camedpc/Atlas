"""Identité de l'utilisateur : les agents agissent avec ses droits (section 6.3).

Avec SUPABASE_JWT_SECRET, un JWT Supabase valide est exigé ; sans, tout le monde est « anonyme »
(développement, démonstration). L'API des agents est protégée par une clé partagée.
"""

from __future__ import annotations

import hmac
import logging

import jwt
from fastapi import Header, HTTPException

from . import config

log = logging.getLogger(__name__)

ANONYME = "anonyme"


class ErreurAuth(Exception):
    pass


def utilisateur_depuis_jeton(jeton: str | None) -> str:
    if not config.SUPABASE_JWT_SECRET:
        return ANONYME
    if not jeton:
        raise ErreurAuth("Jeton manquant")
    try:
        charge = jwt.decode(jeton, config.SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
    except jwt.PyJWTError as e:
        raise ErreurAuth(f"Jeton invalide : {e}") from e
    sujet = charge.get("sub")
    if not sujet:
        raise ErreurAuth("Jeton sans utilisateur")
    return str(sujet)


def utilisateur(authorization: str | None = Header(default=None)) -> str:
    """Dépendance FastAPI : `Authorization: Bearer <jwt>`."""
    jeton = authorization.removeprefix("Bearer ").strip() if authorization else None
    try:
        return utilisateur_depuis_jeton(jeton)
    except ErreurAuth as e:
        raise HTTPException(401, str(e)) from e


def agent(x_agents_cle: str | None = Header(default=None)) -> None:
    """Dépendance FastAPI des routes réservées aux agents : `X-Agents-Cle`."""
    if not config.AGENTS_API_KEY:
        return
    if not x_agents_cle or not hmac.compare_digest(x_agents_cle, config.AGENTS_API_KEY):
        raise HTTPException(401, "Clé d'agent invalide")
