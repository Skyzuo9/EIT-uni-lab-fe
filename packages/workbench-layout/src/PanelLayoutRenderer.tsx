import React, { useCallback, useRef, useState, type ReactNode } from "react";
import { CANONICAL_PANEL_IDS } from "./types";
import { createDefaultPanelLayout } from "./layoutDefaults";
import { PanelDropOverlay } from "./PanelDropOverlay";
import { PanelGroup } from "./PanelGroup";
import { PanelHost } from "./PanelHost";
import type { PanelAppAdapter } from "./ports";
import type {
  PanelGroupNode,
  PanelLayoutCommand,
  PanelLayoutNode,
  PanelSplitNode,
} from "./types";

const CANONICAL_PANEL_ID_SET: ReadonlySet<string> = new Set(
  CANONICAL_PANEL_IDS,
);

export interface PanelLayoutRendererProps<Scope = unknown> {
  adapter: PanelAppAdapter<Scope>;
  document?: unknown;
  onCommand?: (command: PanelLayoutCommand) => void;
  onSplitResize?: (splitId: string, sizes: number[]) => void;
}
interface SharedProps<Scope> {
  adapter: PanelAppAdapter<Scope>;
  onCommand?: (command: PanelLayoutCommand) => void;
  onSplitResize?: (splitId: string, sizes: number[]) => void;
}

function splitIds(
  targetGroupId: string,
  instanceId: string,
): { newGroupId: string; newSplitId: string } {
  return {
    newGroupId: `${targetGroupId}--${instanceId}--group`,
    newSplitId: `${targetGroupId}--${instanceId}--split`,
  };
}
function GroupRenderer<Scope>({
  adapter,
  group,
  onCommand,
}: SharedProps<Scope> & { group: PanelGroupNode }): React.ReactElement {
  const [toolbar, setToolbar] = useState<{
    content: ReactNode;
    key: string;
  } | null>(null);
  const handleToolbarChange = useCallback(
    (
      instanceId: string,
      nextToolbar: ReactNode | null,
      generation?: number,
    ): void => {
      if (instanceId !== group.activePanelId) return;
      setToolbar(
        nextToolbar === null
          ? null
          : {
              content: nextToolbar,
              key: `${instanceId}:${generation ?? 0}`,
            },
      );
    },
    [group.activePanelId],
  );
  const tabs = group.panels.map((instance) => {
    const definition = adapter.registry.require(instance.panelType);
    const closable =
      definition.closability === "always" ||
      (definition.closability === "when-multiple-tabs" &&
        group.panels.length > 1);
    return {
      id: instance.id,
      title: instance.title ?? definition.title,
      closable,
      content: (
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          data-panel-contribution={
            CANONICAL_PANEL_ID_SET.has(instance.panelType)
              ? undefined
              : instance.panelType
          }
        >
          <PanelHost
            panelId={instance.panelType}
            panelInstanceId={instance.id}
            panelInstance={instance}
            isActive={instance.id === group.activePanelId}
            onToolbarChange={handleToolbarChange}
            rendererPort={adapter.renderers}
            scopePort={adapter.scope}
          />
        </div>
      ),
    };
  });
  const move = (
    sourceGroupId: string,
    panelInstanceId: string,
    targetGroupId: string,
    targetIndex: number,
  ): void => {
    onCommand?.({
      type: "move-tab",
      sourceGroupId,
      panelInstanceId,
      targetGroupId,
      targetIndex,
    });
  };
  const split = (
    sourceGroupId: string,
    panelInstanceId: string,
    targetGroupId: string,
    side: "left" | "right" | "top" | "bottom",
  ): void => {
    onCommand?.({
      type: "split-group",
      sourceGroupId,
      panelInstanceId,
      targetGroupId,
      side,
      ...splitIds(targetGroupId, panelInstanceId),
    });
  };
  return (
    <PanelDropOverlay
      groupId={group.id}
      onPanelMove={move}
      onPanelSplit={split}
    >
      <PanelGroup
        activeTabId={group.activePanelId ?? ""}
        groupId={group.id}
        tabs={tabs}
        toolbar={toolbar?.content}
        toolbarKey={toolbar?.key}
        onTabChange={(panelInstanceId) =>
          onCommand?.({
            type: "activate-tab",
            groupId: group.id,
            panelInstanceId,
          })
        }
        onTabClose={(panelInstanceId) =>
          onCommand?.({ type: "close-tab", groupId: group.id, panelInstanceId })
        }
        onTabMove={move}
      />
    </PanelDropOverlay>
  );
}

function resized(
  sizes: readonly number[] | undefined,
  childCount: number,
  index: number,
  delta: number,
): number[] {
  const next = sizes
    ? [...sizes]
    : Array.from({ length: childCount }, () => 100 / childCount);
  if (next[index] + delta <= 0 || next[index + 1] - delta <= 0) return next;
  next[index] += delta;
  next[index + 1] -= delta;
  return next;
}

interface ResizeSeparatorProps {
  index: number;
  onCommand?: (command: PanelLayoutCommand) => void;
  onSplitResize?: (splitId: string, sizes: number[]) => void;
  split: PanelSplitNode;
}

