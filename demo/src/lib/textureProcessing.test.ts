import { describe, expect, it } from 'vitest'
import {
  clearDetachedSpecks,
  applyBrightnessThreshold,
  detectSolidBackground,
  dropSmallSpecks,
  extractPerimeter,
  generateNormalMapData,
  hasNativeAlpha,
  pickRimPalette,
  removeBackgroundFromEdges,
  type RGB,
  computeSquareFit,
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

/** Sets one pixel's RGBA in place. */
function setPixel(data: Uint8ClampedArray, width: number, x: number, y: number, rgba: [number, number, number, number]): void {
  const i = (y * width + x) * 4
  data[i] = rgba[0]
  data[i + 1] = rgba[1]
  data[i + 2] = rgba[2]
  data[i + 3] = rgba[3]
}

/** Paints the 1px border frame a solid colour. */
function fillBorder(data: Uint8ClampedArray, width: number, height: number, rgba: [number, number, number, number]): void {
  for (let x = 0; x < width; x++) {
    setPixel(data, width, x, 0, rgba)
    setPixel(data, width, x, height - 1, rgba)
  }
  for (let y = 0; y < height; y++) {
    setPixel(data, width, 0, y, rgba)
    setPixel(data, width, width - 1, y, rgba)
  }
}

describe('detectSolidBackground', () => {
  it('detects a white border', () => {
    const width = 20
    const height = 20
    const data = makeFlatImage(width, height, [10, 10, 10, 255])
    fillBorder(data, width, height, [255, 255, 255, 255])
    expect(detectSolidBackground(data, width, height)).toEqual<RGB>({ r: 255, g: 255, b: 255 })
  })

  it('detects a black border', () => {
    const width = 20
    const height = 20
    const data = makeFlatImage(width, height, [230, 230, 230, 255])
    fillBorder(data, width, height, [0, 0, 0, 255])
    expect(detectSolidBackground(data, width, height)).toEqual<RGB>({ r: 0, g: 0, b: 0 })
  })

  it('returns null for a noisy/busy border', () => {
    const width = 20
    const height = 20
    const data = makeFlatImage(width, height, [128, 128, 128, 255])
    // Alternate stark black/white around the whole border frame — no single
    // colour covers anywhere near BORDER_MATCH_RATIO of it.
    for (let x = 0; x < width; x++) {
      const rgba: [number, number, number, number] = x % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]
      setPixel(data, width, x, 0, rgba)
      setPixel(data, width, x, height - 1, rgba)
    }
    for (let y = 0; y < height; y++) {
      const rgba: [number, number, number, number] = y % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]
      setPixel(data, width, 0, y, rgba)
      setPixel(data, width, width - 1, y, rgba)
    }
    expect(detectSolidBackground(data, width, height)).toBeNull()
  })

  it('returns null for a smooth gradient border', () => {
    const width = 30
    const height = 30
    const data = makeFlatImage(width, height, [200, 200, 200, 255])
    for (let x = 0; x < width; x++) {
      const v = Math.round((x / (width - 1)) * 255)
      setPixel(data, width, x, 0, [v, v, v, 255])
      setPixel(data, width, x, height - 1, [v, v, v, 255])
    }
    for (let y = 0; y < height; y++) {
      const v = Math.round((y / (height - 1)) * 255)
      setPixel(data, width, 0, y, [v, v, v, 255])
      setPixel(data, width, width - 1, y, [v, v, v, 255])
    }
    expect(detectSolidBackground(data, width, height)).toBeNull()
  })
})

