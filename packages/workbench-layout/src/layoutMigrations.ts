import { PanelRuntimeError } from "./errors";
import { parsePanelLayoutV1 } from "./layoutSchema";
import type { PanelDefinitionSource } from "./layoutSchema";
import type { PanelLayoutDocument } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function migratePanelLayoutDocument(
  input: unknown,
  knownPanelIds?: PanelDefinitionSource,
): PanelLayoutDocument {
  if (!isRecord(input)) {
    throw new PanelRuntimeError(
      "PANEL_LAYOUT_INVALID",
      "Panel layout migration requires an object document",
    );
  }
  if (input.version === 1) return parsePanelLayoutV1(input, knownPanelIds);
  if (input.version === 0) {
    return parsePanelLayoutV1(
      { version: 1, layout: input.layout },
      knownPanelIds,
    );
  }
  throw new PanelRuntimeError(
    "PANEL_LAYOUT_INVALID",
    `Unsupported panel layout version: ${String(input.version)}`,
  );
}
