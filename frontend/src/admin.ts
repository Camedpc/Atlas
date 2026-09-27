// Page admin du site (/admin) : choisir l'espace de démo, la réinitialiser, changer la vidéo de l'accueil.
// Le mot de passe (ATLAS_MDP_ADMIN du serveur) est gardé le temps de l'onglet (sessionStorage).
import './site.css'
import './admin.css'
import { admin, AdminRefuse, type EtatAdmin } from './api'
import { echapper } from './rendu'

const CLE_MDP = 'atlas.admin'
const racine = document.querySelector<HTMLElement>('main.admin')!
const deconnexion = document.querySelector<HTMLButtonElement>('.deconnexion')!

let motDePasse = lireMotDePasse()

function lireMotDePasse(): string | null {
  try {
    return sessionStorage.getItem(CLE_MDP)
  } catch {
    return null
  }
}

function garderMotDePasse(mdp: string | null) {
  motDePasse = mdp
  try {
    if (mdp) sessionStorage.setItem(CLE_MDP, mdp)
    else sessionStorage.removeItem(CLE_MDP)
  } catch {
    // le mot de passe ne tiendra que le temps de la page
  }
  deconnexion.hidden = !mdp
}

deconnexion.addEventListener('click', () => {
  garderMotDePasse(null)
  afficherConnexion()
})

function afficherConnexion(erreur = '') {
  deconnexion.hidden = true
  racine.innerHTML = `
    <form class="carte connexion">
      <h1>Espace admin</h1>
      <p>Réservé à l’équipe d’Atlas : espace de démo et vidéo de la page d’accueil.</p>
      <label>Mot de passe<input type="password" autocomplete="current-password" required /></label>
      <p class="message erreur" ${erreur ? '' : 'hidden'}>${echapper(erreur)}</p>
      <button class="bouton" type="submit">Entrer</button>
    </form>`
  const formulaire = racine.querySelector('form')!
  const champ = formulaire.querySelector('input')!
  champ.focus()
  formulaire.addEventListener('submit', (e) => {
    e.preventDefault()
    garderMotDePasse(champ.value)
    void charger()
  })
}

async function charger() {
  if (!motDePasse) return afficherConnexion()
  try {
    afficher(await admin.etat(motDePasse))
  } catch (e) {
    if (e instanceof AdminRefuse) {
      garderMotDePasse(null)
      return afficherConnexion(e.message)
    }
    racine.innerHTML = `<div class="carte"><p class="message erreur">${echapper(String(e instanceof Error ? e.message : e))}</p></div>`
  }
}

function afficher(etat: EtatAdmin) {
  deconnexion.hidden = false
  const modele = etat.projets.find((p) => p.id === etat.demo?.modele)
  const copie = etat.demo?.copie
  // La copie de travail n'est pas proposée comme modèle : elle serait vidée par sa propre réinitialisation.
  const choix = etat.projets.filter((p) => p.id !== copie)
  const options = choix
    .map((p) => `<option value="${p.id}" ${p.id === modele?.id ? 'selected' : ''}>${echapper(p.nom)}</option>`)
    .join('')
  racine.innerHTML = `
    <h1>Réglages du site</h1>

    <section class="carte">
      <h2>Démo</h2>
      <p>La page <a href="/demo">/demo</a> ouvre une <b>copie</b> de l’espace choisi ici : le jury peut y travailler
        librement, et la réinitialiser la remet dans l’état du modèle. Le modèle lui-même n’est jamais modifié.</p>
      <dl class="etat">
        <dt>Modèle</dt><dd>${modele ? echapper(modele.nom) : '<i>aucun</i>'}</dd>
        <dt>Copie de travail</dt><dd>${copie ? '<a href="/demo">espace « Démo »</a>' : '<i>pas encore créée</i>'}</dd>
      </dl>
      <form class="ligne choisir">
        <select aria-label="Espace modèle de la démo">${options}</select>
        <button class="bouton petit" type="submit">Définir comme démo</button>
      </form>
      <div class="ligne">
        <button class="bouton secondaire petit reinitialiser" type="button" ${modele ? '' : 'disabled'}>Réinitialiser la démo</button>
      </div>
      <p class="message" hidden></p>
    </section>

    <section class="carte">
      <h2>Vidéo de la page d’accueil</h2>
      ${etat.site.video
        ? `<video class="apercu" src="${etat.site.video}" ${etat.site.affiche ? `poster="${etat.site.affiche}"` : ''} controls preload="metadata"></video>
           <p class="discret">Actuelle : ${echapper(etat.video?.nom ?? etat.site.video)}</p>`
        : '<p class="discret">Aucune vidéo pour l’instant.</p>'}
      <label class="fichier">Nouvelle vidéo (MP4 ou WebM, 50 Mo au plus)
        <input type="file" accept="video/mp4,video/webm" data-genre="video" />
      </label>
      <label class="fichier">Image d’attente, facultative (JPEG, PNG ou WebP)
        <input type="file" accept="image/jpeg,image/png,image/webp" data-genre="affiche" />
      </label>
      <progress max="1" value="0" hidden></progress>
      <p class="message" hidden></p>
    </section>`

  const [carteDemo, carteVideo] = racine.querySelectorAll<HTMLElement>('section.carte')
  brancherDemo(carteDemo)
  brancherVideo(carteVideo)
}

