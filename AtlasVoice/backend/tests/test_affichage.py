"""Relais d'affichage (B4) : service en mémoire et routes HTTP, sans réseau."""

import asyncio
import json
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import config
from app.affichage.protocole import CompteRendu, EtatAffichage, LotCommandes, LotNavigation
from app.affichage.relais import Relais, resume
from app.main import app

EXEMPLES = Path(__file__).resolve().parents[3] / "protocoles" / "exemples"
ETAT_EXEMPLE = json.loads((EXEMPLES / "p4-etat-affichage" / "valides" / "initial.json").read_text("utf-8"))
AGENT = {"X-Agents-Cle": "cle-agents"}


def etat(ecran: str, utilisateur: str = "u1", **modifs) -> EtatAffichage:
    return EtatAffichage.model_validate({**ETAT_EXEMPLE, "ecran": ecran, "utilisateur_id": utilisateur, **modifs})


def lot_commandes(ecran: str, lot_id: str | None = None, **modifs) -> LotCommandes:
    return LotCommandes.model_validate({
        "version": 1, "lot_id": lot_id or str(uuid.uuid4()), "ecran": ecran, "origine": "navigateur",
        "commandes": [{"op": "mode", "mode": "3d"}], **modifs,
    })


def compte_rendu(lot_id: str, e: EtatAffichage, ok: bool = True) -> CompteRendu:
    return CompteRendu(version=1, lot_id=lot_id, ok=ok, resultats=[{"index": 0, "ok": ok}], etat=e)


def lot_navigation(utilisateur: str = "u1") -> LotNavigation:
    return LotNavigation.model_validate({
        "version": 1, "lot_id": str(uuid.uuid4()), "tache_id": 7, "utilisateur_id": utilisateur,
        "demande": "montre-moi la lignée du lemme de compacité",
    })


class EcranFactice:
    """Un écran connecté au relais qui exécute chaque lot reçu et rend un compte rendu."""

    def __init__(self, relais: Relais, ecran: str, utilisateur: str = "u1", reponse: bool = True):
        self.relais, self.ecran, self.utilisateur, self.reponse = relais, ecran, utilisateur, reponse
        self.recus: list[LotCommandes] = []
        self.tache: asyncio.Task | None = None

    async def __aenter__(self):
        flux = self.relais.flux_ecran(self.ecran, self.utilisateur)

        async def boucle():
            async for lot in flux:
                self.recus.append(lot)
                if self.reponse:
                    self.relais.recevoir_compte_rendu(self.ecran, self.utilisateur,
                                                      compte_rendu(lot.lot_id, etat(self.ecran, self.utilisateur, strategie="complet")))

        self.tache = asyncio.create_task(boucle())
        await asyncio.sleep(0)  # la connexion est ouverte
        return self

    async def __aexit__(self, *_):
        self.tache.cancel()
        with pytest.raises(asyncio.CancelledError):
            await self.tache


# ── service ──────────────────────────────────────────────────────


async def test_commandes_livrees_dans_l_ordre_avec_compte_rendu():
    r = Relais()
    r.declarer("u1", "ecran_a")
    async with EcranFactice(r, "ecran_a") as ecran:
        lots = [lot_commandes("ecran_a") for _ in range(3)]
        crs = [await r.commander(lot, delai_s=1) for lot in lots]
        assert [cr.ok for cr in crs] == [True, True, True]
        assert [lot.lot_id for lot in ecran.recus] == [lot.lot_id for lot in lots]
    # Le compte rendu met à jour l'état connu de l'écran.
    assert r.etat_utilisateur("u1").strategie == "complet"
    assert not r.attentes


async def test_delai_puis_lot_abandonne():
    r = Relais()
    r.declarer("u1", "ecran_a")
    r.enregistrer_etat("ecran_a", "u1", etat("ecran_a"))
    async with EcranFactice(r, "ecran_a", reponse=False) as ecran:
        lot = lot_commandes("ecran_a")
        cr = await r.commander(lot, delai_s=0.05)
        assert cr.erreur.code == "delai" and not cr.ok
        assert cr.etat.ecran == "ecran_a"  # dernier état connu
        # Un compte rendu tardif n'a plus d'effet ; l'écran a bien reçu le lot pendant l'attente.
        r.recevoir_compte_rendu("ecran_a", "u1", compte_rendu(lot.lot_id, etat("ecran_a")))
        assert [x.lot_id for x in ecran.recus] == [lot.lot_id]


