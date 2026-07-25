import { CANONICAL_PANEL_MANIFEST } from "./canonicalPanelManifest";
import { PanelRuntimeError } from "./errors";
import { parsePanelLayoutDocument } from "./layout";
import {
  parsePanelConfig,
  type PanelDefinitionSource,
} from "./layoutSchema";
import type {
  PanelDefinition,
  PanelGroupNode,
  PanelInstance,
  PanelLayoutCommand,
  PanelLayoutDocument,
  PanelLayoutNode,
  PanelSplitNode,
} from "./types";

function invalid(message: string): never {
  throw new PanelRuntimeError("PANEL_LAYOUT_INVALID", message);
}
function field(command: Record<string, unknown>, key: string): string {
  const value = command[key];
  if (typeof value !== "string" || !value) invalid(`Command requires ${key}`);
  return value;
}
function command(input: unknown): PanelLayoutCommand {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("Command must be an object");
  const value = input as Record<string, unknown>;
  if (value.type === "activate-tab" || value.type === "close-tab")
    return {
      type: value.type,
      groupId: field(value, "groupId"),
      panelInstanceId: field(value, "panelInstanceId"),
    };
  if (value.type === "move-tab") {
    if (
      !Number.isInteger(value.targetIndex) ||
      (value.targetIndex as number) < 0
    )
      invalid("Invalid targetIndex");
    return {
      type: "move-tab",
      sourceGroupId: field(value, "sourceGroupId"),
      panelInstanceId: field(value, "panelInstanceId"),
      targetGroupId: field(value, "targetGroupId"),
      targetIndex: value.targetIndex as number,
    };
  }
  if (value.type === "split-group") {
    if (!["left", "right", "top", "bottom"].includes(String(value.side)))
      invalid("Invalid split side");
    return {
      type: "split-group",
      sourceGroupId: field(value, "sourceGroupId"),
      panelInstanceId: field(value, "panelInstanceId"),
      targetGroupId: field(value, "targetGroupId"),
      side: value.side as "left" | "right" | "top" | "bottom",
      newGroupId: field(value, "newGroupId"),
      newSplitId: field(value, "newSplitId"),
    };
  }
  if (value.type === "resize-split") {
    if (
      !Array.isArray(value.sizes) ||
      value.sizes.some(
        (size) =>
          typeof size !== "number" || !Number.isFinite(size) || size <= 0,
      )
    )
      invalid("Invalid split sizes");
    return {
      type: "resize-split",
      splitId: field(value, "splitId"),
      sizes: [...value.sizes] as number[],
    };
  }
  if (value.type === "open-panel") {
    if (
      value.targetIndex !== undefined &&
      (!Number.isInteger(value.targetIndex) ||
        (value.targetIndex as number) < 0)
    )
      invalid("Invalid targetIndex");
    if (!value.panel || typeof value.panel !== "object")
      invalid("Command requires panel");
    return {
      type: "open-panel",
      groupId: field(value, "groupId"),
      panel: value.panel as PanelInstance,
      ...(value.targetIndex === undefined
        ? {}
        : { targetIndex: value.targetIndex as number }),
    };
  }
  if (value.type === "update-panel-config") {
    return {
      type: "update-panel-config",
      panelInstanceId: field(value, "panelInstanceId"),
      config: parsePanelConfig(value.config, "$.command.config"),
    };
  }
  if (value.type === "replace-layout") {
    if (!value.layout || typeof value.layout !== "object" || Array.isArray(value.layout))
      invalid("Command requires layout");
    return {
      type: "replace-layout",
      layout: value.layout as PanelLayoutNode,
    };
  }
  return invalid(`Unknown command: ${String(value.type)}`);
}
function findGroup(node: PanelLayoutNode, id: string): PanelGroupNode | null {
  if (node.type === "group") return node.id === id ? node : null;
  for (const child of node.children) {
    const found = findGroup(child, id);
    if (found) return found;
  }
  return null;
}
function group(node: PanelLayoutNode, id: string): PanelGroupNode {
  const found = findGroup(node, id);
  if (!found) invalid(`Unknown group: ${id}`);
  return found;
}
function findPanel(
  node: PanelLayoutNode,
  instanceId: string,
): PanelInstance | null {
  if (node.type === "group")
    return node.panels.find(({ id }) => id === instanceId) ?? null;
  for (const child of node.children) {
    const found = findPanel(child, instanceId);
    if (found) return found;
  }
  return null;
}
function take(groupNode: PanelGroupNode, instanceId: string): PanelInstance {
  const index = groupNode.panels.findIndex(({ id }) => id === instanceId);
  if (index < 0) invalid(`Unknown panel instance: ${instanceId}`);
  const [panel] = groupNode.panels.splice(index, 1);
  if (groupNode.activePanelId === instanceId)
    groupNode.activePanelId = groupNode.panels[0]?.id;
  if (!groupNode.panels.length) delete groupNode.activePanelId;
  return panel;
}
function replace(
  node: PanelLayoutNode,
  id: string,
  replacement: PanelLayoutNode,
): PanelLayoutNode {
  if (node.id === id) return replacement;
  if (node.type === "group") return node;
  return {
    ...node,
    children: node.children.map((child) => replace(child, id, replacement)),
  };
}
function prune(node: PanelLayoutNode): PanelLayoutNode | null {
  if (node.type === "group") return node.panels.length ? node : null;
  const kept: Array<{ node: PanelLayoutNode; size?: number }> = [];
  node.children.forEach((child, index) => {
    const next = prune(child);
    if (next) kept.push({ node: next, size: node.sizes?.[index] });
  });
  if (!kept.length) return null;
  if (kept.length === 1) return kept[0].node;
  const next: PanelSplitNode = {
    ...node,
    children: kept.map(({ node: child }) => child),
  };
  if (node.sizes) {
    const retained = kept.map(({ size }) => size ?? 100 / kept.length);
    const total = retained.reduce((sum, size) => sum + size, 0);
    next.sizes = retained.map((size) => (size / total) * 100);
  }
  return next;
}
function sourceDefinitions(source?: PanelDefinitionSource): PanelDefinition[] {
  if (!source) return CANONICAL_PANEL_MANIFEST.map((item) => ({ ...item }));
  if (
    "list" in (source as object) &&
    typeof (source as { list?: unknown }).list === "function"
  )
    return (source as { list: () => PanelDefinition[] }).list();
  return [...(source as Iterable<string | PanelDefinition>)].map((item) =>
    typeof item === "string"
      ? ({
          id: item,
          title: item,
          category: "data",
          singleton: false,
        } as PanelDefinition)
      : item,
  );
}
function canClose(
  groupNode: PanelGroupNode,
  panel: PanelInstance,
  source?: PanelDefinitionSource,
): boolean {
  const policy =
    sourceDefinitions(source).find(({ id }) => id === panel.panelType)
      ?.closability ?? "always";
  return policy !== "never";
}
function resize(
  node: PanelLayoutNode,
  splitId: string,
  sizes: number[],
): boolean {
  if (node.type === "group") return false;
  if (node.id === splitId) {
    if (sizes.length !== node.children.length)
      invalid("Resize size count mismatch");
    node.sizes = [...sizes];
    return true;
  }
  return node.children.some((child) => resize(child, splitId, sizes));
}

