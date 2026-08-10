import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from 'node:crypto'
import {
  mkdir,
  open,
  readFile,
  rename,
  rm
} from 'node:fs/promises'
import path from 'node:path'

export const REMOTE_ACCESS_SCHEMA = 'unilab-workbench-remote-access/v1'
export const DEFAULT_REMOTE_TOKEN_TTL_MS = 12 * 60 * 60 * 1000

export class RemoteAccessError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RemoteAccessError'
    this.code = code
  }
}

/**
 * Create a per-start capability whose signed payload is bound to the exact
 * Workbench facade PID, listening port and generation.
 */
export function createRemoteCapabilityAuthority({
  pid = process.pid,
  port,
  generation = randomUUID(),
  ttlMs = DEFAULT_REMOTE_TOKEN_TTL_MS,
  now = () => Date.now(),
  secret = randomBytes(32),
  nonce = randomBytes(18).toString('base64url')
}) {
  assertPositiveInteger(pid, 'pid')
  assertPort(port)
  if (typeof generation !== 'string' || generation.length < 16) {
    throw new RemoteAccessError('invalid_generation', 'Remote generation is invalid')
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000) {
    throw new RemoteAccessError('invalid_ttl', 'Remote token TTL is invalid')
  }
  if (!Buffer.isBuffer(secret) || secret.length < 32) {
    throw new RemoteAccessError('invalid_secret', 'Remote capability secret is invalid')
  }
  const issuedAt = now()
  const expiresAt = issuedAt + ttlMs
  const payload = Object.freeze({
    version: 1,
    pid,
    port,
    generation,
    issuedAt,
    expiresAt,
    nonce
  })
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = signPayload(encodedPayload, secret)
  const token = `${encodedPayload}.${signature}`

  return Object.freeze({
    identity: payload,
    token,
    tokenDigest: createHash('sha256').update(token).digest('hex'),
    validate(candidate) {
      return validateRemoteCapability(candidate, {
        secret,
        expected: payload,
        now
      })
    }
  })
}

export function validateRemoteCapability(candidate, {
  secret,
  expected,
  now = () => Date.now()
}) {
  if (typeof candidate !== 'string' || candidate.length > 2_048) {
    return { valid: false, code: 'malformed' }
  }
  const parts = candidate.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, code: 'malformed' }
  }
  const expectedSignature = Buffer.from(signPayload(parts[0], secret), 'base64url')
  let actualSignature
  try {
    actualSignature = Buffer.from(parts[1], 'base64url')
  } catch {
    return { valid: false, code: 'malformed' }
  }
  if (
    actualSignature.length !== expectedSignature.length
    || !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return { valid: false, code: 'signature' }
  }
  let payload
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  } catch {
    return { valid: false, code: 'malformed' }
  }
  if (!validCapabilityPayload(payload)) {
    return { valid: false, code: 'malformed' }
  }
  if (
    payload.pid !== expected.pid
    || payload.port !== expected.port
    || payload.generation !== expected.generation
  ) {
    return { valid: false, code: 'identity_mismatch' }
  }
  const currentTime = now()
  if (currentTime < payload.issuedAt - 30_000) {
    return { valid: false, code: 'not_yet_valid' }
  }
  if (currentTime >= payload.expiresAt) {
    return { valid: false, code: 'expired' }
  }
  return { valid: true, payload }
}

/**
 * Persist only a capability digest and process identity. The raw token remains
 * in memory and in the explicit secret-delivery channel selected by the user.
 */
export async function acquireRemoteAccessLease({
  workspacePath,
  identity,
  tokenDigest,
  backendPort,
  publicOrigin,
  now = () => new Date(),
  processAlive = defaultProcessAlive
}) {
  const stateRoot = path.join(path.resolve(workspacePath), '.unilabos')
  const runtimeDirectory = path.join(stateRoot, 'runtime')
  const recoveryDirectory = path.join(stateRoot, 'recovery')
  const metadataPath = path.join(runtimeDirectory, 'remote-access.json')
  await Promise.all([
    mkdir(runtimeDirectory, { recursive: true }),
    mkdir(recoveryDirectory, { recursive: true })
  ])
  const metadata = {
    schema: REMOTE_ACCESS_SCHEMA,
    pid: identity.pid,
    port: identity.port,
    backendPort,
    generation: identity.generation,
    issuedAt: new Date(identity.issuedAt).toISOString(),
    expiresAt: new Date(identity.expiresAt).toISOString(),
    publicOrigin,
    tokenSha256: tokenDigest
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = await open(metadataPath, 'wx', 0o600)
      try {
        await descriptor.writeFile(`${JSON.stringify(metadata, null, 2)}\n`)
        await descriptor.sync()
      } finally {
        await descriptor.close()
      }
      return Object.freeze({
        metadata,
        metadataPath,
        async release() {
          await releaseRemoteAccessLease(metadataPath, metadata)
        }
      })
    } catch (error) {
      if (!isErrorCode(error, 'EEXIST')) throw error
      const existing = await readRemoteAccessMetadata(metadataPath)
      if (existing && processAlive(existing.pid)) {
        throw new RemoteAccessError(
          'remote_already_running',
          `Workspace already has a live remote Workbench process (pid=${existing.pid}, port=${existing.port})`
        )
      }
      const recoveryPath = path.join(
        recoveryDirectory,
        `stale-remote-access-${timestampId(now())}-${randomUUID()}.json`
      )
      try {
        await rename(metadataPath, recoveryPath)
      } catch (renameError) {
        if (!isErrorCode(renameError, 'ENOENT')) throw renameError
      }
    }
  }
  throw new RemoteAccessError(
    'lease_race',
    'Remote Workbench lease changed while startup was acquiring it'
  )
}

export async function readRemoteAccessMetadata(metadataPath) {
  try {
    const value = JSON.parse(await readFile(metadataPath, 'utf8'))
    if (
      !value
      || value.schema !== REMOTE_ACCESS_SCHEMA
      || !Number.isSafeInteger(value.pid)
      || !Number.isSafeInteger(value.port)
      || typeof value.generation !== 'string'
    ) return null
    return value
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return null
    return null
  }
}

async function releaseRemoteAccessLease(metadataPath, identity) {
  const current = await readRemoteAccessMetadata(metadataPath)
  if (
    !current
    || current.pid !== identity.pid
    || current.port !== identity.port
    || current.generation !== identity.generation
  ) return false
  await rm(metadataPath, { force: true })
  return true
}

function validCapabilityPayload(value) {
  return Boolean(
    value
    && value.version === 1
    && Number.isSafeInteger(value.pid)
    && Number.isSafeInteger(value.port)
    && typeof value.generation === 'string'
    && Number.isSafeInteger(value.issuedAt)
    && Number.isSafeInteger(value.expiresAt)
    && typeof value.nonce === 'string'
  )
}

function signPayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function defaultProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !isErrorCode(error, 'ESRCH')
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RemoteAccessError(`invalid_${name}`, `Remote ${name} is invalid`)
  }
}

function assertPort(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new RemoteAccessError('invalid_port', 'Remote port is invalid')
  }
}

function timestampId(date) {
  return date.toISOString().replace(/[:.]/gu, '-')
}

function isErrorCode(error, code) {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && error.code === code
  )
}
