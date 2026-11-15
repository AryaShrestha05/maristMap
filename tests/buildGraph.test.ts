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
    expect(ids(g, 'hub')).toContain('group:0')
    expect(ids(g, 'hub')).toContain('group:1')
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
    expect(g.edges).toContainEqual({ source: 'group:0', target: 'CMPT 220', kind: 'member' })
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

describe('buildGraph — groups with the same title', () => {
  test('stay separate hubs', () => {
    const twin: Major = { ...major, groups: [
      { title: 'Choice of either', credits: null, courses: ['CMPT 120'], notes: [] },
      { title: 'Choice of either', credits: null, courses: ['CMPT 220'], notes: [] }
    ] }
    const g = buildGraph({ major: twin, courses, taken: new Set(), cart: new Set(), groupBy: 'requirements', expandedCore: null })
    const hubs = g.nodes.filter((n) => n.kind === 'hub' && !n.core && !n.root)
    expect(hubs).toHaveLength(2)
    expect(hubs.map((h) => h.label)).toEqual(['Choice of either', 'Choice of either'])
  })
})

describe('buildGraph — root hubs', () => {
  const g = buildGraph({ major, courses, taken: new Set(), cart: new Set(), groupBy: 'requirements', expandedCore: null })
  test('a Major root links every requirement group; a Core root links every Core category', () => {
    const root = g.nodes.find((n) => n.id === 'root:major')!
    expect(root).toMatchObject({ kind: 'hub', root: true, label: 'Computer Science' })
    expect(g.nodes.find((n) => n.id === 'root:core')).toMatchObject({ kind: 'hub', root: true, label: 'Core requirements' })
    expect(g.edges).toContainEqual({ source: 'root:major', target: 'group:0', kind: 'member' })
    expect(g.edges).toContainEqual({ source: 'root:core', target: 'core:literature', kind: 'member' })
  })
})

describe('buildGraph — extra courses (a path being shown)', () => {
  test('extra courses join the map with their prerequisite lines', () => {
    const small: Major = { ...major, groups: [{ title: 'G', credits: null, courses: ['CMPT 435'], notes: [] }] }
    const g = buildGraph({ major: small, courses, taken: new Set(), cart: new Set(), groupBy: 'requirements', expandedCore: null, extraCourses: ['CMPT 120', 'CMPT 220'] })
    expect(ids(g, 'course')).toEqual(['CMPT 120', 'CMPT 220', 'CMPT 221', 'CMPT 435', 'MATH 205'])
    expect(g.edges).toContainEqual({ source: 'CMPT 120', target: 'CMPT 220', kind: 'prereq' })
    expect(g.edges).toContainEqual({ source: 'CMPT 220', target: 'CMPT 221', kind: 'prereq' })
  })
})

describe('buildGraph — section progress', () => {
  test('a section hub is satisfied once its rule is met, and carries its progress', () => {
    const m: Major = { ...major, groups: [{ title: 'Pick one', credits: null, courses: ['CMPT 120', 'MATH 205'], notes: [], pick: { count: 1 } }] }
    const before = buildGraph({ major: m, courses, taken: new Set(), cart: new Set(), groupBy: 'requirements', expandedCore: null })
    expect(before.nodes.find((n) => n.id === 'group:0')).toMatchObject({ satisfied: false, progress: { done: 0, needed: 1, unit: 'courses' } })
    const after = buildGraph({ major: m, courses, taken: new Set(['MATH 205']), cart: new Set(), groupBy: 'requirements', expandedCore: null })
    expect(after.nodes.find((n) => n.id === 'group:0')).toMatchObject({ satisfied: true })
  })
})

describe('buildGraph — major courses that also count toward Core', () => {
  const both: Major = {
    ...major,
    groups: [{ title: 'Related', credits: '6', courses: ['MATH 205', 'ENG 170', 'CMPT 120'], notes: [] }]
  }
  const coreEdges = (g: ReturnType<typeof buildGraph>) =>
    g.edges.filter((e) => e.kind === 'core').map((e) => `${e.source}>${e.target}${e.active ? ' active' : ''}`).sort()

  test('a line from each such course to its Core category; faint until taken', () => {
    const g = buildGraph({ major: both, courses, taken: new Set(), cart: new Set(), groupBy: 'requirements', expandedCore: null })
    expect(coreEdges(g)).toEqual(['ENG 170>core:literature', 'MATH 205>core:math'])
  })

  test('taking the course makes its line active (it is what satisfies that category)', () => {
    const g = buildGraph({ major: both, courses, taken: new Set(['ENG 170']), cart: new Set(), groupBy: 'requirements', expandedCore: null })
    expect(coreEdges(g)).toEqual(['ENG 170>core:literature active', 'MATH 205>core:math'])
  })

  test('no duplicate line when that Core category is expanded (the course is already its member)', () => {
    const g = buildGraph({ major: both, courses, taken: new Set(), cart: new Set(), groupBy: 'requirements', expandedCore: 'literature' })
    expect(coreEdges(g)).toEqual(['MATH 205>core:math'])
  })

  test('none when grouped by department (there are no Core circles)', () => {
    const g = buildGraph({ major: both, courses, taken: new Set(), cart: new Set(), groupBy: 'departments', expandedCore: null })
    expect(coreEdges(g)).toEqual([])
  })
})
