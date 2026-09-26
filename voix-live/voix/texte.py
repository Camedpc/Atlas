"""Fonctions pures sur le texte : découpage pour la synthèse, nettoyage de l'écrit, détection d'écho."""

import re
import unicodedata

FIN_PHRASE = re.compile(r"[.!?…:;](?=\s)|,(?=\s)")


class Decoupeur:
    """Accumule les jetons du modèle et rend des morceaux prêts pour la synthèse.

    Gradium insère une espace entre deux messages : on ne coupe donc qu'entre deux mots, jamais avant une
    ponctuation. Le premier morceau part tôt (première virgule ou quelques mots) pour que la voix démarre vite ;
    les suivants attendent une fin de phrase, pour garder une bonne prosodie.
    """

    def __init__(self, premier_min: int = 6, premier_max: int = 45, suivant_min: int = 40, maximum: int = 160):
        self.tampon = ""
        self.premier = True
        self.premier_min = premier_min
        self.premier_max = premier_max
        self.suivant_min = suivant_min
        self.maximum = maximum

    def ajouter(self, delta: str) -> list[str]:
        self.tampon += delta
        sortie = []
        while morceau := self._extraire():
            sortie.append(morceau)
        return sortie

    def _extraire(self) -> str | None:
        minimum = self.premier_min if self.premier else self.suivant_min
        coupure = None
        for m in FIN_PHRASE.finditer(self.tampon):
            if m.end() >= minimum and (m.group() != "," or self.premier or m.end() >= self.maximum // 2):
                coupure = m.end()
                break
        maximum = self.premier_max if self.premier else self.maximum
        if coupure is None and len(self.tampon) > maximum:
            espace = self.tampon.rfind(" ", 0, maximum)
            coupure = espace if espace > 0 else None
        if coupure is None:
            return None
        morceau, self.tampon = self.tampon[:coupure], self.tampon[coupure:].lstrip()
        self.premier = False
        morceau = nettoyer(morceau)
        return morceau or self._extraire()

    def vider(self) -> str:
        morceau, self.tampon = nettoyer(self.tampon), ""
        return morceau


def nettoyer(texte: str) -> str:
    """Retire ce qui ne se prononce pas : Markdown, emojis, URL."""
    texte = re.sub(r"```.*?```", " ", texte, flags=re.S)
    texte = re.sub(r"https?://\S+", "le lien", texte)
    texte = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", texte)
    texte = re.sub(r"(^|\n)\s*(#+|[-*•]|\d+[.)])\s+", r"\1", texte)
    texte = re.sub(r"[*_`#>|~]", "", texte)
    texte = "".join(c for c in texte if unicodedata.category(c) != "So")
    return re.sub(r"\s+", " ", texte).strip()


def mots(texte: str) -> list[str]:
    texte = unicodedata.normalize("NFKD", texte.lower())
    texte = "".join(c for c in texte if not unicodedata.combining(c))
    return re.findall(r"[a-z0-9]+", texte.replace("'", " ").replace("’", " "))


def est_echo(entendu: str, dit_par_agent: str, seuil: float = 0.7) -> bool:
    """Vrai si ce que le micro a capté est surtout la voix de l'agent (haut-parleurs sans casque)."""
    entendus = mots(entendu)
    if not entendus:
        return True
    vocabulaire = set(mots(dit_par_agent))
    if not vocabulaire:
        return False
    communs = sum(1 for m in entendus if m in vocabulaire)
    return communs / len(entendus) >= seuil
