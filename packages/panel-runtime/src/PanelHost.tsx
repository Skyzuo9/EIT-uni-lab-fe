import React, {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PanelRendererPort, PanelScopePort } from "./ports";
import {
  createPanelRendererFailure,
  type PanelRendererFailure,
} from "./rendererUtils";
import type {
  PanelInstance,
  PanelRendererReady,
  PanelRendererResolution,
} from "./types";
import styles from "./PanelGroup.module.scss";

export interface PanelHostProps<Scope = unknown> {
  panelId: string;
  panelInstanceId: string;
  panelInstance?: PanelInstance;
  isActive?: boolean;
  failureTitle?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onToolbarChange?: (
    panelInstanceId: string,
    toolbar: ReactNode | null,
    generation?: number,
  ) => void;
  rendererPort: PanelRendererPort<Scope>;
  retryLabel?: ReactNode;
  scopePort: PanelScopePort<Scope>;
}
interface BoundaryProps {
  children: ReactNode;
  failureTitle?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRetry: () => void;
  panelId: string;
  resetKey: string;
  retryLabel?: ReactNode;
}
interface BoundaryState {
  failure: PanelRendererFailure | null;
}
class PanelErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failure: null };
  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failure: createPanelRendererFailure("unknown-panel", error) };
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }
  componentDidUpdate(previous: BoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.failure)
      this.setState({ failure: null });
  }
  private readonly retry = (): void => {
    this.props.onRetry();
    this.setState({ failure: null });
  };
  render(): ReactNode {
    if (!this.state.failure) return this.props.children;
    return (
      <div className={styles.state} role="alert">
        <strong>PANEL_RENDERER_FAILED</strong>
        {this.props.failureTitle ? <span>{this.props.failureTitle}</span> : null}
        <span>{this.state.failure.message}</span>
        <button type="button" onClick={this.retry}>
          {this.props.retryLabel ?? "Retry"}
        </button>
      </div>
    );
  }
}
function ReadyPanel<Scope>({
  ready,
  instance,
  scopePort,
}: {
  ready: PanelRendererReady<Scope>;
  instance: PanelInstance;
  scopePort: PanelScopePort<Scope>;
}): React.ReactElement {
  const scope = scopePort.resolve({
    panelId: instance.panelType,
    panelType: instance.panelType,
    panelInstanceId: instance.id,
    panelInstance: instance,
  });
  const Renderer = ready.Renderer;
  return (
    <Renderer scope={scope} panelInstance={instance} config={instance.config} />
  );
}
type View<Scope> =
  | { status: "loading" }
  | {
      status: "resolved";
      resolution: PanelRendererResolution<Scope>;
      generation: number;
    }
  | { status: "failed"; failure: PanelRendererFailure };

export function PanelHost<Scope = unknown>({
  panelId,
  panelInstanceId,
  panelInstance,
  isActive = true,
  failureTitle,
  onError,
  onToolbarChange,
  rendererPort,
  retryLabel,
  scopePort,
}: PanelHostProps<Scope>): React.ReactElement {
  const instance = panelInstance ?? { id: panelInstanceId, panelType: panelId };
  const instanceRevision = JSON.stringify([
    instance.id,
    instance.panelType,
    instance.title ?? null,
    instance.config ?? null,
  ]);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View<Scope>>({ status: "loading" });
  const generation = useRef(0);
  useEffect(() => {
    let current = true;
    generation.current += 1;
    const currentGeneration = generation.current;
    setView({ status: "loading" });
    void (async () => {
      try {
        const resolution = await rendererPort.resolve(instance);
        if (current)
          setView({
            status: "resolved",
            resolution,
            generation: currentGeneration,
          });
      } catch (error: unknown) {
        if (current)
          setView({
            status: "failed",
            failure: createPanelRendererFailure(panelId, error),
          });
      }
    })();
    return () => {
      current = false;
    };
  }, [attempt, instanceRevision, panelId, rendererPort]);
  useEffect(() => {
    const toolbar =
      isActive &&
      view.status === "resolved" &&
      view.resolution.status === "ready"
        ? (view.resolution.toolbar ?? null)
        : null;
    onToolbarChange?.(
      instance.id,
      toolbar,
      view.status === "resolved" ? view.generation : undefined,
    );
    return () => onToolbarChange?.(instance.id, null);
  }, [instance.id, isActive, onToolbarChange, view]);
  const retry = useCallback(() => {
    setView({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);
  let content: ReactNode;
  if (view.status === "loading")
    content = (
      <div className={styles.state} role="status" aria-live="polite">
        PANEL_LOADING
      </div>
    );
  else if (view.status === "failed")
    content = (
      <div className={styles.state} role="alert">
        <strong>{view.failure.code}</strong>
        <span>{view.failure.message}</span>
        <button type="button" onClick={retry}>
          Retry
        </button>
      </div>
    );
  else if (view.resolution.status === "empty")
    content = (
      <div className={styles.state}>
        <strong>PANEL_EMPTY</strong>
        <span>{view.resolution.message ?? "No panel content"}</span>
      </div>
    );
  else if (view.resolution.status === "unavailable")
    content = (
      <div
        className={styles.state}
        role="status"
        aria-label={`${view.resolution.error.code} ${view.resolution.error.panelId}`}
      >
        <strong>{view.resolution.error.code}</strong>
        <span>{view.resolution.error.panelId}</span>
        {view.resolution.error.recoveryCondition ? (
          <span>{view.resolution.error.recoveryCondition}</span>
        ) : null}
      </div>
    );
  else
    content = (
      <PanelErrorBoundary
        failureTitle={failureTitle}
        onError={onError}
        onRetry={retry}
        panelId={panelId}
        resetKey={`${panelId}:${panelInstanceId}:${attempt}`}
        retryLabel={retryLabel}
      >
        <ReadyPanel
          ready={view.resolution}
          instance={instance}
          scopePort={scopePort}
        />
      </PanelErrorBoundary>
    );
  return (
    <div
      className={styles.host}
      data-panel-type={panelId}
      data-panel-instance-id={panelInstanceId}
    >
      {content}
    </div>
  );
}
