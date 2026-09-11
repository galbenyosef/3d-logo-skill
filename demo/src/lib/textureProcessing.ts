// Pure pixel-processing logic lifted from SKILL.md's architecture (2a/2b),
// extracted so it can run under vitest without a DOM. The DOM-touching glue
// (canvas, ImageData, CanvasTexture) lives in components/SpinningLogo3D.tsx.

export type Point = [number, number]

/** True if the image already carries real (non-255) alpha anywhere. */
export function hasNativeAlpha(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true
  }
  return false
}

/** Mutates `data` in place: brightness below `threshold` becomes fully transparent. */
export function applyBrightnessThreshold(data: Uint8ClampedArray, threshold: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
    if (brightness < threshold) data[i + 3] = 0
  }
}

/**
 * Sobel-filter normal map generation, straight from SKILL.md 2a. Encodes the
 * brightness gradient as a tangent-space normal (RGB) so the coin faces read
 * as embossed rather than flat-printed.
 */
export function generateNormalMapData(colorData: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4)
  const bright = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(width - 1, x))
    const cy = Math.max(0, Math.min(height - 1, y))
    const i = (cy * width + cx) * 4
    return (colorData[i] + colorData[i + 1] + colorData[i + 2]) / 765
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = bright(x + 1, y) - bright(x - 1, y)
      const dy = bright(x, y + 1) - bright(x, y - 1)
      const len = Math.sqrt(dx * dx + dy * dy + 1)
      const i = (y * width + x) * 4
      out[i] = ((-dx / len) * 0.5 + 0.5) * 255
      out[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255
      out[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      out[i + 3] = colorData[i + 3]
    }
  }
  return out
}

/** Row-by-row alpha scan tracing the logo's outline, then Laplacian-smoothed (SKILL.md 2b). */
export function extractPerimeter(data: Uint8ClampedArray, width: number, height: number): Point[] {
  const rightEdge: Point[] = []
  const leftEdge: Point[] = []
  for (let y = 0; y < height; y++) {
    let left = -1
    let right = -1
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (left === -1) left = x
        right = x
      }
    }
    if (left !== -1 && right > left) {
      rightEdge.push([right, y])
      leftEdge.push([left, y])
    }
  }
  if (rightEdge.length === 0) return []
  const raw = [...rightEdge, ...leftEdge.reverse()]
  const step = Math.max(1, Math.floor(raw.length / 800))
  const sampled: Point[] = raw
    .filter((_, i) => i % step === 0)
    .map(([px, py]) => [px / width - 0.5, 0.5 - py / height])
  return smoothOutline(sampled, 5)
}

/** Laplacian smoothing: averages each vertex toward its neighbours, `iterations` times. */
export function smoothOutline(outline: Point[], iterations: number): Point[] {
  let pts = outline
  const n = pts.length
  if (n < 3) return pts
  for (let iter = 0; iter < iterations; iter++) {
    const next: Point[] = []
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n]
      const curr = pts[i]
      const nxt = pts[(i + 1) % n]
      next.push([
        curr[0] + 0.5 * ((prev[0] + nxt[0]) / 2 - curr[0]),
        curr[1] + 0.5 * ((prev[1] + nxt[1]) / 2 - curr[1]),
      ])
    }
    pts = next
  }
  return pts
}

export interface RimPalette {
  color: string
  emissive: string
}

const NEUTRAL_PALETTE: RimPalette = { color: '#c0c0c0', emissive: '#888888' }

/**
 * Implements SKILL.md's "Rim color customization" table: averages the
 * opaque pixels' color, then classifies the hue into the five documented
 * rim palettes so the chrome rim matches the logo's dominant accent.
 */
export function pickRimPalette(data: Uint8ClampedArray): RimPalette {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    count++
  }
  if (count === 0) return NEUTRAL_PALETTE
  r /= count
  g /= count
  b /= count

  const rN = r / 255
  const gN = g / 255
  const bN = b / 255
  const max = Math.max(rN, gN, bN)
  const min = Math.min(rN, gN, bN)
  const delta = max - min
  const lightness = (max + min) / 2
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))

  if (saturation < 0.15 || lightness > 0.93 || lightness < 0.07) {
    return NEUTRAL_PALETTE
  }

  let hue = 0
  if (max === rN) hue = 60 * (((gN - bN) / delta) % 6)
  else if (max === gN) hue = 60 * ((bN - rN) / delta + 2)
  else hue = 60 * ((rN - gN) / delta + 4)
  if (hue < 0) hue += 360

  if (hue >= 15 && hue < 65) return { color: '#e6c88e', emissive: '#d4a506' } // gold/warm
  if (hue >= 65 && hue < 170) return { color: '#8ee6ae', emissive: '#06d46a' } // green
  if (hue >= 170 && hue < 290) return { color: '#8ecae6', emissive: '#06b6d4' } // cyan/blue (default)
  return { color: '#e68e8e', emissive: '#d40606' } // red/magenta
}
