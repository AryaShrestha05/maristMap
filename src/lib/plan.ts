import { CODE_RE } from './parseCourse'
import type { Course, Prereq } from './types'

export type Status = 'taken' | 'available' | 'locked'

export interface PrereqResult {
  /** true = satisfied, false = a required course is missing, null = can't tell (non-course condition) */
  met: boolean | null
  missing: string[]
}

export function prereqCheck(p: Prereq | null, taken: Set<string>): PrereqResult {
  if (!p) return { met: true, missing: [] }
  switch (p.kind) {
    case 'course':
      return taken.has(p.code) ? { met: true, missing: [] } : { met: false, missing: [p.code] }
    case 'text':
      return { met: null, missing: [] }
    case 'all': {
      const parts = p.of.map((x) => prereqCheck(x, taken))
      const met = parts.some((x) => x.met === false) ? false : parts.some((x) => x.met === null) ? null : true
      return { met, missing: parts.flatMap((x) => x.missing) }
    }
    case 'any': {
      const parts = p.of.map((x) => prereqCheck(x, taken))
      if (parts.some((x) => x.met === true)) return { met: true, missing: [] }
      const met = parts.some((x) => x.met === null) ? null : false
      return { met, missing: parts.flatMap((x) => x.missing) }
    }
  }
}

/** True when the catalog lists prerequisites we couldn't structure, so only the text can be shown. */
export function hasUnparsedPrereq(course: Course): boolean {
  return !!course.prereqText && !course.prereq
}

/** "available" only when every prerequisite is definitely met — never a guess. */
export function status(base: string, taken: Set<string>, courses: Map<string, Course>): Status {
  if (taken.has(base)) return 'taken'
  const course = courses.get(base)
  if (!course || hasUnparsedPrereq(course)) return 'locked'
  return prereqCheck(course.prereq, taken).met === true ? 'available' : 'locked'
}

function mentions(p: Prereq | null, base: string): boolean {
  if (!p) return false
  if (p.kind === 'course') return p.code === base
  if (p.kind === 'text') return false
  return p.of.some((x) => mentions(x, base))
}

/** Courses that list `base` as a prerequisite. */
export function unlocks(base: string, courses: Course[]): string[] {
  return courses.filter((c) => mentions(c.prereq, base)).map((c) => c.base)
}

/** Course codes found in pasted text (e.g. a DegreeWorks audit) that exist in the catalog, de-duplicated, in order. */
export function extractCodes(text: string, courses: Map<string, Course>): string[] {
  const found: string[] = []
  const re = new RegExp(CODE_RE.source, 'g')
  for (const m of text.matchAll(re)) {
    const base = `${m[1]} ${m[2]}`
    if (courses.has(base) && !found.includes(base)) found.push(base)
  }
  return found
}

/** For each cart course whose prerequisites aren't met: what's missing (or a prompt to check the text). */
export function cartWarnings(cart: string[], taken: Set<string>, courses: Map<string, Course>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const base of cart) {
    const course = courses.get(base)
    if (!course) {
      out[base] = ['Not in the 2026–27 catalog']
      continue
    }
    if (hasUnparsedPrereq(course)) {
      out[base] = ['Check the prerequisite text']
      continue
    }
    const r = prereqCheck(course.prereq, taken)
    if (r.met === false) out[base] = r.missing.filter((m) => !taken.has(m))
    else if (r.met === null) out[base] = ['Check the prerequisite text']
  }
  return out
}
