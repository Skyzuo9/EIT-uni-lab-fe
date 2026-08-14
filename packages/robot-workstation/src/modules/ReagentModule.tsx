import { useMemo, useState } from 'react'

import { DataAuthorityNotice, ModuleHeader, WorkstationDataState } from '../ModuleHeader'
import { BackendReagentDeleteDialog, BackendReagentEditorDialog } from '../reagents/BackendReagentDialogs'
import { BackendReagentHistory } from '../reagents/BackendReagentHistory'
import { ReagentInfoDeleteDialog, ReagentInfoEditorDialog } from '../reagents/ReagentInfoDialogs'
import { ReagentLedgerView, ReagentLibraryView } from '../reagents/ReagentViews'
import type {
  ReagentCreateCommand,
  ReagentInfoCreateCommand,
  ReagentInfoManagement,
  ReagentInfoProjection,
  ReagentInfoUpdateCommand,
  ReagentInventoryProjection,
  ReagentManagement,
  ReagentUpdateCommand,
  WorkstationDataStatus
} from '../types'
import { buttonClass, uiClass } from '../uiClasses'
import { WorkstationIcon } from '../WorkstationIcon'
import styles from '../workstation.module.scss'

type ReagentDialog =
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | { kind: 'delete'; id: string }
  | { kind: 'info-create' }
  | { kind: 'info-edit'; id: string }
  | { kind: 'info-delete'; id: string }
  | null

type ReagentView = 'ledger' | 'library'

/**
 * 展示真实试剂台账与 Backend 试剂基础信息库，并在能力可用时提供实例 CRUD。
 * @param props 权威台账、基础信息、加载状态和可选 Backend 管理端口。
 * @returns 与附件信息架构一致、无前端夹具的试剂管理表面。
 */
