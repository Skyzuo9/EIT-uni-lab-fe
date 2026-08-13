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
  /** 按叶子面板分组身份挂载的布局级操作。 */
  groupActions?: Readonly<Record<string, ReactNode>>;
  /** 保持挂载但不参与视觉布局的节点身份。 */
  hiddenNodeIds?: readonly string[];
  onCommand?: (command: PanelLayoutCommand) => void;
  onSplitResize?: (splitId: string, sizes: number[]) => void;
}
interface SharedProps<Scope> {
  adapter: PanelAppAdapter<Scope>;
  groupActions?: Readonly<Record<string, ReactNode>>;
  hiddenNodeIds: ReadonlySet<string>;
  layoutVisible: boolean;
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

/**
 * 渲染一个叶子面板分组，并把业务工具栏与布局级操作交给独立插槽。
 *
 * @param props 应用适配器、面板分组、可见性、布局操作及命令回调。
 * @returns 保持所有标签挂载并发布真实可见性的面板分组元素。
 */
function GroupRenderer<Scope>({
  adapter,
  group,
  groupActions,
  layoutVisible,
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
            isActive={layoutVisible && instance.id === group.activePanelId}
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
        groupAction={groupActions?.[group.id]}
        groupId={group.id}
        tabs={tabs}
        toolbar={toolbar?.content}
        toolbarKey={toolbar?.key}
        visible={layoutVisible}
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
  visible: boolean;
}

/**
 * 渲染相邻布局节点之间可拖动和键盘控制的分隔条。
 *
 * @param props 分栏身份、分隔条索引、可见性及尺寸更新回调。
 * @returns 可见时可调整尺寸、隐藏时保持挂载的分隔条元素。
 */
function ResizeSeparator({
  index,
  onCommand,
  onSplitResize,
  split,
  visible,
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
      hidden={!visible}
      style={visible ? undefined : { display: "none" }}
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

/**
 * 渲染一个分栏节点，并按祖先与自身隐藏状态传播真实可见性。
 *
 * @param props 应用适配器、分栏节点、隐藏身份集合、布局操作及命令回调。
 * @returns 子节点与相邻分隔条可独立隐藏的分栏元素。
 */
function SplitRenderer<Scope>({
  adapter,
  groupActions,
  hiddenNodeIds,
  layoutVisible,
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
      {split.children.map((child, index) => {
        const childVisible = layoutVisible && !hiddenNodeIds.has(child.id);
        const nextChild = split.children[index + 1];
        const separatorVisible =
          childVisible &&
          Boolean(nextChild) &&
          layoutVisible &&
          !hiddenNodeIds.has(nextChild.id);
        const childStyle = split.sizes
          ? { flexBasis: `${split.sizes[index]}%` }
          : undefined;
        return (
          <React.Fragment key={child.id}>
            <div
              className="flex min-h-0 min-w-0 flex-1"
              data-panel-layout-node-id={child.id}
              hidden={!childVisible}
              style={
                childVisible
                  ? childStyle
                  : { ...childStyle, display: "none" }
              }
            >
              <LayoutNodeRenderer
                adapter={adapter}
                groupActions={groupActions}
                hiddenNodeIds={hiddenNodeIds}
                layoutVisible={childVisible}
                node={child}
                onCommand={onCommand}
                onSplitResize={onSplitResize}
              />
            </div>
            {index < split.children.length - 1 ? (
              <ResizeSeparator
                index={index}
                split={split}
                visible={separatorVisible}
                onCommand={onCommand}
                onSplitResize={onSplitResize}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * 按布局节点类型分派叶子分组或递归分栏渲染。
 *
 * @param props 当前布局节点、可见性、隐藏身份集合及共享渲染端口。
 * @returns 与节点类型对应且保持可见性语义的布局元素。
 */
function LayoutNodeRenderer<Scope>({
  adapter,
  groupActions,
  hiddenNodeIds,
  layoutVisible,
  node,
  onCommand,
  onSplitResize,
}: SharedProps<Scope> & { node: PanelLayoutNode }): React.ReactElement {
  return node.type === "group" ? (
    <GroupRenderer
      adapter={adapter}
      group={node}
      groupActions={groupActions}
      hiddenNodeIds={hiddenNodeIds}
      layoutVisible={layoutVisible}
      onCommand={onCommand}
      onSplitResize={onSplitResize}
    />
  ) : (
    <SplitRenderer
      adapter={adapter}
      groupActions={groupActions}
      hiddenNodeIds={hiddenNodeIds}
      layoutVisible={layoutVisible}
      split={node}
      onCommand={onCommand}
      onSplitResize={onSplitResize}
    />
  );
}

/**
 * 校验并渲染完整面板布局文档。
 *
 * @param props 应用适配器、布局文档、分组操作、隐藏节点及命令回调。
 * @returns 有效布局的递归渲染结果；无效文档返回可恢复错误提示。
 */
export function PanelLayoutRenderer<Scope = unknown>({
  adapter,
  document,
  groupActions,
  hiddenNodeIds = [],
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
  const hiddenNodeIdSet = new Set(hiddenNodeIds);
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
        groupActions={groupActions}
        hiddenNodeIds={hiddenNodeIdSet}
        layoutVisible
        node={layoutDocument.layout}
        onCommand={onCommand}
        onSplitResize={onSplitResize}
      />
    </div>
  );
}
