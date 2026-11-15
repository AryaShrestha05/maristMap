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
  root?: boolean
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

export const ROOT_RADIUS = 20
export const HUB_RADIUS = 12
export const CORE_RADIUS = 10
export const COURSE_RADIUS = 6

const radiusOf = (n: GNode): number =>
  n.root ? ROOT_RADIUS : n.kind === 'hub' ? (n.core ? CORE_RADIUS : HUB_RADIUS) : COURSE_RADIUS

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
      radius: radiusOf(n),
      root: n.root,
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
        .distance((l) => (l.kind === 'prereq' ? 60 : l.source.id === 'root:core' ? 150 : l.source.id.startsWith('root:') ? 120 : 38))
        .strength((l) => (l.kind === 'member' ? 0.8 : 0.12))
    )
    .force('charge', forceManyBody<SimNode>().strength((n) => (n.radius >= 20 ? -1400 : n.kind === 'hub' ? -520 : -55)))
    .force('collide', forceCollide<SimNode>((n) => n.radius + 4))
    .force('center', forceCenter(0, 0))
    // the major's cluster sits left, Core sits right
    .force('x', forceX<SimNode>((n) => (n.id === 'root:major' ? -260 : n.id === 'root:core' ? 340 : 0)).strength((n) => (n.root ? 0.35 : 0.03)))
    .force('y', forceY<SimNode>(0).strength((n) => (n.root ? 0.35 : 0.04)))
    .stop()
  return { simNodes, simLinks, sim }
}
