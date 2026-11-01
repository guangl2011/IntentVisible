/**
 * Runner registry (blueprint C.1): one runner per monitored platform, built
 * per baseline so the persona version stays pinned within a baseline. The
 * simulated default needs no third-party account; measured runners register
 * under the same interface when a project switches tiers.
 */

import { PLATFORMS, type Platform } from "@intentvisible/core-schema";
import { SimulatedMonitoringRunner, type MonitoringRunner } from "@intentvisible/data-providers";
import type { Clock, LlmAdapter } from "@intentvisible/intent-engine";

/** A project in llm data_mode only ever gets simulated runners. */
export function resolveSimulatedRunners(
  adapter: LlmAdapter,
  clock: Clock,
  personaVersion: string,
): MonitoringRunner[] {
  return PLATFORMS.map(
    (platform: Platform) =>
      new SimulatedMonitoringRunner({ adapter, clock, platform, personaVersion }),
  );
}

/** A project cannot request measured runs it has no provider for. */
export function resolveRunnersForDataMode(
  dataMode: "llm" | "measured",
  measuredRunners: ReadonlyArray<MonitoringRunner>,
  simulated: ReadonlyArray<MonitoringRunner>,
): MonitoringRunner[] {
  if (dataMode === "measured") {
    if (measuredRunners.length === 0) {
      throw new TypeError(
        "project data_mode 'measured' requires registered measured runners, but none are configured — provider_unavailable",
      );
    }
    return [...measuredRunners];
  }
  return [...simulated];
}
