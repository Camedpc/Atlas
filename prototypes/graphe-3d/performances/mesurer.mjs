// Lance toutes les mesures, une tâche par processus Node (mémoire mesurée proprement, délai maximal),
// et écrit les résultats bruts dans performances/resultats/brut.jsonl (une ligne JSON par tâche).
//
//   node performances/construire.mjs
//   node performances/mesurer.mjs                 # tout (≈ 30 à 60 min selon les délais atteints)
//   node performances/mesurer.mjs page rendu      # seulement certaines familles de tâches
//   DELAI=120 TAILLES=200,1000 node performances/mesurer.mjs
//
// Délai par tâche : DELAI secondes (défaut 240). Une tâche qui le dépasse est notée { depasse: true }.
// Mémoire : --max-old-space-size=1500 (machine à mémoire limitée) ; un dépassement est noté { erreur }.

import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const banc = join(ici, '.cache', 'banc.mjs')
const sortie = join(ici, 'resultats', 'brut.jsonl')
mkdirSync(join(ici, 'resultats'), { recursive: true })
const DELAI = Number(process.env.DELAI ?? 240)
const TAILLES = (process.env.TAILLES ?? '200,1000,5000,20000').split(',').map(Number)
const familles = process.argv.slice(2)

const taches = []
for (const N of TAILLES) {
  taches.push(['jeu', N])
  for (const s of ['defaut', 'r36-squelette', 'r36-tout', 'r19-squelette', 'r19-squelette-reduits']) taches.push(['lecture', N, s])
  for (const [v, niv] of [['r36', 'squelette'], ['r36', 'tout'], ['r18', 'auxiliaires'], ['r19', 'squelette'], ['r35', 'squelette']]) taches.push(['page', N, v, niv])
  for (const niv of ['squelette', 'tout']) taches.push(['katex', N, niv])
  for (const [v, niv] of [['r36', 'squelette'], ['r36', 'tout'], ['r18', 'auxiliaires'], ['r19', 'squelette'], ['r35', 'squelette']]) taches.push(['rendu', N, v, niv])
}

/** Tâches déjà dépassées à une taille plus petite : inutile de les relancer plus grand. */
const abandonnees = new Set()
for (const t of taches) {
  const [famille, N, ...args] = t
  if (familles.length && !familles.includes(famille)) continue
  const cle = [famille, ...args].join(' ')
  if (abandonnees.has(cle)) {
    appendFileSync(sortie, JSON.stringify({ tache: famille, N, args, depasse: true, note: 'non lancée : délai déjà dépassé à une taille inférieure' }) + '\n')
    console.log(`${cle} N=${N} : sautée`)
    continue
  }
  const t0 = Date.now()
  const r = spawnSync(process.execPath, ['--expose-gc', '--max-old-space-size=1500', banc, famille, String(N), ...args], {
    encoding: 'utf8', timeout: DELAI * 1000, maxBuffer: 64 * 1024 * 1024,
  })
  const duree = ((Date.now() - t0) / 1000).toFixed(1)
  let ligne
  if (r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM') {
    ligne = { tache: famille, N, args, depasse: true, delaiS: DELAI }
    abandonnees.add(cle)
  } else if (r.status !== 0) {
    ligne = { tache: famille, N, args, erreur: (r.stderr || '').split('\n').filter(Boolean).slice(-4).join(' | ') }
  } else {
    ligne = JSON.parse(r.stdout.trim().split('\n').pop())
  }
  appendFileSync(sortie, JSON.stringify(ligne) + '\n')
  console.log(`${cle} N=${N} : ${ligne.depasse ? `> ${DELAI} s` : ligne.erreur ? 'erreur' : 'ok'} (${duree} s)`)
}
