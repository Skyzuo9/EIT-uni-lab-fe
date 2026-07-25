import { PanelRuntimeError } from "./errors";
import type { PanelDragPayload } from "./types";

function parsePayload(input: unknown): PanelDragPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PanelRuntimeError(
      "PANEL_DRAG_PAYLOAD_INVALID",
      "Panel drag payload must be an object",
    );
  }
  const payload = input as Record<string, unknown>;
  if (
    typeof payload.groupId !== "string" ||
    payload.groupId.length === 0 ||
    typeof payload.panelInstanceId !== "string" ||
    payload.panelInstanceId.length === 0
  ) {
    throw new PanelRuntimeError(
      "PANEL_DRAG_PAYLOAD_INVALID",
      "Panel drag payload requires groupId and panelInstanceId",
    );
  }
  return { groupId: payload.groupId, panelInstanceId: payload.panelInstanceId };
}

export function encodePanelDragPayload(payload: unknown): string {
  return JSON.stringify(parsePayload(payload));
}

export function decodePanelDragPayload(payload: string): PanelDragPayload {
  try {
    return parsePayload(JSON.parse(payload) as unknown);
  } catch (error: unknown) {
    if (error instanceof PanelRuntimeError) throw error;
    throw new PanelRuntimeError(
      "PANEL_DRAG_PAYLOAD_INVALID",
      "Panel drag payload is not valid JSON",
    );
  }
}
