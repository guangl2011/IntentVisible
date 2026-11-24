"use client";

import { MATCH_REPLAYS } from "../../../../lib/plugin/demo-fixtures";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { BlindSpotFooter, EmptyWithWhy, SimulatedLabel } from "../components/red-lines";

/**
 * Intent → Page (design v1.4 §2.5): the matching engine's request replay
 * — scenario and signals through the hard filter to the match score and
 * the product card preview whose selling points come from the intent
 * library's evidence-backed phrasing. The matching trace is a demo
 * fixture until the matching worker persists replays.
 */

export default function IntentToPagePage() {
  const t = useT();
  return (
    <>
      <h1>{t.match.title}</h1>
      <p className="muted">{t.match.intro}</p>
      <SimulatedLabel what={t.simLabels.matchTrace} />
      {MATCH_REPLAYS.length === 0 ? (
        <EmptyWithWhy
          title={t.match.empty.title}
          hint={t.match.empty.hint}
          why={t.match.empty.why}
        />
      ) : (
        <table className="table" data-testid="match-replay-table">
          <thead>
            <tr>
              <th>{t.match.headers.scenario}</th>
              <th>{t.match.headers.signals}</th>
              <th>{t.match.headers.filter}</th>
              <th>{t.match.headers.score}</th>
              <th>{t.match.headers.card}</th>
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
                    <span className="muted">{t.match.excludedBeforeScoring}</span>
                  )}
                </td>
                <td>{replay.productCard}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <BlindSpotFooter items={t.blindSpots.match} />
    </>
  );
}
