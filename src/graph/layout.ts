import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation
} from 'd3-force'
import type { GEdge, GNode } from './buildGraph'

export interface SimNode {
  id: string
  kind: GNode['kind']
  radius: number
  x: number
  y: number
  vx?: number
  vy?: number
}
export interface SimLink {
  source: SimNode
  target: SimNode
  kind: GEdge['kind']
}

export const HUB_RADIUS = 14
export const COURSE_RADIUS = 6

/** Creates (or updates) the force simulation for the given graph, keeping positions of nodes that already exist. */
export function makeSimulation(
  nodes: GNode[],
  edges: GEdge[],
  previous: Map<string, SimNode>
): { simNodes: SimNode[]; simLinks: SimLink[]; sim: Simulation<SimNode, SimLink> } {
  const simNodes: SimNode[] = nodes.map((n) => {
    const old = previous.get(n.id)
    return {
      id: n.id,
      kind: n.kind,
      radius: n.kind === 'hub' ? HUB_RADIUS : COURSE_RADIUS,
      x: old?.x ?? Number.NaN,
      y: old?.y ?? Number.NaN,
      vx: old?.vx,
      vy: old?.vy
    }
  })
  const byId = new Map(simNodes.map((n) => [n.id, n]))
  const simLinks: SimLink[] = []
  for (const e of edges) {
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (s && t) simLinks.push({ source: s, target: t, kind: e.kind })
  }
  const sim = forceSimulation<SimNode, SimLink>(simNodes)
    .force(
      'link',
      forceLink<SimNode, SimLink>(simLinks)
        .distance((l) => (l.kind === 'member' ? 46 : 70))
        .strength((l) => (l.kind === 'member' ? 0.7 : 0.15))
    )
    .force('charge', forceManyBody<SimNode>().strength((n) => (n.kind === 'hub' ? -420 : -70)))
    .force('collide', forceCollide<SimNode>((n) => n.radius + 4))
    .force('center', forceCenter(0, 0))
    .force('x', forceX(0).strength(0.03))
    .force('y', forceY(0).strength(0.03))
    .stop()
  return { simNodes, simLinks, sim }
}