export function reducePanelLayout(
  state: unknown,
  input: unknown,
  definitionSource?: PanelDefinitionSource,
): PanelLayoutDocument {
  const action = command(input);
  if (action.type === "replace-layout") {
    return parsePanelLayoutDocument(
      { version: 1, layout: action.layout },
      definitionSource,
    );
  }
  const parsed = parsePanelLayoutDocument(state, definitionSource);
  const document = structuredClone(parsed) as PanelLayoutDocument;
  if (action.type === "activate-tab") {
    const target = group(document.layout, action.groupId);
    if (!target.panels.some(({ id }) => id === action.panelInstanceId))
      invalid("Instance is not in group");
    target.activePanelId = action.panelInstanceId;
  } else if (action.type === "move-tab") {
    const source = group(document.layout, action.sourceGroupId);
    const target = group(document.layout, action.targetGroupId);
    const panel = take(source, action.panelInstanceId);
    const oldTargetIndex = target.panels.findIndex(({ id }) => id === panel.id);
    if (oldTargetIndex >= 0) target.panels.splice(oldTargetIndex, 1);
    target.panels.splice(
      Math.min(action.targetIndex, target.panels.length),
      0,
      panel,
    );
    target.activePanelId = panel.id;
  } else if (action.type === "close-tab") {
    const target = group(document.layout, action.groupId);
    const panel = target.panels.find(({ id }) => id === action.panelInstanceId);
    if (!panel) invalid("Unknown panel instance");
    if (canClose(target, panel, definitionSource)) take(target, panel.id);
  } else if (action.type === "split-group") {
    const source = group(document.layout, action.sourceGroupId);
    if (source.id === action.targetGroupId && source.panels.length === 1)
      return parsed;
    const target = group(document.layout, action.targetGroupId);
    const panel = take(source, action.panelInstanceId);
    const newGroup: PanelGroupNode = {
      id: action.newGroupId,
      type: "group",
      panels: [panel],
      activePanelId: panel.id,
    };
    const newSplit: PanelSplitNode = {
      id: action.newSplitId,
      type: "split",
      direction:
        action.side === "left" || action.side === "right"
          ? "horizontal"
          : "vertical",
      sizes: [50, 50],
      children:
        action.side === "left" || action.side === "top"
          ? [newGroup, target]
          : [target, newGroup],
    };
    document.layout = replace(document.layout, target.id, newSplit);
  } else if (action.type === "resize-split") {
    if (!resize(document.layout, action.splitId, action.sizes))
      invalid(`Unknown split: ${action.splitId}`);
  } else if (action.type === "open-panel") {
    const target = group(document.layout, action.groupId);
    const targetIndex = Math.min(
      action.targetIndex ?? target.panels.length,
      target.panels.length,
    );
    target.panels.splice(targetIndex, 0, action.panel);
    target.activePanelId = action.panel.id;
  } else {
    const panel = findPanel(document.layout, action.panelInstanceId);
    if (!panel) invalid(`Unknown panel instance: ${action.panelInstanceId}`);
    panel.config = { ...(panel.config ?? {}), ...action.config };
  }
  const pruned = prune(document.layout);
  if (!pruned) return parsed;
  document.layout = pruned;
  return parsePanelLayoutDocument(document, definitionSource);
}
