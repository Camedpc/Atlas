"""Traduit une requête « chat completions » (format OpenAI, celui de Gradbot) vers l'API Messages
d'Anthropic via le SDK officiel, et renvoie le flux au format OpenAI.

Particularités de Gradbot gérées ici :
- un message utilisateur vide signifie « un résultat d'outil est disponible » ;
- un même appel d'outil peut recevoir plusieurs résultats (outil différé) : Gradbot réinjecte
  alors plusieurs paires (appel, résultat) avec le même identifiant, que l'API Messages refuse.
"""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from anthropic import AsyncAnthropic

from ..config import ModeleLLM

MARQUEUR_RESULTAT = "(Un résultat d'outil vient d'arriver.)"


def _texte(contenu: Any) -> str:
    if contenu is None:
        return ""
    if isinstance(contenu, str):
        return contenu
    # Contenu en parties : [{"type": "text", "text": "..."}]
    return "".join(p.get("text", "") for p in contenu if isinstance(p, dict))


def convertir_messages(messages: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    systeme: list[str] = []
    sortie: list[dict[str, Any]] = []
    occurrences: dict[str, int] = {}
    alias: dict[str, str] = {}

    def ajouter(role: str, blocs: list[dict[str, Any]]) -> None:
        if not blocs:
            return
        if sortie and sortie[-1]["role"] == role:
            sortie[-1]["content"].extend(blocs)
        else:
            sortie.append({"role": role, "content": list(blocs)})

    for msg in messages:
        role = msg.get("role")
        if role in ("system", "developer"):
            systeme.append(_texte(msg.get("content")))
        elif role == "user":
            texte = _texte(msg.get("content"))
            if texte.strip():
                ajouter("user", [{"type": "text", "text": texte}])
            elif not (sortie and sortie[-1]["role"] == "user"):
                # Message vide de Gradbot sans résultat d'outil juste avant.
                ajouter("user", [{"type": "text", "text": MARQUEUR_RESULTAT}])
        elif role == "assistant":
            blocs: list[dict[str, Any]] = []
            texte = _texte(msg.get("content"))
            if texte.strip():
                blocs.append({"type": "text", "text": texte})
            for appel in msg.get("tool_calls") or []:
                id_origine = appel["id"]
                occurrences[id_origine] = occurrences.get(id_origine, 0) + 1
                n = occurrences[id_origine]
                id_unique = id_origine if n == 1 else f"{id_origine}_{n}"
                alias[id_origine] = id_unique
                fonction = appel.get("function", {})
                try:
                    entree = json.loads(fonction.get("arguments") or "{}")
                except json.JSONDecodeError:
                    entree = {}
                blocs.append({"type": "tool_use", "id": id_unique, "name": fonction.get("name", ""),
                              "input": entree if isinstance(entree, dict) else {}})
            ajouter("assistant", blocs)
        elif role == "tool":
            id_origine = msg.get("tool_call_id", "")
            ajouter("user", [{"type": "tool_result", "tool_use_id": alias.get(id_origine, id_origine),
                              "content": _texte(msg.get("content")) or "(vide)"}])

    # Les résultats d'outil doivent ouvrir le message utilisateur qui suit l'appel.
    for msg in sortie:
        if msg["role"] == "user":
            msg["content"].sort(key=lambda b: 0 if b["type"] == "tool_result" else 1)
    if not sortie or sortie[0]["role"] != "user":
        sortie.insert(0, {"role": "user", "content": [{"type": "text", "text": "[start]"}]})
    return "\n\n".join(s for s in systeme if s), sortie


def convertir_outils(outils: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    res = []
    for outil in outils or []:
        f = outil.get("function", outil)
        res.append({
            "name": f["name"],
            "description": f.get("description", ""),
            "input_schema": f.get("parameters") or {"type": "object", "properties": {}},
        })
    return res


FIN = {"tool_use": "tool_calls", "end_turn": "stop", "max_tokens": "length", "stop_sequence": "stop"}


def _morceau(ident: str, modele: str, delta: dict[str, Any], fin: str | None = None) -> str:
    charge = {
        "id": ident,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": modele,
        "choices": [{"index": 0, "delta": delta, "finish_reason": fin}],
    }
    return f"data: {json.dumps(charge, ensure_ascii=False)}\n\n"


async def flux_anthropic(modele: ModeleLLM, corps: dict[str, Any], max_tokens: int) -> AsyncIterator[str]:
    """Produit des lignes SSE au format OpenAI. La première ligne n'arrive qu'avec le premier token."""
    client = AsyncAnthropic(api_key=modele.cle, base_url=modele.base_url, max_retries=0)
    systeme, messages = convertir_messages(corps.get("messages", []))
    params: dict[str, Any] = {
        "model": modele.modele,
        "max_tokens": corps.get("max_completion_tokens") or corps.get("max_tokens") or max_tokens,
        "messages": messages,
        **modele.extra,
    }
    if systeme:
        params["system"] = systeme
    outils = convertir_outils(corps.get("tools"))
    if outils:
        params["tools"] = outils
    if corps.get("temperature") is not None:
        params["temperature"] = corps["temperature"]

    ident = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    usage = {"prompt_tokens": 0, "completion_tokens": 0}
    role_envoye = False
    index_outil: dict[int, int] = {}  # index de bloc Anthropic -> index d'appel OpenAI

    def delta(d: dict[str, Any]) -> dict[str, Any]:
        nonlocal role_envoye
        if not role_envoye:
            role_envoye = True
            return {"role": "assistant", **d}
        return d

    flux = await client.messages.create(**params, stream=True)
    async for evt in flux:
        if evt.type == "message_start":
            usage["prompt_tokens"] = evt.message.usage.input_tokens
        elif evt.type == "content_block_start" and evt.content_block.type == "tool_use":
            index_outil[evt.index] = len(index_outil)
            yield _morceau(ident, modele.modele, delta({"tool_calls": [{
                "index": index_outil[evt.index], "id": evt.content_block.id, "type": "function",
                "function": {"name": evt.content_block.name, "arguments": ""}}]}))
        elif evt.type == "content_block_delta":
            if evt.delta.type == "text_delta" and evt.delta.text:
                yield _morceau(ident, modele.modele, delta({"content": evt.delta.text}))
            elif evt.delta.type == "input_json_delta" and evt.index in index_outil:
                yield _morceau(ident, modele.modele, delta({"tool_calls": [{
                    "index": index_outil[evt.index], "function": {"arguments": evt.delta.partial_json}}]}))
        elif evt.type == "message_delta":
            usage["completion_tokens"] = evt.usage.output_tokens
            if evt.delta.stop_reason:
                yield _morceau(ident, modele.modele, delta({}), FIN.get(evt.delta.stop_reason, "stop"))
    if (corps.get("stream_options") or {}).get("include_usage"):
        # Comme l'API OpenAI : un dernier morceau sans choix, avec la consommation.
        charge = {"id": ident, "object": "chat.completion.chunk", "created": int(time.time()),
                  "model": modele.modele, "choices": [], "usage": usage}
        yield f"data: {json.dumps(charge)}\n\n"
    yield "data: [DONE]\n\n"
