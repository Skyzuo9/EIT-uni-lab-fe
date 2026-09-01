import type { MaterialId, MaterialPlacement, Vector3Tuple as MaterialVector3Tuple } from '@unilab/material/domain'
import type { LabAttachPoint } from './schema'
import type { SceneCameraView } from './sceneCameraRequest'
import type { Vector3Tuple } from './units'

export interface MaterialSceneMove {
  materialId: MaterialId
  placement: MaterialPlacement
}

export interface MaterialSceneProjectionOptions {
  fitSceneRevision?: number
  fitSceneView?: SceneCameraView
  fitSceneFocus?: 'scene' | 'kinematics'
  showSites?: boolean
  showMaterialLabels?: boolean
  showMaterialTransfers?: boolean
  materialTransferRoutes?: readonly MaterialTransferSceneRoute[]
  spatialShadowOverlay?: PascalSpatialShadowOverlay | null
}

export interface PascalSpatialShadowBox {
  id: string
  label: string
  role: 'environment' | 'corridor' | 'robot-link' | 'tool' | 'payload'
  matrix: readonly number[]
  size: readonly [number, number, number]
}

export interface PascalSpatialShadowContact {
  id: string
  role: 'first-contact' | 'current-contact'
  label: string
  position: readonly [number, number, number]
}

export interface PascalSpatialShadowOverlay {
  sampleId: string
  registrationStatus: 'candidate-relative-layout'
  registrationQualified: false
  decision: 'unknown'
  effect: 'none'
  currentTimeS: number
  durationS: number
  segmentIndex: number
  frameIndex: number
  collisionStatus:
    | 'separated-at-sampled-frame'
    | 'broad-phase-overlap-unresolved'
    | 'proxy-mesh-contact'
  minimumClearanceM: number
  firstContactTimeS: number | null
  firstContactTargetPositionM: readonly [number, number, number] | null
  boxes: readonly PascalSpatialShadowBox[]
  trajectory: readonly (readonly [number, number, number])[]
  contacts: readonly PascalSpatialShadowContact[]
}

export interface MaterialTransferSceneEndpoint {
  ownerMaterialId: string
  /** `null` 表示路线连接仓库本体，而不是尚未分配的具体库位（Site）。 */
  siteKey: string | null
}

export interface MaterialTransferSceneRoute {
  id: string
  workflowNodeUuid: string
  label: string
  source: MaterialTransferSceneEndpoint
  target: MaterialTransferSceneEndpoint
  executorId: string
  materialRole?: string
  materialLineageKey?: string
  accent?: string
  status:
    | 'planned'
    | 'pending'
    | 'running'
    | 'canceling'
    | 'succeeded'
    | 'failed'
    | 'canceled'
    | 'attention'
  selected?: boolean
}

export interface MaterialRenderingSnapshot {
  kind: string
  materialKind: 'device' | 'resource'
  dimensionsMm: MaterialVector3Tuple
  footprintMm: readonly [number, number]
  scale: MaterialVector3Tuple
  kinematics?: {
    deviceId: string
    topologyDigest: string
    qualifiedJointNames: readonly string[]
    staleAfterSeconds: number
  }
  sceneContext?: {
    id: string
    coordinateAuthority: string
    mode: 'static-read-only'
    models: readonly {
      path: string
      format: 'gltf'
      selector: MaterialGltfSelector
      position: Vector3Tuple
      rotation: Vector3Tuple
    }[]
  }
  model: {
    path: string
    format?: string
    meshDir?: string
    macro?: string
    ossDir?: string
    version?: string
    type?: string
    color?: string
    selector?: MaterialGltfSelector
    position: Vector3Tuple
    rotation: Vector3Tuple
    attachPoints: readonly LabAttachPoint[]
    instances?: {
      path: string
      format: 'xacro' | 'urdf' | 'gltf' | 'stl' | 'fbx' | 'obj'
      color?: string
      position: Vector3Tuple
      rotation: Vector3Tuple
      items: readonly {
        id: string
        position: Vector3Tuple
        rotation: Vector3Tuple
      }[]
    }
  }
}

export interface MaterialGltfSelector {
  kind: 'gltf_subtree'
  nodeIndex: number
  nodePath: string
  rootTransform: 'preserve' | 'reset_translation' | 'identity'
  excludeNodePaths: readonly string[]
}
