import type { RunDataMode } from "@intentvisible/client";

/**
 * The single Data Mode block every surface that shows simulated/measured
 * numbers must render (blueprint Export v2: one metadata block, and the
 * honest caveat for simulated answers — platform personas approximate, not
 * replicate, real platform behavior).
 */
const DATA_MODE_COPY: Readonly<Record<RunDataMode, string>> = {
  llm_simulated:
    "Simulated — numbers come from LLM-simulated runs (lightweight tier). They describe the simulation: platform personas approximate, not replicate, real platform behavior.",
  provider_measured:
    "Measured — numbers come from live provider runs (advanced tier).",
};

export function dataModeCopy(dataMode: RunDataMode): string {
  // noUncheckedIndexedAccess: the record is total over RunDataMode, but the
  // lookup still types as string | undefined — fall back to naming the mode.
  return DATA_MODE_COPY[dataMode] ?? `Data mode: ${dataMode}`;
}

export function DataModeHeader({ dataMode }: { dataMode: RunDataMode }) {
  return (
    <p className="data-mode-header" data-mode={dataMode}>
      <strong>Data Mode:</strong> {dataModeCopy(dataMode)}
    </p>
  );
}
