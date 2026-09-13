import { describe, expect, it } from 'vitest'
import type { Point } from './textureProcessing'
import { buildRim } from './rimGeometry'

describe('buildRim', () => {
  // Counter-clockwise (y-up) convex square, matching the winding
  // extractPerimeter now produces after its y-flip normalization.
  const square: Point[] = [
    [0.5, 0.5],
    [-0.5, 0.5],
    [-0.5, -0.5],
    [0.5, -0.5],
  ]

  it('builds front/back vertices for every outline point and closes the ring', () => {
    const geo = buildRim([square], 2, 0.4)
    expect(geo.attributes.position.count).toBe(square.length * 2)
    expect(geo.attributes.normal.count).toBe(square.length * 2)
    expect(geo.index?.count).toBe(square.length * 6) // 2 triangles per edge segment
  })

  it('scales positions by planeSize and offsets front/back by half the thickness', () => {
    const outline: Point[] = [
      [0.5, 0],
      [0, 0.5],
      [-0.5, 0],
      [0, -0.5],
    ]
    const geo = buildRim([outline], 4, 1)
    const pos = geo.attributes.position.array
    // first outline point [0.5, 0] * planeSize(4) -> x = 2, z = +/-0.5
    expect(pos[0]).toBeCloseTo(2)
    expect(pos[1]).toBeCloseTo(0)
    expect(pos[2]).toBeCloseTo(0.5)
    expect(pos[5]).toBeCloseTo(-0.5)
  })

  it('emits every loop into one geometry, with index offsets accounting for prior loops', () => {
    const triangleA: Point[] = [
      [1, 1],
      [1.5, 1],
      [1.25, 1.5],
    ]
    const triangleB: Point[] = [
      [-1, -1],
      [-0.5, -1],
      [-0.75, -0.5],
    ]
    const geo = buildRim([triangleA, triangleB], 1, 0.2)
    const totalPoints = triangleA.length + triangleB.length
    expect(geo.attributes.position.count).toBe(totalPoints * 2)
    expect(geo.attributes.normal.count).toBe(totalPoints * 2)
    expect(geo.index?.count).toBe(totalPoints * 6)
    // Every index must stay within the combined vertex range (no
    // cross-contamination or out-of-bounds references between loops).
    const index = geo.index!.array
    for (let i = 0; i < index.length; i++) {
      expect(index[i]).toBeGreaterThanOrEqual(0)
      expect(index[i]).toBeLessThan(totalPoints * 2)
    }
  })

  it('skips a degenerate loop (fewer than 3 points) without breaking the others', () => {
    const degenerate: Point[] = [
      [0, 0],
      [0.1, 0],
    ]
    const geo = buildRim([degenerate, square], 2, 0.4)
    expect(geo.attributes.position.count).toBe(square.length * 2)
    expect(geo.index?.count).toBe(square.length * 6)
  })

  it('points normals away from the centroid for a convex CCW loop', () => {
    const geo = buildRim([square], 2, 0.4)
    const pos = geo.attributes.position.array
    const nrm = geo.attributes.normal.array
    // Centroid of this square is the origin, so a vertex position IS its
    // own outward direction — the normal should point the same way.
    for (let i = 0; i < square.length; i++) {
      const vi = i * 2 // front vertex index (every other entry is front/back pair)
      const px = pos[vi * 3]
      const py = pos[vi * 3 + 1]
      const nx = nrm[vi * 3]
      const ny = nrm[vi * 3 + 1]
      const dot = px * nx + py * ny
      expect(dot).toBeGreaterThan(0)
    }
  })
})
