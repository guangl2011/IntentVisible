"use client";

import { useState } from "react";

import type { PipelineProject, PipelineTrigger } from "@intentvisible/client";

import { ErrorPanel } from "../../components/panels";

/**
 * Onboarding step 1: install status. The Shopify app path reports the
 * install; the script path shows the snippet to embed (copyable); the bare
 * site URL is the fallback input that starts the pipeline. Installing is
 * the trigger — the crawler runs on the customer's own site automatically.
 */

export const SCRIPT_SNIPPET_SRC =
  process.env.NEXT_PUBLIC_PIPELINE_SNIPPET_SRC ?? "https://cdn.intentvisible.com/v1/iv.js";

export function scriptSnippet(siteUrl: string): string {
  let host = siteUrl;
  try {
    host = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`).hostname;
  } catch {
    // Leave the raw input in place — the snippet is copy text, not a URL parse gate.
  }
  return `<script async src="${SCRIPT_SNIPPET_SRC}" data-site="${host}"></script>`;
}

const TRIGGER_OPTIONS: Array<{ value: PipelineTrigger; label: string; hint: string }> = [
  { value: "shopify_app", label: "Shopify app", hint: "I installed (or will install) the IntentVisible Shopify app." },
  { value: "script_install", label: "Script snippet", hint: "I'll embed the IntentVisible script on my site." },
  { value: "site_url", label: "Site URL only", hint: "Point IntentVisible at my site — no install needed." },
];

function CopySnippet({ siteUrl }: { siteUrl: string }) {
  const [copied, setCopied] = useState(false);
  const snippet = scriptSnippet(siteUrl);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="snippet-box">
      <code>{snippet}</code>
      <button type="button" className="linklike" onClick={copy}>
        {copied ? "Copied" : "Copy snippet"}
      </button>
    </div>
  );
}

export function InstallPanel({
  project,
  onStart,
  busy,
  error,
}: {
  project: PipelineProject | null;
  onStart: (siteUrl: string, trigger: PipelineTrigger) => void;
  busy: boolean;
  error: string | null;
}) {
  const [siteUrl, setSiteUrl] = useState("");
  const [trigger, setTrigger] = useState<PipelineTrigger>("site_url");

  if (project === null) {
    return (
      <div className="card connect-card">
        <h2 className="page-title">Step 1 — install</h2>
        <p className="muted">
          Installing is the trigger: the crawler runs on your own site automatically — no content to
          paste, no documents to upload. Your site is the knowledge base.
        </p>
        <form
          className="connect-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) onStart(siteUrl, trigger);
          }}
        >
          <fieldset className="market-grid">
            <legend>How are you installing?</legend>
            {TRIGGER_OPTIONS.map((option) => (
              <label key={option.value} className="trigger-option">
                <input
                  type="radio"
                  name="trigger"
                  value={option.value}
                  checked={trigger === option.value}
                  onChange={() => setTrigger(option.value)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <span className="muted"> {option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            Your site URL
            <input
              type="text"
              value={siteUrl}
              onChange={(event) => setSiteUrl(event.target.value)}
              placeholder="https://www.example.com"
              aria-label="Site URL"
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Starting…" : "Start the pipeline"}
          </button>
        </form>
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="page-title">Step 1 — install</h2>
      {project.trigger === "shopify_app" && (
        <p>
          <strong>Shopify app installed.</strong> The crawler runs on your store automatically — no
          snippet needed.
        </p>
      )}
      {project.trigger === "script_install" && (
        <>
          <p>Embed this snippet on your site — the first ping starts the crawl:</p>
          <CopySnippet siteUrl={project.site_url} />
        </>
      )}
      {project.trigger === "site_url" && (
        <p>
          <strong>Site URL registered:</strong> {project.site_url} — the crawler runs against it
          directly.
        </p>
      )}
      {error !== null && <ErrorPanel message={error} />}
    </div>
  );
}
