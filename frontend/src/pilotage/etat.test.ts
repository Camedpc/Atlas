import { describe, expect, it } from 'vitest'
import { appliquer, appliquerLot, construireIndex, estErreur, filtresVides, type Application } from './etat'
import { VALIDATEURS, type CommandeBas, type EtatAffichage, type LotCommandes } from './protocole'

const CONV = '3f2b8c1e-6a4d-4e2f-9b7a-1c2d3e4f5a6b'
const AUTRE = '11111111-2222-4333-8444-555555555555'

const INDEX = construireIndex([
  { id: 'def_pair', conversation: null },
  { id: 'lemme_b', conversation: CONV },
  { id: 'lemme_a', conversation: CONV },
  { id: 'theoreme_principal', conversation: CONV },
  { id: 'choix_jauge', conversation: null },
  { id: 'lemme_compacite', conversation: null },
])

const ETAT: EtatAffichage = {
  version: 1, ecran: 'ecran_test', utilisateur_id: 'u1', version_donnees: 'v1', strategie: 'defaut', parametres_lecture: {},
  liens_complets: false,
  camera: { mode: '2d', vue: 'face', orientation: [0, 0, 0, 1], cible: [0, 0, 0], distance: 2 },
  selection: null, portee: null, surlignes: [], filtres: filtresVides(), fiche: null, panneau_ouvert: true, theme: 'clair',
  visibles: [{ noeud: 'lemme_a', libelle: 'Lemme A', x: 10, y: 20 }], survol: null, conversation_affichee: CONV,
}

function ok(etat: EtatAffichage, c: CommandeBas): Application {
  const r = appliquer(etat, c, INDEX)
  if (estErreur(r)) throw new Error(`${r.code} : ${r.message}`)
  expect(VALIDATEURS['p4-etat-affichage'](r.etat), JSON.stringify(VALIDATEURS['p4-etat-affichage'].errors)).toBe(true)
  return r
}

function code(etat: EtatAffichage, c: CommandeBas): string {
  const r = appliquer(etat, c, INDEX)
  return estErreur(r) ? r.code : 'ok'
}

