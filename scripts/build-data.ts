// Builds src/data/courses.json and src/data/majors.json from the raw catalog collection in data/raw/.
// Usage: npx tsx scripts/build-data.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCourse, type RawCourse } from '../src/lib/parseCourse'
import { parsePrograms, type RawProgram } from '../src/lib/parseProgram'
import type { Course } from '../src/lib/types'

const root = join(import.meta.dirname, '..')
const read = <T>(f: string): T => JSON.parse(readFileSync(join(root, 'data', 'raw', f), 'utf8'))

const rawCourses = read<RawCourse[]>('courses-raw.json')
const rawPrograms = read<RawProgram[]>('programs-raw.json')

const courses: Course[] = []
const byCoid = new Map<string, Course>()
const seen = new Set<string>()
for (const r of rawCourses) {
  const c = parseCourse(r)
  if (seen.has(c.base)) continue // same course listed twice (e.g. cross-listed copies)
  seen.add(c.base)
  courses.push(c)
  byCoid.set(r.coid, c)
}
for (const r of rawCourses) if (!byCoid.has(r.coid)) byCoid.set(r.coid, courses.find((c) => c.base === parseCourse(r).base)!)
courses.sort((a, b) => a.base.localeCompare(b.base))

const majors = parsePrograms(rawPrograms, byCoid)
const known = new Set(courses.map((c) => c.base))

writeFileSync(join(root, 'src', 'data', 'courses.json'), JSON.stringify(courses))
writeFileSync(join(root, 'src', 'data', 'majors.json'), JSON.stringify(majors))

const withPrereq = courses.filter((c) => c.prereqText)
const unparsed = withPrereq.filter((c) => !c.prereq)
const missing = new Set(majors.flatMap((m) => m.groups.flatMap((g) => g.courses)).filter((b) => !known.has(b)))
console.log(`courses ${courses.length} (raw ${rawCourses.length}), no credits: ${courses.filter((c) => !c.credits).length}, no description: ${courses.filter((c) => !c.description).length}`)
console.log(`prerequisites: ${withPrereq.length} courses, structured ${withPrereq.length - unparsed.length}, shown verbatim ${unparsed.length}`)
console.log(`programs ${rawPrograms.length} → majors ${majors.length} (with concentrations ${majors.filter((m) => m.concentration).length}), majors with no groups: ${majors.filter((m) => !m.groups.length).map((m) => m.name).join('; ') || 'none'}`)
console.log(`codes listed by majors but not in the catalog: ${missing.size} ${[...missing].slice(0, 15).join(', ')}`)
