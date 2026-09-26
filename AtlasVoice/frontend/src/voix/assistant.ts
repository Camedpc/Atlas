/**
 * Cycle de vie du mode vocal (section 2.1) :
 *
 *   inactif ──activer──▶ attente ──« Hey Atlas » / bouton──▶ connexion ──▶ ecoute
 *      ecoute ──8 s de silence / « merci Atlas »──▶ attente   (aucune tâche en cours)
 *                                                 └─▶ veille  (une tâche tourne encore)
 *      veille ──Atlas annonce un résultat / « Hey Atlas »──▶ ecoute
 *
 * En veille la session reste ouverte mais le micro n'est plus transmis : seul du silence part
 * (l'horloge de la transcription continue, ce qui permet à Atlas de reprendre la parole).
 */

import { api, jetonCourant, URL_API } from "../api";
import { Micro } from "../audio/micro";
import { EncodeurOpus, LecteurOpus } from "../audio/opus";
import type { MotCle } from "./motCle";

export type Etat = "inactif" | "attente" | "connexion" | "ecoute" | "veille";

export interface Contexte {
  graphe_actif?: string | null;
  conversation_active?: string | null;
}

export interface Ligne {
  role: "utilisateur" | "atlas";
  texte: string;
  tour: number | null;
}

export interface Rappels {
  surEtat: (etat: Etat) => void;
  surParole: (parle: boolean) => void;
  surTexte: (ligne: Ligne) => void;
  surErreur: (message: string) => void;
  surMotCle: (disponible: boolean, raison?: string) => void;
  /** Vrai si une tâche de l'utilisateur est encore active (le registre fait foi). */
  tachesActives: () => boolean;
}

const SILENCE_FIN_MS = 8000;
const DELAI_FIN_MS = 1500;
const DELAI_FAUX_REVEIL_MS = 6000;
const TAMPON_REVEIL_S = 1.0;
const MODELE_MOT_CLE = import.meta.env.VITE_MOT_CLE_MODELE ?? "hey_atlas.onnx";
const SEUIL_MOT_CLE = Number(import.meta.env.VITE_MOT_CLE_SEUIL ?? "0.5");

export class AssistantVocal {
  etat: Etat = "inactif";
  private micro = new Micro();
  private lecteur: LecteurOpus | null = null;
  private motCle: MotCle | null = null;
  private ws: WebSocket | null = null;
  private encodeur: EncodeurOpus | null = null;
  private enAttenteEnvoi: Float32Array[] | null = null;
  private derniereActivite = 0;
  /** Instant (performance.now) où la fin a été demandée, ou null. */
  private finDemandee: number | null = null;
  private fermetureVoulue = false;
  private minuterie: number | null = null;
  private timing: { stopS: number | null; tour: number | null; interrompu: boolean } =
    { stopS: null, tour: null, interrompu: false };
  private paroleAtlas = false;
  private contexte: Contexte = {};
  private reveilEnObservation: number | null = null;
  private paroleDepuisReveil = false;

  constructor(private rappels: Rappels) {}

  // ── micro et mot-clé ───────────────────────────────────────────

  async activer(): Promise<void> {
    if (this.etat !== "inactif") return;
    await this.micro.demarrer();
    const contexteAudio = this.micro.contexte!;
    this.lecteur = new LecteurOpus(contexteAudio);
    await this.lecteur.demarrer();
    this.micro.abonner((bloc) => this.surBloc(bloc));
    this.minuterie = window.setInterval(() => this.surveiller(), 250);
    this.changerEtat("attente");
    await this.chargerMotCle();
  }

  private async chargerMotCle(): Promise<void> {
    // onnxruntime-web est lourd : chargé seulement quand le mode vocal est activé.
    const { MotCle } = await import("./motCle");
    const motCle = new MotCle({
      modele: MODELE_MOT_CLE,
      seuil: SEUIL_MOT_CLE,
      surDetection: () => this.reveiller("mot_cle"),
    });
    try {
      await motCle.charger();
      motCle.actif = true;
      this.motCle = motCle;
      this.rappels.surMotCle(true);
    } catch (e) {
      this.rappels.surMotCle(false, String(e instanceof Error ? e.message : e).slice(0, 120));
    }
  }

