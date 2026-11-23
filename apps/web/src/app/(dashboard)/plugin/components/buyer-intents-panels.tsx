import Link from "next/link";

import type { BuyerIntentPayload } from "../../../../lib/plugin/types";
import { VisibilityProvenanceBadge } from "./badges";

/**
 * Buyer Intents panels (design v1.4 §2.3): intent units grouped by
 * persona × stage, each prompt card carrying full visibility provenance
 * — source engines and measurement window on every measured value, an
 * explicit not-measured state on the rest, and single-day snapshots
 * labeled as such.
 */

/** Groups intent units by persona → buyer stage for the list page. */
export function groupByPersonaStage(units: BuyerIntentPayload[]): { persona: string; stages: { stage: string; units: BuyerIntentPayload[] }[] }[] {
  const personas = [...new Set(units.map((unit) => unit.persona))].sort();
  return personas.map((persona) => {
    const personaUnits = units.filter((unit) => unit.persona === persona);
    const stages = [...new Set(personaUnits.map((unit) => unit.buyer_stage))].sort();
    return {
      persona,
      stages: stages.map((stage) => ({
        stage,
        units: personaUnits.filter((unit) => unit.buyer_stage === stage),
      })),
    };
  });
}

export function IntentGroupTable({ units }: { units: BuyerIntentPayload[] }) {
  if (units.length === 0) {
    return (
      <div className="card empty-card">
        <strong>No buyer intents yet.</strong>
        <p className="muted">
          Intent units appear here once site research derives them from your own pages — grouped by the
          persona asking, the stage they are in, and the pain point they are trying to solve.
        </p>
      </div>
    );
  }
  return (
    <>
      {groupByPersonaStage(units).map((group) => (
        <div key={group.persona} className="persona-group">
          {group.stages.map((stageGroup) => (
            <div key={stageGroup.stage} className="card">
              <div className="intent-head">
                <h3>
                  {group.persona} · {stageGroup.stage}
                </h3>
                <span className="muted">{stageGroup.units.length} intent(s)</span>
              </div>
              {stageGroup.units.map((unit) => (
                <IntentUnitCard key={unit.intent_id} unit={unit} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export function IntentUnitCard({ unit }: { unit: BuyerIntentPayload }) {
  return (
    <div className="intent-unit">
      <div className="intent-head">
        <strong>
          <Link href={`/plugin/intents/${unit.intent_id}`}>{unit.intent_name}</Link>{" "}
          <span className={`badge badge-${unit.status.toUpperCase()}`}>{unit.status.replace("_", " ")}</span>{" "}
          <span className="badge badge-neutral">{unit.scope} · {unit.intent_category}</span>
        </strong>
        <VisibilityProvenanceBadge visibility={unit.visibility} />
      </div>
      <p className="muted">{unit.pain_point}</p>
      <div className="intent-prompts">
        <strong className="muted">Buyer prompts (the questions AI engines see):</strong>
        <ul>
          {unit.prompts.map((prompt) => (
            <li key={prompt.prompt_text} className={prompt.is_primary ? "primary-prompt" : undefined}>
              {prompt.prompt_text}
              {prompt.is_primary ? <span className="muted"> · primary</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
