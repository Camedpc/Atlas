// Barre de contrôle commune à toutes les options : lecture, vitesse, relance, horloge et compteurs.
// Raccourcis : espace = pause, R = relancer, → = +30 s.

import { formatTemps, formatTokens } from './simulation.js'

const VITESSES = [1, 3, 6, 12]

export function monterBarre(sim, { titre, sousTitre = '' }) {
  const barre = document.createElement('header')
  barre.className = 'barre'
  barre.innerHTML = `
    <a class="retour" href="../../index.html">← Options</a>
    <span class="titre">${titre}<small>${sousTitre}</small></span>
    <span class="espace"></span>
    <span class="compteurs">
      <span><i class="pastille" style="background:var(--ok)"></i><b data-c="actifs">0</b> actifs</span>
      <span><b data-c="attente">0</b> en attente</span>
      <span><b data-c="enFile">0</b> en file</span>
      <span><b data-c="termines">0</b> terminés</span>
      <span><i class="pastille" style="background:var(--echec)"></i><b data-c="echecs">0</b></span>
      <span><b data-c="tokens">0</b> tok</span>
    </span>
    <span class="horloge">T+00:00</span>
    <span class="groupe">
      <button data-a="pause" title="Pause (espace)">⏸</button>
      <button data-a="saut" title="+30 s (→)">+30 s</button>
      <button data-a="relancer" title="Nouvelle graine (R)">↺</button>
    </span>
    <span class="groupe vitesses">${VITESSES.map((v) => `<button data-v="${v}">${v}×</button>`).join('')}</span>
  `
  document.body.prepend(barre)

  const horloge = barre.querySelector('.horloge')
  const compteurs = Object.fromEntries([...barre.querySelectorAll('[data-c]')].map((el) => [el.dataset.c, el]))
  const boutonPause = barre.querySelector('[data-a="pause"]')

  const majVitesses = () => barre.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('actif', Number(b.dataset.v) === sim.vitesse))
  const basculer = () => { sim.enPause = !sim.enPause; boutonPause.textContent = sim.enPause ? '▶' : '⏸' }
  majVitesses()

  barre.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.v) { sim.vitesse = Number(b.dataset.v); majVitesses() }
    if (b.dataset.a === 'pause') basculer()
    if (b.dataset.a === 'saut') sim.avancer(30)
    if (b.dataset.a === 'relancer') sim.redemarrer()
  })
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return
    if (e.code === 'Space') { e.preventDefault(); basculer() }
    if (e.key === 'r' || e.key === 'R') sim.redemarrer()
    if (e.key === 'ArrowRight') sim.avancer(30)
  })

  let derniere = 0
  sim.surTic(() => {
    const maintenant = performance.now()
    if (maintenant - derniere < 120) return
    derniere = maintenant
    horloge.textContent = `T+${formatTemps(sim.temps)}${sim.fini ? ' ✓' : ''}`
    const s = sim.stats()
    for (const [cle, el] of Object.entries(compteurs)) el.textContent = cle === 'tokens' ? formatTokens(s.tokens) : s[cle]
  })
  return barre
}
