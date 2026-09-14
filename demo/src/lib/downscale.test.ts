import { describe, expect, it } from 'vitest'
import { computeDownscaleDimensions, computeRasterDimensions } from './downscale'

describe('computeDownscaleDimensions', () => {
  it('leaves images at or under the 1024px budget untouched', () => {
    expect(computeDownscaleDimensions(500, 500)).toEqual({ width: 500, height: 500 })
    expect(computeDownscaleDimensions(1024, 1024)).toEqual({ width: 1024, height: 1024 })
  })

  it('scales the long side down to 1024 and preserves aspect ratio', () => {
    expect(computeDownscaleDimensions(2000, 1000)).toEqual({ width: 1024, height: 512 })
  })

  it('handles a square logo above budget, like the repo samples (1792x1792)', () => {
    expect(computeDownscaleDimensions(1792, 1792)).toEqual({ width: 1024, height: 1024 })
  })

  it('respects a custom max size', () => {
    expect(computeDownscaleDimensions(4000, 2000, 512)).toEqual({ width: 512, height: 256 })
  })
})

describe('computeRasterDimensions', () => {
  it('scales a small vector up to the max size, keeping aspect', () => {
    expect(computeRasterDimensions(150, 75, 1024, true)).toEqual({ width: 1024, height: 512 })
  })

  it('scales a large vector down to the max size', () => {
    expect(computeRasterDimensions(4000, 2000, 1024, true)).toEqual({ width: 1024, height: 512 })
  })

  it('never upscales raster images', () => {
    expect(computeRasterDimensions(16, 16, 1024, false)).toEqual({ width: 16, height: 16 })
  })
})
