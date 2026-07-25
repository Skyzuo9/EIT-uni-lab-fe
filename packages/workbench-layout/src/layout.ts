import { PanelRuntimeError } from "./errors";
import { migratePanelLayoutDocument } from "./layoutMigrations";
import type { PanelLayoutDocument } from "./types";
import type { PanelDefinitionSource } from "./layoutSchema";

function decodeInput(input: unknown): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new PanelRuntimeError(
      "PANEL_LAYOUT_INVALID",
      "Panel layout JSON could not be parsed",
    );
  }
}

export function parsePanelLayoutDocument(
  input: unknown,
  knownPanelIds?: PanelDefinitionSource,
): PanelLayoutDocument {
  return migratePanelLayoutDocument(decodeInput(input), knownPanelIds);
}

export function serializePanelLayoutDocument(
  input: unknown,
  knownPanelIds?: PanelDefinitionSource,
): string {
  return JSON.stringify(parsePanelLayoutDocument(input, knownPanelIds));
}

export type {
  PanelGroupNode,
  PanelLayoutDocument,
  PanelLayoutNode,
  PanelSplitNode,
} from "./types";