function ResizeSeparator({
  index,
  onCommand,
  onSplitResize,
  split,
}: ResizeSeparatorProps): React.ReactElement {
  const pointerStart = useRef<{ coordinate: number; sizes: number[] } | null>(
    null,
  );
  const emit = (sizes: number[]): void => {
    // The dedicated callback owns resize persistence when present; onCommand is its fallback.
    if (onSplitResize) onSplitResize(split.id, sizes);
    else onCommand?.({ type: "resize-split", splitId: split.id, sizes });
  };
  return (
    <div
      className={`flex-[0_0_0.5rem] bg-transparent ${
        split.direction === "horizontal"
          ? "cursor-col-resize"
          : "cursor-row-resize"
      }`}
      role="separator"
      aria-label={`调整${split.id}分栏大小`}
      aria-orientation={
        split.direction === "horizontal" ? "vertical" : "horizontal"
      }
      tabIndex={0}
      data-split-resize-id={split.id}
      data-split-resize-index={index}
      data-split-direction={split.direction}
      onKeyDown={(event) => {
        const positive =
          split.direction === "horizontal"
            ? event.key === "ArrowRight"
            : event.key === "ArrowDown";
        const negative =
          split.direction === "horizontal"
            ? event.key === "ArrowLeft"
            : event.key === "ArrowUp";
        if (!positive && !negative) return;
        event.preventDefault();
        emit(
          resized(split.sizes, split.children.length, index, positive ? 1 : -1),
        );
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerStart.current = {
          coordinate:
            split.direction === "horizontal" ? event.clientX : event.clientY,
          sizes: split.sizes
            ? [...split.sizes]
            : Array.from(
                { length: split.children.length },
                () => 100 / split.children.length,
              ),
        };
      }}
      onPointerMove={(event) => {
        if (
          !pointerStart.current ||
          !event.currentTarget.hasPointerCapture(event.pointerId)
        )
          return;
        const box = event.currentTarget.parentElement?.getBoundingClientRect();
        const length =
          split.direction === "horizontal" ? box?.width : box?.height;
        if (!length) return;
        const coordinate =
          split.direction === "horizontal" ? event.clientX : event.clientY;
        const delta =
          ((coordinate - pointerStart.current.coordinate) / length) * 100;
        emit(
          resized(
            pointerStart.current.sizes,
            split.children.length,
            index,
            delta,
          ),
        );
      }}
      onPointerUp={(event) => {
        pointerStart.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        pointerStart.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => {
        pointerStart.current = null;
      }}
    />
  );
}
function SplitRenderer<Scope>({
  adapter,
  split,
  onCommand,
  onSplitResize,
}: SharedProps<Scope> & { split: PanelSplitNode }): React.ReactElement {
  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 ${
        split.direction === "horizontal" ? "flex-row" : "flex-col"
      }`}
      data-split-id={split.id}
      data-split-direction={split.direction}
      data-split-sizes={split.sizes?.join(",")}
    >
      {split.children.map((child, index) => (
        <React.Fragment key={child.id}>
          <div
            className="flex min-h-0 min-w-0 flex-1"
            style={
              split.sizes ? { flexBasis: `${split.sizes[index]}%` } : undefined
            }
          >
            <LayoutNodeRenderer
              adapter={adapter}
              node={child}
              onCommand={onCommand}
              onSplitResize={onSplitResize}
            />
          </div>
          {index < split.children.length - 1 ? (
            <ResizeSeparator
              index={index}
              split={split}
              onCommand={onCommand}
              onSplitResize={onSplitResize}
            />
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}
function LayoutNodeRenderer<Scope>({
  adapter,
  node,
  onCommand,
  onSplitResize,
}: SharedProps<Scope> & { node: PanelLayoutNode }): React.ReactElement {
  return node.type === "group" ? (
    <GroupRenderer
      adapter={adapter}
      group={node}
      onCommand={onCommand}
      onSplitResize={onSplitResize}
    />
  ) : (
    <SplitRenderer
      adapter={adapter}
      split={node}
      onCommand={onCommand}
      onSplitResize={onSplitResize}
    />
  );
}

export function PanelLayoutRenderer<Scope = unknown>({
  adapter,
  document,
  onCommand,
  onSplitResize,
}: PanelLayoutRendererProps<Scope>): React.ReactElement {
  let layoutDocument;
  try {
    layoutDocument =
      document === undefined
        ? createDefaultPanelLayout()
        : adapter.parseLayout(document);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div
        className="grid min-h-20 place-content-center gap-2 p-4 text-center text-[13px] text-[var(--unilab-color-text-muted)]"
        role="alert"
        data-testid="panel-layout-renderer"
      >
        <strong className="text-[var(--unilab-color-text)]">面板布局无效</strong>
        <details>
          <summary className="cursor-pointer">查看技术信息</summary>
          <code className="block max-w-[60ch] [overflow-wrap:anywhere] pt-1 text-left text-[10px]">
            {message}
          </code>
        </details>
      </div>
    );
  }
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--unilab-panel-surface,transparent)]"
      data-testid="panel-layout-renderer"
      data-panel-registry-ids={adapter.registry
        .list()
        .map(({ id }) => id)
        .join(",")}
    >
      <LayoutNodeRenderer
        adapter={adapter}
        node={layoutDocument.layout}
        onCommand={onCommand}
        onSplitResize={onSplitResize}
      />
    </div>
  );
}
