import { describe, expect, test } from 'vitest'
import { pathTo } from '../src/lib/plan'
import type { Course, Prereq } from '../src/lib/types'

const course = (base: string, prereq: Prereq | null = null, prereqText: string | null = prereq ? 'x' : null): Course => ({
  code: base + 'L', base, prefix: base.split(' ')[0], title: base, credits: '3', liberalArts: true,
  description: '', offered: null, prereqText, coreqText: null, prereq, url: ''
})
const c = (code: string): Prereq => ({ kind: 'course', code })
const courses = new Map(
  [
    course('CMPT 120'),
    course('CMPT 220', c('CMPT 120')),
    course('CMPT 221', c('CMPT 220')),
    course('MATH 205'),
    course('CMPT 435', { kind: 'all', of: [c('CMPT 221'), c('MATH 205')] }),
    course('MATH 130'),
    course('MATH 241'),
    course('DATA 300', { kind: 'all', of: [c('CMPT 120'), { kind: 'any', of: [c('MATH 130'), c('MATH 241')] }] }),
    course('CMPT 450', { kind: 'any', of: [c('CMPT 221'), { kind: 'text', text: 'permission of instructor' }] }),
    course('CMPT 499', null, 'Senior status and a faculty sponsor'),
    course('LOOP 101', c('LOOP 102')),
    course('LOOP 102', c('LOOP 101'))
  ].map((x) => [x.base, x])
)

describe('pathTo', () => {
  test('every missing course in the chain, prerequisites first', () => {
    expect(pathTo('CMPT 435', new Set(), courses)).toEqual([
      { kind: 'course', code: 'CMPT 120' },
      { kind: 'course', code: 'CMPT 220' },
      { kind: 'course', code: 'CMPT 221' },
      { kind: 'course', code: 'MATH 205' }
    ])
  })

  test('taken courses (and everything behind them) drop out', () => {
    expect(pathTo('CMPT 435', new Set(['CMPT 220']), courses)).toEqual([
      { kind: 'course', code: 'CMPT 221' },
      { kind: 'course', code: 'MATH 205' }
    ])
  })

  test('a choice stays a choice', () => {
    expect(pathTo('DATA 300', new Set(), courses)).toEqual([
      { kind: 'course', code: 'CMPT 120' },
      { kind: 'choice', options: ['MATH 130', 'MATH 241'], alternatives: [] }
    ])
    expect(pathTo('DATA 300', new Set(['MATH 241', 'CMPT 120']), courses)).toEqual([])
  })

  test('a choice with a non-course alternative keeps it', () => {
    expect(pathTo('CMPT 450', new Set(), courses)).toEqual([
      { kind: 'choice', options: ['CMPT 221'], alternatives: ['permission of instructor'] }
    ])
  })

  test('unreadable prerequisite text becomes a condition step', () => {
    expect(pathTo('CMPT 499', new Set(), courses)).toEqual([
      { kind: 'condition', text: 'Senior status and a faculty sponsor', forCourse: 'CMPT 499' }
    ])
  })

  test('circular prerequisites in the data do not loop forever', () => {
    expect(pathTo('LOOP 101', new Set(), courses).length).toBeLessThan(3)
  })

  test('a course with nothing missing has an empty path', () => {
    expect(pathTo('CMPT 120', new Set(), courses)).toEqual([])
  })
})