describe('appliquer', () => {
  it('lecture : stratégie, paramètres fusionnés, liens complets', () => {
    expect(ok(ETAT, { op: 'strategie', id: 'complet' }).etat.strategie).toBe('complet')
    const p = ok(ok(ETAT, { op: 'parametres_lecture', patch: { demonstrations: 'principale' } }).etat,
      { op: 'parametres_lecture', patch: { longueur_max_chaine: 4 } }).etat.parametres_lecture
    expect(p).toEqual({ demonstrations: 'principale', longueur_max_chaine: 4 })
    expect(code(ETAT, { op: 'parametres_lecture', patch: { longueur_min_chaine: 5, longueur_max_chaine: 3 } })).toBe('invalide')
    expect(ok(ETAT, { op: 'liens_complets', oui: true }).etat.liens_complets).toBe(true)
  })

  it('caméra : mode, vue, orbite seulement en 3D, zoom', () => {
    const e3 = ok(ETAT, { op: 'mode', mode: '3d' }).etat
    expect(e3.camera).toMatchObject({ mode: '3d', vue: null })
    expect(ok(e3, { op: 'mode', mode: '2d' }).etat.camera).toMatchObject({ mode: '2d', vue: 'face' })
    // La face en 2D reste en 2D, toute autre vue passe en 3D.
    expect(ok(ETAT, { op: 'vue', nom: 'face' }).etat.camera.mode).toBe('2d')
    const iso = ok(ETAT, { op: 'vue', nom: 'iso' })
    expect(iso.etat.camera).toMatchObject({ mode: '3d', vue: 'iso' })
    expect(iso.effet).toEqual({ genre: 'vue', nom: 'iso' })
    expect(code(ETAT, { op: 'orbiter', d_azimut_deg: 30, d_elevation_deg: 0 })).toBe('etat_invalide')
    const orb = ok(iso.etat, { op: 'orbiter', d_azimut_deg: 30, d_elevation_deg: -10 })
    expect(orb.etat.camera.vue).toBeNull()
    expect(orb.effet).toEqual({ genre: 'orbiter', d_azimut_deg: 30, d_elevation_deg: -10 })
    expect(ok(ETAT, { op: 'zoomer', facteur: 2 }).effet).toEqual({ genre: 'zoomer', facteur: 2 })
  })

  it('cadrer : nœuds et conversations résolus, dédoublonnés et triés', () => {
    const r = ok(ETAT, { op: 'cadrer', cibles: [{ noeud: 'lemme_b' }, { conversation: CONV }] })
    expect(r.effet).toEqual({ genre: 'cadrer', noeuds: ['lemme_b', 'lemme_a', 'theoreme_principal'] })
    expect(ok(ETAT, { op: 'cadrer', cibles: 'tout' }).effet).toEqual({ genre: 'cadrer', tout: true })
    expect(code(ETAT, { op: 'cadrer', cibles: 'selection' })).toBe('etat_invalide')
    const sel = ok(ETAT, { op: 'selectionner', cible: { noeud: 'lemme_a' } }).etat
    expect(ok(sel, { op: 'cadrer', cibles: 'selection' }).effet).toEqual({ genre: 'cadrer', selection: true })
    expect(code(ETAT, { op: 'cadrer', cibles: [{ noeud: 'inconnu' }] })).toBe('introuvable')
    expect(code(ETAT, { op: 'cadrer', cibles: [{ conversation: AUTRE }] })).toBe('introuvable')
  })

  it('sélection, portée, surlignage', () => {
    const sel = ok(ETAT, { op: 'selectionner', cible: { noeud: 'lemme_a' } }).etat
    expect(sel.selection).toEqual({ noeud: 'lemme_a' })
    const portee = ok(sel, { op: 'portee', cible: { noeud: 'choix_jauge' } }).etat
    expect([portee.selection, portee.portee]).toEqual([{ noeud: 'choix_jauge' }, { noeud: 'choix_jauge' }])
    // Une sélection efface la portée.
    expect(ok(portee, { op: 'selectionner', cible: { noeud: 'lemme_b' } }).etat.portee).toBeNull()
    expect(ok(portee, { op: 'selectionner', cible: null }).etat).toMatchObject({ selection: null, portee: null })
    expect(code(ETAT, { op: 'selectionner', cible: { noeud: 'inconnu' } })).toBe('introuvable')
    expect(code(ETAT, { op: 'portee', cible: { noeud: 'inconnu' } })).toBe('introuvable')
    const s = ok(ETAT, { op: 'surligner', cibles: [{ noeud: 'lemme_b' }, { noeud: 'lemme_a' }, { noeud: 'lemme_b' }] }).etat
    expect(s.surlignes).toEqual(['lemme_b', 'lemme_a'])
    expect(ok(s, { op: 'surligner', cibles: [] }).etat.surlignes).toEqual([])
    expect(code(ETAT, { op: 'surligner', cibles: [{ noeud: 'inconnu' }] })).toBe('introuvable')
  })

  it('filtres : fusion superficielle, {} ne change rien, effacement', () => {
    const f = ok(ETAT, { op: 'filtres', patch: { statuts: ['suspendu'], mode: 'estomper' } }).etat
    expect(f.filtres).toEqual({ ...filtresVides(), statuts: ['suspendu'], mode: 'estomper' })
    expect(ok(f, { op: 'filtres', patch: {} }).etat).toEqual(f)
    expect(ok(f, { op: 'filtres', patch: { conversation: CONV } }).etat.filtres.statuts).toEqual(['suspendu'])
    expect(ok(f, { op: 'effacer_filtres' }).etat.filtres).toEqual(filtresVides())
  })

  it('interface : fiche, panneau, thème, rechargement', () => {
    expect(ok(ETAT, { op: 'fiche', cible: { noeud: 'lemme_a' } }).etat.fiche).toEqual({ noeud: 'lemme_a' })
    expect(code(ETAT, { op: 'fiche', cible: { noeud: 'inconnu' } })).toBe('introuvable')
    expect(ok(ETAT, { op: 'panneau', ouvert: false }).etat.panneau_ouvert).toBe(false)
    expect(ok(ETAT, { op: 'theme', theme: 'sombre' }).etat.theme).toBe('sombre')
    const r = ok(ETAT, { op: 'recharger_donnees' })
    expect(r.etat).toEqual(ETAT)
    expect(r.effet).toEqual({ genre: 'recharger' })
  })

  it('restaurer : tout sauf identité, données, visibles, survol et conversation ouverte', () => {
    const cible: EtatAffichage = {
      ...ETAT, ecran: 'autre', utilisateur_id: 'u2', version_donnees: 'v0', strategie: 'complet', liens_complets: true,
      camera: { mode: '3d', vue: null, orientation: [0.1, 0.2, 0.3, 0.927], cible: [1, 2, 3], distance: 5 },
      selection: { noeud: 'lemme_a' }, surlignes: ['lemme_b'], fiche: { noeud: 'lemme_a' }, theme: 'sombre',
      visibles: [], survol: { noeud: 'lemme_b' }, conversation_affichee: null,
    }
    const r = ok(ETAT, { op: 'restaurer', etat: cible })
    expect(r.etat).toEqual({ ...cible, ecran: ETAT.ecran, utilisateur_id: 'u1', version_donnees: 'v1', visibles: ETAT.visibles, survol: null, conversation_affichee: CONV })
    expect(r.effet).toEqual({ genre: 'camera', camera: cible.camera })
    expect(code(ETAT, { op: 'restaurer', etat: { ...cible, fiche: { noeud: 'disparu' } } })).toBe('introuvable')
    expect(code(ETAT, { op: 'restaurer', etat: { ...cible, surlignes: ['disparu'] } })).toBe('introuvable')
  })

  it('ne modifie jamais l’état reçu', () => {
    const copie = structuredClone(ETAT)
    appliquer(ETAT, { op: 'filtres', patch: { statuts: ['etabli'] } }, INDEX)
    appliquer(ETAT, { op: 'mode', mode: '3d' }, INDEX)
    appliquer(ETAT, { op: 'selectionner', cible: { noeud: 'lemme_a' } }, INDEX)
    expect(ETAT).toEqual(copie)
  })
})

