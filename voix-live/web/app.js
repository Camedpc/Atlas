// Client de la conversation vocale : micro → serveur (PCM 24 kHz), audio de l'agent ← serveur (PCM 48 kHz).

const $ = (id) => document.getElementById(id)
const fil = $('fil')
const ETATS = { arret: 'Arrêté', demarrage: 'Démarrage…', ecoute: 'À l’écoute', reflexion: 'Réfléchit…', travail: 'Travaille…', parle: 'Parle' }

let ws = null
let contexte = null
let lecteur = null
let flux = null
let muet = false
let etatServeur = 'arret'
let enLecture = false
let genCourante = 0
let messagesAgent = new Map()
let dernierAgent = null
const mesures = {}

function defiler() {
  fil.scrollTop = fil.scrollHeight
}

function ajouter(classe, texte) {
  fil.querySelector('.vide')?.remove()
  const el = document.createElement('div')
  el.className = classe
  el.textContent = texte
  fil.append(el)
  defiler()
  return el
}

function afficherEtat() {
  const etat = etatServeur === 'arret' || etatServeur === 'demarrage' ? etatServeur : enLecture ? 'parle' : etatServeur
  $('etat').dataset.etat = etat
  $('etat').querySelector('span').textContent = ETATS[etat] ?? etat
}

function afficherMesures() {
  const noms = { premier_mot: 'premier mot', premier_son: 'premier son', flush: 'fin de phrase', echauffement: 'échauffement' }
  $('mesures').textContent = Object.entries(mesures).map(([n, ms]) => `${noms[n] ?? n} ${ms} ms`).join(' · ')
}

function envoyer(message) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
}

function envoyerReglages() {
  envoyer({ type: 'reglages', casque: $('casque').checked, voix: $('voix').value, modele: $('modele').value })
}

// ---------- Audio ----------

async function ouvrirAudio() {
  contexte = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
  await contexte.audioWorklet.addModule('/web/worklets.js')
  flux = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const source = contexte.createMediaStreamSource(flux)
  const micro = new AudioWorkletNode(contexte, 'micro')
  micro.port.onmessage = (e) => {
    $('niveau').style.width = `${Math.min(100, e.data.niveau * 400)}%`
    if (!muet && ws?.readyState === WebSocket.OPEN) ws.send(e.data.pcm)
  }
  source.connect(micro)
  lecteur = new AudioWorkletNode(contexte, 'lecteur', { outputChannelCount: [1] })
  lecteur.connect(contexte.destination)
  lecteur.port.onmessage = (e) => {
    const joue_s = e.data.joues / contexte.sampleRate
    if (e.data.type === 'fini') {
      enLecture = false
      afficherEtat()
      envoyer({ type: 'lecture', gen: genCourante, joue_s, fini: true })
    } else {
      envoyer({ type: 'lecture', gen: genCourante, joue_s, fini: false })
    }
  }
}

function jouer(tampon) {
  const gen = new DataView(tampon).getUint32(0, true)
  if (gen < genCourante) return // audio d'une réponse coupée
  if (gen > genCourante) {
    genCourante = gen
    lecteur.port.postMessage({ type: 'zero' })
  }
  const pcm = new Int16Array(tampon, 4)
  const echantillons = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) echantillons[i] = pcm[i] / 32768
  lecteur.port.postMessage({ type: 'audio', echantillons }, [echantillons.buffer])
  if (!enLecture) {
    enLecture = true
    afficherEtat()
  }
}

function couperLecture(gen) {
  genCourante = Math.max(genCourante, gen)
  lecteur?.port.postMessage({ type: 'couper' })
  enLecture = false
  if (dernierAgent) dernierAgent.classList.add('coupe')
  afficherEtat()
}

// ---------- Messages du serveur ----------

