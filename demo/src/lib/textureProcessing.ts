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
 * 4-connected flood-fill labelling shared by `dropSmallSpecks` (which needs
 * component sizes) and the contour tracer (which needs each component
 * isolated so a Moore-neighbour trace can't leak across a diagonal touch
 * between two different pieces of a multi-part logo).
 */
function labelComponents(mask: Uint8Array, width: number, height: number): { labels: Int32Array; sizes: number[] } {
  const n = width * height
  const labels = new Int32Array(n).fill(-1)
  const sizes: number[] = []
  const stack = new Int32Array(n)

  for (let start = 0; start < n; start++) {
    if (mask[start] !== 1 || labels[start] !== -1) continue
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
        if (mask[left] === 1 && labels[left] === -1) {
          labels[left] = label
          stack[stackLen++] = left
        }
      }
      if (x < width - 1) {
        const right = idx + 1
        if (mask[right] === 1 && labels[right] === -1) {
          labels[right] = label
          stack[stackLen++] = right
        }
      }
      if (y > 0) {
        const up = idx - width
        if (mask[up] === 1 && labels[up] === -1) {
          labels[up] = label
          stack[stackLen++] = up
        }
      }
      if (y < height - 1) {
        const down = idx + width
        if (mask[down] === 1 && labels[down] === -1) {
          labels[down] = label
          stack[stackLen++] = down
        }
      }
    }
    sizes.push(size)
  }
  return { labels, sizes }
}

/**
 * Flood-fills 4-connected regions of `opaque` and drops any component whose
 * area is smaller than `MIN_COMPONENT_RATIO` of the largest one. Guards
 * against isolated specks (a watermark, a stray bright pixel) that pass the
 * alpha threshold but sit outside the real logo shape — without discarding
 * legitimate secondary pieces of a multi-part logo.
 */
export function dropSmallSpecks(opaque: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height
  const { labels, sizes } = labelComponents(opaque, width, height)

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

/** Clockwise-ordered 8-neighbour offsets used by the Moore boundary tracer. */
const MOORE_DIRS: Point[] = [
  [0, -1], // N
  [1, -1], // NE
  [1, 0], // E
  [1, 1], // SE
  [0, 1], // S
  [-1, 1], // SW
  [-1, 0], // W
  [-1, -1], // NW
]

function mooreDirIndex(dx: number, dy: number): number {
  for (let i = 0; i < 8; i++) {
    if (MOORE_DIRS[i][0] === dx && MOORE_DIRS[i][1] === dy) return i
  }
  return 0
}

/**
 * Moore-neighbour trace of one labelled component's OUTER boundary, in pixel
 * coordinates. Starting from the component's topmost-then-leftmost pixel
 * (always on the outer border — a raster-first pixel can never sit inside a
 * hole) and always resuming the neighbour scan just past the direction we
 * arrived from, the walk stays on the outside of the shape: interior holes
 * are never visited, so a ring produces one outer loop and no hole loop.
 *
 * The membership test is pinned to this exact `label`, not just "any opaque
 * pixel" — two components of a multi-part logo can touch diagonally without
 * being 4-connected, and without this the trace could hop from one piece to
 * the other at that corner.
 *
 * This walks clockwise in pixel space (y grows downward). The caller's
 * y-flip into normalized coordinates reverses that into counter-clockwise
 * winding in the (y-up) space `buildRim` expects, so its tangent-derived
 * normals come out pointing outward — see buildRim's dot-product test.
 */
function traceComponentBoundary(labels: Int32Array, width: number, height: number, label: number): Point[] {
  const n = width * height
  let startIdx = -1
  for (let i = 0; i < n; i++) {
    if (labels[i] === label) {
      startIdx = i
      break
    }
  }
  if (startIdx === -1) return []
  const startX = startIdx % width
  const startY = (startIdx / width) | 0
  const isFg = (x: number, y: number): boolean =>
    x >= 0 && x < width && y >= 0 && y < height && labels[y * width + x] === label

  let hasNeighbour = false
  for (const [dx, dy] of MOORE_DIRS) {
    if (isFg(startX + dx, startY + dy)) {
      hasNeighbour = true
      break
    }
  }
  // Isolated single-pixel component: emit a tiny 1px square so downstream
  // arc-length resampling still has a valid (non-degenerate) loop.
  if (!hasNeighbour) {
    return [
      [startX, startY],
      [startX + 1, startY],
      [startX + 1, startY + 1],
      [startX, startY + 1],
    ]
  }

  const initialBacktrackX = startX - 1
  const initialBacktrackY = startY
  let cx = startX
  let cy = startY
  let bx = initialBacktrackX
  let by = initialBacktrackY
  const boundary: Point[] = [[cx, cy]]
  const maxSteps = n * 4 + 16 // safety valve; a clean trace stops well before this
  for (let step = 0; step < maxSteps; step++) {
    const startDir = (mooreDirIndex(bx - cx, by - cy) + 1) % 8
    let foundDir = -1
    let lastBgX = bx
    let lastBgY = by
    for (let k = 0; k < 8; k++) {
      const d = (startDir + k) % 8
      const nx = cx + MOORE_DIRS[d][0]
      const ny = cy + MOORE_DIRS[d][1]
      if (isFg(nx, ny)) {
        foundDir = d
        break
      }
      lastBgX = nx
      lastBgY = ny
    }
    if (foundDir === -1) break // shouldn't happen; hasNeighbour was checked above
    const nx = cx + MOORE_DIRS[foundDir][0]
    const ny = cy + MOORE_DIRS[foundDir][1]
    bx = lastBgX
    by = lastBgY
    cx = nx
    cy = ny
    if (cx === startX && cy === startY && bx === initialBacktrackX && by === initialBacktrackY) {
      break // Jacob-style stopping criterion: back to the start pixel via the same backtrack
    }
    boundary.push([cx, cy])
  }
  return boundary
}

function polygonPerimeter(pts: Point[]): number {
  let total = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return total
}

/** Resamples a closed polygon to `count` points evenly spaced by arc length. */
function resampleByArcLength(pts: Point[], count: number): Point[] {
  const n = pts.length
  if (n < 2 || count < 1) return pts
  const total = polygonPerimeter(pts)
  if (total === 0) return pts

  const step = total / count
  const result: Point[] = []
  let edgeIndex = 0
  let edgeStart = pts[0]
  let edgeEnd = pts[1 % n]
  let edgeLen = Math.hypot(edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1])
  let accumulated = 0 // distance from loop start up to edgeStart
  for (let i = 0; i < count; i++) {
    const target = i * step
    while (accumulated + edgeLen < target && edgeIndex < n - 1) {
      accumulated += edgeLen
      edgeIndex++
      edgeStart = pts[edgeIndex % n]
      edgeEnd = pts[(edgeIndex + 1) % n]
      edgeLen = Math.hypot(edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1])
    }
    const t = edgeLen === 0 ? 0 : (target - accumulated) / edgeLen
    result.push([edgeStart[0] + (edgeEnd[0] - edgeStart[0]) * t, edgeStart[1] + (edgeEnd[1] - edgeStart[1]) * t])
  }
  return result
}

