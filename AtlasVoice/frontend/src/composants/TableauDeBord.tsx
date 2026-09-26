import { useEffect, useState } from "react";
import { api } from "../api";

interface Quantiles { n: number; p50: number | null; p95: number | null }

interface Metriques {
  sessions: number;
  latence_ms: Record<string, Quantiles>;
  llm: Record<string, { ttft: Quantiles; echecs: number; comme_secours: number }>;
  outils: Record<string, number>;
  taux_erreur_outils: number | null;
  interruptions: number;
  reveils: { vrais?: number; faux?: number };
  taches_24h: Record<string, { duree_ms: Quantiles; echecs: number }>;
}

const ETAPES: Record<string, [string, number]> = {
  fin_de_tour: ["Fin de tour (STT + VAD)", 150],
  premier_token: ["Premier token d'Atlas", 400],
  premier_audio: ["Premier audio TTS", 150],
  total: ["Total jusqu'au premier audio", 800],
};

function ms(v: number | null) {
  return v === null ? "—" : `${v} ms`;
}

export function TableauDeBord() {
  const [m, setM] = useState<Metriques | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const charger = () => api.metriques().then((d) => { setM(d as unknown as Metriques); setErreur(null); },
      (e) => setErreur(String(e.message ?? e)));
    charger();
    const id = window.setInterval(charger, 5000);
    return () => window.clearInterval(id);
  }, []);

  if (erreur) return <p className="erreur">{erreur}</p>;
  if (!m) return <p className="vide">Chargement…</p>;

  const reveils = (m.reveils.vrais ?? 0) + (m.reveils.faux ?? 0);
  return (
    <div className="tableau">
      <section>
        <h3>Latence de la couche vocale</h3>
        <table>
          <thead><tr><th>Étape</th><th>Budget p50</th><th>p50</th><th>p95</th><th>Tours</th></tr></thead>
          <tbody>
            {Object.entries(ETAPES).map(([cle, [nom, budget]]) => {
              const q = m.latence_ms[cle];
              const depasse = q?.p50 !== null && q?.p50 !== undefined && q.p50 > budget;
              return (
                <tr key={cle}>
                  <td>{nom}</td><td>{budget} ms</td>
                  <td className={depasse ? "depasse" : ""}>{ms(q?.p50 ?? null)}</td>
                  <td>{ms(q?.p95 ?? null)}</td><td>{q?.n ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Modèle d'Atlas</h3>
        <table>
          <thead><tr><th>Modèle</th><th>TTFT p50</th><th>TTFT p95</th><th>Échecs</th><th>En secours</th></tr></thead>
          <tbody>
            {Object.entries(m.llm).map(([nom, e]) => (
              <tr key={nom}><td>{nom}</td><td>{ms(e.ttft.p50)}</td><td>{ms(e.ttft.p95)}</td>
                <td>{e.echecs}</td><td>{e.comme_secours}</td></tr>
            ))}
            {Object.keys(m.llm).length === 0 && <tr><td colSpan={5} className="vide">Aucun appel</td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Tâches des dernières 24 h</h3>
        <table>
          <thead><tr><th>Agent</th><th>Durée p50</th><th>Durée p95</th><th>Terminées</th><th>Échecs</th></tr></thead>
          <tbody>
            {Object.entries(m.taches_24h).map(([agent, t]) => (
              <tr key={agent}><td>{agent}</td><td>{ms(t.duree_ms.p50)}</td><td>{ms(t.duree_ms.p95)}</td>
                <td>{t.duree_ms.n}</td><td>{t.echecs}</td></tr>
            ))}
            {Object.keys(m.taches_24h).length === 0 && <tr><td colSpan={5} className="vide">Aucune tâche finie</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="chiffres">
        <div><strong>{m.sessions}</strong><span>sessions</span></div>
        <div><strong>{Object.values(m.outils).reduce((a, b) => a + b, 0)}</strong><span>appels d'outils</span></div>
        <div>
          <strong>{m.taux_erreur_outils === null ? "—" : `${Math.round(m.taux_erreur_outils * 100)} %`}</strong>
          <span>appels d'outils en erreur</span>
        </div>
        <div><strong>{m.interruptions}</strong><span>interruptions (barge-in)</span></div>
        <div><strong>{reveils ? `${m.reveils.faux ?? 0} / ${reveils}` : "—"}</strong><span>faux réveils</span></div>
      </section>
    </div>
  );
}
