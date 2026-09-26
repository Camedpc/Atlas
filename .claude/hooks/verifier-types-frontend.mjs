// Hook PostToolUse (Write|Edit) : vérifie les types du front quand un .ts de frontend/ change.
// Renvoie les erreurs tsc à Claude ; silencieux sinon.
import { execSync } from 'node:child_process'
import path from 'node:path'

let entree = ''
for await (const morceau of process.stdin) entree += morceau

const { tool_input: outil = {} } = JSON.parse(entree || '{}')
const fichier = (outil.file_path ?? '').replaceAll('\\', '/')
if (!/(^|\/)frontend\/src\/.*\.tsx?$/.test(fichier)) process.exit(0)

const racine = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
try {
  execSync('npx tsc --noEmit -p .', { cwd: path.join(racine, 'frontend'), stdio: 'pipe' })
} catch (e) {
  const sortie = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim()
  console.log(JSON.stringify({
    decision: 'block',
    reason: `tsc --noEmit (frontend) a échoué :\n${sortie.slice(0, 4000)}`,
  }))
}
