"use client";

import { useState } from "react";

import type { GateDecision, GateReview } from "@intentvisible/client";

import { canRejectWithNote } from "../../../../lib/pipeline/gates";

/**
 * One gate review: the artifact (rendered by the caller as children) plus
 * the decision. Approve proceeds the pipeline; reject requires a note —
 * that note is the feedback the rework path (re-model / re-expand) attaches.
 * Silence past the timeout auto-proceeds; the copy says so up front.
 */

export function GateReviewPanel({
  review,
  gate,
  timeoutAt,
  onDecide,
  busy,
  error,
  children,
}: {
  review: GateReview | null;
  gate: number;
  timeoutAt?: string;
  onDecide: (decision: GateDecision, note: string | undefined) => void;
  busy: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  const [note, setNote] = useState("");

  if (review !== null && review.status !== "pending") {
    return (
      <div className="card">
        <h2 className="page-title">Gate {gate}</h2>
        <p>
          Decision:{" "}
          <span
            className={
              review.status === "rejected" ? "badge badge-DENIED" : "badge badge-APPROVED"
            }
          >
            {review.status.replace("_", " ")}
          </span>{" "}
          {review.decided_at !== null ? (
            <span className="muted">on {review.decided_at.slice(0, 10)}</span>
          ) : null}
        </p>
        {review.note !== null && (
          <p className="muted">
            Recorded feedback: <span className="gate-note">{review.note}</span>
          </p>
        )}
      </div>
    );
  }

  const reject = () => {
    if (!busy && canRejectWithNote(note)) onDecide("rejected", note.trim());
  };
  const approve = () => {
    if (!busy) onDecide("approved", note.trim().length > 0 ? note.trim() : undefined);
  };

  return (
    <div className="card gate-review-panel">
      <div className="intent-head">
        <h2 className="page-title">Gate {gate} — review</h2>
        {timeoutAt !== undefined && (
          <span className="badge badge-PENDING_APPROVAL">
            auto-proceeds after {timeoutAt.slice(0, 10)} (72h timeout)
          </span>
        )}
      </div>
      {children}
      <div className="gate-actions">
        <label className="field">
          Feedback for the pipeline (required to reject — the rework attaches it)
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            aria-label={`Gate ${gate} feedback`}
            placeholder="What should change — the pipeline re-runs with this feedback attached."
          />
        </label>
        <div className="row-actions">
          <button type="button" className="primary" disabled={busy} onClick={approve}>
            {busy ? "Recording…" : "Approve"}
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy || !canRejectWithNote(note)}
            onClick={reject}
          >
            Reject with feedback
          </button>
        </div>
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
