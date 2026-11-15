// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PlanView from '../src/components/PlanView'
import { proposePlan, semesterLabel } from '../src/lib/schedule'
import { COURSE_BY_BASE, MAJOR_BY_ID } from '../src/data'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver
})
afterEach(cleanup)

const major = MAJOR_BY_ID.get('computer-science-bs--software-development')!
const plan = proposePlan({ major, courses: COURSE_BY_BASE, taken: new Set(['CMPT 120']), cart: [], start: 1, pins: {} })
const view = (over: Partial<Parameters<typeof PlanView>[0]> = {}) =>
  render(
    <PlanView
      plan={plan}
      taken={new Set(['CMPT 120'])}
      start={1}
      edited={false}
      selectedId={null}
      onStart={() => {}}
      onMove={() => {}}
      onPick={() => {}}
      onAdd={() => {}}
      onRemove={() => {}}
      onStartOver={() => {}}
      onOpen={() => {}}
      {...over}
    />
  )

describe('PlanView', () => {
  test('a column per semester from the start, plus what is done', () => {
    view()
    const heads = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(heads[0]).toMatch(/^Done/)
    expect(heads.slice(1, 3)).toEqual([expect.stringMatching(/^Year 1 · Spring/), expect.stringMatching(/^Year 2 · Fall/)])
    expect(heads.some((h) => h?.startsWith('Year 1 · Fall'))).toBe(false)
  })

  const room = (s: number, cr: number) => plan.semesters[s].credits + cr <= 16
  test('the arrow buttons move a course one semester (when the next has room)', () => {
    const onMove = vi.fn()
    view({ onMove })
    const item = plan.items.find((i) => i.kind === 'course' && i.semester !== null && i.semester < 7 && room(i.semester + 1, i.credits))!
    fireEvent.click(screen.getByRole('button', { name: `Move ${item.id} a semester later` }))
    expect(onMove).toHaveBeenCalledWith(item.id, item.semester! + 1)
  })

  test('dropping a card on a semester moves it there', () => {
    const onMove = vi.fn()
    const { container } = view({ onMove })
    const data = new Map<string, string>()
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(container.querySelector('[data-card="CMPT 220"]')!, { dataTransfer })
    const target = [4, 5, 6, 7].find((x) => room(x, 4))!
    const col = [...container.querySelectorAll('.plan-col')].find((c) => c.querySelector('h3')?.textContent?.startsWith(semesterLabel(target)))!
    fireEvent.dragOver(col, { dataTransfer })
    fireEvent.drop(col, { dataTransfer })
    expect(onMove).toHaveBeenCalledWith('CMPT 220', target)
  })

  test('dragging empty space pans the board', () => {
    const { container } = view()
    const board = container.querySelector('.plan-board') as HTMLDivElement
    board.scrollLeft = 300
    fireEvent.pointerDown(board, { button: 0, clientX: 500, clientY: 400, pointerId: 1 })
    fireEvent.pointerMove(board, { clientX: 400, clientY: 400, pointerId: 1 })
    expect(board.scrollLeft).toBe(400)
    fireEvent.pointerUp(board, { pointerId: 1 })
    fireEvent.pointerMove(board, { clientX: 100, clientY: 400, pointerId: 1 })
    expect(board.scrollLeft).toBe(400)
  })

  test('clicking a course opens it', () => {
    const onOpen = vi.fn()
    const { container } = view({ onOpen })
    fireEvent.click(container.querySelector('[data-card="CMPT 220"]')!)
    expect(onOpen).toHaveBeenCalledWith('CMPT 220')
  })
})

