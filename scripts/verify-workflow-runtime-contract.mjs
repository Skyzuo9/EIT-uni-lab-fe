import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const trackedFiles = execFileSync(
  'git',
  ['ls-files', 'apps', 'packages'],
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean)

const productionFiles = trackedFiles.filter((path) =>
  /\.(?:ts|tsx)$/.test(path)
  && !/\.(?:test|spec)(?:-d)?\.(?:ts|tsx)$/.test(path)
  && existsSync(path)
)
const forbiddenPatterns = [
  /\/api\/v1\/runtime\/runs/,
  /\/api\/v1\/runtime\/events/,
  /\/ws\/workflow\//,
  /\b(?:WorkflowRun|WorkflowRunNode|WorkflowRunEvent|WorkflowRunRequest|WorkflowDebugCommand|WorkflowDebugProjection)\b/,
  /\b(?:createRun|getRun|listRunNodes|listRunEvents|cancelRun|subscribeRunEvents)\b/
]
const violations = []

for (const path of productionFiles) {
  const source = readFileSync(path, 'utf8')
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) violations.push(`${path}: ${pattern}`)
  }
}

const retiredFiles = [
  'packages/workflow-editor/src/hooks/useWorkflowRun.ts',
  'packages/workflow-editor/src/utils/debugControls.ts',
  'e2e/device-action-run.spec.ts',
  'e2e/workflow-cloud-import.spec.ts',
  'e2e/workflow-debug-actions.spec.ts',
  'e2e/workflow-debug-scenarios.spec.ts',
  'e2e/workflow-runtime.spec.ts',
  'e2e/workflow-import-persistence.spec.ts',
  'e2e/workflow-default-run-mode.spec.ts',
  'e2e/workflow-handle-direction.spec.ts',
  'e2e/workflow-debugger-resize.spec.ts',
  'e2e/device-controls.spec.ts',
  'e2e/helpers/offline-local-bridge.ts',
  'e2e/fixtures/host-node-test-latency/host_node.yaml',
  'e2e/fixtures/host-node-test-latency/profile.yaml'
]
for (const path of retiredFiles) {
  if (existsSync(path)) violations.push(`${path}: retired file exists`)
}

if (violations.length > 0) {
  console.error('Workflow Runtime retirement contract failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(JSON.stringify({
  outcome: 'passed',
  scannedProductionFiles: productionFiles.length,
  retiredFilesAbsent: retiredFiles.length,
  forbiddenRuntimeReferences: 0
}, null, 2))
