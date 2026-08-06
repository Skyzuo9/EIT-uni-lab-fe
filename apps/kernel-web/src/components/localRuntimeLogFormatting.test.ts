import { describe, expect, it } from 'vitest'

import {
  formatLocalRuntimeLog,
  prepareLocalRuntimeLogCopyText
} from './localRuntimeLogFormatting'

describe('localRuntimeLogFormatting', () => {
  /**
   * 验证常见本地诊断格式统一拆分时间、级别、来源和正文。
   *
   * @returns 无返回值；通过结构化记录断言格式化合同。
   * @throws 任一常见格式字段归属错误时由断言报告失败。
   * @safety 只处理内存日志样本，不访问真实日志文件。
   */
  it('统一解析 info、warning 和 error 的常见格式', () => {
    const rows = formatLocalRuntimeLog([
      '2026-08-05 12:01:30.000 | INFO | worker - worker ready',
      '26-08-05 [12:01:31,125] [WARNING] uvicorn.protocols.http.httptools_impl [Uvicorn.HTTP] request delayed',
      '[ERROR] [1754380892.250] [plc_sim]: emergency stop'
    ].join('\n'))

    expect(rows).toEqual([
      {
        time: '12:01:30.000',
        level: 'info',
        source: 'worker',
        message: 'worker ready'
      },
      {
        time: '12:01:31,125',
        level: 'warning',
        source: 'uvicorn.protocols.http.httptools_impl',
        message: '[Uvicorn.HTTP] request delayed'
      },
      {
        time: '1754380892.250',
        level: 'error',
        source: 'plc_sim',
        message: 'emergency stop'
      }
    ])
  })

  /**
   * 验证未知格式逐行保底，内部空行、缩进和长正文均不会丢失。
   *
   * @returns 无返回值；通过普通日志消息序列断言原文保真。
   * @throws 任一输入行被丢弃、裁剪或改写时由断言报告失败。
   * @safety 仅比较内存字符串，不解释或执行日志内容。
   */
  it('完整保留未知格式、空白行、缩进和长正文', () => {
    const longLine = `unknown-${'A1B2C3D4'.repeat(80)}-tail`
    const rows = formatLocalRuntimeLog([
      'unknown first',
      '',
      '    indented context',
      longLine,
      ''
    ].join('\n'))

    expect(rows.map((row) => row.message)).toEqual([
      'unknown first',
      '',
      '    indented context',
      longLine
    ])
    expect(rows.every((row) => row.level === 'plain')).toBe(true)
  })

  /**
   * 验证 Python traceback 作为一条错误记录呈现并保留原始堆栈缩进。
   *
   * @returns 无返回值；通过错误正文及后续普通行断言分组边界。
   * @throws traceback 被拆散、缩进丢失或吞并后续行时由断言报告失败。
   * @safety 只识别固定 traceback 边界，不执行 Python 文本。
   */
  it('合并 traceback 且保留堆栈缩进和后续原文', () => {
    const rows = formatLocalRuntimeLog([
      '2026-08-05 12:01:31.000 | ERROR | worker - Action failed',
      'Traceback (most recent call last):',
      '  File "worker.py", line 18, in run',
      '    raise ValueError("invalid volume")',
      'ValueError: invalid volume',
      'unrecognized tail'
    ].join('\n'))

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ level: 'error', source: 'worker' })
    expect(rows[0]?.message).toBe([
      'Action failed',
      'Traceback (most recent call last):',
      '  File "worker.py", line 18, in run',
      '    raise ValueError("invalid volume")',
      'ValueError: invalid volume'
    ].join('\n'))
    expect(rows[1]?.message).toBe('unrecognized tail')
  })

  /**
   * 验证复制文本只剥离终端控制码，同时保留换行、空行和缩进。
   *
   * @returns 无返回值；通过精确字符串断言剪贴板内容合同。
   * @throws 控制码残留或诊断文本发生变化时由断言报告失败。
   * @safety 不写入系统剪贴板，只验证写入前的安全文本转换。
   */
  it('生成保留换行与缩进的安全复制文本', () => {
    const content = [
      '\u001b[31mERROR\u001b[0m Action failed',
      '',
      '  File "worker.py", line 18',
      'ValueError: invalid volume'
    ].join('\n')

    expect(prepareLocalRuntimeLogCopyText(content)).toBe([
      'ERROR Action failed',
      '',
      '  File "worker.py", line 18',
      'ValueError: invalid volume'
    ].join('\n'))
  })
})
