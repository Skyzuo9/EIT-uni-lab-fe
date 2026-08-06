import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const M2B_WORKFLOW_UUID =
  '65000000-0000-4000-8000-0000000002b0'
export const M2B_SOURCE_NODE_UUID =
  '66000000-0000-4000-8000-0000000002b0'
export const M2B_MOUNT_UUID =
  '97539b08-24de-5003-8b2e-9eb6e983c68a'
export const M2B_SITE_UUID =
  '1962ab7c-b006-5e44-a1bd-9b1fde81d529'
export const M2B_ALTERNATE_SITE_UUID =
  '56dfa4a8-06b8-5750-bff9-b2290766a57d'
export interface M2bNativeCliOs {
  url: string
  workflowUuid: string
  sourceNodeUuid: string
  osRevision: GitRevisionEvidence
  command: readonly string[]
  workingDirectory: string
  logs: () => string
  nativeLogs: () => ReadonlyArray<{ name: string; content: string }>
  stop: () => Promise<void>
}

export interface GitRevisionEvidence {
  sha: string
  dirty: boolean
}

export function readGitRevision(repository: string): GitRevisionEvidence {
  return {
    sha: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8'
    }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], {
      cwd: repository,
      encoding: 'utf8'
    }).trim().length > 0
  }
}

export async function startM2bNativeCliOs(): Promise<M2bNativeCliOs> {
  const osRepository = resolve(
    process.env.UNILAB_AUTHORING_OS_ROOT ||
      '/home/changjunhan/Uni-Lab-Core/.worktrees/uni-lab-os-m2b-material-source-admission'
  )
  const cli = resolve(
    process.env.UNILAB_OS_CLI ||
      '/home/changjunhan/.micromamba/envs/unilab/bin/unilab'
  )
  const fixtureSource = resolve(
    process.cwd(),
    'e2e/fixtures/m2b-native-workspace'
  )
  for (const path of [osRepository, cli, fixtureSource]) {
    if (!existsSync(path)) throw new Error(`M2B native fixture path missing: ${path}`)
  }

  const directory = mkdtempSync(join(tmpdir(), 'unilab-m2b-native-cli-'))
  const workspaceDirectory = join(directory, 'workspace')
  const workingDirectory = join(directory, 'unilabos_data')
  cpSync(fixtureSource, workspaceDirectory, {
    recursive: true,
    filter: (source) => !source.includes('__pycache__')
  })
  const port = await availablePort()
  const url = `http://127.0.0.1:${port}`
  const args = [
    '--workspace', workspaceDirectory,
    '--graph', join(workspaceDirectory, 'graph.json'),
    '--config', join(workspaceDirectory, 'local_config.py'),
    '--working_dir', workingDirectory,
    '--backend', 'ros',
    '--app_bridges', 'fastapi',
    '--port', String(port),
    '--disable_browser',
    '--skip_env_check',
    '--test_mode',
    '--external_devices_only'
  ]
  let output = ''
  const child = spawn(cli, args, {
    cwd: osRepository,
    env: {
      ...process.env,
      PYTHONPATH: osRepository,
      PYTHONUNBUFFERED: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout?.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr?.on('data', (chunk) => {
    output += chunk.toString()
  })

  try {
    await waitUntilReady(url, child, () => output)
  } catch (error) {
    await stopChild(child)
    rmSync(directory, { recursive: true, force: true })
    throw error
  }

  return {
    url,
    workflowUuid: M2B_WORKFLOW_UUID,
    sourceNodeUuid: M2B_SOURCE_NODE_UUID,
    osRevision: readGitRevision(osRepository),
    command: [cli, ...args],
    workingDirectory,
    logs: () => output,
    nativeLogs: () => readNativeLogs(workingDirectory),
    stop: async () => {
      await stopChild(child)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

async function waitUntilReady(
  url: string,
  child: ChildProcess,
  logs: () => string
): Promise<void> {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Native unilab exited with ${child.exitCode}\n${logs()}`)
    }
    try {
      const [inventoryResponse, authoringResponse] = await Promise.all([
        fetch(`${url}/api/v1/inventory/snapshot`),
        fetch(
          `${url}/api/v1/workflows/${M2B_WORKFLOW_UUID}/authoring`
        )
      ])
      if (inventoryResponse.ok && authoringResponse.ok) {
        const authoring = await authoringResponse.json() as {
          data?: { candidate?: { graph?: { nodes?: Array<{ uuid?: string }> } } }
        }
        if (authoring.data?.candidate?.graph?.nodes?.some(
          (node) => node.uuid === M2B_SOURCE_NODE_UUID
        )) return
      }
    } catch {
      // Native CLI and Package monitor are still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`Native unilab did not expose the M2B Candidate\n${logs()}`)
}

function readNativeLogs(
  workingDirectory: string
): ReadonlyArray<{ name: string; content: string }> {
  const logsDirectory = join(workingDirectory, 'logs')
  if (!existsSync(logsDirectory)) return []
  return readdirSync(logsDirectory)
    .filter((name) => name.endsWith('.log'))
    .sort()
    .map((name) => ({
      name,
      content: readFileSync(join(logsDirectory, name), 'utf8')
    }))
}

async function availablePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer()
    server.once('error', rejectPort)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        rejectPort(new Error('Unable to allocate native unilab port'))
        return
      }
      server.close((error) => {
        if (error) rejectPort(error)
        else resolvePort(address.port)
      })
    })
  })
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  child.kill('SIGINT')
  await Promise.race([
    new Promise<void>((resolveExit) => child.once('exit', () => resolveExit())),
    new Promise<void>((resolveTimeout) => {
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
        resolveTimeout()
      }, 5_000)
    })
  ])
}
