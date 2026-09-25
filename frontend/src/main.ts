// Coquille vide : vérifie seulement que le front, l'API et Supabase répondent.
import './style.css'

interface Sante {
  ok: boolean
  supabase: string
}

interface Graphe {
  noeuds: unknown[]
  aretes: unknown[]
}

async function lire<T>(chemin: string): Promise<T> {
  const r = await fetch(chemin)
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

async function afficher(racine: HTMLElement) {
  racine.innerHTML = '<h1>Atlas</h1><p>Vérification…</p>'
  const lignes: string[] = ['<li>Front : ok</li>']
  try {
    const sante = await lire<Sante>('/api/health')
    lignes.push(`<li>API : ok</li><li>Supabase : ${sante.supabase}</li>`)
    const graphe = await lire<Graphe>('/api/graphe')
    lignes.push(`<li>Graphe : ${graphe.noeuds.length} nœuds, ${graphe.aretes.length} arêtes</li>`)
  } catch (e) {
    lignes.push(`<li class="erreur">${e instanceof Error ? e.message : String(e)}</li>`)
  }
  racine.innerHTML = `<h1>Atlas</h1><ul>${lignes.join('')}</ul>`
}

void afficher(document.querySelector<HTMLElement>('#app')!)