describe('removeBackgroundFromEdges', () => {
  it('removes the border-connected background but keeps an enclosed same-colour hole opaque', () => {
    const width = 20
    const height = 20
    const bg: RGB = { r: 255, g: 255, b: 255 }
    const data = makeFlatImage(width, height, [255, 255, 255, 255])
    // A green "logo" ring with an enclosed white hole in the middle — the
    // hole is the same colour as the background but not connected to it.
    for (let y = 6; y < 15; y++) {
      for (let x = 6; x < 15; x++) {
        setPixel(data, width, x, y, [20, 150, 20, 255])
      }
    }
    for (let y = 9; y < 12; y++) {
      for (let x = 9; x < 12; x++) {
        setPixel(data, width, x, y, [255, 255, 255, 255])
      }
    }

    removeBackgroundFromEdges(data, width, height, bg, 24)

    // Outer background is gone.
    expect(data[(0 * width + 0) * 4 + 3]).toBe(0)
    expect(data[(19 * width + 19) * 4 + 3]).toBe(0)
    // The green ring survives.
    expect(data[(10 * width + 6) * 4 + 3]).toBe(255)
    // The enclosed white hole — never touched by the flood fill — stays opaque.
    expect(data[(10 * width + 10) * 4 + 3]).toBe(255)
  })

  it('gives a near-match boundary pixel partial alpha instead of a hard edge', () => {
    const width = 5
    const height = 3
    const bg: RGB = { r: 255, g: 255, b: 255 }
    const data = makeFlatImage(width, height, [255, 255, 255, 255])
    // The lone interior pixel is a near-white shade: colour distance 30,
    // between tolerance (24) and 2x tolerance (48).
    setPixel(data, width, 2, 1, [225, 255, 255, 255])

    removeBackgroundFromEdges(data, width, height, bg, 24)

    const alpha = data[(1 * width + 2) * 4 + 3]
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBeLessThan(255)
    expect(alpha).toBe(Math.round(255 * ((30 - 24) / 24)))
  })

  it('runs on a 1024x1024 all-background image without a stack overflow and in under 300ms', () => {
    const width = 1024
    const height = 1024
    const bg: RGB = { r: 10, g: 10, b: 10 }
    const data = makeFlatImage(width, height, [10, 10, 10, 255])

    const start = performance.now()
    expect(() => removeBackgroundFromEdges(data, width, height, bg, 24)).not.toThrow()
    const elapsedMs = performance.now() - start

    expect(data[(512 * width + 512) * 4 + 3]).toBe(0)
    // eslint-disable-next-line no-console
    console.log(`removeBackgroundFromEdges(1024x1024): ${elapsedMs.toFixed(2)}ms`)
    expect(elapsedMs).toBeLessThan(300)
  })
})

/** Sets alpha=255 for every pixel in [x0,x1) x [y0,y1). */
function fillRect(data: Uint8ClampedArray, width: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      data[(y * width + x) * 4 + 3] = 255
    }
  }
}

/** Clears alpha to 0 for every pixel in [x0,x1) x [y0,y1) (cuts a hole). */
function clearRect(data: Uint8ClampedArray, width: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      data[(y * width + x) * 4 + 3] = 0
    }
  }
}

/** Un-normalizes a Point back to pixel space (inverse of extractPerimeter's mapping). */
function toPixel([nx, ny]: [number, number], width: number, height: number): [number, number] {
  return [(nx + 0.5) * width, (0.5 - ny) * height]
}

/** Euclidean distance in pixels from (px,py) to the nearest opaque pixel, searching out to maxRadius. */
function nearestOpaqueDistance(
  px: number,
  py: number,
  opaque: (x: number, y: number) => boolean,
  maxRadius: number,
): number {
  let best = Infinity
  const cx = Math.round(px)
  const cy = Math.round(py)
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (!opaque(x, y)) continue
      const dist = Math.hypot(px - x, py - y)
      if (dist < best) best = dist
    }
  }
  return best
}

