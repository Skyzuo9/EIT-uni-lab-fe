export type MaterialId = string
export type MaterialTemplateId = string
export type SiteId = string
export type MaterialRevision = number

export type Vector3Tuple = readonly [number, number, number]

export interface LabPose {
  positionMm: Vector3Tuple
  rotationDegXYZ: Vector3Tuple
}

export type MaterialAnchor =
  | { kind: 'root' }
  | { kind: 'link'; linkName: string }

export type MaterialPlacement =
  | { kind: 'unplaced' }
  | { kind: 'world'; pose: LabPose }
  | {
      kind: 'parent'
      parentId: MaterialId
      anchor: MaterialAnchor
      localPose: LabPose
    }
  | {
      kind: 'site'
      parentId: MaterialId
      siteId: SiteId
      offsetPose: LabPose
    }

export interface Material {
  id: MaterialId
  sourceTemplateId: MaterialTemplateId
  code: string
  name: string
  description?: string
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MaterialSite {
  id: SiteId
  ownerMaterialId: MaterialId
  key: string
  name: string
  anchor: MaterialAnchor
  poseInAnchor: LabPose
  sizeMm: Vector3Tuple
  capacity: number
  allowedTemplateIds: readonly MaterialTemplateId[]
  occupiedMaterialIds: readonly MaterialId[]
}

export interface MaterialAggregate {
  material: Material
  placement: MaterialPlacement
  sites: readonly MaterialSite[]
  revision: MaterialRevision
}

export type MaterialScope =
  | { kind: 'singleton' }
  | { kind: 'laboratory'; laboratoryId: string }

export type EdgeProvisioning =
  | { kind: 'none' }
  | { kind: 'resource-tree' }
  | { kind: 'dynamic-device' }

export type EdgeSyncState =
  | 'not-required'
  | 'pending'
  | 'synced'
  | 'failed'

export interface MaterialEdgeOperation {
  operationId: string
  materialId: MaterialId
  operation: 'provision' | 'undo-create'
  provisioning: EdgeProvisioning
  state: 'pending' | 'edge-completed' | 'committed' | 'failed'
  error?: {
    code: string
    message: string
  }
}

export interface CreateMaterialInput {
  templateId: MaterialTemplateId
  name?: string
  code?: string
  config?: Record<string, unknown>
}

export interface CreateMaterialResult {
  aggregate: MaterialAggregate
  creationOperationId: string
  edgeSyncState: EdgeSyncState
}

export interface UpdateMaterialConfigCommand {
  materialId: MaterialId
  expectedRevision: MaterialRevision
  patch: {
    name?: string
    code?: string
    description?: string
    config?: Record<string, unknown>
  }
}

export interface MoveMaterialCommand {
  materialId: MaterialId
  expectedRevision: MaterialRevision
  placement: MaterialPlacement
}

export interface AttachMaterialCommand {
  parentId: MaterialId
  childId: MaterialId
  siteId?: SiteId
  expectedParentRevision: MaterialRevision
  expectedChildRevision: MaterialRevision
}

export interface DetachMaterialCommand {
  parentId: MaterialId
  childId: MaterialId
  expectedParentRevision: MaterialRevision
  expectedChildRevision: MaterialRevision
}

export interface UpdateMaterialSiteCommand {
  materialId: MaterialId
  siteId: SiteId
  expectedRevision: MaterialRevision
  patch: {
    name?: string
    anchor?: MaterialAnchor
    poseInAnchor?: LabPose
    sizeMm?: Vector3Tuple
    capacity?: number
    allowedTemplateIds?: readonly MaterialTemplateId[]
  }
}

export interface UndoCreateMaterialCommand {
  materialId: MaterialId
  creationOperationId: string
  expectedRevision: MaterialRevision
  idempotencyKey: string
}

export interface MaterialMutationResult {
  aggregates: readonly MaterialAggregate[]
}

export interface MaterialGraphPort {
  getGraph(scope: MaterialScope): Promise<readonly MaterialAggregate[]>
  createMaterial(
    scope: MaterialScope,
    input: CreateMaterialInput
  ): Promise<CreateMaterialResult>
  undoCreate(command: UndoCreateMaterialCommand): Promise<void>
  updateConfig(
    command: UpdateMaterialConfigCommand
  ): Promise<MaterialAggregate>
  move(command: MoveMaterialCommand): Promise<MaterialAggregate>
  attach(command: AttachMaterialCommand): Promise<MaterialMutationResult>
  detach(command: DetachMaterialCommand): Promise<MaterialMutationResult>
  updateSite(
    command: UpdateMaterialSiteCommand
  ): Promise<MaterialAggregate>
  getEdgeOperations(
    scope: MaterialScope,
    operationIds?: readonly string[]
  ): Promise<readonly MaterialEdgeOperation[]>
}

export type MaterialCapability =
  | 'material.readGraph'
  | 'material.create'
  | 'material.updateConfig'
  | 'material.updateSite'
  | 'material.move'
  | 'material.attach'
  | 'material.detach'
  | 'material.persistentUndo'
  | 'edge.undoCreate'

export interface MaterialStoreDependencies {
  scope: MaterialScope
  graph: MaterialGraphPort
  requireCapability: (capability: MaterialCapability) => void
  createIdempotencyKey?: () => string
}

export interface MaterialGraphIndex {
  childrenByParentId: Readonly<Record<MaterialId, readonly MaterialId[]>>
  siteOwnerById: Readonly<Record<SiteId, MaterialId>>
}

export interface MaterialAuthoringAggregate {
  material: Material
  placement: MaterialPlacement
  sites: readonly MaterialSite[]
}

export interface MaterialAuthoringSnapshot {
  aggregatesById: Readonly<Record<MaterialId, MaterialAuthoringAggregate>>
}
