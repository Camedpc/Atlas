import asyncio
import json
from datetime import datetime

import pytest
import tomllib
from openai_codex import Sandbox

from atlas import ecriture, lecture
from atlas.modeles import Demonstration, LigneNoeud
from atlas.orchestrateur import agent, bunker, config, sous_agents, verificateur
from atlas.orchestrateur.consignes import DOSSIER_PROMPTS, consigne_complete
from atlas.orchestrateur.verificateur import Verdict

MAINTENANT = datetime(2026, 9, 26)


def _noeud(id: str) -> LigneNoeud:
    return LigneNoeud(
        projet_id="p1",
        id=id,
        nom=id.upper(),
        enonce=f"Énoncé de {id}",
        admis=False,
        cree_le=MAINTENANT,
        modifie_le=MAINTENANT,
    )


def _demo(noeud_id: str, premisses: list[str], validite: str = "a_verifier") -> Demonstration:
    return Demonstration(
        projet_id="p1",
        noeud_id=noeud_id,
        nom_demonstration="Directe",
        justifie_par=premisses,
        demonstration="Argument",
        validite=validite,
        auteur="ia",
        cree_le=MAINTENANT,
        modifie_le=MAINTENANT,
    )


# ── Rôles ────────────────────────────────────────────────────────────────────


def test_chaque_agent_a_son_prompt():
    for nom in ["orchestrateur", "verificateur", *(r.nom for r in sous_agents.ROLES)]:
        assert (DOSSIER_PROMPTS / f"{nom}.md").exists(), nom


def test_toml_role_se_relit_a_l_identique():
    consignes = 'Guillemets " et \\ et accents é\net `code` ```bloc```'
    lu = tomllib.loads(sous_agents.toml_role("gpt-6-sol", "high", consignes, {"web_search": "disabled"}))
    assert lu == {
        "model": "gpt-6-sol",
        "model_reasoning_effort": "high",
        "developer_instructions": consignes,
        "web_search": "disabled",
    }


def test_sous_agents_ecrit_les_couches_et_suit_l_environnement(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "CODEX_HOME", tmp_path)
    monkeypatch.setenv("ATLAS_MODELE_GRAPHISTE", "gpt-6-luna")
    agents = sous_agents.sous_agents()
    graphiste = tomllib.loads((tmp_path / "roles" / "graphiste.toml").read_text(encoding="utf-8"))
    assert agents["graphiste"]["config_file"] == str(tmp_path / "roles" / "graphiste.toml")
    assert graphiste["model"] == "gpt-6-luna"
    assert graphiste["developer_instructions"] == consigne_complete("graphiste")
    assert (
        tomllib.loads((tmp_path / "roles" / "directeur_de_labo.toml").read_text(encoding="utf-8"))["model"]
        == "gpt-6-astra"
    )


# ── Vérificateur ─────────────────────────────────────────────────────────────


def test_demande_contient_noeud_premisses_et_demonstration():
    texte = verificateur.demande(_demo("thm", ["lemme", "absent"]), {"thm": _noeud("thm"), "lemme": _noeud("lemme")})
    assert "Énoncé de thm" in texte and "Énoncé de lemme" in texte
    assert "absent" in texte and "introuvable" in texte
    assert "Argument" in texte


def test_lire_verdict_borne_la_confiance_et_refuse_l_illisible():
    verdict = verificateur.lire_verdict(
        json.dumps({"validite": "valide", "confiance": 1.4, "justification": " ok "}), "m"
    )
    assert verdict == Verdict("valide", 1.0, "ok", "m")
    with pytest.raises(ValueError):
        verificateur.lire_verdict(json.dumps({"validite": "peut-etre", "confiance": 0.5, "justification": ""}), "m")


def test_a_rejuger():
    assert verificateur.a_rejuger(Verdict("invalide", 0.99, "", "m"), 0.8)
    assert verificateur.a_rejuger(Verdict("valide", 0.5, "", "m"), 0.8)
    assert not verificateur.a_rejuger(Verdict("valide", 0.9, "", "m"), 0.8)


def test_a_verifier_filtre_par_validite_et_par_noeud():
    demos = [_demo("a", []), _demo("b", []), _demo("c", [], "valide")]
    assert [d.noeud_id for d in verificateur.a_verifier(demos, [])] == ["a", "b"]
    assert [d.noeud_id for d in verificateur.a_verifier(demos, ["b", "c"])] == ["b"]


class _FauxCodex:
    def __init__(self, **_):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None


