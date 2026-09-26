"""Essai de bout en bout sans micro : un faux navigateur parle au serveur avec des phrases synthétisées par
Gradium (voix de Jules), envoyées en temps réel, et simule la lecture de la réponse.

    ../.venv/Scripts/python -m uvicorn voix.serveur:app --port 8010     (dans un autre terminal)
    ../.venv/Scripts/python -m essais.bout_en_bout [scenario…]

Scénarios : bonjour, commande, coupure, consignes, marmonne, tache. Les réponses de l'agent sont enregistrées
dans essais/sorties/reponse_<scenario>.wav.
"""

import asyncio
import json
import re
import struct
import sys
import time
from pathlib import Path

import websockets

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from voix import gradium  # noqa: E402

from essais import audio  # noqa: E402

SORTIE = Path(__file__).resolve().parent / "sorties"
VOIX_CAMILLE = "YKeBw3OV1RgpdhLh"  # Jules
TRAME = 3840  # 80 ms à 24 kHz


async def phrase(texte: str, marmonnee: bool = False) -> bytes:
    nom = "".join(c for c in texte.lower() if c.isalnum())[:40]
    chemin = SORTIE / f"camille_{nom}.wav"
    if not chemin.exists():
        audio.ecrire_wav(chemin, audio.de48a24(await gradium.synthetiser(texte, VOIX_CAMILLE)), 24000)
    pcm, _ = audio.lire_wav(chemin)
    return audio.marmonner(pcm, gain=0.35, bruit=250) if marmonnee else pcm


class FauxNavigateur:
    def __init__(self, url: str = "ws://127.0.0.1:8010/ws"):
        self.url = url
        self.ws = None
        self.a_dire: asyncio.Queue[bytes] = asyncio.Queue()
        self.evenements: list[tuple[float, dict]] = []
        self.gen = 0
        self.audio_recu: dict[int, bytearray] = {}
        self.debut_lecture: dict[int, float] = {}
        self.t0 = time.perf_counter()
        self.en_train_de_parler = False
        self.fin_parole = 0.0
        self.latences: list[tuple[float, float]] = []
        self._premier_son_attendu = False
        self._transcrit_a = 0.0

    def t(self) -> float:
        return time.perf_counter() - self.t0

    async def connecter(self) -> None:
        self.ws = await websockets.connect(self.url, max_size=None)
        self._taches = [
            asyncio.create_task(self._micro()),
            asyncio.create_task(self._recevoir()),
            asyncio.create_task(self._lecture()),
        ]

    async def fermer(self) -> None:
        for t in self._taches:
            t.cancel()
        await self.ws.close()

    async def _micro(self) -> None:
        """Flux continu à 80 ms : la phrase en cours, sinon du silence (comme un vrai micro)."""
        suivant = time.perf_counter()
        courant = b""
        while True:
            if not courant and not self.a_dire.empty():
                courant = self.a_dire.get_nowait()
                self.en_train_de_parler = True
            if courant:
                trame, courant = courant[:TRAME], courant[TRAME:]
                trame = trame.ljust(TRAME, b"\0")
                if not courant:
                    self.en_train_de_parler = False
                    self.fin_parole = time.perf_counter()
                    self._premier_son_attendu = True
            else:
                trame = bytes(TRAME)
            await self.ws.send(trame)
            suivant += 0.08
            await asyncio.sleep(max(0, suivant - time.perf_counter()))

    async def _recevoir(self) -> None:
        async for brut in self.ws:
            if isinstance(brut, bytes):
                gen = struct.unpack("<I", brut[:4])[0]
                if gen < self.gen:
                    continue
                self.gen = gen
                if self._premier_son_attendu and self._transcrit_a:
                    self._premier_son_attendu = False
                    total = time.perf_counter() - self.fin_parole
                    self.latences.append((self._transcrit_a - self.fin_parole, total))
                    texte = self._transcrit_a - self.fin_parole
                    print(f"  {self.t():6.1f}s  LATENCE  fin de parole → texte {texte:.2f} s,"
                          f" → premier son {total:.2f} s")
                if gen not in self.audio_recu:
                    self.audio_recu[gen] = bytearray()
                    self.debut_lecture[gen] = time.perf_counter()
                self.audio_recu[gen] += brut[4:]
            else:
                message = json.loads(brut)
                self.evenements.append((self.t(), message))
                if message["type"] == "utilisateur":
                    self._transcrit_a = time.perf_counter()
                if message["type"] == "couper":
                    self.gen = message["gen"]
                self._afficher(message)

    def _afficher(self, m: dict) -> None:
        match m["type"]:
            case "utilisateur":
                print(f"  {self.t():6.1f}s  CAMILLE  {m['texte']}")
            case "agent_fin":
                print(f"  {self.t():6.1f}s  ATLAS    {m['texte']}")
            case "outil":
                print(f"  {self.t():6.1f}s  outil    {'fin ' if m['fini'] else ''}{m['description'][:90]}")
            case "couper":
                print(f"  {self.t():6.1f}s  >>> COUPURE")
            case "mesure":
                print(f"  {self.t():6.1f}s  mesure   {m['nom']} = {m['ms']} ms")
            case "taches":
                for t in m["taches"]:
                    etape = t["etapes"][-1][:80] if t["etapes"] else ""
                    print(f"  {self.t():6.1f}s  tâche    #{t['id']} {t['statut']} {etape}")
            case "info" | "erreur":
                print(f"  {self.t():6.1f}s  {m['type']:<8} {m['message'][:120]}")

    async def _lecture(self) -> None:
        """Simule le lecteur : joue en temps réel ce qui est reçu, et le rapporte au serveur comme le navigateur."""
        fini_signale: set[int] = set()
        while True:
            await asyncio.sleep(0.2)
            gen = self.gen
            if gen not in self.audio_recu:
                continue
            duree = len(self.audio_recu[gen]) / 96000
            joue = min(duree, time.perf_counter() - self.debut_lecture[gen])
            fini = joue >= duree
            if fini and gen in fini_signale:
                continue
            if fini:
                fini_signale.add(gen)
            else:
                fini_signale.discard(gen)
            await self.ws.send(json.dumps({"type": "lecture", "gen": gen, "joue_s": joue, "fini": fini}))

    async def envoyer(self, message: dict) -> None:
        await self.ws.send(json.dumps(message))

    async def dire(self, pcm: bytes) -> None:
        await self.a_dire.put(pcm)
        await asyncio.sleep(0.1)
        while self.en_train_de_parler or not self.a_dire.empty():
            await asyncio.sleep(0.05)

    def depuis(self, instant: float, type_: str) -> list[dict]:
        return [m for t, m in self.evenements if t >= instant and m["type"] == type_]

    async def attendre(self, type_: str, depuis: float, delai: float = 60, condition=lambda m: True) -> dict | None:
        fin = time.perf_counter() + delai
        while time.perf_counter() < fin:
            for m in self.depuis(depuis, type_):
                if condition(m):
                    return m
            await asyncio.sleep(0.1)
        return None

    async def attendre_silence(self, depuis: float, delai: float = 90) -> None:
        """Attend que l'agent ait fini : serveur revenu « à l'écoute » et plus rien à jouer, pendant 0,8 s."""
        await self.attendre("fin_tour", depuis, delai)
        fin = time.perf_counter() + delai
        calme_depuis = None
        while time.perf_counter() < fin:
            etats = [m["etat"] for _, m in self.evenements if m["type"] == "etat"]
            gen = self.gen
            joue = gen not in self.audio_recu or (
                time.perf_counter() - self.debut_lecture[gen] >= len(self.audio_recu[gen]) / 96000 + 0.2
            )
            if etats and etats[-1] == "ecoute" and joue:
                calme_depuis = calme_depuis or time.perf_counter()
                if time.perf_counter() - calme_depuis > 0.8:
                    return
            else:
                calme_depuis = None
            await asyncio.sleep(0.1)

    def enregistrer(self, nom: str, gen: int) -> None:
        if gen in self.audio_recu:
            audio.ecrire_wav(SORTIE / f"reponse_{nom}.wav", bytes(self.audio_recu[gen]), 48000)


