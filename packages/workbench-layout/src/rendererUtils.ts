import type {
  PanelCapabilityUnavailableError,
  PanelId,
  PanelRendererUnavailable,
} from "./types";

export interface PanelRendererFailure {
  code: "PANEL_RENDERER_FAILED";
  panelId: PanelId;
  message: string;
}

export function createPanelCapabilityUnavailable(
  panelId: PanelId,
  recoveryCondition?: string,
): PanelRendererUnavailable {
  const error: PanelCapabilityUnavailableError = {
    code: "PANEL_CAPABILITY_UNAVAILABLE",
    panelId,
    recoveryCondition,
  };
  return { status: "unavailable", error };
}

export function createPanelRendererFailure(
  panelId: PanelId,
  error: unknown,
): PanelRendererFailure {
  return {
    code: "PANEL_RENDERER_FAILED",
    panelId,
    message: error instanceof Error ? error.message : String(error),
  };
}

export function createPanelDomId(...parts: string[]): string {
  const encode = (value: string): string =>
    Array.from(value, (character) =>
      character.codePointAt(0)!.toString(16),
    ).join("_");
  return `unilab-${parts.map(encode).join("--")}`;
}