function annoncer(carte: HTMLElement, texte: string, erreur = false) {
  const message = carte.querySelector<HTMLElement>('.message')!
  message.hidden = !texte
  message.textContent = texte
  message.classList.toggle('erreur', erreur)
}

/** Lance une action admin, recharge la page et annonce le succès dans la même carte (`indice`, la page étant
 * redessinée) ; un mot de passe refusé ramène à la connexion. */
async function agir(indice: number, attente: string, action: () => Promise<unknown>, succes: string) {
  const carte = racine.querySelectorAll<HTMLElement>('section.carte')[indice]
  const boutons = carte.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input, select')
  boutons.forEach((b) => (b.disabled = true))
  annoncer(carte, attente)
  try {
    await action()
    await charger()
    const redessinee = racine.querySelectorAll<HTMLElement>('section.carte')[indice]
    if (redessinee) annoncer(redessinee, succes)
  } catch (e) {
    if (e instanceof AdminRefuse) {
      garderMotDePasse(null)
      return afficherConnexion(e.message)
    }
    boutons.forEach((b) => (b.disabled = false))
    annoncer(carte, e instanceof Error ? e.message : String(e), true)
  }
}

function brancherDemo(carte: HTMLElement) {
  carte.querySelector('form.choisir')!.addEventListener('submit', (e) => {
    e.preventDefault()
    const modele = carte.querySelector('select')!.value
    if (!modele) return
    void agir(0, 'Copie de l’espace en cours…', () => admin.choisirDemo(motDePasse!, modele),
      'La démo repart de cet espace.')
  })
  const bouton = carte.querySelector<HTMLButtonElement>('.reinitialiser')!
  bouton.addEventListener('click', () => {
    // Deux temps : tout ce que le jury a fait dans la démo disparaît.
    if (bouton.dataset.confirmer !== '1') {
      bouton.dataset.confirmer = '1'
      bouton.textContent = 'Confirmer : effacer le travail fait dans la démo'
      bouton.classList.add('danger')
      return
    }
    void agir(0, 'Réinitialisation…', () => admin.reinitialiserDemo(motDePasse!), 'Démo réinitialisée.')
  })
}

function brancherVideo(carte: HTMLElement) {
  const progression = carte.querySelector('progress')!
  carte.querySelectorAll<HTMLInputElement>('input[type=file]').forEach((champ) =>
    champ.addEventListener('change', () => {
      const fichier = champ.files?.[0]
      if (!fichier) return
      const genre = champ.dataset.genre as 'video' | 'affiche'
      if (fichier.size > 50 * 1024 * 1024) {
        annoncer(carte, `Fichier trop lourd (${Math.round(fichier.size / 2 ** 20)} Mo) : 50 Mo au plus.`, true)
        champ.value = ''
        return
      }
      progression.hidden = false
      progression.value = 0
      void agir(1, `Envoi de ${fichier.name}…`,
        () => admin.televerser(motDePasse!, genre, fichier, (part) => (progression.value = part)),
        genre === 'video' ? 'Nouvelle vidéo en ligne sur la page d’accueil.' : 'Nouvelle image d’attente en ligne.')
    }),
  )
}

void charger()
