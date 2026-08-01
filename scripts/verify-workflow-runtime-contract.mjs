import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const trackedFiles = execFileSync(
  'git',
  ['ls-files', 'apps', 'packages', 'e2e/helpers', 'e2e/fixtures'],
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
  /\/api\/v1\/workflow-tasks\/[^'"\s]*\/events/,
  /\/ws\/workflow\//,
  /\b(?:WorkflowRun|WorkflowRunNode|WorkflowRunEvent|WorkflowRunRequest|WorkflowDebugCommand|WorkflowDebugProjection)\b/,
  /\b(?:createRun|getRun|listRunNodes|listRunEvents|cancelRun|subscribeRunEvents)\b/
]
const runtimeAuthorityFiles = productionFiles.filter((path) =>
  path.startsWith('packages/workflow-editor/src/') ||
  path === 'packages/services/src/workflow.ts' ||
  path === 'apps/kernel-web/src/integrations/lab-workbench/panelAdapter.tsx'
)
const runtimeAuthorityForbiddenPatterns = [
  /\buseWorkflowDebug\b/,
  /\bSAMPLE_WORKFLOW_JSON\b/,
  /\bglobalThis\.setInterval\b/,
  /\b(?:pollRuntime|pollRun|pollWorkflowTask|pollWorkflowJobs?)\b/i
]
const activeFixtureFiles = trackedFiles.filter((path) =>
  (path.startsWith('e2e/helpers/') || path.startsWith('e2e/fixtures/')) &&
  existsSync(path)
)
const violations = []
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const workflowDebugGate = packageJson.scripts?.['test:e2e:workflow-debug'] || ''
const workflowEditorReadme = readFileSync(
  'packages/workflow-editor/README.md',
  'utf8'
)
const finalGateSource = readFileSync(
  'e2e/workflow-runtime-final-gate-real-os.spec.ts',
  'utf8'
)
for (const requiredSpec of [
  'workflow-authoring-real-os.spec.ts',
  'workflow-task-runtime-real-os.spec.ts',
  'workflow-task-runtime-resilience-real-os.spec.ts',
  'workflow-runtime-final-gate-real-os.spec.ts'
]) {
  if (!workflowDebugGate.includes(requiredSpec)) {
    violations.push(
      `package.json: test:e2e:workflow-debug omits ${requiredSpec}`
    )
  }
}

for (const path of productionFiles) {
  const source = readFileSync(path, 'utf8')
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) violations.push(`${path}: ${pattern}`)
  }
}

for (const path of runtimeAuthorityFiles) {
  const source = readFileSync(path, 'utf8')
  for (const pattern of runtimeAuthorityForbiddenPatterns) {
    if (pattern.test(source)) violations.push(`${path}: ${pattern}`)
  }
}

for (const path of activeFixtureFiles) {
  const source = readFileSync(path, 'utf8')
  for (const pattern of [
    ...forbiddenPatterns,
    /\bglobalThis\.setInterval\b/,
    /\b(?:pollRuntime|pollRun|pollWorkflowTask|pollWorkflowJobs?)\b/i
  ]) {
    if (pattern.test(source)) violations.push(`${path}: ${pattern}`)
  }
}

for (const retiredClaim of [
  '`pause_on_start`',
  'create run',
  '`start_node_id`'
]) {
  if (workflowEditorReadme.includes(retiredClaim)) {
    violations.push(
      `packages/workflow-editor/README.md: retired claim ${retiredClaim}`
    )
  }
}

for (const requiredQuietWindowCoverage of [
  'isWorkflowRuntimeReadPath(path, taskUuid)',
  "pathname === '/api/v1/workflow-tasks'",
  "pathname === `/api/v1/workflow-tasks/${taskUuid}`",
  "pathname === `/api/v1/workflow-tasks/${taskUuid}/jobs`",
  "pathname.startsWith('/api/v1/workflow-node-jobs/') &&",
  "pathname.endsWith('/feedback')"
]) {
  if (!finalGateSource.includes(requiredQuietWindowCoverage)) {
    violations.push(
      `workflow-runtime-final-gate-real-os.spec.ts: quiet window omits ${requiredQuietWindowCoverage}`
    )
  }
}

const retiredFiles = [
  'packages/workflow-editor/src/hooks/useWorkflowRun.ts',
  'packages/workflow-editor/src/hooks/useWorkflowDebug.ts',
  'packages/workflow-editor/src/components/DebugToolbar.tsx',
  'packages/workflow-editor/src/components/WorkflowPreview.tsx',
  'packages/workflow-editor/src/data/sampleWorkflow.ts',
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
  scannedActiveFixtureFiles: activeFixtureFiles.length,
  retiredFilesAbsent: retiredFiles.length,
  forbiddenRuntimeReferences: 0,
  runtimeTimerFallbackReferences: 0,
  workflowDebugGate: 'real-os'
}, null, 2))
