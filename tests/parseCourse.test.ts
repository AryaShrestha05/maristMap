import { describe, expect, test } from 'vitest'
import { parseCourse } from '../src/lib/parseCourse'

// Real blocks from the 2026–27 catalog (data/raw)
const raw = (name: string, block: string) => ({ coid: '1', name, url: 'https://catalog.marist.edu/x', block })

describe('parseCourse', () => {
  test('CMPT 404L: credits, liberal arts, description, structured prerequisite', () => {
    const c = parseCourse(
      raw(
        'CMPT 404L - Artificial Intelligence',
        'CMPT 404L - Artificial Intelligence3 Credit(s) Liberal ArtsThis course is an introduction to the major problems, techniques, and issues of artificial intelligence. Emphasis is placed upon the topics of knowledge representation and problem solving. The languages LISP or PROLOG will be used to illustrate various AI techniques.Prerequisite(s): CMPT 436N'
      )
    )
    expect(c).toMatchObject({
      code: 'CMPT 404L',
      base: 'CMPT 404',
      prefix: 'CMPT',
      title: 'Artificial Intelligence',
      credits: '3',
      liberalArts: true,
      offered: null,
      prereqText: 'CMPT 436N',
      prereq: { kind: 'course', code: 'CMPT 436' },
      coreqText: null,
      url: 'https://catalog.marist.edu/x'
    })
    expect(c.description).toMatch(/^This course is an introduction.*AI techniques\.$/)
  })

  test('COM 305L: offered when, non-course prerequisite', () => {
    const c = parseCourse(
      raw(
        'COM 305L - Independent Research in Communication',
        'COM 305L - Independent Research in Communication3 Credit(s) Liberal ArtsDirected independent study and research under the supervision of a faculty member.Offered When: As and when necessary.Prerequisite(s): Permission of instructor and Dean'
      )
    )
    expect(c.offered).toBe('As and when necessary.')
    expect(c.prereqText).toBe('Permission of instructor and Dean')
    expect(c.prereq).toEqual({ kind: 'text', text: 'Permission of instructor and Dean' })
    expect(c.description).toBe('Directed independent study and research under the supervision of a faculty member.')
  })

  test('CHEM 102L: labels run together with no separator; corequisite', () => {
    const c = parseCourse(
      raw(
        'CHEM 102L - Introduction to Chemistry Laboratory',
        'CHEM 102L - Introduction to Chemistry Laboratory1 Credit(s) Liberal ArtsOne-credit course designed to inculcate accepted laboratory procedures with regard to safety, techniques, measurement, and reporting of results. One three-hour laboratory per week.Offered When: InfrequentlyCorequisite(s): CHEM 101L'
      )
    )
    expect(c.credits).toBe('1')
    expect(c.offered).toBe('Infrequently')
    expect(c.coreqText).toBe('CHEM 101L')
    expect(c.prereqText).toBeNull()
  })

  test('Non Liberal Arts and missing label', () => {
    expect(parseCourse(raw('ACCT 203N - Financial Accounting', 'ACCT 203N - Financial Accounting3 Credit(s) Non Liberal ArtsText.')).liberalArts).toBe(false)
    expect(parseCourse(raw('XYZ 100 - Thing', 'XYZ 100 - Thing3 Credit(s) Text.')).liberalArts).toBeNull()
  })

  test('a title ending in a numeral is taken from the name, not the block', () => {
    const c = parseCourse(raw('CMPT 476N - CS Project II', 'CMPT 476N - CS Project II1 Credit(s) Non Liberal ArtsSecond half.'))
    expect(c.title).toBe('CS Project II')
    expect(c.credits).toBe('1')
  })

  test('credit ranges are kept verbatim', () => {
    expect(parseCourse(raw('MUS 399 - Special Topics', 'MUS 399 - Special Topics1-3 Credit(s) Liberal ArtsVaries.')).credits).toBe('1-3')
  })
})