describe('extractPerimeter', () => {
  it('traces the outer boundary of an 8x8 rectangle as a single loop', () => {
    const width = 8
    const height = 8
    const data = new Uint8ClampedArray(width * height * 4)
    fillRect(data, width, 3, 0, 6, 8)
    const loops = extractPerimeter(data, width, height)
    expect(loops.length).toBe(1)
    const xs = loops[0].map((p) => p[0])
    // Rectangle spans columns 3-5 of 8 -> normalized x roughly [-0.125, 0.125].
    for (const x of xs) {
      expect(x).toBeGreaterThan(-0.3)
      expect(x).toBeLessThan(0.3)
    }
  })

  it('returns nothing for a fully transparent image', () => {
    expect(extractPerimeter(new Uint8ClampedArray(8 * 8 * 4), 8, 8)).toEqual([])
  })

  it('ignores a detached stray pixel far to the right of the main blob', () => {
    // Regression test for the rim "stray strip" bug: a single fully-opaque
    // pixel far outside the logo (e.g. a compression artifact or watermark
    // speck) must not survive to become its own loop. The blob is sized so
    // the speck is well under MIN_COMPONENT_RATIO (0.5%) of it.
    const width = 100
    const height = 100
    const data = new Uint8ClampedArray(width * height * 4)
    fillRect(data, width, 10, 20, 30, 60) // 20x40 = 800px blob
    // Detached stray pixel (1 / 800 = 0.125%), far to the right of the blob.
    data[(10 * width + 90) * 4 + 3] = 255

    const loops = extractPerimeter(data, width, height)
    expect(loops.length).toBe(1)
    for (const [x] of loops[0]) {
      // Blob spans columns 10-29 of 100 -> normalized x roughly [-0.4, -0.2].
      // The stray pixel at column 90 would normalize to about +0.4.
      expect(x).toBeLessThan(0)
    }
  })

  it('keeps every part of a multi-part logo as its own loop (icon + separate wordmark)', () => {
    // A second component ~10% the size of the first, well above
    // MIN_COMPONENT_RATIO, placed below the first with a gap so they don't
    // touch — must NOT be dropped like the stray-pixel speck above is, and
    // must come back as its own loop rather than merged into one hull.
    const width = 40
    const height = 100
    const data = new Uint8ClampedArray(width * height * 4)
    fillRect(data, width, 10, 5, 30, 25) // top blob: 20x20 = 400px
    fillRect(data, width, 15, 60, 25, 64) // bottom blob: 4x10 = 40px (10%)

    const loops = extractPerimeter(data, width, height)
    expect(loops.length).toBe(2)
    const allYs = loops.flatMap((loop) => loop.map(([, y]) => y))
    // Top blob rows (5-24) normalize to y in ~[0.26, 0.45]; bottom blob rows
    // (60-63) normalize to y in ~[-0.13, -0.10]. Both must be represented.
    expect(Math.max(...allYs)).toBeGreaterThan(0.2)
    expect(Math.min(...allYs)).toBeLessThan(-0.05)
  })

  it('hugs a concave gap instead of bridging it (two-prong "U" regression)', () => {
    // The old row-scan bug: scanning each row's leftmost/rightmost opaque
    // pixel bridges the empty gap between two prongs with a straight wall.
    // A proper contour trace must never place a vertex in that gap.
    const width = 60
    const height = 60
    const data = new Uint8ClampedArray(width * height * 4)
    fillRect(data, width, 10, 10, 20, 50) // left prong
    fillRect(data, width, 40, 10, 50, 50) // right prong
    fillRect(data, width, 10, 40, 50, 50) // base connecting them (bottom of the U)
    // Gap: x in [20,40), y in [10,40) stays fully transparent.

    const opaque = (x: number, y: number): boolean => {
      if (x < 0 || x >= width || y < 0 || y >= height) return false
      return data[(y * width + x) * 4 + 3] > 0
    }

    const loops = extractPerimeter(data, width, height)
    expect(loops.length).toBe(1)
    for (const point of loops[0]) {
      const [px, py] = toPixel(point, width, height)
      expect(nearestOpaqueDistance(px, py, opaque, 6)).toBeLessThan(1.5)
    }
  })

  it('traces only the outer boundary of a ring, never the hole', () => {
    const width = 60
    const height = 60
    const data = new Uint8ClampedArray(width * height * 4)
    fillRect(data, width, 10, 10, 50, 50) // outer square
    clearRect(data, width, 20, 20, 40, 40) // punch a square hole out of the middle

    const loops = extractPerimeter(data, width, height)
    expect(loops.length).toBe(1)
    for (const [nx, ny] of loops[0]) {
      const [px, py] = toPixel([nx, ny], width, height)
      // Every vertex must sit near the OUTER edge (x/y within ~2px of 10 or
      // 50), never near the inner hole edge (x/y near 20 or 40).
      const nearOuter =
        Math.abs(px - 10) < 2 || Math.abs(px - 50) < 2 || Math.abs(py - 10) < 2 || Math.abs(py - 50) < 2
      const nearHole = px > 18 && px < 42 && py > 18 && py < 42
      expect(nearOuter).toBe(true)
      expect(nearHole).toBe(false)
    }
  })

  it('finishes tracing a 768x768 logo in under 150ms', () => {
    const width = 768
    const height = 768
    const data = new Uint8ClampedArray(width * height * 4)
    // A handful of components with concave notches, roughly logo-shaped.
    fillRect(data, width, 100, 100, 350, 650)
    fillRect(data, width, 400, 150, 700, 400)
    fillRect(data, width, 400, 420, 700, 600)
    clearRect(data, width, 150, 250, 300, 350) // notch out of the first blob
    fillRect(data, width, 40, 40, 80, 80) // small secondary piece, well above the speck ratio

    const start = performance.now()
    const loops = extractPerimeter(data, width, height)
    const elapsedMs = performance.now() - start

    expect(loops.length).toBeGreaterThan(0)
    // eslint-disable-next-line no-console
    console.log(`extractPerimeter(768x768): ${elapsedMs.toFixed(2)}ms`)
    expect(elapsedMs).toBeLessThan(150)
  })
})

