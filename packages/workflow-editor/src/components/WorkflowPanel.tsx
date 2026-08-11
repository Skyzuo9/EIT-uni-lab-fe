import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  CapabilityStatus,
  WorkflowRuntimePort,
  WorkflowSummary
} from '@unilab/services'

import type { WorkflowTracePort } from '../traceRuntime'
import type { WorkflowPanelRuntimeProjection } from '../workflowPanelProjection'
import type {
  WorkflowResourceSlotOptionsPort
} from '../utils/workflowResourceSlotOptions'
import {
  persistActiveWorkflowId,
  readActiveWorkflowId
} from '../utils/workflowAuthoringOperations'
import type { WorkflowIdeBridge } from '../utils/workflowSourceNavigation'
import { WorkflowButton } from './WorkflowButton'
import { PersistentWorkflowAuthoringPanel } from './PersistentWorkflowAuthoringPanel'
import styles from './workflow.module.scss'

export interface WorkflowPanelProps {
  runtime: WorkflowRuntimePort
  workflowUuid?: string
  traceRuntime?: WorkflowTracePort
  resourceSlotOptionsPort?: WorkflowResourceSlotOptionsPort
  activeWorkflowStorageKey?: string
  catalogRequestRevision?: number
  recoveryRevision?: number
  active?: boolean
  authoringStatus?: CapabilityStatus
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
  onActiveWorkflowChange?: (workflowUuid: string | null) => void
  onWorkflowRuntimeProjectionChange?: (
    projection: WorkflowPanelRuntimeProjection | null
  ) => void
  onSelectedWorkflowStepChange?: (workflowNodeUuid: string | null) => void
  onCatalogStateChange?: (state: WorkflowCatalogState) => void
  materialRoleFilter?: string | null
  onMaterialRoleFilterChange?: (materialRole: string | null) => void
  ideBridge?: WorkflowIdeBridge
  hideEmbeddedCodeEditor?: boolean
}

export interface WorkflowCatalogState {
  status: 'loading' | 'ready' | 'error'
  summary: string
  technicalDetail?: string
}

/**
 * 组合工作流（Workflow）目录或持久编写面板，并按宿主可见性发布跨面板投影。
 *
 * @param props 操作系统（OS）端口、可选固定工作流身份与宿主回调。
 * @returns 可独立挂载的工作流面板；隐藏面板不拥有跨面板发布权。
 */
