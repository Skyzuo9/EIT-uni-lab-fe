import { createDeviceCardAuthoringContext } from '@unilab/device-card-authoring-kit'
import {
  deviceCardRealtimeStateKeys,
  type DeviceCardActionContract,
  type DeviceCardActionRun,
  type DeviceCardAuthoringContext,
  type DeviceCardBounds,
  type DeviceCardHostActionRequest,
  type DeviceCardHostManualExclusiveRequest,
  type DeviceCardHostManualExclusiveResult,
  type DeviceCardWorkspaceStatus,
  type DevicePackageCardProject,
  type OpenDeviceCardWorkspaceRequest
} from '@unilab/device-card-sdk'
import {
  DeviceCardActionController,
  type DeviceCatalogItem,
  type DeviceJointStateFrame,
  type DeviceStatus,
  type Services
} from '@unilab/services'
import * as React from 'react'

interface WorkbenchDeviceCardApi {
  package: {
    discover(workspacePath: string): Promise<DevicePackageCardProject[]>
    open(input: {
      projectDir: string
      context: DeviceCardAuthoringContext
    }): Promise<DeviceCardWorkspaceStatus>
    preview(request: OpenDeviceCardWorkspaceRequest): Promise<void>
    close(): Promise<void>
  }
  updateBounds(bounds: DeviceCardBounds): Promise<void>
  updateState(state: Record<string, unknown>): Promise<void>
  close(): Promise<void>
  resolveAction(run: DeviceCardActionRun): Promise<void>
  onActionRequest(
    listener: (request: DeviceCardHostActionRequest) => void
  ): () => void
  resolveManualExclusive(
    result: DeviceCardHostManualExclusiveResult
  ): Promise<void>
  onManualExclusiveRequest(
    listener: (request: DeviceCardHostManualExclusiveRequest) => void
  ): () => void
}

/**
 * 从当前领域包发现并托管一张与在线设备匹配的卡片。
 *
 * 卡片源码仍属于领域仓库；Workbench 只把经 Host 构建的隔离视图接到统一
 * 动作任务、手动独占（Exclusive）和设备遥测（DeviceTelemetry）端口。
 */
