import type { GEdge, GNode } from '../graph/buildGraph'
import { COURSE_BY_BASE } from '../data'

/** The same map as cards, one section per requirement (or department). */
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
  const hubs = nodes.filter((n) => n.kind === 'hub' && !n.root)
  const members = (hub: string): GNode[] =>
    edges
      .filter((e) => e.kind === 'member' && e.source === hub)
      .map((e) => byId.get(e.target))
      .filter((n): n is GNode => !!n && n.kind === 'course')
      .sort((a, b) => a.id.localeCompare(b.id))

  return (
    <div className="grid-view">
      {hubs.map((h) => {
        const list = members(h.id)
        const done = list.filter((n) => n.status === 'taken').length
        return (
          <section key={h.id} className="grid-section">
            <h3>
              <span className={`group-dot ${h.core ? 'core' : ''} ${h.satisfied ? 'done' : ''}`} aria-hidden="true" />
              {h.label}
              {list.length > 0 && (
                <span className="count">
                  {done} of {list.length} taken
                </span>
              )}
              {h.core && (
                <button className="linkish" onClick={() => onToggleCore(h.id.replace(/^core:/, ''))}>
                  {list.length ? 'Hide courses' : h.satisfied ? 'Satisfied · show courses' : 'Show approved courses'}
                </button>
              )}
            </h3>
            {list.length > 0 && (
              <div className="cards">
                {list.map((n) => (
                  <button
                    key={n.id}
                    className={`course-card ${n.status ?? ''} ${n.missing ? 'missing' : ''} ${n.id === selectedId ? 'selected' : ''}`}
                    onClick={() => onSelect(n.id)}
                  >
                    <span className={`dot ${n.missing ? 'locked' : (n.status ?? 'locked')}`} aria-hidden="true" />
                    <span className="code">{n.id}</span>
                    <span className="title">{COURSE_BY_BASE.get(n.id)?.title ?? 'Not in the 2026–27 catalog'}</span>
                    {n.inCart && <span className="in-cart">IN CART</span>}
                  </button>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
