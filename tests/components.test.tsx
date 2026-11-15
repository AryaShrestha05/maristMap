// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Sidebar from '../src/components/Sidebar'
import MajorPicker from '../src/components/MajorPicker'
import { MAJORS } from '../src/data'

afterEach(cleanup)

const sidebar = (over: Partial<Parameters<typeof Sidebar>[0]> = {}) =>
  render(
    <Sidebar
      taken={new Set()}
      cart={[]}
      onOpen={() => {}}
      onToggleCart={() => {}}
      onMarkTaken={() => {}}
      canTakeNow={[]}
      onUnmarkAll={() => {}}
      onClearCart={() => {}}
      majorProgress={{ done: 0, total: 3 }}
      shareUrl="http://localhost/#plan=x"
      {...over}
    />
  )

describe('DegreeWorks import', () => {
  const audit = [
    'CMPT 120L Introduction to Programming A 4',
    'Still needed: 1 Class in CMPT 220 or CMPT 221',
    'MATH 205L Discrete Mathematics IP 4'
  ].join('\n')

  test('marks completed courses only; in-progress start unchecked; still-needed never offered', () => {
    const onMarkTaken = vi.fn()
    sidebar({ onMarkTaken })
    fireEvent.change(screen.getByLabelText('DegreeWorks audit text'), { target: { value: audit } })
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.map((b) => [b.parentElement?.textContent?.slice(0, 8), b.checked])).toEqual([
      ['CMPT 120', true],
      ['MATH 205', false]
    ])
    expect(screen.queryByText('CMPT 220')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mark 1 as taken' }))
    expect(onMarkTaken).toHaveBeenCalledWith(['CMPT 120'])
  })

  test('an in-progress course can be ticked in', () => {
    const onMarkTaken = vi.fn()
    sidebar({ onMarkTaken })
    fireEvent.change(screen.getByLabelText('DegreeWorks audit text'), { target: { value: audit } })
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: 'Mark 2 as taken' }))
    expect(onMarkTaken).toHaveBeenCalledWith(['CMPT 120', 'MATH 205'])
  })
})

describe('reset', () => {
  test('asks before unmarking every course', () => {
    const onUnmarkAll = vi.fn()
    sidebar({ taken: new Set(['CMPT 120', 'MATH 205']), onUnmarkAll })
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }))
    expect(onUnmarkAll).not.toHaveBeenCalled()
    expect(screen.getByText('Unmark 2 courses?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unmark all' }))
    expect(onUnmarkAll).toHaveBeenCalledOnce()
  })
})

describe('major picker', () => {
  test('Escape closes the picker without reaching window listeners (the course panel stays open)', () => {
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    render(<MajorPicker majors={MAJORS} value={null} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Choose your major/ }))
    const search = screen.getByPlaceholderText('Search majors and concentrations')
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Search majors and concentrations')).toBeNull()
    expect(onWindowKey).not.toHaveBeenCalled()
    window.removeEventListener('keydown', onWindowKey)
  })

  test('typing filters and Enter picks the first match', () => {
    const onChange = vi.fn()
    render(<MajorPicker majors={MAJORS} value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Choose your major/ }))
    const search = screen.getByPlaceholderText('Search majors and concentrations')
    fireEvent.change(search, { target: { value: 'finance' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(MAJORS.find((m) => m.id === onChange.mock.calls[0][0])?.name).toMatch(/Finance/)
  })
})
