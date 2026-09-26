"""Mesures en mémoire pour le tableau de bord (section 6.4) : latence par étape,
TTFT et bascules du modèle, appels d'outils, interruptions, faux réveils."""

from __future__ import annotations

import statistics
import threading
from collections import Counter, deque
from typing import Any

TAILLE_FENETRE = 2000


def _quantiles(valeurs: list[float]) -> dict[str, float | int | None]:
    if not valeurs:
        return {"n": 0, "p50": None, "p95": None}
    valeurs = sorted(valeurs)
    p95 = valeurs[min(len(valeurs) - 1, round(0.95 * (len(valeurs) - 1)))]
    return {"n": len(valeurs), "p50": round(statistics.median(valeurs) * 1000), "p95": round(p95 * 1000)}


class Metriques:
    def __init__(self) -> None:
        self._verrou = threading.Lock()
        self.tours: deque[dict[str, float]] = deque(maxlen=TAILLE_FENETRE)
        self.llm: deque[dict[str, Any]] = deque(maxlen=TAILLE_FENETRE)
        self.outils: Counter[str] = Counter()
        self.outils_erreurs: Counter[str] = Counter()
        self.reveils = Counter()
        self.interruptions = 0
        self.sessions = 0

    def enregistrer_tour(self, etapes: dict[str, float]) -> None:
        with self._verrou:
            self.tours.append(etapes)

    def enregistrer_llm(self, modele: str, ttft: float | None, secours: bool = False,
                        echec: str | None = None) -> None:
        with self._verrou:
            self.llm.append({"modele": modele, "ttft": ttft, "secours": secours, "echec": echec})

    def enregistrer_outil(self, nom: str, ok: bool) -> None:
        with self._verrou:
            self.outils[nom] += 1
            if not ok:
                self.outils_erreurs[nom] += 1

    def enregistrer_reveil(self, faux: bool) -> None:
        with self._verrou:
            self.reveils["faux" if faux else "vrais"] += 1

    def enregistrer_interruption(self) -> None:
        with self._verrou:
            self.interruptions += 1

    def nouvelle_session(self) -> None:
        with self._verrou:
            self.sessions += 1

    def resume(self) -> dict[str, Any]:
        with self._verrou:
            tours = list(self.tours)
            llm = list(self.llm)
            etapes = {nom: _quantiles([t[nom] for t in tours if nom in t])
                      for nom in ("fin_de_tour", "premier_token", "premier_audio", "total")}
            par_modele: dict[str, Any] = {}
            for modele in sorted({e["modele"] for e in llm}):
                appels = [e for e in llm if e["modele"] == modele]
                par_modele[modele] = {
                    "ttft": _quantiles([e["ttft"] for e in appels if e["ttft"] is not None]),
                    "echecs": sum(1 for e in appels if e["echec"]),
                    "comme_secours": sum(1 for e in appels if e["secours"]),
                }
            total_outils = sum(self.outils.values())
            return {
                "sessions": self.sessions,
                "latence_ms": etapes,
                "llm": par_modele,
                "outils": dict(self.outils),
                "taux_erreur_outils": (sum(self.outils_erreurs.values()) / total_outils) if total_outils else None,
                "interruptions": self.interruptions,
                "reveils": dict(self.reveils),
            }


metriques = Metriques()