def test_verifier_rejuge_les_cas_douteux_et_isole_les_erreurs(monkeypatch):
    monkeypatch.setattr(
        lecture, "lister_demonstrations", lambda _projet: [_demo("sur", []), _demo("douteux", []), _demo("casse", [])]
    )
    monkeypatch.setattr(lecture, "lister_noeuds", lambda _projet: [_noeud("sur"), _noeud("douteux"), _noeud("casse")])
    monkeypatch.setattr(verificateur, "AsyncCodex", _FauxCodex)

    async def connecter(_):
        return None

    monkeypatch.setattr(agent, "_connecter", connecter)
    appels: list[tuple[str, str]] = []

    async def juger(_codex, texte, modele, _effort):
        noeud = texte.split("—")[0].split(":")[1].strip()
        appels.append((noeud, modele))
        if noeud == "casse":
            raise RuntimeError("panne")
        confiance = 0.5 if noeud == "douteux" and modele == "gpt-6-luna" else 0.95
        return Verdict("valide", confiance, "ok", modele)

    monkeypatch.setattr(verificateur, "juger", juger)
    notes: list[dict] = []
    monkeypatch.setattr(ecriture, "noter_demonstration", lambda **champs: notes.append(champs))

    resultats = {r["noeud_id"]: r for r in asyncio.run(verificateur.verifier("p1", []))}

    assert resultats["sur"]["modele"] == "gpt-6-luna"
    assert resultats["douteux"]["modele"] == "gpt-6-sol"
    assert resultats["casse"]["erreur"] == "panne"
    assert ("douteux", "gpt-6-sol") in appels and ("sur", "gpt-6-sol") not in appels
    assert sorted(n["noeud_id"] for n in notes) == ["douteux", "sur"]
    assert all(n["auteur"] == "verificateur" and n["projet_id"] == "p1" for n in notes)


# ── Bunker ───────────────────────────────────────────────────────────────────


def _espace(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "ESPACE_TRAVAIL", tmp_path)
    monkeypatch.setattr(config, "CODEX_HOME", tmp_path / ".codex")
    monkeypatch.setattr(config, "BUNKER", True)


def test_profil_du_bunker(monkeypatch, tmp_path):
    _espace(monkeypatch, tmp_path)
    session = bunker.dossier_session("c1")
    assert session == tmp_path / "utilisateurs" / "camille" / "defaut" / "sessions" / "c1"
    profil = bunker.permissions_session(session, windows=False)
    assert profil["default_permissions"] == "bunker"
    assert "windows" not in profil
    assert profil["permissions"]["bunker"]["filesystem"] == {
        ":root": "read",  # la lecture n'est pas restreinte : c'est la consigne qui confine
        str(session): "write",
        str(session.parent.parent / "doc_projet"): "write",  # livrables du projet, rangés par sujet
        str(session.parent.parent / "scripts_projet"): "write",
        str(tmp_path / "partage"): "write",
    }
    assert profil["permissions"]["bunker"]["network"] == {"enabled": True}
    assert bunker.permissions_session(session, windows=True)["windows"] == {"sandbox": "unelevated"}


def test_environnement_shell_sans_secrets_et_avec_python_partage(monkeypatch, tmp_path):
    _espace(monkeypatch, tmp_path)
    env = bunker.environnement_shell(bunker.dossier_session("c1"))
    assert env["inherit"] == "core"
    assert env["set"]["PATH"].startswith(str(bunker.binaires_python()))
    assert env["set"]["TMPDIR"] == str(bunker.dossier_session("c1") / ".tmp")


def test_surcharges_en_bunker_sans_mode_de_sandbox(monkeypatch, tmp_path):
    _espace(monkeypatch, tmp_path)
    parametres = agent.parametres_thread(tmp_path, "c1")
    assert "sandbox" not in parametres  # un profil de permissions ne se combine pas avec sandbox_mode
    assert parametres["config"]["default_permissions"] == "bunker"
    assert "# Ton environnement" in parametres["developer_instructions"]
    directeur = tomllib.loads((tmp_path / ".codex" / "roles" / "directeur_de_labo.toml").read_text(encoding="utf-8"))
    assert "# Ton environnement" in directeur["developer_instructions"]


def test_sans_bunker_acces_complet(monkeypatch, tmp_path):
    _espace(monkeypatch, tmp_path)
    monkeypatch.setattr(config, "BUNKER", False)
    parametres = agent.parametres_thread(tmp_path, "c1")
    assert parametres["sandbox"] == Sandbox.full_access
    assert "default_permissions" not in parametres["config"]
    # Sans sandbox, l'environnement des commandes et la consigne de confinement restent.
    assert parametres["config"]["shell_environment_policy"]["inherit"] == "core"
    assert "# Confinement" in parametres["developer_instructions"]


def test_preparer_session_cree_l_arborescence_et_reprend_l_ancien_dossier(monkeypatch, tmp_path):
    _espace(monkeypatch, tmp_path)
    (tmp_path / "partage" / "python").mkdir(parents=True)  # évite de créer un vrai venv
    (tmp_path / "c1").mkdir()
    (tmp_path / "c1" / "notes.md").write_text("ancien")
    session = bunker.preparer_session("c1")
    assert (session / "notes.md").read_text() == "ancien" and not (tmp_path / "c1").exists()
    for nom in bunker.SOUS_DOSSIERS_SESSION:
        assert (session / nom).is_dir()
    for nom in ("doc_projet", "scripts_projet"):
        assert (bunker.dossier_projet() / nom).is_dir()


def test_conversation_markdown():
    from atlas.modeles import Message
    from atlas.orchestrateur.pipeline import conversation_markdown

    def message(role, contenu):
        return Message(
            id=1, conversation_id="c1", execution_id=None, role=role, contenu=contenu, donnees=None, cree_le=MAINTENANT
        )

    texte = conversation_markdown(
        [
            message("utilisateur", "Question ?"),
            message("outil", "atlas.lire_graphe\nx"),
            message("assistant", "Réponse."),
        ]
    )
    assert "## Utilisateur — 2026-09-26 00:00\n\nQuestion ?" in texte
    assert "> outil (2026-09-26 00:00) : atlas.lire_graphe\n" in texte
    assert "## Orchestrateur" in texte and "Réponse." in texte
