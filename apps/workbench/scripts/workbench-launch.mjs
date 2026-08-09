export const WORKBENCH_DESKTOP_FLAG = '--desktop'

/** Resolves the single supported launch-mode flag and rejects silent typos. */
export function resolveWorkbenchLaunchMode(argv) {
  const unknown = argv.filter(argument => argument !== WORKBENCH_DESKTOP_FLAG)
  if (unknown.length > 0) {
    throw new Error(`Unknown Workbench argument: ${unknown.join(', ')}`)
  }
  return argv.includes(WORKBENCH_DESKTOP_FLAG) ? 'desktop' : 'browser'
}

/** Creates the trusted loopback URL loaded by the shared Electron shell. */
export function createWorkbenchRendererUrl({
  port,
  workspace,
  workflowUuid
}) {
  const url = new URL(`http://127.0.0.1:${port}/`)
  if (workflowUuid) url.searchParams.set('workflowUuid', workflowUuid)
  url.hash = workspace
  return url.toString()
}
