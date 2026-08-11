import {
  parsePanelLayoutDocument,
  type CanonicalPanelId,
  type PanelLayoutDocument,
  type PanelLayoutNode
} from '@unilab/workbench-layout'

export type LabPanelPreset = 'lab' | 'scene' | 'workflow'

export interface LabPanelRegionIds {
  /** 物料（Material）整块区域的稳定布局节点身份。 */
  materialNodeId: string
  /** 承载物料区域布局操作的可见叶子分组身份。 */
  materialActionGroupId: string
  /** 工作流（Workflow）整块区域的稳定布局节点身份。 */
  workflowNodeId: string
  /** 承载工作流区域布局操作的可见叶子分组身份。 */
  workflowActionGroupId: string
}

const PRESET_PANEL_TYPES: Readonly<
  Record<LabPanelPreset, ReadonlySet<CanonicalPanelId>>
> = {
  lab: new Set([
    'layout-unified',
    'layout-2d',
    'layout-3d',
    'workflow-dag',
    'workflow-steps',
    'workflow-dag-picker'
  ]),
  scene: new Set(['layout-3d']),
  workflow: new Set([
    'workflow-dag',
    'workflow-steps',
    'workflow-dag-picker'
  ])
}

export function parsePanelPresetDocument(
  preset: LabPanelPreset,
  input: unknown
): PanelLayoutDocument {
  const document = parsePanelLayoutDocument(input)
  const unsupportedPanelType = findUnsupportedPanelType(
    document.layout,
    PRESET_PANEL_TYPES[preset]
  )

  if (unsupportedPanelType) {
    throw new Error(
      `The ${preset} preset does not allow panel type "${unsupportedPanelType}".`
    )
  }

  return document
}

function findUnsupportedPanelType(
  node: PanelLayoutNode,
  allowedPanelTypes: ReadonlySet<CanonicalPanelId>
): string | null {
  if (node.type === 'group') {
    return (
      node.panels.find(
        (panel) =>
          !allowedPanelTypes.has(panel.panelType as CanonicalPanelId)
      )?.panelType ?? null
    )
  }

  for (const child of node.children) {
    const unsupportedPanelType = findUnsupportedPanelType(
      child,
      allowedPanelTypes
    )
    if (unsupportedPanelType) {
      return unsupportedPanelType
    }
  }

  return null
}

/**
 * 找出实验室物料（Material）与工作流（Workflow）的两个独立顶层区域。
 *
 * @param document 已通过面板布局 Schema 校验的布局文档。
 * @returns 两个顶层区域身份及其叶子标题栏身份；混合标签或非双栏布局返回 null。
 */
export function findLabPanelRegionIds(
  document: PanelLayoutDocument
): LabPanelRegionIds | null {
  const root = document.layout
  if (root.type !== 'split') return null

  const materialNode = root.children.find((node) => {
    const kinds = panelKinds(node)
    return kinds.has('material') && !kinds.has('workflow')
  })
  const workflowNode = root.children.find((node) => {
    const kinds = panelKinds(node)
    return kinds.has('workflow') && !kinds.has('material')
  })

  if (!materialNode || !workflowNode || materialNode.id === workflowNode.id) {
    return null
  }
  const materialActionGroupId = findActionGroupId(materialNode, 'material')
  const workflowActionGroupId = findActionGroupId(workflowNode, 'workflow')
  if (!materialActionGroupId || !workflowActionGroupId) return null
  return {
    materialNodeId: materialNode.id,
    materialActionGroupId,
    workflowNodeId: workflowNode.id,
    workflowActionGroupId
  }
}

/**
 * 在一个纯业务区域内寻找可承载布局操作的首个叶子标题栏。
 *
 * @param node 物料（Material）或工作流（Workflow）的顶层区域节点。
 * @param kind 该区域应承载的业务面板类型。
 * @returns 深度优先找到的面板分组身份；区域无匹配分组时返回 null。
 */
function findActionGroupId(
  node: PanelLayoutNode,
  kind: 'material' | 'workflow'
): string | null {
  if (node.type === 'group') {
    return panelKinds(node).has(kind) ? node.id : null
  }
  for (const child of node.children) {
    const groupId = findActionGroupId(child, kind)
    if (groupId) return groupId
  }
  return null
}

/**
 * 汇总一个布局子树承载的实验室业务区域类型。
 *
 * @param node 待检查的面板组或分栏节点。
 * @returns 物料（Material）与工作流（Workflow）区域类型集合。
 */
function panelKinds(
  node: PanelLayoutNode
): ReadonlySet<'material' | 'workflow'> {
  const kinds = new Set<'material' | 'workflow'>()
  if (node.type === 'group') {
    for (const panel of node.panels) {
      if (panel.panelType.startsWith('layout-')) kinds.add('material')
      if (panel.panelType.startsWith('workflow-')) kinds.add('workflow')
    }
    return kinds
  }

  for (const child of node.children) {
    for (const kind of panelKinds(child)) kinds.add(kind)
  }
  return kinds
}

/**
 * 按整块工作流（Workflow）面板的折叠状态计算需要视觉隐藏的布局节点。
 *
 * @param regions 可安全独立隐藏的物料与工作流区域身份。
 * @param workflowVisible 是否展开整个工作流面板。
 * @returns 交给面板布局渲染器的隐藏节点身份。
 */
export function hiddenLabPanelNodeIds(
  regions: LabPanelRegionIds | null,
  workflowVisible: boolean
): readonly string[] {
  if (!regions) return []
  return workflowVisible ? [] : [regions.workflowNodeId]
}

export function panelPresetDocument(
  preset: LabPanelPreset
): PanelLayoutDocument {
  if (preset === 'lab') {
    return parsePanelLayoutDocument({
      version: 1,
      layout: {
        id: 'default-panel-layout-root',
        type: 'split',
        direction: 'horizontal',
        sizes: [55, 45],
        children: [
          {
            id: 'default-layout-group',
            type: 'group',
            panels: [
              {
                id: 'layout-unified-primary',
                panelType: 'layout-unified',
                title: '实验室视图'
              }
            ],
            activePanelId: 'layout-unified-primary'
          },
          {
            id: 'default-workflow-group',
            type: 'group',
            panels: [
              {
                id: 'workflow-dag-picker-primary',
                panelType: 'workflow-dag-picker',
                title: '工作流调试'
              }
            ],
            activePanelId: 'workflow-dag-picker-primary'
          }
        ]
      }
    })
  }

  const panelType =
    preset === 'scene' ? 'layout-3d' : 'workflow-dag'
  return parsePanelLayoutDocument({
    version: 1,
    layout: {
      id: `${preset}-workspace-group`,
      type: 'group',
      panels: [
        {
          id: `${panelType}-primary`,
          panelType,
          title: preset === 'workflow' ? '工作流' : '三维场景'
        }
      ],
      activePanelId: `${panelType}-primary`
    }
  })
}
