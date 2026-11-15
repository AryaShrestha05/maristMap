import { STATUS_LABEL } from '../lib/labels'
import { CORE } from '../data/core'
import { COURSE_BY_BASE, COURSES } from '../data'
import { countsToward, hasUnparsedPrereq, historyCredits, pathTo, prereqCheck, status, unlocks } from '../lib/plan'
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
      <button className={`course-chip ${ok ? 'ok' : ''}`} onClick={() => onOpen(p.code)} title={COURSE_BY_BASE.get(p.code)?.title}>
        <span className="mk" aria-hidden="true">{ok ? '✓' : '○'}</span>
        {p.code}
      </button>
    )
  }
  if (p.kind === 'text') return <span className="cond">{p.text}</span>
  return (
    <span className="req">
      {p.of.map((x, i) => (
        <span key={i} className="req">
          {i > 0 && <span className="req-join">{p.kind === 'all' ? 'and' : 'or'}</span>}
          <PrereqTree p={x} taken={taken} onOpen={onOpen} />
        </span>
      ))}
    </span>
  )
}

const GRADE_RE = /\bgrade\b|\bGPA\b|\bminimum of [A-D][+-]?/i

export default function CoursePanel({ base, major, taken, cart, onToggleTaken, onToggleCart, onOpen, onClose }: Props) {
  const course = COURSE_BY_BASE.get(base)
  if (!course) {
    return (
      <aside className="panel" aria-label={base}>
        <div className="panel-head">
          <div className="row">
            <span className="code">{base}</span>
            <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <h2>Not in the 2026–27 catalog</h2>
        </div>
        <div className="panel-body">
          <p className="muted">This major lists {base}, but it isn’t in the current course catalog.</p>
        </div>
      </aside>
    )
  }
  const st = status(base, taken, COURSE_BY_BASE)
  const check = prereqCheck(course.prereq, taken)
  const counts = countsToward(base, major, historyCredits(taken, COURSE_BY_BASE))
  const opens = unlocks(base, COURSES)
  const isTaken = taken.has(base)
  const path = isTaken ? [] : pathTo(base, taken, COURSE_BY_BASE)
  const pathCredits = path.reduce((n, s) => n + (s.kind === 'course' ? Number.parseFloat(COURSE_BY_BASE.get(s.code)?.credits ?? '') || 0 : 0), 0)

  return (
    <aside className="panel" aria-label={`${course.code} ${course.title}`}>
      <div className="panel-head">
        <div className="row">
          <span className="code">{course.code}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)">✕</button>
        </div>
        <h2>{course.title}</h2>
        <div className="pills">
          <span className={`pill status ${st}`}>{STATUS_LABEL[st]}</span>
          <span className="pill">{course.credits} credits</span>
          {course.liberalArts !== null && <span className="pill">{course.liberalArts ? 'Liberal Arts' : 'Non Liberal Arts'}</span>}
          {course.offered && <span className="pill">{course.offered.replace(/\.$/, '')}</span>}
        </div>
        <div className="panel-actions">
          <button className={isTaken ? 'btn' : 'btn primary'} onClick={() => onToggleTaken(base)}>
            {isTaken ? 'Unmark taken' : 'Mark as taken'}
          </button>
          {!isTaken && (
            <button className="btn" onClick={() => onToggleCart(base)}>
              {cart.has(base) ? 'Remove from cart' : 'Add to cart'}
            </button>
          )}
        </div>
      </div>

      <div className="panel-body">
        <section>
          <h3>Prerequisites</h3>
          {!course.prereqText && <p className="muted small">None listed.</p>}
          {course.prereq && <PrereqTree p={course.prereq} taken={taken} onOpen={onOpen} />}
          {hasUnparsedPrereq(course) && <p className="verbatim">{course.prereqText}</p>}
          {course.prereq && check.met === null && (
            <p className="fine">Some conditions can’t be checked here. Catalog text: {course.prereqText}</p>
          )}
          {course.prereq && check.met !== null && course.prereqText && GRADE_RE.test(course.prereqText) && (
            <p className="fine">Also requires a minimum grade or GPA: {course.prereqText}</p>
          )}
          {course.coreqText && <p className="fine">Corequisite: {course.coreqText}</p>}
        </section>

        {!isTaken && (
          <section>
            <h3>
              Path to this course
              {path.length > 0 && (
                <span className="count">
                  {path.length} {path.length === 1 ? 'step' : 'steps'}
                  {pathCredits > 0 ? ` · ${pathCredits} cr` : ''}
                </span>
              )}
            </h3>
            {path.length === 0 ? (
              <p className="path-done">{st === 'available' ? 'Nothing left: you can take this course now.' : 'No courses needed first. Check the requirement above.'}</p>
            ) : (
              <ol className="path-list">
                {path.map((step, i) => (
                  <li key={i}>
                    <span className="step">
                      {step.kind === 'course' && (
                        <>
                          <button className="course-chip" onClick={() => onOpen(step.code)}>
                            {step.code}
                          </button>
                          <span className="t">{COURSE_BY_BASE.get(step.code)?.title}</span>
                        </>
                      )}
                      {step.kind === 'choice' && (
                        <>
                          <span className="t">One of</span>
                          {step.options.map((o) => (
                            <button key={o} className="course-chip" onClick={() => onOpen(o)} title={COURSE_BY_BASE.get(o)?.title}>
                              {o}
                            </button>
                          ))}
                          {step.alternatives.map((a) => (
                            <span key={a} className="cond">or {a}</span>
                          ))}
                        </>
                      )}
                      {step.kind === 'condition' && (
                        <span className="cond">
                          {step.forCourse !== base ? `${step.forCourse}: ` : ''}
                          {step.text}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <section>
          <h3>Counts toward</h3>
          {counts.groups.length === 0 && counts.core.length === 0 ? (
            <p className="muted small">Not listed in this major or the Core.</p>
          ) : (
            <div className="tags">
              {counts.groups.map((g) => (
                <span key={g} className="tag major">{g}</span>
              ))}
              {counts.core.map((id) => (
                <span key={id} className="tag core">Core · {coreName(id)}</span>
              ))}
            </div>
          )}
          {counts.crossListedWarning && (
            <p className="warn">
              This course counts toward only one of these Core categories. Marist: “A cross-listed course can only satisfy ONE breadth requirement.”
            </p>
          )}
        </section>

        {opens.length > 0 && (
          <section>
            <h3>
              Unlocks <span className="count">{opens.length}</span>
            </h3>
            <div className="req">
              {opens.map((b) => (
                <button key={b} className="course-chip" onClick={() => onOpen(b)} title={COURSE_BY_BASE.get(b)?.title}>
                  {b}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3>About</h3>
          <p className="desc">{course.description}</p>
          <a className="source" href={course.url} target="_blank" rel="noreferrer">
            View in the Marist catalog ↗
          </a>
        </section>
      </div>
    </aside>
  )
}
