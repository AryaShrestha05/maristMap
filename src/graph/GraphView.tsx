import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Application, Container, Graphics, Text } from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import type { Simulation } from 'd3-force'
import type { GEdge, GNode } from './buildGraph'
import { makeSimulation, type SimLink, type SimNode } from './layout'

/** gap between a section's ring of courses and its label */
const COURSE_LABEL_GAP = 10

export interface GraphViewProps {
  nodes: GNode[]
  edges: GEdge[]
  theme: string
  selectedId: string | null
  focusId: string | null
  /** course click */
  onSelect: (id: string | null) => void
  /** Core hub click (expand / collapse its courses) */
  onToggleCore: (categoryId: string) => void
  /** for the hover card: title and status line of a node */
  describe: (node: GNode) => { title: string; detail: string }
  /** while a course is open: the courses on its path, lit up together with it */
  highlight?: string[]
}

interface Palette {
  root: string
  label: string
  halo: string
  hub: string
  taken: string
  available: string
  locked: string
  edge: string
  prereq: string
  bg: string
  fg: string
  accent: string
}

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string): string => s.getPropertyValue(name).trim()
  return {
    root: v('--node-root'),
    label: v('--label'),
    halo: v('--halo'),
    hub: v('--node-hub'),
    taken: v('--node-taken'),
    available: v('--node-available'),
    locked: v('--node-locked'),
    edge: v('--edge'),
    prereq: v('--edge-prereq'),
    bg: v('--bg'),
    fg: v('--fg'),
    accent: v('--accent')
  }
}

/** Long requirement names are shortened on the map; the hover card shows them in full. */
/**
 * Map label: section names drop a repeated concentration prefix ("Software Development: Choice of
 * either" → "Choice of either") and wrap; very long ones are trimmed. The hover card shows full names.
 */
const short = (n: GNode): string => {
  if (n.kind !== 'hub' || n.root || n.core) return n.label
  const label = n.label.includes(': ') ? n.label.slice(n.label.indexOf(': ') + 2) : n.label
  return label.length > 44 ? label.slice(0, 42).trimEnd() + '…' : label
}

interface View {
  node: GNode
  sim: SimNode
  g: Graphics
  label: Text
}

/** Neighbors of a node: itself plus everything one edge away. */
function neighborhood(edges: GEdge[], id: string): Set<string> {
  const out = new Set([id])
  for (const e of edges) {
    if (e.source === id) out.add(e.target)
    if (e.target === id) out.add(e.source)
  }
  return out
}

