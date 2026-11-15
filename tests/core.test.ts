import { describe, expect, test } from 'vitest'
import { CORE, categoriesFor } from '../src/data/core'

describe('Core/LS data', () => {
  test('every listed code is a well-formed base code', () => {
    for (const cat of CORE) for (const code of cat.courses) expect(code).toMatch(/^[A-Z]{2,4} \d{3}$/)
  })

  test('every category cites its official source', () => {
    for (const cat of CORE) expect(cat.source).toMatch(/^https:\/\/(www|catalog)\.marist\.edu\//)
  })

  test('History rule: 100/200-level except HIST 209; 300-level only after 6 HIST credits', () => {
    expect(categoriesFor('HIST 101', 0)).toContain('history')
    expect(categoriesFor('HIST 209', 0)).not.toContain('history')
    expect(categoriesFor('HIST 301', 0)).not.toContain('history')
    expect(categoriesFor('HIST 301', 6)).toContain('history')
  })

  test('Math rule: 110–299 except MATH 180; MATH 108 does not count', () => {
    expect(categoriesFor('MATH 130', 0)).toContain('math')
    expect(categoriesFor('MATH 241', 0)).toContain('math')
    expect(categoriesFor('MATH 180', 0)).not.toContain('math')
    expect(categoriesFor('MATH 108', 0)).not.toContain('math')
  })

  test('prefix rules: any REST → ethics; any 200-level POSC/SOC → social science', () => {
    expect(categoriesFor('REST 301', 0)).toContain('ethics')
    expect(categoriesFor('POSC 250', 0)).toContain('socsci')
    expect(categoriesFor('SOC 210', 0)).toContain('socsci')
    expect(categoriesFor('SOC 310', 0)).not.toContain('socsci')
  })

  test('literature list and the cross-listed course in two categories', () => {
    expect(categoriesFor('ENG 170', 0)).toEqual(['literature'])
    expect(categoriesFor('REST 214', 0).sort()).toEqual(['ethics', 'literature'])
  })

  test('foundation and philosophy', () => {
    expect(categoriesFor('FYS 101', 0)).toContain('fys')
    expect(categoriesFor('ENG 120', 0)).toContain('writing')
    expect(categoriesFor('PHIL 101', 0)).toContain('philosophy')
  })

  test('a course in no category', () => {
    expect(categoriesFor('CMPT 220', 0)).toEqual([])
  })
})
