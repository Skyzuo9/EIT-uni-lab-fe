import { CANONICAL_PANEL_MANIFEST } from "./canonicalPanelManifest";
import { PanelRuntimeError } from "./errors";
import type { PanelRegistryPort } from "./ports";
import type {
  PanelConfig,
  PanelDefinition,
  PanelGroupNode,
  PanelInstance,
  PanelLayoutDocument,
  PanelLayoutNode,
  PanelSplitNode,
} from "./types";

export type PanelDefinitionSource =
  | Iterable<string | PanelDefinition>
  | PanelRegistryPort;

function invalid(message: string): never {
  throw new PanelRuntimeError("PANEL_LAYOUT_INVALID", message);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
function assertJson(value: unknown, location: string): void {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach((entry, i) => assertJson(entry, `${location}[${i}]`));
    return;
  }
  if (isRecord(value)) {
    if (Object.getOwnPropertySymbols(value).length)
      invalid(`Symbol key at ${location}`);
    Object.entries(value).forEach(([key, entry]) =>
      assertJson(entry, `${location}.${key}`),
    );
    return;
  }
  invalid(`Non-JSON value at ${location}`);
}

export function parsePanelConfig(
  input: unknown,
  location = '$.config',
): PanelConfig {
  if (!isRecord(input)) invalid(`Expected config object at ${location}`);
  assertJson(input, location);
  return structuredClone(input) as PanelConfig;
}

function string(value: unknown, location: string): string {
  if (typeof value !== "string" || !value.trim())
    invalid(`Expected string at ${location}`);
  return value;
}
function definitions(source?: PanelDefinitionSource): PanelDefinition[] {
  if (!source) return CANONICAL_PANEL_MANIFEST.map((entry) => ({ ...entry }));
  if (
    "list" in (source as object) &&
    typeof (source as PanelRegistryPort).list === "function"
  ) {
    return (source as PanelRegistryPort).list();
  }
  return [...(source as Iterable<string | PanelDefinition>)].map((entry) => {
    if (typeof entry !== "string") return entry;
    return (
      CANONICAL_PANEL_MANIFEST.find(({ id }) => id === entry) ?? {
        id: entry,
        title: entry,
        category: "data",
        singleton: false,
      }
    );
  });
}
interface Context {
  nodeIds: Set<string>;
  instanceIds: Set<string>;
  singletonTypes: Set<string>;
  seenSingletonTypes: Set<string>;
  knownTypes: Set<string>;
}
function parseInstance(
  input: unknown,
  location: string,
  context: Context,
): PanelInstance {
  if (!isRecord(input)) invalid(`Expected PanelInstance at ${location}`);
  const id = string(input.id, `${location}.id`);
  const panelType = string(input.panelType, `${location}.panelType`);
  if (context.instanceIds.has(id)) invalid(`Duplicate panel instance: ${id}`);
  if (!context.knownTypes.has(panelType))
    invalid(`Unknown panel type: ${panelType}`);
  if (
    context.singletonTypes.has(panelType) &&
    context.seenSingletonTypes.has(panelType)
  )
    invalid(`Duplicate singleton panel type: ${panelType}`);
  context.instanceIds.add(id);
  if (context.singletonTypes.has(panelType))
    context.seenSingletonTypes.add(panelType);
  const panel: PanelInstance = { id, panelType };
  if (input.title !== undefined)
    panel.title = string(input.title, `${location}.title`);
  if (input.config !== undefined) {
    panel.config = parsePanelConfig(input.config, `${location}.config`);
  }
  return panel;
}
function parseGroup(
  input: Record<string, unknown>,
  location: string,
  context: Context,
): PanelGroupNode {
  if (!Array.isArray(input.panels)) invalid(`Expected panels at ${location}`);
  const panels = input.panels.map((entry, index) =>
    parseInstance(entry, `${location}.panels[${index}]`, context),
  );
  const node: PanelGroupNode = {
    id: string(input.id, `${location}.id`),
    type: "group",
    panels,
  };
  if (input.activePanelId !== undefined) {
    const activePanelId = string(
      input.activePanelId,
      `${location}.activePanelId`,
    );
    if (!panels.some(({ id }) => id === activePanelId))
      invalid(`Active panel is absent at ${location}`);
    node.activePanelId = activePanelId;
  } else if (panels.length)
    invalid(`Non-empty group needs activePanelId at ${location}`);
  return node;
}
function parseSplit(
  input: Record<string, unknown>,
  location: string,
  context: Context,
): PanelSplitNode {
  if (input.direction !== "horizontal" && input.direction !== "vertical")
    invalid(`Invalid split direction at ${location}`);
  if (!Array.isArray(input.children) || input.children.length < 2)
    invalid(`Split needs two children at ${location}`);
  const children = input.children.map((entry, i) =>
    parseNode(entry, `${location}.children[${i}]`, context),
  );
  const node: PanelSplitNode = {
    id: string(input.id, `${location}.id`),
    type: "split",
    direction: input.direction,
    children,
  };
  if (input.sizes !== undefined) {
    if (
      !Array.isArray(input.sizes) ||
      input.sizes.length !== children.length ||
      input.sizes.some(
        (size) =>
          typeof size !== "number" || !Number.isFinite(size) || size <= 0,
      )
    )
      invalid(`Invalid split sizes at ${location}`);
    node.sizes = [...input.sizes] as number[];
  }
  return node;
}
function parseNode(
  input: unknown,
  location: string,
  context: Context,
): PanelLayoutNode {
  if (!isRecord(input)) invalid(`Expected layout node at ${location}`);
  const id = string(input.id, `${location}.id`);
  if (context.nodeIds.has(id)) invalid(`Duplicate node: ${id}`);
  context.nodeIds.add(id);
  if (input.type === "group") return parseGroup(input, location, context);
  if (input.type === "split") return parseSplit(input, location, context);
  return invalid(`Unknown node type at ${location}`);
}

export function parsePanelLayoutV1(
  input: unknown,
  source?: PanelDefinitionSource,
): PanelLayoutDocument {
  assertJson(input, "$");
  if (!isRecord(input) || input.version !== 1)
    invalid("Expected panel layout version 1");
  const available = definitions(source);
  return {
    version: 1,
    layout: parseNode(input.layout, "$.layout", {
      nodeIds: new Set(),
      instanceIds: new Set(),
      singletonTypes: new Set(
        available.filter(({ singleton }) => singleton).map(({ id }) => id),
      ),
      seenSingletonTypes: new Set(),
      knownTypes: new Set(available.map(({ id }) => id)),
    }),
  };
}
