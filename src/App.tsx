import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import ThemeSwitch from './components/ThemeSwitch'
import CoursePanel, { STATUS_LABEL } from './components/CoursePanel'
import GridView from './components/GridView'
import Sidebar from './components/Sidebar'
import GraphView from './graph/GraphView'
import { buildGraph, type GEdge, type GNode } from './graph/buildGraph'
import { COURSE_BY_BASE, COURSES, MAJOR_BY_ID, MAJORS } from './data'
import { CORE } from './data/core'
import { loadState, saveState, type SavedState } from './state'

const MAJOR_IDS = MAJORS.map((m) => m.id)
const DEPARTMENTS = new Set(COURSES.map((c) => c.prefix)).size
const CATALOG_URL = 'https://catalog.marist.edu/content.php?catoid=12&navoid=524'

const majorLabel = (id: string): string => {
  const m = MAJOR_BY_ID.get(id)
  return m ? `${m.name}${m.concentration ? ` – ${m.concentration}` : ''}` : ''
}

/** Every department with a handful of its real courses and the prerequisite links between them. */
function backgroundGraph(): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = []
  const edges: GEdge[] = []
  const shown = new Set<string>()
  const byPrefix = new Map<string, string[]>()
  for (const c of COURSES) byPrefix.set(c.prefix, [...(byPrefix.get(c.prefix) ?? []), c.base])
  for (const [prefix, list] of byPrefix) {
    nodes.push({ id: `dept:${prefix}`, kind: 'hub', label: '' })
    for (const base of list.slice(0, 7)) {
      shown.add(base)
      nodes.push({ id: base, kind: 'course', label: '', status: 'available' })
      edges.push({ source: `dept:${prefix}`, target: base, kind: 'member' })
    }
  }
  for (const c of COURSES) {
    if (!shown.has(c.base) || c.prereq?.kind !== 'course') continue
    if (shown.has(c.prereq.code)) edges.push({ source: c.prereq.code, target: c.base, kind: 'prereq' })
  }
  return { nodes, edges }
}

export default function App() {
  const [s, setS] = useState<SavedState>(() => loadState(MAJOR_IDS))
  const [picked, setPicked] = useState<string>(s.majorId ?? '')
  const [selected, setSelected] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [expandedCore, setExpandedCore] = useState<string | null>(null)

  // layout effect: the theme attribute must change before the graph reads the theme's colors
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = s.theme
  }, [s.theme])
  useEffect(() => saveState(s), [s])

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
  const toggleCart = (base: string): void => update({ cart: cart.has(base) ? s.cart.filter((b) => b !== base) : [...s.cart, base] })
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
      if (n.root) return { title: n.label, detail: n.id === 'root:core' ? 'Core/Liberal Studies, required of every Marist student' : majorLabel(major?.id ?? '') }
      const isCore = CORE.some((c) => `core:${c.id}` === n.id)
      return {
        title: n.label,
        detail: isCore ? (n.satisfied ? 'Satisfied · click to show approved courses' : 'Not satisfied yet · click to show approved courses') : 'Requirement'
      }
    }
    const c = COURSE_BY_BASE.get(n.id)
    const st = n.missing ? 'Not in the 2026–27 catalog' : STATUS_LABEL[n.status ?? 'locked']
    return { title: c ? `${c.code} · ${c.title}` : n.id, detail: `${st}${n.inCart ? ' · in cart' : ''}` }
  }

  if (!major || !graph) {
    return (
      <main className="start">
        <div className="start-bg" aria-hidden="true">
          <GraphView
            nodes={bg.nodes}
            edges={bg.edges}
            theme={s.theme}
            selectedId={null}
            focusId={null}
            ambient
            onSelect={() => {}}
            onToggleCore={() => {}}
            describe={() => ({ title: '', detail: '' })}
          />
        </div>
        <div className="start-vignette" aria-hidden="true" />
        <div className="start-top">
          <div className="switch-wrap">
            <ThemeSwitch mode={s.theme} onChange={(theme) => update({ theme })} />
          </div>
        </div>
        <form
          className="start-card"
          onSubmit={(e) => {
            e.preventDefault()
            if (picked) update({ majorId: picked })
          }}
        >
          <img className="mark" src="/fox.png" alt="Marist Red Fox" />
          <h1>
            marist<span>Map</span>
          </h1>
          <p className="lede">Pick your major to see every course you need, what each one requires, and what it unlocks.</p>
          <div className="field">
            <label htmlFor="major">Major</label>
            <select id="major" className="select" value={picked} onChange={(e) => setPicked(e.target.value)}>
              <option value="">Choose your major…</option>
              {MAJORS.map((m) => (
                <option key={m.id} value={m.id}>
                  {majorLabel(m.id)}
                </option>
              ))}
            </select>
          </div>
          <button className="btn primary big" disabled={!picked}>
            Show my map
          </button>
          <p className="facts-line">
            {COURSES.length.toLocaleString()} courses · {DEPARTMENTS} departments · {MAJORS.length} majors and concentrations ·{' '}
            <a href={CATALOG_URL} target="_blank" rel="noreferrer">
              2026–27 catalog
            </a>
          </p>
        </form>
      </main>
    )
  }

  return (
    <div className="app">
      <nav className="navbar" aria-label="Main">
        <button
          className="brand"
          onClick={() => {
            setPicked(major.id)
            update({ majorId: null })
            setSelected(null)
          }}
          title="Change major"
        >
          <img src="/fox.png" alt="" />
          maristMap
        </button>
        <select
          aria-label="Major"
          className="select"
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
          <button className={s.view === 'graph' ? 'on' : ''} aria-pressed={s.view === 'graph'} onClick={() => update({ view: 'graph' })}>
            Graph
          </button>
          <button className={s.view === 'grid' ? 'on' : ''} aria-pressed={s.view === 'grid'} onClick={() => update({ view: 'grid' })}>
            Grid
          </button>
        </div>
        <div className="seg" role="group" aria-label="Group by">
          <button
            className={s.groupBy === 'requirements' ? 'on' : ''}
            aria-pressed={s.groupBy === 'requirements'}
            onClick={() => update({ groupBy: 'requirements' })}
          >
            Requirements
          </button>
          <button
            className={s.groupBy === 'departments' ? 'on' : ''}
            aria-pressed={s.groupBy === 'departments'}
            onClick={() => update({ groupBy: 'departments' })}
          >
            Departments
          </button>
        </div>
        <span className="spacer" />
        <a className="nav-link" href={major.url} target="_blank" rel="noreferrer">
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
          onMarkTaken={(bases) => update({ taken: [...new Set([...s.taken, ...bases])], cart: s.cart.filter((b) => !bases.includes(b)) })}
        />
        <main className="stage">
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
          <div className="legend" aria-label="Legend">
            <span>
              <i className="dot taken" /> Taken
            </span>
            <span>
              <i className="dot available" /> Can take
            </span>
            <span>
              <i className="dot check" /> Check requirement
            </span>
            <span>
              <i className="dot locked" /> Prerequisites missing
            </span>
            <span>
              <i className="dot cart" /> In cart
            </span>
          </div>
          {s.view === 'graph' && <p className="stage-hint">Click a course for details · click a Core circle to see its approved courses · scroll to zoom</p>}
        </main>
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