  desactiver(): void {
    this.fermerSession();
    if (this.minuterie !== null) window.clearInterval(this.minuterie);
    this.minuterie = null;
    this.lecteur?.fermer();
    this.lecteur = null;
    if (this.motCle) this.motCle.actif = false;
    this.micro.arreter();
    this.changerEtat("inactif");
  }

  private surBloc(bloc: Float32Array): void {
    const taux = this.micro.contexte?.sampleRate ?? 48000;
    // Le mot-clé écoute en attente et en veille (« Hey Atlas » réveille une session en veille).
    if (this.etat === "attente" || this.etat === "veille") this.motCle?.pousser(bloc, taux);
    if (this.enAttenteEnvoi) {
      this.enAttenteEnvoi.push(bloc);
    } else if (this.etat === "ecoute") {
      this.encodeur?.encoder(bloc);
    } else if (this.etat === "veille") {
      this.encodeur?.encoder(new Float32Array(bloc.length));
    }
  }

  // ── réveil ─────────────────────────────────────────────────────

  reveiller(source: "mot_cle" | "manuel"): void {
    if (this.etat === "inactif" || this.etat === "connexion") return;
    this.bip();
    this.observerReveil();
    if (this.etat === "veille") {
      this.changerEtat("ecoute");
      this.ws?.send(JSON.stringify({ type: "veille", active: false }));
      this.derniereActivite = performance.now();
      return;
    }
    if (this.etat === "attente") {
      // Au réveil par la voix, la phrase qui suit « Hey Atlas » est déjà en cours : on la garde.
      this.ouvrirSession(source === "mot_cle" ? this.micro.recent(TAMPON_REVEIL_S) : []);
    }
  }

  /** Réveil sans parole de l'utilisateur dans les 6 s : compté comme faux réveil. */
  private observerReveil(): void {
    if (this.reveilEnObservation !== null) window.clearTimeout(this.reveilEnObservation);
    this.paroleDepuisReveil = false;
    this.reveilEnObservation = window.setTimeout(() => {
      this.reveilEnObservation = null;
      void api.signalerReveil(!this.paroleDepuisReveil).catch(() => undefined);
    }, DELAI_FAUX_REVEIL_MS);
  }

