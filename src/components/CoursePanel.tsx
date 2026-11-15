import { CORE } from '../data/core'
import { COURSE_BY_BASE, COURSES } from '../data'
import { countsToward, hasUnparsedPrereq, historyCredits, prereqCheck, status, unlocks } from '../lib/plan'
import type { Major, Prereq } from '../lib/types'

interface Props {
  base: string
  major: Major
  taken: Set<string>
  cart: Set<string>
  onToggleTaken: (base: string) => void
  onToggleCart: (base: string) => void
  onOpen: (base: string) => void
  onClose: () => void
}

const coreName = (id: string): string => CORE.find((c) => c.id === id)?.name ?? id

function PrereqTree({ p, taken, onOpen }: { p: Prereq; taken: Set<string>; onOpen: (b: string) => void }) {
  if (p.kind === 'course') {
    const ok = taken.has(p.code)
    return (
      <button className={`chip ${ok ? 'ok' : 'miss'}`} onClick={() => onOpen(p.code)}>
        {ok ? '✓' : '✗'} {p.code}
      </button>
    )
  }
  if (p.kind === 'text') return <span className="chip text">{p.text}</span>
  return (
    <span className="prereq-group">
      {p.of.map((x, i) => (
        <span key={i} className="prereq-item">
          {i > 0 && <span className="joiner">{p.kind === 'all' ? 'and' : 'or'}</span>}
          <PrereqTree p={x} taken={taken} onOpen={onOpen} />
        </span>
      ))}
    </span>
  )
}

export default function CoursePanel({ base, major, taken, cart, onToggleTaken, onToggleCart, onOpen, onClose }: Props) {
  const course = COURSE_BY_BASE.get(base)
  if (!course) {
    return (
      <aside className="panel">
        <header>
          <h2>{base}</h2>
          <button className="close" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <p className="muted">Listed by this major, but not in the 2026–27 course catalog.</p>
      </aside>
    )
  }
  const st = status(base, taken, COURSE_BY_BASE)
  const check = prereqCheck(course.prereq, taken)
  const counts = countsToward(base, major, historyCredits(taken, COURSE_BY_BASE))
  const opens = unlocks(base, COURSES)
  return (
    <aside className="panel">
      <header>
        <div>
          <div className="code">{course.code}</div>
          <h2>{course.title}</h2>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
      </header>

      <div className="facts">
        <span>{course.credits} credits</span>
        {course.liberalArts !== null && <span>{course.liberalArts ? 'Liberal Arts' : 'Non Liberal Arts'}</span>}
        {course.offered && <span>Offered: {course.offered}</span>}
        <span className={`status ${st}`}>{st === 'taken' ? 'Taken' : st === 'available' ? 'Can take' : 'Prerequisites missing'}</span>
      </div>

      <div className="actions">
        <button className={taken.has(base) ? 'btn' : 'btn primary'} onClick={() => onToggleTaken(base)}>
          {taken.has(base) ? 'Unmark taken' : 'Mark as taken'}
        </button>
        {!taken.has(base) && (
          <button className="btn" onClick={() => onToggleCart(base)}>
            {cart.has(base) ? 'Remove from cart' : 'Add to cart'}
          </button>
        )}
      </div>

      <section>
        <h3>Prerequisites</h3>
        {!course.prereqText && <p className="muted">None</p>}
        {course.prereq && <PrereqTree p={course.prereq} taken={taken} onOpen={onOpen} />}
        {hasUnparsedPrereq(course) && <p className="verbatim">{course.prereqText}</p>}
        {course.prereq && check.met === null && <p className="muted small">Some conditions can’t be checked here: {course.prereqText}</p>}
        {course.coreqText && <p className="small">Corequisite: {course.coreqText}</p>}
      </section>

      <section>
        <h3>Counts toward</h3>
        {counts.groups.length === 0 && counts.core.length === 0 && <p className="muted">Not listed in this major or the Core.</p>}
        <div className="chips">
          {counts.groups.map((g) => (
            <span key={g} className="chip group">{major.name}: {g}</span>
          ))}
          {counts.core.map((id) => (
            <span key={id} className="chip core">Core: {coreName(id)}</span>
          ))}
        </div>
        {counts.crossListedWarning && (
          <p className="warn">Counts toward only one Breadth category, not all of these. (Marist: “A cross-listed course can only satisfy ONE breadth requirement.”)</p>
        )}
      </section>

      {opens.length > 0 && (
        <section>
          <h3>Unlocks</h3>
          <div className="chips">
            {opens.map((b) => (
              <button key={b} className="chip link" onClick={() => onOpen(b)}>{b}</button>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="desc">{course.description}</p>
        <a className="source" href={course.url} target="_blank" rel="noreferrer">View in the Marist catalog ↗</a>
      </section>
    </aside>
  )
}
