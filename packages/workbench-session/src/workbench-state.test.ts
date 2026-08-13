import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createWorkbenchDiagnosticBundle,
  createWorkbenchStateBackup,
  prepareWorkbenchState,
  restoreWorkbenchStateBackup,
  WORKBENCH_STATE_SCHEMA_VERSION
} from './workbench-state'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, {
    recursive: true,
    force: true
  })))
})

describe('Workbench state lifecycle', () => {
  it('creates the versioned layout and migrates legacy manifests with backup', async () => {
    const workspace = await fixtureWorkspace()
    const first = await prepareWorkbenchState(workspace, {
      now: () => new Date('2026-08-10T08:00:00.000Z')
    })
    expect(first.manifest.schemaVersion).toBe(WORKBENCH_STATE_SCHEMA_VERSION)
    expect(await readdir(first.root)).toEqual(expect.arrayContaining([
      'agent', 'audit', 'backups', 'cache', 'logs', 'recovery',
      'runtime', 'schema.json', 'sessions'
    ]))

    await writeFile(join(first.root, 'schema.json'), JSON.stringify({
      schemaVersion: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      migratedAt: '2026-08-01T00:00:00.000Z'
    }))
    const migrated = await prepareWorkbenchState(workspace, {
      now: () => new Date('2026-08-10T08:05:00.000Z')
    })
    expect(migrated.migratedFrom).toBe(0)
    expect(migrated.manifest.schemaVersion).toBe(1)
    expect((await readdir(join(first.root, 'backups'))).length).toBe(1)
  })

  it('isolates a corrupt manifest and keeps persistent data intact', async () => {
    const workspace = await fixtureWorkspace()
    const state = await prepareWorkbenchState(workspace)
    await writeFile(join(state.root, 'sessions', 'keep.json'), '{"ok":true}\n')
    await writeFile(join(state.root, 'schema.json'), '{broken')

    const recovered = await prepareWorkbenchState(workspace, {
      now: () => new Date('2026-08-10T08:10:00.000Z')
    })

    expect(recovered.recoveryPath).toContain('/recovery/corrupt-')
    expect(await readFile(join(state.root, 'sessions', 'keep.json'), 'utf8'))
      .toContain('true')
    expect(await readFile(
      join(recovered.recoveryPath!, 'schema.json'),
      'utf8'
    )).toBe('{broken')
  })

  it('prunes only volatile state to quota and preserves sessions/audit', async () => {
    const workspace = await fixtureWorkspace()
    const state = await prepareWorkbenchState(workspace)
    const oldLog = join(state.root, 'logs', 'old.log')
    const newLog = join(state.root, 'logs', 'new.log')
    await Promise.all([
      writeFile(oldLog, 'a'.repeat(12)),
      writeFile(newLog, 'b'.repeat(12)),
      writeFile(join(state.root, 'sessions', 'session.json'), 'persistent'),
      writeFile(join(state.root, 'audit', 'audit.jsonl'), 'persistent')
    ])
    await utimes(oldLog, new Date(0), new Date(0))
    await utimes(newLog, new Date(1_000), new Date(1_000))

    const pruned = await prepareWorkbenchState(workspace, {
      quotas: { logs: 12 }
    })

    expect(pruned.prunedBytes).toBe(12)
    await expect(readFile(oldLog)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(newLog, 'utf8')).resolves.toHaveLength(12)
    await expect(readFile(join(state.root, 'sessions', 'session.json'), 'utf8'))
      .resolves.toBe('persistent')
    await expect(readFile(join(state.root, 'audit', 'audit.jsonl'), 'utf8'))
      .resolves.toBe('persistent')
  })

  it('backs up and restores persistent state without touching volatile logs', async () => {
    const workspace = await fixtureWorkspace()
    const state = await prepareWorkbenchState(workspace)
    const sessionPath = join(state.root, 'sessions', 'session.json')
    const logPath = join(state.root, 'logs', 'runtime.log')
    await writeFile(sessionPath, 'before')
    await writeFile(logPath, 'keep-log')
    const backup = await createWorkbenchStateBackup(workspace)
    await writeFile(sessionPath, 'after')

    const safety = await restoreWorkbenchStateBackup(workspace, backup.id)

    expect(safety.id).not.toBe(backup.id)
    await expect(readFile(sessionPath, 'utf8')).resolves.toBe('before')
    await expect(readFile(logPath, 'utf8')).resolves.toBe('keep-log')
  })

  it('exports a bounded redacted diagnostic bundle without conversations', async () => {
    const workspace = await fixtureWorkspace()
    const state = await prepareWorkbenchState(workspace)
    await writeFile(
      join(state.root, 'logs', 'workbench.log'),
      [
        `workspace=${workspace}`,
        'token=secret-value',
        'Authorization: Bearer abc123',
        'Cookie: unilab_workbench_session=cookie-secret',
        'access=https://workbench.example/__unilab/auth#token=fragment-secret',
        ''
      ].join('\n')
    )
    await writeFile(
      join(state.root, 'agent', 'conversation.txt'),
      'private conversation'
    )

    const bundle = JSON.parse(new TextDecoder().decode(
      await createWorkbenchDiagnosticBundle(workspace, {
        workbench: '0.1.0',
        os: 'authoring-source-map/v1'
      })
    )) as Record<string, unknown>
    const serialized = JSON.stringify(bundle)

    expect(serialized).toContain('<WORKSPACE>')
    expect(serialized).toContain('<redacted>')
    expect(serialized).not.toContain('secret-value')
    expect(serialized).not.toContain('abc123')
    expect(serialized).not.toContain('cookie-secret')
    expect(serialized).not.toContain('fragment-secret')
    expect(serialized).not.toContain('private conversation')
  })
})

async function fixtureWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'unilab-state-'))
  roots.push(root)
  const workspace = join(root, 'workspace')
  await mkdir(workspace, { recursive: true })
  return workspace
}
