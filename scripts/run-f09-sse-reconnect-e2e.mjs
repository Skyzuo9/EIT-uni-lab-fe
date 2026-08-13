/**
 * 选择 F09 持久服务器发送事件重连（SSE Reconnect）专项并复用进程清理器。
 *
 * 参数：从环境读取 OS 候选与可选证据目录。返回：继承共享包装器的真实退出码。
 * 异常：构建、预览、Playwright 或清理失败均由共享包装器报告并失败关闭。
 */
process.env.UNILAB_WORKFLOW_E2E_SPEC =
  'e2e/workflow-sse-reconnect-f09-real-os.spec.ts'
process.env.UNILAB_WORKFLOW_E2E_ARTIFACT_DIR ||=
  '../e2e-artifacts/f09-sse-reconnect'

await import('./run-f07-task-input-e2e.mjs')
