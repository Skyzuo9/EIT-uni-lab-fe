import { constants as fsConstants } from 'node:fs'
import { access, realpath } from 'node:fs/promises'
import { delimiter, dirname, join, normalize, resolve } from 'node:path'

interface EnvironmentDiscoveryOptions {
  environment?: NodeJS.ProcessEnv
  homeDirectory: string
}

export async function discoverDefaultCondaEnvironment({
  environment = process.env,
  homeDirectory
}: EnvironmentDiscoveryOptions): Promise<string | null> {
  const candidates = [
    environment['CONDA_PREFIX'],
    ...await pathEnvironmentCandidates(environment['PATH']),
    ...namedEnvironmentCandidates(environment, homeDirectory)
  ]
  const visited = new Set<string>()

  for (const candidate of candidates) {
    if (!candidate) continue
    const normalizedCandidate = normalize(resolve(candidate))
    if (visited.has(normalizedCandidate)) continue
    visited.add(normalizedCandidate)

    const environmentPath = await validRuntimeEnvironment(normalizedCandidate)
    if (environmentPath) return environmentPath
  }
  return null
}

async function pathEnvironmentCandidates(
  pathValue: string | undefined
): Promise<string[]> {
  if (!pathValue) return []
  const candidates: string[] = []
  for (const pathDirectory of pathValue.split(delimiter)) {
    if (!pathDirectory) continue
    try {
      const executable = await realpath(join(pathDirectory, 'unilab'))
      candidates.push(dirname(dirname(executable)))
    } catch {
      // PATH 中不存在可用的 unilab 时继续检查下一个目录。
    }
  }
  return candidates
}

function namedEnvironmentCandidates(
  environment: NodeJS.ProcessEnv,
  homeDirectory: string
): string[] {
  const condaEnvironmentRoots = (environment['CONDA_ENVS_PATH'] ?? '')
    .split(delimiter)
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
  environmentPath: string
): Promise<string | null> {
  try {
    await Promise.all([
      access(
        join(environmentPath, 'bin', 'python'),
        fsConstants.R_OK | fsConstants.X_OK
      ),
      access(
        join(environmentPath, 'bin', 'unilab'),
        fsConstants.R_OK | fsConstants.X_OK
      )
    ])
    return await realpath(environmentPath)
  } catch {
    return null
  }
}
