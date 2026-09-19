/**
 * Text logos (HAS_TEXT): which parts of the logo need their own mirrored rim.
 *
 * The back face of a text logo is the art mirrored in x, so it reads
 * correctly from behind. A part that coincides with its own mirror image (a
 * symmetric emblem, a centred letter) lands on its own rim again, so ONE rim
 * serves both faces and never changes. A part that doesn't (most letters of a
 * wordmark) would land on another part's walls — "MIMER" over walls shaped
 * "ЯƎMIM" — so only those parts get a second, mirrored rim, which takes over
 * in a narrow window right at edge-on (seamShare in ./coinFaces).
 */

export type Point = [number, number]

export const MIRROR_OVERLAP_MIN = 0.93 // a part overlapping its own mirror image at least this much keeps one rim
const OVERLAP_GRID = 72 // samples per axis for the overlap estimate

/** Even-odd point-in-polygon. */
function inside(loop: Point[], x: number, y: number): boolean {
  let hit = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i]
    const b = loop[j]
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit
  }
  return hit
}

/**
 * How much a part coincides with its own mirror image about x = 0:
 * intersection over union of the filled outline and its mirror, sampled on a
 * grid. 1 = perfectly symmetric and centred, 0 = entirely off the axis. A
 * bounding-box test is not enough: a centred but asymmetric emblem has a
 * centred bbox and still lands on the wrong walls when mirrored.
 */
export function mirrorOverlap(loop: Point[]): number {
  let maxX = 0
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of loop) {
    maxX = Math.max(maxX, Math.abs(x))
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (!(maxX > 0) || !(maxY > minY)) return 0
  let both = 0
  let either = 0
  for (let gy = 0; gy < OVERLAP_GRID; gy++) {
    const y = minY + ((gy + 0.5) / OVERLAP_GRID) * (maxY - minY)
    for (let gx = 0; gx < OVERLAP_GRID; gx++) {
      const x = -maxX + ((gx + 0.5) / OVERLAP_GRID) * 2 * maxX
      const a = inside(loop, x, y)
      const b = inside(loop, -x, y)
      if (a || b) either++
      if (a && b) both++
    }
  }
  return either ? both / either : 0
}

/** Splits outline loops (normalised, axis at x = 0) into the parts that land on their own rim again when mirrored (centred) and the parts that don't (sided). */
export function splitSidedParts(loops: Point[][]): { centred: Point[][]; sided: Point[][] } {
  const centred: Point[][] = []
  const sided: Point[][] = []
  for (const loop of loops) (mirrorOverlap(loop) >= MIRROR_OVERLAP_MIN ? centred : sided).push(loop)
  return { centred, sided }
}
