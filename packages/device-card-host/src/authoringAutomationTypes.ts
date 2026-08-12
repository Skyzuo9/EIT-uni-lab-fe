import { createDeviceCardAuthoringContext } from '@unilab/device-card-authoring-kit'
import type {
  DeviceCardAuthoringProfile,
  DeviceCardAuthoringSession,
  DeviceCardAuthoringSessionStatus,
  DeviceCardAuthoringTarget,
  DeviceCardAuthoringTargetSummary,
  DeviceCardInstallApproval,
  ExportedDeviceCardKit,
  ExportedDeviceCardSource,
  InstalledDeviceCard
} from '@unilab/device-card-sdk'
import type { DeviceCardWorkspace } from './workspace'

export type DeviceCardAuthoringPrincipal = 'renderer' | 'agent'

export interface DeviceCardAuthoringTargetPort {
  listTargets(): Promise<DeviceCardAuthoringTarget[]>
}

export interface DeviceCardAuthoringApprovalPort {
  authorizeDirectory(input: {
    operation: 'bootstrap' | 'attach' | 'export-kit' | 'export-source'
    path: string
    principal: DeviceCardAuthoringPrincipal
    target: DeviceCardAuthoringTarget
    replacesProjectDir?: string
  }): Promise<boolean>
  approveInstall(input: {
    approvalId: string
    principal: DeviceCardAuthoringPrincipal
    session: DeviceCardAuthoringSession
    sourceHash: string
    cardId: string
    cardVersion: string
    permissions: {
      state: string[]
      actions: string[]
      media: string[]
    }
  }): Promise<boolean>
}

export interface PrepareDeviceCardAuthoringInput {
  mode: 'bootstrap' | 'attach'
  deviceId: string
  profile?: DeviceCardAuthoringProfile
  projectDir: string
  principal: DeviceCardAuthoringPrincipal
  replace?: boolean
}

export interface GetDeviceCardAuthoringStatusInput {
  locator: string
  afterRevision?: number
  timeoutMs?: number
}

export interface ExportDeviceCardKitInput {
  deviceId: string
  profile: DeviceCardAuthoringProfile
  destination: string
  principal: DeviceCardAuthoringPrincipal
}

export interface DeviceCardAuthoringAutomation {
  listTargets(): Promise<DeviceCardAuthoringTargetSummary[]>
  prepare(
    input: PrepareDeviceCardAuthoringInput
  ): Promise<DeviceCardAuthoringSessionStatus>
  getStatus(
    input: GetDeviceCardAuthoringStatusInput
  ): Promise<DeviceCardAuthoringSessionStatus>
  recheck(locator: string): Promise<DeviceCardAuthoringSessionStatus>
  exportKit(input: ExportDeviceCardKitInput): Promise<ExportedDeviceCardKit>
  exportSource(
    locator: string,
    destination: string,
    principal: DeviceCardAuthoringPrincipal
  ): Promise<ExportedDeviceCardSource>
  requestInstall(
    locator: string,
    principal: DeviceCardAuthoringPrincipal
  ): Promise<DeviceCardInstallApproval>
  close(locator: string): Promise<void>
}

export interface LocalDeviceCardAuthoringAutomationOptions {
  targets: DeviceCardAuthoringTargetPort
  approvals: DeviceCardAuthoringApprovalPort
  workRoot: string
  storeRoot: string
  installArchive(input: {
    archivePath: string
    storeRoot: string
    authoringContext: ReturnType<typeof createDeviceCardAuthoringContext>
    contextAuthority: 'host'
  }): Promise<InstalledDeviceCard>
  onStatus?: (status: DeviceCardAuthoringSessionStatus | null) => void
}
export interface ActiveSession {
  session: DeviceCardAuthoringSession
  workspace: DeviceCardWorkspace
  target: DeviceCardAuthoringTarget
  context: ReturnType<typeof createDeviceCardAuthoringContext>
}
