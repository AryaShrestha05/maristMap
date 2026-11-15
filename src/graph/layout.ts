import { forceCollide, forceSimulation, forceX, forceY, type Simulation } from 'd3-force'
import type { GEdge, GNode } from './buildGraph'

export interface SimNode {
  id: string
  kind: GNode['kind']
  radius: number
  root?: boolean
  /** where the structured layout wants this node */
  tx: number
  /** section hubs: radius of their ring of courses (labels go outside it) */
  ring?: number
  /** courses on a ring: the hub they circle (labels point away from it) */
  hub?: string
  ty: number
  x: number
  y: number
  vx?: number
  vy?: number
}
export interface SimLink {
  source: SimNode
  target: SimNode
  kind: GEdge['kind']
  active?: boolean
}

export const ROOT_RADIUS = 20
export const HUB_RADIUS = 12
export const CORE_RADIUS = 10
export const COURSE_RADIUS = 6

const radiusOf = (n: GNode): number =>
  n.root ? ROOT_RADIUS : n.kind === 'hub' ? (n.core ? CORE_RADIUS : HUB_RADIUS) : COURSE_RADIUS

/** spacing between neighboring courses on a ring */
const COURSE_GAP = 26
/** radius of the ring of courses around a section hub */
const ringRadius = (n: number): number => Math.max(34, (n * COURSE_GAP) / (2 * Math.PI))

type Pt = { x: number; y: number; ring?: number; hub?: string }

/**
 * Structured layout: each root's sections sit evenly around it, and each section's courses sit in a
 * ring around the section. Courses that only appear as prerequisites sit next to the course that
 * needs them. The major's cluster goes left of the Core cluster. Pure and deterministic.
 */
