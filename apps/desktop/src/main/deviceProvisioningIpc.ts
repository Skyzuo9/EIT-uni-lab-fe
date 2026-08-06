import type {
  ConfigureLocalDeviceProvisioningInput,
  DevicePackageUploadRequest,
  DeviceProvisioningPathSelection
} from '@unilab/device-provisioning'
import type { DeviceSquareListQuery } from '@unilab/services'

import {
  dialog,
  type BrowserWindow,
  type IpcMain,
  type IpcMainInvokeEvent
} from 'electron'

import type { LocalDeviceProvisioningManager } from './localDeviceProvisioningManager'
import { ApprovedDevicePackagePaths } from './approvedDevicePackagePaths'

interface RegisterDeviceProvisioningIpcOptions {
  ipcMain: IpcMain
  manager: LocalDeviceProvisioningManager
  getMainWindow: () => BrowserWindow | null
  assertSender: (event: IpcMainInvokeEvent) => void
}

/**
 * 注册候选本地设备接入（LocalDeviceProvisioning）的最小可信 IPC 面。
 *
 * @param options Electron IPC、Main 编排器、主窗口解析器与 sender 门禁。
 * @returns 无返回值；所有处理器在注册后保持到应用退出。
 * @safety Renderer 只能提交模板 UUID、接入 UUID、配置值和受控选择器返回路径。
 */
export function registerDeviceProvisioningIpc(
  options: RegisterDeviceProvisioningIpcOptions
): void {
  const { ipcMain, manager, assertSender } = options
  const approvedPaths = new ApprovedDevicePackagePaths()
  ipcMain.handle('device-provisioning:square:list', (event, payload: unknown) => {
    assertSender(event)
    return manager.listCloudDevices(parseSquareQuery(payload))
  })
  ipcMain.handle('device-provisioning:square:detail', (event, value: unknown) => {
    assertSender(event)
    return manager.getCloudDevice(requiredString(value, '设备模板 UUID'))
  })
  ipcMain.handle('device-provisioning:list', (event) => {
    assertSender(event)
    return manager.list()
  })
  ipcMain.handle('device-provisioning:start', (event, value: unknown) => {
    assertSender(event)
    return manager.start(requiredString(value, '设备模板 UUID'))
  })
  ipcMain.handle('device-provisioning:download', (event, value: unknown) => {
    assertSender(event)
    return manager.downloadOnly(requiredString(value, '设备模板 UUID'))
  })
  ipcMain.handle('device-provisioning:configure', (event, payload: unknown) => {
    assertSender(event)
    return manager.configure(parseConfiguration(payload))
  })
  ipcMain.handle('device-provisioning:activate', (event, value: unknown) => {
    assertSender(event)
    return manager.activate(requiredString(value, '接入 UUID'))
  })
  ipcMain.handle('device-provisioning:retry', (event, value: unknown) => {
    assertSender(event)
    return manager.retry(requiredString(value, '接入 UUID'))
  })
  ipcMain.handle('device-provisioning:remove', (event, value: unknown) => {
    assertSender(event)
    return manager.remove(requiredString(value, '接入 UUID'))
  })
  ipcMain.handle('device-provisioning:restore', (event, value: unknown) => {
    assertSender(event)
    return manager.restore(requiredString(value, '接入 UUID'))
  })
  ipcMain.handle('device-provisioning:selectPath', async (event, value: unknown) => {
    assertSender(event)
    const selection = parsePathSelection(value)
    const selectedPath = await selectPackagePath(
      options.getMainWindow(),
      selection
    )
    if (selectedPath) {
      approvedPaths.approve(selection, selectedPath)
    }
    return selectedPath
  })
  ipcMain.handle('device-provisioning:inspect', (event, value: unknown) => {
    assertSender(event)
    const workspacePath = approvedPaths.require(
      { kind: 'packageWorkspace' },
      requiredString(value, 'Package Workspace')
    )
    return manager.inspectWorkspace(workspacePath)
  })
  ipcMain.handle('device-provisioning:upload', (event, payload: unknown) => {
    assertSender(event)
    const request = parseUploadRequest(payload)
    return manager.uploadWorkspace({
      workspacePath: approvedPaths.require(
        { kind: 'packageWorkspace' },
        request.workspacePath
      ),
      configPath: approvedPaths.require(
        { kind: 'packageUploadConfig' },
        request.configPath
      )
    })
  })
}

