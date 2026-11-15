// The app's data: built by scripts/build-data.ts from the 2026–27 Marist catalog.
import coursesJson from './courses.json'
import majorsJson from './majors.json'
import type { Course, Major } from '../lib/types'

export const COURSES: Course[] = coursesJson as Course[]
export const MAJORS: Major[] = (majorsJson as Major[]).slice().sort((a, b) => a.name.localeCompare(b.name))
export const COURSE_BY_BASE = new Map(COURSES.map((c) => [c.base, c]))
export const MAJOR_BY_ID = new Map(MAJORS.map((m) => [m.id, m]))
