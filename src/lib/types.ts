export type Prereq =
  | { kind: 'course'; code: string } // base code, e.g. "CMPT 220"
  | { kind: 'all'; of: Prereq[] }
  | { kind: 'any'; of: Prereq[] }
  | { kind: 'text'; text: string } // non-course condition, shown verbatim

export interface Course {
  /** Catalog code with suffix, e.g. "CMPT 220L" */
  code: string
  /** Code without the catalog suffix, used for all matching, e.g. "CMPT 220" */
  base: string
  prefix: string
  title: string
  /** Verbatim, e.g. "4" or "1-3" */
  credits: string
  liberalArts: boolean | null
  description: string
  offered: string | null
  prereqText: string | null
  coreqText: string | null
  /** null when there are none, or when the text can't be structured safely (then prereqText is shown) */
  prereq: Prereq | null
  url: string
}
