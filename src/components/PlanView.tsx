import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { COURSE_BY_BASE, COURSES } from '../data'
import { CODE_RE } from '../lib/parseCourse'
import { hasUnparsedPrereq } from '../lib/plan'
import { SEMESTERS, MAX_CREDITS, codeOf, planIssues, semesterLabel, type PlanItem, type ProposedPlan } from '../lib/schedule'
import type { Prereq } from '../lib/types'

const GRADUATION_CREDITS = 120 // "Total Credit Requirement for Graduation: 120 cr" (catalog program pages)

interface Props {
  plan: ProposedPlan
  taken: Set<string>
  start: number
  /** the student has moved, picked or added something */
  edited: boolean
  selectedId: string | null
  onStart: (semester: number) => void
  onMove: (id: string, semester: number) => void
  /** fill a "Choose" card with a course, or empty it again (null) */
  onPick: (slotId: string, base: string | null) => void
  onAdd: (base: string, semester: number) => void
  onRemove: (base: string) => void
  onStartOver: () => void
  onOpen: (base: string) => void
}

interface Link {
  from: string
  to: string
  bad: boolean
}

function codesIn(p: Prereq | null, out: string[] = []): string[] {
  if (!p) return out
  if (p.kind === 'course') out.push(p.code)
  else if (p.kind !== 'text') for (const x of p.of) codesIn(x, out)
  return out
}

/** Codes a course needs first: its structured prerequisites, or the codes named in unreadable text. */
function needs(base: string): string[] {
  const c = COURSE_BY_BASE.get(base)
  if (!c) return []
  if (!hasUnparsedPrereq(c)) return codesIn(c.prereq)
  return [...(c.prereqText ?? '').matchAll(new RegExp(CODE_RE.source, 'g'))].map((m) => `${m[1]} ${m[2]}`).filter((x) => x !== base)
}

const credits = (base: string): number => Number.parseFloat(COURSE_BY_BASE.get(base)?.credits ?? '') || 0

