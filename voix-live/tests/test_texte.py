from voix.texte import Decoupeur, est_echo, nettoyer


def _decouper(texte: str, pas: int = 3) -> list[str]:
    d = Decoupeur()
    sortie = []
    for i in range(0, len(texte), pas):
        sortie += d.ajouter(texte[i : i + pas])
    return sortie + ([reste] if (reste := d.vider()) else [])


def test_decoupe_entre_les_mots_et_garde_la_ponctuation():
    texte = (
        "Oui, je regarde ça. Il y a trois commits récents sur main, le dernier date d'hier soir. Tu veux le détail ?"
    )
    morceaux = _decouper(texte)
    assert " ".join(morceaux) == texte
    assert morceaux[0] == "Oui, je regarde ça."
    for m in morceaux:
        assert not m.startswith((",", ".", "?"))


def test_premier_morceau_part_tot():
    texte = "D'accord, je lance un sous-agent qui va analyser tout le dossier et je te redis."
    morceaux = _decouper(texte)
    assert texte.startswith(morceaux[0])
    assert len(morceaux[0]) < 40


def test_texte_long_sans_ponctuation_coupe_a_une_espace():
    morceaux = _decouper("mot " * 80)
    assert all(len(m) <= 160 for m in morceaux)
    assert all(m.split() == ["mot"] * len(m.split()) for m in morceaux)


def test_nettoyer_markdown():
    assert nettoyer("**Trois** commits :\n- `d4a50c2` voir https://x.y/z") == "Trois commits : d4a50c2 voir le lien"
    assert nettoyer("## Titre\n1. premier") == "Titre premier"


def test_echo():
    dit = "Il y a trois commits récents sur la branche main, le dernier date d'hier."
    assert est_echo("trois commits récents sur la branche", dit)
    assert not est_echo("attends arrête toi une seconde", dit)
    assert est_echo("", dit)
