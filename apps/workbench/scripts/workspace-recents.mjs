export const WORKBENCH_LAUNCH_CONFIG_VERSION = 2
export const MAX_RECENT_WORKSPACES = 8

export function normalizeWorkbenchLaunchConfig(value) {
  if (!value || typeof value !== 'object') return emptyConfig()
  if (value.version === WORKBENCH_LAUNCH_CONFIG_VERSION) {
    return {
      version: WORKBENCH_LAUNCH_CONFIG_VERSION,
      recentWorkspaces: Array.isArray(value.recentWorkspaces)
        ? value.recentWorkspaces
            .map(normalizeRecentWorkspace)
            .filter(Boolean)
            .slice(0, MAX_RECENT_WORKSPACES)
        : []
    }
  }
  if (value.version === 1 && nonEmptyString(value.workspace)) {
    return {
      version: WORKBENCH_LAUNCH_CONFIG_VERSION,
      recentWorkspaces: [{
        path: value.workspace,
        pythonEnvironment: optionalString(value.pythonEnvironment),
        osProject: optionalString(value.osProject),
        lastOpenedAt: new Date(0).toISOString()
      }]
    }
  }
  return emptyConfig()
}

export function recordRecentWorkspace(config, entry) {
  const normalized = normalizeRecentWorkspace(entry)
  if (!normalized) throw new Error('最近工作区记录无效')
  return {
    version: WORKBENCH_LAUNCH_CONFIG_VERSION,
    recentWorkspaces: [
      normalized,
      ...normalizeWorkbenchLaunchConfig(config).recentWorkspaces.filter(
        candidate => candidate.path !== normalized.path
      )
    ].slice(0, MAX_RECENT_WORKSPACES)
  }
}

export function recentWorkspaceForPath(config, workspacePath) {
  return normalizeWorkbenchLaunchConfig(config).recentWorkspaces.find(
    entry => entry.path === workspacePath
  ) ?? null
}

function normalizeRecentWorkspace(value) {
  if (!value || typeof value !== 'object' || !nonEmptyString(value.path)) {
    return null
  }
  const lastOpenedAt = nonEmptyString(value.lastOpenedAt)
    && Number.isFinite(Date.parse(value.lastOpenedAt))
    ? new Date(value.lastOpenedAt).toISOString()
    : new Date(0).toISOString()
  return {
    path: value.path,
    pythonEnvironment: optionalString(value.pythonEnvironment),
    osProject: optionalString(value.osProject),
    lastOpenedAt
  }
}

function emptyConfig() {
  return {
    version: WORKBENCH_LAUNCH_CONFIG_VERSION,
    recentWorkspaces: []
  }
}

function optionalString(value) {
  return nonEmptyString(value) ? value : null
}

function nonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim())
}
