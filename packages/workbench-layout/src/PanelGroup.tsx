import React, {
  Component,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useState,
} from "react";
import { decodePanelDragPayload, encodePanelDragPayload } from "./dragPayload";
import { createPanelDomId } from "./rendererUtils";

export const PANEL_DRAG_MIME = "application/x-unilab-panel";
const PANEL_STATE_CLASS =
  "grid min-h-20 place-content-center gap-2 p-4 text-center text-[13px] text-[var(--unilab-color-text-muted)]";
const PANEL_ACTION_CLASS =
  "mx-auto cursor-pointer rounded-[var(--unilab-radius-control)] border border-[var(--unilab-color-border-strong)] bg-[var(--unilab-color-surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--unilab-color-text)] hover:bg-[var(--unilab-color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--unilab-color-focus)]";
export interface PanelGroupTab {
  id: string;
  title: string;
  content: ReactNode;
  closable?: boolean;
}
export interface PanelGroupProps {
  activeTabId: string;
  groupId: string;
  tabs: PanelGroupTab[];
  toolbar?: ReactNode;
  toolbarKey?: string;
  getCloseLabel?: (title: string) => string;
  onTabChange?: (panelInstanceId: string) => void;
  onTabClose?: (panelInstanceId: string) => void;
  onTabMove?: (
    sourceGroupId: string,
    panelInstanceId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => void;
}
class ToolbarBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  private readonly retry = (): void => {
    this.setState({ failed: false });
  };
  render(): ReactNode {
    return this.state.failed ? (
      <span className={PANEL_STATE_CLASS} role="alert">
        工具栏加载失败
        <button className={PANEL_ACTION_CLASS} type="button" onClick={this.retry}>
          重新加载
        </button>
      </span>
    ) : (
      this.props.children
    );
  }
}

function hasMime(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(PANEL_DRAG_MIME);
}

export const PanelGroup: React.FC<PanelGroupProps> = ({
  activeTabId,
  groupId,
  tabs,
  toolbar,
  toolbarKey,
  getCloseLabel,
  onTabChange,
  onTabClose,
  onTabMove,
}) => {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const key = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null || !tabs[next]) return;
    event.preventDefault();
    onTabChange?.(tabs[next].id);
    event.currentTarget.parentElement?.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(next)
      .focus();
  };
  const drop = (
    event: DragEvent,
    rawTargetIndex: number,
    ignoreSamePosition = true,
  ): boolean => {
    if (!onTabMove || !hasMime(event)) return false;
    try {
      const payload = decodePanelDragPayload(
        event.dataTransfer.getData(PANEL_DRAG_MIME),
      );
      event.preventDefault();
      event.stopPropagation();
      let targetIndex = rawTargetIndex;
      if (payload.groupId === groupId) {
        const sourceIndex = tabs.findIndex(
          ({ id }) => id === payload.panelInstanceId,
        );
        if (
          ignoreSamePosition &&
          sourceIndex >= 0 &&
          (sourceIndex === rawTargetIndex ||
            sourceIndex + 1 === rawTargetIndex)
        )
          return true;
        if (sourceIndex >= 0 && sourceIndex < rawTargetIndex)
          targetIndex -= 1;
      }
      onTabMove(payload.groupId, payload.panelInstanceId, groupId, targetIndex);
      return true;
    } catch {
      /* malformed foreign payload */
      return false;
    }
  };
  if (!tabs.length)
    return <div className={PANEL_STATE_CLASS}>该区域暂无面板</div>;
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--unilab-panel-surface,transparent)]"
      data-panel-group-id={groupId}
    >
      <div
        className="flex items-center border-b border-[var(--unilab-panel-border,currentColor)]"
        data-panel-tab-drop-owner
        onDragOver={(event) => {
          if (!onTabMove || !hasMime(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          setDragOverIndex(tabs.length);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragOverIndex(null);
        }}
        onDrop={(event) => {
          drop(event, dragOverIndex ?? tabs.length, false);
          setDragOverIndex(null);
        }}
      >
        <div
          className="flex min-h-8 flex-1 items-center gap-1"
          role="tablist"
        >
          {tabs.map((tab, index) => {
            const tabId = createPanelDomId("panel", groupId, tab.id, "tab");
            const panelId = createPanelDomId(
              "panel",
              groupId,
              tab.id,
              "tabpanel",
            );
            const active = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className="flex items-center"
                data-panel-instance-id={tab.id}
                data-drop-before={dragOverIndex === index || undefined}
                data-drop-after={dragOverIndex === index + 1 || undefined}
                draggable={Boolean(onTabMove)}
                onDragStart={(event) => {
                  if (!onTabMove) return;
                  event.dataTransfer.setData(
                    PANEL_DRAG_MIME,
                    encodePanelDragPayload({
                      groupId,
                      panelInstanceId: tab.id,
                    }),
                  );
                }}
                onDragOver={(event) => {
                  if (!onTabMove || !hasMime(event)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                  const box = event.currentTarget.getBoundingClientRect();
                  const isAfter = event.clientX - box.left > box.width / 2;
                  setDragOverIndex(isAfter ? index + 1 : index);
                }}
                onDrop={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  const isAfter = event.clientX - box.left > box.width / 2;
                  drop(
                    event,
                    dragOverIndex ?? (isAfter ? index + 1 : index),
                  );
                  setDragOverIndex(null);
                }}
                onDragEnd={() => setDragOverIndex(null)}
              >
                <button
                  id={tabId}
                  className="cursor-pointer border-0 border-b-2 border-transparent bg-transparent px-2.5 py-1.5 text-inherit aria-selected:border-b-[var(--unilab-panel-accent,currentColor)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--unilab-panel-focus,currentColor)]"
                  type="button"
                  role="tab"
                  aria-controls={panelId}
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onTabChange?.(tab.id)}
                  onKeyDown={(event) => key(event, index)}
                >
                  {tab.title}
                </button>
                {tab.closable && onTabClose ? (
                  <button
                    type="button"
                    className="cursor-pointer border-0 bg-transparent text-inherit"
                    aria-label={
                      getCloseLabel?.(tab.title) ?? `关闭${tab.title}`
                    }
                    data-panel-close-instance-id={tab.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onTabClose(tab.id);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {toolbar !== null && toolbar !== undefined ? (
          <div className="flex items-center px-2">
            <ToolbarBoundary key={toolbarKey ?? activeTabId}>
              {toolbar}
            </ToolbarBoundary>
          </div>
        ) : null}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-auto">
        {tabs.map((tab) => {
          const tabId = createPanelDomId("panel", groupId, tab.id, "tab");
          const panelId = createPanelDomId(
            "panel",
            groupId,
            tab.id,
            "tabpanel",
          );
          return (
            <div
              className="flex min-h-0 min-w-0 flex-1 flex-col"
              key={tab.id}
              id={panelId}
              role="tabpanel"
              aria-labelledby={tabId}
              hidden={tab.id !== activeTabId}
              tabIndex={0}
            >
              {tab.content}
            </div>
          );
        })}
      </div>
    </section>
  );
};
