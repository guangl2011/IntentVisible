"use client";

import { MARKETING_MAP_NODES } from "../../../../lib/plugin/demo-fixtures";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { BlindSpotFooter, SimulatedLabel } from "../components/red-lines";

/**
 * Marketing Map (design v1.4 §2.3): persona × scenario × competitor
 * cards with the evidence sentence (or the explicit assumption mark)
 * behind each node — Gate 1 review lives in the pipeline pages.
 */
export default function MarketingMapPage() {
  const t = useT();
  return (
    <>
      <h1>{t.marketingMap.title}</h1>
      <p className="muted">{t.marketingMap.intro}</p>
      <SimulatedLabel what={t.simLabels.mapNodes} />
      <table className="table" data-testid="marketing-map-table">
        <thead>
          <tr>
            <th>{t.marketingMap.headers.persona}</th>
            <th>{t.marketingMap.headers.scenario}</th>
            <th>{t.marketingMap.headers.competitor}</th>
            <th>{t.marketingMap.headers.evidence}</th>
            <th>{t.marketingMap.headers.status}</th>
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
                  <span className="badge badge-not-measured">{t.marketingMap.assumptionBadge}</span>
                ) : (
                  <span className="badge badge-APPROVED">{t.marketingMap.evidenceBadge}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{t.marketingMap.gateNote}</p>
      <BlindSpotFooter items={t.blindSpots.marketingMap} />
    </>
  );
}
