import type {
  WorkflowActionCatalogSnapshot,
  WorkflowAuthoringGraph,
  WorkflowMaterialSourceCatalogSnapshot,
  WorkflowRuntimePort
} from '@unilab/services'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { projectMaterialSourceEditor } from '../utils/workflowMaterialSource'
import {
  errorMessage,
  isRecordValue,
  shortTemplateLabel
} from '../utils/persistentAuthoringProjection'

interface PersistentWorkflowCatalogOptions {
  runtime: WorkflowRuntimePort
  graph: WorkflowAuthoringGraph | null
  setError: (message: string | null) => void
}

/**
 * 集中维护工作流（Workflow）动作目录与物料来源（MaterialSource）目录。
 *
 * @param options 运行端口、当前候选图和界面错误写入器。
 * @returns 目录快照、加载状态、刷新命令与物料来源权威门禁。
 */
export function usePersistentWorkflowCatalogs({
  runtime,
  graph,
  setError
}: PersistentWorkflowCatalogOptions) {
  const [actionCatalog, setActionCatalog] =
    useState<WorkflowActionCatalogSnapshot | null>(null)
  const [materialSourceCatalog, setMaterialSourceCatalog] =
    useState<WorkflowMaterialSourceCatalogSnapshot | null>(null)
  const [materialSourceCatalogLoading, setMaterialSourceCatalogLoading] =
    useState(true)
  const [materialSourceCatalogError, setMaterialSourceCatalogError] =
    useState<string | null>(null)

  useEffect(() => {
    let active = true
    setActionCatalog(null)
    void runtime.getWorkflowActionCatalog()
      .then((catalog) => {
        if (active) setActionCatalog(catalog)
      })
      .catch((catalogError) => {
        if (!active) return
        setActionCatalog(null)
        setError(errorMessage(catalogError))
      })
    return () => {
      active = false
    }
  }, [runtime, setError])

  /**
   * 重新读取物料来源（MaterialSource）目录，并保留失败关闭状态。
   *
   * @returns 目录刷新完成后的 Promise；错误通过目录状态呈现。
   */
  const refreshMaterialSourceCatalog = useCallback(async (): Promise<void> => {
    setMaterialSourceCatalogLoading(true)
    setMaterialSourceCatalogError(null)
    try {
      setMaterialSourceCatalog(
        await runtime.getWorkflowMaterialSourceCatalog()
      )
    } catch (catalogError) {
      setMaterialSourceCatalog(null)
      setMaterialSourceCatalogError(errorMessage(catalogError))
    } finally {
      setMaterialSourceCatalogLoading(false)
    }
  }, [runtime])

  /**
   * 在目录冲突后原子补读动作与物料来源（MaterialSource）目录。
   *
   * @returns 两份新目录快照；任一读取失败时抛出原始错误。
   */
  const refreshWorkflowCatalogsAfterConflict = useCallback(
    async (): Promise<{
      action: WorkflowActionCatalogSnapshot
      materialSource: WorkflowMaterialSourceCatalogSnapshot
    }> => {
      setActionCatalog(null)
      setMaterialSourceCatalog(null)
      setMaterialSourceCatalogLoading(true)
      setMaterialSourceCatalogError(null)
      try {
        const [action, materialSource] = await Promise.all([
          runtime.getWorkflowActionCatalog(),
          runtime.getWorkflowMaterialSourceCatalog()
        ])
        setActionCatalog(action)
        setMaterialSourceCatalog(materialSource)
        return { action, materialSource }
      } catch (catalogError) {
        setMaterialSourceCatalogError(errorMessage(catalogError))
        throw catalogError
      } finally {
        setMaterialSourceCatalogLoading(false)
      }
    },
    [runtime]
  )

  useEffect(() => {
    void refreshMaterialSourceCatalog()
  }, [refreshMaterialSourceCatalog])

  const effectiveMaterialSourceCatalog = useMemo(() => {
    if (!materialSourceCatalog) return null
    const templatesByUuid = new Map(
      materialSourceCatalog.resourceTemplates.map((template) => [
        template.uuid,
        template
      ])
    )
    for (const node of graph?.nodes ?? []) {
      if (node.type !== 'material_source' || !isRecordValue(node.param)) {
        continue
      }
      const templateUuid = node.param.resource_template_uuid
      if (typeof templateUuid !== 'string' || !templateUuid) continue
      templatesByUuid.set(
        templateUuid,
        templatesByUuid.get(templateUuid) ?? {
          uuid: templateUuid,
          displayName: shortTemplateLabel(templateUuid)
        }
      )
    }
    for (const template of [
      ...(actionCatalog?.actionTemplates ?? []),
      ...(actionCatalog?.workflowTemplates ?? [])
    ]) {
      for (const handle of template.handles) {
        for (const templateUuid of handle.allowedResourceTemplateUuids ?? []) {
          templatesByUuid.set(
            templateUuid,
            templatesByUuid.get(templateUuid) ?? {
              uuid: templateUuid,
              displayName: shortTemplateLabel(templateUuid)
            }
          )
        }
      }
    }
    return {
      ...materialSourceCatalog,
      resourceTemplates: [...templatesByUuid.values()]
        .sort((left, right) => left.uuid.localeCompare(right.uuid))
    }
  }, [actionCatalog, graph, materialSourceCatalog])

  const materialSourceAuthorityBlocked = useMemo(() => {
    const sourceNodes = graph?.nodes.filter(
      (node) => node.type === 'material_source'
    ) ?? []
    if (sourceNodes.length === 0) return false
    if (
      materialSourceCatalogLoading ||
      materialSourceCatalogError ||
      !effectiveMaterialSourceCatalog ||
      !graph
    ) return true
    return sourceNodes.some((node) => {
      if (typeof node.uuid !== 'string' || !node.uuid) return true
      try {
        return projectMaterialSourceEditor(
          effectiveMaterialSourceCatalog,
          graph,
          node.uuid
        ).staleReferences.length > 0
      } catch {
        return true
      }
    })
  }, [
    effectiveMaterialSourceCatalog,
    graph,
    materialSourceCatalogError,
    materialSourceCatalogLoading
  ])

  return {
    actionCatalog,
    effectiveMaterialSourceCatalog,
    materialSourceAuthorityBlocked,
    materialSourceCatalog,
    materialSourceCatalogError,
    materialSourceCatalogLoading,
    refreshMaterialSourceCatalog,
    refreshWorkflowCatalogsAfterConflict
  }
}