export default function GraphView(props: GraphViewProps) {
  const { nodes, edges, theme, selectedId, focusId } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  const engine = useRef<{
    app: Application
    viewport: Viewport
    edgesG: Graphics
    nodeLayer: Container
    labelLayer: Container
    views: Map<string, View>
    links: SimLink[]
    sim: Simulation<SimNode, SimLink> | null
    palette: Palette
    hover: string | null
    dirty: boolean
    fitted: boolean
    fitZoom: number
    /** node and edge ids of the current layout; data-only changes keep the layout */
    structureKey: string
    /** re-fit once the layout settles, until the user pans or zooms */
    autoFit: boolean
  } | null>(null)
  const [ready, setReady] = useState(false)
  const [card, setCard] = useState<{ id: string; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    latest.current = props
  })

  // ---- mount Pixi once ----
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    let cancelled = false
    let teardown: (() => void) | null = null
    void (async () => {
      const app = new Application()
      await app.init({ resizeTo: el, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 })
      if (cancelled) {
        app.destroy(true, { children: true })
        return
      }
      el.appendChild(app.canvas)
      const viewport = new Viewport({ screenWidth: el.clientWidth, screenHeight: el.clientHeight, events: app.renderer.events, ticker: app.ticker })
      viewport.drag().pinch().wheel({ smooth: 4 }).decelerate({ friction: 0.92 }).clampZoom({ minScale: 0.15, maxScale: 5 })
      app.stage.addChild(viewport)
      const edgesG = new Graphics()
      const nodeLayer = new Container()
      const labelLayer = new Container()
      viewport.addChild(edgesG, nodeLayer, labelLayer)
      const ro = new ResizeObserver(() => {
        app.resize()
        viewport.resize(el.clientWidth, el.clientHeight)
      })
      ro.observe(el)

      engine.current = {
        app, viewport, edgesG, nodeLayer, labelLayer,
        views: new Map(), links: [], sim: null, palette: readPalette(), hover: null, dirty: true, fitted: false, fitZoom: 1, structureKey: '', autoFit: true
      }

      const stopAutoFit = (): void => {
        if (engine.current) engine.current.autoFit = false
      }
      viewport.on('drag-start', stopAutoFit)
      viewport.on('wheel', stopAutoFit)
      viewport.on('pinch-start', stopAutoFit)

      viewport.on('clicked', (e) => {
        const E = engine.current
        if (!E) return
        let best: View | null = null
        let bestD = Infinity
        for (const v of E.views.values()) {
          const d = Math.hypot(v.sim.x - e.world.x, v.sim.y - e.world.y)
          if (d < Math.max(v.sim.radius * 1.8, 12 / viewport.scale.x) && d < bestD) {
            best = v
            bestD = d
          }
        }
        const p = latest.current
        if (!best) p.onSelect(null)
        else if (best.node.kind === 'course') p.onSelect(best.node.id)
        else if (best.node.core) p.onToggleCore(best.node.id.replace(/^core:/, ''))
      })

      const tick = (): void => {
        const E = engine.current
        if (!E) return
        const p = latest.current
        if (E.autoFit && E.sim && E.sim.alpha() < 0.03) {
          E.autoFit = false
          E.fitZoom = fit(viewport, [...E.views.values()].map((v) => v.sim), el, true)
        }
        const active = E.hover ?? p.selectedId
        const path = !E.hover && p.selectedId && p.highlight?.length ? new Set([p.selectedId, ...p.highlight]) : null
        const near = path ?? (active ? neighborhood(p.edges, active) : null)
        const zoom = viewport.scale.x
        const zoomedIn = zoom > E.fitZoom * 1.6
        for (const v of E.views.values()) {
          v.g.position.set(v.sim.x, v.sim.y)
          v.g.alpha = !near || near.has(v.node.id) ? 1 : 0.15
          const show = v.node.kind === 'hub' || zoomedIn || (near?.has(v.node.id) ?? false)
          v.label.visible = show
          if (show) {
            placeLabel(v, E.views, zoomedIn)
            v.label.scale.set(Math.min(1.6, Math.max(0.65, 1 / zoom)))
            v.label.alpha = v.g.alpha
          }
          // zoomed in, a section's name sits in the middle of its ring and stands in for its dot
          if (zoomedIn && v.sim.ring) v.g.alpha *= 0.12
        }
        // edges
        E.edgesG.clear()
        const w = 1 / Math.max(zoom, 0.4)
        const lit = (l: SimLink): boolean => !near || (near.has(l.source.id) && near.has(l.target.id))
        const stroke = (pick: (l: SimLink) => boolean, color: string, alpha: number, width: number): void => {
          let any = false
          for (const l of E.links) {
            if (!pick(l)) continue
            E.edgesG.moveTo(l.source.x, l.source.y).lineTo(l.target.x, l.target.y)
            any = true
          }
          if (any) E.edgesG.stroke({ color, alpha, width })
        }
        stroke((l) => l.kind === 'member' && l.source.root === true && lit(l), E.palette.edge, 1, w * 2)
        stroke((l) => l.kind === 'member' && !l.source.root && lit(l), E.palette.edge, 1, w * 1.2)
        if (near) stroke((l) => l.kind === 'member' && !lit(l), E.palette.edge, 0.3, w)
        // prerequisite lines only for what you're looking at: the hovered or open course and its path
        if (near) stroke((l) => l.kind === 'prereq' && lit(l), E.palette.prereq, 1, w * 2)
      }
      app.ticker.add(tick)
      setReady(true)

      teardown = () => {
        app.ticker.remove(tick)
        ro.disconnect()
        engine.current?.sim?.stop()
        viewport.destroy({ children: true })
        app.destroy(true, { children: true })
        engine.current = null
      }
    })()
    return () => {
      cancelled = true
      teardown?.()
    }
  }, [])

  // ---- structure changes: add/remove nodes, rebuild the simulation, keep positions ----
  useEffect(() => {
    const E = engine.current
    if (!ready || !E) return
    const key = nodes.map((n) => n.id).join('|') + '#' + edges.map((e) => `${e.source}>${e.target}`).join('|')
    if (key === E.structureKey) {
      // same dots and lines (e.g. a course was marked taken): keep the layout, just refresh data
      for (const n of nodes) {
        const v = E.views.get(n.id)
        if (v) v.node = n
      }
      return
    }
    E.structureKey = key
    const previous = new Map([...E.views.values()].map((v) => [v.node.id, v.sim]))
    const changed = nodes.filter((n) => !previous.has(n.id)).length + [...previous.keys()].filter((id) => !nodes.some((n) => n.id === id)).length
    E.sim?.stop()
    const { simNodes, simLinks, sim } = makeSimulation(nodes, edges, previous)
    const simById = new Map(simNodes.map((s) => [s.id, s]))

    // remove views that are gone
    for (const [id, v] of E.views) {
      if (!simById.has(id)) {
        v.g.destroy()
        v.label.destroy()
        E.views.delete(id)
      }
    }
    // add / update views
    for (const n of nodes) {
      const s = simById.get(n.id)!
      let v = E.views.get(n.id)
      if (!v) {
        const g = new Graphics()
        g.eventMode = 'static'
        g.cursor = 'pointer'
        g.on('pointerover', (ev) => {
          if (engine.current) engine.current.hover = n.id
          setCard({ id: n.id, x: ev.global.x, y: ev.global.y })
        })
        g.on('pointerout', () => {
          if (engine.current?.hover === n.id) engine.current.hover = null
          setCard((c) => (c?.id === n.id ? null : c))
        })
        const label = new Text({
          text: short(n),
          style: {
            fontFamily: n.kind === 'hub' ? 'Geist, -apple-system, system-ui, sans-serif' : 'Geist Mono, ui-monospace, monospace',
            fontSize: n.root ? 15 : n.kind === 'hub' ? 12 : 10,
            fontWeight: n.root ? '800' : n.kind === 'hub' ? '600' : '500',
            fill: '#000',
            stroke: { color: '#fff', width: 4, join: 'round' },
            letterSpacing: n.kind === 'hub' ? -0.2 : 0,
            wordWrap: n.kind === 'hub' && !n.root,
            wordWrapWidth: 130,
            align: 'center'
          },
          resolution: 3
        })
        label.anchor.set(0.5, 0)
        E.nodeLayer.addChild(g)
        E.labelLayer.addChild(label)
        v = { node: n, sim: s, g, label }
        E.views.set(n.id, v)
      }
      v.node = n
      v.sim = s
      v.label.text = short(n)
    }
    E.links = simLinks
    E.sim = sim
    E.dirty = true

    const isNew = previous.size === 0
    // a big change (new major, regrouping) re-frames the map; a few added path courses don't
    const bigChange = isNew || changed > nodes.length * 0.3
    E.autoFit = bigChange
    if (isNew) {
      for (let i = 0; i < 300; i++) sim.tick()
    } else {
      // new dots start next to a neighbor instead of at the origin
      for (const sn of simNodes) {
        if (!Number.isNaN(sn.x)) continue
        const link = simLinks.find((l) => (l.source === sn && !Number.isNaN(l.target.x)) || (l.target === sn && !Number.isNaN(l.source.x)))
        const anchor = link ? (link.source === sn ? link.target : link.source) : null
        if (anchor) {
          sn.x = anchor.x + (Math.random() - 0.5) * 30
          sn.y = anchor.y + (Math.random() - 0.5) * 30
        }
      }
      sim.alpha(bigChange ? 0.5 : 0.15)
    }
    sim.alphaTarget(0.004).restart()

    if (!E.fitted || isNew) {
      E.fitZoom = fit(E.viewport, simNodes, hostRef.current!)
      E.fitted = true
    }
  }, [ready, nodes, edges])

  // ---- appearance: theme, statuses, selection ----
  useEffect(() => {
    const E = engine.current
    if (!ready || !E) return
    E.palette = readPalette()
    for (const v of E.views.values()) drawNode(v, E.palette, v.node.id === selectedId)
  }, [ready, nodes, theme, selectedId])

  // ---- focus ----
  useEffect(() => {
    const E = engine.current
    if (!ready || !E || !focusId) return
    const v = E.views.get(focusId)
    if (!v) return
    const raf = requestAnimationFrame(() =>
      E.viewport.animate({ position: { x: v.sim.x, y: v.sim.y }, scale: Math.max(E.viewport.scale.x, 1.3), time: 500, ease: 'easeInOutSine' })
    )
    return () => cancelAnimationFrame(raf)
  }, [ready, focusId])

  const cardNode = card ? nodes.find((n) => n.id === card.id) : null
  const cardText = cardNode ? props.describe(cardNode) : null
  return (
    <div className="graph-host" ref={hostRef}>
      {cardNode && cardText && card && (
        <div className="hover-card" style={{ left: card.x + 14, top: card.y + 14 }}>
          <div className="hover-title">{cardText.title}</div>
          <div className="hover-detail">{cardText.detail}</div>
        </div>
      )}
    </div>
  )
}

