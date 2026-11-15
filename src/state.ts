export type ThemeMode = 'white' | 'red'
export type View = 'graph' | 'grid' | 'plan'
export type GroupBy = 'requirements' | 'departments'

export interface SavedState {
  majorId: string | null
  /** base codes */
  taken: string[]
  cart: string[]
  theme: ThemeMode
  view: View
  groupBy: GroupBy
  /** first semester of the proposed plan (0 = Year 1 Fall); null = worked out from courses taken */
  planStart: number | null
  /** courses the student moved in the plan: id → semester */
  planPins: Record<string, number>
  /** courses picked for "Choose" cards: slot id → course */
  planPicks: Record<string, string>
  /** courses added to the plan by the student: course → semester */
  planAdded: Record<string, number>
}

export const STORAGE_KEY = 'maristmap:v1'

export const DEFAULT_STATE: SavedState = {
  majorId: null,
  taken: [],
  cart: [],
  theme: 'white',
  view: 'graph',
  groupBy: 'requirements',
  planStart: null,
  planPins: {},
  planPicks: {},
  planAdded: {}
}

export function encodeState(s: SavedState): string {
  return JSON.stringify({ v: 1, ...s })
}

const semester = (x: unknown): number | null => (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 7 ? (x as number) : null)
const semesterMap = (x: unknown): Record<string, number> =>
  x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([, v]) => semester(v) !== null)) : {}
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [])
const oneOf = <T extends string>(x: unknown, options: readonly T[], fallback: T): T =>
  options.includes(x as T) ? (x as T) : fallback

/** Never throws: anything unreadable falls back to defaults, field by field. */
export function decodeState(raw: string | null, majorIds: string[]): SavedState {
  if (!raw) return { ...DEFAULT_STATE }
  let o: Record<string, unknown>
  try {
    o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return { ...DEFAULT_STATE }
  } catch {
    return { ...DEFAULT_STATE }
  }
  return {
    majorId: typeof o.majorId === 'string' && majorIds.includes(o.majorId) ? o.majorId : null,
    taken: strings(o.taken),
    cart: strings(o.cart),
    theme: oneOf(o.theme, ['white', 'red'] as const, DEFAULT_STATE.theme),
    view: oneOf(o.view, ['graph', 'grid', 'plan'] as const, DEFAULT_STATE.view),
    groupBy: oneOf(o.groupBy, ['requirements', 'departments'] as const, DEFAULT_STATE.groupBy),
    planStart: semester(o.planStart),
    planPins: semesterMap(o.planPins),
    planPicks:
      o.planPicks && typeof o.planPicks === 'object'
        ? Object.fromEntries(Object.entries(o.planPicks).filter(([, v]) => typeof v === 'string'))
        : {},
    planAdded: semesterMap(o.planAdded)
  }
}

export function loadState(majorIds: string[]): SavedState {
  try {
    return decodeState(localStorage.getItem(STORAGE_KEY), majorIds)
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function saveState(s: SavedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, encodeState(s))
  } catch {
    // storage full or blocked: the app keeps working for this visit
  }
}

/** The part of a plan that travels in a share link. */
export interface SharedPlan {
  majorId: string
  taken: string[]
  cart: string[]
}

export function encodeShare(p: SharedPlan): string {
  return '#plan=' + encodeURIComponent(JSON.stringify({ m: p.majorId, t: p.taken, c: p.cart }))
}

/** Reads a `#plan=` hash. Anything unreadable, or a major that no longer exists, gives null. */
export function decodeShare(hash: string, majorIds: string[]): SharedPlan | null {
  if (!hash.startsWith('#plan=')) return null
  try {
    const o = JSON.parse(decodeURIComponent(hash.slice('#plan='.length)))
    if (!o || typeof o.m !== 'string' || !majorIds.includes(o.m)) return null
    return { majorId: o.m, taken: strings(o.t), cart: strings(o.c) }
  } catch {
    return null
  }
}
