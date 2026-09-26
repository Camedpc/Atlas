"""Étapes lancées après chaque tour réussi de l'orchestrateur (textGrapher, puis vérificateur…).

Une étape reçoit l'id de la conversation et celui de l'exécution ; elle retrouve ce qu'a produit le tour avec
`conversations.lister_messages`. Les étapes tournent dans l'ordre, dans la même exécution : tant qu'elles
travaillent, la conversation reste « en cours », et une exception fait échouer l'exécution.
"""

from collections.abc import Awaitable, Callable

Etape = Callable[[str, str], Awaitable[None]]

ETAPES_APRES_RECHERCHE: list[Etape] = []


async def apres_recherche(conversation_id: str, execution_id: str) -> None:
    for etape in ETAPES_APRES_RECHERCHE:
        await etape(conversation_id, execution_id)
