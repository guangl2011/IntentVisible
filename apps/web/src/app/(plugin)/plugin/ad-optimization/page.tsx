"use client";

import { useT } from "../../../../lib/plugin/i18n/locale";
import { BlindSpotFooter } from "../components/red-lines";

/**
 * Ad Optimization (design v1.4 §2.4): a Phase II placeholder — real
 * diagnosis, CAPI feedback, and execution buttons all need the Nango
 * OAuth spend layer that Phase II delivers. Shown as exactly that.
 */
export default function AdOptimizationPage() {
  const t = useT();
  return (
    <>
      <h1>{t.adOptimization.title}</h1>
      <p className="muted">{t.adOptimization.intro}</p>
      <div className="card">
        <div className="intent-head">
          <h3>{t.adOptimization.roas.title}</h3>
          <span className="badge badge-not-measured">{t.adOptimization.roas.badge}</span>
        </div>
        <p className="muted">{t.adOptimization.roas.body}</p>
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>{t.adOptimization.capi.title}</h3>
          <span className="badge badge-not-measured">{t.adOptimization.capi.badge}</span>
        </div>
        <p className="muted">{t.adOptimization.capi.body}</p>
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>{t.adOptimization.execution.title}</h3>
          <span className="badge badge-not-measured">{t.adOptimization.execution.badge}</span>
        </div>
        <p className="muted">{t.adOptimization.execution.body}</p>
      </div>
      <BlindSpotFooter items={t.blindSpots.adOptimization} />
    </>
  );
}
