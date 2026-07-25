export interface MaterialVector3 {
  x?: number
  y?: number
  z?: number
}

export interface MaterialSize {
  width?: number
  height?: number
  depth?: number
}

export interface MaterialSite {
  parent_link?: string
  label?: string
  content_type?: readonly (string | number)[]
  position?: MaterialVector3
  rotation?: MaterialVector3
}

export interface MaterialModel {
  path?: string
  mesh?: string
  format?: string
  model_type?: string
  oss_dir?: string
  version?: string
  type?: string
  attach_points?: readonly {
    link: string
    label?: string
    row?: number
    col?: number
    accept_types?: readonly string[]
    position?: readonly [number, number, number]
    rotation?: readonly [number, number, number]
  }[]
}

export interface MaterialPose {
  position?: MaterialVector3
  position_3d?: MaterialVector3
  rotation?: MaterialVector3
  scale?: MaterialVector3
  size?: MaterialSize
  parent_link?: string
  mount_point?: string
  extra?: {
    parent_link?: string
    mount_point?: string
    [key: string]: unknown
  }
}

/**
 * Stable subset of the Cloud MaterialNode contract consumed by 3D. Additional
 * graph fields are kept verbatim in `data`/the source object when round-tripped.
 */
export interface LabMaterialNode {
  uuid: string
  name?: string
  display_name?: string
  type?: string
  res_template_uuid?: string
  parent_uuid?: string | null
  child_nodes_uuid?: readonly string[]
  model?: MaterialModel
  pose?: MaterialPose
  init_param_data?: {
    sites?: readonly MaterialSite[]
  }
  data?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface MaterialNodeUpdate {
  uuid: string
  changes: Partial<LabMaterialNode>
}
