import { useState } from 'react'
import { CORE, CORE_CAUTION } from '../data/core'
import { COURSE_BY_BASE } from '../data'
import { cartWarnings, coreProgress, extractCodes } from '../lib/plan'

/** Cart, Core progress and the DegreeWorks paste box. */
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
  const warnings = cartWarnings(cart, taken, COURSE_BY_BASE)
  const credits = cart.reduce((n, b) => n + (Number.parseFloat(COURSE_BY_BASE.get(b)?.credits ?? '') || 0), 0)
  return (
    <aside className="sidebar">
      <section>
        <h3>
          Cart <span className="muted">· {cart.length} courses · {credits} credits</span>
        </h3>
        {cart.length === 0 && <p className="muted small">Add courses from the map.</p>}
        <ul className="list">
          {cart.map((b) => (
            <li key={b}>
              <button className="linkish" onClick={() => onOpen(b)}>
                <strong>{b}</strong> {COURSE_BY_BASE.get(b)?.title}
              </button>
              <button className="x" onClick={() => onToggleCart(b)} aria-label={`Remove ${b}`}>✕</button>
              {warnings[b] && <div className="warn small">Missing: {warnings[b].join(', ')}</div>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Core requirements</h3>
        <ul className="list core">
          {progress.map(({ categoryId, satisfiedBy }) => {
            const cat = CORE.find((c) => c.id === categoryId)!
            return (
              <li key={categoryId} className={satisfiedBy ? 'done' : ''}>
                <span className="tick">{satisfiedBy ? '✓' : '○'}</span>
                <a href={cat.source} target="_blank" rel="noreferrer">{cat.name}</a>
                {satisfiedBy && <button className="linkish small" onClick={() => onOpen(satisfiedBy)}>{satisfiedBy}</button>}
              </li>
            )
          })}
        </ul>
        <p className="muted small">Marist: “{CORE_CAUTION}”</p>
      </section>

      <PasteBox taken={taken} onMarkTaken={onMarkTaken} />
    </aside>
  )
}

function PasteBox({ taken, onMarkTaken }: { taken: Set<string>; onMarkTaken: (bases: string[]) => void }) {
  const [text, setText] = useState('')
  const [checked, setChecked] = useState<Set<string> | null>(null)
  const found = text ? extractCodes(text, COURSE_BY_BASE).filter((b) => !taken.has(b)) : []
  const selected = checked ?? new Set(found)
  return (
    <section>
      <h3>Paste from DegreeWorks</h3>
      <textarea
        value={text}
        placeholder="Paste your audit text"
        onChange={(e) => {
          setText(e.target.value)
          setChecked(null)
        }}
      />
      {text && found.length === 0 && <p className="muted small">No new catalog courses found.</p>}
      {found.length > 0 && (
        <>
          <ul className="list checks">
            {found.map((b) => (
              <li key={b}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(b)}
                    onChange={() => {
                      const next = new Set(selected)
                      if (next.has(b)) next.delete(b)
                      else next.add(b)
                      setChecked(next)
                    }}
                  />
                  <strong>{b}</strong> {COURSE_BY_BASE.get(b)?.title}
                </label>
              </li>
            ))}
          </ul>
          <button
            className="btn primary"
            disabled={selected.size === 0}
            onClick={() => {
              onMarkTaken([...selected])
              setText('')
              setChecked(null)
            }}
          >
            Mark {selected.size} as taken
          </button>
        </>
      )}
    </section>
  )
}
