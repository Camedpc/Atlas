import { Download, Play, ShieldCheck, Square, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type Sante } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Interroge /health pour savoir si un agent tourne (null = back injoignable). */
function useSante(intervalleMs = 3000) {
  const [sante, setSante] = useState<Sante | null>(null)
  useEffect(() => {
    let actif = true
    const tick = async () => {
      try {
        const s = await api.sante()
        if (actif) setSante(s)
      } catch {
        if (actif) setSante(null)
      }
    }
    void tick()
    const t = setInterval(tick, intervalleMs)
    return () => {
      actif = false
      clearInterval(t)
    }
  }, [intervalleMs])
  return sante
}

async function lancer(action: () => Promise<unknown>, succes: string) {
  try {
    await action()
    toast.success(succes)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e))
  }
}

export function BarreActions() {
  const [objectif, setObjectif] = useState('')
  const sante = useSante()
  const fichier = useRef<HTMLInputElement>(null)
  const enCours = sante?.run != null

  // Notifie la fin d'un run avec son résultat.
  const etaitEnCours = useRef(false)
  useEffect(() => {
    if (!sante) return
    if (etaitEnCours.current && !enCours && sante.dernier_resultat) {
      const r = sante.dernier_resultat
      if (r.startsWith('Erreur')) toast.error(r)
      else toast.info(r, { duration: 10000 })
    }
    etaitEnCours.current = enCours
  }, [sante, enCours])

  const exporter = () =>
    lancer(async () => {
      const graphe = await api.exporter()
      const blob = new Blob([JSON.stringify(graphe, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `graphe-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    }, 'Graphe exporté')

  const importer = (f: File) =>
    lancer(async () => api.importer(JSON.parse(await f.text())), 'Import envoyé')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="flex min-w-72 flex-1 gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (objectif.trim()) void lancer(() => api.resoudre(objectif.trim()), 'Chercheur lancé')
        }}
      >
        <Input
          value={objectif}
          onChange={(e) => setObjectif(e.target.value)}
          placeholder="Objectif : énoncé à démontrer ou id d’un nœud…"
        />
        <Button type="submit" disabled={!objectif.trim() || enCours}>
          <Play /> Résoudre
        </Button>
      </form>
      <Button variant="outline" disabled={enCours} onClick={() => void lancer(() => api.verifier(), 'Vérificateur lancé')}>
        <ShieldCheck /> Vérifier
      </Button>
      <Button variant="destructive" disabled={!enCours} onClick={() => void lancer(api.stop, 'Arrêt demandé')}>
        <Square /> Stop
      </Button>
      <Button variant="outline" onClick={() => void exporter()}>
        <Download /> Export JSON
      </Button>
      <Button variant="outline" onClick={() => fichier.current?.click()}>
        <Upload /> Import
      </Button>
      <input
        ref={fichier}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importer(f)
          e.target.value = ''
        }}
      />
      <span
        className={cn(
          'ml-auto flex items-center gap-1.5 text-xs',
          sante ? 'text-muted-foreground' : 'text-red-600',
        )}
      >
        <span
          className={cn(
            'size-2 rounded-full',
            !sante ? 'bg-red-500' : enCours ? 'animate-pulse bg-violet-500' : 'bg-emerald-500',
          )}
        />
        {!sante
          ? 'Back injoignable'
          : enCours
            ? `${sante.run!.type} en cours… ${sante.run!.detail}`
            : 'Back prêt'}
      </span>
    </div>
  )
}
