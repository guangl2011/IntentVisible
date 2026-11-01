/**
 * Which pipeline project the v2 pages operate on. Picked once at onboarding
 * (project creation) and remembered in localStorage; the gate, metrics, and
 * library pages read the same binding so the project choice survives
 * navigation — the same pattern the Shopify binding uses for stores.
 */

export interface PipelineBinding {
  projectId: string;
  brandName: string;
  siteUrl: string;
}

const BINDING_KEY = "iv.pipeline.binding";

export function loadBinding(): PipelineBinding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BINDING_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as PipelineBinding).projectId === "string" &&
      typeof (parsed as PipelineBinding).brandName === "string" &&
      typeof (parsed as PipelineBinding).siteUrl === "string"
    ) {
      return parsed as PipelineBinding;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveBinding(binding: PipelineBinding): void {
  window.localStorage.setItem(BINDING_KEY, JSON.stringify(binding));
}

export function clearBinding(): void {
  window.localStorage.removeItem(BINDING_KEY);
}
