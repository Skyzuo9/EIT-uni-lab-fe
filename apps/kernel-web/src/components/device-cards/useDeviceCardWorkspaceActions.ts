import { useState, type Dispatch, type SetStateAction } from 'react'
import { createDeviceCardAuthoringKit } from '@unilab/device-card-authoring-kit'
import type {
  DeviceCardAgentEnvironmentInfo,
  DeviceCardAuthoringProfile,
  DeviceCardWorkspaceStatus
} from '@unilab/device-card-sdk'
import type { DeviceCatalogItem } from '@unilab/services'

import { createAuthoringContext } from '../../data/authoringContext'
import type {
  WorkbenchNotice,
  WorkspaceOperation
} from './deviceCardWorkbenchSupport'

type DesktopDeviceCardApi = NonNullable<
  NonNullable<typeof window.api>['deviceCards']
>
type DesktopFileApi = NonNullable<NonNullable<typeof window.api>['file']>

interface DeviceCardWorkspaceActionOptions {
  desktopApi: DesktopDeviceCardApi | undefined
  fileApi: DesktopFileApi | undefined
  selectedDevice: DeviceCatalogItem | undefined
  runtimeState: Record<string, unknown>
  authoringProfile: DeviceCardAuthoringProfile
  workspace: DeviceCardWorkspaceStatus | null
  agentInfo: DeviceCardAgentEnvironmentInfo | null
  agentReady: boolean
  refresh: () => Promise<void>
  setWorkspace: Dispatch<SetStateAction<DeviceCardWorkspaceStatus | null>>
  setAgentInfo: Dispatch<SetStateAction<DeviceCardAgentEnvironmentInfo | null>>
  setSelectedCardKey: Dispatch<SetStateAction<string>>
  setMessage: Dispatch<SetStateAction<WorkbenchNotice | null>>
}

/**
 * 集中设备卡源码工作区、Agent 环境和开发包导出操作。
 *
 * @param options 工作区权威状态、桌面接口与状态写入器。
 * @returns 可由设备卡工作台调用的命令及其进行中状态。
 */
