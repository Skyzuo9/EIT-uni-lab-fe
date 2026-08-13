export type PascalSceneDocument = Record<string, unknown>

export interface PascalEditorOptions {
  initialScene?: PascalSceneDocument
  readOnly?: boolean
}

export interface PascalEditorInstance {
  dispose: () => void
  getScene?: () => PascalSceneDocument
  setScene?: (scene: PascalSceneDocument) => void
}

/**
 * The upstream Pascal package is loaded through this narrow port. Keeping the
 * loader outside the host lets the app pin or update pascalorg/editor without
 * copying its source into this repository.
 */
export interface PascalEditorModule {
  mount: (
    container: HTMLElement,
    options: PascalEditorOptions
  ) => PascalEditorInstance | Promise<PascalEditorInstance>
}

export type PascalEditorLoader = () => Promise<PascalEditorModule>
