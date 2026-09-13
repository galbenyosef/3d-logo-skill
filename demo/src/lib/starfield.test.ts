import { describe, expect, it } from 'vitest'
import { generateStars, STARFIELD_VIEWBOX } from './starfield'

describe('generateStars', () => {
  it('is deterministic for a given seed', () => {
    expect(generateStars(1337)).toEqual(generateStars(1337))
  })

  it('produces a different sky for a different seed', () => {
    expect(generateStars(1337)).not.toEqual(generateStars(7))
  })

  it('returns the requested count', () => {
    expect(generateStars(1, 40)).toHaveLength(40)
  })

  it('keeps every star within the declared viewBox and value ranges, with no NaN', () => {
    const [, , vbWidth, vbHeight] = STARFIELD_VIEWBOX.split(' ').map(Number)
    const stars = generateStars(1337)
    expect(stars.length).toBeGreaterThan(0)

    for (const star of stars) {
      for (const value of [star.cx, star.cy, star.r, star.opacity, star.delay, star.duration]) {
        expect(Number.isNaN(value)).toBe(false)
        expect(Number.isFinite(value)).toBe(true)
      }
      expect(star.cx).toBeGreaterThanOrEqual(0)
      expect(star.cx).toBeLessThan(vbWidth)
      expect(star.cy).toBeGreaterThanOrEqual(0)
      expect(star.cy).toBeLessThan(vbHeight)
      expect(star.r).toBeGreaterThanOrEqual(0.5)
      expect(star.r).toBeLessThanOrEqual(1.4)
      expect(star.opacity).toBeGreaterThanOrEqual(0.25)
      expect(star.opacity).toBeLessThanOrEqual(0.9)
    }
  })

  it('marks roughly 6 stars as twinkling, each with a positive duration', () => {
    const stars = generateStars(1337)
    const twinkling = stars.filter((s) => s.twinkle)
    expect(twinkling.length).toBeGreaterThanOrEqual(5)
    expect(twinkling.length).toBeLessThanOrEqual(9)
    for (const star of twinkling) {
      expect(star.duration).toBeGreaterThan(0)
    }
  })
})