async def test_lot_expire_jamais_livre_plus_tard():
    r = Relais()
    r.declarer("u1", "ecran_a")
    flux = r.flux_ecran("ecran_a", "u1")
    premier = asyncio.ensure_future(anext(flux))
    await asyncio.sleep(0)
    # Le lecteur du flux est bloqué ailleurs : le lot expire avant d'être lu.
    premier.cancel()
    await asyncio.sleep(0)
    lot_expire = lot_commandes("ecran_a")
    r.ecrans["ecran_a"].connexions.add(file := asyncio.Queue())
    assert (await r.commander(lot_expire, delai_s=0.01)).erreur.code == "delai"
    lot_suivant = lot_commandes("ecran_a")
    attente = asyncio.create_task(r.commander(lot_suivant, delai_s=1))
    await asyncio.sleep(0)
    # La file contient les deux lots, mais seul celui encore attendu serait livré.
    assert [x.lot_id for x in file._queue] == [lot_expire.lot_id, lot_suivant.lot_id]
    assert lot_expire.lot_id not in r.attentes and lot_suivant.lot_id in r.attentes
    r.recevoir_compte_rendu("ecran_a", "u1", compte_rendu(lot_suivant.lot_id, etat("ecran_a")))
    assert (await attente).ok


async def test_ecran_inconnu_ou_deconnecte():
    r = Relais()
    assert (await r.commander(lot_commandes("ecran_x"), delai_s=0.01)).erreur.code == "introuvable"
    r.declarer("u1", "ecran_a")
    assert (await r.commander(lot_commandes("ecran_a"), delai_s=0.01)).erreur.code == "delai"


async def test_chaine_intentions_commandes_compte_rendu():
    """Agent moyen 2 → relais → agent navigateur → relais → écran → compte rendu aux deux agents."""
    r = Relais()
    r.declarer("u1", "ecran_a")
    async with EcranFactice(r, "ecran_a") as ecran:
        navigateur = r.flux_navigateur()
        recu = asyncio.ensure_future(anext(navigateur))
        await asyncio.sleep(0)
        intentions = lot_navigation()
        attente = asyncio.create_task(r.transmettre_intentions(intentions, delai_s=1))
        lot_nav = await recu
        assert lot_nav.lot_id == intentions.lot_id
        # L'agent navigateur répond avec le même lot_id.
        cr_commandes = await r.commander(lot_commandes("ecran_a", lot_id=lot_nav.lot_id, tache_id=7), delai_s=1)
        cr_final = await attente
        assert cr_commandes.ok and cr_final.ok and cr_final.lot_id == intentions.lot_id
        assert [x.lot_id for x in ecran.recus] == [intentions.lot_id]
        await navigateur.aclose()


async def test_intentions_echec_direct_et_sans_navigateur():
    r = Relais()
    assert (await r.transmettre_intentions(lot_navigation(), delai_s=0.01)).erreur.code == "introuvable"
    navigateur = r.flux_navigateur()
    recu = asyncio.ensure_future(anext(navigateur))
    await asyncio.sleep(0)
    attente = asyncio.create_task(r.transmettre_intentions(lot_navigation(), delai_s=1))
    lot = await recu
    ambigu = CompteRendu.model_validate({"version": 1, "lot_id": lot.lot_id, "ok": False, "resultats": [],
                                         "erreur": {"code": "ambigu", "message": "Lequel des deux lemmes ?"}})
    r.repondre_intentions(ambigu)
    assert (await attente).erreur.code == "ambigu"
    await navigateur.aclose()


def test_ecran_par_defaut_et_droits():
    r = Relais()
    r.declarer("u1", "ecran_a")
    r.declarer("u1", "ecran_b")
    r.declarer("u2", "ecran_c")
    r.enregistrer_etat("ecran_a", "u1", etat("ecran_a"))
    # ecran_a vient d'envoyer un état : il redevient l'écran actif de u1.
    assert r.etat_utilisateur("u1").ecran == "ecran_a"
    assert r.etat_utilisateur("u2") is None
    with pytest.raises(Exception) as e:
        r.enregistrer_etat("ecran_c", "u1", etat("ecran_c"))
    assert e.value.statut_http == 403
    with pytest.raises(Exception) as e:
        r.declarer("u2", "ecran_a")
    assert e.value.statut_http == 409
    with pytest.raises(Exception) as e:
        r.enregistrer_etat("ecran_a", "u1", etat("ecran_b"))
    assert e.value.statut_http == 422


async def test_ecran_connecte_prefere_et_refus_transmis_a_l_agent_moyen():
    r = Relais()
    r.declarer("u1", "ecran_vivant")
    async with EcranFactice(r, "ecran_vivant"):
        # Un onglet fermé plus récent (état envoyé, plus de flux) ne devient pas l'écran par défaut.
        r.declarer("u1", "ecran_ferme")
        r.enregistrer_etat("ecran_ferme", "u1", etat("ecran_ferme"))
        assert r.ecran_actif("u1").id == "ecran_vivant"
    assert r.ecran_actif("u1").id == "ecran_ferme"  # plus aucun écran connecté : le plus récent
    # Le navigateur vise un écran déconnecté : le refus du relais répond tout de suite à l'agent moyen 2.
    navigateur = r.flux_navigateur()
    recu = asyncio.ensure_future(anext(navigateur))
    await asyncio.sleep(0)
    attente = asyncio.create_task(r.transmettre_intentions(lot_navigation(), delai_s=5))
    lot_nav = await recu
    await r.commander(lot_commandes("ecran_ferme", lot_id=lot_nav.lot_id), delai_s=5)
    cr = await asyncio.wait_for(attente, 0.5)
    assert cr.erreur.code == "delai" and cr.erreur.message == "L'écran n'est pas connecté au relais."
    await navigateur.aclose()


