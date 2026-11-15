import { describe, expect, test } from 'vitest'
import { DEFAULT_STATE, decodeState, encodeState } from '../src/state'

describe('saved state', () => {
  test('round trip', () => {
    const s = { ...DEFAULT_STATE, majorId: 'cs-bs', taken: ['CMPT 120'], cart: ['CMPT 220'], theme: 'red' as const }
    expect(decodeState(encodeState(s), ['cs-bs'])).toEqual(s)
  })

  test('nothing saved → defaults', () => {
    expect(decodeState(null, [])).toEqual(DEFAULT_STATE)
  })

  test('corrupted JSON → defaults', () => {
    expect(decodeState('{not json', [])).toEqual(DEFAULT_STATE)
  })

  test('a major that no longer exists is dropped, the rest is kept', () => {
    const saved = encodeState({ ...DEFAULT_STATE, majorId: 'gone', taken: ['CMPT 120'] })
    expect(decodeState(saved, ['cs-bs'])).toEqual({ ...DEFAULT_STATE, taken: ['CMPT 120'] })
  })

  test('wrong field types are replaced by defaults', () => {
    const saved = JSON.stringify({ v: 1, majorId: 5, taken: 'x', cart: [1, 'CMPT 220'], theme: 'blue', view: 'graph', groupBy: 'nope' })
    expect(decodeState(saved, [])).toEqual({ ...DEFAULT_STATE, cart: ['CMPT 220'] })
  })
})