export function ReagentModule({
  items,
  status,
  infos,
  infoStatus,
  management,
  infoManagement
}: {
  items?: readonly ReagentInventoryProjection[]
  status: WorkstationDataStatus
  infos?: readonly ReagentInfoProjection[]
  infoStatus: WorkstationDataStatus
  management?: ReagentManagement
  infoManagement?: ReagentInfoManagement
}): React.JSX.Element {
  const [view, setView] = useState<ReagentView>('ledger')
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<ReagentDialog>(null)
  const [historyId, setHistoryId] = useState<string>()
  const [feedback, setFeedback] = useState('')
  const createReady = Boolean(
    management &&
    status.phase === 'ready' &&
    management.containerStatus.phase === 'ready'
  )
  const infoCreateReady = Boolean(infoManagement && infoStatus.phase === 'ready')
  const retry = view === 'ledger' ? status.retry : infoStatus.retry

  /** 创建提交成功后关闭模态框并等待列表和目录权威回读。 */
  async function createReagent(command: ReagentCreateCommand): Promise<void> {
    if (!management) return
    await management.create(command)
    setDialog(null)
    setFeedback('试剂已由 Backend 登记，正在刷新权威台账。')
  }

  /** 更新提交成功后关闭模态框；界面不在本地推进修订或数量。 */
  async function updateReagent(command: ReagentUpdateCommand): Promise<void> {
    if (!management) return
    await management.update(command)
    setDialog(null)
    setFeedback('试剂修改已提交，正在读取 Backend 最新修订。')
  }

  /** 删除提交成功后清理详情选择，并等待 Backend 软删除后的台账。 */
  async function deleteReagent(item: ReagentInventoryProjection): Promise<void> {
    if (!management) return
    await management.delete(item.id)
    if (historyId === item.id) setHistoryId(undefined)
    setDialog(null)
    setFeedback('试剂已软删除，余量闭合记录已由 Backend 写入台账。')
  }

  /** 手工登记化学品身份后关闭表单，并等待 Backend 目录权威回读。 */
  async function createReagentInfo(command: ReagentInfoCreateCommand): Promise<void> {
    if (!infoManagement) return
    await infoManagement.create(command)
    setDialog(null)
    setFeedback('试剂基础信息已登记，正在刷新 Backend 化学品字典。')
  }

  /** 纠错化学品身份后不在本地改行，统一等待 Backend 返回最新目录。 */
  async function updateReagentInfo(command: ReagentInfoUpdateCommand): Promise<void> {
    if (!infoManagement) return
    await infoManagement.update(command)
    setDialog(null)
    setFeedback('试剂基础信息已更新，正在读取 Backend 最新内容。')
  }

  /** 删除未被引用的误建身份；成功前不从目录乐观移除。 */
  async function deleteReagentInfo(item: ReagentInfoProjection): Promise<void> {
    if (!infoManagement) return
    await infoManagement.delete(item.id)
    setDialog(null)
    setFeedback('误建试剂身份已删除，正在刷新 Backend 化学品字典。')
  }

  return (
    <div className={uiClass.modulePage} data-testid="workstation-reagents">
      <ModuleHeader
        title="试剂管理"
        description="维护真实试剂基础信息与库存台账；预留、扣减和位置变化由权威后端推进。"
        actions={(
          <>
            {view === 'ledger' && management ? (
              <button
                className={buttonClass('primary', 'compact')}
                type="button"
                disabled={!createReady}
                title={createReady ? '登记试剂' : management.containerStatus.message}
                onClick={() => setDialog({ kind: 'create' })}
                data-testid="reagent-create"
              >
                <WorkstationIcon name="plus" />
                登记试剂
              </button>
            ) : null}
            {view === 'library' && infoManagement ? (
              <button
                className={buttonClass('primary', 'compact')}
                type="button"
                disabled={!infoCreateReady}
                title={infoCreateReady ? '新增试剂基础信息' : infoStatus.message}
                onClick={() => setDialog({ kind: 'info-create' })}
                data-testid="reagent-info-create"
              >
                <WorkstationIcon name="plus" />
                新增基础信息
              </button>
            ) : null}
            {retry ? (
              <button className={buttonClass('secondary', 'compact')} type="button" onClick={retry}>刷新数据</button>
            ) : null}
          </>
        )}
      />

      <div className={styles.reagentViewToolbar}>
        <nav className={styles.reagentNavigation} aria-label="试剂管理功能" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'ledger'}
            aria-controls="reagent-ledger-panel"
            onClick={() => setView('ledger')}
          >试剂台账</button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'library'}
            aria-controls="reagent-library-panel"
            onClick={() => setView('library')}
          >试剂库</button>
        </nav>
        <label className={styles.searchField}>
          <WorkstationIcon name="search" />
          <span className={uiClass.screenReaderOnly}>{view === 'ledger' ? '搜索试剂台账' : '搜索试剂库'}</span>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={view === 'ledger' ? '搜索名称、CAS、批次、库位或任务' : '搜索名称、别名、CAS 或分子式'}
          />
        </label>
      </div>

      <ReagentLedgerSurface
        hidden={view !== 'ledger'}
        items={items}
        status={status}
        management={management}
        query={query}
        feedback={feedback}
        historyId={historyId}
        onDialog={setDialog}
        onHistory={setHistoryId}
      />
      <ReagentLibrarySurface
        hidden={view !== 'library'}
        infos={infos}
        status={infoStatus}
        query={query}
        management={infoManagement}
        feedback={feedback}
        onDialog={setDialog}
      />
      <ReagentDialogLayer
        dialog={dialog}
        items={items}
        infos={infos}
        management={management}
        infoManagement={infoManagement}
        onCreate={createReagent}
        onUpdate={updateReagent}
        onDelete={deleteReagent}
        onInfoCreate={createReagentInfo}
        onInfoUpdate={updateReagentInfo}
        onInfoDelete={deleteReagentInfo}
        onClose={() => setDialog(null)}
      />
    </div>
  )
}

/**
 * 渲染试剂台账的加载、空态、列表与历史面板。
 * @param props 当前显隐、权威库存、搜索词和实例操作回调。
 * @returns 单一台账 tabpanel。
 */
