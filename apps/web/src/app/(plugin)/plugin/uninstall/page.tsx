"use client";

import { BlindSpotFooter } from "../components/red-lines";

/**
 * Uninstall & data deletion (design v1.4 §2.6): the "uninstall leaves no
 * residue" promise — the direct answer to the DeepLumen uninstall-
 * residue complaint (dead theme code, canonical loops, "still
 * recoverable" data weeks later).
 */
export default function UninstallPage() {
  return (
    <>
      <h1>Uninstall &amp; data deletion</h1>

      <div className="card notice">
        <strong>卸载不留残余代码 — Uninstalling leaves no residual code or data.</strong>
        <p className="muted">
          This is a standing product commitment, stated before you install anything else: no theme edits, no
          injected scripts, no canonical rewrites, no "recoverable" copies weeks later.
        </p>
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>What is deleted, and when</h3>
        </div>
        <ul className="recommendation-list">
          <li>
            <strong>Immediately on uninstall:</strong> the plugin stops responding; the structured layer and
            llms.txt publication are disabled for your store.
          </li>
          <li>
            <strong>Within 30 days:</strong> Web Pixel event data, identity-stitching records, and derived
            reports are deleted from our systems.
          </li>
          <li>
            <strong>Never left behind:</strong> no code in your theme — the plugin's structured layer lives
            on the same URLs your store already serves, so there is nothing to scrub from templates.
          </li>
        </ul>
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>What we never had</h3>
        </div>
        <p className="muted">
          Customer contact data, store-owner credentials, theme write access, and order export archives —
          the plugin's read-only Phase I permissions never collected them, so uninstall cannot fail to
          delete them.
        </p>
      </div>

      <BlindSpotFooter
        items={[
          "Deletion timelines reflect the Phase I data inventory (pixel events, ledger joins, reports).",
          "Data deletion requests beyond uninstall follow the privacy paths in the plugin's privacy pages.",
        ]}
      />
    </>
  );
}
