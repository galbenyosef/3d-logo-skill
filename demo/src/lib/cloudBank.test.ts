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

  it('keeps every point within the tile bounds', () => {
    const width = 1200
    const height = 300
    const profile = generateBankProfile(41, { width, height })
    for (const point of profile) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(width)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(height)
    }
  })
})

describe('generateCloudBankTile', () => {
  it('is deterministic for a given seed', () => {
    expect(generateCloudBankTile(41)).toEqual(generateCloudBankTile(41))
  })

  it('never contains NaN in either path', () => {
    const { fillPath, rimPath } = generateCloudBankTile(41)
    expect(fillPath).not.toMatch(/NaN/)
    expect(rimPath).not.toMatch(/NaN/)
  })

  it('closes the fill path but leaves the rim path open', () => {
    const { fillPath, rimPath } = generateCloudBankTile(41)
    expect(fillPath.trim().endsWith('Z')).toBe(true)
    expect(rimPath.trim().endsWith('Z')).toBe(false)
  })

  it('starts the fill path at the bottom-left corner (closed, bottom-anchored)', () => {
    const { height, fillPath } = generateCloudBankTile(41, { height: 300 })
    expect(fillPath.startsWith(`M0,${height.toFixed(2)}`)).toBe(true)
  })
})

describe('cloudBankTileSvg', () => {
  it('is deterministic for a given seed and renders valid, colour-carrying markup', () => {
    const opts = { fillColor: '#14163a', rimColor: '#ffe6d2', rimOpacity: 0.3 }
    const svg = cloudBankTileSvg(41, opts)
    expect(svg).toEqual(cloudBankTileSvg(41, opts))
    expect(svg).not.toMatch(/NaN/)
    expect(svg).toContain('<svg')
    expect(svg).toContain('#14163a')
    expect(svg).toContain('#ffe6d2')
  })
})