function ReagentLedgerSurface({
  hidden,
  items,
  status,
  management,
  query,
  feedback,
  historyId,
  onDialog,
  onHistory
}: {
  hidden: boolean
  items?: readonly ReagentInventoryProjection[]
  status: WorkstationDataStatus
  management?: ReagentManagement
  query: string
  feedback: string
  historyId?: string
  onDialog: (dialog: ReagentDialog) => void
  onHistory: (id?: string) => void
}): React.JSX.Element {
  const historyItem = items?.find(item => item.id === historyId)
  return (
    <section id="reagent-ledger-panel" role="tabpanel" hidden={hidden}>
      {status.phase !== 'ready' || !items ? (
        <WorkstationDataState status={status} title={reagentStateTitle(status)} icon="flask" />
      ) : (
        <>
          <DataAuthorityNotice>
            {management
              ? '试剂身份、数量、修订与历史由 Go Backend 持久化；修改使用 expected_revision，失败或冲突时不会覆盖当前界面事实。'
              : '数量、批次和库区来自当前 Edge 库存权威快照；接口未返回的维度保持“—”，前端不提供本地写入。'}
          </DataAuthorityNotice>
          {items.length === 0 ? (
            <WorkstationDataState
              status={{
                phase: 'empty',
                message: management
                  ? 'Backend 试剂接口已连接，但当前没有库存实例。可以选择一个空容器物料登记试剂。'
                  : 'Edge 库存接口已连接，但当前没有明确标记为试剂的批次。',
                retry: status.retry
              }}
              title="暂无试剂台账"
              icon="flask"
            />
          ) : (
            <ReagentLedgerView
              items={items}
              query={query}
              actions={management ? {
                edit: item => onDialog({ kind: 'edit', id: item.id }),
                history: item => onHistory(item.id),
                delete: item => onDialog({ kind: 'delete', id: item.id })
              } : undefined}
            />
          )}
          {feedback ? <p className={styles.feedbackLine} role="status">{feedback}</p> : null}
          {historyItem && management ? (
            <BackendReagentHistory
              key={historyItem.id}
              item={historyItem}
              readHistory={management.readHistory}
              onClose={() => onHistory(undefined)}
            />
          ) : null}
        </>
      )}
    </section>
  )
}

/**
 * 渲染试剂基础信息库的加载、空态、目录与可选 Backend 操作。
 * @param props 当前显隐、权威目录、接口状态、搜索词和管理回调。
 * @returns 单一试剂库 tabpanel。
 */
function ReagentLibrarySurface({
  hidden,
  infos,
  status,
  query,
  management,
  feedback,
  onDialog
}: {
  hidden: boolean
  infos?: readonly ReagentInfoProjection[]
  status: WorkstationDataStatus
  query: string
  management?: ReagentInfoManagement
  feedback: string
  onDialog: (dialog: ReagentDialog) => void
}): React.JSX.Element {
  return (
    <section id="reagent-library-panel" role="tabpanel" hidden={hidden}>
      {status.phase !== 'ready' || !infos ? (
        <WorkstationDataState status={status} title={reagentInfoStateTitle(status)} icon="flask" />
      ) : infos.length === 0 ? (
        <WorkstationDataState
          status={{
            phase: 'empty',
            message: management
              ? 'Backend 化学品字典已连接，但当前目录为空。可以先登记一条独立试剂基础信息。'
              : 'Backend 试剂基础信息接口已连接，但当前目录为空。',
            retry: status.retry
          }}
          title="暂无试剂基础信息"
          icon="flask"
        />
      ) : (
        <>
          <DataAuthorityNotice>
            {management
              ? '试剂基础信息是 Backend 化学品字典；登记不会创建容器或余量，纠错不会联动覆盖既有试剂实例，历史已引用的身份不能删除。'
              : '试剂基础信息来自 Backend 化学品字典；当前服务配置只开放查询，前端不保存本地副本。'}
          </DataAuthorityNotice>
          <ReagentLibraryView
            infos={infos}
            query={query}
            actions={management ? {
              edit: item => onDialog({ kind: 'info-edit', id: item.id }),
              delete: item => onDialog({ kind: 'info-delete', id: item.id })
            } : undefined}
          />
          {feedback ? <p className={styles.feedbackLine} role="status">{feedback}</p> : null}
        </>
      )}
    </section>
  )
}

