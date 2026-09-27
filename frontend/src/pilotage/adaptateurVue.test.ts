// Adaptateur de la vue 2D : refus de ce que la vue ne sait pas faire, filtres, portée, et lots exécutés par le
// pilote sur une vue simulée (sans canevas). L'état exporté est validé par le schéma P4.

import { describe, expect, it, vi } from 'vitest'
import type { Noeud } from '../api'
import type { VueGraphe } from '../graphe'
import { AdaptateurVue, noeudPasse, portee, refuserCommande, type InterfaceApp } from './adaptateurVue'
import { filtresVides } from './etat'
import { Pilote } from './pilote'
import { validerEtatAffichage, type CommandeBas } from './protocole'

const CONV = '3f2b8c1e-6a4d-4e2f-9b7a-1c2d3e4f5a6b'
const PROJET = '67900866-5415-4cf4-9262-4cd1cd16e06c'

const n = (id: string, enfants: string[] = [], modifs: Partial<Noeud> = {}): Noeud => ({
  projet_id: PROJET, id, nom: `Nom de ${id}`, enonce: `Énoncé de ${id}.`, admis: false, type: 'lemme', details: null,
  parents: [], enfants, conversation_id: null, statut: 'etabli', demonstrations: [], ...modifs,
})

// ax → lem → thm → cor ; hyp → thm ; isole.
const NOEUDS = [
  n('ax', ['lem'], { type: 'axiome' }), n('lem', ['thm'], { conversation_id: CONV }), n('hyp', ['thm'], { statut: 'suspendu' }),
  n('thm', ['cor'], { type: 'theoreme', conversation_id: CONV }), n('cor'), n('isole'), n('Id-Hors-Protocole'),
]

/** Vue simulée : garde ce que le pilotage lui demande. */
function fausseVue() {
  const v = {
    noeuds: NOEUDS, projet: PROJET, noeudSelectionne: null as string | null, noeudSurvole: null as string | null,
    camera: { x: 100, y: 50, z: 1 }, surlignes: [] as string[], filtre: null as ((x: Noeud) => boolean) | null,
    cadres: [] as string[][], toutCadre: 0,
    selectionner: vi.fn((id: string | null) => (v.noeudSelectionne = id)),
    surligner: vi.fn((ids: string[]) => (v.surlignes = [...ids].sort())),
    definirFiltre: vi.fn((f: ((x: Noeud) => boolean) | null) => (v.filtre = f)),
    placerCamera: vi.fn((x: number, y: number, z: number) => (v.camera = { x, y, z })),
    zoomerDe: vi.fn((f: number) => (v.camera = { ...v.camera, z: v.camera.z * f })),
    cadrerNoeuds: vi.fn((ids: string[]) => (v.cadres.push([...ids]), ids.length > 0)),
    cadrerGraphe: vi.fn(() => v.toutCadre++),
    visibles: () => [{ id: 'thm', nom: 'Théorème', x: 10, y: 20 }, { id: 'Id-Hors-Protocole', nom: 'x', x: 0, y: 0 }],
  }
  return v
}

function installer() {
  const vue = fausseVue()
  let fiche: string | null = null
  let panneau = true
  const app: InterfaceApp = {
    fiche: () => fiche, definirFiche: (id) => (fiche = id), panneauOuvert: () => panneau, definirPanneau: (o) => (panneau = o),
    conversationAffichee: () => CONV, recharger: vi.fn(async () => undefined),
  }
  const adaptateur = new AdaptateurVue(vue as unknown as VueGraphe, app, 'ecran_test', 'anonyme')
  return { vue, app, adaptateur, pilote: new Pilote(adaptateur) }
}

describe('ce que la vue 2D ne sait pas faire', () => {
  it.each<[CommandeBas, boolean]>([
    [{ op: 'mode', mode: '3d' }, true], [{ op: 'mode', mode: '2d' }, false],
    [{ op: 'vue', nom: 'iso' }, true], [{ op: 'vue', nom: 'face' }, false],
    [{ op: 'orbiter', d_azimut_deg: 10, d_elevation_deg: 0 }, true],
    [{ op: 'strategie', id: 'complet' }, true], [{ op: 'strategie', id: 'defaut' }, false],
    [{ op: 'parametres_lecture', patch: { masquer_contexte: true } }, true], [{ op: 'liens_complets', oui: true }, true],
    [{ op: 'theme', theme: 'sombre' }, true], [{ op: 'zoomer', facteur: 2 }, false], [{ op: 'cadrer', cibles: 'tout' }, false],
  ])('%j → refus %s', (c, refus) => {
    const e = refuserCommande(c)
    expect(e !== null).toBe(refus)
    if (e) expect(e).toMatchObject({ code: 'etat_invalide', message: expect.stringContaining('Non pris en charge') })
  })
})

