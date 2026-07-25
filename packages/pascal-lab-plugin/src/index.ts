export {
  PascalLabWorkbench,
  type PascalLabWorkbenchProps
} from './PascalLabWorkbench'
export { DEMO_LAB_MATERIAL_NODES } from './demo'
export type {
  LabMaterialNode,
  MaterialModel,
  MaterialNodeUpdate,
  MaterialPose,
  MaterialSite,
  MaterialSize,
  MaterialVector3
} from './material'
export {
  inferModelFormat,
  materialNodesToSceneGraph,
  sceneGraphToMaterialUpdates
} from './materialSceneBridge'
export {
  configureLabModelRuntime,
  disposeLabModel,
  loadLabDeviceModel,
  type LabModelRuntime
} from './modelRuntime'
export {
  calculateHorizontalSnapDistance,
  calculateLocalMountPose,
  findLinkObject,
  findNearestHorizontalMountMatch,
  type FindNearestHorizontalMountMatchOptions,
  type HorizontalMountMatch,
  type LocalMountPose
} from './mounting'
export { preparePascalLabPlugin } from './plugin'
export {
  LabAttachPointSchema,
  LabDeviceNodeSchema,
  LabTableNodeSchema,
  isLabDeviceNode,
  isLabTableNode,
  type LabAttachPoint,
  type LabDeviceNode,
  type LabSceneNode,
  type LabTableNode
} from './schema'
export {
  METERS_TO_MILLIMETERS,
  MILLIMETERS_TO_METERS,
  mountedPoseToPascal,
  pascalPoseToMounted,
  pascalPoseToTopLevel,
  positionMmToThree,
  positionThreeToMm,
  topLevelPoseToPascal,
  type Vector3Tuple
} from './units'
