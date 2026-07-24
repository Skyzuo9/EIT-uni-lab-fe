/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 定义调试客户端三大方向(设备/物料/工作流)与后端交互的核心数据模型
 * Context: 对接 Uni-Lab-OS localhost:8002 REST/WS,支持离线/在线双模
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */

// 三大工作方向
export type WorkbenchSection = 'device' | 'material' | 'workflow'

// 运行模式:离线(本地示例)/ 在线(连接运行中的 Uni-Lab-OS)
export type AppMode = 'offline' | 'online'

// 后端连接状态
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// ============ 设备 ============

// 在线设备条目(GET /api/v1/online-devices)
export interface OnlineDevice {
  deviceKey: string
  namespace: string
  machineName: string
  uuid: string
  nodeName: string
}

// 设备可用动作(GET /api/v1/devices/{id}/actions)
export interface DeviceAction {
  actionName: string
  typeName: string
  isBusy: boolean
  currentJobId: string | null
  // 动作参数的 JSON Schema(GET .../schema),用于渲染表单
  schema: Record<string, unknown> | null
}

// 设备运行时状态(/ws/device_status 推送)
export interface DeviceStatus {
  deviceId: string
  status: Record<string, unknown>
  timestamp: number
}

// ============ 物料 ============

// 物料/资源实例(GET /api/v1/resources,对应 ResourceDict)
export interface ResourceNode {
  id: string
  uuid: string
  name: string
  type: string
  className: string
  parent: string | null
  config: Record<string, unknown>
  data: Record<string, unknown>
  position: { x: number; y: number; z: number }
  children: ResourceNode[]
}

// ============ 工作流 ============

// 任务提交(POST /api/v1/job/add)
export interface JobRequest {
  deviceId: string
  action: string
  actionArgs: Record<string, unknown>
}

// 任务状态码(与后端 http_api 对齐)
export type JobStatusCode = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface JobResult {
  jobId: string
  status: JobStatusCode
  result: Record<string, unknown> | null
}

// 统一响应封装 { code, data, message }
export interface ApiEnvelope<T> {
  code: number
  data: T
  message: string
}
