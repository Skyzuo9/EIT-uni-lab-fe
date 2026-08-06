/**
 * 选择 F08 单节点工作流任务（WorkflowTask）专项，并复用 F07 的进程组清理器。
 *
 * 参数：从环境读取 OS 候选与可选证据目录。返回：继承包装器的真实退出码。
 * 异常：构建、预览、Playwright 或清理失败均由共享包装器报告并失败关闭。
 */
process.env.UNILAB_WORKFLOW_E2E_SPEC =
  'e2e/workflow-single-node-f08-real-os.spec.ts'
process.env.UNILAB_WORKFLOW_E2E_ARTIFACT_DIR ||=
  '../e2e-artifacts/f08-single-node'

await import('./run-f07-task-input-e2e.mjs')
