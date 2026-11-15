import { describe, expect, test } from 'vitest'
import { parsePrereq } from '../src/lib/parseCourse'

const c = (code: string) => ({ kind: 'course', code })

describe('parsePrereq', () => {
  test('a single course, suffix dropped', () => {
    expect(parsePrereq('CMPT 436N')).toEqual(c('CMPT 436'))
  })

  test('and → all', () => {
    expect(parsePrereq('CMPT 220L and MATH 205L')).toEqual({ kind: 'all', of: [c('CMPT 220'), c('MATH 205')] })
  })

  test('or → any', () => {
    expect(parsePrereq('MATH 130L or MATH 241L')).toEqual({ kind: 'any', of: [c('MATH 130'), c('MATH 241')] })
  })

  test('parentheses group', () => {
    expect(parsePrereq('CMPT 221L and (MATH 205L or MATH 210L)')).toEqual({
      kind: 'all',
      of: [c('CMPT 221'), { kind: 'any', of: [c('MATH 205'), c('MATH 210')] }]
    })
  })

  test('comma list with a final and', () => {
    expect(parsePrereq('ACCT 203N, ACCT 204N, and BUS 320N')).toEqual({
      kind: 'all',
      of: [c('ACCT 203'), c('ACCT 204'), c('BUS 320')]
    })
  })

  test('minimum grade wording is ignored', () => {
    expect(parsePrereq('CMPT 220L with a grade of C or better')).toEqual(c('CMPT 220'))
    expect(parsePrereq('A minimum grade of C in ENG 120L')).toEqual(c('ENG 120'))
  })

  test('non-course alternatives become text', () => {
    expect(parsePrereq('CMPT 220L or permission of instructor')).toEqual({
      kind: 'any',
      of: [c('CMPT 220'), { kind: 'text', text: 'permission of instructor' }]
    })
  })

  test('no course codes at all → text', () => {
    expect(parsePrereq('Three years of high school mathematics')).toEqual({
      kind: 'text',
      text: 'Three years of high school mathematics'
    })
  })

  test('trailing period and spaces are trimmed', () => {
    expect(parsePrereq(' CMPT 436N. ')).toEqual(c('CMPT 436'))
  })

  test('mixed and/or without parentheses is ambiguous → null', () => {
    expect(parsePrereq('CMPT 220L or CMPT 221L and MATH 205L')).toBeNull()
  })

  test('codes inside free text that we cannot structure → null', () => {
    expect(parsePrereq('Junior standing; CMPT 220L recommended but not required')).toBeNull()
  })

  test('empty → null', () => {
    expect(parsePrereq('')).toBeNull()
    expect(parsePrereq('None')).toBeNull()
  })
})
