import { describe, expect, it } from 'vitest'
import { cloudBankTileSvg, generateBankProfile, generateCloudBankTile } from './cloudBank'

describe('generateBankProfile', () => {
  it('is deterministic for a given seed', () => {
    expect(generateBankProfile(41)).toEqual(generateBankProfile(41))
  })

  it('produces a different profile for a different seed', () => {
    expect(generateBankProfile(41)).not.toEqual(generateBankProfile(42))
  })

  it('starts and ends the top edge at the same y, so the tile repeats seamlessly', () => {
    for (const seed of [1, 41, 42, 43, 999]) {
      const profile = generateBankProfile(seed)
      expect(profile[0].y).toBeCloseTo(profile[profile.length - 1].y, 6)
    }
  })

  it('has no NaN or non-finite values anywhere in the profile', () => {
    const profile = generateBankProfile(41)
    expect(profile.length).toBeGreaterThan(0)
    for (const point of profile) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
    }
  })

  it('never clips a bump against the tile top — every point clears the 0.05*height margin', () => {
    const height = 300
    for (const seed of [1, 41, 42, 43, 999]) {
      const profile = generateBankProfile(seed, { height })
      for (const point of profile) {
        expect(point.y).toBeGreaterThanOrEqual(0.05 * height - 1e-6)
      }
    }
  })

  it('keeps every point within the tile width', () => {
    const width = 1200
    const profile = generateBankProfile(41, { width })
    for (const point of profile) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(width)
    }
  })

  it('samples densely (~1 point per 2 viewBox units)', () => {
    const profile = generateBankProfile(41, { width: 1200, sampleSpacing: 2 })
    expect(profile.length).toBeGreaterThanOrEqual(500)
  })
})

describe('generateCloudBankTile', () => {
  it('is deterministic for a given seed', () => {
    expect(generateCloudBankTile(41)).toEqual(generateCloudBankTile(41))
  })

  it('never contains NaN in either path', () => {
    const { litPath, basePath } = generateCloudBankTile(41)
    expect(litPath).not.toMatch(/NaN/)
    expect(basePath).not.toMatch(/NaN/)
  })

  it('closes both paths (bottom-anchored silhouettes, safe to fill)', () => {
    const { litPath, basePath } = generateCloudBankTile(41)
    expect(litPath.trim().endsWith('Z')).toBe(true)
    expect(basePath.trim().endsWith('Z')).toBe(true)
  })

  it('shifts the base path down relative to the lit path (the lit-edge crescent)', () => {
    const seed = 41
    const profile = generateBankProfile(seed)
    const { litPath, basePath } = generateCloudBankTile(seed)
    // The very first top-edge vertex should differ in y by exactly the lit-edge shift.
    const litFirstY = Number(litPath.match(/L0\.00,(-?\d+\.\d+)/)?.[1])
    const baseFirstY = Number(basePath.match(/L0\.00,(-?\d+\.\d+)/)?.[1])
    expect(baseFirstY - litFirstY).toBeCloseTo(5, 5)
    expect(profile.length).toBeGreaterThan(0)
  })
})

describe('cloudBankTileSvg', () => {
  it('is deterministic for a given seed and renders valid, colour-carrying markup', () => {
    const opts = { fillColor: '#14163a', rimColor: '#ffe6d2' }
    const svg = cloudBankTileSvg(41, opts)
    expect(svg).toEqual(cloudBankTileSvg(41, opts))
    expect(svg).not.toMatch(/NaN/)
    expect(svg).toContain('<svg')
    expect(svg).toContain('#14163a')
    expect(svg).toContain('#ffe6d2')
  })

  it('keeps the lower 60% of the gradient flat at the exact fill colour', () => {
    const svg = cloudBankTileSvg(41, { fillColor: '#14163a', rimColor: '#ffe6d2' })
    expect(svg).toContain('offset="40%" stop-color="#14163a"')
    expect(svg).toContain('offset="100%" stop-color="#14163a"')
  })
})