describe('clicking a card keeps its chain lit', () => {
  const lit = (c: HTMLElement) => [...c.querySelectorAll('.plan-card:not(.dim)')].map((e) => (e as HTMLElement).dataset.card)

  test('stays after the pointer leaves and over other cards; click again, empty space or Esc lets go', () => {
    const { container } = view()
    const card = container.querySelector('[data-card="CMPT 220"]') as HTMLElement
    fireEvent.click(card)
    const chain = lit(container)
    expect(chain).toContain('CMPT 221')
    expect(chain).not.toContain('core:history')

    fireEvent.mouseLeave(card)
    fireEvent.mouseEnter(container.querySelector('[data-card="core:history"]')!)
    expect(lit(container)).toEqual(chain)
    fireEvent.mouseLeave(container.querySelector('[data-card="core:history"]')!)

    fireEvent.click(card)
    expect(container.querySelectorAll('.plan-card.dim')).toHaveLength(0)

    fireEvent.click(card)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelectorAll('.plan-card.dim')).toHaveLength(0)

    fireEvent.click(card)
    const board = container.querySelector('.plan-board')!
    fireEvent.pointerDown(board, { button: 0, clientX: 10, clientY: 10, pointerId: 2 })
    fireEvent.pointerUp(board, { clientX: 10, clientY: 10, pointerId: 2 })
    expect(container.querySelectorAll('.plan-card.dim')).toHaveLength(0)
  })
})

describe('editing', () => {
  test('a "Choose" card opens a searchable list; clicking an option picks it', () => {
    const onPick = vi.fn()
    const { container } = view({ onPick })
    const slot = container.querySelector('[data-card="core:history"]')!
    fireEvent.click(slot)
    fireEvent.change(screen.getByLabelText('Search options'), { target: { value: 'HIST 101' } })
    fireEvent.click(screen.getByRole('button', { name: /^HIST 101/ }))
    expect(onPick).toHaveBeenCalledWith('core:history', 'HIST 101')
  })

  test('+ Add course searches the catalog and adds to that semester', () => {
    const onAdd = vi.fn()
    const { container } = view({ onAdd })
    const col = [...container.querySelectorAll('.plan-col')].find((c) => c.querySelector('h3')?.textContent?.startsWith('Year 4 · Spring'))!
    fireEvent.click(col.querySelector('.plan-add')!)
    fireEvent.change(screen.getByLabelText('Find a course to add'), { target: { value: 'ART 110' } })
    fireEvent.click(screen.getByRole('button', { name: /^ART 110/ }))
    expect(onAdd).toHaveBeenCalledWith('ART 110', 7)
  })

  test('a full semester (16 credits) takes no more: no drop, no arrow move, no add', () => {
    const full = proposePlan({ major, courses: COURSE_BY_BASE, taken: new Set(), cart: [], start: 0, pins: {} })
    const s = full.semesters.findIndex((x) => x.credits >= 15)
    const fullPlan = { ...full, semesters: full.semesters.map((x, i) => (i === s ? { ...x, credits: 16 } : x)) }
    const onMove = vi.fn()
    const { container } = render(
      <PlanView plan={fullPlan} taken={new Set()} start={0} edited={false} selectedId={null} onStart={() => {}} onMove={onMove}
        onPick={() => {}} onAdd={() => {}} onRemove={() => {}} onStartOver={() => {}} onOpen={() => {}} />
    )
    const cols = [...container.querySelectorAll('.plan-col')]
    expect((cols[s].querySelector('.plan-add') as HTMLButtonElement).disabled).toBe(true)
    const outsider = full.items.find((i) => i.semester === s + 1)!
    const data = new Map<string, string>()
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(container.querySelector(`[data-card="${outsider.id}"]`)!, { dataTransfer })
    fireEvent.drop(cols[s], { dataTransfer })
    expect(onMove).not.toHaveBeenCalled()
    const name = outsider.kind === 'course' ? outsider.id : outsider.title
    expect((screen.getByRole('button', { name: `Move ${name} a semester earlier` }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('Start over asks first', () => {
    const onStartOver = vi.fn()
    view({ edited: true, onStartOver })
    fireEvent.click(screen.getByRole('button', { name: '↺ Start over' }))
    expect(onStartOver).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }))
    expect(onStartOver).toHaveBeenCalledOnce()
  })
})
