"""Étapes lancées après chaque tour réussi de l'orchestrateur.

Une étape reçoit l'id de la conversation et celui de l'exécution ; elle retrouve ce qu'a produit le tour avec
`conversations.lister_messages`. Les étapes tournent dans l'ordre, dans la même exécution : tant qu'elles
travaillent, la conversation reste « en cours », et une exception fait échouer l'exécution.
"""

import asyncio
from collections.abc import Awaitable, Callable

from .. import conversations
from ..modeles import Message
from . import bunker

Etape = Callable[[str, str], Awaitable[None]]

TITRES = {"utilisateur": "Utilisateur", "assistant": "Orchestrateur", "systeme": "Système"}


def conversation_markdown(messages: list[Message]) -> str:
    """Copie lisible de la conversation ; les appels d'outils tiennent sur une ligne chacun."""
    blocs = ["# Conversation\n"]
    for m in messages:
        horodatage = m.cree_le.strftime("%Y-%m-%d %H:%M")
        if m.role == "outil":
            blocs.append(f"> outil ({horodatage}) : {m.contenu.splitlines()[0] if m.contenu else ''}\n")
        else:
            blocs.append(f"## {TITRES.get(m.role, m.role)} — {horodatage}\n\n{m.contenu.strip()}\n")
    return "\n".join(blocs)


async def copier_conversation(conversation_id: str, execution_id: str) -> None:
    """Recopie la conversation dans `conv/conversation.md` de la session, pour que les agents puissent la relire."""
    messages = await asyncio.to_thread(conversations.lister_messages, conversation_id, limite=5000)
    fichier = bunker.dossier_session(conversation_id) / "conv" / "conversation.md"
    fichier.parent.mkdir(parents=True, exist_ok=True)
    await asyncio.to_thread(fichier.write_text, conversation_markdown(messages), encoding="utf-8")


ETAPES_APRES_RECHERCHE: list[Etape] = [copier_conversation]


async def apres_recherche(conversation_id: str, execution_id: str) -> None:
    for etape in ETAPES_APRES_RECHERCHE:
        await etape(conversation_id, execution_id)