export default function WorkflowPanel({
  runtime,
  workflowUuid: explicitWorkflowUuid,
  traceRuntime,
  resourceSlotOptionsPort,
  activeWorkflowStorageKey,
  catalogRequestRevision = 0,
  recoveryRevision = 0,
  active = true,
  authoringStatus,
  onUnsavedChangesChange,
  onActiveWorkflowChange,
  onWorkflowRuntimeProjectionChange,
  onSelectedWorkflowStepChange,
  onCatalogStateChange,
  materialRoleFilter,
  onMaterialRoleFilterChange,
  ideBridge,
  hideEmbeddedCodeEditor = false
}: WorkflowPanelProps): React.JSX.Element {
  const [selectedWorkflowUuid, setSelectedWorkflowUuid] = useState<
    string | null
  >(null)
  const [showCatalog, setShowCatalog] = useState(false)
  const handledCatalogRequestRevision = useRef(catalogRequestRevision)
  const authoringAvailable = authoringStatus?.available !== false
  const workflowUuid = !authoringAvailable || showCatalog
    ? null
    : explicitWorkflowUuid || selectedWorkflowUuid ||
      readActiveWorkflowId(activeWorkflowStorageKey)

  useEffect(() => {
    if (
      explicitWorkflowUuid ||
      handledCatalogRequestRevision.current === catalogRequestRevision
    ) {
      return
    }
    handledCatalogRequestRevision.current = catalogRequestRevision
    persistActiveWorkflowId(activeWorkflowStorageKey, '')
    setSelectedWorkflowUuid(null)
    setShowCatalog(true)
  }, [
    activeWorkflowStorageKey,
    catalogRequestRevision,
    explicitWorkflowUuid
  ])

  useEffect(() => {
    const activeWorkflowUuid = workflowUuid && isWorkflowUuid(workflowUuid)
      ? workflowUuid
      : null
    onActiveWorkflowChange?.(active ? activeWorkflowUuid : null)
    return () => onActiveWorkflowChange?.(null)
  }, [active, onActiveWorkflowChange, workflowUuid])

  if (workflowUuid && isWorkflowUuid(workflowUuid)) {
    return (
      <PersistentWorkflowAuthoringPanel
        key={workflowUuid}
        runtime={runtime}
        workflowUuid={workflowUuid}
        traceRuntime={traceRuntime}
        resourceSlotOptionsPort={resourceSlotOptionsPort}
        onUnsavedChangesChange={onUnsavedChangesChange}
        onWorkflowRuntimeProjectionChange={active
          ? onWorkflowRuntimeProjectionChange
          : undefined}
        onSelectedWorkflowStepChange={onSelectedWorkflowStepChange}
        ideBridge={ideBridge}
        hideEmbeddedCodeEditor={hideEmbeddedCodeEditor}
        materialRoleFilter={materialRoleFilter}
        onMaterialRoleFilterChange={onMaterialRoleFilterChange}
        onChooseWorkflow={explicitWorkflowUuid
          ? undefined
          : () => {
              persistActiveWorkflowId(activeWorkflowStorageKey, '')
              setSelectedWorkflowUuid(null)
              setShowCatalog(true)
            }}
      />
    )
  }

  return (
    <WorkflowCatalog
      runtime={runtime}
      activeWorkflowStorageKey={activeWorkflowStorageKey}
      recoveryRevision={recoveryRevision}
      authoringStatus={authoringStatus}
      onStateChange={onCatalogStateChange}
      onSelect={authoringAvailable
        ? (nextWorkflowUuid) => {
            persistActiveWorkflowId(activeWorkflowStorageKey, nextWorkflowUuid)
            setSelectedWorkflowUuid(nextWorkflowUuid)
            setShowCatalog(false)
          }
        : undefined}
    />
  )
}

