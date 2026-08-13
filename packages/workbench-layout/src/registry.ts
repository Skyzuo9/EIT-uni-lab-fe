import { PanelRuntimeError } from "./errors";
import type { PanelDefinition, PanelId } from "./types";
import type { PanelRegistryPort } from "./ports";

const CATEGORIES = new Set(["layout", "workflow", "data", "system"]);
const CLOSABILITY = new Set(["never", "always", "when-multiple-tabs"]);

function assertJson(
  value: unknown,
  location: string,
  ancestors: WeakSet<object> = new WeakSet(),
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (ancestors.has(value)) invalid(`Definition contains a cycle at ${location}`);
    ancestors.add(value);
    value.forEach((entry, index) =>
      assertJson(entry, `${location}[${index}]`, ancestors),
    );
    ancestors.delete(value);
    return;
  }
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    if (ancestors.has(value)) invalid(`Definition contains a cycle at ${location}`);
    if (Object.getOwnPropertySymbols(value).length)
      invalid(`Definition contains a symbol key at ${location}`);
    ancestors.add(value);
    Object.entries(value).forEach(([key, entry]) =>
      assertJson(entry, `${location}.${key}`, ancestors),
    );
    ancestors.delete(value);
    return;
  }
  invalid(`Definition contains a non-JSON value at ${location}`);
}

function invalid(message: string): never {
  throw new PanelRuntimeError("PANEL_DEFINITION_INVALID", message);
}

function copyDefinition(definition: PanelDefinition): PanelDefinition {
  const copy = { ...definition };
  if (definition.defaultSize) copy.defaultSize = { ...definition.defaultSize };
  if (definition.capabilityPolicy)
    copy.capabilityPolicy = { ...definition.capabilityPolicy };
  return copy;
}

function validateDefinition(input: unknown): PanelDefinition {
  assertJson(input, "$");
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("Definition must be an object");
  const value = input as Record<string, unknown>;
  if (typeof value.id !== "string" || !value.id.trim())
    invalid("Definition id is required");
  if (typeof value.title !== "string" || !value.title.trim())
    invalid(`Definition title is required: ${value.id}`);
  if (!CATEGORIES.has(String(value.category)))
    invalid(`Invalid category: ${value.id}`);
  if (typeof value.singleton !== "boolean")
    invalid(`Invalid singleton: ${value.id}`);
  if (
    value.closability !== undefined &&
    !CLOSABILITY.has(String(value.closability))
  )
    invalid(`Invalid closability: ${value.id}`);
  if (value.defaultSize !== undefined) {
    if (
      !value.defaultSize ||
      typeof value.defaultSize !== "object" ||
      Array.isArray(value.defaultSize)
    )
      invalid(`Invalid defaultSize: ${value.id}`);
    for (const size of Object.values(value.defaultSize)) {
      if (typeof size !== "number" || !Number.isFinite(size) || size <= 0)
        invalid(`Invalid defaultSize: ${value.id}`);
    }
  }
  if (value.capabilityPolicy !== undefined) {
    const policy = value.capabilityPolicy as Record<string, unknown>;
    if (
      !policy ||
      policy.rendererRequired !== true ||
      policy.unavailableCode !== "PANEL_CAPABILITY_UNAVAILABLE"
    )
      invalid(`Invalid capabilityPolicy: ${value.id}`);
  }
  return copyDefinition(input as PanelDefinition);
}

export function createPanelRegistry(
  manifest: readonly PanelDefinition[],
  contributions: readonly PanelDefinition[] = [],
): PanelRegistryPort {
  const definitions = [...manifest, ...contributions].map(validateDefinition);
  const byId = new Map<PanelId, PanelDefinition>();
  for (const definition of definitions) {
    if (byId.has(definition.id)) {
      throw new PanelRuntimeError(
        "PANEL_DEFINITION_DUPLICATE",
        `Panel definition is duplicated: ${definition.id}`,
      );
    }
    byId.set(definition.id, definition);
  }
  return {
    get: (id) => {
      const item = byId.get(id);
      return item ? copyDefinition(item) : undefined;
    },
    list: () => definitions.map(copyDefinition),
    require: (id) => {
      const item = byId.get(id);
      if (!item)
        throw new PanelRuntimeError(
          "PANEL_DEFINITION_UNKNOWN",
          `Panel definition is unknown: ${id}`,
        );
      return copyDefinition(item);
    },
  };
}
