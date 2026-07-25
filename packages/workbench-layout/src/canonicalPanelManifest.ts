import type { CanonicalPanelDefinition } from "./types";

const REQUIRED_RENDERER = {
  rendererRequired: true,
  unavailableCode: "PANEL_CAPABILITY_UNAVAILABLE",
} as const;

function freezeDefinition(
  definition: CanonicalPanelDefinition,
): Readonly<CanonicalPanelDefinition> {
  if (definition.defaultSize) Object.freeze(definition.defaultSize);
  Object.freeze(definition.capabilityPolicy);
  return Object.freeze(definition);
}

const CANONICAL_PANEL_DEFINITIONS: CanonicalPanelDefinition[] = [
  {
    id: "layout-unified",
    title: "panel.layoutUnified",
    category: "layout",
    singleton: true,
    defaultSize: { minWidth: 600 },
    closability: "never",
    capabilityPolicy: REQUIRED_RENDERER,
  },
  {
    id: "layout-2d",
    title: "panel.layout2d",
    category: "layout",
    singleton: true,
    defaultSize: { minWidth: 500 },
    closability: "never",
    capabilityPolicy: REQUIRED_RENDERER,
  },
  {
    id: "layout-3d",
    title: "panel.layout3d",
    category: "layout",
    singleton: true,
    defaultSize: { minWidth: 400 },
    closability: "always",
    capabilityPolicy: REQUIRED_RENDERER,
  },
  {
    id: "workflow-dag",
    title: "panel.workflowDag",
    category: "workflow",
    singleton: false,
    defaultSize: { minWidth: 400 },
    closability: "when-multiple-tabs",
    capabilityPolicy: REQUIRED_RENDERER,
  },
  {
    id: "workflow-steps",
    title: "panel.workflowSteps",
    category: "workflow",
    singleton: false,
    defaultSize: { minWidth: 280 },
    closability: "when-multiple-tabs",
    capabilityPolicy: REQUIRED_RENDERER,
  },
  {
    id: "workflow-dag-picker",
    title: "panel.workflowDagPicker",
    category: "workflow",
    singleton: false,
    defaultSize: { minWidth: 400 },
    closability: "when-multiple-tabs",
    capabilityPolicy: REQUIRED_RENDERER,
  },
];

export const CANONICAL_PANEL_MANIFEST: readonly Readonly<CanonicalPanelDefinition>[] =
  Object.freeze(CANONICAL_PANEL_DEFINITIONS.map(freezeDefinition));
