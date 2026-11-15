import { CODE_RE } from './parseCourse'
import type { Course, Major, ReqGroup } from './types'

export type RawItem =
  | { type: 'heading'; level: number; text: string }
  | { type: 'course'; text: string; coid: string | null }
  | { type: 'text'; text: string }

export interface RawProgram {
  poid: string
  name: string
  url: string
  items: RawItem[]
}

const DEGREE_RE = /,\s*((?:B\.A\.|B\.S\.|B\.F\.A\.|B\.P\.S\.)(?:\s*\/\s*[A-Z.]+)*)\s*$/
const CONCENTRATION_RE = /\b(concentration|track)\b/i
/** A short line ending in a colon that names a sub-section, e.g. "Course Requirements in Related Fields:" */
const SUBHEAD_RE = /^[A-Z][^.:]{3,80}:$/

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function splitTitle(text: string): { title: string; credits: string | null } {
  const m = /^(.*?):\s*(\d+(?:\s*-\s*\d+)?)\s*(?:cr|credits?)\.?\s*$/i.exec(text)
  if (m) return { title: m[1].trim(), credits: m[2].replace(/\s+/g, '') }
  return { title: text.replace(/:$/, '').trim(), credits: null }
}

function courseBase(item: { text: string; coid: string | null }, byCoid: Map<string, Course>): string | null {
  const known = item.coid ? byCoid.get(item.coid) : undefined
  if (known) return known.base
  const m = CODE_RE.exec(item.text)
  return m ? `${m[1]} ${m[2]}` : null
}

interface Section {
  group: ReqGroup
  concentration: string | null
}

/** Turns catalog program pages into majors (one per concentration), keeping instructions verbatim. */
export function parsePrograms(raw: RawProgram[], byCoid: Map<string, Course>): Major[] {
  const majors: Major[] = []
  for (const p of raw) {
    const dm = DEGREE_RE.exec(p.name)
    if (!dm || /minor|certificate/i.test(p.name)) continue
    const degree = dm[1].replace(/\s+/g, '')
    const name = p.name.slice(0, dm.index).trim()

    const sections: Section[] = []
    let current: Section | null = null
    let concentration: string | null = null
    let concentrationLevel = 0

    const start = (text: string): void => {
      const { title, credits } = splitTitle(text)
      current = { group: { title, credits, courses: [], notes: [] }, concentration }
      sections.push(current)
    }

    for (const item of p.items) {
      if (item.type === 'heading') {
        if (CONCENTRATION_RE.test(item.text)) {
          concentration = splitTitle(item.text).title.replace(/^(concentration|track)\s+(in|:)?\s*/i, '').trim()
          concentrationLevel = item.level
        } else if (concentration && item.level <= concentrationLevel) {
          concentration = null
        }
        start(item.text)
      } else if (item.type === 'course') {
        if (!current) start(name)
        const base = courseBase(item, byCoid)
        const g = (current as Section | null)!.group
        if (base && !g.courses.includes(base)) g.courses.push(base)
      } else if (current) {
        const cur = current as Section
        if (SUBHEAD_RE.test(item.text) && cur.group.courses.length > 0) start(item.text)
        else if (SUBHEAD_RE.test(item.text) && cur.group.courses.length === 0 && cur.group.notes.length > 0) start(item.text)
        else if (!cur.group.notes.includes(item.text)) cur.group.notes.push(item.text)
      }
    }

    const withCourses = sections.filter((s) => s.group.courses.length > 0)
    const shared = withCourses.filter((s) => !s.concentration).map((s) => s.group)
    const concentrations = [...new Set(withCourses.map((s) => s.concentration).filter((c): c is string => !!c))]
    const baseId = slug(`${name} ${degree}`)
    if (concentrations.length === 0) {
      majors.push({ id: baseId, name, degree, concentration: null, groups: shared, url: p.url })
    } else {
      for (const c of concentrations) {
        majors.push({
          id: `${baseId}--${slug(c)}`,
          name,
          degree,
          concentration: c,
          groups: [...shared, ...withCourses.filter((s) => s.concentration === c).map((s) => s.group)],
          url: p.url
        })
      }
    }
  }
  return majors
}
