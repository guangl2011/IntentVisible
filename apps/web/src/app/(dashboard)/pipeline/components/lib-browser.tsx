import type { PublishedIntent } from "@intentvisible/client";

import { EmptyPanel } from "../../components/panels";
import { languageName } from "../../../../lib/pipeline/markets";

/**
 * The lib browser over published Buyer Intent Lib records. Each published
 * intent is a self-contained v2 record: name, version, stage, category,
 * market, sample prompts, and its measurement block — visibility and volume
 * render only when the record actually carries measurement provenance, and
 * that provenance (source, model, dates) renders beside the numbers.
 */

const STATUS_BADGES: Readonly<Record<PublishedIntent["record"]["measurement_status"], string>> = {
  not_measured: "badge badge-PENDING_APPROVAL",
  imported: "badge badge-DECLARED",
  simulated: "badge badge-PENDING_APPROVAL",
  measured: "badge badge-APPROVED",
};

export function LibBrowser({ records }: { records: PublishedIntent[] }) {
  if (records.length === 0) {
    return (
      <EmptyPanel
        title="No published intents yet"
        hint="Publish at Gate 3 to fill the Buyer Intent Lib — this browser lists every published record with its data mode and provenance."
      />
    );
  }
  return (
    <div className="lib-browser">
      <h2 className="page-title">Buyer Intent Lib</h2>
      {records.map(({ project_id, record }) => (
        <article key={`${project_id}:${record.intent_id}`} className="card intent-card">
          <div className="intent-head">
            <h3>{record.intent_name}</h3>
            <span className={STATUS_BADGES[record.measurement_status]}>{record.measurement_status}</span>
          </div>
          <p className="muted intent-summary">
            {record.buyer_stage} · {record.intent_category} · {record.country}/{languageName(record.language)} ·
            v{record.intent_version} · confidence: {record.confidence}
          </p>
          {record.visibility_pct !== null && (
            <p>
              Visibility: <strong>{record.visibility_pct.toFixed(1)}%</strong>{" "}
              <span className="muted provenance-line">
                (source: {record.measurement_source ?? "unrecorded"})
              </span>
            </p>
          )}
          {record.monthly_search_volume !== null && (
            <p>
              Monthly search volume: <strong>{record.monthly_search_volume}</strong>{" "}
              <span className="muted provenance-line">(measured — provider data)</span>
            </p>
          )}
          {record.measurement_provenance !== undefined && (
            <p className="muted provenance-line">
              Measurement: {record.measurement_provenance.source} · {record.measurement_provenance.model_id} ·{" "}
              {record.measurement_provenance.date_range.from.slice(0, 10)} →{" "}
              {record.measurement_provenance.date_range.to.slice(0, 10)}
            </p>
          )}
          {record.pain_point !== undefined && <p>Pain point: {record.pain_point}</p>}
          {record.recommended_content !== undefined && (
            <p>
              Recommended content: {record.recommended_content}
              {record.recommended_cta !== undefined ? ` — CTA: ${record.recommended_cta}` : ""}
            </p>
          )}
          <details className="intent-details">
            <summary>{record.prompts.length} sample prompts</summary>
            <ul>
              {record.prompts.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
          </details>
          <p className="muted provenance-line">
            {record.evidence_urls.length} evidence URLs · generation: {record.generation_method}
          </p>
        </article>
      ))}
    </div>
  );
}
