import { useState } from "react";
import { api, type Statut, type Tache } from "../api";

const LIBELLES: Record<Statut, string> = {
  en_attente: "En attente d'un agent",
  en_cours: "En cours",
  besoin_precision: "Question",
  attend_confirmation: "À confirmer",
  terminee: "Terminée",
  echouee: "Échouée",
  annulee: "Annulée",
};

const AGENTS: Record<Tache["type_agent"], string> = {
  explorateur: "Explorateur",
  editeur_graphe: "Éditeur de graphe",
  conversation: "Conversation",
};

function Detail({ valeur }: { valeur: unknown }) {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur === "string") return <p className="detail-texte">{valeur}</p>;
  return <pre className="detail-json">{JSON.stringify(valeur, null, 2)}</pre>;
}

export function CarteTache({ tache }: { tache: Tache }) {
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const agir = (action: () => Promise<unknown>) => {
    setErreur(null);
    action().then(() => setSaisie(""), (e) => setErreur(String(e.message ?? e)));
  };

  const active = ["en_attente", "en_cours", "besoin_precision", "attend_confirmation"].includes(tache.statut);

  return (
    <article className={`tache statut-${tache.statut}`}>
      <header>
        <h3>{tache.titre}</h3>
        <span className="badge">{LIBELLES[tache.statut]}</span>
      </header>
      <p className="meta">
        {AGENTS[tache.type_agent]} · {tache.canal === "vocal" ? "demandé à la voix" : "demandé par écrit"}
        {tache.nature === "retour_arriere" && " · retour en arrière"}
      </p>
      <p className="demande">« {tache.demande_brute} »</p>

      {tache.statut === "en_cours" && (
        <div className="avancement">
          <span>{tache.avancement ?? "L'agent travaille…"}</span>
          {tache.pourcentage !== null && (
            <progress max={100} value={tache.pourcentage} aria-label="Avancement" />
          )}
        </div>
      )}

      {tache.statut === "besoin_precision" && (
        <form className="action" onSubmit={(e) => {
          e.preventDefault();
          if (saisie.trim()) agir(() => api.repondre(tache.id, saisie.trim()));
        }}>
          <p className="question">{tache.question}</p>
          <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Votre réponse" />
          <button type="submit">Répondre</button>
        </form>
      )}

      {tache.statut === "attend_confirmation" && tache.modification_proposee && (
        <div className="action">
          <p className="question">{tache.modification_proposee.description_orale}</p>
          <Detail valeur={tache.modification_proposee.diff} />
          <div className="boutons">
            <button className="principal" onClick={() => agir(() => api.confirmer(tache.id, "oui"))}>Valider</button>
            <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Correction (facultatif)" />
            <button onClick={() => agir(() => api.confirmer(tache.id, "non", saisie.trim() || undefined))}>
              Refuser
            </button>
          </div>
        </div>
      )}

      {tache.statut === "terminee" && (
        <div className="resultat">
          <p className="oral">{tache.resultat_oral}</p>
          <Detail valeur={tache.resultat_detail} />
        </div>
      )}
      {tache.statut === "echouee" && <p className="erreur">{tache.erreur}</p>}

      <div className="boutons">
        {active && <button onClick={() => agir(() => api.annuler(tache.id, "arreter"))}>Arrêter</button>}
        {tache.statut === "terminee" && tache.modification_appliquee && (
          <button onClick={() => agir(() => api.annuler(tache.id, "revenir"))}>Annuler la modification</button>
        )}
      </div>
      {erreur && <p className="erreur">{erreur}</p>}
    </article>
  );
}