/**
 * Traces the outer boundary of every kept connected component with a
 * Moore-neighbour contour tracer, replacing the old row-scan (SKILL.md 2b).
 * The row-scan only kept each row's leftmost/rightmost opaque pixel, which
 * is correct only for row-convex shapes — on a real logo it bridges gaps
 * (a solid bar spanning the empty space between two wingtips) and produces
 * flat "shelves" wherever a fin or tail separates from the body within a
 * row. Contour tracing follows every concavity instead, and returns one
 * loop per separate piece rather than one hull-ish loop for the whole logo.
 *
 * Interior holes are ignored (the face plane already covers them) because
 * the trace always starts at a component's topmost-then-leftmost pixel,
 * which is never inside a hole.
 *
 * Pixels are only considered part of the logo if they clear `alphaThreshold`
 * AND aren't part of a tiny detached speck — see ALPHA_OPAQUE_THRESHOLD and
 * dropSmallSpecks above. Multi-part logos (an icon plus a separate wordmark,
 * individual letters) keep every real piece, each as its own loop.
 *
 * Each traced loop is resampled by arc length to a vertex count
 * proportional to its own perimeter (200-900, so a small secondary piece
 * doesn't get the same vertex budget as the main body) before the existing
 * per-loop Laplacian smoothing runs.
 */
export function extractPerimeter(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = ALPHA_OPAQUE_THRESHOLD,
): Point[][] {
  const n = width * height
  const opaque = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    opaque[i] = data[i * 4 + 3] > alphaThreshold ? 1 : 0
  }
  const mask = dropSmallSpecks(opaque, width, height)
  const { labels, sizes } = labelComponents(mask, width, height)
  if (sizes.length === 0) return []

  const loops: Point[][] = []
  for (let label = 0; label < sizes.length; label++) {
    const traced = traceComponentBoundary(labels, width, height, label)
    if (traced.length < 3) continue
    const perimeter = polygonPerimeter(traced)
    const targetCount = Math.max(200, Math.min(900, Math.round(perimeter / 3)))
    const resampled = resampleByArcLength(traced, targetCount)
    const normalized: Point[] = resampled.map(([px, py]) => [px / width - 0.5, 0.5 - py / height])
    loops.push(smoothOutline(normalized, 5))
  }
  return loops
}

/**
 * Laplacian smoothing: averages each vertex toward its neighbours,
 * `iterations` times. Closed-loop aware (wraps with modulo indexing), so
 * it's called once per traced loop in `extractPerimeter` — each piece of a
 * multi-part logo is smoothed independently of the others.
 */
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
