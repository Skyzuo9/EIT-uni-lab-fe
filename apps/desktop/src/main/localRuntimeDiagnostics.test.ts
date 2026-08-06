import { once } from 'node:events'
import {
  appendFile,
  mkdir,
  readFile,
  writeFile
} from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createDiagnosticLogSessionId,
  resolveLocalRuntimeLogPath
} from './diagnosticLogSession'
import {
  readLocalRuntimeLog,
  readLocalRuntimeLogs,
  RotatingLogWriter
} from './localRuntimeManager'
import {
  cleanupLocalRuntimeTestArtifacts,
  createLocalRuntimeTestFixture
} from './localRuntimeManager.testSupport'

/** 清理当前用例创建的日志临时目录。 */
afterEach(cleanupLocalRuntimeTestArtifacts)

/** 覆盖本地运行诊断日志的会话隔离、增量读取和轮转。 */
describe('Local runtime diagnostics', () => {
  const logSessionId = createDiagnosticLogSessionId(
    new Date('2026-08-05T01:02:03.004Z')
  )

  /** 验证一次应用会话只读取该会话内固定来源的日志尾部。 */
  it('reads only the tail of fixed local runtime log files', async () => {
    const fixture = await createLocalRuntimeTestFixture('packages')
    const logsDirectory = join(fixture.osRoot, 'logs')
    await mkdir(logsDirectory, { recursive: true })
    await Promise.all([
      writeFile(
        join(logsDirectory, `${logSessionId}-simulator.log`),
        'old-prefix-latest'
      ),
      writeFile(join(logsDirectory, `${logSessionId}-edge.log`), '')
    ])

    const logs = await readLocalRuntimeLogs(logsDirectory, logSessionId, 6)

    expect(logs.entries).toEqual([
      {
        kind: 'simulator',
        content: 'latest',
        available: true,
        truncated: true
      },
      {
        kind: 'edge',
        content: '',
        available: true,
        truncated: false
      }
    ])
  })

  /** 验证当前会话日志仍按文件身份和字节游标执行增量读取。 */
  it('returns only bytes appended after the local runtime log cursor', async () => {
    const fixture = await createLocalRuntimeTestFixture('packages')
    const logsDirectory = join(fixture.osRoot, 'logs')
    await mkdir(logsDirectory, { recursive: true })
    const logPath = join(logsDirectory, `${logSessionId}-edge.log`)
    await writeFile(logPath, 'first\nsecond\n')

    const initial = await readLocalRuntimeLog(logsDirectory, logSessionId, {
      kind: 'edge',
      cursor: null
    })
    await appendFile(logPath, 'third\n')
    const appended = await readLocalRuntimeLog(logsDirectory, logSessionId, {
      kind: 'edge',
      cursor: initial.cursor
    })

    expect(initial.reset).toBe(true)
    expect(initial.content).toBe('first\nsecond\n')
    expect(appended.reset).toBe(false)
    expect(appended.content).toBe('third\n')
    expect(appended.cursor?.offset).toBeGreaterThan(initial.cursor?.offset ?? 0)
  })

  /** 验证带会话前缀的日志文件继续沿用既有容量轮转与分片保留规则。 */
  it('rotates launcher diagnostics while the child process is still running', async () => {
    const fixture = await createLocalRuntimeTestFixture('packages')
    const logPath = join(fixture.osRoot, `${logSessionId}-edge.log`)
    const writer = new RotatingLogWriter(logPath, 12, 2)

    writer.write('12345678')
    writer.write('abcdefgh')
    writer.end('tail!')
    await once(writer, 'finish')

    expect(await readFile(logPath, 'utf8')).toBe('tail!')
    expect(await readFile(`${logPath}.1`, 'utf8')).toBe('abcdefgh')
    expect(await readFile(`${logPath}.2`, 'utf8')).toBe('12345678')
  })

  /** 验证应用重启使用新会话文件，异常退出留下的旧会话内容不会被覆盖。 */
  it('keeps an earlier application session readable after restart', async () => {
    const fixture = await createLocalRuntimeTestFixture('packages')
    const startedAt = new Date('2026-08-05T01:02:03.004Z')
    const earlierSessionId = createDiagnosticLogSessionId(startedAt)
    const restartedSessionId = createDiagnosticLogSessionId(startedAt)
    const earlierLogPath = resolveLocalRuntimeLogPath(
      fixture.osRoot,
      earlierSessionId,
      'edge'
    )
    const restartedLogPath = resolveLocalRuntimeLogPath(
      fixture.osRoot,
      restartedSessionId,
      'edge'
    )
    await writeFile(earlierLogPath, 'earlier crash output')

    const restartedWriter = new RotatingLogWriter(restartedLogPath, 128, 2)
    restartedWriter.end('new application output')
    await once(restartedWriter, 'finish')

    expect(restartedLogPath).not.toBe(earlierLogPath)
    expect(await readFile(earlierLogPath, 'utf8')).toBe('earlier crash output')
    expect(await readFile(restartedLogPath, 'utf8')).toBe(
      'new application output'
    )
  })
})