function recevoir(message) {
  switch (message.type) {
    case 'etat':
      etatServeur = message.etat
      afficherEtat()
      break
    case 'partiel':
      $('partiel').textContent = message.texte
      break
    case 'utilisateur': {
      $('partiel').textContent = ''
      const el = ajouter('message camille', message.texte)
      if (message.source === 'clavier') el.insertAdjacentHTML('afterbegin', '<small>écrit</small>')
      dernierAgent = null
      break
    }
    case 'agent_delta': {
      let el = messagesAgent.get(message.id)
      if (!el) {
        el = ajouter('message atlas', '')
        messagesAgent.set(message.id, el)
        dernierAgent = el
      }
      el.textContent += message.texte
      defiler()
      break
    }
    case 'agent_fin': {
      const el = messagesAgent.get(message.id) ?? ajouter('message atlas', '')
      el.textContent = message.texte
      break
    }
    case 'outil': {
      let el = document.getElementById(`outil-${message.id}`)
      if (!el) {
        el = ajouter('outil en-cours', `▸ ${message.description}`)
        el.id = `outil-${message.id}`
        el.title = message.description
      }
      if (message.fini) el.className = message.ok ? 'outil' : 'outil echec'
      break
    }
    case 'couper':
      couperLecture(message.gen)
      break
    case 'taches':
      afficherTaches(message.taches)
      break
    case 'mesure':
      mesures[message.nom] = message.ms
      afficherMesures()
      break
    case 'vad':
      $('partiel').classList.toggle('parle', message.parle)
      break
    case 'info':
      ajouter('info', message.message)
      break
    case 'erreur':
      ajouter('info erreur', message.message)
      break
  }
}

function afficherTaches(taches) {
  const zone = $('taches')
  zone.replaceChildren()
  for (const t of [...taches].reverse()) {
    const el = document.createElement('div')
    el.className = 'tache'
    const noms = { en_cours: 'en cours', terminee: 'terminée', erreur: 'échec', arretee: 'arrêtée' }
    el.innerHTML = `<header><span></span><span class="statut ${t.statut}">${noms[t.statut]} · ${t.duree_s} s</span></header><ul></ul>`
    el.querySelector('header span').textContent = `#${t.id} ${t.titre}`
    for (const etape of t.etapes) {
      const li = document.createElement('li')
      li.textContent = etape
      li.title = etape
      el.querySelector('ul').append(li)
    }
    if (t.resultat) {
      const p = document.createElement('p')
      p.textContent = t.resultat
      el.append(p)
    }
    zone.append(el)
  }
}

// ---------- Commandes ----------

async function demarrer() {
  $('demarrer').disabled = true
  try {
    if (!contexte) await ouvrirAudio()
    await contexte.resume()
  } catch (erreur) {
    ajouter('info erreur', `Micro indisponible : ${erreur.message}`)
    $('demarrer').disabled = false
    return
  }
  const protocole = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${protocole}://${location.host}/ws`)
  ws.binaryType = 'arraybuffer'
  ws.onopen = () => {
    envoyerReglages()
    if ($('consignes').value.trim()) envoyer({ type: 'consignes', texte: $('consignes').value })
    $('demarrer').disabled = false
    $('demarrer').textContent = 'Raccrocher'
    $('demarrer').classList.add('actif')
  }
  ws.onmessage = (e) => (typeof e.data === 'string' ? recevoir(JSON.parse(e.data)) : jouer(e.data))
  ws.onclose = () => {
    etatServeur = 'arret'
    couperLecture(genCourante)
    // Relâche le micro : sinon l'onglet le garde, et une autre page qui l'ouvre ensuite capte un son dégradé.
    for (const piste of flux?.getTracks() ?? []) piste.stop()
    void contexte?.close()
    contexte = null
    flux = null
    afficherEtat()
    $('demarrer').disabled = false
    $('demarrer').textContent = 'Démarrer la conversation'
    $('demarrer').classList.remove('actif')
    ws = null
  }
}

$('demarrer').onclick = () => (ws ? ws.close() : demarrer())
$('interrompre').onclick = () => envoyer({ type: 'interrompre' })
$('muet').onclick = () => {
  muet = !muet
  $('muet').classList.toggle('coupe', muet)
  $('muet').textContent = muet ? 'Micro coupé' : 'Micro'
}
$('saisie').onsubmit = (e) => {
  e.preventDefault()
  const texte = $('texte').value.trim()
  if (!texte) return
  envoyer({ type: 'texte', texte })
  $('texte').value = ''
}
$('appliquer').onclick = () => {
  envoyer({ type: 'consignes', texte: $('consignes').value })
  try {
    localStorage.setItem('voix-consignes', $('consignes').value)
  } catch {}
}
for (const id of ['casque', 'voix', 'modele']) {
  $(id).onchange = () => {
    envoyerReglages()
    try {
      localStorage.setItem(`voix-${id}`, id === 'casque' ? String($(id).checked) : $(id).value)
    } catch {}
  }
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') envoyer({ type: 'interrompre' })
})

try {
  $('consignes').value = localStorage.getItem('voix-consignes') ?? ''
  for (const id of ['voix', 'modele']) if (localStorage.getItem(`voix-${id}`)) $(id).value = localStorage.getItem(`voix-${id}`)
  if (localStorage.getItem('voix-casque')) $('casque').checked = localStorage.getItem('voix-casque') === 'true'
} catch {}
