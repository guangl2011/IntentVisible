/**
 * §2.9 DeepLumen-derived visual patterns, kept presentational:
 * the score ring for audit lists, the terminal-style step pipeline for
 * Site Research, and the gauge with expandable sub-scores for the
 * Intent Health Score card.
 */

/** Circular score ring (§2.9 pattern 2): ring color follows the score band. */
export function ScoreRing({ score, label }: { score: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const filled = (clamped / 100) * circumference;
  const tone = clamped >= 80 ? "ring-good" : clamped >= 60 ? "ring-fair" : "ring-poor";
  return (
    <span className={`score-ring ${tone}`} role="img" aria-label={`${label}: ${clamped} of 100`}>
      <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
        <circle cx="22" cy="22" r={radius} className="ring-track" strokeWidth="5" fill="none" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          className="ring-fill"
          strokeWidth="5"
          fill="none"
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
        />
        <text x="22" y="26" textAnchor="middle" className="ring-score">
          {clamped}
        </text>
      </svg>
    </span>
  );
}

/** One terminal-style step in the Site Research pipeline (§2.9 pattern 1). */
export interface PipelineStep {
  script: string;
  title: string;
  output: string;
}

/** Terminal-style step pipeline — the Site Research progress display. */
export function TerminalPipeline({ steps, done }: { steps: PipelineStep[]; done: string }) {
  return (
    <div className="terminal-pipeline" data-testid="terminal-pipeline">
      {steps.map((step, index) => (
        <div key={step.script} className="terminal-step">
          <p className="terminal-step-title">
            {index + 1}. {step.title}
          </p>
          <pre className="terminal-window">
            <code>
              <span className="terminal-prompt">$</span> {step.script}
              {"\n"}
              {step.output}
              {"\n"}
              <span className="terminal-ok">✓ complete</span>
            </code>
          </pre>
        </div>
      ))}
      <p className="terminal-done">{done}</p>
    </div>
  );
}

/**
 * Gauge card with expandable sub-scores (§2.9 pattern 3): the 0–100
 * gauge stays visible; each sub-score is a disclosure row that links
 * into its module. Always labeled heuristic.
 */
export function GaugeWithSubScores({
  score,
  label,
  note,
  subScores,
}: {
  score: number;
  label: string;
  note: string;
  subScores: { label: string; score: number; detail: string; href: string }[];
}) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="card gauge-card" data-testid="health-gauge">
      <div className="intent-head">
        <h3>{label}</h3>
        <span className="badge badge-heuristic">启发式分，非转化预测 · heuristic</span>
      </div>
      <div className="gauge-visual">
        <div
          className="gauge-dial"
          role="img"
          aria-label={`${label} ${clamped} of 100`}
          data-score={clamped}
        >
          <span className="gauge-value">{clamped}</span>
          <span className="gauge-max">/ 100</span>
        </div>
        <details className="gauge-subscores">
          <summary>分项详情 · Expand sub-scores</summary>
          <ul>
            {subScores.map((sub) => (
              <li key={sub.href}>
                <a href={sub.href}>
                  <strong>{sub.label}</strong> — {sub.score}
                </a>
                <span className="muted"> {sub.detail}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
      <p className="muted">{note}</p>
    </div>
  );
}
