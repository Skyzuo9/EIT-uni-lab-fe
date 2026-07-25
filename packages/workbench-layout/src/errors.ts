export type PanelRuntimeErrorCode =
  | "PANEL_DEFINITION_DUPLICATE"
  | "PANEL_DEFINITION_INVALID"
  | "PANEL_DEFINITION_UNKNOWN"
  | "PANEL_DRAG_PAYLOAD_INVALID"
  | "PANEL_LAYOUT_INVALID";

export class PanelRuntimeError extends Error {
  readonly code: PanelRuntimeErrorCode;

  constructor(code: PanelRuntimeErrorCode, message: string) {
    super(message);
    this.name = "PanelRuntimeError";
    this.code = code;
  }
}
