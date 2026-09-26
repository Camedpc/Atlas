// Menu contextuel façon Unreal : « Toutes les actions » avec recherche, groupes, navigation au clavier.
// items : [{ groupe, libelle, touche?, couleur?, desactive?, action }]

import { esc } from './modele.js'

const normaliser = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
let courant = null

export const menuOuvert = () => courant !== null

export function fermerMenu() {
  if (!courant) return
  courant.el.remove()
  document.removeEventListener('pointerdown', courant.dehors, true)
  courant = null
}

export function ouvrirMenu({ x, y, titre, recherche = false, items }) {
  fermerMenu()
  const el = document.createElement('div')
  el.className = 'menu'
  el.tabIndex = -1
  el.innerHTML = `
    ${titre ? `<div class="m-titre">${esc(titre)}</div>` : ''}
    ${recherche ? '<div class="m-recherche"><input type="text" placeholder="Rechercher une action…" spellcheck="false" autocomplete="off"></div>' : ''}
    <div class="m-liste"></div>`
  document.body.append(el)
  const liste = el.querySelector('.m-liste')
  const champ = el.querySelector('input')
  let visibles = []
  let actif = 0

  function dessiner() {
    const mots = champ ? normaliser(champ.value.trim()).split(/\s+/).filter(Boolean) : []
    visibles = items.filter((it) => mots.every((m) => normaliser(`${it.groupe ?? ''} ${it.libelle}`).includes(m)))
    actif = Math.min(actif, Math.max(0, visibles.length - 1))
    let html = ''
    let groupe = null
    visibles.forEach((it, i) => {
      if (it.groupe && it.groupe !== groupe) { groupe = it.groupe; html += `<div class="m-groupe">${esc(groupe)}</div>` }
      const pastille = it.couleur ? `<i class="m-pastille" style="background:${it.couleur}"></i>` : ''
      html += `<button type="button" class="m-item${i === actif ? ' actif' : ''}${it.desactive ? ' desactive' : ''}" data-i="${i}">${pastille}<span>${esc(it.libelle)}</span>${it.touche ? `<kbd>${esc(it.touche)}</kbd>` : ''}</button>`
    })
    liste.innerHTML = html || '<div class="m-vide">Aucune action ne correspond</div>'
  }

  function marquer() {
    for (const b of liste.querySelectorAll('.m-item')) b.classList.toggle('actif', Number(b.dataset.i) === actif)
    liste.querySelector('.m-item.actif')?.scrollIntoView({ block: 'nearest' })
  }

  function executer(i) {
    const it = visibles[i]
    if (!it || it.desactive) return
    fermerMenu()
    it.action()
  }

  liste.addEventListener('pointermove', (e) => {
    const b = e.target.closest('.m-item')
    if (b && Number(b.dataset.i) !== actif) { actif = Number(b.dataset.i); marquer() }
  })
  liste.addEventListener('click', (e) => {
    const b = e.target.closest('.m-item')
    if (b) executer(Number(b.dataset.i))
  })
  el.addEventListener('contextmenu', (e) => e.preventDefault())
  el.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'ArrowDown') { e.preventDefault(); actif = Math.min(visibles.length - 1, actif + 1); marquer() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); actif = Math.max(0, actif - 1); marquer() }
    else if (e.key === 'Enter') { e.preventDefault(); executer(actif) }
    else if (e.key === 'Escape') { e.preventDefault(); fermerMenu() }
  })
  champ?.addEventListener('input', () => { actif = 0; dessiner() })
  dessiner()

  const r = el.getBoundingClientRect()
  el.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`
  el.style.top = `${Math.max(8, y + r.height > innerHeight - 8 ? innerHeight - r.height - 8 : y)}px`

  const dehors = (e) => { if (!el.contains(e.target)) fermerMenu() }
  document.addEventListener('pointerdown', dehors, true)
  courant = { el, dehors }
  ;(champ ?? el).focus({ preventScroll: true })
}
