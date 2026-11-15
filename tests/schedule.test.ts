import { describe, expect, test } from 'vitest'
import { offeredTerms, planIssues, proposePlan, type PlanInput } from '../src/lib/schedule'
import type { Course, Major, Prereq } from '../src/lib/types'

const course = (base: string, prereq: Prereq | null = null, extra: Partial<Course> = {}): Course => ({
  code: base + 'L', base, prefix: base.split(' ')[0], title: base, credits: '3', liberalArts: true,
  description: '', offered: null, prereqText: prereq ? 'x' : null, coreqText: null, prereq, url: '', ...extra
})
const c = (code: string): Prereq => ({ kind: 'course', code })
const courses = new Map(
  [
    course('CMPT 120', null, { credits: '4' }),
    course('CMPT 220', c('CMPT 120'), { credits: '4' }),
    course('CMPT 221', c('CMPT 220'), { credits: '4', offered: 'Every spring.' }),
    course('MATH 205'),
    course('MATH 115'),
    course('MATH 130'),
    course('CMPT 435', { kind: 'all', of: [c('CMPT 221'), c('MATH 205')] }),
    course('CMPT 330', { kind: 'any', of: [c('MATH 115'), c('MATH 130')] }),
    course('CMPT 475', null, { prereqText: 'Senior standing.', prereq: { kind: 'text', text: 'Senior standing' } }),
    course('CMPT 404'),
    course('CMPT 405'),
    course('CMPT 406'),
    course('FYS 101', null, { credits: '4' }),
    course('ENG 120'),
    course('PHIL 101')
  ].map((x) => [x.base, x])
)
const major: Major = {
  id: 'cs', name: 'Computer Science', degree: 'B.S.', concentration: null, url: '',
  groups: [
    { title: 'Foundation', credits: null, courses: ['CMPT 120', 'CMPT 220', 'CMPT 221', 'CMPT 435', 'CMPT 330', 'CMPT 475'], notes: [] },
    { title: 'Choose one', credits: null, courses: ['CMPT 404', 'CMPT 405', 'CMPT 406'], notes: [], pick: { count: 1 } }
  ]
}
const input = (over: Partial<PlanInput> = {}): PlanInput => ({ major, courses, taken: new Set(), cart: [], start: 0, pins: {}, ...over })
const semOf = (p: ReturnType<typeof proposePlan>, id: string) => p.items.find((i) => i.id === id)?.semester

describe('offeredTerms', () => {
  test('reads fall-only, spring-only, both, and unknown', () => {
    expect(offeredTerms('Every fall.')).toEqual(['fall'])
    expect(offeredTerms('Spring')).toEqual(['spring'])
    expect(offeredTerms('Fall and spring.')).toBeNull()
    expect(offeredTerms('Every semester.')).toBeNull()
    expect(offeredTerms(null)).toBeNull()
  })
})

