import { describe, expect, test } from 'vitest'
import { targetPositions } from '../src/graph/layout'
import type { GEdge, GNode } from '../src/graph/buildGraph'

const hub = (id: string, root = false): GNode => ({ id, kind: 'hub', label: id, root })
const course = (id: string): GNode => ({ id, kind: 'course', label: id, status: 'locked' })
const m = (source: string, target: string): GEdge => ({ source, target, kind: 'member' })
const p = (source: string, target: string): GEdge => ({ source, target, kind: 'prereq' })

const nodes: GNode[] = [
  hub('root:major', true),
  hub('group:0'),
  hub('group:1'),
  ...Array.from({ length: 10 }, (_, i) => course(`A ${100 + i}`)),
  ...Array.from({ length: 4 }, (_, i) => course(`B ${100 + i}`)),
  course('X 999'), // prerequisite-only, no group
  hub('root:core', true),
  hub('core:lit')
]
const edges: GEdge[] = [
  m('root:major', 'group:0'),
  m('root:major', 'group:1'),
  ...Array.from({ length: 10 }, (_, i) => m('group:0', `A ${100 + i}`)),
  ...Array.from({ length: 4 }, (_, i) => m('group:1', `B ${100 + i}`)),
  p('X 999', 'B 103'),
  m('root:core', 'core:lit')
]
const pos = targetPositions(nodes, edges)
const d = (a: string, b: string) => Math.hypot(pos.get(a)!.x - pos.get(b)!.x, pos.get(a)!.y - pos.get(b)!.y)

describe('targetPositions', () => {
  test('every node gets a finite position', () => {
    for (const n of nodes) {
      const q = pos.get(n.id)!
      expect(Number.isFinite(q.x) && Number.isFinite(q.y)).toBe(true)
    }
  })

  test("each course sits closer to its own section's hub than to any other hub", () => {
    for (let i = 0; i < 10; i++) expect(d(`A ${100 + i}`, 'group:0')).toBeLessThan(d(`A ${100 + i}`, 'group:1'))
    for (let i = 0; i < 4; i++) expect(d(`B ${100 + i}`, 'group:1')).toBeLessThan(d(`B ${100 + i}`, 'group:0'))
  })

  test('courses in a ring do not overlap', () => {
    for (let i = 0; i < 9; i++) expect(d(`A ${100 + i}`, `A ${101 + i}`)).toBeGreaterThan(14)
  })

  test('the major sits left of the Core', () => {
    expect(pos.get('root:major')!.x).toBeLessThan(pos.get('root:core')!.x)
    expect(pos.get('core:lit')!.x).toBeGreaterThan(pos.get('group:0')!.x)
  })

  test('a prerequisite-only course sits next to the course that needs it', () => {
    expect(d('X 999', 'B 103')).toBeLessThan(80)
  })

  test('departments mode (no roots): hubs spread around the center', () => {
    const dn: GNode[] = [hub('dept:A'), hub('dept:B'), course('A 1'), course('B 1')]
    const de: GEdge[] = [m('dept:A', 'A 1'), m('dept:B', 'B 1')]
    const q = targetPositions(dn, de)
    expect(Math.hypot(q.get('dept:A')!.x - q.get('dept:B')!.x, q.get('dept:A')!.y - q.get('dept:B')!.y)).toBeGreaterThan(60)
  })
})
