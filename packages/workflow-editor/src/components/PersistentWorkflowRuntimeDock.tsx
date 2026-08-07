import {
  workflowTaskControlStatusLabel,
  workflowTaskStatusLabel,
  workflowTaskVisualStatus
} from '../utils/workflowTaskPresentation'
import { workflowTaskMetadata } from '../utils/workflowTaskPanelProjection'
import { WorkflowDebugger } from './WorkflowDebugger'
import { WorkflowOutput } from './WorkflowOutput'
import type { PersistentWorkflowAuthoringModel } from './persistentWorkflowAuthoringModel'

/**
 * 渲染工作流任务（WorkflowTask）的控制台与运行输出。
 *
 * @param props 工作流创作视图模型。
 * @returns 调试控制条和节点、事件、异常输出面板。
 */
export function PersistentWorkflowRuntimeDock({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  const {
    completedTaskJobCount,
    outputExpanded,
    outputTab,
    runRuntime,
    selectedJobNodeUuid,
    selectedTaskNode,
    setOutputExpanded,
    setOutputTab,
    setSelectedJobNodeUuid,
    setTraceViewerOpen,
    task,
    taskControls,
    taskJobs,
    taskNodeNames,
    taskOutputNodes,
    taskRuntime,
    taskRuntimeEvents,
    traceRuntime
  } = model

  return (
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
  )
}
