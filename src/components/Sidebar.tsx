import { useState } from 'react'
import { CORE, CORE_CAUTION } from '../data/core'
import { COURSE_BY_BASE } from '../data'
import { cartWarnings, coreProgress, extractCodes } from '../lib/plan'

/** Plan column: cart, Core progress, DegreeWorks import. */
export default function Sidebar({
  taken,
  cart,
  onOpen,
  onToggleCart,
  onMarkTaken
}: {
  taken: Set<string>
  cart: string[]
  onOpen: (base: string) => void
  onToggleCart: (base: string) => void
  onMarkTaken: (bases: string[]) => void
}) {
  const progress = coreProgress(taken, COURSE_BY_BASE)
  const done = progress.filter((p) => p.satisfiedBy).length
  const warnings = cartWarnings(cart, taken, COURSE_BY_BASE)
  const credits = cart.reduce((n, b) => n + (Number.parseFloat(COURSE_BY_BASE.get(b)?.credits ?? '') || 0), 0)

  return (
    <aside className="sidebar" aria-label="Your plan">
      <section className="side-section">
        <h3>
          Cart{' '}
          <span className="count">
            {cart.length} {cart.length === 1 ? 'course' : 'courses'} · {credits} cr
          </span>
        </h3>
        {cart.length === 0 ? (
          <p className="cart-empty">Open a course on the map and choose “Add to cart” to plan your next semester.</p>
        ) : (
          <ul className="cart-list">
            {cart.map((b) => {
              const c = COURSE_BY_BASE.get(b)
              return (
                <li key={b} className="cart-item">
                  <button className="linkish" onClick={() => onOpen(b)}>
                    <span className="code">{c?.code ?? b}</span>
                    <span className="t">{c?.title ?? 'Not in the 2026–27 catalog'}</span>
                  </button>
                  <button className="icon-btn" onClick={() => onToggleCart(b)} aria-label={`Remove ${b} from cart`}>
                    ✕
                  </button>
                  {warnings[b] && <p className="warn">Needs {warnings[b].join(', ')}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="side-section">
        <h3>
          Core requirements <span className="count">{done} of {progress.length}</span>
        </h3>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.length} aria-valuenow={done}>
          <div style={{ width: `${(done / progress.length) * 100}%` }} />
        </div>
        <ul className="core-list">
          {progress.map(({ categoryId, satisfiedBy }) => {
            const cat = CORE.find((c) => c.id === categoryId)!
            return (
              <li key={categoryId} className={satisfiedBy ? 'done' : ''}>
                <span className="check-ic" aria-hidden="true" />
                <a href={cat.source} target="_blank" rel="noreferrer" title="Official Marist list">
                  {cat.name}
                </a>
                {satisfiedBy ? (
                  <button className="linkish by" onClick={() => onOpen(satisfiedBy)}>
                    {satisfiedBy}
                  </button>
                ) : (
                  <span />
                )}
              </li>
            )
          })}
        </ul>
        <p className="fine">Marist: “{CORE_CAUTION}”</p>
      </section>

      <ImportBox taken={taken} onMarkTaken={onMarkTaken} />
    </aside>
  )
}

function ImportBox({ taken, onMarkTaken }: { taken: Set<string>; onMarkTaken: (bases: string[]) => void }) {
  const [text, setText] = useState('')
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
  const found = text ? extractCodes(text, COURSE_BY_BASE).filter((b) => !taken.has(b)) : []
  const selected = found.filter((b) => !unchecked.has(b))
  return (
    <details className="import side-section">
      <summary>Import from DegreeWorks</summary>
      <div className="body">
        <textarea
          value={text}
          placeholder="Paste your audit text here"
          aria-label="DegreeWorks audit text"
          onChange={(e) => {
            setText(e.target.value)
            setUnchecked(new Set())
          }}
        />
        {text && found.length === 0 && <p className="fine">No new catalog courses found in that text.</p>}
        {found.length > 0 && (
          <>
            <ul className="checks">
              {found.map((b) => (
                <li key={b}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!unchecked.has(b)}
                      onChange={() => {
                        const next = new Set(unchecked)
                        if (next.has(b)) next.delete(b)
                        else next.add(b)
                        setUnchecked(next)
                      }}
                    />
                    <span className="mono">{b}</span> {COURSE_BY_BASE.get(b)?.title}
                  </label>
                </li>
              ))}
            </ul>
            <button
              className="btn primary"
              disabled={selected.length === 0}
              onClick={() => {
                onMarkTaken(selected)
                setText('')
                setUnchecked(new Set())
              }}
            >
              Mark {selected.length} as taken
            </button>
          </>
        )}
      </div>
    </details>
  )
}
