import { useCallback, useEffect, useMemo, useState } from 'react'
import ThemeSwitch from './components/ThemeSwitch'
import CoursePanel from './components/CoursePanel'
import GridView from './components/GridView'
import Sidebar from './components/Sidebar'
import GraphView from './graph/GraphView'
import { buildGraph, type GEdge, type GNode } from './graph/buildGraph'
import { COURSE_BY_BASE, COURSES, MAJOR_BY_ID, MAJORS } from './data'
import { CORE } from './data/core'
import { loadState, saveState, type SavedState } from './state'

const MAJOR_IDS = MAJORS.map((m) => m.id)

const majorLabel = (id: string): string => {
  const m = MAJOR_BY_ID.get(id)
  return m ? `${m.name}${m.concentration ? ` – ${m.concentration}` : ''}` : ''
}

/** Real departments and a few of their courses, for the start screen's background. */
function backgroundGraph(): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = []
  const edges: GEdge[] = []
  const byPrefix = new Map<string, string[]>()
  for (const c of COURSES) byPrefix.set(c.prefix, [...(byPrefix.get(c.prefix) ?? []), c.base])
  for (const [prefix, list] of byPrefix) {
    nodes.push({ id: `dept:${prefix}`, kind: 'hub', label: '' })
    for (const base of list.slice(0, 5)) {
      nodes.push({ id: base, kind: 'course', label: '', status: 'available' })
      edges.push({ source: `dept:${prefix}`, target: base, kind: 'member' })
    }
  }
  return { nodes, edges }
}