def verifier(condition: bool, message: str) -> bool:
    print(f"  {'OK   ' if condition else 'ÉCHEC'} {message}")
    return condition


async def scenario_bonjour(nav: FauxNavigateur) -> bool:
    t = nav.t()
    await nav.dire(await phrase("Salut Atlas, tu m'entends bien ?"))
    await nav.attendre_silence(t)
    nav.enregistrer("bonjour", nav.gen)
    mesures = {m["nom"]: m["ms"] for m in nav.depuis(t, "mesure")}
    return all([
        verifier(bool(nav.depuis(t, "utilisateur")), "tour détecté et transcrit"),
        verifier(bool(nav.depuis(t, "agent_fin")), "réponse de l'agent"),
        verifier("premier_son" in mesures, f"audio reçu (latences : {mesures})"),
    ])


async def scenario_commande(nav: FauxNavigateur) -> bool:
    t = nav.t()
    await nav.dire(await phrase("Combien il y a de fichiers Python dans le dossier voix-live, en tout ?"))
    await nav.attendre_silence(t, 120)
    nav.enregistrer("commande", nav.gen)
    return all([
        verifier(bool(nav.depuis(t, "outil")), "l'agent a lancé une commande"),
        verifier(bool(nav.depuis(t, "agent_fin")), "réponse après la commande"),
    ])


async def scenario_coupure(nav: FauxNavigateur) -> bool:
    t = nav.t()
    await nav.dire(await phrase("Raconte-moi en détail l'histoire de la tour Eiffel, depuis sa construction."))
    gen_avant = nav.gen
    premier = await nav.attendre("mesure", t, 60, lambda m: m["nom"] == "premier_son")
    if not verifier(premier is not None, "l'agent commence à parler"):
        return False
    await asyncio.sleep(3.0)  # Camille écoute 3 s, puis coupe
    t_coupe = nav.t()
    nav.enregistrer("coupure_avant", nav.gen)
    await nav.dire(await phrase("Stop, stop. Donne-moi juste sa hauteur, en une phrase."))
    coupure = await nav.attendre("couper", t_coupe, 5)
    delai = coupure and next(tc for tc, m in nav.evenements if m is coupure) - t_coupe
    await nav.attendre_silence(t_coupe)
    nav.enregistrer("coupure_apres", nav.gen)
    reponses = nav.depuis(t_coupe, "agent_fin")
    derniere = reponses[-1]["texte"] if reponses else ""
    return all([
        verifier(coupure is not None, f"voix coupée {delai and round(delai * 1000)} ms après le début de la parole"),
        verifier(nav.gen > gen_avant, "nouvelle génération audio"),
        verifier("mètres" in derniere, f"répond à la nouvelle question : {derniere}"),
    ])


