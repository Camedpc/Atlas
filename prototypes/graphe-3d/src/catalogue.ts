// Catalogue : liste automatiquement les variantes à partir de variantes/*/meta.json.

import './catalogue.css'

interface Meta {
  id: string
  titre: string
  resume: string
  idees?: string[]
  ordre?: number
}

const modules = import.meta.glob<Meta>('../variantes/*/meta.json', { eager: true, import: 'default' })

const variantes = Object.entries(modules)
  .map(([chemin, meta]) => ({ ...meta, dossier: chemin.split('/').slice(-2, -1)[0]! }))
  .sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99) || a.titre.localeCompare(b.titre, 'fr'))

const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

document.getElementById('catalogue')!.innerHTML = `
  <header>
    <p class="surtitre">Atlas · branche visu/graphe-3d</p>
    <h1>Prototypes de visualisation du graphe de recherche</h1>
    <p class="chapo">Agrégation par granularité, trois faces lisibles (thématique, temporelle, par type),
    navigation 3D façon Blender, lignée au clic. Chaque variante partage le même moteur
    (<code>src/core</code>) et explore une idée visuelle.</p>
  </header>
  <section class="grille">
    ${variantes
      .map(
        (v) => `
      <a class="carte" href="./variantes/${encodeURIComponent(v.dossier)}/index.html">
        <div class="carte-entete"><h2>${echapper(v.titre)}</h2><span class="id">${echapper(v.id)}</span></div>
        <p>${echapper(v.resume)}</p>
        ${v.idees?.length ? `<ul>${v.idees.map((i) => `<li>${echapper(i)}</li>`).join('')}</ul>` : ''}
        <span class="ouvrir">Ouvrir →</span>
      </a>`,
      )
      .join('')}
  </section>
  <footer>${variantes.length} variante(s) · données synthétiques déterministes (~1 200 nœuds)</footer>
`