export default function App() {
  const [s, setS] = useState<SavedState>(() => loadState(MAJOR_IDS))
  const [picked, setPicked] = useState<string>(s.majorId ?? '')
  const [selected, setSelected] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [expandedCore, setExpandedCore] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = s.theme
    saveState(s)
  }, [s])

  const update = useCallback((patch: Partial<SavedState>) => setS((prev) => ({ ...prev, ...patch })), [])
  const taken = useMemo(() => new Set(s.taken), [s.taken])
  const cart = useMemo(() => new Set(s.cart), [s.cart])
  const major = s.majorId ? (MAJOR_BY_ID.get(s.majorId) ?? null) : null

  const graph = useMemo(
    () =>
      major
        ? buildGraph({
            major,
            courses: COURSE_BY_BASE,
            taken,
            cart,
            groupBy: s.groupBy,
            expandedCore: s.groupBy === 'requirements' ? expandedCore : null
          })
        : null,
    [major, taken, cart, s.groupBy, expandedCore]
  )
  const bg = useMemo(backgroundGraph, [])

  const toggleTaken = (base: string): void =>
    update({
      taken: taken.has(base) ? s.taken.filter((b) => b !== base) : [...s.taken, base],
      cart: s.cart.filter((b) => b !== base)
    })
  const toggleCart = (base: string): void =>
    update({ cart: cart.has(base) ? s.cart.filter((b) => b !== base) : [...s.cart, base] })
  const open = (base: string): void => {
    setSelected(base)
    setFocus(base)
  }
  const toggleCore = (id: string): void => setExpandedCore((cur) => (cur === id ? null : id))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const describe = (n: GNode): { title: string; detail: string } => {
    if (n.kind === 'hub') {
      const isCore = CORE.some((c) => `core:${c.id}` === n.id)
      return {
        title: n.label,
        detail: isCore ? (n.satisfied ? 'Satisfied · click to show or hide courses' : 'Not satisfied yet · click to show courses') : 'Requirement'
      }
    }
    const c = COURSE_BY_BASE.get(n.id)
    const st = n.missing
      ? 'Not in the 2026–27 catalog'
      : n.status === 'taken'
        ? 'Taken'
        : n.status === 'available'
          ? 'Can take'
          : 'Prerequisites missing'
    return { title: c ? `${c.code} · ${c.title}` : n.id, detail: `${st}${n.inCart ? ' · in cart' : ''}` }
  }

  if (!major || !graph) {
    return (
      <div className="start">
        <div className="start-bg" aria-hidden="true">
          <GraphView
            nodes={bg.nodes}
            edges={bg.edges}
            theme={s.theme}
            selectedId={null}
            focusId={null}
            onSelect={() => {}}
            onToggleCore={() => {}}
            describe={() => ({ title: '', detail: '' })}
          />
        </div>
        <div className="start-switch">
          <ThemeSwitch mode={s.theme} onChange={(theme) => update({ theme })} />
        </div>
        <form
          className="start-card"
          onSubmit={(e) => {
            e.preventDefault()
            if (picked) update({ majorId: picked })
          }}
        >
          <h1>maristMap</h1>
          <label htmlFor="major">Your major</label>
          <select id="major" value={picked} onChange={(e) => setPicked(e.target.value)}>
            <option value="">Choose your major…</option>
            {MAJORS.map((m) => (
              <option key={m.id} value={m.id}>
                {majorLabel(m.id)}
              </option>
            ))}
          </select>
          <button className="btn primary big" disabled={!picked}>
            Show my map
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="app">
      <nav className="navbar">
        <span className="logo">maristMap</span>
        <select
          aria-label="Major"
          value={major.id}
          onChange={(e) => {
            update({ majorId: e.target.value })
            setSelected(null)
            setExpandedCore(null)
          }}
        >
          {MAJORS.map((m) => (
            <option key={m.id} value={m.id}>
              {majorLabel(m.id)}
            </option>
          ))}
        </select>
        <div className="seg" role="group" aria-label="View">
          <button className={s.view === 'graph' ? 'on' : ''} onClick={() => update({ view: 'graph' })}>
            Graph
          </button>
          <button className={s.view === 'grid' ? 'on' : ''} onClick={() => update({ view: 'grid' })}>
            Grid
          </button>
        </div>
        <div className="seg" role="group" aria-label="Group by">
          <button className={s.groupBy === 'requirements' ? 'on' : ''} onClick={() => update({ groupBy: 'requirements' })}>
            Requirements
          </button>
          <button className={s.groupBy === 'departments' ? 'on' : ''} onClick={() => update({ groupBy: 'departments' })}>
            Departments
          </button>
        </div>
        <span className="spacer" />
        <a className="catalog-link" href={major.url} target="_blank" rel="noreferrer">
          Catalog page ↗
        </a>
        <ThemeSwitch mode={s.theme} onChange={(theme) => update({ theme })} />
      </nav>

      <div className="main">
        <Sidebar
          taken={taken}
          cart={s.cart}
          onOpen={open}
          onToggleCart={toggleCart}
          onMarkTaken={(bases) =>
            update({ taken: [...new Set([...s.taken, ...bases])], cart: s.cart.filter((b) => !bases.includes(b)) })
          }
        />
        <div className="stage">
          {s.view === 'graph' ? (
            <GraphView
              nodes={graph.nodes}
              edges={graph.edges}
              theme={s.theme}
              selectedId={selected}
              focusId={focus}
              onSelect={(id) => setSelected(id)}
              onToggleCore={toggleCore}
              describe={describe}
            />
          ) : (
            <GridView nodes={graph.nodes} edges={graph.edges} selectedId={selected} onSelect={open} onToggleCore={toggleCore} />
          )}
          <div className="legend">
            <span>
              <i className="dot taken" /> Taken
            </span>
            <span>
              <i className="dot available" /> Can take
            </span>
            <span>
              <i className="dot locked" /> Prerequisites missing
            </span>
            <span>
              <i className="dot cart" /> In cart
            </span>
          </div>
        </div>
        {selected && (
          <CoursePanel
            base={selected}
            major={major}
            taken={taken}
            cart={cart}
            onToggleTaken={toggleTaken}
            onToggleCart={toggleCart}
            onOpen={open}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}
