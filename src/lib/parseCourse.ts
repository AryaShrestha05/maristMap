import type { Course, Prereq } from './types'

/** Catalog course code: prefix, number, optional catalog suffix letter (L = liberal arts, N = non). */
export const CODE_RE = /\b([A-Z]{2,4}) ?(\d{3})[A-Z]?\b/

type Token =
  | { t: 'course'; code: string }
  | { t: 'text'; text: string }
  | { t: 'and' }
  | { t: 'or' }
  | { t: 'comma' }
  | { t: '(' }
  | { t: ')' }

class Ambiguous extends Error {}

const GRADE_PHRASES = [
  /,?\s*with an? (?:minimum )?grade of [A-F][+-]? or (?:better|higher)/gi,
  /\ba minimum grade of [A-F][+-]? in\b/gi,
  /\(\s*minimum grade (?:of )?[A-F][+-]?\s*\)/gi
]
/** Words that only glue a list together. */
const FILLER = /^(?:either|both|one of|the following:?|of)$/i

function tokenize(input: string): Token[] {
  const re = /\(|\)|,|;|\b(?:and|or)\b|\b[A-Z]{2,4} ?\d{3}[A-Z]?\b/gi
  const tokens: Token[] = []
  let last = 0
  const pushText = (raw: string): void => {
    const text = raw.trim().replace(/^[.:]+|[.:]+$/g, '').trim()
    if (!text || FILLER.test(text)) return
    tokens.push({ t: 'text', text })
  }
  for (const m of input.matchAll(re)) {
    const s = m[0]
    // course codes must be uppercase; a case-insensitive "and"/"or" match inside a word can't happen thanks to \b
    const isCode = /^[A-Z]{2,4} ?\d{3}[A-Z]?$/.test(s)
    const isOp = /^(and|or)$/i.test(s)
    if (!isCode && !isOp && !/^[(),;]$/.test(s)) continue
    pushText(input.slice(last, m.index))
    last = m.index! + s.length
    if (s === ';') throw new Ambiguous()
    if (isCode) {
      const [, prefix, num] = CODE_RE.exec(s)!
      tokens.push({ t: 'course', code: `${prefix} ${num}` })
    } else if (isOp) tokens.push({ t: s.toLowerCase() as 'and' | 'or' })
    else if (s === ',') tokens.push({ t: 'comma' })
    else tokens.push({ t: s as '(' | ')' })
  }
  pushText(input.slice(last))
  return tokens
}

function parseTokens(tokens: Token[]): Prereq {
  let i = 0
  const peek = (): Token | undefined => tokens[i]

  function operand(): Prereq {
    const tok = tokens[i++]
    if (!tok) throw new Ambiguous()
    if (tok.t === 'course') return { kind: 'course', code: tok.code }
    if (tok.t === 'text') return { kind: 'text', text: tok.text }
    if (tok.t === '(') {
      const inner = expr()
      if (tokens[i++]?.t !== ')') throw new Ambiguous()
      return inner
    }
    throw new Ambiguous()
  }

  function expr(): Prereq {
    const parts = [operand()]
    const ops = new Set<'and' | 'or'>()
    for (;;) {
      const tok = peek()
      if (!tok || tok.t === ')') break
      if (tok.t === 'comma') {
        i++
        const next = peek()
        if (next?.t === 'and' || next?.t === 'or') {
          ops.add(next.t)
          i++
        }
      } else if (tok.t === 'and' || tok.t === 'or') {
        ops.add(tok.t)
        i++
      } else {
        throw new Ambiguous() // two operands with nothing joining them
      }
      parts.push(operand())
    }
    if (ops.size > 1) throw new Ambiguous() // "A or B and C" without parentheses
    if (parts.length === 1) return parts[0]
    return { kind: ops.has('or') ? 'any' : 'all', of: parts }
  }

  const result = expr()
  if (i !== tokens.length) throw new Ambiguous()
  return result
}

/**
 * Turns catalog prerequisite text into a structure. Returns null when there is nothing,
 * or when the wording can't be structured without guessing (the UI then shows the text verbatim).
 */
export function parsePrereq(text: string): Prereq | null {
  let s = text.trim().replace(/\.$/, '').trim()
  if (!s || /^none$/i.test(s)) return null
  for (const re of GRADE_PHRASES) s = s.replace(re, '')
  if (!CODE_RE.test(s)) return { kind: 'text', text: s.trim() }
  try {
    const tokens = tokenize(s)
    if (tokens.some((t) => t.t === 'text') && tokens.filter((t) => t.t === 'course').length === 0) {
      return { kind: 'text', text: s.trim() }
    }
    const result = parseTokens(tokens)
    // a text operand glued directly to code-bearing text means we didn't really understand it
    return result
  } catch (e) {
    if (e instanceof Ambiguous) return null
    throw e
  }
}


export interface RawCourse {
  coid: string
  name: string
  url: string
  block: string
}

const LABELS = ['Offered When', 'Prerequisite(s)', 'Corequisite(s)', 'Recommended'] as const
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const LABEL_RE = new RegExp(`(${LABELS.map(escape).join('|')}):\\s*`, 'g')

/** Splits a course block (all text run together) into its parts. Title comes from the link name, which is clean. */
export function parseCourse(raw: RawCourse): Course {
  const dash = raw.name.indexOf(' - ')
  const code = (dash > 0 ? raw.name.slice(0, dash) : raw.name).trim()
  const title = dash > 0 ? raw.name.slice(dash + 3).trim() : ''
  const m = CODE_RE.exec(code)
  const prefix = m ? m[1] : code.split(' ')[0]
  const base = m ? `${m[1]} ${m[2]}` : code

  let rest = raw.block.startsWith(raw.name) ? raw.block.slice(raw.name.length) : raw.block
  const credit = /^\s*(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*Credit\(s\)\s*/.exec(rest)
  const credits = credit ? credit[1].replace(/\s+/g, '') : ''
  if (credit) rest = rest.slice(credit[0].length)

  let liberalArts: boolean | null = null
  if (rest.startsWith('Non Liberal Arts')) {
    liberalArts = false
    rest = rest.slice('Non Liberal Arts'.length)
  } else if (rest.startsWith('Liberal Arts')) {
    liberalArts = true
    rest = rest.slice('Liberal Arts'.length)
  }

  // labelled sections
  const marks = [...rest.matchAll(LABEL_RE)].map((x) => ({ label: x[1], start: x.index!, end: x.index! + x[0].length }))
  const description = (marks.length ? rest.slice(0, marks[0].start) : rest).trim()
  const fields: Record<string, string> = {}
  marks.forEach((mk, i) => {
    const value = rest.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : undefined).trim()
    if (value) fields[mk.label] = value
  })

  const prereqText = fields['Prerequisite(s)'] ?? null
  return {
    code,
    base,
    prefix,
    title,
    credits,
    liberalArts,
    description,
    offered: fields['Offered When'] ?? null,
    prereqText,
    coreqText: fields['Corequisite(s)'] ?? null,
    prereq: prereqText ? parsePrereq(prereqText) : null,
    url: raw.url
  }
}
