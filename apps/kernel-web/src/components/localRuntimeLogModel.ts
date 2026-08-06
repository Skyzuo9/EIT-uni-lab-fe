import type {
  LocalRuntimeLogBatch,
  LocalRuntimeLogsSnapshot
} from '../types/electron'

export const LOCAL_RUNTIME_LOG_MAX_LINES = 2_000

/**
 * 合并一个游标批次，并把每个来源的内存内容限制在最近固定行数。
 *
 * @param current 已缓存的全部日志来源快照；首次读取时为 null。
 * @param batch 单一来源本次返回的增量日志批次。
 * @returns 保留其他来源并合并当前批次后的新快照。
 * @throws 不抛出异常；空内容仍生成对应来源的状态条目。
 * @safety 仅在内存中裁剪展示数据，不修改磁盘日志和读取游标。
 */
export function mergeLocalRuntimeLogBatch(
  current: LocalRuntimeLogsSnapshot | null,
  batch: LocalRuntimeLogBatch
): LocalRuntimeLogsSnapshot {
  const previous = current?.entries.find((entry) => entry.kind === batch.kind)
  const combined = batch.reset
    ? batch.content
    : `${previous?.content ?? ''}${batch.content}`
  const lines = combined.split(/\r?\n/)
  const hasTrailingNewline = /\r?\n$/.test(combined)
  if (hasTrailingNewline) lines.pop()
  const dropped = lines.length > LOCAL_RUNTIME_LOG_MAX_LINES
  const retainedLines = dropped
    ? lines.slice(-LOCAL_RUNTIME_LOG_MAX_LINES)
    : lines
  const content = retainedLines.join('\n') + (hasTrailingNewline ? '\n' : '')
  const nextEntry = {
    kind: batch.kind,
    content,
    available: batch.available,
    truncated: batch.truncated
      || dropped
      || (!batch.reset && Boolean(previous?.truncated))
  }
  const entries = [
    ...(current?.entries.filter((entry) => entry.kind !== batch.kind) ?? []),
    nextEntry
  ].sort((left, right) => (
    Number(left.kind !== 'simulator') - Number(right.kind !== 'simulator')
  ))
  return { readAt: batch.readAt, entries }
}
