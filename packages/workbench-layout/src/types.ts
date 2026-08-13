import type { ComponentType, ReactNode } from "react";

export const CANONICAL_PANEL_IDS = [
  "layout-unified",
  "layout-2d",
  "layout-3d",
  "workflow-dag",
  "workflow-steps",
  "workflow-dag-picker",
] as const;

export type CanonicalPanelId = (typeof CANONICAL_PANEL_IDS)[number];
export type PanelId = string;
export type PanelCategory = "layout" | "workflow" | "data" | "system";
export type PanelClosability = "never" | "always" | "when-multiple-tabs";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type PanelConfig = { [key: string]: JsonValue };

export interface PanelDefaultSize {
  minWidth?: number;
  minHeight?: number;
}
export interface PanelCapabilityPolicy {
  rendererRequired: true;
  unavailableCode: "PANEL_CAPABILITY_UNAVAILABLE";
}
export interface PanelDefinition {
  id: PanelId;
  title: string;
  category: PanelCategory;
  singleton: boolean;
  defaultSize?: PanelDefaultSize;
  closability?: PanelClosability;
  capabilityPolicy?: PanelCapabilityPolicy;
}
export interface CanonicalPanelDefinition extends PanelDefinition {
  id: CanonicalPanelId;
  closability: PanelClosability;
  capabilityPolicy: PanelCapabilityPolicy;
}

export interface PanelInstance {
  id: string;
  panelType: PanelId;
  title?: string;
  config?: PanelConfig;
}
export interface PanelScopeRequest {
  panelId: PanelId;
  panelType: PanelId;
  panelInstanceId: string;
  panelInstance: PanelInstance;
}
export interface PanelRendererProps<Scope = unknown> {
  scope: Scope;
  panelInstance: PanelInstance;
  config?: PanelConfig;
}
export interface PanelRendererReady<Scope = unknown> {
  status: "ready";
  Renderer: ComponentType<PanelRendererProps<Scope>>;
  toolbar?: ReactNode;
}
export interface PanelRendererEmpty {
  status: "empty";
  message?: string;
}
export interface PanelCapabilityUnavailableError {
  code: "PANEL_CAPABILITY_UNAVAILABLE";
  panelId: PanelId;
  recoveryCondition?: string;
}
export type PanelCapabilityError = PanelCapabilityUnavailableError;
export interface PanelRendererUnavailable {
  status: "unavailable";
  error: PanelCapabilityUnavailableError;
}
export type PanelRendererResolution<Scope = unknown> =
  | PanelRendererReady<Scope>
  | PanelRendererEmpty
  | PanelRendererUnavailable;

export interface PanelLayoutDocument {
  version: 1;
  layout: PanelLayoutNode;
}
export type PanelLayoutNode = PanelSplitNode | PanelGroupNode;
export interface PanelSplitNode {
  id: string;
  type: "split";
  direction: "horizontal" | "vertical";
  sizes?: number[];
  children: PanelLayoutNode[];
}
export interface PanelGroupNode {
  id: string;
  type: "group";
  panels: PanelInstance[];
  activePanelId?: string;
}

export interface ActivatePanelCommand {
  type: "activate-tab";
  groupId: string;
  panelInstanceId: string;
}
export interface MovePanelCommand {
  type: "move-tab";
  sourceGroupId: string;
  panelInstanceId: string;
  targetGroupId: string;
  targetIndex: number;
}
export interface SplitPanelGroupCommand {
  type: "split-group";
  sourceGroupId: string;
  panelInstanceId: string;
  targetGroupId: string;
  side: "left" | "right" | "top" | "bottom";
  newGroupId: string;
  newSplitId: string;
}
export interface ClosePanelCommand {
  type: "close-tab";
  groupId: string;
  panelInstanceId: string;
}
export interface ResizePanelSplitCommand {
  type: "resize-split";
  splitId: string;
  sizes: number[];
}
export interface OpenPanelCommand {
  type: "open-panel";
  groupId: string;
  panel: PanelInstance;
  targetIndex?: number;
}
export interface UpdatePanelConfigCommand {
  type: "update-panel-config";
  panelInstanceId: string;
  config: PanelConfig;
}
export interface ReplacePanelLayoutCommand {
  type: "replace-layout";
  layout: PanelLayoutNode;
}
export type PanelLayoutCommand =
  | ActivatePanelCommand
  | MovePanelCommand
  | SplitPanelGroupCommand
  | ClosePanelCommand
  | ResizePanelSplitCommand
  | OpenPanelCommand
  | UpdatePanelConfigCommand
  | ReplacePanelLayoutCommand;
export interface PanelDragPayload {
  groupId: string;
  panelInstanceId: string;
}
