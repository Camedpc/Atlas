// Panneau Détails (à droite du canevas), onglet Paramètres (faits admis éditables) et onglet Journal.
// Les champs portent `data-champ="genre:propriété:id"` ; toute validation passe par `modifier`
// (annulable). Les boutons portent `data-bouton="action:arg:arg"`.

import { STATUTS, VALIDITES } from '../../commun/raisonnement.js'
import * as S from './etat.js'

const { E } = S

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c])
export const fmtConf = (v) => (v == null ? '—' : Number(v).toFixed(2).replace('.', ','))

const puce = (statut) => {
  const s = STATUTS[statut] || STATUTS.ouvert
  return `<span class="puce" style="--s:${s.couleur}"><i></i>${s.libelle}</span>`
}

const options = (paires, choisi) => paires.map(([v, l]) => `<option value="${v}"${v === choisi ? ' selected' : ''}>${esc(l)}</option>`).join('')

// ctx : { details, parametres, journal, selection(), statuts(), aller(id), choisir(ids), creerCommentaire(),
//         dupliquer(), supprimerSelection(), creerFait(type) }
export function monterPanneaux(ctx) {
  let derniereCle = null

  for (const racine of [ctx.details, ctx.parametres]) {
    racine.addEventListener('change', (e) => { if (e.target.dataset.champ) appliquerChamp(e.target) })
    racine.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bouton]')
      if (!b) return
      e.preventDefault()
      bouton(b.dataset.bouton)
    })
  }

  function appliquerChamp(el) {
    const [genre, prop, id] = el.dataset.champ.split(':')
    const v = el.type === 'checkbox' ? el.checked : el.value
    const t = typeof v === 'string' ? v.trim() : v
    if (genre === 'probleme') { S.modifier('Modifier le problème', () => { E.graphe.probleme = t }); return }
    if (genre === 'noeud') {
      const n = S.noeud(id)
      if (!n) return
      if (prop === 'nom') { if (t) S.modifier(`Renommer « ${n.nom} » en « ${t} »`, () => { n.nom = t }); else el.value = n.nom }
      if (prop === 'enonce') S.modifier(`Modifier l’énoncé de « ${n.nom} »`, () => { n.enonce = t })
      if (prop === 'admis') S.modifier(v === 'fait' ? `« ${n.nom} » devient un fait admis` : `« ${n.nom} » devient une assertion`, () => S.convertir(id, v === 'fait'))
      if (prop === 'type') S.modifier(`Type de « ${n.nom} » : ${S.TYPES_FAIT[v].libelle}`, () => { n.type = v })
      return
    }
    if (genre === 'demo') {
      const d = S.demo(id)
      if (!d) return
      const ou = `${d.nom_demonstration} (« ${S.nom(d.noeud_id)} »)`
      if (prop === 'nom') { if (t) S.modifier(`Renommer la démonstration ${ou} en ${t}`, () => { d.nom_demonstration = t }); else el.value = d.nom_demonstration }
      if (prop === 'validite') S.modifier(`Validité de ${ou} : ${VALIDITES[v].libelle}`, () => { d.validite = v })
      if (prop === 'confiance') {
        const x = t === '' ? null : Number(t.replace(',', '.'))
        if (x !== null && !Number.isFinite(x)) { el.value = fmtConf(d.confiance); return }
        const c = x === null ? null : Math.round(Math.min(1, Math.max(0, x)) * 100) / 100
        if (!S.modifier(`Confiance de ${ou} : ${fmtConf(c)}`, () => { d.confiance = c })) el.value = d.confiance == null ? '' : fmtConf(d.confiance)
      }
      if (prop === 'demonstration') S.modifier(`Modifier le raisonnement de ${ou}`, () => { d.demonstration = t })
      if (prop === 'auteur') S.modifier(`Auteur de ${ou} : ${t}`, () => { d.auteur = t })
      if (prop === 'active') S.modifier(`${v ? 'Activer' : 'Désactiver'} ${ou}`, () => { d.active = v })
      if (prop === 'premisse' && v) S.modifier(`« ${S.nom(v)} » devient prémisse de ${ou}`, () => S.lier(v, id))
      return
    }
    if (genre === 'comment') {
      const c = S.categorie(id)
      if (c && t) S.modifier(`Renommer le commentaire « ${c.titre} » en « ${t} »`, () => { c.titre = t })
      else if (c) el.value = c.titre
    }
  }

  function bouton(code) {
    const [action, a, b] = code.split(':')
    if (action === 'aller') ctx.aller(a)
    else if (action === 'retirer') S.modifier(`Retirer « ${S.nom(b)} » des prémisses`, () => S.delier(b, a))
    else if (action === 'ajouter-demo') S.modifier(`Ajouter une démonstration à « ${S.nom(a)} »`, () => S.ajouterDemo(a))
    else if (action === 'supprimer-demo') { const d = S.demo(a); if (d) S.modifier(`Supprimer la démonstration ${d.nom_demonstration}`, () => S.supprimerDemo(a)) }
    else if (action === 'couleur') { const c = S.categorie(a); if (c) S.modifier(`Couleur du commentaire « ${c.titre} »`, () => { c.couleur = b }) }
    else if (action === 'supprimer-noeud') S.modifier(`Supprimer « ${S.nom(a)} »`, () => S.supprimerNoeuds([a]))
    else if (action === 'commentaire') ctx.creerCommentaire()
    else if (action === 'dupliquer') ctx.dupliquer()
    else if (action === 'supprimer') ctx.supprimerSelection()
    else if (action === 'ajouter-fait') ctx.creerFait(a || 'mesure')
  }

  // ─── Détails ───────────────────────────────────────────────────────────────────────────────────────

  function htmlSysteme() {
    const st = ctx.statuts()
    const compte = {}
    for (const s of Object.values(st)) compte[s] = (compte[s] || 0) + 1
    const demos = E.graphe.demonstrations
    const inactives = demos.filter((d) => d.active === false).length
    return `
      <div class="d-tete"><div><div class="d-genre">Système</div><h2>Résolution de problème</h2></div></div>
      <details open><summary>Problème</summary>
        <div class="d-bloc"><div class="champ" style="grid-template-columns:1fr"><textarea rows="4" data-champ="probleme">${esc(E.graphe.probleme)}</textarea></div></div>
      </details>
      <details open><summary>Statuts <small>recalculés en direct</small></summary>
        <ul class="liste-simple">${Object.entries(STATUTS).map(([k, s]) => `<li>${puce(k)}<small>${compte[k] || 0}</small></li>`).join('')}</ul>
        <div class="note">${E.graphe.noeuds.length} assertions dont ${E.graphe.noeuds.filter((n) => n.admis).length} faits admis · ${demos.length} démonstrations${inactives ? ` (${inactives} désactivée${inactives > 1 ? 's' : ''})` : ''} · ${E.graphe.categories.length} commentaires</div>
      </details>
      <details open><summary>Raccourcis</summary>
        <dl class="raccourcis">
          <dt>Clic droit</dt><dd>Toutes les actions (recherche)</dd>
          <dt>Glisser le fond</dt><dd>Se déplacer (ou clic droit / molette maintenus)</dd>
          <dt>Maj + glisser</dt><dd>Sélection rectangle</dd>
          <dt>Molette</dt><dd>Zoom centré sur le curseur</dd>
          <dt>F</dt><dd>Cadrer la sélection ou tout</dd>
          <dt>C</dt><dd>Commentaire autour de la sélection</dd>
          <dt>Double-clic</dt><dd>Renommer en place (F2)</dd>
          <dt>Broche → broche</dt><dd>Lier une prémisse à un module</dd>
          <dt>Alt + clic</dt><dd>Couper un fil</dd>
          <dt>Suppr · Ctrl+D</dt><dd>Supprimer · Dupliquer</dd>
          <dt>Ctrl+Z · Ctrl+Y</dt><dd>Annuler · Rétablir</dd>
        </dl>
      </details>`
  }

  function htmlModule(d, st) {
    const deja = new Set([d.noeud_id, ...d.justifie_par])
    const candidats = E.graphe.noeuds.filter((n) => !deja.has(n.id))
    return `
      <div class="d-module${d.active === false ? ' inactif' : ''}">
        <div class="d-module-tete">
          <input type="checkbox" data-champ="demo:active:${d.id}" ${d.active !== false ? 'checked' : ''} title="Module actif (compté dans les statuts)">
          <input type="text" data-champ="demo:nom:${d.id}" value="${esc(d.nom_demonstration)}" spellcheck="false">
          <button class="btn-x" data-bouton="supprimer-demo:${d.id}" title="Supprimer cette démonstration">×</button>
        </div>
        <div class="champ"><label>Validité</label><select data-champ="demo:validite:${d.id}">${options(Object.entries(VALIDITES).map(([k, v]) => [k, v.libelle]), d.validite)}</select></div>
        <div class="champ"><label>Confiance</label><input class="mono" data-champ="demo:confiance:${d.id}" value="${d.confiance == null ? '' : fmtConf(d.confiance)}" placeholder="non notée" inputmode="decimal"></div>
        <div class="champ"><label>Auteur</label><input class="mono" data-champ="demo:auteur:${d.id}" value="${esc(d.auteur)}" spellcheck="false"></div>
        <div class="champ"><label>Raisonnement</label><textarea rows="3" data-champ="demo:demonstration:${d.id}">${esc(d.demonstration)}</textarea></div>
        <div class="champ"><span class="lab">Prémisses</span><div>
          ${d.justifie_par.map((p) => `<div class="prem"><span class="pt" style="--s:${STATUTS[st[p]]?.couleur}" title="${STATUTS[st[p]]?.libelle}"></span><span class="lien" data-bouton="aller:${p}">${esc(S.nom(p))}</span><button class="btn-x" data-bouton="retirer:${d.id}:${p}" title="Retirer cette prémisse">×</button></div>`).join('') || '<div class="prem"><small>aucune</small></div>'}
          <select data-champ="demo:premisse:${d.id}"><option value="">Ajouter une prémisse…</option>${options(candidats.map((n) => [n.id, n.nom]), '')}</select>
        </div></div>
      </div>`
  }

  function htmlNoeud(n) {
    const st = ctx.statuts()
    const demos = S.demosDe(n.id)
    const us = S.usages(n.id)
    const t = S.TYPES_FAIT[n.type] || S.TYPES_FAIT.mesure
    return `
      <div class="d-tete"><div><div class="d-genre">${n.admis ? `Fait admis · paramètre ${t.libelle.toLowerCase()}` : 'Assertion · pile de démonstration'} · <span class="mono">${esc(n.id)}</span></div><h2>${esc(n.nom)}</h2></div>${puce(st[n.id])}</div>
      <details open><summary>${n.admis ? 'Paramètre' : 'Assertion'}</summary>
        <div class="d-bloc">
          <div class="champ"><label>Nom</label><input data-champ="noeud:nom:${n.id}" value="${esc(n.nom)}"></div>
          <div class="champ"><label>Énoncé</label><textarea rows="3" data-champ="noeud:enonce:${n.id}">${esc(n.enonce)}</textarea></div>
          <div class="champ"><label>Nature</label><select data-champ="noeud:admis:${n.id}">${options([['assertion', 'Assertion à démontrer'], ['fait', 'Fait admis (paramètre)']], n.admis ? 'fait' : 'assertion')}</select></div>
          ${n.admis ? `<div class="champ"><label>Type</label><select data-champ="noeud:type:${n.id}">${options(Object.entries(S.TYPES_FAIT).map(([k, v]) => [k, v.libelle]), n.type)}</select></div>` : ''}
          <div class="champ"><span class="lab">Statut</span><div class="val">${puce(st[n.id])}<small>calculé, jamais stocké</small></div></div>
        </div>
      </details>
      ${n.admis ? '' : `<details open><summary>Démonstrations <small>${demos.length}</small><button class="btn" data-bouton="ajouter-demo:${n.id}">+ Ajouter</button></summary>
        ${demos.map((d) => htmlModule(d, st)).join('') || '<div class="note">Aucune démonstration : l’assertion reste ouverte.</div>'}
      </details>`}
      <details open><summary>Utilisé par <small>${us.length}</small></summary>
        ${us.length ? `<ul class="liste-simple">${us.map((d) => `<li class="${d.active === false ? 'inactif' : ''}"><span class="pt" style="--s:${STATUTS[st[d.noeud_id]].couleur}"></span><span class="lien" data-bouton="aller:${d.noeud_id}">${esc(S.nom(d.noeud_id))}</span><small>${esc(d.nom_demonstration)}</small></li>`).join('')}</ul>` : '<div class="note">Aucune assertion ne s’appuie dessus.</div>'}
      </details>
      <div class="d-actions"><button class="btn" data-bouton="dupliquer">Dupliquer</button><button class="btn danger" data-bouton="supprimer">Supprimer</button></div>`
  }

  function htmlCommentaire(c) {
    const contenus = ctx.contenus(c)
    return `
      <div class="d-tete"><div><div class="d-genre">Commentaire · <span class="mono">${esc(c.id)}</span></div><h2>${esc(c.titre)}</h2></div></div>
      <details open><summary>Commentaire</summary>
        <div class="d-bloc">
          <div class="champ"><label>Titre</label><input data-champ="comment:titre:${c.id}" value="${esc(c.titre)}"></div>
          <div class="champ"><span class="lab">Couleur</span><div class="nuancier">${S.COULEURS_COMMENT.map((k) => `<button style="--c:${k}" class="${k === c.couleur ? 'actif' : ''}" data-bouton="couleur:${c.id}:${k}" title="${k}"></button>`).join('')}</div></div>
          <div class="champ"><span class="lab">Taille</span><div class="val mono">${c.l} × ${c.h}</div></div>
        </div>
      </details>
      <details open><summary>Contient <small>${contenus.length}</small></summary>
        ${contenus.length ? `<ul class="liste-simple">${contenus.map((id) => `<li><span class="lien" data-bouton="aller:${id}">${esc(S.nom(id))}</span></li>`).join('')}</ul>` : '<div class="note">Aucun nœud entièrement à l’intérieur.</div>'}
      </details>
      <div class="note">Déplacer le titre emporte les nœuds contenus ; supprimer le commentaire les laisse en place.</div>
      <div class="d-actions"><button class="btn danger" data-bouton="supprimer">Supprimer le commentaire</button></div>`
  }

  function htmlMulti(sel) {
    const noms = sel.map((s) => (s.startsWith('n:') ? S.nom(s.slice(2)) : `Commentaire « ${S.categorie(s.slice(2))?.titre} »`))
    return `
      <div class="d-tete"><div><div class="d-genre">Sélection multiple</div><h2>${sel.length} éléments</h2></div></div>
      <ul class="liste-simple">${noms.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      <div class="d-actions">
        <button class="btn" data-bouton="commentaire">Commentaire autour (C)</button>
        <button class="btn" data-bouton="dupliquer">Dupliquer (Ctrl+D)</button>
        <button class="btn danger" data-bouton="supprimer">Supprimer (Suppr)</button>
      </div>`
  }

  function details() {
    const sel = [...ctx.selection()]
    const racine = ctx.details
    const a = document.activeElement
    const focus = racine.contains(a) && a.dataset.champ ? { champ: a.dataset.champ, d: a.selectionStart, f: a.selectionEnd } : null
    const cle = sel.join()
    const defilAvant = racine.querySelector('.d-defil')?.scrollTop ?? 0
    let h
    if (!sel.length) h = htmlSysteme()
    else if (sel.length > 1) h = htmlMulti(sel)
    else if (sel[0].startsWith('n:')) h = htmlNoeud(S.noeud(sel[0].slice(2)))
    else h = htmlCommentaire(S.categorie(sel[0].slice(2)))
    racine.innerHTML = `<div class="d-onglet">Détails</div><div class="d-defil">${h}</div>`
    if (cle === derniereCle) racine.querySelector('.d-defil').scrollTop = defilAvant
    derniereCle = cle
    if (focus) {
      const el = racine.querySelector(`[data-champ="${CSS.escape(focus.champ)}"]`)
      if (el) { el.focus(); try { el.setSelectionRange(focus.d, focus.f) } catch { /* champ sans sélection */ } }
    }
  }

  // ─── Paramètres ────────────────────────────────────────────────────────────────────────────────────

  function parametres() {
    const faits = E.graphe.noeuds.filter((n) => n.admis)
    ctx.parametres.innerHTML = `
      <div class="pg">
        <div class="pg-tete">
          <div><h1>Paramètres</h1><p>Les faits admis sont établis sans démonstration ; ils alimentent les piles comme des paramètres utilisateur.</p></div>
          ${Object.entries(S.TYPES_FAIT).map(([k, v]) => `<button class="btn" data-bouton="ajouter-fait:${k}">+ ${v.libelle}</button>`).join('')}
        </div>
        <table class="tab">
          <thead><tr><th style="width:150px">Type</th><th style="width:220px">Nom</th><th>Énoncé</th><th style="width:220px">Utilisé par</th><th style="width:160px"></th></tr></thead>
          <tbody>${faits.map((n) => {
            const t = S.TYPES_FAIT[n.type] || S.TYPES_FAIT.mesure
            const us = S.usages(n.id)
            return `<tr>
              <td><div class="type-cel" style="--t:${t.couleur}"><i></i><select data-champ="noeud:type:${n.id}">${options(Object.entries(S.TYPES_FAIT).map(([k, v]) => [k, v.libelle]), n.type)}</select></div></td>
              <td><input data-champ="noeud:nom:${n.id}" value="${esc(n.nom)}"></td>
              <td><input data-champ="noeud:enonce:${n.id}" value="${esc(n.enonce)}" title="${esc(n.enonce)}"></td>
              <td class="usages">${us.length ? us.map((d) => esc(S.nom(d.noeud_id))).join(', ') : '<small>—</small>'}</td>
              <td class="actions"><button class="btn" data-bouton="aller:${n.id}">Localiser</button><button class="btn danger" data-bouton="supprimer-noeud:${n.id}">Supprimer</button></td>
            </tr>`
          }).join('') || '<tr><td colspan="5" class="note">Aucun fait admis.</td></tr>'}</tbody>
        </table>
      </div>`
  }

  // ─── Journal ───────────────────────────────────────────────────────────────────────────────────────

  function journal() {
    const lignes = [...E.journal].reverse()
    ctx.journal.innerHTML = `
      <div class="pg">
        <div class="pg-tete"><div><h1>Journal</h1><p>Chaque modification, la plus récente d’abord. Le journal ne fait que s’allonger : annuler y ajoute une ligne.</p></div></div>
        <ol class="journal">${lignes.map((l) => {
          const d = new Date(l.t)
          return `<li><time title="${esc(d.toLocaleString('fr-FR'))}">${esc(d.toLocaleTimeString('fr-FR'))}</time><span>${esc(l.texte)}</span></li>`
        }).join('') || '<li><span class="vide-j">Aucune modification pour l’instant.</span></li>'}</ol>
      </div>`
  }

  return { details, parametres, journal }
}
