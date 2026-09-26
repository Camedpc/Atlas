"""Génère le bunker synthétique de Camille et son manifeste pour le prototype projets-documents.

    python prototypes/projets-documents/outils/generer_bunker.py

Écrit `commun/bunker/utilisateurs/camille/…` (Markdown, CSV, scripts, figures PNG/SVG, PDF) et
`commun/manifeste.js` (arborescence avec taille, date, agent auteur et session de chaque fichier).
Dépend seulement de matplotlib (figures et PDF).
"""

import json
import math
import shutil
from datetime import datetime, timedelta
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402

ICI = Path(__file__).resolve().parent
COMMUN = ICI.parent / "commun"
RACINE = COMMUN / "bunker" / "utilisateurs" / "camille"
MAINTENANT = datetime(2026, 9, 26, 18, 0)

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 10,
    "axes.edgecolor": "#52525b",
    "axes.labelcolor": "#18181b",
    "xtick.color": "#52525b",
    "ytick.color": "#52525b",
    "axes.spines.top": False,
    "axes.spines.right": False,
})

# Sessions : identifiant → (projet, décalage en jours depuis aujourd'hui, heure)
SESSIONS = {
    "s-7f3a2c": ("hydrures", 0, 9),
    "s-2b9e41": ("hydrures", 1, 14),
    "s-c0d8e5": ("hydrures", 5, 10),
    "s-41aa07": ("rtsg", 0, 11),
    "s-9d02f3": ("rtsg", 12, 16),
    "s-5e71b0": ("populations", 2, 15),
    "s-a3f9c2": ("populations", 8, 9),
    "s-e1c4d7": ("transport-optimal", 21, 17),
}

fichiers = {}  # chemin relatif → dict(contenu | ecrire, decalage_minutes)


def texte(chemin, contenu, minutes=0):
    fichiers[chemin] = {"contenu": contenu.strip() + "\n", "minutes": minutes}


def binaire(chemin, ecrire, minutes=0):
    fichiers[chemin] = {"ecrire": ecrire, "minutes": minutes}


def figure(chemin, dessiner, minutes=0, taille=(6.4, 4.0)):
    def ecrire(p):
        fig, ax = plt.subplots(figsize=taille, dpi=110)
        dessiner(fig, ax)
        fig.tight_layout()
        fig.savefig(p)
        plt.close(fig)

    binaire(chemin, ecrire, minutes)


# ───────────────────────────── Hydrures ─────────────────────────────

texte("hydrures/projet/instructions.md", r"""
# Instructions du projet — Supraconductivité des hydrures

Ces consignes sont données à l'orchestrateur au début de chaque session du projet.

- Toujours distinguer **prédiction théorique** (DFT + Eliashberg) et **mesure expérimentale**.
- Pour toute température critique, préciser la pression et la valeur de $\mu^*$ utilisée.
- Références prioritaires : Drozdov *et al.* (2015, 2019), Somayazulu *et al.* (2019), Errea *et al.* (2020).
- Unités : pression en GPa, températures en K, fréquences en meV.
- Les rapports des directeurs de labo se terminent par une section « Ce qui reste ouvert ».
""")

texte("hydrures/projet/glossaire.md", r"""
# Glossaire

| Terme | Définition |
|---|---|
| $T_c$ | Température critique de la transition supraconductrice |
| $\lambda$ | Constante de couplage électron-phonon |
| $\omega_{\log}$ | Fréquence phononique moyenne logarithmique |
| $\mu^*$ | Pseudopotentiel coulombien de Morel–Anderson |
| DAC | Cellule à enclumes de diamant (*diamond anvil cell*) |
""")


def pdf_cadrage(p):
    with PdfPages(p) as pdf:
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.text(0.1, 0.92, "Note de cadrage", fontsize=22, weight="bold", color="#18181b")
        fig.text(0.1, 0.895, "Projet « Supraconductivité des hydrures » — Atlas, septembre 2026", fontsize=11, color="#52525b")
        lignes = [
            ("1. Question", True),
            ("Les hydrures riches en hydrogène (H3S, LaH10, YH6) atteignent des températures critiques", False),
            ("proches de l'ambiante sous très haute pression. Peut-on prédire, par la théorie", False),
            ("d'Eliashberg, quelles compositions ternaires conservent un Tc élevé sous 50 GPa ?", False),
            ("", False),
            ("2. Démarche", True),
            ("- Revue de la littérature expérimentale (DAC, résistivité, susceptibilité).", False),
            ("- Calcul du couplage électron-phonon λ et de ω_log pour les candidats.", False),
            ("- Estimation de Tc par la formule d'Allen–Dynes, μ* entre 0,10 et 0,13.", False),
            ("- Mise en graphe des assertions et vérification de chaque démonstration.", False),
            ("", False),
            ("3. Critères de réussite", True),
            ("- Écart à l'expérience inférieur à 15 % sur H3S et LaH10.", False),
            ("- Au moins un candidat ternaire stable dynamiquement sous 50 GPa.", False),
            ("", False),
            ("4. Calendrier", True),
            ("Semaine 1 : revue et reproduction de H3S. Semaine 2 : LaH10 et ternaires.", False),
        ]
        y = 0.83
        for ligne, titre in lignes:
            fig.text(0.1, y, ligne, fontsize=13 if titre else 11, weight="bold" if titre else "normal", color="#18181b")
            y -= 0.03 if titre else 0.024
        fig.text(0.5, 0.04, "1 / 2", ha="center", fontsize=9, color="#8b8b93")
        pdf.savefig(fig)
        plt.close(fig)

        fig = plt.figure(figsize=(8.27, 11.69))
        fig.text(0.1, 0.92, "Annexe — Tc mesurées", fontsize=18, weight="bold", color="#18181b")
        ax = fig.add_axes([0.14, 0.5, 0.74, 0.34])
        noms = ["H3S", "LaH10", "YH6", "CaH6", "CeH9"]
        tc = [203, 250, 224, 215, 100]
        pression = [155, 170, 166, 172, 100]
        ax.scatter(pression, tc, color="#2563eb", zorder=3)
        for n, x, t in zip(noms, pression, tc):
            ax.annotate(n, (x, t), textcoords="offset points", xytext=(6, 4), fontsize=10)
        ax.set_xlabel("Pression (GPa)")
        ax.set_ylabel("Tc (K)")
        ax.grid(color="#e5e5e1")
        fig.text(0.1, 0.42, "Valeurs reprises des publications expérimentales ; incertitudes de ±5 K à ±10 K.", fontsize=10, color="#52525b")
        fig.text(0.5, 0.04, "2 / 2", ha="center", fontsize=9, color="#8b8b93")
        pdf.savefig(fig)
        plt.close(fig)