describe('filtres et portée', () => {
  it('un nœud passe tous les critères actifs', () => {
    const f = { ...filtresVides(), conversation: CONV }
    expect(NOEUDS.filter((x) => noeudPasse(x, f)).map((x) => x.id)).toEqual(['lem', 'thm'])
    expect(noeudPasse(n('a'), { ...filtresVides(), types: ['theoreme'] })).toBe(false)
    expect(noeudPasse(n('thm', [], { type: 'theoreme' }), { ...filtresVides(), types: ['theoreme'], texte: 'ÉNONCÉ de thm' })).toBe(true)
    const periode = { ...filtresVides(), periode: { debut: '2026-09-27', fin: null } }
    expect(noeudPasse({ ...n('a'), cree_le: '2026-09-27T08:00:00Z' } as Noeud, periode)).toBe(true)
    expect(noeudPasse(n('a'), periode)).toBe(false) // pas de date : ne passe pas un filtre de période
  })

  it('la portée suit les conséquences', () => {
    expect(portee(NOEUDS, 'lem')).toEqual(['cor', 'lem', 'thm'])
    expect(portee(NOEUDS, 'isole')).toEqual(['isole'])
  })
})

describe('lots exécutés sur la vue 2D', () => {
  it('filtre, sélection, surlignage, fiche, cadrage et caméra ; état exporté conforme à P4', async () => {
    const { vue, pilote } = installer()
    const cr = await pilote.commander(
      { op: 'filtres', patch: { noeuds: ['thm', 'lem'], mode: 'masquer' } },
      { op: 'selectionner', cible: { noeud: 'thm' } },
      { op: 'surligner', cibles: [{ noeud: 'ax' }] },
      { op: 'fiche', cible: { noeud: 'thm' } },
      { op: 'cadrer', cibles: 'tout' },
      { op: 'zoomer', facteur: 2 },
      { op: 'panneau', ouvert: false },
    )
    expect(cr.ok).toBe(true)
    expect(NOEUDS.filter((x) => vue.filtre!(x)).map((x) => x.id)).toEqual(['lem', 'thm'])
    expect(vue.cadres.at(-1)).toEqual(['lem', 'thm']) // « tout » = ce qui passe les filtres
    expect(vue.surlignes).toEqual(['ax'])
    const e = cr.etat!
    expect(validerEtatAffichage(e)).toMatchObject({ ok: true })
    expect(e).toMatchObject({
      selection: { noeud: 'thm' }, surlignes: ['ax'], fiche: { noeud: 'thm' }, panneau_ouvert: false, projet: PROJET,
      camera: { mode: '2d', vue: 'face', cible: [100, 50, 0], distance: 0.5 }, conversation_affichee: CONV,
      filtres: { noeuds: ['thm', 'lem'], mode: 'masquer' }, visibles: [{ noeud: 'thm', libelle: 'Théorème', x: 10, y: 20 }],
    })
  })

  it('portée : sélection et conséquences surlignées ; restaurer ramène la caméra', async () => {
    const { vue, pilote } = installer()
    const avant = pilote.etat()
    await pilote.commander({ op: 'portee', cible: { noeud: 'lem' } }, { op: 'zoomer', facteur: 4 })
    expect(vue.noeudSelectionne).toBe('lem')
    expect(vue.surlignes).toEqual(['cor', 'lem', 'thm'])
    expect(pilote.etat().portee).toEqual({ noeud: 'lem' })
    const cr = await pilote.commander({ op: 'restaurer', etat: avant })
    expect(cr.ok).toBe(true)
    expect(vue.camera).toEqual({ x: 100, y: 50, z: 1 })
    expect(vue.noeudSelectionne).toBe(null)
    expect(vue.surlignes).toEqual([])
  })

  it('refus atomique : rien ne bouge ; non atomique : le reste passe', async () => {
    const { vue, pilote } = installer()
    let cr = await pilote.commander({ op: 'zoomer', facteur: 2 }, { op: 'mode', mode: '3d' })
    expect(cr.ok).toBe(false)
    expect(cr.resultats).toEqual([{ index: 1, ok: false, erreur: expect.objectContaining({ code: 'etat_invalide' }) }])
    expect(vue.zoomerDe).not.toHaveBeenCalled()

    cr = await pilote.executer(pilote.lot(
      [{ op: 'mode', mode: '3d' }, { op: 'zoomer', facteur: 2 }, { op: 'cadrer', cibles: [{ noeud: 'inconnu' }] }], { atomique: false }))
    expect(cr.ok).toBe(false)
    expect(cr.resultats.map((r) => [r.index, r.ok])).toEqual([[0, false], [1, true], [2, false]])
    expect(vue.zoomerDe).toHaveBeenCalledWith(2)
  })

  it('un geste de l\'utilisateur prévient le pilote, une image identique non', () => {
    const { vue, adaptateur } = installer()
    const f = vi.fn()
    adaptateur.surChangement(f)
    adaptateur.apresImage()
    adaptateur.apresImage()
    vue.camera = { x: 300, y: 50, z: 1 }
    adaptateur.apresImage()
    expect(f).toHaveBeenCalledTimes(2)
  })
})
