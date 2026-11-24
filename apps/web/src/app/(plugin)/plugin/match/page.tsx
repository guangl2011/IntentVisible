"use client";

import { MATCH_REPLAYS } from "../../../../lib/plugin/demo-fixtures";
import { BlindSpotFooter, EmptyWithWhy, SimulatedLabel } from "../components/red-lines";

/**
 * Intent → Page (design v1.4 §2.5): the matching engine's request replay
 * — scenario and signals through the hard filter to the match score and
 * the product card preview whose selling points come from the intent
 * library's evidence-backed phrasing. The matching trace is a demo
 * fixture until the matching worker persists replays.
 */

export default function IntentToPagePage() {
  return (
    <>
      <h1>Intent → Page</h1>
      <p className="muted">
        How a buyer's AI-engine question becomes a product page: each replayed request walks scenario and
        signals through the hard filter to a match score, and the product card preview shows the selling
        points the intent library's evidence chain backs.
      </p>
      <SimulatedLabel what="matching trace (fixture)" />
      {MATCH_REPLAYS.length === 0 ? (
        <EmptyWithWhy
          title="No matching replays yet."
          hint="Replays appear once the matching worker processes AI-engine requests."
          why="The replay trace requires the matching worker's request log, which is not wired in Phase I — the rows shown are a labeled demo fixture."
        />
      ) : (
        <table className="table" data-testid="match-replay-table">
          <thead>
            <tr>
              <th>Scenario (buyer's AI question)</th>
              <th>Signals</th>
              <th>Hard filter</th>
              <th>match_score</th>
              <th>Product card preview</th>
            </tr>
          </thead>
          <tbody>
            {MATCH_REPLAYS.map((replay) => (
              <tr key={replay.scenario}>
                <td>{replay.scenario}</td>
                <td className="muted">{replay.signals}</td>
                <td>
                  <span className={`badge ${replay.hardFilter === "pass" ? "badge-APPROVED" : "badge-DENIED"}`}>
                    {replay.hardFilter}
                  </span>
                </td>
                <td>
                  {replay.hardFilter === "pass" ? (
                    replay.matchScore.toFixed(2)
                  ) : (
                    <span className="muted">excluded before scoring</span>
                  )}
                </td>
                <td>{replay.productCard}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <BlindSpotFooter
        items={[
          "The matching replay is a demo fixture — the live matching worker has not persisted request traces yet.",
          "Product-card copy is drawn from the intent library's evidence chain, not from ad claims.",
        ]}
      />
    </>
  );
}
