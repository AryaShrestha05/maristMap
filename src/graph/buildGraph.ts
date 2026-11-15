import { CORE, categoriesFor } from '../data/core'
import { coreProgress, groupProgress, status, type Status } from '../lib/plan'
import type { Course, Major, Prereq } from '../lib/types'

export type GroupBy = 'requirements' | 'departments'

export interface GNode {
  id: string
  kind: 'hub' | 'course'
  label: string
  /** courses only */
  status?: Status
  inCart?: boolean
  /** course listed by the major but not in the 2026–27 catalog */
  missing?: boolean
  /** Core hubs only */
  core?: boolean
  /** the Major and Core root hubs that tie their sections together */
  root?: boolean
  /** major section hubs: progress toward the section's rule */
  progress?: { done: number; needed: number; unit: 'courses' | 'credits' }
  satisfied?: boolean
}

export interface GEdge {
  source: string
  target: string
  kind: 'member' | 'prereq'
}

export interface GraphInput {
  major: Major
  courses: Map<string, Course>
  taken: Set<string>
  cart: Set<string>
  groupBy: GroupBy
  /** Core category whose approved courses are shown, or null (all Core hubs collapsed) */
  expandedCore: string | null
  /** more courses to show, e.g. the path to the selected course */
  extraCourses?: string[]
}

function prereqCodes(p: Prereq | null, out: string[] = []): string[] {
  if (!p) return out
  if (p.kind === 'course') out.push(p.code)
  else if (p.kind !== 'text') for (const x of p.of) prereqCodes(x, out)
  return out
}

/** Approved catalog courses for a Core category (named in the list, or matched by its rule). */
export function coreCourses(categoryId: string, courses: Map<string, Course>): string[] {
  const out: string[] = []
  for (const base of courses.keys()) if (categoriesFor(base, 99).includes(categoryId)) out.push(base)
  return out.sort()
}

export function buildGraph({ major, courses, taken, cart, groupBy, expandedCore, extraCourses = [] }: GraphInput): { nodes: GNode[]; edges: GEdge[] } {
  const nodes = new Map<string, GNode>()
  const edges: GEdge[] = []

  // which courses appear: major courses + direct prerequisites (+ an expanded Core category)
  const memberOf = new Map<string, string[]>() // course → hub ids (requirements grouping)
  const addMember = (base: string, hub: string): void => {
    const list = memberOf.get(base) ?? []
    if (!list.includes(hub)) list.push(hub)
    memberOf.set(base, list)
  }
  major.groups.forEach((g, i) => {
    for (const base of g.courses) addMember(base, `group:${i}`)
  })
  if (expandedCore) for (const base of coreCourses(expandedCore, courses)) addMember(base, `core:${expandedCore}`)

  const shown = new Set(memberOf.keys())
  for (const base of [...shown]) for (const p of prereqCodes(courses.get(base)?.prereq ?? null)) shown.add(p)
  for (const base of extraCourses) shown.add(base)

  // hubs
  if (groupBy === 'requirements') {
    nodes.set('root:major', { id: 'root:major', kind: 'hub', root: true, label: major.name })
    nodes.set('root:core', { id: 'root:core', kind: 'hub', root: true, label: 'Core requirements' })
    major.groups.forEach((g, i) => {
      const p = groupProgress(g, taken, courses)
      nodes.set(`group:${i}`, {
        id: `group:${i}`,
        kind: 'hub',
        label: g.title,
        satisfied: p.satisfied,
        progress: { done: p.done, needed: p.needed, unit: p.unit }
      })
      edges.push({ source: 'root:major', target: `group:${i}`, kind: 'member' })
    })
    const progress = new Map(coreProgress(taken, courses).map((p) => [p.categoryId, p.satisfiedBy]))
    for (const c of CORE) {
      nodes.set(`core:${c.id}`, {
        id: `core:${c.id}`,
        kind: 'hub',
        label: c.name,
        core: true,
        satisfied: progress.get(c.id) != null
      })
      edges.push({ source: 'root:core', target: `core:${c.id}`, kind: 'member' })
    }
  } else {
    for (const base of shown) {
      const prefix = base.split(' ')[0]
      nodes.set(`dept:${prefix}`, { id: `dept:${prefix}`, kind: 'hub', label: prefix })
    }
  }

  // courses
  for (const base of shown) {
    const course = courses.get(base)
    nodes.set(base, {
      id: base,
      kind: 'course',
      label: base,
      status: status(base, taken, courses),
      inCart: cart.has(base),
      missing: !course
    })
    if (groupBy === 'requirements') {
      for (const hub of memberOf.get(base) ?? []) edges.push({ source: hub, target: base, kind: 'member' })
    } else {
      edges.push({ source: `dept:${base.split(' ')[0]}`, target: base, kind: 'member' })
    }
  }

  // prerequisite lines (prerequisite → course), only between shown courses
  for (const base of shown) {
    for (const p of new Set(prereqCodes(courses.get(base)?.prereq ?? null))) {
      if (shown.has(p)) edges.push({ source: p, target: base, kind: 'prereq' })
    }
  }

  return { nodes: [...nodes.values()], edges }
}
