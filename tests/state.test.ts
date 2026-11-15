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

import { decodeShare, encodeShare } from '../src/state'

describe('share link', () => {
  const ids = ['cs-sd', 'fin']
  const plan = { majorId: 'cs-sd', taken: ['CMPT 120', 'MATH 205'], cart: ['CMPT 221'] }

  test('round-trips major, taken and cart', () => {
    expect(decodeShare(encodeShare(plan), ids)).toEqual(plan)
  })

  test('hash starts with #plan=', () => {
    expect(encodeShare(plan).startsWith('#plan=')).toBe(true)
  })

  test('no plan in the hash → null', () => {
    expect(decodeShare('', ids)).toBeNull()
    expect(decodeShare('#other', ids)).toBeNull()
  })

  test('garbage or an unknown major → null, never throws', () => {
    expect(decodeShare('#plan=%7Bnot json', ids)).toBeNull()
    expect(decodeShare('#plan=%E0%A4%A', ids)).toBeNull()
    expect(decodeShare(encodeShare({ ...plan, majorId: 'gone' }), ids)).toBeNull()
  })

  test('non-string entries are dropped', () => {
    const raw = '#plan=' + encodeURIComponent(JSON.stringify({ m: 'fin', t: ['ACCT 203', 5, null], c: 'x' }))
    expect(decodeShare(raw, ids)).toEqual({ majorId: 'fin', taken: ['ACCT 203'], cart: [] })
  })
})

describe('saved plan settings', () => {
  test('plan view, start semester and moved courses are kept', () => {
    const s = { ...DEFAULT_STATE, view: 'plan' as const, planStart: 3, planPins: { 'CMPT 220': 4 } }
    const back = decodeState(encodeState(s), [])
    expect(back.view).toBe('plan')
    expect(back.planStart).toBe(3)
    expect(back.planPins).toEqual({ 'CMPT 220': 4 })
  })

  test('bad values fall back: start outside 0–7, non-numeric or out-of-range moves', () => {
    const raw = JSON.stringify({ planStart: 12, planPins: { a: 2, b: 'x', c: 9, d: -1 } })
    const back = decodeState(raw, [])
    expect(back.planStart).toBeNull()
    expect(back.planPins).toEqual({ a: 2 })
  })
})
