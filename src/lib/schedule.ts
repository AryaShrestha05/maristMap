import { CORE, categoriesFor } from '../data/core'
import { CODE_RE } from './parseCourse'
import { groupProgress, hasUnparsedPrereq, historyCredits, prereqCheck } from './plan'
import type { Course, Major, Prereq } from './types'

export type Term = 'fall' | 'spring'
export const SEMESTERS = 8
export const MAX_CREDITS = 16

export interface PlanItem {
  /** course base code, or `slot:…` / `core:<id>` for an open choice */
  id: string
  kind: 'course' | 'slot'
  title: string
  /** slots: the courses that would fill it (the student picks) */
  options?: string[]
  /** slots: the course the student picked for it */
  pick?: string
  credits: number
  /** why it's in the plan */
  reason: 'major' | 'core' | 'prereq' | 'cart' | 'added'
  /** 0 = Year 1 Fall … 7 = Year 4 Spring; null = couldn't fit in four years */
  semester: number | null
  pinned: boolean
}

export interface ProposedPlan {
  items: PlanItem[]
  semesters: { index: number; term: Term; year: number; credits: number }[]
}

export interface PlanInput {
  major: Major
  courses: Map<string, Course>
  taken: Set<string>
  cart: string[]
  /** first semester to plan (0 = Year 1 Fall) */
  start: number
  /** the student's own moves: item id → semester */
  pins: Record<string, number>
  /** courses the student picked for "Choose" cards: slot id → course */
  picks?: Record<string, string>
  /** courses the student added themselves: course → semester */
  added?: Record<string, number>
}

/** The course an item stands for: itself, or the course picked for a "Choose" card. */
export const codeOf = (i: PlanItem): string | undefined => (i.kind === 'course' ? i.id : i.pick)

export const termOf = (semester: number): Term => (semester % 2 === 0 ? 'fall' : 'spring')
export const semesterLabel = (s: number): string => `Year ${Math.floor(s / 2) + 1} · ${termOf(s) === 'fall' ? 'Fall' : 'Spring'}`

/** Terms a course runs in, from the catalog's "Typically offered" line; null = any term (or unknown). */
export function offeredTerms(offered: string | null): Term[] | null {
  if (!offered) return null
  const fall = /\bfall\b/i.test(offered)
  const spring = /\bspring\b/i.test(offered)
  if (fall && !spring) return ['fall']
  if (spring && !fall) return ['spring']
  return null
}

const creditsOf = (c: Course | undefined): number => Number.parseFloat(c?.credits ?? '') || 3
const numberOf = (base: string): number => Number(base.split(' ')[1]) || 999

/** "Junior standing" and the like: the earliest semester a course makes sense in. */
/**
 * The earliest semester a course makes sense in, for ordering the plan only: class standing or an
 * earned-credit minimum in the prerequisite text (at about 15 credits a semester), and course level
 * (300-level not in the first year, 400-level not before the third).
 */
function floorOf(c: Course | undefined): number {
  if (!c) return 0
  const t = c.prereqText ?? ''
  let f = 0
  if (/\bsenior\b/i.test(t)) f = 6
  else if (/\bjunior\b/i.test(t)) f = 4
  else if (/\bsophomore\b/i.test(t)) f = 2
  const credits = /(\d+)\s*(or more\s*)?(earned\s*)?credits/i.exec(t)
  if (credits) f = Math.max(f, Math.min(7, Math.ceil(Number(credits[1]) / 15)))
  const n = numberOf(c.base)
  if (n >= 400) f = Math.max(f, 4)
  else if (n >= 300) f = Math.max(f, 2)
  return f
}

/** Course codes named in prerequisite text we couldn't structure (scheduled before it, to be safe). */
function codesInText(c: Course): string[] {
  const out: string[] = []
  for (const m of (c.prereqText ?? '').matchAll(new RegExp(CODE_RE.source, 'g'))) {
    const base = `${m[1]} ${m[2]}`
    if (base !== c.base && !out.includes(base)) out.push(base)
  }
  return out
}