binaire("hydrures/projet/note-de-cadrage.pdf", pdf_cadrage)

# Session s-7f3a2c : Tc de LaH10 sous pression
S = "hydrures/sessions/s-7f3a2c"
texte(f"{S}/conv/conversation.md", r"""
# Tc de LaH10 sous pression

**Camille** — Reproduis la courbe Tc(P) de LaH10 entre 140 et 220 GPa et dis-moi si Allen–Dynes suffit.

**Orchestrateur** — Je confie deux missions : un directeur pour le couplage électron-phonon, un autre pour la revue
de littérature. Le graphiste mettra les deux rapports en graphe, puis je ferai vérifier les démonstrations.

**Orchestrateur** — Rapports rendus. Allen–Dynes reproduit la tendance à 8 % près au-dessus de 170 GPa ; en dessous,
l'anharmonicité fait diverger les deux courbes. Détails dans `directeurs/01-couplage-electron-phonon/rapport.md`.
""", 240)

texte(f"{S}/docs_session/consigne-initiale.md", r"""
# Consigne initiale

Reproduire $T_c(P)$ pour LaH$_{10}$ ($Fm\bar{3}m$) entre 140 et 220 GPa.
Comparer à Drozdov *et al.*, Nature 569, 528 (2019). Signaler toute hypothèse sur $\mu^*$.
""", 0)

texte(f"{S}/docs_session/mesures-drozdov-2019.csv", """
pression_gpa,tc_k,incertitude_k
138,215,8
150,241,6
160,247,5
170,250,5
180,246,6
190,238,7
200,229,8
""", 2)

texte(f"{S}/directeurs/01-couplage-electron-phonon/journal.md", r"""
# Journal — 01 couplage électron-phonon

- **09:12** Mission reçue : $T_c(P)$ de LaH$_{10}$, 140–220 GPa.
- **09:15** Convoque `litterature` pour les paramètres $\lambda$, $\omega_{\log}$ publiés.
- **09:41** Littérature : $\lambda = 2{,}2$ à 170 GPa (Errea 2020), $\omega_{\log} \approx 1300$ K.
- **09:44** Convoque `experimentateur` : balayage en pression, script `calcul_tc.py`.
- **10:20** Figure `figures/tc-vs-pression.png` produite. Écart max 8 % au-dessus de 170 GPa.
- **10:31** Sous 160 GPa, divergence : l'approximation harmonique surestime $\lambda$.
- **10:48** Rapport rédigé.
""", 108)

texte(f"{S}/directeurs/01-couplage-electron-phonon/rapport.md", r"""
# Rapport — Couplage électron-phonon dans LaH₁₀

## Résumé

La formule d'Allen–Dynes reproduit la température critique mesurée de LaH$_{10}$ à **8 % près** entre 170 et
220 GPa, avec $\mu^* = 0{,}10$. En dessous de 160 GPa, l'approximation harmonique surestime le couplage et la
prédiction s'écarte de l'expérience.

## Méthode

On utilise la formule d'Allen–Dynes :

$$
T_c = \frac{f_1 f_2\,\omega_{\log}}{1{,}2}\,\exp\!\left[-\frac{1{,}04\,(1+\lambda)}{\lambda-\mu^*(1+0{,}62\,\lambda)}\right]
$$

où $f_1$ et $f_2$ corrigent le régime de couplage fort ($\lambda > 1{,}5$). Les paramètres $\lambda(P)$ et
$\omega_{\log}(P)$ sont interpolés depuis la littérature (voir `litterature/synthese.md`).

## Résultats

| P (GPa) | $\lambda$ | $\omega_{\log}$ (K) | $T_c$ calculée (K) | $T_c$ mesurée (K) |
|---|---|---|---|---|
| 150 | 3,1 | 1010 | 281 | 241 |
| 170 | 2,2 | 1300 | 262 | 250 |
| 200 | 1,9 | 1420 | 238 | 229 |

![Tc en fonction de la pression](figures/tc-vs-pression.png)

## Discussion

1. Au-dessus de 170 GPa, l'écart reste sous 8 %.
2. Sous 160 GPa, l'anharmonicité des modes de l'hydrogène (Errea *et al.*, 2020) réduit $\lambda$ de près de 30 %.
3. La valeur de $\mu^*$ n'est pas le facteur limitant : passer de 0,10 à 0,13 déplace $T_c$ de 9 K seulement.

## Ce qui reste ouvert

- Refaire le calcul avec phonons anharmoniques (SSCHA).
- Vérifier la stabilité dynamique en dessous de 140 GPa.

## Références

1. A. P. Drozdov *et al.*, *Nature* **569**, 528 (2019).
2. I. Errea *et al.*, *Nature* **578**, 66 (2020).
3. P. B. Allen, R. C. Dynes, *Phys. Rev. B* **12**, 905 (1975).
""", 110)

texte(f"{S}/directeurs/01-couplage-electron-phonon/litterature/synthese.md", r"""
# Synthèse bibliographique — paramètres de LaH₁₀

- **Drozdov 2019** : $T_c = 250$ K à 170 GPa, chute de résistance nette, effet isotopique confirmé (LaD$_{10}$).
- **Somayazulu 2019** : $T_c \approx 260$ K à 190 GPa, mesure indépendante.
- **Errea 2020** : les effets quantiques nucléaires stabilisent $Fm\bar{3}m$ jusqu'à 129 GPa ; $\lambda$ harmonique
  surestimé d'environ 30 %.
- **Liu 2017** : prédiction initiale, $T_c$ de 274 à 286 K à 210 GPa.

Valeurs retenues : $\lambda(170) = 2{,}2$ ; $\omega_{\log}(170) = 1300$ K.
""", 40)

