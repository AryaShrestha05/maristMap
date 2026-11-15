// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PlanView from '../src/components/PlanView'
import { proposePlan } from '../src/lib/schedule'
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
      moved={false}
      selectedId={null}
      onStart={() => {}}
      onMove={() => {}}
      onUndoMoves={() => {}}
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

  test('the arrow buttons move a course one semester', () => {
    const onMove = vi.fn()
    view({ onMove })
    const item = plan.items.find((i) => i.id === 'CMPT 220')!
    fireEvent.click(screen.getByRole('button', { name: 'Move CMPT 220 a semester later' }))
    expect(onMove).toHaveBeenCalledWith('CMPT 220', item.semester! + 1)
  })

  test('dropping a card on a semester moves it there', () => {
    const onMove = vi.fn()
    const { container } = view({ onMove })
    const data = new Map<string, string>()
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(container.querySelector('[data-card="CMPT 220"]')!, { dataTransfer })
    const col = [...container.querySelectorAll('.plan-col')].find((c) => c.querySelector('h3')?.textContent?.startsWith('Year 3 · Fall'))!
    fireEvent.dragOver(col, { dataTransfer })
    fireEvent.drop(col, { dataTransfer })
    expect(onMove).toHaveBeenCalledWith('CMPT 220', 4)
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

  test('clicking a course opens it; clicking a choice lists its options', () => {
    const onOpen = vi.fn()
    const { container } = view({ onOpen })
    fireEvent.click(container.querySelector('[data-card="CMPT 220"]')!)
    expect(onOpen).toHaveBeenCalledWith('CMPT 220')
    const slot = container.querySelector('[data-card="core:history"]')!
    fireEvent.click(slot)
    expect(slot.querySelectorAll('.plan-options button').length).toBeGreaterThan(0)
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
