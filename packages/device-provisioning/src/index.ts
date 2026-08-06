/** 候选本地设备接入（LocalDeviceProvisioning）的跨进程稳定合同。 */

export type LocalDeviceProvisioningStatus =
  | 'requested'
  | 'resolving'
  | 'downloading'
  | 'package_cached'
  | 'configuration_required'
  | 'graph_staged'
  | 'restart_required'
  | 'activating'
  | 'driver_ready'
  | 'ready'
  | 'failed'
  | 'canceled'
  | 'removing'
  | 'removed'

export interface LocalDeviceProvisioningDiagnostic {
  stage: LocalDeviceProvisioningStatus
  message: string
  retryable: boolean
  recordedAt: string
}

export interface LocalDeviceProvisioning {
  schemaVersion: 'local-device-provisioning/v1'
  provisioningId: string
  templateUuid: string
  cloudDeviceName: string
  cloudDisplayName: string
  packageName: string
  packageVersion: string
  artifactDigest: string
  catalogDigest: string
  definitionFqid: string
  cacheKey: string
  configurationSchema: Record<string, unknown>
  configuration: Record<string, unknown> | null
  instanceId: string
  instanceUuid: string
  displayName: string
  graphPath: string
  graphFingerprint: string
  backupPath: string
  actionCount: number
  status: LocalDeviceProvisioningStatus
  diagnostic: LocalDeviceProvisioningDiagnostic | null
  createdAt: string
  updatedAt: string
}

export interface StartLocalDeviceProvisioningInput {
  templateUuid: string
}

export interface ConfigureLocalDeviceProvisioningInput {
  provisioningId: string
  instanceId: string
  displayName: string
  configuration: Record<string, unknown>
}

export interface RetryLocalDeviceProvisioningInput {
  provisioningId: string
}

export interface RemoveLocalDeviceProvisioningInput {
  provisioningId: string
}

export interface RestoreLocalDeviceProvisioningInput {
  provisioningId: string
}

export interface DevicePackageUploadRequest {
  workspacePath: string
  configPath: string
}

export interface DevicePackageDownloadSummary {
  status: 'package_cached'
  cacheKey: string
  cacheHit: boolean
  distribution: string
  version: string
  namespace: string
  definitionFqid: string
  catalogDigest: string
  configurationSchema: Record<string, unknown>
}

export interface DevicePackageInspection {
  distribution: string
  version: string
  namespace: string
  catalogDigest: string
  devices: Array<{
    fqid: string
    displayName: string
  }>
  resources: Array<{
    fqid: string
    displayName: string
  }>
  workflows: Array<{
    fqid: string
    displayName: string
  }>
}

export interface DevicePackageUploadResult {
  status: 'published'
  distribution: string
  version: string
  artifactDigest: string
  visibleInSquare: boolean
}

export interface DeviceProvisioningPathSelection {
  kind: 'packageWorkspace' | 'packageUploadConfig'
}