/** 把 Renderer 查询收敛为公开设备广场允许的分页和筛选字段。 */
function parseSquareQuery(value: unknown): DeviceSquareListQuery {
  if (value === undefined || value === null) return {}
  const raw = record(value, '设备广场查询')
  const query: DeviceSquareListQuery = {}
  if (raw.page !== undefined) query.page = positiveInteger(raw.page, 'page')
  if (raw.pageSize !== undefined) {
    query.pageSize = positiveInteger(raw.pageSize, 'pageSize')
  }
  if (raw.manufacturerUuid !== undefined) {
    query.manufacturerUuid = requiredString(
      raw.manufacturerUuid,
      'manufacturerUuid'
    )
  }
  if (raw.keyword !== undefined) query.keyword = String(raw.keyword).slice(0, 200)
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags)) throw new Error('tags 必须是字符串数组')
    query.tags = raw.tags.map((tag) => requiredString(tag, 'tag')).slice(0, 20)
  }
  return query
}

/** 校验 Renderer 只提交接入身份、实例意图和 JSON 配置值。 */
function parseConfiguration(value: unknown): ConfigureLocalDeviceProvisioningInput {
  const raw = record(value, '设备接入配置')
  const configuration = record(raw.configuration, 'configuration')
  return {
    provisioningId: requiredString(raw.provisioningId, '接入 UUID'),
    instanceId: requiredString(raw.instanceId, '设备实例 ID'),
    displayName: requiredString(raw.displayName, '设备显示名称'),
    configuration: structuredClone(configuration)
  }
}

/** 校验设备包上传只携带两个已由受控系统对话框选择的本地路径。 */
function parseUploadRequest(value: unknown): DevicePackageUploadRequest {
  const raw = record(value, '设备包上传请求')
  return {
    workspacePath: requiredString(raw.workspacePath, 'Package Workspace'),
    configPath: requiredString(raw.configPath, '上传 local_config.py')
  }
}

/** 校验受控路径选择器类别，拒绝 Renderer 请求任意文件规则。 */
function parsePathSelection(value: unknown): DeviceProvisioningPathSelection {
  const raw = record(value, '设备包路径选择')
  if (
    raw.kind !== 'packageWorkspace'
    && raw.kind !== 'packageUploadConfig'
  ) {
    throw new Error('设备包路径选择类别无效')
  }
  return { kind: raw.kind }
}

/** 打开固定目录或 Python 配置文件对话框并返回用户明确选择的路径。 */
async function selectPackagePath(
  parent: BrowserWindow | null,
  selection: DeviceProvisioningPathSelection
): Promise<string | null> {
  const options: Electron.OpenDialogOptions = selection.kind === 'packageWorkspace'
    ? {
        title: '选择 Package Workspace',
        properties: ['openDirectory']
      }
    : {
        title: '选择包含 Lab AK/SK 的 local_config.py',
        filters: [{ name: 'Python', extensions: ['py'] }],
        properties: ['openFile']
      }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : result.filePaths[0] ?? null
}

/** 把 unknown 收窄为非数组 JSON object。 */
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}必须是 object`)
  }
  return value as Record<string, unknown>
}

/** 读取长度受限的必填字符串。 */
function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4_096) {
    throw new Error(`${label}无效`)
  }
  return value.trim()
}

/** 读取设备广场分页正整数并施加合理上限。 */
function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 10_000) {
    throw new Error(`${label}必须是正整数`)
  }
  return Number(value)
}
