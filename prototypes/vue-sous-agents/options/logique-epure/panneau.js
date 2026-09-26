// Panneau « Détails » éditable, comme celui d'Unreal : il montre l'élément sélectionné (assertion, lien de
// démonstration, boîte Comment, sélection multiple) ou, sans sélection, le problème et la légende.
// Saisie → ctx.modifie() (le graphe suit en direct) ; fin de saisie → ctx.valider() (une étape d'historique).

import { STATUTS, VALIDITES } from '../../commun/raisonnement.js'
import { COULEURS, esc, fmtConfiance } from './modele.js'

const LEGENDE_FIL = {
  valide: '<path d="M2 6H46" stroke="var(--v-valide)" stroke-width="1.5"/>',
  a_verifier: '<path d="M2 6H46" stroke="var(--v-a_verifier)" stroke-width="1.5" stroke-dasharray="5 4"/>',
  invalide: '<path d="M2 6H46" stroke="var(--v-invalide)" stroke-width="1.25"/><circle cx="24" cy="6" r="5.5" fill="#fff"/><path d="M21.2 3.2L26.8 8.8M26.8 3.2L21.2 8.8" stroke="var(--v-invalide)" stroke-width="1.4"/>',
}

const LEGENDE_MINI = {
  valide: '<path d="M1 6H17" stroke="var(--v-valide)" stroke-width="1.5"/>',
  a_verifier: '<path d="M1 6H17" stroke="var(--v-a_verifier)" stroke-width="1.5" stroke-dasharray="4 3"/>',
  invalide: '<path d="M1 6H17" stroke="var(--v-invalide)" stroke-width="1.25"/><path d="M6.5 3.5L11.5 8.5M11.5 3.5L6.5 8.5" stroke="var(--v-invalide)" stroke-width="1.4"/>',
}

const RACCOURCIS = [
  ['Glisser le fond · clic droit maintenu', 'Se déplacer'],
  ['Molette', 'Zoom centré sur le curseur'],
  ['Maj + glisser', 'Sélection rectangle'],
  ['F', 'Cadrer la sélection ou tout'],
  ['Clic droit', 'Toutes les actions'],
  ['Double-clic sur un titre · F2', 'Renommer'],
  ['Tirer d’une broche', 'Lier (dans le vide : créer)'],
  ['Alt + clic', 'Couper un lien'],
  ['Double-clic sur un fil', 'Point de reroutage'],
  ['C', 'Commentaire autour de la sélection'],
  ['Maj + W A S D', 'Aligner haut, gauche, bas, droite'],
  ['Maj + H · Maj + V', 'Répartir'],
  ['Ctrl + D · Suppr', 'Dupliquer · Supprimer'],
  ['Ctrl + Z · Ctrl + Y', 'Annuler · Rétablir'],
]

