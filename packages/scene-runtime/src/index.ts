import { createStore } from 'zustand/vanilla'

export type JointStateSource = 'mock' | 'live'

export interface JointStateFrame {
  materialId: string
  deviceId: string
  topologyDigest: string
  bootId: string
  sequence: number
  acceptedRef: string
  observedAt: number
  staleAfterSeconds: number
  stale: boolean
  jointStates: Readonly<Record<string, number>>
  source: JointStateSource
}

export type JointStateFrameInput = Omit<JointStateFrame, 'jointStates'> & {
  jointStates: Readonly<Record<string, number>>
}

interface SceneRuntimeState {
  scopeId: string | null
  jointFrames: Readonly<Record<string, JointStateFrame>>
}

export const sceneRuntimeStore = createStore<SceneRuntimeState>(() => ({
  scopeId: null,
  jointFrames: {}
}))

/** 切换调度权威或端点时清除全部命令式关节帧，禁止跨环境串姿态。 */
export function activateSceneRuntimeScope(scopeId: string): void {
  const normalized = scopeId.trim()
  if (!normalized) throw new Error('场景运行时（SceneRuntime）scopeId 不能为空。')
  if (sceneRuntimeStore.getState().scopeId === normalized) return
  sceneRuntimeStore.setState({ scopeId: normalized, jointFrames: {} })
}

/** 发布一台物料设备的完整 latest-value-wins 关节状态（JointState）快照。 */
export function publishJointStateFrame(
  input: JointStateFrameInput
): JointStateFrame {
  const frame = normalizeFrame(input)
  let accepted = frame
  sceneRuntimeStore.setState((state) => {
    const current = state.jointFrames[frame.materialId]
    if (current && !shouldReplace(current, frame)) {
      accepted = current
      return state
    }
    return {
      ...state,
      jointFrames: { ...state.jointFrames, [frame.materialId]: frame }
    }
  })
  return accepted
}

/**
 * 用 SSE 初始快照原子替换场景 latest；快照中缺失的机械臂必须清除，避免幽灵姿态。
 */
export function replaceJointStateSnapshot(
  inputs: readonly JointStateFrameInput[]
): void {
  const frames = Object.fromEntries(inputs.map(input => {
    const frame = normalizeFrame(input)
    return [frame.materialId, frame]
  }))
  if (Object.keys(frames).length !== inputs.length) {
    throw new Error('关节状态（JointState）快照包含重复物料身份。')
  }
  sceneRuntimeStore.setState(state => ({ ...state, jointFrames: frames }))
}

export function getJointStateFrame(materialId: string): JointStateFrame | null {
  return sceneRuntimeStore.getState().jointFrames[materialId] ?? null
}

export function subscribeJointStateFrame(
  materialId: string,
  listener: () => void
): () => void {
  let previous = getJointStateFrame(materialId)
  return sceneRuntimeStore.subscribe(state => {
    const next = state.jointFrames[materialId] ?? null
    if (next === previous) return
    previous = next
    listener()
  })
}

export function clearJointStateFrame(materialId: string): void {
  sceneRuntimeStore.setState(state => {
    if (!(materialId in state.jointFrames)) return state
    const next = { ...state.jointFrames }
    delete next[materialId]
    return { ...state, jointFrames: next }
  })
}

export function sceneRuntimeScopeId(profileId: string, endpoint: string): string {
  return `${profileId.trim()}|${endpoint.trim().replace(/\/+$/u, '')}`
}

function normalizeFrame(input: JointStateFrameInput): JointStateFrame {
  const materialId = boundedText(input.materialId, 'materialId')
  const deviceId = boundedText(input.deviceId, 'deviceId')
  const bootId = boundedText(input.bootId, 'bootId')
  const acceptedRef = boundedText(input.acceptedRef, 'acceptedRef')
  if (!/^[0-9a-f]{64}$/u.test(input.topologyDigest)) {
    throw new Error('关节状态（JointState）topologyDigest 必须是 SHA-256。')
  }
  if (!Number.isSafeInteger(input.sequence) || input.sequence <= 0) {
    throw new Error('关节状态（JointState）sequence 无效。')
  }
  if (!Number.isFinite(input.observedAt) || input.observedAt < 0) {
    throw new Error('关节状态（JointState）observedAt 无效。')
  }
  if (!Number.isFinite(input.staleAfterSeconds) || input.staleAfterSeconds <= 0) {
    throw new Error('关节状态（JointState）staleAfterSeconds 无效。')
  }
  if (input.source !== 'mock' && input.source !== 'live') {
    throw new Error('关节状态（JointState）source 无效。')
  }
  const entries = Object.entries(input.jointStates)
  if (entries.length === 0 || entries.length > 512) {
    throw new Error('关节状态（JointState）必须包含 1 到 512 个关节。')
  }
  const jointStates: Record<string, number> = {}
  for (const [rawName, value] of entries) {
    const name = rawName.trim()
    if (!name || name.length > 255 || !Number.isFinite(value)) {
      throw new Error('关节状态（JointState）包含无效名称或数值。')
    }
    jointStates[name] = value
  }
  return Object.freeze({
    materialId,
    deviceId,
    topologyDigest: input.topologyDigest,
    bootId,
    sequence: input.sequence,
    acceptedRef,
    observedAt: input.observedAt,
    staleAfterSeconds: input.staleAfterSeconds,
    stale: input.stale,
    jointStates: Object.freeze(jointStates),
    source: input.source
  })
}

function shouldReplace(current: JointStateFrame, next: JointStateFrame): boolean {
  if (current.acceptedRef === next.acceptedRef) {
    return !current.stale && next.stale
  }
  if (current.bootId === next.bootId) return next.sequence > current.sequence
  return next.observedAt > current.observedAt
}

function boundedText(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > 200) {
    throw new Error(`关节状态（JointState）${field} 无效。`)
  }
  return normalized
}
