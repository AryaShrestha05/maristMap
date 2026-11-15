import { useEffect, useRef, type ReactNode } from 'react'

export interface ClickSparkProps {
  sparkColor?: string
  shape?: 'line' | 'circle' | 'square' | 'x'
  sparkCount?: number
  /** length (line, x) or diameter (circle, square) of each spark at the start, in CSS px */
  sparkSize?: number
  /** how far sparks travel from the click, in CSS px */
  sparkRadius?: number
  /** ms */
  duration?: number
  /** only clicks on elements matching this selector spark (default: any click inside) */
  selector?: string
  /**
   * pick white or `contrastColor` per clicked element so sparks stay visible on light buttons:
   * dark/colored background → `sparkColor`, light background → `contrastColor`
   */
  autoContrast?: boolean
  contrastColor?: string
  children?: ReactNode
}

interface Burst {
  x: number
  y: number
  start: number
  color: string
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t)

/** Luminance (0–1) of the first non-transparent background at or above `el`. */
function backgroundLuminance(el: Element | null): number {
  for (let node = el; node; node = node.parentElement) {
    const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(node).backgroundColor)
    if (!m) continue
    const [r, g, b, a = 1] = m[1].split(',').map((v) => Number.parseFloat(v))
    if (a < 0.5) continue
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  }
  return 1
}

/**
 * Sparks burst out from the click point. One fixed canvas covers the screen, so a single
 * <ClickSpark> can serve a whole app (use `selector` to limit it to buttons).
 */
export default function ClickSpark({
  sparkColor = '#fff',
  shape = 'line',
  sparkCount = 8,
  sparkSize = 14,
  sparkRadius = 30,
  duration = 500,
  selector,
  autoContrast = false,
  contrastColor = '#C8102E',
  children
}: ClickSparkProps) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = host.current
    const cv = canvas.current
    const ctx = cv?.getContext('2d')
    if (!el || !cv || !ctx) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const bursts: Burst[] = []
    let raf = 0
    let dpr = 1

    const resize = (): void => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.width = Math.round(window.innerWidth * dpr)
      cv.height = Math.round(window.innerHeight * dpr)
    }

    const draw = (now: number): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]
        const t = (now - b.start) / duration
        if (t >= 1) {
          bursts.splice(i, 1)
          continue
        }
        const k = easeOut(t)
        const dist = k * sparkRadius
        const size = sparkSize * (1 - k)
        ctx.strokeStyle = b.color
        ctx.fillStyle = b.color
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        for (let s = 0; s < sparkCount; s++) {
          const a = (2 * Math.PI * s) / sparkCount
          const cos = Math.cos(a)
          const sin = Math.sin(a)
          const x = b.x + dist * cos
          const y = b.y + dist * sin
          ctx.beginPath()
          if (shape === 'line') {
            ctx.moveTo(x, y)
            ctx.lineTo(x + size * cos, y + size * sin)
            ctx.stroke()
          } else if (shape === 'circle') {
            ctx.arc(x, y, size / 2, 0, Math.PI * 2)
            ctx.fill()
          } else if (shape === 'square') {
            ctx.fillRect(x - size / 2, y - size / 2, size, size)
          } else {
            ctx.moveTo(x - size / 2, y - size / 2)
            ctx.lineTo(x + size / 2, y + size / 2)
            ctx.moveTo(x + size / 2, y - size / 2)
            ctx.lineTo(x - size / 2, y + size / 2)
            ctx.stroke()
          }
        }
      }
      raf = bursts.length ? requestAnimationFrame(draw) : 0
    }

    const onDown = (e: PointerEvent): void => {
      const target = e.target instanceof Element ? e.target : null
      const hit = selector ? target?.closest(selector) : target
      if (!hit || (hit instanceof HTMLButtonElement && hit.disabled)) return
      const color = autoContrast && backgroundLuminance(hit) > 0.6 ? contrastColor : sparkColor
      bursts.push({ x: e.clientX, y: e.clientY, start: performance.now(), color })
      if (!raf) raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    el.addEventListener('pointerdown', onDown, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      el.removeEventListener('pointerdown', onDown, true)
    }
  }, [sparkColor, shape, sparkCount, sparkSize, sparkRadius, duration, selector, autoContrast, contrastColor])

  return (
    <div ref={host} style={{ display: 'contents' }}>
      {children}
      <canvas
        ref={canvas}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 1000 }}
      />
    </div>
  )
}
