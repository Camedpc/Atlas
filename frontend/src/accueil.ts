// Page d'accueil du site : présentation et film (vidéo choisie dans la page admin, bucket public « site »).
import './site.css'
import './accueil.css'
import { api } from './api'

const video = document.querySelector<HTMLVideoElement>('.film video')!
const absent = document.querySelector<HTMLElement>('.film-absent')!

try {
  const site = await api.site()
  if (site.video) {
    if (site.affiche) video.poster = site.affiche
    video.src = site.video
    video.hidden = false
  } else {
    absent.hidden = false
  }
} catch (e) {
  console.warn('Réglages du site indisponibles', e)
  absent.hidden = false
}
