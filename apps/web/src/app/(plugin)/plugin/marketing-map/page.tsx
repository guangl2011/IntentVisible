"use client";

import { MARKETING_MAP_NODES } from "../../../../lib/plugin/demo-fixtures";
import { BlindSpotFooter, SimulatedLabel } from "../components/red-lines";

/**
 * Marketing Map (design v1.4 §2.3): persona × scenario × competitor
 * cards with the evidence sentence (or the explicit assumption mark)
 * behind each node — Gate 1 review lives in the pipeline pages.
 */
export default function MarketingMapPage() {
  return (
    <>
      <h1>Marketing Map</h1>
      <p className="muted">
        The derived market structure behind your intent library: who buys (persona), in which scenario, and
        against which competitor — every node carries its evidence sentence or an explicit assumption mark.
      </p>
      <SimulatedLabel what="map nodes (fixture)" />
      <table className="table" data-testid="marketing-map-table">
        <thead>
          <tr>
            <th>Persona</th>
            <th>Scenario</th>
            <th>Competitor</th>
            <th>Evidence</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {MARKETING_MAP_NODES.map((node) => (
            <tr key={`${node.persona}-${node.scenario}`}>
              <td>{node.persona}</td>
              <td>{node.scenario}</td>
              <td>{node.competitor}</td>
              <td className="muted">{node.evidence}</td>
              <td>
                {node.assumption ? (
                  <span className="badge badge-not-measured">assumption — needs review</span>
                ) : (
                  <span className="badge badge-APPROVED">evidence-backed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Assumption nodes are never eligible for intent generation until a reviewer confirms them (Gate 1).
      </p>
      <BlindSpotFooter
        items={[
          "Map nodes shown are a labeled fixture — the live derivation graph renders in the pipeline map page.",
          "Assumptions are marked rather than presented as measured demand.",
        ]}
      />
    </>
  );
}
