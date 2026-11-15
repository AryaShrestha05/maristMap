import { useEffect, useRef, type ReactNode } from 'react'

export interface CursorGridProps {
  /** size of one grid cell in CSS pixels */
  cellSize?: number
  /** color of the grid lines (and of the highlight, unless `highlightColor` is set) */
  color?: string
  /** color of lit cells, the spotlight and click pulses */
  highlightColor?: string
  /** 'area' lights every cell within `radius`; 'cell' lights only the cell under the cursor */
  highlight?: 'area' | 'cell'
  gridStyle?: 'lines' | 'dots'
  /** reach of the 'area' highlight in CSS pixels */
  radius?: number
  /** how long a lit cell stays fully lit after the cursor leaves (ms) */
  holdTime?: number
  /** how long a lit cell then takes to fade out (ms) */
  fadeDuration?: number
  /** opacity of a fully lit cell */
  fillOpacity?: number
  /** opacity of the grid lines / dots */
  gridOpacity?: number
  /** strength (0–1) of the soft glow under the cursor; 0 turns it off */
  spotlight?: number
  /** ripple from the click point */
  clickPulse?: boolean
  className?: string
  children?: ReactNode
}

interface Pulse {
  x: number
  y: number
  start: number
}

const PULSE_MS = 900

/** Parses #rgb / #rrggbb into "r, g, b" for rgba() strings. */
function rgb(color: string): string {
  const hex = color.replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  const n = Number.parseInt(full, 16)
  if (Number.isNaN(n)) return '255, 255, 255'
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

/**
 * A grid that lights up around the cursor, with lit cells lingering and fading, a soft spotlight and
 * click ripples. Children render above it. Honors prefers-reduced-motion (static grid only).
 */
export default function CursorGrid({
  cellSize = 60,
  color = '#ffffff',
  highlightColor,
  highlight = 'area',
  gridStyle = 'lines',
  radius = 140,
  holdTime = 400,
  fadeDuration = 800,
  fillOpacity = 0.06,
  gridOpacity = 0.08,
  spotlight = 0.6,
  clickPulse = false,
  className,
  children
}: CursorGridProps) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = host.current
    const cv = canvas.current
    const ctx = cv?.getContext('2d')
    if (!el || !cv || !ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const c = rgb(color)
    const hc = rgb(highlightColor ?? color)

    let w = 0
    let h = 0
    let dpr = 1
    let cols = 0
    let rows = 0
    /** last time each cell was under the highlight (ms), keyed by row * cols + col */
    let litAt = new Float64Array(0)
    let pointer: { x: number; y: number } | null = null
    const pulses: Pulse[] = []
    let raf = 0

    const resize = (): void => {
      const r = el.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      cv.style.width = `${w}px`
      cv.style.height = `${h}px`
      cols = Math.ceil(w / cellSize) + 1
      rows = Math.ceil(h / cellSize) + 1
      litAt = new Float64Array(cols * rows)
    }

    const drawGrid = (): void => {
      ctx.strokeStyle = `rgba(${c}, ${gridOpacity})`
      ctx.fillStyle = `rgba(${c}, ${gridOpacity * 2.5})`
      ctx.lineWidth = 1
      if (gridStyle === 'lines') {
        ctx.beginPath()
        for (let x = 0; x <= w; x += cellSize) {
          ctx.moveTo(Math.round(x) + 0.5, 0)
          ctx.lineTo(Math.round(x) + 0.5, h)
        }
        for (let y = 0; y <= h; y += cellSize) {
          ctx.moveTo(0, Math.round(y) + 0.5)
          ctx.lineTo(w, Math.round(y) + 0.5)
        }
        ctx.stroke()
      } else {
        for (let x = 0; x <= w; x += cellSize) for (let y = 0; y <= h; y += cellSize) ctx.fillRect(x - 1, y - 1, 2, 2)
      }
    }

    const frame = (now: number): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // mark cells under the cursor as lit now
      if (pointer) {
        const reach = highlight === 'area' ? radius : 0
        const c0 = Math.max(0, Math.floor((pointer.x - reach) / cellSize))
        const c1 = Math.min(cols - 1, Math.floor((pointer.x + reach) / cellSize))
        const r0 = Math.max(0, Math.floor((pointer.y - reach) / cellSize))
        const r1 = Math.min(rows - 1, Math.floor((pointer.y + reach) / cellSize))
        for (let r = r0; r <= r1; r++) {
          for (let col = c0; col <= c1; col++) {
            const cx = col * cellSize + cellSize / 2
            const cy = r * cellSize + cellSize / 2
            if (highlight === 'cell' || Math.hypot(cx - pointer.x, cy - pointer.y) <= reach) litAt[r * cols + col] = now
          }
        }
      }

      // lit cells: full for holdTime, then fade over fadeDuration; brighter nearer the cursor
      for (let i = 0; i < litAt.length; i++) {
        const t = litAt[i]
        if (!t) continue
        const age = now - t
        const life = age <= holdTime ? 1 : 1 - (age - holdTime) / fadeDuration
        if (life <= 0) {
          litAt[i] = 0
          continue
        }
        const col = i % cols
        const r = Math.floor(i / cols)
        let near = 1
        if (pointer && highlight === 'area') {
          const d = Math.hypot(col * cellSize + cellSize / 2 - pointer.x, r * cellSize + cellSize / 2 - pointer.y)
          near = d <= radius ? 1 - (d / radius) * 0.6 : 0.4
        }
        ctx.fillStyle = `rgba(${hc}, ${fillOpacity * life * near})`
        ctx.fillRect(col * cellSize + 1, r * cellSize + 1, cellSize - 1, cellSize - 1)
      }

      drawGrid()

      if (pointer && spotlight > 0) {
        const g = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, radius * 1.6)
        g.addColorStop(0, `rgba(${hc}, ${0.12 * spotlight})`)
        g.addColorStop(1, `rgba(${hc}, 0)`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]
        const k = (now - p.start) / PULSE_MS
        if (k >= 1) {
          pulses.splice(i, 1)
          continue
        }
        ctx.strokeStyle = `rgba(${hc}, ${0.45 * (1 - k)})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(p.x, p.y, 8 + k * radius * 1.4, 0, Math.PI * 2)
        ctx.stroke()
      }

      raf = requestAnimationFrame(frame)
    }

    const local = (e: PointerEvent): { x: number; y: number } => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onMove = (e: PointerEvent): void => {
      pointer = local(e)
    }
    const onLeave = (): void => {
      pointer = null
    }
    const onDown = (e: PointerEvent): void => {
      if (clickPulse) pulses.push({ ...local(e), start: performance.now() })
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    if (reduce) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawGrid()
    } else {
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerleave', onLeave)
      el.addEventListener('pointerdown', onDown)
      raf = requestAnimationFrame(frame)
    }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('pointerdown', onDown)
    }
  }, [
    cellSize,
    color,
    highlightColor,
    highlight,
    gridStyle,
    radius,
    holdTime,
    fadeDuration,
    fillOpacity,
    gridOpacity,
    spotlight,
    clickPulse
  ])

  return (
    <div ref={host} className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvas} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>{children}</div>
    </div>
  )
}
