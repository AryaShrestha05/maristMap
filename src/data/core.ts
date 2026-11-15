// Core/Liberal Studies requirements, transcribed from Marist's official documents.
// Structure: 2026–27 Undergraduate Catalog, "Core/Liberal Studies Curriculum".
// Course lists: the Breadth PDFs linked from https://www.marist.edu/academics/core/breadth

export interface CoreCategory {
  id: string
  name: string
  group: 'Foundation' | 'Breadth'
  credits: number
  /** Base codes listed by name in the source document (cross-listed twins included). */
  courses: string[]
  /** Rule stated in the source that can be checked from the course code alone. */
  rule?: (prefix: string, num: number, histCredits: number) => boolean
  /** Rules from the source that can't be checked automatically, shown verbatim. */
  notes?: string[]
  source: string
  sourceYear: string
}

const CATALOG = 'https://catalog.marist.edu/content.php?catoid=12&navoid=527'
const pdf = (slug: string): string => `https://www.marist.edu/documents/d/guest/${slug}`

export const CORE: CoreCategory[] = [
  { id: 'fys', name: 'First Year Seminar', group: 'Foundation', credits: 4, courses: ['FYS 101'], source: CATALOG, sourceYear: '2026–27' },
  { id: 'writing', name: 'Writing for College', group: 'Foundation', credits: 3, courses: ['ENG 120'], source: CATALOG, sourceYear: '2026–27' },
  { id: 'philosophy', name: 'Philosophy', group: 'Breadth', credits: 3, courses: ['PHIL 101'], source: CATALOG, sourceYear: '2026–27' },
  {
    id: 'ethics',
    name: 'Ethics, Applied Ethics, or Religious Studies',
    group: 'Breadth',
    credits: 3,
    courses: ['PHIL 200', 'PHIL 247', 'PHIL 301', 'PHIL 302', 'PHIL 346', 'PHIL 348', 'CMPT 305', 'MDIA 316', 'CRJU 310', 'BUS 312'],
    rule: (prefix) => prefix === 'REST', // "Any REST course"
    source: pdf('phrs_24'),
    sourceYear: '2024'
  },
  {
    id: 'finearts',
    name: 'Fine Arts',
    group: 'Breadth',
    credits: 3,
    courses: [
      'ART 110', 'ART 125', 'ART 160', 'ART 180', 'ART 220', 'ART 230', 'ART 245', 'ART 255', 'ART 256', 'ART 265',
      'ART 270', 'ART 280', 'ART 281', 'ART 290', 'ART 350', 'ART 362', 'ART 365', 'ART 366', 'ART 380',
      'ENG 150', 'ENG 227', 'COM 227', 'ENG 280', 'ITAL 308', 'MDIA 120',
      'MUS 105', 'MUS 106', 'MUS 120', 'MUS 220', 'MUS 225', 'MUS 226', 'MUS 242', 'MUS 248',
      'PHIL 237', 'PHIL 333', 'SPAN 330', 'SPAN 335'
    ],
    notes: ['Any 300-level course in Music History (e.g. MUS 335 Opera)'],
    source: pdf('fine_2013'),
    sourceYear: '2013'
  },
  {
    id: 'history',
    name: 'History',
    group: 'Breadth',
    credits: 3,
    courses: [],
    // "Any 100- or 200-level history course (except HIST 209L). 300-level history courses may also be used …
    //  but you must have earned 6 history credits before taking a 300-level history course."
    rule: (prefix, num, histCredits) =>
      prefix === 'HIST' && num !== 209 && ((num >= 100 && num < 300) || (num >= 300 && num < 400 && histCredits >= 6)),
    source: pdf('history'),
    sourceYear: 'current'
  },
  {
    id: 'literature',
    name: 'Literature',
    group: 'Breadth',
    credits: 3,
    courses: [
      'ENG 170', 'ENG 201', 'ENG 205', 'ENG 210', 'ENG 211', 'ENG 214', 'REST 214', 'ENG 220', 'ENG 231', 'ENG 232',
      'ENG 233', 'ENG 234', 'ENG 237', 'ENG 240', 'ENG 255', 'ENG 261', 'SPAN 222', 'ENG 264', 'ENG 270', 'ENG 271'
    ],
    notes: ['Any foreign-language literature course (e.g. FREN 305 or SPAN 315)'],
    source: pdf('litr'),
    sourceYear: 'current'
  },
  {
    id: 'math',
    name: 'Mathematics',
    group: 'Breadth',
    credits: 3,
    courses: [],
    // "Any 100-level MATH course numbered '110' or above, or any 200-level MATH course (except MATH 180)"
    rule: (prefix, num) => prefix === 'MATH' && num >= 110 && num < 300 && num !== 180,
    source: pdf('math_2024'),
    sourceYear: '2024'
  },
  {
    id: 'natsci',
    name: 'Natural Science',
    group: 'Breadth',
    credits: 3,
    courses: [
      'ANTH 101', 'BIOL 101', 'BIOL 120', 'BIOL 214', 'BIOL 232', 'BIOL 237', 'CHEM 101', 'ENSC 101', 'ENSC 210',
      'ENSC 306', 'HLTH 225', 'PHYS 108', 'PHYS 193'
    ],
    source: pdf('nasc_2013'),
    sourceYear: '2013'
  },
  {
    id: 'socsci',
    name: 'Social Science',
    group: 'Breadth',
    credits: 3,
    courses: [
      'ANTH 102', 'ANTH 120', 'ANTH 230', 'ANTH 231', 'ANTH 232', 'REST 232', 'ANTH 233',
      'ECON 103', 'ECON 104', 'ECON 150', 'ECON 200', 'ECON 210',
      'POSC 102', 'PRLG 101', 'POSC 103', 'GBST 103', 'CSCU 103', 'POSC 105', 'PRLG 105', 'POSC 110', 'POSC 111', 'POSC 113',
      'PSYC 101', 'PSYC 201', 'PSYC 202', 'PSYC 203', 'PSYC 206', 'PSYC 207', 'PSYC 208', 'PSYC 210', 'PSYC 211',
      'PSYC 215', 'PSYC 220', 'PSYC 222', 'PSYC 301', 'PSYC 302', 'PSYC 303', 'PSYC 304', 'PSYC 305', 'PSYC 315',
      'PSYC 317', 'PSYC 318', 'PSYC 321', 'PSYC 330', 'PSYC 332', 'PSYC 342', 'PSYC 348', 'PSYC 385', 'PSYC 392', 'PSYC 393',
      'SOC 101'
    ],
    // "Any 200-level Political Science course", "Any 200-level SOC course"
    rule: (prefix, num) => (prefix === 'POSC' || prefix === 'SOC') && num >= 200 && num < 300,
    source: pdf('sosc_2013'),
    sourceYear: '2013'
  }
]

/** Marist's own caution, printed on the Breadth documents. */
export const CORE_CAUTION = 'Always check your audit as course applicability may change.'

/** Core categories a course counts toward. `histCredits` = HIST credits already earned (for the 300-level rule). */
export function categoriesFor(base: string, histCredits: number): string[] {
  const [prefix, n] = base.split(' ')
  const num = Number(n)
  return CORE.filter((c) => c.courses.includes(base) || (c.rule?.(prefix, num, histCredits) ?? false)).map((c) => c.id)
}
