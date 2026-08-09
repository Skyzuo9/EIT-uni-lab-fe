import { constants as fsConstants } from 'node:fs'
import { access, realpath } from 'node:fs/promises'
import {
  basename,
  join,
  normalize,
  resolve
} from 'node:path'

/** Return the executable paths owned by one selected Python environment. */
export function runtimeExecutablePaths(
  environmentPath: string,
  platform: NodeJS.Platform
): { pythonExecutable: string; unilabExecutable: string } {
  return platform === 'win32'
    ? {
        pythonExecutable: join(environmentPath, 'python.exe'),
        unilabExecutable: join(environmentPath, 'Scripts', 'unilab.exe')
      }
    : {
        pythonExecutable: join(environmentPath, 'bin', 'python'),
        unilabExecutable: join(environmentPath, 'bin', 'unilab')
      }
}

/** Resolve a candidate only when both Python and the UniLab CLI are executable. */
export async function validRuntimeEnvironment(
  candidate: string,
  platform: NodeJS.Platform
): Promise<string | null> {
  try {
    const resolvedCandidate = await realpath(normalize(resolve(candidate)))
    const executables = runtimeExecutablePaths(resolvedCandidate, platform)
    await Promise.all([
      access(executables.pythonExecutable, fsConstants.R_OK | fsConstants.X_OK),
      access(executables.unilabExecutable, fsConstants.R_OK | fsConstants.X_OK)
    ])
    return resolvedCandidate
  } catch {
    return null
  }
}

/** Build the child-process environment corresponding to the selected runtime. */
export function activatedRuntimeEnvironment(
  environmentPath: string,
  platform: NodeJS.Platform,
  inherited: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const inheritedPath = inherited['PATH']
  if (platform !== 'win32') {
    return {
      ...inherited,
      PATH: [join(environmentPath, 'bin'), inheritedPath]
        .filter(Boolean)
        .join(':')
    }
  }
  return {
    ...inherited,
    CONDA_PREFIX: environmentPath,
    CONDA_DEFAULT_ENV: basename(environmentPath),
    CONDA_SHLVL: '1',
    PATH: [
      environmentPath,
      join(environmentPath, 'Library', 'bin'),
      join(environmentPath, 'Scripts'),
      inheritedPath
    ].filter(Boolean).join(';')
  }
}
