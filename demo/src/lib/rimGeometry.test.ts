import { describe, expect, it } from 'vitest'
import type { Point } from './textureProcessing'
import { buildRim } from './rimGeometry'

describe('buildRim', () => {
  const square: Point[] = [
    [0.5, 0.5],
    [-0.5, 0.5],
    [-0.5, -0.5],
    [0.5, -0.5],
  ]

  it('builds front/back vertices for every outline point and closes the ring', () => {
    const geo = buildRim(square, 2, 0.4)
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
    const geo = buildRim(outline, 4, 1)
    const pos = geo.attributes.position.array
    // first outline point [0.5, 0] * planeSize(4) -> x = 2, z = +/-0.5
    expect(pos[0]).toBeCloseTo(2)
    expect(pos[1]).toBeCloseTo(0)
    expect(pos[2]).toBeCloseTo(0.5)
    expect(pos[5]).toBeCloseTo(-0.5)
  })
})
