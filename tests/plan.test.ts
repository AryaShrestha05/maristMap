import { describe, expect, test } from 'vitest'
import { cartWarnings, extractCodes, prereqCheck, status, unlocks } from '../src/lib/plan'
import type { Course, Prereq } from '../src/lib/types'

const course = (base: string, prereq: Prereq | null = null, prereqText: string | null = null): Course => ({
  code: base + 'L',
  base,
  prefix: base.split(' ')[0],
  title: base,
  credits: '3',
  liberalArts: true,
  description: '',
  offered: null,
  prereqText,
  coreqText: null,
  prereq,
  url: ''
})
const c = (code: string): Prereq => ({ kind: 'course', code })
const list = [
  course('CMPT 120'),
  course('CMPT 220', c('CMPT 120'), 'CMPT 120L'),
  course('CMPT 221', c('CMPT 220'), 'CMPT 220L'),
  course('CMPT 435', { kind: 'all', of: [c('CMPT 221'), c('MATH 205')] }, 'CMPT 221L and MATH 205L'),
  course('CMPT 450', { kind: 'any', of: [c('CMPT 221'), { kind: 'text', text: 'permission of instructor' }] }, '…'),
  course('CMPT 499', { kind: 'text', text: 'Senior status' }, 'Senior status'),
  course('CMPT 480', null, 'CMPT 220L or CMPT 221L and MATH 205L'),
  course('MATH 205')
]
const courses = new Map(list.map((x) => [x.base, x]))
const taken = (...codes: string[]) => new Set(codes)

describe('prereqCheck', () => {
  test('no prerequisites → met', () => {
    expect(prereqCheck(null, taken())).toEqual({ met: true, missing: [] })
  })
  test('all / any / missing list', () => {
    const p = courses.get('CMPT 435')!.prereq
    expect(prereqCheck(p, taken('CMPT 221'))).toEqual({ met: false, missing: ['MATH 205'] })
    expect(prereqCheck(p, taken('CMPT 221', 'MATH 205'))).toEqual({ met: true, missing: [] })
  })
  test('any with a text alternative is met once the course is taken', () => {
    expect(prereqCheck(courses.get('CMPT 450')!.prereq, taken('CMPT 221')).met).toBe(true)
  })
  test('text-only condition cannot be checked → null', () => {
    expect(prereqCheck(courses.get('CMPT 499')!.prereq, taken()).met).toBeNull()
  })
})

describe('status', () => {
  test('taken / available / locked', () => {
    expect(status('CMPT 120', taken('CMPT 120'), courses)).toBe('taken')
    expect(status('CMPT 220', taken('CMPT 120'), courses)).toBe('available')
    expect(status('CMPT 221', taken('CMPT 120'), courses)).toBe('locked')
    expect(status('CMPT 120', taken(), courses)).toBe('available')
  })
  test('never "available" when we cannot tell', () => {
    expect(status('CMPT 499', taken(), courses)).toBe('locked') // text-only condition
    expect(status('CMPT 480', taken('CMPT 220', 'CMPT 221', 'MATH 205'), courses)).toBe('locked') // unparsed text
  })
  test('a course missing from the catalog is locked, not a crash', () => {
    expect(status('ENG 999', taken(), courses)).toBe('locked')
  })
})

describe('unlocks', () => {
  test('courses that name this one as a prerequisite', () => {
    expect(unlocks('CMPT 221', list).sort()).toEqual(['CMPT 435', 'CMPT 450'])
  })
})

describe('extractCodes (DegreeWorks paste)', () => {
  test('finds real catalog courses, de-duplicated, in order', () => {
    const text = 'CMPT 220L Software Development I A 4.0\nCMPT220 again\nMATH 205 B+\nXYZ 101 junk\nStill needed: 1 Class in CMPT 4@'
    expect(extractCodes(text, courses)).toEqual(['CMPT 220', 'MATH 205'])
  })
  test('junk and empty input', () => {
    expect(extractCodes('', courses)).toEqual([])
    expect(extractCodes('no codes here at all', courses)).toEqual([])
  })
})

describe('cartWarnings', () => {
  test('lists missing prerequisites per cart course; fine courses are absent', () => {
    expect(cartWarnings(['CMPT 435', 'CMPT 220'], taken('CMPT 120', 'CMPT 221'), courses)).toEqual({
      'CMPT 435': ['MATH 205']
    })
  })
  test('unparsed prerequisite text produces a check-it-yourself warning', () => {
    expect(cartWarnings(['CMPT 480'], taken(), courses)).toEqual({ 'CMPT 480': ['Check the prerequisite text'] })
  })
})
