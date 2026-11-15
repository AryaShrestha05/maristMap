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

export interface ReqGroup {
  title: string
  /** e.g. "57" from "…: 57 cr", verbatim */
  credits: string | null
  /** base codes listed in this group */
  courses: string[]
  /** instruction text from the catalog, verbatim ("Choose one of the following") */
  notes: string[]
  /** "choose N" rule read from the title or notes; absent = every listed course is required */
  pick?: { count?: number; credits?: number }
  /** areas that share one credit total from their parent heading ("1.1 Breadth …: 16 cr") */
  pool?: { title: string; credits: number; courses: string[] }
}

export interface Major {
  id: string
  name: string
  degree: string
  concentration: string | null
  groups: ReqGroup[]
  url: string
}
