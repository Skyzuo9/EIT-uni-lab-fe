import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface NativeLogEvidence {
  name: string
  content: string
}

interface PublicEnvelope<Value> {
  code: number
  data?: Value
}

export interface BrowserJsonResult {
  status: number
  body: unknown
}

/**
 * 读取一个公开成功 envelope。
 *
 * @param url 公共接口地址。
 * @returns `code=0` 的 data。
 * @throws HTTP 或业务 code 非成功、data 缺失时抛出。
 */
export async function readPublicEnvelope<Value>(url: string): Promise<Value> {
  const response = await fetch(url)
  const envelope = await response.json() as PublicEnvelope<Value>
  if (!response.ok || envelope.code !== 0 || envelope.data === undefined) {
    throw new Error(`公共接口读取失败：${url} ${response.status}`)
  }
  return envelope.data
}

/**
 * 向公开接口提交 JSON 并读取成功 envelope。
 *
 * @param url 公共接口地址。
 * @param body JSON 请求体。
 * @returns `code=0` 的 data。
 * @throws HTTP/业务失败或 data 缺失时抛出。
 */
export async function postPublicEnvelope<Value>(
  url: string,
  body: unknown
): Promise<Value> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  const envelope = await response.json() as PublicEnvelope<Value>
  if (!response.ok || envelope.code !== 0 || envelope.data === undefined) {
    throw new Error(`公共接口提交失败：${url} ${response.status}`)
  }
  return envelope.data
}

/**
 * 在浏览器上下文发出 JSON 请求。
 *
 * @param request 完整 URL 与 HTTP 方法。
 * @returns HTTP 状态和解析后的 JSON body。
 * @throws 网络失败或响应不是 JSON 时原样抛出。
 */
export async function requestJsonInBrowser(
  request: { url: string; method: string }
): Promise<BrowserJsonResult> {
  const response = await fetch(request.url, { method: request.method })
  return { status: response.status, body: await response.json() }
}

/** 拼接 native 日志以检查 Python traceback。 */
export function joinNativeLogs(entries: readonly NativeLogEvidence[]): string {
  let joined = ''
  for (const entry of entries) {
    joined += `# ${entry.name}\n${entry.content}\n`
  }
  return joined
}

/**
 * 将本轮公共合同证据写到 E2E artifact 目录。
 *
 * @param value 修订、命令、身份和网络账本。
 * @returns 无。
 * @throws 目录或文件不可写时原样抛出。
 */
export function writeF05Evidence(value: unknown): void {
  const artifactDirectory = resolve(
    process.env.UNILAB_E2E_ARTIFACT_DIR ||
      resolve(process.cwd(), '../e2e-artifacts/f05-material-source-public')
  )
  mkdirSync(artifactDirectory, { recursive: true })
  writeFileSync(
    resolve(artifactDirectory, 'evidence.json'),
    `${JSON.stringify(value, null, 2)}\n`
  )
}

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