function codesIn(p: Prereq | null, out: string[] = []): string[] {
  if (!p) return out
  if (p.kind === 'course') out.push(p.code)
  else if (p.kind !== 'text') for (const x of p.of) codesIn(x, out)
  return out
}

/**
 * A proposed four-year plan, generated from the catalog's rules: prerequisites before the courses that
 * need them, Fall-only / Spring-only courses in the right term, at most 16 credits a semester. Sections
 * that let the student choose stay open choices: the plan never picks a course for them.
 */
export function proposePlan({ major, courses, taken, cart, start, pins: moved, picks = {}, added = {} }: PlanInput): ProposedPlan {
  const pins = { ...added, ...moved }
  const items = new Map<string, PlanItem>()
  const add = (item: Omit<PlanItem, 'semester' | 'pinned'>): void => {
    if (!items.has(item.id)) items.set(item.id, { ...item, semester: null, pinned: false })
  }
  const addCourse = (base: string, reason: PlanItem['reason']): void => {
    const c = courses.get(base)
    if (!c || taken.has(base)) return
    add({ id: base, kind: 'course', title: c.title, credits: creditsOf(c), reason })
  }

  for (const base of cart) addCourse(base, 'cart')
  for (const base of Object.keys(added)) addCourse(base, 'added')

  // the major: every listed course, or open choices where the section lets the student pick
  const pools = new Set<string>()
  major.groups.forEach((g, gi) => {
    if (g.pool) {
      // areas sharing one credit total: one set of choices across all of them
      if (pools.has(g.pool.title)) return
      pools.add(g.pool.title)
      const options = g.pool.courses.filter((b) => !taken.has(b) && !cart.includes(b) && courses.has(b))
      const progress = groupProgress(g, new Set([...taken, ...cart]), courses)
      if (progress.satisfied || options.length === 0) return
      const each = creditsOf(courses.get(options[0]))
      const slots = Math.ceil((progress.needed - progress.done) / each)
      for (let k = 0; k < Math.min(slots, options.length); k++) {
        add({ id: `slot:${gi}:${k}`, kind: 'slot', title: g.pool.title, options, credits: each, reason: 'major' })
      }
      return
    }
    if (!g.pick) {
      for (const base of g.courses) addCourse(base, 'major')
      return
    }
    const inCart = g.courses.filter((b) => cart.includes(b) && !taken.has(b))
    const options = g.courses.filter((b) => !taken.has(b) && !cart.includes(b) && courses.has(b))
    const progress = groupProgress(g, new Set([...taken, ...inCart]), courses)
    if (progress.satisfied || options.length === 0) return
    const each = creditsOf(courses.get(options[0]))
    const slots = progress.unit === 'credits' ? Math.ceil((progress.needed - progress.done) / each) : progress.needed - progress.done
    for (let k = 0; k < Math.min(slots, options.length); k++) {
      add({ id: `slot:${gi}:${k}`, kind: 'slot', title: g.title, options, credits: each, reason: 'major' })
    }
  })

  // the student's picks for "Choose" cards (only real options count)
  const applyPicks = (): void => {
    for (const item of items.values()) {
      const pick = picks[item.id]
      if (item.kind === 'slot' && pick && item.options?.includes(pick) && courses.has(pick)) {
        item.pick = pick
        item.credits = creditsOf(courses.get(pick))
      }
    }
  }
  applyPicks()

  // prerequisites the plan needs but doesn't have yet; "A or B" becomes an open choice
  const prereqSlots = new Set<string>()
  const addPrereqs = (): void => {
  for (let changed = true; changed; ) {
    changed = false
    for (const item of [...items.values()]) {
      const code = codeOf(item)
      if (!code) continue
      const walk = (p: Prereq | null): void => {
        if (!p) return
        const have = new Set([
          ...taken,
          ...items.keys(),
          ...[...items.values()].flatMap((i) => (i.pick ? [i.pick] : [])),
          ...[...prereqSlots].flatMap((id) => items.get(id)?.options ?? [])
        ])
        if (prereqCheck(p, have).met !== false) return
        if (p.kind === 'course') {
          if (courses.has(p.code)) {
            addCourse(p.code, 'prereq')
            changed = true
          }
        } else if (p.kind === 'all') p.of.forEach(walk)
        else if (p.kind === 'any') {
          const options = p.of.filter((x): x is { kind: 'course'; code: string } => x.kind === 'course').map((x) => x.code)
          if (options.length === 0) return
          const id = `slot:or:${options.join('|')}`
          add({ id, kind: 'slot', title: 'Prerequisite: one of', options, credits: creditsOf(courses.get(options[0])), reason: 'prereq' })
          prereqSlots.add(id)
          applyPicks()
          changed = true
        }
      }
      walk(courses.get(code)?.prereq ?? null)
    }
  }
  }
  addPrereqs()

  // Core: what's still open once taken and planned courses are counted (one course per category)
  const planned = new Set([...taken, ...[...items.values()].flatMap((i) => (codeOf(i) ? [codeOf(i)!] : []))])
  const hist = historyCredits(planned, courses)
  const covered = new Set<string>()
  const used = new Set<string>()
  for (const cat of CORE) {
    const by = [...planned].find((b) => !used.has(b) && categoriesFor(b, hist).includes(cat.id))
    if (by) {
      covered.add(cat.id)
      used.add(by)
    }
  }
  for (const cat of CORE) {
    if (covered.has(cat.id)) continue
    if (cat.courses.length === 1 && !cat.rule) addCourse(cat.courses[0], 'core')
    else {
      const options = [...courses.keys()].filter((b) => categoriesFor(b, 99).includes(cat.id)).sort()
      add({ id: `core:${cat.id}`, kind: 'slot', title: `Core: ${cat.name}`, options, credits: cat.credits, reason: 'core' })
    }
  }
  applyPicks()
  addPrereqs()

  // ---- scheduling ----
  const list = [...items.values()]
  // what each item unlocks, for "longest chain first"
  const unlocks = new Map<string, string[]>()
  for (const item of list) {
    const code = codeOf(item)
    if (!code) continue
    const c = courses.get(code)
    const codes = new Set([...codesIn(c?.prereq ?? null), ...(c && hasUnparsedPrereq(c) ? codesInText(c) : [])])
    for (const other of list) {
      const oc = codeOf(other)
      const hit = (oc !== undefined && codes.has(oc)) || (prereqSlots.has(other.id) && other.options!.some((o) => codes.has(o)))
      if (hit) unlocks.set(other.id, [...(unlocks.get(other.id) ?? []), item.id])
    }
  }
  const height = new Map<string, number>()
  const h = (id: string, seen = new Set<string>()): number => {
    if (height.has(id)) return height.get(id)!
    if (seen.has(id)) return 0
    seen.add(id)
    const v = 1 + Math.max(0, ...(unlocks.get(id) ?? []).map((x) => h(x, seen)))
    height.set(id, v)
    return v
  }
  const level = (i: PlanItem): number => (i.kind === 'course' ? numberOf(i.id) : Math.min(...(i.options ?? []).map(numberOf), 999))
  // Foundation Core (First Year Seminar, Writing for College) belongs in the first year
  const foundation = new Set(CORE.filter((c) => c.group === 'Foundation').flatMap((c) => c.courses))
  const priority = (a: PlanItem, b: PlanItem): number =>
    Number(b.reason === 'cart') - Number(a.reason === 'cart') ||
    Number(foundation.has(b.id)) - Number(foundation.has(a.id)) ||
    h(b.id) - h(a.id) ||
    level(a) - level(b) ||
    a.id.localeCompare(b.id)

  const notInCatalog = (p: Prereq | null): string[] => codesIn(p).filter((x) => !courses.has(x))
  const courseReady = (base: string, have: Set<string>, s: number): boolean => {
    const c = courses.get(base)
    if (!c) return true
    const terms = offeredTerms(c.offered)
    if (terms && !terms.includes(termOf(s))) return false
    if (s < floorOf(c)) return false
    if (hasUnparsedPrereq(c)) return codesInText(c).every((x) => have.has(x) || !items.has(x))
    return prereqCheck(c.prereq, new Set([...have, ...notInCatalog(c.prereq)])).met !== false
  }
  const ready = (i: PlanItem, have: Set<string>, s: number): boolean => {
    const code = codeOf(i)
    if (code) return courseReady(code, have, s)
    return !i.options?.length || i.options.some((o) => courseReady(o, have, s))
  }

  const creditsIn = new Array<number>(SEMESTERS).fill(0)
  for (const [id, s] of Object.entries(pins)) {
    const item = items.get(id)
    if (!item || s < 0 || s >= SEMESTERS) continue
    item.semester = Math.max(s, start)
    item.pinned = true
    creditsIn[item.semester] += item.credits
  }
  const haveBefore = (s: number): Set<string> => {
    const have = new Set(taken)
    for (const i of list) {
      if (i.semester === null || i.semester >= s) continue
      const code = codeOf(i)
      if (code) have.add(code)
      else if (prereqSlots.has(i.id)) i.options!.forEach((o) => have.add(o))
    }
    return have
  }
  const fill = (s: number, cap: number): void => {
    const have = haveBefore(s)
    const candidates = list.filter((i) => i.semester === null && (i.reason === 'cart' ? s === start : ready(i, have, s))).sort(priority)
    for (const i of candidates) {
      if (creditsIn[s] + i.credits > cap && creditsIn[s] > 0) continue
      i.semester = s
      creditsIn[s] += i.credits
    }
  }
  // each semester takes as much as is ready, up to the 16-credit limit
  for (let s = start; s < SEMESTERS; s++) fill(s, MAX_CREDITS)
  // still left (e.g. two Fall-only courses in a row): place after its prerequisites, ignoring the
  // term and level rules; planIssues reports the conflict
  for (const i of list.filter((x) => x.semester === null).sort(priority)) {
    for (let s = start; s < SEMESTERS; s++) {
      if (creditsIn[s] + i.credits > MAX_CREDITS) continue
      const have = haveBefore(s)
      const code = codeOf(i)
      const c = code ? courses.get(code) : undefined
      const after = !c
        ? true
        : hasUnparsedPrereq(c)
          ? codesInText(c).every((x) => have.has(x) || !items.has(x))
          : prereqCheck(c.prereq, new Set([...have, ...notInCatalog(c.prereq)])).met !== false
      if (!after) continue
      i.semester = s
      creditsIn[s] += i.credits
      break
    }
  }

  return {
    items: list,
    semesters: Array.from({ length: SEMESTERS }, (_, index) => ({ index, term: termOf(index), year: Math.floor(index / 2) + 1, credits: creditsIn[index] }))
  }
}