export function targetPositions(nodes: GNode[], edges: GEdge[]): Map<string, Pt> {
  const pos = new Map<string, Pt>()
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const members = new Map<string, string[]>()
  const owner = new Map<string, string>() // course → its (first) hub
  const hubParent = new Map<string, string>() // hub → root
  for (const e of edges) {
    if (e.kind !== 'member') continue
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (!s || !t) continue
    if (s.root && t.kind === 'hub') hubParent.set(t.id, s.id)
    else if (s.kind === 'hub' && t.kind === 'course' && !owner.has(t.id)) {
      owner.set(t.id, s.id)
      members.set(s.id, [...(members.get(s.id) ?? []), t.id])
    }
  }

  const roots = nodes.filter((n) => n.root)
  const hubs = nodes.filter((n) => n.kind === 'hub' && !n.root)
  // without roots (departments view) every hub hangs off one invisible center
  const groupsOf = (rootId: string | null): GNode[] => hubs.filter((h) => (hubParent.get(h.id) ?? null) === rootId)

  /** lays out one root's sections around (cx, cy); returns the cluster's radius */
  const placeCluster = (rootId: string | null, cx: number, cy: number): number => {
    const groups = groupsOf(rootId)
    // sections with courses get a ring; empty ones (collapsed Core categories) are just a dot
    const sizes = groups.map((g) => ((members.get(g.id)?.length ?? 0) > 0 ? ringRadius(members.get(g.id)!.length) : 14))
    // room for the ring on both sides plus its label underneath
    const spans = sizes.map((r) => 2 * r + (r > 14 ? 110 : 70))
    const total = spans.reduce((a, b) => a + b, 0)
    // two or three sections: fan them in an arc above the root, so the root's name below stays clear
    const arc = rootId && groups.length > 1 && groups.length <= 3 ? Math.PI * 0.75 : 2 * Math.PI
    const R = Math.max(120, total / arc, groups.length === 1 ? 0 : Math.max(...sizes, 0) + ROOT_RADIUS + 110)
    let angle = arc < 2 * Math.PI ? -Math.PI / 2 - arc / 2 : -Math.PI / 2
    groups.forEach((g, i) => {
      const share = (spans[i] / total) * arc
      const a = angle + share / 2
      angle += share
      const hx = cx + R * Math.cos(a)
      const hy = cy + R * Math.sin(a)
      const list = members.get(g.id) ?? []
      const r = sizes[i]
      pos.set(g.id, { x: hx, y: hy, ring: list.length ? r : undefined })
      list.forEach((id, k) => {
        // start the ring facing away from the root so courses fan outward
        const b = a + Math.PI + ((k + 0.5) / list.length) * 2 * Math.PI
        pos.set(id, { x: hx + r * Math.cos(b), y: hy + r * Math.sin(b), hub: g.id })
      })
    })
    if (rootId) pos.set(rootId, { x: cx, y: cy })
    return R + Math.max(...sizes, 0) + 30
  }

  if (roots.length === 0) {
    placeCluster(null, 0, 0)
  } else {
    // major on the left, Core on the right, separated by their sizes
    const ordered = [...roots].sort((a, b) => (a.id === 'root:major' ? -1 : b.id === 'root:major' ? 1 : 0))
    let x = 0
    ordered.forEach((root, i) => {
      const radius = placeCluster(root.id, 0, 0)
      const shift = i === 0 ? 0 : x + radius
      if (i > 0) {
        // move this cluster right of the previous one
        for (const [id, q] of pos) if (id === root.id || hubParent.get(id) === root.id || hubParent.get(owner.get(id) ?? '') === root.id) pos.set(id, { x: q.x + shift, y: q.y })
      }
      x = (i === 0 ? 0 : shift) + radius + 40
    })
  }

  // courses with no section (prerequisites pulled in, a path being shown): beside a course they connect to
  const prereqNeighbors = (id: string): string[] =>
    edges.filter((e) => e.kind === 'prereq' && (e.source === id || e.target === id)).map((e) => (e.source === id ? e.target : e.source))
  let pending = nodes.filter((n) => !pos.has(n.id))
  for (let pass = 0; pass < 4 && pending.length; pass++) {
    for (const n of pending) {
      const anchor = prereqNeighbors(n.id).find((id) => pos.has(id))
      if (!anchor) continue
      const a = pos.get(anchor)!
      const sameAnchor = [...pos.keys()].filter((k) => k.startsWith(`~${anchor}~`)).length
      const angle = Math.atan2(a.y, a.x) + sameAnchor * 0.7
      pos.set(n.id, { x: a.x + 34 * Math.cos(angle), y: a.y + 34 * Math.sin(angle) })
      pos.set(`~${anchor}~${n.id}`, a) // bookkeeping: count siblings around this anchor
    }
    pending = nodes.filter((n) => !pos.has(n.id))
  }
  for (const k of [...pos.keys()]) if (k.startsWith('~')) pos.delete(k)
  pending.forEach((n, i) => pos.set(n.id, { x: -60 + (i % 6) * 22, y: 220 + Math.floor(i / 6) * 22 }))
  return pos
}

/** Creates (or updates) the simulation: nodes settle at their structured positions with a little give. */
export function makeSimulation(
  nodes: GNode[],
  edges: GEdge[],
  previous: Map<string, SimNode>
): { simNodes: SimNode[]; simLinks: SimLink[]; sim: Simulation<SimNode, SimLink> } {
  const targets = targetPositions(nodes, edges)
  const simNodes: SimNode[] = nodes.map((n) => {
    const old = previous.get(n.id)
    const t = targets.get(n.id) ?? { x: 0, y: 0 }
    return {
      id: n.id,
      kind: n.kind,
      radius: radiusOf(n),
      root: n.root,
      tx: t.x,
      ty: t.y,
      ring: t.ring,
      hub: t.hub,
      x: old?.x ?? t.x,
      y: old?.y ?? t.y,
      vx: old?.vx,
      vy: old?.vy
    }
  })
  const byId = new Map(simNodes.map((n) => [n.id, n]))
  const simLinks: SimLink[] = []
  for (const e of edges) {
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (s && t) simLinks.push({ source: s, target: t, kind: e.kind, active: e.active })
  }
  const sim = forceSimulation<SimNode, SimLink>(simNodes)
    .force('x', forceX<SimNode>((n) => n.tx).strength((n) => (n.kind === 'hub' ? 0.5 : 0.25)))
    .force('y', forceY<SimNode>((n) => n.ty).strength((n) => (n.kind === 'hub' ? 0.5 : 0.25)))
    .force('collide', forceCollide<SimNode>((n) => n.radius + 5).strength(0.8))
    .stop()
  return { simNodes, simLinks, sim }
}
