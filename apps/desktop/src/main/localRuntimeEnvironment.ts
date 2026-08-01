import { constants as fsConstants } from 'node:fs'
import { access, realpath } from 'node:fs/promises'
import { dirname, join, normalize, resolve } from 'node:path'

interface EnvironmentDiscoveryOptions {
  environment?: NodeJS.ProcessEnv
  homeDirectory: string
  platform?: NodeJS.Platform
}

export async function discoverDefaultCondaEnvironment({
  environment = process.env,
  homeDirectory,
  platform = process.platform
}: EnvironmentDiscoveryOptions): Promise<string | null> {
  const candidates = [
    environment['CONDA_PREFIX'],
    ...await pathEnvironmentCandidates(environment['PATH'], platform),
    ...namedEnvironmentCandidates(environment, homeDirectory, platform)
  ]
  const visited = new Set<string>()

  for (const candidate of candidates) {
    if (!candidate) continue
    const normalizedCandidate = normalize(resolve(candidate))
    if (visited.has(normalizedCandidate)) continue
    visited.add(normalizedCandidate)

    const environmentPath = await validRuntimeEnvironment(
      normalizedCandidate,
      platform
    )
    if (environmentPath) return environmentPath
  }
  return null
}

async function pathEnvironmentCandidates(
  pathValue: string | undefined,
  platform: NodeJS.Platform
): Promise<string[]> {
  if (!pathValue) return []
  const candidates: string[] = []
  const pathDelimiter = platform === 'win32' ? ';' : ':'
  const executableName = platform === 'win32' ? 'unilab.exe' : 'unilab'
  for (const pathDirectory of pathValue.split(pathDelimiter)) {
    if (!pathDirectory) continue
    try {
      const executable = await realpath(join(pathDirectory, executableName))
      candidates.push(dirname(dirname(executable)))
    } catch {
      // PATH 中不存在可用的 unilab 时继续检查下一个目录。
    }
  }
  return candidates
}

function namedEnvironmentCandidates(
  environment: NodeJS.ProcessEnv,
  homeDirectory: string,
  platform: NodeJS.Platform
): string[] {
  const pathDelimiter = platform === 'win32' ? ';' : ':'
  const condaEnvironmentRoots = (environment['CONDA_ENVS_PATH'] ?? '')
    .split(pathDelimiter)
    .filter(Boolean)
  const mambaRoot = environment['MAMBA_ROOT_PREFIX']

  return [
    ...condaEnvironmentRoots.map((root) => join(root, 'unilab')),
    ...(mambaRoot ? [join(mambaRoot, 'envs', 'unilab')] : []),
    join(homeDirectory, 'miniforge3', 'envs', 'unilab'),
    join(homeDirectory, 'mambaforge', 'envs', 'unilab'),
    join(homeDirectory, 'miniconda3', 'envs', 'unilab'),
    join(homeDirectory, 'anaconda3', 'envs', 'unilab'),
    join(homeDirectory, '.conda', 'envs', 'unilab'),
    join(homeDirectory, '.micromamba', 'envs', 'unilab'),
    '/opt/homebrew/Caskroom/miniforge/base/envs/unilab',
    '/opt/homebrew/Caskroom/miniconda/base/envs/unilab'
  ]
}

async function validRuntimeEnvironment(
  environmentPath: string,
  platform: NodeJS.Platform
): Promise<string | null> {
  try {
    const pythonExecutable = platform === 'win32'
      ? join(environmentPath, 'python.exe')
      : join(environmentPath, 'bin', 'python')
    const unilabExecutable = platform === 'win32'
      ? join(environmentPath, 'Scripts', 'unilab.exe')
      : join(environmentPath, 'bin', 'unilab')
    await Promise.all([
      access(
        pythonExecutable,
        fsConstants.R_OK | fsConstants.X_OK
      ),
      access(
        unilabExecutable,
        fsConstants.R_OK | fsConstants.X_OK
      )
    ])
    return await realpath(environmentPath)
  } catch {
    return null
  }
}
