import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Major } from '../lib/types'

/** Searchable major picker: type part of a major or concentration name. */
export default function MajorPicker({
  majors,
  value,
  onChange,
  variant = 'large',
  placeholder = 'Choose your major…'
}: {
  majors: Major[]
  value: string | null
  onChange: (id: string) => void
  variant?: 'large' | 'nav'
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const current = majors.find((m) => m.id === value) ?? null

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const words = q.split(/\s+/).filter(Boolean)
    return majors.filter((m) => {
      const hay = `${m.name} ${m.concentration ?? ''} ${m.degree}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [majors, query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    input.current?.focus()
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (id: string): void => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={`picker ${variant}`} ref={root}>
      <button
        type="button"
        className="picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          setActive(0)
        }}
      >
        {current ? (
          <span className="picker-value">
            <span className="name">{current.name}</span>
            {current.concentration && <span className="conc">{current.concentration}</span>}
          </span>
        ) : (
          <span className="picker-placeholder">{placeholder}</span>
        )}
        <span className="chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="picker-pop">
          <input
            ref={input}
            className="picker-search"
            placeholder="Search majors and concentrations"
            value={query}
            role="combobox"
            aria-controls={listId}
            aria-expanded="true"
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (results[active]) pick(results[active].id)
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
          />
          <ul className="picker-list" id={listId} role="listbox">
            {results.length === 0 && <li className="picker-empty">No majors match “{query}”.</li>}
            {results.map((m, i) => (
              <li
                key={m.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={m.id === value}
                className={`${i === active ? 'active' : ''} ${m.id === value ? 'current' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(m.id)
                }}
              >
                <span className="name">{m.name}</span>
                <span className="meta">
                  {m.concentration ? `${m.concentration} · ` : ''}
                  {m.degree}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