function WorkflowCatalog({
  runtime,
  activeWorkflowStorageKey,
  recoveryRevision,
  authoringStatus,
  onStateChange,
  onSelect
}: {
  runtime: WorkflowRuntimePort
  activeWorkflowStorageKey?: string
  recoveryRevision: number
  authoringStatus?: CapabilityStatus
  onStateChange?: (state: WorkflowCatalogState) => void
  onSelect?: (workflowUuid: string) => void
}): React.JSX.Element {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestRevision, setRequestRevision] = useState(0)
  const [query, setQuery] = useState('')
  const [catalogView, setCatalogView] = useState<'all' | 'recent'>('all')
  const [recentWorkflowIds, setRecentWorkflowIds] = useState<string[]>(() =>
    readRecentWorkflowIds(activeWorkflowStorageKey)
  )

  useEffect(() => {
    let disposed = false
    setLoading(true)
    setError(null)
    onStateChange?.({
      status: 'loading',
      summary: '正在读取工作流目录'
    })
    void runtime.listWorkflows({ page: 1, page_size: 100 })
      .then((page) => {
        if (!disposed) {
          setWorkflows(page.items)
          onStateChange?.({
            status: 'ready',
            summary: `${page.items.length} 个工作流`
          })
        }
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          const technicalDetail = reason instanceof Error
            ? reason.message
            : String(reason)
          setError(technicalDetail)
          onStateChange?.({
            status: 'error',
            summary: '工作流目录不可用',
            technicalDetail
          })
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [onStateChange, recoveryRevision, requestRevision, runtime])

  const recentWorkflows = useMemo(() => {
    const byId = new Map(workflows.map((workflow) => [workflow.uuid, workflow]))
    return recentWorkflowIds.flatMap((workflowUuid) => {
      const workflow = byId.get(workflowUuid)
      return workflow ? [workflow] : []
    })
  }, [recentWorkflowIds, workflows])
  const filteredWorkflows = useMemo(() => {
    const source = catalogView === 'recent' ? recentWorkflows : workflows
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return source
    return source.filter((workflow) => [
      workflow.name,
      ...workflow.tags
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
  }, [catalogView, query, recentWorkflows, workflows])
  const groupedWorkflows = useMemo(
    () => groupWorkflowCatalog(filteredWorkflows),
    [filteredWorkflows]
  )

  const handleSelect = (workflowUuid: string): void => {
    if (!onSelect) return
    const nextRecent = recordRecentWorkflowId(
      activeWorkflowStorageKey,
      recentWorkflowIds,
      workflowUuid
    )
    setRecentWorkflowIds(nextRecent)
    onSelect(workflowUuid)
  }

  return (
    <div
      className={[
        styles.workflow,
        'workflow-runtime workflow-runtime__catalog',
        'relative flex h-full w-full flex-col',
        'bg-[var(--unilab-color-canvas)] text-[var(--unilab-color-text)]'
      ].join(' ')}
    >
      <header className="workflow-runtime__catalog-header">
        <div>
          <h2>可用工作流</h2>
          <p>
            {authoringStatus?.available === false
              ? '当前 Backend 提供只读目录；工作流创作与运行尚未启用'
              : '从当前 OS 读取并选择要编写或运行的工作流'}
          </p>
          {authoringStatus?.available === false && authoringStatus.reason && (
            <small title={authoringStatus.reason}>{authoringStatus.reason}</small>
          )}
        </div>
        {!loading && !error && (
          <span aria-label={`共 ${workflows.length} 个工作流`}>
            {workflows.length}
          </span>
        )}
      </header>

      {!loading && !error && workflows.length > 0 && (
        <div className="workflow-runtime__catalog-tools">
          <label>
            <span className="workflow-runtime__visually-hidden">
              搜索工作流
            </span>
            <input
              type="search"
              value={query}
              placeholder="搜索名称或标签"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div role="group" aria-label="工作流目录范围">
            <button
              type="button"
              aria-pressed={catalogView === 'all'}
              onClick={() => setCatalogView('all')}
            >
              全部
            </button>
            <button
              type="button"
              aria-pressed={catalogView === 'recent'}
              onClick={() => setCatalogView('recent')}
            >
              最近使用
              {recentWorkflows.length > 0 ? ` ${recentWorkflows.length}` : ''}
            </button>
          </div>
          <span role="status">
            {filteredWorkflows.length} 个结果
          </span>
        </div>
      )}

      {loading && (
        <div className="workflow-runtime__catalog-state" role="status">
          正在读取工作流…
        </div>
      )}
      {!loading && error && (
        <div className="workflow-runtime__catalog-state is-error" role="alert">
          <strong>工作流读取失败</strong>
          <span>未能从当前后端读取目录。请确认服务正常运行后重试。</span>
          <button
            type="button"
            onClick={() => setRequestRevision((value) => value + 1)}
          >
            重试
          </button>
          <details>
            <summary>查看技术信息</summary>
            <code>{error}</code>
          </details>
        </div>
      )}
      {!loading && !error && workflows.length === 0 && (
        <div className="workflow-runtime__catalog-state" role="status">
          当前后端没有可用工作流
        </div>
      )}
      {!loading && !error && workflows.length > 0 &&
        filteredWorkflows.length === 0 && (
          <div className="workflow-runtime__catalog-state" role="status">
            {catalogView === 'recent' && recentWorkflows.length === 0
              ? '尚无最近使用的工作流'
              : `没有与“${query.trim()}”匹配的工作流`}
          </div>
        )}
      {!loading && !error && groupedWorkflows.length > 0 && (
        <div className="workflow-runtime__catalog-groups">
          {groupedWorkflows.map((group) => {
            const headingId = `workflow-catalog-${slugify(group.label)}`
            return (
              <section key={group.label} aria-labelledby={headingId}>
                <header>
                  <h3 id={headingId}>{group.label}</h3>
                  <span>{group.workflows.length}</span>
                </header>
                <div className="workflow-runtime__catalog-list" role="list">
                  {group.workflows.map((workflow) => {
                    const tagSummary = workflow.tags.slice(0, 2).join(' · ')
                    const secondary = tagSummary || formatUpdatedAt(workflow.update_time)
                    return (
                      <div key={workflow.uuid} role="listitem">
                        <WorkflowButton
                          type="button"
                          disabled={!onSelect}
                          disabledReason={authoringStatus?.reason ??
                            '当前后端只提供只读工作流目录'}
                          onClick={() => handleSelect(workflow.uuid)}
                          aria-label={onSelect
                            ? `打开工作流 ${workflow.name}`
                            : `工作流 ${workflow.name}（当前后端只读）`}
                          title={`${workflow.name}\n修订 ${workflow.revision}`}
                        >
                          <span
                            className="workflow-runtime__catalog-mark"
                            aria-hidden="true"
                          >
                            ◇
                          </span>
                          <span className="workflow-runtime__catalog-copy">
                            <strong>{workflow.name}</strong>
                            <small title={secondary}>{secondary}</small>
                          </span>
                          <span className="workflow-runtime__catalog-revision">
                            r{workflow.revision}
                          </span>
                          <span
                            className="workflow-runtime__catalog-open"
                            aria-hidden="true"
                          >
                            {onSelect ? '→' : '只读'}
                          </span>
                        </WorkflowButton>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

export interface WorkflowCatalogGroup {
  label: string
  workflows: WorkflowSummary[]
}

export function groupWorkflowCatalog(
  workflows: readonly WorkflowSummary[]
): WorkflowCatalogGroup[] {
  const groups = new Map<string, WorkflowSummary[]>()
  for (const workflow of workflows) {
    const label = workflowGroupLabel(workflow)
    const current = groups.get(label) ?? []
    current.push(workflow)
    groups.set(label, current)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      const rankDifference = workflowGroupRank(left) - workflowGroupRank(right)
      return rankDifference || left.localeCompare(right, 'zh-CN')
    })
    .map(([label, items]) => ({
      label,
      workflows: items.sort((left, right) =>
        right.update_time.localeCompare(left.update_time)
      )
    }))
}

function workflowGroupRank(label: string): number {
  if (/^S\d{2} 工位$/.test(label)) return 0
  if (label.startsWith('用途 · ')) return 1
  return 2
}

export function workflowGroupLabel(workflow: WorkflowSummary): string {
  const station = [workflow.name, ...workflow.tags]
    .join(' ')
    .match(/(?:^|[^a-z0-9])(s\d{2})(?:[^a-z0-9]|$)/i)?.[1]
  if (station) return `${station.toUpperCase()} 工位`
  const purpose = workflow.tags.find((tag) => tag.trim())?.trim()
  return purpose ? `用途 · ${purpose}` : '未分类'
}

function readRecentWorkflowIds(storageKey?: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(recentStorageKey(storageKey))
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed?.workflowIds)
      ? parsed.workflowIds.filter((value: unknown) => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

function recordRecentWorkflowId(
  storageKey: string | undefined,
  current: readonly string[],
  workflowUuid: string
): string[] {
  const next = [workflowUuid, ...current.filter((id) => id !== workflowUuid)]
    .slice(0, 6)
  try {
    globalThis.localStorage?.setItem(
      recentStorageKey(storageKey),
      JSON.stringify({ version: 1, workflowIds: next })
    )
  } catch {
    // 最近使用仅是本地目录效率偏好，不影响 OS 中的工作流事实。
  }
  return next
}

function recentStorageKey(activeWorkflowStorageKey?: string): string {
  return `${activeWorkflowStorageKey ?? 'unilab.workflow.active'}.recent.v1`
}

function formatUpdatedAt(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return '更新时间未知'
  return `更新于 ${new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit'
  }).format(timestamp)}`
}

function slugify(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
}

function isWorkflowUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value)
}
