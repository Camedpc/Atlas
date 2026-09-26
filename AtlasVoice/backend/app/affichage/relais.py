"""Relais d'affichage : transporte P2 (intentions), P3 (commandes) et P4 (états d'écran) entre les agents
et les écrans du graphe. État en mémoire : un écran n'a pas à survivre à un redémarrage (il se redéclare).

- Un écran appartient à un utilisateur ; son écran par défaut est le plus récemment actif (déclaré, état
  envoyé) parmi ceux connectés au flux, sinon parmi tous : un onglet fermé ne capte pas les commandes.
- Un lot n'est livré à un écran que tant que son émetteur l'attend : après le délai, il est abandonné et
  ne sera jamais exécuté plus tard.
- L'agent navigateur réutilise le `lot_id` du LotNavigation pour le LotCommandes qui en résulte : le compte
  rendu de l'écran répond aussi à l'agent moyen 2. S'il échoue avant (ambiguïté…), il répond directement.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from .. import config
from .protocole import CompteRendu, EtatAffichage, EtatResume, ErreurProtocole, LotCommandes, LotNavigation, VisibleResume

# Au-delà, un écran sans connexion ni état est oublié.
OUBLI_ECRAN_S = 3600
NB_VISIBLES_RESUME = 15


class ErreurRelais(Exception):
    def __init__(self, code: str, message: str, statut_http: int):
        super().__init__(message)
        self.erreur = ErreurProtocole(code=code, message=message)
        self.statut_http = statut_http


def compte_rendu_erreur(lot_id: str, code: str, message: str, etat: EtatAffichage | None = None) -> CompteRendu:
    """Compte rendu d'un lot qui n'a pas été exécuté ; `etat` (dernier connu) seulement s'il existe."""
    champs: dict = {"etat": etat} if etat is not None else {}
    return CompteRendu(version=1, lot_id=lot_id, ok=False, resultats=[], erreur=ErreurProtocole(code=code, message=message),
                       **champs)


def resume(etat: EtatAffichage) -> EtatResume:
    """Résumé d'un écran pour Atlas (P1 : contexte des tâches, ligne « À l'écran » du prompt)."""
    return EtatResume(
        ecran=etat.ecran, strategie=etat.strategie, selection=etat.selection, filtres=etat.filtres,
        conversation_affichee=etat.conversation_affichee, mode=etat.camera.mode,
        visibles=[VisibleResume(libelle=v.libelle) for v in etat.visibles[:NB_VISIBLES_RESUME]],
    )


@dataclass
class Ecran:
    id: str
    utilisateur_id: str
    etat: EtatAffichage | None = None
    actif_le: float = field(default_factory=time.monotonic)
    # Une file par connexion au flux (une reconnexion ouvre une nouvelle file).
    connexions: set[asyncio.Queue[LotCommandes]] = field(default_factory=set)


