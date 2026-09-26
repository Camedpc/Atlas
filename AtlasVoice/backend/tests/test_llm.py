import asyncio
import json

import pytest

from app import config
from app.config import ModeleLLM
from app.llm import proxy
from app.llm.anthropic_adapter import MARQUEUR_RESULTAT, convertir_messages, convertir_outils


def appel(id_, nom="lancer_tache", args='{"titre": "x"}'):
    return {"role": "assistant", "tool_calls": [{"id": id_, "type": "function",
                                                  "function": {"name": nom, "arguments": args}}]}


def resultat(id_, contenu):
    return {"role": "tool", "tool_call_id": id_, "content": contenu}


def test_messages_systeme_et_outil_differe():
    """Gradbot réinjecte plusieurs résultats pour un même appel : identifiants rendus uniques."""
    systeme, messages = convertir_messages([
        {"role": "system", "content": "Tu es Atlas."},
        {"role": "user", "content": "[start]"},
        {"role": "user", "content": "résume ce graphe"},
        {"role": "assistant", "content": "D'accord, je lance l'explorateur."},
        appel("c1"), resultat("c1", '{"statut": "en_attente"}'),
        {"role": "user", "content": ""},
        {"role": "assistant", "content": "C'est lancé."},
        appel("c1"), resultat("c1", '{"statut": "terminee"}'),
        {"role": "user", "content": ""},
    ])
    assert systeme == "Tu es Atlas."
    assert [m["role"] for m in messages] == ["user", "assistant", "user", "assistant", "user"]
    ids_appels = [b["id"] for m in messages for b in m["content"] if b["type"] == "tool_use"]
    ids_resultats = [b["tool_use_id"] for m in messages for b in m["content"] if b["type"] == "tool_result"]
    assert ids_appels == ["c1", "c1_2"]
    assert ids_resultats == ids_appels
    # Le message vide qui suit un résultat d'outil disparaît (le résultat suffit).
    assert all(b.get("text") != "" for m in messages for b in m["content"])


def test_resultat_en_tete_du_message_utilisateur():
    _, messages = convertir_messages([
        {"role": "user", "content": "salut"},
        appel("c1"), resultat("c1", "ok"),
        {"role": "user", "content": "et alors ?"},
    ])
    assert messages[-1]["content"][0]["type"] == "tool_result"
    assert messages[-1]["content"][1]["text"] == "et alors ?"


def test_message_vide_seul():
    _, messages = convertir_messages([
        {"role": "user", "content": "salut"},
        {"role": "assistant", "content": "Bonjour."},
        {"role": "user", "content": ""},
    ])
    assert messages[-1]["content"][0]["text"] == MARQUEUR_RESULTAT


def test_outils():
    assert convertir_outils([{"type": "function", "function": {
        "name": "etat_taches", "description": "d", "parameters": {"type": "object", "properties": {}}}}]) == [
        {"name": "etat_taches", "description": "d", "input_schema": {"type": "object", "properties": {}}}]


def test_ligne_utile():
    role = 'data: {"choices":[{"delta":{"role":"assistant"}}]}'
    texte = 'data: {"choices":[{"delta":{"content":"Bon"}}]}'
    assert not proxy._utile(role)
    assert proxy._utile(texte)
    assert proxy._utile("data: [DONE]")


def _flux_factice(morceaux, attente=0.0, erreur=None):
    async def gen():
        if attente:
            await asyncio.sleep(attente)
        if erreur:
            raise erreur
        for m in morceaux:
            yield m

    return gen()


@pytest.fixture
def deux_modeles(monkeypatch):
    principal = ModeleLLM("openai", "rapide")
    secours = ModeleLLM("openai", "secours")
    monkeypatch.setattr(config, "LLM_PRINCIPAL", principal)
    monkeypatch.setattr(config, "LLM_SECOURS", secours)
    monkeypatch.setattr(config, "LLM_DELAI_BASCULE_S", 0.05)
    return principal, secours


async def test_bascule_si_trop_lent(monkeypatch, deux_modeles):
    principal, _ = deux_modeles

    def faux(modele, corps):
        if modele is principal:
            return _flux_factice(["data: lent\n\n"], attente=1)
        return _flux_factice(["data: secours\n\n", "data: [DONE]\n\n"])

    monkeypatch.setattr(proxy, "_flux", faux)
    assert [m async for m in proxy.completer({})] == ["data: secours\n\n", "data: [DONE]\n\n"]


async def test_bascule_si_erreur(monkeypatch, deux_modeles):
    principal, _ = deux_modeles

    def faux(modele, corps):
        if modele is principal:
            return _flux_factice([], erreur=proxy.ErreurLLM("HTTP 500"))
        return _flux_factice(["data: secours\n\n"])

    monkeypatch.setattr(proxy, "_flux", faux)
    assert [m async for m in proxy.completer({})] == ["data: secours\n\n"]


async def test_principal_rapide(monkeypatch, deux_modeles):
    monkeypatch.setattr(proxy, "_flux", lambda m, c: _flux_factice([f"data: {m.modele}\n\n"]))
    assert [m async for m in proxy.completer({})] == ["data: rapide\n\n"]


async def test_tout_en_panne(monkeypatch, deux_modeles):
    monkeypatch.setattr(proxy, "_flux", lambda m, c: _flux_factice([], erreur=RuntimeError("panne")))
    with pytest.raises(proxy.ErreurLLM):
        [m async for m in proxy.completer({})]


def test_morceau_openai_valide():
    from app.llm.anthropic_adapter import _morceau

    ligne = _morceau("id", "m", {"content": "Bonjour"}, None)
    charge = json.loads(ligne.removeprefix("data: "))
    assert charge["choices"][0]["delta"]["content"] == "Bonjour"