describe('dropSmallSpecks', () => {
  it('drops a speck far under the ratio threshold but keeps the main blob', () => {
    const width = 40
    const height = 40
    const opaque = new Uint8Array(width * height)
    // Large blob: a 20x20 square (400px).
    for (let y = 5; y < 25; y++) {
      for (let x = 5; x < 25; x++) {
        opaque[y * width + x] = 1
      }
    }
    // Speck: a single pixel (0.25% of 400), far away.
    opaque[2 * width + 35] = 1

    const mask = dropSmallSpecks(opaque, width, height)
    expect(mask[2 * width + 35]).toBe(0) // the speck is dropped
    expect(mask[15 * width + 15]).toBe(1) // center of the blob survives
    expect(mask.reduce((a, b) => a + b, 0)).toBe(400) // exactly the blob
  })

  it('keeps a second component at 10% of the largest (multi-part logo)', () => {
    const width = 40
    const height = 40
    const opaque = new Uint8Array(width * height)
    for (let y = 5; y < 25; y++) {
      for (let x = 5; x < 25; x++) {
        opaque[y * width + x] = 1 // 20x20 = 400px
      }
    }
    for (let y = 30; y < 34; y++) {
      for (let x = 10; x < 20; x++) {
        opaque[y * width + x] = 1 // 4x10 = 40px = 10% of 400
      }
    }

    const mask = dropSmallSpecks(opaque, width, height)
    expect(mask[15 * width + 15]).toBe(1) // main blob survives
    expect(mask[31 * width + 15]).toBe(1) // second component also survives
    expect(mask.reduce((a, b) => a + b, 0)).toBe(440)
  })

  it('returns an all-zero mask when there is nothing opaque', () => {
    const mask = dropSmallSpecks(new Uint8Array(20), 5, 4)
    expect(mask.reduce((a, b) => a + b, 0)).toBe(0)
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

describe('clearDetachedSpecks', () => {
  // 100x100 transparent canvas; paint opaque squares by bounding box.
  function canvasWith(rects: Array<[number, number, number, number]>): Uint8ClampedArray {
    const w = 100
    const data = new Uint8ClampedArray(w * w * 4)
    for (const [x0, y0, x1, y1] of rects) {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[(y * w + x) * 4 + 3] = 255
    }
    return data
  }
  const alphaAt = (d: Uint8ClampedArray, x: number, y: number) => d[(y * 100 + x) * 4 + 3]

  it('clears a lone speck but keeps the logo body', () => {
    const d = canvasWith([[20, 20, 80, 80], [5, 5, 6, 6]])
    clearDetachedSpecks(d, 100, 100)
    expect(alphaAt(d, 50, 50)).toBe(255)
    expect(alphaAt(d, 5, 5)).toBe(0)
  })

  it('keeps a real secondary piece of a multi-part logo', () => {
    // 60x60 body (3600px) + 10x10 piece (100px, ~2.8% of the body).
    const d = canvasWith([[20, 20, 80, 80], [85, 85, 95, 95]])
    clearDetachedSpecks(d, 100, 100)
    expect(alphaAt(d, 90, 90)).toBe(255)
  })

  it('treats faint partial-alpha dust as a speck too', () => {
    const d = canvasWith([[20, 20, 80, 80]])
    d[(3 * 100 + 3) * 4 + 3] = 40
    clearDetachedSpecks(d, 100, 100)
    expect(alphaAt(d, 3, 3)).toBe(0)
  })
})

describe('computeSquareFit', () => {
  function rgba(width: number, height: number, opaque: [number, number, number, number]) {
    const data = new Uint8ClampedArray(width * height * 4)
    const [x0, y0, x1, y1] = opaque
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[(y * width + x) * 4 + 3] = 255
    return data
  }

  it('centres a wide, off-centre logo on a square without stretching it', () => {
    // 160x90 (16:9) canvas, 80x40 of artwork pushed toward the top-left.
    const fit = computeSquareFit(rgba(160, 90, [10, 5, 89, 44]), 160, 90, 0)!
    expect(fit).toMatchObject({ size: 80, sx: 10, sy: 5, sw: 80, sh: 40, dx: 0, dy: 20 })
  })

  it('keeps a square preset-style logo at its original size and position', () => {
    // Koi: 768px square, opaque box 27..739 — same as the bundled preset.
    const fit = computeSquareFit(rgba(768, 768, [27, 28, 739, 738]), 768, 768)!
    expect(Math.abs(fit.size - 768)).toBeLessThanOrEqual(2)
    expect(Math.abs(fit.dx - 27)).toBeLessThanOrEqual(1)
  })

  it('returns null for a fully transparent image', () => {
    expect(computeSquareFit(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBeNull()
  })
})
