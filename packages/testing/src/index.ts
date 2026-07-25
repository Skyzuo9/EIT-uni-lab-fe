import {
  getDefaultBackend,
  type BackendConfig
} from '@unilab/services'

export function createTestBackend(
  overrides: Partial<BackendConfig> = {}
): BackendConfig {
  return {
    ...getDefaultBackend('local-python'),
    id: 'test',
    name: 'Test backend',
    ...overrides
  }
}

export interface Deferred<Value> {
  promise: Promise<Value>
  resolve: (value: Value | PromiseLike<Value>) => void
  reject: (reason?: unknown) => void
}

export function createDeferred<Value>(): Deferred<Value> {
  let resolve!: Deferred<Value>['resolve']
  let reject!: Deferred<Value>['reject']
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
