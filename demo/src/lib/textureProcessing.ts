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

/**
 * Real generated logos (these sample PNGs included) often carry residual
 * low-alpha noise — compression/dithering artifacts — scattered across
 * nominally-transparent regions, sometimes reaching alpha values in the
 * dozens far from the actual artwork. A raw `alpha > 0` test (the naive
 * version of this check) lets that noise drag the per-row scan's left/right
 * edges out toward the image border, producing long stray spikes in the
 * outline that show up as flat strips sticking off the chrome rim. Anything
 * below "clearly more opaque than not" is treated as background.
 */
export const ALPHA_OPAQUE_THRESHOLD = 128

/**
 * A component smaller than this fraction of the largest component's area is
 * dropped as a speck rather than kept as a real part of the logo. Small
 * enough that a second/third piece of a multi-part logo (icon + wordmark,
 * separate letters) survives — only truly tiny detached specks (a watermark
 * sparkle, a leftover dust pixel) are this disproportionate.
 */
export const MIN_COMPONENT_RATIO = 0.005

/**
 * Flood-fills 4-connected regions of `opaque` and drops any component whose
 * area is smaller than `MIN_COMPONENT_RATIO` of the largest one. Guards
 * against isolated specks (a watermark, a stray bright pixel) that pass the
 * alpha threshold but sit outside the real logo shape — without discarding
 * legitimate secondary pieces of a multi-part logo.
 */
export function dropSmallSpecks(opaque: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height
  const labels = new Int32Array(n).fill(-1)
  const sizes: number[] = []
  const stack = new Int32Array(n)

  for (let start = 0; start < n; start++) {
    if (opaque[start] !== 1 || labels[start] !== -1) continue
    const label = sizes.length
    let size = 0
    let stackLen = 0
    stack[stackLen++] = start
    labels[start] = label
    while (stackLen > 0) {
      const idx = stack[--stackLen]
      size++
      const x = idx % width
      const y = (idx / width) | 0
      if (x > 0) {
        const left = idx - 1
        if (opaque[left] === 1 && labels[left] === -1) {
          labels[left] = label
          stack[stackLen++] = left
        }
      }
      if (x < width - 1) {
        const right = idx + 1
        if (opaque[right] === 1 && labels[right] === -1) {
          labels[right] = label
          stack[stackLen++] = right
        }
      }
      if (y > 0) {
        const up = idx - width
        if (opaque[up] === 1 && labels[up] === -1) {
          labels[up] = label
          stack[stackLen++] = up
        }
      }
      if (y < height - 1) {
        const down = idx + width
        if (opaque[down] === 1 && labels[down] === -1) {
          labels[down] = label
          stack[stackLen++] = down
        }
      }
    }
    sizes.push(size)
  }

  const result = new Uint8Array(n)
  if (sizes.length === 0) return result

  const largestSize = Math.max(...sizes)
  const minSize = largestSize * MIN_COMPONENT_RATIO
  for (let i = 0; i < n; i++) {
    const label = labels[i]
    if (label !== -1 && sizes[label] >= minSize) result[i] = 1
  }
  return result
}

/**
 * Row-by-row alpha scan tracing the logo's outline, then Laplacian-smoothed
 * (SKILL.md 2b). Pixels are only considered part of the logo if they clear
 * `alphaThreshold` AND aren't part of a tiny detached speck — see
 * ALPHA_OPAQUE_THRESHOLD and dropSmallSpecks above. Multi-part logos (an
 * icon plus a separate wordmark, individual letters) keep every real piece.
 */
export function extractPerimeter(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = ALPHA_OPAQUE_THRESHOLD,
): Point[] {
  const n = width * height
  const opaque = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    opaque[i] = data[i * 4 + 3] > alphaThreshold ? 1 : 0
  }
  const mask = dropSmallSpecks(opaque, width, height)

  const rightEdge: Point[] = []
  const leftEdge: Point[] = []
  for (let y = 0; y < height; y++) {
    let left = -1
    let right = -1
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1) {
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
