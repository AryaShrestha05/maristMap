import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import ThemeSwitch from './components/ThemeSwitch'
import CoursePanel, { STATUS_LABEL } from './components/CoursePanel'
import GridView from './components/GridView'
import PlanView from './components/PlanView'
import { freezePlan, proposePlan } from './lib/schedule'
import Sidebar from './components/Sidebar'
import MajorPicker from './components/MajorPicker'
import CursorGrid from './components/CursorGrid'
import { groupProgress, pathTo } from './lib/plan'
import GraphView from './graph/GraphView'
import { buildGraph, type GNode } from './graph/buildGraph'
import { COURSE_BY_BASE, COURSES, MAJOR_BY_ID, MAJORS } from './data'
import { CORE } from './data/core'
import { decodeShare, encodeShare, loadState, saveState, type SavedState, type SharedPlan } from './state'

const MAJOR_IDS = MAJORS.map((m) => m.id)
const DEPARTMENTS = new Set(COURSES.map((c) => c.prefix)).size
const CATALOG_URL = 'https://catalog.marist.edu/content.php?catoid=12&navoid=524'

const majorLabel = (id: string): string => {
  const m = MAJOR_BY_ID.get(id)
  return m ? `${m.name}${m.concentration ? ` – ${m.concentration}` : ''}` : ''
}

