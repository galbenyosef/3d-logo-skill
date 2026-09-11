import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { Point } from './textureProcessing'

/**
 * Indexed rim ring with tangent-derived outward normals (SKILL.md 2c). Kept
 * separate from textureProcessing.ts only because it needs `three`'s
 * BufferGeometry — the math itself is just as pure and just as testable.
 */
export function buildRim(outline: Point[], planeSize: number, thickness: number): BufferGeometry {
  const half = thickness / 2
  const s = planeSize
  const n = outline.length
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (let i = 0; i < n; i++) {
    const prev = outline[(i - 1 + n) % n]
    const curr = outline[i]
    const next = outline[(i + 1) % n]
    const tx = next[0] - prev[0]
    const ty = next[1] - prev[1]
    const len = Math.sqrt(tx * tx + ty * ty) || 1
    const nx = ty / len
    const ny = -tx / len
    const x = curr[0] * s
    const y = curr[1] * s
    positions.push(x, y, half) // front vertex
    normals.push(nx, ny, 0)
    positions.push(x, y, -half) // back vertex
    normals.push(nx, ny, 0)
  }
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n
    const f1 = i * 2
    const b1 = i * 2 + 1
    const f2 = i2 * 2
    const b2 = i2 * 2 + 1
    indices.push(f1, b1, f2)
    indices.push(b1, b2, f2)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geo.setIndex(indices)
  return geo
}
