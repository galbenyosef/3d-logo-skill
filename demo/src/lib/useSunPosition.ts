import { useLayoutEffect, useRef } from 'react'

/**
 * Measures the coin's stage (`.coin-stage`) relative to `.screen-1` and
 * writes --sun-x/--sun-y/--sun-r (px) onto `.screen-1`, so the CSS sun disc
 * in Sky.tsx can track the coin without a re-render on every resize.
 *
 * Deliberately measures `.coin-stage`, not `.coin-canvas-wrap` — the wrap
 * bobs via a `transform` animation (coin-bob), and getBoundingClientRect()
 * on it would report a position that jitters in time with the bob. The
 * stage centers the wrap via flexbox with no other flow siblings, so the
 * stage's own (static) centre always equals the wrap's settled centre.
 * The wrap's offsetWidth (also unaffected by transform) still gives the
 * coin's true rendered size.
 */
export function useSunPosition(): void {
  const frame = useRef<number>(undefined)

  useLayoutEffect(() => {
    const screen = document.querySelector<HTMLElement>('.screen-1')
    const stage = document.querySelector<HTMLElement>('.coin-stage')
    const wrap = document.querySelector<HTMLElement>('.coin-canvas-wrap')
    if (!screen || !stage || !wrap) return

    const measure = () => {
      const screenBox = screen.getBoundingClientRect()
      const stageBox = stage.getBoundingClientRect()
      const size = wrap.offsetWidth || Math.min(stageBox.width, stageBox.height)
      const cx = stageBox.left + stageBox.width / 2 - screenBox.left
      const cy = stageBox.top + stageBox.height / 2 - screenBox.top

      // Sun centre y = coin centre y + 0.28 * coin size; radius = 0.5 * coin
      // size (.impeccable.md) — the disc rises behind the coin's lower half.
      screen.style.setProperty('--sun-x', `${cx}px`)
      screen.style.setProperty('--sun-y', `${cy + size * 0.28}px`)
      screen.style.setProperty('--sun-r', `${size * 0.5}px`)
    }

    const schedule = () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(measure)
    }

    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(stage)
    ro.observe(screen)
    window.addEventListener('resize', schedule)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', schedule)
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [])
}
