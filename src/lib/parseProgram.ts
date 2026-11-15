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
/** Sections every program page repeats; the app shows Core from its own data. */
const SKIP_SECTION_RE = /core\/liberal studies|recommended program sequence/i
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
    let skipLevel = 0 // > 0 while inside a skipped section

    let lastCourse: string | null = null
    let orPending = false
    const start = (text: string, isConcentrationHeading = false): void => {
      const { title, credits } = splitTitle(text)
      // sub-sections of a concentration carry its name ("Analytics: Choice of either")
      const full = concentration && !isConcentrationHeading && !title.toLowerCase().includes(concentration.toLowerCase())
        ? `${concentration}: ${title}`
        : title
      current = { group: { title: full, credits, courses: [], notes: [] }, concentration }
      sections.push(current)
      lastCourse = null
      orPending = false
    }

    for (const item of p.items) {
      if (item.type === 'heading' && skipLevel && item.level > skipLevel) continue
      if (item.type !== 'heading' && skipLevel) continue
      if (item.type === 'heading') skipLevel = 0
      if (item.type === 'heading' && SKIP_SECTION_RE.test(item.text)) {
        skipLevel = item.level
        current = null
        continue
      }
      if (item.type === 'heading') {
        if (CONCENTRATION_RE.test(item.text)) {
          concentration = splitTitle(item.text)
            .title.replace(/^(concentration|track)\s+(in|:)?\s*/i, '')
            .replace(/\s+(concentration|track)$/i, '')
            .trim()
          concentrationLevel = item.level
          start(item.text, true)
          continue
        } else if (concentration && item.level <= concentrationLevel) {
          concentration = null
        }
        start(item.text)
      } else if (item.type === 'course') {
        if (!current) start(name)
        const base = courseBase(item, byCoid)
        const g = (current as Section | null)!.group
        if (base && !g.courses.includes(base)) g.courses.push(base)
        if (base && orPending && lastCourse) {
          const note = `${lastCourse} or ${base}`
          if (!g.notes.includes(note)) g.notes.push(note)
        }
        orPending = false
        lastCourse = base
      } else if (current) {
        const cur = current as Section
        if (/^\W*(or|and)\W*$/i.test(item.text.replace(/\u200b/g, ''))) {
          // the catalog writes alternatives as "A · OR · B"; turn it into an "A or B" note
          if (/or/i.test(item.text)) orPending = true
          continue
        }
        if (SUBHEAD_RE.test(item.text) && cur.group.courses.length > 0) start(item.text)
        else if (SUBHEAD_RE.test(item.text) && cur.group.courses.length === 0 && cur.group.notes.length > 0) start(item.text)
        else if (item.text.replace(/:$/, '') === cur.group.title) continue
        else if (!cur.group.notes.includes(item.text)) cur.group.notes.push(item.text)
      }
    }

    const withCourses = sections.filter((s) => s.group.courses.length > 0)
    if (withCourses.length === 0) continue
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