class Relais:
    def __init__(self) -> None:
        self.ecrans: dict[str, Ecran] = {}
        # Lots en attente d'un compte rendu (commandes et intentions), par lot_id.
        self.attentes: dict[str, asyncio.Future[CompteRendu]] = {}
        self.navigateurs: set[asyncio.Queue[LotNavigation]] = set()

    # ── écrans ─────────────────────────────────────────────────────

    def declarer(self, utilisateur_id: str, ecran: str | None = None) -> Ecran:
        self._oublier_inactifs()
        if ecran is None:
            ecran = f"ecran_{secrets.token_hex(6)}"
        existant = self.ecrans.get(ecran)
        if existant and existant.utilisateur_id != utilisateur_id:
            raise ErreurRelais("etat_invalide", "Identifiant d'écran déjà pris", 409)
        e = existant or Ecran(ecran, utilisateur_id)
        self.ecrans[ecran] = e
        self._activer(e)
        return e

    def ecran(self, ecran: str, utilisateur_id: str | None = None) -> Ecran:
        """L'écran ; `utilisateur_id` : vérifie qu'il lui appartient (None : agent, tous les écrans)."""
        e = self.ecrans.get(ecran)
        if e is None:
            raise ErreurRelais("introuvable", f"Écran inconnu : {ecran}", 404)
        if utilisateur_id is not None and e.utilisateur_id != utilisateur_id:
            raise ErreurRelais("introuvable", f"Écran inconnu : {ecran}", 403)
        return e

    def enregistrer_etat(self, ecran: str, utilisateur_id: str, etat: EtatAffichage) -> None:
        e = self.ecran(ecran, utilisateur_id)
        if etat.ecran != ecran or etat.utilisateur_id != utilisateur_id:
            raise ErreurRelais("invalide", "L'état ne correspond pas à cet écran ou à cet utilisateur", 422)
        e.etat = etat
        self._activer(e)

    def ecran_actif(self, utilisateur_id: str) -> Ecran | None:
        """Écran par défaut : connecté d'abord, puis le plus récemment actif (id pour départager)."""
        siens = [e for e in self.ecrans.values() if e.utilisateur_id == utilisateur_id]
        return max(siens, key=lambda e: (bool(e.connexions), e.actif_le, e.id), default=None)

    def etat_utilisateur(self, utilisateur_id: str) -> EtatAffichage | None:
        """Dernier état de l'écran actif de l'utilisateur (None sans écran ou sans état)."""
        e = self.ecran_actif(utilisateur_id)
        return e.etat if e else None

    def resume_utilisateur(self, utilisateur_id: str) -> EtatResume | None:
        etat = self.etat_utilisateur(utilisateur_id)
        return resume(etat) if etat else None

    def _activer(self, e: Ecran) -> None:
        e.actif_le = time.monotonic()

    def _oublier_inactifs(self) -> None:
        limite = time.monotonic() - OUBLI_ECRAN_S
        for id_, e in list(self.ecrans.items()):
            if not e.connexions and e.actif_le < limite:
                del self.ecrans[id_]

    # ── P3 : commandes vers un écran ──────────────────────────────

    async def commander(self, lot: LotCommandes, delai_s: float | None = None) -> CompteRendu:
        """Pousse un lot vers son écran et attend le compte rendu (sinon erreur `delai`)."""
        try:
            e = self.ecran(lot.ecran)
        except ErreurRelais as err:
            return self._refuser(compte_rendu_erreur(lot.lot_id, err.erreur.code, err.erreur.message))
        if not e.connexions:
            return self._refuser(compte_rendu_erreur(lot.lot_id, "delai", "L'écran n'est pas connecté au relais.", e.etat))
        attente = self._attendre(lot.lot_id)
        for file in e.connexions:
            file.put_nowait(lot)
        return await self._resultat(lot.lot_id, attente, delai_s, e)

    def recevoir_compte_rendu(self, ecran: str, utilisateur_id: str, cr: CompteRendu) -> None:
        e = self.ecran(ecran, utilisateur_id)
        if cr.etat is not None and cr.etat.ecran == ecran:
            e.etat = cr.etat
        self._activer(e)
        self._resoudre(cr)

    async def flux_ecran(self, ecran: str, utilisateur_id: str) -> AsyncIterator[LotCommandes]:
        """Lots destinés à l'écran, dans l'ordre ; les lots déjà abandonnés (délai) sont sautés."""
        e = self.ecran(ecran, utilisateur_id)
        file: asyncio.Queue[LotCommandes] = asyncio.Queue()
        e.connexions.add(file)
        self._activer(e)
        try:
            while True:
                lot = await file.get()
                attente = self.attentes.get(lot.lot_id)
                if attente is not None and not attente.done():
                    yield lot
        finally:
            e.connexions.discard(file)

    # ── P2 : intentions vers l'agent navigateur ───────────────────

    async def transmettre_intentions(self, lot: LotNavigation, delai_s: float | None = None) -> CompteRendu:
        if not self.navigateurs:
            return compte_rendu_erreur(lot.lot_id, "introuvable", "Aucun agent navigateur connecté.")
        attente = self._attendre(lot.lot_id)
        for file in self.navigateurs:
            file.put_nowait(lot)
        delai = config.AFFICHAGE_DELAI_INTENTIONS_S if delai_s is None else delai_s
        return await self._resultat(lot.lot_id, attente, delai, self.ecran_actif(lot.utilisateur_id))

    def repondre_intentions(self, cr: CompteRendu) -> None:
        """Réponse directe de l'agent navigateur (échec avant toute commande : ambiguïté, introuvable…)."""
        if not self._resoudre(cr):
            raise ErreurRelais("introuvable", f"Aucun lot en attente : {cr.lot_id}", 404)

    async def flux_navigateur(self) -> AsyncIterator[LotNavigation]:
        file: asyncio.Queue[LotNavigation] = asyncio.Queue()
        self.navigateurs.add(file)
        try:
            while True:
                lot = await file.get()
                attente = self.attentes.get(lot.lot_id)
                if attente is not None and not attente.done():
                    yield lot
        finally:
            self.navigateurs.discard(file)

    # ── attentes ──────────────────────────────────────────────────

    def _attendre(self, lot_id: str) -> asyncio.Future[CompteRendu]:
        existante = self.attentes.get(lot_id)
        if existante is not None and not existante.done():
            return existante
        f: asyncio.Future[CompteRendu] = asyncio.get_running_loop().create_future()
        self.attentes[lot_id] = f
        return f

    def _refuser(self, cr: CompteRendu) -> CompteRendu:
        """Lot refusé par le relais lui-même : son compte rendu répond aussi à qui attend ce lot_id
        (l'agent moyen 2, quand l'agent navigateur réutilise le lot_id de ses intentions)."""
        self._resoudre(cr)
        return cr

    def _resoudre(self, cr: CompteRendu) -> bool:
        f = self.attentes.get(cr.lot_id)
        if f is None or f.done():
            return False
        f.set_result(cr)
        return True

    async def _resultat(self, lot_id: str, attente: asyncio.Future[CompteRendu], delai_s: float | None,
                        e: Ecran | None) -> CompteRendu:
        delai = config.AFFICHAGE_DELAI_S if delai_s is None else delai_s
        try:
            return await asyncio.wait_for(asyncio.shield(attente), delai)
        except TimeoutError:
            attente.cancel()
            return compte_rendu_erreur(lot_id, "delai", f"Pas de compte rendu en {delai:g} s.", e.etat if e else None)
        finally:
            if self.attentes.get(lot_id) is attente and attente.done():
                del self.attentes[lot_id]
