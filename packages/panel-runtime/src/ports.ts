import type {
  PanelDefinition,
  PanelId,
  PanelLayoutDocument,
  PanelInstance,
  PanelRendererResolution,
  PanelScopeRequest,
} from "./types";

export interface PanelRegistryPort {
  get: (id: PanelId) => PanelDefinition | undefined;
  list: () => PanelDefinition[];
  require: (id: PanelId) => PanelDefinition;
}

export interface PanelRendererPort<Scope = unknown> {
  resolve: (
    panelInstance: PanelInstance,
  ) => PanelRendererResolution<Scope> | Promise<PanelRendererResolution<Scope>>;
}

export interface PanelScopePort<Scope = unknown> {
  resolve: (request: PanelScopeRequest) => Scope;
}

export interface PanelStoragePort {
  load: (key: string) => unknown | Promise<unknown>;
  save: (key: string, document: PanelLayoutDocument) => void | Promise<void>;
}

export interface PanelAppAdapter<Scope = unknown> {
  registry: PanelRegistryPort;
  renderers: PanelRendererPort<Scope>;
  scope: PanelScopePort<Scope>;
  storage: PanelStoragePort;
  parseLayout: (input: unknown) => PanelLayoutDocument;
}
