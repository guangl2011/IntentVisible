"use client";

import { useActionState } from "react";
import { createAgentAction, type CreateAgentActionState } from "./actions";

const INITIAL: CreateAgentActionState = {};

/**
 * Agent creation form. On success the raw key is rendered from action state
 * — component state that vanishes on the next navigation or reload, which
 * is exactly the one-time reveal contract. The reveal replaces the form;
 * reloading the page returns to a fresh form.
 */
export function CreateAgentForm() {
  const [state, formAction, pending] = useActionState(
    createAgentAction,
    INITIAL,
  );

  if (state.rawKey) {
    return (
      <div className="key-reveal">
        <strong>
          Agent “{state.agentName}” created. Copy its API key now:
        </strong>
        <br />
        <code data-testid="raw-api-key">{state.rawKey}</code>
        <p className="muted">
          This is the only time the full key is shown — only its hash is
          stored. Reload the page to register another agent.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card form-grid">
      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      <label className="field">
        Agent name
        <input
          name="name"
          type="text"
          required
          minLength={1}
          maxLength={100}
        />
      </label>
      <button type="submit" className="primary" disabled={pending}>
        {pending ? "Creating…" : "Create agent"}
      </button>
    </form>
  );
}
