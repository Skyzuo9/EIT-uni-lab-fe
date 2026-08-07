import type {
  WorkflowActionCatalogSnapshot,
  WorkflowAuthoringAggregate,
  WorkflowAuthoringGraph,
  WorkflowAuthoringTransformResult,
  WorkflowRuntimePort
} from '@unilab/services'
import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react'

import {
  catalogConflictDecision,
  isTemplateCatalogConflict,
  type AuthoringLocalSnapshot,
  type AuthoringOperationQueue
} from '../utils/persistentAuthoringSession'
import { rehydrateTypedActionGraph } from '../utils/workflowActionCatalog'

interface PersistentWorkflowTransformOptions {
  runtime: WorkflowRuntimePort
  workflowUuid: string
  aggregate: WorkflowAuthoringAggregate | null
  actionCatalog: WorkflowActionCatalogSnapshot | null
  queue: AuthoringOperationQueue
  localState: MutableRefObject<AuthoringLocalSnapshot>
  refreshWorkflowCatalogsAfterConflict: () => Promise<{
    action: WorkflowActionCatalogSnapshot
  }>
  setGraph: Dispatch<SetStateAction<WorkflowAuthoringGraph | null>>
  setCanvasDirty: Dispatch<SetStateAction<boolean>>
  setMessage: Dispatch<SetStateAction<string>>
}

/**
 * 生成并校验工作流画布对应的规范化 Python，同时恢复目录代际冲突。
 *
 * @param options 工作流权威、动作目录、串行队列与本地画布状态。
 * @returns 接受候选图并返回 OS 已校验转换结果的稳定命令。
 */
export function usePersistentWorkflowTransform({
  runtime,
  workflowUuid,
  aggregate,
  actionCatalog,
  queue,
  localState,
  refreshWorkflowCatalogsAfterConflict,
  setGraph,
  setCanvasDirty,
  setMessage
}: PersistentWorkflowTransformOptions) {
  /**
   * 将候选图转换为规范化 Python，并对图和源码执行 OS 权威校验。
   *
   * @param sourceGraph 要转换的本地候选图。
   * @param authority 转换使用的工作流修订权威；默认采用当前聚合。
   * @returns OS 完成目录恢复和双向校验后的转换结果。
   * @throws 目录无法恢复、诊断含错误或 OS 返回数据不完整时抛出错误。
   */
  const generateCanvasPython = useCallback(async (
    sourceGraph: WorkflowAuthoringGraph,
    authority: WorkflowAuthoringAggregate =
      aggregate as WorkflowAuthoringAggregate
  ): Promise<WorkflowAuthoringTransformResult> => {
    if (!authority) throw new Error('工作流编辑数据尚未就绪')
    const sourceUri = authority.draft?.source_uri
    if (!sourceUri) throw new Error('当前工作流尚未注册软件包中的 Python 草稿')

    /** 使用当前工作流修订向 OS 请求一次图到 Python 转换。 */
    const request = (graphValue: WorkflowAuthoringGraph) => queue.run(
      () => runtime.generateWorkflowAuthoringPython({
        workflow_uuid: workflowUuid,
        revision: authority.workflow_revision,
        source_uri: sourceUri,
        graph: graphValue
      })
    )
    let graphValue = sourceGraph
    let generated: WorkflowAuthoringTransformResult | null = null
    let catalogFailure: unknown = null
    try {
      generated = await request(graphValue)
    } catch (generateError) {
      if (!isTemplateCatalogConflict(generateError)) throw generateError
      catalogFailure = generateError
    }
    const diagnosticCatalogMismatch = generated?.diagnostics.some(
      (diagnostic) => diagnostic.code === 'template_catalog_mismatch' ||
        diagnostic.code === 'template_catalog_conflict'
    ) ?? false
    if (catalogFailure || diagnosticCatalogMismatch) {
      const refreshedCatalog = (
        await refreshWorkflowCatalogsAfterConflict()
      ).action
      const decision = catalogConflictDecision({
        dirty: localState.current.canvasDirty,
        localPython: localState.current.editorValue,
        localGraph: sourceGraph,
        observedFingerprint:
          authority.candidate?.template_catalog_fingerprint ??
          authority.applied_source?.template_catalog_fingerprint ??
          actionCatalog?.fingerprint ?? '',
        currentFingerprint: refreshedCatalog.fingerprint ?? ''
      })
      if (!decision) {
        if (catalogFailure) throw catalogFailure
        throw new Error('操作目录已变化，但未返回新的版本标识')
      }
      graphValue = rehydrateTypedActionGraph(
        refreshedCatalog,
        decision.retainLocalGraph
      )
      setGraph(graphValue)
      setCanvasDirty(true)
      localState.current = {
        ...localState.current,
        graph: graphValue,
        canvasDirty: true
      }
      setMessage('操作目录已更新；本地画布已按稳定 UUID 恢复')
      generated = await request(graphValue)
    }
    if (!generated) throw new Error('OS 未返回工作流转换结果')
    let blocking = generated.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'error'
    )
    if (blocking.length > 0 || !generated.normalized_python_source) {
      throw new Error(
        blocking.map((item) => `${item.code}: ${item.message}`).join('\n') ||
        'OS 未返回完整规范化 Python'
      )
    }
    if (!generated.graph) throw new Error('OS 未返回完整画布数据')
    const validated = await queue.run(
      () => runtime.validateWorkflowAuthoring({
        workflow_uuid: workflowUuid,
        revision: authority.workflow_revision,
        source_uri: sourceUri,
        graph: generated.graph as WorkflowAuthoringGraph,
        python_source: generated.normalized_python_source as string
      })
    )
    blocking = validated.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'error'
    )
    if (
      blocking.length > 0 ||
      !validated.graph ||
      !validated.normalized_python_source
    ) {
      throw new Error(
        blocking.map((item) => `${item.code}: ${item.message}`).join('\n') ||
        'OS 未通过编辑中入参与出参校验'
      )
    }
    return validated
  }, [
    actionCatalog?.fingerprint,
    aggregate,
    localState,
    queue,
    refreshWorkflowCatalogsAfterConflict,
    runtime,
    setCanvasDirty,
    setGraph,
    setMessage,
    workflowUuid
  ])

  return { generateCanvasPython }
}
