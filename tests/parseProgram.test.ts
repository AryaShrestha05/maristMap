import { describe, expect, test } from 'vitest'
import { parsePrograms, type RawProgram } from '../src/lib/parseProgram'
import type { Course } from '../src/lib/types'

const course = (code: string, coid: string): [string, Course] => {
  const base = code.replace(/[A-Z]$/, '')
  return [coid, { code, base, prefix: base.split(' ')[0], title: '', credits: '3', liberalArts: true, description: '', offered: null, prereqText: null, coreqText: null, prereq: null, url: '' }]
}
const byCoid = new Map([course('CMPT 120L', '1'), course('CMPT 220L', '2'), course('BUS 100L', '3'), course('CMPT 404L', '4'), course('CMPT 450L', '5')])

// Shape taken from the real "Computer Science, B.S." page (2026–27 catalog)
const cs: RawProgram = {
  poid: '100',
  name: 'Computer Science, B.S.',
  url: 'https://catalog.marist.edu/preview_program.php?catoid=12&poid=100',
  items: [
    { type: 'text', text: 'Return to: Programs A-Z' },
    { type: 'text', text: 'The program prepares students for careers in software.' },
    { type: 'heading', level: 2, text: 'Computer Science Foundation Courses: 57 cr' },
    { type: 'text', text: 'Note: A minimum of 60 credits in Liberal Arts is required.' },
    { type: 'course', text: 'CMPT 120L - Introduction to Programming 4 Credit(s)', coid: '1' },
    { type: 'course', text: 'CMPT 220L - Software Development I 4 Credit(s)', coid: '2' },
    { type: 'text', text: 'Course Requirements in Related Fields:' },
    { type: 'course', text: 'BUS 100L - Introduction to Business and Management 3 Credit(s)', coid: '3' },
    { type: 'course', text: 'MATH 999L - Retired Course 3 Credit(s)', coid: null },
    { type: 'heading', level: 2, text: 'Concentration in Artificial Intelligence: 12 cr' },
    { type: 'text', text: 'Choose two of the following:' },
    { type: 'course', text: 'CMPT 404L - Artificial Intelligence 3 Credit(s)', coid: '4' },
    { type: 'heading', level: 2, text: 'Concentration in Software Development: 12 cr' },
    { type: 'course', text: 'CMPT 450L - Software Engineering 3 Credit(s)', coid: '5' },
    { type: 'heading', level: 2, text: 'Total Credits: 120' }
  ]
}
const minor: RawProgram = { poid: '200', name: 'Computer Science Minor', url: 'u', items: [{ type: 'course', text: 'CMPT 120L - x', coid: '1' }] }
const plain: RawProgram = {
  poid: '300',
  name: 'Finance, B.S.',
  url: 'u3',
  items: [
    { type: 'heading', level: 2, text: 'Requirements for a Major in Finance: 39 cr' },
    { type: 'course', text: 'BUS 100L - Introduction to Business and Management 3 Credit(s)', coid: '3' }
  ]
}

describe('parsePrograms', () => {
  const majors = parsePrograms([cs, minor, plain], byCoid)

  test('keeps B.A./B.S. majors, drops minors; splits concentrations into separate entries', () => {
    expect(majors.map((m) => `${m.name} | ${m.concentration}`)).toEqual([
      'Computer Science | Artificial Intelligence',
      'Computer Science | Software Development',
      'Finance | null'
    ])
    expect(majors[0].degree).toBe('B.S.')
    expect(majors[0].url).toBe(cs.url)
  })

  test('ids are stable slugs', () => {
    expect(majors.map((m) => m.id)).toEqual([
      'computer-science-bs--artificial-intelligence',
      'computer-science-bs--software-development',
      'finance-bs'
    ])
  })

  test('shared groups come first, then the concentration group', () => {
    const sd = majors[1]
    expect(sd.groups.map((g) => [g.title, g.credits])).toEqual([
      ['Computer Science Foundation Courses', '57'],
      ['Course Requirements in Related Fields', null],
      ['Concentration in Software Development', '12']
    ])
  })

  test('courses resolve by coid to base codes; unresolved codes are kept from the text', () => {
    expect(majors[1].groups[0].courses).toEqual(['CMPT 120', 'CMPT 220'])
    expect(majors[1].groups[1].courses).toEqual(['BUS 100', 'MATH 999'])
  })

  test('instruction text stays verbatim as notes', () => {
    expect(majors[1].groups[0].notes).toEqual(['Note: A minimum of 60 credits in Liberal Arts is required.'])
    expect(majors[0].groups[2].notes).toEqual(['Choose two of the following:'])
  })

  test('groups without courses (totals, intros) are dropped', () => {
    expect(majors[2].groups.map((g) => g.title)).toEqual(['Requirements for a Major in Finance'])
  })
})