export function useDeviceCardWorkspaceActions(
  options: DeviceCardWorkspaceActionOptions
) {
  const {
    desktopApi,
    fileApi,
    selectedDevice,
    runtimeState,
    authoringProfile,
    workspace,
    agentInfo,
    agentReady,
    refresh,
    setWorkspace,
    setAgentInfo,
    setSelectedCardKey,
    setMessage
  } = options
  const [exportingKit, setExportingKit] = useState(false)
  const [workspaceOperation, setWorkspaceOperation] =
    useState<WorkspaceOperation>(null)

  /** 授权并打开一个已有设备卡源码目录。 */
  const openWorkspace = async (): Promise<void> => {
    if (!desktopApi || !selectedDevice) return
    setWorkspaceOperation('open')
    setMessage(null)
    try {
      const status = await desktopApi.workspace.open(
        createAuthoringContext(selectedDevice, runtimeState)
      )
      if (!status) return
      setWorkspace(status)
      setMessage(status.state === 'ready'
        ? {
            kind: 'success',
            text: '源码目录已授权，Electron 将在保存后自动检查并刷新预览。'
          }
        : {
            kind: 'warning',
            text: '源码目录已打开，请按结构化诊断修复当前错误。'
          })
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '打开已有项目失败'
      })
    } finally {
      setWorkspaceOperation(null)
    }
  }

  /** 为当前设备创建 Agent 可编辑的设备卡项目。 */
  const prepareAgentProject = async (): Promise<void> => {
    if (!desktopApi || !selectedDevice) return
    setWorkspaceOperation('prepare')
    setMessage(null)
    try {
      const result = await desktopApi.authoring.prepare({
        deviceId: selectedDevice.deviceId,
        profile: authoringProfile
      })
      if (!result) return
      setWorkspace(result.workspace)
      setMessage({
        kind: result.workspace.state === 'ready' ? 'success' : 'warning',
        text: result.workspace.state === 'ready'
          ? '项目已创建并检查通过，可以交给 AI 修改。'
          : '项目已创建，请让 AI 根据诊断继续修复。'
      })
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '创建 Agent 项目失败'
      })
    } finally {
      setWorkspaceOperation(null)
    }
  }

  /** 安装或移除设备卡 Agent 命令行工具。 */
  const toggleAgentCli = async (): Promise<void> => {
    if (!desktopApi || !agentInfo) return
    setWorkspaceOperation('cli')
    setMessage(null)
    try {
      const next = agentInfo.cli.installed && agentInfo.cli.compatible
        ? await desktopApi.agent.removeCli()
        : await desktopApi.agent.installCli()
      setAgentInfo(next)
      setMessage({
        kind: 'success',
        text: next.cli.installed
          ? `AI 助手连接工具已安装：${next.cli.installPath}`
          : 'AI 助手连接工具已移除。'
      })
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '更新 Agent CLI 失败'
      })
    } finally {
      setWorkspaceOperation(null)
    }
  }

  /** 启用或停用设备卡 Agent 桥接能力。 */
  const toggleAgentBridge = async (): Promise<void> => {
    if (!desktopApi || !agentInfo) return
    setWorkspaceOperation('cli')
    setMessage(null)
    try {
      const next = await desktopApi.agent.setBridgeEnabled(
        !agentInfo.bridge.enabled
      )
      setAgentInfo(next)
      setMessage({
        kind: 'success',
        text: next.bridge.enabled
          ? 'AI 编程助手连接已启用。'
          : 'AI 编程助手连接已停止。'
      })
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '更新 AI 助手连接失败'
      })
    } finally {
      setWorkspaceOperation(null)
    }
  }

  /** 复制约束完整的设备卡 Agent 开发指令。 */
  const copyAgentPrompt = async (): Promise<void> => {
    if (!workspace || !agentReady || !agentInfo) return
    const command = [
      quoteCommand(agentInfo.cli.command),
      'workspace status',
      '--project',
      quoteCommand(workspace.projectDir),
      '--json'
    ].join(' ')
    const prompt = [
      `请开发 ${workspace.projectDir} 中的 Uni-Lab 设备卡片。`,
      '先完整阅读 AGENTS.md、CARD_SPEC.md、authoring-context.json、card.manifest.json 和 mock.json；仅按声明的设备能力修改 src，设计专业的实验室界面。禁止安装依赖、使用网络、Node.js 或未声明的状态和 Action。',
      '只有 authoring-context.json 中经 SDK 判定为正式可订阅的 Driver/Host 状态键才能进入状态权限和实时面板；Action 输出以及 action-inferred、runtime-sample、unresolved 字段不是实时状态。',
      '运行时只允许通过 Host Bridge 读取当前 deviceId 的状态并调用 Action，禁止直连设备或 WebSocket。Action 输入只是草稿，实时值必须等待设备上报；切换实例不得沿用旧值。处理离线、忙碌、失败、未上报及 Mock/Live 模式。',
      `每次修改后运行：\n${command}\n失败时读取 .unilab-card/diagnostics.json 并修复到 ready。不要安装卡片或调用真实设备 Action。`
    ].join('\n\n')
    try {
      await navigator.clipboard.writeText(prompt)
      setMessage({ kind: 'success', text: 'AI 开发指令已复制' })
    } catch {
      setMessage({
        kind: 'warning',
        text: '自动复制失败，请在项目目录中打开后重试。'
      })
    }
  }

  /** 重新构建设备卡源码并刷新开发预览。 */
  const rebuildWorkspace = async (): Promise<void> => {
    if (!desktopApi || !workspace) return
    setWorkspaceOperation('rebuild')
    setMessage(null)
    try {
      const status = await desktopApi.workspace.rebuild()
      setWorkspace(status)
      setMessage(status.state === 'ready'
        ? { kind: 'success', text: '当前源码检查通过，开发预览已刷新。' }
        : { kind: 'warning', text: '当前源码仍有错误，请查看诊断。' })
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '重新检查失败'
      })
    } finally {
      setWorkspaceOperation(null)
    }
  }

  /** 从检查通过的源码快照构建并安装设备卡。 */
  const installWorkspace = async (): Promise<void> => {
    if (!desktopApi || workspace?.state !== 'ready') return
    setWorkspaceOperation('install')
    setMessage(null)
    try {
      const installed = await desktopApi.workspace.install()
      await refresh()
      setSelectedCardKey(installed.key)
      setMessage({
        kind: 'success',
        text: `已从当前源码快照权威构建并安装：${installed.title}`
      })
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '安装当前源码失败'
      })
    } finally {
      setWorkspaceOperation(null)
    }
  }

  /** 关闭当前设备卡源码工作区。 */
  const closeWorkspace = async (): Promise<void> => {
    if (!desktopApi || !workspace) return
    setWorkspaceOperation('close')
    setMessage(null)
    try {
      await desktopApi.workspace.close()
      setWorkspace(null)
      setMessage({ kind: 'info', text: '本地开发工作区已关闭。' })
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '关闭工作区失败'
      })
    } finally {
      setWorkspaceOperation(null)
    }
  }

  /** 导出当前设备的离线设备卡开发包。 */
  const exportAuthoringKit = async (): Promise<void> => {
    if (!fileApi || !selectedDevice) return
    setExportingKit(true)
    setMessage(null)
    try {
      const kit = await createDeviceCardAuthoringKit({
        context: createAuthoringContext(selectedDevice, runtimeState),
        profile: authoringProfile
      })
      const saved = await fileApi.saveBinary({
        defaultName: kit.fileName,
        content: kit.archive
      })
      if (saved) {
        setMessage({
          kind: 'success',
          text: `卡片开发包已保存：${saved.path}`
        })
      }
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : '导出卡片开发包失败'
      })
    } finally {
      setExportingKit(false)
    }
  }

  /** 在系统文件管理器中显示当前设备卡源码目录。 */
  const revealWorkspace = (): void => {
    if (!desktopApi || !workspace) return
    void desktopApi.authoring.reveal(workspace.projectDir)
  }

  return {
    closeWorkspace,
    copyAgentPrompt,
    exportAuthoringKit,
    exportingKit,
    installWorkspace,
    openWorkspace,
    prepareAgentProject,
    rebuildWorkspace,
    revealWorkspace,
    toggleAgentBridge,
    toggleAgentCli,
    workspaceOperation
  }
}

/** 对 Agent CLI 参数执行最小双引号转义。 */
function quoteCommand(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`
}