export function creerPanneau(racine, ctx) {
  let cleAffichee = null

  function maj() {
    const defil = racine.querySelector('.d-defil')
    const garde = defil ? defil.scrollTop : 0
    const cle = [...ctx.sel()].join(',')
    racine.innerHTML = `<div class="d-onglet">Détails</div><div class="d-defil">${contenu()}</div>`
    if (cle === cleAffichee) racine.querySelector('.d-defil').scrollTop = garde
    cleAffichee = cle
  }

  function contenu() {
    const sel = [...ctx.sel()]
    if (!sel.length) return vide()
    if (sel.length > 1) return multiple(sel)
    const [type, reste] = [sel[0].slice(0, 1), sel[0].slice(2)]
    if (type === 'n') return noeud(ctx.parId(reste))
    if (type === 'c') return commentaire(ctx.commentaire(reste))
    const [dId, p] = reste.split('|')
    return fil(ctx.demo(dId), p, type === 'r')
  }

  // ─── Sans sélection ───────────────────────────────────────────────────────────────────────────────

  function vide() {
    const e = ctx.etat()
    const statuts = ctx.statuts()
    const compte = {}
    for (const s of Object.values(statuts)) compte[s] = (compte[s] ?? 0) + 1
    return `
      <div class="d-tete"><span class="d-type">Graphe</span><div class="d-nom-fixe">Résolution de problème</div></div>
      <section><h3>Problème</h3><textarea data-probleme rows="3">${esc(e.probleme)}</textarea></section>
      <section><h3>Statuts <small>recalculés en direct</small></h3>
        <ul class="d-comptes">${Object.entries(STATUTS).map(([k, s]) => `<li><i class="pt" style="background:${s.couleur}"></i>${s.libelle}<b>${compte[k] ?? 0}</b></li>`).join('')}</ul>
        <p class="d-note">${e.noeuds.length} assertions · ${e.demonstrations.length} démonstrations · ${e.commentaires.length} boîtes</p>
      </section>
      <section><h3>Fils de démonstration</h3>
        <ul class="d-legende">${Object.entries(VALIDITES).map(([k, v]) => `<li><svg width="48" height="12">${LEGENDE_FIL[k]}</svg>${v.libelle}</li>`).join('')}
          <li><svg width="48" height="12"><rect x="10" y="0" width="28" height="12" rx="3" fill="#fff" stroke="#e4e4e0"/><text x="24" y="9" text-anchor="middle" class="mono-svg">0,81</text></svg>Confiance (sur 1)</li>
        </ul>
      </section>
      <section><h3>Raccourcis</h3>
        <dl class="d-raccourcis">${RACCOURCIS.map(([t, l]) => `<div><dt>${esc(t)}</dt><dd>${esc(l)}</dd></div>`).join('')}</dl>
      </section>`
  }

  // ─── Assertion ────────────────────────────────────────────────────────────────────────────────────

  function noeud(n) {
    if (!n) return vide()
    const st = STATUTS[ctx.statuts()[n.id]]
    const demos = ctx.demosDe(n.id)
    const usages = ctx.etat().demonstrations.filter((d) => d.justifie_par.includes(n.id))
    const cat = ctx.categorieDe(n)
    return `
      <div class="d-tete"><span class="d-type">Assertion · ${esc(n.id)}</span>
        <input class="d-nom" data-champ="nom" value="${esc(n.nom)}" spellcheck="false"></div>
      <section><h3>Statut <small>recalculé</small></h3>
        <div class="d-statut"><i class="pt" style="background:${st.couleur}"></i>${st.libelle}</div>
        <label class="d-case"><input type="checkbox" data-champ="admis"${n.admis ? ' checked' : ''}>
          <span>Admis<small>fait mesuré, axiome ou résultat connu : établi sans démonstration</small></span></label>
      </section>
      <section><h3>Énoncé</h3><textarea data-champ="enonce" rows="4">${esc(n.enonce)}</textarea></section>
      <section><h3>Démonstrations <small>${demos.length}</small></h3>
        ${demos.map((d) => carteDemo(d)).join('')}
        <button type="button" class="d-bouton" data-ajouter-demo="${esc(n.id)}">Ajouter une démonstration</button>
      </section>
      <section><h3>Utilisée par <small>${usages.length}</small></h3>
        ${usages.length ? `<div class="d-puces">${usages.map((d) => puce(d.noeud_id)).join('')}</div>` : '<p class="d-note">Aucune démonstration ne s’appuie sur cette assertion.</p>'}
      </section>
      <section><h3>Catégorie</h3><p class="d-note">${cat ? `<i class="pt carre" style="background:${cat.couleur}"></i>${esc(cat.titre)}` : 'Hors de toute boîte Comment'}</p></section>`
  }

  function puce(id, dId = null, marque = false) {
    const n = ctx.parId(id)
    if (!n) return ''
    const st = STATUTS[ctx.statuts()[id]]
    const retirer = dId ? `<button type="button" class="d-retirer" data-retirer="${esc(dId)}|${esc(id)}" title="Couper ce lien">×</button>` : ''
    return `<span class="d-puce${marque ? ' marque' : ''}"><button type="button" data-aller="n:${esc(id)}"><i class="pt" style="background:${st.couleur}"></i>${esc(n.nom)}</button>${retirer}</span>`
  }

  function carteDemo(d, premisseMarquee = null) {
    const segments = Object.entries(VALIDITES).map(([k, v]) =>
      `<button type="button" class="${d.validite === k ? 'actif' : ''}" data-validite="${k}" data-demo="${esc(d.id)}"><svg width="18" height="12">${LEGENDE_MINI[k]}</svg>${v.libelle}</button>`).join('')
    return `
      <div class="d-demo">
        <input class="d-demo-nom mono" data-demo="${esc(d.id)}" data-dchamp="nom_demonstration" value="${esc(d.nom_demonstration)}" spellcheck="false">
        <div class="d-segments">${segments}</div>
        <div class="d-grille">
          <label>Confiance<input type="number" min="0" max="1" step="0.01" class="mono" data-demo="${esc(d.id)}" data-dchamp="confiance" value="${d.confiance ?? ''}" placeholder="—"></label>
          <label>Auteur<input type="text" data-demo="${esc(d.id)}" data-dchamp="auteur" value="${esc(d.auteur)}" spellcheck="false"></label>
        </div>
        <textarea rows="3" data-demo="${esc(d.id)}" data-dchamp="demonstration" placeholder="Raisonnement…">${esc(d.demonstration)}</textarea>
        <div class="d-lab">Prémisses <small>${d.justifie_par.length}</small></div>
        ${d.justifie_par.length ? `<div class="d-puces">${d.justifie_par.map((p) => puce(p, d.id, p === premisseMarquee)).join('')}</div>` : '<p class="d-note">Aucune prémisse : tirez un fil vers la broche de cette démonstration.</p>'}
        <button type="button" class="d-lien-danger" data-suppr-demo="${esc(d.id)}">Supprimer la démonstration</button>
      </div>`
  }

  // ─── Lien de démonstration ────────────────────────────────────────────────────────────────────────

  function fil(d, p, reroute) {
    if (!d) return vide()
    const a = ctx.parId(p)
    const b = ctx.parId(d.noeud_id)
    return `
      <div class="d-tete"><span class="d-type">${reroute ? 'Point de reroutage' : 'Lien de démonstration'}</span>
        <div class="d-nom-fixe">${esc(a?.nom)} <span class="d-fleche">→</span> ${esc(b?.nom)}</div></div>
      <section><h3>Démonstration de « ${esc(b?.nom)} »</h3>${carteDemo(d, p)}</section>
      <section><button type="button" class="d-bouton" data-action="couper-fil" data-fil="${esc(d.id)}|${esc(p)}">Couper ce lien</button>
        <p class="d-note">Alt + clic sur le fil fait la même chose. Double-clic sur le fil : point de reroutage.</p></section>`
  }

  // ─── Boîte Comment ────────────────────────────────────────────────────────────────────────────────

  function commentaire(c) {
    if (!c) return vide()
    const contenus = ctx.contenus(c)
    return `
      <div class="d-tete"><span class="d-type">Commentaire</span>
        <input class="d-nom" data-ctitre="${esc(c.id)}" value="${esc(c.titre)}" spellcheck="false"></div>
      <section><h3>Couleur</h3>
        <div class="d-couleurs">${COULEURS.map((k) => `<button type="button" class="${k === c.couleur ? 'actif' : ''}" data-couleur="${k}" style="--k:${k}" title="${k}"></button>`).join('')}</div>
      </section>
      <section><h3>Contenu <small>${contenus.length}</small></h3>
        ${contenus.length ? `<div class="d-puces">${contenus.map((n) => puce(n.id)).join('')}</div>` : '<p class="d-note">Aucune assertion dans cette boîte.</p>'}
        <p class="d-note">Déplacer la boîte par son titre emporte les assertions qu’elle contient ; la poignée en bas à droite la redimensionne.</p>
      </section>`
  }

  // ─── Sélection multiple ───────────────────────────────────────────────────────────────────────────

  function multiple(sel) {
    const nb = (t) => sel.filter((k) => k.startsWith(`${t}:`)).length
    const parts = [[nb('n'), 'assertion'], [nb('c'), 'boîte'], [nb('f'), 'lien'], [nb('r'), 'point de reroutage']]
      .filter(([k]) => k).map(([k, m]) => `${k} ${m}${k > 1 ? (m.startsWith('point') ? '' : 's') : ''}`).join(' · ')
    const boutons = [
      ['haut', 'Aligner en haut', 'Maj+W'], ['gauche', 'Aligner à gauche', 'Maj+A'], ['bas', 'Aligner en bas', 'Maj+S'],
      ['droite', 'Aligner à droite', 'Maj+D'], ['repartir-h', 'Répartir horizontalement', 'Maj+H'], ['repartir-v', 'Répartir verticalement', 'Maj+V'],
    ]
    return `
      <div class="d-tete"><span class="d-type">Sélection</span><div class="d-nom-fixe">${sel.length} éléments</div></div>
      <section><p class="d-note">${parts}</p></section>
      <section><h3>Alignement</h3>
        <div class="d-actions">${boutons.map(([k, l, t]) => `<button type="button" data-aligner="${k}">${l}<kbd>${t}</kbd></button>`).join('')}</div>
      </section>
      <section><h3>Organisation</h3>
        <div class="d-actions">
          <button type="button" data-action="commentaire">Commentaire autour<kbd>C</kbd></button>
          <button type="button" data-action="dupliquer">Dupliquer<kbd>Ctrl+D</kbd></button>
          <button type="button" data-action="supprimer">Supprimer<kbd>Suppr</kbd></button>
        </div>
      </section>`
  }

  // ─── Événements ───────────────────────────────────────────────────────────────────────────────────

  const noeudCourant = () => {
    const [k] = ctx.sel()
    return ctx.sel().size === 1 && k.startsWith('n:') ? ctx.parId(k.slice(2)) : null
  }

  racine.addEventListener('input', (e) => {
    const t = e.target
    if (t.dataset.champ && t.type !== 'checkbox') {
      const n = noeudCourant()
      if (n) { n[t.dataset.champ] = t.value; ctx.modifie() }
    } else if (t.dataset.dchamp) {
      const d = ctx.demo(t.dataset.demo)
      if (!d) return
      let v = t.value
      if (t.dataset.dchamp === 'confiance') {
        if (v === '') v = null
        else {
          v = Number.parseFloat(v.replace(',', '.'))
          if (!Number.isFinite(v)) return
          v = Math.min(1, Math.max(0, v))
        }
      }
      d[t.dataset.dchamp] = v
      ctx.modifie()
    } else if (t.dataset.ctitre) {
      const c = ctx.commentaire(t.dataset.ctitre)
      if (c) { c.titre = t.value; ctx.modifie() }
    } else if ('probleme' in t.dataset) {
      ctx.etat().probleme = t.value
      ctx.modifie()
    }
  })

  racine.addEventListener('change', (e) => {
    const t = e.target
    if (t.dataset.champ === 'admis') {
      const n = noeudCourant()
      if (n) n.admis = t.checked
      ctx.valider()
      ctx.rendre()
      return
    }
    if (t.dataset.champ === 'nom' && !t.value.trim()) { const n = noeudCourant(); if (n) n.nom = 'Sans nom' }
    ctx.valider()
  })

  racine.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    const ds = b.dataset
    if (ds.validite) {
      const d = ctx.demo(ds.demo)
      if (d) { d.validite = ds.validite; ctx.valider(); ctx.rendre() }
    } else if (ds.retirer) {
      const [dId, p] = ds.retirer.split('|')
      ctx.couper(dId, p)
    } else if (ds.aller) ctx.selectionner([ds.aller], true)
    else if (ds.supprDemo) ctx.supprimerDemo(ds.supprDemo)
    else if (ds.ajouterDemo) ctx.nouvelleDemo(ds.ajouterDemo, [])
    else if (ds.couleur) {
      const [k] = ctx.sel()
      const c = ctx.commentaire(k.slice(2))
      if (c) { c.couleur = ds.couleur; ctx.valider(); ctx.rendre() }
    } else if (ds.aligner) ctx.aligner(ds.aligner)
    else if (ds.action === 'commentaire') ctx.commentaireAutour()
    else if (ds.action === 'dupliquer') ctx.dupliquer()
    else if (ds.action === 'supprimer') ctx.supprimerSelection()
    else if (ds.action === 'couper-fil') { const [dId, p] = ds.fil.split('|'); ctx.couper(dId, p) }
  })

  return { maj }
}