export default function PlanView({ plan, taken, start, edited, selectedId, onStart, onMove, onPick, onAdd, onRemove, onStartOver, onOpen }: Props) {
  const board = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<string | null>(null)
  /** clicked card: its chain stays lit while scrolling, until clicked again, empty space, or Esc */
  const [stuck, setStuck] = useState<string | null>(null)
  const focus = stuck ?? hover
  const stick = (id: string): void => setStuck((cur) => (cur === id ? null : id))
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setStuck(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const [paths, setPaths] = useState<{ key: string; d: string; link: Link }[]>([])

  const issues = useMemo(() => planIssues(plan, COURSE_BY_BASE, taken), [plan, taken])
  const bySemester = useMemo(() => {
    const cols: PlanItem[][] = Array.from({ length: SEMESTERS }, () => [])
    for (const i of plan.items) if (i.semester !== null) cols[i.semester].push(i)
    return cols
  }, [plan])
  const unplaced = plan.items.filter((i) => i.semester === null)

  // lines: a prerequisite (a planned course, an "one of" choice, or a course already done) → the course needing it
  const links = useMemo<Link[]>(() => {
    const semOf = new Map(plan.items.map((i) => [i.id, i.semester]))
    const byCode = new Map(plan.items.flatMap((i) => (codeOf(i) ? [[codeOf(i)!, i.id] as const] : [])))
    const out: Link[] = []
    for (const item of plan.items) {
      const own = codeOf(item)
      if (!own) continue
      for (const code of new Set(needs(own))) {
        let from: string | null = null
        if (byCode.has(code)) from = byCode.get(code)!
        else {
          const slot = plan.items.find((i) => i.reason === 'prereq' && !i.pick && i.options?.includes(code))
          if (slot) from = slot.id
          else if (taken.has(code)) from = `done:${code}`
        }
        if (!from || out.some((l) => l.from === from && l.to === item.id)) continue
        const a = from.startsWith('done:') ? -1 : (semOf.get(from) ?? null)
        const b = item.semester
        out.push({ from, to: item.id, bad: a !== null && b !== null && a >= b })
      }
    }
    return out
  }, [plan, taken])

  // the hovered card's whole chain: everything before it and everything after it
  const chain = useMemo(() => {
    if (!focus) return null
    const set = new Set([focus])
    const walk = (id: string, dir: 'up' | 'down'): void => {
      for (const l of links) {
        const next = dir === 'up' ? (l.to === id ? l.from : null) : l.from === id ? l.to : null
        if (next && !set.has(next)) {
          set.add(next)
          walk(next, dir)
        }
      }
    }
    walk(focus, 'up')
    walk(focus, 'down')
    return set
  }, [focus, links])

  // while dragging a course: the semesters it can go in without breaking a prerequisite
  const allowed = useMemo(() => {
    if (!dragging) return null
    const semOf = new Map(plan.items.map((i) => [i.id, i.semester]))
    let lo = start
    let hi = SEMESTERS - 1
    for (const l of links) {
      if (l.to === dragging && !l.from.startsWith('done:')) lo = Math.max(lo, (semOf.get(l.from) ?? -1) + 1)
      if (l.from === dragging) hi = Math.min(hi, (semOf.get(l.to) ?? SEMESTERS) - 1)
    }
    return { lo, hi }
  }, [dragging, links, plan, start])

  const [addingTo, setAddingTo] = useState<number | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  // cards glide to their new place (FLIP), and the lines follow them while they move
  const lastRects = useRef(new Map<string, { x: number; y: number }>())
  useLayoutEffect(() => {
    const el = board.current
    if (!el) return
    const origin = el.getBoundingClientRect()
    const local = (r: DOMRect) => ({ x: r.left - origin.left + el.scrollLeft, y: r.top - origin.top + el.scrollTop })
    const cards = [...el.querySelectorAll<HTMLElement>('[data-card]')]
    const next = new Map<string, { x: number; y: number }>()
    for (const card of cards) {
      const id = card.dataset.card!
      const now = local(card.getBoundingClientRect())
      next.set(id, now)
      const was = lastRects.current.get(id)
      if (!was || (Math.abs(was.x - now.x) < 1 && Math.abs(was.y - now.y) < 1)) continue
      card.style.animation = 'none' // moving, not new: glide instead of popping in
      card.style.transition = 'none'
      card.style.transform = `translate(${was.x - now.x}px, ${was.y - now.y}px)`
      void card.offsetWidth
      card.style.transition = ''
      card.style.transform = ''
    }
    lastRects.current = next

    let raf = 0
    const until = performance.now() + 450
    const measure = (): void => {
      const o = el.getBoundingClientRect()
      const box = (id: string): DOMRect | undefined => el.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)?.getBoundingClientRect()
      const out: { key: string; d: string; link: Link }[] = []
      for (const link of links) {
        const a = box(link.from)
        const b = box(link.to)
        if (!a || !b) continue
        const x1 = a.right - o.left + el.scrollLeft
        const y1 = a.top + a.height / 2 - o.top + el.scrollTop
        const x2 = b.left - o.left + el.scrollLeft
        const y2 = b.top + b.height / 2 - o.top + el.scrollTop
        const bend = Math.max(30, Math.abs(x2 - x1) / 2)
        const d = x2 > x1 ? `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1 + 60},${y1 - 60} ${x2 - 60},${y2 - 60} ${x2},${y2}`
        out.push({ key: `${link.from}>${link.to}`, d, link })
      }
      setPaths(out)
      if (performance.now() < until) raf = requestAnimationFrame(measure)
    }
    raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [plan, links, openSlot])

  // drag empty space to pan the board, like the map
  const pan = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const [panning, setPanning] = useState(false)
  const onPanStart = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-card], button, select, a')) return
    const el = board.current!
    pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false }
    el.setPointerCapture?.(e.pointerId)
    setPanning(true)
  }
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const p = pan.current
    if (!p) return
    if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 4) p.moved = true
    board.current!.scrollLeft = p.left - (e.clientX - p.x)
    board.current!.scrollTop = p.top - (e.clientY - p.y)
  }
  const onPanEnd = (): void => {
    // a click on empty space (not a drag) lets go of the selected card
    if (pan.current && !pan.current.moved) setStuck(null)
    pan.current = null
    setPanning(false)
  }

  const doneCredits = [...taken].reduce((n, b) => n + credits(b), 0)
  const plannedCredits = plan.items.filter((i) => i.semester !== null).reduce((n, i) => n + i.credits, 0)
  const electives = Math.max(0, GRADUATION_CREDITS - doneCredits - plannedCredits)

  const drop = (s: number) => (e: React.DragEvent): void => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (id) onMove(id, s)
    setDragging(null)
    setOver(null)
  }

  const card = (i: PlanItem) => {
    const lit = !chain || chain.has(i.id)
    const problems = issues[i.id]
    const code = codeOf(i)
    const course = code ? COURSE_BY_BASE.get(code) : undefined
    const open = () => {
      stick(i.id)
      if (code) onOpen(code)
      else setOpenSlot((o) => (o === i.id ? null : i.id))
    }
    const cls = [
      'plan-card',
      i.kind === 'slot' && !i.pick ? 'slot' : '',
      i.pick ? 'picked' : '',
      problems ? 'bad' : '',
      lit ? '' : 'dim',
      focus === i.id ? 'hot' : '',
      stuck === i.id ? 'stuck' : '',
      selectedId === code ? 'selected' : '',
      dragging === i.id ? 'lifting' : ''
    ].join(' ')
    const s = i.semester
    const name = code ?? i.title
    return (
      <div
        key={i.id}
        data-card={i.id}
        className={cls}
        draggable
        tabIndex={0}
        role="button"
        aria-pressed={stuck === i.id}
        aria-label={`${name}${s !== null ? `, ${semesterLabel(s)}` : ''}${problems ? `. ${problems.join('. ')}` : ''}`}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', i.id)
          e.dataTransfer.effectAllowed = 'move'
          setDragging(i.id)
          setHover(null)
        }}
        onDragEnd={() => {
          setDragging(null)
          setOver(null)
        }}
        onMouseEnter={() => !dragging && setHover(i.id)}
        onMouseLeave={() => setHover((h) => (h === i.id ? null : h))}
        onClick={open}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            open()
          }
        }}
      >
        <div className="plan-card-top">
          {code ? <span className="mono code">{code}</span> : <span className="choose">Choose</span>}
          <span className="cr">{i.credits} cr</span>
        </div>
        <div className="plan-card-title">{course ? course.title : i.title.replace(/^Core: /, '')}</div>
        {i.pick && <div className="plan-card-for">for {i.title.replace(/^Core: /, 'Core: ')}</div>}
        <div className="plan-card-tags">
          {i.reason === 'core' && <span className="tag core">Core</span>}
          {i.reason === 'prereq' && <span className="tag">Prerequisite</span>}
          {i.reason === 'cart' && <span className="tag cart">In cart</span>}
          {i.reason === 'added' && <span className="tag added">Added</span>}
          {i.pick && <span className="tag added">Your pick</span>}
          {i.pinned && i.reason !== 'added' && <span className="tag moved">Moved</span>}
          {i.kind === 'slot' && !i.pick && <span className="tag">{i.options?.length ?? 0} options</span>}
        </div>
        {problems && <p className="plan-card-issue">{problems.join(' · ')}</p>}
        {i.kind === 'slot' && openSlot === i.id && (
          <SlotPicker
            options={i.options ?? []}
            current={i.pick ?? null}
            onPick={(b) => {
              onPick(i.id, b)
              setOpenSlot(null)
            }}
            onClose={() => setOpenSlot(null)}
          />
        )}
        <div className="plan-move" onClick={(e) => e.stopPropagation()}>
          {i.pick && (
            <button aria-label={`Change the course picked for ${i.title}`} title="Change pick" onClick={() => setOpenSlot(i.id)}>
              ✎
            </button>
          )}
          {i.reason === 'added' && (
            <button aria-label={`Remove ${name} from the plan`} title="Remove" onClick={() => onRemove(i.id)}>
              ✕
            </button>
          )}
          {s !== null && (
            <>
              <button aria-label={`Move ${name} a semester earlier`} disabled={s <= start} onClick={() => onMove(i.id, s - 1)}>
                ←
              </button>
              <button
                aria-label={`Move ${name} a semester later`}
                disabled={s >= SEMESTERS - 1}
                onClick={() => onMove(i.id, s + 1)}
              >
                →
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  const inPlan = new Set([...taken, ...plan.items.flatMap((i) => (codeOf(i) ? [codeOf(i)!] : []))])

  return (
    <section className="plan" aria-label="Proposed four-year plan">
      <header className="plan-head">
        <div className="plan-title">
          <h2>{edited ? 'Your plan' : 'Proposed plan'}</h2>
        </div>
        <div className="plan-controls">
          <label className="plan-start">
            Starting
            <select value={start} onChange={(e) => onStart(Number(e.target.value))}>
              {Array.from({ length: SEMESTERS }, (_, s) => (
                <option key={s} value={s}>
                  {semesterLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <span className="plan-sum">
            <strong>{plannedCredits}</strong> cr planned · <strong>{doneCredits}</strong> done · {electives} left for electives of{' '}
            {GRADUATION_CREDITS}
          </span>
          {edited &&
            (confirmReset ? (
              <span className="plan-confirm">
                Clear your moves, picks and added courses?
                <button
                  className="btn primary small-btn"
                  onClick={() => {
                    onStartOver()
                    setConfirmReset(false)
                  }}
                >
                  Start over
                </button>
                <button className="btn small-btn" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="btn small-btn" onClick={() => setConfirmReset(true)}>
                ↺ Start over
              </button>
            ))}
        </div>
      </header>

      <div
        className={`plan-board ${dragging ? 'dragging' : ''} ${panning ? 'panning' : ''}`}
        ref={board}
        onDragLeave={() => setOver(null)}
        onPointerDown={onPanStart}
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onPointerCancel={onPanEnd}
      >
        <svg className="plan-lines" aria-hidden="true">
          {paths.map(({ key, d, link }) => {
            const lit = chain ? chain.has(link.from) && chain.has(link.to) : false
            return <path key={key} d={d} className={`${link.bad ? 'bad' : ''} ${lit ? 'lit' : ''} ${chain && !lit ? 'dim' : ''}`} />
          })}
        </svg>

        {taken.size > 0 && (
          <div className="plan-col done">
            <h3>
              Done <span>{doneCredits} cr</span>
            </h3>
            <div className="plan-done-list">
              {[...taken].sort().map((b) => (
                <button
                  key={b}
                  data-card={`done:${b}`}
                  className={`plan-done mono ${chain && !chain.has(`done:${b}`) ? 'dim' : ''}`}
                  onClick={() => {
                    stick(`done:${b}`)
                    onOpen(b)
                  }}
                  onMouseEnter={() => setHover(`done:${b}`)}
                  onMouseLeave={() => setHover(null)}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        )}

        {bySemester.map((items, s) => {
          if (s < start) return null
          const cr = plan.semesters[s].credits
          const over16 = cr > MAX_CREDITS
          const verdict = allowed ? (s >= allowed.lo && s <= allowed.hi ? 'ok' : 'no') : ''
          return (
            <div
              key={s}
              className={`plan-col ${over === s ? 'over' : ''} ${verdict}`}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (over !== s) setOver(s)
              }}
              onDrop={drop(s)}
            >
              <h3>
                {semesterLabel(s)}
                <span className={over16 ? 'heavy' : ''} title={over16 ? `Over ${MAX_CREDITS} credits` : undefined}>
                  {cr} cr
                </span>
              </h3>
              <div className="plan-stack">{items.map(card)}</div>
              {addingTo === s ? (
                <AddCourse
                  exclude={inPlan}
                  onAdd={(b) => {
                    onAdd(b, s)
                    setAddingTo(null)
                  }}
                  onClose={() => setAddingTo(null)}
                />
              ) : (
                <button className="plan-add" onClick={() => setAddingTo(s)}>
                  + Add course
                </button>
              )}
              {over16 && <p className="plan-room heavy">Over {MAX_CREDITS} credits</p>}
            </div>
          )
        })}

        {unplaced.length > 0 && (
          <div className="plan-col unplaced">
            <h3>Doesn’t fit in four years</h3>
            <div className="plan-stack">{unplaced.map(card)}</div>
          </div>
        )}
      </div>
    </section>
  )
}

/** The options of a "Choose" card, searchable; clicking one picks it. */
function SlotPicker({
  options,
  current,
  onPick,
  onClose
}: {
  options: string[]
  current: string | null
  onPick: (base: string | null) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = options
    .filter((b) => {
      const hay = `${b} ${COURSE_BY_BASE.get(b)?.title ?? ''}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    .slice(0, 40)
  return (
    <div className="plan-picker" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      {options.length > 6 && (
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${options.length} options`} aria-label="Search options" />
      )}
      <ul>
        {shown.map((b) => (
          <li key={b}>
            <button className={b === current ? 'on' : ''} onClick={() => onPick(b)}>
              <span className="mono">{b}</span> {COURSE_BY_BASE.get(b)?.title}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="fine">No options match.</li>}
      </ul>
      {current && (
        <button className="plan-unpick" onClick={() => onPick(null)}>
          Leave it open
        </button>
      )}
    </div>
  )
}

/** Search the whole catalog and add a course to a semester. */
function AddCourse({
  exclude,
  onAdd,
  onClose
}: {
  exclude: Set<string>
  onAdd: (base: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const results = words.length
    ? COURSES.filter((c) => !exclude.has(c.base) && words.every((w) => `${c.base} ${c.code} ${c.title}`.toLowerCase().includes(w))).slice(0, 8)
    : []
  return (
    <div className="plan-picker add" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Course code or title" aria-label="Find a course to add" />
      <ul>
        {results.map((c) => (
          <li key={c.base}>
            <button onClick={() => onAdd(c.base)}>
              <span className="mono">{c.base}</span> {c.title} <span className="fine">{c.credits} cr</span>
            </button>
          </li>
        ))}
        {words.length > 0 && results.length === 0 && <li className="fine">No courses match.</li>}
      </ul>
      <button className="plan-unpick" onClick={onClose}>
        Cancel
      </button>
    </div>
  )
}
