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

describe('parsePrograms — real-page quirks', () => {
  const page: RawProgram = {
    poid: '400',
    name: 'Computer Science, B.S.',
    url: 'u4',
    items: [
      { type: 'heading', level: 2, text: 'Computer Science Foundation Courses: 57 cr' },
      { type: 'course', text: 'CMPT 120L - Introduction to Programming', coid: '1' },
      { type: 'text', text: 'Course Requirements in Related Fields:' },
      { type: 'text', text: 'Course Requirements in Related Fields:' },
      { type: 'course', text: 'BUS 100L - Introduction to Business', coid: '3' },
      { type: 'heading', level: 3, text: '3.0 Core/Liberal Studies Requirements' },
      { type: 'heading', level: 4, text: '3.1 Foundation: 7 cr' },
      { type: 'course', text: 'CMPT 220L - x', coid: '2' },
      { type: 'heading', level: 4, text: 'Breadth: 18 cr' },
      { type: 'course', text: 'CMPT 404L - x', coid: '4' },
      { type: 'heading', level: 2, text: 'Software Development Concentration: 12 cr' },
      { type: 'course', text: 'CMPT 450L - x', coid: '5' }
    ]
  }
  const [m] = parsePrograms([page], byCoid)

  test('Core/Liberal Studies sections are skipped (the app has its own Core hubs)', () => {
    expect(m.groups.map((g) => g.title)).toEqual([
      'Computer Science Foundation Courses',
      'Course Requirements in Related Fields',
      'Software Development Concentration'
    ])
  })

  test('"X Concentration" names drop the word Concentration', () => {
    expect(m.concentration).toBe('Software Development')
  })

  test("a repeated sub-heading is not kept as its own group's note", () => {
    expect(m.groups[1].notes).toEqual([])
  })
})

describe('parsePrograms — alternatives and naming', () => {
  const page: RawProgram = {
    poid: '500',
    name: 'Finance, B.S.',
    url: 'u5',
    items: [
      { type: 'heading', level: 2, text: 'Foundation: 9 cr' },
      { type: 'course', text: 'CMPT 120L - x', coid: '1' },
      { type: 'text', text: 'OR' },
      { type: 'text', text: 'OR' },
      { type: 'course', text: 'CMPT 220L - x', coid: '2' },
      { type: 'heading', level: 2, text: 'Concentration in Analytics' },
      { type: 'heading', level: 3, text: 'Choice of either' },
      { type: 'course', text: 'CMPT 404L - x', coid: '4' },
      { type: 'heading', level: 3, text: 'Choice of either' },
      { type: 'course', text: 'CMPT 450L - x', coid: '5' }
    ]
  }
  const empty: RawProgram = { poid: '600', name: 'Professional Studies, B.S.', url: 'u6', items: [{ type: 'text', text: 'Intro only' }] }
  const majors = parsePrograms([page, empty], byCoid)

  test('"OR" between two courses becomes an "A or B" note, not a bare OR', () => {
    expect(majors[0].groups[0].notes).toEqual(['CMPT 120 or CMPT 220'])
  })

  test("a concentration's sub-sections carry the concentration name", () => {
    expect(majors[0].groups.map((g) => g.title)).toEqual(['Foundation', 'Analytics: Choice of either', 'Analytics: Choice of either'])
  })

  test('programs with no requirement groups are left out', () => {
    expect(majors.map((m) => m.name)).toEqual(['Finance'])
  })
})

describe('parsePrograms — concentration names', () => {
  const named = (heading: string) =>
    parsePrograms(
      [{ poid: '9', name: 'Business Administration, B.S.', url: 'u', items: [
        { type: 'heading', level: 2, text: heading },
        { type: 'course', text: 'CMPT 120L - x', coid: '1' }
      ] }],
      byCoid
    )[0]?.concentration
  test('trailing credit counts, instructions and the words Track/Concentration are removed', () => {
    expect(named('Corporate Finance Track (9 Credits)')).toBe('Corporate Finance')
    expect(named('Information Technology Concentration (20-23 credits)')).toBe('Information Technology')
    expect(named('Concentration in Animation (select 5)')).toBe('Animation')
  })
})

describe('parsePrograms — section titles', () => {
  test('a trailing "(12 Credits)" becomes the credit count', () => {
    const [m] = parsePrograms(
      [{ poid: '1', name: 'Finance, B.S.', url: 'u', items: [
        { type: 'heading', level: 2, text: 'Required Elective Courses (12 Credits)' },
        { type: 'course', text: 'CMPT 120L - x', coid: '1' }
      ] }],
      byCoid
    )
    expect(m.groups[0]).toMatchObject({ title: 'Required Elective Courses', credits: '12' })
  })
})

import { detectPick } from '../src/lib/parseProgram'

describe('detectPick — "choose N" sections', () => {
  test('counts in words and digits', () => {
    expect(detectPick('Electives', ['Choose two from (no duplicate from major)'])).toEqual({ count: 2 })
    expect(detectPick('Choose one from:', [])).toEqual({ count: 1 })
    expect(detectPick('Electives', ['Choose 2 courses from'])).toEqual({ count: 2 })
    expect(detectPick('Select one', [])).toEqual({ count: 1 })
    expect(detectPick('Software Development: Choice of either', [])).toEqual({ count: 1 })
    expect(detectPick('1. Physics Option - Any two of the following three physics lecture/lab combinations', [])).toEqual({ count: 2 })
    expect(detectPick('One course selected from Critical Perspectives on Race', [])).toEqual({ count: 1 })
    expect(detectPick('Electives', ['Select any three, in any combination: 3 cr'])).toEqual({ count: 3 })
  })

  test('credit amounts', () => {
    expect(detectPick('Electives', ['Choose 9 credits from:'])).toEqual({ credits: 9 })
  })

  test('no rule means every listed course is required', () => {
    expect(detectPick('Computer Science Foundation Courses', ['Note: A minimum of 60 credits in Liberal Arts is required.'])).toBeNull()
  })
})

describe('parsePrograms — credit totals as the rule', () => {
  test('a section titled with fewer credits than its courses add up to needs only those credits', () => {
    const [m] = parsePrograms(
      [{ poid: '7', name: 'Finance, B.S.', url: 'u', items: [
        { type: 'heading', level: 2, text: 'Required Elective Courses (6 Credits)' },
        { type: 'course', text: 'CMPT 120L - x', coid: '1' },
        { type: 'course', text: 'CMPT 220L - x', coid: '2' },
        { type: 'course', text: 'BUS 100L - x', coid: '3' }
      ] }],
      byCoid
    )
    expect(m.groups[0].pick).toEqual({ credits: 6 })
  })

  test('a section whose credits equal its courses keeps "all required"', () => {
    const [m] = parsePrograms(
      [{ poid: '8', name: 'Finance, B.S.', url: 'u', items: [
        { type: 'heading', level: 2, text: 'Core: 6 cr' },
        { type: 'course', text: 'CMPT 120L - x', coid: '1' },
        { type: 'course', text: 'CMPT 220L - x', coid: '2' }
      ] }],
      byCoid
    )
    expect(m.groups[0].pick).toBeUndefined()
  })

  test('"Choice of …" titles mean pick one', () => {
    expect(detectPick('Software Development: Choice of approved upper-level CMPT courses including', [])).toEqual({ count: 1 })
  })
})
