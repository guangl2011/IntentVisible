import type { MarketingGraph } from "@intentvisible/client";

import { EmptyPanel } from "../../components/panels";

/**
 * Gate 1's artifact: the Marketing Graph rendered — personas, scenarios,
 * competitors, and the top candidate intents with demand tier / fit / gap.
 * Presentational: takes the parsed graph, renders every node with its
 * data_mode so nothing estimated can pass as measured.
 */

function EvidenceLink({ urls }: { urls: string[] }) {
  if (urls.length === 0) return <span className="badge badge-PENDING_APPROVAL">assumption</span>;
  return (
    <a href={urls[0] ?? "#"} target="_blank" rel="noreferrer" className="evidence-link">
      evidence ({urls.length})
    </a>
  );
}

export function GraphPanel({ graph }: { graph: MarketingGraph | null }) {
  if (graph === null) {
    return (
      <EmptyPanel
        title="No Marketing Graph yet"
        hint="Stage A models the graph from your site's crawl — this screen fills in as soon as it is ready."
      />
    );
  }
  return (
    <div className="card graph-panel">
      <div className="intent-head">
        <h2 className="page-title">Marketing Graph</h2>
        <span className="badge badge-DECLARED">data mode: {graph.data_mode}</span>
      </div>
      <p className="muted">
        {graph.value_proposition.text} <EvidenceLink urls={graph.value_proposition.evidence_urls} />
      </p>

      <h3>Personas</h3>
      <ul className="graph-list">
        {graph.personas.map((persona) => (
          <li key={persona.persona_id}>
            <strong>{persona.archetype}</strong> — {persona.demographics.text}{" "}
            <EvidenceLink urls={persona.demographics.evidence_urls} />
          </li>
        ))}
      </ul>

      <h3>Scenarios</h3>
      <ul className="graph-list">
        {graph.scenarios.map((scenario) => (
          <li key={scenario.scenario_id}>
            <strong>{scenario.scenario_type}</strong> — {scenario.description.text}{" "}
            <EvidenceLink urls={scenario.description.evidence_urls} />
          </li>
        ))}
      </ul>

      <h3>Competitors</h3>
      <ul className="graph-list">
        {graph.competitors.map((competitor) => (
          <li key={competitor.brand_id}>
            <strong>{competitor.name}</strong> ({competitor.relation}) —{" "}
            {competitor.claims.map((claim) => claim.text).join("; ")}
          </li>
        ))}
      </ul>

      <h3>Top candidate intents</h3>
      <table className="metric-table">
        <thead>
          <tr>
            <th scope="col">Intent</th>
            <th scope="col">Stage</th>
            <th scope="col">Demand tier</th>
            <th scope="col">Fit</th>
            <th scope="col">Gap (void rate)</th>
            <th scope="col">Priority</th>
          </tr>
        </thead>
        <tbody>
          {graph.intent_topics.map((topic) => (
            <tr key={topic.intent_id}>
              <td>{topic.intent_name}</td>
              <td>{topic.buyer_stage}</td>
              <td>
                <span className={`badge badge-PENDING_APPROVAL`}>{topic.volume.tier}</span>
              </td>
              <td>
                {topic.fit.score.toFixed(2)}
                {topic.fit.mismatch_reason !== undefined ? ` — ${topic.fit.mismatch_reason}` : ""}
              </td>
              <td>{topic.gap.void_rate_pct.toFixed(1)}%</td>
              <td>{topic.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted provenance-line">
        Demand is shown as tiers only — exact volumes are never presented for estimated data.
      </p>
    </div>
  );
}
