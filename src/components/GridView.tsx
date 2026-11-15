import type { GEdge, GNode } from '../graph/buildGraph'
import { COURSE_BY_BASE } from '../data'

/** The same graph as cards, one section per hub. */
export default function GridView({
  nodes,
  edges,
  selectedId,
  onSelect,
  onToggleCore
}: {
  nodes: GNode[]
  edges: GEdge[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleCore: (categoryId: string) => void
}) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const hubs = nodes.filter((n) => n.kind === 'hub')
  const members = (hub: string): GNode[] =>
    edges
      .filter((e) => e.kind === 'member' && e.source === hub)
      .map((e) => byId.get(e.target)!)
      .filter(Boolean)
      .sort((a, b) => a.id.localeCompare(b.id))
  return (
    <div className="grid-view">
      {hubs.map((h) => {
        const list = members(h.id)
        return (
          <section key={h.id}>
            <h3>
              {h.core && <span className={h.satisfied ? 'tick done' : 'tick'}>{h.satisfied ? '✓' : '○'}</span>}
              {h.label}
              {h.core && (
                <button className="linkish small" onClick={() => onToggleCore(h.id.replace(/^core:/, ''))}>
                  {list.length ? 'Hide courses' : 'Show courses'}
                </button>
              )}
            </h3>
            <div className="cards">
              {list.map((n) => (
                <button
                  key={n.id}
                  className={`course-card ${n.status ?? ''} ${n.missing ? 'missing' : ''} ${n.id === selectedId ? 'selected' : ''}`}
                  onClick={() => onSelect(n.id)}
                >
                  <span className="code">{n.id}</span>
                  <span className="title">{COURSE_BY_BASE.get(n.id)?.title ?? 'Not in the 2026–27 catalog'}</span>
                  {n.inCart && <span className="cart-dot" aria-label="In cart" />}
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
