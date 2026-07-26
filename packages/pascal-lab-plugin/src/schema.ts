import { BaseNode } from '@pascal-app/core'
import { z } from 'zod'

export const Vector3Schema = z.tuple([
  z.number(),
  z.number(),
  z.number()
])

const LabModelFormatSchema = z.enum([
  'xacro',
  'urdf',
  'gltf',
  'stl',
  'fbx',
  'obj'
])

const LabModelInstancesSchema = z.object({
  path: z.string(),
  format: LabModelFormatSchema,
  color: z.string().optional(),
  position: Vector3Schema.default([0, 0, 0]),
  rotation: Vector3Schema.default([0, 0, 0]),
  items: z.array(
    z.object({
      id: z.string(),
      position: Vector3Schema,
      rotation: Vector3Schema
    })
  )
})

export const LabAttachPointSchema = z.object({
  link: z.string(),
  label: z.string().optional(),
  row: z.number().optional(),
  col: z.number().optional(),
  acceptTypes: z.array(z.string()).optional(),
  position: Vector3Schema.optional(),
  rotation: Vector3Schema.optional()
})

export const LabPlacementRefSchema = z
  .object({
    kind: z.enum(['unplaced', 'world', 'parent', 'site']),
    parentMaterialId: z.string().nullable().default(null),
    siteId: z.string().nullable().default(null),
    anchorKind: z.enum(['root', 'link']).default('root'),
    anchorLinkName: z.string().nullable().default(null)
  })
  .default({
    kind: 'world',
    parentMaterialId: null,
    siteId: null,
    anchorKind: 'root',
    anchorLinkName: null
  })

export const LabDeviceNodeSchema = BaseNode.extend({
  type: z.literal('lab-device'),
  materialNodeId: z.string(),
  displayName: z.string().default(''),
  deviceType: z.string().default('custom'),
  templateUuid: z.string().default(''),
  rosDeviceName: z.string().default(''),
  children: z.array(z.string()).default([]),
  position: Vector3Schema.default([0, 0, 0]),
  rotation: Vector3Schema.default([0, 0, 0]),
  scale: Vector3Schema.default([1, 1, 1]),
  dimensions: Vector3Schema.default([0.6, 0.5, 0.6]),
  model: z
    .object({
      path: z.string().default(''),
      format: LabModelFormatSchema.default('gltf'),
      meshDir: z.string().optional(),
      ossDir: z.string().optional(),
      version: z.string().optional(),
      type: z.string().optional(),
      color: z.string().optional(),
      position: Vector3Schema.default([0, 0, 0]),
      rotation: Vector3Schema.default([0, 0, 0]),
      attachPoints: z.array(LabAttachPointSchema).default([]),
      instances: LabModelInstancesSchema.optional()
    })
    .default({
      path: '',
      format: 'gltf',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      attachPoints: []
    }),
  attach: z
    .object({
      parentDeviceId: z.string().nullable().default(null),
      parentLinkName: z.string().nullable().default(null),
      mountPoint: z.string().nullable().default(null)
    })
    .default({
      parentDeviceId: null,
      parentLinkName: null,
      mountPoint: null
    }),
  placementRef: LabPlacementRefSchema,
  graphMeta: z.record(z.string(), z.unknown()).optional()
})

export const LabTableNodeSchema = BaseNode.extend({
  type: z.literal('lab-table'),
  materialNodeId: z.string(),
  displayName: z.string().default('工作台'),
  children: z.array(z.string()).default([]),
  position: Vector3Schema.default([0, 0, 0]),
  rotation: Vector3Schema.default([0, 0, 0]),
  dimensions: Vector3Schema.default([1.5, 0.9, 0.75]),
  placementRef: LabPlacementRefSchema,
  graphMeta: z.record(z.string(), z.unknown()).optional()
})

export type LabAttachPoint = z.infer<typeof LabAttachPointSchema>
export type LabPlacementRef = z.infer<typeof LabPlacementRefSchema>
export type LabDeviceNode = z.infer<typeof LabDeviceNodeSchema>
export type LabTableNode = z.infer<typeof LabTableNodeSchema>
export type LabSceneNode = LabDeviceNode | LabTableNode

export function isLabDeviceNode(node: unknown): node is LabDeviceNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as { type?: unknown }).type === 'lab-device'
  )
}

export function isLabTableNode(node: unknown): node is LabTableNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as { type?: unknown }).type === 'lab-table'
  )
}