texte(f"{S}/directeurs/01-couplage-electron-phonon/scripts/calcul_tc.py", r'''
"""Balayage Tc(P) de LaH10 par la formule d'Allen–Dynes."""

import math

import numpy as np

PRESSIONS = np.array([150, 160, 170, 180, 190, 200, 210, 220])
LAMBDA = np.array([3.1, 2.6, 2.2, 2.1, 2.0, 1.9, 1.85, 1.8])
OMEGA_LOG = np.array([1010, 1180, 1300, 1340, 1380, 1420, 1450, 1480])


def allen_dynes(lam, omega_log, mu=0.10):
    lam2 = 2.46 * (1 + 3.8 * mu)
    f1 = (1 + (lam / lam2) ** 1.5) ** (1 / 3)
    f2 = 1 + (lam**2 * (1 - 1 / 1.82)) / (lam**2 + lam2**2)
    return f1 * f2 * omega_log / 1.2 * math.exp(-1.04 * (1 + lam) / (lam - mu * (1 + 0.62 * lam)))


if __name__ == "__main__":
    for p, lam, w in zip(PRESSIONS, LAMBDA, OMEGA_LOG):
        print(f"{p:4d} GPa  Tc = {allen_dynes(lam, w):6.1f} K")
''', 70)


def dessiner_tc(fig, ax):
    p_mes = [138, 150, 160, 170, 180, 190, 200]
    tc_mes = [215, 241, 247, 250, 246, 238, 229]
    p = [150, 160, 170, 180, 190, 200, 210, 220]
    tc_calc = [281, 270, 262, 255, 247, 238, 231, 224]
    ax.plot(p, tc_calc, color="#2563eb", lw=2, label="Allen–Dynes (μ* = 0,10)")
    ax.errorbar(p_mes, tc_mes, yerr=[8, 6, 5, 5, 6, 7, 8], fmt="o", color="#18181b", ms=5, capsize=3, label="Drozdov 2019")
    ax.axvspan(135, 160, color="#f4f4f2", zorder=0)
    ax.text(137, 285, "régime anharmonique", fontsize=9, color="#52525b")
    ax.set_xlabel("Pression (GPa)")
    ax.set_ylabel("Tc (K)")
    ax.set_title("LaH10 : température critique en fonction de la pression", fontsize=11, loc="left")
    ax.legend(frameon=False)
    ax.grid(color="#e5e5e1", lw=0.8)


figure(f"{S}/directeurs/01-couplage-electron-phonon/figures/tc-vs-pression.png", dessiner_tc, 88)

texte(f"{S}/directeurs/02-revue-litterature/journal.md", r"""
# Journal — 02 revue de littérature

- **09:13** Mission reçue : état de l'art expérimental sur LaH$_{10}$.
- **09:14** Convoque `litterature` (deux recherches en parallèle : mesures, controverses).
- **09:58** 14 articles retenus, 3 écartés (pas de mesure de résistance à zéro).
- **10:12** Rapport rédigé.
""", 72)

texte(f"{S}/directeurs/02-revue-litterature/rapport.md", r"""
# Rapport — État de l'art expérimental sur LaH₁₀

## Constat principal

Deux équipes indépendantes ont mesuré une supraconductivité au-delà de **250 K** dans LaH$_{10}$ au-dessus de
170 GPa. Les deux mesures reposent sur la chute de résistance ; la susceptibilité magnétique reste discutée.

## Points établis

- Chute de résistance à zéro, reproduite par deux groupes.
- Effet isotopique : $\alpha = -\,d\ln T_c / d\ln M \approx 0{,}46$, proche de la valeur BCS $0{,}5$.
- Déplacement de $T_c$ sous champ magnétique cohérent avec $H_{c2}(0) \approx 136$ T.

## Points discutés

- Les mesures de susceptibilité en DAC sont bruitées ; Hirsch conteste leur interprétation.
- La phase exacte sous 150 GPa ($R\bar{3}m$ ou $Fm\bar{3}m$) dépend du chemin de synthèse.

## Ce qui reste ouvert

- Mesure de l'effet Meissner sans ambiguïté.

## Références

1. A. P. Drozdov *et al.*, *Nature* **569**, 528 (2019).
2. M. Somayazulu *et al.*, *Phys. Rev. Lett.* **122**, 027001 (2019).
3. J. E. Hirsch, F. Marsiglio, *Nature* **596**, E9 (2021).
""", 80)

texte(f"{S}/directeurs/02-revue-litterature/litterature/references.md", r"""
# Références retenues (14)

1. Drozdov *et al.*, Nature 569, 528 (2019) — **mesure**
2. Somayazulu *et al.*, PRL 122, 027001 (2019) — **mesure**
3. Errea *et al.*, Nature 578, 66 (2020) — théorie, anharmonicité
4. Liu *et al.*, PNAS 114, 6990 (2017) — prédiction
5. Peng *et al.*, PRL 119, 107001 (2017) — prédiction
6. Hirsch & Marsiglio, Nature 596, E9 (2021) — critique
7. Minkov *et al.*, Nat. Phys. 19, 1293 (2023) — piégeage de flux
8. …

Écartés : 3 prépublications sans mesure de résistance nulle.
""", 60)

texte(f"{S}/graphe/rapport-01.graphe.json", json.dumps({
    "source": "directeurs/01-couplage-electron-phonon/rapport.md",
    "noeuds": [
        {"id": "lah10-tc-170", "enonce": "Tc(LaH10, 170 GPa) = 250 K (mesure)"},
        {"id": "allen-dynes-8pc", "enonce": "Allen–Dynes reproduit Tc à 8 % au-dessus de 170 GPa"},
        {"id": "anharmonicite", "enonce": "Sous 160 GPa, l'anharmonicité réduit λ d'environ 30 %"},
    ],
    "demonstrations": [
        {"conclusion": "allen-dynes-8pc", "justifie_par": ["lah10-tc-170"], "validite": "a_verifier"},
        {"conclusion": "anharmonicite", "justifie_par": [], "validite": "a_verifier"},
    ],
}, ensure_ascii=False, indent=2), 125)