export default function App() {
  const [s, setS] = useState<SavedState>(() => loadState(MAJOR_IDS))
  const [picked, setPicked] = useState<string>(s.majorId ?? '')
  const [selected, setSelected] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [expandedCore, setExpandedCore] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(false)
  // a plan opened from a share link; asks first when it would replace a plan already here
  const [incoming, setIncoming] = useState<SharedPlan | null>(() => {
    const shared = decodeShare(window.location.hash, MAJOR_IDS)
    // on the start screen there's no map to show a question on, so the shared plan just opens
    return shared && s.majorId !== null ? shared : null
  })

  // layout effect: the theme attribute must change before the graph reads the theme's colors
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = s.theme
  }, [s.theme])
  useEffect(() => saveState(s), [s])
  // with no plan of their own, a shared plan simply opens
  useEffect(() => {
    const shared = decodeShare(window.location.hash, MAJOR_IDS)
    if (shared && !incoming) setS((prev) => ({ ...prev, ...shared }))
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])

  const update = useCallback((patch: Partial<SavedState>) => setS((prev) => ({ ...prev, ...patch })), [])
  const taken = useMemo(() => new Set(s.taken), [s.taken])
  const cart = useMemo(() => new Set(s.cart), [s.cart])
  const major = s.majorId ? (MAJOR_BY_ID.get(s.majorId) ?? null) : null

  // courses on the path to the open course: shown on the map and lit up together
  const pathCodes = useMemo(
    () =>
      selected && !taken.has(selected)
        ? pathTo(selected, taken, COURSE_BY_BASE).flatMap((st) =>
            st.kind === 'course' ? [st.code] : st.kind === 'choice' ? st.options : []
          )
        : [],
    [selected, taken]
  )

  const graph = useMemo(
    () =>
      major
        ? buildGraph({
            major,
            courses: COURSE_BY_BASE,
            taken,
            cart,
            groupBy: s.groupBy,
            expandedCore: s.groupBy === 'requirements' ? expandedCore : null,
            extraCourses: selected ? [selected, ...pathCodes] : []
          })
        : null,
    [major, taken, cart, s.groupBy, expandedCore, selected, pathCodes]
  )
  // first semester to plan: the student's choice, or where their earned credits put them (~15 a semester)
  const takenCredits = s.taken.reduce((n, b) => n + (Number.parseFloat(COURSE_BY_BASE.get(b)?.credits ?? '') || 0), 0)
  const planStart = s.planStart ?? Math.min(7, Math.floor(takenCredits / 15))
  const plan = useMemo(
    () =>
      major && s.view === 'plan'
        ? proposePlan({
            major,
            courses: COURSE_BY_BASE,
            taken,
            cart: s.cart,
            start: planStart,
            pins: s.planPins,
            picks: s.planPicks,
            added: s.planAdded
          })
        : null,
    [major, s.view, taken, s.cart, planStart, s.planPins, s.planPicks, s.planAdded]
  )
  const canTakeNow = useMemo(
    () =>
      major
        ? [...new Set(major.groups.flatMap((g) => g.courses))]
            .filter((b) => !taken.has(b) && !cart.has(b) && graph?.nodes.find((n) => n.id === b)?.status === 'available')
            .sort()
        : [],
    [major, taken, cart, graph]
  )

  const toggleTaken = (base: string): void =>
    update({
      taken: taken.has(base) ? s.taken.filter((b) => b !== base) : [...s.taken, base],
      cart: s.cart.filter((b) => b !== base)
    })
  const toggleCart = (base: string): void =>
    update({
      cart: cart.has(base) ? s.cart.filter((b) => b !== base) : [...s.cart, base]
    })
  const open = (base: string): void => {
    setDrawer(false)
    setSelected(base)
    setFocus(base)
  }
  const toggleCore = (id: string): void => setExpandedCore((cur) => (cur === id ? null : id))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setSelected(null)
        setDrawer(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** " by MATH 130 (in your major)" when a course on the map is what satisfies this Core circle */
  const countingFor = (hubId: string): string => {
    const e = graph?.edges.find((x) => x.kind === 'core' && x.active && x.target === hubId)
    return e ? ` by ${e.source} (in your major)` : ''
  }

  const describe = (n: GNode): { title: string; detail: string } => {
    if (n.kind === 'hub') {
      if (n.root)
        return {
          title: n.label,
          detail: n.id === 'root:core' ? 'Core/Liberal Studies, required of every Marist student' : majorLabel(major?.id ?? '')
        }
      const isCore = CORE.some((c) => `core:${c.id}` === n.id)
      return {
        title: n.label,
        detail: isCore
          ? n.satisfied
            ? `Satisfied${countingFor(n.id)} · click to show approved courses`
            : 'Not satisfied yet · click to show approved courses'
          : n.progress
            ? `${n.satisfied ? 'Satisfied · ' : ''}${n.progress.done} of ${n.progress.needed} ${n.progress.unit}`
            : 'Requirement'
      }
    }
    const c = COURSE_BY_BASE.get(n.id)
    const st = n.missing ? 'Not in the 2026–27 catalog' : STATUS_LABEL[n.status ?? 'locked']
    const core = (graph?.edges ?? [])
      .filter((e) => e.kind === 'core' && e.source === n.id)
      .map((e) => `${CORE.find((k) => `core:${k.id}` === e.target)?.name}${e.active ? ' (counting)' : ''}`)
    return {
      title: c ? `${c.code} · ${c.title}` : n.id,
      detail: `${st}${n.inCart ? ' · in cart' : ''}${core.length ? ` · also counts toward Core: ${core.join(', ')}` : ''}`
    }
  }

  const legend = (
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
      {s.view === 'graph' && s.groupBy === 'requirements' && (
        <span>
          <i className="dash-key" /> Also counts toward Core
        </span>
      )}
    </div>
  )

  if (!major || !graph) {
    return (
      <main className="start">
        <CursorGrid
          className="start-cursor"
          cellSize={60}
          color={s.theme === 'red' ? '#ffffff' : '#1c1917'}
          highlightColor="#C8102E"
          highlight="area"
          gridStyle="lines"
          radius={140}
          holdTime={400}
          fadeDuration={800}
          fillOpacity={s.theme === 'red' ? 0.35 : 0.22}
          gridOpacity={s.theme === 'red' ? 0.16 : 0.2}
          spotlight={s.theme === 'red' ? 1 : 0.6}
          clickPulse
        >
          <div className="start-inner">
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
                if (picked) update({ majorId: picked, view: 'grid' })
              }}
            >
              <img className="mark" src="/fox.png" alt="Marist Red Fox" />
              <h1>
                marist<span>Map</span>
              </h1>
              <p className="lede">Pick your major to see every course you need, what each one requires, and what it unlocks.</p>
              <div className="field">
                <label>Major</label>
                <MajorPicker majors={MAJORS} value={picked || null} onChange={setPicked} />
              </div>
              <button className="btn primary big" disabled={!picked}>
                Show my map
              </button>
              <p className="facts-line">
                {COURSES.length.toLocaleString()} courses · {DEPARTMENTS} departments · {MAJORS.length} majors and concentrations
                ·{' '}
                <a href={CATALOG_URL} target="_blank" rel="noreferrer">
                  2026–27 catalog
                </a>
              </p>
            </form>
          </div>
        </CursorGrid>
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
        <button
          className="drawer-toggle"
          aria-expanded={drawer}
          aria-controls="plan-drawer"
          onClick={() => setDrawer((d) => !d)}
        >
          My plan
        </button>
        <MajorPicker
          variant="nav"
          majors={MAJORS}
          value={major.id}
          onChange={(id) => {
            update({ majorId: id, planPins: {}, planPicks: {}, planAdded: {} })
            setSelected(null)
            setExpandedCore(null)
          }}
        />
        <div className="seg" role="group" aria-label="View">
          <button
            className={s.view === 'graph' ? 'on' : ''}
            aria-pressed={s.view === 'graph'}
            onClick={() => update({ view: 'graph' })}
          >
            Graph
          </button>
          <button
            className={s.view === 'grid' ? 'on' : ''}
            aria-pressed={s.view === 'grid'}
            onClick={() => update({ view: 'grid' })}
          >
            Grid
          </button>
          <button
            className={s.view === 'plan' ? 'on' : ''}
            aria-pressed={s.view === 'plan'}
            onClick={() => update({ view: 'plan' })}
          >
            Plan
          </button>
        </div>
{s.view !== 'plan' && (
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
        )}
        <span className="spacer" />
        <a className="nav-link" href={major.url} target="_blank" rel="noreferrer">
          Catalog page ↗
        </a>
        <ThemeSwitch mode={s.theme} onChange={(theme) => update({ theme })} />
      </nav>

      <div className="main">
        {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}
        <Sidebar
          open={drawer}
          taken={taken}
          cart={s.cart}
          onOpen={open}
          onToggleCart={toggleCart}
          onMarkTaken={(bases) =>
            update({
              taken: [...new Set([...s.taken, ...bases])],
              cart: s.cart.filter((b) => !bases.includes(b))
            })
          }
          canTakeNow={canTakeNow}
          majorProgress={{
            done: major.groups.filter((g) => groupProgress(g, taken, COURSE_BY_BASE).satisfied).length,
            total: major.groups.length
          }}
          shareUrl={window.location.origin + window.location.pathname + encodeShare({ majorId: major.id, taken: s.taken, cart: s.cart })}
          onUnmarkAll={() => update({ taken: [] })}
          onClearCart={() => update({ cart: [] })}
        />
        <main className="stage">
          {incoming && (
            <div className="share-banner" role="dialog" aria-label="Shared plan">
              <span>
                This link has a plan: <strong>{majorLabel(incoming.majorId)}</strong> · {incoming.taken.length} taken ·{' '}
                {incoming.cart.length} in cart. Opening it replaces yours.
              </span>
              <button
                className="btn primary small-btn"
                onClick={() => {
                  update(incoming)
                  setIncoming(null)
                  setSelected(null)
                }}
              >
                Open it
              </button>
              <button className="btn small-btn" onClick={() => setIncoming(null)}>
                Keep mine
              </button>
            </div>
          )}
          {s.view === 'graph' ? (
            <GraphView
              nodes={graph.nodes}
              edges={graph.edges}
              theme={s.theme}
              selectedId={selected}
              focusId={focus}
              highlight={pathCodes}
              onSelect={(id) => setSelected(id)}
              onToggleCore={toggleCore}
              describe={describe}
            />
          ) : s.view === 'plan' && plan ? (
            <PlanView
              plan={plan}
              taken={taken}
              start={planStart}
              edited={[s.planPins, s.planPicks, s.planAdded].some((m) => Object.keys(m).length > 0)}
              selectedId={selected}
              onStart={(n) => update({ planStart: n })}
              // every edit starts from the plan as it is, so nothing else shifts to fill a gap
              onMove={(id, sem) =>
                update({
                  planPins: { ...freezePlan(plan), [id]: sem },
                  ...(id in s.planAdded ? { planAdded: { ...s.planAdded, [id]: sem } } : {})
                })
              }
              onPick={(slot, base) => {
                const { [slot]: _old, ...rest } = s.planPicks
                update({ planPins: freezePlan(plan), planPicks: base ? { ...rest, [slot]: base } : rest })
              }}
              onAdd={(base, sem) =>
                update({ planPins: { ...freezePlan(plan), [base]: sem }, planAdded: { ...s.planAdded, [base]: sem } })
              }
              onRemove={(base) => {
                const { [base]: _a, ...added } = s.planAdded
                const { [base]: _p, ...pins } = s.planPins
                update({ planAdded: added, planPins: pins })
              }}
              onStartOver={() => update({ planPins: {}, planPicks: {}, planAdded: {} })}
              onOpen={(base) => {
                setDrawer(false)
                setSelected(base)
              }}
            />
          ) : (
            <GridView
              nodes={graph.nodes}
              edges={graph.edges}
              selectedId={selected}
              onSelect={open}
              onToggleCore={toggleCore}
              legend={legend}
            />
          )}
          {s.view === 'graph' && legend}
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
