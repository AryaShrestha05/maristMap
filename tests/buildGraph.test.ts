import { describe, expect, test } from 'vitest'
import { buildGraph } from '../src/graph/buildGraph'
import type { Course, Major, Prereq } from '../src/lib/types'

const course = (base: string, prereq: Prereq | null = null): Course => ({
  code: base + 'L', base, prefix: base.split(' ')[0], title: base, credits: '3', liberalArts: true,
  description: '', offered: null, prereqText: prereq ? 'x' : null, coreqText: null, prereq, url: ''
})
const c = (code: string): Prereq => ({ kind: 'course', code })
const courses = new Map(
  [
    course('CMPT 120'),
    course('CMPT 220', c('CMPT 120')),
    course('CMPT 221', c('CMPT 220')),
    course('MATH 205'),
    course('CMPT 435', { kind: 'all', of: [c('CMPT 221'), c('MATH 205')] }),
    course('ENG 170'),
    course('ENG 210')
  ].map((x) => [x.base, x])
)
const major: Major = {
  id: 'cs', name: 'Computer Science', degree: 'B.S.', concentration: null, url: '',
  groups: [
    { title: 'Foundation', credits: '12', courses: ['CMPT 120', 'CMPT 220', 'CMPT 221'], notes: [] },
    { title: 'Upper level', credits: '3', courses: ['CMPT 435', 'CMPT 999'], notes: [] }
  ]
}
const ids = (g: ReturnType<typeof buildGraph>, kind: string) => g.nodes.filter((n) => n.kind === kind).map((n) => n.id).sort()

describe('buildGraph — requirements', () => {
  const g = buildGraph({ major, courses, taken: new Set(['CMPT 120']), cart: new Set(['CMPT 220']), groupBy: 'requirements', expandedCore: null })

  test('a hub per requirement group and per Core category', () => {
    expect(ids(g, 'hub')).toContain('group:Foundation')
    expect(ids(g, 'hub')).toContain('group:Upper level')
    expect(ids(g, 'hub')).toContain('core:literature')
  })

  test("major courses plus their direct prerequisites; Core courses stay collapsed", () => {
    expect(ids(g, 'course')).toEqual(['CMPT 120', 'CMPT 220', 'CMPT 221', 'CMPT 435', 'CMPT 999', 'MATH 205'])
  })

  test('statuses and cart flag', () => {
    const byId = new Map(g.nodes.map((n) => [n.id, n]))
    expect(byId.get('CMPT 120')?.status).toBe('taken')
    expect(byId.get('CMPT 220')?.status).toBe('available')
    expect(byId.get('CMPT 220')?.inCart).toBe(true)
    expect(byId.get('CMPT 435')?.status).toBe('locked')
    expect(byId.get('CMPT 999')?.missing).toBe(true) // not in the catalog
  })

  test('member edges from hubs, prereq edges between courses', () => {
    expect(g.edges).toContainEqual({ source: 'group:Foundation', target: 'CMPT 220', kind: 'member' })
    expect(g.edges).toContainEqual({ source: 'CMPT 221', target: 'CMPT 435', kind: 'prereq' })
    expect(g.edges).toContainEqual({ source: 'MATH 205', target: 'CMPT 435', kind: 'prereq' })
  })

  test('a Core hub knows if it is satisfied', () => {
    const lit = g.nodes.find((n) => n.id === 'core:literature')!
    expect(lit.satisfied).toBe(false)
    const g2 = buildGraph({ major, courses, taken: new Set(['ENG 170']), cart: new Set(), groupBy: 'requirements', expandedCore: null })
    expect(g2.nodes.find((n) => n.id === 'core:literature')!.satisfied).toBe(true)
  })
})

describe('buildGraph — expanding a Core category', () => {
  test('its catalog courses join the graph as members of that hub', () => {
    const g = buildGraph({ major, courses, taken: new Set(), cart: new Set(), groupBy: 'requirements', expandedCore: 'literature' })
    expect(ids(g, 'course')).toContain('ENG 170')
    expect(ids(g, 'course')).toContain('ENG 210')
    expect(g.edges).toContainEqual({ source: 'core:literature', target: 'ENG 170', kind: 'member' })
  })
})

describe('buildGraph — departments', () => {
  test('hubs are prefixes; same courses', () => {
    const g = buildGraph({ major, courses, taken: new Set(), cart: new Set(), groupBy: 'departments', expandedCore: null })
    expect(ids(g, 'hub')).toEqual(['dept:CMPT', 'dept:MATH'])
    expect(g.edges).toContainEqual({ source: 'dept:MATH', target: 'MATH 205', kind: 'member' })
  })
})