/**
 * 根据当前命令只挂载一个 Backend 试剂实例对话框。
 * @param props 当前命令、库存、管理端口及提交/关闭回调。
 * @returns 创建、编辑、删除对话框或空片段。
 */
function ReagentDialogLayer({
  dialog,
  items,
  infos,
  management,
  infoManagement,
  onCreate,
  onUpdate,
  onDelete,
  onInfoCreate,
  onInfoUpdate,
  onInfoDelete,
  onClose
}: {
  dialog: ReagentDialog
  items?: readonly ReagentInventoryProjection[]
  infos?: readonly ReagentInfoProjection[]
  management?: ReagentManagement
  infoManagement?: ReagentInfoManagement
  onCreate: (command: ReagentCreateCommand) => Promise<void>
  onUpdate: (command: ReagentUpdateCommand) => Promise<void>
  onDelete: (item: ReagentInventoryProjection) => Promise<void>
  onInfoCreate: (command: ReagentInfoCreateCommand) => Promise<void>
  onInfoUpdate: (command: ReagentInfoUpdateCommand) => Promise<void>
  onInfoDelete: (item: ReagentInfoProjection) => Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const dialogItem = dialog && (dialog.kind === 'edit' || dialog.kind === 'delete')
    ? items?.find(item => item.id === dialog.id)
    : undefined
  const dialogInfo = dialog && (dialog.kind === 'info-edit' || dialog.kind === 'info-delete')
    ? infos?.find(info => info.id === dialog.id)
    : undefined
  const occupiedMaterialIds = useMemo(
    () => new Set((items ?? []).flatMap(item => item.materialId ? [item.materialId] : [])),
    [items]
  )
  if (dialog?.kind === 'create' && management?.containers) {
    return (
      <BackendReagentEditorDialog
        mode="create"
        containers={management.containers}
        occupiedMaterialIds={occupiedMaterialIds}
        onSave={onCreate}
        onClose={onClose}
      />
    )
  }
  if (dialog?.kind === 'edit' && dialogItem && management) {
    return (
      <BackendReagentEditorDialog
        mode="edit"
        item={dialogItem}
        containers={management.containers ?? []}
        occupiedMaterialIds={occupiedMaterialIds}
        onSave={onUpdate}
        onClose={onClose}
      />
    )
  }
  if (dialog?.kind === 'delete' && dialogItem && management) {
    return (
      <BackendReagentDeleteDialog
        item={dialogItem}
        onDelete={() => onDelete(dialogItem)}
        onClose={onClose}
      />
    )
  }
  if (dialog?.kind === 'info-create' && infoManagement) {
    return (
      <ReagentInfoEditorDialog
        mode="create"
        onSave={onInfoCreate}
        onClose={onClose}
      />
    )
  }
  if (dialog?.kind === 'info-edit' && dialogInfo && infoManagement) {
    return (
      <ReagentInfoEditorDialog
        mode="edit"
        item={dialogInfo}
        onSave={onInfoUpdate}
        onClose={onClose}
      />
    )
  }
  if (dialog?.kind === 'info-delete' && dialogInfo && infoManagement) {
    return (
      <ReagentInfoDeleteDialog
        item={dialogInfo}
        onDelete={() => onInfoDelete(dialogInfo)}
        onClose={onClose}
      />
    )
  }
  return <></>
}

/** 返回试剂台账接口状态的简短标题。 */
function reagentStateTitle(status: WorkstationDataStatus): string {
  if (status.phase === 'loading') return '正在读取试剂台账'
  if (status.phase === 'error') return '试剂台账读取失败'
  if (status.phase === 'unavailable') return '试剂台账接口不可用'
  return '暂无试剂台账'
}

/** 返回试剂基础信息接口状态的简短标题。 */
function reagentInfoStateTitle(status: WorkstationDataStatus): string {
  if (status.phase === 'loading') return '正在读取试剂基础信息'
  if (status.phase === 'error') return '试剂基础信息读取失败'
  if (status.phase === 'unavailable') return '试剂基础信息接口不可用'
  return '暂无试剂基础信息'
}
