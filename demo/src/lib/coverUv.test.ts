import { describe, expect, it } from 'vitest'
import {
  computeCoverMapping,
  imageToScreenUv,
  parseObjectPosition,
  screenToImageUv,
  SUN_IMAGE_UV_LANDSCAPE,
  SUN_IMAGE_UV_PORTRAIT,
  sunImageUvFor,
} from './coverUv'

// Real exported plate dimensions (sips-verified).
const LANDSCAPE_IMAGE = { width: 1600, height: 893 }
const PORTRAIT_IMAGE = { width: 800, height: 1600 }

describe('computeCoverMapping', () => {
  it('is the identity crop when container and image share an aspect ratio', () => {
    const m = computeCoverMapping({ width: 1000, height: 500 }, { width: 2000, height: 1000 })
    expect(m.scale).toBeCloseTo(0.5, 6)
    expect(m.offset).toEqual({ x: 0, y: 0 })
    expect(m.span).toEqual({ x: 1, y: 1 })
  })

  it('crops the sides evenly at 50% position when the image is relatively wider', () => {
    // container narrower/taller than the image -> horizontal crop, matched heights.
    const container = { width: 1440, height: 900 }
    const m = computeCoverMapping(container, LANDSCAPE_IMAGE)
    expect(m.span.y).toBeCloseTo(1, 6) // full height visible, nothing cropped vertically
    expect(m.offset.x).toBeGreaterThan(0) // some of the image's left edge is cropped away
    expect(m.offset.x + m.span.x).toBeLessThan(1) // ...and some of the right edge too (even crop)
    expect(m.offset.x).toBeCloseTo(1 - (m.offset.x + m.span.x), 6)
  })

  it('falls back to an identity mapping for a degenerate (zero-size) box instead of dividing by zero', () => {
    const m = computeCoverMapping({ width: 0, height: 0 }, LANDSCAPE_IMAGE)
    expect(m).toEqual({ scale: 1, offset: { x: 0, y: 0 }, span: { x: 1, y: 1 } })
  })
})

describe('screenToImageUv / imageToScreenUv round-trip', () => {
  it('inverts exactly for a variety of containers, images and positions', () => {
    const cases: Array<[{ width: number; height: number }, { width: number; height: number }, { x: number; y: number }]> = [
      [{ width: 1440, height: 900 }, LANDSCAPE_IMAGE, { x: 0.5, y: 0.5 }],
      [{ width: 1280, height: 720 }, LANDSCAPE_IMAGE, { x: 0.5, y: 0.5 }],
      [{ width: 390, height: 844 }, PORTRAIT_IMAGE, { x: 0.5, y: 0.5 }],
      [{ width: 375, height: 667 }, PORTRAIT_IMAGE, { x: 0.3, y: 0.7 }],
    ]
    for (const [container, image, position] of cases) {
      for (const uv of [{ x: 0, y: 0 }, { x: 0.645, y: 0.635 }, { x: 1, y: 1 }]) {
        const screenUv = imageToScreenUv(uv, container, image, position)
        const backToImage = screenToImageUv(screenUv, container, image, position)
        expect(backToImage.x).toBeCloseTo(uv.x, 6)
        expect(backToImage.y).toBeCloseTo(uv.y, 6)
      }
    }
  })
})

describe('sun placement on real viewports (landscape plate)', () => {
  it('lands the sun near the coin at 1440x900 (coin sits ~66-68% across on desktop)', () => {
    const screenUv = imageToScreenUv(SUN_IMAGE_UV_LANDSCAPE, { width: 1440, height: 900 }, LANDSCAPE_IMAGE)
    expect(screenUv.x).toBeCloseTo(0.66, 2)
    expect(screenUv.x).toBeGreaterThan(0.6)
    expect(screenUv.x).toBeLessThan(0.72)
    // Still on-screen vertically.
    expect(screenUv.y).toBeGreaterThan(0)
    expect(screenUv.y).toBeLessThan(1)
  })

  it('lands the sun near the coin at 1280x720 too', () => {
    const screenUv = imageToScreenUv(SUN_IMAGE_UV_LANDSCAPE, { width: 1280, height: 720 }, LANDSCAPE_IMAGE)
    expect(screenUv.x).toBeGreaterThan(0.6)
    expect(screenUv.x).toBeLessThan(0.72)
  })
})

describe('sun placement on real viewports (portrait plate)', () => {
  it('keeps the sun horizontally centred at 390x844', () => {
    const screenUv = imageToScreenUv(SUN_IMAGE_UV_PORTRAIT, { width: 390, height: 844 }, PORTRAIT_IMAGE)
    expect(screenUv.x).toBeCloseTo(0.5, 6)
    expect(screenUv.y).toBeGreaterThan(0)
    expect(screenUv.y).toBeLessThan(1)
  })

  it('keeps the sun horizontally centred at 375x667', () => {
    const screenUv = imageToScreenUv(SUN_IMAGE_UV_PORTRAIT, { width: 375, height: 667 }, PORTRAIT_IMAGE)
    expect(screenUv.x).toBeCloseTo(0.5, 6)
  })
})

describe('sunImageUvFor', () => {
  it('picks the landscape sun uv for a wide image', () => {
    expect(sunImageUvFor(LANDSCAPE_IMAGE)).toEqual(SUN_IMAGE_UV_LANDSCAPE)
  })

  it('picks the portrait sun uv for a tall image', () => {
    expect(sunImageUvFor(PORTRAIT_IMAGE)).toEqual(SUN_IMAGE_UV_PORTRAIT)
  })
})

describe('parseObjectPosition', () => {
  it('parses a percentage pair', () => {
    expect(parseObjectPosition('50% 50%')).toEqual({ x: 0.5, y: 0.5 })
    expect(parseObjectPosition('66% 40%')).toEqual({ x: 0.66, y: 0.4 })
  })

  it('falls back on anything that is not a clean percentage pair', () => {
    const fallback = { x: 0.1, y: 0.9 }
    expect(parseObjectPosition('center center', fallback)).toEqual(fallback)
    expect(parseObjectPosition('50%', fallback)).toEqual(fallback)
    expect(parseObjectPosition('', fallback)).toEqual(fallback)
  })
})
