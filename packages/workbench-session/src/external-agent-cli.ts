import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'

export interface ExternalAgentCliResolution {
  executable: string
  version: string
}

export interface ExternalAgentCliEnvironment {
  environment: NodeJS.ProcessEnv
  codex: ExternalAgentCliResolution | null
}

interface ExternalAgentCliOptions {
  platform?: NodeJS.Platform
  homeDirectory?: string
  knownCodexCandidates?: string[]
}

/**
 * Put the newest available external Codex CLI first on the Agent PATH.
 * UniLab never redistributes Codex; it only selects a user-installed copy.
 */
export async function prepareExternalAgentCliEnvironment(
  environment: NodeJS.ProcessEnv,
  options: ExternalAgentCliOptions = {}
): Promise<ExternalAgentCliEnvironment> {
  const platform = options.platform ?? process.platform
  const pathKey = environmentPathKey(environment)
  const originalPath = environment[pathKey] ?? ''
  const explicitPath = environmentValue(
    environment,
    'UNILAB_CODEX_PATH'
  )?.trim()
  const knownCandidates = options.knownCodexCandidates ??
    defaultKnownCodexCandidates(
      platform,
      options.homeDirectory ?? homedir(),
      environment
    )
  const pathResolution = explicitPath
    ? null
    : await firstUsableCodexOnPath(originalPath, platform)
  const candidatePaths = explicitPath
    ? [explicitPath]
    : uniquePaths(knownCandidates)
  const resolutions = (await Promise.all(
    candidatePaths.map(candidate => probeCodex(candidate, platform))
  )).filter((candidate): candidate is ExternalAgentCliResolution => (
    candidate !== null
  ))
  if (pathResolution) resolutions.push(pathResolution)
  const codex = explicitPath
    ? resolutions.find(candidate => samePath(candidate.executable, explicitPath))
      ?? null
    : resolutions.sort(compareResolutionNewestFirst)[0] ?? null

  if (explicitPath && !codex) {
    throw new Error(
      `UNILAB_CODEX_PATH does not point to a usable Codex CLI: ${explicitPath}`
    )
  }
  if (!codex) return { environment: { ...environment }, codex: null }

  return {
    environment: {
      ...environment,
      [pathKey]: prependPath(originalPath, dirname(codex.executable))
    },
    codex
  }
}

function defaultKnownCodexCandidates(
  platform: NodeJS.Platform,
  homeDirectory: string,
  environment: NodeJS.ProcessEnv
): string[] {
  if (platform === 'darwin') {
    const applications = ['/Applications', join(homeDirectory, 'Applications')]
    return applications.flatMap(root => [
      join(root, 'ChatGPT.app', 'Contents', 'Resources', 'codex'),
      join(root, 'Codex.app', 'Contents', 'Resources', 'codex')
    ])
  }
  if (platform === 'win32') {
    const localAppData = environmentValue(environment, 'LOCALAPPDATA')
    const programFiles = environmentValue(environment, 'PROGRAMFILES')
    return [
      localAppData && join(
        localAppData,
        'Programs',
        'ChatGPT',
        'resources',
        'codex.exe'
      ),
      localAppData && join(
        localAppData,
        'Programs',
        'Codex',
        'resources',
        'codex.exe'
      ),
      programFiles && join(
        programFiles,
        'ChatGPT',
        'resources',
        'codex.exe'
      ),
      programFiles && join(
        programFiles,
        'Codex',
        'resources',
        'codex.exe'
      )
    ].filter((candidate): candidate is string => Boolean(candidate))
  }
  return []
}

async function firstUsableCodexOnPath(
  pathValue: string,
  platform: NodeJS.Platform
): Promise<ExternalAgentCliResolution | null> {
  for (const candidate of codexPathCandidates(pathValue, platform)) {
    const resolution = await probeCodex(candidate, platform)
    if (resolution) return resolution
  }
  return null
}

function codexPathCandidates(
  pathValue: string,
  platform: NodeJS.Platform
): string[] {
  const names = platform === 'win32'
    ? ['codex.exe', 'codex.cmd', 'codex.bat', 'codex']
    : ['codex']
  return pathValue.split(delimiter).filter(Boolean).flatMap(directory => (
    names.map(name => join(directory, name))
  ))
}

async function probeCodex(
  executable: string,
  platform: NodeJS.Platform
): Promise<ExternalAgentCliResolution | null> {
  try {
    await access(
      executable,
      platform === 'win32' ? constants.F_OK : constants.X_OK
    )
    if (!(await stat(executable)).isFile()) return null
    const output = await executableVersion(executable)
    const version = output.match(
      /\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\b/u
    )?.[1]
    return version ? { executable, version } : null
  } catch {
    return null
  }
}

function executableVersion(executable: string): Promise<string> {
  return new Promise((resolveVersion, reject) => {
    execFile(executable, ['--version'], {
      encoding: 'utf8',
      timeout: 2_500,
      windowsHide: true,
      maxBuffer: 64 * 1024
    }, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolveVersion(`${stdout}\n${stderr}`)
    })
  })
}

function compareResolutionNewestFirst(
  left: ExternalAgentCliResolution,
  right: ExternalAgentCliResolution
): number {
  return compareSemver(right.version, left.version)
}

function compareSemver(left: string, right: string): number {
  const leftVersion = parseSemver(left)
  const rightVersion = parseSemver(right)
  for (let index = 0; index < 3; index += 1) {
    const difference = leftVersion.core[index] - rightVersion.core[index]
    if (difference !== 0) return difference
  }
  if (!leftVersion.prerelease && !rightVersion.prerelease) return 0
  if (!leftVersion.prerelease) return 1
  if (!rightVersion.prerelease) return -1
  const length = Math.max(
    leftVersion.prerelease.length,
    rightVersion.prerelease.length
  )
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftVersion.prerelease[index]
    const rightPart = rightVersion.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    const leftNumber = /^\d+$/u.test(leftPart) ? Number(leftPart) : null
    const rightNumber = /^\d+$/u.test(rightPart) ? Number(rightPart) : null
    if (leftNumber !== null && rightNumber !== null) {
      if (leftNumber !== rightNumber) return leftNumber - rightNumber
    } else if (leftNumber !== null) return -1
    else if (rightNumber !== null) return 1
    else {
      const difference = leftPart.localeCompare(rightPart)
      if (difference !== 0) return difference
    }
  }
  return 0
}

function parseSemver(version: string): {
  core: [number, number, number]
  prerelease: string[] | null
} {
  const [main = '0.0.0', suffix] = version.split('-', 2)
  const [major = 0, minor = 0, patch = 0] = main
    .split('.')
    .map(part => Number(part))
  return {
    core: [major, minor, patch],
    prerelease: suffix ? suffix.split('.') : null
  }
}

function environmentPathKey(environment: NodeJS.ProcessEnv): string {
  return Object.keys(environment).find(key => key.toLowerCase() === 'path')
    ?? 'PATH'
}

function environmentValue(
  environment: NodeJS.ProcessEnv,
  name: string
): string | undefined {
  const key = Object.keys(environment).find(candidate => (
    candidate.toLowerCase() === name.toLowerCase()
  ))
  return key ? environment[key] : undefined
}

function prependPath(pathValue: string, directory: string): string {
  const directories = pathValue.split(delimiter).filter(Boolean)
  return [directory, ...directories.filter(candidate => (
    !samePath(candidate, directory)
  ))].join(delimiter)
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  return paths.filter(path => {
    const key = resolve(path).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase()
}