/** Problems with where things are: a prerequisite not in an earlier semester, or the wrong term. */
export function planIssues(plan: ProposedPlan, courses: Map<string, Course>, taken: Set<string>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const item of plan.items) {
    const code = codeOf(item)
    if (!code || item.semester === null) continue
    const s = item.semester
    const c = courses.get(code)
    if (!c) continue
    const issues: string[] = []
    const have = new Set(taken)
    for (const i of plan.items) {
      if (i.semester === null || i.semester >= s) continue
      const ic = codeOf(i)
      if (ic) have.add(ic)
      else if (i.reason === 'prereq') i.options?.forEach((o) => have.add(o))
    }
    for (const x of codesIn(c.prereq)) if (!courses.has(x)) have.add(x)
    if (!hasUnparsedPrereq(c)) {
      const check = prereqCheck(c.prereq, have)
      if (check.met === false) {
        const inPlan = check.missing.filter((m) => plan.items.some((i) => codeOf(i) === m || i.options?.includes(m)))
        issues.push(`Needs ${(inPlan.length ? inPlan : check.missing).join(' or ')} in an earlier semester`)
      }
    }
    const terms = offeredTerms(c.offered)
    if (terms && !terms.includes(termOf(s))) issues.push(`Usually offered in ${terms[0]} only`)
    if (issues.length) out[item.id] = issues
  }
  return out
}