/**
 * Course labels point away from the center of their ring so neighbors don't collide. Section names
 * sit under their ring when zoomed out, and in the ring's empty middle once course labels show.
 */
function placeLabel(v: View, views: Map<string, View>, zoomedIn: boolean): void {
  const { sim, label } = v
  if (sim.ring) {
    if (zoomedIn) {
      label.anchor.set(0.5, 0.5)
      label.position.set(sim.x, sim.y)
    } else {
      label.anchor.set(0.5, 0)
      label.position.set(sim.x, sim.y + sim.ring + COURSE_LABEL_GAP)
    }
    return
  }
  const hub = sim.hub ? views.get(sim.hub)?.sim : undefined
  if (!hub) {
    label.anchor.set(0.5, 0)
    label.position.set(sim.x, sim.y + sim.radius + 3)
    return
  }
  const a = Math.atan2(sim.y - hub.y, sim.x - hub.x)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const gap = sim.radius + 4
  label.anchor.set(cos > 0.35 ? 0 : cos < -0.35 ? 1 : 0.5, sin > 0.35 ? 0 : sin < -0.35 ? 1 : 0.5)
  label.position.set(sim.x + cos * gap, sim.y + sin * gap)
}

function drawNode(v: View, p: Palette, selected: boolean): void {
  const { g, node, sim, label } = v
  g.clear()
  const r = sim.radius
  if (node.root) {
    g.circle(0, 0, r + 6).fill({ color: p.root, alpha: 0.14 })
    g.circle(0, 0, r).fill({ color: p.root })
  } else if (node.kind === 'hub' && node.core) {
    if (node.satisfied) g.circle(0, 0, r).fill({ color: p.taken })
    else g.circle(0, 0, r).fill({ color: p.bg }).stroke({ color: p.hub, width: 2.4 })
  } else if (node.kind === 'hub') {
    g.circle(0, 0, r).fill({ color: node.satisfied ? p.taken : p.hub })
  } else if (node.missing) {
    g.circle(0, 0, r).stroke({ color: p.locked, width: 1.5, alpha: 0.8 })
  } else if (node.status === 'taken') {
    g.circle(0, 0, r).fill({ color: p.taken })
  } else if (node.status === 'available') {
    g.circle(0, 0, r).fill({ color: p.bg }).stroke({ color: p.available, width: 2.2 })
  } else if (node.status === 'check') {
    g.circle(0, 0, r).fill({ color: p.bg }).stroke({ color: p.locked, width: 2.2 })
  } else {
    g.circle(0, 0, r).fill({ color: p.locked })
  }
  if (node.inCart) g.circle(0, 0, r + 4).stroke({ color: p.label, width: 1.6, alpha: 0.9 })
  if (selected) g.circle(0, 0, r + 7).stroke({ color: p.label, width: 2 })
  label.style.fill = node.root ? p.root : p.label
  label.style.stroke = { color: p.halo, width: 4, join: 'round' }
}

function fit(viewport: Viewport, nodes: SimNode[], el: HTMLDivElement, animate = false): number {
  if (!nodes.length) return 1
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y)
  }
  const w = Math.max(maxX - minX, 200)
  const h = Math.max(maxY - minY, 200)
  // leave room for the legend (top) and hint (bottom)
  const zoom = Math.min(el.clientWidth / (w + 80), (el.clientHeight - 110) / (h + 60))
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  if (animate) {
    viewport.animate({ position: { x: cx, y: cy - 10 / zoom }, scale: zoom, time: 600, ease: 'easeInOutSine' })
  } else {
    viewport.setZoom(zoom, true)
    viewport.moveCenter(cx, cy - 10 / zoom)
  }
  return zoom
}
