"use client";

import { useState } from "react";

import type { IntentRecord } from "@intentvisible/client";

import type { ReviewChip } from "../../../../lib/shopify/review";

/**
 * One intent in the merchant library: the buyer question, the review
 * chip, and the local review actions (approve, edit prompts). All actions
 * are callbacks — no API calls inside this component.
 */
export function IntentReviewCard({
  intent,
  chip,
  prompts,
  onApprove,
  onSavePrompts,
}: {
  intent: IntentRecord;
  chip: ReviewChip;
  /** The prompts currently shown (merchant edits when present). */
  prompts: string[];
  onApprove: () => void;
  onSavePrompts: (prompts: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prompts.join("\n"));

  const startEditing = () => {
    setDraft(prompts.join("\n"));
    setEditing(true);
  };
  const save = () => {
    const lines = draft
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length > 0) onSavePrompts(lines);
    setEditing(false);
  };

  return (
    <div className="card intent-card">
      <div className="intent-head">
        <span className="action">{intent.intent_name}</span>
        <span className="badge badge-DECLARED">{intent.scope}</span>
        <span className="badge badge-PENDING_APPROVAL">{intent.intent_category}</span>
        <span className="badge">{intent.buyer_stage}</span>
        {chip === "approved" && <span className="badge badge-APPROVED">approved</span>}
        {chip === "edited" && <span className="badge badge-MEDIUM">prompts edited</span>}
        <span className="muted intent-id">{intent.intent_id}</span>
      </div>
      <div className="intent-prompts">
        {editing ? (
          <div className="prompt-editor">
            <textarea
              aria-label="Edit prompts, one per line"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={Math.max(3, prompts.length + 1)}
            />
            <div className="row-actions">
              <button type="button" className="primary" onClick={save}>
                Save prompts
              </button>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <ul>
            {prompts.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
        )}
      </div>
      {intent.recommended_content !== undefined && (
        <p className="muted">Recommended content: {intent.recommended_content}</p>
      )}
      <div className="intent-evidence">
        <span className="muted">
          Evidence: not measured — visibility and volume are unknown until measured.
        </span>{" "}
        {intent.evidence_urls.map((url) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="evidence-link">
            source
          </a>
        ))}
      </div>
      <div className="row-actions">
        {chip !== "approved" && (
          <button type="button" className="primary" onClick={onApprove}>
            Approve
          </button>
        )}
        {!editing && (
          <button type="button" onClick={startEditing}>
            Edit prompts
          </button>
        )}
      </div>
    </div>
  );
}
