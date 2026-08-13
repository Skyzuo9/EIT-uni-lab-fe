import React, { type DragEvent, type ReactNode, useState } from "react";
import { decodePanelDragPayload } from "./dragPayload";
import { PANEL_DRAG_MIME } from "./PanelGroup";

type Side = "left" | "right" | "top" | "bottom";
type DropZone = Side | "center";
const DROP_ZONE_CLASS: Record<DropZone, string> = {
  center: "inset-[25%]",
  left: "inset-y-0 left-0 right-[75%]",
  right: "inset-y-0 right-0 left-[75%]",
  top: "inset-x-0 top-0 bottom-[75%]",
  bottom: "inset-x-0 bottom-0 top-[75%]",
};
export interface PanelDropOverlayProps {
  children: ReactNode;
  groupId: string;
  onPanelMove?: (
    sourceGroupId: string,
    panelInstanceId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => void;
  onPanelSplit?: (
    sourceGroupId: string,
    panelInstanceId: string,
    targetGroupId: string,
    side: Side,
  ) => void;
}
function hasMime(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(PANEL_DRAG_MIME);
}
function side(event: DragEvent<HTMLDivElement>): Side | null {
  const box = event.currentTarget.getBoundingClientRect();
  const distances = [
    ["left", event.clientX - box.left],
    ["right", box.right - event.clientX],
    ["top", event.clientY - box.top],
    ["bottom", box.bottom - event.clientY],
  ] as const;
  const nearest = distances.reduce((current, candidate) =>
    candidate[1] < current[1] ? candidate : current,
  );
  return nearest[1] <= Math.min(box.width, box.height) * 0.25
    ? nearest[0]
    : null;
}
export const PanelDropOverlay: React.FC<PanelDropOverlayProps> = ({
  children,
  groupId,
  onPanelMove,
  onPanelSplit,
}) => {
  const [dropZone, setDropZone] = useState<DropZone | null>(null);
  const isNestedTabOwner = (target: EventTarget | null): boolean =>
    target instanceof Element &&
    target.closest("[data-panel-tab-drop-owner]") !== null;
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!hasMime(event)) return;
    try {
      const payload = decodePanelDragPayload(
        event.dataTransfer.getData(PANEL_DRAG_MIME),
      );
      event.preventDefault();
      event.stopPropagation();
      const targetSide = side(event);
      if (targetSide)
        onPanelSplit?.(
          payload.groupId,
          payload.panelInstanceId,
          groupId,
          targetSide,
        );
      else
        onPanelMove?.(
          payload.groupId,
          payload.panelInstanceId,
          groupId,
          Number.MAX_SAFE_INTEGER,
        );
    } catch {
      /* malformed foreign payload */
    } finally {
      setDropZone(null);
    }
  };
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1"
      data-panel-drop-overlay
      onDragOverCapture={(event) => {
        if (hasMime(event) && isNestedTabOwner(event.target)) setDropZone(null);
      }}
      onDropCapture={(event) => {
        if (hasMime(event) && isNestedTabOwner(event.target)) setDropZone(null);
      }}
      onDragEndCapture={() => setDropZone(null)}
      onDragOver={(event) => {
        if (!hasMime(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropZone(side(event) ?? "center");
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDropZone(null);
      }}
      onDrop={onDrop}
    >
      {children}
      {dropZone ? (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          aria-hidden="true"
          data-panel-drop-indicator={dropZone}
        >
          <div
            className={`absolute border-2 border-[var(--unilab-panel-accent,currentColor)] bg-[color-mix(in_srgb,var(--unilab-panel-accent,currentColor)_16%,transparent)] ${DROP_ZONE_CLASS[dropZone]}`}
          />
        </div>
      ) : null}
    </div>
  );
};