export function WorkbenchDeviceCard({
  services,
  workspacePath,
  runtimeRevision,
  deviceId
}: {
  services: Services
  workspacePath: string
  runtimeRevision: string
  deviceId?: string
}): React.JSX.Element {
  const api = React.useMemo(workbenchDeviceCardApi, [])
  const previewRef = React.useRef<HTMLDivElement>(null)
  const deviceRef = React.useRef<DeviceCatalogItem | null>(null)
  const stateRef = React.useRef<Record<string, unknown>>({})
  const [device, setDevice] = React.useState<DeviceCatalogItem | null>(null)
  const [project, setProject] = React.useState<DevicePackageCardProject | null>(null)
  const [workspace, setWorkspace] = React.useState<DeviceCardWorkspaceStatus | null>(null)
  const [status, setStatus] = React.useState<DeviceStatus | null>(null)
  const [jointState, setJointState] = React.useState<DeviceJointStateFrame | null>(null)
  const [message, setMessage] = React.useState(
    api ? '正在读取领域包设备卡片…' : '桌面设备卡片 Host 不可用'
  )

  React.useEffect(() => {
    if (!api || !workspacePath) return
    let disposed = false
    let retry: ReturnType<typeof globalThis.setTimeout> | null = null
    const discover = async (): Promise<void> => {
      try {
        const [projects, devices] = await Promise.all([
          api.package.discover(workspacePath),
          services.laboratory.getDeviceCatalog()
        ])
        const match = matchPackageCard(projects, devices, deviceId)
        if (!match) {
          throw new Error(
            projects.length === 0
              ? '当前领域包没有 frontend/cards 设备卡片'
              : '设备目录中没有与领域包卡片匹配的设备'
          )
        }
        const runtimeState = buildDeviceCardRuntimeState(match.device, null, null)
        const context = createDeviceCardAuthoringContext(
          authoringTarget(match.device),
          runtimeState
        )
        const nextWorkspace = await api.package.open({
          projectDir: match.project.projectDir,
          context
        })
        if (nextWorkspace.state !== 'ready' || !nextWorkspace.card) {
          const detail = nextWorkspace.diagnostics
            .map((item) => `${item.code}: ${item.message}`)
            .join('；')
          throw new Error(detail || '设备卡片构建未通过')
        }
        if (disposed) return
        deviceRef.current = match.device
        stateRef.current = runtimeState
        setDevice(match.device)
        setProject(match.project)
        setWorkspace(nextWorkspace)
        setMessage(`已加载 ${nextWorkspace.card.title}`)
      } catch (error) {
        if (disposed) return
        setMessage(error instanceof Error ? error.message : String(error))
        retry = globalThis.setTimeout(() => { void discover() }, 2_000)
      }
    }
    void discover()
    return () => {
      disposed = true
      if (retry !== null) globalThis.clearTimeout(retry)
      deviceRef.current = null
      void api.close()
      void api.package.close()
    }
  }, [api, deviceId, runtimeRevision, services.laboratory, workspacePath])

  React.useEffect(() => {
    if (!device || !shouldSubscribeDeviceStatus(services.capabilities)) return
    return services.realtime.subscribeDeviceStatus({
      onDeviceStatus: (items) => {
        setStatus(items.find((item) => item.deviceId === device.deviceId) ?? null)
      },
      onError: setMessage
    })
  }, [device, services.capabilities.devices.subscribeStatus, services.realtime])

  React.useEffect(() => {
    if (!device || !shouldSubscribeJointState(services.capabilities)) return
    setJointState(null)
    return services.realtime.subscribeJointState({
      onJointState: (frame) => {
        if (frame.deviceId === device.deviceId) setJointState(frame)
      },
      onSnapshot: (frames) => {
        setJointState(
          frames.find((frame) => frame.deviceId === device.deviceId) ?? null
        )
      },
      onError: setMessage
    })
  }, [device, services.capabilities.realtime.subscribeJointState, services.realtime])

  const runtimeState = React.useMemo(
    () => device ? buildDeviceCardRuntimeState(device, status, jointState) : {},
    [device, jointState, status]
  )
  stateRef.current = runtimeState

  React.useEffect(() => {
    if (!api || !workspace?.card || !device || !previewRef.current) return
    const preview = previewRef.current
    let disposed = false
    const actions = actionContracts(device)
    const stateKeys = deviceCardRealtimeStateKeys({
      ...(device.stateSchema ?? {}),
      online: { type: 'boolean', source: 'host', status: 'resolved' },
      actionBusy: { type: 'object', source: 'host', status: 'resolved' },
      jointState: { type: 'object', source: 'host', status: 'resolved' }
    })
    const syncBounds = (): DeviceCardBounds => {
      const rect = preview.getBoundingClientRect()
      const bounds = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
      void api.updateBounds(bounds)
      return bounds
    }
    const observer = new ResizeObserver(syncBounds)
    observer.observe(preview)
    const frame = requestAnimationFrame(() => {
      const request: OpenDeviceCardWorkspaceRequest = {
        bounds: syncBounds(),
        context: {
          mode: 'live',
          device: {
            deviceId: device.deviceId,
            deviceTypeId: device.deviceTypeId,
            title: device.label
          },
          state: stateRef.current,
          config: {},
          theme: 'light',
          locale: 'zh-CN'
        },
        availableActions: actions,
        availableState: stateKeys,
        availableMedia: [],
        availableUiFeatures: [
          'core',
          ...(services.capabilities.devices.manualExclusive
            ? ['manual-exclusive']
            : [])
        ]
      }
      void api.package.preview(request).catch((error) => {
        if (!disposed) setMessage(
          error instanceof Error ? error.message : '设备卡片打开失败'
        )
      })
    })
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      void api.close()
    }
  }, [api, device, services.capabilities.devices.manualExclusive, workspace?.card])

  React.useEffect(() => {
    if (api && workspace?.card) void api.updateState(runtimeState)
  }, [api, runtimeState, workspace?.card])

  React.useEffect(() => {
    if (!api) return
    const abortController = new AbortController()
    const controller = new DeviceCardActionController({
      workflow: services.workflow,
      tasks: services.deviceActionTasks,
      actionTasksSupported: services.capabilities.devices.runActionTask,
      runtimeEventsSupported: services.capabilities.workflow.subscribeEvents
    })
    const unsubscribe = api.onActionRequest((request) => {
      const current = deviceRef.current
      const running = current
        ? controller.execute(request, current, { signal: abortController.signal })
        : Promise.resolve<DeviceCardActionRun>({
            requestId: request.requestId,
            action: request.action,
            status: 'ERROR',
            error: `未找到设备：${request.deviceId}`
          })
      void running.then(api.resolveAction)
    })
    return () => {
      abortController.abort()
      unsubscribe()
    }
  }, [api, services])

  React.useEffect(() => {
    if (!api) return
    return api.onManualExclusiveRequest((request) => {
      const current = deviceRef.current
      if (!current || current.deviceId !== request.deviceId) {
        void api.resolveManualExclusive({
          requestId: request.requestId,
          ok: false,
          error: `未找到设备绑定：${request.deviceId}`
        })
        return
      }
      const operation = services.manualExclusive[request.operation]
      // 卡片 Action 使用设备物料 UUID；手动独占路径使用 Edge local_id。
      void operation(current.deviceKey).then(
        snapshot => api.resolveManualExclusive({
          requestId: request.requestId,
          ok: true,
          snapshot
        }),
        error => api.resolveManualExclusive({
          requestId: request.requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      )
    })
  }, [api, services.manualExclusive])

  return (
    <section
      className="unilab-workbench-device-card"
      data-package-card-state={workspace?.state ?? (api ? 'discovering' : 'unavailable')}
      data-package-card-id={project?.id ?? ''}
      data-package-card-device={device?.deviceId ?? ''}
      aria-label="机械臂设备卡片"
    >
      <div className="unilab-workbench-device-card__status" aria-live="polite">
        <strong>{project?.title ?? '领域包设备卡片'}</strong>
        <span>{message}</span>
      </div>
      <div ref={previewRef} className="unilab-workbench-device-card__preview" />
    </section>
  )
}

function workbenchDeviceCardApi(): WorkbenchDeviceCardApi | null {
  return (globalThis.window as Window & {
    api?: { deviceCards?: WorkbenchDeviceCardApi }
  }).api?.deviceCards ?? null
}

function matchPackageCard(
  projects: readonly DevicePackageCardProject[],
  devices: readonly DeviceCatalogItem[],
  requestedDeviceId?: string
): { project: DevicePackageCardProject; device: DeviceCatalogItem } | null {
  for (const project of projects) {
    const device = devices.find((item) => (
      (!requestedDeviceId || item.deviceId === requestedDeviceId)
      && project.deviceTypes.includes(item.deviceTypeId)
    ))
    if (device) return { project, device }
  }
  return null
}

function authoringTarget(device: DeviceCatalogItem) {
  return {
    deviceId: device.deviceId,
    deviceTypeId: device.deviceTypeId,
    title: device.label,
    online: device.online,
    actions: actionContracts(device),
    stateSchema: {
      ...(device.stateSchema ?? {}),
      jointState: {
        type: 'object',
        description: '统一设备遥测（DeviceTelemetry）SSE 的最新关节状态',
        source: 'host',
        status: 'resolved'
      }
    },
    media: []
  }
}

function actionContracts(device: DeviceCatalogItem): DeviceCardActionContract[] {
  return device.actions.map((action) => ({
    action: action.actionName,
    label: action.label,
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
    riskLevel: action.riskLevel,
    busy: action.isBusy
  }))
}

/**
 * 组合设备属性与独立关节遥测，供通用设备卡片 Host 投影。
 *
 * @param device 当前目录设备。
 * @param status 低频设备属性状态。
 * @param jointState 高频关节状态（JointState）的最新完整帧。
 * @returns 只包含 Host 已声明状态键的运行时快照。
 */
export function buildDeviceCardRuntimeState(
  device: DeviceCatalogItem,
  status: DeviceStatus | null,
  jointState: DeviceJointStateFrame | null
): Record<string, unknown> {
  return {
    ...(status?.status ?? {}),
    online: device.online,
    jointState: jointState
      ? {
          acceptedRef: jointState.acceptedRef,
          bootId: jointState.bootId,
          jointStates: jointState.jointStates,
          observedAt: jointState.observedAt,
          sequence: jointState.sequence,
          stale: jointState.stale,
          staleAfterSeconds: jointState.staleAfterSeconds,
          topologyDigest: jointState.topologyDigest
        }
      : null,
    actionBusy: Object.fromEntries(
      device.actions.map((action) => [action.actionName, action.isBusy])
    )
  }
}

/** 分别读取设备属性与关节状态（JointState）的独立实时能力。 */
export function shouldSubscribeDeviceStatus(
  capabilities: Services['capabilities']
): boolean {
  return capabilities.devices.subscribeStatus
}

/** 关节订阅不得错误依赖低频设备状态能力。 */
export function shouldSubscribeJointState(
  capabilities: Services['capabilities']
): boolean {
  return capabilities.realtime.subscribeJointState
}
