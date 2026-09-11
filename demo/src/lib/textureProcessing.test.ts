import { describe, expect, it } from 'vitest'
import {
  applyBrightnessThreshold,
  extractPerimeter,
  generateNormalMapData,
  hasNativeAlpha,
  pickRimPalette,
} from './textureProcessing'

function makeFlatImage(width: number, height: number, rgba: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0]
    data[i + 1] = rgba[1]
    data[i + 2] = rgba[2]
    data[i + 3] = rgba[3]
  }
  return data
}

describe('hasNativeAlpha', () => {
  it('is false for a fully opaque image', () => {
    expect(hasNativeAlpha(makeFlatImage(2, 2, [10, 10, 10, 255]))).toBe(false)
  })

  it('is true when any pixel has partial alpha', () => {
    const data = makeFlatImage(2, 2, [10, 10, 10, 255])
    data[7] = 40 // alpha channel of the second pixel
    expect(hasNativeAlpha(data)).toBe(true)
  })
})

describe('applyBrightnessThreshold', () => {
  it('makes dark pixels transparent and leaves bright pixels opaque', () => {
    const data = new Uint8ClampedArray([
      5, 5, 5, 255, // dark background -> should become transparent
      200, 200, 200, 255, // bright logo pixel -> stays opaque
    ])
    applyBrightnessThreshold(data, 18)
    expect(data[3]).toBe(0)
    expect(data[7]).toBe(255)
  })
})

describe('extractPerimeter', () => {
  it('traces the left/right edges of an 8x8 rectangle', () => {
    const width = 8
    const height = 8
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 3; x <= 5; x++) {
        data[(y * width + x) * 4 + 3] = 255
      }
    }
    const outline = extractPerimeter(data, width, height)
    // right edge (8 rows) + reversed left edge (8 rows)
    expect(outline.length).toBe(16)
    const rightXs = outline.slice(0, 8).map((p) => p[0])
    const leftXs = outline.slice(8).map((p) => p[0])
    for (const x of rightXs) {
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(0.2)
    }
    for (const x of leftXs) {
      expect(x).toBeGreaterThan(-0.2)
      expect(x).toBeLessThan(0)
    }
  })

  it('returns nothing for a fully transparent image', () => {
    expect(extractPerimeter(new Uint8ClampedArray(8 * 8 * 4), 8, 8)).toEqual([])
  })
})

describe('generateNormalMapData', () => {
  it('points straight up in the interior of a flat, uniform image', () => {
    const width = 5
    const height = 5
    const data = makeFlatImage(width, height, [200, 200, 200, 255])
    const normals = generateNormalMapData(data, width, height)
    const i = (2 * width + 2) * 4 // center pixel, away from clamped edges
    expect(normals[i]).toBe(128)
    expect(normals[i + 1]).toBe(128)
    expect(normals[i + 2]).toBe(255)
  })
})

describe('pickRimPalette', () => {
  it('picks the cyan/blue default for blue-dominant logos', () => {
    const data = makeFlatImage(4, 4, [40, 120, 220, 255])
    expect(pickRimPalette(data)).toEqual({ color: '#8ecae6', emissive: '#06b6d4' })
  })

  it('picks red for red-dominant logos', () => {
    const data = makeFlatImage(4, 4, [220, 40, 40, 255])
    expect(pickRimPalette(data)).toEqual({ color: '#e68e8e', emissive: '#d40606' })
  })

  it('picks green for green-dominant logos', () => {
    const data = makeFlatImage(4, 4, [40, 200, 60, 255])
    expect(pickRimPalette(data)).toEqual({ color: '#8ee6ae', emissive: '#06d46a' })
  })

  it('picks neutral for greyscale logos', () => {
    const data = makeFlatImage(4, 4, [180, 180, 180, 255])
    expect(pickRimPalette(data)).toEqual({ color: '#c0c0c0', emissive: '#888888' })
  })

  it('falls back to neutral when the image is fully transparent', () => {
    expect(pickRimPalette(new Uint8ClampedArray(4 * 4 * 4))).toEqual({ color: '#c0c0c0', emissive: '#888888' })
  })
})
