import { parsePanelLayoutDocument } from "./layout";
import type { PanelLayoutDocument } from "./types";

const DEFAULT_LAYOUT_SOURCE = {
  version: 1,
  layout: {
    id: "default-panel-layout-root",
    type: "split",
    direction: "horizontal",
    children: [
      {
        id: "default-layout-group",
        type: "group",
        panels: [{ id: "layout-unified-primary", panelType: "layout-unified" }],
        activePanelId: "layout-unified-primary",
      },
      {
        id: "default-workflow-group",
        type: "group",
        panels: [
          {
            id: "workflow-dag-picker-primary",
            panelType: "workflow-dag-picker",
          },
        ],
        activePanelId: "workflow-dag-picker-primary",
      },
    ],
  },
} as const;

export function createDefaultPanelLayout(): PanelLayoutDocument {
  return parsePanelLayoutDocument(DEFAULT_LAYOUT_SOURCE);
}