texte(f"{S}/scripts/interpoler_parametres.py", r'''
"""Interpole λ(P) et ω_log(P) à partir des points publiés."""

import numpy as np

points = {150: (3.1, 1010), 170: (2.2, 1300), 200: (1.9, 1420)}
p = np.array(sorted(points))
lam = np.interp(np.arange(150, 221, 10), p, [points[k][0] for k in p])
print(lam)
''', 50)

texte(f"{S}/.tmp/sortie-balayage.log", """
[10:18:02] balayage 150 → 220 GPa, 8 points
[10:18:02] mu* = 0.10
[10:18:03] 150 GPa  Tc = 281.2 K
[10:18:03] 170 GPa  Tc = 262.4 K
[10:18:03] 200 GPa  Tc = 238.1 K
[10:18:03] terminé en 0.9 s
""", 86)

# Session s-2b9e41 : Allen–Dynes contre Eliashberg complet
S = "hydrures/sessions/s-2b9e41"
texte(f"{S}/conv/conversation.md", r"""
# Allen–Dynes ou Eliashberg complet ?

**Camille** — Dans quel régime de couplage la formule d'Allen–Dynes cesse-t-elle d'être fiable ?

**Orchestrateur** — Un directeur compare les deux approches sur H$_3$S et un modèle d'Einstein. Réponse : au-delà
de $\lambda \approx 2{,}5$, l'écart dépasse 10 %.
""", 180)

texte(f"{S}/directeurs/01-formule-allen-dynes/journal.md", r"""
# Journal — 01 formule d'Allen–Dynes

- **14:05** Mission reçue : domaine de validité d'Allen–Dynes.
- **14:07** Convoque `experimentateur` : résolution des équations d'Eliashberg isotropes (modèle d'Einstein).
- **14:52** Écart < 5 % pour $\lambda < 1{,}5$, 10 % à $\lambda = 2{,}5$, 22 % à $\lambda = 4$.
- **15:10** Schéma du cycle de calcul ajouté (`figures/schema-eliashberg.svg`).
- **15:21** Rapport rédigé.
""", 76)

texte(f"{S}/directeurs/01-formule-allen-dynes/rapport.md", r"""
# Rapport — Domaine de validité de la formule d'Allen–Dynes

## Conclusion

La formule d'Allen–Dynes reste à moins de **10 %** des équations d'Eliashberg tant que $\lambda \le 2{,}5$.
Au-delà, elle sous-estime $T_c$ : l'écart atteint 22 % pour $\lambda = 4$.

## Démarche

Les équations d'Eliashberg isotropes sur l'axe imaginaire :

$$
Z(i\omega_n)\,\Delta(i\omega_n) = \pi T \sum_m \left[\lambda(\omega_n-\omega_m) - \mu^*\right]\frac{\Delta(i\omega_m)}{\sqrt{\omega_m^2+\Delta^2(i\omega_m)}}
$$

sont résolues pour un spectre d'Einstein $\alpha^2F(\omega) = \tfrac{\lambda\,\Omega}{2}\,\delta(\omega-\Omega)$.

![Cycle de calcul](figures/schema-eliashberg.svg)

## Ce qui reste ouvert

- Effet d'un spectre à deux pics (modes H et modes lourds).
""", 81)