describe('proposePlan', () => {
  const p = proposePlan(input())

  test('every course comes after its prerequisites', () => {
    expect(semOf(p, 'CMPT 120')!).toBeLessThan(semOf(p, 'CMPT 220')!)
    expect(semOf(p, 'CMPT 220')!).toBeLessThan(semOf(p, 'CMPT 221')!)
    expect(semOf(p, 'CMPT 221')!).toBeLessThan(semOf(p, 'CMPT 435')!)
  })

  test('a prerequisite the major doesn’t list is added, marked as a prerequisite', () => {
    const m = p.items.find((i) => i.id === 'MATH 205')
    expect(m?.reason).toBe('prereq')
    expect(m!.semester!).toBeLessThan(semOf(p, 'CMPT 435')!)
  })

  test('an "A or B" prerequisite becomes a choice placed before the course, not a pick', () => {
    const slot = p.items.find((i) => i.kind === 'slot' && i.options?.includes('MATH 115'))
    expect(slot?.options).toEqual(['MATH 115', 'MATH 130'])
    expect(slot!.semester!).toBeLessThan(semOf(p, 'CMPT 330')!)
    expect(p.items.some((i) => i.id === 'MATH 115' || i.id === 'MATH 130')).toBe(false)
  })

  test('spring-only courses land in a spring semester', () => {
    expect(semOf(p, 'CMPT 221')! % 2).toBe(1)
  })

  test('"choose one" sections become one open choice listing every option', () => {
    const slots = p.items.filter((i) => i.kind === 'slot' && i.title.includes('Choose one'))
    expect(slots).toHaveLength(1)
    expect(slots[0].options).toEqual(['CMPT 404', 'CMPT 405', 'CMPT 406'])
  })

  test('"Senior standing" courses wait for the senior year', () => {
    expect(semOf(p, 'CMPT 475')!).toBeGreaterThanOrEqual(6)
  })

  test('single-course Core requirements are included', () => {
    expect(p.items.filter((i) => i.reason === 'core' && i.kind === 'course').map((i) => i.id).sort()).toEqual([
      'ENG 120',
      'FYS 101',
      'PHIL 101'
    ])
  })

  test('a major course that also counts toward a Core category covers it (no extra Core slot)', () => {
    // MATH 205 (added as a prerequisite) is a 200-level MATH course: it covers Core Mathematics
    expect(p.items.some((i) => i.id === 'core:math')).toBe(false)
    expect(p.items.some((i) => i.id === 'core:history')).toBe(true)
  })

  test('no semester goes over the credit limit', () => {
    for (const s of p.semesters) expect(s.credits).toBeLessThanOrEqual(16)
  })

  test('taken courses are left out and unlock their dependents from the start', () => {
    const q = proposePlan(input({ taken: new Set(['CMPT 120', 'CMPT 220']) }))
    expect(q.items.some((i) => i.id === 'CMPT 120')).toBe(false)
    expect(semOf(q, 'CMPT 221')).toBe(1)
  })

  test('nothing is placed before the starting semester', () => {
    const q = proposePlan(input({ start: 3 }))
    for (const i of q.items) if (i.semester !== null) expect(i.semester).toBeGreaterThanOrEqual(3)
  })

  test('cart courses go in the starting semester', () => {
    const q = proposePlan(input({ cart: ['MATH 205'] }))
    expect(semOf(q, 'MATH 205')).toBe(0)
  })

  test('a moved course stays where it was put, and a broken prerequisite is reported', () => {
    const q = proposePlan(input({ pins: { 'CMPT 220': 0 } }))
    expect(semOf(q, 'CMPT 220')).toBe(0)
    expect(planIssues(q, courses, new Set())['CMPT 220']).toEqual(['Needs CMPT 120 in an earlier semester'])
  })

  test('the generated plan itself has no prerequisite issues', () => {
    expect(planIssues(p, courses, new Set())).toEqual({})
  })
})

import { COURSE_BY_BASE, MAJOR_BY_ID } from '../src/data'

describe('proposePlan on real majors', () => {
  const real = (id: string) =>
    proposePlan({ major: MAJOR_BY_ID.get(id)!, courses: COURSE_BY_BASE, taken: new Set(), cart: [], start: 0, pins: {} })
  const cs = real('computer-science-bs--software-development')

  test('First Year Seminar and Writing for College go in the first year', () => {
    expect(semOf(cs, 'FYS 101')!).toBeLessThanOrEqual(1)
    expect(semOf(cs, 'ENG 120')!).toBeLessThanOrEqual(1)
  })

  test('the first year has no 300- or 400-level courses', () => {
    const early = cs.items.filter((i) => i.kind === 'course' && i.semester !== null && i.semester <= 1)
    expect(early.filter((i) => Number(i.id.split(' ')[1]) >= 300).map((i) => i.id)).toEqual([])
  })

  test('the load is spread over all eight semesters (none empty, none over 16)', () => {
    for (const s of cs.semesters) {
      expect(s.credits).toBeGreaterThan(0)
      expect(s.credits).toBeLessThanOrEqual(16)
    }
  })

  test("everything fits; the only issue is the catalog's own term conflict, and it is reported", () => {
    expect(cs.items.filter((i) => i.semester === null)).toEqual([])
    // CMPT 475 and CMPT 476 are both "Every fall", and 476 needs 475 first
    expect(planIssues(cs, COURSE_BY_BASE, new Set())).toEqual({ 'CMPT 476': ['Usually offered in fall only'] })
  })

  test('pooled areas become one set of choices for the shared total (Psychology: 16 credits)', () => {
    const psych = real('psychology-ba')
    const breadth = psych.items.filter((i) => i.title.startsWith('1.1 Breadth'))
    expect(breadth.reduce((n, i) => n + i.credits, 0)).toBeGreaterThanOrEqual(16)
    expect(breadth.reduce((n, i) => n + i.credits, 0)).toBeLessThan(20)
    expect(psych.items.filter((i) => i.semester === null)).toEqual([])
  })
})
