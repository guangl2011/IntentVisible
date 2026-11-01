import type { PromptRecord } from "@intentvisible/client";

import { EmptyPanel } from "../../components/panels";

/**
 * Gate 2's artifact: the expanded prompts grouped by intent, drafts flagged.
 * The API's review action is approve (flips drafts to confirmed and arms the
 * baseline) or reject with a note (the feedback the re-expansion attaches) —
 * this panel renders that contract honestly; it renders no dead buttons.
 */

export interface PromptGroup {
  intentId: string;
  prompts: PromptRecord[];
}

/** Group prompts by their intent in first-seen order (pure, exported for tests). */
export function groupPromptsByIntent(prompts: readonly PromptRecord[]): PromptGroup[] {
  const groups = new Map<string, PromptRecord[]>();
  for (const prompt of prompts) {
    const existing = groups.get(prompt.intent_id);
    if (existing === undefined) {
      groups.set(prompt.intent_id, [prompt]);
    } else {
      existing.push(prompt);
    }
  }
  return [...groups.entries()].map(([intentId, grouped]) => ({ intentId, prompts: grouped }));
}

export function PromptsPanel({ prompts }: { prompts: PromptRecord[] }) {
  if (prompts.length === 0) {
    return (
      <EmptyPanel
        title="No prompts yet"
        hint="Stage B expands the confirmed intents into buyer-voiced prompts once Gate 1 is approved."
      />
    );
  }
  const groups = groupPromptsByIntent(prompts);
  return (
    <div className="card prompts-panel">
      <div className="intent-head">
        <h2 className="page-title">Expanded prompts</h2>
        <span className="badge badge-PENDING_APPROVAL">{prompts.length} drafts flagged</span>
      </div>
      {groups.map((group) => (
        <section key={group.intentId} className="prompt-group">
          <h3>{group.intentId}</h3>
          <ul className="graph-list">
            {group.prompts.map((prompt) => (
              <li key={prompt.prompt_id} className="prompt-item">
                <span className={prompt.status === "draft" ? "badge badge-PENDING_APPROVAL" : "badge badge-APPROVED"}>
                  {prompt.status}
                </span>{" "}
                <span className="prompt-text">“{prompt.text}”</span>
                <span className="muted prompt-meta">
                  {prompt.buyer_stage} · {prompt.intent_category} · {prompt.country}/{prompt.language} ·
                  data mode: {prompt.data_mode}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