async def scenario_consignes(nav: FauxNavigateur) -> bool:
    t = nav.t()
    await nav.envoyer({"type": "consignes", "texte": "Commence toujours tes réponses par le mot « Chef »."})
    await asyncio.sleep(0.3)
    await nav.dire(await phrase("Quelle heure il est à peu près, d'après la machine ?"))
    await nav.attendre_silence(t, 90)
    reponses = [m["texte"] for m in nav.depuis(t, "agent_fin")]
    return verifier(any(r.strip().lower().startswith("chef") for r in reponses), f"consigne appliquée : {reponses}")


async def scenario_marmonne(nav: FauxNavigateur) -> bool:
    t = nav.t()
    await nav.dire(await phrase("Euh, tu peux me dire combien de commits il y a sur la branche main ?", marmonnee=True))
    await nav.attendre_silence(t, 120)
    transcrit = [m["texte"] for m in nav.depuis(t, "utilisateur")]
    compris = [m["description"] for m in nav.depuis(t, "outil")] + [m["texte"] for m in nav.depuis(t, "agent_fin")]
    print(f"  (transcription brute : {transcrit})")
    return verifier(any("commit" in x.lower() or "rev-list" in x for x in compris), f"demande comprise : {compris}")


async def scenario_tache(nav: FauxNavigateur) -> bool:
    t = nav.t()
    await nav.dire(await phrase(
        "Lance un sous-agent en arrière-plan qui compte les lignes de code Python du dossier atlas"
        " et me donne le total."
    ))
    lancee = await nav.attendre("taches", t, 90)
    await nav.attendre_silence(t, 90)
    # Pendant que la tâche tourne, la conversation continue.
    t2 = nav.t()
    await nav.dire(await phrase("En attendant, c'est quoi la capitale de l'Australie ?"))
    await nav.attendre_silence(t2, 60)
    parle_pendant = bool(nav.depuis(t2, "agent_fin"))
    finie = await nav.attendre("taches", t, 300, lambda m: any(x["statut"] != "en_cours" for x in m["taches"]))
    t3 = nav.t()
    annonce = await nav.attendre("agent_fin", t3, 60)
    await nav.attendre_silence(t3, 60)
    return all([
        verifier(lancee is not None, "tâche lancée par l'outil lancer_tache"),
        verifier(parle_pendant, "la conversation continue pendant la tâche"),
        verifier(finie is not None, "tâche terminée"),
        verifier(annonce is not None, f"résultat annoncé : {annonce and annonce['texte']}"),
    ])


QUESTIONS = ("C'est quoi la capitale du Portugal ?", "Et sa population, à peu près ?", "D'accord, merci beaucoup.")


async def scenario_questions(nav: FauxNavigateur) -> bool:
    """Trois questions courtes, pour mesurer la latence."""
    ok = True
    for texte in QUESTIONS:
        t = nav.t()
        await nav.dire(await phrase(texte))
        await nav.attendre_silence(t, 60)
        ok = ok and bool(nav.depuis(t, "agent_fin"))
    return verifier(ok, "trois réponses")


SCENARIOS = {
    "questions": scenario_questions,
    "bonjour": scenario_bonjour,
    "commande": scenario_commande,
    "coupure": scenario_coupure,
    "consignes": scenario_consignes,
    "marmonne": scenario_marmonne,
    "tache": scenario_tache,
}


async def main() -> None:
    noms = sys.argv[1:] or list(SCENARIOS)
    # Phrases générées avant la connexion : l'offre Gradium limite à 3 sessions simultanées, et le serveur en
    # tient déjà 2 ou 3 pendant la conversation.
    source = Path(__file__).read_text(encoding="utf-8")
    for texte in re.findall(r'phrase\(\s*"([^"]+)"', source):
        await phrase(texte)
    for texte in QUESTIONS:
        await phrase(texte)
    nav = FauxNavigateur()
    await nav.connecter()
    pret = await nav.attendre("etat", 0, 60, lambda m: m["etat"] == "ecoute")
    print("session prête" if pret else "session pas prête après 60 s")
    bilan = {}
    for nom in noms:
        print(f"\n=== {nom}")
        bilan[nom] = await SCENARIOS[nom](nav)
        await asyncio.sleep(1)
    await nav.fermer()
    print("\n" + " · ".join(f"{n} {'OK' if ok else 'ÉCHEC'}" for n, ok in bilan.items()))


if __name__ == "__main__":
    asyncio.run(main())