describe('appliquerLot', () => {
  const lot: CommandeBas[] = [
    { op: 'selectionner', cible: { noeud: 'lemme_a' } },
    { op: 'portee', cible: { noeud: 'inconnu' } },
    { op: 'theme', theme: 'sombre' },
  ]

  it('atomique : une erreur annule tout, les résultats s’arrêtent à la commande fautive', () => {
    const r = appliquerLot(ETAT, lot, INDEX)
    expect(r.ok).toBe(false)
    expect(r.etat).toBe(ETAT)
    expect(r.applications).toEqual([])
    expect(r.resultats.map((x) => [x.index, x.ok, x.erreur?.code])).toEqual([[0, true, undefined], [1, false, 'introuvable']])
  })

  it('non atomique : la commande fautive est sautée', () => {
    const r = appliquerLot(ETAT, lot, INDEX, false)
    expect(r.ok).toBe(false)
    expect(r.etat).toMatchObject({ selection: { noeud: 'lemme_a' }, theme: 'sombre' })
    expect(r.applications.map((a) => a !== null)).toEqual([true, false, true])
    expect(r.resultats.map((x) => x.ok)).toEqual([true, false, true])
  })

  it('est déterministe', () => {
    const cmds: CommandeBas[] = [{ op: 'mode', mode: '3d' }, { op: 'vue', nom: 'iso' }, { op: 'cadrer', cibles: [{ conversation: CONV }] }]
    expect(appliquerLot(ETAT, cmds, INDEX)).toEqual(appliquerLot(ETAT, cmds, INDEX))
  })

  it('accepte les lots valides des exemples du protocole (données qui contiennent leurs nœuds)', () => {
    const exemples = import.meta.glob('../../../protocoles/exemples/p3-lot-commandes/valides/*.json', { eager: true, import: 'default' })
    for (const [chemin, brut] of Object.entries(exemples)) {
      const l = brut as LotCommandes
      const ids = new Set(['lemme_compacite', 'theoreme_principal', 'choix_jauge', 'lemme_a'])
      const index = construireIndex([...ids].map((id) => ({ id, conversation: CONV })))
      const r = appliquerLot({ ...ETAT, selection: { noeud: 'lemme_a' } }, l.commandes, index, l.atomique ?? true)
      expect(r.ok, `${chemin} : ${JSON.stringify(r.resultats.filter((x) => !x.ok))}`).toBe(true)
    }
  })
})