def svg_schema():
    boites = [
        (20, "Structure cristalline", "DFT"),
        (200, "Phonons et α²F(ω)", "DFPT"),
        (380, "λ, ω_log", "intégrales"),
        (560, "Tc", "Eliashberg / Allen–Dynes"),
    ]
    elements = []
    for x, titre, sous in boites:
        elements.append(
            f'<rect x="{x}" y="50" width="150" height="64" rx="8" fill="#ffffff" stroke="#d4d4cf"/>'
            f'<text x="{x + 75}" y="78" text-anchor="middle" font-size="14" font-weight="600" fill="#18181b">{titre}</text>'
            f'<text x="{x + 75}" y="98" text-anchor="middle" font-size="12" fill="#8b8b93">{sous}</text>'
        )
    for x in (170, 350, 530):
        elements.append(f'<path d="M{x + 2} 82 H{x + 26}" stroke="#52525b" stroke-width="1.5" marker-end="url(#fl)"/>')
    elements.append(
        '<path d="M635 114 V150 H95 V116" fill="none" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="4 4" marker-end="url(#fla)"/>'
        '<text x="365" y="168" text-anchor="middle" font-size="12" fill="#2563eb">ajustement de μ* si écart à l\'expérience &gt; 15 %</text>'
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 730 190" width="730" height="190" font-family="Inter, Segoe UI, sans-serif">
<defs>
<marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#52525b"/></marker>
<marker id="fla" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#2563eb"/></marker>
</defs>
<rect width="730" height="190" fill="#f7f7f5"/>
<text x="20" y="30" font-size="13" font-weight="600" fill="#52525b">Cycle de calcul de Tc</text>
{''.join(elements)}
</svg>"""


texte(f"{S}/directeurs/01-formule-allen-dynes/figures/schema-eliashberg.svg", svg_schema(), 65)


def dessiner_ecart(fig, ax):
    lam = [0.5 + 0.25 * i for i in range(15)]
    ecart = [max(0.0, 1.2 * (x - 1.0) ** 1.6) if x > 1 else 0.3 for x in lam]
    ax.plot(lam, ecart, color="#2563eb", lw=2)
    ax.axhline(10, color="#8b8b93", lw=1, ls="--")
    ax.text(0.55, 10.8, "seuil 10 %", fontsize=9, color="#52525b")
    ax.set_xlabel("λ")
    ax.set_ylabel("Écart Allen–Dynes / Eliashberg (%)")
    ax.grid(color="#e5e5e1", lw=0.8)


figure(f"{S}/directeurs/01-formule-allen-dynes/figures/ecart-lambda.png", dessiner_ecart, 48)

texte(f"{S}/directeurs/01-formule-allen-dynes/scripts/eliashberg_einstein.py", r'''
"""Équations d'Eliashberg isotropes pour un spectre d'Einstein (axe de Matsubara)."""

import numpy as np


def tc_eliashberg(lam, omega, mu=0.1, n_max=256):
    """Renvoie Tc par recherche de la valeur propre unité du noyau linéarisé."""
    ...
''', 30)

texte(f"{S}/verification/verdicts.md", r"""
# Verdicts du vérificateur

| Démonstration | Validité | Confiance |
|---|---|---|
| Allen–Dynes < 10 % pour λ ≤ 2,5 | valide | 0,86 |
| Sous-estimation au-delà de λ = 2,5 | valide | 0,78 |
| Spectre d'Einstein représentatif de H3S | à revoir | 0,41 |
""", 170)

# Session s-c0d8e5 : ternaires à basse pression (en cours)
S = "hydrures/sessions/s-c0d8e5"
texte(f"{S}/conv/conversation.md", r"""
# Hydrures ternaires à basse pression

**Camille** — Liste les ternaires La–X–H prédits stables sous 50 GPa.

**Orchestrateur** — Un directeur est en cours sur la littérature ; premiers candidats : LaBeH$_8$, LaB$_2$H$_8$.
""", 60)

texte(f"{S}/directeurs/01-ternaires-la-x-h/journal.md", r"""
# Journal — 01 ternaires La–X–H

- **10:02** Mission reçue.
- **10:04** Convoque `litterature`.
- **10:40** LaBeH$_8$ : $T_c \approx 110$ K à 80 GPa (mesure, 2023). Stable jusqu'à 60 GPa ?
- **10:55** En attente de la seconde recherche (LaB$_2$H$_8$).
""", 53)

texte(f"{S}/directeurs/01-ternaires-la-x-h/candidats.csv", """
formule,pression_min_gpa,tc_predite_k,source
LaBeH8,60,183,Zhang 2022
LaB2H8,40,126,Di Cataldo 2021
LaBH8,50,156,Liang 2021
LaAlH8,90,120,prédiction interne
""", 50)

# ───────────────────────────── RTSG ─────────────────────────────

texte("rtsg/projet/instructions.md", r"""
# Instructions du projet — Chute libre en RTSG

- Unités géométrisées : $G = c = 1$, sauf mention contraire.
- Signature $(-,+,+,+)$.
- Toute affirmation sur un observateur précise son référentiel (temps propre $\tau$ ou temps de Schwarzschild $t$).
- Les calculs symboliques passent par SymPy ; les intégrations numériques par SciPy.
""")

S = "rtsg/sessions/s-41aa07"
texte(f"{S}/conv/conversation.md", r"""
# Géodésiques radiales de Schwarzschild

**Camille** — Combien de temps propre met un corps lâché au repos depuis $r_0 = 10M$ pour atteindre l'horizon ?

**Orchestrateur** — $\tau = \frac{\pi}{2}\, r_0^{3/2} (2M)^{-1/2}$ jusqu'à la singularité, soit environ $35{,}1\,M$ ;
l'horizon est franchi à $\tau \approx 33{,}7\,M$. Le temps de Schwarzschild, lui, diverge.
""", 120)

texte(f"{S}/directeurs/01-temps-propre/journal.md", r"""
# Journal — 01 temps propre de chute

- **11:03** Mission reçue.
- **11:05** Convoque `experimentateur` : intégration numérique de $dr/d\tau$ et $dt/d\tau$.
- **11:31** Accord avec la solution en cycloïde à $10^{-9}$ près.
- **11:44** Figure `figures/chute-radiale.png`.
- **11:50** Rapport rédigé.
""", 50)

texte(f"{S}/directeurs/01-temps-propre/rapport.md", r"""
# Rapport — Temps propre de chute radiale

## Résultat

Pour un corps lâché au repos en $r_0$, la solution paramétrique en cycloïde donne

$$
r = \frac{r_0}{2}\,(1+\cos\eta), \qquad \tau = \sqrt{\frac{r_0^3}{8M}}\,(\eta + \sin\eta).
$$

Avec $r_0 = 10M$ :

- horizon ($r = 2M$) franchi à $\tau_H \approx 33{,}7\,M$ ;
- singularité atteinte à $\tau_S = \pi\sqrt{r_0^3/8M} \approx 35{,}1\,M$.

Le temps de coordonnée $t$ diverge logarithmiquement à l'approche de l'horizon :
$t \sim -2M \ln(r - 2M)$.

![Chute radiale](figures/chute-radiale.png)

## Ce qui reste ouvert

- Cas d'un lâcher avec vitesse initiale non nulle.
""", 55)


def dessiner_chute(fig, ax):
    r0, M = 10.0, 1.0
    etas = [i * math.pi / 20000 for i in range(0, 20000)]
    r = [r0 / 2 * (1 + math.cos(e)) for e in etas]
    tau = [math.sqrt(r0**3 / (8 * M)) * (e + math.sin(e)) for e in etas]
    ax.plot(tau, r, color="#2563eb", lw=2, label="r(τ) — temps propre")
    ts, rs = [], []
    for e, rr in zip(etas, r):
        if rr <= 2.0002:
            break
        # temps de Schwarzschild (formule fermée)
        a = math.sqrt(r0 / (2 * M) - 1)
        t = 2 * M * math.log(abs((a + math.tan(e / 2)) / (a - math.tan(e / 2)))) + 2 * M * a * (e + r0 / (4 * M) * (e + math.sin(e)))
        ts.append(t)
        rs.append(rr)
    ax.plot(ts, rs, color="#18181b", lw=1.5, ls="--", label="r(t) — temps de Schwarzschild")
    ax.axhline(2, color="#8b8b93", lw=1)
    ax.text(2, 2.3, "horizon r = 2M", fontsize=9, color="#52525b")
    ax.set_xlim(0, 70)
    ax.set_ylim(0, 10.5)
    ax.set_xlabel("temps (unités de M)")
    ax.set_ylabel("r / M")
    ax.legend(frameon=False, loc="upper right")
    ax.grid(color="#e5e5e1", lw=0.8)


figure(f"{S}/directeurs/01-temps-propre/figures/chute-radiale.png", dessiner_chute, 41)

texte(f"{S}/directeurs/01-temps-propre/scripts/integrer_geodesique.py", r'''
"""Intègre la géodésique radiale de Schwarzschild (G = c = 1)."""

import numpy as np
from scipy.integrate import solve_ivp

M, R0 = 1.0, 10.0


def derivees(tau, y):
    r, t = y
    drdtau = -np.sqrt(2 * M / r - 2 * M / R0)
    dtdtau = np.sqrt(1 - 2 * M / R0) / (1 - 2 * M / r)
    return [drdtau, dtdtau]


sol = solve_ivp(derivees, (0, 33.6), [R0 - 1e-9, 0], rtol=1e-10, atol=1e-12)
print(sol.y[:, -1])
''', 20)

texte(f"{S}/directeurs/01-temps-propre/litterature/references.md", r"""
# Références

1. C. W. Misner, K. S. Thorne, J. A. Wheeler, *Gravitation*, §25.5 (1973).
2. S. Carroll, *Spacetime and Geometry*, §5.6 (2004).
3. E. Taylor, J. A. Wheeler, *Exploring Black Holes*, chap. 3 (2000).
""", 15)

S = "rtsg/sessions/s-9d02f3"
texte(f"{S}/conv/conversation.md", r"""
# Écart au newtonien en champ faible

**Camille** — À partir de quel rayon la chute en RTSG s'écarte-t-elle de plus de 1 % de la chute newtonienne ?
""", 10)

texte(f"{S}/directeurs/01-champ-faible/rapport.md", r"""
# Rapport — Écart au newtonien

L'écart relatif sur le temps de chute se développe en

$$
\frac{\Delta\tau}{\tau_N} \simeq \frac{3M}{2 r_0} + O\!\left(\frac{M^2}{r_0^2}\right),
$$

donc dépasse 1 % pour $r_0 \lesssim 150\,M$.

## Ce qui reste ouvert

- Comparer au temps de coordonnée pour un observateur à l'infini.
""", 95)

texte(f"{S}/directeurs/01-champ-faible/journal.md", r"""
# Journal — 01 champ faible

- **16:02** Mission reçue.
- **16:30** Développement limité vérifié numériquement.
- **17:05** Rapport rédigé.
""", 90)

# ───────────────────────────── Populations ─────────────────────────────

texte("populations/projet/instructions.md", r"""
# Instructions du projet — Dynamique des populations

- Modèles en temps continu sauf mention contraire.
- Toute analyse de stabilité donne la jacobienne et ses valeurs propres.
- Données de référence : série lynx–lièvres de la Compagnie de la baie d'Hudson (1900–1920).
""")

texte("populations/projet/donnees/lynx-lievres-hudson.csv", """
annee,lievres_milliers,lynx_milliers
1900,30,4
1901,47.2,6.1
1902,70.2,9.8
1903,77.4,35.2
1904,36.3,59.4
1905,20.6,41.7
1906,18.1,19
1907,21.4,13
1908,22,8.3
1909,25.4,9.1
1910,27.1,7.4
1911,40.3,8
1912,57,12.3
1913,76.6,19.5
1914,52.3,45.7
1915,19.5,51.1
1916,11.2,29.7
1917,7.6,15.8
1918,14.6,9.7
1919,16.2,10.1
1920,24.7,8.6
""")

S = "populations/sessions/s-5e71b0"
texte(f"{S}/conv/conversation.md", r"""
# Stabilité du point fixe de Lotka–Volterra

**Camille** — Le point fixe intérieur de Lotka–Volterra est-il stable ? Ajuste le modèle aux données d'Hudson.

**Orchestrateur** — Le point fixe est un centre (valeurs propres imaginaires pures) : stabilité neutre, pas
asymptotique. L'ajustement donne une période de 9,6 ans contre 10 observés.
""", 200)

texte(f"{S}/directeurs/01-analyse-lineaire/journal.md", r"""
# Journal — 01 analyse linéaire

- **15:04** Mission reçue.
- **15:06** Jacobienne au point fixe calculée symboliquement.
- **15:20** Valeurs propres $\pm i\sqrt{\alpha\gamma}$ : centre.
- **15:35** Convoque `experimentateur` : portrait de phase et ajustement.
- **16:12** Figure `figures/portrait-de-phase.png`.
- **16:30** Rapport rédigé, export PDF.
""", 86)

texte(f"{S}/directeurs/01-analyse-lineaire/rapport.md", r"""
# Rapport — Stabilité du point fixe de Lotka–Volterra

## Modèle

$$
\dot{x} = \alpha x - \beta x y, \qquad \dot{y} = \delta x y - \gamma y
$$

Le point fixe intérieur est $(x^*, y^*) = (\gamma/\delta,\ \alpha/\beta)$.

## Analyse linéaire

La jacobienne en $(x^*, y^*)$ vaut

$$
J = \begin{pmatrix} 0 & -\beta\gamma/\delta \\ \alpha\delta/\beta & 0 \end{pmatrix},
$$

de valeurs propres $\pm i\sqrt{\alpha\gamma}$. Le point fixe est un **centre** : l'analyse linéaire ne conclut pas
seule, mais l'intégrale première $V(x,y) = \delta x - \gamma\ln x + \beta y - \alpha \ln y$ montre que les orbites
sont fermées. Stabilité **neutre**, pas asymptotique.

![Portrait de phase](figures/portrait-de-phase.png)

## Ajustement aux données d'Hudson

| Paramètre | Valeur |
|---|---|
| $\alpha$ | 0,55 an⁻¹ |
| $\beta$ | 0,028 |
| $\delta$ | 0,026 |
| $\gamma$ | 0,84 an⁻¹ |

Période prédite $2\pi/\sqrt{\alpha\gamma} \approx 9{,}2$ ans ; observée ≈ 10 ans.

## Ce qui reste ouvert

- Ajouter une capacité de charge : le centre devient un foyer stable.
""", 108)


def dessiner_phase(fig, ax):
    a, b, d, g = 0.55, 0.028, 0.026, 0.84
    for x0 in (20, 28, 40, 55):
        x, y = x0, a / b
        xs, ys = [], []
        dt = 0.01
        for _ in range(2500):
            dx = a * x - b * x * y
            dy = d * x * y - g * y
            x, y = x + dt * dx, y + dt * dy
            xs.append(x)
            ys.append(y)
        ax.plot(xs, ys, color="#2563eb", lw=1.2, alpha=0.9)
    ax.plot([g / d], [a / b], "o", color="#18181b", ms=5)
    ax.annotate("point fixe (γ/δ, α/β)", (g / d, a / b), textcoords="offset points", xytext=(8, -12), fontsize=9)
    ax.set_xlabel("lièvres (milliers)")
    ax.set_ylabel("lynx (milliers)")
    ax.set_title("Portrait de phase de Lotka–Volterra", fontsize=11, loc="left")
    ax.grid(color="#e5e5e1", lw=0.8)


figure(f"{S}/directeurs/01-analyse-lineaire/figures/portrait-de-phase.png", dessiner_phase, 68, taille=(5.6, 4.4))


def dessiner_series(fig, ax):
    annees = list(range(1900, 1921))
    li = [30, 47.2, 70.2, 77.4, 36.3, 20.6, 18.1, 21.4, 22, 25.4, 27.1, 40.3, 57, 76.6, 52.3, 19.5, 11.2, 7.6, 14.6, 16.2, 24.7]
    ly = [4, 6.1, 9.8, 35.2, 59.4, 41.7, 19, 13, 8.3, 9.1, 7.4, 8, 12.3, 19.5, 45.7, 51.1, 29.7, 15.8, 9.7, 10.1, 8.6]
    ax.plot(annees, li, "-o", color="#2563eb", ms=3, lw=1.5, label="lièvres")
    ax.plot(annees, ly, "-o", color="#18181b", ms=3, lw=1.5, label="lynx")
    ax.set_xlabel("année")
    ax.set_ylabel("milliers de peaux")
    ax.legend(frameon=False)
    ax.grid(color="#e5e5e1", lw=0.8)


figure(f"{S}/directeurs/01-analyse-lineaire/figures/series-hudson.png", dessiner_series, 60)


def pdf_rapport_lv(p):
    with PdfPages(p) as pdf:
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.text(0.1, 0.92, "Stabilité du point fixe de Lotka–Volterra", fontsize=18, weight="bold", color="#18181b")
        fig.text(0.1, 0.895, "Rapport du directeur de labo 01 — export PDF", fontsize=10, color="#52525b")
        fig.text(0.1, 0.85, r"$\dot{x} = \alpha x - \beta x y,\quad \dot{y} = \delta x y - \gamma y$", fontsize=14)
        fig.text(0.1, 0.81, r"Valeurs propres au point fixe : $\lambda = \pm i\sqrt{\alpha\gamma}$ (centre).", fontsize=12)
        ax = fig.add_axes([0.14, 0.38, 0.72, 0.36])
        dessiner_phase(fig, ax)
        fig.text(0.1, 0.3, "Conclusion : stabilité neutre ; période prédite 9,2 ans, observée 10 ans.", fontsize=11)
        fig.text(0.5, 0.04, "1 / 1", ha="center", fontsize=9, color="#8b8b93")
        pdf.savefig(fig)
        plt.close(fig)


binaire(f"{S}/directeurs/01-analyse-lineaire/rapport.pdf", pdf_rapport_lv, 112)

texte(f"{S}/directeurs/01-analyse-lineaire/scripts/ajuster_hudson.py", r'''
"""Ajuste Lotka–Volterra aux séries lynx–lièvres par moindres carrés."""

import numpy as np
import pandas as pd
from scipy.integrate import odeint
from scipy.optimize import least_squares

donnees = pd.read_csv("../../../../projet/donnees/lynx-lievres-hudson.csv")


def modele(etat, t, a, b, d, g):
    x, y = etat
    return [a * x - b * x * y, d * x * y - g * y]


def residus(p):
    sol = odeint(modele, donnees.iloc[0, 1:].values, donnees.annee - 1900, args=tuple(p))
    return (sol - donnees.iloc[:, 1:].values).ravel()


print(least_squares(residus, [0.5, 0.03, 0.03, 0.8]).x)
''', 55)

texte(f"{S}/graphe/rapport-01.graphe.json", json.dumps({
    "source": "directeurs/01-analyse-lineaire/rapport.md",
    "noeuds": [
        {"id": "lv-jacobienne", "enonce": "La jacobienne au point fixe a des valeurs propres ±i√(αγ)"},
        {"id": "lv-centre", "enonce": "Le point fixe intérieur est un centre"},
        {"id": "lv-integrale", "enonce": "V(x,y) est une intégrale première"},
    ],
    "demonstrations": [
        {"conclusion": "lv-centre", "justifie_par": ["lv-jacobienne", "lv-integrale"], "validite": "valide", "confiance": 0.93},
    ],
}, ensure_ascii=False, indent=2), 130)

S = "populations/sessions/s-a3f9c2"
texte(f"{S}/conv/conversation.md", r"""
# Modèle logistique avec retard

**Camille** — Pour l'équation de Hutchinson, à partir de quel retard apparaissent les oscillations ?

**Orchestrateur** — Bifurcation de Hopf pour $r\tau = \pi/2$.
""", 90)

texte(f"{S}/directeurs/01-hutchinson/rapport.md", r"""
# Rapport — Équation logistique retardée

$$
\dot{N}(t) = r\,N(t)\left(1 - \frac{N(t-\tau)}{K}\right)
$$

La linéarisation autour de $N = K$ donne l'équation caractéristique $\lambda + r e^{-\lambda\tau} = 0$.
Une paire de racines traverse l'axe imaginaire pour $r\tau = \pi/2$ : **bifurcation de Hopf**.

![Diagramme de bifurcation](figures/bifurcation-hopf.png)
""", 70)


def dessiner_hopf(fig, ax):
    rt = [0.2 + 0.02 * i for i in range(120)]
    amp = [0 if x < math.pi / 2 else 1.6 * math.sqrt(x - math.pi / 2) for x in rt]
    ax.plot(rt, amp, color="#2563eb", lw=2)
    ax.axvline(math.pi / 2, color="#8b8b93", ls="--", lw=1)
    ax.text(math.pi / 2 + 0.03, 1.4, "rτ = π/2", fontsize=9, color="#52525b")
    ax.set_xlabel("rτ")
    ax.set_ylabel("amplitude des oscillations / K")
    ax.grid(color="#e5e5e1", lw=0.8)


figure(f"{S}/directeurs/01-hutchinson/figures/bifurcation-hopf.png", dessiner_hopf, 60)

texte(f"{S}/directeurs/01-hutchinson/journal.md", r"""
# Journal — 01 Hutchinson

- **09:10** Mission reçue.
- **09:40** Équation caractéristique obtenue.
- **10:05** Simulation de la bifurcation.
- **10:20** Rapport rédigé.
""", 65)

# ───────────────────────────── Transport optimal ─────────────────────────────

texte("transport-optimal/projet/instructions.md", r"""
# Instructions du projet — Transport optimal en imagerie

- Comparer systématiquement Wasserstein-1, Wasserstein-2 et la distance de Sinkhorn.
- Les histogrammes sont normalisés avant tout calcul.
""")

S = "transport-optimal/sessions/s-e1c4d7"
texte(f"{S}/conv/conversation.md", r"""
# Distance de Wasserstein entre histogrammes

**Camille** — Explique pourquoi $W_1$ entre histogrammes 1D se calcule par les fonctions de répartition.

**Orchestrateur** — En 1D, $W_1(\mu,\nu) = \int |F_\mu(x) - F_\nu(x)|\,dx$ : le couplage monotone est optimal.
""", 45)

texte(f"{S}/directeurs/01-wasserstein-1d/rapport.md", r"""
# Rapport — Wasserstein en dimension 1

En dimension 1, le couplage monotone (quantile contre quantile) est optimal pour tout coût convexe, d'où

$$
W_p(\mu,\nu)^p = \int_0^1 \left|F_\mu^{-1}(u) - F_\nu^{-1}(u)\right|^p du.
$$

Pour $p = 1$, un changement de variable donne $W_1 = \int_{\mathbb{R}} |F_\mu - F_\nu|$.
""", 40)

texte(f"{S}/scripts/wasserstein.py", r'''
import numpy as np


def w1(h1, h2, largeur=1.0):
    """W1 entre deux histogrammes de même support."""
    return largeur * np.abs(np.cumsum(h1 / h1.sum()) - np.cumsum(h2 / h2.sum())).sum()
''', 30)


# ───────────────────────────── Écriture et manifeste ─────────────────────────────

PROJET_DATE = {"hydrures": 22, "rtsg": 30, "populations": 40, "transport-optimal": 60}


def agent_de(chemin):
    parties = chemin.split("/")
    if parties[1] == "projet":
        return "camille", None
    if "conv" in parties:
        return "orchestrateur", None
    if "docs_session" in parties:
        return "camille", None
    if "graphe" in parties:
        return "graphiste", None
    if "verification" in parties:
        return "verificateur", None
    if ".tmp" in parties:
        return "orchestrateur", None
    if "directeurs" in parties:
        directeur = parties[parties.index("directeurs") + 1]
        if "litterature" in parties:
            return "litterature", directeur
        if "figures" in parties or "scripts" in parties:
            return "experimentateur", directeur
        if parties[-1] in ("journal.md", "rapport.md", "rapport.pdf"):
            return "directeur_de_labo", directeur
        return "litterature" if parties[-1].endswith(".md") else "experimentateur", directeur
    return "orchestrateur", None


def genre_de(nom):
    ext = nom.rsplit(".", 1)[-1].lower()
    return {
        "md": "markdown", "pdf": "pdf", "png": "image", "svg": "image", "jpg": "image",
        "py": "code", "csv": "donnees", "json": "json", "log": "texte",
    }.get(ext, "texte")


def date_de(chemin, minutes):
    parties = chemin.split("/")
    if parties[1] == "sessions":
        _, jours, heure = SESSIONS[parties[2]]
        debut = (MAINTENANT - timedelta(days=jours)).replace(hour=heure, minute=0)
        return debut + timedelta(minutes=minutes)
    return (MAINTENANT - timedelta(days=PROJET_DATE[parties[0]])).replace(hour=10, minute=0) + timedelta(minutes=minutes)


def main():
    if RACINE.exists():
        shutil.rmtree(RACINE)
    entrees = []
    for chemin, f in fichiers.items():
        cible = RACINE / chemin
        cible.parent.mkdir(parents=True, exist_ok=True)
        if "contenu" in f:
            cible.write_text(f["contenu"], encoding="utf-8")
        else:
            f["ecrire"](cible)
        agent, directeur = agent_de(chemin)
        parties = chemin.split("/")
        entrees.append({
            "chemin": chemin,
            "taille": cible.stat().st_size,
            "modifie": date_de(chemin, f["minutes"]).isoformat(timespec="minutes"),
            "agent": agent,
            "directeur": directeur,
            "projet": parties[0],
            "session": parties[2] if parties[1] == "sessions" else None,
            "genre": genre_de(parties[-1]),
        })
    # Les dossiers vides du bunker (.tmp, scripts, docs_session) existent dans chaque session.
    dossiers_vides = []
    for sid, (projet, _, _) in SESSIONS.items():
        for sous in ("conv", "docs_session", "scripts", ".tmp"):
            d = RACINE / projet / "sessions" / sid / sous
            if not d.exists():
                d.mkdir(parents=True)
                dossiers_vides.append(f"{projet}/sessions/{sid}/{sous}")
            (d / ".gitkeep").touch() if not any(d.iterdir()) else None
    manifeste = {"utilisateur": "camille", "racine": "espace/utilisateurs/camille", "fichiers": entrees, "dossiers_vides": dossiers_vides}
    (COMMUN / "manifeste.js").write_text(
        "// Généré par outils/generer_bunker.py : ne pas modifier à la main.\n"
        f"export const MANIFESTE = {json.dumps(manifeste, ensure_ascii=False, indent=1)}\n",
        encoding="utf-8",
    )
    print(f"{len(entrees)} fichiers, {len(dossiers_vides)} dossiers vides")


if __name__ == "__main__":
    main()
