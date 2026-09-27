// Profil CPU d'une tâche du banc et agrégation du temps propre par fonction (où part le temps).
//
//   node performances/profil.mjs page 5000 r36 tout
//
// Lance `node --cpu-prof` sur .cache/banc.mjs, lit le .cpuprofile produit, additionne le temps propre
// (self time) de chaque fonction et affiche les 20 premières avec leur ligne dans le module assemblé
// (le texte de la ligne permet de retrouver la fonction dans les sources). Résultat JSON aussi écrit
// dans performances/resultats/profil-<tâche>-<N>-<args>.json.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const banc = join(ici, '.cache', 'banc.mjs')
const args = process.argv.slice(2)
const dossier = mkdtempSync(join(tmpdir(), 'profil-'))
const r = spawnSync(process.execPath, ['--cpu-prof', `--cpu-prof-dir=${dossier}`, '--cpu-prof-interval=500', '--max-old-space-size=1500', banc, ...args], {
  encoding: 'utf8', timeout: Number(process.env.DELAI ?? 900) * 1000, maxBuffer: 64 * 1024 * 1024,
})
if (r.status !== 0) {
  console.error(r.stderr || `arrêt (${r.signal ?? r.error?.code})`)
  process.exit(1)
}
const fichier = readdirSync(dossier).find((f) => f.endsWith('.cpuprofile'))
const profil = JSON.parse(readFileSync(join(dossier, fichier), 'utf8'))
rmSync(dossier, { recursive: true, force: true })

const lignes = readFileSync(banc, 'utf8').split('\n')
const parId = new Map(profil.nodes.map((n) => [n.id, n]))
const propre = new Map()
for (let k = 0; k < profil.samples.length; k++) {
  const n = parId.get(profil.samples[k])
  const dt = profil.timeDeltas[k] ?? 0
  const f = n.callFrame
  const cle = `${f.functionName || '(anonyme)'}@${f.url.endsWith('banc.mjs') ? f.lineNumber + 1 : f.url.split('/').pop() || f.url}`
  propre.set(cle, (propre.get(cle) ?? 0) + dt)
}
const total = [...propre.values()].reduce((s, v) => s + v, 0)
const top = [...propre].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([cle, us]) => {
  const [nom, ou] = cle.split('@')
  const ligne = /^\d+$/.test(ou) ? lignes[Number(ou) - 1].trim().slice(0, 110) : ou
  return { fonction: nom, ligneBanc: ou, part: +(us / total * 100).toFixed(1), ms: Math.round(us / 1000), source: ligne }
})
const resultat = { tache: args, totalMs: Math.round(total / 1000), sortie: JSON.parse(r.stdout.trim().split('\n').pop()), top }
writeFileSync(join(ici, 'resultats', `profil-${args.join('-')}.json`), JSON.stringify(resultat, null, 1))
console.log(`total ${resultat.totalMs} ms`)
for (const t of top) console.log(`${String(t.part).padStart(5)} %  ${String(t.ms).padStart(7)} ms  ${t.fonction.padEnd(28)} ${t.source}`)
