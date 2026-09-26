// Catalogue : liste automatiquement les visions (raisonnement/*/meta.json, en tête) et les
// variantes de la série précédente (variantes/*/meta.json).

import './catalogue.css'

interface Meta {
  id: string
  titre: string
  resume: string
  idees?: string[]
  ordre?: number
}

const lister = (modules: Record<string, Meta>) =>
  Object.entries(modules)
    .map(([chemin, meta]) => ({ ...meta, dossier: chemin.split('/').slice(-2, -1)[0]! }))
    .sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99) || a.titre.localeCompare(b.titre, 'fr'))

const visions = lister(import.meta.glob<Meta>('../raisonnement/*/meta.json', { eager: true, import: 'default' }))
const variantes = lister(import.meta.glob<Meta>('../variantes/*/meta.json', { eager: true, import: 'default' }))

const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const carte = (serie: string, v: Meta & { dossier: string }) => `
      <a class="carte" href="./${serie}/${encodeURIComponent(v.dossier)}/index.html">
        <img class="apercu" src="./apercus/${encodeURIComponent(v.dossier)}.jpg" alt="" loading="lazy" onerror="this.remove()">
        <div class="carte-entete"><h2>${echapper(v.titre)}</h2><span class="id">${echapper(v.id)}</span></div>
        <p>${echapper(v.resume)}</p>
        ${v.idees?.length ? `<ul>${v.idees.map((i) => `<li>${echapper(i)}</li>`).join('')}</ul>` : ''}
        <span class="ouvrir">Ouvrir →</span>
      </a>`

document.getElementById('catalogue')!.innerHTML = `
  <header>
    <p class="surtitre">Atlas · prototypes de visualisation</p>
    <h1>Graphe de recherche : prototypes</h1>
    <p class="chapo">Deux séries sur un socle commun (sigma.js + graphology, caméra façon Blender).
    La nouvelle série lit un <b>raisonnement</b> de gauche à droite ; la précédente agrège tout le graphe.</p>
  </header>
  <section class="serie">
    <h2 class="serie-titre">Graphe de raisonnement</h2>
    <p class="serie-chapo">Le graphe de lecture est dérivé du graphe de justification (rôles des prémisses,
    réduction transitive, fusion des chaînes) et disposé de gauche à droite ; la 3D écarte les couches de type.
    Fondations : <code>src/raisonnement</code> · cahier : <code>RAISONNEMENT.md</code>.</p>
    <div class="grille">${visions.map((v) => carte('raisonnement', v)).join('')}</div>
  </section>
  <section class="serie">
    <h2 class="serie-titre">Série précédente · agrégation et faces</h2>
    <p class="serie-chapo">Agrégation par granularité, trois faces lisibles (thématique, temporelle, par type),
    navigation 3D façon Blender, lignée au clic. Moteur : <code>src/core</code>.</p>
    <div class="grille">${variantes.map((v) => carte('variantes', v)).join('')}</div>
  </section>
  <footer>${visions.length} vision(s) de raisonnement · ${variantes.length} variante(s) · données synthétiques déterministes</footer>
`
