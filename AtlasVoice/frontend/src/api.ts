/** Accès au back : tâches (REST + flux SSE), métriques. Le jeton ne passe jamais dans l'URL. */

export const URL_API = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

export type Statut =
  | "en_attente" | "en_cours" | "besoin_precision" | "attend_confirmation"
  | "terminee" | "echouee" | "annulee";

export const STATUTS_ACTIFS: Statut[] = ["en_attente", "en_cours", "besoin_precision", "attend_confirmation"];

export interface Tache {
  id: number;
  titre: string;
  type_agent: "explorateur" | "editeur_graphe" | "conversation";
  nature: "travail" | "retour_arriere";
  demande_brute: string;
  reformulation: string;
  statut: Statut;
  avancement: string | null;
  pourcentage: number | null;
  question: string | null;
  modification_proposee: { description_orale: string; diff: unknown } | null;
  resultat_oral: string | null;
  resultat_detail: unknown;
  modification_appliquee: boolean;
  erreur: string | null;
  canal: "vocal" | "texte";
  cree_le: string;
  maj_le: string;
}

let jeton: string | null = null;

/** À appeler par l'application hôte avec le JWT Supabase de l'utilisateur connecté. */
export function definirJeton(nouveau: string | null): void {
  jeton = nouveau;
}

export function jetonCourant(): string | null {
  return jeton;
}

/** Pas de Content-Type sur les lectures : le navigateur n'a pas à faire de requête préalable (CORS). */
function entetes(avecCorps = false): HeadersInit {
  const res: Record<string, string> = {};
  if (jeton) res.Authorization = `Bearer ${jeton}`;
  if (avecCorps) res["Content-Type"] = "application/json";
  return res;
}

async function appel<T>(chemin: string, init?: RequestInit): Promise<T> {
  const reponse = await fetch(`${URL_API}${chemin}`, { ...init, headers: entetes(init?.body !== undefined) });
  if (!reponse.ok) {
    const detail = await reponse.text();
    throw new Error(`${reponse.status} ${detail}`);
  }
  return reponse.status === 204 ? (undefined as T) : reponse.json();
}

export const api = {
  confirmer: (id: number, decision: "oui" | "non", correction?: string) =>
    appel<Tache>(`/api/taches/${id}/confirmation`, { method: "POST", body: JSON.stringify({ decision, correction }) }),
  repondre: (id: number, reponse: string) =>
    appel<Tache>(`/api/taches/${id}/reponse`, { method: "POST", body: JSON.stringify({ reponse }) }),
  annuler: (id: number, mode: "arreter" | "revenir") =>
    appel<Tache>(`/api/taches/${id}/annulation`, { method: "POST", body: JSON.stringify({ mode }) }),
  metriques: () => appel<Record<string, unknown>>("/api/metriques"),
  signalerReveil: (faux: boolean) =>
    appel<void>("/api/metriques/reveil", { method: "POST", body: JSON.stringify({ faux }) }),
};

/**
 * Suit le registre : état initial puis un événement par changement. Se reconnecte seul.
 * Renvoie une fonction d'arrêt.
 */
export function suivreTaches(surEtat: (taches: Tache[]) => void, surTache: (tache: Tache) => void): () => void {
  const controle = new AbortController();

  async function boucle(): Promise<void> {
    while (!controle.signal.aborted) {
      try {
        const reponse = await fetch(`${URL_API}/api/taches/flux`, { headers: entetes(), signal: controle.signal });
        if (!reponse.ok || !reponse.body) throw new Error(`flux ${reponse.status}`);
        const lecteur = reponse.body.pipeThrough(new TextDecoderStream()).getReader();
        let tampon = "";
        for (;;) {
          const { value, done } = await lecteur.read();
          if (done) break;
          tampon += value;
          let fin: number;
          while ((fin = tampon.indexOf("\n\n")) >= 0) {
            const bloc = tampon.slice(0, fin);
            tampon = tampon.slice(fin + 2);
            const nom = /^event: (.*)$/m.exec(bloc)?.[1];
            const donnees = /^data: (.*)$/m.exec(bloc)?.[1];
            if (!donnees) continue;
            if (nom === "etat") surEtat(JSON.parse(donnees));
            else if (nom === "tache") surTache(JSON.parse(donnees).tache);
          }
        }
      } catch {
        if (controle.signal.aborted) return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  void boucle();
  return () => controle.abort();
}