def test_resume_pour_atlas():
    visibles = [{"noeud": f"n{i}", "libelle": f"Nœud {i}", "x": 0, "y": 0} for i in range(20)]
    s = resume(etat("ecran_a", visibles=visibles))
    assert len(s.visibles) == 15 and s.visibles[0].libelle == "Nœud 0"
    assert s.mode == "2d" and s.ecran == "ecran_a"


# ── HTTP ─────────────────────────────────────────────────────────


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(config, "DATABASE_URL", None)
    monkeypatch.setattr(config, "AGENTS_API_KEY", "cle-agents")
    monkeypatch.setattr(config, "SUPABASE_JWT_SECRET", None)
    monkeypatch.setattr(config, "AFFICHAGE_DELAI_S", 0.05)
    with TestClient(app) as c:
        yield c


def test_http_ecran_etat_et_lecture_par_les_agents(client):
    d = client.post("/api/affichage/ecrans", json={"ecran": "ecran_http"})
    assert d.status_code == 201 and d.json() == {"ecran": "ecran_http", "utilisateur_id": "anonyme"}
    assert client.post("/api/affichage/ecrans").json()["ecran"].startswith("ecran_")
    # Le dernier écran déclaré est l'écran actif ; il n'a pas encore d'état.
    assert client.get("/api/affichage/utilisateurs/anonyme/etat", headers=AGENT).status_code == 404
    e = etat("ecran_http", "anonyme").model_dump(mode="json", exclude_unset=True)
    assert client.post("/api/affichage/ecrans/ecran_http/etat", json=e).status_code == 204
    lu = client.get("/api/affichage/utilisateurs/anonyme/etat", headers=AGENT)
    assert lu.status_code == 200 and lu.json() == e
    assert client.get("/api/affichage/utilisateurs/anonyme/etat").status_code == 401


def test_http_messages_invalides_refuses(client):
    client.post("/api/affichage/ecrans", json={"ecran": "ecran_http"})
    r = client.post("/api/affichage/ecrans/ecran_http/etat", json={**ETAT_EXEMPLE, "selection": 3})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "invalide"
    r = client.post("/api/affichage/commandes", headers=AGENT,
                    json={"version": 1, "lot_id": str(uuid.uuid4()), "ecran": "ecran_http", "origine": "navigateur",
                          "commandes": [{"op": "teleporter"}]})
    assert r.status_code == 422
    assert client.post("/api/affichage/ecrans", json={"ecran": "pas un id !"}).status_code == 422


def test_http_commandes_codes(client):
    lot = lot_commandes("ecran_inconnu").model_dump(mode="json", exclude_unset=True)
    assert client.post("/api/affichage/commandes", json=lot).status_code == 401
    r = client.post("/api/affichage/commandes", headers=AGENT, json=lot)
    assert r.status_code == 404 and r.json()["erreur"]["code"] == "introuvable" and "etat" not in r.json()
    client.post("/api/affichage/ecrans", json={"ecran": "ecran_http"})
    r = client.post("/api/affichage/commandes", headers=AGENT, json={**lot, "ecran": "ecran_http"})
    assert r.status_code == 504 and r.json()["erreur"]["code"] == "delai"
    nav = lot_navigation("anonyme").model_dump(mode="json", exclude_unset=True)
    r = client.post("/api/affichage/intentions", headers=AGENT, json=nav)
    assert r.status_code == 404 and r.json()["erreur"]["code"] == "introuvable"
    # Compte rendu d'un lot que personne n'attend.
    r = client.post(f"/api/affichage/intentions/{nav['lot_id']}/compte-rendu", headers=AGENT,
                    json={"version": 1, "lot_id": nav["lot_id"], "ok": False, "resultats": []})
    assert r.status_code == 404


def test_http_droits_entre_utilisateurs(client, monkeypatch):
    client.post("/api/affichage/ecrans", json={"ecran": "ecran_de_u1"})
    # Un autre utilisateur ne voit pas l'écran d'anonyme.
    from app import auth
    monkeypatch.setattr(auth, "utilisateur_depuis_jeton", lambda _jeton: "u2")
    assert client.post("/api/affichage/ecrans/ecran_de_u1/etat",
                       json=etat("ecran_de_u1", "u2").model_dump(mode="json", exclude_unset=True)).status_code == 403
    assert client.get("/api/affichage/ecrans/ecran_de_u1/flux").status_code == 403
    assert client.post("/api/affichage/ecrans", json={"ecran": "ecran_de_u1"}).status_code == 409
