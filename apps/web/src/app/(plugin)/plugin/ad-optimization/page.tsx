"use client";

import { BlindSpotFooter } from "../components/red-lines";

/**
 * Ad Optimization (design v1.4 §2.4): a Phase II placeholder — real
 * diagnosis, CAPI feedback, and execution buttons all need the Nango
 * OAuth spend layer that Phase II delivers. Shown as exactly that.
 */
export default function AdOptimizationPage() {
  return (
    <>
      <h1>Ad Optimization</h1>
      <p className="muted">
        Ad diagnosis, Conversions API feedback, and one-click budget actions arrive in Phase II, once
        merchant-authorized ad accounts connect through Nango (nango.proxy()). Nothing here is enabled yet —
        and nothing pretends to be.
      </p>
      <div className="card">
        <div className="intent-head">
          <h3>Channel ROAS alignment</h3>
          <span className="badge badge-not-measured">Phase II — needs ad spend via Nango</span>
        </div>
        <p className="muted">
          Platform-reported ROAS vs true multi-touch ROAS vs GA4-calibrated coverage — computed once real
          ad spend flows through authorized connectors. Platform self-reported numbers will always be shown
          against the Shopify ledger, never trusted directly.
        </p>
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>CAPI server-side feedback</h3>
          <span className="badge badge-not-measured">Phase II</span>
        </div>
        <p className="muted">
          First-party intent events (add-to-cart, checkout started, high-value orders) with their click IDs
          feed back to Meta / Google / TikTok through the Conversions API — after a policy and legal review.
        </p>
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>One-click execution</h3>
          <span className="badge badge-not-measured">Phase II — separate write permission</span>
        </div>
        <p className="muted">
          Pause-a-campaign and budget-±actions per campaign row, executed through Nango within the
          authorization the merchant granted — a distinct permission, explained at connect time.
        </p>
      </div>
      <BlindSpotFooter
        items={[
          "No ad-spend data exists in Phase I — all three blocks stay explicitly disabled rather than simulated.",
          "The upgrade card lives on the Attribution page; connecting is optional, never forced.",
        ]}
      />
    </>
  );
}
