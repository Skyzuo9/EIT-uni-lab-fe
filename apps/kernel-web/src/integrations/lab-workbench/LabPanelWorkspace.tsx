import MenuFoldOutlined from '@ant-design/icons/MenuFoldOutlined'
import MenuUnfoldOutlined from '@ant-design/icons/MenuUnfoldOutlined'
import {
  PanelLayoutRenderer,
  reducePanelLayout,
  type PanelLayoutCommand,
  type PanelLayoutDocument
} from '@unilab/workbench-layout'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { WorkflowCatalogState } from '@unilab/workflow-editor'

import { useLabPanelAdapter } from './panelAdapter'
import {
  findLabPanelRegionIds,
  hiddenLabPanelNodeIds,
  panelPresetDocument,
  parsePanelPresetDocument,
  type LabPanelPreset
} from './panelLayouts'
import { WorkflowDirtySessions } from './workflowSessions'
import styles from './LabPanelWorkspace.module.scss'

const WORKFLOW_VISIBILITY_STORAGE_KEY =
  'unilab.panel-layout.lab.workflow-visible.v1'

/**
 * 按预设挂载实验室面板工作区，并聚合工作流（Workflow）未保存状态。
 *
 * @param preset 当前工作区预设。
 * @param onWorkflowUnsavedChangesChange 工作流未保存状态变化回调。
 * @param workflowCatalogRequestRevision 工作流目录刷新版本。
 * @returns 与预设隔离的面板工作区。
 */
export function LabPanelWorkspace({
  preset,
  onWorkflowUnsavedChangesChange,
  workflowCatalogRequestRevision = 0,
  recoveryRevision = 0,
  onWorkflowCatalogStateChange
}: {
  preset: LabPanelPreset
  onWorkflowUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
  workflowCatalogRequestRevision?: number
  recoveryRevision?: number
  onWorkflowCatalogStateChange?: (state: WorkflowCatalogState) => void
}): React.JSX.Element {
  return (
    <LabPanelWorkspaceSession
      key={preset}
      preset={preset}
      onWorkflowUnsavedChangesChange={onWorkflowUnsavedChangesChange}
      workflowCatalogRequestRevision={workflowCatalogRequestRevision}
      recoveryRevision={recoveryRevision}
      onWorkflowCatalogStateChange={onWorkflowCatalogStateChange}
    />
  )
}

/**
 * 维护单个预设会话中的布局、持久化状态和整块工作流（Workflow）面板可见性。
 *
 * @param preset 当前工作区预设。
 * @param onWorkflowUnsavedChangesChange 工作流未保存状态变化回调。
 * @param workflowCatalogRequestRevision 工作流目录刷新版本。
 * @returns 保持隐藏面板挂载的工作区会话。
 */
