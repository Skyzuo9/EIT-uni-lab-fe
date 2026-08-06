import { CodeEditor } from '@unilab/code-editor'

import { diagnosticRange } from '../utils/persistentAuthoringSession'
import { workflowTaskControlStatusLabel, workflowTaskStatusLabel, workflowTaskVisualStatus } from '../utils/workflowTaskPresentation'
import { workflowTaskMetadata } from '../utils/workflowTaskPanelProjection'
import WorkflowDag from './WorkflowDag'
import { WorkflowDebugger } from './WorkflowDebugger'
import { WorkflowOutput } from './WorkflowOutput'
import { WorkflowButton } from './WorkflowButton'
import { MaterialSourceInspector } from './MaterialSourceInspector'
import type { PersistentWorkflowAuthoringModel } from './persistentWorkflowAuthoringModel'
import { PersistentWorkflowOverlays } from './PersistentWorkflowOverlays'
import { PersistentWorkflowToolbar } from './PersistentWorkflowToolbar'
import styles from './workflow.module.scss'

export function PersistentWorkflowAuthoringView({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  const {
    actionCatalog,
    addMaterialSourceNode,
    addPublishedWorkflowNode,
    addTypedActionNode,
    beautifyCanvasLayout,
    busy,
    candidateIo,
    codeProjection,
    completedTaskJobCount,
    connectTypedHandles,
    deleteCanvasElements,
    debugBreakpoints,
    debugExecutionScope,
    diagnostics,
    editor,
    effectiveMaterialSourceCatalog,
    error,
    graph,
    jsonProjectionEditor,
    materialSourceAuthorityBlocked,
    materialSourceCatalogError,
    materialSourceCatalogLoading,
    materialTraces,
    mode,
    nodePaletteOpen,
    outputExpanded,
    outputTab,
    policy,
    projectionKind,
    refreshMaterialSourceCatalog,
    runRuntime,
    runtime,
    runtimeBusy,
    selectCanvasNode,
    selectedActionEditor,
    selectedActionProjection,
    selectedActionTemplate,
    selectedIsMaterialSource,
    selectedJobNodeUuid,
    selectedMaterialSourceEditor,
    selectedMaterialSourceProjection,
    selectedNodeIsInternal,
    selectedNodeName,
    selectedNodeUuid,
    selectedTaskNode,
    setActionParametersOpen,
    setCodeProjection,
    setError,
    setGraph,
    setMessage,
    setNodePaletteOpen,
    setOutputExpanded,
    setOutputTab,
    setSelectedJobNodeUuid,
    setSelectedNodeName,
    setSelectedNodeNameDirty,
    setSelectedNodeUuid,
    setTraceViewerOpen,
    setWorkflowIoOpen,
    structure,
    task,
    taskControls,
    taskJobs,
    taskNodeNames,
    taskNodeStates,
    taskOutputNodes,
    taskRuntime,
    taskRuntimeEvents,
    toggleDebugBreakpoint,
    toggleDebugStartNode,
    traceRuntime,
    updateMaterialSource,
    workflowUuid,
  } = model

  return (
    <div
      className={[
        styles.workflow,
        'workflow-runtime persistent-authoring',
        'relative flex h-full w-full flex-col',
        'bg-[var(--unilab-color-canvas)] text-[var(--unilab-color-text)]'
      ].join(' ')}
    >
      <PersistentWorkflowToolbar model={model} />

      {error && (
        <div className="workflow-runtime__problem" role="alert">
          <strong>工作流编辑操作失败</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>关闭</button>
        </div>
      )}
      {taskRuntime.snapshot.error && (
        <div className="workflow-runtime__problem" role="alert">
          <strong>运行状态读取失败</strong>
          <span>
            {taskRuntime.snapshot.projectionStale
              ? `上一次一致状态已保留：${taskRuntime.snapshot.error}`
              : taskRuntime.snapshot.feedbackStale
                ? `已确认的反馈事件已保留：${taskRuntime.snapshot.error}`
                : taskRuntime.snapshot.error}
          </span>
          <WorkflowButton
            type="button"
            disabled={runtimeBusy}
            disabledReason="正在补读工作流任务状态，请稍候"
            onClick={() => runRuntime(() => taskRuntime.refresh())}
          >
            重试状态读取
          </WorkflowButton>
          <button type="button" onClick={taskRuntime.clearError}>关闭</button>
        </div>
      )}
      {diagnostics.length > 0 && (
        <section
          className="persistent-authoring__diagnostics"
          aria-label="Python 草稿诊断"
        >
          <strong>草稿诊断</strong>
          <ul>
            {diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}:${index}`}>
                <code>{diagnostic.code}</code>
                <span>{diagnostic.message}</span>
                {diagnosticRange(diagnostic) && (
                  <span>位置 {diagnosticRange(diagnostic)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <main className={[
        'persistent-authoring__workbench',
        mode === 'canvas' ? 'is-canvas-mode' : ''
      ].filter(Boolean).join(' ')}>
        <section
          className="persistent-authoring__pane persistent-authoring__code"
          aria-label="工作流代码视图"
        >
          {mode === 'code' && (
            <div className="persistent-authoring__projection-toolbar">
              <div
                className="persistent-authoring__projection-switch"
                role="group"
                aria-label="代码视图格式"
              >
                <WorkflowButton
                  type="button"
                  className={codeProjection === 'python' ? 'is-active' : ''}
                  aria-pressed={codeProjection === 'python'}
                  disabledReason="Python 草稿视图始终可用"
                  onClick={() => setCodeProjection('python')}
                >
                  Python
                </WorkflowButton>
                <WorkflowButton
                  type="button"
                  className={codeProjection === 'json' ? 'is-active' : ''}
                  aria-pressed={codeProjection === 'json'}
                  disabled={!graph}
                  disabledReason="OS 尚未返回可展示的候选工作流图"
                  onClick={() => setCodeProjection('json')}
                >
                  JSON
                </WorkflowButton>
              </div>
              <span title={codeProjection === 'python'
                ? 'Python 草稿可编辑'
                : 'JSON 是 OS 候选图的只读投影'}>
                {codeProjection === 'python'
                  ? 'Python 草稿 · 可编辑'
                  : 'OS 候选图 · 只读'}
              </span>
            </div>
          )}
          <div className="persistent-authoring__code-projections">
            <div
              hidden={mode === 'code' && codeProjection === 'json'}
              aria-hidden={mode === 'code' && codeProjection === 'json'}
            >
              <CodeEditor
                title={`${workflowUuid}.py`}
                editor={editor}
                language="Python"
              />
            </div>
            <div
              hidden={mode !== 'code' || codeProjection !== 'json'}
              aria-hidden={mode !== 'code' || codeProjection !== 'json'}
            >
              <CodeEditor
                title={`${workflowUuid}.json`}
                editor={jsonProjectionEditor}
                language="JSON · 只读"
              />
            </div>
          </div>
          <p className="persistent-authoring__authority-note">
            {mode === 'canvas'
              ? 'Python 是 OS 生成的只读投影'
              : codeProjection === 'json'
                ? 'JSON 来自 OS 候选图，仅供查看；切换不会覆盖 Python 草稿'
                : 'Python 草稿可编辑；保存时校验草稿哈希与工作流版本'}
          </p>
        </section>

        <section
          className="persistent-authoring__pane persistent-authoring__canvas"
          aria-label="工作流画布"
        >
          <header className="persistent-authoring__stage-header">
            <div>
              <strong>完整控制流 DAG</strong>
              <span>
                {structure.nodes.length} 个节点 · {structure.links.length} 条边
              </span>
            </div>
            <div className="persistent-authoring__stage-context">
              <p>
                {projectionKind === 'candidate'
                  ? mode === 'code'
                    ? '当前画布是服务器候选版本的只读预览'
                    : '画布编辑区基于候选版本；保存时由 OS 生成完整 Python'
                  : mode === 'code'
                    ? '当前显示已应用版本；暂无待应用修改'
                    : '画布编辑区基于已应用版本；暂无待应用修改'}
              </p>
              <div className="persistent-authoring__stage-tools">
                {mode === 'canvas' && (
                  <button
                    type="button"
                    className="persistent-authoring__panel-toggle"
                    aria-controls="persistent-authoring-node-palette"
                    aria-pressed={nodePaletteOpen}
                    onClick={() => setNodePaletteOpen((open) => !open)}
                  >
                    {nodePaletteOpen ? '隐藏节点库' : '显示节点库'}
                  </button>
                )}
                <WorkflowButton
                  type="button"
                  className="persistent-authoring__io-trigger"
                  disabled={!graph}
                  disabledReason="工作流图尚未加载完成"
                  title={mode === 'code'
                    ? '当前为只读预览；切换到画布模式后可配置'
                    : '配置整个工作流的输入、输出与节点参数连接'}
                  onClick={() => setWorkflowIoOpen(true)}
                >
                  <span>输入与输出</span>
                  <strong>
                    输入 {candidateIo?.input_contract.parameters.length ?? 0}
                    {' · '}输出 {candidateIo?.output_contract.outputs.length ?? 0}
                  </strong>
                </WorkflowButton>
              </div>
            </div>
          </header>
          <div className={[
            'persistent-authoring__canvas-body',
            mode === 'code' ? 'is-code-mode' : '',
            mode === 'canvas' && !nodePaletteOpen
              ? 'is-palette-closed'
              : '',
            mode === 'canvas' && selectedNodeUuid
              ? 'has-inspector'
              : ''
          ].filter(Boolean).join(' ')}>
            {graph ? (
              <>
                {mode === 'canvas' && nodePaletteOpen && (
                  <aside
                    id="persistent-authoring-node-palette"
                    className="persistent-authoring__palette"
                    aria-label="工作流节点面板"
                  >
                  <header>
                    <strong>节点</strong>
                    <span>添加到画布编辑区</span>
                  </header>
                  <section aria-label="物料来源（MaterialSource）模板">
                    <h3>物料</h3>
                    <WorkflowButton
                      type="button"
                      className="persistent-authoring__palette-source"
                      disabled={
                        busy ||
                        !policy.canvasMutationEnabled ||
                        !effectiveMaterialSourceCatalog ||
                        materialSourceAuthorityBlocked
                      }
                      disabledReason={busy
                        ? '正在处理工作流，请稍后添加物料来源'
                        : !policy.canvasMutationEnabled
                          ? '当前模式只允许查看工作流画布'
                          : materialSourceAuthorityBlocked
                            ? '物料来源目录或引用已失效，请先刷新'
                            : '物料与库位目录尚未加载完成'}
                      onClick={addMaterialSourceNode}
                    >
                      <span aria-hidden="true">▱</span>
                      <span>
                        <strong>物料来源</strong>
                        <small>OS 准入声明</small>
                      </span>
                    </WorkflowButton>
                    {materialSourceCatalogLoading && (
                      <p role="status">正在读取物料与库位目录…</p>
                    )}
                    {materialSourceCatalogError && (
                      <div className="persistent-authoring__palette-problem">
                        <p>{materialSourceCatalogError}</p>
                        <button
                          type="button"
                          onClick={() => void refreshMaterialSourceCatalog()}
                        >
                          重新读取
                        </button>
                      </div>
                    )}
                  </section>
                  <section aria-label="动作（Action）模板">
                    <h3>操作</h3>
                    <div className="persistent-authoring__palette-actions">
                      {actionCatalog?.actionTemplates.map((template) => (
                        <WorkflowButton
                          type="button"
                          key={template.uuid}
                          disabled={
                            busy ||
                            !policy.canvasMutationEnabled ||
                            !graph
                          }
                          disabledReason={busy
                            ? '正在处理工作流，请稍后添加操作节点'
                            : !policy.canvasMutationEnabled
                              ? '当前模式只允许查看工作流画布'
                              : '工作流图尚未加载完成'}
                          onClick={() => addTypedActionNode(template.uuid)}
                        >
                          <span aria-hidden="true">⌁</span>
                          <span>
                            <strong>{template.displayName}</strong>
                            <small>{template.name}</small>
                          </span>
                        </WorkflowButton>
                      ))}
                    </div>
                  </section>
                  {Boolean(actionCatalog?.workflowTemplates.length) && (
                    <section aria-label="子工作流（Workflow）模板">
                      <h3>子工作流</h3>
                      <div className="persistent-authoring__palette-actions">
                        {actionCatalog?.workflowTemplates.map((template) => (
                          <WorkflowButton
                            type="button"
                            key={template.uuid}
                            disabled={
                              busy ||
                              !policy.canvasMutationEnabled ||
                              !graph
                            }
                            disabledReason={busy
                              ? '正在处理工作流，请稍后添加子工作流'
                              : !policy.canvasMutationEnabled
                                ? '当前模式只允许查看工作流画布'
                                : '工作流图尚未加载完成'}
                            onClick={() => addPublishedWorkflowNode(template.uuid)}
                          >
                            <span aria-hidden="true">▣</span>
                            <span>
                              <strong>{template.displayName}</strong>
                              <small>{template.source.symbol}</small>
                            </span>
                          </WorkflowButton>
                        ))}
                      </div>
                    </section>
                  )}
                  </aside>
                )}
                <div className="persistent-authoring__graph-stage">
                  <WorkflowDag
                    nodes={structure.nodes}
                    links={structure.links}
                    onNodeSelect={selectCanvasNode}
                    onSetStart={toggleDebugStartNode}
                    onToggleBreakpoint={toggleDebugBreakpoint}
                    nodeStates={taskNodeStates}
                    breakpoints={debugBreakpoints}
                    startNodeId={debugExecutionScope.startNodeId}
                    beforeStartNodeIds={
                      debugExecutionScope.beforeStartNodeIds
                    }
                    canBeautify={
                      !busy &&
                      policy.canvasMutationEnabled &&
                      structure.nodes.length > 0
                    }
                    beautifyDisabledReason={busy
                      ? '正在处理工作流，请稍后美化布局'
                      : !policy.canvasMutationEnabled
                        ? '当前模式只允许查看工作流画布'
                        : '工作流图尚未加载完成'}
                    onBeautify={beautifyCanvasLayout}
                    canvasMutationEnabled={policy.canvasMutationEnabled}
                    onConnectHandles={connectTypedHandles}
                    onDeleteRequest={deleteCanvasElements}
                  />
                </div>
                {mode === 'canvas' && selectedNodeUuid && (
                  <aside
                    className="persistent-authoring__node-editor"
                    aria-label="画布节点编辑器"
                  >
                    <header className="persistent-authoring__inspector-heading">
                      <span>
                        <span>属性</span>
                        <strong>
                          {selectedIsMaterialSource ? '物料来源' : '节点属性'}
                        </strong>
                      </span>
                      <button
                        type="button"
                        aria-label="关闭属性面板"
                        title="关闭属性面板"
                        onClick={() => {
                          const nodeUuid = selectedNodeUuid
                          setSelectedNodeUuid(null)
                          setSelectedNodeName('')
                          setSelectedNodeNameDirty(false)
                          setActionParametersOpen(false)
                          requestAnimationFrame(() => {
                            document.querySelector<HTMLElement>(
                              `.react-flow__node[data-id="${nodeUuid}"]`
                            )?.focus({ preventScroll: true })
                          })
                        }}
                      >
                        ×
                      </button>
                    </header>
                    <label>
                      节点名称
                      <input
                        value={selectedNodeName}
                        disabled={
                          busy || !policy.canvasMutationEnabled ||
                          selectedNodeIsInternal
                        }
                        aria-describedby="persistent-node-name-help"
                        onChange={(event) => {
                          setSelectedNodeName(event.target.value)
                          setSelectedNodeNameDirty(true)
                          setMessage(
                            '画布缓冲已修改；保存前将生成完整 Python 差异'
                          )
                        }}
                      />
                    </label>
                      {selectedMaterialSourceEditor && (
                        <MaterialSourceInspector
                          editor={selectedMaterialSourceEditor}
                          accent={
                            materialTraces.materialSourceAccents.get(
                              selectedMaterialSourceEditor.nodeUuid
                            )
                          }
                          editable={
                            !busy && policy.canvasMutationEnabled &&
                            !materialSourceCatalogLoading &&
                            !materialSourceAuthorityBlocked
                          }
                          status={taskNodeStates[selectedNodeUuid] || 'pending'}
                          diagnostics={diagnostics.filter((diagnostic) =>
                            diagnostic.node_id === selectedNodeUuid
                          )}
                          onChange={(patch) => updateMaterialSource(
                            selectedMaterialSourceEditor,
                            patch
                          )}
                        />
                      )}
                      {selectedMaterialSourceProjection.error && (
                        <p role="alert">
                          物料来源选择读取失败：
                          {selectedMaterialSourceProjection.error}
                        </p>
                      )}
                      {selectedActionEditor && (
                        <section
                          className="persistent-authoring__action-summary"
                          aria-label="操作参数摘要"
                        >
                          <div>
                            <strong>操作参数</strong>
                            <span>
                              输入 {selectedActionEditor.fields.length}
                              {' · '}输出 {selectedActionTemplate?.handles.filter(
                                (handle) => handle.ioType === 'source'
                              ).length ?? 0}
                            </span>
                          </div>
                          <p>
                            点击下方按钮编辑输入，并查看输出端口与连接关系。
                          </p>
                          <button
                            type="button"
                            className="workflow-runtime__primary"
                            onClick={() => setActionParametersOpen(true)}
                          >
                            配置节点参数
                          </button>
                        </section>
                      )}
                      {selectedActionProjection.error && (
                        <p role="alert">
                          操作模板或端口读取失败：
                          {selectedActionProjection.error}
                        </p>
                      )}
                    <p id="persistent-node-name-help">
                      名称修改属于画布缓冲，接受完整 Python 差异后才会持久化。
                    </p>
                  </aside>
                )}
              </>
            ) : (
              <p className="persistent-authoring__empty">
                正在读取 OS 工作流编辑数据…
              </p>
            )}
          </div>
        </section>
      </main>

      <section
        className="persistent-authoring__runtime"
        aria-label="工作流任务运行控制"
      >
        <WorkflowDebugger
          debugStatus={workflowTaskVisualStatus(task)}
          runStatus={task?.status || 'draft'}
          heading="工作流运行"
          subtitle="OS 任务控制"
          statusText={workflowTaskControlStatusLabel(task)}
          runStatusText={workflowTaskStatusLabel(task?.status)}
          runStatusPrefix="任务"
          metadata={workflowTaskMetadata(
            task,
            taskRuntime.snapshot.lastCommand,
            taskRuntime.snapshot
          )}
          actionGroupLabel="任务执行控制"
          dangerGroupLabel="任务取消控制"
          commandDataAttribute="runtime"
          controls={taskControls}
          traceAvailable={Boolean(traceRuntime)}
          onTraceOpen={() => setTraceViewerOpen(true)}
          onCommand={(command) => runRuntime(
            () => taskRuntime.command(command)
          )}
        />

        <WorkflowOutput
          expanded={outputExpanded}
          activeTab={outputTab}
          completedNodeCount={completedTaskJobCount}
          expectedNodeCount={taskJobs.length}
          nodes={taskOutputNodes}
          nodeNames={taskNodeNames}
          events={taskRuntimeEvents}
          error={taskRuntime.snapshot.error}
          selectedNode={selectedTaskNode}
          selectedNodeId={selectedJobNodeUuid}
          pausedBeforeNodeId={null}
          title="运行输出"
          countLabel="个节点任务已结束"
          nodesTabLabel="节点任务状态"
          onExpandedChange={setOutputExpanded}
          onTabChange={setOutputTab}
          onNodeSelect={setSelectedJobNodeUuid}
          onClearError={taskRuntime.clearError}
        />
      </section>

      <PersistentWorkflowOverlays model={model} />
    </div>
  )
}
