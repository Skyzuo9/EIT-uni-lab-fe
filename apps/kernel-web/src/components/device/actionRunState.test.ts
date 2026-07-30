import { describe, expect, it } from 'vitest'

import {
  actionDraftStorageKey,
  defaultActionParameters,
  parseActionParameters,
  projectJobLogs,
  readActionDraft,
  writeActionDraft
} from './actionRunState'

describe('device action run state', () => {
  it('keeps a separate persisted parameter draft for every action', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    }
    const aspirateKey = actionDraftStorageKey(
      'local-python',
      'http://127.0.0.1:8014',
      'pump-1',
      'aspirate'
    )
    const dispenseKey = actionDraftStorageKey(
      'local-python',
      'http://127.0.0.1:8014',
      'pump-1',
      'dispense'
    )

    writeActionDraft(storage, aspirateKey, '{"volume": 12}')
    writeActionDraft(storage, dispenseKey, '{"volume": 4}')

    expect(readActionDraft(storage, aspirateKey, '{}')).toBe('{"volume": 12}')
    expect(readActionDraft(storage, dispenseKey, '{}')).toBe('{"volume": 4}')
  })

  it('builds compact JSON parameters from action defaults', () => {
    expect(defaultActionParameters({
      schema: {},
      goalDefault: { volume: 10, wait: false },
      actionType: 'test.action.Aspirate',
      isBusy: false,
      currentJobId: null
    })).toBe('{\n  "volume": 10,\n  "wait": false\n}')

    expect(parseActionParameters('{"volume": 10}')).toEqual({ volume: 10 })
    expect(() => parseActionParameters('[]')).toThrow('JSON 对象')
  })

  it('never drops traceback, info, warning, feedback or return values', () => {
    const logs = projectJobLogs({
      jobId: 'job-1',
      status: 'failed',
      feedback: { progress: 0.5 },
      result: {
        info: ['pump started', 'pressure stable'],
        warning: 'pressure near limit',
        error: 'Traceback (most recent call last):\nRuntimeError: blocked',
        return_value: { moved_volume: 8 }
      }
    })

    expect(logs).toEqual(expect.arrayContaining([
      {
        level: 'info',
        message: 'feedback.progress: 0.5'
      },
      {
        level: 'info',
        message: 'result.info[0]: pump started'
      },
      {
        level: 'warning',
        message: 'result.warning: pressure near limit'
      },
      {
        level: 'error',
        message: expect.stringContaining('Traceback')
      },
      {
        level: 'result',
        message: 'result.return_value.moved_volume: 8'
      }
    ]))
  })
})