function LabPanelWorkspaceSession({
  preset,
  onWorkflowUnsavedChangesChange,
  workflowCatalogRequestRevision,
  recoveryRevision,
  onWorkflowCatalogStateChange
}: {
  preset: LabPanelPreset
  onWorkflowUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
  workflowCatalogRequestRevision: number
  recoveryRevision: number
  onWorkflowCatalogStateChange?: (state: WorkflowCatalogState) => void
}): React.JSX.Element {
  const parentDirtyCallback = useRef(onWorkflowUnsavedChangesChange)
  parentDirtyCallback.current = onWorkflowUnsavedChangesChange
  const dirtySessions = useRef<WorkflowDirtySessions | null>(null)
  if (dirtySessions.current === null) {
    dirtySessions.current = new WorkflowDirtySessions((hasUnsavedChanges) => {
      parentDirtyCallback.current?.(hasUnsavedChanges)
    })
  }
  const handleWorkflowUnsavedChangesChange = useCallback((
    sessionId: string,
    hasUnsavedChanges: boolean
  ) => {
    dirtySessions.current?.update(sessionId, hasUnsavedChanges)
  }, [])
  const adapter = useLabPanelAdapter(
    handleWorkflowUnsavedChangesChange,
    workflowCatalogRequestRevision,
    recoveryRevision,
    onWorkflowCatalogStateChange
  )
  const storageKey = `unilab.panel-layout.${preset}.v1`
  const [document, setDocument] = useState<PanelLayoutDocument>(
    () => panelPresetDocument(preset)
  )
  const [workflowVisible, setWorkflowVisible] = useState(
    readStoredWorkflowVisibility
  )
  const panelRegions = useMemo(
    () => preset === 'lab' ? findLabPanelRegionIds(document) : null,
    [document, preset]
  )
  const hiddenNodeIds = useMemo(
    () => hiddenLabPanelNodeIds(panelRegions, workflowVisible),
    [panelRegions, workflowVisible]
  )
  const groupActions = useMemo(() => {
    if (!panelRegions) return undefined
    if (workflowVisible) {
      return {
        [panelRegions.workflowActionGroupId]: (
          <button
            type="button"
            aria-label="隐藏整个工作流面板"
            className={styles.panelToggle}
            onClick={() => setWorkflowVisible(false)}
            title="隐藏整个工作流面板"
          >
            <MenuFoldOutlined aria-hidden="true" />
            <span>隐藏工作流</span>
          </button>
        )
      }
    }
    return {
      [panelRegions.materialActionGroupId]: (
        <button
          type="button"
          aria-label="显示整个工作流面板"
          className={styles.panelToggle}
          onClick={() => setWorkflowVisible(true)}
          title="显示整个工作流面板"
        >
          <MenuUnfoldOutlined aria-hidden="true" />
          <span>显示工作流</span>
        </button>
      )
    }
  }, [panelRegions, workflowVisible])

  useEffect(() => {
    let active = true
    void Promise.resolve()
      .then(() => adapter.storage.load(storageKey))
      .then((stored) => {
        if (active && stored) {
          setDocument(parsePanelPresetDocument(preset, stored))
        }
      })
      .catch(() => {
        if (!active) {
          return
        }

        const fallback = panelPresetDocument(preset)
        setDocument(fallback)
        try {
          void Promise.resolve(
            adapter.storage.save(storageKey, fallback)
          ).catch(() => {
            // The in-memory fallback still keeps the preset usable.
          })
        } catch {
          // The in-memory fallback still keeps the preset usable.
        }
      })
    return () => {
      active = false
    }
  }, [adapter, preset, storageKey])

  useEffect(() => {
    if (preset !== 'lab') return
    try {
      globalThis.localStorage?.setItem(
        WORKFLOW_VISIBILITY_STORAGE_KEY,
        String(workflowVisible)
      )
    } catch {
      // 浏览器禁用存储时仍保留当前会话内的布局状态。
    }
  }, [preset, workflowVisible])

  const handleCommand = useCallback(
    (command: PanelLayoutCommand) => {
      setDocument((current) => {
        const next = reducePanelLayout(
          current,
          command,
          adapter.registry.list()
        )
        void Promise.resolve(
          adapter.storage.save(storageKey, next)
        )
        return next
      })
    },
    [adapter, storageKey]
  )

  return (
    <div
      className={`${styles.workspace} lab-panel-workspace lab-panel-workspace--${preset}`}
      data-workflow-panel-visible={workflowVisible}
    >
      <PanelLayoutRenderer
        adapter={adapter}
        document={document}
        groupActions={groupActions}
        hiddenNodeIds={hiddenNodeIds}
        onCommand={handleCommand}
      />
    </div>
  )
}

/**
 * 读取工作流（Workflow）分栏的用户持久选择。
 *
 * @returns 未保存或存储不可用时默认展开，保证首次进入仍展示完整关系。
 */
function readStoredWorkflowVisibility(): boolean {
  try {
    return globalThis.localStorage?.getItem(
      WORKFLOW_VISIBILITY_STORAGE_KEY
    ) !== 'false'
  } catch {
    return true
  }
}
