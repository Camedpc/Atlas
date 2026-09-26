import { useEffect, useMemo, useRef, useState } from "react";
import { STATUTS_ACTIFS, suivreTaches, type Tache } from "./api";
import { CarteTache } from "./composants/CarteTache";
import { TableauDeBord } from "./composants/TableauDeBord";
import { AssistantVocal, type Etat, type Ligne } from "./voix/assistant";

const LIBELLES_ETAT: Record<Etat, string> = {
  inactif: "Mode vocal désactivé",
  attente: "J'attends « Hey Atlas »",
  connexion: "Connexion…",
  ecoute: "J'écoute",
  veille: "En veille : une tâche tourne",
};

function fusionner(lignes: Ligne[], nouvelle: Ligne): Ligne[] {
  const derniere = lignes[lignes.length - 1];
  if (derniere && derniere.role === nouvelle.role && derniere.tour === nouvelle.tour) {
    return [...lignes.slice(0, -1), { ...derniere, texte: `${derniere.texte} ${nouvelle.texte}` }];
  }
  return [...lignes.slice(-40), nouvelle];
}

export default function App() {
  const [etat, setEtat] = useState<Etat>("inactif");
  const [parle, setParle] = useState(false);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [taches, setTaches] = useState<Tache[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [motCle, setMotCle] = useState<{ disponible: boolean; raison?: string } | null>(null);
  const [onglet, setOnglet] = useState<"taches" | "tableau">("taches");
  const [graphe, setGraphe] = useState("");
  const [conversation, setConversation] = useState("");
  const tachesRef = useRef<Tache[]>([]);
  tachesRef.current = taches;

  const assistant = useMemo(() => new AssistantVocal({
    surEtat: setEtat,
    surParole: setParle,
    surTexte: (ligne) => setLignes((l) => fusionner(l, ligne)),
    surErreur: setErreur,
    surMotCle: (disponible, raison) => setMotCle({ disponible, raison }),
    tachesActives: () => tachesRef.current.some((t) => STATUTS_ACTIFS.includes(t.statut)),
  }), []);

  useEffect(() => suivreTaches(
    setTaches,
    (tache) => setTaches((ts) => [tache, ...ts.filter((t) => t.id !== tache.id)]),
  ), []);

  useEffect(() => {
    assistant.definirContexte({ graphe_actif: graphe || null, conversation_active: conversation || null });
  }, [assistant, graphe, conversation]);

  // Activation manuelle : Alt+A.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        assistant.reveiller("manuel");
      }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [assistant]);

  useEffect(() => () => assistant.desactiver(), [assistant]);

  const activer = () => {
    setErreur(null);
    assistant.activer().catch((e) => setErreur(`Micro indisponible : ${e.message ?? e}`));
  };

  const actives = taches.filter((t) => STATUTS_ACTIFS.includes(t.statut));
  const finies = taches.filter((t) => !STATUTS_ACTIFS.includes(t.statut));
  const transmet = etat === "ecoute" || etat === "connexion";

  return (
    <div className="app">
      <header className="entete">
        <h1>Atlas</h1>
        <div className={`indicateur etat-${etat} ${parle ? "parle" : ""}`} role="status" aria-live="polite">
          <span className="point" aria-hidden />
          {parle ? "Atlas parle" : LIBELLES_ETAT[etat]}
        </div>
        {etat !== "inactif" && (
          <span className={`micro ${transmet ? "transmis" : ""}`}>
            {transmet ? "Micro transmis à Atlas" : "Micro actif, écoute locale"}
          </span>
        )}
      </header>

      <section className="commandes">
        {etat === "inactif" ? (
          <button className="principal" onClick={activer}>Activer le mode vocal</button>
        ) : (
          <>
            <button className="principal" onClick={() => assistant.reveiller("manuel")}
              disabled={etat === "ecoute" || etat === "connexion"} title="Raccourci : Alt+A">
              Parler à Atlas
            </button>
            {(etat === "ecoute" || etat === "veille") && (
              <button onClick={() => assistant.fermerSession()}>Terminer la session</button>
            )}
            <button onClick={() => assistant.desactiver()}>Couper le micro</button>
          </>
        )}
        {motCle && !motCle.disponible && (
          <p className="note">« Hey Atlas » indisponible ({motCle.raison}). Activation par le bouton ou Alt+A.</p>
        )}
        <div className="contexte">
          <label>Graphe affiché<input value={graphe} onChange={(e) => setGraphe(e.target.value)} /></label>
          <label>Conversation affichée<input value={conversation} onChange={(e) => setConversation(e.target.value)} /></label>
        </div>
        {erreur && <p className="erreur" role="alert">{erreur}</p>}
      </section>

      <main className="colonnes">
        <section className="transcription" aria-label="Conversation vocale">
          <h2>Conversation</h2>
          {lignes.length === 0 && <p className="vide">Dites « Hey Atlas », puis votre demande.</p>}
          {lignes.map((l, i) => (
            <p key={i} className={`ligne ${l.role}`}><strong>{l.role === "atlas" ? "Atlas" : "Vous"}</strong> {l.texte}</p>
          ))}
        </section>

        <section className="panneau">
          <nav className="onglets">
            <button className={onglet === "taches" ? "actif" : ""} onClick={() => setOnglet("taches")}>
              Tâches{actives.length > 0 && ` (${actives.length})`}
            </button>
            <button className={onglet === "tableau" ? "actif" : ""} onClick={() => setOnglet("tableau")}>
              Tableau de bord
            </button>
          </nav>
          {onglet === "taches" ? (
            <div className="taches">
              {taches.length === 0 && <p className="vide">Aucune tâche.</p>}
              {actives.map((t) => <CarteTache key={t.id} tache={t} />)}
              {finies.length > 0 && <h2>Terminées</h2>}
              {finies.map((t) => <CarteTache key={t.id} tache={t} />)}
            </div>
          ) : <TableauDeBord />}
        </section>
      </main>
    </div>
  );
}
