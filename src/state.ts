export type ThemeMode = 'white' | 'red'
export type View = 'graph' | 'grid'
export type GroupBy = 'requirements' | 'departments'

export interface SavedState {
  majorId: string | null
  /** base codes */
  taken: string[]
  cart: string[]
  theme: ThemeMode
  view: View
  groupBy: GroupBy
}

export const STORAGE_KEY = 'maristmap:v1'

export const DEFAULT_STATE: SavedState = {
  majorId: null,
  taken: [],
  cart: [],
  theme: 'white',
  view: 'graph',
  groupBy: 'requirements'
}

export function encodeState(s: SavedState): string {
  return JSON.stringify({ v: 1, ...s })
}

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
    view: oneOf(o.view, ['graph', 'grid'] as const, DEFAULT_STATE.view),
    groupBy: oneOf(o.groupBy, ['requirements', 'departments'] as const, DEFAULT_STATE.groupBy)
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
