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

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const NUM = '(one|two|three|four|five|six|seven|eight|nine|ten|\\d+)'
const toNum = (w: string): number => WORD_NUMBERS[w.toLowerCase()] ?? Number(w)

/** Reads a "choose N" rule from a section's title and notes. null = every listed course is required. */
export function detectPick(title: string, notes: string[]): { count?: number; credits?: number } | null {
  for (const text of [title, ...notes]) {
    const credits = new RegExp(`\\b(?:choose|select)\\s+${NUM}\\s+credits?\\b`, 'i').exec(text)
    if (credits) return { credits: toNum(credits[1]) }
    if (/\bchoice of either\b/i.test(text)) return { count: 1 }
    if (/^(?:[^:]*:\s*)?choice of\b/i.test(text)) return { count: 1 }
    const pick = new RegExp(`\\b(?:choose|select|pick)\\s+(?:any\\s+)?${NUM}\\b`, 'i').exec(text)
    if (pick) return { count: toNum(pick[1]) }
    const any = new RegExp(`\\bany\\s+${NUM}\\s+of\\s+the\\s+following\\b`, 'i').exec(text)
    if (any) return { count: toNum(any[1]) }
    const lead = new RegExp(`^${NUM}\\s+courses?\\s+(?:selected|with|from|in)\\b`, 'i').exec(text.replace(/^.*?:\s*/, ''))
    if (lead) return { count: toNum(lead[1]) }
  }
  return null
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function splitTitle(text: string): { title: string; credits: string | null } {
  const m = /^(.*?):\s*(\d+(?:\s*-\s*\d+)?)\s*(?:cr|credits?)\.?\s*$/i.exec(text)
  if (m) return { title: m[1].trim(), credits: m[2].replace(/\s+/g, '') }
  const paren = /^(.*?)\s*\((\d+(?:\s*-\s*\d+)?)\s*(?:cr|credits?)\.?\)\s*$/i.exec(text)
  if (paren) return { title: paren[1].trim(), credits: paren[2].replace(/\s+/g, '') }
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
  /** heading level; text sub-heads get their parent's level + 1 */
  level: number
}

/** Turns catalog program pages into majors (one per concentration), keeping instructions verbatim. */
export function parsePrograms(raw: RawProgram[], byCoid: Map<string, Course>): Major[] {
  const majors: Major[] = []
  const creditsByBase = new Map([...byCoid.values()].map((c) => [c.base, c.credits]))
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
    const start = (text: string, isConcentrationHeading = false, level = (current as Section | null)?.level ?? 0): void => {
      const { title, credits } = splitTitle(text)
      // sub-sections of a concentration carry its name ("Analytics: Choice of either")
      const full = concentration && !isConcentrationHeading && !title.toLowerCase().includes(concentration.toLowerCase())
        ? `${concentration}: ${title}`
        : title
      current = { group: { title: full, credits, courses: [], notes: [] }, concentration, level }
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
        const cleaned = splitTitle(item.text)
          .title.replace(/\s*\([^)]*\)\s*$/, '') // "(9 credits)", "(select 5)"
          .replace(/^\d+(\.\d+)*\s+/, '') // "1.2 "
          .replace(/^(concentration|track)\s+(in|:)?\s*/i, '')
          .replace(/\s+(concentration|track)$/i, '')
          .trim()
        // "1.2 Major Concentration" nested under a concentration names no new one: it's a section of it
        const generic = concentration !== null && item.level > concentrationLevel && /^(major)?$/i.test(cleaned)
        if (CONCENTRATION_RE.test(item.text) && !generic) {
          concentration = cleaned
          concentrationLevel = item.level
          start(item.text, true, item.level)
          continue
        } else if (concentration && item.level <= concentrationLevel) {
          concentration = null
        }
        start(item.text, false, item.level)
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
        if (SUBHEAD_RE.test(item.text) && cur.group.courses.length > 0) start(item.text, false, cur.level + 1)
        else if (SUBHEAD_RE.test(item.text) && cur.group.courses.length === 0 && cur.group.notes.length > 0) start(item.text, false, cur.level + 1)
        else if (item.text.replace(/:$/, '') === cur.group.title) continue
        else if (!cur.group.notes.includes(item.text)) cur.group.notes.push(item.text)
      }
    }

    for (const sec of sections) {
      const pick = detectPick(sec.group.title, sec.group.notes)
      if (pick) sec.group.pick = pick
      else if (sec.group.credits) {
        // "Required Elective Courses (12 Credits)" listing 16 courses: the credit total is the rule
        const need = Number.parseInt(sec.group.credits, 10)
        const listed = sec.group.courses.reduce((n, b) => n + (Number.parseFloat(creditsByBase.get(b) ?? '') || 0), 0)
        if (need > 0 && listed > need) sec.group.pick = { credits: need }
      }
    }
    // "1.1 Breadth …: 16 cr" listing no courses itself, over areas that state no rule of their own:
    // the areas share the 16 credits (a pool), rather than each requiring every course it lists
    sections.forEach((parent, i) => {
      const need = Number.parseInt(parent.group.credits ?? '', 10)
      if (!(need > 0) || parent.group.courses.length > 0) return
      const kids: Section[] = []
      const below: Section[] = []
      for (let j = i + 1; j < sections.length && sections[j].level > parent.level; j++) {
        below.push(sections[j])
        if (sections[j].level === parent.level + 1) kids.push(sections[j])
      }
      const withOwnRule = (k: Section): boolean =>
        !!k.group.pick || !!k.group.credits || /\ball\b/i.test(`${k.group.title} ${k.group.notes.join(' ')}`)
      if (kids.filter((k) => k.group.courses.length > 0).length < 2 || below.some(withOwnRule)) return
      const pool = { title: parent.group.title, credits: need, courses: [...new Set(kids.flatMap((k) => k.group.courses))] }
      for (const k of kids) k.group.pool = pool
    })
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
