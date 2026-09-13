/**
 * Deterministic seeded PRNG (mulberry32). The same seed always produces the
 * same sequence, so every generator built on it — starfield.ts, cloudBank.ts
 * — is reproducible across renders, across reloads, and in tests, instead of
 * reshuffling the sky on every mount.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return function random() {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