  private bip(): void {
    const ctx = this.micro.contexte;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  // ── session ────────────────────────────────────────────────────

  definirContexte(contexte: Contexte): void {
    this.contexte = contexte;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "contexte", ...contexte }));
  }

  private ouvrirSession(prelude: Float32Array[]): void {
    this.changerEtat("connexion");
    this.finDemandee = null;
    this.fermetureVoulue = false;
    this.enAttenteEnvoi = [...prelude];
    const taux = this.micro.contexte?.sampleRate ?? 48000;
    const ws = new WebSocket(`${URL_API.replace(/^http/, "ws")}/ws/atlas`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.encodeur = new EncodeurOpus(taux, (page) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(page);
    });
    ws.onopen = () => ws.send(JSON.stringify({ type: "start", jeton: jetonCourant(), contexte: this.contexte }));
    ws.onmessage = (e) => this.surMessage(e.data);
    ws.onclose = (e) => this.surFermeture(ws, e);
  }

  private surMessage(donnees: string | ArrayBuffer): void {
    if (donnees instanceof ArrayBuffer) {
      this.lecteur?.jouer(new Uint8Array(donnees), this.timing.stopS, this.timing.tour, this.timing.interrompu);
      return;
    }
    const msg = JSON.parse(donnees);
    switch (msg.type) {
      case "session_prete": {
        // Envoie le prélude (fin de « Hey Atlas » + début de la demande), puis le direct.
        const prelude = this.enAttenteEnvoi ?? [];
        this.enAttenteEnvoi = null;
        for (const bloc of prelude) this.encodeur?.encoder(bloc);
        this.derniereActivite = performance.now();
        this.changerEtat("ecoute");
        break;
      }
      case "audio_timing":
        this.timing = { stopS: msg.stop_s, tour: msg.turn_idx, interrompu: msg.interrupted };
        break;
      case "user_text":
        this.paroleDepuisReveil = true;
        this.derniereActivite = performance.now();
        this.rappels.surTexte({ role: "utilisateur", texte: msg.text, tour: msg.turn_idx ?? null });
        break;
      case "agent_text":
        this.rappels.surTexte({ role: "atlas", texte: msg.text, tour: msg.turn_idx ?? null });
        break;
      case "event":
        if (msg.event === "interrupted") this.lecteur?.vider();
        break;
      case "fin_demandee":
        this.finDemandee = performance.now();
        break;
      case "error":
        this.rappels.surErreur(msg.message);
        break;
    }
  }

  private surFermeture(ws: WebSocket, e: CloseEvent): void {
    if (ws !== this.ws) return;
    this.nettoyerSession();
    if (this.fermetureVoulue || this.etat === "inactif") return;
    if (e.code === 4401 || e.code === 4000) {
      this.rappels.surErreur(`Session refusée : ${e.reason || e.code}`);
      this.changerEtat("attente");
      return;
    }
    // Coupure réseau : les tâches vivent dans le registre, on rouvre simplement la session.
    this.rappels.surErreur("Connexion perdue, reprise…");
    this.changerEtat("attente");
    window.setTimeout(() => {
      if (this.etat === "attente") this.ouvrirSession([]);
    }, 1000);
  }

  private nettoyerSession(): void {
    this.encodeur?.fermer();
    this.encodeur = null;
    this.enAttenteEnvoi = null;
    this.lecteur?.vider();
    this.ws = null;
  }

  fermerSession(): void {
    this.fermetureVoulue = true;
    const ws = this.ws;
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
      ws.close();
    }
    this.nettoyerSession();
    if (this.etat !== "inactif") this.changerEtat("attente");
  }

  // ── fin de session et veille ──────────────────────────────────

  private surveiller(): void {
    const parle = this.lecteur?.joue ?? false;
    if (parle !== this.paroleAtlas) {
      this.paroleAtlas = parle;
      this.rappels.surParole(parle);
    }
    const maintenant = performance.now();
    if (parle) this.derniereActivite = maintenant;

    if (this.etat === "veille" && parle) {
      // Atlas annonce un résultat : on rouvre l'écoute pour que l'utilisateur puisse répondre.
      this.changerEtat("ecoute");
      this.ws?.send(JSON.stringify({ type: "veille", active: false }));
      return;
    }
    const silence = maintenant - this.derniereActivite;
    // Laisse à « À plus tard » le temps d'arriver et d'être joué avant de fermer.
    const finPrete = this.finDemandee !== null && !parle && maintenant - this.finDemandee > DELAI_FIN_MS;
    if (this.etat === "ecoute" && (finPrete || silence > SILENCE_FIN_MS)) {
      this.finDemandee = null;
      this.finDeConversation();
    } else if (this.etat === "veille" && !this.rappels.tachesActives() && silence > SILENCE_FIN_MS) {
      this.fermerSession();
    }
  }

  private finDeConversation(): void {
    if (this.rappels.tachesActives()) {
      this.changerEtat("veille");
      this.ws?.send(JSON.stringify({ type: "veille", active: true }));
      this.derniereActivite = performance.now();
    } else {
      this.fermerSession();
    }
  }

  private changerEtat(etat: Etat): void {
    if (etat === this.etat) return;
    this.etat = etat;
    if (etat === "attente") this.motCle?.reinitialiser();
    this.rappels.surEtat(etat);
  }
}
